/* Jev Verdict — Jev decides, code executes. Uses POST /alpha/decisions with the user's own Pollen key. */
'use strict';

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const BYOP_KEY = 'jev-verdict-byop';
const DECISIONS_URL = 'https://gen.pollinations.ai/alpha/decisions';
const DEFAULT_IDEA = 'A web app that turns any podcast episode into a single-page illustrated comic strip in one click.';

const QUESTIONS = {
  novelty: { type: 'score', instructions: 'How novel is this idea?', criteria: ['completely derivative', 'common pattern', 'fresh twist', 'truly novel'] },
  feasibility: { type: 'score', instructions: 'How feasible is it for a solo dev in two weeks?', criteria: ['nearly impossible', 'hard', 'doable', 'very easy'] },
  demand: { type: 'score', instructions: 'How strong is real user demand?', criteria: ['nobody wants it', 'weak interest', 'clear pull', 'strong must-have'] },
  differentiation: { type: 'score', instructions: 'How differentiated is it from existing solutions?', criteria: ['same as others', 'slightly different', 'noticeably unique', 'unmatched edge'] },
  urgency: { type: 'noul', instructions: 'Should the developer act on this idea today?' },
  verdict: { type: 'choice', instructions: 'Pick the best single next action for this idea', criteria: { ship: 'Build and launch it this week', fix: 'Rework the concept, then ship', kill: 'Drop it and move on' } }
};

const VERDICT_META = {
  ship: { emoji: '🚀', title: 'SHIP IT', cls: 'ship', reason: 'Jev says build it now. The code below turns the scores into a launch plan.' },
  fix: { emoji: '🔧', title: 'FIX IT', cls: 'fix', reason: 'Jev says the concept needs rework before launch. The weakest-scored dimensions are listed below.' },
  kill: { emoji: '🪦', title: 'KILL IT', cls: 'kill', reason: 'Jev says drop it and move on. The low scores below are your post-mortem.' }
};

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toast._h);
  toast._h = setTimeout(() => t.classList.add('hidden'), 3500);
}

/* ---------- Bring your own Pollen (fragment flow) ---------- */
const BYOP = {
  key: null, loggedIn: false,
  init() {
    try {
      const m = location.hash.match(/api_key=(sk_[A-Za-z0-9_-]+)/);
      if (m) { this.key = m[1]; this.loggedIn = true; try { sessionStorage.setItem(BYOP_KEY, this.key); } catch (e) {} history.replaceState(null, '', location.pathname + location.search); }
    } catch (e) {}
    if (!this.loggedIn) { try { const raw = sessionStorage.getItem(BYOP_KEY); if (raw) { this.key = raw; this.loggedIn = true; } } catch (e) {} }
    this.updateUI();
  },
  login() {
    const redirect = encodeURIComponent(location.href.split('#')[0]);
    location.href = 'https://enter.pollinations.ai/authorize?redirect_uri=' + redirect + '&scope=usage&client_id=' + '&models=typesafe/jev-1.13&budget=5';
  },
  logout() {
    this.key = null; this.loggedIn = false;
    try { sessionStorage.removeItem(BYOP_KEY); } catch (e) {}
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
    this.updateUI(); toast('Disconnected — your Pollen key was removed from this browser session.');
  },
  updateUI() {
    $('#btn-login').classList.toggle('hidden', this.loggedIn);
    $('#btn-logout').classList.toggle('hidden', !this.loggedIn);
    $('#btn-verdict').disabled = !this.loggedIn;
    const st = $('#byop-status');
    st.textContent = this.loggedIn ? '✓ Connected — paying with your Pollen' : 'Not connected';
    st.classList.toggle('ok', this.loggedIn);
  }
};

/* ---------- Call Jev ---------- */
async function getVerdict(idea) {
  const body = { state: idea, questions: QUESTIONS, model: 'jev' };
  const r = await fetch(DECISIONS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + BYOP.key },
    body: JSON.stringify(body)
  });
  if (!r.ok) {
    let msg = 'HTTP ' + r.status;
    try { const j = await r.json(); msg = (j.error && (j.error.message || j.message)) || msg; } catch (e) {}
    throw new Error(msg);
  }
  const data = await r.json();
  return { request: body, response: data };
}
/* ---------- Render scores ---------- */
function renderScores(answers) {
  const box = $('#score-bars');
  box.innerHTML = '';
  const dims = [
    ['novelty', 'Novelty'],
    ['feasibility', 'Feasibility'],
    ['demand', 'Demand'],
    ['differentiation', 'Differentiation']
  ];
  const labels = {
    novelty: ['derivative', 'common', 'fresh', 'novel'],
    feasibility: ['impossible', 'hard', 'doable', 'easy'],
    demand: ['none', 'weak', 'pull', 'must-have'],
    differentiation: ['same', 'slight', 'unique', 'edge']
  };
  for (const [key, name] of dims) {
    const a = answers[key];
    const score = a.score;
    const pct = (score / 3) * 100;
    const topProb = Object.entries(a.probabilities || {}).reduce((m, e) => (e[1] > m[1] ? e : m), ['-', 0]);
    const probName = labels[key][Number(topProb[0])] || topProb[0];
    const row = document.createElement('div');
    row.className = 'score-row';
    row.innerHTML =
      '<div class="score-head"><span class="score-name">' + esc(name) + '</span>' +
      '<span class="score-val">' + score.toFixed(2) + ' / 3 · mostly "' + esc(probName) + '" · conf ' + Math.round(a.confidence * 100) + '%</span></div>' +
      '<div class="bar"><div class="bar-fill" style="width:' + pct + '%"></div></div>';
    box.appendChild(row);
  }
  const u = answers.urgency;
  const urgencyRow = document.createElement('div');
  urgencyRow.className = 'score-row';
  urgencyRow.innerHTML =
    '<div class="score-head"><span class="score-name">Urgency</span>' +
    '<span class="score-val">act-today probability ' + Math.round(u.noul * 100) + '%</span></div>' +
    '<div class="bar"><div class="bar-fill urgency" style="width:' + Math.round(u.noul * 100) + '%"></div></div>';
  box.appendChild(urgencyRow);
}

/* ---------- Code executes the decision ---------- */
function executeVerdict(answers, idea) {
  const verdict = answers.verdict.choice; // Jev's choice — the decision
  const meta = VERDICT_META[verdict];
  const dims = [
    ['novelty', 'Novelty'], ['feasibility', 'Feasibility'],
    ['demand', 'Demand'], ['differentiation', 'Differentiation']
  ];
  const scored = dims.map(([k, n]) => ({ k, n, s: answers[k].score })).sort((a, b) => a.s - b.s);
  const weakest = scored.slice(0, 2);
  const strongest = scored.slice(-2).reverse();
  const composite = scored.reduce((sum, d) => sum + d.s / 3, 0) / 4; // 0..1
  const urgency = answers.urgency.noul;

  $('#verdict-banner').className = 'verdict-banner ' + meta.cls;
  $('#verdict-emoji').textContent = meta.emoji;
  $('#verdict-title').textContent = meta.title + ' — ' + (idea.length > 70 ? idea.slice(0, 70) + '…' : idea);
  $('#verdict-reason').textContent = meta.reason;

  const list = $('#action-list');
  list.innerHTML = '';
  const add = (icon, text) => {
    const li = document.createElement('li');
    li.innerHTML = '<span class="act-icon">' + icon + '</span><span>' + text + '</span>';
    list.appendChild(li);
  };
  if (verdict === 'ship') {
    add('🎯', 'Jev chose <b>ship</b>. Code converts scores into a launch plan: lead with your strongest dimension — <b>' + esc(strongest[0].n) + '</b> (' + strongest[0].s.toFixed(1) + '/3).');
    add('📅', urgency >= 0.6 ? 'Urgency is high (' + Math.round(urgency * 100) + '%) — time-box 7 days to first launch.' : 'Urgency is moderate (' + Math.round(urgency * 100) + '%) — schedule a 2-week build sprint.');
    add('🛠️', 'Composite score ' + composite.toFixed(2) + '/1. Build the smallest version that proves <b>' + esc(strongest[0].n) + '</b>, then ship to 10 real users this week.');
  } else if (verdict === 'fix') {
    add('🩹', 'Jev chose <b>fix</b>. Code pinpoints the weakest dimensions to rework first: <b>' + esc(weakest[0].n) + '</b> (' + weakest[0].s.toFixed(1) + '/3) and <b>' + esc(weakest[1].n) + '</b> (' + weakest[1].s.toFixed(1) + '/3).');
    add('💡', 'Redesign the concept around what makes it defensible — protect your strongest dimension: <b>' + esc(strongest[0].n) + '</b>.');
    add('📋', 'Set a 1-week validation plan: 5 user interviews + 1 landing page. Re-submit the refined idea to Jev before building.');
  } else {
    add('🧠', 'Jev chose <b>kill</b>. Code turns low scores into a post-mortem: <b>' + esc(weakest[0].n) + '</b> (' + weakest[0].s.toFixed(1) + '/3) and <b>' + esc(weakest[1].n) + '</b> (' + weakest[1].s.toFixed(1) + '/3) dragged it down.');
    add('⏳', 'Composite score ' + composite.toFixed(2) + '/1 and act-today probability ' + Math.round(urgency * 100) + '% — the expected value does not justify the build cost.');
    add('🔁', 'Salvage what is reusable from the strongest dimension (<b>' + esc(strongest[0].n) + '</b>) and apply it to your next idea.');
  }
}

/* ---------- Poster (optional, anonymous image API) ---------- */
async function makePoster(answers, idea) {
  const verdict = answers.verdict.choice;
  const style = { ship: 'vibrant launch poster, rocket', fix: 'engineering blueprint, amber', kill: 'minimal gravestone, dark' }[verdict];
  const prompt = 'Minimal flat poster for a startup idea: "' + idea.slice(0, 120) + '". Verdict: ' + verdict.toUpperCase() + '. ' + style + '. No text overlays, clean composition.';
  const img = document.createElement('img');
  img.alt = 'Generated poster for ' + verdict;
  img.src = 'https://image.pollinations.ai/prompt/' + encodeURIComponent(prompt) + '?width=768&height=432&nologo=true&model=flux';
  const box = $('#poster-box');
  box.classList.remove('hidden');
  box.innerHTML = '';
  box.appendChild(img);
}

/* ---------- Main flow ---------- */
async function run() {
  const idea = $('#idea').value.trim();
  const err = $('#error-box');
  err.classList.add('hidden');
  if (!idea) { err.textContent = 'Please describe an idea first.'; err.classList.remove('hidden'); return; }
  const btn = $('#btn-verdict');
  btn.disabled = true;
  btn.textContent = 'Jev is deciding…';
  try {
    const { request, response } = await getVerdict(idea);
    renderScores(response.answers);
    executeVerdict(response.answers, idea);
    window._lastAnswers = response.answers;
    window._lastIdea = idea;
    $('#raw-json').textContent = JSON.stringify({ request, response }, null, 2);
    $('#result').classList.remove('hidden');
    $('#result').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) {
    err.textContent = 'Decision failed: ' + e.message + ' (check that your Pollen key is valid and has balance).';
    err.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = "Get Jev's Verdict";
  }
}

/* ---------- Wire up ---------- */
function init() {
  $('#idea').value = localStorage.getItem('jev-verdict-last-idea') || DEFAULT_IDEA;
  $('#idea').addEventListener('input', () => {
    try { localStorage.setItem('jev-verdict-last-idea', $('#idea').value); } catch (e) {}
  });
  $('#btn-login').onclick = () => BYOP.login();
  $('#btn-logout').onclick = () => BYOP.logout();
  $('#btn-verdict').onclick = run;
  $('#btn-poster').onclick = () => { toast('Generating poster…'); makePoster(window._lastAnswers, window._lastIdea); };
  window._lastAnswers = null;
  window._lastIdea = '';
  BYOP.init();
}
init();

