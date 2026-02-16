import { GoogleGenAI } from '@google/genai'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MODEL = 'gemini-3-flash-preview'
const MAX_GENERATION_MS = 240000

type GenerateArticleBody = {
  topic?: string
  purpose?: string
  targetAudience?: string
  campaignType?: string
  language?: string
  researchPDFs?: Array<{ name?: string; data?: string; size?: number }>
}

type ArticleFaq = {
  question: string
  answer: string
}

type RetryTrace = {
  attempt: number
  promptVariant: string
  maxOutputTokens: number
  status: 'success' | 'invalid-json' | 'missing-fields' | 'advisory-rejected' | 'model-error'
  detail?: string
  elapsedMs: number
}

function extractJsonObject(input: string): string {
  const trimmed = input.trim()
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) return trimmed

  const codeBlock =
    trimmed.match(/```json\s*([\s\S]*?)\s*```/i)?.[1] ||
    trimmed.match(/```\s*([\s\S]*?)\s*```/)?.[1]
  if (codeBlock) return codeBlock.trim()

  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1)
  return trimmed
}

function findBalancedJsonSlice(input: string, opener: '{' | '['): string | null {
  const start = input.indexOf(opener)
  if (start < 0) return null

  const closer = opener === '{' ? '}' : ']'
  let depth = 0
  let inString = false
  let escaped = false

  for (let i = start; i < input.length; i += 1) {
    const ch = input[i]
    if (inString) {
      if (escaped) {
        escaped = false
        continue
      }
      if (ch === '\\') {
        escaped = true
        continue
      }
      if (ch === '"') {
        inString = false
      }
      continue
    }

    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === opener) depth += 1
    if (ch === closer) depth -= 1
    if (depth === 0) return input.slice(start, i + 1).trim()
  }
  return null
}

function parseJsonFlexible(raw: string): any | null {
  const variants: string[] = []
  const pushVariant = (value?: string | null) => {
    const normalized = String(value || '').trim()
    if (!normalized) return
    if (variants.indexOf(normalized) === -1) variants.push(normalized)
  }
  const trimmed = String(raw || '').trim()
  if (!trimmed) return null

  pushVariant(trimmed)
  pushVariant(extractJsonObject(trimmed))

  const codeBlock =
    trimmed.match(/```json\s*([\s\S]*?)\s*```/i)?.[1] ||
    trimmed.match(/```\s*([\s\S]*?)\s*```/)?.[1]
  if (codeBlock) pushVariant(codeBlock.trim())

  const balancedObject = findBalancedJsonSlice(trimmed, '{')
  if (balancedObject) pushVariant(balancedObject)
  const balancedArray = findBalancedJsonSlice(trimmed, '[')
  if (balancedArray) pushVariant(balancedArray)

  for (const candidate of variants) {
    const normalized = candidate
      .replace(/\uFEFF/g, '')
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2018\u2019]/g, "'")
      .trim()

    const attempts = [
      normalized,
      normalized.replace(/,\s*([}\]])/g, '$1'),
    ]

    for (const text of attempts) {
      try {
        return JSON.parse(text)
      } catch {
        // try next parse attempt
      }
    }
  }

  // Last-resort extraction for malformed quasi-JSON responses
  const extractField = (input: string, key: string): string => {
    const marker = `"${key}"`
    const keyPos = input.indexOf(marker)
    if (keyPos < 0) return ''
    const colonPos = input.indexOf(':', keyPos + marker.length)
    if (colonPos < 0) return ''
    let i = colonPos + 1
    while (i < input.length && /\s/.test(input[i])) i += 1
    if (input[i] !== '"') return ''
    i += 1
    let out = ''
    let escaped = false
    for (; i < input.length; i += 1) {
      const ch = input[i]
      if (escaped) {
        out += ch
        escaped = false
        continue
      }
      if (ch === '\\') {
        escaped = true
        continue
      }
      if (ch === '"') break
      out += ch
    }
    return out
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .trim()
  }

  const extracted = {
    headline: extractField(trimmed, 'headline') || extractField(trimmed, 'articleTitle'),
    subheadline: extractField(trimmed, 'subheadline'),
    summary: extractField(trimmed, 'summary'),
    articleText: extractField(trimmed, 'articleText'),
    articleHtml: extractField(trimmed, 'articleHtml'),
    seoTitle: extractField(trimmed, 'seoTitle'),
    metaDescription: extractField(trimmed, 'metaDescription'),
  }

  // Recover malformed payloads where the summary/body key is corrupted but text exists after subheadline.
  if ((!extracted.summary && !extracted.articleText) && extracted.subheadline) {
    const subheadlineMatch = trimmed.match(/"subheadline"\s*:\s*"((?:\\.|[^"\\])*)"/i)
    if (subheadlineMatch && typeof subheadlineMatch.index === 'number') {
      const tail = trimmed
        .slice(subheadlineMatch.index + subheadlineMatch[0].length)
        .replace(/^[\s,}]+/, '')
        .replace(/^"[^"]{1,60}/, '')
        .replace(/^[:\s"]+/, '')
        .trim()
      if (tail.length > 120) {
        extracted.articleText = tail
        extracted.summary = tail.split(/\s+/).slice(0, 70).join(' ').trim()
      }
    }
  }

  if (extracted.articleText || extracted.articleHtml || extracted.headline) {
    return extracted
  }

  return null
}

function normalizeArticlePayload(candidate: any): any {
  if (Array.isArray(candidate)) {
    const firstObject = candidate.find((item) => item && typeof item === 'object')
    if (firstObject) return normalizeArticlePayload(firstObject)
    return candidate[0]
  }
  if (!candidate || typeof candidate !== 'object') return candidate
  const directHasCore =
    typeof candidate.headline === 'string' ||
    typeof candidate.articleText === 'string' ||
    typeof candidate.articleHtml === 'string'
  if (directHasCore) return candidate

  const wrapperKeys = ['news_report', 'report', 'article', 'data', 'output', 'response']
  for (const key of wrapperKeys) {
    const nested = candidate?.[key]
    if (!nested || typeof nested !== 'object') continue
    const nestedHasCore =
      typeof nested.headline === 'string' ||
      typeof nested.articleText === 'string' ||
      typeof nested.articleHtml === 'string'
    if (nestedHasCore) {
      return {
        ...nested,
        tags: nested.tags ?? candidate.tags,
        seoTitle: nested.seoTitle ?? candidate.seoTitle,
        metaDescription: nested.metaDescription ?? candidate.metaDescription,
        focusKeywords: nested.focusKeywords ?? candidate.focusKeywords,
        faqs: nested.faqs ?? candidate.faqs
      }
    }
  }

  return candidate
}

function firstWords(input: string, count: number): string {
  return input
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, count)
    .join(' ')
    .trim()
}

function deriveSummaryFromArticleText(articleText: string): string {
  const text = String(articleText || '').trim()
  if (!text) return ''

  const summaryMatch = text.match(/(?:^|\n)(?:\d+\.\s*)?Summary:\s*([\s\S]*?)(?:\n(?:\d+\.\s*)?[A-Z][^\n]+|\n\n|$)/i)
  if (summaryMatch?.[1]) {
    return firstWords(summaryMatch[1].replace(/\s+/g, ' ').trim(), 80)
  }

  const firstParagraph = text
    .split(/\n\n+/)
    .map((p) => p.trim())
    .find(Boolean) || ''
  return firstWords(firstParagraph.replace(/\s+/g, ' ').trim(), 80)
}

function deriveSubheadline(summary: string, headline: string): string {
  const fromSummary = firstWords(String(summary || '').trim(), 22)
  if (fromSummary) return fromSummary
  const fromHeadline = firstWords(String(headline || '').trim(), 14)
  return fromHeadline ? `${fromHeadline}.` : ''
}

function articleTextToHtml(articleText: string): string {
  const normalizeMarkdownLine = (line: string) =>
    line
      .replace(/^#{1,6}\s*/, '')
      .replace(/^\s*\*\*(.*?)\*\*\s*$/g, '$1')
      .replace(/^\s*__(.*?)__\s*$/g, '$1')
      .trim()

  const lines = String(articleText || '')
    .split('\n')
    .map((line) => normalizeMarkdownLine(line))
    .filter(Boolean)

  if (lines.length === 0) return ''

  const headingMatchers: Array<{ pattern: RegExp; label: string }> = [
    { pattern: /^(?:\d+\.\s*)?summary\b\s*:?\s*/i, label: 'Summary' },
    { pattern: /^(?:\d+\.\s*)?issue details(?:\s+and\s+key\s+dates)?\b\s*:?\s*/i, label: 'Issue Details and Key Dates' },
    { pattern: /^(?:\d+\.\s*)?use of proceeds(?:\s*\/\s*key objectives?|(?:\s+and\s+key objectives?))?\b\s*:?\s*/i, label: 'Use of Proceeds / Key Objectives' },
    { pattern: /^(?:\d+\.\s*)?about the company\b\s*:?\s*/i, label: 'About the Company' },
    { pattern: /^(?:\d+\.\s*)?financial performance\b\s*:?\s*/i, label: 'Financial Performance' },
    { pattern: /^(?:\d+\.\s*)?what the numbers show\b\s*:?\s*/i, label: 'What the Numbers Show' },
    { pattern: /^(?:\d+\.\s*)?strengths?\b\s*:?\s*/i, label: 'Strengths' },
    { pattern: /^(?:\d+\.\s*)?risks?\b\s*:?\s*/i, label: 'Risks' },
    { pattern: /^(?:\d+\.\s*)?peer positioning\b\s*:?\s*/i, label: 'Peer Positioning' },
    { pattern: /^(?:\d+\.\s*)?bottom line\b\s*:?\s*/i, label: 'Bottom Line' },
  ]

  const splitTableCells = (line: string): string[] => {
    const cleaned = line.trim().replace(/^\|/, '').replace(/\|$/, '')
    return cleaned.split('|').map((c) => c.trim())
  }
  const isAlignmentRow = (line: string): boolean => {
    const t = line.trim().replace(/^\|/, '').replace(/\|$/, '').replace(/\s+/g, '')
    return /^:?-{2,}:?(?:\|:?-{2,}:?)*$/.test(t)
  }

  const blocks: string[] = []
  let inList = false
  const closeList = () => {
    if (!inList) return
    blocks.push('</ul>')
    inList = false
  }

  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    let matched = false
    for (const matcher of headingMatchers) {
      if (!matcher.pattern.test(line)) continue
      closeList()
      const trailing = line.replace(matcher.pattern, '').trim()
      blocks.push(`<h2>${escapeHtml(matcher.label)}</h2>`)
      if (trailing) blocks.push(`<p>${escapeHtml(trailing)}</p>`)
      matched = true
      break
    }
    if (matched) {
      i += 1
      continue
    }

    // Markdown table support: header row + alignment row + body rows
    const next = lines[i + 1] || ''
    if (line.includes('|') && next && isAlignmentRow(next)) {
      closeList()
      const header = splitTableCells(line)
      const rows: string[][] = []
      i += 2
      while (i < lines.length && lines[i].includes('|')) {
        rows.push(splitTableCells(lines[i]))
        i += 1
      }
      const thead = `<thead><tr>${header.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>`
      const tbody = `<tbody>${rows.map((row) => `<tr>${row.map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody>`
      blocks.push(`<table>${thead}${tbody}</table>`)
      continue
    }

    const bullet = line.match(/^[-*]\s+(.*)$/)
    if (bullet) {
      if (!inList) {
        blocks.push('<ul>')
        inList = true
      }
      blocks.push(`<li>${escapeHtml(bullet[1].trim())}</li>`)
      i += 1
      continue
    }

    closeList()
    blocks.push(`<p>${escapeHtml(line)}</p>`)
    i += 1
  }

  closeList()

  return blocks.join('')
}

function htmlToText(html: string): string {
  const text = String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<\/(p|div|h1|h2|h3|h4|h5|h6|li|tr|table|section|article)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
  return text
}

function extractHeadlineFromHtml(html: string): string {
  const match = String(html || '').match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i)
  if (!match?.[1]) return ''
  return match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function coerceArticlePayload(candidate: any): any {
  if (!candidate || typeof candidate !== 'object') return candidate

  const stringValues = Object.values(candidate)
    .filter((v) => typeof v === 'string')
    .map((v) => String(v).trim())
    .filter((v) => v.length >= 80)
  const longestTextValue = stringValues.sort((a, b) => b.length - a.length)[0] || ''

  const articleHtmlRaw = String(candidate.articleHtml || '').trim()
  const articleTextRaw = String(
    candidate.articleText ||
      candidate.body ||
      candidate.content ||
      longestTextValue ||
      ''
  ).trim()
  const articleText = articleTextRaw || htmlToText(articleHtmlRaw)

  const headline = String(
    candidate.headline ||
      candidate.articleTitle ||
      candidate.title ||
      extractHeadlineFromHtml(articleHtmlRaw) ||
      ''
  ).trim()

  const summary = String(
    candidate.summary ||
      candidate.articleSummary ||
      (articleText ? firstWords(articleText, 80) : '') ||
      deriveSummaryFromArticleText(articleText) ||
      ''
  ).trim()

  const subheadline = String(
    candidate.subheadline ||
      candidate.articleSubtitle ||
      deriveSubheadline(summary, headline) ||
      ''
  ).trim()

  const articleHtml = articleHtmlRaw || articleTextToHtml(articleText)

  return {
    ...candidate,
    headline,
    subheadline,
    summary,
    articleText,
    articleHtml
  }
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

function cleanupTextArtifacts(input: string): string {
  const text = String(input || '')
  if (!text) return ''
  return text
    .replace(/\r/g, '')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, ' ')
    .replace(/(^|\n)\s*n(?=[A-Z])/g, '$1')
    .replace(/nn(?=\d+\.\s)/g, '\n\n')
    .replace(/n(?=\d+\.\s)/g, '\n')
    .replace(/n-\s/g, '\n- ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

function cleanupHtmlArtifacts(input: string): string {
  const html = String(input || '')
  if (!html) return ''
  return html
    .replace(/\r/g, '')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, ' ')
    .replace(/>n(?=[A-Z])/g, '>')
    .trim()
}

function normalizeIpoSectionHeadingsToH2(html: string): string {
  const sectionPattern =
    '(?:summary|issue details and key dates|use of proceeds \\/ key objectives|about the company|financial performance|what the numbers show|strengths|risks|peer positioning|bottom line)'
  return String(html || '').replace(
    new RegExp(`<h[1-6]([^>]*)>\\s*(?:\\d+\\.\\s*)?(${sectionPattern})\\s*:?\\s*<\\/h[1-6]>`, 'gi'),
    '<h2$1>$2</h2>'
  )
}

function isSectionStyleTitle(text: string): boolean {
  const t = String(text || '').trim().toLowerCase()
  return /^(?:\d+\.\s*)?(summary|issue details and key dates|use of proceeds \/ key objectives|about the company|financial performance|what the numbers show|strengths|risks|peer positioning|bottom line)\s*:?$/.test(t)
}

function toTitleCase(input: string): string {
  return String(input || '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
    .trim()
}

function buildFallbackHeadline(topic: string): string {
  const base = toTitleCase(String(topic || '').replace(/[^\w\s-]/g, ' ').replace(/\s+/g, ' ').trim())
  return base ? `${base}: Key Market Update` : 'Indian Markets Live Update'
}

function stripMarkdownDelimiters(input: string): string {
  return String(input || '')
    .replace(/\*\*/g, '')
    .replace(/__/g, '')
    .replace(/`/g, '')
    .trim()
}

function stripCodeFences(text: string): string {
  const t = String(text || '').trim()
  const m = t.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  return m?.[1]?.trim() || t
}

function extractBracketedJson(text: string): string {
  const s = String(text || '')
  const start = s.indexOf('{')
  if (start < 0) return ''
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < s.length; i += 1) {
    const ch = s[i]
    if (inString) {
      if (escaped) {
        escaped = false
        continue
      }
      if (ch === '\\') {
        escaped = true
        continue
      }
      if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === '{') depth += 1
    if (ch === '}') depth -= 1
    if (depth === 0) return s.slice(start, i + 1)
  }
  return ''
}

function parseRawArticleOutput(raw: string, topic: string): any {
  const text = cleanupTextArtifacts(stripCodeFences(raw))
  const seoIdx = text.search(/\nSEO Metadata:/i)
  const faqIdx = text.search(/\nFAQ Schema \(JSON-LD\):/i)
  const splitIdx = seoIdx >= 0 ? seoIdx : faqIdx >= 0 ? faqIdx : text.length
  const normalizeLine = (line: string) =>
    line
      .replace(/^#{1,6}\s*/, '')
      .replace(/^\s*\*\*(.*?)\*\*\s*$/g, '$1')
      .replace(/^\s*__(.*?)__\s*$/g, '$1')
      .trim()
  const dedupeConsecutiveBlocks = (input: string) => {
    const blocks = input
      .split(/\n\n+/)
      .map((b) => b.trim())
      .filter(Boolean)
    const out: string[] = []
    const norm = (v: string) => v.replace(/\s+/g, ' ').toLowerCase()
    for (const block of blocks) {
      const prev = out[out.length - 1]
      if (prev && norm(prev) === norm(block)) continue
      out.push(block)
    }
    return out.join('\n\n')
  }

  const articleTextPrepared = text
    .slice(0, splitIdx)
    // Ensure numbered section headings start on new lines
    .replace(/\s+(?=\d+\.\s+(Summary|Issue Details|Use of Proceeds|About the Company|Financial Performance|What the Numbers Show|Strengths|Risks|Peer Positioning|Bottom Line)\b)/gi, '\n')
    .split('\n')
    .map((line) => normalizeLine(stripMarkdownDelimiters(line)))
    .join('\n')

  const articleText = dedupeConsecutiveBlocks(
    articleTextPrepared
  ).trim()
  const tail = text.slice(splitIdx)

  const firstLine = articleText.split('\n').map((l) => l.trim()).find(Boolean) || ''
  const firstLineCanonical = normalizeLine(stripMarkdownDelimiters(firstLine))
  const firstLineLooksLikeKey =
    /^(headline|subheadline|summary|articletext|articlehtml)\b[:"]?/i.test(firstLineCanonical) ||
    firstLineCanonical.includes('{') ||
    firstLineCanonical.includes('"')
  const firstLineLooksLikeHeadline =
    firstLineCanonical.length >= 20 &&
    firstLineCanonical.length <= 120 &&
    !/[.!?]$/.test(firstLineCanonical)
  const headlineMatch = text.match(/^Headline:\s*(.+)$/im)
  const headline = cleanupTextArtifacts(stripMarkdownDelimiters(
    headlineMatch?.[1] ||
      (!firstLineLooksLikeKey &&
      firstLineLooksLikeHeadline &&
      !/^(?:\d+\.\s*)?(summary|issue details|use of proceeds|about the company|financial performance)\b/i.test(firstLineCanonical)
        ? firstLineCanonical
        : '') ||
      buildFallbackHeadline(topic)
  ))
  const summary = cleanupTextArtifacts(stripMarkdownDelimiters(deriveSummaryFromArticleText(articleText)))
  const subheadline = cleanupTextArtifacts(stripMarkdownDelimiters(deriveSubheadline(summary, headline)))

  const seoTitle = cleanupTextArtifacts(stripMarkdownDelimiters(tail.match(/SEO Title:\s*(.+)/i)?.[1] || headline))
  const metaDescription = cleanupTextArtifacts(stripMarkdownDelimiters(tail.match(/Meta Description:\s*(.+)/i)?.[1] || summary))
  const focusKeywordsRaw = cleanupTextArtifacts(stripMarkdownDelimiters(tail.match(/Focus Keywords:\s*(.+)/i)?.[1] || ''))
  const focusKeywords = focusKeywordsRaw
    ? focusKeywordsRaw.split(',').map((k) => k.trim()).filter(Boolean).slice(0, 8)
    : []

  let faqSchema: any = null
  const faqBlock = faqIdx >= 0 ? text.slice(faqIdx) : ''
  const faqJson = extractBracketedJson(faqBlock)
  if (faqJson) {
    try {
      faqSchema = JSON.parse(faqJson)
    } catch {
      faqSchema = null
    }
  }
  const faqs: ArticleFaq[] = Array.isArray(faqSchema?.mainEntity)
    ? faqSchema.mainEntity
        .map((item: any) => ({
          question: cleanupTextArtifacts(stripMarkdownDelimiters(String(item?.name || '').trim())),
          answer: cleanupTextArtifacts(stripMarkdownDelimiters(String(item?.acceptedAnswer?.text || '').trim())),
        }))
        .filter((f: ArticleFaq) => f.question && f.answer)
        .slice(0, 5)
    : []

  return {
    headline,
    subheadline,
    summary,
    articleText,
    articleHtml: articleTextToHtml(articleText),
    seoTitle,
    metaDescription,
    focusKeywords,
    faqs,
    faqSchema,
  }
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

  const isValidHttpUrl = (value: string): boolean => {
    try {
      const parsed = new URL(value)
      return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && Boolean(parsed.hostname)
    } catch {
      return false
    }
  }

  for (const chunk of chunks) {
    const web = chunk?.web
    const rawUrl = String(web?.uri || '').trim()
    if (!rawUrl || !isValidHttpUrl(rawUrl) || seen.has(rawUrl)) continue
    seen.add(rawUrl)
    sources.push({ title: String(web?.title || 'Source').trim() || 'Source', url: rawUrl })
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

function normalizeBase64Data(data?: string): string {
  if (!data) return ''
  const m = data.match(/^data:.*?;base64,(.*)$/)
  return (m ? m[1] : data).trim()
}

function buildPdfParts(pdfs: Array<{ name?: string; data?: string; size?: number }> | undefined) {
  if (!Array.isArray(pdfs) || pdfs.length === 0) return []
  const MAX_FILES = 2
  const MAX_BYTES_PER_FILE = 20 * 1024 * 1024 // 20MB safety for inline payloads

  return pdfs
    .slice(0, MAX_FILES)
    .map((pdf) => {
      const base64 = normalizeBase64Data(pdf.data)
      if (!base64) return null
      if (typeof pdf.size === 'number' && pdf.size > MAX_BYTES_PER_FILE) return null
      return {
        inlineData: {
          mimeType: 'application/pdf',
          data: base64
        }
      }
    })
    .filter(Boolean) as Array<{ inlineData: { mimeType: string; data: string } }>
}

function isIpoTopic(topic: string): boolean {
  return /\b(ipo|drhp|rhp|red herring|sme issue|book built issue)\b/i.test(topic || '')
}

function hasAllIpoSections(text: string): boolean {
  const t = String(text || '')
    .toLowerCase()
    .replace(/<[^>]+>/g, ' ')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const checks: RegExp[] = [
    /\bsummary\b/,
    /\bissue\s+details\b.*\bkey\s+dates\b|\bissue\s+details\b|\bkey\s+dates\b/,
    /\buse\s+of\s+proceeds\b|\bkey\s+objectives?\b|\bobjects?\s+of\s+the\s+issue\b/,
    /\babout\s+the\s+company\b|\bcompany\s+profile\b|\bcompany\s+overview\b/,
    /\bfinancial\s+performance\b|\bfinancials?\b/,
    /\bwhat\s+the\s+numbers\s+show\b|\bkey\s+financial\s+highlights\b/,
    /\bstrengths?\b/,
    /\brisks?\b|\brisk\s+factors?\b/,
    /\bpeer\s+positioning\b|\bpeer\s+comparison\b|\bcompetitive\s+position\b/,
    /\bbottom\s+line\b|\bconclusion\b|\boutlook\b/
  ]
  return checks.every((pattern) => pattern.test(t))
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
    const pdfParts = buildPdfParts(body.researchPDFs)
    const hasReferenceDocs = pdfParts.length > 0
    const referenceDocNames = (body.researchPDFs || [])
      .slice(0, pdfParts.length)
      .map((p) => String(p?.name || 'Reference PDF').trim())
      .filter(Boolean)
    const ipoStructuredMode = isIpoTopic(topic)
    const ipoFormatInstruction = [
      'MANDATORY FORMAT (follow exactly in articleText and mirror in articleHtml):',
      '1. Summary:',
      '2. Issue Details and Key Dates',
      '3. Use of Proceeds / Key Objectives',
      '4. About the Company',
      '5. Financial Performance',
      '6. What the Numbers Show',
      '7. Strengths',
      '8. Risks',
      '9. Peer Positioning',
      '10. Bottom Line',
      'Formatting rules:',
      '- Keep section headings exactly as written above.',
      '- Use bullet points for Issue Details, Use of Proceeds, Strengths, Risks, and Peer Positioning.',
      '- Include a compact table or table-like block under Financial Performance.',
      '- Keep tone neutral and factual (no recommendations).',
    ].join('\n')

    const promptDetailed = [
      'Use Google Search grounding to fact-check and generate a current Indian markets live-news article.',
      `Primary topic: ${topic}`,
      `Campaign purpose: ${purpose}`,
      `Target audience: ${targetAudience}`,
      `Language: ${language}`,
      hasReferenceDocs ? `Reference documents attached: ${referenceDocNames.join(', ')}` : '',
      hasReferenceDocs ? 'Use attached PDFs as authoritative context (for example DRHP details, issue size, dates, risks, objects, valuation, peers).' : '',
      hasReferenceDocs ? 'When PDF facts are used, mention them in article context and in FAQ/source attribution.' : '',
      'Write in a neutral newsroom tone similar to professional business news portals.',
      'Do NOT include recommendations, advisory calls, buy/sell/hold language, or investor tips.',
      'Focus on what happened, why it matters, and relevant market context.',
      ipoStructuredMode
        ? 'Because this is IPO/DRHP context, write articleText and articleHtml in this exact section order: Summary, Issue Details and Key Dates, Use of Proceeds / Key Objectives, About the Company, Financial Performance, What the Numbers Show, Strengths, Risks, Peer Positioning, Bottom Line.'
        : '',
      ipoStructuredMode ? ipoFormatInstruction : '',
      ipoStructuredMode
        ? 'Use document data as primary source for dates, issue terms, proceeds, financials, and risks; use web grounding for contextual verification.'
        : '',
      'Return plain text only (no JSON).',
      'After article end, append exactly:',
      'SEO Metadata:',
      '- SEO Title: ...',
      '- Meta Description: ...',
      '- Focus Keywords: ...',
      'FAQ Schema (JSON-LD):',
      '{valid FAQPage JSON-LD with 3-5 FAQs}',
    ].join('\n')
    const promptCompact = [
      'Use Google Search grounding and write a concise, factual Indian market news article.',
      `Topic: ${topic}`,
      hasReferenceDocs ? `Reference documents attached: ${referenceDocNames.join(', ')}` : '',
      hasReferenceDocs ? 'Use document facts as primary context where relevant.' : '',
      'Return plain text only (no JSON).',
      ipoStructuredMode
        ? 'articleText and articleHtml must include all requested IPO sections with bullets and financial table-like data.'
        : 'Write articleText as 4 substantial paragraphs with strong factual detail.',
      ipoStructuredMode ? ipoFormatInstruction : '',
      'Append SEO Metadata and FAQ Schema (JSON-LD) after article body.',
      'No investment recommendations or buy/sell/hold language.',
    ].join('\n')
    const promptAdvisorySafe = [
      'Use Google Search grounding and rewrite as strict business-news copy.',
      `Topic: ${topic}`,
      hasReferenceDocs ? `Reference documents attached: ${referenceDocNames.join(', ')}` : '',
      'Return plain text only.',
      'Hard constraint: do not include ANY advisory words or actions.',
      'Forbidden words/phrases: buy, sell, hold, invest, should investors, strategy, tips, recommendation.',
      ipoStructuredMode
        ? 'For IPO/DRHP context, output the full sectioned report format and keep each bullet factual and source-grounded.'
        : 'Write only factual reporting on what happened, drivers, impact, and near-term implications.',
      ipoStructuredMode ? ipoFormatInstruction : '',
      'Append SEO Metadata and FAQ Schema (JSON-LD) after article body.',
      ipoStructuredMode
        ? 'Include at least 6 issue details bullets, at least 3 strengths, at least 3 risks, and at least 3 peer positioning bullets.'
        : 'Length constraint: 4-6 paragraphs and at least 280 words in articleText.',
    ].join('\n')

    let parsed: any = null
    let responseForSources: any = null
    let lastRaw = ''
    const retryTrace: RetryTrace[] = []
    const startedAt = Date.now()

    const attempts = [
      { name: 'detailed', prompt: promptDetailed, maxOutputTokens: 3072 },
      { name: 'compact', prompt: promptCompact, maxOutputTokens: 2300 },
      { name: 'advisory-safe', prompt: promptAdvisorySafe, maxOutputTokens: 2300 },
    ]

    for (let index = 0; index < attempts.length; index += 1) {
      if (Date.now() - startedAt > MAX_GENERATION_MS) {
        retryTrace.push({
          attempt: index + 1,
          promptVariant: attempts[index].name,
          maxOutputTokens: attempts[index].maxOutputTokens,
          status: 'model-error',
          detail: `Generation time budget exceeded (${MAX_GENERATION_MS}ms).`,
          elapsedMs: Date.now() - startedAt,
        })
        break
      }
      const attempt = attempts[index]
      const attemptStartedAt = Date.now()
      try {
        const response = await ai.models.generateContent({
          model: MODEL,
          contents: [{ role: 'user', parts: [{ text: attempt.prompt }, ...pdfParts] }],
          config: {
            temperature: 0.3,
            maxOutputTokens: attempt.maxOutputTokens,
            tools: [{ googleSearch: {} }],
          },
        })

        const raw = await getGeminiText(response)
        const jsonText = extractJsonObject(raw)
        lastRaw = raw

        try {
          const candidateRaw = parseJsonFlexible(jsonText) ?? parseJsonFlexible(raw)
          const candidate = candidateRaw
            ? coerceArticlePayload(normalizeArticlePayload(candidateRaw))
            : parseRawArticleOutput(raw, topic)
          const cHeadline = String(candidate?.headline || '').trim()
          const cSubheadline = String(candidate?.subheadline || '').trim()
          const cSummary = String(candidate?.summary || '').trim()
          const cArticleText = String(candidate?.articleText || '').trim()
          const cArticleHtml = String(candidate?.articleHtml || '').trim()
          const cBodyForChecks = cArticleText || htmlToText(cArticleHtml)
          const cWordCount = countBodyWords(cBodyForChecks)
          const candidateText = [cHeadline, cSubheadline, cSummary, cArticleText].join(' ')
          const hasBaseFields = Boolean(cHeadline)
          const hasContentFields = Boolean(cArticleText || cArticleHtml || cSummary)
          if (!hasBaseFields || !hasContentFields) {
            retryTrace.push({
              attempt: index + 1,
              promptVariant: attempt.name,
              maxOutputTokens: attempt.maxOutputTokens,
              status: 'missing-fields',
              detail: 'Required fields missing after fallback mapping (headline/summary/articleText).',
              elapsedMs: Date.now() - attemptStartedAt,
            })
            continue
          }
          if (ipoStructuredMode) {
            const hasIpoShape =
              hasAllIpoSections(cArticleText) ||
              hasAllIpoSections(cArticleHtml) ||
              hasAllIpoSections(cBodyForChecks)
            if (!hasIpoShape || cWordCount < 180) {
              retryTrace.push({
                attempt: index + 1,
                promptVariant: attempt.name,
                maxOutputTokens: attempt.maxOutputTokens,
                status: 'missing-fields',
                detail: `IPO structure/length incomplete (sections=${hasIpoShape}, words=${cWordCount}).`,
                elapsedMs: Date.now() - attemptStartedAt,
              })
              continue
            }
          } else if (cWordCount < 120) {
            retryTrace.push({
              attempt: index + 1,
              promptVariant: attempt.name,
              maxOutputTokens: attempt.maxOutputTokens,
              status: 'missing-fields',
              detail: `Article body too short (${cWordCount} words).`,
              elapsedMs: Date.now() - attemptStartedAt,
            })
            continue
          }
          if (hasAdvisoryLanguage(candidateText)) {
            retryTrace.push({
              attempt: index + 1,
              promptVariant: attempt.name,
              maxOutputTokens: attempt.maxOutputTokens,
              status: 'advisory-rejected',
              detail: 'Advisory or recommendation language detected.',
              elapsedMs: Date.now() - attemptStartedAt,
            })
            continue
          }

          retryTrace.push({
            attempt: index + 1,
            promptVariant: attempt.name,
            maxOutputTokens: attempt.maxOutputTokens,
            status: 'success',
            elapsedMs: Date.now() - attemptStartedAt,
          })
          parsed = candidate
          responseForSources = response
          break
        } catch {
          retryTrace.push({
            attempt: index + 1,
            promptVariant: attempt.name,
            maxOutputTokens: attempt.maxOutputTokens,
            status: 'invalid-json',
            detail: 'Model response was not valid JSON for the expected schema.',
            elapsedMs: Date.now() - attemptStartedAt,
          })
          // try next attempt
        }
      } catch (err) {
        retryTrace.push({
          attempt: index + 1,
          promptVariant: attempt.name,
          maxOutputTokens: attempt.maxOutputTokens,
          status: 'model-error',
          detail: err instanceof Error ? err.message : 'Unknown model error',
          elapsedMs: Date.now() - attemptStartedAt,
        })
      }
    }

    if (!parsed && Date.now() - startedAt <= MAX_GENERATION_MS - 30000) {
      const salvageStartedAt = Date.now()
      try {
        const salvagePrompt = [
          'You are writing a complete, factual Indian markets IPO news report.',
          `Topic: ${topic}`,
          hasReferenceDocs ? `Reference documents attached: ${referenceDocNames.join(', ')}` : '',
          hasReferenceDocs ? 'Use attached document facts first, then web grounding for context.' : '',
          'Return plain text only (no JSON).',
          'After article end append SEO Metadata and FAQ Schema (JSON-LD).',
          'Hard constraints:',
          '- No recommendations/advisory language.',
          '- articleText must be complete and not truncated.',
          ipoStructuredMode
            ? '- Include all IPO sections: Summary, Issue Details and Key Dates, Use of Proceeds / Key Objectives, About the Company, Financial Performance, What the Numbers Show, Strengths, Risks, Peer Positioning, Bottom Line.'
            : '- Write 4-6 solid paragraphs with clear market context.'
        ].join('\n')

        const salvageResponse = await ai.models.generateContent({
          model: MODEL,
          contents: [{ role: 'user', parts: [{ text: salvagePrompt }, ...pdfParts] }],
          config: {
            temperature: 0.2,
            maxOutputTokens: 2600,
            tools: [{ googleSearch: {} }],
          },
        })

        const salvageRaw = await getGeminiText(salvageResponse)
        const salvageJson = parseJsonFlexible(salvageRaw)
        const salvageCandidate = salvageJson
          ? coerceArticlePayload(normalizeArticlePayload(salvageJson))
          : parseRawArticleOutput(salvageRaw, topic)
        const sHeadline = String(salvageCandidate?.headline || '').trim()
        const sSummary = String(salvageCandidate?.summary || '').trim()
        const sArticleText = String(salvageCandidate?.articleText || '').trim()
        const sWordCount = countBodyWords(sArticleText)
        const sHasIpoShape = !ipoStructuredMode || hasAllIpoSections(sArticleText)

        if (sHeadline && sSummary && sArticleText && sWordCount >= 140 && sHasIpoShape) {
          retryTrace.push({
            attempt: retryTrace.length + 1,
            promptVariant: 'salvage',
            maxOutputTokens: 2600,
            status: 'success',
            elapsedMs: Date.now() - salvageStartedAt,
          })
          parsed = {
            ...salvageCandidate,
            articleHtml: articleTextToHtml(sArticleText)
          }
          responseForSources = salvageResponse
        } else {
          retryTrace.push({
            attempt: retryTrace.length + 1,
            promptVariant: 'salvage',
            maxOutputTokens: 2600,
            status: 'missing-fields',
            detail: `Salvage output incomplete (words=${sWordCount}, ipoShape=${sHasIpoShape}).`,
            elapsedMs: Date.now() - salvageStartedAt,
          })
        }
      } catch (err) {
        retryTrace.push({
          attempt: retryTrace.length + 1,
          promptVariant: 'salvage',
          maxOutputTokens: 2600,
          status: 'model-error',
          detail: err instanceof Error ? err.message : 'Unknown salvage model error',
          elapsedMs: Date.now() - salvageStartedAt,
        })
      }
    }

    if (!parsed) {
      return NextResponse.json(
        {
          error: 'Failed to parse grounded article response',
          raw: lastRaw?.slice(0, 600) || '',
          retryTrace,
          generationMeta: {
            attempts: attempts.length,
            totalElapsedMs: Date.now() - startedAt,
          },
        },
        { status: 500 }
      )
    }

    let headline = cleanupTextArtifacts(String(parsed?.headline || '').trim())
    let subheadline = cleanupTextArtifacts(String(parsed?.subheadline || '').trim())
    let summary = cleanupTextArtifacts(String(parsed?.summary || '').trim())
    let articleBodyText = cleanupTextArtifacts(String(parsed?.articleText || '').trim())
    let articleBodyHtml = cleanupHtmlArtifacts(String(parsed?.articleHtml || '').trim())

    if (!articleBodyText && articleBodyHtml) {
      articleBodyText = cleanupTextArtifacts(htmlToText(articleBodyHtml))
    }
    if (!articleBodyHtml && articleBodyText) {
      articleBodyHtml = cleanupHtmlArtifacts(articleTextToHtml(articleBodyText))
    }
    if (ipoStructuredMode) {
      articleBodyHtml = normalizeIpoSectionHeadingsToH2(articleBodyHtml)
    }

    if (!headline || isSectionStyleTitle(headline)) {
      const fromHtml = cleanupTextArtifacts(extractHeadlineFromHtml(articleBodyHtml))
      headline = !fromHtml || isSectionStyleTitle(fromHtml)
        ? buildFallbackHeadline(topic)
        : fromHtml
    }
    if (!summary) {
      summary = cleanupTextArtifacts(deriveSummaryFromArticleText(articleBodyText))
    }
    if (!subheadline || isSectionStyleTitle(subheadline)) {
      subheadline = cleanupTextArtifacts(deriveSubheadline(summary, headline))
    }

    const tags = Array.isArray(parsed?.tags)
      ? parsed.tags.map((t: any) => String(t).trim()).filter(Boolean).slice(0, 8)
      : []
    const seoTitle = cleanupTextArtifacts(String(parsed?.seoTitle || headline).trim()).slice(0, 120)
    const metaDescription = cleanupTextArtifacts(String(parsed?.metaDescription || summary).trim())
    const focusKeywords = Array.isArray(parsed?.focusKeywords)
      ? parsed.focusKeywords.map((k: any) => String(k).trim()).filter(Boolean).slice(0, 8)
      : tags.slice(0, 6)
    const faqs: ArticleFaq[] = Array.isArray(parsed?.faqs)
      ? parsed.faqs
          .map((f: any) => ({
            question: cleanupTextArtifacts(String(f?.question || '').trim()),
            answer: cleanupTextArtifacts(String(f?.answer || '').trim()),
          }))
          .filter((f: ArticleFaq) => f.question && f.answer)
          .slice(0, 5)
      : []

    if (!headline || !summary) {
      return NextResponse.json({ error: 'Incomplete article payload from model' }, { status: 500 })
    }

    if (!articleBodyText || !articleBodyHtml) {
      return NextResponse.json({ error: 'Incomplete article body payload from model' }, { status: 500 })
    }

    if (ipoStructuredMode && !hasAllIpoSections(articleBodyText)) {
      articleBodyHtml = normalizeIpoSectionHeadingsToH2(articleTextToHtml(articleBodyText))
    }

    if (ipoStructuredMode && !hasAllIpoSections(articleBodyText)) {
      return NextResponse.json(
        {
          error: 'Generated IPO article did not include required section structure after normalization.',
          retryTrace,
          generationMeta: {
            attempts: retryTrace.length,
            totalElapsedMs: Date.now() - startedAt,
          },
        },
        { status: 500 }
      )
    }

    const fullText = [headline, subheadline, summary, articleBodyText].join(' ')
    if (hasAdvisoryLanguage(fullText)) {
      return NextResponse.json({ error: 'Generated article included advisory language after retries; please try again.' }, { status: 500 })
    }
    const bodyWordCount = countBodyWords(articleBodyText)
    const bodyParagraphCount = countBodyParagraphs(articleBodyText)

    const groundedSources = collectGroundedSources(responseForSources)
    const faqForSchema = faqs.length > 0
      ? faqs
      : [
          {
            question: `What is the latest update on ${topic}?`,
            answer: summary || articleBodyText.split('\n\n')[0] || 'The article covers the latest verified market update and its impact.'
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

    const faqSchema = (parsed?.faqSchema && typeof parsed.faqSchema === 'object')
      ? parsed.faqSchema
      : {
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
      articleText: `${articleBodyText}${sourcesTextBlock}${seoTextBlock}${faqTextBlock}`,
      articleHtml: `${articleBodyHtml}${sourcesHtmlBlock}${seoHtmlBlock}${faqHtmlBlock}`,
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
      retryTrace,
      generationMeta: {
        attempts: retryTrace.length,
        totalElapsedMs: Date.now() - startedAt,
      },
      referenceDocuments: {
        attached: hasReferenceDocs,
        count: pdfParts.length,
        names: referenceDocNames
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
