import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'
const DEFAULT_MODEL = 'llama-3.3-70b-versatile'
const WORDS_PER_SECOND_TARGET = 2.2
const WORDS_PER_SECOND_MIN = 1.8
const WORDS_PER_SECOND_MAX = 2.6

const LANGUAGE_NAMES: Record<string, string> = {
  english: 'English',
  hinglish: 'Hinglish (Hindi in Latin script)',
  hindi: 'Hindi',
  bengali: 'Bengali',
  telugu: 'Telugu',
  marathi: 'Marathi',
  tamil: 'Tamil',
  gujarati: 'Gujarati',
  kannada: 'Kannada',
  malayalam: 'Malayalam',
  punjabi: 'Punjabi',
  urdu: 'Urdu',
  odia: 'Odia',
  assamese: 'Assamese'
}

function getLanguageName(code: string): string {
  return LANGUAGE_NAMES[code?.toLowerCase() || ''] ?? 'English'
}

type GenerateScriptBody = {
  topic: string
  duration?: number
  platform?: string
  format?: string
  language?: string
  planningContext?: string
}

export async function POST(request: NextRequest) {
  try {
    const body: GenerateScriptBody = await request.json()
    const topic = (body.topic || '').trim() || 'PL Capital investing insights'
    const platform = body.platform || 'instagram'
    const format = body.format || 'reel'
    const duration = Math.max(8, Number(body.duration) || 8)
    const language = body.language || 'english'
    const planningText = (body.planningContext || '').trim()

    const groqKey = process.env.GROQ_API_KEY
    if (!groqKey) {
      const hook = platform === 'instagram' ? 'Stop scrolling—quick money tip.' : 'Quick update.'
      const fallback = `${hook} ${topic}. Want a simple plan? Talk to PL Capital today.`.trim()
      return NextResponse.json({ script: fallback })
    }

    const wordsTarget = Math.max(12, Math.round(duration * WORDS_PER_SECOND_TARGET))
    const minWords = Math.max(10, Math.round(duration * WORDS_PER_SECOND_MIN))
    const maxWords = Math.max(minWords + 6, Math.round(duration * WORDS_PER_SECOND_MAX))
    const languageName = getLanguageName(language)
    const isInstagramReel = platform === 'instagram' || /reel/i.test(format)

    const systemPrompt = `You write short, natural spoken scripts for a financial services video avatar.
Return ONLY the spoken script as plain text. No bullet points. No headings. No stage directions. No meta-instructions.`

    const isYouTubeShort = platform === 'youtube' || /short/i.test(format)
    const viralReelStyle = `Style (viral reel/short, Indian audience):
- Hook in the first sentence (pattern interrupt — stop the scroll).
- Short punchy sentences, spoken like a credible Indian finfluencer (not cheesy).
- Use everyday India cues where relevant (₹, SIP, tax, salary day) without giving personalized advice.
- Close with a strong CTA: "Save this", "Share", "Follow", or "Comment 'PLAN'".`
    const styleGuidance = (isInstagramReel || isYouTubeShort) ? viralReelStyle : ''

    const userPrompt = `Write a single spoken script for an AI avatar video.

Constraints:
- Platform: ${platform}
- Format: ${format}
- Topic: ${topic}
- Duration: ${duration} seconds
- Language: ${languageName}
- Tone: confident, warm, professional, Indian business style.
- Length target: ${wordsTarget} words.
- Hard word-count range: ${minWords} to ${maxWords} words.
- Compliance: no guaranteed returns, no exaggerated claims, no personalized investment advice.
- Do not include disclaimers in the spoken script (caption handles disclaimers separately).

${styleGuidance}

Optional context from campaign planning (may include purpose/audience/tone):
${planningText ? planningText.slice(0, 2000) : '(none)'}

Output rules:
- Output ONLY the script text the avatar should speak.
- Do NOT include quotation marks or labels like "Script:".`

    const model = process.env.GROQ_HEYGEN_SCRIPT_MODEL || DEFAULT_MODEL

    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${groqKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.6,
        max_tokens: Math.min(700, Math.max(200, Math.round(maxWords * 1.8)))
      })
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      console.error('Groq generate-script error:', response.status, text)
      return NextResponse.json(
        { error: text || `Groq API error: ${response.status}` },
        { status: 502 }
      )
    }

    const data = await response.json()
    let script = (data.choices?.[0]?.message?.content || '').trim()

    script = script.replace(/^```[\s\S]*?$/gm, '').trim()
    script = script.replace(/^\s*script\s*:\s*/i, '').trim()
    script = script.replace(/^["']|["']$/g, '').trim()

    const wordCount = (text: string) => String(text || '').trim().split(/\s+/).filter(Boolean).length
    const trimToWords = (text: string, n: number) => {
      const parts = String(text || '').trim().split(/\s+/).filter(Boolean)
      return parts.slice(0, n).join(' ').trim()
    }

    let words = wordCount(script)
    if (words > maxWords + 10) {
      script = trimToWords(script, maxWords)
      words = wordCount(script)
    }

    // If the model missed duration badly, run one rewrite pass with strict word bounds.
    if (words < minWords || words > maxWords) {
      const rewritePrompt = `Rewrite the following avatar script to fit a ${duration}-second delivery.
Hard constraints:
- Keep the same meaning and core message.
- Output plain spoken text only.
- Word count must be between ${minWords} and ${maxWords}.
- Target about ${wordsTarget} words.
- No disclaimers.

Original script:
${script}`

      const rewriteResponse = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${groqKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: rewritePrompt }
          ],
          temperature: 0.3,
          max_tokens: Math.min(700, Math.max(200, Math.round(maxWords * 1.8)))
        })
      })

      if (rewriteResponse.ok) {
        const rewriteData = await rewriteResponse.json()
        const rewritten = (rewriteData.choices?.[0]?.message?.content || '').trim()
          .replace(/^```[\s\S]*?$/gm, '')
          .replace(/^\s*script\s*:\s*/i, '')
          .replace(/^["']|["']$/g, '')
          .replace(/\bmarket risks apply\.?/gi, '')
          .replace(/\s+/g, ' ')
          .trim()
        if (rewritten) {
          script = rewritten
          words = wordCount(script)
        }
      }

      // If still too short, do one targeted expansion pass.
      if (words < minWords) {
        const expandPrompt = `Expand the following spoken script to fit ${duration} seconds.
Hard constraints:
- Preserve the same intent and core message.
- Keep it natural for spoken delivery.
- Output plain text only.
- Final word count must be between ${minWords} and ${maxWords}.
- Target about ${wordsTarget} words.
- No disclaimers.

Script:
${script}`

        const expandResponse = await fetch(GROQ_API_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${groqKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: expandPrompt }
            ],
            temperature: 0.35,
            max_tokens: Math.min(700, Math.max(200, Math.round(maxWords * 1.8)))
          })
        })

        if (expandResponse.ok) {
          const expandData = await expandResponse.json()
          const expanded = (expandData.choices?.[0]?.message?.content || '').trim()
            .replace(/^```[\s\S]*?$/gm, '')
            .replace(/^\s*script\s*:\s*/i, '')
            .replace(/^["']|["']$/g, '')
            .replace(/\bmarket risks apply\.?/gi, '')
            .replace(/\s+/g, ' ')
            .trim()
          if (expanded) {
            script = expanded
            words = wordCount(script)
          }
        }
      }

      // Final hard clamp for upper bound.
      if (words > maxWords) {
        script = trimToWords(script, maxWords)
        words = wordCount(script)
      }
      if (words < minWords) {
        const padSentences = [
          'Stay consistent and review your plan regularly.',
          'Small disciplined steps create long-term wealth.',
          'Focus on process, not daily market noise.'
        ]
        let idx = 0
        while (words < minWords && idx < padSentences.length) {
          script = `${script.replace(/\s*$/, '')} ${padSentences[idx]}`.replace(/\s+/g, ' ').trim()
          words = wordCount(script)
          idx += 1
        }
      }
    }

    // Caption handles compliance disclaimer separately; keep spoken script clean.
    script = script.replace(/\bmarket risks apply\.?/gi, '').replace(/\s+/g, ' ').trim()

    return NextResponse.json({
      script,
      meta: {
        durationSeconds: duration,
        words,
        minWords,
        targetWords: wordsTarget,
        maxWords
      }
    })
  } catch (e) {
    console.error('generate-script error:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to generate script' },
      { status: 500 }
    )
  }
}
