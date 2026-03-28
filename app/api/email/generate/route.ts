import { GoogleGenAI } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const MODEL = "gemini-3-flash-preview";

const HEADER_IMAGE_URL =
  "https://d314e77m1bz5zy.cloudfront.net/bee/Images/bmsx/p7orqos0/xtp/w8t/1aj/Asset%201.png";
const FOOTER_IMAGE_URL =
  "https://d314e77m1bz5zy.cloudfront.net/bee/Images/bmsx/p7orqos0/9wn/vw0/ds6/Asset%202.png";
const BEE_SOCIAL_ICON_BASE =
  "https://app-rsrc.getbee.io/public/resources/social-networks-icon-sets/circle-color/";

async function getGeminiText(response: any) {
  if (!response) return "";

  try {
    if (typeof response.text === "function") {
      const maybe = response.text();
      if (maybe && typeof maybe.then === "function") return await maybe;
      return maybe || "";
    }
  } catch {
    // ignore and fall back
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

// Strips disallowed <img> tags while preserving inline <svg> elements (used for card icons).
function sanitizeNewsletterHtml(html: string) {
  const allowlistedBases = [HEADER_IMAGE_URL, FOOTER_IMAGE_URL, BEE_SOCIAL_ICON_BASE];
  const isAllowed = (src: string) => allowlistedBases.some((base) => src.startsWith(base));

  let headerCount = 0;
  let footerCount = 0;

  const stripDisallowedImgTags = (input: string) =>
    input.replace(/<img\b[^>]*>/gi, (tag) => {
      const quoted =
        tag.match(/\bsrc\s*=\s*["']([^"']+)["']/i) ||
        tag.match(/\bsrc\s*=\s*([^\s>]+)/i);
      const src = quoted?.[1]?.replace(/^['"]|['"]$/g, "")?.trim();

      if (!src) return "";
      if (!isAllowed(src)) return "";

      if (src === HEADER_IMAGE_URL) {
        headerCount += 1;
        return headerCount === 1 ? tag : "";
      }

      if (src === FOOTER_IMAGE_URL) {
        footerCount += 1;
        return footerCount === 1 ? tag : "";
      }

      return tag;
    });

  return stripDisallowedImgTags(html);
}

/**
 * Generate HTML email newsletter with subject line using best practices
 * Follows subjectline.com guidelines and email marketing best practices
 */
export async function POST(request: NextRequest) {
  try {
    const geminiApiKey = process.env.GEMINI_API_KEY || "";
    if (!geminiApiKey) {
      return NextResponse.json(
        {
          error: "GEMINI_API_KEY is not set",
          details:
            "Set GEMINI_API_KEY in your environment (e.g., Railway variables) to generate newsletters with Gemini.",
        },
        { status: 500 },
      );
    }

    const body = await request.json();
    const {
      topic,
      purpose,
      targetAudience,
      creativePrompt, // From Stage 1
      brandSettings,
      language = "en",
      referenceExamples, // From examples/newsletter-reference.md
      referenceImageBase64, // Base64-encoded PNG from examples folder
      referenceImageMime = "image/png",
    } = body;

    if (!topic) {
      return NextResponse.json({ error: "Topic is required" }, { status: 400 });
    }

    // Build brand guidelines — handle both default and custom overrides
    const bs = brandSettings || {};
    let brandGuidance = "";
    if (bs.useBrandGuidelines) {
      brandGuidance = `
**Default Brand Guidelines:**
- **Primary Colors**: Deep navy (#0e0e6a), vivid blue (#3c3cf8)
- **Accent Colors**: Teal (#00d084), green (#66e766)
- **Typography**: Figtree font family, professional sans-serif fallbacks
- **Tone & Voice**: Clear, credible, adaptable, and approachable
- **Visual Style**: Clean, modern, polished, with subtle visual texture
- **Key Values**: Clarity, trust, innovation, customer focus
- **Messaging**: Focus on practical value, differentiation, and clear outcomes
`;
    } else {
      // Compose guidance from all custom fields the UI sends
      const lines: string[] = [];
      if (bs.customColors)        lines.push(`- **Primary Colors**: ${bs.customColors}`);
      if (bs.accentColors)        lines.push(`- **Accent Colors**: ${bs.accentColors}`);
      if (bs.bodyTextColor)       lines.push(`- **Body Text Color**: ${bs.bodyTextColor}`);
      if (bs.font)                lines.push(`- **Font Family**: ${bs.font}`);
      if (bs.fontSize)            lines.push(`- **Base Font Size**: ${bs.fontSize}`);
      if (bs.fontWeight)          lines.push(`- **Font Weight**: ${bs.fontWeight}`);
      if (bs.gradientStartColor && bs.gradientEndColor) {
        const dir = bs.gradientDirection || "135deg";
        lines.push(`- **Hero Gradient**: linear-gradient(${dir}, ${bs.gradientStartColor}, ${bs.gradientEndColor})`);
      }
      if (bs.customTone)          lines.push(`- **Tone & Voice**: ${bs.customTone}`);
      if (bs.customInstructions)  lines.push(`- **Additional Instructions**: ${bs.customInstructions}`);

      if (lines.length > 0) {
        brandGuidance = `\n**Custom Brand Guidelines:**\n${lines.join("\n")}\n`;
      }
    }

    const systemPrompt = `You are an expert email marketing specialist and HTML email designer.

Your task is to generate a complete, production-ready HTML email newsletter following industry best practices.

Layout reference (use this structure and styling cues):
- CRITICAL: The main content table MUST have width="600" as an HTML attribute (not just CSS). This ensures the header image, hero, content, and footer all render at exactly the same width with no gaps or misalignment.
- Structure: <table role="presentation" width="600" style="max-width:600px; width:100%;" ...> wrapping ALL sections including header, hero, content, and footer.
- Header section: use a simple text-based brand header inside the width="600" container. If branded assets are supplied in context, use them consistently; otherwise do not invent branded images.
  * Optional header asset: only use if one is explicitly provided in context
  * Keep any header treatment aligned to the 600px container width
- Hero section: Two-column table layout inside a solid/gradient brand-color background (use gradient from brand guidelines if provided, otherwise default linear-gradient 135deg, #0e0e6a → #3c3cf8), padding 40px 30px:
  * Left cell (width="60%" valign="middle"): white h1 headline (28–32px, bold, line-height 1.2, margin-bottom 12px) + white subtitle p (16–18px, normal, margin-bottom 0, opacity 0.9). If grounded facts contain specific key details (dates, pricing, availability, launch timing, or metrics), add 1–2 short bold fact lines in white below the subtitle.
  * Right cell (width="40%" valign="middle" align="center"): A decorative inline <svg> (width="120" height="120" viewBox="0 0 120 120") with a multi-path illustration relevant to the campaign topic. Use white strokes (stroke="white" stroke-width="2.5" fill="none") with semi-transparent white fills where appropriate. Pick EXACTLY one illustration from the list below based on the closest matching keyword in the topic:

    1. Launch / release / announcement / new feature:
       → Rocket + spark elements + product card.

    2. Growth / performance / results / momentum:
       → Ascending chart + arrow + metric badge.

    3. Education / guide / explainer / how-to:
       → Open book or document + highlight lines + pointer icon.

    4. Trust / security / reliability / compliance:
       → Shield + checkmark + pulse line.

    5. Productivity / operations / workflow / automation:
       → Connected nodes + gear + motion arrows.

    6. Community / event / webinar / partnership:
       → Calendar + people silhouettes + spotlight burst.

    7. Customer success / case study / testimonial:
       → Speech bubble + star accents + upward arrow.

    8. Offer / pricing / plan / subscription:
       → Ticket or pricing card + badge + CTA arrow.

    9. Mobile / app / onboarding / sign-up:
       → Smartphone frame + checklist + confirmation badge.

    10. General brand / thought leadership / update (fallback):
        → Abstract geometric shapes + stacked cards + accent stars.

    Use 5–8 distinct path/rect/circle/ellipse elements so the illustration looks rich and professional. Wrap all elements in <g stroke="white" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round">. Use fill="rgba(255,255,255,0.15)" or fill="rgba(255,255,255,0.3)" for accent fills on selected shapes.
- Intro paragraph and section dividers
- One main content section (TEXT-ONLY) with a heading and body that is directly relevant to the campaign purpose and target audience. Choose a section title and content focus that fits the purpose (e.g. "Key Insights", "What You Need to Know", "Strategies for [audience]", "Why This Matters for You") and write for the specified target audience. No images in this section.
- 3-column content grid: Each card must have:
  * A small inline <svg> icon (36×36px viewBox="0 0 24 24", aria-hidden="true", fill="none", stroke="#0000a0" or stroke="#00b34e", stroke-width="1.5") that is visually relevant to the card topic. Draw a simple, recognizable single-path icon (e.g. a chart, coin, shield, calendar, growth arrow). Do NOT use <img> for these icons.
  * headline
  * 1–2 sentence description
  * "Read more" button (rounded 24px, #00b34e background, white text, Figtree bold 12px, generous horizontal padding)
- CTA section to visit the brand website, resource center, or campaign destination
- Closing tagline and footer: use a clean text-based footer unless branded footer assets are explicitly provided
  * Optional footer asset: only use if one is explicitly provided in context
- Fonts: Figtree (load via Google Fonts); Colors: Navy/Blue (#0000a0 accents), CTA buttons #00b34e, body text #000
- Dividers: 1px solid #0000a0 consistent throughout sections
- Social icons bar: include only if social URLs are explicitly provided in context. Otherwise omit it.
  * LinkedIn: use provided brand URL if available
  * Instagram: use provided brand URL if available
  * X/Twitter: use provided brand URL if available
  * YouTube: use provided brand URL if available
  * Any additional channel: use provided brand URL if available
  Use 32px circle-color icons (e.g., https://app-rsrc.getbee.io/public/resources/social-networks-icon-sets/circle-color/linkedin@2x.png etc.) in a single horizontal row (centered) — use a table with inline-block cells and equal padding so icons do NOT stack vertically on desktop or mobile.

CRITICAL CONSTRAINTS:
- Do NOT invent logos, watermarks, or brand marks that were not provided in the request or active brand settings.
- Do NOT use placeholder images or dummy brand assets.
- Keep image usage minimal; prefer text and inline SVG unless brand-approved assets are explicitly provided.
- Inline <svg> elements ARE allowed and encouraged — use them for the hero illustration and card icons. No external <img> for illustrations.
- Do NOT repeat any provided brand asset unnecessarily within the same email.

📧 SUBJECT LINE BEST PRACTICES (from subjectline.com):
1. **Length**: 40-60 characters (optimal for mobile preview)
2. **Clarity**: Be specific and clear about the email content
3. **Urgency**: Use time-sensitive language when appropriate (without being spammy)
4. **Personalization**: Reference the audience or their interests
5. **Curiosity**: Tease valuable content without being clickbait
6. **Action-Oriented**: Use verbs and active language
7. **Numbers**: Include specific numbers/stats when relevant
8. **Avoid Spam Triggers**: No ALL CAPS, excessive punctuation!!!, or spam words (FREE, URGENT, ACT NOW)
9. **A/B Test Friendly**: Create variations if requested
10. **Emoji Usage**: Use sparingly and only if brand-appropriate

📧 EMAIL BEST PRACTICES:
- **Preheader Text**: 85-100 characters complementing subject line
- **Mobile-First**: 600px max width, single column, large tap targets (44px min)
- **Hierarchy**: Clear visual hierarchy with headings, body text, CTA
- **CTA Buttons**:
  * Primary CTA: Prominent, high contrast, 44px min height
  * Use brand colors for buttons
  * Clear action-oriented text (not just "Click Here")
  * Single primary CTA (multiple secondary CTAs ok)
- **Accessibility**:
  * Alt text for all images
  * Semantic HTML structure
  * High contrast text (WCAG AA compliant)
  * Screen reader friendly
- **Email Client Compatibility**:
  * Inline CSS (no external stylesheets)
  * Table-based layout for reliability
  * Tested across Gmail, Outlook, Apple Mail, Yahoo
  * Fallback fonts: Arial, Helvetica, sans-serif
- **Footer Requirements**:
  * Company address
  * Unsubscribe link (required by CAN-SPAM)
  * Social media links
  * View in browser link

Campaign Details:
- Topic: ${topic}
- Purpose: ${purpose}
- Target Audience: ${targetAudience}
- Language: ${language}

${referenceExamples ? `Reference examples (use for tone, structure, and messaging inspiration — align with these campaign themes and style cues):\n${referenceExamples.slice(0, 3000)}\n\n` : ""}
${creativePrompt ? `Creative Direction:\n${creativePrompt}\n` : ""}

${brandGuidance ? `Brand Requirements:\n${brandGuidance}\nIMPORTANT: You MUST use these exact brand colors in the email HTML.` : ""}

CONTENT REQUIREMENTS:
You MUST create content that is:
1. SPECIFICALLY about the topic "${topic}" - not generic filler or domain assumptions
2. Tailored to the "${purpose}" purpose - ensure the content serves this exact goal
3. Written for "${targetAudience}" - use appropriate language, examples, and context for this audience
4. Include specific insights, data points, or strategies relevant to the topic
5. Each section should provide unique, actionable information
6. Avoid generic statements - be specific and provide real value
7. Use the creative direction above to guide tone, messaging, and content structure
8. Make every paragraph count - no filler content
9. LANGUAGE: ALL content MUST be written entirely in "${language}". This includes the subject line, preheader, all headings, body copy, card titles, card descriptions, CTA button text, and footer text. Do NOT mix languages.

LANGUAGE ENFORCEMENT: The output language is "${language}". Every word of every field in the JSON response — subject, preheader, subjectVariations, html body text, and plainText — MUST be in "${language}". If the language is not English, translate all UI strings (e.g. "Read more", "Unsubscribe", "View in Browser") to "${language}" as well.

Generate a complete JSON response with:

{
  "subject": "The email subject line (40-60 chars)",
  "preheader": "Preview text that appears after subject line (85-100 chars)",
  "subjectVariations": ["Alternative subject 1", "Alternative subject 2"],
  "html": "Complete HTML email code (inline CSS, table-based layout, mobile-responsive)",
  "plainText": "Plain text version of the email (for text-only email clients)"
}

The HTML must be:
1. Complete and production-ready (can be sent as-is)
2. Fully responsive (mobile-first design)
3. Use inline CSS only
4. Use table-based layout for compatibility
5. Include all brand colors from guidelines
6. Have clear visual hierarchy
7. Include at least one prominent CTA button
8. Have a proper footer with unsubscribe link
9. Be accessible (alt text, semantic structure)
10. Work across all major email clients

Structure your HTML like this:
- DOCTYPE and basic HTML structure
- Head with viewport meta and styles
- Body with table-based layout:
  * Header section with logo
  * Hero section with main message
  * Content sections (benefits, features, etc.)
  * Primary CTA section
  * Footer with contact info, social links, unsubscribe

Use the brand colors specified in the guidelines for:
- Header background
- CTA buttons
- Section accents
- Links
- Footer background

Make the HTML production-ready - it should render beautifully in all email clients.`;

    const hasRefImage = typeof referenceImageBase64 === "string" && referenceImageBase64.length > 0;

    const ai = new GoogleGenAI({ apiKey: geminiApiKey });

    // Step 1: Grounding search — fetch current, verified facts about the topic.
    // NOTE: grounding and responseMimeType:"application/json" are mutually exclusive,
    // so this runs as a separate call before the main JSON generation.
    let groundedContext = "";
    try {
      const groundingRes = await ai.models.generateContent({
        model: MODEL,
        contents: [{
          role: "user",
          parts: [{
            text: `Search the web for current, accurate information about: "${topic}". Focus on the most relevant factual details for this topic, such as launch timing, feature details, product or service capabilities, pricing or packaging when available, audience relevance, notable metrics, availability, recent announcements, and trustworthy third-party coverage. Be factual, specific, and industry-agnostic. Summarize in 200–300 words.`,
          }],
        }],
        config: {
          tools: [{ googleSearch: {} }],
          temperature: 0.1,
          maxOutputTokens: 600,
        },
      });
      groundedContext = await getGeminiText(groundingRes);
      console.log(`Grounding search done (${groundedContext.length} chars)`);
    } catch (groundingErr) {
      console.warn("Grounding search failed, proceeding without:", groundingErr instanceof Error ? groundingErr.message : groundingErr);
    }

    console.log(`Generating email newsletter with ${MODEL}${hasRefImage ? " (with visual reference)" : ""}...`);

    const groundingSection = groundedContext
      ? `CURRENT VERIFIED FACTS (from live web search — prefer these for specific details):\n${groundedContext}`
      : "";

    const userContextSections = [
      `Campaign Details:\n- Topic: ${topic}\n- Purpose: ${purpose}\n- Target Audience: ${targetAudience}\n- Language: ${language}`,
      creativePrompt ? `Creative Direction from Stage 1:\n${creativePrompt}` : "",
      brandGuidance ? `Brand Requirements:\n${brandGuidance}\nIMPORTANT: Use these exact brand colors and tone in the final email HTML.` : "",
      referenceExamples ? `Reference examples for tone and structure:\n${referenceExamples.slice(0, 3000)}` : "",
      groundingSection,
      hasRefImage
        ? "Uploaded reference image is attached in this request. Use it as the primary visual/layout reference for hero composition, section order, feature-grid rhythm, spacing, and CTA placement. Keep email-client compatibility requirements intact, but let the uploaded reference dominate the visual direction."
        : "No uploaded reference image is attached. Follow the required email structure and brand rules, and keep the content generic to the provided topic rather than any assumed industry.",
    ].filter(Boolean);

    const userText = `${userContextSections.join("\n\n")}\n\nGenerate a professional email newsletter for this campaign. Return only the requested JSON object.`;
    const contentParts: any[] = hasRefImage
      ? [
          { text: userText },
          { inlineData: { mimeType: referenceImageMime, data: referenceImageBase64 } },
          { text: "The attached image is the primary visual reference. Mirror its visual hierarchy, hero composition, section sequencing, feature-card density, and CTA emphasis as closely as possible while producing valid production-ready email HTML." },
        ]
      : [{ text: userText }];

    const response = await ai.models.generateContent({
      model: MODEL,
      contents: [{ role: "user", parts: contentParts }],
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.7,
        maxOutputTokens: 8000,
        responseMimeType: "application/json",
      },
    });

    const generatedContent = await getGeminiText(response);

    if (!generatedContent) {
      throw new Error(`No email content generated from ${MODEL}`);
    }

    // Try to parse as JSON first
    let emailData;
    try {
      // Extract JSON from markdown code blocks if present
      const jsonMatch = generatedContent.match(/```json\n([\s\S]*?)\n```/) ||
        generatedContent.match(/```\n([\s\S]*?)\n```/) || [
          null,
          generatedContent,
        ];

      const jsonContent = jsonMatch[1] || generatedContent;
      emailData = JSON.parse(jsonContent);
    } catch (parseError) {
      // If not valid JSON, try to extract components manually
      console.warn("Failed to parse as JSON, attempting manual extraction");

      const subjectMatch =
        generatedContent.match(/"subject":\s*"([^"]+)"/) ||
        generatedContent.match(/Subject:\s*(.+)/i);
      const preheaderMatch =
        generatedContent.match(/"preheader":\s*"([^"]+)"/) ||
        generatedContent.match(/Preheader:\s*(.+)/i);
      const htmlMatch =
        generatedContent.match(/"html":\s*"([\s\S]*?)"(?=,\s*"plainText"|$)/) ||
        generatedContent.match(/<!DOCTYPE[\s\S]*<\/html>/i);

      emailData = {
        subject: subjectMatch
          ? subjectMatch[1].trim()
          : `${topic} - Newsletter`,
        preheader: preheaderMatch
          ? preheaderMatch[1].trim()
          : `Discover insights about ${topic}`,
        subjectVariations: [
          `${topic} - Exclusive Insights`,
          `Your Guide to ${topic}`,
        ],
        html: htmlMatch
          ? (htmlMatch[1] || htmlMatch[0])
              .replace(/\\n/g, "\n")
              .replace(/\\"/g, '"')
          : generatedContent,
        plainText: `${topic}\n\nView this email in your browser for the best experience.`,
      };
    }

    console.log("Email newsletter generated successfully");

    return NextResponse.json({
      ...emailData,
      html:
        typeof emailData?.html === "string"
          ? sanitizeNewsletterHtml(emailData.html)
          : emailData?.html,
      model: MODEL,
      usage: (response as any)?.usageMetadata || null,
      groundedContext: groundedContext || null,
    });
  } catch (error) {
    console.error("Error generating email newsletter:", error);
    return NextResponse.json(
      {
        error: "Failed to generate email newsletter",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
