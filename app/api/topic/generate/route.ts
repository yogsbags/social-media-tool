import fs from 'fs'
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

/** Returns true if the text looks like our instruction (echo) rather than a topic */
function isEchoOrInvalid(text: string | undefined, userPrompt: string): boolean {
  if (!text || text.length < 10) return true
  if (text.includes('Generate ONE concise campaign topic') || text.includes('Return ONLY the campaign topic')) return true
  if (text.includes('Type:') && text.includes('Purpose:') && text.includes('Platforms:')) return true
  if (text.length > 200 && text.includes('\n')) return true
  if (text === userPrompt.trim() || userPrompt.includes(text)) return true
  return false
}

export async function POST(request: NextRequest) {
  try {
    const body: GenerateBody = await request.json()
    const groqKey = process.env.GROQ_API_KEY

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
      hasReference ? `Product context (optional):\n${reference.substring(0, 1500)}` : null,
    ].filter(Boolean) as string[]

    const userPrompt = [
      'Generate exactly one short campaign topic for PL Capital (finance). Max 15 words.',
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
              content: 'You are a creative marketing expert for PL Capital (financial services). Your reply must be ONLY one short campaign topic (max 15 words). No labels, no "Topic:", no quotes, no explanation. Example format: 5 tax-saving strategies for HNIs in 2025'
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
    for (const pattern of fillerPatterns) {
      topic = topic?.replace(pattern, '').trim() ?? ''
    }
    topic = topic?.replace(/^["']|["']$/g, '').trim()

    if (isEchoOrInvalid(topic, userPrompt) || !topic || topic.length < 5) {
      console.error('Topic invalid or echo, retrying with fallback model')
      const fallbackResponse = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: MODEL_FALLBACK,
          messages: [
            { role: 'system', content: 'Reply with only one short campaign topic for PL Capital (max 15 words). No labels, no quotes. Example: 5 tax-saving strategies for HNIs in 2025' },
            { role: 'user', content: `Campaign: ${body.campaignType || 'general'}. Purpose: ${body.purpose || 'brand-awareness'}. Audience: ${body.targetAudience || 'all'}. Give one topic line only.` }
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
      topic = fallbackResult?.choices?.[0]?.message?.content?.trim()
      if (topic?.includes('\n')) topic = topic.split('\n')[0].trim()
      topic = topic?.replace(/^["']|["']$/g, '').trim()
      for (const pattern of fillerPatterns) {
        topic = topic?.replace(pattern, '').trim() ?? ''
      }
      topic = topic?.replace(/^["']|["']$/g, '').trim()
    }

    if (!topic || topic.length < 5) {
      console.error('Failed to extract valid topic from response:', result)
      return NextResponse.json(
        { error: 'No valid topic generated from Groq response', debug: result },
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
