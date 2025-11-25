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
