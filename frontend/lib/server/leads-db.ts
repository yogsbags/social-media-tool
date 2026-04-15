function getLeadsDbBearerToken() {
  const token = process.env.LEADS_DB_BEARER_TOKEN
  if (!token) throw new Error('LEADS_DB_BEARER_TOKEN is not configured')
  return token
}

function getLeadsDbBaseUrls() {
  const configuredBaseUrl = process.env.LEADS_DB_BASE_URL?.replace(/\/+$/, '')
  const fallbackBaseUrl = 'http://localhost:8000'

  if (configuredBaseUrl) {
    return Array.from(new Set([configuredBaseUrl, fallbackBaseUrl]))
  }

  return [fallbackBaseUrl]
}

function buildLeadsDbHeaders(baseUrl: string, bearerToken: string) {
  return {
    Authorization: `Bearer ${bearerToken}`,
    'Content-Type': 'application/json',
    // ngrok free tier can return an HTML interstitial unless this is present.
    ...(/ngrok/i.test(baseUrl) ? { 'ngrok-skip-browser-warning': '1' } : {}),
  }
}

function extractLeadsDbError(data: unknown, status: number) {
  if (typeof data === 'string' && data.trim()) return data
  if (typeof data === 'object' && data !== null) {
    if (typeof (data as { detail?: unknown }).detail === 'string') return (data as { detail: string }).detail
    if (typeof (data as { error?: unknown }).error === 'string') return (data as { error: string }).error
    if (typeof (data as { message?: unknown }).message === 'string') return (data as { message: string }).message
  }

  return `Leads DB request failed: HTTP ${status}`
}

export async function callLeadsDb(path: string, body?: unknown, method = 'POST') {
  const bearerToken = getLeadsDbBearerToken()
  const baseUrls = getLeadsDbBaseUrls()
  const errors: string[] = []

  for (const baseUrl of baseUrls) {
    try {
      const res = await fetch(`${baseUrl}${path}`, {
        method,
        headers: buildLeadsDbHeaders(baseUrl, bearerToken),
        body: body != null && method !== 'GET' ? JSON.stringify(body) : undefined,
        cache: 'no-store',
      })

      const raw = await res.text().catch(() => '')
      const data = raw ? JSON.parse(raw) : null

      if (!res.ok) {
        throw new Error(extractLeadsDbError(data, res.status))
      }

      return data
    } catch (error) {
      const message =
        error instanceof SyntaxError
          ? `Leads DB returned invalid JSON from ${baseUrl}`
          : error instanceof Error
            ? error.message
            : 'Unknown Leads DB error'

      errors.push(`${baseUrl}: ${message}`)
    }
  }

  throw new Error(errors.join(' | '))
}
