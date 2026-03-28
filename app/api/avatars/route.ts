import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export async function GET() {
  try {
    const possiblePaths = [
      path.join(process.cwd(), '..', 'backend', 'config', 'heygen-native-voice-mapping.json'),
      path.join(process.cwd(), 'backend', 'config', 'heygen-native-voice-mapping.json'),
      path.join(process.cwd(), '..', '..', 'backend', 'config', 'heygen-native-voice-mapping.json'),
    ]

    const configPath = possiblePaths.find((p) => fs.existsSync(p))
    if (!configPath) {
      throw new Error('Avatar mapping file not found')
    }

    const avatarData = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    const avatars = Object.values(avatarData).map((avatar: any) => ({
      id: avatar.groupId,
      name: avatar.avatarName || avatar.name || avatar.groupId,
      groupId: avatar.groupId,
      lookIds: Array.isArray(avatar.lookIds) ? avatar.lookIds : [],
      voiceId: avatar.voiceId || '',
      voiceName: avatar.voiceName || avatar.voiceId || 'Default voice',
      gender: avatar.gender || 'unknown',
      description: avatar.description || '',
      language: avatar.language || 'unknown',
      motionEnabled: avatar.motionEnabled !== false
    }))

    return NextResponse.json({ avatars }, { status: 200 })
  } catch (error: any) {
    console.error('Error loading avatars:', error)
    return NextResponse.json(
      { error: 'Failed to load avatars', message: error.message },
      { status: 500 }
    )
  }
}
