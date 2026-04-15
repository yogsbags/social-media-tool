
async function testApolloDiscovery() {
  const apolloApiKey = '68lP1EKZ_lI8rzyITkXbkg';
  const limit = 5;
  
  const params = new URLSearchParams({
    per_page: String(limit),
    'person_titles[]': 'CEO',
    'person_locations[]': 'India',
    'q_keywords': 'Technology'
  });

  console.log('Testing Apollo Search...');
  const res = await fetch(`https://api.apollo.io/api/v1/mixed_people/api_search?${params.toString()}`, {
    method: 'POST',
    headers: {
      'x-api-key': apolloApiKey,
      'Content-Type': 'application/json'
    }
  });

  const data = await res.json();
  if (!res.ok) {
    console.error('Apollo Search Failed:', data);
    return;
  }

  console.log('Search successful. Found people:', data.people?.length || 0);
  if (data.people && data.people.length > 0) {
    console.log('First Lead:', JSON.stringify(data.people[0], null, 2));
  }
}

testApolloDiscovery();
