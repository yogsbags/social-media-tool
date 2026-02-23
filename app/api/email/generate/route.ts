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

    // Build brand guidelines — handle both default PL Capital and custom overrides
    const bs = brandSettings || {};
    let brandGuidance = "";
    if (bs.useBrandGuidelines) {
      brandGuidance = `
**PL Capital Brand Guidelines:**
- **Primary Colors**: Navy (#0e0e6a), Blue (#3c3cf8)
- **Accent Colors**: Teal (#00d084), Green (#66e766)
- **Typography**: Figtree font family, professional sans-serif fallbacks
- **Tone & Voice**: Professional, trustworthy, data-driven yet approachable
- **Visual Style**: Clean, modern, corporate with subtle tech motifs
- **Key Values**: Trust, Innovation, Performance, Client-First
- **Messaging**: Focus on adaptive strategies, quantitative excellence, consistent alpha
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
- Header section (DO NOT change): keep exactly this header image linked to plindia.com — it must be inside the width="600" container so it aligns perfectly with the hero below it
  * Header image: https://d314e77m1bz5zy.cloudfront.net/bee/Images/bmsx/p7orqos0/xtp/w8t/1aj/Asset%201.png
  * Image tag must have: width="600" style="width:100%; max-width:600px; display:block;"
- Hero section: Two-column table layout inside a solid/gradient brand-color background (use gradient from brand guidelines if provided, otherwise default linear-gradient 135deg, #0e0e6a → #3c3cf8), padding 40px 30px:
  * Left cell (width="60%" valign="middle"): white h1 headline (28–32px, bold, line-height 1.2, margin-bottom 12px) + white subtitle p (16–18px, normal, margin-bottom 0, opacity 0.9). If grounded facts contain specific key details (NFO dates, minimum investment, NAV price), add 1–2 short bold fact lines in white below the subtitle.
  * Right cell (width="40%" valign="middle" align="center"): A decorative inline <svg> (width="120" height="120" viewBox="0 0 120 120") with a multi-path illustration relevant to the campaign topic. Use white strokes (stroke="white" stroke-width="2.5" fill="none") with semi-transparent white fills where appropriate. Pick EXACTLY one illustration from the list below based on the closest matching keyword in the topic:

    1. SIP / systematic investment / monthly investment / recurring:
       → Calendar with recurring arrows: rect(30,25,60,55,rx=4) for calendar body; 3 vertical lines inside for date columns; a circular arrow (arc path) below the calendar; an upward trending polyline (30,95 → 50,80 → 70,85 → 90,65) representing growth.

    2. NFO / new fund offer / IPO / fund launch / subscription:
       → Rocket launch + fund document: a rocket shape (body=ellipse cx=60 cy=50 rx=12 ry=22, fins=two small triangles at base); flame at bottom (small filled path); a document rect(38,70,44,30,rx=2) with 3 short horizontal lines inside for text; a star at top-right.

    3. Mutual fund / diversified fund / balanced fund / hybrid fund:
       → Pie chart + plant: circle(cx=55,cy=50,r=28) split into 4 unequal arc segments (use path commands for 4 sectors, each a different semi-transparent fill); a plant stem rising from bottom-right (path M75,95 Q80,70 90,55) with 2 leaf shapes; a rupee symbol (₹) at the top of the stem.

    4. Small cap / mid cap / sector fund / thematic / equity fund:
       → Ascending bar chart + magnifying glass: 4 bars of heights 20,35,50,70 starting at y=95 (rect elements, fill semi-transparent white); upward arrow at top-right; a circle(cx=85,cy=35,r=15) with a line extending from it (magnifying glass), representing discovery of hidden gems.

    5. Stocks / equity / trading / technical picks / market / Nifty / Sensex:
       → Candlestick chart + trend arrow: 3 candle bodies (rects of varying height at x=35,55,75, y positions varied); thin vertical wicks extending above and below each body; a bold upward-right diagonal arrow overlay from bottom-left to top-right of the chart area.

    6. Demat / account opening / KYC / onboarding / paperless:
       → Smartphone + KYC checkmark: rounded-rect phone (rx=8, approx 35,15,50,90); 3 ascending bars on the screen (fill semi-transparent); a circular badge at bottom-right of phone (circle r=14) with a bold checkmark path inside it.

    7. Insurance / term plan / health / protection / cover / life cover:
       → Shield + heartbeat: large shield path (M60,20 L85,35 L85,65 Q85,90 60,100 Q35,90 35,65 L35,35 Z); inside the shield, a heartbeat/ECG line (M40,60 L50,60 L55,45 L60,75 L65,45 L70,60 L80,60) — NOT a static heart.

    8. Tax / ELSS / tax saving / 80C / tax-free / tax planning:
       → Calculator + savings: rect(35,25,50,65,rx=4) for calculator body; small rect(42,32,36,12) for display screen; a 3×3 grid of tiny dots (keypad); a piggy bank silhouette (circle cx=82 cy=72 r=18, ear triangle, snout circle, leg lines) to the right.

    9. Bonds / fixed income / NPS / debt fund / FD / fixed deposit:
       → Bond certificate + steady graph: a certificate rect(28,30,64,55,rx=3) with a ribbon/seal (circle cx=60 cy=85 r=10) and % symbol inside the seal; a flat-to-slightly-rising polyline (28,80 → 55,75 → 92,70) below the cert, representing steady returns.

    10. General wealth / portfolio / retirement / financial planning / returns (fallback for anything not matching above):
        → Coins stack + rising arrow + stars: 3 stacked coin ellipses (cx=60, rx=22, ry=6, at y=85,78,71); a bold upward arrow (M60,60 L60,25 M48,37 L60,25 L72,37); 2 small 4-point star shapes at top corners.

    Use 5–8 distinct path/rect/circle/ellipse elements so the illustration looks rich and professional. Wrap all elements in <g stroke="white" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round">. Use fill="rgba(255,255,255,0.15)" or fill="rgba(255,255,255,0.3)" for accent fills on selected shapes.
- Intro paragraph and section dividers
- One main content section (TEXT-ONLY) with a heading and body that is directly relevant to the campaign purpose and target audience. Choose a section title and content focus that fits the purpose (e.g. "Key Insights", "What You Need to Know", "Strategies for [audience]", "Why This Matters for You") and write for the specified target audience. No images in this section.
- 3-column content grid: Each card must have:
  * A small inline <svg> icon (36×36px viewBox="0 0 24 24", aria-hidden="true", fill="none", stroke="#0000a0" or stroke="#00b34e", stroke-width="1.5") that is visually relevant to the card topic. Draw a simple, recognizable single-path icon (e.g. a chart, coin, shield, calendar, growth arrow). Do NOT use <img> for these icons.
  * headline
  * 1–2 sentence description
  * "Read more" button (rounded 24px, #00b34e background, white text, Figtree bold 12px, generous horizontal padding)
- CTA section to visit PL Capital News
- Closing tagline and footer image (DO NOT change): keep exactly this footer image
  * Footer image: https://d314e77m1bz5zy.cloudfront.net/bee/Images/bmsx/p7orqos0/9wn/vw0/ds6/Asset%202.png
- Fonts: Figtree (load via Google Fonts); Colors: Navy/Blue (#0000a0 accents), CTA buttons #00b34e, body text #000
- Dividers: 1px solid #0000a0 consistent throughout sections
- Social icons bar (below footer image): centered row of circular color icons linking to:
  * LinkedIn: https://www.linkedin.com/company/prabhudaslilladher/
  * Instagram: https://www.instagram.com/prabhudaslilladher/
  * X/Twitter: https://x.com/PLIndiaOnline
  * YouTube: https://www.youtube.com/@PrabhudasLilladherIndia
  * Telegram: https://t.me/PLIndiaOnline
  Use 32px circle-color icons (e.g., https://app-rsrc.getbee.io/public/resources/social-networks-icon-sets/circle-color/linkedin@2x.png etc.) in a single horizontal row (centered) — use a table with inline-block cells and equal padding so icons do NOT stack vertically on desktop or mobile.

CRITICAL CONSTRAINTS:
- Do NOT add any logos/brand marks beyond the provided header + footer images (do not introduce a new logo, watermark, or badge).
- Do NOT use any placeholder images/URLs (no via.placeholder.com, no dummy banners).
- The ONLY <img> tags allowed in the entire email are: the provided header image, the provided footer image, and the social icon set.
- Inline <svg> elements ARE allowed and encouraged — use them for the hero illustration and card icons. No external <img> for illustrations.
- Do NOT repeat the header image anywhere else (especially not as a hero image).

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
1. SPECIFICALLY about the topic "${topic}" - not generic financial advice
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
            text: `Search the web for current, accurate information about: "${topic}". Focus on: key dates (NFO open/close dates, subscription period), fund details (minimum investment, benchmark index, fund category), fund manager name and experience, investment objective, risk level, any recent news or analyst opinions. Be factual and specific. Summarize in 200–300 words.`,
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
      ? `\n\nCURRENT VERIFIED FACTS (from live web search — use these in preference to training knowledge for specific details):\n${groundedContext}\n`
      : "";

    const userText = `${systemPrompt}${groundingSection}\n\nUser request: Generate a professional email newsletter for: ${topic}`;
    const contentParts: any[] = hasRefImage
      ? [
          { text: userText },
          { inlineData: { mimeType: referenceImageMime, data: referenceImageBase64 } },
          { text: "The image above is a visual layout reference. Study its section structure, color palette, spacing proportions, card grid arrangement, and typographic hierarchy. Reproduce those design decisions faithfully in the HTML you generate — adapt the content for the new topic but keep the visual language consistent." },
        ]
      : [{ text: userText }];

    const response = await ai.models.generateContent({
      model: MODEL,
      contents: [{ role: "user", parts: contentParts }],
      config: {
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
