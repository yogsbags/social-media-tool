import { Buffer } from 'buffer'

type MoengageClientOptions = {
  workspaceId: string
  dataApiKey: string
  reportingApiKey: string
  baseUrl?: string
  reportsBaseUrl?: string
}

export type MoengageEventAction = {
  action: string
  timestamp?: number
  attributes?: Record<string, any>
}

export type MoengageEventPayload = {
  type: 'event'
  customer_id: string
  actions: MoengageEventAction[]
}

export type MoengageCustomerPayload = {
  type: 'customer'
  customer_id: string
  attributes: Record<string, any>
}

export type MoengageTrackPayload = MoengageEventPayload | MoengageCustomerPayload

/**
 * Lightweight MoEngage Data/Reporting API client.
 * All sensitive values are read from environment variables.
 */
export class MoengageClient {
  private workspaceId: string
  private dataApiKey: string
  private reportingApiKey: string
  private baseUrl: string
  private reportsBaseUrl: string
  private dataAuthHeader: string

  constructor(options: MoengageClientOptions) {
    this.workspaceId = options.workspaceId
    this.dataApiKey = options.dataApiKey
    this.reportingApiKey = options.reportingApiKey
    this.baseUrl = options.baseUrl || 'https://api-01.moengage.com'
    this.reportsBaseUrl = options.reportsBaseUrl || 'https://api-01.moengage.com'
    this.dataAuthHeader = `Basic ${Buffer.from(`${this.workspaceId}:${this.dataApiKey}`).toString('base64')}`
  }

  private assertDataConfig() {
    if (!this.workspaceId || !this.dataApiKey) {
      throw new Error('MoEngage Data API credentials are not configured')
    }
  }

  private assertReportingConfig() {
    if (!this.reportingApiKey) {
      throw new Error('MoEngage reporting API key is not configured')
    }
  }

  private async requestData<T = unknown>(path: string, body: Record<string, any>) {
    this.assertDataConfig()

    const response = await fetch(`${this.baseUrl}/v1${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: this.dataAuthHeader,
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`MoEngage Data API error (${response.status}): ${errorText}`)
    }

    return response.json() as Promise<T>
  }

  private async requestReporting<T = unknown>(path: string, init: RequestInit = {}) {
    this.assertReportingConfig()

    const response = await fetch(`${this.reportsBaseUrl}${path}`, {
      headers: {
        Authorization: `Bearer ${this.reportingApiKey}`,
        'Content-Type': 'application/json',
        'MOE-APP-ID': this.workspaceId,
        ...(init.headers || {}),
      },
      ...init,
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`MoEngage Reporting API error (${response.status}): ${errorText}`)
    }

    return response.json() as Promise<T>
  }

  /**
   * Track an event batch or customer attribute update using the Data API.
   * The payload structure follows MoEngage Data API v1.
   */
  async track(payload: MoengageTrackPayload) {
    const path = payload.type === 'event' ? '/events' : '/customers'
    return this.requestData(path, payload)
  }

  /**
   * Fetch campaign performance report.
   * Endpoint path is configurable to adapt to region/API version differences.
   */
  async getCampaignReport(campaignId: string) {
    return this.requestReporting(`/v1/campaigns/${campaignId}/report`)
  }

  /**
   * Fetch business events aggregated report.
   */
  async getBusinessEvents(params?: Record<string, string | number>) {
    const query = params ? `?${new URLSearchParams(params as Record<string, string>).toString()}` : ''
    return this.requestReporting(`/v1/business-events${query}`)
  }

  /**
   * Fetch available custom templates.
   */
  async getCustomTemplates() {
    return this.requestReporting('/v1/custom-templates')
  }

  /**
   * Fetch catalog details by catalog ID.
   */
  async getCatalog(catalogId: string) {
    return this.requestReporting(`/v1/catalogs/${catalogId}`)
  }

  /**
   * Fetch Inform report by report ID.
   */
  async getInformReport(reportId: string) {
    return this.requestReporting(`/v1/inform/reports/${reportId}`)
  }
}

export function getMoengageClient() {
  const workspaceId = process.env.MOENGAGE_WORKSPACE_ID
  const dataApiKey = process.env.MOENGAGE_DATA_API_KEY
  const reportingApiKey = process.env.MOENGAGE_REPORTING_API_KEY

  if (!workspaceId || !dataApiKey || !reportingApiKey) {
    throw new Error('MoEngage environment variables are missing. Set MOENGAGE_WORKSPACE_ID, MOENGAGE_DATA_API_KEY, and MOENGAGE_REPORTING_API_KEY.')
  }

  return new MoengageClient({
    workspaceId,
    dataApiKey,
    reportingApiKey,
    baseUrl: process.env.MOENGAGE_BASE_URL,
    reportsBaseUrl: process.env.MOENGAGE_REPORTS_BASE_URL,
  })
}
