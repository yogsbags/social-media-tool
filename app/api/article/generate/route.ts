import {
  DeleteObjectCommand,
  GetObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { GoogleGenAI } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MODEL = "gemini-3-flash-preview";
const MAX_GENERATION_MS = 240000;

type GenerateArticleBody = {
  topic?: string;
  purpose?: string;
  targetAudience?: string;
  campaignType?: string;
  language?: string;
  userPrompt?: string;
  seedArticleText?: string;
  generationSeed?: number;
  seedHeadline?: string;
  seedSummary?: string;
  seedSeo?: {
    seoTitle?: string;
    metaDescription?: string;
    focusKeywords?: string[];
  };
  seedFaqSchema?: any;
  researchPdfRefs?: Array<{
    fileId?: string;
    bucket?: string;
    name?: string;
    size?: number;
    url?: string;
  }>;
  researchPDFs?: Array<{ name?: string; data?: string; size?: number }>;
};

type ArticleFaq = {
  question: string;
  answer: string;
};

type RetryTrace = {
  attempt: number;
  promptVariant: string;
  maxOutputTokens: number;
  status:
    | "success"
    | "invalid-json"
    | "missing-fields"
    | "advisory-rejected"
    | "model-error";
  detail?: string;
  elapsedMs: number;
};

function extractJsonObject(input: string): string {
  const trimmed = input.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) return trimmed;

  const codeBlock =
    trimmed.match(/```json\s*([\s\S]*?)\s*```/i)?.[1] ||
    trimmed.match(/```\s*([\s\S]*?)\s*```/)?.[1];
  if (codeBlock) return codeBlock.trim();

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}

function findBalancedJsonSlice(
  input: string,
  opener: "{" | "[",
): string | null {
  const start = input.indexOf(opener);
  if (start < 0) return null;

  const closer = opener === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < input.length; i += 1) {
    const ch = input[i];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === opener) depth += 1;
    if (ch === closer) depth -= 1;
    if (depth === 0) return input.slice(start, i + 1).trim();
  }
  return null;
}

function parseJsonFlexible(raw: string): any | null {
  const variants: string[] = [];
  const pushVariant = (value?: string | null) => {
    const normalized = String(value || "").trim();
    if (!normalized) return;
    if (variants.indexOf(normalized) === -1) variants.push(normalized);
  };
  const trimmed = String(raw || "").trim();
  if (!trimmed) return null;

  pushVariant(trimmed);
  pushVariant(extractJsonObject(trimmed));

  const codeBlock =
    trimmed.match(/```json\s*([\s\S]*?)\s*```/i)?.[1] ||
    trimmed.match(/```\s*([\s\S]*?)\s*```/)?.[1];
  if (codeBlock) pushVariant(codeBlock.trim());

  const balancedObject = findBalancedJsonSlice(trimmed, "{");
  if (balancedObject) pushVariant(balancedObject);
  const balancedArray = findBalancedJsonSlice(trimmed, "[");
  if (balancedArray) pushVariant(balancedArray);

  for (const candidate of variants) {
    const normalized = candidate
      .replace(/\uFEFF/g, "")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2018\u2019]/g, "'")
      .trim();

    const attempts = [normalized, normalized.replace(/,\s*([}\]])/g, "$1")];

    for (const text of attempts) {
      try {
        return JSON.parse(text);
      } catch {
        // try next parse attempt
      }
    }
  }

  // Last-resort extraction for malformed quasi-JSON responses
  const extractField = (input: string, key: string): string => {
    const marker = `"${key}"`;
    const keyPos = input.indexOf(marker);
    if (keyPos < 0) return "";
    const colonPos = input.indexOf(":", keyPos + marker.length);
    if (colonPos < 0) return "";
    let i = colonPos + 1;
    while (i < input.length && /\s/.test(input[i])) i += 1;
    if (input[i] !== '"') return "";
    i += 1;
    let out = "";
    let escaped = false;
    for (; i < input.length; i += 1) {
      const ch = input[i];
      if (escaped) {
        out += ch;
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === '"') break;
      out += ch;
    }
    return out
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t")
      .trim();
  };

  const extracted = {
    headline:
      extractField(trimmed, "headline") ||
      extractField(trimmed, "articleTitle"),
    subheadline: extractField(trimmed, "subheadline"),
    summary: extractField(trimmed, "summary"),
    articleText: extractField(trimmed, "articleText"),
    articleHtml: extractField(trimmed, "articleHtml"),
    seoTitle: extractField(trimmed, "seoTitle"),
    metaDescription: extractField(trimmed, "metaDescription"),
  };

  // Recover malformed payloads where the summary/body key is corrupted but text exists after subheadline.
  if (!extracted.summary && !extracted.articleText && extracted.subheadline) {
    const subheadlineMatch = trimmed.match(
      /"subheadline"\s*:\s*"((?:\\.|[^"\\])*)"/i,
    );
    if (subheadlineMatch && typeof subheadlineMatch.index === "number") {
      const tail = trimmed
        .slice(subheadlineMatch.index + subheadlineMatch[0].length)
        .replace(/^[\s,}]+/, "")
        .replace(/^"[^"]{1,60}/, "")
        .replace(/^[:\s"]+/, "")
        .trim();
      if (tail.length > 120) {
        extracted.articleText = tail;
        extracted.summary = tail.split(/\s+/).slice(0, 70).join(" ").trim();
      }
    }
  }

  if (extracted.articleText || extracted.articleHtml || extracted.headline) {
    return extracted;
  }

  return null;
}

function normalizeArticlePayload(candidate: any): any {
  if (Array.isArray(candidate)) {
    const firstObject = candidate.find(
      (item) => item && typeof item === "object",
    );
    if (firstObject) return normalizeArticlePayload(firstObject);
    return candidate[0];
  }
  if (!candidate || typeof candidate !== "object") return candidate;
  const directHasCore =
    typeof candidate.headline === "string" ||
    typeof candidate.articleText === "string" ||
    typeof candidate.articleHtml === "string";
  if (directHasCore) return candidate;

  const wrapperKeys = [
    "news_report",
    "report",
    "article",
    "data",
    "output",
    "response",
  ];
  for (const key of wrapperKeys) {
    const nested = candidate?.[key];
    if (!nested || typeof nested !== "object") continue;
    const nestedHasCore =
      typeof nested.headline === "string" ||
      typeof nested.articleText === "string" ||
      typeof nested.articleHtml === "string";
    if (nestedHasCore) {
      return {
        ...nested,
        tags: nested.tags ?? candidate.tags,
        seoTitle: nested.seoTitle ?? candidate.seoTitle,
        metaDescription: nested.metaDescription ?? candidate.metaDescription,
        focusKeywords: nested.focusKeywords ?? candidate.focusKeywords,
        faqs: nested.faqs ?? candidate.faqs,
      };
    }
  }

  return candidate;
}

function firstWords(input: string, count: number): string {
  return input.split(/\s+/).filter(Boolean).slice(0, count).join(" ").trim();
}

function clipAtSentenceOrWords(input: string, maxWords: number): string {
  const text = String(input || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";
  const words = text.split(" ").filter(Boolean);
  if (words.length <= maxWords) return text;

  const sentenceMatches = text.match(/[^.!?]+[.!?](?=\s|$)/g) || [];
  if (sentenceMatches.length > 0) {
    const picked: string[] = [];
    let total = 0;
    for (const sentence of sentenceMatches) {
      const wc = sentence.trim().split(/\s+/).filter(Boolean).length;
      if (wc === 0) continue;
      if (picked.length > 0 && total + wc > maxWords) break;
      picked.push(sentence.trim());
      total += wc;
      if (total >= Math.floor(maxWords * 0.75)) break;
    }
    if (picked.length > 0) return picked.join(" ").trim();
  }

  return firstWords(text, maxWords).trim();
}

function normalizeExtractedSummary(input: string): string {
  let text = cleanupTextArtifacts(String(input || "").trim());
  if (!text) return "";

  text = text.replace(/^(?:[\d.,]+%|\₹[\d.,]+|\$[\d.,]+)\.?\s+/i, "").trim();

  const sentences = text.match(/[^.!?]+[.!?](?=\s|$)|[^.!?]+$/g) || [];
  if (sentences.length > 1) {
    const firstSentence = String(sentences[0] || "").trim();
    const firstSentenceWords = firstSentence.split(/\s+/).filter(Boolean);
    const looksLikeDanglingFragment =
      firstSentenceWords.length <= 3 &&
      /[\d%₹$]/.test(firstSentence) &&
      !/[a-z]{3,}/i.test(firstSentence);
    if (looksLikeDanglingFragment) {
      text = sentences.slice(1).join(" ").trim();
    }
  }

  return text;
}

function finalizeSummaryText(input: string): string {
  const text = normalizeExtractedSummary(input);
  if (!text) return "";

  const rawSentences = text.match(/[^.!?]+[.!?](?=\s|$)|[^.!?]+$/g) || [];
  const picked: string[] = [];
  const normalize = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  for (const sentenceRaw of rawSentences) {
    const sentence = cleanupTextArtifacts(sentenceRaw.trim());
    if (!sentence) continue;

    const words = sentence.split(/\s+/).filter(Boolean);
    const isShortNumericFragment =
      words.length <= 5 &&
      /[\d%₹$]/.test(sentence) &&
      !/[a-z]{4,}/i.test(sentence);
    const startsLikeCarryOverFragment =
      /^(?:[\d.,]+%|\₹[\d.,]+|\$[\d.,]+)\s+(?:and|or|but|with|to|of|in|on|for|as|the|a|an)\b/i.test(
        sentence,
      ) || /^[a-z]/.test(sentence);
    if (isShortNumericFragment || startsLikeCarryOverFragment) continue;

    const normalizedSentence = normalize(sentence);
    const isDuplicate = picked.some((prev) => {
      const normalizedPrev = normalize(prev);
      return (
        normalizedSentence === normalizedPrev ||
        normalizedSentence.includes(normalizedPrev) ||
        normalizedPrev.includes(normalizedSentence)
      );
    });
    if (isDuplicate) continue;

    picked.push(sentence);
    if (picked.length >= 3) break;
  }

  return picked.join(" ").trim();
}

function deriveSummaryFromArticleText(articleText: string): string {
  const text = String(articleText || "").trim();
  if (!text) return "";

  const summaryMatch = text.match(
    /(?:^|\n)(?:\d+\.\s*)?Summary:\s*([\s\S]*?)(?:\n(?:\d+\.\s*)?[A-Z][^\n]+|\n\n|$)/i,
  );
  if (summaryMatch?.[1]) {
    return clipAtSentenceOrWords(finalizeSummaryText(summaryMatch[1]), 80);
  }

  const firstParagraph =
    text
      .split(/\n\n+/)
      .map((p) => p.trim())
      .find(Boolean) || "";
  return clipAtSentenceOrWords(finalizeSummaryText(firstParagraph), 80);
}

function deriveSubheadline(summary: string, headline: string): string {
  const fromSummary = clipAtSentenceOrWords(String(summary || "").trim(), 22);
  if (fromSummary) return fromSummary;
  const fromHeadline = clipAtSentenceOrWords(String(headline || "").trim(), 14);
  return fromHeadline ? `${fromHeadline}.` : "";
}

function articleTextToHtml(articleText: string): string {
  const normalizeMarkdownLine = (line: string) =>
    line
      .replace(/^#{1,6}\s*/, "")
      .replace(/^\s*\*\*(.*?)\*\*\s*$/g, "$1")
      .replace(/^\s*__(.*?)__\s*$/g, "$1")
      .trim();

  const lines = String(articleText || "")
    .split("\n")
    .map((line) => normalizeMarkdownLine(line))
    .filter(Boolean);

  if (lines.length === 0) return "";

  const headingMatchers: Array<{ pattern: RegExp; label: string }> = [
    { pattern: /^(?:\d+\.\s*)?summary\b\s*:?\s*/i, label: "Summary" },
    { pattern: /^(?:\d+\.\s*)?market overview\b\s*:?\s*/i, label: "Market Overview" },
    { pattern: /^(?:\d+\.\s*)?key movers\b\s*:?\s*/i, label: "Key Movers" },
    { pattern: /^(?:\d+\.\s*)?drivers and context\b\s*:?\s*/i, label: "Drivers and Context" },
    { pattern: /^(?:\d+\.\s*)?broader market and outlook\b\s*:?\s*/i, label: "Broader Market and Outlook" },
    {
      pattern:
        /^(?:\d+\.\s*)?issue details(?:\s+and\s+key\s+dates)?\b\s*:?\s*/i,
      label: "Issue Details and Key Dates",
    },
    {
      pattern:
        /^(?:\d+\.\s*)?use of proceeds(?:\s*\/\s*key objectives?|(?:\s+and\s+key objectives?))?\b\s*:?\s*/i,
      label: "Use of Proceeds / Key Objectives",
    },
    {
      pattern: /^(?:\d+\.\s*)?about the company\b\s*:?\s*/i,
      label: "About the Company",
    },
    {
      pattern: /^(?:\d+\.\s*)?financial performance\b\s*:?\s*/i,
      label: "Financial Performance",
    },
    {
      pattern: /^(?:\d+\.\s*)?what the numbers show\b\s*:?\s*/i,
      label: "What the Numbers Show",
    },
    { pattern: /^(?:\d+\.\s*)?strengths?\b\s*:?\s*/i, label: "Strengths" },
    { pattern: /^(?:\d+\.\s*)?risks?\b\s*:?\s*/i, label: "Risks" },
    {
      pattern: /^(?:\d+\.\s*)?peer positioning\b\s*:?\s*/i,
      label: "Peer Positioning",
    },
    { pattern: /^(?:\d+\.\s*)?bottom line\b\s*:?\s*/i, label: "Bottom Line" },
  ];

  const splitTableCells = (line: string): string[] => {
    const cleaned = line.trim().replace(/^\|/, "").replace(/\|$/, "");
    return cleaned.split("|").map((c) => c.trim());
  };
  const isAlignmentRow = (line: string): boolean => {
    const t = line
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .replace(/\s+/g, "");
    return /^:?-{2,}:?(?:\|:?-{2,}:?)*$/.test(t);
  };

  const blocks: string[] = [];
  let inList = false;
  const closeList = () => {
    if (!inList) return;
    blocks.push("</ul>");
    inList = false;
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    let matched = false;
    for (const matcher of headingMatchers) {
      if (!matcher.pattern.test(line)) continue;
      closeList();
      const trailing = line.replace(matcher.pattern, "").trim();
      blocks.push(`<h2>${escapeHtml(matcher.label)}</h2>`);
      if (trailing) blocks.push(`<p>${escapeHtml(trailing)}</p>`);
      matched = true;
      break;
    }
    if (matched) {
      i += 1;
      continue;
    }

    // Markdown table support: header row + alignment row + body rows
    const next = lines[i + 1] || "";
    if (line.includes("|") && next && isAlignmentRow(next)) {
      closeList();
      const header = splitTableCells(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].includes("|")) {
        rows.push(splitTableCells(lines[i]));
        i += 1;
      }
      const thead = `<thead><tr>${header.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>`;
      const tbody = `<tbody>${rows.map((row) => `<tr>${row.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`).join("")}</tbody>`;
      blocks.push(`<table>${thead}${tbody}</table>`);
      continue;
    }

    const bullet = line.match(/^[-*]\s+(.*)$/);
    if (bullet) {
      if (!inList) {
        blocks.push("<ul>");
        inList = true;
      }
      blocks.push(`<li>${escapeHtml(bullet[1].trim())}</li>`);
      i += 1;
      continue;
    }

    closeList();
    blocks.push(`<p>${escapeHtml(line)}</p>`);
    i += 1;
  }

  closeList();

  return blocks.join("");
}

function htmlToText(html: string): string {
  const text = String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(
      /<\/(p|div|h1|h2|h3|h4|h5|h6|li|tr|table|section|article)>/gi,
      "\n",
    )
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  return text;
}

function extractHeadlineFromHtml(html: string): string {
  const match = String(html || "").match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i);
  if (!match?.[1]) return "";
  return match[1]
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function coerceArticlePayload(candidate: any): any {
  if (!candidate || typeof candidate !== "object") return candidate;

  const stringValues = Object.values(candidate)
    .filter((v) => typeof v === "string")
    .map((v) => String(v).trim())
    .filter((v) => v.length >= 80);
  const longestTextValue =
    stringValues.sort((a, b) => b.length - a.length)[0] || "";

  const articleHtmlRaw = String(candidate.articleHtml || "").trim();
  const articleTextRaw = String(
    candidate.articleText ||
      candidate.body ||
      candidate.content ||
      longestTextValue ||
      "",
  ).trim();
  const articleText = articleTextRaw || htmlToText(articleHtmlRaw);

  const headline = String(
    candidate.headline ||
      candidate.articleTitle ||
      candidate.title ||
      extractHeadlineFromHtml(articleHtmlRaw) ||
      "",
  ).trim();

  const summary = String(
    candidate.summary ||
      candidate.articleSummary ||
      (articleText ? firstWords(articleText, 80) : "") ||
      deriveSummaryFromArticleText(articleText) ||
      "",
  ).trim();

  const subheadline = String(
    candidate.subheadline ||
      candidate.articleSubtitle ||
      deriveSubheadline(summary, headline) ||
      "",
  ).trim();

  const articleHtml = articleHtmlRaw || articleTextToHtml(articleText);

  return {
    ...candidate,
    headline,
    subheadline,
    summary,
    articleText,
    articleHtml,
  };
}

function hasAdvisoryLanguage(text: string): boolean {
  const t = text.toLowerCase();
  const advisory = [
    /\b(buy|sell|hold|invest|accumulate|book profits?)\b/,
    /\b(should you|what should investors|our recommendation|recommend(ed|ation)?)\b/,
    /\b(strategy|strategies|tips?|how to profit|trading call)\b/,
  ];
  return advisory.some((pattern) => pattern.test(t));
}

function countBodyWords(text: string): number {
  return text
    .replace(/\nSources:[\s\S]*$/i, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function countBodyParagraphs(text: string): number {
  return text
    .replace(/\nSources:[\s\S]*$/i, "")
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean).length;
}

function lengthQuality(
  words: number,
  paragraphs: number,
): "strong" | "medium" | "short" {
  if (words >= 280 && paragraphs >= 4) return "strong";
  if (words >= 180 && paragraphs >= 3) return "medium";
  return "short";
}

function toSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function cleanupTextArtifacts(input: string): string {
  const text = String(input || "");
  if (!text) return "";
  return text
    .replace(/\r/g, "")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, " ")
    .replace(/(^|\n)\s*n(?=[A-Z])/g, "$1")
    .replace(/nn(?=\d+\.\s)/g, "\n\n")
    .replace(/n(?=\d+\.\s)/g, "\n")
    .replace(/n-\s/g, "\n- ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function cleanupHtmlArtifacts(input: string): string {
  const html = String(input || "");
  if (!html) return "";
  return html
    .replace(/\r/g, "")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, " ")
    .replace(/>n(?=[A-Z])/g, ">")
    .trim();
}

function normalizeIpoSectionHeadingsToH2(html: string): string {
  const sectionPattern =
    "(?:summary|issue details and key dates|gmp and grey market premium|grey market premium|gray market premium|gmp|use of proceeds \\/ key objectives|about the company|financial performance|what the numbers show|strengths|risks|peer positioning|bottom line)";
  return String(html || "").replace(
    new RegExp(
      `<h[1-6]([^>]*)>\\s*(?:\\d+\\.\\s*)?(${sectionPattern})\\s*:?\\s*<\\/h[1-6]>`,
      "gi",
    ),
    "<h2$1>$2</h2>",
  );
}

function isSectionStyleTitle(text: string): boolean {
  const t = String(text || "")
    .trim()
    .toLowerCase();
  return /^(?:\d+\.\s*)?(summary|market overview|key movers|drivers and context|broader market and outlook|issue details and key dates|gmp and grey market premium|grey market premium|gray market premium|gmp|use of proceeds \/ key objectives|about the company|financial performance|what the numbers show|strengths|risks|peer positioning|bottom line)\s*:?$/.test(
    t,
  );
}

function toTitleCase(input: string): string {
  return String(input || "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
    .trim();
}

function buildFallbackHeadline(topic: string): string {
  const base = toTitleCase(
    String(topic || "")
      .replace(/[^\w\s-]/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
  return base ? `${base}: Key Market Update` : "Indian Markets Live Update";
}

function stripMarkdownDelimiters(input: string): string {
  return String(input || "")
    .replace(/\*\*/g, "")
    .replace(/__/g, "")
    .replace(/`/g, "")
    .trim();
}

function stripCodeFences(text: string): string {
  const t = String(text || "").trim();
  const m = t.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  return m?.[1]?.trim() || t;
}

function extractBracketedJson(text: string): string {
  const s = String(text || "");
  const start = s.indexOf("{");
  if (start < 0) return "";
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < s.length; i += 1) {
    const ch = s[i];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") depth += 1;
    if (ch === "}") depth -= 1;
    if (depth === 0) return s.slice(start, i + 1);
  }
  return "";
}

function normalizeLineForCompare(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dropRepeatedLeadingHeadlineLines(
  articleText: string,
  headline: string,
): string {
  const lines = String(articleText || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return "";

  const headlineNorm = normalizeLineForCompare(headline);
  if (!headlineNorm) return lines.join("\n");

  let idx = 0;
  while (
    idx < lines.length &&
    normalizeLineForCompare(lines[idx]) === headlineNorm
  )
    idx += 1;
  return (idx > 0 ? lines.slice(idx) : lines).join("\n").trim();
}

function dropLeadingMetaEchoes(
  articleText: string,
  subheadline: string,
  summary: string,
): string {
  const norm = (v: string) =>
    String(v || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const subNorm = norm(subheadline);
  const sumNorm = norm(summary);
  const lines = String(articleText || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  let i = 0;
  while (i < lines.length) {
    const ln = norm(lines[i]);
    const isSubEcho =
      subNorm &&
      (ln === subNorm || ln.includes(subNorm) || subNorm.includes(ln));
    const isSumEcho =
      sumNorm &&
      (ln === sumNorm || ln.includes(sumNorm) || sumNorm.includes(ln));
    if (!isSubEcho && !isSumEcho) break;
    i += 1;
  }

  const trimmed = lines.slice(i).join("\n").trim();
  if (!trimmed) return trimmed;

  // Also trim first paragraph if it's largely a repeat of summary.
  const blocks = trimmed
    .split(/\n\n+/)
    .map((b) => b.trim())
    .filter(Boolean);
  if (blocks.length === 0) return trimmed;
  const firstNorm = norm(blocks[0]);
  const sumPrefix = sumNorm.slice(0, Math.min(sumNorm.length, 180));
  if (
    sumPrefix &&
    firstNorm.length > 80 &&
    (firstNorm.includes(sumPrefix) || sumNorm.includes(firstNorm))
  ) {
    blocks.shift();
  }
  return blocks.join("\n\n").trim();
}

function tokenOverlapRatio(a: string, b: string): number {
  const norm = (v: string) =>
    String(v || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const ta = new Set(
    norm(a)
      .split(" ")
      .filter((t) => t.length > 2),
  );
  const tb = new Set(
    norm(b)
      .split(" ")
      .filter((t) => t.length > 2),
  );
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  Array.from(ta).forEach((t) => {
    if (tb.has(t)) inter += 1;
  });
  return inter / Math.max(ta.size, tb.size);
}

function sanitizeFaqSchemaObject(input: any): any | null {
  if (!input || typeof input !== "object") return null;
  const entities = Array.isArray(input.mainEntity) ? input.mainEntity : [];
  const normalized = entities
    .map((item: any) => {
      const name = cleanupTextArtifacts(String(item?.name || "").trim());
      const answer = cleanupTextArtifacts(
        String(item?.acceptedAnswer?.text || "").trim(),
      );
      if (!name || !answer) return null;
      return {
        "@type": "Question",
        name,
        acceptedAnswer: {
          "@type": "Answer",
          text: answer,
        },
      };
    })
    .filter(Boolean)
    .slice(0, 5);

  if (normalized.length === 0) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: normalized,
  };
}

function parseRawArticleOutput(raw: string, topic: string): any {
  const text = cleanupTextArtifacts(stripCodeFences(raw));
  const seoIdx = text.search(/\nSEO Metadata:/i);
  const faqIdx = text.search(/\nFAQ Schema \(JSON-LD\):/i);
  const splitIdx = seoIdx >= 0 ? seoIdx : faqIdx >= 0 ? faqIdx : text.length;
  const normalizeLine = (line: string) =>
    line
      .replace(/^#{1,6}\s*/, "")
      .replace(/^\s*\*\*(.*?)\*\*\s*$/g, "$1")
      .replace(/^\s*__(.*?)__\s*$/g, "$1")
      .trim();
  const dedupeConsecutiveBlocks = (input: string) => {
    const blocks = input
      .split(/\n\n+/)
      .map((b) => b.trim())
      .filter(Boolean);
    const out: string[] = [];
    const norm = (v: string) => v.replace(/\s+/g, " ").toLowerCase();
    for (const block of blocks) {
      const prev = out[out.length - 1];
      if (prev && norm(prev) === norm(block)) continue;
      out.push(block);
    }
    return out.join("\n\n");
  };
  const dedupeNearDuplicateBlocks = (input: string) => {
    const blocks = input
      .split(/\n\n+/)
      .map((b) => b.trim())
      .filter(Boolean);

    const normalize = (v: string) =>
      v
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    const tokenSet = (v: string) =>
      new Set(
        normalize(v)
          .split(" ")
          .filter((t) => t.length > 2),
      );
    const overlap = (a: Set<string>, b: Set<string>) => {
      if (a.size === 0 || b.size === 0) return 0;
      let inter = 0;
      Array.from(a).forEach((t) => {
        if (b.has(t)) inter += 1;
      });
      return inter / Math.max(a.size, b.size);
    };
    const firstSentence = (v: string) => {
      const m = v.match(/^[\s\S]{0,450}?[.!?](?:\s|$)/);
      return normalize((m?.[0] || v).slice(0, 260));
    };

    const out: string[] = [];
    const outSets: Array<Set<string>> = [];
    const outFirstSentences: string[] = [];
    for (const block of blocks) {
      const n = normalize(block);
      const set = tokenSet(block);
      const fs = firstSentence(block);
      let dup = false;
      for (let i = 0; i < out.length; i += 1) {
        const m = normalize(out[i]);
        const longer = n.length >= m.length ? n : m;
        const shorter = n.length >= m.length ? m : n;
        const prefixLen = Math.min(
          Math.max(80, Math.floor(shorter.length * 0.6)),
          180,
        );
        const prefixContains =
          shorter.length >= 70 && longer.includes(shorter.slice(0, prefixLen));
        const highOverlap = overlap(set, outSets[i]) >= 0.82;
        const firstSentenceEcho =
          fs.length >= 50 &&
          outFirstSentences[i].length >= 50 &&
          (fs === outFirstSentences[i] ||
            fs.includes(outFirstSentences[i]) ||
            outFirstSentences[i].includes(fs));

        if (prefixContains || highOverlap || firstSentenceEcho) {
          dup = true;
          break;
        }
      }
      if (!dup) {
        out.push(block);
        outSets.push(set);
        outFirstSentences.push(fs);
      }
    }
    return out.join("\n\n");
  };

  const articleTextPrepared = text
    .slice(0, splitIdx)
    // Ensure numbered section headings start on new lines
    .replace(
      /\s+(?=\d+\.\s+(Summary|Issue Details|Use of Proceeds|About the Company|Financial Performance|What the Numbers Show|Strengths|Risks|Peer Positioning|Bottom Line)\b)/gi,
      "\n",
    )
    .split("\n")
    .map((line) => normalizeLine(stripMarkdownDelimiters(line)))
    .join("\n");

  const articleText = dedupeNearDuplicateBlocks(
    dedupeConsecutiveBlocks(articleTextPrepared),
  ).trim();
  const tail = text.slice(splitIdx);
  const articleBlocks = articleText
    .split(/\n\n+/)
    .map((block) =>
      block
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .join(" ")
        .trim(),
    )
    .filter(Boolean);

  const allLines = articleText.split("\n").map((l) => l.trim());
  const labelled = {
    headline: "",
    subheadline: "",
    summary: "",
    intro: "",
  };
  const bodyLines: string[] = [];
  for (const line of allLines) {
    if (!line) continue;
    const h = line.match(/^headline:\s*(.+)$/i);
    if (h?.[1]) {
      labelled.headline = labelled.headline || h[1].trim();
      continue;
    }
    const sh = line.match(/^subheadline:\s*(.+)$/i);
    if (sh?.[1]) {
      labelled.subheadline = labelled.subheadline || sh[1].trim();
      continue;
    }
    const sm = line.match(/^summary:\s*(.+)$/i);
    if (sm?.[1]) {
      labelled.summary = labelled.summary || sm[1].trim();
      continue;
    }
    const intro = line.match(/^intro:\s*(.+)$/i);
    if (intro?.[1]) {
      labelled.intro = labelled.intro || intro[1].trim();
      bodyLines.push(intro[1].trim());
      continue;
    }
    bodyLines.push(line);
  }
  const cleanedArticleText = bodyLines.join("\n").trim();
  const sectionHeadingPattern =
    /^(?:\d+\.\s*)?(summary|market overview|key movers|drivers and context|broader market and outlook|issue details and key dates|gmp and grey market premium|grey market premium|gray market premium|gmp|use of proceeds \/ key objectives|about the company|financial performance|what the numbers show|strengths|risks|peer positioning|bottom line)\s*:?$/i;

  const firstLine =
    cleanedArticleText
      .split("\n")
      .map((l) => l.trim())
      .find(Boolean) || "";
  const firstLineCanonical = normalizeLine(stripMarkdownDelimiters(firstLine));
  const firstLineLooksLikeKey =
    /^(headline|subheadline|summary|articletext|articlehtml)\b[:"]?/i.test(
      firstLineCanonical,
    ) ||
    firstLineCanonical.includes("{") ||
    firstLineCanonical.includes('"');
  const firstLineLooksLikeHeadline =
    firstLineCanonical.length >= 20 &&
    firstLineCanonical.length <= 120 &&
    !/[.!?]$/.test(firstLineCanonical);
  const headlineMatch = text.match(/^Headline:\s*(.+)$/im);
  const headline = cleanupTextArtifacts(
    stripMarkdownDelimiters(
      labelled.headline ||
        headlineMatch?.[1] ||
        (!firstLineLooksLikeKey &&
        firstLineLooksLikeHeadline &&
        !/^(?:\d+\.\s*)?(summary|issue details|use of proceeds|about the company|financial performance)\b/i.test(
          firstLineCanonical,
        )
          ? firstLineCanonical
          : "") ||
        buildFallbackHeadline(topic),
    ),
  );
  const articleBodyText = dropRepeatedLeadingHeadlineLines(
    cleanedArticleText,
    headline,
  );
  const fallbackSummaryBlock = articleBlocks.find((block, index) => {
    if (index === 0) return false;
    const normalizedBlock = normalizeLine(stripMarkdownDelimiters(block));
    if (!normalizedBlock) return false;
    if (sectionHeadingPattern.test(normalizedBlock)) return false;
    if (/^(headline|summary|intro)\s*:/i.test(normalizedBlock)) return false;
    return /[.!?]$/.test(normalizedBlock);
  });
  const summary = cleanupTextArtifacts(
    stripMarkdownDelimiters(
      finalizeSummaryText(labelled.summary) ||
        finalizeSummaryText(fallbackSummaryBlock || "") ||
        deriveSummaryFromArticleText(articleBodyText),
    ),
  );
  const subheadline = "";
  const articleBodyNoMetaEcho = dropLeadingMetaEchoes(
    articleBodyText,
    subheadline,
    summary,
  );

  const seoTitle = cleanupTextArtifacts(
    stripMarkdownDelimiters(tail.match(/SEO Title:\s*(.+)/i)?.[1] || headline),
  );
  const metaDescriptionRaw = cleanupTextArtifacts(
    stripMarkdownDelimiters(
      tail.match(/Meta Description:\s*(.+)/i)?.[1] || summary,
    ),
  );
  const metaDescription = isSchemaLikeBody(metaDescriptionRaw)
    ? summary
    : metaDescriptionRaw;
  const focusKeywordsRaw = cleanupTextArtifacts(
    stripMarkdownDelimiters(tail.match(/Focus Keywords:\s*(.+)/i)?.[1] || ""),
  );
  const focusKeywords = focusKeywordsRaw
    ? focusKeywordsRaw
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean)
        .slice(0, 8)
    : [];

  let faqSchema: any = null;
  const faqBlock = faqIdx >= 0 ? text.slice(faqIdx) : "";
  const faqJson = extractBracketedJson(faqBlock);
  if (faqJson) {
    try {
      faqSchema = JSON.parse(faqJson);
    } catch {
      faqSchema = null;
    }
  }
  faqSchema = sanitizeFaqSchemaObject(faqSchema);
  const faqs: ArticleFaq[] = Array.isArray(faqSchema?.mainEntity)
    ? faqSchema.mainEntity
        .map((item: any) => ({
          question: cleanupTextArtifacts(
            stripMarkdownDelimiters(String(item?.name || "").trim()),
          ),
          answer: cleanupTextArtifacts(
            stripMarkdownDelimiters(
              String(item?.acceptedAnswer?.text || "").trim(),
            ),
          ),
        }))
        .filter((f: ArticleFaq) => f.question && f.answer)
        .slice(0, 5)
    : [];

  return {
    headline,
    subheadline,
    summary,
    articleText: articleBodyNoMetaEcho || articleBodyText,
    articleHtml: articleTextToHtml(articleBodyNoMetaEcho || articleBodyText),
    seoTitle,
    metaDescription,
    focusKeywords,
    faqs,
    faqSchema,
  };
}

function isSchemaLikeBody(text: string): boolean {
  const t = String(text || "").trim();
  if (!t) return true;

  const head = t.slice(0, 700);
  if (
    (/^\s*[\[{]/.test(head) && /"@type"\s*:\s*"FAQPage"/i.test(head)) ||
    /"@context"\s*:\s*"https:\/\/schema\.org"/i.test(head)
  ) {
    return true;
  }

  const jsonSignals = (
    t.match(
      /"@context"|"@type"|"mainEntity"|"acceptedAnswer"|"Question"|"Answer"|[{}[\]]/g,
    ) || []
  ).length;
  const sentenceSignals = (t.match(/[.!?](\s|$)/g) || []).length;
  return jsonSignals >= 20 && sentenceSignals <= 4;
}

async function getGeminiText(response: any): Promise<string> {
  if (!response) return "";
  try {
    if (typeof response.text === "function") {
      const maybe = response.text();
      if (maybe && typeof maybe.then === "function") return await maybe;
      return maybe || "";
    }
  } catch {
    // ignore and continue
  }

  if (typeof response.text === "string") return response.text;
  const parts = response?.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) {
    return parts
      .map((p: any) => (typeof p?.text === "string" ? p.text : ""))
      .filter(Boolean)
      .join("");
  }
  return "";
}

function collectGroundedSources(
  response: any,
): Array<{ title: string; url: string }> {
  const chunks = response?.candidates?.[0]?.groundingMetadata?.groundingChunks;
  if (!Array.isArray(chunks)) return [];

  const seen = new Set<string>();
  const sources: Array<{ title: string; url: string }> = [];

  const isValidHttpUrl = (value: string): boolean => {
    try {
      const parsed = new URL(value);
      return (
        (parsed.protocol === "http:" || parsed.protocol === "https:") &&
        Boolean(parsed.hostname)
      );
    } catch {
      return false;
    }
  };

  for (const chunk of chunks) {
    const web = chunk?.web;
    const rawUrl = String(web?.uri || "").trim();
    if (!rawUrl || !isValidHttpUrl(rawUrl) || seen.has(rawUrl)) continue;
    seen.add(rawUrl);
    sources.push({
      title: String(web?.title || "Source").trim() || "Source",
      url: rawUrl,
    });
    if (sources.length >= 8) break;
  }
  return sources;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeBase64Data(data?: string): string {
  if (!data) return "";
  const m = data.match(/^data:.*?;base64,(.*)$/);
  return (m ? m[1] : data).trim();
}

function buildPdfParts(
  pdfs: Array<{ name?: string; data?: string; size?: number }> | undefined,
) {
  if (!Array.isArray(pdfs) || pdfs.length === 0) return [];
  const MAX_FILES = 2;
  const MAX_BYTES_PER_FILE = 20 * 1024 * 1024; // 20MB safety for inline payloads

  return pdfs
    .slice(0, MAX_FILES)
    .map((pdf) => {
      const base64 = normalizeBase64Data(pdf.data);
      if (!base64) return null;
      if (typeof pdf.size === "number" && pdf.size > MAX_BYTES_PER_FILE)
        return null;
      return {
        inlineData: {
          mimeType: "application/pdf",
          data: base64,
        },
      };
    })
    .filter(Boolean) as Array<{
    inlineData: { mimeType: string; data: string };
  }>;
}

function buildR2Client(): S3Client | null {
  const accessKeyId = process.env.R2_ACCESS_KEY_ID || "";
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || "";
  const endpoint = process.env.R2_ENDPOINT || "";
  if (!accessKeyId || !secretAccessKey || !endpoint) return null;

  return new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });
}

async function buildPdfPartsFromRefs(
  refs:
    | Array<{
        fileId?: string;
        bucket?: string;
        name?: string;
        size?: number;
        url?: string;
      }>
    | undefined,
): Promise<Array<{ inlineData: { mimeType: string; data: string } }>> {
  if (!Array.isArray(refs) || refs.length === 0) return [];
  const client = buildR2Client();
  const MAX_FILES = 2;
  const MAX_BYTES_PER_FILE = 50 * 1024 * 1024;
  const parts: Array<{ inlineData: { mimeType: string; data: string } }> = [];

  for (const ref of refs.slice(0, MAX_FILES)) {
    try {
      if (typeof ref.size === "number" && ref.size > MAX_BYTES_PER_FILE)
        continue;

      let bytes: Uint8Array | null = null;
      if (ref.url) {
        const resp = await fetch(ref.url);
        if (!resp.ok) continue;
        bytes = new Uint8Array(await resp.arrayBuffer());
      } else if (client && ref.fileId && ref.bucket) {
        const out = await client.send(
          new GetObjectCommand({
            Bucket: ref.bucket,
            Key: ref.fileId,
          }),
        );
        if (!out.Body) continue;
        bytes = await out.Body.transformToByteArray();
      }

      if (
        !bytes ||
        bytes.byteLength === 0 ||
        bytes.byteLength > MAX_BYTES_PER_FILE
      )
        continue;
      parts.push({
        inlineData: {
          mimeType: "application/pdf",
          data: Buffer.from(bytes).toString("base64"),
        },
      });
    } catch {
      // ignore bad ref and continue
    }
  }
  return parts;
}

async function cleanupR2Refs(
  refs:
    | Array<{
        fileId?: string;
        bucket?: string;
        name?: string;
        size?: number;
        url?: string;
      }>
    | undefined,
): Promise<void> {
  const enabled =
    String(process.env.R2_DELETE_AFTER_USE || "true").toLowerCase() !== "false";
  if (!enabled) return;
  if (!Array.isArray(refs) || refs.length === 0) return;

  const client = buildR2Client();
  if (!client) return;

  for (const ref of refs) {
    const bucket = String(ref?.bucket || "").trim();
    const key = String(ref?.fileId || "").trim();
    if (!bucket || !key) continue;
    if (!key.startsWith("research-pdfs/")) continue;
    try {
      await client.send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: key,
        }),
      );
    } catch (error) {
      console.warn("Failed to delete R2 reference PDF:", {
        bucket,
        key,
        error,
      });
    }
  }
}

function isIpoTopic(topic: string): boolean {
  return /\b(ipo|drhp|rhp|red herring|sme issue|book built issue)\b/i.test(
    topic || "",
  );
}

function hasAllIpoSections(text: string): boolean {
  const t = String(text || "")
    .toLowerCase()
    .replace(/<[^>]+>/g, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const checks: RegExp[] = [
    /\bsummary\b/,
    /\bissue\s+details\b.*\bkey\s+dates\b|\bissue\s+details\b|\bkey\s+dates\b/,
    /\bgmp\b|\bgrey\s+market\s+premium\b|\bgray\s+market\s+premium\b/,
    /\buse\s+of\s+proceeds\b|\bkey\s+objectives?\b|\bobjects?\s+of\s+the\s+issue\b/,
    /\babout\s+the\s+company\b|\bcompany\s+profile\b|\bcompany\s+overview\b/,
    /\bfinancial\s+performance\b|\bfinancials?\b/,
    /\bwhat\s+the\s+numbers\s+show\b|\bkey\s+financial\s+highlights\b/,
    /\bstrengths?\b/,
    /\brisks?\b|\brisk\s+factors?\b/,
    /\bpeer\s+positioning\b|\bpeer\s+comparison\b|\bcompetitive\s+position\b/,
    /\bbottom\s+line\b|\bconclusion\b|\boutlook\b/,
  ];
  return checks.every((pattern) => pattern.test(t));
}

function stripGeneratedTailBlocks(text: string): string {
  const raw = String(text || "");
  if (!raw) return "";
  const markers = [
    "\n\nSources:",
    "\n\nSEO Metadata:",
    "\n\nFAQ Schema (JSON-LD):",
  ];
  let cut = raw.length;
  for (const marker of markers) {
    const idx = raw.indexOf(marker);
    if (idx >= 0 && idx < cut) cut = idx;
  }
  return raw.slice(0, cut).trim();
}

function parseRefinementBlocks(raw: string): {
  headline: string;
  summary: string;
  body: string;
} {
  const text = cleanupTextArtifacts(stripCodeFences(raw));
  const extract = (label: string, next: string[]): string => {
    const startRegex = new RegExp(`(?:^|\\n)${label}\\s*:\\s*`, "i");
    const startMatch = text.match(startRegex);
    if (!startMatch || typeof startMatch.index !== "number") return "";
    const start = startMatch.index + startMatch[0].length;
    let end = text.length;
    for (const n of next) {
      const nextRegex = new RegExp(`(?:^|\\n)${n}\\s*:`, "ig");
      nextRegex.lastIndex = start;
      const nm = nextRegex.exec(text);
      if (nm && typeof nm.index === "number" && nm.index < end) end = nm.index;
    }
    return cleanupTextArtifacts(text.slice(start, end).trim());
  };

  const headline = extract("HEADLINE", ["SUMMARY", "BODY"]);
  const summary = extract("SUMMARY", ["BODY"]);
  const body = extract("BODY", []);
  return { headline, summary, body };
}

function wantsHeadlineChange(userPrompt: string): boolean {
  const t = String(userPrompt || "").toLowerCase();
  return /\b(change|update|rewrite|modify|replace|new)\b[\s\S]{0,30}\b(headline|title)\b|\b(headline|title)\b[\s\S]{0,30}\b(change|update|rewrite|modify|replace|new)\b/.test(
    t,
  );
}

function wantsSummaryChange(userPrompt: string): boolean {
  const t = String(userPrompt || "").toLowerCase();
  return /\b(change|update|rewrite|modify|replace|new|improve|add|append|insert|expand|extend)\b[\s\S]{0,40}\b(summary)\b|\bsummary\b[\s\S]{0,40}\b(change|update|rewrite|modify|replace|new|improve|add|append|insert|expand|extend|line)\b/.test(
    t,
  );
}

function wantsSeoChange(userPrompt: string): boolean {
  const t = String(userPrompt || "").toLowerCase();
  return /\bseo\b|\bmeta description\b|\bseo title\b|\bfocus keywords?\b/.test(
    t,
  );
}

function wantsFaqChange(userPrompt: string): boolean {
  const t = String(userPrompt || "").toLowerCase();
  return /\bfaq\b|\bschema\b|\bjson-ld\b/.test(t);
}

function normalizeForMatch(text: string): string {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function POST(request: NextRequest) {
  let refsToCleanup: Array<{
    fileId?: string;
    bucket?: string;
    name?: string;
    size?: number;
    url?: string;
  }> = [];
  try {
    const geminiApiKey = process.env.GEMINI_API_KEY || "";
    if (!geminiApiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY is not set" },
        { status: 500 },
      );
    }

    const body: GenerateArticleBody = await request.json();
    refsToCleanup = Array.isArray(body.researchPdfRefs)
      ? body.researchPdfRefs
      : [];
    const topic = (body.topic || "").trim();
    if (!topic) {
      return NextResponse.json({ error: "Topic is required" }, { status: 400 });
    }

    const ai = new GoogleGenAI({ apiKey: geminiApiKey });
    const language = body.language || "english";
    const purpose = body.purpose || "brand-awareness";
    const targetAudience = body.targetAudience || "all_clients";
    const userPrompt = String(body.userPrompt || "").trim();
    const seedArticleText = String(body.seedArticleText || "").trim();
    const seedHeadline = cleanupTextArtifacts(
      String(body.seedHeadline || "").trim(),
    );
    const seedSummary = cleanupTextArtifacts(
      String(body.seedSummary || "").trim(),
    );
    const seedSeo =
      body.seedSeo && typeof body.seedSeo === "object" ? body.seedSeo : null;
    const seedFaqSchema =
      body.seedFaqSchema && typeof body.seedFaqSchema === "object"
        ? body.seedFaqSchema
        : null;
    const isRefinementRun = userPrompt.length > 0;
    const allowHeadlineChange =
      !isRefinementRun || wantsHeadlineChange(userPrompt);
    const allowSummaryChange =
      !isRefinementRun || wantsSummaryChange(userPrompt);
    const allowSeoChange = !isRefinementRun || wantsSeoChange(userPrompt);
    const allowFaqChange = !isRefinementRun || wantsFaqChange(userPrompt);
    const incomingSeed = Number(body.generationSeed);
    const resolvedSeed =
      Number.isInteger(incomingSeed) && incomingSeed > 0
        ? incomingSeed
        : Math.floor(Math.random() * 1_000_000_000) + 1;
    const indiaDateParts = Object.fromEntries(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(new Date()).map((part) => [part.type, part.value]),
    );
    const currentIndiaDateIso = `${indiaDateParts.year}-${indiaDateParts.month}-${indiaDateParts.day}`;
    const currentIndiaDateHuman = new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      weekday: "long",
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date());
    const pdfPartsFromRefs = await buildPdfPartsFromRefs(body.researchPdfRefs);
    const pdfPartsInline = buildPdfParts(body.researchPDFs);
    const pdfParts =
      pdfPartsFromRefs.length > 0 ? pdfPartsFromRefs : pdfPartsInline;
    const hasReferenceDocs = pdfParts.length > 0;
    const referenceDocNames = (
      pdfPartsFromRefs.length > 0
        ? body.researchPdfRefs || []
        : body.researchPDFs || []
    )
      .slice(0, pdfParts.length)
      .map((p) => String(p?.name || "Reference PDF").trim())
      .filter(Boolean);
    const ipoStructuredMode = isIpoTopic(topic);
    const ipoFormatInstruction = [
      "MANDATORY FORMAT (follow exactly in articleText and mirror in articleHtml):",
      "1. Summary:",
      "2. Issue Details and Key Dates",
      "3. GMP and Grey Market Premium",
      "4. Use of Proceeds / Key Objectives",
      "5. About the Company",
      "6. Financial Performance",
      "7. What the Numbers Show",
      "8. Strengths",
      "9. Risks",
      "10. Peer Positioning",
      "11. Bottom Line",
      "Formatting rules:",
      "- Keep section headings exactly as written above.",
      "- Use bullet points for Issue Details, GMP and Grey Market Premium, Use of Proceeds, Strengths, Risks, and Peer Positioning.",
      "- Under GMP and Grey Market Premium: report current GMP (in ₹ and as % premium over issue price), estimated listing price, and grey market demand signal. If GMP data is unavailable (e.g. DRHP not yet open), state that explicitly.",
      "- Include a compact table or table-like block under Financial Performance.",
      "- Keep tone neutral and factual (no recommendations).",
    ].join("\n");

    const promptDetailed = [
      "Use Google Search grounding to fact-check and generate a current Indian markets live-news article.",
      `Primary topic: ${topic}`,
      `Campaign purpose: ${purpose}`,
      `Target audience: ${targetAudience}`,
      `Language: ${language}`,
      hasReferenceDocs
        ? `Reference documents attached: ${referenceDocNames.join(", ")}`
        : "",
      hasReferenceDocs
        ? "Use attached PDFs as authoritative context (for example DRHP details, issue size, dates, risks, objects, valuation, peers)."
        : "",
      hasReferenceDocs
        ? "When PDF facts are used, mention them in article context and in FAQ/source attribution."
        : "",
      userPrompt
        ? `User refinement instruction (must follow): ${userPrompt}`
        : "",
      seedArticleText
        ? `Previous draft context (refine, not copy):\n${seedArticleText}`
        : "",
      `Current India date context: ${currentIndiaDateHuman} (${currentIndiaDateIso}, Asia/Kolkata).`,
      'If the topic says "today" or gives only a month/day like "February 27", resolve it to the current India date above unless the user explicitly provides a different year/date.',
      `Do not drift to older coverage from prior years when similarly dated articles exist.`,
      "Write in a neutral newsroom tone similar to professional business news portals.",
      "Do NOT include recommendations, advisory calls, buy/sell/hold language, or investor tips.",
      "Mandatory top structure (keep each on its own line):",
      "Headline: <one line>",
      "Summary: <2-3 lines>",
      "Intro: <one opening paragraph, distinct from summary and not repeated later>",
      "Do NOT output these label words (Headline:, Summary:, Intro:) in the final article body.",
      "Do not repeat the headline in the body.",
      "Do not repeat the same paragraph or near-duplicate lead lines.",
      "Do not end the article body with an incomplete sentence, trailing clause, or cut-off word.",
      "Focus on what happened, why it matters, and relevant market context.",
      ipoStructuredMode
        ? ""
        : "For non-IPO market news, structure the article body with these exact section headings on their own lines: Market Overview, Key Movers, Drivers and Context, Broader Market and Outlook.",
      ipoStructuredMode
        ? ""
        : "Write at least one substantial paragraph under each section heading and ensure the article ends with a complete final sentence.",
      ipoStructuredMode
        ? "Because this is IPO/DRHP context, write articleText and articleHtml in this exact section order: Summary, Issue Details and Key Dates, GMP and Grey Market Premium, Use of Proceeds / Key Objectives, About the Company, Financial Performance, What the Numbers Show, Strengths, Risks, Peer Positioning, Bottom Line."
        : "",
      ipoStructuredMode ? ipoFormatInstruction : "",
      ipoStructuredMode
        ? "Use document data as primary source for dates, issue terms, proceeds, financials, and risks; use web grounding for contextual verification."
        : "",
      "Return plain text only (no JSON).",
      "After article end, append exactly:",
      "SEO Metadata:",
      "- SEO Title: ...",
      "- Meta Description: ...",
      "- Focus Keywords: ...",
      "FAQ Schema (JSON-LD):",
      "{valid FAQPage JSON-LD with 3-5 FAQs}",
    ].join("\n");
    const promptCompact = [
      "Use Google Search grounding and write a concise, factual Indian market news article.",
      `Topic: ${topic}`,
      hasReferenceDocs
        ? `Reference documents attached: ${referenceDocNames.join(", ")}`
        : "",
      hasReferenceDocs
        ? "Use document facts as primary context where relevant."
        : "",
      userPrompt
        ? `User refinement instruction (must follow): ${userPrompt}`
        : "",
      seedArticleText
        ? `Previous draft context (refine, not copy):\n${seedArticleText}`
        : "",
      `Current India date context: ${currentIndiaDateHuman} (${currentIndiaDateIso}, Asia/Kolkata).`,
      'If the topic says "today" or gives only a month/day like "February 27", resolve it to the current India date above unless the user explicitly provides a different year/date.',
      `Do not drift to older coverage from prior years when similarly dated articles exist.`,
      "Return plain text only (no JSON).",
      "Include separate top lines: Headline, Summary, Intro.",
      "Keep intro paragraph distinct from summary.",
      "Do NOT print label prefixes like Headline:, Summary:, Intro: in the final output.",
      "Do not repeat the headline in the body.",
      "Do not repeat paragraphs.",
      "Do not end the article body with an incomplete sentence, trailing clause, or cut-off word.",
      ipoStructuredMode
        ? ""
        : "For non-IPO market news, use these exact section headings on separate lines in the body: Market Overview, Key Movers, Drivers and Context, Broader Market and Outlook.",
      ipoStructuredMode
        ? ""
        : "Write at least one substantial paragraph under each section heading and ensure the article ends with a complete final sentence.",
      ipoStructuredMode
        ? "articleText and articleHtml must include all requested IPO sections with bullets and financial table-like data."
        : "Write articleText as 4 substantial paragraphs with strong factual detail.",
      ipoStructuredMode ? ipoFormatInstruction : "",
      "Append SEO Metadata and FAQ Schema (JSON-LD) after article body.",
      "No investment recommendations or buy/sell/hold language.",
    ].join("\n");
    const promptAdvisorySafe = [
      "Use Google Search grounding and rewrite as strict business-news copy.",
      `Topic: ${topic}`,
      hasReferenceDocs
        ? `Reference documents attached: ${referenceDocNames.join(", ")}`
        : "",
      userPrompt
        ? `User refinement instruction (must follow): ${userPrompt}`
        : "",
      seedArticleText
        ? `Previous draft context (refine, not copy):\n${seedArticleText}`
        : "",
      `Current India date context: ${currentIndiaDateHuman} (${currentIndiaDateIso}, Asia/Kolkata).`,
      'If the topic says "today" or gives only a month/day like "February 27", resolve it to the current India date above unless the user explicitly provides a different year/date.',
      `Do not drift to older coverage from prior years when similarly dated articles exist.`,
      "Return plain text only.",
      "Include separate top lines: Headline, Summary, Intro.",
      "Keep intro paragraph distinct from summary.",
      "Do NOT print label prefixes like Headline:, Summary:, Intro: in the final output.",
      "Do not repeat the headline in the body.",
      "Do not repeat paragraphs.",
      "Do not end the article body with an incomplete sentence, trailing clause, or cut-off word.",
      ipoStructuredMode
        ? ""
        : "For non-IPO market news, use these exact section headings on separate lines in the body: Market Overview, Key Movers, Drivers and Context, Broader Market and Outlook.",
      ipoStructuredMode
        ? ""
        : "Write at least one substantial paragraph under each section heading and ensure the article ends with a complete final sentence.",
      "Hard constraint: do not include ANY advisory words or actions.",
      "Forbidden words/phrases: buy, sell, hold, invest, should investors, strategy, tips, recommendation.",
      ipoStructuredMode
        ? "For IPO/DRHP context, output the full sectioned report format and keep each bullet factual and source-grounded."
        : "Write only factual reporting on what happened, drivers, impact, and near-term implications.",
      ipoStructuredMode ? ipoFormatInstruction : "",
      "Append SEO Metadata and FAQ Schema (JSON-LD) after article body.",
      ipoStructuredMode
        ? "Include at least 6 issue details bullets, at least 2 GMP/grey market data points, at least 3 strengths, at least 3 risks, and at least 3 peer positioning bullets."
        : "Length constraint: 4-6 paragraphs and at least 280 words in articleText.",
    ].join("\n");

    const refinementPromptDetailed = [
      "You are editing an existing Indian markets article.",
      `Topic: ${topic}`,
      `Language: ${language}`,
      `User instruction: ${userPrompt}`,
      hasReferenceDocs
        ? `Reference documents attached: ${referenceDocNames.join(", ")}`
        : "",
      hasReferenceDocs
        ? "Use attached PDFs for factual correction where relevant."
        : "",
      `Current India date context: ${currentIndiaDateHuman} (${currentIndiaDateIso}, Asia/Kolkata).`,
      'If the topic says "today" or gives only a month/day like "February 27", resolve it to the current India date above unless the user explicitly provides a different year/date.',
      "Apply the user instruction exactly and keep all unrelated content unchanged.",
      "Do not add recommendations/advisory language.",
      "Do not leave the revised article body ending with an incomplete sentence, trailing clause, or cut-off word.",
      ipoStructuredMode
        ? ""
        : "Keep the existing body in a headed structure using these exact section headings where applicable: Market Overview, Key Movers, Drivers and Context, Broader Market and Outlook.",
      "Return plain text in this exact format and nothing else:",
      "HEADLINE: <single line>",
      "SUMMARY: <2-3 lines>",
      "BODY:",
      "<full article body only>",
    ].join("\n");

    let parsed: any = null;
    let responseForSources: any = null;
    let lastRaw = "";
    const retryTrace: RetryTrace[] = [];
    const startedAt = Date.now();

    if (isRefinementRun) {
      const refinementStartedAt = Date.now();
      try {
        const seedBody = stripGeneratedTailBlocks(seedArticleText);
        const contents = [
          {
            role: "user" as const,
            parts: [
              {
                text: "Current article draft (preserve unless explicitly changed):",
              },
            ],
          },
          {
            role: "model" as const,
            parts: [
              {
                text: `HEADLINE: ${seedHeadline || ""}\nSUMMARY: ${seedSummary || ""}\nBODY:\n${seedBody}`.trim(),
              },
            ],
          },
          {
            role: "user" as const,
            parts: [{ text: refinementPromptDetailed }, ...pdfParts],
          },
        ];
        const response = await ai.models.generateContent({
          model: MODEL,
          contents,
          config: {
            temperature: 0.05,
            maxOutputTokens: 3072,
            tools: [{ googleSearch: {} }],
            seed: resolvedSeed,
          },
        });
        const raw = await getGeminiText(response);
        lastRaw = raw;
        const blocks = parseRefinementBlocks(raw);
        const refinedHeadline = cleanupTextArtifacts(
          blocks.headline || seedHeadline || buildFallbackHeadline(topic),
        );
        const refinedSummary = cleanupTextArtifacts(
          blocks.summary ||
            seedSummary ||
            deriveSummaryFromArticleText(seedBody),
        );
        const refinedBody = cleanupTextArtifacts(blocks.body || seedBody);
        if (
          !refinedHeadline ||
          !refinedSummary ||
          countBodyWords(refinedBody) < 40
        ) {
          throw new Error("Refinement output incomplete");
        }
        parsed = {
          headline: refinedHeadline,
          summary: refinedSummary,
          articleText: refinedBody,
          articleHtml: articleTextToHtml(refinedBody),
          seoTitle: seedSeo?.seoTitle || refinedHeadline,
          metaDescription: seedSeo?.metaDescription || refinedSummary,
          focusKeywords: Array.isArray(seedSeo?.focusKeywords)
            ? seedSeo?.focusKeywords
            : [],
          faqSchema: seedFaqSchema || undefined,
        };
        responseForSources = response;
        retryTrace.push({
          attempt: 1,
          promptVariant: "refine-single-pass",
          maxOutputTokens: 3072,
          status: "success",
          elapsedMs: Date.now() - refinementStartedAt,
        });
      } catch (err) {
        retryTrace.push({
          attempt: 1,
          promptVariant: "refine-single-pass",
          maxOutputTokens: 3072,
          status: "model-error",
          detail: err instanceof Error ? err.message : "Unknown model error",
          elapsedMs: Date.now() - refinementStartedAt,
        });
      }
    }

    const attempts = isRefinementRun
      ? []
      : [
          { name: "detailed", prompt: promptDetailed, maxOutputTokens: 3072 },
          { name: "compact", prompt: promptCompact, maxOutputTokens: 2300 },
          {
            name: "advisory-safe",
            prompt: promptAdvisorySafe,
            maxOutputTokens: 2300,
          },
        ];

    for (let index = 0; index < attempts.length; index += 1) {
      if (Date.now() - startedAt > MAX_GENERATION_MS) {
        retryTrace.push({
          attempt: index + 1,
          promptVariant: attempts[index].name,
          maxOutputTokens: attempts[index].maxOutputTokens,
          status: "model-error",
          detail: `Generation time budget exceeded (${MAX_GENERATION_MS}ms).`,
          elapsedMs: Date.now() - startedAt,
        });
        break;
      }
      const attempt = attempts[index];
      const attemptStartedAt = Date.now();
      try {
        const requestContents = [
          {
            role: "user" as const,
            parts: [{ text: attempt.prompt }, ...pdfParts],
          },
        ];
        const response = await ai.models.generateContent({
          model: MODEL,
          contents: requestContents,
          config: {
            temperature: 0.3,
            maxOutputTokens: attempt.maxOutputTokens,
            tools: [{ googleSearch: {} }],
            seed: resolvedSeed,
          },
        });

        const raw = await getGeminiText(response);
        lastRaw = raw;

        const candidate = parseRawArticleOutput(raw, topic);
        const cHeadline = String(candidate?.headline || "").trim();
        const cSummary = String(candidate?.summary || "").trim();
        let cArticleText = String(candidate?.articleText || "").trim();
        const cArticleHtml = String(candidate?.articleHtml || "").trim();
        if (
          isRefinementRun &&
          cArticleText &&
          countBodyWords(cArticleText) < 120
        ) {
          const seedBody = stripGeneratedTailBlocks(seedArticleText);
          if (countBodyWords(seedBody) >= 120) {
            cArticleText = seedBody;
          }
        }
        const cBodyForChecks = cArticleText || htmlToText(cArticleHtml);
        const cWordCount = countBodyWords(cBodyForChecks);
        const cSchemaLike = isSchemaLikeBody(cBodyForChecks);
        const hasBaseFields = Boolean(cHeadline);
        const hasContentFields = Boolean(
          cArticleText || cArticleHtml || cSummary,
        );
        if (!hasBaseFields || !hasContentFields) {
          retryTrace.push({
            attempt: index + 1,
            promptVariant: attempt.name,
            maxOutputTokens: attempt.maxOutputTokens,
            status: "missing-fields",
            detail:
              "Required fields missing after raw-text mapping (headline/summary/articleText).",
            elapsedMs: Date.now() - attemptStartedAt,
          });
          continue;
        }
        if (cSchemaLike) {
          retryTrace.push({
            attempt: index + 1,
            promptVariant: attempt.name,
            maxOutputTokens: attempt.maxOutputTokens,
            status: "missing-fields",
            detail: "Article body was schema-like JSON instead of prose.",
            elapsedMs: Date.now() - attemptStartedAt,
          });
          continue;
        }
        if (hasAdvisoryLanguage(cBodyForChecks)) {
          retryTrace.push({
            attempt: index + 1,
            promptVariant: attempt.name,
            maxOutputTokens: attempt.maxOutputTokens,
            status: "advisory-rejected",
            detail:
              "Article body contained advisory or investment recommendation language.",
            elapsedMs: Date.now() - attemptStartedAt,
          });
          continue;
        }
        if (ipoStructuredMode) {
          const hasIpoShape =
            hasAllIpoSections(cArticleText) ||
            hasAllIpoSections(cArticleHtml) ||
            hasAllIpoSections(cBodyForChecks);
          if (!hasIpoShape || cWordCount < 180) {
            retryTrace.push({
              attempt: index + 1,
              promptVariant: attempt.name,
              maxOutputTokens: attempt.maxOutputTokens,
              status: "missing-fields",
              detail: `IPO structure/length incomplete (sections=${hasIpoShape}, words=${cWordCount}).`,
              elapsedMs: Date.now() - attemptStartedAt,
            });
            continue;
          }
        } else if (cWordCount < 120) {
          retryTrace.push({
            attempt: index + 1,
            promptVariant: attempt.name,
            maxOutputTokens: attempt.maxOutputTokens,
            status: "missing-fields",
            detail: `Article body too short (${cWordCount} words).`,
            elapsedMs: Date.now() - attemptStartedAt,
          });
          continue;
        }

        retryTrace.push({
          attempt: index + 1,
          promptVariant: attempt.name,
          maxOutputTokens: attempt.maxOutputTokens,
          status: "success",
          elapsedMs: Date.now() - attemptStartedAt,
        });
        parsed = candidate;
        responseForSources = response;
        break;
      } catch (err) {
        retryTrace.push({
          attempt: index + 1,
          promptVariant: attempt.name,
          maxOutputTokens: attempt.maxOutputTokens,
          status: "model-error",
          detail: err instanceof Error ? err.message : "Unknown model error",
          elapsedMs: Date.now() - attemptStartedAt,
        });
      }
    }

    if (
      !parsed &&
      !isRefinementRun &&
      Date.now() - startedAt <= MAX_GENERATION_MS - 30000
    ) {
      const salvageStartedAt = Date.now();
      try {
        const salvagePrompt = [
          "You are writing a complete, factual Indian markets IPO news report.",
          `Topic: ${topic}`,
          hasReferenceDocs
            ? `Reference documents attached: ${referenceDocNames.join(", ")}`
            : "",
          hasReferenceDocs
            ? "Use attached document facts first, then web grounding for context."
            : "",
          `Current India date context: ${currentIndiaDateHuman} (${currentIndiaDateIso}, Asia/Kolkata).`,
          'If the topic says "today" or gives only a month/day like "February 27", resolve it to the current India date above unless the user explicitly provides a different year/date.',
          "Return plain text only (no JSON).",
          "Include separate top lines: Headline, Summary, Intro.",
          "Keep intro paragraph distinct from summary.",
          "Do NOT print label prefixes like Headline:, Summary:, Intro: in the final output.",
          "Do not repeat the headline in the body.",
          "Do not repeat paragraphs.",
          "Do not end the article body with an incomplete sentence, trailing clause, or cut-off word.",
          ipoStructuredMode
            ? ""
            : "For non-IPO market news, use these exact section headings on separate lines in the body: Market Overview, Key Movers, Drivers and Context, Broader Market and Outlook.",
          ipoStructuredMode
            ? ""
            : "Write at least one substantial paragraph under each section heading and ensure the article ends with a complete final sentence.",
          "After article end append SEO Metadata and FAQ Schema (JSON-LD).",
          "Hard constraints:",
          "- No recommendations/advisory language.",
          "- articleText must be complete and not truncated.",
          ipoStructuredMode
            ? "- Include all IPO sections: Summary, Issue Details and Key Dates, GMP and Grey Market Premium, Use of Proceeds / Key Objectives, About the Company, Financial Performance, What the Numbers Show, Strengths, Risks, Peer Positioning, Bottom Line."
            : "- Write 4-6 solid paragraphs with clear market context.",
        ].join("\n");

        const salvageResponse = await ai.models.generateContent({
          model: MODEL,
          contents: [
            { role: "user" as const, parts: [{ text: salvagePrompt }, ...pdfParts] },
          ],
          config: {
            temperature: 0.2,
            maxOutputTokens: 2600,
            tools: [{ googleSearch: {} }],
            seed: resolvedSeed,
          },
        });

        const salvageRaw = await getGeminiText(salvageResponse);
        const salvageCandidate = parseRawArticleOutput(salvageRaw, topic);
        const sHeadline = String(salvageCandidate?.headline || "").trim();
        const sSummary = String(salvageCandidate?.summary || "").trim();
        const sArticleText = String(salvageCandidate?.articleText || "").trim();
        const sWordCount = countBodyWords(sArticleText);
        const sHasIpoShape =
          !ipoStructuredMode || hasAllIpoSections(sArticleText);
        const sSchemaLike = isSchemaLikeBody(sArticleText);

        if (
          sHeadline &&
          sSummary &&
          sArticleText &&
          sWordCount >= 140 &&
          sHasIpoShape &&
          !sSchemaLike
        ) {
          retryTrace.push({
            attempt: retryTrace.length + 1,
            promptVariant: "salvage",
            maxOutputTokens: 2600,
            status: "success",
            elapsedMs: Date.now() - salvageStartedAt,
          });
          parsed = {
            ...salvageCandidate,
            articleHtml: articleTextToHtml(sArticleText),
          };
          responseForSources = salvageResponse;
        } else {
          retryTrace.push({
            attempt: retryTrace.length + 1,
            promptVariant: "salvage",
            maxOutputTokens: 2600,
            status: "missing-fields",
            detail: `Salvage output incomplete (words=${sWordCount}, ipoShape=${sHasIpoShape}, schemaLike=${sSchemaLike}).`,
            elapsedMs: Date.now() - salvageStartedAt,
          });
        }
      } catch (err) {
        retryTrace.push({
          attempt: retryTrace.length + 1,
          promptVariant: "salvage",
          maxOutputTokens: 2600,
          status: "model-error",
          detail:
            err instanceof Error ? err.message : "Unknown salvage model error",
          elapsedMs: Date.now() - salvageStartedAt,
        });
      }
    }

    if (!parsed) {
      return NextResponse.json(
        {
          error: "Failed to parse grounded article response",
          raw: lastRaw?.slice(0, 600) || "",
          retryTrace,
          generationMeta: {
            attempts: retryTrace.length,
            totalElapsedMs: Date.now() - startedAt,
          },
        },
        { status: 500 },
      );
    }

    let headline = cleanupTextArtifacts(String(parsed?.headline || "").trim());
    let subheadline = "";
    let summary = cleanupTextArtifacts(String(parsed?.summary || "").trim());
    let articleBodyText = cleanupTextArtifacts(
      String(parsed?.articleText || "").trim(),
    );
    let articleBodyHtml = cleanupHtmlArtifacts(
      String(parsed?.articleHtml || "").trim(),
    );

    if (!articleBodyText && articleBodyHtml) {
      articleBodyText = cleanupTextArtifacts(htmlToText(articleBodyHtml));
    }
    if (!articleBodyHtml && articleBodyText) {
      articleBodyHtml = cleanupHtmlArtifacts(
        articleTextToHtml(articleBodyText),
      );
    }
    if (ipoStructuredMode) {
      articleBodyHtml = normalizeIpoSectionHeadingsToH2(articleBodyHtml);
    }

    if (!headline || isSectionStyleTitle(headline)) {
      const fromHtml = cleanupTextArtifacts(
        extractHeadlineFromHtml(articleBodyHtml),
      );
      headline =
        !fromHtml || isSectionStyleTitle(fromHtml)
          ? buildFallbackHeadline(topic)
          : fromHtml;
    }
    if (!summary) {
      summary = cleanupTextArtifacts(
        deriveSummaryFromArticleText(articleBodyText),
      );
    }
    if (isRefinementRun && !allowHeadlineChange && seedHeadline) {
      headline = seedHeadline;
    }
    if (isRefinementRun && !allowSummaryChange && seedSummary) {
      summary = seedSummary;
    }
    if (
      isRefinementRun &&
      allowSummaryChange &&
      seedSummary &&
      normalizeForMatch(summary) === normalizeForMatch(seedSummary)
    ) {
      try {
        const summaryRewritePrompt = [
          "Rewrite the summary only.",
          `Topic: ${topic}`,
          `User instruction: ${userPrompt}`,
          `Current summary:\n${seedSummary}`,
          "Return only the revised summary text in 2-3 sentences. No labels.",
        ].join("\n");
        const summaryResp = await ai.models.generateContent({
          model: MODEL,
          contents: [{ role: "user" as const, parts: [{ text: summaryRewritePrompt }] }],
          config: {
            temperature: 0.05,
            maxOutputTokens: 220,
            seed: resolvedSeed,
          },
        });
        const summaryRaw = cleanupTextArtifacts(
          await getGeminiText(summaryResp),
        );
        if (
          summaryRaw &&
          normalizeForMatch(summaryRaw) !== normalizeForMatch(seedSummary)
        ) {
          summary = clipAtSentenceOrWords(summaryRaw, 90);
        }
      } catch {
        // Keep original summary if summary-only refinement fails.
      }
    }
    // Subheadline intentionally disabled for live-news output to avoid duplicate lead text.
    // Final safety pass: after any summary/subheadline normalization, strip echoes from body.
    const prunedBody = dropLeadingMetaEchoes(
      articleBodyText,
      subheadline,
      summary,
    );
    if (prunedBody && prunedBody !== articleBodyText) {
      articleBodyText = prunedBody;
      articleBodyHtml = cleanupHtmlArtifacts(
        articleTextToHtml(articleBodyText),
      );
      if (ipoStructuredMode) {
        articleBodyHtml = normalizeIpoSectionHeadingsToH2(articleBodyHtml);
      }
    }

    const parsedTags = parsed?.tags;
    const tags = Array.isArray(parsedTags)
      ? parsedTags
          .map((t: any) => String(t).trim())
          .filter(Boolean)
          .slice(0, 8)
      : [];
    const parsedSeoTitle = cleanupTextArtifacts(
      String(parsed?.seoTitle || headline).trim(),
    ).slice(0, 120);
    const parsedMetaDescription = cleanupTextArtifacts(
      String(parsed?.metaDescription || summary).trim(),
    );
    const parsedFocusKeywordsArray = parsed?.focusKeywords;
    const parsedFocusKeywords = Array.isArray(parsedFocusKeywordsArray)
      ? parsedFocusKeywordsArray
          .map((k: any) => String(k).trim())
          .filter(Boolean)
          .slice(0, 8)
      : tags.slice(0, 6);
    const seedSeoTitle = seedSeo?.seoTitle;
    const seedMetaDesc = seedSeo?.metaDescription;
    const seoTitle =
      isRefinementRun && !allowSeoChange && seedSeoTitle
        ? cleanupTextArtifacts(String(seedSeoTitle).trim()).slice(0, 120)
        : parsedSeoTitle;
    const metaDescription =
      isRefinementRun && !allowSeoChange && seedMetaDesc
        ? cleanupTextArtifacts(String(seedMetaDesc).trim())
        : parsedMetaDescription;
    const seedFocusKeywords = seedSeo?.focusKeywords;
    const focusKeywords =
      isRefinementRun &&
      !allowSeoChange &&
      Array.isArray(seedFocusKeywords)
        ? seedFocusKeywords
            .map((k: any) => cleanupTextArtifacts(String(k).trim()))
            .filter(Boolean)
            .slice(0, 8)
        : parsedFocusKeywords;
    const parsedFaqs = parsed?.faqs;
    const faqs: ArticleFaq[] = Array.isArray(parsedFaqs)
      ? parsedFaqs
          .map((f: any) => ({
            question: cleanupTextArtifacts(String(f?.question || "").trim()),
            answer: cleanupTextArtifacts(String(f?.answer || "").trim()),
          }))
          .filter((f: ArticleFaq) => f.question && f.answer)
          .slice(0, 5)
      : [];

    if (!headline || !summary) {
      return NextResponse.json(
        { error: "Incomplete article payload from model" },
        { status: 500 },
      );
    }

    if (!articleBodyText || !articleBodyHtml) {
      return NextResponse.json(
        { error: "Incomplete article body payload from model" },
        { status: 500 },
      );
    }

    if (ipoStructuredMode && !hasAllIpoSections(articleBodyText)) {
      articleBodyHtml = normalizeIpoSectionHeadingsToH2(
        articleTextToHtml(articleBodyText),
      );
      // Re-derive text from normalized HTML so section check reflects normalized structure
      const textAfterNorm = htmlToText(articleBodyHtml);
      if (!hasAllIpoSections(textAfterNorm)) {
        return NextResponse.json(
          {
            error:
              "Generated IPO article did not include required section structure after normalization.",
            retryTrace,
            generationMeta: {
              attempts: retryTrace.length,
              totalElapsedMs: Date.now() - startedAt,
            },
          },
          { status: 500 },
        );
      }
      articleBodyText = textAfterNorm;
    }

    const bodyWordCount = countBodyWords(articleBodyText);
    const bodyParagraphCount = countBodyParagraphs(articleBodyText);

    const groundedSources = collectGroundedSources(responseForSources);
    const faqForSchema =
      faqs.length > 0
        ? faqs
        : [
            {
              question: `What is the latest update on ${topic}?`,
              answer:
                summary ||
                articleBodyText.split("\n\n")[0] ||
                "The article covers the latest verified market update and its impact.",
            },
            {
              question: "Which factors are driving this market move?",
              answer:
                "The move is being driven by a combination of macroeconomic, policy, and sector-specific factors discussed in the article.",
            },
            {
              question: "How is this affecting Indian markets?",
              answer:
                "The article explains sector impact, market sentiment, and near-term implications using grounded sources.",
            },
          ];

    const fallbackFaqSchema = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqForSchema.map((faq) => ({
        "@type": "Question",
        name: faq.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: faq.answer,
        },
      })),
    };

    const parsedFaqSchema = parsed?.faqSchema;
    const faqSchema =
      isRefinementRun && !allowFaqChange && seedFaqSchema
        ? seedFaqSchema
        : parsedFaqSchema && typeof parsedFaqSchema === "object"
          ? parsedFaqSchema
          : {
              ...fallbackFaqSchema,
            };

    const sourcesTextBlock = groundedSources.length
      ? `\n\nSources:\n${groundedSources.map((s, i) => `${i + 1}. ${s.title} - ${s.url}`).join("\n")}`
      : "";

    const sourcesHtmlBlock = groundedSources.length
      ? `<h2>Sources</h2><ol>${groundedSources.map((s) => `<li><a href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(s.title)}</a></li>`).join("")}</ol>`
      : "";

    const seoTextBlock = `\n\nSEO Metadata:\n- SEO Title: ${seoTitle}\n- Meta Description: ${metaDescription}\n- Focus Keywords: ${(focusKeywords || []).join(", ")}`;
    const seoHtmlBlock = `<h2>SEO Metadata</h2><ul><li><strong>SEO Title:</strong> ${escapeHtml(seoTitle)}</li><li><strong>Meta Description:</strong> ${escapeHtml(metaDescription)}</li><li><strong>Focus Keywords:</strong> ${escapeHtml((focusKeywords || []).join(", "))}</li></ul>`;

    const faqSchemaJson = JSON.stringify(faqSchema, null, 2);
    const faqTextBlock = `\n\nFAQ Schema (JSON-LD):\n${faqSchemaJson}`;
    const faqHtmlBlock = `<h2>FAQ Schema</h2><pre>${escapeHtml(faqSchemaJson)}</pre><script type="application/ld+json">${faqSchemaJson}</script>`;

    const article = {
      headline,
      subheadline,
      summary,
      rawOutput: lastRaw,
      articleText: `${articleBodyText}${sourcesTextBlock}${seoTextBlock}${faqTextBlock}`,
      articleHtml: `${articleBodyHtml}${sourcesHtmlBlock}${seoHtmlBlock}${faqHtmlBlock}`,
      tags,
      seo: {
        seoTitle,
        metaDescription,
        focusKeywords,
      },
      faqs: faqForSchema,
      faqSchema,
      topic,
      generatedAt: new Date().toISOString(),
      generationSeed: resolvedSeed,
      model: MODEL,
      factCheck: {
        grounded: true,
        sourceCount: groundedSources.length,
      },
      quality: {
        length: lengthQuality(bodyWordCount, bodyParagraphCount),
        bodyWordCount,
        bodyParagraphCount,
      },
      retryTrace,
      generationMeta: {
        attempts: retryTrace.length,
        totalElapsedMs: Date.now() - startedAt,
      },
      referenceDocuments: {
        attached: hasReferenceDocs,
        count: pdfParts.length,
        names: referenceDocNames,
      },
      sources: groundedSources,
    };

    return NextResponse.json(article);
  } catch (error) {
    console.error("Live news article generation error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to generate live news article",
      },
      { status: 500 },
    );
  } finally {
    await cleanupR2Refs(refsToCleanup);
  }
}
