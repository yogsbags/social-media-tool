const fs = require('fs');

const HEYGEN_API_KEY = 'ZTAyZDk1NTIwYzRkNDU1NjkxNTM3ZmI2ZTViOTIwYjMtMTc2MDUxNDE0OQ==';
const imagePath = './generated-avatars/raj_avatar.jpg';

async function uploadBinary() {
  console.log('Uploading with binary data...');
  
  const imageBuffer = fs.readFileSync(imagePath);
  
  const response = await fetch('https://upload.heygen.com/v1/asset', {
    method: 'POST',
    headers: {
      'X-Api-Key': HEYGEN_API_KEY,
      'Content-Type': 'image/jpeg'
    },
    body: imageBuffer
  });
  
  console.log('Status:', response.status);
  const text = await response.text();
  console.log('Response:', text);
}

uploadBinary().catch(console.error);
