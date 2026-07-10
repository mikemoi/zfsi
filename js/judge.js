/* ============================================================
   判定层 —— 本地优先，AI 兜底（第2步只实现本地；AI 接口留空壳）
   verdict: 'correct' | 'accent' | 'wrong'
     correct = 完全正确（含重音）
     accent  = 只差重音符号（判对，但提醒）
     wrong   = 错
   ============================================================ */

// 规范化：小写、去首尾空格、折叠空格、去标点（含 ¿¡ , . ! ?）
function normalize(s) {
  return (s || '')
    .toLowerCase()
    .trim()
    .replace(/[¿¡?!.,;:"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// 去重音（用于“仅重音错”检测）；ñ→n 容差，A1-A2 阶段够用
function stripAccents(s) {
  return normalize(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ñ/g, 'n');
}

/**
 * 本地判定。
 * @param {string} userRaw  用户原始输入
 * @param {object} item     题目（含 accepted 数组，已是规范化文本或接近）
 * @param {string[]} extraAccepted  运行时通过“我其实对了”追加的可接受答案
 * @returns {{verdict:string, matched:boolean}}
 */
function judgeLocal(userRaw, item, extraAccepted = []) {
  const user = normalize(userRaw);
  if (!user) return { verdict: 'wrong', matched: false };

  const pool = [item.canonical, ...(item.accepted || []), ...extraAccepted];
  const poolNorm = pool.map(normalize);
  const poolStrip = pool.map(stripAccents);
  const userStrip = stripAccents(userRaw);

  // 1) 完全命中（含重音）
  if (poolNorm.includes(user)) return { verdict: 'correct', matched: true };

  // 2) 去重音后命中 → 仅重音错
  if (poolStrip.includes(userStrip)) return { verdict: 'accent', matched: true };

  // 3) 未命中
  return { verdict: 'wrong', matched: false };
}

/**
 * AI 兜底判定（第2步：占位）。
 * 接后端后：本地判 wrong 时调用此函数问 AI「语义/语法是否可接受」，
 * 若 AI 判可接受则自动写回 accepted。open 题（judge:'ai'）直接走这里。
 * 现在返回 null 表示“未启用”，调用方回退到本地结果。
 */
async function judgeAI(userRaw, item) {
  if (typeof API !== 'undefined' && API.configured()) {
    try {
      const r = await API.judge(item.id, userRaw);         // { verdict, acceptable, add_accepted, note }
      if (r && r.verdict) {
        if (r.add_accepted) Store.addAccepted(item.id, normalize(r.add_accepted));
        if (r.note) item._aiNote = r.note;                 // 供反馈区显示
        return r;
      }
    } catch { /* 网络/服务异常 → 回退本地 */ }
  }
  return null;
}

/**
 * 质量分映射（喂给 SM-2）：
 *   wrong=2 / accent=3 / 对但慢=4 / 对且快=5
 *   —— 速度只在 voice 模式下参与（打字快慢不代表回忆快慢）
 */
function qualityFromResult(verdict, inputMode, elapsedMs) {
  if (verdict === 'wrong')  return 2;
  if (verdict === 'accent') return 3;
  // correct：
  if (inputMode === 'voice') {
    return elapsedMs <= 3000 ? 5 : 4;   // 语音：3秒内=5，超时=4
  }
  return 4;                              // 打字：一律 4（不看速度）
}
