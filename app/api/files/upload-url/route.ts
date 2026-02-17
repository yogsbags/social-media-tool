import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DIRECT_UPLOAD_MAX_BYTES = Number(process.env.R2_DIRECT_UPLOAD_MAX_BYTES || 200 * 1024 * 1024)

function buildR2Client(): { client: S3Client; bucket: string } {
  const accessKeyId = process.env.R2_ACCESS_KEY_ID || ''
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || ''
  const endpoint = process.env.R2_ENDPOINT || ''
  const bucket = process.env.R2_BUCKET_NAME || process.env.R2_BUCKET || ''

  if (!accessKeyId || !secretAccessKey || !endpoint || !bucket) {
    throw new Error('R2 is not fully configured. Set R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT, and R2_BUCKET_NAME.')
  }

  const client = new S3Client({
    region: 'auto',
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  })

  return { client, bucket }
}

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_')
}

export async function POST(request: NextRequest) {
  try {
    const { name, size, contentType } = await request.json() as {
      name?: string
      size?: number
      contentType?: string
    }

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Missing file name' }, { status: 400 })
    }

    if (!name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: 'Only PDF files are supported' }, { status: 400 })
    }

    if (!size || typeof size !== 'number' || size <= 0) {
      return NextResponse.json({ error: 'Missing or invalid file size' }, { status: 400 })
    }

    if (size > DIRECT_UPLOAD_MAX_BYTES) {
      return NextResponse.json(
        { error: `PDF too large. Max allowed is ${DIRECT_UPLOAD_MAX_BYTES} bytes` },
        { status: 413 }
      )
    }

    const { client, bucket } = buildR2Client()
    const key = `research-pdfs/${Date.now()}-${randomUUID()}-${sanitizeName(name)}`
    const putCommand = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType || 'application/pdf',
    })

    const uploadUrl = await getSignedUrl(client, putCommand, { expiresIn: 15 * 60 })

    return NextResponse.json({
      uploadUrl,
      fileId: key,
      bucket,
      maxBytes: DIRECT_UPLOAD_MAX_BYTES,
      expiresInSeconds: 15 * 60,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create upload URL' },
      { status: 500 }
    )
  }
}
