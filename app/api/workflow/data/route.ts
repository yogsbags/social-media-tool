import fs from 'fs'
import { NextRequest, NextResponse } from 'next/server'
import path from 'path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const stageKeys: Record<number, string> = {
  1: 'campaigns',
  2: 'content',
  3: 'visuals',
  4: 'videos',
  5: 'published',
  6: 'metrics'
}

/**
 * GET /api/workflow/data?stage=1..6
 * Returns stage data from workflow-state.json for the given stage (used after stage completion for edit popup).
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const stageParam = searchParams.get('stage')
    const stageId = stageParam ? parseInt(stageParam, 10) : NaN

    if (!Number.isInteger(stageId) || stageId < 1 || stageId > 6) {
      return NextResponse.json({ error: 'Invalid or missing stage (use 1–6)' }, { status: 400 })
    }

    const backendRoot = path.join(process.cwd(), 'backend')
    const stateFilePath = path.join(backendRoot, 'data', 'workflow-state.json')

    if (!fs.existsSync(stateFilePath)) {
      return NextResponse.json({ data: {} })
    }

    const stateContent = fs.readFileSync(stateFilePath, 'utf-8')
    const state = JSON.parse(stateContent) as Record<string, Record<string, unknown>>
    const key = stageKeys[stageId]
    const data = key && state[key] ? state[key] : {}

    return NextResponse.json({ data })
  } catch (error) {
    console.error('Error reading workflow data:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
