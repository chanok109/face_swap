/* ================================================
   app.js — SwapMagic AI User Frontend
   v3 — PHP backend (api.php)
   ================================================ */

const MAX_DIMENSION    = 1024;
const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ATTEMPTS = 60;

// Detect base path (works on both localhost and subdirectory server)
const BASE_API = 'api.php';

/* ---- DOM refs ---- */
const panels   = {
  1: document.getElementById('panel-1'),
  2: document.getElementById('panel-2'),
  3: document.getElementById('panel-3'),
};
const dot1   = document.getElementById('dot1');
const dot2   = document.getElementById('dot2');
const dot3   = document.getElementById('dot3');
const line12 = document.getElementById('line12');
const line23 = document.getElementById('line23');

/* Step 1 */
const openCameraBtn   = document.getElementById('openCameraBtn');
const pickFileBtn     = document.getElementById('pickFileBtn');
const selfieInput     = document.getElementById('selfieInput');
const previewSection  = document.getElementById('previewSection');
const selfiePreview   = document.getElementById('selfiePreview');
const changePhotoBtn  = document.getElementById('changePhotoBtn');
const dropZone        = document.getElementById('dropZone');
const toStep2         = document.getElementById('toStep2');
const uploadChoiceRow = document.getElementById('uploadChoiceRow');

/* Camera modal */
const cameraModal   = document.getElementById('cameraModal');
const cameraVideo   = document.getElementById('cameraVideo');
const cameraCanvas  = document.getElementById('cameraCanvas');
const cameraClose   = document.getElementById('cameraClose');
const captureBtn    = document.getElementById('captureBtn');
const flipCameraBtn = document.getElementById('flipCameraBtn');

/* Step 2 */
const galleryGrid = document.getElementById('galleryGrid');
const backTo1     = document.getElementById('backTo1');
const toSwap      = document.getElementById('toSwap');
const categoryBtns = document.querySelectorAll('.category-btn');

/* Step 3 */
const resultTitle    = document.getElementById('resultTitle');
const loader         = document.getElementById('loader');
const loadingMessage = document.getElementById('loadingMessage');
const resultView     = document.getElementById('resultView');
const resultImage    = document.getElementById('resultImage');
const downloadBtn    = document.getElementById('downloadBtn');
const errorView      = document.getElementById('errorView');
const errorMessage   = document.getElementById('errorMessage');
const tryAgainBtn    = document.getElementById('tryAgainBtn');
const homeBtn        = document.getElementById('homeBtn');
const retryBtn       = document.getElementById('retryBtn');
const toastWrap      = document.getElementById('toastWrap');
const qrCodeWrap     = document.getElementById('qrCodeWrap');
const qrCodeImage    = document.getElementById('qrCodeImage');

/* ---- State ---- */
let selfieDataUrl     = null;
let selectedCharacter = null;
let characters        = [];
let currentCategory   = 'all';
let pollTimer         = null;
let messageTimer      = null;
let cameraStream      = null;
let facingMode        = 'user';

const LOADING_MESSAGES = [
  'รอแป๊บนึงนะ กำลังทำเวทมนตร์อยู่... 🪄',
  'กำลังผสมหน้าเข้าด้วยกัน... 🎨',
  'AI กำลังทำงานอยู่ รอนิดนึง... 🤖',
  'อีกนิดเดียวเสร็จแล้ว... ✨',
  'ใกล้เสร็จแล้วนะ รอสักครู่... 🌟',
  'สวยมากแน่ๆ เลย... 💎',
];

/* ================================================ Toast */
function showToast(msg, type = 'info', duration = 3500) {
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  toastWrap.appendChild(t);
  setTimeout(() => t.remove(), duration);
}

/* ================================================ Stepper */
function showPanel(step) {
  Object.entries(panels).forEach(([k, el]) => {
    el.dataset.active = String(Number(k) === step);
  });
  [dot1, dot2, dot3].forEach((d, i) => {
    d.classList.toggle('active', i + 1 === step);
    d.classList.toggle('done',   i + 1 <  step);
  });
  line12.classList.toggle('done', step > 1);
  line23.classList.toggle('done', step > 2);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ================================================ Image */
function resizeImageToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => {
      img.onload = () => {
        let { width, height } = img;
        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
          const scale = MAX_DIMENSION / Math.max(width, height);
          width  = Math.round(width  * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.87));
      };
      img.onerror = () => reject(new Error('อ่านรูปไม่ได้ ลองรูปอื่นดูนะ'));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error('อ่านไฟล์ไม่ได้'));
    reader.readAsDataURL(file);
  });
}

function setPhotoPreview(dataUrl) {
  selfieDataUrl = dataUrl;
  selfiePreview.src = dataUrl;
  previewSection.style.display = '';
  uploadChoiceRow.style.display = 'none';
  dropZone.style.display = 'none';
  toStep2.disabled = false;
  showToast('ได้รูปแล้ว! กด "ต่อไป" ได้เลย 🎉', 'success');
}

/* ================================================ File picker */
pickFileBtn.addEventListener('click', () => selfieInput.click());
selfieInput.addEventListener('change', async () => {
  const file = selfieInput.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) { showToast('ขอเป็นไฟล์รูปภาพนะ', 'error'); return; }
  try { setPhotoPreview(await resizeImageToDataUrl(file)); } catch (e) { showToast(e.message, 'error'); }
});

changePhotoBtn.addEventListener('click', () => {
  selfieDataUrl = null;
  toStep2.disabled = true;
  previewSection.style.display = 'none';
  uploadChoiceRow.style.display = '';
  dropZone.style.display = '';
  selfieInput.value = '';
});

/* ================================================ Drag & Drop */
dropZone.addEventListener('dragover',  (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', async (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (!file || !file.type.startsWith('image/')) { showToast('ขอเป็นไฟล์รูปภาพนะ', 'error'); return; }
  try { setPhotoPreview(await resizeImageToDataUrl(file)); } catch (e) { showToast(e.message, 'error'); }
});

/* ================================================ Camera */
async function startCamera() {
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode, width: { ideal: 1280 }, height: { ideal: 960 } },
      audio: false,
    });
    cameraVideo.srcObject = cameraStream;
    cameraModal.classList.add('open');
  } catch (err) {
    if (err.name === 'NotAllowedError') {
      showToast('ไม่ได้รับสิทธิ์กล้อง — ลองเลือกรูปแทนนะ', 'error');
    } else {
      showToast('เปิดกล้องไม่ได้ กำลังเปิดตัวเลือกรูปแทน...', 'info');
      const fb = document.createElement('input');
      fb.type = 'file'; fb.accept = 'image/*'; fb.capture = 'user';
      fb.addEventListener('change', async () => {
        if (!fb.files[0]) return;
        try { setPhotoPreview(await resizeImageToDataUrl(fb.files[0])); } catch (e) { showToast(e.message, 'error'); }
      });
      fb.click();
    }
  }
}

function stopCamera() {
  if (cameraStream) { cameraStream.getTracks().forEach(t => t.stop()); cameraStream = null; }
  cameraVideo.srcObject = null;
  cameraModal.classList.remove('open');
}

openCameraBtn.addEventListener('click', startCamera);
cameraClose.addEventListener('click', stopCamera);
cameraModal.addEventListener('click', (e) => { if (e.target === cameraModal) stopCamera(); });

captureBtn.addEventListener('click', () => {
  const w = cameraVideo.videoWidth || 640;
  const h = cameraVideo.videoHeight || 480;
  cameraCanvas.width = w; cameraCanvas.height = h;
  const ctx = cameraCanvas.getContext('2d');
  ctx.save(); ctx.translate(w, 0); ctx.scale(-1, 1);
  ctx.drawImage(cameraVideo, 0, 0, w, h); ctx.restore();
  const img = new Image();
  img.onload = () => {
    let nw = img.naturalWidth, nh = img.naturalHeight;
    if (nw > MAX_DIMENSION || nh > MAX_DIMENSION) {
      const sc = MAX_DIMENSION / Math.max(nw, nh);
      cameraCanvas.width = Math.round(nw * sc); cameraCanvas.height = Math.round(nh * sc);
      cameraCanvas.getContext('2d').drawImage(img, 0, 0, cameraCanvas.width, cameraCanvas.height);
    }
    stopCamera();
    setPhotoPreview(cameraCanvas.toDataURL('image/jpeg', 0.87));
  };
  img.src = cameraCanvas.toDataURL('image/jpeg', 0.9);
});

flipCameraBtn.addEventListener('click', async () => {
  facingMode = facingMode === 'user' ? 'environment' : 'user';
  stopCamera(); await startCamera();
});

/* ================================================ Step nav */
toStep2.addEventListener('click', () => { showPanel(2); if (characters.length === 0) loadGallery(); });
backTo1.addEventListener('click', () => showPanel(1));
tryAgainBtn.addEventListener('click', () => showPanel(2));
homeBtn.addEventListener('click', () => {
  showPanel(1);
  changePhotoBtn.click();
});
retryBtn.addEventListener('click',    () => showPanel(2));

/* ================================================ Gallery */
categoryBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    categoryBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentCategory = btn.dataset.category;
    renderGallery();
  });
});

function renderGallery() {
  galleryGrid.innerHTML = '';
  const filtered = currentCategory === 'all' 
    ? characters 
    : characters.filter(c => c.category === currentCategory);

  if (filtered.length === 0) {
    galleryGrid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;"><div class="empty-icon">🖼️</div><p>ยังไม่มีตัวละครในหมวดหมู่นี้</p></div>';
    return;
  }

  filtered.forEach((char) => {
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'gallery-item'; btn.dataset.id = char.id;
    if (selectedCharacter === char.id) btn.classList.add('selected');
    btn.innerHTML = `<img src="${char.url}" alt="${char.name}" loading="lazy" /><span>${char.name}</span>`;
    btn.addEventListener('click', () => { 
      selectedCharacter = char.id; 
      document.querySelectorAll('.gallery-item').forEach(e => e.classList.remove('selected')); 
      btn.classList.add('selected'); 
      toSwap.disabled = false; 
    });
    galleryGrid.appendChild(btn);
  });
}

async function loadGallery() {
  galleryGrid.innerHTML = '<p class="loading-text">⏳ กำลังโหลดตัวละคร...</p>';
  selectedCharacter = null; toSwap.disabled = true;
  try {
    const res  = await fetch(BASE_API + '?action=gallery');
    const json = await res.json();
    characters = json.characters || [];
    if (characters.length === 0) {
      galleryGrid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;"><div class="empty-icon">🖼️</div><p>ยังไม่มีตัวละครให้เลือก<br>ผู้ดูแลต้องเพิ่มรูปก่อนนะ</p></div>';
      return;
    }
    renderGallery();
  } catch {
    galleryGrid.innerHTML = '<p class="loading-text">⚠️ โหลดตัวละครไม่ได้ ลองรีเฟรชหน้าดูนะ</p>';
  }
}

toSwap.addEventListener('click', startSwap);

/* ================================================ Face Swap */
async function startSwap() {
  showPanel(3);
  resultTitle.textContent = '⏳ กำลังสลับหน้า...';
  loader.hidden = false; resultView.hidden = true; errorView.hidden = true;
  if (qrCodeWrap) qrCodeWrap.style.display = 'none';
  let msgIdx = 0;
  loadingMessage.textContent = LOADING_MESSAGES[0];
  messageTimer = setInterval(() => { msgIdx = (msgIdx + 1) % LOADING_MESSAGES.length; loadingMessage.textContent = LOADING_MESSAGES[msgIdx]; }, 3000);
  try {
    const res  = await fetch(BASE_API + '?action=faceswap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ faceImage: selfieDataUrl, templateId: selectedCharacter }),
    });
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch (parseErr) {
      const cleanText = text.replace(/<[^>]*>?/gm, '').substring(0, 100).trim();
      throw new Error(`Server Error (${res.status}): ${cleanText || 'Invalid JSON'}`);
    }
    if (!res.ok || !json.ok || !json.taskId) throw new Error(json.message || 'สลับหน้าไม่สำเร็จ ลองใหม่นะ');
    pollForResult(json.taskId);
  } catch (err) { clearInterval(messageTimer); showError(err.message); }
}

function pollForResult(taskId) {
  let attempts = 0;
  pollTimer = setInterval(async () => {
    attempts++;
    try {
      const res  = await fetch(BASE_API + '?action=result&task_id=' + encodeURIComponent(taskId));
      const json = await res.json();
      if (json.ok && json.result) {
        const { status, resultImage: img } = json.result;
        if (status === 'completed' && img) { clearAll(); showResult(img); return; }
        if (status === 'failed')           { clearAll(); showError('สลับหน้าไม่สำเร็จ ลองรูปอื่นดูนะ'); return; }
        if (status === 'timeout')          { clearAll(); showError('รอนานเกินไปหน่อยนะ ลองใหม่อีกครั้ง'); return; }
      }
    } catch { /* network hiccup */ }
    if (attempts >= POLL_MAX_ATTEMPTS) { clearAll(); showError('รอนานเกินไปหน่อยนะ ลองใหม่อีกครั้ง'); }
  }, POLL_INTERVAL_MS);
}

function clearAll() { clearInterval(pollTimer); clearInterval(messageTimer); }

function showResult(imageUrl) {
  resultTitle.textContent = '🎉 เสร็จแล้ว!';
  loader.hidden = true; errorView.hidden = true; resultView.hidden = false;
  resultImage.src = imageUrl; downloadBtn.href = imageUrl;
  
  if (qrCodeWrap && qrCodeImage) {
    qrCodeImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(imageUrl)}`;
    qrCodeWrap.style.display = 'block';
  }

  showToast('สลับหน้าสำเร็จ! 🎉 กดบันทึกรูปได้เลย', 'success', 5000);
}

function showError(msg) {
  resultTitle.textContent = '😅 อุ๊ปส์!';
  loader.hidden = true; resultView.hidden = true; errorView.hidden = false;
  if (qrCodeWrap) qrCodeWrap.style.display = 'none';
  errorMessage.textContent = msg; showToast(msg, 'error');
}
