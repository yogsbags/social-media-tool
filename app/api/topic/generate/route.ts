import fs from 'fs'
import { GoogleGenAI } from '@google/genai'
import { NextRequest, NextResponse } from 'next/server'
import path from 'path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type GenerateBody = {
  campaignType?: string
  purpose?: string
  targetAudience?: string
  platforms?: string[]
  language?: string
}

const MODEL_PRIMARY = process.env.GROQ_TOPIC_MODEL || 'llama-3.3-70b-versatile'
const MODEL_FALLBACK = 'llama-3.3-70b-versatile'
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'
const REFERENCE_FILENAME = 'pl-products-reference.md'
const LIVE_NEWS_MODEL = 'gemini-3-flash-preview'
const TOPIC_HISTORY_FILENAME = 'topic-history.json'

function getTopicHistoryPath(): string {
  return path.join(process.cwd(), 'backend', 'data', TOPIC_HISTORY_FILENAME)
}

function loadRecentTopics(limit = 8): string[] {
  try {
    const filePath = getTopicHistoryPath()
    if (!fs.existsSync(filePath)) return []
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    const entries = Array.isArray(parsed?.entries) ? parsed.entries : []
    return entries
      .map((e: any) => String(e?.topic || '').trim())
      .filter(Boolean)
      .slice(-limit)
      .reverse()
  } catch {
    return []
  }
}

function saveTopicToHistory(topic: string): void {
  try {
    const filePath = getTopicHistoryPath()
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    const existing = fs.existsSync(filePath)
      ? JSON.parse(fs.readFileSync(filePath, 'utf8'))
      : { entries: [] }
    const entries = Array.isArray(existing?.entries) ? existing.entries : []
    entries.push({ topic, createdAt: new Date().toISOString() })
    const trimmed = entries.slice(-60)
    fs.writeFileSync(filePath, JSON.stringify({ entries: trimmed }, null, 2))
  } catch {
    // ignore persistence errors
  }
}

function normalizeTopicForSimilarity(text: string): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'in', 'on', 'for', 'to', 'of', 'and', 'with', 'as', 'by', 'at',
    'is', 'are', 'was', 'were', 'this', 'that', 'these', 'those', 'india', 'indian',
    'market', 'markets', 'stock', 'stocks'
  ])
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((t) => !stopWords.has(t))
}

function topicSimilarityScore(a: string, b: string): number {
  const ta = new Set(normalizeTopicForSimilarity(a))
  const tb = new Set(normalizeTopicForSimilarity(b))
  if (ta.size === 0 || tb.size === 0) return 0
  let inter = 0
  Array.from(ta).forEach((tok) => {
    if (tb.has(tok)) inter += 1
  })
  return inter / Math.max(ta.size, tb.size)
}

function isTooSimilarToRecent(topic: string, recentTopics: string[]): boolean {
  const t = topic.toLowerCase()
  return recentTopics.some((recent) => {
    const r = recent.toLowerCase()
    if (!r) return false
    if (t === r) return true
    if (t.includes(r) || r.includes(t)) return true
    return topicSimilarityScore(topic, recent) >= 0.55
  })
}

async function getGeminiText(response: any): Promise<string> {
  if (!response) return ''

  try {
    if (typeof response.text === 'function') {
      const maybe = response.text()
      if (maybe && typeof maybe.then === 'function') return await maybe
      return maybe || ''
    }
  } catch {
    // ignore and fall back
  }

  if (typeof response.text === 'string') return response.text

  const parts = response?.candidates?.[0]?.content?.parts
  if (Array.isArray(parts)) {
    return parts
      .map((p: any) => (typeof p?.text === 'string' ? p.text : ''))
      .filter(Boolean)
      .join('')
  }

  return ''
}

/** Returns true if the text looks like our instruction (echo) rather than a topic */
function isEchoOrInvalid(text: string | undefined, userPrompt: string): boolean {
  if (!text || text.length < 10) return true
  if (text.includes('Generate ONE concise campaign topic') || text.includes('Return ONLY the campaign topic')) return true
  if (text.includes('Type:') && text.includes('Purpose:') && text.includes('Platforms:')) return true
  if (text.length > 200 && text.includes('\n')) return true
  if (text === userPrompt.trim() || userPrompt.includes(text)) return true
  return false
}

/** Returns true if the topic is a generic "80 years / wealth creation / PL Capital solutions" tagline we want to avoid */
function isGenericTagline(text: string | undefined): boolean {
  if (!text || text.length < 15) return false
  const t = text.toLowerCase()
  const hasEightyYears = /\b80\s*years\b|\b80\+?\s*years\b|\beighty\s*years\b/i.test(text)
  const hasWealthCreation = /wealth\s*creation|wealth\s*creation\s*expertise/i.test(t)
  const hasPlSolutions = /pl\s*capital\s*solutions?|solutions?\s*with\s*pl\s*capital/i.test(t)
  const isMostlyTagline = (hasEightyYears && (hasWealthCreation || hasPlSolutions)) ||
    (hasWealthCreation && hasPlSolutions) ||
    (t.includes('expertise') && t.includes('pl capital') && text.split(/\s+/).length <= 12)
  return isMostlyTagline
}

export async function POST(request: NextRequest) {
  try {
    const body: GenerateBody = await request.json()
    const groqKey = process.env.GROQ_API_KEY
    const geminiKey = process.env.GEMINI_API_KEY

    const fillerPatterns = [
      /^So something like[:\s]+/i,
      /^Here'?s? a topic[:\s]+/i,
      /^Topic[:\s]+/i,
      /^Campaign topic[:\s]+/i,
      /^How about[:\s]+/i,
      /^Try this[:\s]+/i,
      /^Reply with only[:\s]+/i,
      /^Example[:\s]+/i,
      /^Unleash [^:]+:\s*/i,
      /^Discover [^:]+:\s*/i,
      /^Unlock [^:]+:\s*/i,
      /^Experience [^:]+:\s*/i,
      /^Transform [^:]+:\s*/i,
      /^[A-Z][^:]{0,40}:\s*(?=[A-Z])/,
    ]

    const normalizeTopic = (text: string | undefined) => {
      let topic = text?.trim() || ''
      topic = topic.replace(/^["']|["']$/g, '').trim()
      for (const pattern of fillerPatterns) {
        topic = topic.replace(pattern, '').trim()
      }
      return topic.replace(/^["']|["']$/g, '').trim()
    }

    const extractBestTopic = (text: string | undefined) => {
      const raw = text?.trim() || ''
      if (!raw) return ''

      const lines = raw
        .split('\n')
        .map((line) => line.trim())
        .map((line) => line.replace(/^[-*•\d.)\s]+/, '').trim())
        .filter(Boolean)

      if (!lines.length) return ''

      const blockedLinePatterns = [
        /^(here are|top|option|options|recommended|recommendation|suggestion|headline|topic)/i,
        /^(based on|using|from (the )?news|i found)/i,
      ]

      const candidates = lines
        .map((line) => normalizeTopic(line))
        .filter((line) => line.length >= 5)
        .filter((line) => line.length <= 120)
        .filter((line) => !blockedLinePatterns.some((pattern) => pattern.test(line)))

      if (candidates.length > 0) return candidates[0]
      return normalizeTopic(lines[0])
    }

    const sanitizeNewsHeadline = (text: string) => {
      return text
        // Strip emoji/pictographic symbols
        .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u27BF]|\uFE0F/g, '')
        // Keep newsroom-safe punctuation and remove decorative symbols
        .replace(/[^A-Za-z0-9\s.,:;!?'"()%&\-+\/₹$]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    }

    const isAdvisoryOrGenericNewsLine = (text: string) => {
      const t = text.toLowerCase()
      const advisoryPatterns = [
        /\b(buy|sell|hold|invest|accumulate|book profits?)\b/,
        /\b(opportunit(y|ies)|expert insights?|navigating|strategy|strategies)\b/,
        /\b(what to do|how to|tips?|guide|outlook for investors?)\b/,
      ]
      const vaguePatterns = [
        /\b(markets? (update|news|today)|latest market update)\b/,
        /\b(financial news|business news)\b/,
      ]
      return advisoryPatterns.some((p) => p.test(t)) || vaguePatterns.some((p) => p.test(t))
    }

    if (body.campaignType === 'live-news') {
      if (!geminiKey) {
        return NextResponse.json(
          { error: 'GEMINI_API_KEY is required for live-news topic generation' },
          { status: 500 }
        )
      }

      const ai = new GoogleGenAI({ apiKey: geminiKey })
      const recentTopics = loadRecentTopics(10)
      const avoidLine = recentTopics.length > 0
        ? `Avoid near-duplicates/paraphrases of these recent generated topics: ${recentTopics.join(' | ')}`
        : ''
      const angleHints = [
        'policy impact (RBI/Fed/rates/budget/regulatory trigger)',
        'commodity movement (gold/silver/oil impact)',
        'flows & positioning (FII/DII, volume, breadth)',
        'sector rotation (IT/banks/auto/pharma leadership shift)',
        'currency/bond linkage (INR, yields, debt-market effect)',
        'corporate earnings or guidance impact',
      ]

      const prompts = angleHints.map((angle) => [
        'Use Google Search to find current, trending finance or markets news relevant to PL Capital audiences in India.',
        'Prioritize very recent developments and high-interest stories.',
        body.purpose ? `Purpose: ${body.purpose}` : '',
        body.targetAudience ? `Audience: ${body.targetAudience}` : '',
        body.platforms?.length ? `Platforms: ${body.platforms.join(', ')}` : '',
        `Focus angle for this attempt: ${angle}.`,
        'Output exactly one short campaign topic in headline style (5 to 15 words).',
        'Ensure the line is complete and readable, not truncated.',
        'Use neutral news wording, not advice/recommendations.',
        'Preferred angle styles: market-impact or explainer headline.',
        'Example styles (do not copy verbatim): "US-India trade deal impact on export sectors", "What is causing the silver rally in India?"',
        avoidLine,
        'No labels, no quotes, no bullets.',
      ].filter(Boolean).join('\n'))
      let topic = ''
      let lastRawTopic = ''
      let lastFinishReason = ''

      for (let attempt = 0; attempt < 2 && !topic; attempt += 1) {
        for (const prompt of prompts) {
          const response = await ai.models.generateContent({
            model: LIVE_NEWS_MODEL,
            contents: [{ text: prompt }],
            config: {
              temperature: 0.4,
              maxOutputTokens: 512,
              responseMimeType: 'text/plain',
              tools: [{ googleSearch: {} }],
            },
          })

          const rawTopic = await getGeminiText(response)
          const extracted = extractBestTopic(rawTopic)
          const finishReason = response?.candidates?.[0]?.finishReason || ''
          const cleaned = sanitizeNewsHeadline(extracted)
          const wordCount = cleaned ? cleaned.split(/\s+/).filter(Boolean).length : 0
          const looksTruncated = /[-:;,]$/.test(cleaned)
          const hitMaxTokens = String(finishReason).toUpperCase() === 'MAX_TOKENS'

          lastRawTopic = rawTopic
          lastFinishReason = finishReason

          if (
            cleaned &&
            cleaned.length >= 5 &&
            wordCount >= 5 &&
            wordCount <= 15 &&
            !looksTruncated &&
            !hitMaxTokens &&
            !isTooSimilarToRecent(cleaned, recentTopics) &&
            !isAdvisoryOrGenericNewsLine(cleaned) &&
            !isGenericTagline(cleaned)
          ) {
            topic = cleaned
            break
          }
        }
      }

      if (!topic) {
        console.error('Live-news topic invalid', {
          rawTopic: lastRawTopic?.slice(0, 300),
          finishReason: lastFinishReason,
        })
        return NextResponse.json(
          { error: 'No valid live-news topic generated. Please try again.' },
          { status: 500 }
        )
      }

      saveTopicToHistory(topic)
      return NextResponse.json({ topic, model: LIVE_NEWS_MODEL, source: 'google-search' })
    }

    if (!groqKey) {
      return NextResponse.json({ error: 'GROQ_API_KEY is not configured' }, { status: 500 })
    }

    const referencePath = path.join(process.cwd(), 'public', REFERENCE_FILENAME)
    const hasReference = fs.existsSync(referencePath)
    const reference = hasReference ? fs.readFileSync(referencePath, 'utf8') : ''

    const contextLines = [
      body.campaignType ? `Campaign type: ${body.campaignType}` : null,
      body.purpose ? `Purpose: ${body.purpose}` : null,
      body.targetAudience ? `Audience: ${body.targetAudience}` : null,
      body.platforms?.length ? `Platforms: ${body.platforms.join(', ')}` : null,
      hasReference ? `Product context (for ideas only; do not copy taglines):\n${reference.substring(400, 1800)}` : null,
    ].filter(Boolean) as string[]

    const userPrompt = [
      'Generate exactly one short campaign topic for PL Capital (finance). Max 15 words.',
      'Do NOT use generic taglines like "80 years of wealth creation", "PL Capital solutions", or "expertise with PL Capital". Give a specific, campaign-style topic (e.g. tax-saving strategies, mutual fund basics, IPO investing).',
      ...contextLines,
      'Reply with only the topic line, no labels or quotes. Example: 5 tax-saving strategies for HNIs in 2025',
    ].join('\n')

    console.log('Making request to Groq API with model:', MODEL_PRIMARY)

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000) // 15 second timeout

    const response = await fetch(
      GROQ_API_URL,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: MODEL_PRIMARY,
          messages: [
            {
              role: 'system',
              content: 'You are a creative marketing expert for PL Capital (financial services). Your reply must be ONLY one short, specific campaign topic (max 15 words). Do NOT use generic taglines like "80 years of wealth creation" or "PL Capital solutions". Prefer concrete topics: tax saving, mutual funds, IPO, options, portfolio tips, market outlook, etc. No labels, no "Topic:", no quotes. Example: 5 tax-saving strategies for HNIs in 2025'
            },
            {
              role: 'user',
              content: userPrompt
            }
          ],
          temperature: 0.7,
          max_tokens: 80
        }),
        signal: controller.signal
      }
    ).finally(() => clearTimeout(timeout))

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Groq API error:', response.status, errorText)
      return NextResponse.json(
        { error: `Groq API request failed: ${response.status} ${errorText}` },
        { status: 500 }
      )
    }

    const result = await response.json()
    console.log('Groq API response (topic):', result?.choices?.[0]?.message?.content?.slice(0, 200))

    const message = result?.choices?.[0]?.message
    let topic = message?.content?.trim()

    if (!topic && message?.reasoning) {
      const reasoning = message.reasoning.trim()
      const quoteMatch = reasoning.match(/"([^"]+)"/)
      if (quoteMatch) topic = quoteMatch[1]
      else {
        const sentences = reasoning.split(/[.!?]/).filter((s: string) => s.trim().length > 10)
        topic = sentences[sentences.length - 1]?.trim() || reasoning
      }
    }

    if (topic && topic.includes('\n')) topic = topic.split('\n')[0].trim()

    topic = topic?.replace(/^["']|["']$/g, '').trim()

    topic = normalizeTopic(topic)

    if (isEchoOrInvalid(topic, userPrompt) || isGenericTagline(topic) || !topic || topic.length < 5) {
      if (isGenericTagline(topic)) console.error('Topic is generic tagline, retrying')
      else console.error('Topic invalid or echo, retrying with fallback model')
      const fallbackResponse = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: MODEL_FALLBACK,
          messages: [
            { role: 'system', content: 'Reply with one short, specific campaign topic for PL Capital (max 15 words). Do NOT use "80 years", "wealth creation expertise", or "PL Capital solutions". Use a concrete topic like tax saving, mutual funds, IPO, or market tips. No labels, no quotes. Example: 5 tax-saving strategies for HNIs in 2025' },
            { role: 'user', content: `Campaign: ${body.campaignType || 'general'}. Purpose: ${body.purpose || 'brand-awareness'}. Audience: ${body.targetAudience || 'all'}. Give one specific topic line only (e.g. tax saving, mutual funds, IPO), not a generic tagline.` }
          ],
          temperature: 0.7,
          max_tokens: 80
        })
      })
      if (!fallbackResponse.ok) {
        return NextResponse.json(
          { error: 'No valid topic generated from Groq response', debug: result },
          { status: 500 }
        )
      }
      const fallbackResult = await fallbackResponse.json()
      topic = normalizeTopic(fallbackResult?.choices?.[0]?.message?.content?.trim())
    }

    if (!topic || topic.length < 5) {
      console.error('Failed to extract valid topic from response:', result)
      return NextResponse.json(
        { error: 'No valid topic generated from Groq response', debug: result },
        { status: 500 }
      )
    }

    if (isGenericTagline(topic)) {
      console.error('Topic rejected as generic tagline:', topic)
      return NextResponse.json(
        { error: 'Generated topic was too generic. Please try again for a more specific topic.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ topic, model: MODEL_PRIMARY })
  } catch (error) {
    console.error('Topic generation error:', error)

    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json(
        { error: 'Request timed out after 15 seconds. Please try again.' },
        { status: 504 }
      )
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
