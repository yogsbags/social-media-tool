import { NextResponse } from 'next/server'
import { callLeadsDb } from '@/lib/server/leads-db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const data = await callLeadsDb('/metadata', undefined, 'GET')
    return NextResponse.json(data)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not load leads DB metadata' },
      { status: 500 }
    )
  }
}
