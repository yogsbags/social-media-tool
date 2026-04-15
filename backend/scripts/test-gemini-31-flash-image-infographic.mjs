/**
 * One-round diagnostic: why gemini-3.1-flash-image-preview returns MALFORMED_FUNCTION_CALL
 * for infographic-style prompts. Compares request shapes (matches image-generator.js patterns).
 *
 * Usage (from frontend/):
 *   node backend/scripts/test-gemini-31-flash-image-infographic.mjs
 *   node backend/scripts/test-gemini-31-flash-image-infographic.mjs --long
 *   node backend/scripts/test-gemini-31-flash-image-infographic.mjs --wide
 *   node backend/scripts/test-gemini-31-flash-image-infographic.mjs --all   # 4 request-shape variants
 *
 * Requires GEMINI_API_KEY in env or frontend/.env.local
 */
import { readFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendRoot = join(__dirname, "../..");
const envLocal = join(frontendRoot, ".env.local");
if (existsSync(envLocal)) {
  for (const line of readFileSync(envLocal, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

if (!process.env.GEMINI_API_KEY) {
  console.error("Set GEMINI_API_KEY or add it to frontend/.env.local");
  process.exit(1);
}

const { GoogleGenAI } = await import("@google/genai");
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const model = "gemini-3.1-flash-image-preview";
/** Orchestrator uses options.aspectRatio || '4:5' for infographics */
const aspectRatio = process.argv.includes("--wide") ? "16:9" : "4:5";
const imageSize = "1K";

function buildPrompt({ long }) {
  const base = [
    `Design a polished single-page social infographic for the topic: Market outlook Q1 2026.`,
    "Use a clean editorial layout with a strong visual hierarchy, bold section headings, compact supporting text, icon-led callouts, and clear data-card styling.",
    "Stats to feature: Nifty: flat | VIX: elevated.",
    "Sections to visualize: Macro — rates and liquidity | Sectors — IT vs banks.",
    "Use flat vector-style charts, icons, dividers, and geometric accents. No people or faces. Keep the output social-media ready and easy to scan on mobile.",
  ].join(" ");
  if (!long) return base;
  // Stress-test: long section bodies like real LLM-filled infographic JSON
  const filler = Array.from({ length: 40 }, (_, i) => `${i + 1}. Lorem ipsum dolor sit amet — concise bullet for section ${i + 1} with numbers 12.3% and symbols ₹$€.`).join(" ");
  return `${base} Additional detail blocks: ${filler}`;
}

function summarizeResponse(label, response) {
  const c = response?.candidates?.[0];
  const parts = c?.content?.parts;
  const inlineCount = Array.isArray(parts)
    ? parts.filter((p) => p?.inlineData?.data).length
    : 0;
  const textPreview = Array.isArray(parts)
    ? parts
        .map((p) => (p?.text ? String(p.text).slice(0, 120) : ""))
        .filter(Boolean)
        .join(" | ")
    : "";
  console.log("\n---", label, "---");
  console.log("finishReason:", c?.finishReason ?? "(none)");
  console.log("parts.length:", parts?.length ?? 0, "inline images:", inlineCount);
  if (textPreview) console.log("text preview:", textPreview);
  console.log(
    "safetyRatings:",
    JSON.stringify(c?.safetyRatings || []).slice(0, 200),
  );
  console.log("promptTokenCount:", response?.usageMetadata?.promptTokenCount);
  if (c?.finishReason === "MALFORMED_FUNCTION_CALL") {
    console.log(
      "Note: MALFORMED_FUNCTION_CALL = model emitted an invalid internal tool/function call; often linked to response modality / prompt + config interaction on preview image models.",
    );
  }
}

const longPrompt = process.argv.includes("--long");
const prompt = buildPrompt({ long: longPrompt });

const baseImageConfig = { aspectRatio, imageSize };

const allCases = [
  {
    label: "A_string_contents_TEXT_IMAGE_+_imageSize (current image-generator default)",
    contents: prompt,
    config: {
      responseModalities: ["TEXT", "IMAGE"],
      imageConfig: { ...baseImageConfig },
    },
  },
  {
    label: "B_structured_user_turn_TEXT_IMAGE_+_imageSize",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      responseModalities: ["TEXT", "IMAGE"],
      imageConfig: { ...baseImageConfig },
    },
  },
  {
    label: "C_structured_IMAGE_only_+_imageSize",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      responseModalities: ["IMAGE"],
      imageConfig: { ...baseImageConfig },
    },
  },
  {
    label: "D_structured_IMAGE_only_aspectRatio_only",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      responseModalities: ["IMAGE"],
      imageConfig: { aspectRatio },
    },
  },
];

const runAll = process.argv.includes("--all");
const cases = runAll ? allCases : [allCases[0]];

console.log("Model:", model, "aspectRatio:", aspectRatio, "imageSize:", imageSize);
console.log("Prompt mode:", longPrompt ? "long (~stress)" : "short (orchestrator-sized)");
console.log("Prompt length (chars):", prompt.length);

for (const { label, contents, config } of cases) {
  try {
    const response = await ai.models.generateContent({
      model,
      contents,
      config,
    });
    summarizeResponse(label, response);
  } catch (e) {
    console.log("\n---", label, "---");
    console.error("THREW:", e?.message || e);
  }
}

console.log("\nDone.");
