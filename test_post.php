<?php
// test_post.php
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(array('ok' => true, 'message' => 'POST is working', 'payload_length' => strlen(file_get_contents('php://input'))));
    exit;
}
?>
<!DOCTYPE html>
<html><body>
<button onclick="testPost()">Test POST</button>
<pre id="out"></pre>
<script>
async function testPost() {
    try {
        const res = await fetch('test_post.php', {
            method: 'POST',
            body: 'Hello World'
        });
        const text = await res.text();
        document.getElementById('out').textContent = text;
    } catch(e) {
        document.getElementById('out').textContent = 'Error: ' + e.message;
    }
}
</script>
</body></html>
