import { NextRequest } from 'next/server'
import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { randomUUID } from 'crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Helper function to save stage data
function saveStageData(stageId: number, data: any) {
  try {
    const backendRoot = path.join(process.cwd(), 'backend')
    const stateFilePath = path.join(backendRoot, 'data', 'workflow-state.json')

    // Read existing state
    let state: any = {
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

    // Generate unique ID
    const timestamp = Date.now()
    const id = `${stageId}-${timestamp}`

    // Save data based on stage
    const stageKeys: Record<number, string> = {
      1: 'campaigns',
      2: 'content',
      3: 'visuals',
      4: 'videos',
      5: 'published',
      6: 'metrics'
    }

    const key = stageKeys[stageId]
    if (key) {
      state[key][id] = {
        id,
        ...data,
        stageId,
        completedAt: new Date().toISOString()
      }
    }

    // Write updated state
    fs.writeFileSync(stateFilePath, JSON.stringify(state, null, 2))
    console.log(`Saved stage ${stageId} data:`, id)
  } catch (error) {
    console.error('Error saving stage data:', error)
  }
}

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
    longCatConfig = null,
    purpose,
    targetAudience,
    contentType,
    language,
    brandSettings,
    files = {}
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

      // Helper to persist base64 image to tmp file (fallback) and return path
      const persistBase64Image = (dataUrl: string, name: string) => {
        try {
          const [, meta, b64] = dataUrl.match(/^data:(.*?);base64,(.*)$/) || []
          const buffer = Buffer.from(b64 || dataUrl, 'base64')
          const ext = meta?.includes('png') ? '.png' : meta?.includes('jpeg') ? '.jpg' : '.png'
          const tmpPath = path.join(os.tmpdir(), `${randomUUID()}-${name}${ext}`)
          fs.writeFileSync(tmpPath, buffer)
          return tmpPath
        } catch (e) {
          console.error('Failed to persist reference image:', e)
          return null
        }
      }

      // Helper to upload base64 image to ImgBB if key exists
      const uploadToImgbb = async (dataUrl: string) => {
        const apiKey = process.env.IMGBB_API_KEY
        if (!apiKey) return null
        try {
          const [, , b64] = dataUrl.match(/^data:(.*?);base64,(.*)$/) || []
          const payload = new URLSearchParams()
          payload.append('key', apiKey)
          payload.append('image', b64 || dataUrl)
          const resp = await fetch('https://api.imgbb.com/1/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: payload
          })
          if (!resp.ok) {
            const text = await resp.text()
            console.error('ImgBB upload failed:', resp.status, text)
            return null
          }
          const json = await resp.json()
          return json?.data?.url || null
        } catch (e) {
          console.error('ImgBB upload error:', e)
          return null
        }
      }

      try {
        sendEvent({ log: `🚀 Starting Stage ${stageId}: ${stageName}...` })
        sendEvent({ stage: stageId, status: 'running', message: `Executing ${stageName}...` })

        // Special handling for Stage 1: Generate creative prompt
        if (stageId === 1) {
          sendEvent({ log: '🎨 Generating creative prompt with GPT-OSS-120B...' })

          try {
            const promptResponse = await fetch('http://localhost:3004/api/prompt/generate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                topic,
                campaignType,
                purpose,
                targetAudience,
                platforms,
                contentType,
                duration,
                language,
                brandSettings
              })
            })

            if (!promptResponse.ok) {
              throw new Error('Failed to generate creative prompt')
            }

            const promptData = await promptResponse.json()
            const generatedPrompt = promptData.prompt

            sendEvent({ log: '✅ Creative prompt generated successfully!' })

            // Save the generated prompt as stage 1 data
            const stageData = {
              topic,
              campaignType,
              platforms,
              status: 'completed',
              type: 'campaign-planning',
              creativePrompt: generatedPrompt,
              promptModel: promptData.model
            }

            saveStageData(stageId, stageData)
            sendEvent({ stage: stageId, status: 'completed', message: 'Creative prompt generated' })
            sendEvent({ log: '✅ Stage 1 completed successfully!' })
            controller.close()
            return

          } catch (error) {
            sendEvent({ log: `⚠️ Prompt generation failed: ${error instanceof Error ? error.message : 'Unknown error'}` })
            sendEvent({ log: '📦 Falling back to standard workflow execution...' })
            // Continue with normal backend execution if prompt generation fails
          }
        }

        // Special handling for Stage 2: Generate email newsletter content
        if (stageId === 2 && (platforms.includes('email') || campaignType.includes('email') || campaignType.includes('newsletter'))) {
          sendEvent({ log: '📧 Generating HTML email newsletter...' })

          try {
            // Get creative prompt from Stage 1 if available
            const backendRoot = path.join(process.cwd(), 'backend')
            const stateFilePath = path.join(backendRoot, 'data', 'workflow-state.json')
            let creativePrompt = ''

            if (fs.existsSync(stateFilePath)) {
              const stateContent = fs.readFileSync(stateFilePath, 'utf-8')
              const state = JSON.parse(stateContent)

              // Find the most recent campaign with matching topic
              const campaigns = Object.values(state.campaigns || {}) as any[]
              const matchingCampaign = campaigns
                .filter((c: any) => c.topic === topic)
                .sort((a: any, b: any) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())[0]

              if (matchingCampaign?.creativePrompt) {
                creativePrompt = matchingCampaign.creativePrompt
                sendEvent({ log: '📋 Using creative prompt from Stage 1' })
              }
            }

            const emailResponse = await fetch('http://localhost:3004/api/email/generate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                topic,
                purpose,
                targetAudience,
                creativePrompt,
                brandSettings,
                language
              })
            })

            if (!emailResponse.ok) {
              throw new Error('Failed to generate email newsletter')
            }

            const emailData = await emailResponse.json()

            sendEvent({ log: '✅ Email newsletter generated successfully!' })
            sendEvent({ log: `📧 Subject: ${emailData.subject}` })
            sendEvent({ log: `📝 Preheader: ${emailData.preheader}` })
            sendEvent({ log: `📄 HTML: ${emailData.html.length} characters` })

            // Save the generated email as stage 2 data
            const stageData = {
              topic,
              campaignType,
              platforms,
              status: 'completed',
              type: 'content-generation',
              contentType: 'email-newsletter',
              subject: emailData.subject,
              preheader: emailData.preheader,
              subjectVariations: emailData.subjectVariations,
              html: emailData.html,
              plainText: emailData.plainText,
              model: emailData.model
            }

            saveStageData(stageId, stageData)
            sendEvent({ stage: stageId, status: 'completed', message: 'Email newsletter generated', data: stageData })
            sendEvent({ log: '✅ Stage 2 completed successfully!' })
            controller.close()
            return

          } catch (error) {
            sendEvent({ log: `⚠️ Email generation failed: ${error instanceof Error ? error.message : 'Unknown error'}` })
            sendEvent({ log: '📦 Falling back to standard workflow execution...' })
            // Continue with normal backend execution if email generation fails
          }
        }

        // Path to backend (monorepo structure: frontend/backend/)
        const workingDir = path.join(process.cwd(), 'backend')
        const mainScript = path.join(workingDir, 'main.js')

        sendEvent({ log: `📍 Executing: ${mainScript}` })
        sendEvent({ log: `📍 Working Dir: ${workingDir}` })

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

        // Add parent node_modules to NODE_PATH for module resolution
        const parentNodeModules = path.join(process.cwd(), 'node_modules')
        const nodeEnv = {
          ...process.env,
          NODE_PATH: parentNodeModules + (process.env.NODE_PATH ? ':' + process.env.NODE_PATH : '')
        } as NodeJS.ProcessEnv

        // Inject reference image (first one) for WhatsApp static creatives
        if (files?.referenceImages?.length > 0) {
          const ref = files.referenceImages[0]
          // Try ImgBB first if key exists
          let refUrl: string | null = null
          if (process.env.IMGBB_API_KEY) {
            sendEvent({ log: '🖼️  Uploading reference image to ImgBB for Gemini guidance...' })
            refUrl = await uploadToImgbb(ref.data)
          }
          if (refUrl) {
            nodeEnv.VISUAL_REFERENCE_URL = refUrl
            sendEvent({ log: `🖼️  Using reference image URL for visuals: ${refUrl}` })
          } else {
            const tmpPath = persistBase64Image(ref.data, ref.name || 'ref')
            if (tmpPath) {
              nodeEnv.REFERENCE_IMAGE_PATH = tmpPath
              sendEvent({ log: `🖼️  Using reference image (temp file) for visuals: ${tmpPath}` })
            }
          }
        }

        // Pass LongCat configuration as environment variables for video stage
        if (stageId === 4 && longCatConfig) {
          nodeEnv.LONGCAT_ENABLED = longCatConfig.enabled ? 'true' : 'false'
          nodeEnv.LONGCAT_MODE = longCatConfig.mode || 'text-to-video'
          nodeEnv.LONGCAT_PROMPT = longCatConfig.prompt || ''
          nodeEnv.LONGCAT_DURATION = longCatConfig.duration?.toString() || duration.toString()
        }

        sendEvent({ log: `🚀 Command: node ${args.slice(1).join(' ')}` })

        // Spawn backend process
        const backendProcess = spawn('node', args, {
          cwd: workingDir,
          env: nodeEnv
        })

        let outputBuffer = ''

        // Handle stdout - collect output and send events
        backendProcess.stdout.on('data', (data) => {
          const output = data.toString()
          outputBuffer += output
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
            // Save stage data based on stage type
            const stageData: any = {
              topic,
              campaignType,
              platforms,
              status: 'completed',
              output: outputBuffer
            }

            // Add stage-specific data
            if (stageId === 1) {
              stageData.type = 'campaign-planning'
            } else if (stageId === 2) {
              stageData.type = 'content-generation'
            } else if (stageId === 3) {
              stageData.type = 'visual-assets'
            } else if (stageId === 4) {
              stageData.type = 'video-production'
              stageData.duration = duration
              stageData.useVeo = useVeo
              stageData.useAvatar = useAvatar
            } else if (stageId === 5) {
              stageData.type = 'publishing'
            } else if (stageId === 6) {
              stageData.type = 'analytics'
            }

            // Save to workflow state file
            saveStageData(stageId, stageData)

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
