<?php
$_SERVER['REQUEST_METHOD'] = 'POST';
$_GET['action'] = 'faceswap';

// Mock php://input
$input = json_encode(array('faceImage' => 'data:image/jpeg;base64,123', 'templateId' => 'astronaut'));
file_put_contents('php_input.tmp', $input);

// Replace file_get_contents('php://input') with our temp file just for testing
$apiCode = file_get_contents('api.php');
$apiCode = str_replace("file_get_contents('php://input')", "file_get_contents('php_input.tmp')", $apiCode);
// Remove <?php
$apiCode = str_replace("<?php", "", $apiCode);
eval($apiCode);
?>
