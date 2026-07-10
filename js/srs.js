/* ============================================================
   SRS —— SM-2 算法（Anki 经典底层）
   state: { ease, interval(天), reps, last, next, lapses }
   质量分 q 由判定结果 + 用时映射得来（见 judge.js qualityFromResult）
   ============================================================ */

const DAY_MS = 24 * 60 * 60 * 1000;

function defaultSrs() {
  return { ease: 2.5, interval: 0, reps: 0, last: 0, next: 0, lapses: 0 };
}

/**
 * 跑一次 SM-2，返回更新后的 state。
 * @param {object} state 现有 SRS 状态（可为 undefined）
 * @param {number} q     质量分 0-5
 */
function sm2(state, q) {
  const s = Object.assign(defaultSrs(), state || {});
  const now = Date.now();

  if (q < 3) {
    // 答错/仅重音勉强过：重学，很快再出现
    s.reps = 0;
    s.interval = 0;
    if (q < 3) s.lapses += (state && state.reps > 0) ? 1 : 0;
    s.next = now + 60 * 1000;            // 约 1 分钟后本组内再考
  } else {
    s.reps += 1;
    if (s.reps === 1)      s.interval = 1;
    else if (s.reps === 2) s.interval = 6;
    else                   s.interval = Math.round(s.interval * s.ease);

    // ease 更新公式（SM-2 原式）
    s.ease = s.ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
    if (s.ease < 1.3) s.ease = 1.3;

    s.next = now + s.interval * DAY_MS;
  }

  s.last = now;
  return s;
}

/**
 * 从某题型池中挑下一题（SRS 排序）：
 *   1) 到期复习（next <= now），最早到期优先
 *   2) 新题（无 state）
 *   3) 都没有 → 最久没练的
 * 尽量避免和上一题同 id。
 */
function pickNext(pool, getState, lastId) {
  const now = Date.now();
  const withState = pool.map(item => ({ item, st: getState(item.id) }));

  const due = withState
    .filter(x => x.st && x.st.next && x.st.next <= now)
    .sort((a, b) => a.st.next - b.st.next);

  const fresh = withState.filter(x => !x.st || !x.st.last);

  const rest = withState
    .filter(x => x.st && x.st.last && !(x.st.next && x.st.next <= now))
    .sort((a, b) => (a.st.last || 0) - (b.st.last || 0));

  const ordered = [...due, ...fresh, ...rest].map(x => x.item);

  if (ordered.length > 1 && ordered[0].id === lastId) {
    return ordered[1];
  }
  return ordered[0];
}
