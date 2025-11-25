import { NextRequest, NextResponse } from 'next/server'
import { getMoengageClient, MoengageTrackPayload } from '../../../../backend/integrations/moengage-client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json() as MoengageTrackPayload

    if (!payload?.type || (payload.type !== 'event' && payload.type !== 'customer')) {
      return NextResponse.json({ error: 'Invalid payload type. Expected "event" or "customer".' }, { status: 400 })
    }

    const client = getMoengageClient()
    const result = await client.track(payload)

    return NextResponse.json({ success: true, result })
  } catch (error) {
    console.error('MoEngage track error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
