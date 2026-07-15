<?php
/**
 * SwapMagic AI — api.php
 * PHP backend (Compatible with PHP 5.6+)
 */

@ini_set('display_errors', 0);
@ini_set('log_errors', 1);
error_reporting(E_ALL);

ob_start();

require_once dirname(__FILE__) . '/config.php';

// -------------------- CORS & Headers --------------------
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { ob_end_clean(); http_response_code(200); exit; }

// -------------------- Helper: send JSON --------------------
function sendJson($code, $payload) {
    ob_end_clean();
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

// -------------------- Helper: ensure dirs exist --------------------
function ensureDirs() {
    $dirs = array(GALLERY_DIR, dirname(STATS_FILE), dirname(RESULTS_FILE));
    foreach ($dirs as $d) {
        if (!is_dir($d)) @mkdir($d, 0755, true);
    }
    if (!file_exists(STATS_FILE)) {
        @file_put_contents(STATS_FILE, json_encode(array('stats'=>array('totalSwaps'=>0,'successSwaps'=>0,'failedSwaps'=>0),'activity'=>array()), JSON_PRETTY_PRINT));
    }
    if (!file_exists(RESULTS_FILE)) {
        @file_put_contents(RESULTS_FILE, '{}');
    }
}
ensureDirs();

// -------------------- Stats helpers --------------------
function loadStats() {
    if (!file_exists(STATS_FILE)) return array('totalSwaps'=>0,'successSwaps'=>0,'failedSwaps'=>0);
    $data = @json_decode(@file_get_contents(STATS_FILE), true);
    return isset($data['stats']) && $data['stats'] ? $data['stats'] : array('totalSwaps'=>0,'successSwaps'=>0,'failedSwaps'=>0);
}
function saveStats($stats) {
    $activity = loadActivity();
    @file_put_contents(STATS_FILE, json_encode(array('stats'=>$stats,'activity'=>$activity), JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE), LOCK_EX);
}
function loadActivity() {
    if (!file_exists(STATS_FILE)) return array();
    $data = @json_decode(@file_get_contents(STATS_FILE), true);
    return isset($data['activity']) ? $data['activity'] : array();
}
function addActivity($entry) {
    $stats    = loadStats();
    $activity = loadActivity();
    if (!isset($entry['requestedAt'])) $entry['requestedAt'] = time() * 1000;
    array_unshift($activity, $entry);
    if (count($activity) > 500) $activity = array_slice($activity, 0, 500);
    @file_put_contents(STATS_FILE, json_encode(array('stats'=>$stats,'activity'=>$activity), JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE), LOCK_EX);
}
function updateActivity($taskId, $status) {
    $stats    = loadStats();
    $activity = loadActivity();
    foreach ($activity as &$log) {
        $logId = isset($log['taskId']) ? $log['taskId'] : '';
        if ($logId === $taskId) {
            $log['status']     = $status;
            $log['receivedAt'] = time() * 1000;
            break;
        }
    }
    @file_put_contents(STATS_FILE, json_encode(array('stats'=>$stats,'activity'=>$activity), JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE), LOCK_EX);
}

// -------------------- Results store --------------------
function loadResults() {
    if (!file_exists(RESULTS_FILE)) return array();
    $results = @json_decode(@file_get_contents(RESULTS_FILE), true);
    return $results ? $results : array();
}
function saveResult($taskId, $data) {
    $results = loadResults();
    $results[$taskId] = $data;
    if (count($results) > 200) {
        $results = array_slice($results, -200, null, true);
    }
    @file_put_contents(RESULTS_FILE, json_encode($results, JSON_UNESCAPED_UNICODE), LOCK_EX);
}
function getResult($taskId) {
    $results = loadResults();
    return isset($results[$taskId]) ? $results[$taskId] : null;
}

// -------------------- Gallery helpers --------------------
$GALLERY_EXTS = array('jpg','jpeg','png','webp');

function getGalleryFiles() {
    global $GALLERY_EXTS;
    if (!is_dir(GALLERY_DIR)) return array();
    $files = scandir(GALLERY_DIR);
    $out   = array();
    foreach ($files as $f) {
        $ext = strtolower(pathinfo($f, PATHINFO_EXTENSION));
        if (!in_array($ext, $GALLERY_EXTS)) continue;
        $id   = pathinfo($f, PATHINFO_FILENAME);
        $name = ucwords(str_replace(array('_','-'), ' ', $id));
        $out[] = array('id' => $id, 'name' => $name, 'url' => 'gallery/' . $f);
    }
    usort($out, function($a, $b) {
        return strcmp($a['name'], $b['name']);
    });
    return $out;
}

function galleryFileToDataUrl($templateId) {
    global $GALLERY_EXTS;
    $safe = basename($templateId);
    foreach ($GALLERY_EXTS as $ext) {
        $path = GALLERY_DIR . '/' . $safe . '.' . $ext;
        if (file_exists($path) && is_file($path)) {
            $mime = in_array($ext, array('jpg','jpeg')) ? 'image/jpeg' : 'image/'.$ext;
            return 'data:'.$mime.';base64,'.base64_encode(file_get_contents($path));
        }
    }
    return null;
}

// -------------------- Router --------------------
$method    = $_SERVER['REQUEST_METHOD'];
$action    = isset($_GET['action']) ? $_GET['action'] : '';
$taskParam = isset($_GET['task_id']) ? $_GET['task_id'] : '';

// GET /api.php?action=health
if ($method === 'GET' && $action === 'health') {
    sendJson(200, array(
        'ok'               => true,
        'message'          => 'SwapMagic AI PHP server is running',
        'apiKeyConfigured' => !empty(AIFACESWAP_API_KEY),
        'timestamp'        => date('c'),
    ));
}

// GET /api.php?action=gallery
if ($method === 'GET' && $action === 'gallery') {
    sendJson(200, array('ok' => true, 'characters' => getGalleryFiles()));
}

// GET /api.php?action=stats
if ($method === 'GET' && $action === 'stats') {
    $stats  = loadStats();
    $files  = getGalleryFiles();
    $stats['galleryCount'] = count($files);
    sendJson(200, array('ok' => true, 'stats' => $stats));
}

// GET /api.php?action=activity
if ($method === 'GET' && $action === 'activity') {
    sendJson(200, array('ok' => true, 'logs' => loadActivity()));
}

// DELETE /api.php?action=activity
if ($method === 'DELETE' && $action === 'activity') {
    file_put_contents(STATS_FILE, json_encode(array(
        'stats'    => array('totalSwaps'=>0,'successSwaps'=>0,'failedSwaps'=>0),
        'activity' => array(),
    ), JSON_PRETTY_PRINT), LOCK_EX);
    file_put_contents(RESULTS_FILE, json_encode(array()), LOCK_EX);
    sendJson(200, array('ok' => true, 'message' => 'ล้างประวัติสำเร็จ'));
}

// GET /api.php?action=result&task_id=xxx
if ($method === 'GET' && $action === 'result' && $taskParam) {
    $result = getResult($taskParam);
    if (!$result) {
        sendJson(404, array('ok' => false, 'message' => 'No result found yet'));
    }
    
    $status = isset($result['status']) ? $result['status'] : '';
    
    // If still queued, check the actual API (fallback for blocked webhooks)
    if ($status === 'queued') {
        $apiKey = AIFACESWAP_API_KEY;
        if (!empty($apiKey)) {
            $ch = curl_init('https://aifaceswap.io/api/aifaceswap/v1/task_status?task_id=' . urlencode($taskParam));
            curl_setopt_array($ch, array(
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT        => 10,
                CURLOPT_SSL_VERIFYPEER => false,
                CURLOPT_SSL_VERIFYHOST => false,
                CURLOPT_HTTPHEADER     => array(
                    'Authorization: Bearer ' . $apiKey
                ),
            ));
            $resp = curl_exec($ch);
            curl_close($ch);
            
            if ($resp) {
                $data = json_decode($resp, true);
                $code = isset($data['code']) ? $data['code'] : 0;
                if ($code === 200 && isset($data['data']) && isset($data['data']['status'])) {
                    $remoteStatus = $data['data']['status'];
                    if ($remoteStatus === 1) {
                        $result['status'] = 'completed';
                        $result['resultImage'] = isset($data['data']['result_image']) ? $data['data']['result_image'] : null;
                        $result['receivedAt'] = time() * 1000;
                        saveResult($taskParam, $result);
                        
                        $stats = loadStats();
                        $stats['successSwaps'] = isset($stats['successSwaps']) ? $stats['successSwaps'] + 1 : 1;
                        saveStats($stats);
                        updateActivity($taskParam, 'completed');
                    } elseif ($remoteStatus === -1) {
                        $result['status'] = 'failed';
                        $result['receivedAt'] = time() * 1000;
                        saveResult($taskParam, $result);
                        
                        $stats = loadStats();
                        $stats['failedSwaps'] = isset($stats['failedSwaps']) ? $stats['failedSwaps'] + 1 : 1;
                        saveStats($stats);
                        updateActivity($taskParam, 'failed');
                    }
                }
            }
        }
    }

    $status = isset($result['status']) ? $result['status'] : '';
    $requestedAt = isset($result['requestedAt']) ? $result['requestedAt'] : 0;
    
    // Check timeout (3 min)
    if ($status === 'queued' && (time() * 1000 - $requestedAt) > 180000) {
        $result['status'] = 'timeout';
        saveResult($taskParam, $result);
    }
    
    sendJson(200, array('ok' => true, 'result' => $result));
}

// POST /api.php?action=webhook
if ($method === 'POST' && $action === 'webhook') {
    $body   = json_decode(file_get_contents('php://input'), true);
    if (!$body) $body = array();
    $taskId = isset($body['task_id']) ? $body['task_id'] : '';
    if (!$taskId) sendJson(400, array('ok' => false, 'message' => 'Missing task_id'));

    $stats  = loadStats();
    $status = (isset($body['success']) && $body['success'] == 1) ? 'completed' : 'failed';

    $existing = getResult($taskId);
    if (!$existing) $existing = array('requestedAt' => time() * 1000);
    
    $existing['taskId']      = $taskId;
    $existing['status']      = $status;
    $existing['resultImage'] = isset($body['result_image']) ? $body['result_image'] : null;
    $existing['receivedAt']  = time() * 1000;
    saveResult($taskId, $existing);

    if ($status === 'completed') {
        $stats['successSwaps'] = isset($stats['successSwaps']) ? $stats['successSwaps'] + 1 : 1;
    } else {
        $stats['failedSwaps']  = isset($stats['failedSwaps']) ? $stats['failedSwaps'] + 1 : 1;
    }
    saveStats($stats);
    updateActivity($taskId, $status);
    sendJson(200, array('ok' => true, 'message' => 'Webhook received'));
}

// POST /api.php?action=faceswap
if ($method === 'POST' && $action === 'faceswap') {
    $apiKey = AIFACESWAP_API_KEY;
    if (empty($apiKey)) {
        sendJson(503, array('ok' => false, 'message' => 'ระบบยังไม่พร้อมใช้งาน กรุณาตั้งค่า API key ก่อนนะ'));
    }

    $body       = json_decode(file_get_contents('php://input'), true);
    if (!$body) $body = array();
    $faceImage  = isset($body['faceImage']) ? $body['faceImage'] : '';
    $templateId = isset($body['templateId']) ? $body['templateId'] : '';

    if (!$faceImage || !$templateId) {
        sendJson(400, array('ok' => false, 'message' => 'กรุณาอัปโหลดรูปหน้าตัวเองและเลือกตัวละครก่อนนะ'));
    }

    $sourceImage = galleryFileToDataUrl($templateId);
    if (!$sourceImage) {
        sendJson(404, array('ok' => false, 'message' => 'ไม่พบตัวละครที่เลือก'));
    }

    $stats = loadStats();
    $stats['totalSwaps'] = isset($stats['totalSwaps']) ? $stats['totalSwaps'] + 1 : 1;
    saveStats($stats);

    $webhookUrl = PUBLIC_BASE_URL . '/api.php?action=webhook';
    $payload    = json_encode(array(
        'source_image' => $sourceImage,
        'face_image'   => $faceImage,
        'webhook'      => $webhookUrl,
    ));

    // Call aifaceswap.io API
    $ch = curl_init('https://aifaceswap.io/api/aifaceswap/v1/faceswap');
    curl_setopt_array($ch, array(
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $payload,
        CURLOPT_TIMEOUT        => 60,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => false,
        CURLOPT_HTTPHEADER     => array(
            'Authorization: Bearer ' . $apiKey,
            'Content-Type: application/json',
        ),
    ));
    $resp     = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlErr  = curl_error($ch);
    curl_close($ch);

    if ($curlErr) {
        sendJson(502, array('ok' => false, 'message' => 'เชื่อมต่อ API ไม่ได้: ' . $curlErr));
    }

    $data = json_decode($resp, true);
    error_log('[faceswap] response: ' . substr($resp, 0, 300));

    $code = isset($data['code']) ? $data['code'] : 0;
    if ($code !== 200) {
        $stats['failedSwaps'] = isset($stats['failedSwaps']) ? $stats['failedSwaps'] + 1 : 1;
        saveStats($stats);
        addActivity(array('taskId' => null, 'status' => 'failed', 'templateId' => $templateId));
        $msg = isset($data['message']) ? $data['message'] : 'สลับหน้าไม่สำเร็จ ลองอีกครั้งนะ';
        sendJson(502, array('ok' => false, 'message' => $msg, 'details' => $data));
    }

    // Check for immediate (synchronous) result
    $resultImage = (isset($data['data']) && isset($data['data']['result_image'])) ? $data['data']['result_image'] : null;
    $taskId      = (isset($data['data']) && isset($data['data']['task_id'])) ? $data['data']['task_id'] : null;

    if ($resultImage) {
        // Synchronous result!
        $stats['successSwaps'] = isset($stats['successSwaps']) ? $stats['successSwaps'] + 1 : 1;
        saveStats($stats);
        $fakeId = $taskId ? $taskId : 'sync_' . time();
        saveResult($fakeId, array(
            'taskId'      => $fakeId,
            'status'      => 'completed',
            'resultImage' => $resultImage,
            'requestedAt' => time() * 1000,
            'receivedAt'  => time() * 1000,
        ));
        addActivity(array('taskId' => $fakeId, 'status' => 'completed', 'templateId' => $templateId));
        sendJson(200, array('ok' => true, 'taskId' => $fakeId));
    }

    if ($taskId) {
        saveResult($taskId, array(
            'taskId'      => $taskId,
            'status'      => 'queued',
            'templateId'  => $templateId,
            'requestedAt' => time() * 1000,
        ));
        addActivity(array('taskId' => $taskId, 'status' => 'queued', 'templateId' => $templateId));
    }

    sendJson(200, array('ok' => true, 'taskId' => $taskId));
}

// POST /api.php?action=gallery_upload
if ($method === 'POST' && $action === 'gallery_upload') {
    $body      = json_decode(file_get_contents('php://input'), true);
    if (!$body) $body = array();
    $imageData = isset($body['imageData']) ? $body['imageData'] : '';
    $name      = isset($body['name']) ? trim($body['name']) : '';

    if (!$imageData) sendJson(400, array('ok' => false, 'message' => 'Missing imageData'));

    if (!preg_match('/^data:(image\/(jpeg|jpg|png|webp));base64,(.+)$/', $imageData, $m)) {
        sendJson(400, array('ok' => false, 'message' => 'Invalid image format'));
    }

    $ext      = ($m[2] === 'jpg') ? 'jpeg' : $m[2];
    $baseName = $name
        ? preg_replace('/[^a-z0-9\x{0E00}-\x{0E7F}\s]/u', '', mb_strtolower($name, 'UTF-8'))
        : 'character_' . time();
    $baseName = trim(preg_replace('/\s+/', '_', $baseName));
    if (!$baseName) $baseName = 'character_' . time();
    if (strlen($baseName) > 60) $baseName = substr($baseName, 0, 60);

    $fileName = $baseName . '.' . $ext;
    $filePath = GALLERY_DIR . '/' . $fileName;
    $counter  = 1;
    while (file_exists($filePath)) {
        $fileName = $baseName . '_' . $counter . '.' . $ext;
        $filePath = GALLERY_DIR . '/' . $fileName;
        $counter++;
    }

    $decoded = base64_decode($m[3]);
    if (strlen($decoded) > MAX_IMAGE_BYTES) sendJson(400, array('ok' => false, 'message' => 'รูปใหญ่เกินไป'));
    file_put_contents($filePath, $decoded);

    sendJson(200, array('ok' => true, 'message' => 'อัปโหลดสำเร็จ', 'id' => pathinfo($fileName, PATHINFO_FILENAME), 'fileName' => $fileName));
}

// DELETE /api.php?action=gallery_delete&id=xxx
if ($method === 'DELETE' && $action === 'gallery_delete') {
    global $GALLERY_EXTS;
    $galleryId = isset($_GET['id']) ? basename($_GET['id']) : '';
    $deleted   = false;
    foreach ($GALLERY_EXTS as $ext) {
        $path = GALLERY_DIR . '/' . $galleryId . '.' . $ext;
        if (file_exists($path) && is_file($path)) {
            unlink($path);
            $deleted = true;
            break;
        }
    }
    if ($deleted) sendJson(200, array('ok' => true, 'message' => 'ลบสำเร็จ'));
    else          sendJson(404, array('ok' => false, 'message' => 'ไม่พบรูปที่ต้องการลบ'));
}

sendJson(404, array('ok' => false, 'message' => 'Unknown action: ' . $action));
