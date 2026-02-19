import fs from 'fs'
import path from 'path'

export type VideoJobStatus = 'queued' | 'running' | 'completed' | 'error'

export type VideoJobRecord = {
  id: string
  status: VideoJobStatus
  createdAt: string
  startedAt?: string
  finishedAt?: string
  request: Record<string, any>
  logs: string[]
  result?: Record<string, any>
  error?: string
}

const backendRoot = path.join(process.cwd(), 'backend')
const jobsFilePath = path.join(backendRoot, 'data', 'video-jobs.json')

function ensureJobsFile() {
  const jobsDir = path.dirname(jobsFilePath)
  if (!fs.existsSync(jobsDir)) fs.mkdirSync(jobsDir, { recursive: true })
  if (!fs.existsSync(jobsFilePath)) {
    fs.writeFileSync(jobsFilePath, JSON.stringify({ jobs: {} }, null, 2))
  }
}

export function readVideoJobs(): Record<string, VideoJobRecord> {
  ensureJobsFile()
  try {
    const raw = fs.readFileSync(jobsFilePath, 'utf-8')
    const parsed = JSON.parse(raw)
    return parsed?.jobs && typeof parsed.jobs === 'object' ? parsed.jobs : {}
  } catch {
    return {}
  }
}

export function writeVideoJobs(jobs: Record<string, VideoJobRecord>) {
  ensureJobsFile()
  fs.writeFileSync(jobsFilePath, JSON.stringify({ jobs }, null, 2))
}

export function getVideoJob(jobId: string): VideoJobRecord | null {
  const jobs = readVideoJobs()
  return jobs[jobId] || null
}

export function upsertVideoJob(job: VideoJobRecord) {
  const jobs = readVideoJobs()
  jobs[job.id] = job
  writeVideoJobs(jobs)
}

