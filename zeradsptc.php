<?php
header('Content-Type: application/json; charset=utf-8');

$expectedPassword = getenv('ZERADS_PTC_PASSWORD') ?: 'Qwerty12';
$trustedIp = getenv('ZERADS_PTC_IP') ?: '162.0.208.108';
$minReward = (float)(getenv('ZERADS_MIN_REWARD') ?: 0.5);
$maxReward = (float)(getenv('ZERADS_MAX_REWARD') ?: 1.0);

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

if ($user === '' || $clicks < 0 || $amount < 0) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'invalid_parameters']);
    exit;
}

if ($minReward > $maxReward) {
    $tmp = $minReward;
    $minReward = $maxReward;
    $maxReward = $tmp;
}

$rate = mt_rand((int)round($minReward * 100), (int)round($maxReward * 100)) / 100;
$topay = round($clicks * $rate, 2);

$storeFile = __DIR__ . '/zerads_ptc_rewards.json';
$data = [];
if (file_exists($storeFile)) {
    $parsed = json_decode(file_get_contents($storeFile), true);
    if (is_array($parsed)) {
        $data = $parsed;
    }
}

if (!isset($data[$user])) {
    $data[$user] = ['balance' => 0, 'total_clicks' => 0, 'last_amount_zer' => 0, 'updated_at' => 0];
}

$data[$user]['balance'] = round(((float)$data[$user]['balance']) + $topay, 2);
$data[$user]['total_clicks'] = (int)$data[$user]['total_clicks'] + $clicks;
$data[$user]['last_amount_zer'] = $amount;
$data[$user]['updated_at'] = time();

file_put_contents($storeFile, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

echo json_encode([
    'ok' => true,
    'user' => $user,
    'clicks' => $clicks,
    'amount_zer' => $amount,
    'rate' => $rate,
    'credited_jeton' => $topay,
    'new_balance' => $data[$user]['balance']
]);
