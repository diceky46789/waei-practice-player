const DEFAULT_SETTINGS = {
  readJp: true,
  readEn: true,
  jpRepeat: 1,
  thinkingSec: 5,
  speakingSec: 3,
  enRepeat: 3,
  enGapSec: 1,
  nextDelaySec: 2,
  speechRate: 1.0,
  autoPlay: true,
  randomMode: false,
  repeatMode: false,
  hideEnglishInitially: true,
  showExplanation: true,
  backgroundMode: true
};

const SAMPLE_CSV_URL = 'problems.csv';

let problems = [];
let displayOrder = [];
let currentOrderIndex = 0;
let settings = loadSettings();
let isPlaying = false;
let isPaused = false;
let currentPhase = '停止中';
let revealed = false;
let activeTimeout = null;
let countdownInterval = null;
let wakeLock = null;

const els = {
  screenPractice: document.getElementById('screenPractice'),
  screenList: document.getElementById('screenList'),
  screenSettings: document.getElementById('screenSettings'),
  tabPractice: document.getElementById('tabPractice'),
  tabList: document.getElementById('tabList'),
  tabSettings: document.getElementById('tabSettings'),
  progressText: document.getElementById('progressText'),
  progressBar: document.getElementById('progressBar'),
  phaseBadge: document.getElementById('phaseBadge'),
  jpText: document.getElementById('jpText'),
  enText: document.getElementById('enText'),
  exText: document.getElementById('exText'),
  countdownNumber: document.getElementById('countdownNumber'),
  countdownLabel: document.getElementById('countdownLabel'),
  playBtn: document.getElementById('playBtn'),
  pauseBtn: document.getElementById('pauseBtn'),
  prevBtn: document.getElementById('prevBtn'),
  nextBtn: document.getElementById('nextBtn'),
  replayJpBtn: document.getElementById('replayJpBtn'),
  retryBtn: document.getElementById('retryBtn'),
  toggleAnswerBtn: document.getElementById('toggleAnswerBtn'),
  searchInput: document.getElementById('searchInput'),
  clearSearchBtn: document.getElementById('clearSearchBtn'),
  problemList: document.getElementById('problemList'),
  csvFileInput: document.getElementById('csvFileInput'),
  loadSampleBtn: document.getElementById('loadSampleBtn'),
  saveSettingsBtn: document.getElementById('saveSettingsBtn'),
  resetSettingsBtn: document.getElementById('resetSettingsBtn'),
  readJp: document.getElementById('readJp'),
  readEn: document.getElementById('readEn'),
  jpRepeat: document.getElementById('jpRepeat'),
  thinkingSec: document.getElementById('thinkingSec'),
  speakingSec: document.getElementById('speakingSec'),
  enRepeat: document.getElementById('enRepeat'),
  enGapSec: document.getElementById('enGapSec'),
  nextDelaySec: document.getElementById('nextDelaySec'),
  speechRate: document.getElementById('speechRate'),
  autoPlay: document.getElementById('autoPlay'),
  randomMode: document.getElementById('randomMode'),
  repeatMode: document.getElementById('repeatMode'),
  hideEnglishInitially: document.getElementById('hideEnglishInitially'),
  showExplanation: document.getElementById('showExplanation'),
  backgroundMode: document.getElementById('backgroundMode')
};

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem('waei_settings') || '{}');
    return { ...DEFAULT_SETTINGS, ...saved };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings() {
  localStorage.setItem('waei_settings', JSON.stringify(settings));
}

function applySettingsToForm() {
  Object.keys(DEFAULT_SETTINGS).forEach(key => {
    if (!els[key]) return;
    if (typeof DEFAULT_SETTINGS[key] === 'boolean') {
      els[key].checked = settings[key];
    } else {
      els[key].value = settings[key];
    }
  });
}

function readSettingsFromForm() {
  settings = {
    readJp: els.readJp.checked,
    readEn: els.readEn.checked,
    jpRepeat: clampInt(els.jpRepeat.value, 1, 5, 1),
    thinkingSec: clampNumber(els.thinkingSec.value, 0, 60, 5),
    speakingSec: clampNumber(els.speakingSec.value, 0, 60, 3),
    enRepeat: clampInt(els.enRepeat.value, 1, 10, 3),
    enGapSec: clampNumber(els.enGapSec.value, 0, 10, 1),
    nextDelaySec: clampNumber(els.nextDelaySec.value, 0, 30, 2),
    speechRate: clampNumber(els.speechRate.value, 0.5, 1.5, 1.0),
    autoPlay: els.autoPlay.checked,
    randomMode: els.randomMode.checked,
    repeatMode: els.repeatMode.checked,
    hideEnglishInitially: els.hideEnglishInitially.checked,
    showExplanation: els.showExplanation.checked,
    backgroundMode: els.backgroundMode.checked
  };
  saveSettings();
  applySettingsToForm();
  renderCurrentProblem();
}

function clampInt(v, min, max, fallback) {
  let n = parseInt(v, 10);
  if (Number.isNaN(n)) n = fallback;
  return Math.max(min, Math.min(max, n));
}

function clampNumber(v, min, max, fallback) {
  let n = parseFloat(v);
  if (Number.isNaN(n)) n = fallback;
  return Math.max(min, Math.min(max, n));
}

function switchTab(tab) {
  const mapping = {
    practice: [els.screenPractice, els.tabPractice],
    list: [els.screenList, els.tabList],
    settings: [els.screenSettings, els.tabSettings]
  };
  [els.screenPractice, els.screenList, els.screenSettings].forEach(s => s.classList.remove('active'));
  [els.tabPractice, els.tabList, els.tabSettings].forEach(b => b.classList.remove('active'));
  mapping[tab][0].classList.add('active');
  mapping[tab][1].classList.add('active');
}

function csvToProblems(text) {
  const rows = [];
  let row = [], cell = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && inQuotes && next === '"') {
      cell += '"'; i++;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      row.push(cell); cell = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') i++;
      row.push(cell);
      if (row.some(v => v !== '')) rows.push(row);
      row = []; cell = '';
    } else {
      cell += char;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    if (row.some(v => v !== '')) rows.push(row);
  }
  if (rows.length === 0) return [];
  const headers = rows[0].map(h => h.trim());
  return rows.slice(1).map((r, idx) => {
    const item = {};
    headers.forEach((h, i) => item[h] = (r[i] || '').trim());
    return {
      id: idx + 1,
      jp: item.jp || '',
      en: item.en || '',
      ex: item.ex || '',
      status: '未記録'
    };
  }).filter(p => p.jp || p.en);
}

function buildDisplayOrder() {
  displayOrder = problems.map((_, i) => i);
  if (settings.randomMode) {
    for (let i = displayOrder.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [displayOrder[i], displayOrder[j]] = [displayOrder[j], displayOrder[i]];
    }
  }
  currentOrderIndex = Math.max(0, Math.min(currentOrderIndex, Math.max(0, displayOrder.length - 1)));
}

function currentProblem() {
  if (!problems.length) return null;
  const realIndex = displayOrder[currentOrderIndex];
  return problems[realIndex];
}

function updatePhase(label) {
  currentPhase = label;
  els.phaseBadge.textContent = label;
}

function renderCurrentProblem() {
  const p = currentProblem();
  if (!p) {
    els.jpText.textContent = '問題がありません。設定画面からCSVを読み込んでください。';
    els.enText.textContent = '';
    els.exText.textContent = '';
    els.progressText.textContent = '問題 0 / 0';
    els.progressBar.style.width = '0%';
    updatePhase('待機中');
    return;
  }
  els.progressText.textContent = `問題 ${currentOrderIndex + 1} / ${displayOrder.length}`;
  els.progressBar.style.width = `${((currentOrderIndex + 1) / displayOrder.length) * 100}%`;
  els.jpText.textContent = p.jp;
  revealed = !settings.hideEnglishInitially;
  renderEnglish();
  els.exText.textContent = settings.showExplanation ? (p.ex || '') : '非表示';
}

function renderEnglish() {
  const p = currentProblem();
  if (!p) return;
  if (revealed) {
    els.enText.textContent = p.en || '';
    els.toggleAnswerBtn.textContent = '答えを隠す';
  } else {
    els.enText.textContent = '*****';
    els.toggleAnswerBtn.textContent = '答えを見る';
  }
}

function renderList(filter = '') {
  const q = filter.trim().toLowerCase();
  els.problemList.innerHTML = '';
  problems.forEach((p, idx) => {
    const hit = !q || p.jp.toLowerCase().includes(q) || p.en.toLowerCase().includes(q) || (p.ex || '').toLowerCase().includes(q);
    if (!hit) return;
    const item = document.createElement('div');
    item.className = 'list-item';
    item.innerHTML = `
      <div class="list-item-header">
        <strong>問題 ${idx + 1}</strong>
        <span>${p.status || '未記録'}</span>
      </div>
      <div class="list-item-jp">${escapeHtml(p.jp)}</div>
      <div class="list-item-en">${escapeHtml(p.en)}</div>
      <div class="row gap wrap" style="margin-top:10px;">
        <button data-jump="${idx}">この問題へ</button>
        <button data-status="${idx}:できた">できた</button>
        <button data-status="${idx}:少し迷った">少し迷った</button>
        <button data-status="${idx}:できなかった">できなかった</button>
      </div>
    `;
    els.problemList.appendChild(item);
  });
}

function escapeHtml(str) {
  return (str || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function sleep(ms) {
  return new Promise(resolve => {
    activeTimeout = setTimeout(resolve, ms);
  });
}

function clearTimers() {
  if (activeTimeout) clearTimeout(activeTimeout);
  activeTimeout = null;
  if (countdownInterval) clearInterval(countdownInterval);
  countdownInterval = null;
}

async function countdown(seconds, label) {
  seconds = Number(seconds) || 0;
  els.countdownLabel.textContent = label;
  if (seconds <= 0) {
    els.countdownNumber.textContent = '0';
    return;
  }
  let remaining = Math.ceil(seconds);
  els.countdownNumber.textContent = String(remaining);
  countdownInterval = setInterval(() => {
    remaining -= 1;
    if (remaining >= 0) els.countdownNumber.textContent = String(remaining);
  }, 1000);
  await sleep(seconds * 1000);
  clearInterval(countdownInterval);
  countdownInterval = null;
}

function getVoice(langPrefix) {
  const voices = speechSynthesis.getVoices();
  return voices.find(v => v.lang && v.lang.toLowerCase().startsWith(langPrefix)) || null;
}

async function speak(text, langPrefix) {
  if (!text) return;
  await new Promise(resolve => {
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = settings.speechRate;
    utter.pitch = 1;
    utter.volume = 1;
    const voice = getVoice(langPrefix);
    if (voice) utter.voice = voice;
    utter.lang = langPrefix === 'ja' ? 'ja-JP' : 'en-US';
    utter.onend = () => resolve();
    utter.onerror = () => resolve();
    speechSynthesis.cancel();
    speechSynthesis.speak(utter);
  });
}

async function speakRepeated(text, langPrefix, times, gapSec) {
  for (let i = 0; i < times; i++) {
    if (!isPlaying || isPaused) break;
    await speak(text, langPrefix);
    if (i < times - 1 && gapSec > 0) await countdown(gapSec, '英語の間');
  }
}

async function replayJapaneseOnly() {
  const p = currentProblem();
  if (!p || !settings.readJp) return;
  updatePhase('日本語再生');
  await speakRepeated(p.jp, 'ja', settings.jpRepeat, 0);
  updatePhase(isPlaying ? '進行中' : '停止中');
}

async function ensureWakeLock() {
  if (!settings.backgroundMode) return;
  try {
    if ('wakeLock' in navigator && document.visibilityState === 'visible') {
      wakeLock = await navigator.wakeLock.request('screen');
    }
  } catch {}
}

function releaseWakeLock() {
  try {
    if (wakeLock) wakeLock.release();
  } catch {}
  wakeLock = null;
}

async function playSequence() {
  if (!problems.length) return;
  isPlaying = true;
  isPaused = false;
  await ensureWakeLock();

  while (isPlaying && !isPaused) {
    const p = currentProblem();
    if (!p) break;

    renderCurrentProblem();

    if (settings.readJp) {
      updatePhase('日本語再生');
      await speakRepeated(p.jp, 'ja', settings.jpRepeat, 0);
      if (!isPlaying || isPaused) break;
    }

    updatePhase('考える時間');
    await countdown(settings.thinkingSec, '英作文を考える');
    if (!isPlaying || isPaused) break;

    updatePhase('発話時間');
    await countdown(settings.speakingSec, '声に出す');
    if (!isPlaying || isPaused) break;

    revealed = true;
    renderEnglish();

    if (settings.readEn) {
      updatePhase('英語再生');
      await speakRepeated(p.en, 'en', settings.enRepeat, settings.enGapSec);
      if (!isPlaying || isPaused) break;
    }

    updatePhase('次の問題へ');
    await countdown(settings.nextDelaySec, '次の問題まで');
    if (!isPlaying || isPaused) break;

    if (!moveNextInternal()) {
      if (settings.repeatMode) {
        currentOrderIndex = 0;
      } else {
        stopPlayback();
        break;
      }
    }
  }
}

function stopPlayback() {
  isPlaying = false;
  isPaused = false;
  clearTimers();
  speechSynthesis.cancel();
  releaseWakeLock();
  updatePhase('停止中');
  els.countdownNumber.textContent = '-';
  els.countdownLabel.textContent = '待機中';
}

function pausePlayback() {
  isPlaying = false;
  isPaused = true;
  clearTimers();
  speechSynthesis.cancel();
  releaseWakeLock();
  updatePhase('一時停止');
  els.countdownLabel.textContent = '一時停止中';
}

function moveNextInternal() {
  if (currentOrderIndex < displayOrder.length - 1) {
    currentOrderIndex++;
    return true;
  }
  return false;
}

function movePrevInternal() {
  if (currentOrderIndex > 0) {
    currentOrderIndex--;
    return true;
  }
  return false;
}

function persistProblems() {
  localStorage.setItem('waei_problems', JSON.stringify(problems));
}

function loadSavedProblems() {
  try {
    const saved = JSON.parse(localStorage.getItem('waei_problems') || '[]');
    if (Array.isArray(saved) && saved.length) {
      problems = saved;
      buildDisplayOrder();
      renderCurrentProblem();
      renderList();
      return true;
    }
  } catch {}
  return false;
}

async function loadCsvFromText(text) {
  const parsed = csvToProblems(text);
  if (!parsed.length) {
    alert('CSVを読み込めませんでした。1行目に jp,en,ex があるか確認してください。');
    return;
  }
  stopPlayback();
  problems = parsed;
  persistProblems();
  buildDisplayOrder();
  renderCurrentProblem();
  renderList();
  switchTab('practice');
}

async function loadSample() {
  const res = await fetch(SAMPLE_CSV_URL);
  const text = await res.text();
  await loadCsvFromText(text);
}

function bindEvents() {
  els.tabPractice.addEventListener('click', () => switchTab('practice'));
  els.tabList.addEventListener('click', () => switchTab('list'));
  els.tabSettings.addEventListener('click', () => switchTab('settings'));

  els.playBtn.addEventListener('click', async () => {
    if (isPlaying) return;
    if (!problems.length) await loadSample();
    readSettingsFromForm();
    await playSequence();
  });

  els.pauseBtn.addEventListener('click', () => pausePlayback());

  els.prevBtn.addEventListener('click', () => {
    stopPlayback();
    movePrevInternal();
    renderCurrentProblem();
  });

  els.nextBtn.addEventListener('click', () => {
    stopPlayback();
    moveNextInternal();
    renderCurrentProblem();
  });

  els.retryBtn.addEventListener('click', () => {
    stopPlayback();
    renderCurrentProblem();
  });

  els.replayJpBtn.addEventListener('click', async () => {
    await replayJapaneseOnly();
  });

  els.toggleAnswerBtn.addEventListener('click', () => {
    revealed = !revealed;
    renderEnglish();
  });

  els.searchInput.addEventListener('input', (e) => renderList(e.target.value));
  els.clearSearchBtn.addEventListener('click', () => {
    els.searchInput.value = '';
    renderList();
  });

  els.problemList.addEventListener('click', (e) => {
    const jump = e.target.getAttribute('data-jump');
    const status = e.target.getAttribute('data-status');

    if (jump !== null) {
      stopPlayback();
      const idx = Number(jump);
      const pos = displayOrder.indexOf(idx);
      currentOrderIndex = pos >= 0 ? pos : 0;
      renderCurrentProblem();
      switchTab('practice');
    }

    if (status) {
      const [idx, value] = status.split(':');
      problems[Number(idx)].status = value;
      persistProblems();
      renderList(els.searchInput.value);
    }
  });

  els.csvFileInput.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const text = await file.text();
    await loadCsvFromText(text);
  });

  els.loadSampleBtn.addEventListener('click', async () => await loadSample());

  els.saveSettingsBtn.addEventListener('click', () => {
    readSettingsFromForm();
    if (settings.randomMode) buildDisplayOrder();
    alert('設定を保存しました。');
  });

  els.resetSettingsBtn.addEventListener('click', () => {
    settings = { ...DEFAULT_SETTINGS };
    saveSettings();
    applySettingsToForm();
    buildDisplayOrder();
    renderCurrentProblem();
    alert('初期値に戻しました。');
  });

  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible') {
      await ensureWakeLock();
    }
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  }

  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: '和英練習プレイヤー',
      artist: 'ChatGPT sample app'
    });
    navigator.mediaSession.setActionHandler('play', async () => {
      if (!isPlaying) await playSequence();
    });
    navigator.mediaSession.setActionHandler('pause', () => pausePlayback());
    navigator.mediaSession.setActionHandler('nexttrack', () => {
      stopPlayback();
      moveNextInternal();
      renderCurrentProblem();
    });
    navigator.mediaSession.setActionHandler('previoustrack', () => {
      stopPlayback();
      movePrevInternal();
      renderCurrentProblem();
    });
  }
}

async function init() {
  applySettingsToForm();
  bindEvents();
  const restored = loadSavedProblems();
  if (!restored) {
    await loadSample();
  }
  speechSynthesis.getVoices();
  window.speechSynthesis.onvoiceschanged = () => {};
}

init();
