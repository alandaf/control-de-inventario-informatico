<?php
// api.php - PHP Reverse Proxy fallback for Node.js backend
$backend_url = 'http://127.0.0.1:3001/api/';

$allowed_origins = [
    'https://inventarioti.simarp.net',
    'http://localhost:3000',
    'http://127.0.0.1:3000'
];

$origin = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '';

// CORS & CSRF verification at proxy entrypoint (A-06, M-01)
if ($origin) {
    if (in_array($origin, $allowed_origins)) {
        header("Access-Control-Allow-Origin: $origin");
        header("Access-Control-Allow-Credentials: true");
    } else {
        http_response_code(403);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'Acceso denegado. Origen no autorizado por CORS.']);
        exit;
    }
}

// Early exit for OPTIONS preflight requests (M-01)
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, PATCH, OPTIONS");
    header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Confirm-Reset, X-Reset-Passcode, X-Audit-API-Key");
    header("Access-Control-Max-Age: 86400");
    exit(0);
}

$route = isset($_GET['route']) ? $_GET['route'] : '';
$url = $backend_url . $route;

$ch = curl_init($url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HEADER, true);
curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $_SERVER['REQUEST_METHOD']);

// Forward request body
$body = file_get_contents('php://input');
if ($body) {
    curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
}

// Forward headers
$headers = [];
if (function_exists('getallheaders')) {
    foreach (getallheaders() as $key => $value) {
        if (strtolower($key) !== 'host') {
            $headers[] = "$key: $value";
        }
    }
} else {
    foreach ($_SERVER as $name => $value) {
        if (substr($name, 0, 5) == 'HTTP_') {
            $key = str_replace(' ', '-', ucwords(strtolower(str_replace('_', ' ', substr($name, 5)))));
            if (strtolower($key) !== 'host') {
                $headers[] = "$key: $value";
            }
        }
    }
}
curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);

$response = curl_exec($ch);

if (curl_errno($ch)) {
    http_response_code(502);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Proxy Error: ' . curl_error($ch)]);
    exit;
}

$header_size = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
$res_headers = substr($response, 0, $header_size);
$res_body = substr($response, $header_size);
$http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);

curl_close($ch);

// Set HTTP code
http_response_code($http_code);

// Forward response headers (filtering CORS to prevent duplication)
$header_lines = explode("\r\n", $res_headers);
foreach ($header_lines as $line) {
    if ($line && stripos($line, 'Transfer-Encoding:') === false && stripos($line, 'Connection:') === false) {
        if (stripos($line, 'Access-Control-') === false) {
            header($line);
        }
    }
}

echo $res_body;
