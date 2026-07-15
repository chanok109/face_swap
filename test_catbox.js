const fs = require('fs');

async function uploadToCatbox(filePath) {
  const { File } = require('buffer');
  const buffer = fs.readFileSync(filePath);
  const file = new File([buffer], 'image.jpg', { type: 'image/jpeg' });
  const formData = new FormData();
  formData.append('reqtype', 'fileupload');
  formData.append('fileToUpload', file);
  
  const res = await fetch('https://catbox.moe/user/api.php', {
    method: 'POST',
    body: formData
  });
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  return (await res.text()).trim();
}

async function run() {
  fs.writeFileSync('test.txt', 'hello');
  console.log(await uploadToCatbox('test.txt'));
}
run();
