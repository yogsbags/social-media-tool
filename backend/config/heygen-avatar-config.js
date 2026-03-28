/**
 * Generic HeyGen Avatar Configuration
 *
 * Configuration for professional avatars used in video generation.
 * Supports:
 * 1. Public avatars (pre-made, ready to use)
 * 2. Photo Avatar API (create from photos)
 * 3. Video Avatar API (create from videos)
 */

const heygenAvatarConfig = {
  api: {
    baseUrl: 'https://api.heygen.com',
    version: 'v2',
    endpoints: {
      publicAvatars: '/v2/avatars/public',
      photoAvatar: '/v2/avatars/photo',
      photoAvatarAddMotion: '/v2/photo_avatar/add_motion',
      videoAvatar: '/v2/avatars/video',
      talkingPhoto: '/v1/talking_photo.create',
      videoGenerate: '/v2/video/generate',
      videoStatus: '/v2/video/status'
    }
  },

  publicIndianAvatars: [
    {
      id: 'Raj_public_v2',
      name: 'Raj',
      gender: 'male',
      ethnicity: 'Indian',
      age: '35-45',
      style: 'professional',
      attire: 'business_suit',
      description: 'Professional Indian male in a business suit for formal brand communication',
      suitableFor: ['executives', 'all_clients'],
      voiceId: 'en-IN-male-professional',
      useCases: [
        'Executive updates',
        'Brand announcements',
        'Product presentations',
        'Customer communications'
      ],
      recommended: true
    },
    {
      id: 'Priya_public_v2',
      name: 'Priya',
      gender: 'female',
      ethnicity: 'Indian',
      age: '30-40',
      style: 'professional',
      attire: 'business_formal',
      description: 'Professional Indian female in business attire, warm and approachable',
      suitableFor: ['professionals', 'all_clients', 'lead_gen'],
      voiceId: 'en-IN-female-professional',
      useCases: [
        'Educational content',
        'Customer onboarding',
        'Product explainers',
        'Campaign messages'
      ],
      recommended: true
    },
    {
      id: 'Arjun_public_v2',
      name: 'Arjun',
      gender: 'male',
      ethnicity: 'Indian',
      age: '28-35',
      style: 'approachable',
      attire: 'business_casual',
      description: 'Approachable Indian male in business casual, modern and relatable',
      suitableFor: ['internal', 'lead_gen'],
      voiceId: 'en-IN-male-friendly',
      useCases: [
        'Internal communications',
        'Training videos',
        'Casual updates',
        'Team announcements'
      ],
      recommended: false
    },
    {
      id: 'Meera_public_v2',
      name: 'Meera',
      gender: 'female',
      ethnicity: 'Indian',
      age: '40-50',
      style: 'executive',
      attire: 'business_executive',
      description: 'Senior executive Indian female with an authoritative presence',
      suitableFor: ['executives'],
      voiceId: 'en-IN-female-authoritative',
      useCases: [
        'Leadership messages',
        'Strategic updates',
        'High-importance communications',
        'Stakeholder outreach'
      ],
      recommended: true
    },
    {
      id: 'Vikram_public_v2',
      name: 'Vikram',
      gender: 'male',
      ethnicity: 'Indian',
      age: '35-45',
      style: 'expert',
      attire: 'business_professional',
      description: 'Subject-matter expert appearance, trustworthy and knowledgeable',
      suitableFor: ['executives', 'all_clients'],
      voiceId: 'en-IN-male-expert',
      useCases: [
        'Industry analysis',
        'Expert commentary',
        'Research presentations',
        'Thought leadership'
      ],
      recommended: true
    }
  ],

  excludedAvatars: [],

  photoAvatarConfig: {
    enabled: true,
    apiEndpoint: '/v2/avatars/photo',
    requirements: {
      imageFormat: ['jpg', 'jpeg', 'png'],
      minResolution: { width: 512, height: 512 },
      maxResolution: { width: 4096, height: 4096 },
      maxFileSize: 10485760,
      aspectRatio: 'portrait or square preferred',
      background: 'plain, solid color, well-lit',
      lightingTips: [
        'Use natural or professional lighting',
        'Avoid harsh shadows on face',
        'Ensure face is well-lit and clearly visible',
        'Front-facing lighting is ideal'
      ],
      subjectRequirements: [
        'Face clearly visible',
        'Looking directly at camera',
        'Neutral or professional expression',
        'Professional attire recommended',
        'No sunglasses or face coverings',
        'Shoulders and head fully visible'
      ]
    },
    samplePrompt: {
      description: 'Upload a high-quality photo of a spokesperson or team member',
      idealPhoto: 'Professional headshot with neutral background, good lighting, clear facial features'
    }
  },

  videoAvatarConfig: {
    enabled: true,
    apiEndpoint: '/v2/avatars/video',
    requirements: {
      videoFormat: ['mp4', 'mov'],
      duration: {
        min: 300,
        max: 600,
        recommended: 360
      },
      resolution: {
        min: '1080p',
        recommended: '1080p or 4K',
        width: 1920,
        height: 1080
      },
      fps: {
        min: 25,
        max: 30,
        recommended: 30
      },
      fileSize: {
        max: 2147483648
      },
      background: 'green screen or plain solid color',
      recording: {
        cameraPosition: 'Eye level, centered',
        distance: '2-3 feet from camera',
        framing: 'Chest up (professional headshot style)',
        lighting: 'Three-point lighting recommended',
        audio: 'Clear audio with minimal background noise'
      },
      script: {
        type: 'Consent script provided by HeyGen',
        duration: '5-10 minutes of natural speech',
        content: 'Read provided consent text naturally',
        language: 'English (Indian accent acceptable)'
      }
    },
    recordingTips: [
      'Use a high-quality camera (smartphone 1080p+ or DSLR)',
      'Ensure stable camera mounting (tripod recommended)',
      'Use green screen or plain background (white/grey)',
      'Professional attire in your brand style',
      'Natural, engaging delivery',
      'Maintain eye contact with camera',
      'Speak clearly and at moderate pace',
      'Minimize hand gestures (keep in frame)',
      'Record in quiet environment'
    ]
  },

  voices: {
    'en-IN-male-professional': {
      id: 'en-IN-male-professional',
      language: 'en-IN',
      gender: 'male',
      style: 'professional',
      description: 'Professional Indian male voice, clear and authoritative',
      suitableFor: ['executives', 'all_clients']
    },
    'en-IN-female-professional': {
      id: 'en-IN-female-professional',
      language: 'en-IN',
      gender: 'female',
      style: 'professional',
      description: 'Professional Indian female voice, warm and trustworthy',
      suitableFor: ['professionals', 'all_clients', 'lead_gen']
    },
    'en-IN-male-friendly': {
      id: 'en-IN-male-friendly',
      language: 'en-IN',
      gender: 'male',
      style: 'friendly',
      description: 'Friendly Indian male voice, approachable and modern',
      suitableFor: ['internal', 'lead_gen']
    },
    'en-IN-female-authoritative': {
      id: 'en-IN-female-authoritative',
      language: 'en-IN',
      gender: 'female',
      style: 'authoritative',
      description: 'Authoritative Indian female voice, executive presence',
      suitableFor: ['executives']
    },
    'en-IN-male-expert': {
      id: 'en-IN-male-expert',
      language: 'en-IN',
      gender: 'male',
      style: 'expert',
      description: 'Expert voice, knowledgeable and trustworthy',
      suitableFor: ['executives', 'all_clients']
    }
  },

  helpers: {
    getAvatarForAudience: (audienceType, gender = null) => {
      const avatars = heygenAvatarConfig.publicIndianAvatars.filter((avatar) => {
        const audienceMatch = avatar.suitableFor.includes(audienceType);
        const genderMatch = gender ? avatar.gender === gender : true;
        const recommended = avatar.recommended;
        return audienceMatch && genderMatch && recommended;
      });

      return avatars.length > 0 ? avatars[0] : heygenAvatarConfig.publicIndianAvatars[0];
    },

    getAvatarsForUseCase: (useCase) => {
      return heygenAvatarConfig.publicIndianAvatars.filter((avatar) =>
        avatar.useCases.some((uc) => uc.toLowerCase().includes(useCase.toLowerCase()))
      );
    },

    isAvatarExcluded: (avatarId) => {
      return heygenAvatarConfig.excludedAvatars.some(
        (excluded) => avatarId.toLowerCase().includes(excluded.toLowerCase())
      );
    },

    validatePhoto: (file) => {
      const config = heygenAvatarConfig.photoAvatarConfig.requirements;
      const errors = [];
      const ext = file.name.split('.').pop().toLowerCase();

      if (!config.imageFormat.includes(ext)) {
        errors.push(`Invalid format. Supported: ${config.imageFormat.join(', ')}`);
      }

      if (file.size > config.maxFileSize) {
        errors.push(`File too large. Max: ${config.maxFileSize / 1024 / 1024} MB`);
      }

      return {
        valid: errors.length === 0,
        errors
      };
    },

    validateVideo: (file, duration) => {
      const config = heygenAvatarConfig.videoAvatarConfig.requirements;
      const errors = [];
      const ext = file.name.split('.').pop().toLowerCase();

      if (!config.videoFormat.includes(ext)) {
        errors.push(`Invalid format. Supported: ${config.videoFormat.join(', ')}`);
      }

      if (file.size > config.fileSize.max) {
        errors.push(`File too large. Max: ${config.fileSize.max / 1024 / 1024 / 1024} GB`);
      }

      if (duration < config.duration.min) {
        errors.push(`Video too short. Min: ${config.duration.min / 60} minutes`);
      }
      if (duration > config.duration.max) {
        errors.push(`Video too long. Max: ${config.duration.max / 60} minutes`);
      }

      return {
        valid: errors.length === 0,
        errors
      };
    },

    getAvatarById: (avatarId) => {
      if (heygenAvatarConfig.helpers.isAvatarExcluded(avatarId)) {
        console.warn(`Avatar ${avatarId} is excluded. Returning default avatar instead.`);
        return heygenAvatarConfig.publicIndianAvatars[0];
      }

      const avatar = heygenAvatarConfig.publicIndianAvatars.find((a) => a.id === avatarId);
      return avatar || heygenAvatarConfig.publicIndianAvatars[0];
    },

    getVoiceForAvatar: (avatarId) => {
      const avatar = heygenAvatarConfig.helpers.getAvatarById(avatarId);
      return heygenAvatarConfig.voices[avatar.voiceId] || heygenAvatarConfig.voices['en-IN-male-professional'];
    }
  },

  videoTemplates: {
    campaignUpdate: {
      name: 'Campaign Update',
      description: 'Regular campaign or performance updates',
      recommendedAvatar: 'Raj_public_v2',
      duration: '60-90 seconds',
      script: {
        intro: 'Hello, here is your latest update for [campaign or period].',
        body: 'Key highlights, metrics, and momentum points',
        outro: 'For any questions, please reach out to your point of contact. Thank you.'
      }
    },
    trendInsight: {
      name: 'Trend Insight',
      description: 'Industry analysis and strategic insights',
      recommendedAvatar: 'Vikram_public_v2',
      duration: '90-120 seconds',
      script: {
        intro: 'Welcome to this quick insight update.',
        body: 'Analysis and expert commentary',
        outro: 'Stay informed and keep building with confidence.'
      }
    },
    productPromo: {
      name: 'Product Promotion',
      description: 'Introduction to products, services, or features',
      recommendedAvatar: 'Priya_public_v2',
      duration: '45-60 seconds',
      script: {
        intro: 'Discover [product name].',
        body: 'Product benefits and features',
        outro: 'To learn more, contact us today.'
      }
    },
    internalComm: {
      name: 'Internal Communication',
      description: 'Employee announcements and updates',
      recommendedAvatar: 'Arjun_public_v2',
      duration: '30-60 seconds',
      script: {
        intro: 'Hello team, here is an important update.',
        body: 'Key information and action items',
        outro: 'Thank you for your attention.'
      }
    },
    executiveMessage: {
      name: 'Executive Message',
      description: 'Leadership communications to customers or employees',
      recommendedAvatar: 'Meera_public_v2',
      duration: '90-150 seconds',
      script: {
        intro: 'Hello everyone,',
        body: 'Strategic updates and vision',
        outro: 'Thank you for your continued trust and partnership.'
      }
    }
  }
};

module.exports = heygenAvatarConfig;
