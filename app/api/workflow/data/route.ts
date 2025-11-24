import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Fetch workflow stage data from backend state file
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const stageId = searchParams.get('stage')

  if (!stageId) {
    return NextResponse.json({ error: 'Stage ID required' }, { status: 400 })
  }

  try {
    // Path to backend state file
    const backendRoot = path.join(process.cwd(), '..')
    const stateFilePath = path.join(backendRoot, 'data', 'campaign-state.json')

    // Check if state file exists
    if (!fs.existsSync(stateFilePath)) {
      return NextResponse.json({
        data: null,
        summary: { message: 'No campaigns yet' }
      })
    }

    // Read state file
    const stateContent = fs.readFileSync(stateFilePath, 'utf-8')
    const state = JSON.parse(stateContent)

    // Extract stage-specific data
    let stageData: any = null
    let summary: any = {}

    switch (parseInt(stageId)) {
      case 1:
        // Planning stage - return campaigns
        stageData = state.campaigns || {}
        summary = {
          totalCampaigns: Object.keys(stageData).length,
          activeCampaigns: Object.values(stageData).filter((c: any) => c.status !== 'completed').length
        }
        break

      case 4:
        // Video production - return videos
        stageData = state.videos || {}
        summary = {
          totalVideos: Object.keys(stageData).length,
          completedVideos: Object.values(stageData).filter((v: any) => v.status === 'completed').length
        }
        break

      case 5:
        // Publishing - return published posts
        stageData = state.published || {}
        summary = {
          totalPosts: Object.keys(stageData).length,
          publishedPlatforms: [...new Set(Object.values(stageData).map((p: any) => p.platform))]
        }
        break

      default:
        stageData = {}
        summary = { message: 'Stage data not available' }
    }

    return NextResponse.json({
      data: stageData,
      summary
    })

  } catch (error) {
    console.error('Error fetching stage data:', error)
    return NextResponse.json(
      { error: 'Failed to fetch stage data', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
