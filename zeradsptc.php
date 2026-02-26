<?php
header('Content-Type: application/json; charset=utf-8');

$expectedPassword = getenv('ZERADS_PTC_PASSWORD') ?: 'Qwerty12';
$trustedIp = getenv('ZERADS_PTC_IP') ?: '162.0.208.108';
$exchangeRate = (float)(getenv('ZERADS_EXCHANGE_RATE') ?: 10); // 1 ZER = 10 JETON
$rewardName = getenv('ZERADS_REWARD_NAME') ?: 'JETON';

$pwd = $_GET['pwd'] ?? '';
$user = trim($_GET['user'] ?? '');
$amount = (float)($_GET['amount'] ?? 0);
$clicks = (int)($_GET['clicks'] ?? 0);
$clientIp = $_SERVER['REMOTE_ADDR'] ?? '';

if ($pwd !== $expectedPassword) {
    http_response_code(401);
    echo json_encode(['ok' => false, 'error' => 'invalid_password']);
    exit;
}

if ($clientIp !== $trustedIp) {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'invalid_ip', 'ip' => $clientIp]);
    exit;
}

if ($user === '' || $amount < 0 || $clicks < 0) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'invalid_parameters']);
    exit;
}

$credited = round($amount * $exchangeRate, 2);

$storeFile = __DIR__ . '/zerads_ptc_rewards.json';
$data = [];
if (file_exists($storeFile)) {
    $parsed = json_decode(file_get_contents($storeFile), true);
    if (is_array($parsed)) {
        $data = $parsed;
    }
}

if (!isset($data[$user])) {
    $data[$user] = [
        'balance' => 0,
        'total_clicks' => 0,
        'total_zer' => 0,
        'updated_at' => 0
    ];
}

$data[$user]['balance'] = round(((float)$data[$user]['balance']) + $credited, 2);
$data[$user]['total_clicks'] = (int)$data[$user]['total_clicks'] + $clicks;
$data[$user]['total_zer'] = round(((float)$data[$user]['total_zer']) + $amount, 6);
$data[$user]['updated_at'] = time();

file_put_contents($storeFile, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

echo json_encode([
    'ok' => true,
    'user' => $user,
    'amount_zer' => $amount,
    'clicks' => $clicks,
    'exchange_rate' => $exchangeRate,
    'credited' => $credited,
    'reward_name' => $rewardName,
    'new_balance' => $data[$user]['balance']
]);
