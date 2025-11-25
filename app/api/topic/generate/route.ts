import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
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

const MODEL = 'openai/gpt-oss-120b'
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'
const REFERENCE_FILENAME = 'pl-products-reference.md'

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

    const prompt = [
      'Generate ONE concise campaign topic (maximum 15 words) for PL Capital.',
      body.campaignType ? `Type: ${body.campaignType}` : null,
      body.purpose ? `Purpose: ${body.purpose}` : null,
      body.targetAudience ? `Audience: ${body.targetAudience}` : null,
      body.platforms?.length ? `Platforms: ${body.platforms.join(', ')}` : null,
      hasReference ? `\n\nProduct Context:\n${reference.substring(0, 2000)}` : null,
      '\nReturn ONLY the campaign topic text, no explanations or quotes.',
    ].filter(Boolean).join('\n')

    console.log('Making request to Groq API with model:', MODEL)

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
          model: MODEL,
          messages: [
            {
              role: 'system',
              content: 'You are a creative marketing expert. Generate ONLY the campaign topic text itself. Do NOT include any prefixes, explanations, preambles like "Here\'s a topic:", "So something like", or dramatic phrases followed by colons. Return the bare topic text only.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.8,
          max_tokens: 100
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
    console.log('Groq API response:', JSON.stringify(result, null, 2))

    // Extract topic from content or reasoning field
    const message = result?.choices?.[0]?.message
    let topic = message?.content?.trim()

    // If content is empty, try reasoning field (for chain-of-thought models)
    if (!topic && message?.reasoning) {
      const reasoning = message.reasoning.trim()
      // Try to extract a clean topic from reasoning
      // Look for quoted text or the last sentence
      const quoteMatch = reasoning.match(/"([^"]+)"/)
      if (quoteMatch) {
        topic = quoteMatch[1]
      } else {
        // Get the last complete sentence
        const sentences = reasoning.split(/[.!?]/).filter(s => s.trim().length > 10)
        topic = sentences[sentences.length - 1]?.trim() || reasoning
      }
    }

    // Clean up the topic (remove quotes, extra whitespace, and filler phrases)
    topic = topic?.replace(/^["']|["']$/g, '').trim()

    // Remove common filler patterns and prefixes
    const fillerPatterns = [
      /^So something like[:\s]+/i,
      /^Here's a topic[:\s]+/i,
      /^Topic[:\s]+/i,
      /^Campaign topic[:\s]+/i,
      /^How about[:\s]+/i,
      /^Try this[:\s]+/i,
      /^Unleash [^:]+:\s*/i,
      /^Discover [^:]+:\s*/i,
      /^Unlock [^:]+:\s*/i,
      /^Experience [^:]+:\s*/i,
      /^Transform [^:]+:\s*/i,
      // Remove any pattern that starts with a dramatic phrase followed by colon
      /^[A-Z][^:]{0,40}:\s*(?=[A-Z])/,
    ]

    for (const pattern of fillerPatterns) {
      topic = topic?.replace(pattern, '').trim()
    }

    // Remove leading quotes again after pattern removal
    topic = topic?.replace(/^["']|["']$/g, '').trim()

    if (!topic || topic.length < 5) {
      console.error('Failed to extract valid topic from response:', result)
      return NextResponse.json(
        { error: 'No valid topic generated from Groq response', debug: result },
        { status: 500 }
      )
    }

    return NextResponse.json({ topic, model: MODEL })
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
