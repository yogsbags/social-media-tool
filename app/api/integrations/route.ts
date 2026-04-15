import { NextRequest, NextResponse } from 'next/server'
import { getConnectors } from '../../../frontend/lib/server/composio'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId')
    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
    }

    const connectors = await getConnectors(userId)
    return NextResponse.json({ connectors })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not load integrations' },
      { status: 500 }
    )
  }
}
