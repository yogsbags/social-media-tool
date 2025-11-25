const fs = require('fs');
const path = require('path');
const StateManager = require('./state-manager');
const ImageGenerator = require('../image/image-generator');
const VideoCoordinator = require('../video/video-coordinator');
const { getMoengageEmailPublisher } = require('../integrations/moengage-email-publisher');
const { getMoengageClient } = require('../integrations/moengage-client');

class SocialMediaOrchestrator {
  constructor(options = {}) {
    this.projectRoot = options.projectRoot || process.cwd();
    this.simulate = options.simulate || false;
    this.limit = options.limit || null;

    this.stateManager = new StateManager(path.join(this.projectRoot, 'data'));
  }

  /**
   * Initialize the workflow system
   */
  async initialize() {
    console.log('📦 Initializing workflow state...');
    await this.stateManager.initialize();
    console.log('✅ Workflow state loaded');
  }

  /**
   * Display ASCII banner
   */
  displayBanner() {
    console.log('');
    console.log('╔═══════════════════════════════════════════════════════════════════╗');
    console.log('║                                                                   ║');
    console.log('║   🚀 SOCIAL MEDIA CAMPAIGN AUTOMATION                             ║');
    console.log('║   AI-Powered Multi-Platform Content & Video Production            ║');
    console.log('║                                                                   ║');
    console.log('║   Platforms: LinkedIn │ Instagram │ YouTube │ Facebook │ Twitter  ║');
    console.log('║   Video: Veo 3.1 │ HeyGen │ Shotstack │ Flux                      ║');
    console.log('║                                                                   ║');
    console.log('╚═══════════════════════════════════════════════════════════════════╝');
    console.log('');
  }

  /**
   * Show workflow status
   */
  async showStatus() {
    console.log('\n' + '='.repeat(72));
    console.log('📊 SOCIAL MEDIA CAMPAIGN STATUS');
    console.log('='.repeat(72) + '\n');

    const state = this.stateManager.state;

    // Campaigns
    const campaigns = Object.values(state.campaigns || {});
    console.log('📋 CAMPAIGNS:');
    console.log(`   Total: ${campaigns.length}`);

    const byPlatform = {};
    campaigns.forEach(c => {
      byPlatform[c.platform] = (byPlatform[c.platform] || 0) + 1;
    });

    console.log('\n   By Platform:');
    Object.entries(byPlatform).forEach(([platform, count]) => {
      console.log(`   - ${platform.padEnd(15)}: ${count}`);
    });

    // Content pieces
    const content = Object.values(state.content || {});
    console.log(`\n📝 CONTENT PIECES: ${content.length}`);

    const byStatus = {
      draft: content.filter(c => c.status === 'draft').length,
      'ready-for-visual': content.filter(c => c.status === 'ready-for-visual').length,
      'visual-ready': content.filter(c => c.status === 'visual-ready').length,
      'video-ready': content.filter(c => c.status === 'video-ready').length,
      'ready-to-publish': content.filter(c => c.status === 'ready-to-publish').length,
      published: content.filter(c => c.status === 'published').length
    };

    console.log('\n   By Status:');
    Object.entries(byStatus).forEach(([status, count]) => {
      if (count > 0) {
        console.log(`   - ${status.padEnd(20)}: ${count}`);
      }
    });

    // API Configuration
    console.log('\n🔑 API CONFIGURATION:');
    console.log(`   Groq (Content):    ${process.env.GROQ_API_KEY ? '✅' : '❌'}`);
    console.log(`   HeyGen (Avatar):   ${process.env.HEYGEN_API_KEY ? '✅' : '❌'}`);
    console.log(`   Gemini (VEO):      ${process.env.GEMINI_API_KEY ? '✅' : '❌'}`);
    console.log(`   fal.ai (LongCat):  ${process.env.FAL_KEY ? '✅' : '⚠️  Optional (for videos >148s)'}`);
    console.log(`   Replicate (Flux):  ${process.env.REPLICATE_API_TOKEN ? '✅' : '⚠️  Optional'}`);
    console.log(`   Shotstack (Edit):  ${process.env.SHOTSTACK_API_KEY ? '✅' : '⚠️  Optional'}`);
    console.log(`   ImgBB (Host):      ${process.env.IMGBB_API_KEY ? '✅' : '⚠️  Optional'}`);

    console.log('\n' + '='.repeat(72) + '\n');
  }

  /**
   * Run specific campaign type
   */
  async runCampaign(campaignType, options = {}) {
    const campaignHandlers = {
      'linkedin-carousel': this.runLinkedInCarousel.bind(this),
      'linkedin-testimonial': this.runLinkedInTestimonial.bind(this),
      'linkedin-data-viz': this.runLinkedInDataViz.bind(this),
      'instagram-reel': this.runInstagramReel.bind(this),
      'instagram-carousel': this.runInstagramCarousel.bind(this),
      'youtube-explainer': this.runYouTubeExplainer.bind(this),
      'youtube-short': this.runYouTubeShort.bind(this),
      'facebook-community': this.runFacebookCommunity.bind(this),
      'twitter-thread': this.runTwitterThread.bind(this),
      'email-newsletter': this.runEmailNewsletter.bind(this)
    };

    const handler = campaignHandlers[campaignType];
    if (!handler) {
      throw new Error(`Unknown campaign type: ${campaignType}`);
    }

    return await handler(options);
  }

  /**
   * Run specific workflow stage
   */
  async runStage(stageName, options = {}) {
    const stageHandlers = {
      planning: this.stagePlanning.bind(this),
      content: this.stageContent.bind(this),
      visuals: this.stageVisuals.bind(this),
      video: this.stageVideo.bind(this),
      publishing: this.stagePublishing.bind(this),
      tracking: this.stageTracking.bind(this)
    };

    const handler = stageHandlers[stageName];
    if (!handler) {
      throw new Error(`Unknown stage: ${stageName}`);
    }

    return await handler(options);
  }

  /**
   * CAMPAIGN HANDLERS
   */

  async runLinkedInCarousel(options) {
    console.log('📊 LinkedIn Carousel Campaign');
    console.log(`   Topic: ${options.topic}`);
    console.log(`   Type: ${options.type || 'myth-busting'}\n`);

    // Stage 1: Generate content
    await this.stageContent({
      platform: 'linkedin',
      format: 'carousel',
      topic: options.topic,
      type: options.type
    });

    // Stage 2: Generate images
    await this.stageVisuals({
      platform: 'linkedin',
      format: 'carousel'
    });

    // Stage 3: Auto-publish if requested
    if (options.autoPublish) {
      await this.stagePublishing({ platform: 'linkedin' });
    }

    console.log('\n✅ LinkedIn carousel ready!');
  }

  async runLinkedInTestimonial(options) {
    console.log('🎥 LinkedIn Video Testimonial Campaign');
    console.log(`   Topic: ${options.topic}`);
    console.log(`   Duration: ${options.duration}s\n`);

    // Stage 1: Generate script
    await this.stageContent({
      platform: 'linkedin',
      format: 'video-testimonial',
      topic: options.topic,
      duration: options.duration
    });

    // Stage 2: Generate video
    await this.stageVideo({
      platform: 'linkedin',
      format: 'testimonial',
      duration: options.duration,
      useVeo: options.useVeo,
      useAvatar: options.useAvatar,
      waitForCompletion: options.waitForCompletion
    });

    // Stage 3: Auto-publish if requested
    if (options.autoPublish) {
      await this.stagePublishing({ platform: 'linkedin' });
    }

    console.log('\n✅ LinkedIn video testimonial ready!');
  }

  async runInstagramReel(options) {
    console.log('📱 Instagram Reel Campaign');
    console.log(`   Topic: ${options.topic}`);
    console.log(`   Duration: ${options.duration}s\n`);

    // Generate short-form vertical video
    await this.stageContent({
      platform: 'instagram',
      format: 'reel',
      topic: options.topic,
      duration: options.duration
    });

    await this.stageVideo({
      platform: 'instagram',
      format: 'reel',
      aspectRatio: '9:16',
      duration: options.duration,
      useVeo: options.useVeo,
      useAvatar: options.useAvatar,
      waitForCompletion: options.waitForCompletion
    });

    if (options.autoPublish) {
      await this.stagePublishing({ platform: 'instagram' });
    }

    console.log('\n✅ Instagram reel ready!');
  }

  async runYouTubeExplainer(options) {
    console.log('📺 YouTube Explainer Campaign');
    console.log(`   Topic: ${options.topic}`);
    console.log(`   Duration: ${options.duration}s (${Math.floor(options.duration / 60)} min)\n`);

    // Generate long-form educational content
    await this.stageContent({
      platform: 'youtube',
      format: 'explainer',
      topic: options.topic,
      duration: options.duration
    });

    await this.stageVideo({
      platform: 'youtube',
      format: 'explainer',
      aspectRatio: '16:9',
      duration: options.duration,
      useVeo: options.useVeo || (options.duration > 60), // Auto-use Veo for 60s+
      useAvatar: options.useAvatar,
      waitForCompletion: options.waitForCompletion
    });

    if (options.autoPublish) {
      await this.stagePublishing({ platform: 'youtube' });
    }

    console.log('\n✅ YouTube explainer ready!');
  }

  /**
   * WORKFLOW STAGE IMPLEMENTATIONS
   */

  async stagePlanning(options) {
    console.log('📋 Stage 1: Campaign Planning');
    console.log('   - Selecting campaign type');
    console.log('   - Defining target platforms');
    console.log('   - Setting success metrics\n');

    // Placeholder for planning logic
    if (this.simulate) {
      console.log('   [SIMULATED] Planning completed');
    }
  }

  async stageContent(options) {
    console.log('✍️  Stage 2: Content Generation');
    console.log(`   Platform: ${options.platform}`);
    console.log(`   Format: ${options.format}`);
    console.log(`   Topic: ${options.topic}\n`);

    // Placeholder for content generation
    if (this.simulate) {
      console.log('   [SIMULATED] Content generated');
      return;
    }

    // For WhatsApp static creative, delegate to visual generation now
    const isWhatsAppImage = (options.platform && options.platform.includes('whatsapp')) ||
      (options.type && options.type.includes('whatsapp')) ||
      options.format === 'whatsapp' ||
      options.format === 'image';

    if (isWhatsAppImage) {
      console.log('   📷 Generating WhatsApp static creative with Gemini 3 Pro Image Preview...');
      const prompt = options.prompt || this._buildVisualPrompt({
        platform: 'whatsapp',
        format: 'image',
        topic: options.topic,
        type: options.type
      });

      const result = await this.stageVisuals({
        platform: 'whatsapp',
        format: 'image',
        topic: options.topic,
        type: options.type,
        prompt
      });

      if (result?.success) {
        console.log('   ✅ WhatsApp creative generated');
        return result;
      }

      console.log('   ⚠️ WhatsApp creative generation failed or returned no result');
      return;
    }

    // TODO: Implement other AI content generation
    console.log('   ⚠️  Content generation not yet implemented for this platform');
  }

  async stageVisuals(options) {
    console.log('🎨 Stage 3: Visual Asset Production');
    console.log(`   Platform: ${options.platform}`);
    console.log(`   Format: ${options.format}`);
    console.log(`   Model: Gemini 3 Pro Image Preview (4K, Grounded)\n`);

    // Placeholder for visual generation
    if (this.simulate) {
      console.log('   [SIMULATED] Visuals generated');
      return { success: true, simulated: true };
    }

    // Check for API key
    if (!process.env.GEMINI_API_KEY) {
      console.log('   ⚠️  GEMINI_API_KEY not set. Set it with: export GEMINI_API_KEY="your-key"');
      return { success: false, error: 'Missing GEMINI_API_KEY' };
    }

    try {
      // Initialize ImageGenerator with Gemini 3 Pro as primary
      const generator = new ImageGenerator({
        apiKey: process.env.GEMINI_API_KEY,
        provider: 'gemini'
      });

      // Generate platform-specific graphics using Gemini 3 Pro
      const prompt = options.prompt || this._buildVisualPrompt(options);
      console.log(`   Prompt: ${prompt.substring(0, 80)}...`);
      console.log('   ⏳ Generating image (Gemini 3 Pro, 4K)...\n');

      const result = await generator.generateSocialGraphic(prompt, options.platform, {
        imageSize: '4K',
        useGrounding: true,
        aspectRatio: this._getAspectRatioForFormat(options.format)
      });

      console.log(`   ✅ Visual generated: ${result.images[0]?.path || 'success'}`);
      console.log(`   Features: ${result.features?.join(', ') || 'N/A'}`);

      return {
        success: true,
        images: result.images,
        features: result.features
      };
    } catch (error) {
      console.error(`   ❌ Visual generation failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Build visual prompt based on options
   */
  _buildVisualPrompt(options) {
    const { platform, format, topic, type } = options;

    const basePrompts = {
      linkedin: `Professional ${format} graphic for LinkedIn about ${topic || 'financial investment'}. Corporate blue and green color scheme, clean modern design, trust-building aesthetic.`,
      instagram: `Eye-catching ${format} visual for Instagram about ${topic || 'investment growth'}. Vibrant colors, modern gradient background, engaging social media aesthetic.`,
      youtube: `High-quality ${format} thumbnail/graphic for YouTube about ${topic || 'wealth building'}. Bold text, high contrast, attention-grabbing design.`,
      facebook: `Engaging ${format} post graphic for Facebook about ${topic || 'financial planning'}. Community-focused, accessible design, clear messaging.`,
      twitter: `Concise ${format} visual for Twitter about ${topic || 'market insights'}. Clean, minimal design optimized for quick engagement.`
    };

    return basePrompts[platform] || basePrompts.linkedin;
  }

  /**
   * Get optimal aspect ratio for content format
   */
  _getAspectRatioForFormat(format) {
    const aspectRatios = {
      'carousel': '1:1',
      'post': '1:1',
      'story': '9:16',
      'reel': '9:16',
      'thumbnail': '16:9',
      'explainer': '16:9',
      'cover': '16:9'
    };

    return aspectRatios[format] || '1:1';
  }

  async stageVideo(options) {
    console.log('🎥 Stage 4: Video Production');
    console.log(`   Platform: ${options.platform}`);
    console.log(`   Duration: ${options.duration}s`);
    console.log(`   Aspect Ratio: ${options.aspectRatio || '16:9'}`);
    console.log(`   Method: ${options.useVeo ? 'Veo 3.1' : 'Auto-detect'} ${options.useAvatar ? '+ Avatar' : ''}\n`);

    if (this.simulate) {
      console.log('   [SIMULATED] Video generated');
      return { success: true, simulated: true };
    }

    // Check for LongCat configuration from environment variables
    const useLongCat = process.env.LONGCAT_ENABLED === 'true';
    const longCatMode = process.env.LONGCAT_MODE || 'text-to-video';
    const longCatPrompt = process.env.LONGCAT_PROMPT || '';

    try {
      // Initialize video coordinator
      const coordinator = new VideoCoordinator({
        simulate: this.simulate,
        outputDir: path.join(this.projectRoot, 'output', 'videos')
      });

      // Build video generation prompt
      const prompt = longCatPrompt || this._buildVideoPrompt(options);

      // Configure video generation
      const videoConfig = {
        prompt: prompt,
        duration: options.duration || 90,
        mode: longCatMode,
        aspectRatio: options.aspectRatio || '16:9',
        useLongCat: useLongCat,
        useVeo: options.useVeo && !useLongCat // Don't use VEO if LongCat is explicitly enabled
      };

      console.log(`\n📹 Generating video...`);
      console.log(`   Provider: ${useLongCat ? 'LongCat (fal.ai)' : options.useVeo ? 'VEO 3.1' : 'Auto'}`);
      console.log(`   Mode: ${videoConfig.mode}`);

      // Generate video
      const result = await coordinator.generateVideo(videoConfig);

      console.log(`\n✅ Video generation completed!`);
      console.log(`   Video path: ${result.localPath || result.videoUrl}`);
      console.log(`   Duration: ${result.duration}s`);

      return {
        success: true,
        videoUrl: result.videoUrl,
        localPath: result.localPath,
        duration: result.duration,
        metadata: result.metadata
      };

    } catch (error) {
      console.error(`\n❌ Video production failed: ${error.message}`);

      // Check for missing API keys
      if (error.message.includes('FAL_KEY')) {
        console.error('   Set FAL_KEY environment variable for LongCat video generation');
      }
      if (error.message.includes('GEMINI_API_KEY')) {
        console.error('   Set GEMINI_API_KEY environment variable for VEO video generation');
      }

      return { success: false, error: error.message };
    }
  }

  /**
   * Build video generation prompt based on options
   */
  _buildVideoPrompt(options) {
    const { platform, format, topic, type } = options;

    const basePrompts = {
      linkedin: `Professional ${format || 'business'} video about ${topic || 'financial services'}. Corporate aesthetic, trustworthy presentation, executive tone.`,
      instagram: `Engaging ${format || 'reel'} video about ${topic || 'investment tips'}. Dynamic visuals, modern aesthetic, social media optimized.`,
      youtube: `Educational ${format || 'explainer'} video about ${topic || 'wealth building'}. Clear explanations, professional presentation, engaging content.`,
      facebook: `Community-focused ${format || 'post'} video about ${topic || 'financial planning'}. Accessible content, relatable presentation.`,
      twitter: `Concise ${format || 'update'} video about ${topic || 'market insights'}. Quick delivery, attention-grabbing visuals.`,
      whatsapp: `High-contrast, text-forward static image for WhatsApp about ${topic || 'your offer'}. 1080x1920 portrait-friendly layout, bold headline, single CTA, clear brand colors.`
    };

    return basePrompts[platform] || basePrompts.linkedin;
  }

  async stagePublishing(options) {
    console.log('📤 Stage 5: Multi-Platform Publishing');
    console.log(`   Platform: ${options.platform || 'all'}\n`);

    if (this.simulate) {
      console.log('   [SIMULATED] Content published');
      return;
    }

    // Email newsletter publishing via MoEngage
    const isEmailNewsletter = (options.platform && options.platform.includes('email')) ||
      (options.type && options.type.includes('email'));

    const isWhatsApp = options.platform && options.platform.includes('whatsapp');

    try {
      const publisher = getMoengageEmailPublisher();
      const newsletter = publisher.loadLatestNewsletter(options.topic);

      if (isEmailNewsletter || newsletter) {
        if (!newsletter) {
          console.log('   ⚠️  No email newsletter content found in workflow-state.json');
          return;
        }

        console.log(`   📧 Publishing newsletter via MoEngage (subject: ${newsletter.subject})...`);
        await publisher.publishNewsletter({
          ...newsletter,
          topic: newsletter.topic || options.topic
        });
        console.log('   ✅ Newsletter push sent to MoEngage (SendGrid-backed campaign)');
        return;
      }

      if (isWhatsApp) {
        const creativeUrl = options.creativeUrl || options.whatsappImageUrl || options.whatsappVideoUrl;
        const cta = options.cta || options.whatsappCta;

        if (!creativeUrl) {
          console.log('   ⚠️  No WhatsApp creative URL provided; skipping WhatsApp push.');
          return;
        }

        console.log(`   💬 Publishing WhatsApp creative via MoEngage (event: WhatsAppCreativeReady)...`);
        await publisher.publishWhatsAppCreative({
          topic: options.topic,
          creativeUrl,
          cta
        });
        console.log('   ✅ WhatsApp creative push sent to MoEngage (Interakt-backed campaign expected)');
        return;
      }
    } catch (error) {
      console.error(`   ❌ MoEngage publish failed: ${error.message}`);
      return;
    }

    // TODO: Implement other platform publishing integrations
    console.log('   ⚠️  Publishing not yet implemented for non-email platforms');
  }

  async stageTracking(options) {
    console.log('📊 Stage 6: Performance Tracking');

    if (this.simulate) {
      console.log('   [SIMULATED] Metrics tracked');
      return;
    }

    // MoEngage reporting for WhatsApp/Email (requires MOENGAGE_* env)
    const isWhatsApp = options.platform && options.platform.includes('whatsapp');
    const isEmail = options.platform && options.platform.includes('email');

    if (isWhatsApp || isEmail) {
      try {
        const client = getMoengageClient();
        const now = Date.now();
        const fromTs = now - 24 * 60 * 60 * 1000;
        const params = {
          event_name: isWhatsApp ? 'WhatsAppCreativeReady' : 'EmailNewsletterReady',
          from: fromTs,
          to: now,
          limit: 50
        };

        console.log('   📡 Fetching MoEngage business events for last 24h...');
        const data = await client.getBusinessEvents(params);
        console.log(`   ✅ Retrieved ${Array.isArray(data?.data) ? data.data.length : 0} events`);
        if (Array.isArray(data?.data) && data.data.length) {
          const recent = data.data.slice(0, 5);
          recent.forEach((item, idx) => {
            console.log(`     [${idx + 1}] ${item.event_name || 'event'} :: ${item.event_timestamp || ''}`);
          });
        }
      } catch (error) {
        console.error(`   ❌ MoEngage tracking fetch failed: ${error.message}`);
      }
    } else {
      console.log('   ⚠️  Tracking not yet implemented for this platform');
    }
  }

  /**
   * Placeholder campaign handlers
   */

  async runLinkedInDataViz(options) {
    console.log('📊 LinkedIn Data Viz - Not yet implemented');
  }

  async runInstagramCarousel(options) {
    console.log('📸 Instagram Carousel - Not yet implemented');
  }

  async runYouTubeShort(options) {
    console.log('📱 YouTube Short - Not yet implemented');
  }

  async runFacebookCommunity(options) {
    console.log('👥 Facebook Community - Not yet implemented');
  }

  async runTwitterThread(options) {
    console.log('🐦 Twitter Thread - Not yet implemented');
  }

  async runEmailNewsletter(options) {
    console.log('📧 Email Newsletter Campaign');
    console.log(`   Topic: ${options.topic}\n`);

    await this.stageContent({
      platform: 'email',
      format: 'newsletter',
      topic: options.topic,
      type: 'email-newsletter'
    });

    await this.stagePublishing({
      platform: 'email',
      type: 'email-newsletter',
      topic: options.topic
    });

    console.log('\n✅ Email newsletter publishing trigger sent!\n');
  }
}

module.exports = SocialMediaOrchestrator;
