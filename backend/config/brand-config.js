/**
 * Generic Brand Configuration
 *
 * This file contains reusable brand assets, guidelines, and templates
 * for consistent image and video generation across industries.
 */

const brandConfig = {
  company: {
    name: 'Brand Studio',
    shortName: 'Brand Studio',
    website: 'https://example.com',
    tagline: 'Create clear, consistent campaigns across every channel'
  },

  colors: {
    primary: {
      navy: '#17324d',
      blue: '#2563eb',
    },
    secondary: {
      green: '#10b981',
      teal: '#14b8a6',
    },
    neutral: {
      white: '#ffffff',
      black: '#111827',
    },
    gradients: {
      primary: 'linear-gradient(135deg, #17324d 0%, #2563eb 100%)',
      success: 'linear-gradient(135deg, #14b8a6 0%, #10b981 100%)',
      premium: 'linear-gradient(135deg, #17324d 0%, #2563eb 50%, #14b8a6 100%)'
    }
  },

  typography: {
    primary: {
      family: 'Figtree',
      weights: {
        light: 300,
        regular: 400,
        medium: 500,
        semibold: 600,
        bold: 700,
        extrabold: 800
      },
      fallback: 'Inter, system-ui, -apple-system, sans-serif'
    },
    sizes: {
      h1: '48px',
      h2: '36px',
      h3: '28px',
      h4: '24px',
      body: '16px',
      caption: '14px',
      small: '12px'
    }
  },

  values: [
    'Clarity',
    'Trust',
    'Adaptability',
    'Consistency',
    'Creativity'
  ],

  aesthetic: {
    style: 'modern, versatile, polished, high-contrast, professional',
    keywords: [
      'modern',
      'versatile',
      'polished',
      'professional',
      'high-contrast',
      'clean',
      'confident',
      'adaptable'
    ],
    mood: 'clear, confident, and approachable'
  },

  tone: {
    primary: 'Professional',
    attributes: [
      'Clear',
      'Reliable',
      'Helpful',
      'Modern',
      'Adaptable',
      'Audience-aware'
    ],
    messaging: {
      formal: 'For executive or external communications',
      balanced: 'For broad customer-facing communications',
      approachable: 'For onboarding, education, and internal communication'
    }
  },

  targetAudiences: {
    internal: {
      label: 'Internal teams',
      value: 'internal',
      description: 'Employee communications, training, announcements',
      tone: 'Approachable, collaborative, informative',
      colorPalette: ['#2563eb', '#10b981', '#ffffff'],
      fontSize: 'medium',
      contentStyle: 'casual-professional'
    },
    lead_gen: {
      label: 'Lead generation',
      value: 'lead_gen',
      description: 'Prospects evaluating the brand or product',
      tone: 'Clear, persuasive, outcome-focused',
      colorPalette: ['#17324d', '#14b8a6', '#ffffff'],
      fontSize: 'medium',
      contentStyle: 'conversion-focused'
    },
    professionals: {
      label: 'Professionals',
      value: 'professionals',
      description: 'Working professionals and business users',
      tone: 'Educational, useful, modern',
      colorPalette: ['#14b8a6', '#2563eb', '#ffffff'],
      fontSize: 'medium',
      contentStyle: 'engaging-informative'
    },
    executives: {
      label: 'Executives',
      value: 'executives',
      description: 'Senior stakeholders and decision-makers',
      tone: 'Strategic, concise, premium',
      colorPalette: ['#17324d', '#111827', '#ffffff'],
      fontSize: 'medium-large',
      contentStyle: 'premium-professional'
    },
    all_clients: {
      label: 'General audience',
      value: 'all_clients',
      description: 'Default audience for broad communications',
      tone: 'Balanced, professional, accessible',
      colorPalette: ['#17324d', '#2563eb', '#14b8a6', '#ffffff'],
      fontSize: 'medium',
      contentStyle: 'professional-accessible'
    }
  },

  assets: {
    websiteImages: './brand-images.json',
    logos: {
      primary: {
        url: '',
        description: 'Primary brand logo placeholder',
        usage: 'Replace with your brand logo for production use',
        minSize: '120px',
        clearSpace: '20px'
      },
      favicon: {
        url: '',
        description: 'Favicon or small icon placeholder',
        usage: 'Replace with your brand favicon for production use'
      }
    },
    icons: {
      check: '✓',
      arrow: '→',
      spotlight: '✨',
      collaboration: '🤝',
      insight: '💡',
      launch: '🚀'
    }
  },

  imageTemplates: {
    socialPost: {
      dimensions: { width: 1080, height: 1080 },
      background: {
        type: 'gradient',
        value: 'linear-gradient(135deg, #17324d 0%, #2563eb 100%)'
      },
      logo: {
        position: 'top-left',
        size: 'medium',
        margin: 40
      },
      content: {
        padding: 60,
        alignment: 'center',
        maxWidth: 800
      },
      footer: {
        tagline: true,
        disclaimer: false,
        height: 80
      }
    },

    story: {
      dimensions: { width: 1080, height: 1920 },
      background: {
        type: 'gradient',
        value: 'linear-gradient(180deg, #17324d 0%, #14b8a6 100%)'
      },
      logo: {
        position: 'top-center',
        size: 'small',
        margin: 60
      },
      content: {
        padding: 80,
        alignment: 'center',
        verticalAlign: 'middle'
      },
      footer: {
        position: 'bottom',
        height: 150,
        tagline: true
      }
    },

    linkedinBanner: {
      dimensions: { width: 1584, height: 396 },
      background: {
        type: 'solid',
        value: '#17324d'
      },
      logo: {
        position: 'left',
        size: 'large',
        margin: 60
      },
      content: {
        alignment: 'left',
        padding: 60
      },
      accent: {
        type: 'gradient-overlay',
        value: 'linear-gradient(90deg, transparent 0%, #2563eb 100%)'
      }
    },

    presentation: {
      dimensions: { width: 1920, height: 1080 },
      background: {
        type: 'solid',
        value: '#ffffff'
      },
      header: {
        background: '#17324d',
        height: 120,
        logo: true
      },
      content: {
        padding: 80,
        alignment: 'left',
        columns: 2
      },
      footer: {
        background: '#f5f5f5',
        height: 60,
        pageNumber: true,
        branding: true
      }
    },

    insightCard: {
      dimensions: { width: 1200, height: 628 },
      background: {
        type: 'gradient',
        value: 'linear-gradient(135deg, #17324d 0%, #14b8a6 100%)'
      },
      logo: {
        position: 'top-right',
        size: 'small',
        margin: 30
      },
      content: {
        padding: 60,
        alignment: 'left',
        highlight: {
          color: '#10b981',
          fontSize: 'large'
        }
      },
      watermark: {
        enabled: true,
        opacity: 0.08,
        position: 'center'
      }
    }
  },

  compliance: {
    standardDisclaimer: 'Review messaging, claims, and approvals before publishing externally.',
    regulatoryText: 'Optional legal or compliance footer',
    disclaimer: {
      short: 'Review claims and approvals before publishing.',
      medium: 'Review claims, pricing, and approvals before publishing external-facing content.',
      long: 'This is a generic campaign framework. Review all claims, pricing, legal statements, compliance requirements, and approvals before publishing content in a live environment.'
    },
    requiredForAudiences: {
      internal: false,
      lead_gen: false,
      professionals: false,
      executives: false,
      all_clients: false
    }
  },

  avatars: {
    enabled: true,
    provider: 'heygen',
    publicAvatars: [
      {
        id: 'Raj_public',
        name: 'Raj',
        gender: 'male',
        ethnicity: 'Indian',
        style: 'professional',
        description: 'Professional Indian male avatar in business attire',
        suitable: ['executives', 'all_clients']
      },
      {
        id: 'Priya_public',
        name: 'Priya',
        gender: 'female',
        ethnicity: 'Indian',
        style: 'professional',
        description: 'Professional Indian female avatar in business attire',
        suitable: ['professionals', 'all_clients', 'lead_gen']
      },
      {
        id: 'Arjun_public',
        name: 'Arjun',
        gender: 'male',
        ethnicity: 'Indian',
        style: 'approachable',
        description: 'Approachable Indian male avatar',
        suitable: ['internal', 'lead_gen']
      }
    ],
    customAvatarOptions: {
      photoAvatar: {
        enabled: true,
        apiEndpoint: '/v2/avatars/photo',
        requirements: {
          imageFormat: 'jpg/png',
          minResolution: '512x512',
          maxFileSize: '10MB',
          background: 'plain, well-lit'
        }
      },
      videoAvatar: {
        enabled: true,
        apiEndpoint: '/v2/avatars/video',
        requirements: {
          videoFormat: 'mp4',
          duration: '5-10 minutes',
          resolution: '1080p minimum',
          fps: '25-30',
          background: 'green screen or plain'
        }
      }
    },
    excludeAvatars: []
  },

  geminiPrompts: {
    audienceModifiers: {
      internal: 'friendly, collaborative, modern professional style',
      lead_gen: 'persuasive, clear, action-oriented',
      professionals: 'engaging, useful, polished and modern',
      executives: 'sophisticated, concise, premium aesthetic',
      all_clients: 'professional, trustworthy, balanced modern style'
    },

    brandRequirements: `
      - Use the configured primary and accent colors consistently
      - Maintain high contrast for readability
      - Keep a modern, polished, adaptable brand aesthetic
      - Reserve space for a brand mark or logo if needed
      - Use Figtree for text elements when typography is rendered
      - Prioritize clarity, confidence, and clean composition
    `,

    templates: {
      marketUpdate: (audience) => `
        Create a professional trend or performance update visual.
        Target audience: ${audience}
        Style: ${brandConfig.geminiPrompts.audienceModifiers[audience]}
        ${brandConfig.geminiPrompts.brandRequirements}
        Include: Charts, metrics, or supporting visual indicators where helpful
        Mood: Clear, credible, insight-driven
      `,

      investmentTip: (audience) => `
        Create an educational insight graphic.
        Target audience: ${audience}
        Style: ${brandConfig.geminiPrompts.audienceModifiers[audience]}
        ${brandConfig.geminiPrompts.brandRequirements}
        Include: One key takeaway and a strong supporting visual metaphor
        Mood: Helpful, informative, trustworthy
      `,

      productPromo: (audience, product) => `
        Create a promotional image for ${product}.
        Target audience: ${audience}
        Style: ${brandConfig.geminiPrompts.audienceModifiers[audience]}
        ${brandConfig.geminiPrompts.brandRequirements}
        Include: Benefits, use cases, and compelling visual focus
        Mood: Professional, value-focused, aspirational
      `
    }
  }
};

brandConfig.helpers = {
  getAudiencePalette: (audienceType) => {
    const audience = brandConfig.targetAudiences[audienceType];
    return audience ? audience.colorPalette : brandConfig.targetAudiences.all_clients.colorPalette;
  },

  getTemplate: (templateName) => {
    return brandConfig.imageTemplates[templateName] || brandConfig.imageTemplates.socialPost;
  },

  requiresDisclaimer: (audienceType) => {
    return brandConfig.compliance.requiredForAudiences[audienceType] || false;
  },

  getAvatarForAudience: (audienceType) => {
    return brandConfig.avatars.publicAvatars.filter((avatar) =>
      avatar.suitable.includes(audienceType)
    );
  },

  generateGeminiPrompt: (templateType, audience, additionalContext = '') => {
    const promptTemplate = brandConfig.geminiPrompts.templates[templateType];
    if (!promptTemplate) {
      return `${brandConfig.geminiPrompts.brandRequirements}\n${additionalContext}`;
    }
    return promptTemplate(audience) + '\n' + additionalContext;
  },

  getCSSVariables: () => {
    return `
      --brand-navy: ${brandConfig.colors.primary.navy};
      --brand-blue: ${brandConfig.colors.primary.blue};
      --brand-green: ${brandConfig.colors.secondary.green};
      --brand-teal: ${brandConfig.colors.secondary.teal};
      --brand-white: ${brandConfig.colors.neutral.white};
      --brand-black: ${brandConfig.colors.neutral.black};
      --brand-gradient-primary: ${brandConfig.colors.gradients.primary};
      --brand-gradient-success: ${brandConfig.colors.gradients.success};
      --brand-gradient-premium: ${brandConfig.colors.gradients.premium};
      --brand-font-family: ${brandConfig.typography.primary.family}, ${brandConfig.typography.primary.fallback};
    `;
  }
};

module.exports = brandConfig;
