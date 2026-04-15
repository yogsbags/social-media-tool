import { NextRequest, NextResponse } from 'next/server'
import { callLeadsDb } from '../../../../frontend/lib/server/leads-db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const data = await callLeadsDb('/fetch', body || {})
    return NextResponse.json(data)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not fetch leads' },
      { status: 500 }
    )
  }
}
