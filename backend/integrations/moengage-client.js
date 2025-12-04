const { Buffer } = require('buffer');

class MoengageClient {
  constructor(options = {}) {
    this.workspaceId = options.workspaceId;
    this.dataApiKey = options.dataApiKey;
    this.reportingApiKey = options.reportingApiKey;
    this.baseUrl = options.baseUrl || 'https://api-01.moengage.com';
    this.reportsBaseUrl = options.reportsBaseUrl || 'https://api-01.moengage.com';
    this.dataAuthHeader = this.workspaceId && this.dataApiKey
      ? `Basic ${Buffer.from(`${this.workspaceId}:${this.dataApiKey}`).toString('base64')}`
      : null;
  }

  _assertData() {
    if (!this.workspaceId || !this.dataApiKey) {
      throw new Error('MoEngage Data API credentials are missing (workspaceId/dataApiKey)');
    }
  }

  _assertReporting() {
    if (!this.reportingApiKey) {
      throw new Error('MoEngage reporting API key is missing');
    }
  }

  async _requestData(path, body) {
    this._assertData();

    const response = await fetch(`${this.baseUrl}/v1${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: this.dataAuthHeader
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`MoEngage Data API error (${response.status}): ${errorText}`);
    }

    return response.json();
  }

  async _requestReporting(path, init = {}) {
    this._assertReporting();

    const response = await fetch(`${this.reportsBaseUrl}${path}`, {
      headers: {
        Authorization: `Bearer ${this.reportingApiKey}`,
        'Content-Type': 'application/json',
        'MOE-APP-ID': this.workspaceId,
        ...(init.headers || {})
      },
      ...init
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`MoEngage Reporting API error (${response.status}): ${errorText}`);
    }

    return response.json();
  }

  async track(payload) {
    const path = payload.type === 'customer' ? '/customers' : '/events';
    return this._requestData(path, payload);
  }

  async getCampaignReport(campaignId) {
    return this._requestReporting(`/v1/campaigns/${campaignId}/report`);
  }

  async getBusinessEvents(params) {
    const query = params ? `?${new URLSearchParams(params).toString()}` : '';
    return this._requestReporting(`/v1/business-events${query}`);
  }

  async getCustomTemplates() {
    return this._requestReporting('/v1/custom-templates');
  }

  async getCatalog(catalogId) {
    return this._requestReporting(`/v1/catalogs/${catalogId}`);
  }

  async getInformReport(reportId) {
    return this._requestReporting(`/v1/inform/reports/${reportId}`);
  }

  // Email Campaign API Methods

  async _requestCampaignAPI(path, body = null, method = 'POST') {
    this._assertReporting();

    const init = {
      method,
      headers: {
        Authorization: `Bearer ${this.reportingApiKey}`,
        'Content-Type': 'application/json',
        'MOE-APP-ID': this.workspaceId
      }
    };

    if (body && method !== 'GET') {
      init.body = JSON.stringify(body);
    }

    const response = await fetch(`${this.reportsBaseUrl}/v1${path}`, init);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`MoEngage Email Campaign API error (${response.status}): ${errorText}`);
    }

    return response.json();
  }

  /**
   * Create an email campaign in MoEngage
   * @param {Object} campaign - Campaign configuration object
   * @returns {Promise<Object>} Created campaign response
   */
  async createEmailCampaign(campaign) {
    return this._requestCampaignAPI('/email-campaigns', campaign);
  }

  /**
   * Update an existing email campaign
   * @param {string} campaignId - MoEngage campaign ID
   * @param {Object} updates - Campaign fields to update
   * @returns {Promise<Object>} Updated campaign response
   */
  async updateEmailCampaign(campaignId, updates) {
    return this._requestCampaignAPI(`/email-campaigns/${campaignId}`, updates, 'PUT');
  }

  /**
   * Get email campaign details
   * @param {string} campaignId - MoEngage campaign ID
   * @returns {Promise<Object>} Campaign details
   */
  async getEmailCampaign(campaignId) {
    return this._requestCampaignAPI(`/email-campaigns/${campaignId}`, null, 'GET');
  }

  /**
   * Test an email campaign (send test email to specific users)
   * @param {string} campaignId - MoEngage campaign ID
   * @param {Object} testConfig - Test configuration (testEmails array, etc.)
   * @returns {Promise<Object>} Test result
   */
  async testEmailCampaign(campaignId, testConfig) {
    return this._requestCampaignAPI(`/email-campaigns/${campaignId}/test`, testConfig);
  }

  /**
   * List all email campaigns
   * @param {Object} filters - Optional filters (status, type, etc.)
   * @returns {Promise<Object>} List of campaigns
   */
  async listEmailCampaigns(filters = {}) {
    const query = Object.keys(filters).length > 0
      ? `?${new URLSearchParams(filters).toString()}`
      : '';
    return this._requestCampaignAPI(`/email-campaigns${query}`, null, 'GET');
  }
}

function getMoengageClient() {
  const workspaceId = process.env.MOENGAGE_WORKSPACE_ID;
  const dataApiKey = process.env.MOENGAGE_DATA_API_KEY;
  const reportingApiKey = process.env.MOENGAGE_REPORTING_API_KEY;

  if (!workspaceId || !dataApiKey || !reportingApiKey) {
    throw new Error('MoEngage env vars missing. Set MOENGAGE_WORKSPACE_ID, MOENGAGE_DATA_API_KEY, MOENGAGE_REPORTING_API_KEY.');
  }

  return new MoengageClient({
    workspaceId,
    dataApiKey,
    reportingApiKey,
    baseUrl: process.env.MOENGAGE_BASE_URL,
    reportsBaseUrl: process.env.MOENGAGE_REPORTS_BASE_URL
  });
}

module.exports = {
  MoengageClient,
  getMoengageClient
};
