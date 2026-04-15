
const LEADS_DB_URL = 'https://0867-115-98-234-204.ngrok-free.app/enrich/bulk';
const BEARER_TOKEN = 'leads-secret-2026';

async function analyzeFintechOpportunities() {
  // Scenario: A Fintech firm has a list of existing leads/clients and wants to identify:
  // 1. DIRECT SELL: High-quality leads for a new Business Loan product.
  // 2. UPSELL: Existing clients who have moved to C-Suite or Finance Head roles (higher purchasing power).
  // 3. CROSS-SELL: Leads in industries like Manufacturing/Real Estate who might need Asset Financing.

  const mockLeads = [
    { email: 'it@aviralfinance.com', name: 'IT Manager', segment: 'current_client' },
    { email: 'dshah@idafoundation.org.in', name: 'D Shah', segment: 'prospect' },
    { email: 'gauravarora320@gmail.com', name: 'Gaurav Arora', segment: 'prospect' },
    { email: 'nadella.sandeep@gmail.com', name: 'Sandeep Nadella', segment: 'prospect' }
  ];

  console.log('--- STARTING FINTECH ENRICHMENT ANALYSIS ---\n');

  try {
    const res = await fetch(LEADS_DB_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${BEARER_TOKEN}`,
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': '1'
      },
      body: JSON.stringify({
        emails: mockLeads.map(l => l.email)
      })
    });

    const result = await res.json();
    if (!res.ok) throw new Error('Enrichment failed');

    const enriched = result.data || [];
    
    mockLeads.forEach(original => {
      const data = enriched.find(e => (e.email_norm || e.email) === original.email);
      if (!data) {
        console.log(`[x] ${original.email}: No enrichment data found.`);
        return;
      }

      console.log(`Analyzing: ${data.full_name} (${original.email})`);
      console.log(`- Role: ${data.designation} | Seniority: ${data.seniority || 'N/A'}`);
      console.log(`- Company: ${data.company} | Industry: ${data.icp_industry || 'N/A'}`);
      console.log(`- Quality: ${data.quality} | Signal Count: ${data.signal_count}`);

      // FINTECH LOGIC
      let logic = [];

      // Indicator 1: Seniority & Role (Purchasing Power)
      if (['C_SUITE', 'PARTNER', 'OWNER', 'DIRECTOR'].includes(data.seniority)) {
        logic.push('🌟 HIGH PURCHASING POWER: Lead is a decision-maker.');
      } else if (data.designation?.toLowerCase().includes('manager')) {
        logic.push('✅ INFLUENCER: Mid-level decision maker.');
      }

      // Indicator 2: Industry (Vertical Match)
      if (data.icp_industry === 'FINANCE') {
        logic.push('💰 VERTICAL FIT: Already in Finance, likely understands Fintech value props.');
      } else if (['MANUFACTURING', 'REAL_ESTATE', 'IT_SERVICES'].includes(data.icp_industry)) {
        logic.push(`🏗️ SECTOR OPPORTUNITY: ${data.icp_industry} often requires high-ticket Asset Financing/Loans.`);
      }

      // Indicator 3: Data Quality (Verification)
      if (data.quality >= 4 && data.tc_score > 0.8) {
        logic.push('📱 HIGH REACHABILITY: Verified phone/identity via Truecaller.');
      }

      // STRATEGIC RECOMMENDATION
      if (original.segment === 'current_client') {
        if (logic.some(l => l.includes('HIGH PURCHASING POWER'))) {
          console.log('>>> STRATEGY: UPSELL to Premium Corporate Plan (Client promoted/High seniority).');
        } else {
          console.log('>>> STRATEGY: CROSS-SELL Insurance or Wealth Management.');
        }
      } else {
        if (logic.some(l => l.includes('VERTICAL FIT'))) {
          console.log('>>> STRATEGY: DIRECT SELL B2B Lending / Payment Gateway.');
        } else {
          console.log('>>> STRATEGY: NURTURE via Thought Leadership in their sector.');
        }
      }

      logic.forEach(l => console.log(`  ${l}`));
      console.log('---');
    });

  } catch (error) {
    console.error('Analysis failed:', error);
  }
}

analyzeFintechOpportunities();
