import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export const runtime = 'nodejs'

/**
 * Save edited stage data back to workflow-state.json
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { stageId, dataId, editedData } = body

    if (!stageId || !dataId) {
      return NextResponse.json(
        { error: 'Missing stageId or dataId' },
        { status: 400 }
      )
    }

    // Path to workflow state file
    const backendRoot = path.join(process.cwd(), 'backend')
    const stateFilePath = path.join(backendRoot, 'data', 'workflow-state.json')

    if (!fs.existsSync(stateFilePath)) {
      return NextResponse.json(
        { error: 'Workflow state file not found' },
        { status: 404 }
      )
    }

    // Read current state
    const stateContent = fs.readFileSync(stateFilePath, 'utf-8')
    const state = JSON.parse(stateContent)

    // Map stage IDs to state keys
    const stageKeys: Record<number, string> = {
      1: 'campaigns',
      2: 'content',
      3: 'visuals',
      4: 'videos',
      5: 'published',
      6: 'metrics'
    }

    const stageKey = stageKeys[stageId]
    if (!stageKey) {
      return NextResponse.json(
        { error: 'Invalid stage ID' },
        { status: 400 }
      )
    }

    // Update the specific data entry
    if (!state[stageKey] || !state[stageKey][dataId]) {
      return NextResponse.json(
        { error: 'Data entry not found' },
        { status: 404 }
      )
    }

    // Merge edited data with existing data
    state[stageKey][dataId] = {
      ...state[stageKey][dataId],
      ...editedData,
      updatedAt: new Date().toISOString()
    }

    // Write updated state back to file
    fs.writeFileSync(stateFilePath, JSON.stringify(state, null, 2))

    return NextResponse.json({
      success: true,
      message: 'Data saved successfully',
      data: state[stageKey][dataId]
    })
  } catch (error) {
    console.error('Error saving stage data:', error)
    return NextResponse.json(
      { error: 'Failed to save data' },
      { status: 500 }
    )
  }
}
