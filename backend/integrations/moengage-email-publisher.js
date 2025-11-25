const fs = require('fs');
const path = require('path');
const { getMoengageClient } = require('./moengage-client');

class MoengageEmailPublisher {
  constructor() {
    this.client = getMoengageClient();
  }

  /**
   * Find the most recent generated email newsletter content.
   * If a topic is provided, prefer entries matching that topic.
   */
  loadLatestNewsletter(topic) {
    const statePath = path.join(__dirname, '..', 'data', 'workflow-state.json');
    if (!fs.existsSync(statePath)) {
      return null;
    }

    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    const records = Object.values(state.content || {});

    const sorted = records
      .filter((r) => r.contentType === 'email-newsletter')
      .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());

    if (!sorted.length) return null;
    if (!topic) return sorted[0];

    const match = sorted.find((r) => (r.topic || '').toLowerCase() === topic.toLowerCase());
    return match || sorted[0];
  }

  /**
   * Push a broadcast event to MoEngage Data API.
   * Expect MoEngage-side campaign (SendGrid) to pick this event and send the email.
   */
  async publishNewsletter(newsletter) {
    if (!newsletter?.html || !newsletter?.subject) {
      throw new Error('Newsletter payload missing html or subject');
    }

    const payload = {
      type: 'event',
      customer_id: 'broadcast',
      actions: [
        {
          action: 'EmailNewsletterReady',
          timestamp: Date.now(),
          attributes: {
            subject: newsletter.subject,
            preheader: newsletter.preheader || '',
            html: newsletter.html.slice(0, 48000), // keep payload size manageable
            plainText: newsletter.plainText || '',
            topic: newsletter.topic || '',
            source: 'social-media-automation',
            campaignType: 'email-newsletter'
          }
        }
      ]
    };

    return this.client.track(payload);
  }

  /**
   * Push a WhatsApp creative event to MoEngage Data API.
   * MoEngage/Interakt journey should map this event to an actual WhatsApp send.
   */
  async publishWhatsAppCreative(input) {
    if (!input?.creativeUrl) {
      throw new Error('WhatsApp creativeUrl is required');
    }

    const payload = {
      type: 'event',
      customer_id: 'broadcast',
      actions: [
        {
          action: 'WhatsAppCreativeReady',
          timestamp: Date.now(),
          attributes: {
            topic: input.topic || '',
            creativeUrl: input.creativeUrl,
            cta: input.cta || '',
            source: 'social-media-automation',
            channel: 'whatsapp'
          }
        }
      ]
    };

    return this.client.track(payload);
  }
}

function getMoengageEmailPublisher() {
  return new MoengageEmailPublisher();
}

module.exports = {
  MoengageEmailPublisher,
  getMoengageEmailPublisher
};
