/* P1-3 integration:
 * RestTimer.configure({getPrefs:()=>settings.restTimer,
 *   savePrefs:p=>{ settings.restTimer=p; saveSettings(); }, mount:'.quick-capture'});
 * RestTimer.start() only after a successful set save. No storage is touched here.
 * Prefs: {duration:90,sound:false}; setPrefs(patch) calls savePrefs with merged prefs.
 * CSS --rest-timer-bottom overrides mobile offset (default 64px + safe area).
 * Completion is reconciled on focus/visibility, not a background alarm guarantee.
 */
(function (root) {
  'use strict';
  let options = {}, prefs = {duration: 90, sound: false};
  let active = false, paused = false, collapsed = false, done = false;
  let deadline = 0, remainingMs = 0, interval = null, host = null, audio = null;
  const doc = root.document;
  const seconds = value => Number.isFinite(Number(value)) && Number(value) > 0 ? Math.min(3600, Math.round(Number(value))) : 90;
  function getPrefs() {
    let external;
    try { external = options.getPrefs?.(); } catch (_) { /* Settings can be temporarily unavailable. */ }
    if (external && typeof external === 'object') prefs = {...prefs, ...external};
    return {...prefs, duration: seconds(prefs.duration), sound: prefs.sound === true};
  }
  function setPrefs(patch) {
    prefs = {...getPrefs(), ...patch};
    prefs.duration = seconds(prefs.duration);
    prefs.sound = prefs.sound === true;
    // Persist through the app's local-first settings/sync path, never a second store.
    try { Promise.resolve(options.savePrefs?.({...prefs})).catch(error => options.onError?.(error)); }
    catch (error) { options.onError?.(error); }
    render();
    return {...prefs};
  }
  function primeAudio() {
    if (!getPrefs().sound) return;
    try {
      const AudioContext = root.AudioContext || root.webkitAudioContext;
      if (!audio && AudioContext) audio = new AudioContext();
      if (audio?.state === 'suspended') audio.resume().catch(() => {});
    } catch (_) { /* Audio availability must not interrupt training. */ }
  }
  function notify() {
    try { root.navigator?.vibrate?.([150, 80, 150]); } catch (_) { /* Optional. */ }
    if (getPrefs().sound && audio?.state === 'running') {
      try {
        const oscillator = audio.createOscillator(), gain = audio.createGain();
        oscillator.frequency.value = 740;
        gain.gain.setValueAtTime(0.12, audio.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.25);
        oscillator.connect(gain); gain.connect(audio.destination);
        oscillator.start(); oscillator.stop(audio.currentTime + 0.25);
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      } catch (_) { /* Optional. */ }
    }
    options.onComplete?.();
  }
  function reconcile() {
    if (!active || paused || done) return;
    remainingMs = Math.max(0, deadline - Date.now());
    if (remainingMs === 0) {
      done = true;
      clearInterval(interval); interval = null;
      render(); notify();
    }
  }
  function getState() {
    reconcile();
    return {active, paused, collapsed, done, remaining: Math.ceil(remainingMs / 1000), deadline: active && !paused ? deadline : null};
  }
  function ensureUI() {
    if (!doc?.body || host) return;
    const style = doc.createElement('style');
    style.textContent = `
      #motionlog-rest-timer{box-sizing:border-box;position:relative;z-index:80;margin-top:14px;max-width:100%;padding:12px;border:1px solid var(--line,#283448);border-radius:14px;background:var(--panel,#141c2a);color:var(--text,#f0f4fb);box-shadow:0 8px 30px #0004;font:inherit}
      #motionlog-rest-timer[hidden],#motionlog-rest-timer [hidden]{display:none!important}
      #motionlog-rest-timer .rest-head,#motionlog-rest-timer .rest-controls{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
      #motionlog-rest-timer .rest-head{justify-content:space-between;gap:4px}
      #motionlog-rest-timer .rest-title{flex:1;min-width:0;font-size:12px}
      #motionlog-rest-timer output{font-size:23px;font-weight:750;font-variant-numeric:tabular-nums;color:var(--mint,#92e3cc)}
      #motionlog-rest-timer button{box-sizing:border-box;min-width:44px;min-height:44px;padding:6px 10px;border:1px solid var(--line,#283448);border-radius:9px;background:var(--panel2,#192334);color:inherit;font:inherit;font-size:12px;cursor:pointer}
      #motionlog-rest-timer button:focus-visible{outline:2px solid var(--mint,#92e3cc);outline-offset:2px}
      #motionlog-rest-timer button[aria-pressed=true]{border-color:var(--mint,#92e3cc)}
      #motionlog-rest-timer .rest-controls{margin-top:8px}
      @media(max-width:700px){#motionlog-rest-timer{position:fixed;left:10px;right:10px;bottom:var(--rest-timer-bottom,calc(64px + env(safe-area-inset-bottom,0px)));margin:0;padding:10px;max-width:none}#motionlog-rest-timer .rest-controls{gap:4px}#motionlog-rest-timer .rest-controls button{flex:1;padding:6px}}
    `;
    (doc.head || doc.body).append(style);
    host = doc.createElement('section'); host.id = 'motionlog-rest-timer'; host.hidden = true;
    host.setAttribute('aria-label', '组间休息');
    host.innerHTML = `<div class="rest-head"><span class="rest-title">组间休息</span><output aria-label="剩余时间">1:30</output><button type="button" data-action="collapse" aria-label="折叠休息计时器" aria-expanded="true">收起</button><button type="button" data-action="close" aria-label="关闭休息计时器">✕</button></div><div class="rest-controls"><button type="button" data-seconds="60">60秒</button><button type="button" data-seconds="90">90秒</button><button type="button" data-seconds="120">120秒</button><button type="button" data-action="add">+15秒</button><button type="button" data-action="pause">暂停</button><button type="button" data-action="sound" aria-pressed="false">声音关</button></div><span class="rest-status" role="status" style="font-size:12px"></span>`;
    host.addEventListener('click', event => {
      const button = event.target.closest('button'); if (!button) return;
      if (button.dataset.seconds) { setPrefs({duration: Number(button.dataset.seconds)}); start(Number(button.dataset.seconds)); return; }
      switch (button.dataset.action) {
        case 'close': close(); break;
        case 'collapse': collapse(!collapsed); break;
        case 'add': add(15); break;
        case 'pause': paused || done ? resume() : pause(); break;
        case 'sound': setPrefs({sound: !getPrefs().sound}); primeAudio(); break;
      }
    });
    const mount = typeof options.mount === 'string' ? doc.querySelector(options.mount) : options.mount;
    (mount || doc.querySelector('.quick-capture') || doc.body).append(host);
  }
  function render() {
    if (!host) return;
    host.hidden = !active;
    const total = Math.ceil(remainingMs / 1000);
    host.querySelector('output').textContent = `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
    host.querySelector('.rest-controls').hidden = collapsed;
    const collapseButton = host.querySelector('[data-action=collapse]');
    collapseButton.textContent = collapsed ? '展开' : '收起';
    collapseButton.setAttribute('aria-expanded', String(!collapsed));
    collapseButton.setAttribute('aria-label', collapsed ? '展开休息计时器' : '折叠休息计时器');
    host.querySelector('[data-action=pause]').textContent = paused ? '继续' : done ? '重启' : '暂停';
    host.querySelector('[data-action=sound]').textContent = getPrefs().sound ? '声音开' : '声音关';
    host.querySelector('[data-action=sound]').setAttribute('aria-pressed', String(getPrefs().sound));
    host.querySelector('.rest-status').textContent = done ? '休息结束' : paused ? '已暂停' : '';
  }
  function tick() { reconcile(); render(); }
  function schedule() { clearInterval(interval); interval = setInterval(tick, 250); }
  function configure(config = {}) { options = {...options, ...config}; getPrefs(); render(); return getPrefs(); }
  function start(duration = getPrefs().duration) {
    remainingMs = seconds(duration) * 1000; deadline = Date.now() + remainingMs;
    active = true; paused = false; done = false; collapsed = false;
    ensureUI(); primeAudio(); schedule(); render(); return getState();
  }
  function pause() { reconcile(); if (active && !done) { paused = true; clearInterval(interval); interval = null; } render(); return getState(); }
  function resume() {
    if (done) return start();
    if (active && paused) { deadline = Date.now() + remainingMs; paused = false; primeAudio(); schedule(); }
    render(); return getState();
  }
  function add(extra = 15) {
    reconcile();
    if (!active || !Number.isFinite(Number(extra)) || Number(extra) <= 0) return getState();
    remainingMs += Number(extra) * 1000; done = false;
    if (!paused) { deadline = Date.now() + remainingMs; schedule(); }
    render(); return getState();
  }
  function collapse(value = true) { collapsed = !!value; render(); return getState(); }
  function close() {
    clearInterval(interval); interval = null; active = false; paused = false; done = false; remainingMs = 0;
    if (host?.contains(doc.activeElement)) {
      const returnFocus = typeof options.returnFocus === 'string' ? doc.querySelector(options.returnFocus) : options.returnFocus;
      (returnFocus || doc.querySelector('#quickReps'))?.focus();
    }
    render(); return getState();
  }
  doc?.addEventListener('visibilitychange', tick);
  root.addEventListener?.('focus', tick);
  root.addEventListener?.('pageshow', tick);
  root.RestTimer = Object.freeze({configure, getPrefs, setPrefs, start, pause, resume, add, collapse, close, getState});
})(typeof window === 'undefined' ? globalThis : window);
