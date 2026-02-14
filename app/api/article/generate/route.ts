import { GoogleGenAI } from '@google/genai'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MODEL = 'gemini-3-flash-preview'

type GenerateArticleBody = {
  topic?: string
  purpose?: string
  targetAudience?: string
  campaignType?: string
  language?: string
}

type ArticleFaq = {
  question: string
  answer: string
}

function extractJsonObject(input: string): string {
  const trimmed = input.trim()
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed

  const codeBlock =
    trimmed.match(/```json\s*([\s\S]*?)\s*```/i)?.[1] ||
    trimmed.match(/```\s*([\s\S]*?)\s*```/)?.[1]
  if (codeBlock) return codeBlock.trim()

  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1)
  return trimmed
}

function hasAdvisoryLanguage(text: string): boolean {
  const t = text.toLowerCase()
  const advisory = [
    /\b(buy|sell|hold|invest|accumulate|book profits?)\b/,
    /\b(should you|what should investors|our recommendation|recommend(ed|ation)?)\b/,
    /\b(strategy|strategies|tips?|how to profit|trading call)\b/,
  ]
  return advisory.some((pattern) => pattern.test(t))
}

function countBodyWords(text: string): number {
  return text
    .replace(/\nSources:[\s\S]*$/i, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length
}

function countBodyParagraphs(text: string): number {
  return text
    .replace(/\nSources:[\s\S]*$/i, '')
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean).length
}

function lengthQuality(words: number, paragraphs: number): 'strong' | 'medium' | 'short' {
  if (words >= 280 && paragraphs >= 4) return 'strong'
  if (words >= 180 && paragraphs >= 3) return 'medium'
  return 'short'
}

function toSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
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
    // ignore and continue
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

function collectGroundedSources(response: any): Array<{ title: string; url: string }> {
  const chunks = response?.candidates?.[0]?.groundingMetadata?.groundingChunks
  if (!Array.isArray(chunks)) return []

  const seen = new Set<string>()
  const sources: Array<{ title: string; url: string }> = []

  for (const chunk of chunks) {
    const web = chunk?.web
    const url = web?.uri
    if (!url || seen.has(url)) continue
    seen.add(url)
    sources.push({ title: web?.title || 'Source', url })
    if (sources.length >= 8) break
  }
  return sources
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export async function POST(request: NextRequest) {
  try {
    const geminiApiKey = process.env.GEMINI_API_KEY || ''
    if (!geminiApiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY is not set' }, { status: 500 })
    }

    const body: GenerateArticleBody = await request.json()
    const topic = (body.topic || '').trim()
    if (!topic) {
      return NextResponse.json({ error: 'Topic is required' }, { status: 400 })
    }

    const ai = new GoogleGenAI({ apiKey: geminiApiKey })
    const language = body.language || 'english'
    const purpose = body.purpose || 'brand-awareness'
    const targetAudience = body.targetAudience || 'all_clients'

    const promptDetailed = [
      'Use Google Search grounding to fact-check and generate a current Indian markets live-news article.',
      `Primary topic: ${topic}`,
      `Campaign purpose: ${purpose}`,
      `Target audience: ${targetAudience}`,
      `Language: ${language}`,
      'Write in a neutral newsroom tone similar to professional business news portals.',
      'Do NOT include recommendations, advisory calls, buy/sell/hold language, or investor tips.',
      'Focus on what happened, why it matters, and relevant market context.',
      'Return strict JSON only with this schema:',
      '{',
      '  "headline": "string, 8-15 words",',
      '  "subheadline": "string, 12-24 words",',
      '  "summary": "string, 45-90 words, neutral",',
      '  "articleText": "4-6 substantial paragraphs plain text, no markdown, each 55-90 words",',
      '  "articleHtml": "HTML with <h1>, <p> blocks only",',
      '  "tags": ["3-6 short tags"],',
      '  "seoTitle": "string, <= 60 chars",',
      '  "metaDescription": "string, 140-160 chars",',
      '  "focusKeywords": ["3-6 keywords"],',
      '  "faqs": [{"question":"string","answer":"string"}] // 3 items',
      '}',
    ].join('\n')
    const promptCompact = [
      'Use Google Search grounding and write a concise, factual Indian market news article.',
      `Topic: ${topic}`,
      'Return strict JSON only.',
      'Required keys: headline, subheadline, summary, articleText, articleHtml, tags, seoTitle, metaDescription, focusKeywords, faqs.',
      'Write articleText as 4 substantial paragraphs with strong factual detail.',
      'No investment recommendations or buy/sell/hold language.',
    ].join('\n')
    const promptAdvisorySafe = [
      'Use Google Search grounding and rewrite as strict business-news copy.',
      `Topic: ${topic}`,
      'Return strict JSON only with the same keys.',
      'Hard constraint: do not include ANY advisory words or actions.',
      'Forbidden words/phrases: buy, sell, hold, invest, should investors, strategy, tips, recommendation.',
      'Write only factual reporting on what happened, drivers, impact, and near-term implications.',
      'Length constraint: 4-6 paragraphs and at least 280 words in articleText.',
    ].join('\n')

    let parsed: any = null
    let responseForSources: any = null
    let lastRaw = ''

    const attempts = [
      { prompt: promptDetailed, maxOutputTokens: 4096 },
      { prompt: promptCompact, maxOutputTokens: 3072 },
      { prompt: promptAdvisorySafe, maxOutputTokens: 3072 },
    ]

    for (const attempt of attempts) {
      const response = await ai.models.generateContent({
        model: MODEL,
        contents: [{ text: attempt.prompt }],
        config: {
          temperature: 0.3,
          maxOutputTokens: attempt.maxOutputTokens,
          responseMimeType: 'application/json',
          tools: [{ googleSearch: {} }],
        },
      })

      const raw = await getGeminiText(response)
      const jsonText = extractJsonObject(raw)
      lastRaw = raw

      try {
        const candidate = JSON.parse(jsonText)
        const cHeadline = String(candidate?.headline || '').trim()
        const cSubheadline = String(candidate?.subheadline || '').trim()
        const cSummary = String(candidate?.summary || '').trim()
        const cArticleText = String(candidate?.articleText || '').trim()
        const cArticleHtml = String(candidate?.articleHtml || '').trim()
        const candidateText = [cHeadline, cSubheadline, cSummary, cArticleText].join(' ')
        if (!cHeadline || !cArticleText || !cArticleHtml) {
          continue
        }
        if (hasAdvisoryLanguage(candidateText)) {
          continue
        }

        parsed = candidate
        responseForSources = response
        break
      } catch {
        // try next attempt
      }
    }

    if (!parsed) {
      return NextResponse.json(
        { error: 'Failed to parse grounded article response', raw: lastRaw?.slice(0, 600) || '' },
        { status: 500 }
      )
    }

    const headline = String(parsed?.headline || '').trim()
    const subheadline = String(parsed?.subheadline || '').trim()
    const summary = String(parsed?.summary || '').trim()
    const articleText = String(parsed?.articleText || '').trim()
    const articleHtml = String(parsed?.articleHtml || '').trim()
    const tags = Array.isArray(parsed?.tags)
      ? parsed.tags.map((t: any) => String(t).trim()).filter(Boolean).slice(0, 8)
      : []
    const seoTitle = String(parsed?.seoTitle || headline).trim().slice(0, 120)
    const metaDescription = String(parsed?.metaDescription || summary).trim()
    const focusKeywords = Array.isArray(parsed?.focusKeywords)
      ? parsed.focusKeywords.map((k: any) => String(k).trim()).filter(Boolean).slice(0, 8)
      : tags.slice(0, 6)
    const faqs: ArticleFaq[] = Array.isArray(parsed?.faqs)
      ? parsed.faqs
          .map((f: any) => ({
            question: String(f?.question || '').trim(),
            answer: String(f?.answer || '').trim(),
          }))
          .filter((f: ArticleFaq) => f.question && f.answer)
          .slice(0, 5)
      : []

    if (!headline || !articleText || !articleHtml) {
      return NextResponse.json({ error: 'Incomplete article payload from model' }, { status: 500 })
    }

    const fullText = [headline, subheadline, summary, articleText].join(' ')
    if (hasAdvisoryLanguage(fullText)) {
      return NextResponse.json({ error: 'Generated article included advisory language after retries; please try again.' }, { status: 500 })
    }
    const bodyWordCount = countBodyWords(articleText)
    const bodyParagraphCount = countBodyParagraphs(articleText)

    const groundedSources = collectGroundedSources(responseForSources)
    const faqForSchema = faqs.length > 0
      ? faqs
      : [
          {
            question: `What is the latest update on ${topic}?`,
            answer: summary || articleText.split('\n\n')[0] || 'The article covers the latest verified market update and its impact.'
          },
          {
            question: 'Which factors are driving this market move?',
            answer: 'The move is being driven by a combination of macroeconomic, policy, and sector-specific factors discussed in the article.'
          },
          {
            question: 'How is this affecting Indian markets?',
            answer: 'The article explains sector impact, market sentiment, and near-term implications using grounded sources.'
          }
        ]

    const faqSchema = {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faqForSchema.map((faq) => ({
        '@type': 'Question',
        name: faq.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: faq.answer
        }
      }))
    }

    const sourcesTextBlock = groundedSources.length
      ? `\n\nSources:\n${groundedSources.map((s, i) => `${i + 1}. ${s.title} - ${s.url}`).join('\n')}`
      : ''

    const sourcesHtmlBlock = groundedSources.length
      ? `<h2>Sources</h2><ol>${groundedSources.map((s) => `<li><a href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(s.title)}</a></li>`).join('')}</ol>`
      : ''

    const seoTextBlock = `\n\nSEO Metadata:\n- SEO Title: ${seoTitle}\n- Meta Description: ${metaDescription}\n- Focus Keywords: ${(focusKeywords || []).join(', ')}`
    const seoHtmlBlock = `<h2>SEO Metadata</h2><ul><li><strong>SEO Title:</strong> ${escapeHtml(seoTitle)}</li><li><strong>Meta Description:</strong> ${escapeHtml(metaDescription)}</li><li><strong>Focus Keywords:</strong> ${escapeHtml((focusKeywords || []).join(', '))}</li></ul>`

    const faqSchemaJson = JSON.stringify(faqSchema, null, 2)
    const faqTextBlock = `\n\nFAQ Schema (JSON-LD):\n${faqSchemaJson}`
    const faqHtmlBlock = `<h2>FAQ Schema</h2><pre>${escapeHtml(faqSchemaJson)}</pre><script type="application/ld+json">${escapeHtml(faqSchemaJson)}</script>`

    const article = {
      headline,
      subheadline,
      summary,
      articleText: `${articleText}${sourcesTextBlock}${seoTextBlock}${faqTextBlock}`,
      articleHtml: `${articleHtml}${sourcesHtmlBlock}${seoHtmlBlock}${faqHtmlBlock}`,
      tags,
      seo: {
        seoTitle,
        metaDescription,
        focusKeywords
      },
      faqs: faqForSchema,
      faqSchema,
      topic,
      generatedAt: new Date().toISOString(),
      model: MODEL,
      factCheck: {
        grounded: true,
        sourceCount: groundedSources.length,
      },
      quality: {
        length: lengthQuality(bodyWordCount, bodyParagraphCount),
        bodyWordCount,
        bodyParagraphCount
      },
      sources: groundedSources,
    }

    return NextResponse.json(article)
  } catch (error) {
    console.error('Live news article generation error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate live news article' },
      { status: 500 }
    )
  }
}
