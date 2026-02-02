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
 * POST /api/workflow/data/save
 * Body: { stageId, dataId, editedData }
 * Updates one stage entry in workflow-state.json.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { stageId, dataId, editedData } = body as { stageId: number; dataId: string; editedData: any }

    if (!Number.isInteger(stageId) || stageId < 1 || stageId > 6 || !dataId || editedData === undefined) {
      return NextResponse.json(
        { error: 'Missing or invalid stageId, dataId, or editedData' },
        { status: 400 }
      )
    }

    const backendRoot = path.join(process.cwd(), 'backend')
    const stateFilePath = path.join(backendRoot, 'data', 'workflow-state.json')

    let state: Record<string, Record<string, any>> = {
      campaigns: {},
      content: {},
      visuals: {},
      videos: {},
      published: {},
      metrics: {}
    }

    if (fs.existsSync(stateFilePath)) {
      const stateContent = fs.readFileSync(stateFilePath, 'utf-8')
      state = JSON.parse(stateContent)
    }

    const key = stageKeys[stageId]
    if (!key || !state[key] || !state[key][dataId]) {
      return NextResponse.json({ error: 'Stage entry not found' }, { status: 404 })
    }

    state[key][dataId] = {
      ...state[key][dataId],
      ...editedData,
      id: dataId,
      stageId,
      completedAt: state[key][dataId].completedAt || new Date().toISOString()
    }

    fs.writeFileSync(stateFilePath, JSON.stringify(state, null, 2))

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error saving workflow data:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
