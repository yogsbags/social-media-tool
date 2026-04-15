'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import * as XLSX from 'xlsx'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { AuthGate } from '@/app/components/auth/AuthGate'
import FileUpload from './components/FileUpload'
import PromptEditor from './components/PromptEditor'
import PublishingQueue from './components/PublishingQueue'
import StageDataModal from './components/StageDataModal'
import VideoProducer from './components/VideoProducer'

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

type ModuleKind = 'content-engine' | 'lead-intelligence'

type LeadConnectorId =
  | 'apollo'
  | 'linkedin'
  | 'hubspot'
  | 'salesforce'
  | 'google-sheets'
  | 'gmail'
  | 'google-calendar'

type LeadConnectorMeta = {
  id: LeadConnectorId
  label: string
  description: string
  category: 'source' | 'crm' | 'outreach'
}

type LeadIntegrationRecord = LeadConnectorMeta & {
  connected: boolean
  status?: string
  connectedAt?: string | null
}

type LeadsDbMetadata = {
  total_rows?: number
  tables?: string[]
  last_updated?: string
  source?: string
  valid_industries?: string[]
  valid_seniorities?: string[]
  channels?: string[]
}

type LeadsDbFetchResponse = {
  count?: number
  table_used?: string
  leads?: Array<Record<string, unknown>>
  error?: string
}

type LeadsDbSizeResponse = {
  estimated_count?: number
  table_used?: string
  error?: string
}

type EnrichedUploadResponse = {
  count?: number
  matched?: number
  enrichedRows?: Array<Record<string, unknown>>
  error?: string
}

const CONTENT_ENGINE_STAGES = (): WorkflowStage[] => [
  { id: 1, name: 'Stage 1: Campaign Planning', status: 'idle', message: '' },
  { id: 2, name: 'Stage 2: Content Generation', status: 'idle', message: '' },
  { id: 3, name: 'Stage 3: Visual Assets', status: 'idle', message: '' },
  { id: 4, name: 'Stage 4: Video Production', status: 'idle', message: '' },
  { id: 5, name: 'Stage 5: Publishing', status: 'idle', message: '' },
  { id: 6, name: 'Stage 6: Analytics & Tracking', status: 'idle', message: '' },
]

const LEAD_GENERATION_STAGES = (): WorkflowStage[] => [
  { id: 1, name: 'Stage 1: ICP Definition', status: 'idle', message: '' },
  { id: 2, name: 'Stage 2: Source Setup', status: 'idle', message: '' },
  { id: 3, name: 'Stage 3: Prospect Discovery', status: 'idle', message: '' },
  { id: 4, name: 'Stage 4: Enrichment', status: 'idle', message: '' },
  { id: 5, name: 'Stage 5: Scoring & Prioritization', status: 'idle', message: '' },
  { id: 6, name: 'Stage 6: Outreach Readiness', status: 'idle', message: '' },
]

const LEAD_CONNECTOR_META: LeadConnectorMeta[] = [
  {
    id: 'apollo',
    label: 'Apollo',
    description: 'Primary account and contact discovery source',
    category: 'source',
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    description: 'Role validation, profile checks, and social sourcing',
    category: 'source',
  },
  {
    id: 'hubspot',
    label: 'HubSpot',
    description: 'Lead sync, lifecycle stages, and CRM feedback',
    category: 'crm',
  },
  {
    id: 'salesforce',
    label: 'Salesforce',
    description: 'Account sync and downstream revenue tracking',
    category: 'crm',
  },
  {
    id: 'google-sheets',
    label: 'Google Sheets',
    description: 'Manual imports, lead lists, and QA review loops',
    category: 'source',
  },
  {
    id: 'gmail',
    label: 'Gmail',
    description: 'Outbound delivery and reply monitoring',
    category: 'outreach',
  },
  {
    id: 'google-calendar',
    label: 'Google Calendar',
    description: 'Meeting routing and booked-demo readiness',
    category: 'outreach',
  },
]

const LEAD_STAGE_CONNECTORS: Record<number, LeadConnectorId[]> = {
  1: ['hubspot', 'salesforce', 'google-sheets'],
  2: ['apollo', 'linkedin', 'google-sheets', 'hubspot'],
  3: ['apollo', 'linkedin'],
  4: ['apollo', 'hubspot', 'salesforce'],
  5: ['hubspot', 'salesforce', 'google-sheets'],
  6: ['gmail', 'linkedin', 'google-calendar', 'hubspot'],
}

const LEAD_STAGE_MESSAGES: Record<number, { running: string; completed: string }> = {
  1: {
    running: 'Normalizing ICP inputs into a usable targeting blueprint',
    completed: 'ICP blueprint ready for discovery',
  },
  2: {
    running: 'Validating lead sources and connector coverage',
    completed: 'Lead sources mapped to the workflow',
  },
  3: {
    running: 'Framing prospect discovery logic for the selected ICP',
    completed: 'Discovery logic prepared for enrichment',
  },
  4: {
    running: 'Defining enrichment requirements and fallback sources',
    completed: 'Enrichment schema approved',
  },
  5: {
    running: 'Combining fit and timing rules into one scorecard',
    completed: 'Lead scoring model is ready',
  },
  6: {
    running: 'Preparing outreach handoff and channel readiness',
    completed: 'Lead generation workflow is ready to activate',
  },
}

const LEAD_SOURCE_LABELS: Record<string, string> = {
  apollo: 'Apollo',
  linkedin: 'LinkedIn',
  'leads-db': 'Leads DB',
  hubspot: 'HubSpot Lists',
}

const LEADS_DB_DEFAULT_INDUSTRIES = ['IT_SERVICES', 'FINANCE', 'MANUFACTURING', 'HEALTHCARE', 'CONSULTING', 'LEGAL']
const LEADS_DB_DEFAULT_SENIORITIES = ['C_SUITE', 'VP', 'DIRECTOR', 'MANAGER', 'IC', 'PARTNER', 'OWNER']

const LEADS_DB_FILTER_PRESETS: Array<{
  value: string
  label: string
  config: {
    industries?: string[]
    seniorities?: string[]
    designationKeywords?: string[]
    cities?: string[]
    channel?: 'any' | 'phone' | 'whatsapp' | 'email' | 'linkedin'
    hasPhone?: boolean | null
    hasEmail?: boolean | null
    hasLinkedin?: boolean | null
  }
}> = [
  {
    value: 'b2b-decision-makers',
    label: 'B2B Decision-Makers (CXO/Founder)',
    config: {
      industries: ['IT_SERVICES', 'FINANCE', 'CONSULTING'],
      seniorities: ['C_SUITE', 'OWNER', 'PARTNER'],
      designationKeywords: ['CEO', 'CFO', 'CTO', 'Founder', 'Promoter', 'Business Head'],
      cities: ['Mumbai', 'Delhi', 'Bangalore'],
      channel: 'phone',
      hasPhone: true,
    },
  },
  {
    value: 'b2b-influencers',
    label: 'B2B Influencers (Director/Manager)',
    config: {
      industries: ['IT_SERVICES', 'FINANCE', 'CONSULTING'],
      seniorities: ['DIRECTOR', 'MANAGER', 'VP'],
      designationKeywords: ['Director', 'Head', 'Manager', 'VP'],
      cities: ['Mumbai', 'Delhi', 'Pune', 'Hyderabad'],
      channel: 'phone',
      hasPhone: true,
    },
  },
  {
    value: 'b2c-investor-trader',
    label: 'B2C Proxy: Investors/Traders',
    config: {
      industries: ['FINANCE'],
      designationKeywords: ['Investor', 'Trader', 'Portfolio', 'Mutual Fund', 'Equity'],
      cities: ['Mumbai', 'Delhi', 'Bangalore', 'Pune'],
      channel: 'phone',
      hasPhone: true,
    },
  },
]

// Helper function to detect if text contains markdown
function isMarkdown(text: string): boolean {
  const markdownPatterns = [
    /^#{1,6}\s/m,           // Headers
    /\*\*[^*]+\*\*/,        // Bold
    /\*[^*]+\*/,            // Italic
    /^\s*[-*+]\s/m,         // Unordered lists
    /^\s*\d+\.\s/m,         // Ordered lists
    /\[.+\]\(.+\)/,         // Links
    /^>\s/m,                // Blockquotes
  ];
  return markdownPatterns.some(pattern => pattern.test(text));
}

// LogEntry component to render logs with markdown support
function LogEntry({ text, index }: { text: string; index: number }) {
  if (isMarkdown(text)) {
    return (
      <div key={index} className="text-green-400 mb-2 prose prose-invert prose-sm max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {text}
        </ReactMarkdown>
      </div>
    );
  }

  return (
    <div key={index} className="text-green-400 mb-1">
      {text}
    </div>
  );
}

function DashboardPage() {
  const { user, logout } = useAuth()
  const [activeModule, setActiveModule] = useState<ModuleKind>('content-engine')
  const [isRunning, setIsRunning] = useState(false)
  const [stages, setStages] = useState<WorkflowStage[]>(CONTENT_ENGINE_STAGES())
  const [logs, setLogs] = useState<string[]>([])
  const [stageData, setStageData] = useState<Record<number, StageData>>({})
  const [campaignData, setCampaignData] = useState<CampaignData>({})
  const [executionMode, setExecutionMode] = useState<'full' | 'staged'>('staged')
  const [executingStage, setExecutingStage] = useState<number | null>(null)
  const [expandedStage, setExpandedStage] = useState<number | null>(null)
  const [showDataModal, setShowDataModal] = useState(false)
  const [selectedStageData, setSelectedStageData] = useState<{ stageId: number; stageName: string; data: any; dataId: string } | null>(null)
  const [connectedLeadConnectors, setConnectedLeadConnectors] = useState<Record<LeadConnectorId, boolean>>({
    apollo: false,
    linkedin: false,
    hubspot: false,
    salesforce: false,
    'google-sheets': false,
    gmail: false,
    'google-calendar': false,
  })
  const [leadConnectorStatuses, setLeadConnectorStatuses] = useState<Partial<Record<LeadConnectorId, string>>>({})
  const [connectorPanelOpen, setConnectorPanelOpen] = useState(true)
  const [connectorActionId, setConnectorActionId] = useState<LeadConnectorId | null>(null)
  const [integrationsLoading, setIntegrationsLoading] = useState(false)
  const [leadsDbMetadata, setLeadsDbMetadata] = useState<LeadsDbMetadata | null>(null)
  const [leadsDbError, setLeadsDbError] = useState<string | null>(null)

  // Lead generation configuration
  const [leadGoal, setLeadGoal] = useState<
    'lead-generation' | 'lead-enrichment' | 'lead-scoring' | 'lead-qualification-outreach'
  >('lead-generation')
  const leadGoalOptions: Array<{
    value: 'lead-generation' | 'lead-enrichment' | 'lead-scoring' | 'lead-qualification-outreach'
    label: string
  }> = [
    { value: 'lead-generation', label: 'Lead generation' },
    { value: 'lead-enrichment', label: 'Lead Enrichment' },
    { value: 'lead-scoring', label: 'Lead scoring' },
    { value: 'lead-qualification-outreach', label: 'Lead qualification/outreach' },
  ]
  const leadGoalLabel =
    leadGoalOptions.find((option) => option.value === leadGoal)?.label || 'Lead generation'
  const [leadIcpPreset, setLeadIcpPreset] = useState('b2b-saas')
  const [leadGeography, setLeadGeography] = useState('india')
  const [leadIndustry, setLeadIndustry] = useState('saas')
  const [leadCompanySize, setLeadCompanySize] = useState('11-50')
  const [leadBuyerRole, setLeadBuyerRole] = useState('marketing-leader')
  const [leadSource] = useState('leads-db')
  const [leadIntentLevel, setLeadIntentLevel] = useState('medium')
  const [leadOutreachChannel, setLeadOutreachChannel] = useState('email-linkedin')
  const [leadPreset, setLeadPreset] = useState('b2b-decision-makers')
  const [leadDbCountry, setLeadDbCountry] = useState<'IN' | 'US'>('IN')
  const [leadDbChannel, setLeadDbChannel] = useState<'any' | 'phone' | 'whatsapp' | 'email' | 'linkedin'>('phone')
  const [leadDbIndustries, setLeadDbIndustries] = useState<string[]>(['IT_SERVICES', 'FINANCE'])
  const [leadDbSeniorities, setLeadDbSeniorities] = useState<string[]>(['C_SUITE', 'DIRECTOR'])
  const [leadDbDesignationKeywords, setLeadDbDesignationKeywords] = useState('CEO, CFO, CTO, Founder')
  const [leadDbCities, setLeadDbCities] = useState('Mumbai, Bangalore, Delhi')
  const [leadDbStates, setLeadDbStates] = useState('')
  const [leadDbHasPhone, setLeadDbHasPhone] = useState<boolean | null>(true)
  const [leadDbHasEmail, setLeadDbHasEmail] = useState<boolean | null>(null)
  const [leadDbHasLinkedin, setLeadDbHasLinkedin] = useState<boolean | null>(null)
  const [leadDbLimit, setLeadDbLimit] = useState(25)
  const [leadDbMatchMode, setLeadDbMatchMode] = useState<'strict' | 'broad'>('strict')
  const [leadDbQueryLoading, setLeadDbQueryLoading] = useState(false)
  const [leadDbQueryError, setLeadDbQueryError] = useState<string | null>(null)
  const [leadDbQueryResult, setLeadDbQueryResult] = useState<LeadsDbFetchResponse | null>(null)
  const [leadDbSizeLoading, setLeadDbSizeLoading] = useState(false)
  const [leadDbSizeError, setLeadDbSizeError] = useState<string | null>(null)
  const [leadDbSizeResult, setLeadDbSizeResult] = useState<LeadsDbSizeResponse | null>(null)
  const [leadDbSortField, setLeadDbSortField] = useState<'full_name' | 'designation' | 'company' | 'city' | 'phone_e164'>('full_name')
  const [leadDbSortDirection, setLeadDbSortDirection] = useState<'asc' | 'desc'>('asc')
  const [leadDbPage, setLeadDbPage] = useState(1)
  const [leadDbPageSize, setLeadDbPageSize] = useState(5)
  const [leadEnrichmentFiles, setLeadEnrichmentFiles] = useState<File[]>([])
  const [leadUploadRows, setLeadUploadRows] = useState<Array<Record<string, unknown>>>([])
  const [leadUploadHeaders, setLeadUploadHeaders] = useState<string[]>([])
  const [leadEmailField, setLeadEmailField] = useState('')
  const [leadPhoneField, setLeadPhoneField] = useState('')
  const [leadEnrichmentLoading, setLeadEnrichmentLoading] = useState(false)
  const [leadEnrichmentError, setLeadEnrichmentError] = useState<string | null>(null)
  const [leadEnrichmentResult, setLeadEnrichmentResult] = useState<EnrichedUploadResponse | null>(null)

  // Campaign configuration
  const [campaignType, setCampaignType] = useState<string>('linkedin-carousel')
  const [purpose, setPurpose] = useState<string>('brand-awareness')
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(['linkedin'])
  const [topic, setTopic] = useState<string>('')
  const [isGeneratingTopic, setIsGeneratingTopic] = useState<boolean>(false)
  const [topicError, setTopicError] = useState<string | null>(null)
  const [duration, setDuration] = useState<number>(15)
  const [contentType, setContentType] = useState<'image' | 'faceless-video' | 'avatar-video'>('image')
  const [facelessVideoMode, setFacelessVideoMode] = useState<'text-to-video' | 'image-to-video'>('text-to-video')
  const [imageSource, setImageSource] = useState<'generate' | 'upload'>('generate')
  const [useVeo, setUseVeo] = useState<boolean>(true)
  const [useAvatar, setUseAvatar] = useState<boolean>(true)
  const [autoPublish, setAutoPublish] = useState<boolean>(false)
  // Aspect ratio: For images (16:9, 9:16, 1:1), For videos (16:9, 9:16)
  const [aspectRatio, setAspectRatio] = useState<string>('16:9')
  const [targetAudience, setTargetAudience] = useState<string>('all_clients')
  const [language, setLanguage] = useState<string>('english')

  // Avatar Video Configuration
  const [avatarId, setAvatarId] = useState<string>('auto')
  const [avatarScriptText, setAvatarScriptText] = useState<string>('')
  const [avatarVoiceId, setAvatarVoiceId] = useState<string>('')
  const [generatingScript, setGeneratingScript] = useState<boolean>(false)
  const [scriptError, setScriptError] = useState<string | null>(null)
  const [availableAvatars, setAvailableAvatars] = useState<Array<{
    id: string
    name: string
    groupId: string
    voiceId: string
    voiceName: string
    gender: string
    description: string
  }>>([])

  // Brand Guidelines
  const [showBrandGuidelines, setShowBrandGuidelines] = useState<boolean>(false)
  const [useBrandGuidelines, setUseBrandGuidelines] = useState<boolean>(true)
  const [customColors, setCustomColors] = useState<string>('')
  const [accentColors, setAccentColors] = useState<string>('')
  const [bodyTextColor, setBodyTextColor] = useState<string>('')
  const [customFont, setCustomFont] = useState<string>('Figtree')
  const [customFontSize, setCustomFontSize] = useState<string>('')
  const [customFontWeight, setCustomFontWeight] = useState<string>('')
  const [gradientStartColor, setGradientStartColor] = useState<string>('')
  const [gradientEndColor, setGradientEndColor] = useState<string>('')
  const [gradientDirection, setGradientDirection] = useState<string>('')
  const [customTone, setCustomTone] = useState<string>('')
  const [customInstructions, setCustomInstructions] = useState<string>('')

  // Reference Materials
  const [showReferenceMaterials, setShowReferenceMaterials] = useState<boolean>(false)

  // Avatar Video Configuration
  const [showAvatarConfig, setShowAvatarConfig] = useState<boolean>(false)

  // Faceless Video Options
  const [showFacelessOptions, setShowFacelessOptions] = useState<boolean>(false)

  // File uploads
  const [researchPDFs, setResearchPDFs] = useState<File[]>([])
  const [referenceImages, setReferenceImages] = useState<File[]>([])
  const [referenceVideo, setReferenceVideo] = useState<File[]>([])

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

  // Platform dropdown state
  const [showPlatformDropdown, setShowPlatformDropdown] = useState<boolean>(false)

  const campaignTypes = [
    { value: 'linkedin-carousel', label: 'LinkedIn Carousel', platforms: ['linkedin'] },
    { value: 'instagram-reel', label: 'Instagram Reel', platforms: ['instagram'] },
    { value: 'instagram-carousel', label: 'Instagram Carousel', platforms: ['instagram'] },
    { value: 'youtube-explainer', label: 'YouTube Explainer', platforms: ['youtube'] },
    { value: 'youtube-short', label: 'YouTube Short', platforms: ['youtube'] },
    { value: 'facebook-reel', label: 'Facebook Reel', platforms: ['facebook'] },
    { value: 'twitter-thread', label: 'Twitter Thread', platforms: ['twitter'] },
    { value: 'whatsapp-creative', label: 'WhatsApp Creative', platforms: ['whatsapp'] },
    { value: 'email-newsletter', label: 'Email Newsletter', platforms: ['email'] },
    { value: 'blog', label: 'Blog Article', platforms: ['linkedin'] },
    { value: 'live-news', label: 'Live News Update', platforms: ['linkedin', 'twitter', 'youtube'] },
    { value: 'infographic', label: 'Infographic', platforms: ['linkedin', 'instagram', 'facebook', 'twitter'] },
  ]

  const purposeOptions = [
    { value: 'brand-awareness', label: 'Brand Awareness', description: 'General awareness and top-of-funnel campaigns' },
    { value: 'product-launch', label: 'Product Launch', description: 'Launch a new product, service, or feature' },
    { value: 'lead-generation', label: 'Lead Generation', description: 'Drive inbound interest and conversions' },
    { value: 'customer-education', label: 'Customer Education', description: 'Explain workflows, benefits, and best practices' },
    { value: 'feature-adoption', label: 'Feature Adoption', description: 'Promote product usage and activation' },
    { value: 'event-promotion', label: 'Event Promotion', description: 'Webinars, events, or announcements' },
    { value: 'case-study', label: 'Case Study', description: 'Customer proof, testimonials, and outcomes' },
    { value: 'community-engagement', label: 'Community Engagement', description: 'Grow ongoing audience engagement' },
    { value: 'newsletter', label: 'Newsletter', description: 'Recurring updates and editorial content' }
  ]

  const targetAudienceOptions = [
    { value: 'all_clients', label: 'General audience', description: 'Default audience for broad campaigns' },
    { value: 'lead_gen', label: 'Lead generation', description: 'Prospects evaluating the offer' },
    { value: 'internal', label: 'Internal teams', description: 'Employee communications and training' },
    { value: 'professionals', label: 'Professionals', description: 'Working professionals and business users' },
    { value: 'executives', label: 'Executives', description: 'Senior stakeholders and decision-makers' }
  ]

  const platforms = [
    { value: 'linkedin', label: 'LinkedIn', color: 'bg-blue-500' },
    { value: 'instagram', label: 'Instagram', color: 'bg-pink-500' },
    { value: 'youtube', label: 'YouTube', color: 'bg-red-500' },
    { value: 'facebook', label: 'Facebook', color: 'bg-blue-600' },
    { value: 'twitter', label: 'Twitter/X', color: 'bg-sky-500' },
    { value: 'whatsapp', label: 'WhatsApp', color: 'bg-green-500' },
    { value: 'email', label: 'Email', color: 'bg-gray-600' },
  ]

  const languages = [
    { value: 'english', label: 'English', native: 'English' },
    { value: 'hindi', label: 'Hindi', native: 'हिंदी' },
    { value: 'bengali', label: 'Bengali', native: 'বাংলা' },
    { value: 'telugu', label: 'Telugu', native: 'తెలుగు' },
    { value: 'marathi', label: 'Marathi', native: 'मराठी' },
    { value: 'tamil', label: 'Tamil', native: 'தமிழ்' },
    { value: 'gujarati', label: 'Gujarati', native: 'ગુજરાતી' },
    { value: 'kannada', label: 'Kannada', native: 'ಕನ್ನಡ' },
    { value: 'malayalam', label: 'Malayalam', native: 'മലയാളം' },
    { value: 'punjabi', label: 'Punjabi', native: 'ਪੰਜਾਬੀ' },
  ]

  // Load available avatars on component mount
  useEffect(() => {
    const loadAvatars = async () => {
      try {
        const response = await fetch('/api/avatars')
        if (response.ok) {
          const data = await response.json()
          setAvailableAvatars(data.avatars || [])
        }
      } catch (error) {
        console.error('Failed to load avatars:', error)
      }
    }
    loadAvatars()
  }, [])

  useEffect(() => {
    setStages(activeModule === 'content-engine' ? CONTENT_ENGINE_STAGES() : LEAD_GENERATION_STAGES())
    setLogs([])
    setStageData({})
    setCampaignData({})
    setIsRunning(false)
    setExecutingStage(null)
  }, [activeModule])

  useEffect(() => {
    if (!user?.id) return

    let cancelled = false
    const loadIntegrations = async () => {
      setIntegrationsLoading(true)
      try {
        const response = await fetch(`/api/integrations?userId=${encodeURIComponent(user.id)}`)
        const data = await response.json().catch(() => ({ connectors: [] }))
        if (!response.ok) {
          throw new Error(data?.error || 'Could not load integrations')
        }
        if (cancelled) return

        const nextConnectedState: Record<LeadConnectorId, boolean> = {
          apollo: false,
          linkedin: false,
          hubspot: false,
          salesforce: false,
          'google-sheets': false,
          gmail: false,
          'google-calendar': false,
        }
        const nextStatuses: Partial<Record<LeadConnectorId, string>> = {}

        for (const connector of data.connectors || []) {
          const connectorId = connector.id as LeadConnectorId
          if (!(connectorId in nextConnectedState)) continue
          nextConnectedState[connectorId] = Boolean(connector.connected || connector.status === 'active')
          nextStatuses[connectorId] = String(connector.status || '')
        }

        setConnectedLeadConnectors(nextConnectedState)
        setLeadConnectorStatuses(nextStatuses)
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to load integrations:', error)
        }
      } finally {
        if (!cancelled) setIntegrationsLoading(false)
      }
    }

    loadIntegrations()
    return () => {
      cancelled = true
    }
  }, [user?.id])

  useEffect(() => {
    if (activeModule !== 'lead-intelligence' || leadSource !== 'leads-db') return

    let cancelled = false
    const loadLeadsDbMetadata = async () => {
      try {
        setLeadsDbError(null)
        const response = await fetch('/api/leads-db/metadata')
        const data = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(data?.error || 'Could not load leads DB metadata')
        }
        if (!cancelled) setLeadsDbMetadata(data)
      } catch (error) {
        if (!cancelled) {
          setLeadsDbMetadata(null)
          setLeadsDbError(error instanceof Error ? error.message : 'Could not load leads DB metadata')
        }
      }
    }

    loadLeadsDbMetadata()
    return () => {
      cancelled = true
    }
  }, [activeModule, leadSource])

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      if (event.data?.type !== 'composio_oauth_success') return

      const connectorId = event.data?.connectorId as LeadConnectorId | undefined
      if (!connectorId) return

      setConnectorActionId(null)
      addLog(`${LEAD_CONNECTOR_META.find((connector) => connector.id === connectorId)?.label || connectorId} connected successfully.`)

      if (!user?.id) return
      fetch(`/api/integrations?userId=${encodeURIComponent(user.id)}`)
        .then((response) => response.json())
        .then((data) => {
          const nextConnectedState: Record<LeadConnectorId, boolean> = {
            apollo: false,
            linkedin: false,
            hubspot: false,
            salesforce: false,
            'google-sheets': false,
            gmail: false,
            'google-calendar': false,
          }
          const nextStatuses: Partial<Record<LeadConnectorId, string>> = {}

          for (const connector of data.connectors || []) {
            const nextId = connector.id as LeadConnectorId
            if (!(nextId in nextConnectedState)) continue
            nextConnectedState[nextId] = Boolean(connector.connected || connector.status === 'active')
            nextStatuses[nextId] = String(connector.status || '')
          }

          setConnectedLeadConnectors(nextConnectedState)
          setLeadConnectorStatuses(nextStatuses)
        })
        .catch((error) => {
          console.error('Failed to refresh integrations after popup success:', error)
        })
    }

    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [user?.id])

  const stageCount = stages.length
  const activeModuleTitle =
    activeModule === 'content-engine' ? 'Torqq Content Engine' : 'Torqq Lead Intelligence'
  const activeModuleSubtitle =
    activeModule === 'content-engine'
      ? 'AI-Powered Multi-Platform Campaign Automation'
      : 'Connector-aware lead generation architecture'

  const activeGoalLabel =
    activeModule === 'content-engine' ? 'Scalable Content Ops' : leadGoalLabel

  const leadConnectorRecords: LeadIntegrationRecord[] = LEAD_CONNECTOR_META.map((connector) => ({
    ...connector,
    connected: connectedLeadConnectors[connector.id],
    status: leadConnectorStatuses[connector.id],
  }))

  const disconnectLeadConnector = async (connectorId: LeadConnectorId) => {
    if (!user?.id) {
      addLog('Sign in again to manage connectors.')
      return
    }

    setConnectorActionId(connectorId)
    try {
      const response = await fetch('/api/integrations/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, connectorId }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data?.error || 'Could not disconnect connector')
      }

      setConnectedLeadConnectors((prev) => ({
        ...prev,
        [connectorId]: false,
      }))
      setLeadConnectorStatuses((prev) => ({
        ...prev,
        [connectorId]: 'not_connected',
      }))
      addLog(`${LEAD_CONNECTOR_META.find((connector) => connector.id === connectorId)?.label || connectorId} disconnected.`)
    } catch (error) {
      addLog(error instanceof Error ? error.message : `Could not disconnect ${connectorId}.`)
    } finally {
      setConnectorActionId(null)
    }
  }

  const connectLeadConnector = async (connectorId: LeadConnectorId) => {
    if (!user?.id) {
      addLog('Sign in again to manage connectors.')
      return
    }

    setConnectorActionId(connectorId)
    try {
      const response = await fetch('/api/integrations/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, connectorId }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data?.error || 'Could not start connector auth')
      }

      if (!data?.redirectUrl) {
        throw new Error('Connector auth link was not returned by Composio')
      }

      const popup = window.open(
        data.redirectUrl,
        'composio_oauth',
        'width=560,height=720,left=220,top=100'
      )

      if (!popup) {
        throw new Error(`Unable to open the ${connectorId} connector popup. Check popup blocking in your browser.`)
      }

      addLog(`Opening ${LEAD_CONNECTOR_META.find((connector) => connector.id === connectorId)?.label || connectorId} connector popup...`)

      const poll = window.setInterval(() => {
        if (!popup || popup.closed) {
          window.clearInterval(poll)
          setConnectorActionId((prev) => (prev === connectorId ? null : prev))
        }
      }, 1200)
    } catch (error) {
      setConnectorActionId(null)
      addLog(error instanceof Error ? error.message : `Could not connect ${connectorId}.`)
    }
  }

  const handleLeadConnectorAction = (connectorId: LeadConnectorId) => {
    void connectLeadConnector(connectorId)
  }

  const setStageStatusLocal = (stageId: number, status: WorkflowStage['status'], message: string) => {
    setStages((prev) => prev.map((stage) => (
      stage.id === stageId ? { ...stage, status, message } : stage
    )))
  }

  const parseCommaSeparated = (value: string) =>
    value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)

  const toggleMultiSelectValue = (value: string, current: string[], setter: (next: string[]) => void) => {
    if (current.includes(value)) {
      setter(current.filter((item) => item !== value))
      return
    }
    setter([...current, value])
  }

  const buildLeadsDbFilterPayload = (limitOverride?: number) => {
    const payload: Record<string, unknown> = {
      country: leadDbCountry,
      channel: leadDbChannel,
      limit: Math.min(Math.max(limitOverride ?? leadDbLimit, 1), 1000),
      output_format: 'json',
    }

    if (leadDbIndustries.length > 0) payload.industries = leadDbIndustries
    if (leadDbSeniorities.length > 0) payload.seniorities = leadDbSeniorities

    const designationKeywords = parseCommaSeparated(leadDbDesignationKeywords)
    if (designationKeywords.length > 0) payload.designation_keywords = designationKeywords

    const cities = parseCommaSeparated(leadDbCities)
    if (cities.length > 0) payload.cities = cities

    const states = parseCommaSeparated(leadDbStates)
    if (states.length > 0) payload.states = states

    if (leadDbMatchMode === 'strict') {
      if (leadDbHasPhone !== null) payload.has_phone = leadDbHasPhone
      if (leadDbHasEmail !== null) payload.has_email = leadDbHasEmail
      if (leadDbHasLinkedin !== null) payload.has_linkedin = leadDbHasLinkedin
    } else {
      if (leadDbHasPhone === false) payload.has_phone = false
      if (leadDbHasEmail === false) payload.has_email = false
      if (leadDbHasLinkedin === false) payload.has_linkedin = false
    }

    return payload
  }

  const applyLeadsDbPreset = (presetValue: string) => {
    const preset = LEADS_DB_FILTER_PRESETS.find((item) => item.value === presetValue)
    if (!preset) return

    setLeadPreset(presetValue)
    if (preset.config.industries) setLeadDbIndustries(preset.config.industries)
    if (preset.config.seniorities) setLeadDbSeniorities(preset.config.seniorities)
    if (preset.config.designationKeywords) setLeadDbDesignationKeywords(preset.config.designationKeywords.join(', '))
    if (preset.config.cities) setLeadDbCities(preset.config.cities.join(', '))
    if (preset.config.channel) setLeadDbChannel(preset.config.channel)
    if (typeof preset.config.hasPhone === 'boolean' || preset.config.hasPhone === null) setLeadDbHasPhone(preset.config.hasPhone ?? null)
    if (typeof preset.config.hasEmail === 'boolean' || preset.config.hasEmail === null) setLeadDbHasEmail(preset.config.hasEmail ?? null)
    if (typeof preset.config.hasLinkedin === 'boolean' || preset.config.hasLinkedin === null) setLeadDbHasLinkedin(preset.config.hasLinkedin ?? null)
  }

  const runLeadsDbQuery = async (limitOverride?: number) => {
    const needsApolloLinkedin =
      leadOutreachChannel === 'linkedin-only' || leadOutreachChannel === 'email-linkedin'
    if (!needsApolloLinkedin && leadSource !== 'leads-db') return null

    if (needsApolloLinkedin) {
      if (!user?.id) {
        setLeadDbQueryError('Sign in again to run Apollo lead search.')
        return null
      }
      if (!connectedLeadConnectors.apollo) {
        setLeadDbQueryError('LinkedIn mode requires Apollo. Connect Apollo via Connector Architecture first.')
        return null
      }
    }

    setLeadDbQueryLoading(true)
    setLeadDbQueryError(null)

    try {
      const payload = buildLeadsDbFilterPayload(limitOverride)
      const response = await fetch(needsApolloLinkedin ? '/api/integrations/apollo-leads' : '/api/leads-db/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          needsApolloLinkedin
            ? {
                userId: user?.id,
                country: payload.country,
                industries: payload.industries || [],
                seniorities: payload.seniorities || [],
                designation_keywords: payload.designation_keywords || [],
                cities: payload.cities || [],
                states: payload.states || [],
                limit: Math.min(Number(payload.limit || 25), 25),
              }
            : payload
        ),
      })

      const data = (await response.json().catch(() => ({}))) as LeadsDbFetchResponse
      if (!response.ok) {
        throw new Error(data?.error || 'Leads DB query failed')
      }

      setLeadDbQueryResult(data)
      setLeadDbPage(1)
      addLog(`Leads DB query returned ${data.count ?? 0} records.`)
      return data
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Leads DB query failed'
      setLeadDbQueryError(message)
      addLog(`Leads DB query failed: ${message}`)
      return null
    } finally {
      setLeadDbQueryLoading(false)
    }
  }

  const runLeadsDbSizeEstimate = async () => {
    if (leadSource !== 'leads-db') return null

    setLeadDbSizeLoading(true)
    setLeadDbSizeError(null)

    try {
      const response = await fetch('/api/leads-db/size', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildLeadsDbFilterPayload(1000)),
      })
      const data = (await response.json().catch(() => ({}))) as LeadsDbSizeResponse
      if (!response.ok) {
        throw new Error(data?.error || 'Leads DB size estimate failed')
      }
      setLeadDbSizeResult(data)
      addLog(`Leads DB size estimate: ${Number(data.estimated_count || 0).toLocaleString()} matches.`)
      return data
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Leads DB size estimate failed'
      setLeadDbSizeError(message)
      addLog(`Leads DB size estimate failed: ${message}`)
      return null
    } finally {
      setLeadDbSizeLoading(false)
    }
  }

  const currentLeadsDbPayload = buildLeadsDbFilterPayload()

  const leadsPreviewSorted = useMemo(() => {
    const leads = leadDbQueryResult?.leads || []
    const sorted = [...leads].sort((a, b) => {
      const av = String(a[leadDbSortField] ?? '').toLowerCase()
      const bv = String(b[leadDbSortField] ?? '').toLowerCase()
      if (av === bv) return 0
      const order = av > bv ? 1 : -1
      return leadDbSortDirection === 'asc' ? order : -order
    })
    return sorted
  }, [leadDbQueryResult, leadDbSortField, leadDbSortDirection])

  const leadsPreviewTotalPages = Math.max(1, Math.ceil(leadsPreviewSorted.length / leadDbPageSize))
  const leadsPreviewPageRows = leadsPreviewSorted.slice(
    (leadDbPage - 1) * leadDbPageSize,
    leadDbPage * leadDbPageSize
  )

  useEffect(() => {
    if (leadDbPage > leadsPreviewTotalPages) {
      setLeadDbPage(leadsPreviewTotalPages)
    }
  }, [leadDbPage, leadsPreviewTotalPages])

  const handlePreviewSort = (field: 'full_name' | 'designation' | 'company' | 'city' | 'phone_e164') => {
    if (leadDbSortField === field) {
      setLeadDbSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }
    setLeadDbSortField(field)
    setLeadDbSortDirection('asc')
  }

  const downloadTextFile = (filename: string, content: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const exportCurrentPayloadAsCsv = () => {
    const payload = buildLeadsDbFilterPayload()
    const rows = Object.entries(payload).map(([key, value]) => {
      const serialized = Array.isArray(value) || typeof value === 'object'
        ? JSON.stringify(value)
        : String(value)
      const escaped = serialized.replace(/"/g, '""')
      return `"${key}","${escaped}"`
    })
    const csv = ['field,value', ...rows].join('\n')
    downloadTextFile(`leads-db-query-payload-${Date.now()}.csv`, csv, 'text/csv;charset=utf-8;')
  }

  const exportCurrentPayloadAsXls = () => {
    const payload = buildLeadsDbFilterPayload()
    const rows = Object.entries(payload)
      .map(([key, value]) => {
        const serialized = Array.isArray(value) || typeof value === 'object'
          ? JSON.stringify(value)
          : String(value)
        return `<tr><td>${key}</td><td>${serialized}</td></tr>`
      })
      .join('')
    const html = `<table><thead><tr><th>field</th><th>value</th></tr></thead><tbody>${rows}</tbody></table>`
    downloadTextFile(`leads-db-query-payload-${Date.now()}.xls`, html, 'application/vnd.ms-excel;charset=utf-8;')
  }

  const detectUploadField = (headers: string[], kind: 'email' | 'phone') => {
    const normalizedHeaders = headers.map((header) => ({
      original: header,
      normalized: header.toLowerCase().replace(/[^a-z0-9]/g, ''),
    }))
    const candidates = kind === 'email'
      ? ['email', 'emailid', 'emailaddress', 'workemail', 'primaryemail']
      : ['phone', 'mobile', 'mobilenumber', 'phone_number', 'number', 'contactnumber', 'phoneno']

    for (const candidate of candidates) {
      const found = normalizedHeaders.find((header) => header.normalized.includes(candidate.replace(/[^a-z0-9]/g, '')))
      if (found) return found.original
    }
    return ''
  }

  const parseLeadUploadFile = async (file: File) => {
    const name = file.name.toLowerCase()
    if (name.endsWith('.csv')) {
      const text = await file.text()
      const workbook = XLSX.read(text, { type: 'string' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
    }
    const arrayBuffer = await file.arrayBuffer()
    const workbook = XLSX.read(arrayBuffer, { type: 'array' })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
  }

  const handleLeadEnrichmentFilesChange = async (files: File[]) => {
    setLeadEnrichmentError(null)
    setLeadEnrichmentResult(null)
    setLeadEnrichmentFiles(files)
    if (!files.length) {
      setLeadUploadRows([])
      setLeadUploadHeaders([])
      setLeadEmailField('')
      setLeadPhoneField('')
      return
    }

    try {
      const parsed = await parseLeadUploadFile(files[0])
      const headers = parsed.length ? Object.keys(parsed[0]) : []
      setLeadUploadRows(parsed)
      setLeadUploadHeaders(headers)
      setLeadEmailField(detectUploadField(headers, 'email'))
      setLeadPhoneField(detectUploadField(headers, 'phone'))
    } catch (error) {
      setLeadEnrichmentError(error instanceof Error ? error.message : 'Could not parse uploaded file')
    }
  }

  const exportEnrichedRows = (type: 'csv' | 'xls') => {
    const rows = leadEnrichmentResult?.enrichedRows || []
    if (!rows.length) return
    const worksheet = XLSX.utils.json_to_sheet(rows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Enriched')
    const wbout = XLSX.write(workbook, { bookType: type === 'csv' ? 'csv' : 'xls', type: 'array' })
    const mime = type === 'csv' ? 'text/csv;charset=utf-8;' : 'application/vnd.ms-excel;charset=utf-8;'
    const blob = new Blob([wbout], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `enriched-leads-${Date.now()}.${type}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const runLeadEnrichmentUpload = async () => {
    if (!leadUploadRows.length) {
      setLeadEnrichmentError('Upload a CSV/XLS file first.')
      return null
    }
    if (!leadEmailField && !leadPhoneField) {
      setLeadEnrichmentError('Map at least one field: email or phone.')
      return null
    }

    setLeadEnrichmentLoading(true)
    setLeadEnrichmentError(null)
    try {
      const response = await fetch('/api/leads-db/enrich-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: leadUploadRows.slice(0, 1000),
          emailField: leadEmailField,
          phoneField: leadPhoneField,
          useApollo: connectedLeadConnectors.apollo,
          userId: user?.id || '',
        }),
      })
      const data = (await response.json().catch(() => ({}))) as EnrichedUploadResponse
      if (!response.ok) {
        throw new Error(data?.error || 'Lead enrichment failed')
      }
      setLeadEnrichmentResult(data)
      addLog(`Lead enrichment completed: ${data.matched || 0}/${data.count || 0} matched.`)
      return data
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Lead enrichment failed'
      setLeadEnrichmentError(message)
      addLog(`Lead enrichment failed: ${message}`)
      return null
    } finally {
      setLeadEnrichmentLoading(false)
    }
  }

  const buildLeadStageData = (stageId: number) => {
    const sourceLabel = LEAD_SOURCE_LABELS[leadSource] || leadConnectorRecords.find((connector) => connector.id === leadSource)?.label || leadSource
    switch (stageId) {
      case 1:
        return {
          goal: leadGoalLabel,
          icpDefinition: buildLeadsDbFilterPayload(),
          messagingAngles: [
            'Anchor outreach around a narrow operational pain point',
            'Prioritize fast path-to-value messaging over feature depth',
            'Keep CTA optimized for qualification, not education',
          ],
          exclusions: [
            'Very small teams without an active GTM owner',
            'Accounts outside the selected geography',
            'Roles below the buyer authority threshold',
          ],
        }
      case 2:
        return {
          sourcePlan: {
            primarySource: sourceLabel,
            intentThreshold: leadIntentLevel,
          },
          leadsDb: leadSource === 'leads-db'
            ? {
                connected: !leadsDbError,
                metadata: leadsDbMetadata,
                error: leadsDbError,
              }
            : null,
          requiredConnectors: LEAD_STAGE_CONNECTORS[stageId].map((connectorId) => {
            const connector = leadConnectorRecords.find((item) => item.id === connectorId)
            return {
              id: connectorId,
              label: connector?.label || connectorId,
              connected: Boolean(connector?.connected),
            }
          }),
        }
      case 3:
        return {
          discoveryLogic: {
            accountFilters: [leadDbCountry, ...(leadDbIndustries.length ? leadDbIndustries : ['all-industries']), ...(leadDbSeniorities.length ? leadDbSeniorities : ['all-seniorities'])],
            persona: leadDbSeniorities[0] || 'any',
            sourcePriority: [sourceLabel, 'LinkedIn cross-check'],
          },
          leadsDbFilters: leadSource === 'leads-db' ? buildLeadsDbFilterPayload() : null,
          leadsDbPreview: leadSource === 'leads-db'
            ? {
                count: leadDbQueryResult?.count ?? 0,
                tableUsed: leadDbQueryResult?.table_used || 'n/a',
              }
            : null,
          nextAction: 'Pull accounts first, then expand to contacts after account fit is confirmed.',
        }
      case 4:
        return {
          enrichmentPlan: {
            requiredFields: ['company domain', 'employee band', 'title', 'seniority', 'location'],
            secondaryFields: ['tech stack', 'recent hiring', 'CRM ownership'],
          },
          uploadEnrichment: leadGoal === 'lead-enrichment'
            ? {
                uploadedRows: leadUploadRows.length,
                mappedEmailField: leadEmailField || null,
                mappedPhoneField: leadPhoneField || null,
                matchedRows: leadEnrichmentResult?.matched ?? 0,
                totalRows: leadEnrichmentResult?.count ?? 0,
                apolloEnabled: connectedLeadConnectors.apollo,
              }
            : null,
          qaRule: 'Discard incomplete records before they reach scoring.',
        }
      case 5:
        return {
          scoringModel: {
            fitWeight: 60,
            timingWeight: 25,
            dataQualityWeight: 15,
          },
          scoreBands: [
            'A: strong ICP fit and ready for outreach',
            'B: qualified but needs enrichment or trigger confirmation',
            'C: nurture or hold for later review',
          ],
        }
      case 6:
        return {
          outreachPlan: {
            channelMix: leadOutreachChannel,
            connectorCoverage: leadConnectorRecords
              .filter((connector) => connector.connected)
              .map((connector) => connector.label),
          },
          handoff: 'Qualified leads should enter sequence creation or SDR review next.',
        }
      default:
        return { module: 'Lead Intelligence', goal: leadGoal }
    }
  }

  const executeLeadStage = async (stageId: number) => {
    setExecutingStage(stageId)
    const stageName = stages.find((stage) => stage.id === stageId)?.name || `Stage ${stageId}`
    addLog(`Starting ${stageName}...`)
    setStageStatusLocal(stageId, 'running', LEAD_STAGE_MESSAGES[stageId]?.running || 'Running lead intelligence stage')

    try {
      await new Promise((resolve) => setTimeout(resolve, 700))
      if (leadSource === 'leads-db' && stageId === 3) {
        await runLeadsDbQuery()
      }
      if (leadGoal === 'lead-enrichment' && stageId === 4) {
        const enrichmentResult = await runLeadEnrichmentUpload()
        if (!enrichmentResult) {
          throw new Error('Lead enrichment requires a valid upload with mapped email/phone columns.')
        }
      }
      const data = buildLeadStageData(stageId)
      setStageData((prev) => ({
        ...prev,
        [stageId]: {
          data,
          summary: {
            module: 'Lead Intelligence',
            goal: leadGoalLabel,
          },
        },
      }))
      setStageStatusLocal(stageId, 'completed', LEAD_STAGE_MESSAGES[stageId]?.completed || 'Stage completed')
      addLog(`${stageName} completed.`)
    } catch (error) {
      setStageStatusLocal(stageId, 'error', 'Lead intelligence stage failed')
      addLog(`${stageName} failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setExecutingStage(null)
    }
  }

  const updateStage = async (stageId: number, status: WorkflowStage['status'], message: string) => {
    setStageStatusLocal(stageId, status, message)

    if (activeModule === 'content-engine' && status === 'completed') {
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
    if (activeModule === 'lead-intelligence') {
      await executeLeadStage(stageId)
      return
    }

    setExecutingStage(stageId)
    /** Only filters noisy server SSE `data.log` lines during blog Stage 2 — not client prep/start lines. */
    const quietStage2BlogLogs = stageId === 2 && campaignType === 'blog'
    addLog(`Starting Stage ${stageId} execution...`)
    let terminalStatus: WorkflowStage['status'] | null = null

    try {
      const latestStage2Entry = stageId === 2 && stageData[2]?.data
        ? Object.values(stageData[2].data as Record<string, any>).sort((a: any, b: any) => {
            const timeA = new Date(a?.completedAt || a?.createdAt || 0).getTime()
            const timeB = new Date(b?.completedAt || b?.createdAt || 0).getTime()
            return timeB - timeA
          })[0]
        : null
      const stage2UserPrompt = stageId === 2 ? String(latestStage2Entry?.userPrompt || '').trim() : ''
      const isStage2Refinement = stageId === 2 && stage2UserPrompt.length > 0
      const stage2SeedArticle = isStage2Refinement ? String(latestStage2Entry?.articleText || '').trim() : ''
      const stage2GenerationSeed = isStage2Refinement && Number.isInteger(Number(latestStage2Entry?.generationSeed))
        ? Number(latestStage2Entry?.generationSeed)
        : null
      const stage2SeedHeadline = isStage2Refinement ? String(latestStage2Entry?.headline || '').trim() : ''
      const stage2SeedSummary = isStage2Refinement ? String(latestStage2Entry?.summary || '').trim() : ''
      const stage2SeedSeo = isStage2Refinement && latestStage2Entry?.seo && typeof latestStage2Entry.seo === 'object'
        ? latestStage2Entry.seo
        : null
      const stage2SeedFaqSchema = isStage2Refinement && latestStage2Entry?.faqSchema && typeof latestStage2Entry.faqSchema === 'object'
        ? latestStage2Entry.faqSchema
        : null

      // Prepare file data
      addLog('Preparing reference materials...')
      const fileData = await prepareFilesForAPI(stageId)
      addLog(`Reference materials ready (Stage ${stageId}). Connecting to workflow…`)

      // Stage 4 runs via async job queue to avoid long-lived HTTP request timeouts.
      if (stageId === 4) {
        const enqueueResponse = await fetch('/api/video-jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            stageId,
            campaignType,
            purpose,
            platforms: selectedPlatforms,
            topic,
            duration,
            aspectRatio,
            contentType,
            useVeo,
            useAvatar,
            targetAudience,
            language,
            campaignData,
            files: fileData,
            avatarId,
            avatarScriptText,
            avatarVoiceId,
            brandSettings: {
              useBrandGuidelines,
              logoPlacement: useBrandGuidelines ? 'top-right' : null,
              logoUrl: useBrandGuidelines ? '/torqq-logo.svg' : null,
              customColors: useBrandGuidelines ? null : customColors,
              accentColors: useBrandGuidelines ? null : accentColors,
              bodyTextColor: useBrandGuidelines ? null : bodyTextColor,
              font: useBrandGuidelines ? null : customFont,
              fontSize: useBrandGuidelines ? null : customFontSize,
              fontWeight: useBrandGuidelines ? null : customFontWeight,
              gradientStartColor: useBrandGuidelines ? null : gradientStartColor,
              gradientEndColor: useBrandGuidelines ? null : gradientEndColor,
              gradientDirection: useBrandGuidelines ? null : gradientDirection,
              customTone: useBrandGuidelines ? null : customTone,
              customInstructions: useBrandGuidelines ? null : customInstructions
            }
          }),
        })

        if (!enqueueResponse.ok) {
          throw new Error(`Failed to enqueue video job (${enqueueResponse.status})`)
        }

        const enqueueData = await enqueueResponse.json()
        const jobId = String(enqueueData?.jobId || '').trim()
        if (!jobId) throw new Error('Video job ID was not returned')

        await updateStage(stageId, 'running', 'Video job queued')
        addLog(`Stage 4 job queued: ${jobId}`)

        const pollStartedAt = Date.now()
        const maxPollMs = 35 * 60 * 1000 // 35 minutes safety timeout
        let lastLogCount = 0

        while (Date.now() - pollStartedAt < maxPollMs) {
          await new Promise((resolve) => setTimeout(resolve, 5000))
          const statusResponse = await fetch(`/api/video-jobs/${jobId}`, { cache: 'no-store' })
          if (!statusResponse.ok) {
            addLog(`Stage 4 job status check failed: ${statusResponse.status}`)
            continue
          }

          const statusData = await statusResponse.json()
          const job = statusData?.job
          const jobStatus = String(job?.status || '').toLowerCase()
          const jobLogs = Array.isArray(job?.logs) ? job.logs : []
          if (jobLogs.length > lastLogCount) {
            jobLogs.slice(lastLogCount).forEach((line: string) => addLog(line))
            lastLogCount = jobLogs.length
          }

          if (jobStatus === 'completed') {
            await updateStage(stageId, 'completed', 'video completed')
            terminalStatus = 'completed'
            addLog(`Stage 4 completed! (job: ${jobId})`)
            break
          }

          if (jobStatus === 'error') {
            await updateStage(stageId, 'error', job?.error || 'video job failed')
            terminalStatus = 'error'
            addLog(`Stage 4 failed: ${job?.error || 'video job failed'}`)
            break
          }
        }

        if (!terminalStatus) {
          await updateStage(stageId, 'error', 'video job timed out')
          terminalStatus = 'error'
          addLog(`Stage 4 failed: video job timed out (${jobId})`)
        }

        return
      }

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
          aspectRatio,
          contentType,
          useVeo,
          useAvatar,
          autoPublish,
          targetAudience,
          language,
          campaignData,
          userPrompt: isStage2Refinement ? stage2UserPrompt : null,
          seedArticleText: isStage2Refinement ? (stage2SeedArticle || null) : null,
          generationSeed: isStage2Refinement ? stage2GenerationSeed : null,
          seedHeadline: isStage2Refinement ? (stage2SeedHeadline || null) : null,
          seedSummary: isStage2Refinement ? (stage2SeedSummary || null) : null,
          seedSeo: isStage2Refinement ? stage2SeedSeo : null,
          seedFaqSchema: isStage2Refinement ? stage2SeedFaqSchema : null,
          files: fileData,
          avatarId,
          avatarScriptText,
          avatarVoiceId,
          brandSettings: {
            useBrandGuidelines,
            logoPlacement: useBrandGuidelines ? 'top-right' : null,
            logoUrl: useBrandGuidelines ? '/torqq-logo.svg' : null,
            customColors: useBrandGuidelines ? null : customColors,
            accentColors: useBrandGuidelines ? null : accentColors,
            bodyTextColor: useBrandGuidelines ? null : bodyTextColor,
            font: useBrandGuidelines ? null : customFont,
            fontSize: useBrandGuidelines ? null : customFontSize,
            fontWeight: useBrandGuidelines ? null : customFontWeight,
            gradientStartColor: useBrandGuidelines ? null : gradientStartColor,
            gradientEndColor: useBrandGuidelines ? null : gradientEndColor,
            gradientDirection: useBrandGuidelines ? null : gradientDirection,
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
        let sseBuffer = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) {
            if (sseBuffer.trim()) {
              const finalLine = sseBuffer.trim()
              if (finalLine.startsWith('data: ')) {
                try {
                  const data = JSON.parse(finalLine.slice(6))
                  if (data.stage) {
                    await updateStage(data.stage, data.status, data.message)
                    if (!(quietStage2BlogLogs && data.status === 'running')) {
                      addLog(`Stage ${data.stage}: ${data.message}`)
                    }
                    if (data.stage === stageId && (data.status === 'completed' || data.status === 'error')) {
                      terminalStatus = data.status
                    }
                  } else if (data.log) {
                    if (quietStage2BlogLogs) {
                      if (String(data.log).startsWith('✅ Blog article generated')) {
                        addLog(data.log)
                      }
                    } else {
                      addLog(data.log)
                    }
                  } else if (data.campaignData) {
                    setCampaignData(prev => ({ ...prev, ...data.campaignData }))
                  }
                } catch (e) {
                  console.error('Parse error:', e)
                }
              }
            }
            break
          }

          const chunk = decoder.decode(value, { stream: true })
          sseBuffer += chunk
          const lines = sseBuffer.split('\n\n')
          sseBuffer = lines.pop() || ''

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6))

                if (data.stage) {
                  await updateStage(data.stage, data.status, data.message)
                  if (!(quietStage2BlogLogs && data.status === 'running')) {
                    addLog(`Stage ${data.stage}: ${data.message}`)
                  }
                  if (data.stage === stageId && (data.status === 'completed' || data.status === 'error')) {
                    terminalStatus = data.status
                  }
                } else if (data.log) {
                  if (quietStage2BlogLogs) {
                    if (String(data.log).startsWith('✅ Blog article generated')) {
                      addLog(data.log)
                    }
                  } else {
                    addLog(data.log)
                  }
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

      if (terminalStatus === 'completed') {
        addLog(`Stage ${stageId} completed!`)
      } else if (terminalStatus === 'error') {
        addLog(`Stage ${stageId} failed`)
      } else {
        addLog(`Stage ${stageId} ended without terminal status`)
      }
    } catch (error) {
      addLog(`Error in Stage ${stageId}: ${error instanceof Error ? error.message : 'Unknown error'}`)
      console.error('Stage error:', error)
    } finally {
      setExecutingStage(null)
    }
  }

  const executeWorkflow = async () => {
    if (activeModule === 'lead-intelligence') {
      setIsRunning(true)
      setLogs([])
      setStageData({})
      setCampaignData({})
      setStages(LEAD_GENERATION_STAGES())

      try {
        addLog('Starting Lead Intelligence workflow...')
        for (const stage of LEAD_GENERATION_STAGES()) {
          await executeLeadStage(stage.id)
        }
        addLog('Lead generation architecture run completed.')
      } finally {
        setIsRunning(false)
      }
      return
    }

    setIsRunning(true)
    setLogs([])
    setStageData({})
    setCampaignData({})
    setStages(CONTENT_ENGINE_STAGES())

    try {
      addLog('Starting full workflow execution...')

      // Prepare file data
      addLog('Preparing reference materials...')
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
          contentType,
          useVeo,
          useAvatar,
          autoPublish,
          targetAudience,
          language,
          aspectRatio,
          files: fileData,
          avatarId,
          avatarScriptText,
          avatarVoiceId,
          brandSettings: {
            useBrandGuidelines,
            logoPlacement: useBrandGuidelines ? 'top-right' : null,
            logoUrl: useBrandGuidelines ? '/torqq-logo.svg' : null,
            customColors: useBrandGuidelines ? null : customColors,
            accentColors: useBrandGuidelines ? null : accentColors,
            bodyTextColor: useBrandGuidelines ? null : bodyTextColor,
            font: useBrandGuidelines ? null : customFont,
            fontSize: useBrandGuidelines ? null : customFontSize,
            fontWeight: useBrandGuidelines ? null : customFontWeight,
            gradientStartColor: useBrandGuidelines ? null : gradientStartColor,
            gradientEndColor: useBrandGuidelines ? null : gradientEndColor,
            gradientDirection: useBrandGuidelines ? null : gradientDirection,
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
        let sseBuffer = ''
        let lastStreamStageId = 0
        const quietBlogStage2InStream = campaignType === 'blog'
        while (true) {
          const { done, value } = await reader.read()
          if (done) {
            if (sseBuffer.trim()) {
              const finalLine = sseBuffer.trim()
              if (finalLine.startsWith('data: ')) {
                try {
                  const data = JSON.parse(finalLine.slice(6))
                  if (data.stage) {
                    lastStreamStageId = data.stage
                    updateStage(data.stage, data.status, data.message)
                    if (
                      !(
                        quietBlogStage2InStream &&
                        data.stage === 2 &&
                        data.status === 'running'
                      )
                    ) {
                      addLog(`Stage ${data.stage}: ${data.message}`)
                    }
                  } else if (data.log) {
                    if (
                      quietBlogStage2InStream &&
                      lastStreamStageId === 2
                    ) {
                      if (String(data.log).startsWith('✅ Blog article generated')) {
                        addLog(data.log)
                      }
                    } else {
                      addLog(data.log)
                    }
                  } else if (data.campaignData) {
                    setCampaignData(prev => ({ ...prev, ...data.campaignData }))
                  }
                } catch (e) {
                  console.error('Parse error:', e)
                }
              }
            }
            break
          }

          const chunk = decoder.decode(value, { stream: true })
          sseBuffer += chunk
          const lines = sseBuffer.split('\n\n')
          sseBuffer = lines.pop() || ''

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6))

                if (data.stage) {
                  lastStreamStageId = data.stage
                  updateStage(data.stage, data.status, data.message)
                  if (
                    !(
                      quietBlogStage2InStream &&
                      data.stage === 2 &&
                      data.status === 'running'
                    )
                  ) {
                    addLog(`Stage ${data.stage}: ${data.message}`)
                  }
                } else if (data.log) {
                  if (
                    quietBlogStage2InStream &&
                    lastStreamStageId === 2
                  ) {
                    if (String(data.log).startsWith('✅ Blog article generated')) {
                      addLog(data.log)
                    }
                  } else {
                    addLog(data.log)
                  }
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

      addLog('Workflow completed successfully!')
    } catch (error) {
      addLog(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
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

  const generateTopic = async () => {
    if (isGeneratingTopic) return

    try {
      setIsGeneratingTopic(true)
      setTopicError(null)
      addLog(
        campaignType === 'live-news'
          ? 'Generating live-news campaign topic with web search...'
          : campaignType === 'blog'
            ? 'Generating blog topic...'
            : 'Generating campaign topic...'
      )

      const seedKeyword = topic.trim() || undefined
      console.log('[Topic Generate] campaignType:', campaignType, '| seedTheme sent:', seedKeyword ?? '(none)')

      const response = await fetch('/api/topic/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignType,
          purpose,
          targetAudience,
          platforms: selectedPlatforms,
          language,
          seedTheme: seedKeyword || undefined
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(errorText || 'Failed to generate topic')
      }

      const data = await response.json()
      if (data.topic) {
        setTopic(data.topic)
        addLog(`Topic generated (${data.model || 'Gemini'}): ${data.topic}`)
      } else {
        throw new Error('No topic returned from generator')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      setTopicError(message)
      addLog(`Topic generation failed: ${message}`)
    } finally {
      setIsGeneratingTopic(false)
    }
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

  const SERVER_UPLOAD_MAX_BYTES = 50 * 1024 * 1024

  const uploadResearchPdfDirectToR2 = async (file: File): Promise<{ fileId: string; bucket: string; name: string; size: number }> => {
    const signResp = await fetch('/api/files/upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: file.name,
        size: file.size,
        contentType: file.type || 'application/pdf'
      })
    })

    if (!signResp.ok) {
      const errText = await signResp.text()
      throw new Error(errText || `Failed to initialize direct upload for ${file.name}`)
    }

    const signData = await signResp.json() as {
      uploadUrl: string
      fileId: string
      bucket: string
    }

    const putResp = await fetch(signData.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'application/pdf' },
      body: file
    })

    if (!putResp.ok) {
      const errText = await putResp.text()
      throw new Error(errText || `Direct upload failed for ${file.name}`)
    }

    return {
      fileId: signData.fileId,
      bucket: signData.bucket,
      name: file.name,
      size: file.size
    }
  }

  const uploadResearchPdfViaServer = async (file: File): Promise<{ fileId: string; bucket: string; name: string; size: number }> => {
    const form = new FormData()
    form.append('file', file)
    const uploadResp = await fetch('/api/files/upload', {
      method: 'POST',
      body: form
    })

    if (!uploadResp.ok) {
      const errText = await uploadResp.text()
      throw new Error(errText || `Failed to upload PDF: ${file.name}`)
    }

    return await uploadResp.json()
  }

  const prepareFilesForAPI = async (stageId?: number) => {
    const fileData: {
      researchPdfRefs?: Array<{ fileId: string; bucket: string; name: string; size: number }>
      researchPDFs?: Array<{ name: string; data: string; size: number }>
      referenceImages?: Array<{ name: string; data: string; size: number }>
      referenceVideo?: { name: string; data: string; size: number }
      firstFrameImage?: { name: string; data: string; size: number }
      lastFrameImage?: { name: string; data: string; size: number }
      longCatReferenceImage?: { name: string; data: string; size: number }
    } = {}

    const includeResearchPDFs = stageId === undefined || stageId === 2

    // Upload PDFs first and pass only references to Stage 2 payload
    if (includeResearchPDFs && researchPDFs.length > 0) {
      addLog(`Uploading ${researchPDFs.length} PDF(s) to R2...`)
      fileData.researchPdfRefs = await Promise.all(
        researchPDFs.map(async (file) => {
          try {
            return await uploadResearchPdfDirectToR2(file)
          } catch (error) {
            // Fallback path keeps smaller uploads working when bucket CORS is not configured yet.
            if (file.size <= SERVER_UPLOAD_MAX_BYTES) {
              addLog(`Direct upload failed for ${file.name}; retrying server upload fallback...`)
              return await uploadResearchPdfViaServer(file)
            }
            throw error
          }
        })
      )
      addLog('PDF upload completed')
    } else if (includeResearchPDFs) {
      addLog('No reference PDFs — skipping upload.')
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
      addLog(`Prompt updated for Stage ${promptStage}`)
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

  // Stage data modal handlers
  const handleViewData = (stageId: number, stageName: string) => {
    if (stageData[stageId]?.data) {
      // Extract all data entries and sort by completedAt to get the most recent
      const dataEntries = Object.entries(stageData[stageId].data)
      if (dataEntries.length > 0) {
        // Sort by completedAt timestamp (most recent first)
        const sortedEntries = dataEntries.sort((a: any, b: any) => {
          const timeA = new Date(a[1].completedAt || a[1].createdAt || 0).getTime()
          const timeB = new Date(b[1].completedAt || b[1].createdAt || 0).getTime()
          return timeB - timeA // Descending order (newest first)
        })

        const [dataId, data] = sortedEntries[0]
        setSelectedStageData({ stageId, stageName, data, dataId })
        setShowDataModal(true)
      }
    }
  }

  const handleSaveStageData = async (stageId: number, editedData: any) => {
    if (!selectedStageData) return

    const response = await fetch('/api/workflow/data/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stageId,
        dataId: selectedStageData.dataId,
        editedData
      })
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to save data')
    }

    // Refresh stage data
    const dataResponse = await fetch(`/api/workflow/data?stage=${stageId}`)
    if (dataResponse.ok) {
      const data = await dataResponse.json()
      setStageData(prev => ({ ...prev, [stageId]: data }))
    }

    addLog(`Stage ${stageId} data updated successfully`)
  }

  const handleCloseModal = () => {
    setShowDataModal(false)
    setSelectedStageData(null)
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
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-20 w-28 items-center justify-center rounded-2xl bg-slate-50 ring-1 ring-slate-200">
                <Image
                  src="/torqq-logo.svg"
                  alt="Torqq logo"
                  width={112}
                  height={74}
                  className="h-auto w-24"
                  priority
                />
              </div>
              <div>
                <h1 className="text-4xl font-bold text-gray-800 mb-2">
                  {activeModuleTitle}
                </h1>
                <p className="text-gray-600 text-lg">
                  {activeModuleSubtitle}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 self-start md:self-center">
              <div className="text-right">
                <p className="text-sm font-medium text-slate-900">
                  {user?.name || user?.email}
                </p>
                {user?.email ? (
                  <p className="text-xs text-slate-500">{user.email}</p>
                ) : null}
              </div>
              <button
                onClick={() => void logout()}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                Sign out
              </button>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-4">
            <div className={`px-4 py-2 rounded-lg ${activeModule === 'content-engine' ? 'bg-blue-50' : 'bg-emerald-50'}`}>
              <span className="text-sm text-gray-600">
                {activeModule === 'content-engine' ? 'Video Production:' : 'Connectors:'}
              </span>
              <span className={`ml-2 font-semibold ${activeModule === 'content-engine' ? 'text-blue-600' : 'text-emerald-600'}`}>
                {activeModule === 'content-engine' ? 'AI-Powered' : 'Composio-ready'}
              </span>
            </div>
            <div className="px-4 py-2 bg-green-50 rounded-lg">
              <span className="text-sm text-gray-600">
                {activeModule === 'content-engine' ? 'Platforms:' : 'Sources:'}
              </span>
              <span className="ml-2 font-semibold text-green-600">
                {activeModule === 'content-engine' ? '7 Social Channels' : 'Leads DB + Composio'}
              </span>
            </div>
            <div className="px-4 py-2 bg-purple-50 rounded-lg">
              <span className="text-sm text-gray-600">Goal:</span>
              <span className="ml-2 font-semibold text-purple-600">{activeGoalLabel}</span>
            </div>
          </div>
        </div>

        {/* Main Control Panel */}
        <div className="bg-white rounded-lg shadow-lg p-8 mb-8">
          <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <h2 className="text-2xl font-semibold text-gray-800">
              Campaign Configuration
            </h2>
            <div className="w-full md:w-72">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Module
              </label>
              <select
                value={activeModule}
                onChange={(e) => setActiveModule(e.target.value as ModuleKind)}
                disabled={isRunning || executingStage !== null}
                className="w-full rounded-xl border-2 border-gray-300 bg-gradient-to-r from-slate-50 to-white px-4 py-2.5 text-sm font-medium text-gray-800 shadow-sm transition-all focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:bg-gray-100"
              >
                <option value="content-engine">Content Engine</option>
                <option value="lead-intelligence">Lead Intelligence</option>
              </select>
            </div>
          </div>

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
                <div>{activeModule === 'content-engine' ? 'Full Campaign' : 'Full Workflow'}</div>
                <p className="text-xs mt-1 opacity-80">Execute all {stageCount} stages automatically</p>
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
                <div>Stage-by-Stage</div>
                <p className="text-xs mt-1 opacity-80">Review and approve each stage</p>
              </button>
            </div>
          </div>

          {activeModule === 'lead-intelligence' && (
            <>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Goal:</label>
                  <select value={leadGoal} onChange={(e) => setLeadGoal(e.target.value as 'lead-generation' | 'lead-enrichment' | 'lead-scoring' | 'lead-qualification-outreach')} disabled={isRunning || executingStage !== null} className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-emerald-500 focus:outline-none text-sm text-gray-800 disabled:bg-gray-100">
                    {leadGoalOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">ICP Preset:</label>
                  <select value={leadIcpPreset} onChange={(e) => { setLeadIcpPreset(e.target.value); applyLeadsDbPreset(e.target.value) }} disabled={isRunning || executingStage !== null} className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-emerald-500 focus:outline-none text-sm text-gray-800 disabled:bg-gray-100">
                    {LEADS_DB_FILTER_PRESETS.map((preset) => (
                      <option key={preset.value} value={preset.value}>{preset.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Country:</label>
                  <select value={leadDbCountry} onChange={(e) => setLeadDbCountry(e.target.value as 'IN' | 'US')} disabled={isRunning || executingStage !== null} className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-emerald-500 focus:outline-none text-sm text-gray-800 disabled:bg-gray-100">
                    <option value="IN">India (IN)</option>
                    <option value="US">United States (US)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Channel:</label>
                  <select value={leadDbChannel} onChange={(e) => setLeadDbChannel(e.target.value as 'any' | 'phone' | 'whatsapp' | 'email' | 'linkedin')} disabled={isRunning || executingStage !== null} className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-emerald-500 focus:outline-none text-sm text-gray-800 disabled:bg-gray-100">
                    <option value="any">Any</option>
                    <option value="phone">Phone</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="email">Email</option>
                    <option value="linkedin">LinkedIn</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Industry:</label>
                  <select
                    value={leadDbIndustries[0] || 'any'}
                    onChange={(e) => setLeadDbIndustries(e.target.value === 'any' ? [] : [e.target.value])}
                    disabled={isRunning || executingStage !== null}
                    className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-emerald-500 focus:outline-none text-sm text-gray-800 disabled:bg-gray-100"
                  >
                    <option value="any">Any</option>
                    {(leadsDbMetadata?.valid_industries || LEADS_DB_DEFAULT_INDUSTRIES).map((industry) => (
                      <option key={industry} value={industry}>{industry}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Seniority:</label>
                  <select
                    value={leadDbSeniorities[0] || 'any'}
                    onChange={(e) => setLeadDbSeniorities(e.target.value === 'any' ? [] : [e.target.value])}
                    disabled={isRunning || executingStage !== null}
                    className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-emerald-500 focus:outline-none text-sm text-gray-800 disabled:bg-gray-100"
                  >
                    <option value="any">Any</option>
                    {(leadsDbMetadata?.valid_seniorities || LEADS_DB_DEFAULT_SENIORITIES).map((seniority) => (
                      <option key={seniority} value={seniority}>{seniority}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Has Phone:</label>
                  <select value={leadDbHasPhone === null ? 'any' : leadDbHasPhone ? 'yes' : 'no'} onChange={(e) => setLeadDbHasPhone(e.target.value === 'any' ? null : e.target.value === 'yes')} disabled={isRunning || executingStage !== null} className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-emerald-500 focus:outline-none text-sm text-gray-800 disabled:bg-gray-100">
                    <option value="any">Any</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Has Email:</label>
                  <select value={leadDbHasEmail === null ? 'any' : leadDbHasEmail ? 'yes' : 'no'} onChange={(e) => setLeadDbHasEmail(e.target.value === 'any' ? null : e.target.value === 'yes')} disabled={isRunning || executingStage !== null} className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-emerald-500 focus:outline-none text-sm text-gray-800 disabled:bg-gray-100">
                    <option value="any">Any</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Has LinkedIn:</label>
                  <select value={leadDbHasLinkedin === null ? 'any' : leadDbHasLinkedin ? 'yes' : 'no'} onChange={(e) => setLeadDbHasLinkedin(e.target.value === 'any' ? null : e.target.value === 'yes')} disabled={isRunning || executingStage !== null} className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-emerald-500 focus:outline-none text-sm text-gray-800 disabled:bg-gray-100">
                    <option value="any">Any</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Match Mode:</label>
                  <select value={leadDbMatchMode} onChange={(e) => setLeadDbMatchMode(e.target.value as 'strict' | 'broad')} disabled={isRunning || executingStage !== null} className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-emerald-500 focus:outline-none text-sm text-gray-800 disabled:bg-gray-100">
                    <option value="strict">Strict</option>
                    <option value="broad">Broad</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Limit:</label>
                  <input type="number" min={1} max={1000} value={leadDbLimit} onChange={(e) => setLeadDbLimit(Number(e.target.value) || 25)} disabled={isRunning || executingStage !== null} className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-emerald-500 focus:outline-none text-sm text-gray-800 disabled:bg-gray-100" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Outreach Channel:</label>
                  <select value={leadOutreachChannel} onChange={(e) => setLeadOutreachChannel(e.target.value)} disabled={isRunning || executingStage !== null} className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-emerald-500 focus:outline-none text-sm text-gray-800 disabled:bg-gray-100">
                    <option value="email-linkedin">Email + LinkedIn</option>
                    <option value="email-only">Email only</option>
                    <option value="linkedin-only">LinkedIn only</option>
                    <option value="whatsapp-assisted">WhatsApp assisted</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Designation Keywords (comma separated):</label>
                  <input value={leadDbDesignationKeywords} onChange={(e) => setLeadDbDesignationKeywords(e.target.value)} disabled={isRunning || executingStage !== null} className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-emerald-500 focus:outline-none text-sm text-gray-800 disabled:bg-gray-100" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Cities (comma separated):</label>
                  <input value={leadDbCities} onChange={(e) => setLeadDbCities(e.target.value)} disabled={isRunning || executingStage !== null} className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-emerald-500 focus:outline-none text-sm text-gray-800 disabled:bg-gray-100" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">States (comma separated):</label>
                  <input value={leadDbStates} onChange={(e) => setLeadDbStates(e.target.value)} disabled={isRunning || executingStage !== null} className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-emerald-500 focus:outline-none text-sm text-gray-800 disabled:bg-gray-100" />
                </div>
              </div>

              <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-700">Connector Architecture</h3>
                    <p className="mt-1 text-sm text-gray-600">Stage-aware Composio connectors with popup auth and live status refresh.</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-sm font-medium text-emerald-700">
                      {integrationsLoading
                        ? 'Syncing...'
                        : `${leadConnectorRecords.filter((connector) => connector.connected).length}/${leadConnectorRecords.length} connected`}
                    </div>
                    <button
                      type="button"
                      onClick={() => setConnectorPanelOpen((prev) => !prev)}
                      aria-label={connectorPanelOpen ? 'Hide connector architecture' : 'Show connector architecture'}
                      className="rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-sm font-semibold text-emerald-700 transition-colors hover:border-emerald-300"
                    >
                      {connectorPanelOpen ? '▲' : '▼'}
                    </button>
                  </div>
                </div>
                {connectorPanelOpen && (
                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {leadConnectorRecords.map((connector) => {
                      const isBusy = connectorActionId === connector.id
                      return (
                        <div
                          key={connector.id}
                          className={`rounded-xl border px-4 py-3 transition-all ${
                            connector.connected
                              ? 'border-emerald-300 bg-white shadow-sm'
                              : 'border-emerald-100 bg-white/80 hover:border-emerald-300 hover:bg-white'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="font-medium text-gray-800">{connector.label}</div>
                              <p className="mt-2 text-xs text-gray-600">{connector.description}</p>
                            </div>
                            <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                              connector.connected ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                            }`}>
                              {connector.connected ? 'Connected' : 'Not connected'}
                            </span>
                          </div>
                          <div className="mt-4 flex items-center justify-between gap-3">
                            <span className="text-[11px] uppercase tracking-[0.14em] text-gray-500">
                              {connector.category}
                            </span>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleLeadConnectorAction(connector.id)}
                                disabled={isBusy || integrationsLoading}
                                className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {isBusy ? 'Opening...' : connector.connected ? 'Reconnect' : 'Connect'}
                              </button>
                              {connector.connected && (
                                <button
                                  type="button"
                                  onClick={() => void disconnectLeadConnector(connector.id)}
                                  disabled={isBusy || integrationsLoading}
                                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:border-rose-200 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  Disconnect
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>


              {leadGoal === 'lead-enrichment' && (
                <div className="mb-6 rounded-2xl border border-purple-200 bg-purple-50/60 p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-purple-700">Stage 4: Upload Enrichment</h3>
                      <p className="mt-1 text-sm text-gray-600">
                        Upload a CSV/XLS(X), auto-map email/phone headers, enrich using Leads DB and Apollo (if connected), then export.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void runLeadEnrichmentUpload()}
                        disabled={leadEnrichmentLoading || isRunning || executingStage !== null}
                        className="rounded-lg bg-purple-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {leadEnrichmentLoading ? 'Enriching...' : 'Run Enrichment'}
                      </button>
                      <button
                        type="button"
                        onClick={() => exportEnrichedRows('csv')}
                        disabled={!leadEnrichmentResult?.enrichedRows?.length}
                        className="rounded-lg border border-purple-200 bg-white px-3 py-2 text-xs font-semibold text-purple-700 disabled:opacity-50"
                      >
                        Export CSV
                      </button>
                      <button
                        type="button"
                        onClick={() => exportEnrichedRows('xls')}
                        disabled={!leadEnrichmentResult?.enrichedRows?.length}
                        className="rounded-lg border border-purple-200 bg-white px-3 py-2 text-xs font-semibold text-purple-700 disabled:opacity-50"
                      >
                        Export XLS
                      </button>
                    </div>
                  </div>

                  <FileUpload
                    fileType="pdf"
                    label="Lead Upload File (CSV/XLS/XLSX)"
                    description="Only first sheet/file is used. Max 1,000 rows are enriched per run."
                    accept=".csv,.xls,.xlsx"
                    onFilesChange={(files) => void handleLeadEnrichmentFilesChange(files)}
                    maxFiles={1}
                    multiple={false}
                    maxSizeMB={25}
                    disabled={leadEnrichmentLoading || isRunning || executingStage !== null}
                    icon="📊"
                  />

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-gray-600">Email column mapping</label>
                      <select
                        value={leadEmailField}
                        onChange={(e) => setLeadEmailField(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800"
                      >
                        <option value="">Not mapped</option>
                        {leadUploadHeaders.map((header) => (
                          <option key={header} value={header}>{header}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-gray-600">Phone column mapping</label>
                      <select
                        value={leadPhoneField}
                        onChange={(e) => setLeadPhoneField(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800"
                      >
                        <option value="">Not mapped</option>
                        {leadUploadHeaders.map((header) => (
                          <option key={header} value={header}>{header}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="mt-3 rounded-lg border border-purple-200 bg-white p-3 text-sm">
                    <p className="text-xs text-gray-600">
                      Uploaded rows: <span className="font-semibold text-purple-700">{leadUploadRows.length.toLocaleString()}</span>
                      {' '}| Apollo enrichment: <span className="font-semibold text-purple-700">{connectedLeadConnectors.apollo ? 'Enabled' : 'Disabled (connect Apollo to enrich LinkedIn/email)'}</span>
                    </p>
                    {leadEnrichmentError && (
                      <p className="mt-2 text-xs font-medium text-rose-600">{leadEnrichmentError}</p>
                    )}
                    {leadEnrichmentResult && (
                      <p className="mt-2 text-xs font-semibold text-purple-700">
                        Enriched {leadEnrichmentResult.matched || 0} of {leadEnrichmentResult.count || 0} uploaded records.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {activeModule === 'content-engine' && (
            <div>
          {/* Campaign Configuration Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {/* Campaign Type Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Campaign Type:
              </label>
              <select
                value={campaignType}
                onChange={(e) => {
                  setCampaignType(e.target.value)
                  // Auto-set contentType to 'image' for infographic campaigns
                  if (e.target.value === 'infographic') {
                    setContentType('image')
                  }
                }}
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

          {/* Topic and Platform Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {/* Campaign Topic Input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Campaign Topic:
              </label>
              <div className="relative flex items-center">
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => {
                    setTopic(e.target.value)
                    if (topicError) {
                      setTopicError(null)
                    }
                  }}
                  disabled={isRunning || executingStage !== null}
                  placeholder="e.g., Client Success: ₹50L to ₹2Cr in 5 years"
                  className="w-full pr-[120px] px-4 py-2.5 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none text-sm text-gray-800 disabled:bg-gray-100 disabled:cursor-not-allowed"
                />
                <button
                  type="button"
                  onClick={generateTopic}
                  disabled={isGeneratingTopic}
                  className={`absolute right-2 whitespace-nowrap px-4 py-1.5 rounded-md text-sm font-semibold transition-all ${
                    isGeneratingTopic
                      ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                      : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm'
                  } ${isGeneratingTopic ? 'opacity-80 cursor-wait' : ''}`}
                >
                  {isGeneratingTopic ? 'Generating...' : 'Generate'}
                </button>
              </div>
              {topicError && (
                <p className="text-xs text-red-600 mt-2">
                  {topicError}
                </p>
              )}
            </div>

            {/* Platform Multi-Selector Dropdown */}
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Target Platforms:
              </label>
              <div
                onClick={() => setShowPlatformDropdown(!showPlatformDropdown)}
                className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 cursor-pointer bg-white text-sm text-gray-800 flex items-center justify-between"
              >
                <span>
                  {selectedPlatforms.length === 0
                    ? 'Select platforms...'
                    : `${selectedPlatforms.length} selected (${selectedPlatforms.join(', ')})`}
                </span>
                <svg
                  className={`w-4 h-4 transition-transform ${showPlatformDropdown ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>

              {showPlatformDropdown && (
                <div className="absolute z-10 w-full mt-1 bg-white border-2 border-gray-300 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                  {platforms.map(platform => (
                    <label
                      key={platform.value}
                      className="flex items-center px-4 py-2 hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedPlatforms.includes(platform.value)}
                        onChange={() => togglePlatform(platform.value)}
                        className="mr-3 w-4 h-4 text-blue-600 rounded"
                      />
                      <span className="text-sm text-gray-800">{platform.label}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Content Language Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Content Language:
            </label>
            <div className="max-w-xs">
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                disabled={isRunning || executingStage !== null}
                className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none text-sm text-gray-800 disabled:bg-gray-100 disabled:cursor-not-allowed"
              >
                {languages.map(lang => (
                  <option key={lang.value} value={lang.value}>
                    {lang.label} ({lang.native})
                  </option>
                ))}
              </select>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Content and videos will be created in the selected language
            </p>
          </div>

          {/* Output Format Type Selector */}
          <div className="mb-6 p-6 bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg border-2 border-purple-200">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">
              Output Format Type
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <button
                onClick={() => setContentType('image')}
                disabled={isRunning || executingStage !== null}
                className={`p-4 rounded-lg border-2 transition-all ${
                  contentType === 'image'
                    ? 'bg-blue-500 text-white border-blue-500 shadow-md'
                    : 'bg-white border-gray-300 text-gray-700 hover:border-blue-300'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <div className="text-lg font-semibold mb-1">Static Image</div>
                <p className="text-xs opacity-80">Generate single image</p>
              </button>

              <button
                onClick={() => {
                  setContentType('faceless-video')
                  setUseAvatar(false)
                  // Reset to video aspect ratio if current is image-only
                  if (aspectRatio === '1:1' || aspectRatio === '3:4') {
                    setAspectRatio('16:9')
                  }
                }}
                disabled={isRunning || executingStage !== null}
                className={`p-4 rounded-lg border-2 transition-all ${
                  contentType === 'faceless-video'
                    ? 'bg-purple-500 text-white border-purple-500 shadow-md'
                    : 'bg-white border-gray-300 text-gray-700 hover:border-purple-300'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <div className="text-lg font-semibold mb-1">Faceless Video</div>
                <p className="text-xs opacity-80">AI video generation</p>
              </button>

              <button
                onClick={() => {
                  setContentType('avatar-video')
                  setUseAvatar(true)
                  // Reset to video aspect ratio if current is image-only
                  if (aspectRatio === '1:1' || aspectRatio === '3:4') {
                    setAspectRatio('16:9')
                  }
                }}
                disabled={isRunning || executingStage !== null}
                className={`p-4 rounded-lg border-2 transition-all ${
                  contentType === 'avatar-video'
                    ? 'bg-green-500 text-white border-green-500 shadow-md'
                    : 'bg-white border-gray-300 text-gray-700 hover:border-green-300'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <div className="text-lg font-semibold mb-1">Avatar Video</div>
                <p className="text-xs opacity-80">AI Avatar</p>
              </button>
            </div>
          </div>

          {/* Aspect Ratio Selection */}
          <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Aspect Ratio
            </label>
            {contentType === 'image' ? (
              <div className="grid grid-cols-4 gap-3">
                <button
                  onClick={() => setAspectRatio('16:9')}
                  disabled={isRunning || executingStage !== null}
                  className={`p-3 rounded-lg border-2 transition-all ${
                    aspectRatio === '16:9'
                      ? 'bg-blue-500 text-white border-blue-500 shadow-md'
                      : 'bg-white border-gray-300 text-gray-700 hover:border-blue-300'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <div className="text-sm font-semibold mb-1">16:9</div>
                  <p className="text-xs opacity-80">Horizontal</p>
                </button>
                <button
                  onClick={() => setAspectRatio('9:16')}
                  disabled={isRunning || executingStage !== null}
                  className={`p-3 rounded-lg border-2 transition-all ${
                    aspectRatio === '9:16'
                      ? 'bg-blue-500 text-white border-blue-500 shadow-md'
                      : 'bg-white border-gray-300 text-gray-700 hover:border-blue-300'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <div className="text-sm font-semibold mb-1">9:16</div>
                  <p className="text-xs opacity-80">Vertical</p>
                </button>
                <button
                  onClick={() => setAspectRatio('1:1')}
                  disabled={isRunning || executingStage !== null}
                  className={`p-3 rounded-lg border-2 transition-all ${
                    aspectRatio === '1:1'
                      ? 'bg-blue-500 text-white border-blue-500 shadow-md'
                      : 'bg-white border-gray-300 text-gray-700 hover:border-blue-300'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <div className="text-sm font-semibold mb-1">1:1</div>
                  <p className="text-xs opacity-80">Square</p>
                </button>
                <button
                  onClick={() => setAspectRatio('3:4')}
                  disabled={isRunning || executingStage !== null}
                  className={`p-3 rounded-lg border-2 transition-all ${
                    aspectRatio === '3:4'
                      ? 'bg-blue-500 text-white border-blue-500 shadow-md'
                      : 'bg-white border-gray-300 text-gray-700 hover:border-blue-300'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <div className="text-sm font-semibold mb-1">3:4</div>
                  <p className="text-xs opacity-80">Portrait</p>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setAspectRatio('16:9')}
                  disabled={isRunning || executingStage !== null}
                  className={`p-3 rounded-lg border-2 transition-all ${
                    aspectRatio === '16:9'
                      ? 'bg-blue-500 text-white border-blue-500 shadow-md'
                      : 'bg-white border-gray-300 text-gray-700 hover:border-blue-300'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <div className="text-sm font-semibold mb-1">16:9</div>
                  <p className="text-xs opacity-80">Landscape</p>
                </button>
                <button
                  onClick={() => setAspectRatio('9:16')}
                  disabled={isRunning || executingStage !== null}
                  className={`p-3 rounded-lg border-2 transition-all ${
                    aspectRatio === '9:16'
                      ? 'bg-blue-500 text-white border-blue-500 shadow-md'
                      : 'bg-white border-gray-300 text-gray-700 hover:border-blue-300'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <div className="text-sm font-semibold mb-1">9:16</div>
                  <p className="text-xs opacity-80">Portrait</p>
                </button>
              </div>
            )}
          </div>

          {/* Conditional sections based on contentType */}
          {contentType === 'faceless-video' && (
            <>
              <div className="mb-6 p-4 bg-blue-50 rounded-lg border-2 border-blue-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1">
                    <button
                      onClick={() => setShowFacelessOptions(!showFacelessOptions)}
                      className="text-gray-600 hover:text-gray-800 transition-colors"
                    >
                      <svg
                        className={`w-5 h-5 transition-transform ${showFacelessOptions ? 'rotate-90' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                    <h3 className="text-md font-semibold text-gray-800">
                      Faceless Video Options
                    </h3>
                  </div>
                </div>

                {showFacelessOptions && (
                  <div className="space-y-4 mt-4 pt-4 border-t border-blue-200">
                {/* Video Duration */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Video Duration: {duration} seconds
                  </label>
                  <input
                    type="range"
                    min="8"
                    max="900"
                    step="1"
                    value={duration}
                    onChange={(e) => handleDurationChange(Number(e.target.value))}
                    disabled={isRunning || executingStage !== null}
                    className="w-full h-2 bg-gray-300 rounded-lg appearance-none cursor-pointer disabled:cursor-not-allowed"
                  />
                  <div className="flex justify-between text-xs text-gray-600 mt-1">
                    <span>8s (min)</span>
                    <span>148s (Standard)</span>
                    <span>900s (15 min, Extended)</span>
                  </div>
                </div>

                {/* Model Selection */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Video Duration Mode:
                  </label>
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      onClick={() => handleModelChange('veo')}
                      disabled={isRunning || executingStage !== null}
                      className={`px-4 py-3 rounded-lg font-semibold text-sm transition-all ${
                        useVeo
                          ? 'bg-blue-600 text-white shadow-md'
                          : 'bg-white border-2 border-gray-300 text-gray-700 hover:border-blue-300'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      <div>Standard Duration</div>
                      <div className="text-xs font-normal opacity-80 mt-1">Up to 148s, High Quality</div>
                    </button>

                    <button
                      onClick={() => handleModelChange('longcat')}
                      disabled={isRunning || executingStage !== null}
                      className={`px-4 py-3 rounded-lg font-semibold text-sm transition-all ${
                        useLongCat
                          ? 'bg-purple-600 text-white shadow-md'
                          : 'bg-white border-2 border-gray-300 text-gray-700 hover:border-purple-300'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      <div>Extended Duration</div>
                      <div className="text-xs font-normal opacity-80 mt-1">149s to 15 min</div>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <button
                    onClick={() => setFacelessVideoMode('text-to-video')}
                    disabled={isRunning || executingStage !== null}
                    className={`px-4 py-3 rounded-lg font-semibold text-sm transition-all ${
                      facelessVideoMode === 'text-to-video'
                        ? 'bg-blue-500 text-white shadow-md'
                        : 'bg-white border-2 border-gray-300 text-gray-700 hover:border-blue-300'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    <div>Text-to-Video</div>
                    <div className="text-xs font-normal opacity-80 mt-1">Direct generation</div>
                  </button>

                  <button
                    onClick={() => setFacelessVideoMode('image-to-video')}
                    disabled={isRunning || executingStage !== null}
                    className={`px-4 py-3 rounded-lg font-semibold text-sm transition-all ${
                      facelessVideoMode === 'image-to-video'
                        ? 'bg-blue-500 text-white shadow-md'
                        : 'bg-white border-2 border-gray-300 text-gray-700 hover:border-blue-300'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    <div>Image-to-Video</div>
                    <div className="text-xs font-normal opacity-80 mt-1">Animate from image</div>
                  </button>
                </div>

                {facelessVideoMode === 'image-to-video' && (
                  <div className="mt-4">
                    <label className="block text-sm font-medium text-gray-700 mb-3">
                      Image Source:
                    </label>
                    <div className="grid grid-cols-2 gap-4">
                      <button
                        onClick={() => setImageSource('generate')}
                        disabled={isRunning || executingStage !== null}
                        className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
                          imageSource === 'generate'
                            ? 'bg-green-500 text-white shadow-md'
                            : 'bg-white border-2 border-gray-300 text-gray-700 hover:border-green-300'
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        Generate Image
                      </button>

                      <button
                        onClick={() => setImageSource('upload')}
                        disabled={isRunning || executingStage !== null}
                        className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
                          imageSource === 'upload'
                            ? 'bg-green-500 text-white shadow-md'
                            : 'bg-white border-2 border-gray-300 text-gray-700 hover:border-green-300'
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        Upload Image
                      </button>
                    </div>
                  </div>
                )}
                  </div>
                )}
              </div>

              {/* VEO 3.1 Frame Interpolation */}
              {useVeo && (
                <div className="mb-6 p-6 bg-gradient-to-br from-cyan-50 to-blue-50 rounded-lg border-2 border-cyan-200">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-md font-semibold text-gray-800">
                      Advanced Frame Controls
                    </h3>
                    <label className="flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={useFrameInterpolation}
                        onChange={(e) => setUseFrameInterpolation(e.target.checked)}
                        disabled={isRunning || executingStage !== null}
                        className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 disabled:cursor-not-allowed"
                      />
                      <span className="ml-2 text-sm font-medium text-gray-700">
                        Use Frame Interpolation
                      </span>
                    </label>
                  </div>

                  {useFrameInterpolation && (
                    <div className="space-y-4">
                      <div className="bg-white rounded-lg p-4 border-2 border-blue-200">
                        <p className="text-xs text-gray-600 mb-3">
                          Scene Extensions: {sceneExtensionCount} (Total: {8 + sceneExtensionCount * 7}s)
                        </p>

                        {/* First Frame */}
                        <div className="mb-4">
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            First Frame:
                          </label>
                          <div className="grid grid-cols-3 gap-2 mb-3">
                            <button
                              onClick={() => setFirstFrameMode('upload')}
                              disabled={isRunning || executingStage !== null}
                              className={`px-3 py-2 rounded text-xs font-semibold transition-all ${
                                firstFrameMode === 'upload'
                                  ? 'bg-blue-500 text-white'
                                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                              } disabled:opacity-50 disabled:cursor-not-allowed`}
                            >
                              Upload
                            </button>
                            <button
                              onClick={() => setFirstFrameMode('text-gemini')}
                              disabled={isRunning || executingStage !== null}
                              className={`px-3 py-2 rounded text-xs font-semibold transition-all ${
                                firstFrameMode === 'text-gemini'
                                  ? 'bg-blue-500 text-white'
                                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                              } disabled:opacity-50 disabled:cursor-not-allowed`}
                            >
                              Text-to-Image (Method 1)
                            </button>
                            <button
                              onClick={() => setFirstFrameMode('text-imagen')}
                              disabled={isRunning || executingStage !== null}
                              className={`px-3 py-2 rounded text-xs font-semibold transition-all ${
                                firstFrameMode === 'text-imagen'
                                  ? 'bg-blue-500 text-white'
                                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                              } disabled:opacity-50 disabled:cursor-not-allowed`}
                            >
                              Text-to-Image (Method 2)
                            </button>
                          </div>

                          {firstFrameMode === 'upload' ? (
                            <FileUpload
                              fileType="image"
                              label="Upload First Frame Image"
                              accept="image/*"
                              onFilesChange={setFirstFrameImage}
                              maxFiles={1}
                              multiple={false}
                              disabled={isRunning || executingStage !== null}
                            />
                          ) : (
                            <textarea
                              value={firstFramePrompt}
                              onChange={(e) => setFirstFramePrompt(e.target.value)}
                              placeholder="Describe the first frame..."
                              rows={2}
                              disabled={isRunning || executingStage !== null}
                              className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none text-sm resize-none disabled:bg-gray-100 disabled:cursor-not-allowed"
                            />
                          )}
                        </div>

                        {/* Last Frame */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Last Frame:
                          </label>
                          <div className="grid grid-cols-3 gap-2 mb-3">
                            <button
                              onClick={() => setLastFrameMode('upload')}
                              disabled={isRunning || executingStage !== null}
                              className={`px-3 py-2 rounded text-xs font-semibold transition-all ${
                                lastFrameMode === 'upload'
                                  ? 'bg-blue-500 text-white'
                                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                              } disabled:opacity-50 disabled:cursor-not-allowed`}
                            >
                              Upload
                            </button>
                            <button
                              onClick={() => setLastFrameMode('text-gemini')}
                              disabled={isRunning || executingStage !== null}
                              className={`px-3 py-2 rounded text-xs font-semibold transition-all ${
                                lastFrameMode === 'text-gemini'
                                  ? 'bg-blue-500 text-white'
                                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                              } disabled:opacity-50 disabled:cursor-not-allowed`}
                            >
                              Text-to-Image (Method 1)
                            </button>
                            <button
                              onClick={() => setLastFrameMode('text-imagen')}
                              disabled={isRunning || executingStage !== null}
                              className={`px-3 py-2 rounded text-xs font-semibold transition-all ${
                                lastFrameMode === 'text-imagen'
                                  ? 'bg-blue-500 text-white'
                                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                              } disabled:opacity-50 disabled:cursor-not-allowed`}
                            >
                              Text-to-Image (Method 2)
                            </button>
                          </div>

                          {lastFrameMode === 'upload' ? (
                            <FileUpload
                              fileType="image"
                              label="Upload Last Frame Image"
                              accept="image/*"
                              onFilesChange={setLastFrameImage}
                              maxFiles={1}
                              multiple={false}
                              disabled={isRunning || executingStage !== null}
                            />
                          ) : (
                            <textarea
                              value={lastFramePrompt}
                              onChange={(e) => setLastFramePrompt(e.target.value)}
                              placeholder="Describe the last frame..."
                              rows={2}
                              disabled={isRunning || executingStage !== null}
                              className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none text-sm resize-none disabled:bg-gray-100 disabled:cursor-not-allowed"
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* LongCat Configuration */}
              {useLongCat && (
                <div className="mb-6 p-6 bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg border-2 border-purple-200">
                  <h3 className="text-md font-semibold text-gray-800 mb-4">
                    Extended Video Configuration
                  </h3>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Video Mode:
                      </label>
                      <div className="grid grid-cols-2 gap-4">
                        <button
                          onClick={() => setLongCatMode('text-to-video')}
                          disabled={isRunning || executingStage !== null}
                          className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
                            longCatMode === 'text-to-video'
                              ? 'bg-purple-500 text-white shadow-md'
                              : 'bg-white border-2 border-gray-300 text-gray-700 hover:border-purple-300'
                          } disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                          Text-to-Video
                        </button>
                        <button
                          onClick={() => setLongCatMode('image-to-video')}
                          disabled={isRunning || executingStage !== null}
                          className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
                            longCatMode === 'image-to-video'
                              ? 'bg-purple-500 text-white shadow-md'
                              : 'bg-white border-2 border-gray-300 text-gray-700 hover:border-purple-300'
                          } disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                          Image-to-Video
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Video Prompt:
                      </label>
                      <textarea
                        value={longCatPrompt}
                        onChange={(e) => setLongCatPrompt(e.target.value)}
                        placeholder="Describe your long-form video..."
                        rows={3}
                        disabled={isRunning || executingStage !== null}
                        className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none text-sm resize-none disabled:bg-gray-100 disabled:cursor-not-allowed"
                      />
                    </div>

                    {longCatMode === 'image-to-video' && (
                      <div>
                        <FileUpload
                          fileType="image"
                          label="Reference Image"
                          accept="image/*"
                          onFilesChange={setLongCatReferenceImage}
                          maxFiles={1}
                          multiple={false}
                          disabled={isRunning || executingStage !== null}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Avatar Video Configuration */}
          {contentType === 'avatar-video' && (
            <div className="mb-6 p-4 bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg border-2 border-green-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1">
                  <button
                    onClick={() => setShowAvatarConfig(!showAvatarConfig)}
                    className="text-gray-600 hover:text-gray-800 transition-colors"
                  >
                    <svg
                      className={`w-5 h-5 transition-transform ${showAvatarConfig ? 'rotate-90' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                  <h3 className="text-md font-semibold text-gray-800">
                    Avatar Video Configuration
                  </h3>
                </div>
              </div>

              {showAvatarConfig && (
                <div className="space-y-4 mt-4 pt-4 border-t border-green-200">
                {/* Avatar Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select Avatar:
                  </label>
                  <select
                    value={avatarId}
                    onChange={(e) => {
                      setAvatarId(e.target.value)
                      // Auto-set voice ID when avatar changes
                      const selectedAvatar = availableAvatars.find(a => a.groupId === e.target.value)
                      if (selectedAvatar) {
                        setAvatarVoiceId(selectedAvatar.voiceId)
                      }
                    }}
                    disabled={isRunning || executingStage !== null}
                    className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-green-500 focus:outline-none text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
                  >
                    <option value="auto">Auto-select recommended avatar</option>
                    {availableAvatars.map((avatar) => (
                      <option key={avatar.groupId} value={avatar.groupId}>
                        {avatar.name}{avatar.gender && avatar.gender !== 'unknown' ? ` (${avatar.gender === 'male' ? 'Male' : 'Female'})` : ''} - {avatar.voiceName || avatar.voiceId}
                      </option>
                    ))}
                    {availableAvatars.length === 0 && (
                      <>
                        <option value="generic-indian-male">Generic Indian Male (VEO)</option>
                        <option value="generic-indian-female">Generic Indian Female (VEO)</option>
                      </>
                    )}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    {availableAvatars.find(a => a.groupId === avatarId)
                      ? `Using ${availableAvatars.find(a => a.groupId === avatarId)?.name} avatar with ${availableAvatars.find(a => a.groupId === avatarId)?.voiceName} voice`
                      : 'Using the default auto-selected avatar workflow'}
                  </p>
                </div>

                {/* Script Text (Optional) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Video Script (optional):
                  </label>
                  <textarea
                    value={avatarScriptText}
                    onChange={(e) => {
                      setAvatarScriptText(e.target.value)
                      if (scriptError) setScriptError(null)
                    }}
                    placeholder="Leave empty to auto-generate based on campaign topic and purpose..."
                    rows={4}
                    disabled={isRunning || executingStage !== null}
                    className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-green-500 focus:outline-none text-sm resize-none disabled:bg-gray-100 disabled:cursor-not-allowed"
                  />
                  <div className="mt-2 flex items-center gap-3 flex-wrap">
                    <button
                      type="button"
                      onClick={async () => {
                        setScriptError(null)
                        setGeneratingScript(true)
                        try {
                          const res = await fetch('/api/workflow/generate-script', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              topic: topic.trim() || 'brand or product insights',
                              duration,
                              platform: selectedPlatforms?.[0] || 'instagram',
                              format: 'reel',
                              language
                            })
                          })
                          const data = await res.json()
                          if (!res.ok) throw new Error(data.error || 'Failed to generate script')
                          setAvatarScriptText(data.script ?? '')
                        } catch (e) {
                          setScriptError(e instanceof Error ? e.message : 'Failed to generate script')
                        } finally {
                          setGeneratingScript(false)
                        }
                      }}
                      disabled={isRunning || executingStage !== null || generatingScript}
                      className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {generatingScript ? 'Generating…' : 'Generate'}
                    </button>
                    {scriptError && (
                      <span className="text-sm text-red-600">{scriptError}</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    If left empty, AI will generate a contextually appropriate script based on your campaign configuration
                  </p>
                </div>

                {/* Video Duration */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Video Duration: {duration} seconds
                  </label>
                  <input
                    type="range"
                    min="8"
                    max="300"
                    step="5"
                    value={duration}
                    onChange={(e) => setDuration(Number(e.target.value))}
                    disabled={isRunning || executingStage !== null}
                    className="w-full h-2 bg-gray-300 rounded-lg appearance-none cursor-pointer disabled:cursor-not-allowed"
                  />
                  <div className="flex justify-between text-xs text-gray-600 mt-1">
                    <span>8s</span>
                    <span>300s (5 min)</span>
                  </div>
                </div>
                </div>
              )}
            </div>
          )}

          {/* Reference Materials Section - Collapsible for all content types */}
          <div className="mb-6 p-4 bg-gradient-to-br from-amber-50 to-orange-50 rounded-lg border-2 border-amber-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 flex-1">
                <button
                  onClick={() => setShowReferenceMaterials(!showReferenceMaterials)}
                  className="text-gray-600 hover:text-gray-800 transition-colors"
                >
                  <svg
                    className={`w-5 h-5 transition-transform ${showReferenceMaterials ? 'rotate-90' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
                <h3 className="text-md font-semibold text-gray-800">
                  Reference Materials (Optional)
                </h3>
              </div>
            </div>

            {showReferenceMaterials && (
              <div className="space-y-4 mt-4 pt-4 border-t border-amber-200">
                {/* Research PDFs */}
                <FileUpload
                  fileType="pdf"
                  label="Research PDFs"
                  accept=".pdf"
                  onFilesChange={setResearchPDFs}
                  maxFiles={5}
                  multiple={true}
                  disabled={isRunning || executingStage !== null}
                />

                {/* Reference Images */}
                <FileUpload
                  fileType="image"
                  label="Reference Images"
                  accept="image/*"
                  onFilesChange={setReferenceImages}
                  maxFiles={10}
                  multiple={true}
                  disabled={isRunning || executingStage !== null}
                />

                {/* Reference Video */}
                <FileUpload
                  fileType="video"
                  label="Reference Video"
                  accept="video/*"
                  onFilesChange={setReferenceVideo}
                  maxFiles={1}
                  multiple={false}
                  disabled={isRunning || executingStage !== null}
                />

                <p className="text-xs text-gray-600 mt-2">
                  Upload reference materials to guide content generation. These files will be analyzed by AI to understand your style and preferences.
                </p>
              </div>
            )}
          </div>

          {/* Auto-Publish Toggle */}
          <div className="mb-6 p-4 bg-gradient-to-br from-teal-50 to-cyan-50 rounded-lg border-2 border-teal-200">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-md font-semibold text-gray-800">
                  Auto-Publish
                </h3>
                <p className="text-xs text-gray-600 mt-1">
                  Automatically publish content to selected platforms after generation
                </p>
              </div>
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoPublish}
                  onChange={(e) => setAutoPublish(e.target.checked)}
                  disabled={isRunning || executingStage !== null}
                  className="w-4 h-4 text-teal-600 rounded focus:ring-teal-500 disabled:cursor-not-allowed"
                />
                <span className="ml-2 text-sm font-medium text-gray-700">
                  Enable Auto-Publish
                </span>
              </label>
            </div>
          </div>

          {/* Brand Guidelines Section - Collapsed by default */}
          <div className="mb-6 p-4 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-lg border-2 border-indigo-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 flex-1">
                <button
                  onClick={() => setShowBrandGuidelines(!showBrandGuidelines)}
                  className="text-gray-600 hover:text-gray-800 transition-colors"
                >
                  <svg
                    className={`w-5 h-5 transition-transform ${showBrandGuidelines ? 'rotate-90' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
                <h3 className="text-md font-semibold text-gray-800">
                  Brand Guidelines
                </h3>
              </div>
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={useBrandGuidelines}
                  onChange={(e) => setUseBrandGuidelines(e.target.checked)}
                  disabled={isRunning || executingStage !== null}
                  className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 disabled:cursor-not-allowed"
                />
                <span className="ml-2 text-sm font-medium text-gray-700">
                  Use saved brand guidelines
                </span>
              </label>
            </div>

            {showBrandGuidelines && (
              <div className="mt-4 pt-4 border-t border-indigo-200">
                {useBrandGuidelines ? (
                  <div className="bg-white rounded-lg p-4 border-2 border-green-300">
                    <p className="text-sm font-semibold text-green-700 mb-2">
                      Brand guidelines active
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
                        <span className="ml-2 text-gray-800">Professional, adaptable</span>
                      </div>
                      <div className="col-span-2">
                        <span className="font-semibold text-gray-600">Brand Asset:</span>
                        <span className="ml-2 text-gray-800">Replace the placeholder brand kit with your own logo and assets.</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <p className="text-sm text-gray-600 mb-4">
                      Define custom brand settings for this campaign:
                    </p>

                    {/* Primary Colors */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Primary Colors:
                      </label>
                      <input
                        type="text"
                        value={customColors}
                        onChange={(e) => setCustomColors(e.target.value)}
                        disabled={isRunning || executingStage !== null}
                        placeholder="e.g., #0e0e6a (navy), #3c3cf8 (blue)"
                        className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-indigo-500 focus:outline-none text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
                      />
                    </div>

                    {/* Accent Colors */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Accent Colors:
                      </label>
                      <input
                        type="text"
                        value={accentColors}
                        onChange={(e) => setAccentColors(e.target.value)}
                        disabled={isRunning || executingStage !== null}
                        placeholder="e.g., #00d084 (teal), #66e766 (green)"
                        className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-indigo-500 focus:outline-none text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
                      />
                    </div>

                    {/* Body Text Color */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Body Text Color:
                      </label>
                      <input
                        type="text"
                        value={bodyTextColor}
                        onChange={(e) => setBodyTextColor(e.target.value)}
                        disabled={isRunning || executingStage !== null}
                        placeholder="e.g., #1a1a1a or #333333"
                        className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-indigo-500 focus:outline-none text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
                      />
                    </div>

                    {/* Typography */}
                    <div className="space-y-3">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Typography:
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <span className="block text-xs text-gray-500 mb-1">Font</span>
                          <input
                            type="text"
                            value={customFont}
                            onChange={(e) => setCustomFont(e.target.value)}
                            disabled={isRunning || executingStage !== null}
                            placeholder="e.g., Figtree, Inter"
                            className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-indigo-500 focus:outline-none text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
                          />
                        </div>
                        <div>
                          <span className="block text-xs text-gray-500 mb-1">Size</span>
                          <input
                            type="text"
                            value={customFontSize}
                            onChange={(e) => setCustomFontSize(e.target.value)}
                            disabled={isRunning || executingStage !== null}
                            placeholder="e.g., 16px, 1rem"
                            className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-indigo-500 focus:outline-none text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
                          />
                        </div>
                        <div>
                          <span className="block text-xs text-gray-500 mb-1">Weight</span>
                          <select
                            value={customFontWeight}
                            onChange={(e) => setCustomFontWeight(e.target.value)}
                            disabled={isRunning || executingStage !== null}
                            className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-indigo-500 focus:outline-none text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
                          >
                            <option value="">Select weight...</option>
                            <option value="300">Light (300)</option>
                            <option value="400">Regular (400)</option>
                            <option value="500">Medium (500)</option>
                            <option value="600">Semi-bold (600)</option>
                            <option value="700">Bold (700)</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Gradient */}
                    <div className="space-y-3">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Gradient:
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <span className="block text-xs text-gray-500 mb-1">Start colour</span>
                          <input
                            type="text"
                            value={gradientStartColor}
                            onChange={(e) => setGradientStartColor(e.target.value)}
                            disabled={isRunning || executingStage !== null}
                            placeholder="e.g., #0e0e6a"
                            className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-indigo-500 focus:outline-none text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
                          />
                        </div>
                        <div>
                          <span className="block text-xs text-gray-500 mb-1">End colour</span>
                          <input
                            type="text"
                            value={gradientEndColor}
                            onChange={(e) => setGradientEndColor(e.target.value)}
                            disabled={isRunning || executingStage !== null}
                            placeholder="e.g., #3c3cf8"
                            className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-indigo-500 focus:outline-none text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
                          />
                        </div>
                        <div>
                          <span className="block text-xs text-gray-500 mb-1">Direction</span>
                          <select
                            value={gradientDirection}
                            onChange={(e) => setGradientDirection(e.target.value)}
                            disabled={isRunning || executingStage !== null}
                            className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-indigo-500 focus:outline-none text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
                          >
                            <option value="">Select direction...</option>
                            <option value="to right">To right</option>
                            <option value="to left">To left</option>
                            <option value="to bottom">To bottom</option>
                            <option value="to top">To top</option>
                            <option value="to bottom right">To bottom right</option>
                            <option value="to bottom left">To bottom left</option>
                            <option value="to top right">To top right</option>
                            <option value="to top left">To top left</option>
                          </select>
                        </div>
                      </div>
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
                        placeholder="Add specific style guidelines, mood, composition requirements..."
                        rows={3}
                        className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-indigo-500 focus:outline-none text-sm resize-none disabled:bg-gray-100 disabled:cursor-not-allowed"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Execute Button */}
          {executionMode === 'full' && (
            <div className="flex justify-center">
              <button
                onClick={executeWorkflow}
                disabled={isRunning || executingStage !== null || (activeModule === 'content-engine' && !topic)}
                className={`px-8 py-4 rounded-lg font-semibold text-lg transition-all transform hover:scale-105 ${
                  isRunning || executingStage !== null || (activeModule === 'content-engine' && !topic)
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
                    {activeModule === 'content-engine' ? 'Running Campaign...' : 'Running Lead Workflow...'}
                  </span>
                ) : (
                  activeModule === 'content-engine' ? 'Execute Full Campaign' : 'Execute Lead Workflow'
                )}
              </button>
            </div>
          )}
            </div>
          )}

          {executionMode === 'staged' && (
            <div className="text-sm text-gray-600 bg-purple-50 px-4 py-3 rounded-lg border-2 border-purple-200">
              <p className="font-semibold text-purple-700">Stage-by-Stage Mode Active</p>
              <p className="text-xs mt-1">Execute and review each stage individually below.</p>
            </div>
          )}
        </div>

        {/* Workflow Stages */}
        <div className="bg-white rounded-lg shadow-lg p-8 mb-8">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">
            {activeModule === 'content-engine' ? 'Workflow Stages' : 'Lead Intelligence Workflow'}
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
                        {activeModule === 'lead-intelligence' && LEAD_STAGE_CONNECTORS[stage.id] && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {LEAD_STAGE_CONNECTORS[stage.id].map((connectorId) => {
                              const connector = leadConnectorRecords.find((item) => item.id === connectorId)
                              if (!connector) return null
                              return (
                                <button
                                  key={connector.id}
                                  type="button"
                                  onClick={() => {
                                    if (!connector.connected) handleLeadConnectorAction(connector.id)
                                  }}
                                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                                    connector.connected
                                      ? 'border-emerald-300 bg-emerald-100 text-emerald-700'
                                      : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:text-emerald-700'
                                  }`}
                                >
                                  {connector.label} • {connector.connected ? 'Connected' : connectorActionId === connector.id ? 'Opening...' : 'Connect'}
                                </button>
                              )
                            })}
                          </div>
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
                              disabled={executingStage !== null || isRunning || (activeModule !== 'lead-intelligence' && !topic)}
                              className={`text-sm px-4 py-2 rounded-lg font-semibold transition-all ${
                                executingStage === stage.id
                                  ? 'bg-purple-400 text-white cursor-wait'
                                  : activeModule !== 'lead-intelligence' && !topic
                                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                  : stage.status === 'completed'
                                  ? 'bg-purple-600 text-white hover:bg-purple-700 shadow-md hover:shadow-lg'
                                  : 'bg-purple-500 text-white hover:bg-purple-600 shadow-md hover:shadow-lg'
                              }`}
                            >
                              {executingStage === stage.id ? 'Executing...' : stage.status === 'completed' ? 'Re-run Stage' : 'Execute Stage'}
                            </button>
                          ) : (
                            <button
                              onClick={() => executeStage(stage.id)}
                              disabled={
                                executingStage !== null ||
                                isRunning ||
                                stages[stage.id - 2]?.status !== 'completed'
                              }
                              className={`text-sm px-4 py-2 rounded-lg font-semibold transition-all ${
                                executingStage === stage.id
                                  ? 'bg-purple-400 text-white cursor-wait'
                                  : stages[stage.id - 2]?.status !== 'completed'
                                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                  : stage.status === 'completed'
                                  ? 'bg-purple-600 text-white hover:bg-purple-700 shadow-md hover:shadow-lg'
                                  : 'bg-purple-500 text-white hover:bg-purple-600 shadow-md hover:shadow-lg'
                              }`}
                            >
                              {executingStage === stage.id
                                ? 'Executing...'
                                : stages[stage.id - 2]?.status !== 'completed'
                                ? 'Waiting'
                                : stage.status === 'completed'
                                ? 'Re-run Stage'
                                : 'Approve & Continue'}
                            </button>
                          )}
                        </>
                      )}

                      {/* View Data Button (available after completion) */}
                      {stageData[stage.id]?.data && stage.status === 'completed' && (
                        <button
                          onClick={() => handleViewData(stage.id, stage.name)}
                          className="text-sm px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
                        >
                          📝 View & Edit Data
                        </button>
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

        <div className="bg-white rounded-lg shadow-lg p-8 mt-8">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">
            Live Logs
          </h2>
          <div className="bg-gray-900 rounded-lg p-4 h-96 overflow-y-auto font-mono text-sm">
            {logs.length === 0 ? (
              <p className="text-gray-500 italic">Waiting for campaign execution...</p>
            ) : (
              logs.map((log, index) => (
                <LogEntry key={index} text={log} index={index} />
              ))
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-gray-600">
          <p className="text-sm">
            Torqq Content Engine • Port 3004 •
            <span className="ml-2">AI-Powered Video Production & Multi-Platform Publishing</span>
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

        {/* Stage Data Edit Modal */}
        {selectedStageData && (
          <StageDataModal
            isOpen={showDataModal}
            stageId={selectedStageData.stageId}
            stageName={selectedStageData.stageName}
            data={selectedStageData.data}
            onClose={handleCloseModal}
            onSave={handleSaveStageData}
          />
        )}
      </div>
    </div>
  )
}

export default function Home() {
  return (
    <AuthProvider>
      <AuthGate>
        <DashboardPage />
      </AuthGate>
    </AuthProvider>
  )
}
