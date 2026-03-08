# 05. 웹 푸시 알림

## 개념

**웹 푸시(Web Push)** 는 앱을 열지 않아도 브라우저에 알림을 보내는 기술입니다.
스마트폰 앱 알림과 비슷하지만, 별도 앱 설치 없이 웹 브라우저만으로 동작합니다.

---

## 전체 구조

```
[서버]                           [브라우저]
  │                                  │
  │  1. GET /api/vapid-key           │
  │◄──────────────────────────────── │
  │  공개 VAPID 키 전달               │
  │ ──────────────────────────────►  │
  │                                  │  2. Notification.requestPermission()
  │                                  │     → 사용자에게 알림 허용 요청
  │                                  │
  │                                  │  3. pushManager.subscribe(VAPID 공개키)
  │                                  │     → 브라우저가 Push 서버에서
  │                                  │       고유 endpoint URL 발급
  │                                  │
  │  4. POST /api/subscribe          │
  │◄──────────────────────────────── │
  │  { endpoint, p256dh, auth }      │
  │  → DB에 저장                     │
  │                                  │
  │  (나중에 시간표 변경 감지)          │
  │                                  │
  │  5. web-push로 메시지 전송        │
  │ ──────────────────────────────►  Push 서버(Google/Mozilla)
  │                                        │
  │                                        │ 6. 브라우저로 전달
  │                                        │
  │                                   [Service Worker]
  │                                        │  7. push 이벤트 처리
  │                                        │     → 알림 표시
```

---

## VAPID란?

**VAPID (Voluntary Application Server Identification)** 는
"이 알림은 우리 서버에서 보낸 것이 맞다"는 것을 증명하는 인증 방식입니다.

- **공개키(public key)**: 브라우저에 전달, 서버 신원 확인용
- **비밀키(private key)**: 서버에만 보관, 메시지 서명용

### VAPID 키 자동 생성

`.env`에 키가 없으면 서버 시작 시 자동으로 생성하고 `.env`에 저장합니다:

```javascript
// push.js
if (!publicKey || !privateKey) {
  const keys = webpush.generateVAPIDKeys();
  // .env 파일에 자동 저장
}
```

> ⚠️ **주의**: VAPID 키를 바꾸면 기존 구독자들은 더 이상 알림을 받을 수 없습니다.
> 한번 생성한 키는 바꾸지 마세요.

---

## Service Worker (sw.js)

Service Worker는 브라우저 백그라운드에서 실행되는 특별한 JavaScript입니다.
페이지가 닫혀있어도 푸시 메시지를 수신할 수 있습니다.

### 푸시 수신 처리

```javascript
// sw.js
self.addEventListener('push', event => {
  const data = event.data.json();
  self.registration.showNotification(data.title, {
    body: data.body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [200, 100, 200]
  });
});
```

### 알림 클릭 처리

```javascript
self.addEventListener('notificationclick', event => {
  event.notification.close();
  // 앱이 이미 열려있으면 포커스, 없으면 새 탭 열기
  event.waitUntil(clients.openWindow(data.url || '/'));
});
```

---

## 구독 등록/해제 흐름 (app.js)

### 구독 등록

```javascript
// 1. 알림 권한 요청
const perm = await Notification.requestPermission();

// 2. VAPID 공개키 가져오기
const { key } = await fetch('/api/vapid-key').then(r => r.json());

// 3. 브라우저에서 구독 생성
const sub = await reg.pushManager.subscribe({
  userVisibleOnly: true,                    // 반드시 true (숨겨진 알림 불가)
  applicationServerKey: urlBase64ToUint8Array(key)
});

// 4. 서버에 구독 정보 전송
await fetch('/api/subscribe', {
  method: 'POST',
  body: JSON.stringify(sub)  // endpoint, keys.p256dh, keys.auth 포함
});
```

### 구독 해제

```javascript
const sub = await reg.pushManager.getSubscription();
await fetch('/api/subscribe', { method: 'DELETE', body: JSON.stringify({ endpoint: sub.endpoint }) });
await sub.unsubscribe(); // 브라우저에서도 구독 해제
```

---

## 알림 전송 (서버)

```javascript
// push.js
for (const sub of subscriptions) {
  await webpush.sendNotification(
    { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
    JSON.stringify({ title: '시간표 업데이트', body: '시간표가 변경되었습니다.', url: '/' })
  );
}
```

---

## 브라우저 지원

| 브라우저 | 지원 여부 |
|---------|---------|
| Chrome (Android/Desktop) | ✅ |
| Firefox | ✅ |
| Edge | ✅ |
| Safari (iOS 16.4+) | ✅ |
| Safari (iOS 16.3 이하) | ❌ |
