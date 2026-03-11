/* ═══════════════════════════════════════════
   BLACK NOISE — app.js
   ═══════════════════════════════════════════ */

'use strict';

// ── STATE ──────────────────────────────────
const state = {
  totalSeconds: 0,
  remaining:    0,
  timerHandle:  null,
  burstHandle:  null,
  isBursting:   false,
  audioCtx:     null,
  gainNode:     null,
  burstSource:  null,
  settings: {
    volume:   0.70,
    interval: 0.50,   // 0=frequent … 1=rare
    duration: 0.50,   // 0=short … 1=long
    freq:     0.50    // 0=deep … 1=harsh
  }
};

// ── PICKER VALUES ──────────────────────────
const picked = { h: 0, m: 0, s: 0 };

// ── DOM REFS ───────────────────────────────
const screenPicker  = document.getElementById('screen-picker');
const screenSession = document.getElementById('screen-session');
const countdownEl   = document.getElementById('countdown');
const sessionSub    = document.getElementById('session-sublabel');
const burstRing     = document.getElementById('burst-ring');
const burstStatus   = document.getElementById('burst-status');
const waveformBars  = document.getElementById('waveform-bars');
const settingsDrawer = document.getElementById('settings-drawer');
const settingsOverlay = document.getElementById('settings-overlay');
const hamburgerBtn  = document.getElementById('hamburger-btn');

// ══════════════════════════════════════════
//  DRUM PICKER
// ══════════════════════════════════════════
function buildDrumCols() {
  [
    { id: 'col-h', max: 23, key: 'h', def: 0 },
    { id: 'col-m', max: 59, key: 'm', def: 5 },
    { id: 'col-s', max: 59, key: 's', def: 0 }
  ].forEach(({ id, max, key, def }) => {
    const col = document.getElementById(id);
    initDrum(col, max, key, def);
  });
}

const ITEM_H    = 52;   // must match --picker-h in CSS
const VIS_ITEMS = 5;
const OFFSET    = 2;    // items above/below selection

function initDrum(col, max, key, defVal) {
  const inner = document.createElement('div');
  inner.className = 'drum-col-inner';

  // Pad top/bottom so selection aligns
  const total = max + 1;
  for (let i = 0; i < total; i++) {
    const item = document.createElement('div');
    item.className = 'drum-item';
    item.textContent = String(i).padStart(2, '0');
    inner.appendChild(item);
  }
  col.appendChild(inner);

  // State
  let currentY   = -defVal * ITEM_H;
  let startY     = 0;
  let lastY      = 0;
  let velocity   = 0;
  let rafId      = null;
  let isDragging = false;
  let lastTime   = 0;

  picked[key] = defVal;
  applyTranslate(inner, currentY);

  function clamp(y) {
    return Math.min(0, Math.max(-(max * ITEM_H), y));
  }
  function snap(y) {
    return -Math.round(-y / ITEM_H) * ITEM_H;
  }
  function applyTranslate(el, y) {
    el.style.transform = `translateY(${y + OFFSET * ITEM_H}px)`;
    const idx = Math.round(-y / ITEM_H);
    picked[key] = Math.min(max, Math.max(0, idx));
    highlightItems(el, idx);
  }
  function highlightItems(el, active){
    el.querySelectorAll('.drum-item').forEach((item, i) => {
      const dist = Math.abs(i - active);
      item.style.opacity = dist === 0 ? '1' : dist === 1 ? '0.45' : dist === 2 ? '0.2' : '0.07';
      item.style.transform = dist === 0 ? 'scale(1)' : dist === 1 ? 'scale(0.88)' : 'scale(0.76)';
    });
  }

  function startInertia(){
    if (rafId) cancelAnimationFrame(rafId);
    function step(){
      velocity *= 0.92;
      currentY = clamp(currentY + velocity);
      applyTranslate(inner, currentY);
      if (Math.abs(velocity) > 0.5) {
        rafId = requestAnimationFrame(step);
      } else {
        const snapped = clamp(snap(currentY));
        animateTo(snapped);
      }
    }
    rafId = requestAnimationFrame(step);
  }

  function animateTo(target) {
    if (rafId) cancelAnimationFrame(rafId);
    function step(){
      const diff = target - currentY;
      if (Math.abs(diff) < 0.5) {
        currentY = target; applyTranslate(inner, currentY); return;
      }
      currentY += diff * 0.25;
      applyTranslate(inner, currentY);
      rafId = requestAnimationFrame(step);
    }
    rafId = requestAnimationFrame(step);
  }

  // ── Touch ──
  col.addEventListener('touchstart', e => {
    isDragging = true; velocity = 0;
    startY = lastY = e.touches[0].clientY;
    lastTime = Date.now();
    if (rafId) cancelAnimationFrame(rafId);
  }, { passive: true });

  col.addEventListener('touchmove', e => {
    if (!isDragging) return;
    const now = Date.now();
    const dy  = e.touches[0].clientY - lastY;
    velocity  = dy / Math.max(1, now - lastTime) * 16;
    currentY  = clamp(currentY + dy);
    applyTranslate(inner, currentY);
    lastY = e.touches[0].clientY; lastTime = now;
  }, { passive: true });

  col.addEventListener('touchend', () => { isDragging = false; startInertia(); });

  // ── Mouse ──
  col.addEventListener('mousedown', e => {
    isDragging = true; velocity = 0;
    startY = lastY = e.clientY; lastTime = Date.now();
    if (rafId) cancelAnimationFrame(rafId);
  });
  window.addEventListener('mousemove', e => {
    if (!isDragging) return;
    const now = Date.now();
    const dy  = e.clientY - lastY;
    velocity  = dy / Math.max(1, now - lastTime) * 16;
    currentY  = clamp(currentY + dy);
    applyTranslate(inner, currentY);
    lastY = e.clientY; lastTime = now;
  });
  window.addEventListener('mouseup', () => { if (isDragging){ isDragging = false; startInertia(); } });

  // ── Wheel ──
  col.addEventListener('wheel', e => {
    e.preventDefault();
    currentY = clamp(currentY - e.deltaY * 0.6);
    applyTranslate(inner, currentY);
    if (rafId) cancelAnimationFrame(rafId);
    rafId = setTimeout(() => animateTo(clamp(snap(currentY))), 80);
  }, { passive: false });

  // Initial highlight
  highlightItems(inner, defVal);
}

// ══════════════════════════════════════════
//  AUDIO ENGINE
// ══════════════════════════════════════════
function ensureAudioCtx() {
  if (!state.audioCtx) {
    state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    state.gainNode = state.audioCtx.createGain();
    state.gainNode.connect(state.audioCtx.destination);
    state.gainNode.gain.value = state.settings.volume;
  }
  if (state.audioCtx.state === 'suspended') state.audioCtx.resume();
}

function fireNoiseBurst(durationSec) {
  if (!state.audioCtx) return;

  // Stop any in-progress burst
  if (state.burstSource) {
    try { state.burstSource.stop(); } catch(e){}
    state.burstSource = null;
  }

  const ctx   = state.audioCtx;
  const freq  = state.settings.freq;  // 0=deep, 1=harsh

  // Create white noise buffer
  const bufLen   = Math.ceil(ctx.sampleRate * durationSec);
  const buffer   = ctx.createBuffer(1, bufLen, ctx.sampleRate);
  const data     = buffer.getChannelData(0);
  for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  // Biquad filter to shape frequency character
  const bq = ctx.createBiquadFilter();
  // freq=0: lowpass at ~150Hz (deep rumble)
  // freq=0.5: no sharp filter (raw)
  // freq=1: highpass + slight resonance (harsh)
  if (freq < 0.5) {
    bq.type = 'lowpass';
    bq.frequency.value = 150 + freq * 2 * 3000; // 150–3150 Hz
    bq.Q.value = 1;
  } else {
    bq.type = 'highpass';
    bq.frequency.value = (freq - 0.5) * 2 * 4000; // 0–4000 Hz
    bq.Q.value = 1.5 + freq * 3;
  }

  // Envelope: quick attack, sustain, quick release
  const envGain = ctx.createGain();
  const attack  = 0.04;
  const release = Math.min(0.3, durationSec * 0.2);
  envGain.gain.setValueAtTime(0, ctx.currentTime);
  envGain.gain.linearRampToValueAtTime(1, ctx.currentTime + attack);
  envGain.gain.setValueAtTime(1, ctx.currentTime + durationSec - release);
  envGain.gain.linearRampToValueAtTime(0, ctx.currentTime + durationSec);

  source.connect(bq);
  bq.connect(envGain);
  envGain.connect(state.gainNode);

  source.start(ctx.currentTime);
  source.stop(ctx.currentTime + durationSec);
  state.burstSource = source;
  source.onended = () => { if (state.burstSource === source) state.burstSource = null; };
}

// ══════════════════════════════════════════
//  BURST ENGINE
// ══════════════════════════════════════════
function scheduleNextBurst() {
  if (!state.timerHandle) return;  // session stopped

  const iv   = state.settings.interval;  // 0=frequent, 1=rare
  // Interval: 3s–120s, scaled by randomness setting
  const minGap = 3;
  const maxGap = 10 + iv * 110;        // 10s to 120s
  const gap    = minGap + Math.random() * (maxGap - minGap);

  state.burstHandle = setTimeout(() => {
    if (!state.timerHandle) return;
    triggerBurst();
  }, gap * 1000);
}

function triggerBurst() {
  const dur = state.settings.duration;
  // Duration: 0.3s–12s
  const minD = 0.3;
  const maxD = 0.5 + dur * 11.5;
  const d    = minD + Math.random() * (maxD - minD);

  enterBurstState(d);
  scheduleNextBurst();
}

function enterBurstState(duration) {
  state.isBursting = true;
  screenSession.classList.add('bursting');
  waveformBars.classList.add('active');
  burstStatus.textContent = 'BURST';
  sessionSub.textContent  = 'Noise burst active';

  // Flash the body bg briefly
  document.body.classList.add('flash-anim');
  setTimeout(() => document.body.classList.remove('flash-anim'), 300);

  // Animate bars
  document.querySelectorAll('.bar').forEach(b => {
    const h = 6 + Math.random() * 46;
    b.style.setProperty('--bar-max', h + 'px');
    b.style.setProperty('--bar-dur', (0.08 + Math.random() * 0.25) + 's');
    b.style.setProperty('--bar-delay', (Math.random() * 0.1) + 's');
  });

  fireNoiseBurst(duration);

  setTimeout(() => exitBurstState(), duration * 1000);
}

function exitBurstState() {
  state.isBursting = false;
  screenSession.classList.remove('bursting');
  waveformBars.classList.remove('active');
  burstStatus.textContent = 'STANDBY';
  sessionSub.textContent  = 'Listening for bursts…';
}

// ══════════════════════════════════════════
//  SESSION START / STOP
// ══════════════════════════════════════════
function startSession() {
  const total = picked.h * 3600 + picked.m * 60 + picked.s;
  if (total === 0) {
    // Default to 5 minutes if nothing set
    picked.m = 5;
    state.totalSeconds = 300;
  } else {
    state.totalSeconds = total;
  }
  state.remaining = state.totalSeconds;

  ensureAudioCtx();

  // Transition screens
  screenPicker.classList.add('exit');
  setTimeout(() => {
    screenPicker.classList.remove('active', 'exit');
    screenSession.classList.add('active');
  }, 450);

  updateCountdownDisplay();

  // Countdown tick
  state.timerHandle = setInterval(() => {
    state.remaining--;
    updateCountdownDisplay();
    if (state.remaining <= 0) stopSession(true);
  }, 1000);

  // Schedule first burst after a short delay (1–4s)
  const firstDelay = 1000 + Math.random() * 3000;
  state.burstHandle = setTimeout(() => {
    triggerBurst();
  }, firstDelay);
}

function stopSession(finished) {
  clearInterval(state.timerHandle);
  clearTimeout(state.burstHandle);
  state.timerHandle = null;
  state.burstHandle = null;

  if (state.burstSource) {
    try { state.burstSource.stop(); } catch(e){}
    state.burstSource = null;
  }
  exitBurstState();

  // Close settings if open
  if (settingsDrawer.classList.contains('open')) toggleMenu();

  // Transition back to picker
  screenSession.classList.add('exit');
  setTimeout(() => {
    screenSession.classList.remove('active', 'exit');
    screenPicker.classList.add('active');
  }, 450);
}

function updateCountdownDisplay() {
  const h = Math.floor(state.remaining / 3600);
  const m = Math.floor((state.remaining % 3600) / 60);
  const s = state.remaining % 60;
  countdownEl.textContent =
    String(h).padStart(2,'0') + ':' +
    String(m).padStart(2,'0') + ':' +
    String(s).padStart(2,'0');
}

// ══════════════════════════════════════════
//  SETTINGS
// ══════════════════════════════════════════
function toggleMenu() {
  const open = settingsDrawer.classList.toggle('open');
  settingsOverlay.classList.toggle('open', open);
  hamburgerBtn.classList.toggle('open', open);
}

function updateSetting(key, raw) {
  const v = parseFloat(raw);
  switch(key) {
    case 'volume':
      state.settings.volume = v / 100;
      document.getElementById('val-volume').textContent = v + '%';
      if (state.gainNode) state.gainNode.gain.value = state.settings.volume;
      break;
    case 'interval':
      state.settings.interval = v / 100;
      document.getElementById('val-interval').textContent = v + '%';
      break;
    case 'duration':
      state.settings.duration = v / 100;
      document.getElementById('val-duration').textContent = v + '%';
      break;
    case 'freq':
      state.settings.freq = v / 100;
      const label = v < 20 ? 'Deep' : v < 40 ? 'Low-Mid' : v < 60 ? 'Mid' : v < 80 ? 'High-Mid' : 'Harsh';
      document.getElementById('val-freq').textContent = label;
      break;
  }
}

function testBurst() {
  ensureAudioCtx();
  const duration = 0.5 + Math.random() * 2;
  enterBurstState(duration);
}

// ══════════════════════════════════════════
//  SERVICE WORKER REGISTRATION
// ══════════════════════════════════════════
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

// ══════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════
buildDrumCols();
