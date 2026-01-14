import { NextResponse } from 'next/server';

interface PromptRequest {
  userPrompt: string;
  reelType: 'educational' | 'market_update' | 'viral_hook' | 'advisor' | 'cinematic';
}

const STYLE_TOKENS = "Color Palette: Emerald green, deep navy blue, and gold accents. Lighting: Soft studio lighting, rim light for separation. Vibe: Professional, trustworthy, premium, modern fintech.";

const TEMPLATES = {
  educational: (input: string) => `A high-resolution 4k animation of a financial dashboard. ${input}. The background is a subtle, clean white marble texture. Professional financial aesthetic, legible text, smooth motion. ${STYLE_TOKENS}`,
  
  market_update: (input: string) => `A cinematic 4k close-up of a stock market ticker board. ${input}. Digital particles float in the air. High contrast, tech-focused financial news style. ${STYLE_TOKENS}`,
  
  viral_hook: (input: string) => `Cinematic photorealistic shot. ${input}. Intense atmosphere, dramatic lighting, depth of field, shot on ARRI. Audio: Ambient office sounds, typing, low rumbling. ${STYLE_TOKENS}`,
  
  advisor: (input: string) => `(Input Image: Advisor_Character) Animate this character speaking naturally to the camera. ${input}. He should look calm and reassuring. Use gentle hand gestures to emphasize stability. Warm, soft office lighting. Sync lips perfectly to the provided audio track. ${STYLE_TOKENS}`,
  
  cinematic: (input: string) => `Cinematic masterpiece, highly detailed, 8k resolution. ${input}. Photorealistic, dramatic lighting, slow motion. ${STYLE_TOKENS}`
};

const MODEL_MAPPING = {
  educational: 'wan-2.5',
  market_update: 'wan-2.5',
  viral_hook: 'kling-2.6',
  advisor: 'omnihuman-1.5',
  cinematic: 'runway-gen-4'
};

export async function POST(request: Request) {
  try {
    const body: PromptRequest = await request.json();
    const { userPrompt, reelType } = body;

    if (!userPrompt || !reelType) {
      return NextResponse.json({ error: 'Missing userPrompt or reelType' }, { status: 400 });
    }

    const templateFn = TEMPLATES[reelType] || TEMPLATES.cinematic;
    const optimizedPrompt = templateFn(userPrompt);
    const recommendedModel = MODEL_MAPPING[reelType] || 'kling-2.6';

    return NextResponse.json({
      optimizedPrompt,
      recommendedModel,
      reelType
    });

  } catch (error) {
    console.error('Error generating prompt:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
