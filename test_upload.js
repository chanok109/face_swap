const fs = require('fs');

async function uploadTo0x0(filePath) {
  const { File } = require('buffer');
  const buffer = fs.readFileSync(filePath);
  const file = new File([buffer], 'image.jpg', { type: 'image/jpeg' });
  const formData = new FormData();
  formData.append('file', file);
  
  const res = await fetch('https://0x0.st', {
    method: 'POST',
    body: formData
  });
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  return (await res.text()).trim();
}

async function run() {
  fs.writeFileSync('test.txt', 'hello');
  console.log(await uploadTo0x0('test.txt'));
}
run();
