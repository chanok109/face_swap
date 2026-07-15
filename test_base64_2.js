const fs = require('fs');
async function test() {
  require('dotenv').config();
  const apiKey = process.env.AIFACESWAP_API_KEY;
  const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  const payload = {
    source_image_base64: b64,
    face_image_base64: b64
  };
  const res = await fetch('https://aifaceswap.io/api/aifaceswap/v1/faceswap', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  console.log(await res.text());
}
test();
