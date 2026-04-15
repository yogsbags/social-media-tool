'use client'

import { useEffect, useState } from 'react'

const CONNECTOR_LABELS: Record<string, string> = {
  apollo: 'Apollo',
  linkedin: 'LinkedIn',
  hubspot: 'HubSpot',
  salesforce: 'Salesforce',
  'google-sheets': 'Google Sheets',
  gmail: 'Gmail',
  'google-calendar': 'Google Calendar',
}

export default function ConnectorAuthPage() {
  const [submitting, setSubmitting] = useState(false)
  const [connectorId, setConnectorId] = useState('')

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search)
    const connected = searchParams.get('connected') || ''
    const requestedConnector = searchParams.get('connectorId') || ''
    const nextConnectorId = connected || requestedConnector

    setConnectorId(nextConnectorId)

    if (connected && window.opener && !window.opener.closed) {
      try {
        window.opener.postMessage(
          {
            type: 'composio_oauth_success',
            connectorId: connected,
          },
          window.location.origin
        )
      } catch (error) {
        console.error('Failed to notify opener about Composio success:', error)
      }

      window.setTimeout(() => window.close(), 150)
    }
  }, [])

  const connectorLabel = CONNECTOR_LABELS[connectorId] || 'Connector'

  const approveConnection = async () => {
    setSubmitting(true)

    window.setTimeout(() => {
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(
          {
            type: 'composio_oauth_success',
            connectorId,
          },
          window.location.origin
        )
      }
      window.close()
    }, 450)
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 px-6 py-10 text-white">
      <div className="mx-auto max-w-md rounded-3xl border border-white/10 bg-white/5 p-7 shadow-2xl backdrop-blur">
        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-300">
          Composio Auth
        </div>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          Connect {connectorLabel}
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          This popup mirrors the `marqq` connector flow. Approve the connector to attach it to your
          logged-in Lead Intelligence workspace.
        </p>

        <div className="mt-6 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-100">
          <div className="font-medium">{connectorLabel}</div>
          <div className="mt-1 text-emerald-50/80">OAuth is completed through Composio and synced back to the app.</div>
        </div>

        <div className="mt-8 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => window.close()}
            className="rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:border-white/25 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={approveConnection}
            disabled={submitting}
            className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {submitting ? 'Connecting...' : `Approve ${connectorLabel}`}
          </button>
        </div>
      </div>
    </main>
  )
}
