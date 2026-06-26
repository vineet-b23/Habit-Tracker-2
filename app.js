/* ===== AETERNA — APP.JS ===== */
/* Production-grade habit tracking engine. Zero dependencies. */

'use strict';

// ── Constants ──
const STORAGE_KEY = 'aeterna_v1';
const XP_PER_LEVEL = 100;
const XP_HABIT_BASE = 10;
const XP_HABIT_FLOW = 15;
const XP_SHADOW_BREAK = -5;
const MAX_SHADOW_DAILY_XP = 30;
const MAX_MEND_TOKENS = 2;
const MEND_TOKEN_MILESTONE = 10;
const ARCHIVE_AFTER_DAYS = 90;
const DELETE_PHRASE = 'I am choosing comfort over discipline';

const STOIC_QUOTES = [
  { text: "You have power over your mind, not outside events. Realize this, and you will find strength.", author: "Marcus Aurelius" },
  { text: "The impediment to action advances action. What stands in the way becomes the way.", author: "Marcus Aurelius" },
  { text: "Waste no more time arguing about what a good man should be. Be one.", author: "Marcus Aurelius" },
  { text: "Accept the things to which fate binds you, and love the people with whom fate brings you together.", author: "Marcus Aurelius" },
  { text: "If it is not right, do not do it; if it is not true, do not say it.", author: "Marcus Aurelius" },
  { text: "Very little is needed to make a happy life; it is all within yourself, in your way of thinking.", author: "Marcus Aurelius" },
  { text: "The first rule is to keep an untroubled spirit. The second is to look things in the face and know them for what they are.", author: "Marcus Aurelius" },
  { text: "Do not indulge in expectations across long stretches of time. Of every advantage of opportunity, ask: what is this?", author: "Marcus Aurelius" },
  { text: "Make the best use of what is in your power, and take the rest as it happens.", author: "Epictetus" },
  { text: "He is a wise man who does not grieve for the things which he has not, but rejoices for those which he has.", author: "Epictetus" },
  { text: "No man is free who is not master of himself.", author: "Epictetus" },
  { text: "Seek not the good in external things; seek it in yourself.", author: "Epictetus" },
  { text: "It's not what happens to you, but how you react to it that matters.", author: "Epictetus" },
  { text: "Wealth consists not in having great possessions, but in having few wants.", author: "Epictetus" },
  { text: "First say to yourself what you would be; and then do what you have to do.", author: "Epictetus" },
  { text: "Omnia aliena sunt, tempus tantum nostrum est. All things are alien; time alone is ours.", author: "Seneca" },
  { text: "Nusquam est qui ubique est. One who is everywhere is nowhere.", author: "Seneca" },
  { text: "While we are postponing, life speeds by.", author: "Seneca" },
  { text: "It is not that I am brave, but that I know what is worth fearing.", author: "Seneca" },
  { text: "Dum differtur vita transcurrit. Luck is what happens when preparation meets opportunity.", author: "Seneca" }
];

// ── Storage Engine ──
let storageAvailable = false;

function checkStorage() {
  try {
    const t = '__aeterna_test__';
    localStorage.setItem(t, '1');
    localStorage.removeItem(t);
    storageAvailable = true;
  } catch (e) {
    storageAvailable = false;
  }
}

function saveState() {
  if (!storageAvailable) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    storageAvailable = false;
    showStorageWarning();
  }
}

function loadRawState() {
  if (!storageAvailable) return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

// ── Default State Factory ──
function defaultState() {
  return {
    habits: [],
    completions: {},
    profile: { level: 1, xp: 0 },
    settings: { solarTheme: 'auto' },
    statistics: { perfectDays: [] }
  };
}

// ── Schema Validation ──
function validateImportedState(obj) {
  if (typeof obj !== 'object' || obj === null) return 'Root must be an object.';
  const required = ['habits', 'completions', 'profile', 'settings', 'statistics'];
  for (const k of required) if (!(k in obj)) return `Missing key: "${k}".`;
  if (!Array.isArray(obj.habits)) return '"habits" must be an array.';
  if (typeof obj.completions !== 'object' || Array.isArray(obj.completions)) return '"completions" must be an object.';
  const p = obj.profile;
  if (typeof p !== 'object' || p === null) return '"profile" must be an object.';
  if (typeof p.level !== 'number' || p.level < 1) return '"profile.level" must be a number >= 1.';
  if (typeof p.xp !== 'number' || p.xp < 0) return '"profile.xp" must be a number >= 0.';
  if (typeof obj.settings !== 'object') return '"settings" must be an object.';
  if (typeof obj.statistics !== 'object') return '"statistics" must be an object.';
  if (!Array.isArray(obj.statistics.perfectDays)) return '"statistics.perfectDays" must be an array.';
  for (const h of obj.habits) {
    if (typeof h.id !== 'string') return 'Habit missing "id".';
    if (typeof h.name !== 'string' || !h.name.trim()) return 'Habit missing valid "name".';
    if (!['Mind','Body','Craft'].includes(h.pillar) && h.type !== 'shadow') return `Invalid pillar "${h.pillar}".`;
    if (!['Dawn','Noon','Dusk'].includes(h.bracket)) return `Invalid bracket "${h.bracket}".`;
    if (!['standard','shadow'].includes(h.type)) return `Invalid type "${h.type}".`;
    const mt = h.mendTokens;
    if (typeof mt !== 'number' || mt < 0 || mt > MAX_MEND_TOKENS) return `"mendTokens" must be 0–${MAX_MEND_TOKENS}.`;
  }
  return null;
}

function sanitizeState(raw) {
  const s = defaultState();
  s.habits = (raw.habits || []).map(h => ({
    id: String(h.id || genId()),
    name: String(h.name || 'Unnamed'),
    pillar: ['Mind','Body','Craft'].includes(h.pillar) ? h.pillar : 'Mind',
    bracket: ['Dawn','Noon','Dusk'].includes(h.bracket) ? h.bracket : 'Dawn',
    type: h.type === 'shadow' ? 'shadow' : 'standard',
    creationDate: h.creationDate || todayStr(),
    currentStreak: Math.max(0, Number(h.currentStreak) || 0),
    bestStreak: Math.max(0, Number(h.bestStreak) || 0),
    mendTokens: Math.min(MAX_MEND_TOKENS, Math.max(0, Number(h.mendTokens) || 0)),
    isFractured: Boolean(h.isFractured),
    archivedCompletions: Math.max(0, Number(h.archivedCompletions) || 0)
  }));
  s.completions = raw.completions || {};
  s.profile = {
    level: Math.max(1, Number(raw.profile?.level) || 1),
    xp: Math.max(0, Number(raw.profile?.xp) || 0)
  };
  s.settings = { solarTheme: raw.settings?.solarTheme || 'auto' };
  s.statistics = { perfectDays: Array.isArray(raw.statistics?.perfectDays) ? raw.statistics.perfectDays : [] };
  return s;
}

// ── Application State ──
let state = defaultState();

// ── UI State ──
let activeBracket = 'all';
let editingHabitId = null;
let deletingHabitId = null;
let mendingHabitId = null;
let themeMode = 'auto'; // 'auto' | 'day' | 'night'

// ── Utilities ──
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function todayStr(d) {
  const dt = d || new Date();
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
}

// The Aeterna tracking day starts at 4:00 AM and ends at 3:59:59 AM next day.
// Returns the "tracking date" (YYYY-MM-DD) for the current moment.
function trackingDate() {
  const now = new Date();
  const h = now.getHours();
  // If before 4:00 AM, tracking date is yesterday
  if (h < 4) {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    return todayStr(yesterday);
  }
  return todayStr(now);
}

function getCurrentHour() { return new Date().getHours(); }

function isNightMode() {
  const h = getCurrentHour();
  return h >= 17 || h < 4;
}

function getBracketForHour(h) {
  if (h >= 4 && h < 12) return 'Dawn';
  if (h >= 12 && h < 17) return 'Noon';
  return 'Dusk';
}

function currentBracket() {
  return getBracketForHour(getCurrentHour());
}

function isBracketActive(bracket) {
  const cb = currentBracket();
  if (bracket === 'Dusk') {
    // Dusk spans 17:00 – 3:59 AM next day
    const h = getCurrentHour();
    return h >= 17 || h < 4;
  }
  return bracket === cb;
}

function dateAddDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return todayStr(d);
}

function dateDiffDays(a, b) {
  const da = new Date(a + 'T12:00:00');
  const db = new Date(b + 'T12:00:00');
  return Math.round((db - da) / 86400000);
}

function isCompleted(habitId, dateStr) {
  return !!(state.completions[habitId] && state.completions[habitId][dateStr]);
}

// ── Archive & Purge ──
function runArchivePurge() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - ARCHIVE_AFTER_DAYS);
  const cutoffStr = todayStr(cutoff);
  let changed = false;
  for (const habitId of Object.keys(state.completions)) {
    const days = state.completions[habitId];
    for (const dateStr of Object.keys(days)) {
      if (dateStr < cutoffStr && days[dateStr] === true) {
        const habit = state.habits.find(h => h.id === habitId);
        if (habit) habit.archivedCompletions++;
        delete days[dateStr];
        changed = true;
      }
    }
    if (Object.keys(days).length === 0) delete state.completions[habitId];
  }
  if (changed) saveState();
}

// ── Streak Mathematics ──
// Computes current streak forward from creationDate, non-mutating.
function computeStreak(habit) {
  const today = trackingDate();
  let streak = 0;
  let d = today;
  // Walk backwards from today
  while (true) {
    if (d < habit.creationDate) break;
    if (isCompleted(habit.id, d)) {
      streak++;
      d = dateAddDays(d, -1);
    } else {
      break;
    }
  }
  return streak;
}

// Checks if a habit has a gap (missed day) between creationDate and yesterday
function hasMissedDay(habit) {
  const today = trackingDate();
  const yesterday = dateAddDays(today, -1);
  if (yesterday < habit.creationDate) return false;
  return !isCompleted(habit.id, yesterday) && !isCompleted(habit.id, today);
}

// Full streak recompute and update for a habit
function recomputeAndSaveStreak(habit) {
  const streak = computeStreak(habit);
  habit.currentStreak = streak;
  if (streak > habit.bestStreak) habit.bestStreak = streak;
  // Award Mend Token at each MEND_TOKEN_MILESTONE milestone, max MAX_MEND_TOKENS
  if (streak > 0 && streak % MEND_TOKEN_MILESTONE === 0 && habit.mendTokens < MAX_MEND_TOKENS) {
    habit.mendTokens = Math.min(MAX_MEND_TOKENS, habit.mendTokens + 1);
    showToast(`🪢 Mend Token earned on "${habit.name}"!`);
  }
}

// ── XP Engine ──
function addXP(amount) {
  state.profile.xp += amount;
  let leveled = false;
  while (state.profile.xp >= XP_PER_LEVEL) {
    state.profile.xp -= XP_PER_LEVEL;
    state.profile.level++;
    leveled = true;
  }
  if (state.profile.xp < 0) state.profile.xp = 0;
  saveState();
  updateXPBar();
  if (leveled) onLevelUp();
}

function onLevelUp() {
  playLevelUpSound();
  showToast(`✨ Level ${state.profile.level}! Keep going.`);
  const bar = document.getElementById('xp-bar-wrapper');
  if (bar) { bar.classList.add('level-up-flash'); setTimeout(() => bar.classList.remove('level-up-flash'), 600); }
}

// ── Flow State (Pillar Combos) ──
// A pillar has a 3-day perfect completion streak across all habits in it
function pillarHasFlowState(pillar) {
  const habits = state.habits.filter(h => h.pillar === pillar && h.type === 'standard');
  if (habits.length === 0) return false;
  const today = trackingDate();
  for (let offset = 0; offset < 3; offset++) {
    const d = dateAddDays(today, -offset);
    for (const h of habits) {
      if (!isCompleted(h.id, d)) return false;
    }
  }
  return true;
}

// ── Perfect Day Logic ──
function isPerfectDay(dateStr) {
  const activeHabits = state.habits.filter(h => h.type === 'standard' && h.creationDate <= dateStr);
  if (activeHabits.length === 0) return false;
  return activeHabits.every(h => isCompleted(h.id, dateStr));
}

function recomputePerfectDays() {
  // Look back 30 days + today
  const today = trackingDate();
  const days = [];
  for (let i = 0; i < 31; i++) {
    const d = dateAddDays(today, -i);
    if (isPerfectDay(d)) days.push(d);
  }
  // Merge with stored perfect days beyond 30 days
  const older = (state.statistics.perfectDays || []).filter(d => dateDiffDays(d, today) > 31);
  state.statistics.perfectDays = [...new Set([...older, ...days])];
}

// ── Shadow Habit Engine ──
// Shadow: starts intact. Breaking costs -5 XP. Surviving rollover awards XP.
// "broken" = completions[id][trackingDate] === true means they BROKE the vice
function isShadowBroken(habit) {
  return isCompleted(habit.id, trackingDate());
}

// Shadow XP dividend on rollover (called at 4 AM boundary)
// For now, we detect the rollover check via the 60s loop.
let lastRolloverDate = null;

function checkShadowRollover() {
  const today = trackingDate();
  if (lastRolloverDate === today) return;
  lastRolloverDate = today;
  // Award shadow XP for habits that survived yesterday
  const yesterday = dateAddDays(today, -1);
  const shadowHabits = state.habits.filter(h => h.type === 'shadow');
  if (shadowHabits.length === 0) return;
  const surviving = shadowHabits.filter(h => !isCompleted(h.id, yesterday));
  if (surviving.length === 0) return;
  const totalCap = MAX_SHADOW_DAILY_XP;
  const perHabit = Math.floor(totalCap / shadowHabits.length);
  const totalAward = perHabit * surviving.length;
  if (totalAward > 0) {
    addXP(totalAward);
    showToast(`🌑 Shadow resilience: +${totalAward} XP`);
  }
}

// ── Toggle Habit Completion ──
function toggleHabit(habitId) {
  const habit = state.habits.find(h => h.id === habitId);
  if (!habit) return;
  const today = trackingDate();

  if (habit.type === 'shadow') {
    // Toggle shadow: mark broken or unbreak
    if (isShadowBroken(habit)) {
      // Unbreak shadow (undo)
      if (!state.completions[habitId]) state.completions[habitId] = {};
      delete state.completions[habitId][today];
      addXP(5); // refund
      showToast(`🌑 Shadow restored.`);
    } else {
      // Break shadow
      if (!state.completions[habitId]) state.completions[habitId] = {};
      state.completions[habitId][today] = true;
      addXP(XP_SHADOW_BREAK);
      playClickSound();
      showToast(`⚠ Shadow broken. ${XP_SHADOW_BREAK} XP.`);
    }
    saveState();
    renderAll();
    return;
  }

  // Standard habit
  const alreadyDone = isCompleted(habitId, today);
  if (alreadyDone) {
    // Uncheck
    delete state.completions[habitId][today];
    // Subtract XP
    const pillar = habit.pillar;
    const xpToRemove = pillarHasFlowState(pillar) ? XP_HABIT_FLOW : XP_HABIT_BASE;
    addXP(-xpToRemove);
    recomputeAndSaveStreak(habit);
    recomputePerfectDays();
    saveState();
    showToast(`↩ Unchecked "${habit.name}"`);
    renderAll();
    return;
  }

  // Check for fracture (missed yesterday)
  if (habit.isFractured) {
    // Already fractured — offer mend
    if (habit.mendTokens > 0) {
      openMendModal(habitId);
      return;
    } else {
      // No tokens — auto-reset
      habit.currentStreak = 0;
      habit.isFractured = false;
    }
  }

  // Check if yesterday was missed (creates fracture)
  const yesterday = dateAddDays(today, -1);
  if (today !== habit.creationDate && !isCompleted(habitId, yesterday) && yesterday >= habit.creationDate && habit.currentStreak > 0) {
    // Streak break — offer mend if tokens available
    habit.isFractured = true;
    saveState();
    if (habit.mendTokens > 0) {
      openMendModal(habitId);
    } else {
      habit.currentStreak = 0;
      habit.isFractured = false;
      saveState();
      showToast(`💔 Streak lost on "${habit.name}". No tokens remain.`);
      doCheckIn(habit, today);
    }
    return;
  }

  doCheckIn(habit, today);
}

function doCheckIn(habit, today) {
  if (!state.completions[habit.id]) state.completions[habit.id] = {};
  state.completions[habit.id][today] = true;
  recomputeAndSaveStreak(habit);
  habit.isFractured = false;
  const xpGain = pillarHasFlowState(habit.pillar) ? XP_HABIT_FLOW : XP_HABIT_BASE;
  addXP(xpGain);
  recomputePerfectDays();
  saveState();
  playClickSound();
  showToast(`+${xpGain} XP — "${habit.name}"`);
  renderAll();
}

// ── Mend Token Flow ──
function openMendModal(habitId) {
  mendingHabitId = habitId;
  const habit = state.habits.find(h => h.id === habitId);
  const body = document.getElementById('mend-modal-body');
  if (body) body.textContent = `"${habit.name}" streak is fractured. Spend 1 Mend Token to stitch the gap (${habit.mendTokens} available) or accept a reset to Day 1.`;
  openModal('mend-modal');
}

function spendMendToken(habitId) {
  const habit = state.habits.find(h => h.id === habitId);
  if (!habit || habit.mendTokens < 1) return;
  habit.mendTokens--;
  habit.isFractured = false;
  // Heal yesterday
  const yesterday = dateAddDays(trackingDate(), -1);
  if (!state.completions[habitId]) state.completions[habitId] = {};
  state.completions[habitId][yesterday] = true;
  recomputeAndSaveStreak(habit);
  recomputePerfectDays();
  saveState();
  showToast(`🪢 Streak mended! "${habit.name}"`);
  closeModal('mend-modal');
  // Now do the actual check-in
  doCheckIn(habit, trackingDate());
}

function acceptStreakReset(habitId) {
  const habit = state.habits.find(h => h.id === habitId);
  if (!habit) return;
  habit.isFractured = false;
  habit.currentStreak = 0;
  saveState();
  closeModal('mend-modal');
  showToast(`↺ Streak reset. Start again.`);
  renderAll();
}

// ── CRUD ──
function openAddModal() {
  editingHabitId = null;
  document.getElementById('modal-title').textContent = 'New Ritual';
  document.getElementById('habit-name').value = '';
  clearRadioGroup('pillar');
  clearRadioGroup('bracket');
  clearRadioGroup('type');
  // Default type to standard
  setRadioValue('type', 'standard');
  clearFieldErrors();
  openModal('habit-modal');
  setTimeout(() => document.getElementById('habit-name').focus(), 80);
}

function openEditModal(habitId) {
  const habit = state.habits.find(h => h.id === habitId);
  if (!habit) return;
  editingHabitId = habitId;
  document.getElementById('modal-title').textContent = 'Edit Ritual';
  document.getElementById('habit-name').value = habit.name;
  setRadioValue('pillar', habit.pillar);
  setRadioValue('bracket', habit.bracket);
  setRadioValue('type', habit.type);
  clearFieldErrors();
  openModal('habit-modal');
  setTimeout(() => document.getElementById('habit-name').focus(), 80);
}

function saveHabit() {
  const name = document.getElementById('habit-name').value.trim();
  const pillar = getRadioValue('pillar');
  const bracket = getRadioValue('bracket');
  const type = getRadioValue('type');
  let valid = true;
  clearFieldErrors();
  if (!name) { showFieldError('name-error'); valid = false; }
  if (!type) { showFieldError('type-error'); valid = false; }
  if (type !== 'shadow' && !pillar) { showFieldError('pillar-error'); valid = false; }
  if (!bracket) { showFieldError('bracket-error'); valid = false; }
  if (!valid) return;

  if (editingHabitId) {
    const habit = state.habits.find(h => h.id === editingHabitId);
    if (habit) {
      habit.name = name;
      if (type !== 'shadow') habit.pillar = pillar;
      habit.bracket = bracket;
      habit.type = type;
      // creationDate is immutable
    }
  } else {
    const newHabit = {
      id: genId(),
      name,
      pillar: type === 'shadow' ? 'Shadow' : pillar,
      bracket,
      type,
      creationDate: trackingDate(),
      currentStreak: 0,
      bestStreak: 0,
      mendTokens: 0,
      isFractured: false,
      archivedCompletions: 0
    };
    state.habits.push(newHabit);
    if (!state.completions[newHabit.id]) state.completions[newHabit.id] = {};
  }
  saveState();
  closeModal('habit-modal');
  renderAll();
  showToast(editingHabitId ? 'Ritual updated.' : 'New ritual added. Begin.');
}

function openDeleteModal(habitId) {
  deletingHabitId = habitId;
  document.getElementById('delete-confirm-input').value = '';
  const err = document.getElementById('delete-error');
  if (err) err.classList.add('hidden');
  openModal('delete-modal');
  setTimeout(() => document.getElementById('delete-confirm-input').focus(), 80);
}

function confirmDelete() {
  const input = document.getElementById('delete-confirm-input').value.trim();
  const err = document.getElementById('delete-error');
  if (input !== DELETE_PHRASE) {
    if (err) err.classList.remove('hidden');
    return;
  }
  if (err) err.classList.add('hidden');
  state.habits = state.habits.filter(h => h.id !== deletingHabitId);
  delete state.completions[deletingHabitId];
  recomputePerfectDays();
  saveState();
  closeModal('delete-modal');
  renderAll();
  showToast('Ritual removed.');
  deletingHabitId = null;
}

// ── Radio Helpers ──
function getRadioValue(name) {
  const el = document.querySelector(`input[name="${name}"]:checked`);
  return el ? el.value : null;
}

function setRadioValue(name, value) {
  const el = document.querySelector(`input[name="${name}"][value="${value}"]`);
  if (el) el.checked = true;
}

function clearRadioGroup(name) {
  document.querySelectorAll(`input[name="${name}"]`).forEach(r => r.checked = false);
}

function showFieldError(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('hidden');
}

function clearFieldErrors() {
  document.querySelectorAll('.field-error').forEach(el => el.classList.add('hidden'));
}

// ── Modal Engine ──
const focusableSelectors = 'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
const activeModals = new Set();
let lastFocusedElement = null;

function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  lastFocusedElement = document.activeElement;
  modal.classList.remove('hidden');
  activeModals.add(id);
  trapFocus(modal);
  modal.focus();
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.add('hidden');
  activeModals.delete(id);
  if (lastFocusedElement) lastFocusedElement.focus();
}

function trapFocus(container) {
  container.addEventListener('keydown', function handler(e) {
    if (e.key === 'Escape') {
      const id = container.id;
      closeModal(id);
      container.removeEventListener('keydown', handler);
      return;
    }
    if (e.key !== 'Tab') return;
    const focusable = Array.from(container.querySelectorAll(focusableSelectors));
    if (!focusable.length) { e.preventDefault(); return; }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
}

// ── Toast ──
let toastTimer = null;
function showToast(msg, duration = 2800) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
  void el.offsetWidth;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.classList.add('hidden'), 300);
  }, duration);
}

function showStorageWarning() {
  const el = document.getElementById('storage-warning');
  if (el) el.classList.remove('hidden');
}

// ── Theme Engine ──
function applyTheme(mode) {
  const html = document.documentElement;
  if (mode === 'auto') {
    html.setAttribute('data-theme', isNightMode() ? 'night' : 'day');
  } else {
    html.setAttribute('data-theme', mode);
  }
  const btn = document.getElementById('theme-toggle-btn');
  if (btn) {
    const labels = { auto: '☀ Auto Theme', day: '☀ Day', night: '🌙 Night' };
    btn.textContent = labels[mode] || '☀ Auto';
  }
}

function cycleTheme() {
  const modes = ['auto', 'day', 'night'];
  const idx = modes.indexOf(themeMode);
  themeMode = modes[(idx + 1) % modes.length];
  state.settings.solarTheme = themeMode;
  applyTheme(themeMode);
  saveState();
}

// ── Oracle Greeting ──
function getOracleGreeting() {
  const today = trackingDate();
  const totalStandard = state.habits.filter(h => h.type === 'standard').length;
  const completedToday = state.habits.filter(h => h.type === 'standard' && isCompleted(h.id, today)).length;
  const rate = totalStandard > 0 ? Math.round((completedToday / totalStandard) * 100) : 0;
  const h = new Date().getHours();
  let time = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  if (totalStandard === 0) return `${time}. Add your first ritual to begin the practice.`;
  if (rate === 100) return `${time}. A perfect record today. The stone is set.`;
  if (rate >= 60) return `${time}. Momentum is building — ${rate}% complete.`;
  if (rate > 0) return `${time}. ${completedToday} of ${totalStandard} done. The work continues.`;
  return `${time}. A new day. Begin where you stand.`;
}

function getDailyQuote() {
  const d = new Date();
  const seed = parseInt(todayStr(d).replace(/-/g, ''), 10);
  const idx = seed % STOIC_QUOTES.length;
  return STOIC_QUOTES[idx];
}

// ── Calendar / Monolith Renderer ──
function renderCalendar() {
  const grid = document.getElementById('calendar-grid');
  if (!grid) return;
  grid.innerHTML = '';
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const today = trackingDate();

  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  days.forEach(d => {
    const lbl = document.createElement('div');
    lbl.className = 'cal-day-label';
    lbl.textContent = d;
    grid.appendChild(lbl);
  });

  const firstDay = new Date(year, month, 1).getDay();
  for (let i = 0; i < firstDay; i++) {
    const empty = document.createElement('div');
    empty.className = 'cal-day empty';
    empty.setAttribute('aria-hidden', 'true');
    grid.appendChild(empty);
  }

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const cell = document.createElement('div');
    cell.className = 'cal-day';
    cell.textContent = d;
    cell.setAttribute('role', 'gridcell');
    cell.setAttribute('aria-label', dateStr);
    if (dateStr === today) cell.classList.add('today');
    const perfectDays = state.statistics.perfectDays || [];
    if (perfectDays.includes(dateStr)) {
      cell.classList.add('perfect');
      cell.setAttribute('title', 'Perfect Day — sealed in stone');
    } else {
      // Partial: at least one completion
      const hasAny = state.habits.some(h => h.type === 'standard' && isCompleted(h.id, dateStr));
      if (hasAny && dateStr <= today) cell.classList.add('partial');
    }
    grid.appendChild(cell);
  }
}

// ── Habit Card Renderer ──
function buildHabitCard(habit) {
  const today = trackingDate();
  const pillar = habit.pillar;
  const isActive = isBracketActive(habit.bracket);
  const done = habit.type === 'standard' ? isCompleted(habit.id, today) : null;
  const shadowBroken = habit.type === 'shadow' ? isShadowBroken(habit) : null;
  const flowState = habit.type === 'standard' && pillarHasFlowState(pillar);

  const card = document.createElement('div');
  card.className = 'habit-card';
  card.dataset.pillar = pillar;
  card.dataset.id = habit.id;
  if (!isActive) card.classList.add('inactive');
  if (flowState) card.classList.add('flow-state');
  if (habit.isFractured) card.classList.add('fractured');
  if (habit.type === 'shadow') card.classList.add('shadow-card');
  if (shadowBroken) card.classList.add('shadow-broken');

  // Top row
  const top = document.createElement('div');
  top.className = 'card-top';

  const nameEl = document.createElement('div');
  nameEl.className = 'card-name';
  nameEl.textContent = habit.name;
  top.appendChild(nameEl);

  const actions = document.createElement('div');
  actions.className = 'card-actions';

  const editBtn = document.createElement('button');
  editBtn.className = 'card-icon-btn';
  editBtn.setAttribute('aria-label', `Edit ${habit.name}`);
  editBtn.textContent = '✎';
  editBtn.addEventListener('click', () => openEditModal(habit.id));
  actions.appendChild(editBtn);

  const delBtn = document.createElement('button');
  delBtn.className = 'card-icon-btn danger';
  delBtn.setAttribute('aria-label', `Delete ${habit.name}`);
  delBtn.textContent = '✕';
  delBtn.addEventListener('click', () => openDeleteModal(habit.id));
  actions.appendChild(delBtn);

  top.appendChild(actions);
  card.appendChild(top);

  // Meta row
  const meta = document.createElement('div');
  meta.className = 'card-meta';

  const bTag = document.createElement('span');
  bTag.className = 'bracket-tag';
  const bIcons = { Dawn: '🌅', Noon: '☀', Dusk: '🌙' };
  bTag.textContent = `${bIcons[habit.bracket] || ''} ${habit.bracket}`;
  meta.appendChild(bTag);

  if (habit.type === 'standard') {
    const streak = document.createElement('span');
    streak.className = 'streak-badge';
    streak.textContent = `🔥 ${habit.currentStreak}d`;
    meta.appendChild(streak);

    // Mend tokens
    if (habit.mendTokens > 0 || habit.currentStreak >= MEND_TOKEN_MILESTONE) {
      const mend = document.createElement('div');
      mend.className = 'mend-tokens';
      mend.setAttribute('title', `${habit.mendTokens} Mend Token(s)`);
      for (let i = 0; i < MAX_MEND_TOKENS; i++) {
        const dot = document.createElement('div');
        dot.className = 'mend-dot' + (i < habit.mendTokens ? ' filled' : '');
        mend.appendChild(dot);
      }
      meta.appendChild(mend);
    }
  }

  card.appendChild(meta);

  // Check button
  const btn = document.createElement('button');

  if (habit.type === 'shadow') {
    btn.className = `check-btn ${shadowBroken ? 'shadow-broken' : 'shadow-intact'}`;
    btn.textContent = shadowBroken ? '⚠ Vice broken today' : '✦ Holding strong';
    btn.setAttribute('aria-pressed', String(!!shadowBroken));
    btn.addEventListener('click', () => toggleHabit(habit.id));
    btn.setAttribute('aria-label', shadowBroken ? 'Undo — mark shadow intact' : 'Mark vice as broken (costs 5 XP)');
  } else {
    btn.className = `check-btn${done ? ' checked' : ''}`;
    btn.textContent = done ? habit.name : 'Mark complete';
    btn.setAttribute('aria-pressed', String(!!done));
    btn.setAttribute('aria-label', done ? `Uncheck ${habit.name}` : `Complete ${habit.name}`);
    btn.addEventListener('click', () => {
      const c = document.querySelector(`[data-id="${habit.id}"]`);
      if (c) { c.classList.add('card-checked'); setTimeout(() => c.classList.remove('card-checked'), 500); }
      toggleHabit(habit.id);
    });
  }

  card.appendChild(btn);

  // Footer
  const footer = document.createElement('div');
  footer.className = 'card-footer';

  if (habit.type === 'standard') {
    const best = document.createElement('span');
    best.className = 'best-streak';
    best.textContent = `Best: ${habit.bestStreak}d`;
    footer.appendChild(best);
    if (habit.isFractured) {
      const fl = document.createElement('span');
      fl.className = 'fractured-label';
      fl.textContent = habit.mendTokens > 0 ? '💔 Fractured — use token?' : '💔 Fractured';
      footer.appendChild(fl);
    }
  }

  card.appendChild(footer);
  return card;
}

// ── Main Render ──
function renderAll() {
  const today = trackingDate();
  // Update oracle
  const oracle = document.getElementById('oracle-greeting');
  if (oracle) oracle.textContent = getOracleGreeting();
  // Quote
  const q = getDailyQuote();
  const qEl = document.getElementById('stoic-quote');
  const aEl = document.getElementById('stoic-author');
  if (qEl) qEl.textContent = q.text;
  if (aEl) aEl.textContent = `— ${q.author}`;
  // XP
  updateXPBar();
  // Stats
  const standardHabits = state.habits.filter(h => h.type === 'standard');
  const completedToday = standardHabits.filter(h => isCompleted(h.id, today)).length;
  const el = id => document.getElementById(id);
  if (el('stat-completed')) el('stat-completed').textContent = completedToday;
  if (el('stat-total')) el('stat-total').textContent = standardHabits.length;
  const rate = standardHabits.length > 0 ? Math.round((completedToday / standardHabits.length) * 100) : 0;
  if (el('stat-rate')) el('stat-rate').textContent = rate + '%';
  if (el('stat-perfect')) el('stat-perfect').textContent = (state.statistics.perfectDays || []).length;

  // Recompute all streaks
  state.habits.forEach(h => { if (h.type === 'standard') recomputeAndSaveStreak(h); });

  // Pillar combos
  ['Mind','Body','Craft'].forEach(pillar => {
    const badge = document.getElementById(`combo-${pillar}`);
    if (!badge) return;
    if (pillarHasFlowState(pillar)) badge.classList.remove('hidden');
    else badge.classList.add('hidden');
  });

  // Filter habits
  const pillars = ['Mind','Body','Craft','Shadow'];
  let visibleAny = false;
  pillars.forEach(pillar => {
    const grid = document.getElementById(`grid-${pillar}`);
    const section = document.getElementById(`pillar-${pillar}`);
    if (!grid || !section) return;
    grid.innerHTML = '';
    let habits = state.habits.filter(h => {
      if (pillar === 'Shadow') return h.type === 'shadow';
      return h.pillar === pillar && h.type === 'standard';
    });
    // Bracket filter
    if (activeBracket !== 'all' && activeBracket !== 'shadow') {
      habits = habits.filter(h => h.bracket === activeBracket);
    } else if (activeBracket === 'shadow') {
      if (pillar !== 'Shadow') habits = [];
    }

    if (habits.length === 0) {
      section.classList.add('hidden');
      return;
    }
    section.classList.remove('hidden');
    visibleAny = true;
    habits.forEach(h => grid.appendChild(buildHabitCard(h)));
  });

  const emptyState = document.getElementById('empty-state');
  if (emptyState) {
    if (!visibleAny && state.habits.length === 0) emptyState.classList.remove('hidden');
    else emptyState.classList.add('hidden');
  }

  renderCalendar();
}

function updateXPBar() {
  const levelEl = document.getElementById('level-label');
  const xpEl = document.getElementById('xp-label');
  const fill = document.getElementById('xp-fill');
  if (levelEl) levelEl.textContent = `Level ${state.profile.level}`;
  if (xpEl) xpEl.textContent = `${state.profile.xp} / ${XP_PER_LEVEL} XP`;
  if (fill) fill.style.width = `${Math.min(100, (state.profile.xp / XP_PER_LEVEL) * 100)}%`;
}

// ── Audio Engine ──
let audioCtx = null;

function getAudioCtx() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function playClickSound() {
  const ctx = getAudioCtx();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(180, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.22);
  } catch (e) {}
}

function playLevelUpSound() {
  const ctx = getAudioCtx();
  if (!ctx) return;
  try {
    const notes = [261.63, 329.63, 392.00, 523.25]; // C4 E4 G4 C5
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'triangle';
      const t = ctx.currentTime + i * 0.13;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.0, t);
      gain.gain.linearRampToValueAtTime(0.14, t + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
      osc.start(t);
      osc.stop(t + 0.5);
    });
  } catch (e) {}
}

// ── Data Portability ──
function exportBackup() {
  const data = JSON.stringify(state, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `aeterna-backup-${todayStr()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Backup exported.');
}

function importBackup(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    let parsed;
    try { parsed = JSON.parse(e.target.result); }
    catch (err) { showToast('⚠ Invalid JSON file.'); return; }
    const err = validateImportedState(parsed);
    if (err) { showToast(`⚠ Import failed: ${err}`); return; }
    state = sanitizeState(parsed);
    themeMode = state.settings.solarTheme || 'auto';
    applyTheme(themeMode);
    saveState();
    runArchivePurge();
    renderAll();
    showToast('✓ Backup imported successfully.');
  };
  reader.readAsText(file);
}

// ── Event Listeners ──
function bindEvents() {
  // Add habit
  const addBtn = document.getElementById('add-habit-btn');
  if (addBtn) addBtn.addEventListener('click', openAddModal);

  // Habit modal
  const saveBtn = document.getElementById('habit-save-btn');
  if (saveBtn) saveBtn.addEventListener('click', saveHabit);
  const cancelBtn = document.getElementById('habit-cancel-btn');
  if (cancelBtn) cancelBtn.addEventListener('click', () => closeModal('habit-modal'));
  const closeBtn = document.getElementById('habit-modal-close');
  if (closeBtn) closeBtn.addEventListener('click', () => closeModal('habit-modal'));

  // Delete modal
  const delCancelBtn = document.getElementById('delete-cancel-btn');
  if (delCancelBtn) delCancelBtn.addEventListener('click', () => closeModal('delete-modal'));
  const delConfirmBtn = document.getElementById('delete-confirm-btn');
  if (delConfirmBtn) delConfirmBtn.addEventListener('click', confirmDelete);
  const delInput = document.getElementById('delete-confirm-input');
  if (delInput) delInput.addEventListener('keydown', e => { if (e.key === 'Enter') confirmDelete(); });

  // Mend modal
  const mendCancelBtn = document.getElementById('mend-cancel-btn');
  if (mendCancelBtn) mendCancelBtn.addEventListener('click', () => {
    acceptStreakReset(mendingHabitId);
  });
  const mendSpendBtn = document.getElementById('mend-spend-btn');
  if (mendSpendBtn) mendSpendBtn.addEventListener('click', () => {
    spendMendToken(mendingHabitId);
  });

  // Bracket nav
  document.querySelectorAll('.bracket-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activeBracket = btn.dataset.bracket;
      document.querySelectorAll('.bracket-btn').forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');
      renderAll();
    });
  });

  // Theme toggle
  const themeBtn = document.getElementById('theme-toggle-btn');
  if (themeBtn) themeBtn.addEventListener('click', cycleTheme);

  // Export/Import
  const exportBtn = document.getElementById('export-btn');
  if (exportBtn) exportBtn.addEventListener('click', exportBackup);
  const importBtn = document.getElementById('import-btn');
  const importFile = document.getElementById('import-file');
  if (importBtn && importFile) {
    importBtn.addEventListener('click', () => importFile.click());
    importFile.addEventListener('change', (e) => {
      importBackup(e.target.files[0]);
      e.target.value = '';
    });
  }

  // Modal overlay click to close
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) closeModal(overlay.id);
    });
  });

  // Global escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && activeModals.size > 0) {
      const last = [...activeModals].pop();
      closeModal(last);
    }
  });
}

// ── 60-second Polling Loop ──
let lastThemeCheck = null;

function runPeriodicCheck() {
  // Theme auto-switch
  if (themeMode === 'auto') {
    const newTheme = isNightMode() ? 'night' : 'day';
    if (newTheme !== lastThemeCheck) {
      applyTheme('auto');
      lastThemeCheck = newTheme;
    }
  }
  // Shadow rollover
  checkShadowRollover();
  // Re-render oracle greeting (time-sensitive)
  const oracle = document.getElementById('oracle-greeting');
  if (oracle) oracle.textContent = getOracleGreeting();
}

// ── Bootstrap ──
function init() {
  checkStorage();
  if (!storageAvailable) showStorageWarning();

  const raw = loadRawState();
  if (raw) {
    state = sanitizeState(raw);
  }

  themeMode = state.settings.solarTheme || 'auto';
  lastRolloverDate = trackingDate();
  applyTheme(themeMode);
  lastThemeCheck = isNightMode() ? 'night' : 'day';

  runArchivePurge();
  recomputePerfectDays();

  // Recompute streaks on load
  state.habits.forEach(h => {
    if (h.type === 'standard') recomputeAndSaveStreak(h);
  });

  checkShadowRollover();
  bindEvents();
  renderAll();

  // 60-second interval
  setInterval(runPeriodicCheck, 60000);
}

document.addEventListener('DOMContentLoaded', init);
