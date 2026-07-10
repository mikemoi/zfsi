// 服务端 SM-2（与前端 js/srs.js 同一套逻辑，权威版在这里）
const DAY_MS = 24 * 60 * 60 * 1000;

export function sm2(state, q) {
  const s = {
    ease: 2.5, interval: 0, reps: 0, lapses: 0,
    ...(state || {}),
  };
  const now = Date.now();

  if (q < 3) {
    if (s.reps > 0) s.lapses += 1;
    s.reps = 0;
    s.interval = 0;
    s.next = now + 60 * 1000;            // 约 1 分钟后本组内再考
  } else {
    s.reps += 1;
    if (s.reps === 1)      s.interval = 1;
    else if (s.reps === 2) s.interval = 6;
    else                   s.interval = Math.round(s.interval * s.ease);

    s.ease = s.ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
    if (s.ease < 1.3) s.ease = 1.3;

    s.next = now + s.interval * DAY_MS;
  }
  s.last = now;
  return s;
}

// 质量分映射：wrong=2 / accent=3 / 对但慢=4 / 对且快=5（速度只在 voice 计）
export function qualityFrom(verdict, inputMode, elapsedMs) {
  if (verdict === 'wrong')  return 2;
  if (verdict === 'accent') return 3;
  if (inputMode === 'voice') return (elapsedMs != null && elapsedMs <= 3000) ? 5 : 4;
  return 4;
}
