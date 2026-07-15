/* ================================================
   admin.js — SwapMagic AI Admin Panel
   v2 — PHP backend (api.php)
   ================================================ */

const BASE_API = 'api.php';

/* ---- Toast ---- */
const toastWrap = document.getElementById('toastWrap');
function showToast(msg, type = 'info', duration = 3500) {
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  toastWrap.appendChild(t);
  setTimeout(() => t.remove(), duration);
}

/* ---- Section navigation ---- */
function switchSection(name, btn) {
  document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(`section-${name}`).classList.add('active');
  if (btn) btn.classList.add('active');
  if (name === 'dashboard') refreshDashboard();
  if (name === 'gallery')   loadAdminGallery();
  if (name === 'activity')  loadActivity();
  if (name === 'settings')  checkApiStatus();
}

/* ---- Confirm Modal ---- */
const confirmModal = document.getElementById('confirmModal');
const modalTitle   = document.getElementById('modalTitle');
const modalBody    = document.getElementById('modalBody');
const modalCancel  = document.getElementById('modalCancel');
const modalConfirm = document.getElementById('modalConfirm');
let pendingConfirm = null;

modalCancel.addEventListener('click', () => { confirmModal.classList.remove('open'); pendingConfirm = null; });
confirmModal.addEventListener('click', (e) => { if (e.target === confirmModal) { confirmModal.classList.remove('open'); pendingConfirm = null; } });
modalConfirm.addEventListener('click', () => { if (pendingConfirm) { pendingConfirm(); pendingConfirm = null; } confirmModal.classList.remove('open'); });

function openConfirm(title, body, onConfirm) {
  modalTitle.textContent = title;
  modalBody.textContent  = body;
  pendingConfirm = onConfirm;
  confirmModal.classList.add('open');
}

/* ---- Image Modal ---- */
const imageModal = document.getElementById('imageModal');
const imageModalImg = document.getElementById('imageModalImg');
const imageModalQr = document.getElementById('imageModalQr');
const imageModalClose = document.getElementById('imageModalClose');

if (imageModalClose) {
  imageModalClose.addEventListener('click', () => imageModal.classList.remove('open'));
  imageModal.addEventListener('click', (e) => { if (e.target === imageModal) imageModal.classList.remove('open'); });
}

window.openImageModal = function(imageUrl) {
  imageModalImg.src = imageUrl;
  imageModalQr.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(imageUrl)}`;
  imageModal.classList.add('open');
};

/* ================================================
   Dashboard
   ================================================ */
async function refreshDashboard() {
  const btn = document.getElementById('refreshBtn');
  if (btn) { btn.textContent = '⏳ กำลังโหลด...'; btn.disabled = true; }
  await Promise.all([loadStats(), loadRecentActivity(), loadDashboardGalleryPreview()]);
  if (btn) { btn.textContent = '🔄 รีเฟรช'; btn.disabled = false; }
}

async function loadStats() {
  try {
    const res  = await fetch(BASE_API + '?action=stats');
    const json = await res.json();
    if (!json.ok) return;
    const { totalSwaps = 0, successSwaps = 0, failedSwaps = 0, galleryCount = 0 } = json.stats;
    animateValue('statTotal',   totalSwaps);
    animateValue('statSuccess', successSwaps);
    animateValue('statFailed',  failedSwaps);
    animateValue('statGallery', galleryCount);
  } catch {
    ['statTotal','statSuccess','statFailed','statGallery'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = '—'; });
  }
}

function animateValue(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  const start = parseInt(el.textContent) || 0;
  const diff  = target - start;
  const dur   = 600;
  const t0    = performance.now();
  function step(now) {
    const t = Math.min((now - t0) / dur, 1);
    el.textContent = Math.round(start + diff * (1 - Math.pow(1 - t, 3)));
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

async function loadRecentActivity() {
  const wrap = document.getElementById('recentActivityTable');
  if (!wrap) return;
  try {
    const res  = await fetch(BASE_API + '?action=activity');
    const json = await res.json();
    renderActivityTable(wrap, (json.logs || []).slice(0, 5));
  } catch { wrap.innerHTML = '<p style="color:var(--text-muted);padding:16px;">โหลดข้อมูลไม่ได้</p>'; }
}

async function loadDashboardGalleryPreview() {
  const wrap = document.getElementById('dashboardGalleryPreview');
  if (!wrap) return;
  try {
    const res  = await fetch(BASE_API + '?action=gallery');
    const json = await res.json();
    const chars = (json.characters || []).slice(0, 6);
    if (chars.length === 0) {
      wrap.innerHTML = '<div class="empty-state" style="grid-column:1/-1;"><div class="empty-icon">🖼️</div><p>ยังไม่มีตัวละคร</p></div>';
      return;
    }
    wrap.innerHTML = chars.map(c => `
      <div class="gallery-admin-item" title="${c.name}">
        <img src="${c.url}" alt="${c.name}" loading="lazy" />
        <div class="gallery-admin-item-name">${c.name}</div>
      </div>`).join('');
  } catch {}
}

/* ================================================
   Activity Log
   ================================================ */
async function loadActivity() {
  const wrap = document.getElementById('activityTableWrap');
  if (!wrap) return;
  wrap.innerHTML = '<p style="color:var(--text-muted);padding:20px;">กำลังโหลด...</p>';
  try {
    const res  = await fetch(BASE_API + '?action=activity');
    const json = await res.json();
    renderActivityTable(wrap, json.logs || []);
  } catch { wrap.innerHTML = '<p style="color:var(--text-muted);padding:20px;">โหลดข้อมูลไม่ได้</p>'; }
}

function renderActivityTable(wrap, logs) {
  if (logs.length === 0) {
    wrap.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><p>ยังไม่มีประวัติการใช้งาน</p></div>';
    return;
  }
  wrap.innerHTML = `
    <table class="data-table">
      <thead><tr><th>ผลลัพธ์</th><th>Task ID</th><th>สถานะ</th><th>ตัวละคร</th><th>เวลา</th></tr></thead>
      <tbody>
        ${logs.map(log => `
          <tr>
            <td>
              ${log.resultImage ? `
                <img src="${log.resultImage}" style="width: 48px; height: 48px; object-fit: cover; border-radius: 6px; cursor: pointer; border: 1px solid var(--border);" onclick="openImageModal('${log.resultImage}')" title="คลิกเพื่อดูรูปใหญ่และ QR Code" />
              ` : '—'}
            </td>
            <td style="font-family:monospace;font-size:0.78rem;color:var(--text-muted);">${truncate(log.taskId || '—', 12)}</td>
            <td>${statusBadge(log.status)}</td>
            <td>${log.templateId || '—'}</td>
            <td>${formatTime(log.requestedAt)}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

function statusBadge(status) {
  const map = {
    completed: '<span class="badge badge-success">✅ สำเร็จ</span>',
    failed:    '<span class="badge badge-danger">❌ ล้มเหลว</span>',
    queued:    '<span class="badge badge-warning">⏳ รอคิว</span>',
    timeout:   '<span class="badge badge-danger">⏱️ หมดเวลา</span>',
  };
  return map[status] || `<span class="badge badge-info">${status}</span>`;
}

function truncate(str, n) { return str && str.length > n ? str.slice(0, n) + '…' : (str || '—'); }
function formatTime(ts) {
  if (!ts) return '—';
  const d = new Date(typeof ts === 'number' && ts < 1e12 ? ts * 1000 : ts);
  return d.toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });
}

async function clearActivity() {
  openConfirm('🗑️ ล้างประวัติ?', 'ต้องการล้างประวัติการใช้งานทั้งหมดใช่ไหม?', async () => {
    try {
      const res  = await fetch(BASE_API + '?action=activity', { method: 'DELETE' });
      const json = await res.json();
      if (json.ok) { showToast('ล้างประวัติสำเร็จ', 'success'); loadActivity(); loadStats(); }
    } catch { showToast('เกิดข้อผิดพลาด', 'error'); }
  });
}

/* ================================================
   Gallery Management
   ================================================ */
const CATEGORY_NAMES = {
  superheroes: '🦸‍♂️ ฮีโร่และผู้พิทักษ์',
  princesses: '👸 เจ้าหญิงและเทพนิยาย',
  careers: '👨‍🚀 อาชีพในฝัน',
  magic: '🧙‍♂️ เวทมนตร์และแฟนตาซี',
  animals: '🐯 สัตว์โลกน่ารัก',
  traditional: '🇹🇭 วัฒนธรรมและชุดประจำชาติ',
  explore: '🚀 EXPLORE',
  discover: '🔬 DISCOVER',
  universe: '🛸 Universe',
  others: 'อื่นๆ'
};

let pendingFiles = [];
let currentUploadCategory = 'others';

async function loadAdminGallery() {
  const container = document.getElementById('adminCategoriesContainer');
  if (!container) return;
  container.innerHTML = '<div class="empty-state"><div class="empty-icon">⏳</div><p>กำลังโหลด...</p></div>';
  try {
    const res  = await fetch(BASE_API + '?action=gallery');
    const json = await res.json();
    const chars = json.characters || [];
    
    // Group characters by category
    const grouped = {};
    Object.keys(CATEGORY_NAMES).forEach(k => grouped[k] = []);
    chars.forEach(c => {
      const cat = c.category || 'others';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(c);
    });

    let html = '';
    Object.keys(CATEGORY_NAMES).forEach(catKey => {
      const catChars = grouped[catKey] || [];
      html += `
        <div class="admin-card">
          <div class="admin-card-header">
            <span class="admin-card-title">${CATEGORY_NAMES[catKey]} (${catChars.length} รูป)</span>
            <button class="btn btn-secondary" onclick="triggerCategoryUpload('${catKey}')">➕ อัปโหลดลงหมวดนี้</button>
          </div>
          <div class="gallery-admin-grid">
            ${catChars.length === 0 ? '<p style="color:var(--text-muted);font-size:0.85rem;grid-column:1/-1;">ไม่มีรูปในหมวดหมู่นี้</p>' : ''}
            ${catChars.map(c => `
              <div class="gallery-admin-item" id="gitem-${c.id}">
                <img src="${c.url}" alt="${c.name}" loading="lazy" />
                <div class="gallery-admin-item-overlay">
                  <button class="btn btn-danger" style="font-size:0.78rem;padding:6px 12px;" onclick="deleteCharacter('${c.id}','${c.name}')">🗑️ ลบ</button>
                </div>
                <div class="gallery-admin-item-name">${c.name}</div>
              </div>`).join('')}
          </div>
        </div>
      `;
    });
    
    container.innerHTML = html;
  } catch { container.innerHTML = '<p class="loading-text">โหลดไม่ได้ ลองรีเฟรชใหม่</p>'; }
}

/* Upload zone */
const categoryFileInput = document.getElementById('categoryFileInput');
const categoryUploadModal = document.getElementById('categoryUploadModal');

if (categoryFileInput) {
  categoryFileInput.addEventListener('change', () => handleAdminFiles(Array.from(categoryFileInput.files)));
}

function triggerCategoryUpload(categoryKey) {
  currentUploadCategory = categoryKey;
  if (categoryFileInput) {
    categoryFileInput.value = '';
    categoryFileInput.click();
  }
}

function handleAdminFiles(files) {
  const imageFiles = files.filter(f => f.type.startsWith('image/'));
  if (!imageFiles.length) { showToast('ขอเป็นไฟล์รูปภาพนะ', 'error'); return; }
  pendingFiles = imageFiles;
  
  const previewItems = document.getElementById('categoryUploadPreviewItems');
  previewItems.innerHTML = '';
  
  imageFiles.forEach(f => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const el = document.createElement('div');
      el.style.cssText = 'position:relative;width:80px;height:80px;border-radius:8px;overflow:hidden;border:2px solid var(--border);';
      el.innerHTML = `<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover;" /><div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.7);font-size:0.6rem;padding:2px 4px;text-align:center;color:white;">${truncate(f.name, 10)}</div>`;
      previewItems.appendChild(el);
    };
    reader.readAsDataURL(f);
  });
  
  document.getElementById('uploadModalTitle').textContent = `อัปโหลดรูปลงหมวด: ${CATEGORY_NAMES[currentUploadCategory]}`;
  categoryUploadModal.classList.add('open');
}

async function confirmCategoryUpload() {
  if (!pendingFiles.length) return;
  const progress    = document.getElementById('categoryUploadProgress');
  const progressBar = document.getElementById('categoryUploadProgressBar');
  const progressTxt = document.getElementById('categoryUploadProgressText');
  progress.style.display = 'block';
  
  let done = 0;
  for (const file of pendingFiles) {
    const customName = pendingFiles.length === 1 ? (document.getElementById('categoryUploadName').value.trim() || null) : null;
    try {
      const dataUrl = await fileToDataUrl(file);
      const res = await fetch(BASE_API + '?action=gallery_upload', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageData: dataUrl, name: customName, category: currentUploadCategory }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.message || 'อัปโหลดไม่สำเร็จ');
    } catch (err) { showToast(`${file.name}: ${err.message}`, 'error'); }
    done++;
    progressBar.style.width = Math.round((done / pendingFiles.length) * 100) + '%';
    progressTxt.textContent = `อัปโหลด ${done}/${pendingFiles.length} รูป...`;
  }
  
  progress.style.display = 'none';
  progressBar.style.width = '0%';
  showToast(`อัปโหลด ${done} รูปสำเร็จ! 🎉`, 'success');
  cancelCategoryUpload();
  loadAdminGallery();
}

function cancelCategoryUpload() {
  pendingFiles = [];
  document.getElementById('categoryUploadPreviewItems').innerHTML = '';
  document.getElementById('categoryUploadName').value = '';
  if (categoryFileInput) categoryFileInput.value = '';
  categoryUploadModal.classList.remove('open');
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload  = () => resolve(r.result);
    r.onerror = () => reject(new Error('อ่านไฟล์ไม่ได้'));
    r.readAsDataURL(file);
  });
}

async function deleteCharacter(id, name) {
  openConfirm('🗑️ ลบตัวละคร?', `ต้องการลบ "${name}" ออกจาก Gallery ใช่ไหม?`, async () => {
    try {
      const res  = await fetch(BASE_API + '?action=gallery_delete&id=' + encodeURIComponent(id), { method: 'DELETE' });
      const json = await res.json();
      if (json.ok) {
        showToast(`ลบ "${name}" สำเร็จ`, 'success');
        const el = document.getElementById('gitem-' + id);
        if (el) el.remove();
        const cnt = document.getElementById('galleryCountLabel');
        if (cnt) cnt.textContent = Math.max(0, parseInt(cnt.textContent || 0) - 1);
      } else { showToast(json.message || 'ลบไม่สำเร็จ', 'error'); }
    } catch { showToast('เกิดข้อผิดพลาด', 'error'); }
  });
}

/* ================================================
   API Status
   ================================================ */
async function checkApiStatus() {
  const dot    = document.getElementById('apiStatusDot');
  const text   = document.getElementById('apiStatusText');
  const detail = document.getElementById('apiStatusDetail');
  try {
    const res  = await fetch(BASE_API + '?action=health');
    const json = await res.json();
    if (json.ok) {
      if (dot)  { dot.classList.add('online'); dot.classList.remove('offline'); }
      if (text) text.textContent = 'Server ออนไลน์';
      if (detail) {
        detail.innerHTML = json.apiKeyConfigured
          ? '<span style="color:var(--accent);">✅ API Key ตั้งค่าแล้ว — พร้อมใช้งาน</span>'
          : '<span style="color:var(--warning);">⚠️ ยังไม่มี API Key — กรุณาตั้งค่าใน config.php</span>';
      }
    }
  } catch {
    if (dot)  { dot.classList.add('offline'); dot.classList.remove('online'); }
    if (text) text.textContent = 'Server ออฟไลน์';
    if (detail) detail.innerHTML = '<span style="color:var(--danger);">❌ ไม่สามารถเชื่อมต่อ Server ได้</span>';
  }
}

/* ================================================ Init */
refreshDashboard();
checkApiStatus();
