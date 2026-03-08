require('dotenv').config();
const cron = require('node-cron');
const { fetchAllTimetables } = require('./scraper');
const { queries } = require('./db');
const { sendPushToAll } = require('./push');

async function checkAndUpdate() {
  console.log('[Scheduler] 시간표 업데이트 확인 중...', new Date().toISOString());
  try {
    const schoolCode = queries.getSetting.get('school_code')?.value || null;
    const schoolName = queries.getSetting.get('school_name')?.value || '홍천중';
    const grade = parseInt(queries.getSetting.get('grade')?.value || '1');
    const classNum = parseInt(queries.getSetting.get('class_num')?.value || '3');

    const freshWeeks = await fetchAllTimetables({ schoolCode, schoolName, grade, classNum });
    const fetchedAt = new Date().toISOString();
    let anyChanged = false;

    for (const weekData of freshWeeks) {
      const { weekStart, ...rest } = weekData;
      const freshJson = JSON.stringify(rest);
      const existing = queries.getTimetable.get(weekStart);

      if (!existing) {
        queries.upsertTimetable.run({ week_start: weekStart, data: freshJson, fetched_at: fetchedAt });
        console.log(`[Scheduler] 최초 저장: ${weekStart}`);
        anyChanged = true;
      } else if (existing.data !== freshJson) {
        queries.upsertTimetable.run({ week_start: weekStart, data: freshJson, fetched_at: fetchedAt });
        console.log(`[Scheduler] 변경 감지 업데이트: ${weekStart}`);
        anyChanged = true;
      } else {
        console.log(`[Scheduler] 변경 없음: ${weekStart}`);
      }
    }

    if (anyChanged) {
      const subs = queries.getAllSubscriptions.all();
      if (subs.length > 0) {
        const payload = {
          title: '시간표 업데이트',
          body: '시간표가 변경되었습니다.',
          url: '/'
        };
        const result = await sendPushToAll(subs, payload);
        console.log('[Scheduler] 푸시 결과:', result);
        result.invalid.forEach(id => queries.removeSubscriptionById.run(id));
      }
    }

    return { changed: anyChanged, weeks: freshWeeks.map(w => w.weekStart) };
  } catch (err) {
    console.error('[Scheduler] 오류:', err.message);
    throw err;
  }
}

function startScheduler() {
  cron.schedule('0 19 * * *', checkAndUpdate, { timezone: 'Asia/Seoul' });
  console.log('[Scheduler] 스케줄러 시작 (매일 19:00 KST)');

  // 시작 시 DB가 비어있으면 즉시 실행
  const { db } = require('./db');
  const count = db.prepare('SELECT COUNT(*) as cnt FROM timetables').get();
  if (count.cnt === 0) {
    console.log('[Scheduler] DB 비어있음, 초기 데이터 수집 시작...');
    checkAndUpdate().catch(console.error);
  }
}

module.exports = { startScheduler, checkAndUpdate };
