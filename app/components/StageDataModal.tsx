'use client'

import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

type StageDataModalProps = {
  isOpen: boolean
  stageId: number
  stageName: string
  data: any
  onClose: () => void
  onSave: (stageId: number, editedData: any) => Promise<void>
}

export default function StageDataModal({
  isOpen,
  stageId,
  stageName,
  data,
  onClose,
  onSave
}: StageDataModalProps) {
  const [formData, setFormData] = useState<Record<string, any>>({})
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  // Email newsletter preview state (moved to top level to avoid hook errors)
  const [showPreview, setShowPreview] = useState(true)
  const [copied, setCopied] = useState(false)

  // Video preview state
  const [previewingVideoUrl, setPreviewingVideoUrl] = useState<string | null>(null)

  // Stage 1: toggle between rich text (markdown rendered) and edit (textarea)
  const [isEditingCreativePrompt, setIsEditingCreativePrompt] = useState(false)

  useEffect(() => {
    if (isOpen && data) {
      // Initialize form data from the data object
      const flattenedData = flattenObject(data)
      if (stageId === 2 && ['live-news-article', 'blog-article'].includes(String(flattenedData['contentType'] || ''))) {
        // Refinement instruction for Stage 2 re-runs.
        if (flattenedData['userPrompt'] === undefined || flattenedData['userPrompt'] === null) {
          flattenedData['userPrompt'] = ''
        }
      }
      setFormData(flattenedData)
      setSaveError(null)
      setSaveSuccess(false)
      setPreviewingVideoUrl(null) // Reset video preview when modal opens
      setIsEditingCreativePrompt(false) // Reset to rich text view when modal opens
    }
  }, [isOpen, data])

  // Flatten nested objects for easier editing
  const flattenObject = (obj: any, prefix = ''): Record<string, any> => {
    const flattened: Record<string, any> = {}

    for (const key in obj) {
      const value = obj[key]
      const newKey = prefix ? `${prefix}.${key}` : key

      if (value && typeof value === 'object' && !Array.isArray(value)) {
        Object.assign(flattened, flattenObject(value, newKey))
      } else if (Array.isArray(value)) {
        // Handle arrays - flatten array items that are objects
        if (value.length > 0 && typeof value[0] === 'object') {
          value.forEach((item, index) => {
            if (item && typeof item === 'object') {
              Object.assign(flattened, flattenObject(item, `${newKey}.${index}`))
            } else {
              flattened[`${newKey}.${index}`] = item
            }
          })
        } else {
          flattened[newKey] = JSON.stringify(value)
        }
      } else {
        flattened[newKey] = value
      }
    }

    return flattened
  }

  // Reconstruct nested object from flattened data
  const unflattenObject = (flattened: Record<string, any>): any => {
    const result: any = {}

    for (const key in flattened) {
      const keys = key.split('.')
      let current = result

      for (let i = 0; i < keys.length - 1; i++) {
        if (!(keys[i] in current)) {
          current[keys[i]] = {}
        }
        current = current[keys[i]]
      }

      const lastKey = keys[keys.length - 1]
      let value = flattened[key]

      // Try to parse JSON arrays
      if (typeof value === 'string' && (value.startsWith('[') || value.startsWith('{'))) {
        try {
          value = JSON.parse(value)
        } catch (e) {
          // Keep as string if parse fails
        }
      }

      current[lastKey] = value
    }

    return result
  }

  const handleFieldChange = (key: string, value: any) => {
    setFormData(prev => ({ ...prev, [key]: value }))
    setSaveSuccess(false)
  }

  const handleSave = async () => {
    try {
      setIsSaving(true)
      setSaveError(null)
      setSaveSuccess(false)

      const unflattenedData = unflattenObject(formData)
      await onSave(stageId, unflattenedData)

      setSaveSuccess(true)
      setTimeout(() => {
        onClose()
      }, 1500)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Failed to save data')
    } finally {
      setIsSaving(false)
    }
  }

  const getFieldLabel = (key: string): string => {
    if (key === 'userPrompt') return 'Follow-Up Edit Prompt'

    // Convert key to readable label
    return key
      .split('.')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' > ')
  }

  const renderField = (key: string, value: any) => {
    const isArticleContentType = stageId === 2 && ['live-news-article', 'blog-article'].includes(String(formData['contentType'] || ''))
    const isLongText = typeof value === 'string' && value.length > 100

    // Check if this is an image URL (from imgbb, Stage 2 WhatsApp creative, or Stage 3 visuals)
    // Value must be a single URL (starts with http, no newlines) so "output" log text is not used as link
    const looksLikeSingleUrl = typeof value === 'string' && value.trim().startsWith('http') && !value.includes('\n') && value.trim().length < 600
    const isImageUrl = typeof value === 'string' && value.trim() !== '' && looksLikeSingleUrl && (
      value.includes('imgbb.com') ||
      value.includes('i.ibb.co') ||
      key === 'imageUrl' ||
      (key.toLowerCase().includes('hostedurl') && (
        key.toLowerCase().includes('image') ||
        key.toLowerCase().includes('images')
      ))
    )

    // Check if this is a video URL (Cloudinary, HeyGen, or hostedUrl/videoUrl with http)
    const isVideoUrl = typeof value === 'string' && value.trim() !== '' && value.startsWith('http') && (
      value.includes('cloudinary.com') ||
      value.includes('res.cloudinary.com') ||
      value.includes('heygen.ai') ||
      value.includes('app.heygen.com/video/') ||
      value.includes('.mp4') ||
      value.includes('.mov') ||
      value.includes('.webm') ||
      key.toLowerCase().includes('hostedurl') ||
      key.toLowerCase().includes('videourl')
    )
    const isDirectPlayableVideo = typeof value === 'string' && /\.(mp4|mov|webm)(\?|$)/i.test(value)

    return (
      <div key={key} className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {getFieldLabel(key)}
        </label>
        {isImageUrl ? (
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={value || ''}
              onChange={(e) => handleFieldChange(key, e.target.value)}
              className="flex-1 px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none text-sm"
            />
            <a
              href={value}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-semibold whitespace-nowrap flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              View Image
            </a>
          </div>
        ) : isVideoUrl ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={value || ''}
                onChange={(e) => handleFieldChange(key, e.target.value)}
                className="flex-1 px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none text-sm"
              />
              {isDirectPlayableVideo && (
                <button
                  onClick={() => setPreviewingVideoUrl(value)}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-semibold whitespace-nowrap flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Preview Video
                </button>
              )}
              <a
                href={value}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm font-semibold whitespace-nowrap flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                {isDirectPlayableVideo ? 'View Video' : 'Open Link'}
              </a>
            </div>
            {isDirectPlayableVideo && previewingVideoUrl === value && (
              <div className="border-2 border-indigo-300 rounded-lg bg-gray-900 overflow-hidden">
                <div className="bg-indigo-100 px-3 py-2 flex items-center justify-between border-b-2 border-indigo-300">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-indigo-800">Video Preview</span>
                  </div>
                  <button
                    onClick={() => setPreviewingVideoUrl(null)}
                    className="text-indigo-600 hover:text-indigo-800 transition-colors"
                    title="Close preview"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="p-4 bg-black">
                  <video
                    key={value}
                    src={value}
                    controls
                    preload="metadata"
                    className="w-full max-h-[500px] rounded-lg"
                    style={{ aspectRatio: '16/9' }}
                    playsInline
                    onLoadedMetadata={(e) => {
                      const video = e.currentTarget
                      video.muted = false
                      if (video.volume === 0) video.volume = 1
                    }}
                    onPlay={(e) => {
                      const video = e.currentTarget
                      video.muted = false
                      if (video.volume === 0) video.volume = 1
                    }}
                  >
                    Your browser does not support the video tag.
                  </video>
                </div>
              </div>
            )}
          </div>
        ) : key === 'userPrompt' && isArticleContentType ? (
          <textarea
            value={value || ''}
            onChange={(e) => handleFieldChange(key, e.target.value)}
            rows={5}
            placeholder="Ask for focused edits here, for example: rewrite the introduction, tighten the SEO title, add clearer examples under Key Insights, or regenerate the article with a more executive tone."
            className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none text-sm resize-vertical"
          />
        ) : isLongText ? (
          <textarea
            value={value || ''}
            onChange={(e) => handleFieldChange(key, e.target.value)}
            rows={4}
            className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none text-sm resize-vertical"
          />
        ) : (
          <input
            type="text"
            value={value || ''}
            onChange={(e) => handleFieldChange(key, e.target.value)}
            className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none text-sm"
          />
        )}
      </div>
    )
  }

  const renderCreativePrompt = () => {
    const promptValue = formData['creativePrompt'] || ''
    const isBlogStage1 = stageId === 1 && String(formData['campaignType'] || '') === 'blog'

    return (
      <div className="mb-6 p-4 bg-gradient-to-br from-purple-50 to-blue-50 border-2 border-purple-300 rounded-xl">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🎨</span>
            <div>
              <label className="block text-base font-bold text-purple-900">
                {isBlogStage1 ? 'Campaign Planning Brief' : 'Stage 1 Prompt'}
              </label>
              <p className="text-xs text-purple-700 mt-0.5">
                {isBlogStage1 ? 'This planning brief will guide Stage 2 article generation. Edit it to refine search intent, coverage, and structure.' : 'This Stage 1 output will be used in the next stages. Edit it to refine the direction.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsEditingCreativePrompt((prev) => !prev)}
            className="shrink-0 px-3 py-1.5 text-sm font-medium text-purple-700 bg-white border-2 border-purple-300 rounded-lg hover:bg-purple-50 transition-colors"
          >
            {isEditingCreativePrompt ? 'Preview' : 'Edit'}
          </button>
        </div>
        {isEditingCreativePrompt ? (
          <textarea
            value={promptValue}
            onChange={(e) => handleFieldChange('creativePrompt', e.target.value)}
            rows={12}
            placeholder={isBlogStage1 ? 'Campaign planning brief will be generated here...' : 'Stage 1 prompt will be generated here...'}
            className="w-full px-4 py-3 border-2 border-purple-300 rounded-lg focus:border-purple-500 focus:ring-2 focus:ring-purple-200 focus:outline-none text-sm font-mono bg-white shadow-inner resize-vertical"
          />
        ) : (
          <div className="w-full min-h-[200px] px-4 py-3 border-2 border-purple-200 rounded-lg bg-white text-sm prose prose-sm prose-purple max-w-none">
            {promptValue ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {promptValue}
              </ReactMarkdown>
            ) : (
              <p className="text-gray-500 italic">No creative prompt yet.</p>
            )}
          </div>
        )}
        <div className="mt-2 flex items-center gap-2 text-xs text-purple-600">
          <span>💡</span>
          <span>{isBlogStage1 ? 'Tip: Be specific about search intent, article angle, target entities, keyword themes, and section structure' : 'Tip: Be specific about visual style, tone, messaging, and platform requirements'}</span>
        </div>
      </div>
    )
  }


  const renderStage1GeneratedUserPrompt = () => {
    const promptValue = String(formData['generatedUserPrompt'] || '').trim()
    if (!promptValue) return null

    return (
      <div className="mb-6 p-4 bg-indigo-50 border-2 border-indigo-300 rounded-xl">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-2xl">🧠</span>
          <div>
            <label className="block text-base font-bold text-indigo-900">
              Generated User Prompt
            </label>
            <p className="text-xs text-indigo-700 mt-0.5">
              Internal Stage 1 generator prompt used to create the campaign planning brief.
            </p>
          </div>
        </div>
        <textarea
          value={promptValue}
          onChange={(e) => handleFieldChange('generatedUserPrompt', e.target.value)}
          rows={6}
          className="w-full px-4 py-3 border-2 border-indigo-300 rounded-lg focus:border-indigo-500 focus:outline-none text-sm bg-white resize-vertical"
        />
      </div>
    )
  }

  const renderEmailNewsletter = () => {
    const subject = formData['subject'] || ''
    const preheader = formData['preheader'] || ''
    const html = formData['html'] || ''
    const plainText = formData['plainText'] || ''
    const subjectVariations = formData['subjectVariations'] || ''

    const copyToClipboard = () => {
      navigator.clipboard.writeText(html)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }

    const downloadHTML = () => {
      const blob = new Blob([html], { type: 'text/html' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `email-newsletter-${Date.now()}.html`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }

    return (
      <div className="space-y-6">
        {/* Subject Line Section */}
        <div className="p-4 bg-gradient-to-br from-green-50 to-teal-50 border-2 border-green-300 rounded-xl">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-2xl">📧</span>
            <div>
              <label className="block text-base font-bold text-green-900">
                Email Subject Line
              </label>
              <p className="text-xs text-green-700 mt-0.5">
                Optimized for 40-60 characters for mobile preview
              </p>
            </div>
          </div>
          <input
            type="text"
            value={subject}
            onChange={(e) => handleFieldChange('subject', e.target.value)}
            className="w-full px-4 py-3 border-2 border-green-300 rounded-lg focus:border-green-500 focus:ring-2 focus:ring-green-200 focus:outline-none text-base font-semibold bg-white shadow-inner"
            placeholder="Email subject line..."
          />
          <div className="mt-2 text-xs text-green-700">
            Character count: {subject.length} {subject.length >= 40 && subject.length <= 60 ? '✅' : subject.length > 60 ? '⚠️ Too long' : '⚠️ Too short'}
          </div>
        </div>

        {/* Preheader Section */}
        <div className="p-4 bg-gradient-to-br from-blue-50 to-cyan-50 border-2 border-blue-300 rounded-xl">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-2xl">👁️</span>
            <div>
              <label className="block text-base font-bold text-blue-900">
                Preheader Text
              </label>
              <p className="text-xs text-blue-700 mt-0.5">
                Appears after subject line in inbox (85-100 characters)
              </p>
            </div>
          </div>
          <textarea
            value={preheader}
            onChange={(e) => handleFieldChange('preheader', e.target.value)}
            rows={2}
            className="w-full px-4 py-3 border-2 border-blue-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none text-sm bg-white shadow-inner resize-vertical"
            placeholder="Preheader text..."
          />
          <div className="mt-2 text-xs text-blue-700">
            Character count: {preheader.length} {preheader.length >= 85 && preheader.length <= 100 ? '✅' : preheader.length > 100 ? '⚠️ Too long' : '⚠️ Too short'}
          </div>
        </div>

        {/* Subject Variations */}
        {subjectVariations && (
          <div className="p-4 bg-gray-50 border-2 border-gray-300 rounded-xl">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">🔄</span>
              <label className="block text-sm font-bold text-gray-900">
                A/B Test Subject Variations
              </label>
            </div>
            <textarea
              value={typeof subjectVariations === 'string' ? subjectVariations : JSON.stringify(subjectVariations, null, 2)}
              onChange={(e) => handleFieldChange('subjectVariations', e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none text-sm bg-white resize-vertical"
            />
          </div>
        )}

        {/* HTML Email Section */}
        <div className="p-4 bg-gradient-to-br from-orange-50 to-amber-50 border-2 border-orange-300 rounded-xl">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-2xl">📄</span>
              <div>
                <label className="block text-base font-bold text-orange-900">
                  HTML Email Newsletter
                </label>
                <p className="text-xs text-orange-700 mt-0.5">
                  Production-ready HTML with inline CSS
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowPreview(!showPreview)}
                className="px-3 py-1 text-xs font-semibold bg-white border-2 border-orange-300 text-orange-700 rounded-lg hover:bg-orange-50 transition-colors"
              >
                {showPreview ? '📝 Code' : '👁️ Preview'}
              </button>
              <button
                onClick={copyToClipboard}
                className="px-3 py-1 text-xs font-semibold bg-white border-2 border-orange-300 text-orange-700 rounded-lg hover:bg-orange-50 transition-colors"
              >
                {copied ? '✅ Copied!' : '📋 Copy'}
              </button>
              <button
                onClick={downloadHTML}
                className="px-3 py-1 text-xs font-semibold bg-white border-2 border-orange-300 text-orange-700 rounded-lg hover:bg-orange-50 transition-colors"
              >
                ⬇️ Download
              </button>
            </div>
          </div>

          {showPreview ? (
            <div className="border-2 border-orange-300 rounded-lg bg-white overflow-hidden">
              <div className="bg-orange-100 px-3 py-2 text-xs font-semibold text-orange-800 border-b-2 border-orange-300">
                Email Preview (rendered HTML)
              </div>
              <div className="p-4 max-h-[500px] overflow-auto">
                <iframe
                  srcDoc={html}
                  className="w-full min-h-[400px] border-0"
                  title="Email Preview"
                  sandbox="allow-same-origin"
                />
              </div>
            </div>
          ) : (
            <textarea
              value={html}
              onChange={(e) => handleFieldChange('html', e.target.value)}
              rows={20}
              className="w-full px-4 py-3 border-2 border-orange-300 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-200 focus:outline-none text-xs font-mono bg-white shadow-inner resize-vertical"
              placeholder="HTML email code..."
            />
          )}

          <div className="mt-2 flex items-center gap-2 text-xs text-orange-600">
            <span>💡</span>
            <span>Tip: The HTML uses inline CSS and table-based layout for maximum email client compatibility</span>
          </div>
        </div>

        {/* Plain Text Version */}
        {plainText && (
          <div className="p-4 bg-gray-50 border-2 border-gray-300 rounded-xl">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">📝</span>
              <div>
                <label className="block text-sm font-bold text-gray-900">
                  Plain Text Version
                </label>
                <p className="text-xs text-gray-600 mt-0.5">
                  For text-only email clients
                </p>
              </div>
            </div>
            <textarea
              value={plainText}
              onChange={(e) => handleFieldChange('plainText', e.target.value)}
              rows={8}
              className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none text-sm font-mono bg-white resize-vertical"
            />
          </div>
        )}
      </div>
    )
  }

  const renderArticlePreview = () => {
    const headline = formData['headline'] || ''
    const subheadline = formData['subheadline'] || ''
    const summary = formData['summary'] || ''
    const rawOutput = formData['rawOutput'] || ''
    const articleHtml = formData['articleHtml'] || ''
    const articleText = formData['articleText'] || ''
    const isBlogArticle = formData['contentType'] === 'blog-article'

    const escapeHtml = (value: string) =>
      String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')

    const articleTextToPreviewHtml = (text: string) => {
      const normalizeMarkdownLine = (line: string) =>
        line
          .replace(/^#{1,6}\s*/, '')
          .replace(/^\s*\*\*(.*?)\*\*\s*$/g, '$1')
          .replace(/^\s*__(.*?)__\s*$/g, '$1')
          .trim()

      const lines = String(text || '')
        .split('\n')
        .map((line) => normalizeMarkdownLine(line))
        .filter(Boolean)

      if (lines.length === 0) return ''

      const headingMatchers: Array<{ pattern: RegExp; label: string }> = [
        { pattern: /^(?:\d+\.\s*)?summary\b\s*:?\s*/i, label: 'Summary' },
        { pattern: /^(?:\d+\.\s*)?introduction\b\s*:?\s*/i, label: 'Introduction' },
        { pattern: /^(?:\d+\.\s*)?key insights\b\s*:?\s*/i, label: 'Key Insights' },
        { pattern: /^(?:\d+\.\s*)?why it matters\b\s*:?\s*/i, label: 'Why It Matters' },
        { pattern: /^(?:\d+\.\s*)?market overview\b\s*:?\s*/i, label: 'Market Overview' },
        { pattern: /^(?:\d+\.\s*)?key movers\b\s*:?\s*/i, label: 'Key Movers' },
        { pattern: /^(?:\d+\.\s*)?drivers and context\b\s*:?\s*/i, label: 'Drivers and Context' },
        { pattern: /^(?:\d+\.\s*)?broader market and outlook\b\s*:?\s*/i, label: 'Broader Market and Outlook' },
        { pattern: /^(?:\d+\.\s*)?issue details(?:\s+and\s+key\s+dates)?\b\s*:?\s*/i, label: 'Issue Details and Key Dates' },
        { pattern: /^(?:\d+\.\s*)?use of proceeds(?:\s*\/\s*key objectives?|(?:\s+and\s+key objectives?))?\b\s*:?\s*/i, label: 'Use of Proceeds / Key Objectives' },
        { pattern: /^(?:\d+\.\s*)?about the company\b\s*:?\s*/i, label: 'About the Company' },
        { pattern: /^(?:\d+\.\s*)?financial performance\b\s*:?\s*/i, label: 'Financial Performance' },
        { pattern: /^(?:\d+\.\s*)?what the numbers show\b\s*:?\s*/i, label: 'What the Numbers Show' },
        { pattern: /^(?:\d+\.\s*)?strengths?\b\s*:?\s*/i, label: 'Strengths' },
        { pattern: /^(?:\d+\.\s*)?risks?\b\s*:?\s*/i, label: 'Risks' },
        { pattern: /^(?:\d+\.\s*)?peer positioning\b\s*:?\s*/i, label: 'Peer Positioning' },
        { pattern: /^(?:\d+\.\s*)?bottom line\b\s*:?\s*/i, label: 'Bottom Line' },
      ]

      const splitTableCells = (line: string): string[] => {
        const cleaned = line.trim().replace(/^\|/, '').replace(/\|$/, '')
        return cleaned.split('|').map((c) => c.trim())
      }

      const isAlignmentRow = (line: string): boolean => {
        const normalized = line
          .trim()
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .replace(/\s+/g, '')
        return /^:?-{2,}:?(?:\|:?-{2,}:?)*$/.test(normalized)
      }

      const blocks: string[] = []
      let inList = false
      const closeList = () => {
        if (!inList) return
        blocks.push('</ul>')
        inList = false
      }

      let i = 0
      while (i < lines.length) {
        const line = lines[i]
        let matched = false

        for (const matcher of headingMatchers) {
          if (!matcher.pattern.test(line)) continue
          closeList()
          const trailing = line.replace(matcher.pattern, '').trim()
          blocks.push(`<h2>${escapeHtml(matcher.label)}</h2>`)
          if (trailing) blocks.push(`<p>${escapeHtml(trailing)}</p>`)
          matched = true
          break
        }

        if (matched) {
          i += 1
          continue
        }

        const next = lines[i + 1] || ''
        if (line.includes('|') && next && isAlignmentRow(next)) {
          closeList()
          const header = splitTableCells(line)
          const rows: string[][] = []
          i += 2
          while (i < lines.length && lines[i].includes('|')) {
            rows.push(splitTableCells(lines[i]))
            i += 1
          }
          const thead = `<thead><tr>${header.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>`
          const tbody = `<tbody>${rows.map((row) => `<tr>${row.map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody>`
          blocks.push(`<table>${thead}${tbody}</table>`)
          continue
        }

        const bullet = line.match(/^[-*]\s+(.*)$/)
        if (bullet) {
          if (!inList) {
            blocks.push('<ul>')
            inList = true
          }
          blocks.push(`<li>${escapeHtml(bullet[1].trim())}</li>`)
          i += 1
          continue
        }

        closeList()
        blocks.push(`<p>${escapeHtml(line)}</p>`)
        i += 1
      }

      closeList()
      return blocks.join('')
    }

    const normalizePreviewHtml = (html: string) => {
      if (!html) return ''
      const hasStructuralTags = /<(h1|h2|p|ol|ul|li|pre|blockquote)\b/i.test(html)
      if (hasStructuralTags) return html
      return html
        .split(/\n\n+/)
        .map((block: string) => block.trim())
        .filter(Boolean)
        .map((block: string) => `<p>${block.replace(/\n/g, '<br/>')}</p>`)
        .join('')
    }
    const previewHtmlSource = isBlogArticle
      ? articleTextToPreviewHtml(articleText || '')
      : normalizePreviewHtml(articleHtml || articleTextToPreviewHtml(articleText || ''))

    const articleBodyPreviewHtml = previewHtmlSource
      .replace(/<h1\b[^>]*>[\s\S]*?<\/h1>/i, '')
      .trim()
    const stripSourcesFromHtml = (html: string) => {
      if (!html) return ''
      return html
        .replace(/<h2>\s*Sources\s*<\/h2>\s*<ol>[\s\S]*?<\/ol>/i, '')
        .replace(/<h2>\s*SEO Metadata\s*<\/h2>\s*<ul>[\s\S]*?<\/ul>/i, '')
        .replace(/<h2>\s*FAQ Schema\s*<\/h2>\s*<pre>[\s\S]*?<\/pre>/i, '')
        .replace(/<script[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/i, '')
        .trim()
    }

    const buildDownloadHtml = () => {
      const cleanBody = stripSourcesFromHtml(
        isBlogArticle
          ? articleTextToPreviewHtml(articleText || '')
          : (articleHtml || articleTextToPreviewHtml(articleText || ''))
      )
      return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${headline || 'Live News Article'}</title>
    <style>
      body {
        font-family: Georgia, "Times New Roman", serif;
        line-height: 1.7;
        color: #1f2937;
        max-width: 760px;
        margin: 40px auto;
        padding: 0 16px;
      }
      h1 { font-size: 2rem; line-height: 1.2; margin-bottom: 0.5rem; color: #111827; }
      p { margin: 0 0 1rem; font-size: 1.05rem; }
      .subheadline { font-size: 1.15rem; color: #374151; margin-bottom: 1rem; }
      .summary { background: #f9fafb; border-left: 4px solid #2563eb; padding: 0.8rem 1rem; margin: 1rem 0 1.5rem; }
    </style>
  </head>
  <body>
    ${headline ? `<h1>${headline}</h1>` : ''}
    ${subheadline ? `<p class="subheadline">${subheadline}</p>` : ''}
    ${summary ? `<p class="summary">${summary}</p>` : ''}
    ${cleanBody}
  </body>
</html>`
    }

    const downloadArticleHtml = () => {
      const articleTypeLabel = formData['contentType'] === 'blog-article' ? 'blog-article' : 'live-news-article'
      const html = buildDownloadHtml()
      const blob = new Blob([html], { type: 'text/html' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${articleTypeLabel}-${Date.now()}.html`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }

    return (
      <div className="space-y-6">
        <div className="p-4 bg-gray-50 border-2 border-gray-300 rounded-xl">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xl">📝</span>
            <div>
              <label className="block text-sm font-bold text-gray-900">
                Raw Article Text
              </label>
              <p className="text-xs text-gray-600 mt-0.5">
                This raw article body is shown first so you can inspect or edit the exact generated output before reviewing the rendered preview.
              </p>
            </div>
          </div>
          <textarea
            value={articleText}
            onChange={(e) => handleFieldChange('articleText', e.target.value)}
            rows={14}
            className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none text-sm bg-white resize-vertical"
          />
        </div>

        <div className="p-4 bg-gradient-to-br from-blue-50 to-sky-50 border-2 border-blue-300 rounded-xl">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-2xl">📰</span>
              <div>
                <label className="block text-base font-bold text-blue-900">
                  {formData['contentType'] === 'blog-article' ? 'Blog Article Preview' : 'Live News Article Preview'}
                </label>
                <p className="text-xs text-blue-700 mt-0.5">
                  Rendered rich-text preview for reader-friendly review and HTML export
                </p>
              </div>
            </div>
            <button
              onClick={downloadArticleHtml}
              className="px-3 py-1 text-xs font-semibold bg-white border-2 border-blue-300 text-blue-700 rounded-lg hover:bg-blue-50 transition-colors"
            >
              ⬇️ Download HTML
            </button>
          </div>

          <div className="border-2 border-blue-300 rounded-lg bg-white overflow-hidden">
            <div className="bg-blue-100 px-3 py-2 text-xs font-semibold text-blue-800 border-b-2 border-blue-300">
              Article Preview
            </div>
            <div className="p-5 max-w-none [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:leading-tight [&_h1]:mb-3 [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:leading-snug [&_h2]:mt-6 [&_h2]:mb-2 [&_p]:text-[16px] [&_p]:leading-7 [&_p]:mb-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6 [&_li]:mb-1 [&_pre]:whitespace-pre-wrap [&_pre]:break-words [&_table]:w-full [&_table]:border-collapse [&_table]:my-4 [&_th]:border [&_th]:border-gray-300 [&_th]:bg-gray-100 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:text-sm [&_th]:font-semibold [&_td]:border [&_td]:border-gray-300 [&_td]:px-3 [&_td]:py-2 [&_td]:text-sm">
              {headline && <h1 className="!mb-2 !font-bold">{headline}</h1>}
              {subheadline && <p className="!mt-0 !text-gray-700"><em>{subheadline}</em></p>}
              {summary && (
                <div className="bg-gray-50 border-l-4 border-blue-600 px-3 py-2 my-3">
                  <p className="!my-0 text-gray-700">{summary}</p>
                </div>
              )}
              <div dangerouslySetInnerHTML={{ __html: articleBodyPreviewHtml }} />
            </div>
          </div>
        </div>

        {rawOutput && (
          <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-xl">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">🤖</span>
              <label className="block text-sm font-bold text-amber-900">
                Raw Gemini Output
              </label>
            </div>
            <textarea
              value={rawOutput}
              onChange={(e) => handleFieldChange('rawOutput', e.target.value)}
              rows={14}
              className="w-full px-3 py-2 border-2 border-amber-300 rounded-lg focus:border-amber-500 focus:outline-none text-sm bg-white resize-vertical font-mono"
            />
          </div>
        )}
      </div>
    )
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-800">{stageName}</h2>
            <p className="text-sm text-gray-600 mt-1">Edit stage output data</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {saveSuccess && (
            <div className="mb-4 p-3 bg-green-50 border-2 border-green-200 rounded-lg">
              <p className="text-sm text-green-700 font-semibold">✅ Data saved successfully!</p>
            </div>
          )}

          {saveError && (
            <div className="mb-4 p-3 bg-red-50 border-2 border-red-200 rounded-lg">
              <p className="text-sm text-red-700 font-semibold">❌ {saveError}</p>
            </div>
          )}

          {/* For Stage 1: Display campaign planning prompt(s) only */}
          {stageId === 1 && formData['creativePrompt'] && (
            <>
              {String(formData['campaignType'] || '') === 'blog' && renderStage1GeneratedUserPrompt()}
              {renderCreativePrompt()}
            </>
          )}

          {/* For Stage 2: Display email newsletter if contentType is email */}
          {stageId === 2 && formData['contentType'] === 'email-newsletter' && formData['html'] && (
            <>
              {renderEmailNewsletter()}
              <div className="my-6 border-t-2 border-gray-200"></div>
              <h3 className="text-sm font-semibold text-gray-600 mb-4 uppercase tracking-wide">Additional Details</h3>
            </>
          )}

          {/* For Stage 2: Display grounded article with preview/download */}
          {stageId === 2 && ['live-news-article', 'blog-article'].includes(String(formData['contentType'] || '')) && formData['articleHtml'] && (
            <>
              {renderArticlePreview()}
              <div className="my-6 border-t-2 border-gray-200"></div>
              <h3 className="text-sm font-semibold text-gray-600 mb-4 uppercase tracking-wide">Additional Details</h3>
            </>
          )}

          <div className="space-y-4">
            {Object.entries(formData)
              .filter(([key]) => {
                // Don't render these fields twice in special sections
                if (stageId === 1) return false
                if (stageId === 2 && formData['contentType'] === 'email-newsletter') {
                  return !['html', 'subject', 'preheader', 'plainText', 'subjectVariations', 'contentType'].includes(key)
                }
                if (stageId === 2 && ['live-news-article', 'blog-article'].includes(String(formData['contentType'] || ''))) {
                  return !['headline', 'subheadline', 'summary', 'rawOutput', 'articleText', 'articleHtml', 'contentType'].includes(key)
                }
                return true
              })
              .sort(([a], [b]) => {
                // Keep user prompt visible at top of Additional Details and just above id.
                if (a === 'userPrompt' && b !== 'userPrompt') return -1
                if (b === 'userPrompt' && a !== 'userPrompt') return 1
                if (a === 'id' && b !== 'id') return 1
                if (b === 'id' && a !== 'id') return -1
                return a.localeCompare(b)
              })
              .map(([key, value]) => renderField(key, value))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isSaving}
            className="px-4 py-2 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className={`px-6 py-2 rounded-lg font-semibold transition-all ${
              isSaving
                ? 'bg-blue-400 text-white cursor-wait'
                : 'bg-blue-600 text-white hover:bg-blue-700 shadow-md hover:shadow-lg'
            }`}
          >
            {isSaving ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Saving...
              </span>
            ) : (
              'Save Changes'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
