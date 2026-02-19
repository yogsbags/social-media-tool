import { randomUUID } from 'crypto'
import { spawn } from 'child_process'
import path from 'path'
import { NextRequest, NextResponse } from 'next/server'
import { upsertVideoJob, type VideoJobRecord } from './utils'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const topic = String(body?.topic || '').trim()
    if (!topic) {
      return NextResponse.json({ error: 'topic is required' }, { status: 400 })
    }

    const stageId = Number(body?.stageId || 4)
    if (stageId !== 4) {
      return NextResponse.json({ error: 'Only stageId=4 is supported for video jobs' }, { status: 400 })
    }

    const jobId = `video-${Date.now()}-${randomUUID().slice(0, 8)}`
    const job: VideoJobRecord = {
      id: jobId,
      status: 'queued',
      createdAt: new Date().toISOString(),
      request: body,
      logs: ['Queued video job'],
    }
    upsertVideoJob(job)

    const projectRoot = process.cwd()
    const backendRoot = path.join(projectRoot, 'backend')
    const runnerPath = path.join(backendRoot, 'scripts', 'run-video-job.js')
    const parentNodeModules = path.join(projectRoot, 'node_modules')
    const env = {
      ...process.env,
      NODE_PATH: parentNodeModules + (process.env.NODE_PATH ? `:${process.env.NODE_PATH}` : ''),
      VIDEO_JOB_ID: jobId,
    } as NodeJS.ProcessEnv

    const child = spawn('node', [runnerPath], {
      cwd: backendRoot,
      env,
      detached: true,
      stdio: 'ignore',
    })
    child.unref()

    return NextResponse.json({ ok: true, jobId })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to enqueue video job' },
      { status: 500 }
    )
  }
}

