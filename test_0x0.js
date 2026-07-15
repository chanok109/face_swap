const fs = require('fs');
const { execSync } = require('child_process');

// create a dummy image
fs.writeFileSync('dummy.txt', 'hello world');
try {
  const url = execSync('curl -s -F "file=@dummy.txt" https://0x0.st').toString().trim();
  console.log("Uploaded to:", url);
} catch (e) {
  console.error("Failed:", e.message);
}
