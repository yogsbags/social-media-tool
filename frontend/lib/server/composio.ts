const COMPOSIO_V3 = 'https://backend.composio.dev/api/v3'

export type LeadConnectorId =
  | 'apollo'
  | 'linkedin'
  | 'hubspot'
  | 'salesforce'
  | 'google-sheets'
  | 'gmail'
  | 'google-calendar'

type ConnectorRecord = {
  id: LeadConnectorId
  name: string
  connected: boolean
  connectedAt: string | null
  status: string
}

type ApolloLeadSearchParams = {
  country?: string
  industries?: string[]
  seniorities?: string[]
  designation_keywords?: string[] | string
  cities?: string[] | string
  states?: string[] | string
  limit?: number
}

const AUTH_CONFIG_MAP: Record<LeadConnectorId, string | null> = {
  apollo: process.env.COMPOSIO_APOLLO_AUTH_CONFIG_ID || null,
  linkedin: process.env.COMPOSIO_LINKEDIN_AUTH_CONFIG_ID || null,
  hubspot: process.env.COMPOSIO_HUBSPOT_AUTH_CONFIG_ID || null,
  salesforce: process.env.COMPOSIO_SALESFORCE_AUTH_CONFIG_ID || null,
  'google-sheets': process.env.COMPOSIO_GOOGLE_SHEETS_AUTH_CONFIG_ID || null,
  gmail: process.env.COMPOSIO_GMAIL_AUTH_CONFIG_ID || null,
  'google-calendar': process.env.COMPOSIO_GOOGLE_CALENDAR_AUTH_CONFIG_ID || null,
}

const CONNECTOR_APP_MAP: Record<LeadConnectorId, string> = {
  apollo: 'apollo',
  linkedin: 'linkedin',
  hubspot: 'hubspot',
  salesforce: 'salesforce',
  'google-sheets': 'googlesheets',
  gmail: 'gmail',
  'google-calendar': 'googlecalendar',
}

function normalizeToolkitSlug(value: string) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')
}

function accountMatchesUser(item: any, userId: string) {
  return String(item?.user_id || '') === String(userId || '')
}

function getApiKey() {
  const apiKey = process.env.COMPOSIO_API_KEY
  if (!apiKey) throw new Error('COMPOSIO_API_KEY is not configured')
  return apiKey
}

function extractComposioError(data: any, fallback: string) {
  const direct = data?.message || data?.error || data?.detail
  if (typeof direct === 'string' && direct.trim()) return direct
  if (typeof direct === 'object' && direct !== null) {
    const nested = direct.message || direct.error || direct.detail
    if (typeof nested === 'string' && nested.trim()) return nested
    return JSON.stringify(direct)
  }
  try {
    return JSON.stringify(data)
  } catch {
    return fallback
  }
}

async function resolveAuthConfigId(connectorId: LeadConnectorId) {
  const configured = AUTH_CONFIG_MAP[connectorId]
  if (configured) return configured

  const apiKey = getApiKey()
  const appName = CONNECTOR_APP_MAP[connectorId]
  if (!appName) throw new Error(`Unknown connector: ${connectorId}`)

  const res = await fetch(`${COMPOSIO_V3}/auth_configs?limit=200`, {
    headers: { 'x-api-key': apiKey, Accept: 'application/json' },
    cache: 'no-store',
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(extractComposioError(data, `Could not list auth configs for ${connectorId}`))
  }

  const items = Array.isArray(data?.items) ? data.items : []
  const match = items.find((item: any) =>
    normalizeToolkitSlug(item?.toolkit?.slug || '') === normalizeToolkitSlug(appName) &&
    String(item?.status || '').toUpperCase() === 'ENABLED'
  )
  if (!match?.id) {
    throw new Error(`No enabled auth config found for connector ${connectorId} (toolkit: ${appName})`)
  }
  return String(match.id)
}

function getAppUrl() {
  return process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3004'
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((entry) => String(entry).trim()).filter(Boolean)
  if (typeof value === 'string') return value.split(',').map((entry) => entry.trim()).filter(Boolean)
  return []
}

function readGenericApiKey(detail: any): string | null {
  return (
    detail?.data?.api_key ||
    detail?.data?.generic_api_key ||
    detail?.state?.val?.api_key ||
    detail?.state?.val?.generic_api_key ||
    detail?.params?.api_key ||
    detail?.params?.generic_api_key ||
    null
  )
}

async function getConnectedAccountApiKey(connectorId: LeadConnectorId, userId: string) {
  const apiKey = getApiKey()
  const appName = CONNECTOR_APP_MAP[connectorId]
  if (!appName) return { error: `Unknown connector: ${connectorId}` }

  const res = await fetch(`${COMPOSIO_V3}/connected_accounts?user_id=${encodeURIComponent(userId)}&limit=100`, {
    headers: { 'x-api-key': apiKey },
    cache: 'no-store',
  })
  const listData = await res.json().catch(() => ({}))
  if (!res.ok) return { error: listData?.message || listData?.error || `Composio list accounts failed: ${res.status}` }

  const account = (listData.items || []).find((item: any) => {
    const slug = item.toolkit?.slug || item.toolkit_slug || item.appName || ''
    return accountMatchesUser(item, userId) && normalizeToolkitSlug(slug) === normalizeToolkitSlug(appName) && item.status === 'ACTIVE'
  })
  if (!account?.id) return { error: `No active ${connectorId} connection for this user. Connect it first.` }

  const detailRes = await fetch(`${COMPOSIO_V3}/connected_accounts/${account.id}`, {
    headers: { 'x-api-key': apiKey },
    cache: 'no-store',
  })
  const detail = await detailRes.json().catch(() => ({}))
  if (!detailRes.ok) return { error: detail?.message || detail?.error || `Failed account details: ${detailRes.status}` }

  const connectorApiKey = readGenericApiKey(detail)
  if (!connectorApiKey) return { error: `No API key found in Apollo connected account. Reconnect Apollo with key.` }
  return { api_key: String(connectorApiKey) }
}

export async function getConnectors(userId: string): Promise<ConnectorRecord[]> {
  const allConnectors: ConnectorRecord[] = (Object.keys(CONNECTOR_APP_MAP) as LeadConnectorId[]).map((id) => ({
    id,
    name: id.replace(/-/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()),
    connected: false,
    connectedAt: null,
    status: 'not_connected',
  }))

  const apiKey = process.env.COMPOSIO_API_KEY
  if (!apiKey) return allConnectors

  try {
    const res = await fetch(
      `${COMPOSIO_V3}/connected_accounts?user_id=${encodeURIComponent(userId)}&limit=100`,
      {
        headers: { 'x-api-key': apiKey },
        cache: 'no-store',
      }
    )

    if (!res.ok) return allConnectors

    const data = await res.json()
    const connected = new Map<LeadConnectorId, Omit<ConnectorRecord, 'id' | 'name'>>()

    for (const acct of data.items || []) {
      if (!accountMatchesUser(acct, userId)) continue
      const toolkitSlug = acct.toolkit?.slug || acct.toolkit_slug || acct.appName || ''
      for (const [connectorId, appName] of Object.entries(CONNECTOR_APP_MAP) as Array<[LeadConnectorId, string]>) {
        if (normalizeToolkitSlug(toolkitSlug) !== normalizeToolkitSlug(appName)) continue

        const existing = connected.get(connectorId)
        if (!existing || acct.status === 'ACTIVE') {
          connected.set(connectorId, {
            connected: acct.status === 'ACTIVE',
            connectedAt: acct.created_at || acct.createdAt || null,
            status: String(acct.status || 'connected').toLowerCase(),
          })
        }
      }
    }

    return allConnectors.map((connector) => ({
      ...connector,
      ...(connected.get(connector.id) || {}),
    }))
  } catch (error) {
    console.error('[composio] getConnectors failed:', error)
    return allConnectors
  }
}

export async function initiateConnection(userId: string, connectorId: LeadConnectorId) {
  const apiKey = getApiKey()
  const appName = CONNECTOR_APP_MAP[connectorId]
  let authConfigId = AUTH_CONFIG_MAP[connectorId]

  if (!appName) throw new Error(`Unknown connector: ${connectorId}`)
  if (!authConfigId) {
    authConfigId = await resolveAuthConfigId(connectorId)
  }

  const callbackUrl = `${getAppUrl()}/connector-auth?connected=${encodeURIComponent(connectorId)}`

  const res = await fetch(`${COMPOSIO_V3}/connected_accounts/link`, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      auth_config_id: authConfigId,
      user_id: userId,
      callback_url: callbackUrl,
    }),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const firstError = extractComposioError(data, 'Could not create Composio auth link')
    // If configured ID is stale/missing, retry once by resolving auth config using toolkit slug.
    if (/auth config not found/i.test(firstError)) {
      const fallbackAuthConfigId = await resolveAuthConfigId(connectorId)
      const retryRes = await fetch(`${COMPOSIO_V3}/connected_accounts/link`, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          auth_config_id: fallbackAuthConfigId,
          user_id: userId,
          callback_url: callbackUrl,
        }),
      })
      const retryData = await retryRes.json().catch(() => ({}))
      if (retryRes.ok) {
        const redirectUrl = retryData.link || retryData.redirectUrl || retryData.redirect_url || null
        if (!redirectUrl) {
          throw new Error(extractComposioError(retryData, 'Composio did not return an auth redirect URL'))
        }
        return {
          redirectUrl,
          connectionId: retryData.id || retryData.connection_id || null,
        }
      }
      throw new Error(extractComposioError(retryData, firstError))
    }
    throw new Error(firstError)
  }

  const redirectUrl = data.link || data.redirectUrl || data.redirect_url || null
  if (!redirectUrl) {
    throw new Error(extractComposioError(data, 'Composio did not return an auth redirect URL'))
  }

  return {
    redirectUrl,
    connectionId: data.id || data.connection_id || null,
  }
}

export async function disconnectConnector(userId: string, connectorId: LeadConnectorId) {
  const apiKey = getApiKey()
  const appName = CONNECTOR_APP_MAP[connectorId]

  if (!appName) throw new Error(`Unknown connector: ${connectorId}`)

  // Pull user accounts without toolkit_slug filtering because Composio toolkit
  // slugs can vary by connector naming convention (hyphen/underscore variants).
  const listRes = await fetch(
    `${COMPOSIO_V3}/connected_accounts?user_id=${encodeURIComponent(userId)}&limit=100`,
    {
      headers: { 'x-api-key': apiKey },
      cache: 'no-store',
    }
  )

  const listData = await listRes.json().catch(() => ({}))
  if (!listRes.ok) {
    throw new Error(extractComposioError(listData, 'Could not load connected accounts'))
  }

  const matchingAccounts = (listData.items || []).filter((item: any) => {
    if (!accountMatchesUser(item, userId)) return false
    const toolkitSlug = item.toolkit?.slug || item.toolkit_slug || item.appName || ''
    return normalizeToolkitSlug(toolkitSlug) === normalizeToolkitSlug(appName)
  })

  const account = matchingAccounts.find((item: any) => String(item.status || '').toUpperCase() === 'ACTIVE')
    || matchingAccounts[0]

  if (!account?.id) {
    throw new Error('No connected account found')
  }

  const deleteRes = await fetch(`${COMPOSIO_V3}/connected_accounts/${account.id}`, {
    method: 'DELETE',
    headers: { 'x-api-key': apiKey },
  })

  if (!deleteRes.ok) {
    const errorData = await deleteRes.json().catch(() => ({}))
    throw new Error(extractComposioError(errorData, 'Could not disconnect account'))
  }

  return { ok: true }
}

export async function fetchApolloLeads(userId: string, params: ApolloLeadSearchParams) {
  const connectedApollo = await getConnectedAccountApiKey('apollo', userId)
  const apolloApiKey = connectedApollo.api_key || process.env.APOLLO_API_KEY || null
  if (!apolloApiKey) {
    throw new Error(connectedApollo.error || 'Apollo API key not available. Connect Apollo first.')
  }

  const countryMap: Record<string, string> = { IN: 'India', US: 'United States' }
  const country = countryMap[String(params.country || 'IN').toUpperCase()] || String(params.country || 'India')
  const industries = toStringArray(params.industries).map((entry) => entry.replace(/_/g, ' ')).filter(Boolean)
  const seniorities = toStringArray(params.seniorities).map((entry) => entry.replace(/_/g, ' ').toLowerCase()).filter(Boolean)
  const titleKeywords = toStringArray(params.designation_keywords).slice(0, 8)
  const cities = toStringArray(params.cities)
  const states = toStringArray(params.states)
  const limit = Math.min(Math.max(Number(params.limit) || 25, 1), 25)

  const fetchApollo = async (url: string, options: RequestInit = {}) => {
    const res = await fetch(url, {
      ...options,
      headers: {
        'x-api-key': apolloApiKey,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        accept: 'application/json',
        ...(options.headers || {}),
      },
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(data?.error || data?.error_message || data?.message || `Apollo API failed: ${res.status}`)
    }
    return data
  }

  const mapApolloPersonToLead = (person: any) => ({
    full_name: person.name || [person.first_name, person.last_name].filter(Boolean).join(' '),
    designation: person.title || person.headline || '',
    company: person.employment_history?.find?.((job: any) => job.current)?.organization_name || person.organization_name || '',
    city: person.city || '',
    state: person.state || '',
    industry: person.organization?.industry || '',
    seniority: person.seniority ? String(person.seniority).toUpperCase() : '',
    phone_e164: person.phone_number || person.phone || '',
    email: person.email || '',
    email_norm: person.email || '',
    has_linkedin: Boolean(person.linkedin_url),
    linkedin_url: person.linkedin_url || '',
    quality: person.email ? 4 : 3,
  })

  const peopleParams = new URLSearchParams({ per_page: String(limit) })
  for (const title of titleKeywords) peopleParams.append('person_titles[]', title)
  for (const location of [...cities, ...states, country].slice(0, 6)) peopleParams.append('person_locations[]', location)
  const qKeywords = industries.join(' ')
  if (qKeywords) peopleParams.set('q_keywords', qKeywords)
  if (seniorities.length > 0) {
    for (const seniority of seniorities.slice(0, 5)) peopleParams.append('person_seniorities[]', seniority)
  }

  const peopleSearch = await fetchApollo(`https://api.apollo.io/api/v1/mixed_people/api_search?${peopleParams.toString()}`, {
    method: 'POST',
  })
  const peopleIds = (peopleSearch.people || []).map((person: any) => person.id).filter(Boolean).slice(0, limit)
  if (!peopleIds.length) {
    return {
      status: 'completed',
      source: 'apollo_people_search',
      count: 0,
      leads: [],
      message: 'Apollo returned no matching people',
    }
  }

  const enrichData = await fetchApollo('https://api.apollo.io/api/v1/people/bulk_match', {
    method: 'POST',
    body: JSON.stringify({
      details: peopleIds.map((id: string) => ({ id })),
      reveal_personal_emails: false,
      reveal_phone_number: false,
    }),
  })

  const leads = (enrichData.matches || [])
    .map(mapApolloPersonToLead)
    .filter((lead: any) => Boolean(lead.full_name && lead.linkedin_url && lead.email))

  return {
    status: 'completed',
    source: 'apollo_people_search',
    count: leads.length,
    leads,
  }
}

export async function enrichApolloPeopleByEmails(userId: string, emails: string[]) {
  const connectedApollo = await getConnectedAccountApiKey('apollo', userId)
  const apolloApiKey = connectedApollo.api_key || process.env.APOLLO_API_KEY || null
  if (!apolloApiKey) {
    throw new Error(connectedApollo.error || 'Apollo API key not available. Connect Apollo first.')
  }

  const normalizedEmails = Array.from(
    new Set(
      emails
        .map((email) => String(email || '').trim().toLowerCase())
        .filter(Boolean)
    )
  ).slice(0, 100)

  const fetchApollo = async (url: string, options: RequestInit = {}) => {
    const res = await fetch(url, {
      ...options,
      headers: {
        'x-api-key': apolloApiKey,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        accept: 'application/json',
        ...(options.headers || {}),
      },
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(data?.error || data?.error_message || data?.message || `Apollo API failed: ${res.status}`)
    }
    return data
  }

  const chunks: string[][] = []
  for (let i = 0; i < normalizedEmails.length; i += 10) {
    chunks.push(normalizedEmails.slice(i, i + 10))
  }

  const peopleByEmail = new Map<string, any>()
  for (const chunk of chunks) {
    const response = await fetchApollo('https://api.apollo.io/api/v1/people/bulk_match', {
      method: 'POST',
      body: JSON.stringify({
        details: chunk.map((email) => ({ email })),
        reveal_personal_emails: false,
        reveal_phone_number: false,
      }),
    })
    for (const person of response.matches || []) {
      const email = String(person?.email || '').trim().toLowerCase()
      if (!email) continue
      peopleByEmail.set(email, {
        full_name: person.name || [person.first_name, person.last_name].filter(Boolean).join(' '),
        designation: person.title || person.headline || '',
        company: person.employment_history?.find?.((job: any) => job.current)?.organization_name || person.organization_name || '',
        linkedin_url: person.linkedin_url || '',
        email,
      })
    }
  }

  return peopleByEmail
}
