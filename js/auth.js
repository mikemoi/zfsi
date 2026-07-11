/* ============================================================
   PIN 鉴权门 —— 首页解锁
   第2步：纯前端，PIN 经 SHA-256 加盐后存 localStorage（只挡随手访问，
          不是强安全；真正的防护在后端到位后由服务端校验并 gate API）。
   首次访问 → 设置 PIN（输两遍）；之后 → 输入 PIN 解锁。
   解锁状态记在 sessionStorage：刷新不重复问，关掉标签页/重开才再问。
   ============================================================ */

const Auth = (() => {
  const K_PIN = 'zfsi_pin';         // 存 sha256(salt+pin)
  const K_UNLOCKED = 'zfsi_unlocked';
  const SALT = 'zfsi::v1::';

  async function sha256(str) {
    // http://IP 这类不安全上下文没有 crypto.subtle，用兜底哈希（PIN 只是弱门禁）
    if (globalThis.crypto && globalThis.crypto.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
      return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
    }
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return 'fnv_' + (h >>> 0).toString(16);
  }

  function hasPin() { return !!localStorage.getItem(K_PIN); }
  async function setPin(pin) { localStorage.setItem(K_PIN, await sha256(SALT + pin)); }
  async function verify(pin) { return localStorage.getItem(K_PIN) === await sha256(SALT + pin); }
  function isUnlocked() { return sessionStorage.getItem(K_UNLOCKED) === '1'; }
  function markUnlocked() { sessionStorage.setItem(K_UNLOCKED, '1'); }
  function lock() { sessionStorage.removeItem(K_UNLOCKED); }

  // DOM
  const el = {};
  function q(id) { return document.getElementById(id); }

  function show(mode) {
    // mode: 'set' | 'enter'
    el.screen.hidden = false;
    el.title.textContent = mode === 'set' ? '设置一个 PIN 码' : '输入 PIN 解锁';
    el.hint.textContent = mode === 'set'
      ? '4–8 位数字，之后每次打开都用它进入。'
      : '';
    el.confirm.hidden = mode !== 'set';
    el.error.textContent = '';
    el.pin.value = '';
    el.confirm.value = '';
    setTimeout(() => el.pin.focus(), 50);
    el.screen.dataset.mode = mode;
  }

  function hide() { el.screen.hidden = true; }

  async function submit(onUnlock) {
    const mode = el.screen.dataset.mode;
    const backend = el.screen.dataset.backend === '1';
    const pin = el.pin.value.trim();
    if (!/^\d{4,8}$/.test(pin)) { el.error.textContent = '请输入 4–8 位数字。'; return; }

    // 有后端：PIN 由服务器校验，成功即拿到 token（记录/AI 自动可用），并存本地哈希供离线解锁
    if (backend) {
      el.error.textContent = '验证中…';
      try {
        await API.connect(pin);
        await setPin(pin);
        API.flush();
        markUnlocked(); hide(); onUnlock();
      } catch {
        el.error.textContent = 'PIN 不对，再试一次。'; el.pin.value = ''; el.pin.focus();
      }
      return;
    }

    // 无后端（纯本地/离线）：本地哈希校验
    if (mode === 'set') {
      if (pin !== el.confirm.value.trim()) { el.error.textContent = '两次输入不一致。'; el.confirm.value=''; el.confirm.focus(); return; }
      await setPin(pin);
      markUnlocked(); hide(); onUnlock();
    } else {
      if (await verify(pin)) { markUnlocked(); hide(); onUnlock(); }
      else { el.error.textContent = 'PIN 不对，再试一次。'; el.pin.value=''; el.pin.focus(); }
    }
  }

  // 供设置页“修改 PIN”调用
  async function changePin(oldPin, newPin) {
    if (hasPin() && !(await verify(oldPin))) return { ok:false, msg:'原 PIN 不对' };
    if (!/^\d{4,8}$/.test(newPin)) return { ok:false, msg:'新 PIN 需 4–8 位数字' };
    await setPin(newPin);
    return { ok:true };
  }

  async function gate(onUnlock) {
    el.screen = q('lockScreen');
    el.title = q('lockTitle');
    el.hint = q('lockHint');
    el.pin = q('pinInput');
    el.confirm = q('pinConfirm');
    el.error = q('pinError');
    el.submit = q('pinSubmit');

    if (isUnlocked()) { hide(); onUnlock(); return; }

    // 探测同源后端：有后端 → PIN 由服务器定，总是“输入 PIN”；无后端 → 本地设/输
    const backend = (typeof API !== 'undefined') ? (await API.probe()).ok : false;
    el.screen.dataset.backend = backend ? '1' : '';
    show(backend ? 'enter' : (hasPin() ? 'enter' : 'set'));

    el.submit.onclick = () => submit(onUnlock);
    const onEnter = e => { if (e.key === 'Enter') { e.preventDefault(); submit(onUnlock); } };
    el.pin.addEventListener('keydown', onEnter);
    el.confirm.addEventListener('keydown', onEnter);
  }

  return { gate, hasPin, changePin, verify, lock };
})();
