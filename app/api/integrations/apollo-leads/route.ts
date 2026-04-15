import { NextRequest, NextResponse } from 'next/server'
import { fetchApolloLeads } from '../../../../frontend/lib/server/composio'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const userId = String(body?.userId || '').trim()
    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
    }

    const result = await fetchApolloLeads(userId, {
      country: body?.country,
      industries: body?.industries,
      seniorities: body?.seniorities,
      designation_keywords: body?.designation_keywords,
      cities: body?.cities,
      states: body?.states,
      limit: body?.limit,
    })

    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not fetch Apollo leads' },
      { status: 500 }
    )
  }
}
