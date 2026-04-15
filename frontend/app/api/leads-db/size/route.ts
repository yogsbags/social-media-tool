import { NextRequest, NextResponse } from 'next/server'
import { callLeadsDb } from '@/lib/server/leads-db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const data = await callLeadsDb('/icp/size', body || {})
    return NextResponse.json(data)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not estimate lead segment size' },
      { status: 500 }
    )
  }
}
