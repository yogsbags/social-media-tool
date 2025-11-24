import { NextRequest } from 'next/server'
import { spawn } from 'child_process'
import path from 'path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Execute single workflow stage
 * Returns SSE stream with real-time updates
 */
export async function POST(request: NextRequest) {
  const body = await request.json()
  const {
    stageId,
    campaignType,
    platforms = [],
    topic,
    duration = 90,
    useVeo = true,
    useAvatar = true,
    campaignData = {},
    longCatConfig = null
  } = body

  const stageNames: Record<number, string> = {
    1: 'planning',
    2: 'content',
    3: 'visuals',
    4: 'video',
    5: 'publishing',
    6: 'tracking'
  }

  const stageName = stageNames[stageId]

  // Create SSE response
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (data: any) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      try {
        sendEvent({ log: `🚀 Starting Stage ${stageId}: ${stageName}...` })
        sendEvent({ stage: stageId, status: 'running', message: `Executing ${stageName}...` })

        // Path to backend main.js
        const backendRoot = path.join(process.cwd(), '..')
        const mainScript = path.join(backendRoot, 'main.js')

        // Build command arguments
        const args = [
          mainScript,
          'stage',
          stageName
        ]

        if (topic) {
          args.push('--topic', topic)
        }

        if (campaignType) {
          args.push('--type', campaignType)
        }

        if (stageId === 4) {
          // Video production stage
          args.push('--duration', duration.toString())
          if (useVeo) args.push('--use-veo')
          if (useAvatar) args.push('--use-avatar')
        }

        if (stageId === 5) {
          // Publishing stage
          platforms.forEach((platform: string) => {
            args.push('--platform', platform)
          })
        }

        // Prepare environment variables
        const env = { ...process.env }

        // Pass LongCat configuration as environment variables for video stage
        if (stageId === 4 && longCatConfig) {
          env.LONGCAT_ENABLED = longCatConfig.enabled ? 'true' : 'false'
          env.LONGCAT_MODE = longCatConfig.mode || 'text-to-video'
          env.LONGCAT_PROMPT = longCatConfig.prompt || ''
          env.LONGCAT_DURATION = longCatConfig.duration?.toString() || duration.toString()
        }

        // Spawn backend process
        const backendProcess = spawn('node', args, {
          cwd: backendRoot,
          env: env
        })

        // Handle stdout
        backendProcess.stdout.on('data', (data) => {
          const output = data.toString()
          sendEvent({ log: output.trim() })

          // Stage-specific parsing
          if (stageId === 4) {
            // Video production updates
            if (output.includes('HeyGen')) {
              sendEvent({ log: '🎭 HeyGen avatar processing...' })
            }
            if (output.includes('Veo')) {
              sendEvent({ log: '🎬 Veo scene generation...' })
            }
            if (output.includes('LongCat')) {
              sendEvent({ log: '🎥 LongCat long-form video generation...' })
            }
            if (output.includes('Shotstack')) {
              sendEvent({ log: '✂️ Shotstack compositing...' })
            }
          }

          if (stageId === 5) {
            // Publishing updates
            if (output.includes('Published to')) {
              const urlMatch = output.match(/(https?:\/\/[^\s]+)/)
              if (urlMatch) {
                const platform = output.toLowerCase().includes('linkedin') ? 'linkedin' :
                               output.toLowerCase().includes('instagram') ? 'instagram' :
                               output.toLowerCase().includes('youtube') ? 'youtube' :
                               output.toLowerCase().includes('facebook') ? 'facebook' :
                               output.toLowerCase().includes('twitter') ? 'twitter' : 'unknown'
                sendEvent({ campaignData: { publishedUrls: { [platform]: urlMatch[1] } } })
              }
            }
          }
        })

        // Handle stderr
        backendProcess.stderr.on('data', (data) => {
          const error = data.toString()
          sendEvent({ log: `⚠️ ${error.trim()}` })
        })

        // Handle process completion
        backendProcess.on('close', (code) => {
          if (code === 0) {
            sendEvent({ stage: stageId, status: 'completed', message: `${stageName} completed` })
            sendEvent({ log: `✅ Stage ${stageId} completed successfully!` })
          } else {
            sendEvent({ log: `❌ Stage ${stageId} failed with exit code ${code}` })
            sendEvent({ stage: stageId, status: 'error', message: `${stageName} failed` })
          }
          controller.close()
        })

        // Handle errors
        backendProcess.on('error', (error) => {
          sendEvent({ log: `❌ Error: ${error.message}` })
          sendEvent({ stage: stageId, status: 'error', message: error.message })
          controller.close()
        })

      } catch (error) {
        sendEvent({ log: `❌ Fatal error: ${error instanceof Error ? error.message : 'Unknown error'}` })
        controller.close()
      }
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
