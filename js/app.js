/* ============================================================
   主逻辑 —— 状态机：出题 → 等待输入 → 判定 → 反馈 → 下一题
   每题型练满 20 次自动切下一梯度题型。
   语音输入用 Web Speech API（离线兜底）；TTS 用浏览器 SpeechSynthesis。
   接后端时：judgeAI / AI-TTS / 同步 attempts 在这里接。
   ============================================================ */

const App = (() => {
  // ---- DOM ----
  const $ = sel => document.querySelector(sel);
  const el = {
    typeBadge: $('#typeBadge'), levelBadge: $('#levelBadge'), tagBadge: $('#tagBadge'),
    context: $('#context'), prompt: $('#prompt'),
    input: $('#answer'), submit: $('#submitBtn'), mic: $('#micBtn'),
    feedback: $('#feedback'), verdict: $('#verdict'), canonical: $('#canonical'), note: $('#note'),
    actuallyRight: $('#actuallyRightBtn'), listen: $('#listenBtn'), next: $('#nextBtn'),
    groupCount: $('#groupCount'), todayCount: $('#todayCount'), groupAvg: $('#groupAvg'),
    typeSwitch: $('#typeSwitch'), speedHint: $('#speedHint'),
  };

  function groupSize() { return Settings.get().groupSize; }

  const state = {
    typeIndex: 0,          // 当前题型在 DRILL_ORDER 中的位置
    current: null,         // 当前题目
    lastId: null,
    shownAt: 0,            // 出题时间戳（算反应时）
    inputMode: 'typed',    // 'typed' | 'voice'
    groupN: 0,             // 本组已答数
    groupTimes: [],        // 本组反应时（用于均值）
    answered: false,       // 当前题是否已判定（防重复提交）
    lastResult: null,      // 最近一次判定结果
  };

  function currentType() { return DRILL_ORDER[state.typeIndex]; }
  function poolOf(type) { return DECK.filter(d => d.type === type); }

  // ---------- 出题 ----------
  function nextQuestion() {
    const type = currentType();
    const pool = poolOf(type);
    const item = pickNext(pool, Store.getSrs, state.lastId);
    state.current = item;
    state.lastId = item.id;
    state.answered = false;
    state.lastResult = null;
    state.shownAt = Date.now();

    // 渲染卡片
    el.typeBadge.textContent = DRILL_LABELS[type];
    el.levelBadge.textContent = item.level;
    el.tagBadge.hidden = item.tag !== 'contrast_pair';
    el.context.textContent = item.context || '';
    el.context.hidden = !item.context;
    el.prompt.textContent = item.prompt;

    // 重置输入/反馈区
    el.input.value = '';
    el.input.disabled = false;
    el.feedback.hidden = true;
    el.speedHint.hidden = true;
    el.input.focus();
    updateStats();
  }

  // ---------- 判定 ----------
  async function submit() {
    if (state.answered || !state.current) return;
    const raw = el.input.value;
    if (!raw.trim()) return;

    const elapsed = Date.now() - state.shownAt;
    const item = state.current;
    const extra = Store.getExtraAccepted(item.id);

    // 本地优先判定
    let { verdict } = judgeLocal(raw, item, extra);

    // AI 兜底：本地判 wrong、或 open 题（judge:'ai'）→ 试 AI（第2步返回 null，回退本地）
    if ((verdict === 'wrong' || item.judge === 'ai')) {
      const ai = await judgeAI(raw, item);
      if (ai && ai.verdict) verdict = ai.verdict;
    }

    finalizeAttempt(verdict, elapsed, raw);
  }

  function finalizeAttempt(verdict, elapsed, raw) {
    const item = state.current;
    state.answered = true;
    state.lastResult = { verdict, elapsed, raw };
    el.input.disabled = true;

    // 软提示：语音模式且超 3 秒
    el.speedHint.hidden = !(state.inputMode === 'voice' && elapsed > 3000 && verdict !== 'wrong');

    // SM-2
    const q = qualityFromResult(verdict, state.inputMode, elapsed);
    const newState = sm2(Store.getSrs(item.id), q);
    Store.setSrs(item.id, newState);

    // 流水账（本地）
    Store.logAttempt({
      at: Date.now(), id: item.id, type: item.type, prompt: item.prompt,
      answer: raw, verdict, accent_only: verdict === 'accent',
      input_mode: state.inputMode, elapsed_ms: elapsed, q,
    });
    // 镜像到后端（配置了才会入队；离线自动排队，联网 flush）
    if (typeof API !== 'undefined' && API.configured()) {
      API.mirror({
        drill_id: item.id, drill_type: item.type, prompt: item.prompt,
        user_answer: raw, verdict, accent_only: verdict === 'accent',
        input_mode: state.inputMode, elapsed_ms: elapsed,
      });
    }

    // 反馈 UI
    renderFeedback(verdict, item);

    // 答完自动朗读（可选）
    if (Settings.get().autoSpeak) speak(item.canonical);

    // 组内计数 + 反应时
    state.groupN += 1;
    state.groupTimes.push(elapsed);
    updateStats();
  }

  function renderFeedback(verdict, item) {
    el.feedback.hidden = false;
    el.feedback.className = 'feedback ' + verdict;
    const map = {
      correct: '✓ 正确',
      accent:  '✓ 对，注意重音符号',
      wrong:   '✗ 再看一下',
    };
    el.verdict.textContent = map[verdict];
    el.canonical.textContent = item.canonical;
    const note = item._aiNote || item.note || '';   // AI 判定的提示优先
    el.note.textContent = note;
    el.note.hidden = !note;
    // “我其实对了”只在判错时给
    el.actuallyRight.hidden = verdict !== 'wrong';
    el.next.focus();
  }

  // ---------- “我其实对了” ----------
  function markActuallyRight() {
    if (!state.lastResult) return;
    const item = state.current;
    Store.addAccepted(item.id, normalize(state.lastResult.raw));
    // 重判为对（打字 → q=4），修正刚才那条 SRS
    const newState = sm2(Store.getSrs(item.id), 4);
    Store.setSrs(item.id, newState);
    renderFeedback('correct', item);
    el.actuallyRight.hidden = true;
  }

  // ---------- 下一题 / 切题型 ----------
  function advance() {
    if (state.groupN >= groupSize()) {
      switchToNextType(true);
    } else {
      nextQuestion();
    }
  }

  function switchToNextType(auto) {
    state.typeIndex = (state.typeIndex + 1) % DRILL_ORDER.length;
    state.groupN = 0;
    state.groupTimes = [];
    if (auto) {
      const t = DRILL_LABELS[currentType()];
      flashToast(`切换到「${t}」`);
    }
    nextQuestion();
  }

  // 阶梯步骤（可点击直接跳到某关）
  function buildTypeSwitch() {
    el.typeSwitch.innerHTML = '';
    DRILL_ORDER.forEach((type, i) => {
      const b = document.createElement('button');
      b.className = 'step';
      b.innerHTML = `<span class="step-n">${i + 1}</span><span class="step-name">${DRILL_SHORT[type]}</span>`;
      b.onclick = () => {
        state.typeIndex = i;
        state.groupN = 0;
        state.groupTimes = [];
        updateStats();
        nextQuestion();
      };
      el.typeSwitch.appendChild(b);
    });
    updateStepper();
  }

  function updateStepper() {
    [...el.typeSwitch.children].forEach((c, i) => {
      c.classList.toggle('active', i === state.typeIndex);
      c.classList.toggle('done', i < state.typeIndex);
    });
  }

  // ---------- 统计（反焦虑：只做中性累计 + 组内反应时）----------
  function updateStats() {
    el.groupCount.textContent = `本组 ${state.groupN}/${groupSize()}`;
    el.todayCount.textContent = `今天 ${Store.todayCount()} 题`;
    if (state.groupTimes.length) {
      const avg = state.groupTimes.reduce((a, b) => a + b, 0) / state.groupTimes.length;
      el.groupAvg.textContent = `本组平均反应 ${(avg / 1000).toFixed(1)} 秒`;
      el.groupAvg.hidden = false;
    } else {
      el.groupAvg.hidden = true;
    }
    // 更新阶梯步骤高亮
    updateStepper();
  }

  function flashToast(msg) {
    let t = document.getElementById('toast');
    if (!t) {
      t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t);
    }
    t.textContent = msg; t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 1600);
  }

  // ---------- TTS（配置了后端用 AI 语音+缓存；否则浏览器兜底）----------
  let lastAudioUrl = null;
  async function speak(text) {
    if (typeof API !== 'undefined' && API.configured()) {
      try {
        const blob = await API.ttsAudio(text);
        if (lastAudioUrl) URL.revokeObjectURL(lastAudioUrl);
        lastAudioUrl = URL.createObjectURL(blob);
        await new Audio(lastAudioUrl).play();
        return;
      } catch { /* 回退浏览器发音 */ }
    }
    if (!('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'es-ES';
    u.rate = 0.95;
    speechSynthesis.speak(u);
  }

  // ---------- 语音输入（Web Speech API）----------
  let recog = null;
  function initVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { el.mic.disabled = true; el.mic.title = '此浏览器不支持语音输入'; return; }
    recog = new SR();
    recog.lang = 'es-ES';
    recog.interimResults = false;
    recog.maxAlternatives = 1;
    recog.onresult = e => {
      const text = e.results[0][0].transcript;
      el.input.value = text;
      state.inputMode = 'voice';
      submit();                       // 说完自动判定
    };
    recog.onend = () => el.mic.classList.remove('listening');
    recog.onerror = () => el.mic.classList.remove('listening');
  }
  function toggleVoice() {
    if (!recog || state.answered) return;
    state.inputMode = 'voice';
    el.mic.classList.add('listening');
    try { recog.start(); } catch {}
  }

  // ---------- 事件绑定 ----------
  function bind() {
    el.submit.onclick = () => { state.inputMode = 'typed'; submit(); };
    el.input.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (!state.answered) { state.inputMode = 'typed'; submit(); }
        else advance();
      }
    });
    el.next.onclick = advance;
    el.actuallyRight.onclick = markActuallyRight;
    el.listen.onclick = () => state.current && speak(state.current.canonical);
    el.mic.onclick = toggleVoice;
    // 反馈出现后焦点在“下一题”按钮上，回车由浏览器原生触发按钮点击 → advance()，
    // 不再挂全局 keydown（否则同一个回车会冒泡到 document，在 submit 同步置 answered 后
    // 又触发一次 advance，导致提交后立刻跳题、看不到反馈）。
  }

  // ---------- 视图切换 ----------
  function setupViews() {
    const views = { drill:$('#view-drill'), stats:$('#view-stats'), settings:$('#view-settings') };
    const btns = document.querySelectorAll('.navbtn');
    btns.forEach(btn => btn.onclick = () => {
      const v = btn.dataset.view;
      btns.forEach(b => b.classList.toggle('active', b === btn));
      Object.entries(views).forEach(([k, elv]) => elv.hidden = (k !== v));
      if (v === 'stats') { Stats.render($('#statsBody')); Scenarios.render($('#scenariosBody')); }
      if (v === 'settings') Settings.render($('#settingsBody'), () => {
        // 设置变更：刷新当前组的默认输入模式与计数显示
        state.inputMode = Settings.get().defaultMode;
        updateStats();
      });
    });
  }

  // ---------- 启动（PIN 解锁后） ----------
  function init() {
    state.inputMode = Settings.get().defaultMode;
    bind();
    setupViews();
    buildTypeSwitch();
    initVoice();
    nextQuestion();
    // 注册 service worker（离线可练；file:// 下会静默失败，无妨）
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  return { init, currentTypeName: () => currentType() };
})();

// 先过 PIN 门，再启动 App
document.addEventListener('DOMContentLoaded', () => Auth.gate(App.init));
