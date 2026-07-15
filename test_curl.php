<?php
error_reporting(E_ALL);
ini_set('display_errors', 1);

echo "Testing connection to aifaceswap.io...<br>";

$ch = curl_init('https://aifaceswap.io/api/aifaceswap/v1/health'); // just testing connection
curl_setopt_array($ch, array(
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 15,
));
$resp = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlErr = curl_error($ch);
curl_close($ch);

echo "HTTP Code: " . $httpCode . "<br>";
if ($curlErr) {
    echo "cURL Error: " . $curlErr . "<br>";
} else {
    echo "Response: " . htmlspecialchars(substr($resp, 0, 500)) . "<br>";
}
?>
