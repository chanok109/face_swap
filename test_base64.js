const fs = require('fs');
async function test() {
  require('dotenv').config();
  const apiKey = process.env.AIFACESWAP_API_KEY;
  // Use a small valid base64 image (1x1 pixel)
  const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  const payload = {
    source_image: b64,
    face_image: b64
  };
  const res = await fetch('https://aifaceswap.io/api/aifaceswap/v1/faceswap', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  console.log(await res.text());
}
test();
