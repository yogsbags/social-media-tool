import { NextRequest, NextResponse } from 'next/server'
import { disconnectConnector, type LeadConnectorId } from '@/lib/server/composio'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const userId = String(body?.userId || '').trim()
    const connectorId = String(body?.connectorId || '').trim() as LeadConnectorId

    if (!userId || !connectorId) {
      return NextResponse.json({ error: 'Missing userId or connectorId' }, { status: 400 })
    }

    const result = await disconnectConnector(userId, connectorId)
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not disconnect connector' },
      { status: 500 }
    )
  }
}
