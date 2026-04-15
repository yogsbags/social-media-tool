
async function testEnrichmentLive() {
  const url = 'http://localhost:3004/api/leads-db/enrich-upload';
  
  const payload = {
    rows: [
      { email: 'dshah@idafoundation.org.in', name: 'Existing Lead' },
      { email: 'yogsbags@gmail.com', name: 'Test Lead' }
    ],
    emailField: 'email',
    useApollo: true,
    userId: '95263b53-dade-43c1-b7bb-b91b2069b156'
  };

  console.log('Testing Live Enrichment (Leads DB + Apollo)...');
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (!res.ok) {
    console.error('Enrichment Failed:', data);
    return;
  }

  console.log(`✅ Success! Enriched ${data.count} records.`);
  console.log(`Matched: ${data.matched}`);
  if (data.enrichedRows && data.enrichedRows.length > 0) {
    console.log('Sample Enriched Row:', JSON.stringify(data.enrichedRows[0], null, 2));
  }
}

testEnrichmentLive();
