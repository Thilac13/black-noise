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

// ── PICKER VALUES (Handled via inputs now) ──

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
//  SIMPLE PICKER ACCESS
// ══════════════════════════════════════════
function getPickedTime() {
  const hInput = document.getElementById('input-h');
  const mInput = document.getElementById('input-m');
  const sInput = document.getElementById('input-s');
  return {
    h: parseInt(hInput.value, 10) || 0,
    m: parseInt(mInput.value, 10) || 0,
    s: parseInt(sInput.value, 10) || 0
  };
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
  const picked = getPickedTime();
  const total = picked.h * 3600 + picked.m * 60 + picked.s;
  if (total === 0) {
    // Default to 5 minutes if nothing set
    document.getElementById('input-m').value = 5;
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
// (No drum cols to build anymore)
