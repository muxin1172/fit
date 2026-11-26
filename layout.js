/* MotionLog v15 presentation and accessibility. Loaded after app.js and sync.js.
 * Integration: motion:data-changed refreshes progress; #motionSettingsExtras accepts
 * timer preferences; #syncStatus hosts the sync module's existing toolbar/status.
 * This layer never writes training data, account state, or timer preferences.
 */
(() => {
  'use strict';
  if (window.MotionLayout) return;

  // Alternate lightness as well as hue. Labels and separated donut sectors retain
  // meaning in grayscale; never use the swatch alone as a muscle identifier.
  window.MUSCLE_COLORS = Object.freeze({
    '背部': '#8de4c8', '胸部': '#5279b8', '肩部': '#ffd18a',
    '二头肌': '#a85c75', '三头肌': '#c8d887', '腹部': '#a46b32',
    '腿部': '#b7d7f0', '小腿': '#8063a3'
  });

  const $ = selector => document.querySelector(selector);
  const sidebar = $('.sidebar');
  const topbar = $('.topbar');
  const brand = $('.brand');
  const nav = $('#nav');
  if (!sidebar || !topbar || !brand || !nav) return;
  const mobile = window.matchMedia('(max-width: 700px)');
  const brandHome = document.createComment('Brand desktop position');
  brand.before(brandHome);
  const topActions = $('.top-actions') || topbar;

  const settings = document.createElement('details');
  settings.id = 'motionSettings';
  settings.className = 'motion-settings';
  settings.innerHTML = `<summary class="motion-settings-toggle" aria-label="打开设置与备份" aria-controls="motionSettingsPanel" aria-expanded="false"><span aria-hidden="true">⋯</span></summary>
    <div id="motionSettingsPanel" class="motion-settings-panel" role="region" aria-label="设置与备份">
      <h2>设置与备份</h2>
      <div id="motionMenuBackups"></div>
      <div id="syncStatus" class="motion-sync-slot"></div>
      <div id="motionSettingsExtras"></div>
    </div>`;
  topActions.append(settings);
  const settingsToggle = settings.querySelector('summary');
  const backupActions = document.createElement('div');
  backupActions.id = 'motionBackupActions';
  backupActions.className = 'motion-backup-actions';
  const bottom = document.createElement('div');
  bottom.className = 'sidebar-bottom';
  bottom.innerHTML = `<section class="sidebar-progress" aria-label="训练进度">
    <div class="sidebar-progress-heading"><span>本周训练日</span><b id="sidebarWeekCount">0 / 4</b></div>
    <progress id="sidebarWeekProgress" max="4" value="0" aria-label="本周训练日，目标四天"></progress>
    <p id="sidebarStreak">连续训练 <b>0</b> 天</p>
  </section>`;
  bottom.append(backupActions);
  sidebar.append(bottom);

  const main = $('main');
  if (main) {
    main.id ||= 'motionMain';
    main.tabIndex = -1;
    const skip = document.createElement('a');
    skip.className = 'motion-skip-link';
    skip.href = `#${main.id}`;
    skip.textContent = '跳到主要内容';
    document.body.prepend(skip);
  }
  const viewport = $('meta[name="viewport"]');
  if (viewport && !viewport.content.includes('viewport-fit')) viewport.content += ', viewport-fit=cover';
  nav.setAttribute('aria-label', '训练页面');
  for (const button of nav.querySelectorAll('[data-view]')) {
    const labels = { dashboard: '今日', history: '历史', checkin: '日历' };
    const label = labels[button.dataset.view];
    if (!label) continue;
    for (const text of [...button.childNodes].filter(node => node.nodeType === Node.TEXT_NODE)) text.remove();
    const span = document.createElement('span');
    span.className = 'nav-label';
    span.textContent = label;
    button.append(span);
    button.querySelector('svg')?.setAttribute('aria-hidden', 'true');
    button.setAttribute('aria-label', button.title || label);
  }

  const move = (node, parent) => {
    if (node && parent && node.parentNode !== parent && !node.contains(parent)) parent.append(node);
  };
  function closeSettings(restore = false) {
    if (!settings.open) return;
    settings.open = false;
    if (restore) settingsToggle.focus({ preventScroll: true });
  }
  settings.addEventListener('toggle', () => settingsToggle.setAttribute('aria-expanded', String(settings.open)));
  document.addEventListener('pointerdown', event => {
    if (!settings.contains(event.target)) closeSettings();
  });
  settings.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeSettings(true);
    } else if (event.key === 'ArrowDown' && event.target === settingsToggle) {
      event.preventDefault();
      settings.open = true;
      settings.querySelector('button, input, select, a[href]')?.focus();
    }
  });
  settings.addEventListener('focusout', () => queueMicrotask(() => {
    if (!settings.contains(document.activeElement)) closeSettings();
  }));
  settings.addEventListener('click', event => {
    if (event.target.closest('#exportBtn, #importBtn')) closeSettings(true);
  });

  function placeControls() {
    if (mobile.matches) {
      if (brand.parentNode !== topbar) topbar.prepend(brand);
      move(backupActions, $('#motionMenuBackups'));
    } else {
      if (brand.previousSibling !== brandHome) brandHome.after(brand);
      move(backupActions, bottom);
    }
    for (const id of ['exportBtn', 'importBtn']) move(document.getElementById(id), backupActions);
    const status = $('#motion-sync-status');
    // Preserve the real controls and their handlers, including late auth changes.
    const toolbar = status?.closest('#motion-sync-toolbar, #motion-sync-bar, #motion-cloud-toolbar, .motion-sync-toolbar, .motion-sync-bar, [data-motion-sync-toolbar]');
    move(toolbar || status, mobile.matches ? $('#syncStatus') : topActions);
    for (const id of ['motion-cloud-account', 'motion-sync-account', 'motion-sync-logout', 'motion-cloud-logout']) {
      const control = document.getElementById(id);
      if (control && !$('#syncStatus').contains(control)) move(control, $('#syncStatus'));
    }
    const view = $('.view.active')?.id || 'dashboard';
    if (document.body.dataset.motionView !== view) document.body.dataset.motionView = view;
    for (const button of nav.querySelectorAll('[data-view]')) {
      if (button.dataset.view === view) {
        if (button.getAttribute('aria-current') !== 'page') button.setAttribute('aria-current', 'page');
      } else button.removeAttribute('aria-current');
    }
    // Keep the mobile header to brand + settings. Secondary page actions belong
    // with their page heading; moving the actual node preserves existing handlers.
    const add = $('#quickAdd');
    const head = document.getElementById(view)?.querySelector('.page-head');
    move(add, mobile.matches && view !== 'dashboard' && head ? head : topActions);
    $('.history-data-actions')?.classList.toggle('is-empty', !$('.history-data-actions')?.children.length);
  }

  function localDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
  function trainingDates() {
    const data = typeof records !== 'undefined' && Array.isArray(records) ? records : [];
    const entries = typeof checkins !== 'undefined' && checkins && typeof checkins === 'object' ? checkins : {};
    const dates = new Set(data.filter(record => Array.isArray(record.sets) && record.sets.length > 0).map(record => record.date));
    for (const [date, item] of Object.entries(entries)) if (item?.completed) dates.add(date);
    const today = localDate(new Date());
    return new Set([...dates].filter(date => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || date > today) return false;
      const parsed = new Date(`${date}T12:00:00`);
      return !Number.isNaN(+parsed) && localDate(parsed) === date;
    }));
  }
  function refreshProgress() {
    const dates = trainingDates();
    const now = new Date();
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
    monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
    const start = localDate(monday);
    const count = [...dates].filter(date => date >= start).length;
    const countNode = $('#sidebarWeekCount');
    if (countNode.textContent !== `${count} / 4`) countNode.textContent = `${count} / 4`;
    const progress = $('#sidebarWeekProgress');
    progress.value = Math.min(count, 4);
    progress.setAttribute('aria-valuetext', `本周 ${count} 个训练日，目标 4 天`);
    const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
    // An unfinished today doesn't erase an ongoing streak ending yesterday.
    if (!dates.has(localDate(cursor))) cursor.setDate(cursor.getDate() - 1);
    let streak = 0;
    while (dates.has(localDate(cursor))) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }
    const streakNode = $('#sidebarStreak b');
    if (streakNode.textContent !== String(streak)) streakNode.textContent = String(streak);
  }

  // A single trap handles static dialogs and asynchronously inserted photo viewers.
  // Capture the trigger before openOverlay moves focus; don't wrap/replace app APIs.
  const overlayStates = new Map();
  const inertStates = new Map();
  let overlayStack = [];
  let lastTrigger = null;
  let lastFocus = document.activeElement;
  let savedBodyOverflow = null;
  const focusableSelector = 'button, [href], input, select, textarea, [tabindex], summary, [contenteditable="true"], audio[controls], video[controls]';
  const isVisible = node => node.isConnected && !node.hidden && getComputedStyle(node).display !== 'none' && getComputedStyle(node).visibility !== 'hidden' && node.getClientRects().length > 0;
  const focusables = node => [...node.querySelectorAll(focusableSelector)].filter(element => element.tabIndex >= 0 && !element.disabled && !element.closest('[inert], [hidden]') && isVisible(element));
  const topOverlay = () => overlayStack[overlayStack.length - 1];
  function focusInside(node) {
    const target = focusables(node)[0] || node;
    if (target === node && !node.hasAttribute('tabindex')) node.tabIndex = -1;
    target.focus({ preventScroll: true });
  }
  document.addEventListener('pointerdown', event => {
    if (event.target instanceof Element) lastTrigger = event.target.closest(focusableSelector) || document.activeElement;
  }, true);
  document.addEventListener('keydown', event => {
    if (!topOverlay()) lastTrigger = document.activeElement;
    if (event.key === 'Tab' && topOverlay()) {
      const node = topOverlay();
      const items = focusables(node);
      const index = items.indexOf(document.activeElement);
      if (!items.length) {
        event.preventDefault();
        focusInside(node);
      } else if (event.shiftKey && index <= 0) {
        event.preventDefault(); items[items.length - 1].focus();
      } else if (!event.shiftKey && (index < 0 || index === items.length - 1)) {
        event.preventDefault(); items[0].focus();
      }
    } else if (event.key === 'Escape' && topOverlay()) {
      const node = topOverlay();
      const close = node.querySelector('[data-close-overlay], [data-photo-close], .ml-close');
      event.preventDefault();
      event.stopImmediatePropagation();
      if (close) close.click();
      else if (node.id && typeof closeOverlay === 'function') closeOverlay(node.id);
      else node.hidden = true;
    }
  }, true);
  document.addEventListener('focusin', event => {
    const node = topOverlay();
    if (node && !node.contains(event.target) && isVisible(node)) focusInside(node);
    else lastFocus = event.target;
  });
  function syncInert(node) {
    const desired = new Set();
    // Inert only sibling branches, so an overlay nested inside <main> stays usable.
    for (let branch = node; branch && branch !== document.body; branch = branch.parentElement) {
      for (const sibling of branch.parentElement?.children || []) {
        if (sibling !== branch && !['SCRIPT', 'STYLE', 'LINK'].includes(sibling.tagName)) desired.add(sibling);
      }
    }
    for (const [element, oldValue] of inertStates) {
      if (!desired.has(element)) { element.inert = oldValue; inertStates.delete(element); }
    }
    for (const element of desired) {
      if (!inertStates.has(element)) { inertStates.set(element, element.inert); element.inert = true; }
    }
  }
  function refreshOverlays() {
    const visible = [...document.querySelectorAll('.ml-overlay')].filter(isVisible);
    const opened = visible.filter(node => !overlayStates.has(node));
    const closed = overlayStack.filter(node => !visible.includes(node));
    overlayStack = overlayStack.filter(node => visible.includes(node));
    for (const node of opened) {
      const trigger = lastTrigger?.isConnected && !node.contains(lastTrigger) ? lastTrigger : lastFocus;
      overlayStates.set(node, { trigger });
      overlayStack.push(node);
      node.setAttribute('role', 'dialog');
      node.setAttribute('aria-modal', 'true');
      if (!node.hasAttribute('aria-label') && !node.hasAttribute('aria-labelledby')) {
        const title = node.querySelector('h1, h2, h3');
        if (title) { title.id ||= `${node.id || 'motionDialog'}Title`; node.setAttribute('aria-labelledby', title.id); }
        else node.setAttribute('aria-label', '照片预览');
      }
    }
    const top = topOverlay();
    syncInert(top);
    if (top) {
      if (savedBodyOverflow === null) savedBodyOverflow = document.body.style.overflow === 'hidden' ? '' : document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      if (!top.contains(document.activeElement)) focusInside(top);
    } else {
      if (savedBodyOverflow !== null) { document.body.style.overflow = savedBodyOverflow; savedBodyOverflow = null; }
      // The app may already restore focus; only correct a missing/wrong target.
      const trigger = closed.map(node => overlayStates.get(node)?.trigger).find(target => target?.isConnected && isVisible(target));
      if (trigger && document.activeElement !== trigger) trigger.focus({ preventScroll: true });
    }
    for (const node of closed) overlayStates.delete(node);
    if (opened.length) closeSettings();
  }

  let queued = false;
  function refresh() {
    queued = false;
    placeControls();
    refreshOverlays();
  }
  function scheduleRefresh() {
    if (queued) return;
    queued = true;
    queueMicrotask(refresh);
  }
  const observer = new MutationObserver(scheduleRefresh);
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'class'] });
  mobile.addEventListener('change', () => { closeSettings(); scheduleRefresh(); });
  document.addEventListener('motion:data-changed', () => { refreshProgress(); scheduleRefresh(); });
  window.addEventListener('focus', refreshProgress);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshProgress(); });
  window.MotionLayout = Object.freeze({ refresh: () => { refreshProgress(); scheduleRefresh(); }, colors: window.MUSCLE_COLORS });
  refreshProgress();
  refresh();
  window.dispatchEvent(new CustomEvent('motion:layout-ready'));
})();
