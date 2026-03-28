#!/usr/bin/env node

/**
 * Test HeyGen Avatar Integration
 *
 * This script tests the HeyGen avatar video generation for the spokesperson
 * by calling the orchestrator's stageVideo method with avatar options.
 */

const path = require('path');
const fs = require('fs');

// Load HeyGen environment variables
const envPath = path.join(__dirname, '.env.heygen');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([A-Z_]+)="?([^"]+)"?$/);
    if (match) {
      process.env[match[1]] = match[2];
    }
  });
  console.log('✅ Loaded HeyGen environment variables from .env.heygen\n');
} else {
  console.error('❌ .env.heygen file not found');
  process.exit(1);
}

// Import orchestrator
const SocialMediaOrchestrator = require('./backend/core/orchestrator');

async function testHeyGenIntegration() {
  console.log('🧪 Testing HeyGen Avatar Integration\n');
  console.log('='.repeat(72));
  console.log('TEST: the spokesperson Avatar Video Generation');
  console.log('='.repeat(72) + '\n');

  // Initialize orchestrator
  const orchestrator = new SocialMediaOrchestrator({
    projectRoot: __dirname,
    simulate: false
  });

  await orchestrator.initialize();

  // Test configuration
  const testOptions = {
    platform: 'linkedin',
    format: 'testimonial',
    topic: 'the brand investment strategy and portfolio performance',
    duration: 15, // 15 seconds for quick test
    aspectRatio: '16:9',
    useAvatar: true,
    avatarId: 'siddharth-vora', // This triggers HeyGen routing
    scriptText: 'Hello, I am the spokesperson, Fund Manager at the brand. We specialize in long-term value investing with a focus on quality businesses. Our portfolio has consistently outperformed benchmarks through disciplined research and patient capital allocation.',
    waitForCompletion: false // Don't wait for completion in test (async mode)
  };

  console.log('📋 Test Configuration:');
  console.log(`   Platform: ${testOptions.platform}`);
  console.log(`   Format: ${testOptions.format}`);
  console.log(`   Duration: ${testOptions.duration}s`);
  console.log(`   Avatar: ${testOptions.avatarId}`);
  console.log(`   Script: ${testOptions.scriptText.substring(0, 60)}...`);
  console.log(`   Wait for completion: ${testOptions.waitForCompletion}\n`);

  console.log('Environment Variables:');
  console.log(`   HEYGEN_API_KEY: ${process.env.HEYGEN_API_KEY ? '✅ SET' : '❌ NOT SET'}`);
  console.log(`   HEYGEN_AVATAR_ID_SIDDHARTH: ${process.env.HEYGEN_AVATAR_ID_SIDDHARTH || '❌ NOT SET'}`);
  console.log(`   HEYGEN_VOICE_ID_SIDDHARTH: ${process.env.HEYGEN_VOICE_ID_SIDDHARTH || '❌ NOT SET'}\n`);

  try {
    console.log('▶️  Starting HeyGen video generation...\n');

    const result = await orchestrator.stageVideo(testOptions);

    console.log('\n' + '='.repeat(72));
    console.log('✅ TEST PASSED: HeyGen Integration Successful');
    console.log('='.repeat(72) + '\n');

    console.log('📊 Result:');
    console.log(`   Success: ${result.success}`);
    console.log(`   Video URL: ${result.videoUrl || result.hostedUrl || 'Pending'}`);
    console.log(`   Local Path: ${result.localPath || 'N/A (cloud-hosted)'}`);
    console.log(`   Duration: ${result.duration}s`);

    if (result.metadata) {
      console.log('\n📋 Metadata:');
      console.log(`   Type: ${result.metadata.type}`);
      console.log(`   Video ID: ${result.metadata.videoId}`);
      console.log(`   Avatar: ${result.metadata.avatar}`);
      console.log(`   Status: ${result.metadata.status || 'Unknown'}`);

      if (result.metadata.message) {
        console.log(`   Message: ${result.metadata.message}`);
      }
    }

    if (result.metadata?.videoId && !testOptions.waitForCompletion) {
      console.log('\n💡 Next Steps:');
      console.log(`   1. Check video status at: https://app.heygen.com/home`);
      console.log(`   2. Video ID: ${result.metadata.videoId}`);
      console.log(`   3. Status typically completes in 2-5 minutes`);
    }

    console.log('\n✨ HeyGen integration is working correctly!\n');

  } catch (error) {
    console.error('\n' + '='.repeat(72));
    console.error('❌ TEST FAILED: HeyGen Integration Error');
    console.error('='.repeat(72) + '\n');
    console.error(`Error: ${error.message}\n`);

    if (error.stack) {
      console.error('Stack Trace:');
      console.error(error.stack);
    }

    process.exit(1);
  }
}

// Run test
testHeyGenIntegration().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
