import { NextRequest, NextResponse } from 'next/server'
import { getVideoJob } from '../utils'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  _request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  const jobId = String(params?.jobId || '').trim()
  if (!jobId) {
    return NextResponse.json({ error: 'jobId is required' }, { status: 400 })
  }

  const job = getVideoJob(jobId)
  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  return NextResponse.json({ job })
}

