<?php
/**
 * SwapMagic AI — config.php
 * ตั้งค่า API Key ที่นี่
 */

define('AIFACESWAP_API_KEY', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIzNTc5MjQzIiwibmFtZSI6ImFpZmFjZXN3YXAiLCJpYXQiOjE3ODM5MTQ2MTZ9.h6XwSk1_rptk0nZPWp4TyVJOlAvT43_tzPQKz8uZmpc');

// URL สาธารณะของเว็บ (สำหรับ webhook) — ไม่ต้องมี trailing slash
define('PUBLIC_BASE_URL', 'https://www.pcccr.ac.th/pcshscr2/Face_Swap/public');

// โฟลเดอร์ gallery (relative จากไฟล์นี้)
define('GALLERY_DIR', __DIR__ . '/gallery');

// ไฟล์เก็บสถิติ
define('STATS_FILE', __DIR__ . '/data/stats.json');

// ไฟล์เก็บ task results (แทน in-memory)
define('RESULTS_FILE', __DIR__ . '/data/results.json');

// ขนาดสูงสุดของรูป (bytes) 12MB
define('MAX_IMAGE_BYTES', 12 * 1024 * 1024);
