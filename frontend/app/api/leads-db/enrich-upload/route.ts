import { NextRequest, NextResponse } from 'next/server'
import { callLeadsDb } from '@/lib/server/leads-db'
import { enrichApolloPeopleByEmails } from '@/lib/server/composio'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type InputRow = Record<string, unknown>

function normalizeEmail(value: unknown) {
  return String(value || '').trim().toLowerCase()
}

function normalizePhone(value: unknown) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const digits = raw.replace(/[^\d+]/g, '')
  if (digits.startsWith('+')) return digits
  if (digits.startsWith('91') && digits.length === 12) return `+${digits}`
  if (digits.length === 10) return `+91${digits}`
  return digits
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const rows = Array.isArray(body?.rows) ? (body.rows as InputRow[]) : []
    const emailField = String(body?.emailField || '').trim()
    const phoneField = String(body?.phoneField || '').trim()
    const useApollo = Boolean(body?.useApollo)
    const userId = String(body?.userId || '').trim()

    if (!rows.length) {
      return NextResponse.json({ error: 'No rows provided' }, { status: 400 })
    }
    if (!emailField && !phoneField) {
      return NextResponse.json({ error: 'Email or phone field mapping is required' }, { status: 400 })
    }

    const emails = emailField ? rows.map((row) => normalizeEmail(row[emailField])).filter(Boolean) : []
    const phones = phoneField ? rows.map((row) => normalizePhone(row[phoneField])).filter(Boolean) : []

    const emailLookup = new Map<string, any>()
    const phoneLookup = new Map<string, any>()

    if (emails.length) {
      try {
        const emailData = await callLeadsDb('/enrich/bulk', { emails: Array.from(new Set(emails)).slice(0, 1000) })
        for (const row of emailData?.data || []) {
          const key = normalizeEmail(row?.email_norm || row?.email)
          if (key) emailLookup.set(key, row)
        }
      } catch (e) {
        console.warn('Leads DB email enrichment failed, continuing...', e)
      }
    }

    if (phones.length) {
      try {
        const phoneData = await callLeadsDb('/enrich/bulk', { phones: Array.from(new Set(phones)).slice(0, 1000) })
        for (const row of phoneData?.data || []) {
          const key = normalizePhone(row?.phone_e164)
          if (key) phoneLookup.set(key, row)
        }
      } catch (e) {
        console.warn('Leads DB phone enrichment failed, continuing...', e)
      }
    }

    let apolloLookup = new Map<string, any>()
    if (useApollo && userId && emails.length) {
      apolloLookup = await enrichApolloPeopleByEmails(userId, emails)
    }

    const enrichedRows = rows.map((row) => {
      const email = emailField ? normalizeEmail(row[emailField]) : ''
      const phone = phoneField ? normalizePhone(row[phoneField]) : ''
      const leadDbByEmail = email ? emailLookup.get(email) : null
      const leadDbByPhone = phone ? phoneLookup.get(phone) : null
      const leadDb = leadDbByEmail || leadDbByPhone
      const apollo = email ? apolloLookup.get(email) : null
      const industry = leadDb?.icp_industry || leadDb?.industry || ''
      const quality = leadDb?.quality ?? ''
      const spamCount = leadDb?.spam_count ?? ''
      const hasPhone = leadDb ? Boolean(leadDb?.phone_e164) : false
      const hasEmail = leadDb ? Boolean(leadDb?.email_norm || leadDb?.email) : false
      const hasLinkedin = leadDb ? Boolean(leadDb?.linkedin_url) : false

      return {
        ...row,
        enriched_full_name: leadDb?.full_name || apollo?.full_name || '',
        enriched_designation: leadDb?.designation || apollo?.designation || '',
        enriched_company: leadDb?.company || apollo?.company || '',
        enriched_email: leadDb?.email || leadDb?.email_norm || apollo?.email || email || '',
        enriched_phone: leadDb?.phone_e164 || phone || '',
        enriched_linkedin_url: apollo?.linkedin_url || leadDb?.linkedin_url || '',
        enriched_country: leadDb?.icp_country || '',
        enriched_industry: industry,
        enriched_seniority: leadDb?.seniority || '',
        enriched_city: leadDb?.city || '',
        enriched_state: leadDb?.state || '',
        enriched_quality: quality,
        enriched_spam_count: spamCount,
        enriched_tc_score: leadDb?.tc_score ?? '',
        enriched_signal_count: leadDb?.signal_count ?? '',
        enriched_has_phone: hasPhone,
        enriched_has_email: hasEmail,
        enriched_has_linkedin: hasLinkedin,
        enriched_carrier: leadDb?.carrier || '',
        enriched_source: leadDb && apollo ? 'leads_db+apollo' : leadDb ? 'leads_db' : apollo ? 'apollo' : 'no_match',
      }
    })

    return NextResponse.json({
      count: enrichedRows.length,
      matched: enrichedRows.filter((row) => row.enriched_source !== 'no_match').length,
      enrichedRows,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not enrich uploaded leads' },
      { status: 500 }
    )
  }
}
