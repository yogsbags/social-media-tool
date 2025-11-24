'use client'

import { useState } from 'react'
import VideoProducer from './components/VideoProducer'
import PublishingQueue from './components/PublishingQueue'
import FileUpload from './components/FileUpload'
import PromptEditor from './components/PromptEditor'

type WorkflowStage = {
  id: number
  name: string
  status: 'idle' | 'running' | 'completed' | 'error'
  message: string
}

type CampaignData = {
  campaignId?: string
  topic?: string
  script?: string
  caption?: string
  assets?: any[]
  videoData?: any
  publishedUrls?: Record<string, string>
}

type StageData = {
  data: any
  summary?: {
    [key: string]: any
  }
}

export default function Home() {
  const [isRunning, setIsRunning] = useState(false)
  const [stages, setStages] = useState<WorkflowStage[]>([
    { id: 1, name: 'Stage 1: Campaign Planning', status: 'idle', message: '' },
    { id: 2, name: 'Stage 2: Content Generation', status: 'idle', message: '' },
    { id: 3, name: 'Stage 3: Visual Assets', status: 'idle', message: '' },
    { id: 4, name: 'Stage 4: Video Production', status: 'idle', message: '' },
    { id: 5, name: 'Stage 5: Publishing', status: 'idle', message: '' },
    { id: 6, name: 'Stage 6: Analytics & Tracking', status: 'idle', message: '' },
  ])
  const [logs, setLogs] = useState<string[]>([])
  const [stageData, setStageData] = useState<Record<number, StageData>>({})
  const [campaignData, setCampaignData] = useState<CampaignData>({})
  const [executionMode, setExecutionMode] = useState<'full' | 'staged'>('full')
  const [executingStage, setExecutingStage] = useState<number | null>(null)

  // Campaign configuration
  const [campaignType, setCampaignType] = useState<string>('linkedin-testimonial')
  const [purpose, setPurpose] = useState<string>('brand-awareness')
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(['linkedin'])
  const [topic, setTopic] = useState<string>('')
  const [duration, setDuration] = useState<number>(90)
  const [useVeo, setUseVeo] = useState<boolean>(true)
  const [useAvatar, setUseAvatar] = useState<boolean>(true)
  const [autoPublish, setAutoPublish] = useState<boolean>(false)
  const [targetAudience, setTargetAudience] = useState<string>('all_clients')

  // File uploads
  const [researchPDFs, setResearchPDFs] = useState<File[]>([])
  const [referenceImages, setReferenceImages] = useState<File[]>([])
  const [referenceVideo, setReferenceVideo] = useState<File[]>([])

  // Brand Guidelines
  const [useBrandGuidelines, setUseBrandGuidelines] = useState<boolean>(true)
  const [customColors, setCustomColors] = useState<string>('')
  const [customTone, setCustomTone] = useState<string>('')
  const [customInstructions, setCustomInstructions] = useState<string>('')

  // Prompt editing
  const [showPromptEditor, setShowPromptEditor] = useState<boolean>(false)
  const [currentPrompt, setCurrentPrompt] = useState<string>('')
  const [promptStage, setPromptStage] = useState<number | null>(null)
  const [generatedPrompts, setGeneratedPrompts] = useState<Record<number, string>>({})

  // VEO 3.1 Frame Interpolation
  const [useFrameInterpolation, setUseFrameInterpolation] = useState<boolean>(false)
  const [firstFrameMode, setFirstFrameMode] = useState<'upload' | 'text-gemini' | 'text-imagen'>('text-gemini')
  const [lastFrameMode, setLastFrameMode] = useState<'upload' | 'text-gemini' | 'text-imagen'>('text-gemini')
  const [firstFrameImage, setFirstFrameImage] = useState<File[]>([])
  const [lastFrameImage, setLastFrameImage] = useState<File[]>([])
  const [firstFramePrompt, setFirstFramePrompt] = useState<string>('')
  const [lastFramePrompt, setLastFramePrompt] = useState<string>('')
  const [sceneExtensionCount, setSceneExtensionCount] = useState<number>(0)

  // LongCat Video Generation (for videos >148s up to 15 minutes)
  const [useLongCat, setUseLongCat] = useState<boolean>(false)
  const [longCatMode, setLongCatMode] = useState<'text-to-video' | 'image-to-video'>('text-to-video')
  const [longCatPrompt, setLongCatPrompt] = useState<string>('')
  const [longCatReferenceImage, setLongCatReferenceImage] = useState<File[]>([])

  const campaignTypes = [
    { value: 'linkedin-carousel', label: '📊 LinkedIn Carousel', platforms: ['linkedin'] },
    { value: 'linkedin-testimonial', label: '🎥 LinkedIn Testimonial', platforms: ['linkedin'] },
    { value: 'linkedin-data-viz', label: '📈 LinkedIn Data Viz', platforms: ['linkedin'] },
    { value: 'instagram-reel', label: '📱 Instagram Reel', platforms: ['instagram'] },
    { value: 'instagram-carousel', label: '🖼️ Instagram Carousel', platforms: ['instagram'] },
    { value: 'youtube-explainer', label: '📺 YouTube Explainer', platforms: ['youtube'] },
    { value: 'youtube-short', label: '⚡ YouTube Short', platforms: ['youtube'] },
    { value: 'facebook-community', label: '👥 Facebook Community', platforms: ['facebook'] },
    { value: 'twitter-thread', label: '🧵 Twitter Thread', platforms: ['twitter'] },
    { value: 'whatsapp-creative', label: '💬 WhatsApp Creative', platforms: ['whatsapp'] },
    { value: 'email-newsletter', label: '📧 Email Newsletter', platforms: ['email'] },
  ]

  const purposeOptions = [
    { value: 'mobile-app', label: '📱 Mobile App', description: 'PL Capital Mobile App' },
    { value: 'partners-mobile-app', label: '🤝 Partners Mobile App', description: 'IFA/Partner Platform' },
    { value: 'website', label: '🌐 Website', description: 'Corporate Website' },
    { value: 'web-app', label: '💻 Web App', description: 'Web Application' },
    { value: 'pms-madp', label: '📊 PMS-MADP', description: 'Multi-Asset Dynamic Portfolio' },
    { value: 'pms-aqua', label: '💧 PMS-AQUA', description: 'Quant Portfolio Strategy' },
    { value: 'aif', label: '🏦 AIF', description: 'Alternative Investment Fund' },
    { value: 'mtf', label: '📈 MTF', description: 'Margin Trading Facility' },
    { value: 'brand-awareness', label: '✨ Brand Awareness', description: 'General Brand Building' },
  ]

  const targetAudienceOptions = [
    { value: 'internal', label: '👥 Internal communication', description: 'Employee communications, training' },
    { value: 'mass_affluent', label: '💰 Mass affluent', description: 'Emerging investors, young professionals' },
    { value: 'hni', label: '💎 HNIs', description: 'High Net Worth Individuals' },
    { value: 'uhni', label: '👑 UHNIs', description: 'Ultra High Net Worth Individuals' },
    { value: 'all_clients', label: '🌐 All clients', description: 'General client communications' },
  ]

  const platforms = [
    { value: 'linkedin', label: 'LinkedIn', icon: '🔗', color: 'bg-blue-500' },
    { value: 'instagram', label: 'Instagram', icon: '📸', color: 'bg-pink-500' },
    { value: 'youtube', label: 'YouTube', icon: '📺', color: 'bg-red-500' },
    { value: 'facebook', label: 'Facebook', icon: '👥', color: 'bg-blue-600' },
    { value: 'twitter', label: 'Twitter/X', icon: '🐦', color: 'bg-sky-500' },
    { value: 'whatsapp', label: 'WhatsApp', icon: '💬', color: 'bg-green-500' },
    { value: 'email', label: 'Email', icon: '📧', color: 'bg-gray-600' },
  ]

  const updateStage = async (stageId: number, status: WorkflowStage['status'], message: string) => {
    setStages(prev => prev.map(stage =>
      stage.id === stageId ? { ...stage, status, message } : stage
    ))

    if (status === 'completed') {
      try {
        const response = await fetch(`/api/workflow/data?stage=${stageId}`)
        if (response.ok) {
          const data = await response.json()
          setStageData(prev => ({ ...prev, [stageId]: data }))
        }
      } catch (error) {
        console.error(`Failed to fetch data for stage ${stageId}:`, error)
      }
    }
  }

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString()
    setLogs(prev => [...prev, `[${timestamp}] ${message}`])
  }

  const executeStage = async (stageId: number) => {
    setExecutingStage(stageId)
    addLog(`🚀 Starting Stage ${stageId} execution...`)

    try {
      // Prepare file data
      addLog('📎 Preparing reference materials...')
      const fileData = await prepareFilesForAPI()

      const response = await fetch('/api/workflow/stage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stageId,
          campaignType,
          purpose,
          platforms: selectedPlatforms,
          topic,
          duration,
          useVeo,
          useAvatar,
          autoPublish,
          targetAudience,
          campaignData,
          files: fileData,
          brandSettings: {
            useBrandGuidelines,
            customColors: useBrandGuidelines ? null : customColors,
            customTone: useBrandGuidelines ? null : customTone,
            customInstructions: useBrandGuidelines ? null : customInstructions
          },
          promptOverride: generatedPrompts[stageId] || null,
          frameInterpolation: useVeo && useFrameInterpolation ? {
            enabled: true,
            sceneExtensionCount,
            firstFrame: {
              mode: firstFrameMode,
              prompt: firstFrameMode !== 'upload' ? firstFramePrompt : null
            },
            lastFrame: {
              mode: lastFrameMode,
              prompt: lastFrameMode !== 'upload' ? lastFramePrompt : null
            }
          } : null,
          longCatConfig: useLongCat ? {
            enabled: true,
            mode: longCatMode,
            prompt: longCatPrompt,
            duration: duration
          } : null
        }),
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value)
          const lines = chunk.split('\n\n')

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6))

                if (data.stage) {
                  await updateStage(data.stage, data.status, data.message)
                  addLog(`Stage ${data.stage}: ${data.message}`)
                } else if (data.log) {
                  addLog(data.log)
                } else if (data.campaignData) {
                  setCampaignData(prev => ({ ...prev, ...data.campaignData }))
                }
              } catch (e) {
                console.error('Parse error:', e)
              }
            }
          }
        }
      }

      addLog(`✅ Stage ${stageId} completed!`)
    } catch (error) {
      addLog(`❌ Error in Stage ${stageId}: ${error instanceof Error ? error.message : 'Unknown error'}`)
      console.error('Stage error:', error)
    } finally {
      setExecutingStage(null)
    }
  }

  const executeWorkflow = async () => {
    setIsRunning(true)
    setLogs([])
    setStageData({})
    setCampaignData({})
    setStages(stages.map(s => ({ ...s, status: 'idle', message: '' })))

    try {
      addLog('🚀 Starting full workflow execution...')

      // Prepare file data
      addLog('📎 Preparing reference materials...')
      const fileData = await prepareFilesForAPI()

      const response = await fetch('/api/workflow/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignType,
          purpose,
          platforms: selectedPlatforms,
          topic,
          duration,
          useVeo,
          useAvatar,
          autoPublish,
          targetAudience,
          files: fileData,
          brandSettings: {
            useBrandGuidelines,
            customColors: useBrandGuidelines ? null : customColors,
            customTone: useBrandGuidelines ? null : customTone,
            customInstructions: useBrandGuidelines ? null : customInstructions
          },
          frameInterpolation: useVeo && useFrameInterpolation ? {
            enabled: true,
            sceneExtensionCount,
            firstFrame: {
              mode: firstFrameMode,
              prompt: firstFrameMode !== 'upload' ? firstFramePrompt : null
            },
            lastFrame: {
              mode: lastFrameMode,
              prompt: lastFrameMode !== 'upload' ? lastFramePrompt : null
            }
          } : null,
          longCatConfig: useLongCat ? {
            enabled: true,
            mode: longCatMode,
            prompt: longCatPrompt,
            duration: duration
          } : null
        }),
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value)
          const lines = chunk.split('\n\n')

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6))

                if (data.stage) {
                  updateStage(data.stage, data.status, data.message)
                  addLog(`Stage ${data.stage}: ${data.message}`)
                } else if (data.log) {
                  addLog(data.log)
                } else if (data.campaignData) {
                  setCampaignData(prev => ({ ...prev, ...data.campaignData }))
                }
              } catch (e) {
                console.error('Parse error:', e)
              }
            }
          }
        }
      }

      addLog('✅ Workflow completed successfully!')
    } catch (error) {
      addLog(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
      console.error('Workflow error:', error)
    } finally {
      setIsRunning(false)
    }
  }

  const getStatusIcon = (status: WorkflowStage['status']) => {
    switch (status) {
      case 'idle': return '⚪'
      case 'running': return '🔵'
      case 'completed': return '✅'
      case 'error': return '❌'
    }
  }

  const getStatusColor = (status: WorkflowStage['status']) => {
    switch (status) {
      case 'idle': return 'text-gray-400'
      case 'running': return 'text-blue-500 animate-pulse'
      case 'completed': return 'text-green-500'
      case 'error': return 'text-red-500'
    }
  }

  const togglePlatform = (platform: string) => {
    setSelectedPlatforms(prev =>
      prev.includes(platform)
        ? prev.filter(p => p !== platform)
        : [...prev, platform]
    )
  }

  // Convert files to base64 for API transmission
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = error => reject(error)
    })
  }

  const prepareFilesForAPI = async () => {
    const fileData: {
      researchPDFs?: Array<{ name: string; data: string; size: number }>
      referenceImages?: Array<{ name: string; data: string; size: number }>
      referenceVideo?: { name: string; data: string; size: number }
      firstFrameImage?: { name: string; data: string; size: number }
      lastFrameImage?: { name: string; data: string; size: number }
      longCatReferenceImage?: { name: string; data: string; size: number }
    } = {}

    // Convert PDFs
    if (researchPDFs.length > 0) {
      fileData.researchPDFs = await Promise.all(
        researchPDFs.map(async (file) => ({
          name: file.name,
          data: await fileToBase64(file),
          size: file.size
        }))
      )
    }

    // Convert reference images
    if (referenceImages.length > 0) {
      fileData.referenceImages = await Promise.all(
        referenceImages.map(async (file) => ({
          name: file.name,
          data: await fileToBase64(file),
          size: file.size
        }))
      )
    }

    // Convert reference video
    if (referenceVideo.length > 0) {
      const video = referenceVideo[0]
      fileData.referenceVideo = {
        name: video.name,
        data: await fileToBase64(video),
        size: video.size
      }
    }

    // Convert first frame image (if upload mode)
    if (useFrameInterpolation && firstFrameMode === 'upload' && firstFrameImage.length > 0) {
      const image = firstFrameImage[0]
      fileData.firstFrameImage = {
        name: image.name,
        data: await fileToBase64(image),
        size: image.size
      }
    }

    // Convert last frame image (if upload mode)
    if (useFrameInterpolation && lastFrameMode === 'upload' && lastFrameImage.length > 0) {
      const image = lastFrameImage[0]
      fileData.lastFrameImage = {
        name: image.name,
        data: await fileToBase64(image),
        size: image.size
      }
    }

    // Convert LongCat reference image (if image-to-video mode)
    if (useLongCat && longCatMode === 'image-to-video' && longCatReferenceImage.length > 0) {
      const image = longCatReferenceImage[0]
      fileData.longCatReferenceImage = {
        name: image.name,
        data: await fileToBase64(image),
        size: image.size
      }
    }

    return fileData
  }

  // Prompt editing handlers
  const handleEditPrompt = (stageId: number, stageName: string, prompt: string) => {
    setPromptStage(stageId)
    setCurrentPrompt(prompt)
    setShowPromptEditor(true)
  }

  const handleSavePrompt = (editedPrompt: string) => {
    if (promptStage) {
      setGeneratedPrompts(prev => ({ ...prev, [promptStage]: editedPrompt }))
      addLog(`✏️ Prompt updated for Stage ${promptStage}`)
    }
    setShowPromptEditor(false)
    setCurrentPrompt('')
    setPromptStage(null)
  }

  const handleCancelPrompt = () => {
    setShowPromptEditor(false)
    setCurrentPrompt('')
    setPromptStage(null)
  }

  // Calculate scene extension count for VEO 3.1
  const calculateSceneExtensions = (targetDuration: number): number => {
    // VEO 3.1 generates 8s initial video
    // Each extension adds 7s (max 20 extensions = 148s total)
    if (targetDuration <= 8) return 0
    const remainingSeconds = targetDuration - 8
    const extensionsNeeded = Math.ceil(remainingSeconds / 7)
    return Math.min(extensionsNeeded, 20) // Max 20 extensions (148s limit)
  }

  // Update scene extension count when duration changes
  const handleDurationChange = (newDuration: number) => {
    setDuration(newDuration)

    // Auto-switch to LongCat for videos >148s
    if (newDuration > 148) {
      setUseLongCat(true)
      setUseVeo(false)
      setSceneExtensionCount(0)
    } else if (useVeo) {
      setSceneExtensionCount(calculateSceneExtensions(newDuration))
      setUseLongCat(false)
    }
  }

  // Handle model selection (VEO vs LongCat)
  const handleModelChange = (model: 'veo' | 'longcat') => {
    if (model === 'veo') {
      setUseVeo(true)
      setUseLongCat(false)
      // Cap duration at 148s for VEO
      if (duration > 148) {
        setDuration(148)
      }
      setSceneExtensionCount(calculateSceneExtensions(Math.min(duration, 148)))
    } else {
      setUseLongCat(true)
      setUseVeo(false)
      setSceneExtensionCount(0)
      // Set minimum to 180s for LongCat
      if (duration <= 148) {
        setDuration(180)
      }
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-lg p-8 mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">
            PL Capital Social Media Engine
          </h1>
          <p className="text-gray-600 text-lg">
            AI-Powered Multi-Platform Campaign Automation
          </p>
          <div className="mt-4 flex items-center gap-4">
            <div className="px-4 py-2 bg-blue-50 rounded-lg">
              <span className="text-sm text-gray-600">Video Production:</span>
              <span className="ml-2 font-semibold text-blue-600">HeyGen + Veo 3.1</span>
            </div>
            <div className="px-4 py-2 bg-green-50 rounded-lg">
              <span className="text-sm text-gray-600">Platforms:</span>
              <span className="ml-2 font-semibold text-green-600">5 Social Channels</span>
            </div>
            <div className="px-4 py-2 bg-purple-50 rounded-lg">
              <span className="text-sm text-gray-600">Goal:</span>
              <span className="ml-2 font-semibold text-purple-600">10M+ Reach/Month</span>
            </div>
          </div>
        </div>

        {/* Main Control Panel */}
        <div className="bg-white rounded-lg shadow-lg p-8 mb-8">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">
            Campaign Configuration
          </h2>

          {/* Execution Mode Toggle */}
          <div className="mb-6 p-4 bg-gray-50 rounded-lg border-2 border-gray-200">
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Execution Mode:
            </label>
            <div className="flex gap-4">
              <button
                onClick={() => setExecutionMode('full')}
                disabled={isRunning || executingStage !== null}
                className={`flex-1 px-4 py-3 rounded-lg font-semibold transition-all ${
                  executionMode === 'full'
                    ? 'bg-blue-500 text-white shadow-md'
                    : 'bg-white border-2 border-gray-300 text-gray-700 hover:border-blue-300'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <div className="flex items-center justify-center gap-2">
                  <span>⚡</span>
                  <span>Full Campaign</span>
                </div>
                <p className="text-xs mt-1 opacity-80">Execute all 6 stages automatically</p>
              </button>
              <button
                onClick={() => setExecutionMode('staged')}
                disabled={isRunning || executingStage !== null}
                className={`flex-1 px-4 py-3 rounded-lg font-semibold transition-all ${
                  executionMode === 'staged'
                    ? 'bg-purple-500 text-white shadow-md'
                    : 'bg-white border-2 border-gray-300 text-gray-700 hover:border-purple-300'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <div className="flex items-center justify-center gap-2">
                  <span>🎯</span>
                  <span>Stage-by-Stage</span>
                </div>
                <p className="text-xs mt-1 opacity-80">Review and approve each stage</p>
              </button>
            </div>
          </div>

          {/* Campaign Configuration Row - Compact Side-by-Side */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {/* Campaign Type Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Campaign Type:
              </label>
              <select
                value={campaignType}
                onChange={(e) => setCampaignType(e.target.value)}
                disabled={isRunning || executingStage !== null}
                className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none text-sm text-gray-800 disabled:bg-gray-100 disabled:cursor-not-allowed"
              >
                {campaignTypes.map(type => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Purpose Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Campaign Purpose:
              </label>
              <select
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                disabled={isRunning || executingStage !== null}
                className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none text-sm text-gray-800 disabled:bg-gray-100 disabled:cursor-not-allowed"
              >
                {purposeOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label} - {option.description}
                  </option>
                ))}
              </select>
            </div>

            {/* Target Audience Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Target Audience:
              </label>
              <select
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
                disabled={isRunning || executingStage !== null}
                className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none text-sm text-gray-800 disabled:bg-gray-100 disabled:cursor-not-allowed"
              >
                {targetAudienceOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label} - {option.description}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Helper Text */}
          <p className="text-xs text-gray-500 mb-6 -mt-2">
            Content tone, style, and compliance requirements will be automatically adjusted based on target audience
          </p>

          {/* Brand Guidelines Section */}
          <div className="mb-6 p-6 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-lg border-2 border-indigo-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                <span>🎨</span> Brand Guidelines
              </h3>
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={useBrandGuidelines}
                  onChange={(e) => setUseBrandGuidelines(e.target.checked)}
                  disabled={isRunning || executingStage !== null}
                  className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500 disabled:cursor-not-allowed"
                />
                <span className="ml-3 text-sm font-medium text-gray-700">
                  Use PL Capital Brand Guidelines
                </span>
              </label>
            </div>

            {useBrandGuidelines ? (
              <div className="bg-white rounded-lg p-4 border-2 border-green-300">
                <p className="text-sm font-semibold text-green-700 mb-2">
                  ✓ PL Capital Brand Guidelines Active
                </p>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-600">Primary Colors:</span>
                    <div className="flex gap-1">
                      <div className="w-4 h-4 rounded" style={{ backgroundColor: '#0e0e6a' }} title="Navy"></div>
                      <div className="w-4 h-4 rounded" style={{ backgroundColor: '#3c3cf8' }} title="Blue"></div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-600">Accent Colors:</span>
                    <div className="flex gap-1">
                      <div className="w-4 h-4 rounded" style={{ backgroundColor: '#00d084' }} title="Teal"></div>
                      <div className="w-4 h-4 rounded" style={{ backgroundColor: '#66e766' }} title="Green"></div>
                    </div>
                  </div>
                  <div>
                    <span className="font-semibold text-gray-600">Font:</span>
                    <span className="ml-2 text-gray-800">Figtree</span>
                  </div>
                  <div>
                    <span className="font-semibold text-gray-600">Tone:</span>
                    <span className="ml-2 text-gray-800">Professional, Trustworthy</span>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-3">
                  All images and videos will follow PL Capital's official brand guidelines including colors, typography, tone, and compliance requirements.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-gray-600 mb-4">
                  Define custom brand settings for this campaign:
                </p>

                {/* Custom Colors */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Brand Colors:
                  </label>
                  <input
                    type="text"
                    value={customColors}
                    onChange={(e) => setCustomColors(e.target.value)}
                    disabled={isRunning || executingStage !== null}
                    placeholder="e.g., #0e0e6a (navy), #3c3cf8 (blue), #00d084 (teal)"
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-indigo-500 focus:outline-none text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Comma-separated hex colors or color names
                  </p>
                </div>

                {/* Custom Tone */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Brand Tone:
                  </label>
                  <select
                    value={customTone}
                    onChange={(e) => setCustomTone(e.target.value)}
                    disabled={isRunning || executingStage !== null}
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-indigo-500 focus:outline-none text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
                  >
                    <option value="">Select tone...</option>
                    <option value="professional">Professional & Corporate</option>
                    <option value="friendly">Friendly & Approachable</option>
                    <option value="luxury">Luxury & Premium</option>
                    <option value="energetic">Energetic & Dynamic</option>
                    <option value="minimalist">Minimalist & Clean</option>
                    <option value="bold">Bold & Vibrant</option>
                    <option value="elegant">Elegant & Sophisticated</option>
                  </select>
                </div>

                {/* Custom Instructions */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Additional Instructions:
                  </label>
                  <textarea
                    value={customInstructions}
                    onChange={(e) => setCustomInstructions(e.target.value)}
                    disabled={isRunning || executingStage !== null}
                    placeholder="Add specific style guidelines, mood, composition requirements, or any other instructions for image/video generation..."
                    rows={3}
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-indigo-500 focus:outline-none text-sm resize-none disabled:bg-gray-100 disabled:cursor-not-allowed"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Be specific about visual style, mood, composition, or technical requirements
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Platform Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Target Platforms:
            </label>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {platforms.map(platform => (
                <button
                  key={platform.value}
                  onClick={() => togglePlatform(platform.value)}
                  disabled={isRunning || executingStage !== null}
                  className={`platform-icon p-4 rounded-lg border-2 transition-all ${
                    selectedPlatforms.includes(platform.value)
                      ? `${platform.color} text-white border-transparent shadow-md`
                      : 'bg-white border-gray-300 text-gray-700 hover:border-gray-400'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <div className="text-2xl mb-1">{platform.icon}</div>
                  <div className="text-xs font-semibold">{platform.label}</div>
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Selected: {selectedPlatforms.length} platform(s)
            </p>
          </div>

          {/* Topic Input */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Campaign Topic:
            </label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              disabled={isRunning || executingStage !== null}
              placeholder="e.g., Client Success: ₹50L to ₹2Cr in 5 years"
              className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none font-medium text-gray-800 disabled:bg-gray-100 disabled:cursor-not-allowed"
            />
          </div>

          {/* File Uploads Section */}
          <div className="mb-6 p-6 bg-gradient-to-br from-blue-50 to-purple-50 rounded-lg border-2 border-blue-200">
            <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <span>📎</span> Reference Materials (Optional)
            </h3>
            <p className="text-sm text-gray-600 mb-6">
              Upload reference materials to enhance content generation with Gemini 3 Pro Image Preview
            </p>

            {/* Research PDFs Upload */}
            <FileUpload
              fileType="pdf"
              label="Research Reports / PDFs"
              description="Upload research reports, market analysis, or any PDF documents for context"
              accept=".pdf,application/pdf"
              multiple={true}
              maxFiles={5}
              maxSizeMB={50}
              onFilesChange={setResearchPDFs}
              disabled={isRunning || executingStage !== null}
              icon="📄"
            />

            {/* Reference Images Upload */}
            <FileUpload
              fileType="image"
              label="Reference Images"
              description="Upload reference images for style, composition, or visual elements (supports multi-image blending up to 14 images)"
              accept=".jpg,.jpeg,.png,.webp,.gif,image/*"
              multiple={true}
              maxFiles={14}
              maxSizeMB={10}
              onFilesChange={setReferenceImages}
              disabled={isRunning || executingStage !== null}
              icon="🖼️"
            />

            {/* Reference Video Upload */}
            <FileUpload
              fileType="video"
              label="Reference Video"
              description="Upload a reference video for Gemini 3 Pro to analyze style, pacing, or visual elements"
              accept=".mp4,.mov,.avi,.webm,video/*"
              multiple={false}
              maxFiles={1}
              maxSizeMB={100}
              onFilesChange={setReferenceVideo}
              disabled={isRunning || executingStage !== null}
              icon="🎬"
            />

            {/* Upload Summary */}
            {(researchPDFs.length > 0 || referenceImages.length > 0 || referenceVideo.length > 0) && (
              <div className="mt-4 p-4 bg-white rounded-lg border-2 border-green-300">
                <p className="text-sm font-semibold text-green-700 mb-2">
                  ✓ Reference Materials Ready
                </p>
                <div className="flex flex-wrap gap-3 text-xs">
                  {researchPDFs.length > 0 && (
                    <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full font-medium">
                      📄 {researchPDFs.length} PDF{researchPDFs.length > 1 ? 's' : ''}
                    </span>
                  )}
                  {referenceImages.length > 0 && (
                    <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full font-medium">
                      🖼️ {referenceImages.length} Image{referenceImages.length > 1 ? 's' : ''}
                    </span>
                  )}
                  {referenceVideo.length > 0 && (
                    <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full font-medium">
                      🎬 {referenceVideo.length} Video
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* VEO 3.1 Frame Interpolation Section */}
          {useVeo && (
            <div className="mb-6 p-6 bg-gradient-to-br from-cyan-50 to-blue-50 rounded-lg border-2 border-cyan-200">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                  <span>🎞️</span> VEO 3.1 Frame Interpolation
                </h3>
                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useFrameInterpolation}
                    onChange={(e) => setUseFrameInterpolation(e.target.checked)}
                    disabled={isRunning || executingStage !== null}
                    className="w-5 h-5 text-cyan-600 rounded focus:ring-cyan-500 disabled:cursor-not-allowed"
                  />
                  <span className="ml-3 text-sm font-medium text-gray-700">
                    Enable First/Last Frame Control
                  </span>
                </label>
              </div>

              {useFrameInterpolation ? (
                <div className="space-y-6">
                  <p className="text-sm text-gray-600 mb-4">
                    Control the first and last frames of your video to ensure smooth transitions and consistent character appearance.
                    Intermediate frames for scene extensions will be automatically generated by Gemini 3 Pro.
                  </p>

                  {/* First Frame Configuration */}
                  <div className="bg-white rounded-lg p-5 border-2 border-cyan-300">
                    <h4 className="text-md font-semibold text-gray-800 mb-3 flex items-center gap-2">
                      <span>🎬</span> First Frame
                    </h4>

                    {/* First Frame Mode Selection */}
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        First Frame Source:
                      </label>
                      <div className="grid grid-cols-3 gap-3">
                        <button
                          onClick={() => setFirstFrameMode('upload')}
                          disabled={isRunning || executingStage !== null}
                          className={`px-4 py-3 rounded-lg font-semibold text-sm transition-all ${
                            firstFrameMode === 'upload'
                              ? 'bg-cyan-500 text-white shadow-md'
                              : 'bg-white border-2 border-gray-300 text-gray-700 hover:border-cyan-300'
                          } disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                          <div>📁 Upload</div>
                          <div className="text-xs font-normal opacity-80 mt-1">Upload image</div>
                        </button>
                        <button
                          onClick={() => setFirstFrameMode('text-gemini')}
                          disabled={isRunning || executingStage !== null}
                          className={`px-4 py-3 rounded-lg font-semibold text-sm transition-all ${
                            firstFrameMode === 'text-gemini'
                              ? 'bg-cyan-500 text-white shadow-md'
                              : 'bg-white border-2 border-gray-300 text-gray-700 hover:border-cyan-300'
                          } disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                          <div>🧠 Gemini 3 Pro</div>
                          <div className="text-xs font-normal opacity-80 mt-1">Character consistency</div>
                        </button>
                        <button
                          onClick={() => setFirstFrameMode('text-imagen')}
                          disabled={isRunning || executingStage !== null}
                          className={`px-4 py-3 rounded-lg font-semibold text-sm transition-all ${
                            firstFrameMode === 'text-imagen'
                              ? 'bg-cyan-500 text-white shadow-md'
                              : 'bg-white border-2 border-gray-300 text-gray-700 hover:border-cyan-300'
                          } disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                          <div>🎨 Imagen 4 Ultra</div>
                          <div className="text-xs font-normal opacity-80 mt-1">Photorealistic scenes</div>
                        </button>
                      </div>
                    </div>

                    {/* First Frame Content - Upload Mode */}
                    {firstFrameMode === 'upload' && (
                      <FileUpload
                        fileType="image"
                        label="First Frame Image"
                        description="Upload the first frame of your video (recommended: 1920x1080 or 1080x1920)"
                        accept=".jpg,.jpeg,.png,.webp,image/*"
                        multiple={false}
                        maxFiles={1}
                        maxSizeMB={10}
                        onFilesChange={setFirstFrameImage}
                        disabled={isRunning || executingStage !== null}
                        icon="🎬"
                      />
                    )}

                    {/* First Frame Content - Text Prompt Mode */}
                    {(firstFrameMode === 'text-gemini' || firstFrameMode === 'text-imagen') && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          {firstFrameMode === 'text-gemini' ? '🧠 Gemini 3 Pro Prompt:' : '🎨 Imagen 4 Ultra Prompt:'}
                        </label>
                        <textarea
                          value={firstFramePrompt}
                          onChange={(e) => setFirstFramePrompt(e.target.value)}
                          disabled={isRunning || executingStage !== null}
                          placeholder={
                            firstFrameMode === 'text-gemini'
                              ? 'Describe the first frame with focus on character appearance, expression, and pose for consistent character generation...'
                              : 'Describe the first frame with focus on photorealistic scene, lighting, composition, and atmosphere...'
                          }
                          rows={4}
                          className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-cyan-500 focus:outline-none text-sm resize-none disabled:bg-gray-100 disabled:cursor-not-allowed"
                        />
                        <p className="text-xs text-gray-500 mt-2">
                          {firstFrameMode === 'text-gemini'
                            ? '💡 Gemini 3 Pro (Nano Banana Pro) excels at character consistency across frames'
                            : '💡 Imagen 4 Ultra is best for landscapes, product shots, and photorealistic scenes'}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Last Frame Configuration */}
                  <div className="bg-white rounded-lg p-5 border-2 border-cyan-300">
                    <h4 className="text-md font-semibold text-gray-800 mb-3 flex items-center gap-2">
                      <span>🎞️</span> Last Frame
                    </h4>

                    {/* Last Frame Mode Selection */}
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Last Frame Source:
                      </label>
                      <div className="grid grid-cols-3 gap-3">
                        <button
                          onClick={() => setLastFrameMode('upload')}
                          disabled={isRunning || executingStage !== null}
                          className={`px-4 py-3 rounded-lg font-semibold text-sm transition-all ${
                            lastFrameMode === 'upload'
                              ? 'bg-cyan-500 text-white shadow-md'
                              : 'bg-white border-2 border-gray-300 text-gray-700 hover:border-cyan-300'
                          } disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                          <div>📁 Upload</div>
                          <div className="text-xs font-normal opacity-80 mt-1">Upload image</div>
                        </button>
                        <button
                          onClick={() => setLastFrameMode('text-gemini')}
                          disabled={isRunning || executingStage !== null}
                          className={`px-4 py-3 rounded-lg font-semibold text-sm transition-all ${
                            lastFrameMode === 'text-gemini'
                              ? 'bg-cyan-500 text-white shadow-md'
                              : 'bg-white border-2 border-gray-300 text-gray-700 hover:border-cyan-300'
                          } disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                          <div>🧠 Gemini 3 Pro</div>
                          <div className="text-xs font-normal opacity-80 mt-1">Character consistency</div>
                        </button>
                        <button
                          onClick={() => setLastFrameMode('text-imagen')}
                          disabled={isRunning || executingStage !== null}
                          className={`px-4 py-3 rounded-lg font-semibold text-sm transition-all ${
                            lastFrameMode === 'text-imagen'
                              ? 'bg-cyan-500 text-white shadow-md'
                              : 'bg-white border-2 border-gray-300 text-gray-700 hover:border-cyan-300'
                          } disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                          <div>🎨 Imagen 4 Ultra</div>
                          <div className="text-xs font-normal opacity-80 mt-1">Photorealistic scenes</div>
                        </button>
                      </div>
                    </div>

                    {/* Last Frame Content - Upload Mode */}
                    {lastFrameMode === 'upload' && (
                      <FileUpload
                        fileType="image"
                        label="Last Frame Image"
                        description="Upload the last frame of your video (recommended: 1920x1080 or 1080x1920)"
                        accept=".jpg,.jpeg,.png,.webp,image/*"
                        multiple={false}
                        maxFiles={1}
                        maxSizeMB={10}
                        onFilesChange={setLastFrameImage}
                        disabled={isRunning || executingStage !== null}
                        icon="🎞️"
                      />
                    )}

                    {/* Last Frame Content - Text Prompt Mode */}
                    {(lastFrameMode === 'text-gemini' || lastFrameMode === 'text-imagen') && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          {lastFrameMode === 'text-gemini' ? '🧠 Gemini 3 Pro Prompt:' : '🎨 Imagen 4 Ultra Prompt:'}
                        </label>
                        <textarea
                          value={lastFramePrompt}
                          onChange={(e) => setLastFramePrompt(e.target.value)}
                          disabled={isRunning || executingStage !== null}
                          placeholder={
                            lastFrameMode === 'text-gemini'
                              ? 'Describe the last frame with focus on character appearance, expression, and final pose for consistent character generation...'
                              : 'Describe the last frame with focus on photorealistic scene, lighting, composition, and final atmosphere...'
                          }
                          rows={4}
                          className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-cyan-500 focus:outline-none text-sm resize-none disabled:bg-gray-100 disabled:cursor-not-allowed"
                        />
                        <p className="text-xs text-gray-500 mt-2">
                          {lastFrameMode === 'text-gemini'
                            ? '💡 Gemini 3 Pro (Nano Banana Pro) excels at character consistency across frames'
                            : '💡 Imagen 4 Ultra is best for landscapes, product shots, and photorealistic scenes'}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Scene Extension Info */}
                  {sceneExtensionCount > 0 && (
                    <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
                      <h4 className="text-sm font-semibold text-blue-800 mb-2 flex items-center gap-2">
                        <span>🔄</span> Automatic Scene Extension
                      </h4>
                      <p className="text-xs text-blue-700 mb-2">
                        With {sceneExtensionCount} scene extension{sceneExtensionCount > 1 ? 's' : ''} ({sceneExtensionCount * 7}s),
                        intermediate frames will be automatically generated by Gemini 3 Pro to maintain smooth transitions.
                      </p>
                      <ul className="text-xs text-blue-600 space-y-1 list-disc list-inside">
                        <li>Initial video: 8s (First frame → AI generated)</li>
                        {Array.from({ length: sceneExtensionCount }, (_, i) => (
                          <li key={i}>
                            Extension {i + 1}: 7s (Previous last frame → AI generated)
                          </li>
                        ))}
                        <li>Final frame: Your specified last frame</li>
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-white rounded-lg p-4 border-2 border-gray-300">
                  <p className="text-sm text-gray-600">
                    Enable frame interpolation to control the first and last frames of your video.
                    This provides better control over character consistency and smooth scene transitions.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* LongCat Video Generation Section */}
          {useLongCat && (
            <div className="mb-6 p-6 bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg border-2 border-purple-200">
              <div className="flex items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                  <span>🐱</span> LongCat Video Generation (Up to 15 Minutes)
                </h3>
              </div>

              <p className="text-sm text-gray-600 mb-6">
                LongCat by fal.ai enables high-quality 720p video generation up to 15 minutes.
                Choose between text-to-video or image-to-video modes for optimal results.
              </p>

              {/* Mode Selection */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Generation Mode:
                </label>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => setLongCatMode('text-to-video')}
                    disabled={isRunning || executingStage !== null}
                    className={`px-6 py-4 rounded-lg font-semibold text-sm transition-all ${
                      longCatMode === 'text-to-video'
                        ? 'bg-purple-500 text-white shadow-md'
                        : 'bg-white border-2 border-gray-300 text-gray-700 hover:border-purple-300'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    <div className="text-lg mb-1">📝 Text-to-Video</div>
                    <div className="text-xs font-normal opacity-80">
                      Generate video from text description
                    </div>
                  </button>
                  <button
                    onClick={() => setLongCatMode('image-to-video')}
                    disabled={isRunning || executingStage !== null}
                    className={`px-6 py-4 rounded-lg font-semibold text-sm transition-all ${
                      longCatMode === 'image-to-video'
                        ? 'bg-purple-500 text-white shadow-md'
                        : 'bg-white border-2 border-gray-300 text-gray-700 hover:border-purple-300'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    <div className="text-lg mb-1">🖼️ Image-to-Video</div>
                    <div className="text-xs font-normal opacity-80">
                      Animate from reference image
                    </div>
                  </button>
                </div>
              </div>

              {/* Text-to-Video Configuration */}
              {longCatMode === 'text-to-video' && (
                <div className="bg-white rounded-lg p-5 border-2 border-purple-300">
                  <h4 className="text-md font-semibold text-gray-800 mb-3 flex items-center gap-2">
                    <span>📝</span> Video Description
                  </h4>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Text Prompt for Video Generation:
                    </label>
                    <textarea
                      value={longCatPrompt}
                      onChange={(e) => setLongCatPrompt(e.target.value)}
                      disabled={isRunning || executingStage !== null}
                      placeholder="Describe the video you want to generate. Be specific about scenes, actions, transitions, camera movements, and visual style. LongCat excels at creating coherent long-form narratives..."
                      rows={6}
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none text-sm resize-none disabled:bg-gray-100 disabled:cursor-not-allowed"
                    />
                    <p className="text-xs text-gray-500 mt-2">
                      💡 LongCat can generate up to 15 minutes of coherent video at 720p resolution
                    </p>
                  </div>
                </div>
              )}

              {/* Image-to-Video Configuration */}
              {longCatMode === 'image-to-video' && (
                <div className="space-y-4">
                  <div className="bg-white rounded-lg p-5 border-2 border-purple-300">
                    <h4 className="text-md font-semibold text-gray-800 mb-3 flex items-center gap-2">
                      <span>🖼️</span> Reference Image
                    </h4>
                    <FileUpload
                      fileType="image"
                      label="Starting Image"
                      description="Upload a reference image that will be animated into a video (recommended: high resolution, clear subject)"
                      accept=".jpg,.jpeg,.png,.webp,image/*"
                      multiple={false}
                      maxFiles={1}
                      maxSizeMB={10}
                      onFilesChange={setLongCatReferenceImage}
                      disabled={isRunning || executingStage !== null}
                      icon="🖼️"
                    />
                  </div>

                  <div className="bg-white rounded-lg p-5 border-2 border-purple-300">
                    <h4 className="text-md font-semibold text-gray-800 mb-3 flex items-center gap-2">
                      <span>📝</span> Animation Instructions
                    </h4>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Video Generation Prompt:
                      </label>
                      <textarea
                        value={longCatPrompt}
                        onChange={(e) => setLongCatPrompt(e.target.value)}
                        disabled={isRunning || executingStage !== null}
                        placeholder="Describe how the image should be animated. Include camera movements, subject actions, transitions, and any scene changes you want to see in the video..."
                        rows={5}
                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none text-sm resize-none disabled:bg-gray-100 disabled:cursor-not-allowed"
                      />
                      <p className="text-xs text-gray-500 mt-2">
                        💡 Describe the motion, camera movements, and transformations you want to apply to the image
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* LongCat Info Box */}
              <div className="mt-6 bg-purple-50 border-2 border-purple-200 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-purple-800 mb-2 flex items-center gap-2">
                  <span>ℹ️</span> LongCat Capabilities
                </h4>
                <ul className="text-xs text-purple-700 space-y-1 list-disc list-inside">
                  <li>Generate videos up to 15 minutes (900 seconds) at 720p resolution</li>
                  <li>Maintains temporal coherence across long sequences</li>
                  <li>Supports both text-to-video and image-to-video workflows</li>
                  <li>Ideal for documentaries, explainers, testimonials, and narrative content</li>
                  <li>Powered by fal.ai's advanced video generation models</li>
                </ul>
                <div className="mt-3 pt-3 border-t border-purple-300">
                  <p className="text-xs text-purple-600 font-medium">
                    📊 Current Configuration: {Math.floor(duration / 60)} min {duration % 60}s • {longCatMode === 'text-to-video' ? 'Text-to-Video' : 'Image-to-Video'} • 720p
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Video Configuration */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Video Duration (seconds):
              </label>
              <select
                value={duration}
                onChange={(e) => handleDurationChange(parseInt(e.target.value))}
                disabled={isRunning || executingStage !== null}
                className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none font-medium text-gray-800 disabled:bg-gray-100"
              >
                {/* VEO 3.1 Durations (up to 148s) */}
                <option value="8">8s (VEO Base)</option>
                <option value="30">30s (Quick)</option>
                <option value="60">1 min (Standard)</option>
                <option value="90">1.5 min (Testimonial)</option>
                <option value="120">2 min (Extended)</option>
                <option value="148">2.5 min (Max VEO)</option>

                {/* LongCat Durations (149s - 900s / 15 min) */}
                <option value="180">3 min (LongCat)</option>
                <option value="240">4 min (LongCat)</option>
                <option value="300">5 min (LongCat)</option>
                <option value="360">6 min (LongCat)</option>
                <option value="420">7 min (LongCat)</option>
                <option value="480">8 min (LongCat)</option>
                <option value="540">9 min (LongCat)</option>
                <option value="600">10 min (LongCat)</option>
                <option value="720">12 min (LongCat)</option>
                <option value="900">15 min (Max LongCat)</option>
              </select>

              {/* Duration Info */}
              {useVeo && duration > 8 && (
                <p className="text-xs text-gray-500 mt-2">
                  📊 VEO Scene Extensions: {sceneExtensionCount} × 7s hops (Initial 8s + {sceneExtensionCount * 7}s = {8 + sceneExtensionCount * 7}s)
                </p>
              )}
              {useLongCat && (
                <p className="text-xs text-gray-500 mt-2">
                  🐱 LongCat Generation: {Math.floor(duration / 60)} min {duration % 60}s video (720p)
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Video Generation Model:
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => handleModelChange('veo')}
                  disabled={isRunning || executingStage !== null || duration > 148}
                  className={`px-4 py-3 rounded-lg font-semibold text-sm transition-all ${
                    useVeo
                      ? 'bg-blue-500 text-white shadow-md'
                      : duration > 148
                      ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      : 'bg-white border-2 border-gray-300 text-gray-700 hover:border-blue-300'
                  } disabled:opacity-50`}
                >
                  <div>🎬 VEO 3.1</div>
                  <div className="text-xs font-normal opacity-80 mt-1">Up to 148s</div>
                </button>
                <button
                  onClick={() => handleModelChange('longcat')}
                  disabled={isRunning || executingStage !== null || duration <= 148}
                  className={`px-4 py-3 rounded-lg font-semibold text-sm transition-all ${
                    useLongCat
                      ? 'bg-purple-500 text-white shadow-md'
                      : duration <= 148
                      ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      : 'bg-white border-2 border-gray-300 text-gray-700 hover:border-purple-300'
                  } disabled:opacity-50`}
                >
                  <div>🐱 LongCat</div>
                  <div className="text-xs font-normal opacity-80 mt-1">149s - 15 min</div>
                </button>
              </div>
              {duration > 148 && (
                <p className="text-xs text-purple-600 mt-2 font-medium">
                  ℹ️ LongCat automatically selected for videos &gt;148s
                </p>
              )}
            </div>

            <div className="flex items-center">
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={useAvatar}
                  onChange={(e) => setUseAvatar(e.target.checked)}
                  disabled={isRunning || executingStage !== null}
                  className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500 disabled:cursor-not-allowed"
                />
                <span className="ml-3 text-sm font-medium text-gray-700">
                  🎭 Use HeyGen AI Avatar
                </span>
              </label>
            </div>
          </div>

          {/* Execute Button */}
          {executionMode === 'full' && (
            <div className="flex justify-center">
              <button
                onClick={executeWorkflow}
                disabled={isRunning || executingStage !== null || !topic}
                className={`px-8 py-4 rounded-lg font-semibold text-lg transition-all transform hover:scale-105 ${
                  isRunning || executingStage !== null || !topic
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-lg hover:shadow-xl'
                }`}
              >
                {isRunning ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Running Campaign...
                  </span>
                ) : (
                  '🚀 Execute Full Campaign'
                )}
              </button>
            </div>
          )}

          {executionMode === 'staged' && (
            <div className="text-sm text-gray-600 bg-purple-50 px-4 py-3 rounded-lg border-2 border-purple-200">
              <p className="font-semibold text-purple-700">Stage-by-Stage Mode Active</p>
              <p className="text-xs mt-1">Execute and review each stage individually below</p>
            </div>
          )}
        </div>

        {/* Workflow Stages */}
        <div className="bg-white rounded-lg shadow-lg p-8 mb-8">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">
            Workflow Stages
          </h2>

          <div className="space-y-3">
            {stages.map((stage) => (
              <div
                key={stage.id}
                className={`rounded-lg border-2 transition-all ${
                  stage.status === 'running'
                    ? 'border-blue-300 bg-blue-50'
                    : stage.status === 'completed'
                    ? 'border-green-300 bg-green-50'
                    : stage.status === 'error'
                    ? 'border-red-300 bg-red-50'
                    : 'border-gray-200 bg-gray-50'
                }`}
              >
                <div className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      <span className={`text-2xl ${getStatusColor(stage.status)}`}>
                        {getStatusIcon(stage.status)}
                      </span>
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-800">{stage.name}</h3>
                        {stage.message && (
                          <p className="text-sm text-gray-600 mt-1">{stage.message}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {stage.status === 'running' && (
                        <div className="flex gap-1">
                          <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                          <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                          <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                      )}

                      {/* Stage Execution Button (staged mode) */}
                      {executionMode === 'staged' && (
                        <>
                          {stage.id === 1 ? (
                            <button
                              onClick={() => executeStage(stage.id)}
                              disabled={executingStage !== null || isRunning || stage.status === 'completed' || !topic}
                              className={`text-sm px-4 py-2 rounded-lg font-semibold transition-all ${
                                executingStage === stage.id
                                  ? 'bg-purple-400 text-white cursor-wait'
                                  : stage.status === 'completed'
                                  ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
                                  : !topic
                                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                  : 'bg-purple-500 text-white hover:bg-purple-600 shadow-md hover:shadow-lg'
                              }`}
                            >
                              {executingStage === stage.id ? 'Executing...' : stage.status === 'completed' ? '✓ Completed' : '▶ Execute Stage'}
                            </button>
                          ) : (
                            <button
                              onClick={() => executeStage(stage.id)}
                              disabled={
                                executingStage !== null ||
                                isRunning ||
                                stage.status === 'completed' ||
                                stages[stage.id - 2]?.status !== 'completed'
                              }
                              className={`text-sm px-4 py-2 rounded-lg font-semibold transition-all ${
                                executingStage === stage.id
                                  ? 'bg-purple-400 text-white cursor-wait'
                                  : stage.status === 'completed'
                                  ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
                                  : stages[stage.id - 2]?.status !== 'completed'
                                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                  : 'bg-purple-500 text-white hover:bg-purple-600 shadow-md hover:shadow-lg'
                              }`}
                            >
                              {executingStage === stage.id
                                ? 'Executing...'
                                : stage.status === 'completed'
                                ? '✓ Completed'
                                : stages[stage.id - 2]?.status !== 'completed'
                                ? '⏸ Waiting'
                                : '✅ Approve & Continue'}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Specialized Stage Content */}
                {stage.id === 4 && stage.status === 'running' && stageData[4] && (
                  <div className="border-t-2 border-blue-200 p-4 bg-white">
                    <VideoProducer videoData={stageData[4].data} />
                  </div>
                )}

                {stage.id === 5 && (stage.status === 'running' || stage.status === 'completed') && campaignData.publishedUrls && (
                  <div className="border-t-2 border-green-200 p-4 bg-white">
                    <PublishingQueue publishedUrls={campaignData.publishedUrls} platforms={selectedPlatforms} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Live Logs */}
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">
            Live Logs
          </h2>
          <div className="bg-gray-900 rounded-lg p-4 h-96 overflow-y-auto font-mono text-sm">
            {logs.length === 0 ? (
              <p className="text-gray-500 italic">Waiting for campaign execution...</p>
            ) : (
              logs.map((log, index) => (
                <div key={index} className="text-green-400 mb-1">
                  {log}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-gray-600">
          <p className="text-sm">
            Social Media Engine • Port 3004 •
            <span className="ml-2">HeyGen • Veo 3.1 • Shotstack • Zapier MCP</span>
          </p>
        </div>

        {/* Prompt Editor Modal */}
        <PromptEditor
          isOpen={showPromptEditor}
          prompt={currentPrompt}
          stageNumber={promptStage || 0}
          stageName={promptStage ? stages.find(s => s.id === promptStage)?.name || '' : ''}
          onSave={handleSavePrompt}
          onCancel={handleCancelPrompt}
        />
      </div>
    </div>
  )
}
