require('dotenv').config();
const webpush = require('web-push');
const fs = require('fs');
const path = require('path');

function initVapid() {
  let publicKey = process.env.VAPID_PUBLIC_KEY;
  let privateKey = process.env.VAPID_PRIVATE_KEY;

  if (!publicKey || !privateKey) {
    console.log('VAPID 키 생성 중...');
    const keys = webpush.generateVAPIDKeys();
    publicKey = keys.publicKey;
    privateKey = keys.privateKey;

    // .env 파일에 저장
    const envPath = path.join(__dirname, '.env');
    const envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
    const newEnv = envContent
      .replace(/VAPID_PUBLIC_KEY=.*/g, '')
      .replace(/VAPID_PRIVATE_KEY=.*/g, '')
      .trim();
    fs.writeFileSync(envPath,
      `${newEnv}\nVAPID_PUBLIC_KEY=${publicKey}\nVAPID_PRIVATE_KEY=${privateKey}\n`
    );
    console.log('VAPID 키 .env에 저장 완료');
  }

  webpush.setVapidDetails(
    'mailto:admin@timetable.local',
    publicKey,
    privateKey
  );

  return publicKey;
}

async function sendPushToAll(subscriptions, payload) {
  const results = { success: 0, failed: 0, invalid: [] };

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload)
      );
      results.success++;
    } catch (err) {
      results.failed++;
      if (err.statusCode === 410 || err.statusCode === 404) {
        results.invalid.push(sub.id);
      }
      console.error(`푸시 전송 실패 (${sub.endpoint.slice(-20)}):`, err.message);
    }
  }

  return results;
}

const vapidPublicKey = initVapid();

module.exports = { vapidPublicKey, sendPushToAll };
