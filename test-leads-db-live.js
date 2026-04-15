
async function testLeadsDbLive() {
  const url = 'https://0867-115-98-234-204.ngrok-free.app/fetch';
  const token = 'leads-secret-2026';
  
  const payload = {
    icp_country: 'IN',
    icp_industry: ['IT_SERVICES'],
    seniority: ['C_SUITE'],
    cities: ['Mumbai'],
    limit: 3
  };

  console.log('Testing Live Leads DB Fetch...');
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': '1'
    },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (!res.ok) {
    console.error('Fetch Failed:', data);
    return;
  }

  console.log(`✅ Success! Fetched ${data.leads?.length || 0} leads.`);
  if (data.leads && data.leads.length > 0) {
    console.log('Sample Lead:', JSON.stringify(data.leads[0], null, 2));
  }
}

testLeadsDbLive();
