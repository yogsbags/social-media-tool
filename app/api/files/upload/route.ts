import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024

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
    const form = await request.formData()
    const file = form.get('file')

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
    }

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: 'Only PDF files are supported' }, { status: 400 })
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: `PDF too large. Max allowed is ${MAX_UPLOAD_BYTES} bytes` }, { status: 413 })
    }

    const { client, bucket } = buildR2Client()
    const key = `research-pdfs/${Date.now()}-${randomUUID()}-${sanitizeName(file.name)}`
    const body = Buffer.from(await file.arrayBuffer())

    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: file.type || 'application/pdf',
      })
    )

    return NextResponse.json({
      fileId: key,
      bucket,
      name: file.name,
      size: file.size,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to upload file to R2' },
      { status: 500 }
    )
  }
}

