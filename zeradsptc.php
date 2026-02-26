<?php
header('Content-Type: application/json; charset=utf-8');

$expectedPassword = getenv('ZERADS_PTC_PASSWORD') ?: 'Qwerty12';
$trustedIp = getenv('ZERADS_PTC_IP') ?: '162.0.208.108';
$exchangeRate = (float)(getenv('ZERADS_EXCHANGE_RATE') ?: 100); // 1 ZER = 100 JETON
$rewardName = getenv('ZERADS_REWARD_NAME') ?: 'JETON';
$storeFile = __DIR__ . '/zerads_ptc_rewards.json';

function readStore($file)
{
    if (!file_exists($file)) return [];
    $parsed = json_decode(file_get_contents($file), true);
    return is_array($parsed) ? $parsed : [];
}

function writeStore($file, $data)
{
    file_put_contents($file, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
}

$action = $_GET['action'] ?? '';

// Frontend sync endpoint: get pending reward for user and reset pending.
if ($action === 'sync') {
    $user = trim($_GET['user'] ?? '');
    if ($user === '') {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'missing_user']);
        exit;
    }

    $data = readStore($storeFile);
    if (!isset($data[$user])) {
        echo json_encode(['ok' => true, 'user' => $user, 'pending' => 0, 'reward_name' => $rewardName]);
        exit;
    }

    $pending = round((float)($data[$user]['pending'] ?? 0), 4);
    $data[$user]['pending'] = 0;
    $data[$user]['claimed_at'] = time();
    writeStore($storeFile, $data);

    echo json_encode([
        'ok' => true,
        'user' => $user,
        'pending' => $pending,
        'reward_name' => $rewardName,
        'total_balance' => round((float)($data[$user]['balance'] ?? 0), 4)
    ]);
    exit;
}

// ZerAds callback path
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

$credited = round($amount * $exchangeRate, 4);
$data = readStore($storeFile);

if (!isset($data[$user])) {
    $data[$user] = [
        'balance' => 0,
        'pending' => 0,
        'total_clicks' => 0,
        'total_zer' => 0,
        'updated_at' => 0,
        'claimed_at' => 0
    ];
}

$data[$user]['balance'] = round(((float)$data[$user]['balance']) + $credited, 4);
$data[$user]['pending'] = round(((float)$data[$user]['pending']) + $credited, 4);
$data[$user]['total_clicks'] = (int)$data[$user]['total_clicks'] + $clicks;
$data[$user]['total_zer'] = round(((float)$data[$user]['total_zer']) + $amount, 6);
$data[$user]['updated_at'] = time();

writeStore($storeFile, $data);

echo json_encode([
    'ok' => true,
    'user' => $user,
    'amount_zer' => $amount,
    'clicks' => $clicks,
    'exchange_rate' => $exchangeRate,
    'credited' => $credited,
    'pending' => $data[$user]['pending'],
    'reward_name' => $rewardName,
    'new_balance' => $data[$user]['balance']
]);
