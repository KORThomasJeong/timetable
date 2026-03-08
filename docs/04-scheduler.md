# 04. 자동 업데이트 스케줄러

## 역할

매일 오후 7시(KST)에 자동으로 컴시간에서 최신 시간표를 가져와
기존 데이터와 비교한 후, 변경이 있으면 DB를 업데이트하고 푸시 알림을 보냅니다.

---

## 왜 오후 7시인가?

컴시간에서 시간표는 보통 **금요일 저녁~주말**에 다음 주 시간표로 업데이트됩니다.
오후 7시(KST)에 체크하면 대부분의 업데이트를 놓치지 않습니다.

---

## 동작 흐름

```
서버 시작
  │
  ├─ node-cron 등록: 매일 19:00 KST → checkAndUpdate()
  │
  └─ DB가 비어있으면 즉시 checkAndUpdate() 실행
       (첫 실행 시 데이터가 없으므로 바로 수집 시작)


checkAndUpdate() 실행 시:
  │
  ├─ 1. DB에서 설정 읽기 (school_code, grade, class_num)
  │
  ├─ 2. scraper.fetchAllTimetables() 호출
  │       → 컴시간에서 모든 주차 데이터 수집
  │
  ├─ 3. 각 주차별로:
  │       ├─ DB에 없으면 → 신규 저장
  │       ├─ 기존 데이터와 다르면 → 업데이트, anyChanged = true
  │       └─ 같으면 → 스킵
  │
  └─ 4. anyChanged가 true이면:
          → 모든 구독자에게 푸시 알림 발송
          → 만료된 구독자 자동 삭제
```

---

## 코드 설명

### Cron 표현식

```javascript
cron.schedule('0 19 * * *', checkAndUpdate, { timezone: 'Asia/Seoul' });
//             │  │  │ │ │
//             │  │  │ │ └─ 요일 (* = 매일)
//             │  │  │ └─── 월 (* = 매월)
//             │  │  └───── 일 (* = 매일)
//             │  └──────── 시 (19 = 오후 7시)
//             └─────────── 분 (0 = 0분)
```

### 설정 읽기

```javascript
const schoolCode = queries.getSetting.get('school_code')?.value || null;
const grade      = parseInt(queries.getSetting.get('grade')?.value || '1');
const classNum   = parseInt(queries.getSetting.get('class_num')?.value || '3');
```

> 💡 `?.value` 는 옵셔널 체이닝입니다.
> `getSetting.get('key')` 가 `null`을 반환할 때 에러 없이 `undefined`를 반환합니다.
> 설정이 없으면 기본값(학년 1, 반 3)을 사용합니다.

### 변경 감지 및 저장

```javascript
for (const weekData of freshWeeks) {
  const { weekStart, ...rest } = weekData;
  const freshJson = JSON.stringify(rest);        // 새 데이터를 문자열로
  const existing = queries.getTimetable.get(weekStart); // DB에서 조회

  if (!existing) {
    // 처음 보는 주차 → 저장
    queries.upsertTimetable.run({ week_start: weekStart, data: freshJson, fetched_at });
    anyChanged = true;
  } else if (existing.data !== freshJson) {
    // 내용이 달라짐 → 업데이트
    queries.upsertTimetable.run({ week_start: weekStart, data: freshJson, fetched_at });
    anyChanged = true;
  }
  // 같으면 아무것도 하지 않음
}
```

---

## 만료된 구독자 자동 삭제

푸시 전송 시 브라우저가 **410 Gone** 또는 **404** 응답을 보내면
해당 구독이 더 이상 유효하지 않다는 뜻입니다.
이런 구독자는 자동으로 DB에서 삭제합니다.

```javascript
const result = await sendPushToAll(subs, payload);
// result.invalid = 만료된 구독자 id 목록
result.invalid.forEach(id => queries.removeSubscriptionById.run(id));
```

---

## 수동 실행

관리자 페이지의 **"시간표 새로고침"** 버튼 또는 API로 즉시 실행할 수 있습니다:

```bash
curl -X POST http://localhost:3000/admin/api/refresh \
  -u admin:your_password
```
