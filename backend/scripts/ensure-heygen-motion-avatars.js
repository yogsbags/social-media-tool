#!/usr/bin/env node
/**
 * Call HeyGen Add Motion for each entry in heygen-native-voice-mapping.json.
 * @see https://docs.heygen.com/reference/add-motion
 *
 * Skips Siddharth Vora (custom group + name heuristics).
 *
 *   HEYGEN_API_KEY=... node scripts/ensure-heygen-motion-avatars.js
 *   HEYGEN_ADD_MOTION_TYPE=consistent_gen_3 node scripts/ensure-heygen-motion-avatars.js
 *   node scripts/ensure-heygen-motion-avatars.js --force
 */

const fs = require('fs');
const path = require('path');

const mappingPath = path.join(__dirname, '../config/heygen-native-voice-mapping.json');
const apiKey = process.env.HEYGEN_API_KEY;
const motionType = process.env.HEYGEN_ADD_MOTION_TYPE || 'consistent';
const force = process.argv.includes('--force');
const delayMs = parseInt(process.env.HEYGEN_ADD_MOTION_DELAY_MS || '2000', 10);

if (!apiKey) {
  console.error('HEYGEN_API_KEY is required');
  process.exit(1);
}

function shouldSkipEntry(groupId, entry) {
  if (!entry || typeof entry !== 'object') return true;
  if (groupId === '277d9624a6c1413aa02cefa1366741aa') return true;
  const an = String(entry.avatarName || '').toLowerCase();
  const vn = String(entry.voiceName || '').toLowerCase();
  if (an.includes('siddharth') && an.includes('vora')) return true;
  if (vn.includes('siddharth') && vn.includes('vora')) return true;
  return false;
}

function resolveAddMotionSourceId(entry, groupId) {
  if (Array.isArray(entry.lookIds) && entry.lookIds.length > 0) {
    return entry.lookIds[0];
  }
  return groupId;
}

async function addMotion(id, prompt) {
  const body = { id, motion_type: motionType };
  if (prompt) body.prompt = prompt;

  const res = await fetch('https://api.heygen.com/v2/photo_avatar/add_motion', {
    method: 'POST',
    headers: {
      'X-Api-Key': apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    const msg = data.error?.message || data.message || JSON.stringify(data.error || data);
    throw new Error(msg);
  }
  return data.data?.id;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

(async () => {
  const raw = fs.readFileSync(mappingPath, 'utf8');
  const mapping = JSON.parse(raw);

  for (const [groupId, entry] of Object.entries(mapping)) {
    if (shouldSkipEntry(groupId, entry)) {
      console.log('Skip: ' + groupId + ' (' + (entry && entry.avatarName) + ')');
      continue;
    }
    if (entry.motionAvatarId && !force) {
      console.log('OK (existing): ' + entry.avatarName + ' motionAvatarId=' + entry.motionAvatarId);
      continue;
    }

    const sourceId = resolveAddMotionSourceId(entry, groupId);
    const prompt =
      (typeof entry.motionPrompt === 'string' && entry.motionPrompt.trim()) ||
      'Natural subtle head and body movement while speaking professionally to camera; static background.';

    console.log('Add motion: ' + entry.avatarName + ' sourceId=' + sourceId + ' motion_type=' + motionType + '...');
    try {
      const motionId = await addMotion(sourceId, prompt);
      entry.motionAvatarId = motionId;
      console.log('  -> motionAvatarId=' + motionId);
    } catch (e) {
      console.error('  FAILED: ' + e.message);
    }
    await sleep(delayMs);
  }

  fs.writeFileSync(mappingPath, JSON.stringify(mapping, null, 2) + '\n', 'utf8');
  console.log('Wrote ' + mappingPath);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
