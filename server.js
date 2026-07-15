const http = require('http');
const fs = require('fs');
const path = require('path');

loadEnvFile();

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = __dirname;
const STORAGE_DIR = process.env.STORAGE_DIR || __dirname;
const GALLERY_DIR = path.join(STORAGE_DIR, 'gallery');
const STATS_FILE = path.join(STORAGE_DIR, 'data', 'stats.json');
const GALLERY_META_FILE = path.join(STORAGE_DIR, 'data', 'gallery_meta.json');

const MAX_BODY_BYTES = 12 * 1024 * 1024; // 12MB
const TASK_TIMEOUT_MS = 3 * 60 * 1000;    // 3 min timeout
const MAX_GALLERY_SIZE = 200;
const SERVER_POLL_INTERVAL = 4000;  // poll aifaceswap.io every 4s
const SERVER_POLL_MAX = 45;     // up to 45 times (~3 min)

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const GALLERY_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

/* ---- In-memory state ---- */
const results = new Map();   // taskId -> result object
let activityLog = [];        // array of log entries (max 500)
let swapStats = { totalSwaps: 0, successSwaps: 0, failedSwaps: 0 };
let galleryMeta = {};        // id -> category mapping

/* ============================================================
   Startup
   ============================================================ */
ensureDirectories();
loadStats();
loadGalleryMeta();

/* ============================================================
   Helpers
   ============================================================ */
function loadEnvFile() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

function ensureDirectories() {
  [GALLERY_DIR, path.dirname(STATS_FILE), path.join(__dirname, 'temp_faces')].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });
}

function loadStats() {
  try {
    if (fs.existsSync(STATS_FILE)) {
      const raw = fs.readFileSync(STATS_FILE, 'utf8');
      const saved = JSON.parse(raw);
      swapStats = { ...swapStats, ...(saved.stats || {}) };
      activityLog = saved.activity || [];
    }
  } catch { /* start fresh */ }
}

function saveStats() {
  try {
    fs.writeFileSync(STATS_FILE, JSON.stringify({ stats: swapStats, activity: activityLog }, null, 2));
  } catch { /* ignore */ }
}

function loadGalleryMeta() {
  try {
    if (fs.existsSync(GALLERY_META_FILE)) {
      galleryMeta = JSON.parse(fs.readFileSync(GALLERY_META_FILE, 'utf8'));
    }
  } catch { galleryMeta = {}; }
}

function saveGalleryMeta() {
  try {
    fs.writeFileSync(GALLERY_META_FILE, JSON.stringify(galleryMeta, null, 2));
  } catch { /* ignore */ }
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(payload));
}

function serveStaticFile(res, filePath) {
  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') sendJson(res, 404, { ok: false, message: 'File not found' });
      else sendJson(res, 500, { ok: false, message: 'Unable to read file' });
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(content);
  });
}

function getRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    let tooLarge = false;
    req.on('data', (chunk) => {
      if (tooLarge) return;
      body += chunk.toString();
      if (body.length > MAX_BODY_BYTES) {
        tooLarge = true;
        reject(new Error('ขนาดรูปใหญ่เกินไป กรุณาใช้รูปที่เล็กกว่านี้'));
        req.destroy();
      }
    });
    req.on('end', () => { if (!tooLarge) { try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new Error('Invalid JSON')); } } });
    req.on('error', (e) => { if (!tooLarge) reject(e); });
  });
}

function getWebhookUrl(req) {
  if (process.env.PUBLIC_BASE_URL) return `${process.env.PUBLIC_BASE_URL.replace(/\/$/, '')}/api/webhook`;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers.host;
  return `${proto}://${host}/api/webhook`;
}

function readGalleryAsDataUrl(templateId) {
  // Modified to return the relative URL path instead of a data URL
  const safeId = path.basename(templateId);
  for (const ext of GALLERY_EXTENSIONS) {
    const filePath = path.join(GALLERY_DIR, safeId + ext);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      return `/gallery/${safeId}${ext}`;
    }
  }
  return null;
}

function addActivityLog(entry) {
  activityLog.unshift({ ...entry, requestedAt: entry.requestedAt || Date.now() });
  if (activityLog.length > 500) activityLog = activityLog.slice(0, 500);
  saveStats();
}

/* ============================================================
   Route handlers
   ============================================================ */

/* GET /api/health */
function handleHealth(req, res) {
  sendJson(res, 200, {
    ok: true,
    message: 'SwapMagic AI server is running',
    apiKeyConfigured: Boolean(process.env.AIFACESWAP_API_KEY),
    timestamp: new Date().toISOString(),
  });
}

/* GET /api/gallery */
function handleGallery(req, res) {
  fs.readdir(GALLERY_DIR, (error, files) => {
    if (error) { sendJson(res, 200, { ok: true, characters: [] }); return; }
    const characters = files
      .filter(f => GALLERY_EXTENSIONS.has(path.extname(f).toLowerCase()))
      .map(f => {
        const ext = path.extname(f);
        const id = path.basename(f, ext);
        const name = id.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        const category = galleryMeta[id] || 'others';
        return { id, name, category, url: `/gallery/${f}` };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    sendJson(res, 200, { ok: true, characters });
  });
}

/* POST /api/gallery/upload */
async function handleGalleryUpload(req, res) {
  try {
    const body = await getRequestBody(req);
    const { imageData, name, category } = body;

    if (!imageData) {
      sendJson(res, 400, { ok: false, message: 'Missing imageData' });
      return;
    }

    // Validate data URL
    const match = imageData.match(/^data:(image\/(jpeg|jpg|png|webp));base64,(.+)$/);
    if (!match) {
      sendJson(res, 400, { ok: false, message: 'Invalid image format' });
      return;
    }

    // Check gallery size limit
    const existing = fs.readdirSync(GALLERY_DIR).filter(f => GALLERY_EXTENSIONS.has(path.extname(f).toLowerCase()));
    if (existing.length >= MAX_GALLERY_SIZE) {
      sendJson(res, 400, { ok: false, message: `Gallery เต็มแล้ว (สูงสุด ${MAX_GALLERY_SIZE} รูป)` });
      return;
    }

    const mimeSubtype = match[2] === 'jpg' ? 'jpeg' : match[2];
    const ext = '.' + mimeSubtype;

    let baseNameStr = name
      ? name.toLowerCase().replace(/[^a-z0-9ก-๙\s]/g, '').replace(/\s+/g, '_').slice(0, 60)
      : null;

    if (!baseNameStr) {
      const prefix = (category || 'others').toUpperCase();
      let maxNum = 0;
      const regex = new RegExp(`^${prefix}_(\\d+)$`, 'i');
      existing.forEach(f => {
        const id = path.basename(f, path.extname(f));
        const match = id.match(regex);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNum) maxNum = num;
        }
      });
      baseNameStr = `${prefix}_${maxNum + 1}`;
    }

    // Ensure unique filename
    let fileName = baseNameStr + ext;
    let filePath = path.join(GALLERY_DIR, fileName);
    let counter = 1;
    while (fs.existsSync(filePath)) {
      if (name) {
        fileName = `${baseNameStr}_${counter}${ext}`;
      } else {
        const prefix = (category || 'others').toUpperCase();
        // Since baseNameStr is e.g. EXPLORE_1, we need to extract the number and increment
        const parts = baseNameStr.split('_');
        const num = parseInt(parts.pop(), 10);
        fileName = `${prefix}_${num + counter}${ext}`;
      }
      filePath = path.join(GALLERY_DIR, fileName);
      counter++;
    }

    const buffer = Buffer.from(match[3], 'base64');
    fs.writeFileSync(filePath, buffer);

    const newId = path.basename(fileName, ext);
    if (category) {
      galleryMeta[newId] = category;
      saveGalleryMeta();
    }

    sendJson(res, 200, { ok: true, message: 'อัปโหลดสำเร็จ', id: newId, fileName });
  } catch (err) {
    sendJson(res, 500, { ok: false, message: err.message });
  }
}

/* DELETE /api/gallery/:id */
function handleGalleryDelete(req, res, galleryId) {
  const safeId = path.basename(galleryId);
  let deleted = false;

  for (const ext of GALLERY_EXTENSIONS) {
    const filePath = path.join(GALLERY_DIR, safeId + ext);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      fs.unlinkSync(filePath);
      deleted = true;
      break;
    }
  }

  if (deleted) {
    delete galleryMeta[safeId];
    saveGalleryMeta();
    sendJson(res, 200, { ok: true, message: 'ลบสำเร็จ' });
  }
  else sendJson(res, 404, { ok: false, message: 'ไม่พบรูปที่ต้องการลบ' });
}

/* ---- Server-side polling (no public webhook needed) ---- */
async function pollTaskUntilDone(taskId, apiKey, templateId) {
  let attempts = 0;

  const timer = setInterval(async () => {
    attempts++;
    try {
      // Try status endpoint pattern
      const res = await fetch(
        `https://aifaceswap.io/api/aifaceswap/v1/task_status?task_id=${encodeURIComponent(taskId)}`,
        { headers: { Authorization: `Bearer ${apiKey}` } }
      );
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { data = {}; }

      // Success: code 200 with result image
      if ((data.code === 200 || res.ok) && data.data && data.data.result_image) {
        clearInterval(timer);
        const resultImage = data.data.result_image;
        swapStats.successSwaps++;
        const entry = results.get(taskId) || {};
        results.set(taskId, { ...entry, taskId, status: 'completed', resultImage, receivedAt: Date.now() });
        updateActivityLog(taskId, 'completed', resultImage);
        saveStats();
        console.log(`[poll] Task ${taskId} completed.`);
        return;
      }

      // If still processing, data.data might have status field
      if (data.data && (data.data.status === 'failed' || data.data.status === 'error')) {
        clearInterval(timer);
        swapStats.failedSwaps++;
        const entry = results.get(taskId) || {};
        results.set(taskId, { ...entry, taskId, status: 'failed', receivedAt: Date.now() });
        updateActivityLog(taskId, 'failed');
        saveStats();
        return;
      }
    } catch (err) {
      console.warn(`[poll] Attempt ${attempts} error for ${taskId}:`, err.message);
    }

    if (attempts >= SERVER_POLL_MAX) {
      clearInterval(timer);
      const entry = results.get(taskId) || {};
      results.set(taskId, { ...entry, taskId, status: 'timeout' });
      updateActivityLog(taskId, 'timeout');
    }
  }, SERVER_POLL_INTERVAL);
}

function updateActivityLog(taskId, status, resultImage = null) {
  const idx = activityLog.findIndex(l => l.taskId === taskId);
  if (idx !== -1) {
    const updated = { ...activityLog[idx], status, receivedAt: Date.now() };
    if (resultImage) updated.resultImage = resultImage;
    activityLog[idx] = updated;
  }
}

/* POST /api/faceswap */
async function handleFaceswap(req, res) {
  try {
    const apiKey = process.env.AIFACESWAP_API_KEY;
    if (!apiKey) {
      sendJson(res, 503, { ok: false, message: 'ระบบยังไม่พร้อมใช้งาน กรุณาแจ้งผู้ดูแลให้ตั้งค่า API key ก่อนนะ' });
      return;
    }

    const body = await getRequestBody(req);
    const faceImage = body.faceImage;
    const templateId = body.templateId;

    if (!faceImage || !templateId) {
      sendJson(res, 400, { ok: false, message: 'กรุณาอัปโหลดรูปหน้าตัวเองและเลือกตัวละครก่อนนะ' });
      return;
    }

    const sourcePath = readGalleryAsDataUrl(templateId);
    if (!sourcePath) {
      sendJson(res, 404, { ok: false, message: 'ไม่พบตัวละครที่เลือก' });
      return;
    }

    // Determine Base URL (from .env or host header)
    let baseUrl = process.env.PUBLIC_BASE_URL;
    if (!baseUrl) {
      const proto = req.headers['x-forwarded-proto'] || 'https';
      const host = req.headers.host;
      baseUrl = `${proto}://${host}`;
    }
    baseUrl = baseUrl.replace(/\/$/, '');

    // Save faceImage to temp_faces
    let facePath = '';
    const match = faceImage.match(/^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/);
    if (match) {
      const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
      const buffer = Buffer.from(match[2], 'base64');
      const filename = `face_${Date.now()}_${Math.floor(Math.random() * 10000)}.${ext}`;
      fs.writeFileSync(path.join(__dirname, 'temp_faces', filename), buffer);
      facePath = `/temp_faces/${filename}`;
    } else {
      sendJson(res, 400, { ok: false, message: 'รูปแบบรูปภาพไม่ถูกต้อง' });
      return;
    }

    swapStats.totalSwaps++;
    saveStats();

    const payload = {
      source_image: `${baseUrl}${sourcePath}`,
      face_image: `${baseUrl}${facePath}`,
      webhook: `${baseUrl}/api/webhook`
    };

    const response = await fetch('https://aifaceswap.io/api/aifaceswap/v1/faceswap', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    console.log('[faceswap] API response:', JSON.stringify(data).slice(0, 300));

    if (!response.ok || data.code !== 200) {
      swapStats.failedSwaps++;
      addActivityLog({ taskId: null, status: 'failed', templateId });
      saveStats();
      sendJson(res, response.ok ? 502 : response.status, {
        ok: false,
        message: data.message || 'ขอโทษด้วยนะ สลับหน้าไม่สำเร็จ ลองอีกครั้งนะ',
        details: data,
      });
      return;
    }

    // Check if result is returned immediately (synchronous)
    const resultImage = data?.data?.result_image;
    const taskId = data?.data?.task_id;

    if (resultImage) {
      // Synchronous result — return immediately!
      swapStats.successSwaps++;
      saveStats();
      const fakeTaskId = taskId || `sync_${Date.now()}`;
      results.set(fakeTaskId, { taskId: fakeTaskId, status: 'completed', resultImage, requestedAt: Date.now(), receivedAt: Date.now() });
      addActivityLog({ taskId: fakeTaskId, status: 'completed', templateId, resultImage });
      sendJson(res, 200, { ok: true, taskId: fakeTaskId });
      return;
    }

    if (taskId) {
      const logEntry = { taskId, status: 'queued', templateId, requestedAt: Date.now() };
      results.set(taskId, logEntry);
      addActivityLog({ ...logEntry });
      // Start server-side polling — no public webhook needed
      pollTaskUntilDone(taskId, apiKey, templateId);
    }

    sendJson(res, 200, { ok: true, taskId });
  } catch (err) {
    console.error('[faceswap] Error:', err);
    sendJson(res, 500, { ok: false, message: err.message || 'เกิดข้อผิดพลาดบางอย่าง ลองใหม่อีกครั้งนะ' });
  }
}

/* POST /api/webhook */
function handleWebhook(req, res) {
  getRequestBody(req)
    .then((body) => {
      const taskId = body.task_id;
      if (!taskId) { sendJson(res, 400, { ok: false, message: 'Missing task_id' }); return; }

      const existing = results.get(taskId) || { requestedAt: Date.now() };
      const status = body.success === 1 ? 'completed' : 'failed';
      const updated = { ...existing, taskId, status, resultImage: body.result_image || null, receivedAt: Date.now() };
      results.set(taskId, updated);

      // Update stats
      if (status === 'completed') swapStats.successSwaps++;
      else swapStats.failedSwaps++;

      // Update activity log
      const idx = activityLog.findIndex(l => l.taskId === taskId);
      if (idx !== -1) {
        activityLog[idx] = { ...activityLog[idx], status, receivedAt: Date.now() };
        if (body.result_image) activityLog[idx].resultImage = body.result_image;
      }
      saveStats();

      sendJson(res, 200, { ok: true, message: 'Webhook received' });
    })
    .catch(err => sendJson(res, 400, { ok: false, message: err.message }));
}

/* GET /api/result/:taskId */
function handleResult(req, res, taskId) {
  const result = results.get(taskId);
  if (!result) { sendJson(res, 404, { ok: false, message: 'No result found yet' }); return; }
  if (result.status === 'queued' && Date.now() - result.requestedAt > TASK_TIMEOUT_MS) {
    sendJson(res, 200, { ok: true, result: { ...result, status: 'timeout' } });
    return;
  }
  sendJson(res, 200, { ok: true, result });
}

/* GET /api/stats */
function handleStats(req, res) {
  const files = fs.existsSync(GALLERY_DIR)
    ? fs.readdirSync(GALLERY_DIR).filter(f => GALLERY_EXTENSIONS.has(path.extname(f).toLowerCase())).length
    : 0;

  sendJson(res, 200, {
    ok: true,
    stats: { ...swapStats, galleryCount: files },
  });
}

/* GET /api/activity */
function handleActivityGet(req, res) {
  sendJson(res, 200, { ok: true, logs: activityLog });
}

/* DELETE /api/activity */
function handleActivityClear(req, res) {
  activityLog = [];
  swapStats = { totalSwaps: 0, successSwaps: 0, failedSwaps: 0 };
  saveStats();
  sendJson(res, 200, { ok: true, message: 'ล้างประวัติสำเร็จ' });
}

/* ============================================================
   Router
   ============================================================ */
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const { pathname, searchParams } = url;
  const method = req.method.toUpperCase();

  // ---------- API routes ----------
  // Handle both /api/... and /api.php?action=...
  let apiAction = null;
  if (pathname === '/api.php') {
    apiAction = searchParams.get('action');
  }

  if (method === 'GET' && (pathname === '/api/health' || apiAction === 'health')) { handleHealth(req, res); return; }
  if (method === 'GET' && (pathname === '/api/gallery' || apiAction === 'gallery')) { handleGallery(req, res); return; }
  if (method === 'POST' && (pathname === '/api/gallery/upload' || apiAction === 'gallery_upload')) { handleGalleryUpload(req, res); return; }
  if (method === 'GET' && (pathname === '/api/stats' || apiAction === 'stats')) { handleStats(req, res); return; }
  if (method === 'GET' && (pathname === '/api/activity' || apiAction === 'activity')) { handleActivityGet(req, res); return; }
  if (method === 'DELETE' && (pathname === '/api/activity' || apiAction === 'activity')) { handleActivityClear(req, res); return; }
  if (method === 'POST' && (pathname === '/api/faceswap' || apiAction === 'faceswap')) { handleFaceswap(req, res); return; }
  if (method === 'POST' && (pathname === '/api/webhook' || apiAction === 'webhook')) { handleWebhook(req, res); return; }

  if (method === 'GET' && (pathname.startsWith('/api/result/') || apiAction === 'result')) {
    const taskId = apiAction === 'result' ? searchParams.get('task_id') : pathname.split('/').pop();
    handleResult(req, res, taskId);
    return;
  }

  if (method === 'DELETE' && (pathname.startsWith('/api/gallery/') || apiAction === 'gallery_delete')) {
    const galleryId = apiAction === 'gallery_delete' ? searchParams.get('id') : decodeURIComponent(pathname.replace('/api/gallery/', ''));
    handleGalleryDelete(req, res, galleryId);
    return;
  }

  // ---------- Static files ----------
  let reqPath = pathname === '/' ? '/index.html' : pathname;
  
  let filePath;
  let allowedBaseDir;
  
  if (reqPath.startsWith('/gallery/')) {
    filePath = path.join(STORAGE_DIR, reqPath);
    allowedBaseDir = STORAGE_DIR;
  } else {
    filePath = path.join(__dirname, reqPath);
    allowedBaseDir = __dirname;
  }

  // Simple security check to prevent directory traversal
  if (!filePath.startsWith(allowedBaseDir) || reqPath.includes('..')) {
    sendJson(res, 403, { ok: false, message: 'Invalid path' });
    return;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    serveStaticFile(res, filePath);
  } else {
    serveStaticFile(res, path.join(__dirname, 'index.html'));
  }
});

server.listen(PORT, () => {
  console.log(`\n🎭 SwapMagic AI Server running at http://localhost:${PORT}`);
  console.log(`   📊 Admin Dashboard: http://localhost:${PORT}/admin.html`);
  if (!process.env.AIFACESWAP_API_KEY) {
    console.warn('\n⚠️  AIFACESWAP_API_KEY is not set — face swap requests will fail until configured.');
    console.warn('   Copy .env.example to .env and add your API key.\n');
  } else {
    console.log('   ✅ API Key configured\n');
  }
});
