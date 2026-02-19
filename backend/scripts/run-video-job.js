#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')

const backendRoot = path.join(__dirname, '..')
const jobsFilePath = path.join(backendRoot, 'data', 'video-jobs.json')
const workflowStatePath = path.join(backendRoot, 'data', 'workflow-state.json')
const jobId = process.env.VIDEO_JOB_ID

function ensureJobsFile() {
  const dir = path.dirname(jobsFilePath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  if (!fs.existsSync(jobsFilePath)) fs.writeFileSync(jobsFilePath, JSON.stringify({ jobs: {} }, null, 2))
}

function readJobs() {
  ensureJobsFile()
  try {
    const raw = fs.readFileSync(jobsFilePath, 'utf-8')
    const parsed = JSON.parse(raw)
    return parsed?.jobs && typeof parsed.jobs === 'object' ? parsed.jobs : {}
  } catch {
    return {}
  }
}

function writeJobs(jobs) {
  ensureJobsFile()
  fs.writeFileSync(jobsFilePath, JSON.stringify({ jobs }, null, 2))
}

function updateJob(mutator) {
  const jobs = readJobs()
  const job = jobs[jobId]
  if (!job) return null
  mutator(job)
  jobs[jobId] = job
  writeJobs(jobs)
  return job
}

function appendLog(line) {
  const msg = String(line || '').trim()
  if (!msg) return
  updateJob((job) => {
    job.logs = Array.isArray(job.logs) ? job.logs : []
    job.logs.push(msg)
    if (job.logs.length > 500) job.logs = job.logs.slice(-500)
  })
}

function saveStage4Data(base, parsedVideoResult, outputBuffer) {
  const stageData = {
    id: `4-${Date.now()}`,
    stageId: 4,
    type: 'video-production',
    topic: base.topic,
    campaignType: base.campaignType,
    platforms: base.platforms || [],
    duration: base.duration,
    useVeo: base.useVeo,
    useAvatar: base.useAvatar,
    avatarId: base.avatarId || undefined,
    avatarScriptText: base.avatarScriptText || undefined,
    avatarVoiceId: base.avatarVoiceId || undefined,
    status: 'completed',
    output: outputBuffer,
    hostedUrl: parsedVideoResult?.hostedUrl || undefined,
    videoUrl: parsedVideoResult?.videoUrl || undefined,
    directVideoUrl: parsedVideoResult?.directVideoUrl || undefined,
    dashboardUrl: parsedVideoResult?.dashboardUrl || undefined,
    videoId: parsedVideoResult?.videoId || undefined,
    videoStatus: parsedVideoResult?.status || undefined,
    completedAt: new Date().toISOString(),
  }

  let state = {
    campaigns: {},
    content: {},
    visuals: {},
    videos: {},
    published: {},
    metrics: {}
  }
  try {
    if (fs.existsSync(workflowStatePath)) {
      state = JSON.parse(fs.readFileSync(workflowStatePath, 'utf-8'))
    }
  } catch {
    // keep defaults
  }
  state.videos = state.videos || {}
  state.videos[stageData.id] = stageData
  fs.writeFileSync(workflowStatePath, JSON.stringify(state, null, 2))
}

function parseCampaignType(campaignType) {
  const ct = String(campaignType || 'instagram-reel')
  const parts = ct.split('-')
  const platform = parts[0] || 'instagram'
  const format = parts.slice(1).join('-') || 'reel'
  return { platform, format }
}

function isPlayableVideoUrl(url) {
  const s = String(url || '').trim()
  return /^https?:\/\//i.test(s) && /(\.mp4|\.mov|\.webm)(\?|$)/i.test(s)
}

async function run() {
  if (!jobId) process.exit(1)
  const jobs = readJobs()
  const job = jobs[jobId]
  if (!job) process.exit(1)

  updateJob((j) => {
    j.status = 'running'
    j.startedAt = new Date().toISOString()
    j.logs = [...(j.logs || []), 'Starting video generation worker']
  })

  const req = job.request || {}
  const { platform, format } = parseCampaignType(req.campaignType)
  const args = [
    path.join(backendRoot, 'main.js'),
    'stage',
    'video',
    '--topic', String(req.topic || 'PL Capital market update'),
    '--language', String(req.language || 'english'),
    '--type', String(req.campaignType || 'instagram-reel'),
    '--platform', platform,
    '--format', format,
    '--duration', String(Number(req.duration || 15)),
    '--aspect-ratio', String(req.aspectRatio || '9:16'),
    '--wait-for-completion',
  ]

  if (req.useVeo) args.push('--use-veo')
  if (req.useAvatar) args.push('--use-avatar')
  else args.push('--no-avatar')
  if (req.useAvatar && req.avatarId) args.push('--avatar-id', String(req.avatarId))
  if (req.useAvatar && req.avatarVoiceId) args.push('--avatar-voice-id', String(req.avatarVoiceId))
  if (req.useAvatar && req.avatarScriptText) args.push('--avatar-script', String(req.avatarScriptText))

  appendLog(`Running: node ${args.slice(1).join(' ')}`)

  const child = spawn('node', args, {
    cwd: backendRoot,
    env: process.env,
  })

  let outputBuffer = ''
  let parsedVideoResult = null

  child.stdout.on('data', (d) => {
    const out = d.toString()
    outputBuffer += out
    out.split('\n').map((l) => l.trim()).filter(Boolean).forEach(appendLog)
    const m = out.match(/__VIDEO_RESULT__(.+)/)
    if (m) {
      try {
        parsedVideoResult = JSON.parse(m[1].trim())
      } catch {
        // ignore
      }
    }
  })

  child.stderr.on('data', (d) => {
    const out = d.toString()
    outputBuffer += out
    out.split('\n').map((l) => l.trim()).filter(Boolean).forEach((l) => appendLog(`⚠️ ${l}`))
  })

  child.on('close', (code) => {
    const direct = parsedVideoResult?.directVideoUrl || parsedVideoResult?.videoUrl || ''
    const ok = code === 0 && isPlayableVideoUrl(direct)

    if (ok) {
      saveStage4Data(req, parsedVideoResult, outputBuffer)
      updateJob((j) => {
        j.status = 'completed'
        j.finishedAt = new Date().toISOString()
        j.result = {
          ...parsedVideoResult,
          stageSaved: true,
        }
        j.logs = [...(j.logs || []), 'Video job completed successfully']
      })
    } else {
      updateJob((j) => {
        j.status = 'error'
        j.finishedAt = new Date().toISOString()
        j.error = parsedVideoResult?.dashboardUrl
          ? `Video URL not ready yet. Track status: ${parsedVideoResult.dashboardUrl}`
          : `Video generation failed (exit code ${code})`
        j.result = parsedVideoResult || undefined
        j.logs = [...(j.logs || []), 'Video job failed or URL not ready']
      })
    }
  })
}

run().catch((err) => {
  appendLog(`Fatal worker error: ${err?.message || String(err)}`)
  updateJob((j) => {
    j.status = 'error'
    j.finishedAt = new Date().toISOString()
    j.error = err?.message || 'Unknown worker error'
  })
})

