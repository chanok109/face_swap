<?php
// test.php
error_reporting(E_ALL);
ini_set('display_errors', 1);

echo "PHP Version: " . PHP_VERSION . "<br>";
echo "cURL Enabled: " . (function_exists('curl_init') ? 'Yes' : 'No') . "<br>";

$dataDir = dirname(__FILE__) . '/data';
if (!is_dir($dataDir)) {
    @mkdir($dataDir, 0755, true);
}
echo "Data Dir exists: " . (is_dir($dataDir) ? 'Yes' : 'No') . "<br>";
echo "Data Dir writable: " . (is_writable($dataDir) ? 'Yes' : 'No') . "<br>";

$testFile = $dataDir . '/_test.tmp';
$writeTest = @file_put_contents($testFile, 'ok');
echo "File Write Test: " . ($writeTest !== false ? 'Success' : 'Failed') . "<br>";
@unlink($testFile);

echo "JSON Ext: " . (function_exists('json_encode') ? 'Yes' : 'No') . "<br>";
?>
