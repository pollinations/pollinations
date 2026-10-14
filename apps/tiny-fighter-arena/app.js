/*
 * TINY FIGHTER ARENA — app.js
 * UI, auth (Bring Your Own Pollen), generation flow, fight presentation.
 * Depends on core.js (global TFA). No build step, no dependencies.
 */
(function () {
  'use strict';

  const C = TFA.CONFIG;

  /* ---------------------------------------------------------------- *
   * DOM helpers + element cache
   * ---------------------------------------------------------------- */

  const $ = (id) => document.getElementById(id);

  const els = {
    authBox: $('authBox'),
    btnSound: $('btnSound'),
    btnSoundLabel: $('btnSoundLabel'),
    // create
    createForm: $('createForm'),
    fighterLine: $('fighterLine'),
    btnCreate: $('btnCreate'),
    examples: $('examples'),
    recordBox: $('recordBox'),
    createStatus: $('createStatus'),
    // card
    cardPortrait: $('cardPortrait'),
    cardPortraitLoad: $('cardPortraitLoad'),
    cardName: $('cardName'),
    cardEpithet: $('cardEpithet'),
    cardStats: $('cardStats'),
    cardAbilities: $('cardAbilities'),
    cardQuirk: $('cardQuirk'),
    cardIntro: $('cardIntro'),
    btnFight: $('btnFight'),
    btnReroll: $('btnReroll'),
    btnNew: $('btnNew'),
    cardStatus: $('cardStatus'),
    // fight
    ladderPips: $('ladderPips'),
    roundCounter: $('roundCounter'),
    cornerA: $('cornerA'),
    cornerB: $('cornerB'),
    cornerAName: $('cornerAName'),
    cornerBName: $('cornerBName'),
    cornerAStats: $('cornerAStats'),
    cornerBStats: $('cornerBStats'),
    commentary: $('commentary'),
    speakingIndicator: $('speakingIndicator'),
    btnNext: $('btnNext'),
    btnSkip: $('btnSkip'),
    btnAuto: $('btnAuto'),
    fightStatus: $('fightStatus'),
    // results
    verdictWord: $('verdictWord'),
    verdictSub: $('verdictSub'),
    btnShare: $('btnShare'),
    btnNextChallenger: $('btnNextChallenger'),
    btnRematch: $('btnRematch'),
    btnHome: $('btnHome'),
    // shared chrome
    toastEl: $('toast'),
    modal: $('modal'),
    btnModalSignIn: $('btnModalSignIn'),
    btnModalClose: $('btnModalClose'),
    pasteKey: $('pasteKey'),
    btnPasteKey: $('btnPasteKey'),
    pasteHint: $('pasteHint'),
    brandHome: $('brandHome')
  };

  const screens = ['create', 'card', 'fight', 'results'];

  const FALLBACK_PORTRAIT =
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">' +
        '<rect width="128" height="128" fill="#151823"/>' +
        '<circle cx="64" cy="50" r="26" fill="#2a2f40"/>' +
        '<path d="M22 118c6-26 24-38 42-38s36 12 42 38z" fill="#2a2f40"/>' +
        '<text x="64" y="127" font-family="monospace" font-size="10" fill="#6b7180" text-anchor="middle">?</text>' +
        '</svg>'
    );

  /* ---------------------------------------------------------------- *
   * State
   * ---------------------------------------------------------------- */

  const state = {
    key: null,
    player: null,
    foe: null,
    rung: 1,
    seed: 0,
    battle: null,
    shared: false,
    busy: false,
    auto: false,
    sound: false,
    typingToken: 0,
    skipType: false,
    currentAudio: null,
    pendingPortraits: [],
    record: loadRecord()
  };

  /* ---------------------------------------------------------------- *
   * Persistence (localStorage is fine for public W/L record only)
   * ---------------------------------------------------------------- */

  const LS_RECORD = 'tfa_record_v1';
  const SS_KEY = 'tfa_key';
  const SS_DRAFT = 'tfa_draft';
  const SS_SHARE = 'tfa_share';

  function freshRecord() {
    return { wins: 0, losses: 0, bestRung: 0, log: [] };
  }
  function loadRecord() {
    try {
      const r = JSON.parse(localStorage.getItem(LS_RECORD));
      if (r && typeof r === 'object' && Array.isArray(r.log)) {
        return { wins: 0 | r.wins, losses: 0 | r.losses, bestRung: 0 | r.bestRung, log: r.log.slice(0, 10) };
      }
    } catch (e) {
      /* corrupted storage → fresh record */
    }
    return freshRecord();
  }
  function saveRecord() {
    try {
      localStorage.setItem(LS_RECORD, JSON.stringify(state.record));
    } catch (e) {
      /* private mode etc. — record simply won't persist */
    }
  }

  /* ---------------------------------------------------------------- *
   * Auth — Bring Your Own Pollen (legacy fragment flow + paste fallback)
   * ---------------------------------------------------------------- */

  function setKey(key) {
    state.key = key || null;
    try {
      if (key) sessionStorage.setItem(SS_KEY, key);
      else sessionStorage.removeItem(SS_KEY);
    } catch (e) {
      /* sessionStorage unavailable — key lives for this page only */
    }
    renderAuthBox();
    if (state.key) flushPendingPortraits();
  }

  function requireKey() {
    if (state.key) return true;
    openModal();
    return false;
  }

  function signInRedirect() {
    const line = els.fighterLine.value.trim();
    if (line) {
      try {
        sessionStorage.setItem(SS_DRAFT, line);
      } catch (e) {
        /* fine */
      }
    }
    // keep a shared rematch alive across the redirect
    if (state.shared && state.player && state.foe) {
      try {
        sessionStorage.setItem(SS_SHARE, TFA.encodeShare(state.player, state.foe, state.rung, state.seed));
      } catch (e) {
        /* fine */
      }
    }
    const redirect = location.href.split('#')[0];
    location.href =
      C.AUTH_BASE +
      '/authorize?redirect_uri=' +
      encodeURIComponent(redirect) +
      '&scope=usage';
  }

  function handleHashOnLoad() {
    if (!location.hash || location.hash.length < 2) return null;
    const params = new URLSearchParams(location.hash.slice(1));
    const share = params.get('f');
    const key = params.get('api_key');
    const error = params.get('error');
    if (key) {
      setKey(key);
      toast('Pollen connected. Let\u2019s fight!');
      const draft = sessionStorage.getItem(SS_DRAFT);
      if (draft) {
        els.fighterLine.value = draft;
        sessionStorage.removeItem(SS_DRAFT);
      }
    } else if (error) {
      toast('Sign-in was cancelled. You can paste a key instead.');
    }
    history.replaceState(null, '', location.pathname + location.search);
    if (!key) return share;
    // coming back from sign-in started inside a shared rematch
    const savedShare = sessionStorage.getItem(SS_SHARE);
    if (savedShare) {
      sessionStorage.removeItem(SS_SHARE);
      return savedShare;
    }
    return share;
  }

  function renderAuthBox() {
    els.authBox.innerHTML = '';
    if (state.key) {
      const badge = document.createElement('span');
      badge.className = 'auth-state';
      const dot = document.createElement('span');
      dot.className = 'auth-dot';
      badge.append(dot, 'POLLEN CONNECTED');
      const out = document.createElement('button');
      out.type = 'button';
      out.className = 'chip-btn';
      out.textContent = 'SIGN OUT';
      out.addEventListener('click', () => {
        setKey(null);
        toast('Signed out. The arena keeps your record.');
      });
      els.authBox.append(badge, out);
    } else {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chip-btn';
      btn.innerHTML =
        '<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path d="M13 2 3 14h6l-1 8L20 9h-6l-1-7z" fill="currentColor"/></svg> SIGN IN';
      btn.addEventListener('click', openModal);
      els.authBox.append(btn);
    }
  }

  /* modal */

  function openModal() {
    els.modal.classList.remove('hidden');
    els.modal.setAttribute('aria-hidden', 'false');
    els.pasteHint.textContent =
      location.protocol === 'file:'
        ? 'You opened this game as a local file, so the sign-in redirect may not work — pasting a key is the safe route.'
        : 'Keys stay in this tab only (sessionStorage) and are never sent anywhere but pollinations.';
    els.pasteKey.focus();
  }
  function closeModal() {
    els.modal.classList.add('hidden');
    els.modal.setAttribute('aria-hidden', 'true');
  }

  /* ---------------------------------------------------------------- *
   * API layer — text, image, audio
   * ---------------------------------------------------------------- */

  class ApiError extends Error {
    constructor(code, detail) {
      super(code);
      this.code = code;
      this.detail = detail;
    }
  }

  async function chatText(messages, opts = {}) {
    if (!state.key) throw new ApiError('no-key');
    const body = { model: C.TEXT_MODEL, messages };
    if (opts.maxTokens) body.max_tokens = opts.maxTokens;
    if (opts.json) body.response_format = { type: 'json_object' };
    let res;
    try {
      res = await fetch(C.API_BASE + '/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + state.key,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });
    } catch (e) {
      throw new ApiError('network');
    }
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) throw new ApiError('auth', 'HTTP ' + res.status);
      if (res.status === 429) throw new ApiError('rate');
      throw new ApiError('http', 'HTTP ' + res.status);
    }
    const data = await res.json();
    const content =
      data &&
      data.choices &&
      data.choices[0] &&
      data.choices[0].message &&
      data.choices[0].message.content;
    if (typeof content !== 'string' || !content.trim()) throw new ApiError('empty');
    return content;
  }

  /** One JSON completion with a strict retry if the reply is not parseable. */
  async function chatJSON(messages, opts = {}) {
    const text = await chatText(messages, opts);
    try {
      return TFA.extractJSON(text);
    } catch (e) {
      const retry = messages.concat([
        { role: 'assistant', content: text },
        { role: 'user', content: 'That was not valid JSON. Respond again with ONLY the JSON object — no fences, no commentary.' }
      ]);
      const text2 = await chatText(retry, opts);
      return TFA.extractJSON(text2);
    }
  }

  async function fetchBlob(url) {
    let res;
    try {
      res = await fetch(url, { headers: { Authorization: 'Bearer ' + state.key } });
    } catch (e) {
      throw new ApiError('network');
    }
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) throw new ApiError('auth', 'HTTP ' + res.status);
      if (res.status === 429) throw new ApiError('rate');
      throw new ApiError('http', 'HTTP ' + res.status);
    }
    return res.blob();
  }

  function portraitUrl(lookPrompt) {
    return (
      C.API_BASE +
      '/image/' +
      encodeURIComponent(lookPrompt) +
      '?model=' +
      encodeURIComponent(C.IMAGE_MODEL) +
      '&width=' +
      C.IMAGE_SIZE +
      '&height=' +
      C.IMAGE_SIZE +
      '&nologo=true'
    );
  }

  function ttsUrl(text) {
    return (
      C.API_BASE +
      '/audio/' +
      encodeURIComponent(text.slice(0, 600)) +
      '?model=' +
      encodeURIComponent(C.TTS_MODEL) +
      '&voice=' +
      C.TTS_VOICE
    );
  }

  /* ---------------------------------------------------------------- *
   * Portraits (queued until a key exists)
   * ---------------------------------------------------------------- */

  function sideElements(side) {
    return side === 'a'
      ? { corner: els.cornerA, img: els.cornerA.querySelector('img'), loader: els.cornerA.querySelector('.portrait-load') }
      : { corner: els.cornerB, img: els.cornerB.querySelector('img'), loader: els.cornerB.querySelector('.portrait-load') };
  }

  function requestPortrait(side, lookPrompt, cardMode) {
    if (!state.key) {
      state.pendingPortraits.push({ side, lookPrompt, cardMode });
      return;
    }
    const target = cardMode
      ? { img: els.cardPortrait, loader: els.cardPortraitLoad }
      : sideElements(side);
    target.loader.hidden = false;
    fetchBlob(portraitUrl(lookPrompt))
      .then((blob) => {
        if (target.img.dataset.objurl) URL.revokeObjectURL(target.img.dataset.objurl);
        const url = URL.createObjectURL(blob);
        target.img.dataset.objurl = url;
        target.img.src = url;
        target.img.alt = 'Arena portrait';
      })
      .catch(() => {
        target.img.src = FALLBACK_PORTRAIT;
      })
      .finally(() => {
        target.loader.hidden = true;
      });
  }

  function flushPendingPortraits() {
    const queue = state.pendingPortraits.splice(0);
    queue.forEach((p) => requestPortrait(p.side, p.lookPrompt, p.cardMode));
  }

  /* ---------------------------------------------------------------- *
   * Spoken commentary
   * ---------------------------------------------------------------- */

  function stopSpeaking() {
    if (state.currentAudio) {
      state.currentAudio.pause();
      state.currentAudio = null;
    }
    els.speakingIndicator.hidden = true;
  }

  function speak(text) {
    if (!state.sound || !state.key) return Promise.resolve();
    stopSpeaking();
    return fetchBlob(ttsUrl(text))
      .then(
        (blob) =>
          new Promise((resolve) => {
            const audio = new Audio(URL.createObjectURL(blob));
            state.currentAudio = audio;
            els.speakingIndicator.hidden = false;
            const finish = () => {
              els.speakingIndicator.hidden = true;
              resolve();
            };
            audio.onended = finish;
            audio.onerror = finish;
            audio.play().catch(finish);
          })
      )
      .catch(() => null); // TTS is a bonus — never block the fight
  }

  /* ---------------------------------------------------------------- *
   * UI plumbing: screens, status, toast, typewriter
   * ---------------------------------------------------------------- */

  function setScreen(name) {
    screens.forEach((s) => {
      $('screen-' + s).hidden = s !== name;
    });
    window.scrollTo(0, 0);
  }

  function setStatus(screen, msg, isError) {
    const el = $('' + screen + 'Status');
    el.textContent = msg || '';
    el.classList.toggle('error', Boolean(isError && msg));
  }

  let toastTimer = null;
  function toast(msg) {
    els.toastEl.textContent = msg;
    els.toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toastEl.classList.remove('show'), 3200);
  }

  function typewrite(node, text) {
    const token = ++state.typingToken;
    state.skipType = false;
    const span = document.createElement('span');
    span.className = 'line';
    const caret = document.createElement('span');
    caret.className = 'caret';
    node.append(span, caret);
    scrollCommentary();
    return new Promise((resolve) => {
      let i = 0;
      (function step() {
        if (token !== state.typingToken) {
          caret.remove();
          resolve();
          return;
        }
        i = state.skipType ? text.length : Math.min(text.length, i + 2);
        span.textContent = text.slice(0, i);
        if (i >= text.length) {
          caret.remove();
          resolve();
          return;
        }
        setTimeout(step, 16);
      })();
    });
  }

  function cancelTyping() {
    state.typingToken++;
  }

  function appendCommentaryHead(text) {
    const head = document.createElement('span');
    head.className = 'round-head';
    head.textContent = '\u25AC\u25AC ' + text + ' ';
    els.commentary.appendChild(head);
    scrollCommentary();
  }

  function scrollCommentary() {
    const c = els.commentary;
    const parent = c.parentElement;
    const target = c.scrollHeight - c.clientHeight;
    if (target > 0) c.scrollTop = target;
    else if (parent) parent.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function friendlyError(e) {
    const code = e && e.code;
    if (code === 'auth') return 'Your Pollen key was rejected — sign in again.';
    if (code === 'rate') return 'Rate limited — give the arena a few seconds and swing again.';
    if (code === 'network') return 'Could not reach pollinations — check your connection.';
    if (code === 'empty') return 'The model returned nothing. Try again.';
    if (code === 'no-key') return 'You need to connect your Pollen first.';
    if (e instanceof SyntaxError) return 'The model returned nonsense twice — try again.';
    return 'Something jammed (' + ((e && e.detail) || (e && e.message) || 'unknown') + '). Try again.';
  }

  function handleApiError(e, screen) {
    setStatus(screen, friendlyError(e), true);
    if (e && (e.code === 'auth' || e.code === 'no-key')) openModal();
  }

  /* ---------------------------------------------------------------- *
   * Rendering: fighter card, record, fight stage
   * ---------------------------------------------------------------- */

  const STAT_LABELS = [
    ['power', 'POWER'],
    ['defense', 'DEFENSE'],
    ['speed', 'SPEED'],
    ['chaos', 'CHAOS']
  ];

  function renderCard(f) {
    els.cardName.textContent = f.name;
    els.cardEpithet.textContent = f.epithet;
    els.cardStats.innerHTML = '';
    STAT_LABELS.forEach(([key, label]) => {
      const li = document.createElement('li');
      const lab = document.createElement('span');
      lab.className = 'stat-label';
      lab.textContent = label;
      const track = document.createElement('div');
      track.className = 'stat-track';
      const fill = document.createElement('div');
      fill.className = 'stat-fill';
      track.appendChild(fill);
      const num = document.createElement('span');
      num.className = 'stat-num';
      num.textContent = f.stats[key];
      li.append(lab, track, num);
      els.cardStats.appendChild(li);
      requestAnimationFrame(() => {
        fill.style.width = (f.stats[key] * 10) + '%';
      });
    });
    els.cardAbilities.innerHTML = '';
    f.abilities.forEach((ab) => {
      const div = document.createElement('div');
      div.className = 'ability';
      const nameRow = document.createElement('div');
      nameRow.className = 'ability-name';
      const nm = document.createElement('span');
      nm.textContent = ab.name;
      const pw = document.createElement('span');
      pw.className = 'ability-pw';
      pw.textContent = 'PWR ' + ab.power;
      nameRow.append(nm, pw);
      const eff = document.createElement('p');
      eff.className = 'ability-effect';
      eff.textContent = ab.effect;
      div.append(nameRow, eff);
      els.cardAbilities.appendChild(div);
    });
    els.cardQuirk.innerHTML = '';
    const qTag = document.createElement('b');
    qTag.textContent = 'QUIRK';
    els.cardQuirk.append(qTag, f.quirk);
    els.cardIntro.textContent = '\u201C' + f.intro + '\u201D';

    if (els.cardPortrait.dataset.objurl) {
      URL.revokeObjectURL(els.cardPortrait.dataset.objurl);
      delete els.cardPortrait.dataset.objurl;
    }
    els.cardPortrait.removeAttribute('src');
    requestPortrait(null, f.lookPrompt, true);
  }

  function renderRecordBox() {
    const r = state.record;
    if (!r.wins && !r.losses) {
      els.recordBox.hidden = true;
      return;
    }
    els.recordBox.hidden = false;
    els.recordBox.innerHTML = '';
    const head = document.createElement('div');
    head.className = 'record-head';
    head.textContent =
      'ARENA RECORD ' + r.wins + 'W\u2013' + r.losses + 'L \u00B7 BEST RUNG ' +
      Math.min(r.bestRung, C.LADDER_LENGTH) + '/' + C.LADDER_LENGTH +
      (r.bestRung > C.LADDER_LENGTH ? ' (OVERTIME \u00D7' + (r.bestRung - C.LADDER_LENGTH) + ')' : '');
    const chips = document.createElement('div');
    chips.className = 'record-chips';
    r.log.forEach((entry) => {
      const chip = document.createElement('span');
      chip.className = 'rec-chip ' + (entry.w ? 'w' : 'l');
      chip.innerHTML = '';
      const b = document.createElement('b');
      b.textContent = entry.w ? 'WIN' : 'LOSS';
      chip.append(b, ' vs ' + entry.foe);
      chips.appendChild(chip);
    });
    els.recordBox.append(head, chips);
  }

  function renderStatChips(container, f) {
    container.innerHTML = '';
    STAT_LABELS.forEach(([key, label]) => {
      const chip = document.createElement('span');
      chip.className = 'stat-chip';
      const b = document.createElement('b');
      b.textContent = f.stats[key];
      chip.append(label.slice(0, 3) + ' ', b);
      container.appendChild(chip);
    });
  }

  function renderPips() {
    els.ladderPips.innerHTML = '';
    for (let i = 1; i <= C.LADDER_LENGTH; i++) {
      const pip = document.createElement('span');
      pip.className = 'pip' + (i < state.rung ? ' done' : i === state.rung ? ' current' : '');
      pip.title = 'Rung ' + i;
      els.ladderPips.appendChild(pip);
    }
    if (state.rung > C.LADDER_LENGTH) {
      const over = document.createElement('span');
      over.className = 'stat-chip';
      over.textContent = 'OVERTIME \u00D7' + (state.rung - C.LADDER_LENGTH);
      els.ladderPips.appendChild(over);
    }
  }

  function setHp(side, hp, max) {
    const wrap = side === 'a' ? els.cornerA : els.cornerB;
    const fill = wrap.querySelector('.hpfill');
    const text = wrap.querySelector('.hptext');
    const pct = Math.max(0, Math.round((hp / max) * 100));
    fill.style.width = pct + '%';
    fill.classList.toggle('low', pct <= 28);
    fill.classList.toggle('mid', pct > 28 && pct <= 55);
    text.textContent = Math.max(0, Math.round(hp)) + '/' + max;
    fill.setAttribute('aria-valuemin', '0');
    fill.setAttribute('aria-valuemax', String(max));
    fill.setAttribute('aria-valuenow', String(Math.max(0, Math.round(hp))));
  }

  function floater(side, text, cls) {
    const wrap = side === 'a' ? els.cornerA : els.cornerB;
    const layer = wrap.querySelector('.floaters');
    const f = document.createElement('span');
    f.className = 'floater' + (cls ? ' ' + cls : '');
    f.textContent = text;
    f.style.marginLeft = (Math.random() * 44 - 22) + 'px';
    layer.appendChild(f);
    setTimeout(() => f.remove(), 1200);
  }

  function shake(side) {
    const wrap = side === 'a' ? els.cornerA : els.cornerB;
    wrap.classList.remove('hit');
    void wrap.offsetWidth; // restart the animation
    wrap.classList.add('hit');
  }

  function markKO(side) {
    const wrap = side === 'a' ? els.cornerA : els.cornerB;
    wrap.classList.add('koed');
  }

  /** Animate HP bars, floating damage numbers and shakes for a round's events. */
  function renderRoundEffects(events, instant) {
    events.forEach((ev, idx) => {
      const apply = () => {
        if (ev.type === 'attack') {
          const defSide = ev.defender === state.battle.bout.a ? 'a' : 'b';
          if (ev.dodged) {
            floater(defSide, 'DODGE!', 'dodge');
          } else {
            floater(defSide, '-' + ev.damage + (ev.crit ? '!!' : ''), ev.crit ? 'crit' : '');
            shake(defSide);
            setHp(defSide, ev.defenderHpAfter, ev.defender.maxHp);
          }
        } else if (ev.type === 'quirk') {
          const qSide = ev.side === state.battle.bout.a ? 'a' : 'b';
          if (ev.kind === 'adrenaline') {
            floater(qSide, 'FOCUSED', 'dodge');
          } else {
            const label = ev.hpDelta >= 0 ? '+' + ev.hpDelta : String(ev.hpDelta);
            floater(qSide, label, ev.kind === 'blunder' ? 'crit' : 'heal');
            setHp(qSide, ev.hpAfter, ev.side.maxHp);
          }
        }
      };
      if (instant) apply();
      else setTimeout(apply, 300 * idx);
    });
  }

  function renderFightScreen() {
    const a = state.player;
    const b = state.foe;
    els.cornerAName.textContent = a.name;
    els.cornerBName.textContent = b.name;
    renderStatChips(els.cornerAStats, a);
    renderStatChips(els.cornerBStats, b);
    els.cornerA.classList.remove('koed');
    els.cornerB.classList.remove('koed');
    setHp('a', TFA.maxHpFor(a), TFA.maxHpFor(a));
    setHp('b', TFA.maxHpFor(b), TFA.maxHpFor(b));
    els.roundCounter.textContent = 'ROUND 1';
    renderPips();
    els.commentary.innerHTML = '';
    els.commentary.scrollTop = 0;
    ['a', 'b'].forEach((s) => {
      const t = sideElements(s);
      if (t.img.dataset.objurl) {
        URL.revokeObjectURL(t.img.dataset.objurl);
        delete t.img.dataset.objurl;
      }
      t.img.removeAttribute('src');
      t.loader.hidden = false;
    });
    requestPortrait('a', a.lookPrompt);
    requestPortrait('b', b.lookPrompt);
    setFightControls();
  }

  function setFightControls() {
    const over = state.battle && state.battle.bout.over;
    const disabled = state.busy || over;
    els.btnNext.disabled = disabled;
    els.btnSkip.disabled = disabled;
  }

  /* ---------------------------------------------------------------- *
   * Flow: create → card → fight → results → next rung
   * ---------------------------------------------------------------- */

  async function createFighter(line) {
    if (state.busy) return;
    if (!requireKey()) return;
    line = (line || '').trim().slice(0, 200);
    if (!line) {
      setStatus('create', 'Give me one line to work with.');
      return;
    }
    state.busy = true;
    els.btnCreate.disabled = true;
    els.btnCreate.textContent = 'SUMMONING\u2026';
    setStatus('create', 'Engineering your fighter\u2026 (stats, moves, quirk, portrait)');
    try {
      const obj = await chatJSON(
        [
          { role: 'system', content: TFA.fighterSystemPrompt() },
          { role: 'user', content: 'Player\u2019s fighter description: "' + line + '"' }
        ],
        { json: true, maxTokens: 900 }
      );
      const fighter = TFA.coerceFighter(obj, { sourceLine: line });
      state.player = fighter;
      state.shared = false;
      state.rung = 1;
      setScreen('card');
      renderCard(fighter);
      setStatus('card', 'This is who you described. Take them up the ladder.');
    } catch (e) {
      handleApiError(e, 'create');
    } finally {
      state.busy = false;
      els.btnCreate.disabled = false;
      els.btnCreate.textContent = 'BRING IT TO LIFE';
    }
  }

  async function makeChallenger(rung) {
    const obj = await chatJSON(
      [
        { role: 'system', content: TFA.challengerSystemPrompt(state.player, rung, C.LADDER_LENGTH) },
        { role: 'user', content: TFA.challengerUserPrompt(state.player) }
      ],
      { json: true, maxTokens: 900 }
    );
    return TFA.coerceFighter(obj, { fallbackName: 'A Nameless Challenger' });
  }

  async function startRung(rung, foe) {
    if (!requireKey()) return;
    state.busy = true;
    if (!foe) {
      setStatus('card', 'Scouting rung ' + rung + '\u2019s challenger\u2026');
      try {
        foe = await makeChallenger(rung);
      } catch (e) {
        state.busy = false;
        handleApiError(e, 'card');
        return;
      }
    }
    state.foe = foe;
    state.rung = rung;
    state.seed = (Math.random() * 4294967296) >>> 0;
    state.battle = TFA.newBattle(state.player, state.foe, state.seed);
    setScreen('fight');
    renderFightScreen();
    appendCommentaryHead(
      'RUNG ' + rung + ' \u00B7 ' + state.player.name.toUpperCase() + ' VS ' + state.foe.name.toUpperCase()
    );
    const opener =
      state.foe.name + ': \u201C' + state.foe.intro + '\u201D  \u2014  ' +
      state.player.name + ': \u201C' + state.player.intro + '\u201D';
    await typewrite(els.commentary, opener);
    state.busy = false;
    setFightControls();
  }

  async function nextRound() {
    if (!requireKey()) return;
    if (state.busy || !state.battle || state.battle.bout.over) return;
    state.busy = true;
    setFightControls();
    setStatus('fight', '');
    const bout = state.battle.nextRound();
    renderRoundEffects(bout.lastEvents, false);
    const effectDelay = 300 * bout.lastEvents.length;
    els.roundCounter.textContent =
      'ROUND ' + bout.round + (bout.over ? ' \u00B7 FINAL' : '') +
      (bout.judgesDecision ? ' \u00B7 JUDGES\u2019 CALL' : '');
    renderPips();
    let narration;
    try {
      await new Promise((r) => setTimeout(r, effectDelay));
      narration = (
        await chatText(
          [
            { role: 'system', content: TFA.narratorSystemPrompt() },
            { role: 'user', content: TFA.narratorUserPrompt(bout) }
          ],
          { maxTokens: 240 }
        )
      ).trim();
    } catch (e) {
      narration = fallbackNarration(bout.lastEvents);
      setStatus('fight', friendlyError(e) + ' ( improvised the commentary )', true);
    }
    appendCommentaryHead('ROUND ' + bout.round + (bout.over ? ' \u00B7 FINAL' : ''));
    await typewrite(els.commentary, narration);
    if (bout.over) markKO(bout.winner === bout.a ? 'b' : 'a');
    await speak(narration);
    state.busy = false;
    if (bout.over) {
      finishFight();
      return;
    }
    setFightControls();
    if (state.auto) setTimeout(() => nextRound(), 850);
  }

  function fallbackNarration(events) {
    if (!events.length) return 'The round ends in a long, suspicious silence.';
    return events.map(TFA.describeEvent).join('. ').replace(/\.\./g, '.') + '.';
  }

  async function skipToEnd() {
    if (!requireKey()) return;
    if (state.busy || !state.battle || state.battle.bout.over) return;
    cancelTyping();
    stopSpeaking();
    state.busy = true;
    setFightControls();
    const bout = state.battle.bout;
    const stepRound = state.battle.nextRound;
    while (!bout.over && bout.round < C.MAX_ROUNDS) {
      stepRound();
      renderRoundEffects(bout.lastEvents, true);
    }
    els.roundCounter.textContent = 'ROUND ' + bout.round + ' \u00B7 FINAL' + (bout.judgesDecision ? ' \u00B7 JUDGES\u2019 CALL' : '');
    appendCommentaryHead('THE REST OF THE FIGHT, IN ONE BREATH');
    await typewrite(
      els.commentary,
      bout.lastEvents.map(TFA.describeEvent).join('. ') + '.'
    );
    let narration;
    try {
      narration = (
        await chatText(
          [
            { role: 'system', content: TFA.narratorSystemPrompt() },
            { role: 'user', content: TFA.narratorUserPrompt(bout) }
          ],
          { maxTokens: 240 }
        )
      ).trim();
      appendCommentaryHead('VERDICT');
      await typewrite(els.commentary, narration);
    } catch (e) {
      setStatus('fight', friendlyError(e), true);
    }
    markKO(bout.winner === bout.a ? 'b' : 'a');
    await speak(narration || '');
    state.busy = false;
    finishFight();
  }

  function finishFight() {
    const bout = state.battle.bout;
    const won = bout.winner === bout.a;
    const loser = won ? bout.b : bout.a;
    const winner = won ? bout.a : bout.b;
    if (!state.shared) {
      const r = state.record;
      if (won) r.wins++;
      else r.losses++;
      r.bestRung = Math.max(r.bestRung, won ? state.rung : state.rung - 1);
      r.log.unshift({ r: state.rung, w: won, foe: state.foe.name, date: Date.now() });
      r.log = r.log.slice(0, 8);
      saveRecord();
      renderRecordBox();
    }
    setScreen('results');
    const clearedLadder = won && state.rung >= C.LADDER_LENGTH;
    els.verdictWord.textContent = won ? (clearedLadder ? 'CHAMPION' : 'VICTORY') : 'DEFEAT';
    els.verdictWord.className = 'verdict-word' + (won ? (clearedLadder ? ' champion' : '') : ' lost');
    els.verdictSub.innerHTML = '';
    const sub = document.createElement('span');
    sub.textContent =
      winner.fighter.name +
      ' takes it ' +
      (bout.judgesDecision ? 'on a judges\u2019 decision' : 'by knockout') +
      ' over ' +
      loser.fighter.name +
      ' (' +
      Math.max(0, Math.round(winner.hp)) +
      '/' +
      winner.maxHp +
      ' HP left after ' +
      bout.round +
      ' rounds).';
    const br = document.createElement('br');
    const quip = document.createElement('span');
    quip.textContent = won
      ? 'Rung ' + state.rung + ' cleared. The next challenger is already stretching.'
      : 'The ladder bites back. Rematch, or describe someone new.';
    els.verdictSub.append(sub, br, quip);
    els.btnNextChallenger.hidden = !won;
    els.btnRematch.hidden = won;
  }

  /* ---------------------------------------------------------------- *
   * Share links — rematch in a URL
   * ---------------------------------------------------------------- */

  function shareLink() {
    const enc = TFA.encodeShare(state.player, state.foe, state.rung, state.seed);
    return location.href.split('#')[0] + '#f=' + enc;
  }

  async function copyShare() {
    const link = shareLink();
    try {
      await navigator.clipboard.writeText(link);
      toast('Rematch link copied — same fighters, same blows, fresh commentary.');
    } catch (e) {
      window.prompt('Copy your rematch link:', link);
    }
  }

  function initFromShare(encoded) {
    let data;
    try {
      data = TFA.decodeShare(encoded);
    } catch (e) {
      toast('That share link got mangled somewhere along the way.');
      return false;
    }
    state.shared = true;
    state.player = data.player;
    state.foe = data.foe;
    state.rung = data.rung;
    state.seed = data.seed;
    state.battle = TFA.newBattle(state.player, state.foe, state.seed);
    setScreen('fight');
    renderFightScreen();
    appendCommentaryHead('REMATCH \u00B7 RUNG ' + state.rung);
    typewrite(
      els.commentary,
      'A challenge arrives from a friend: ' +
        state.player.name +
        ' vs ' +
        state.foe.name +
        '. Press NEXT ROUND to run it back.'
    );
    if (!state.key) {
      setStatus('fight', 'Sign in with your Pollen to fight this rematch.');
    }
    return true;
  }

  /* ---------------------------------------------------------------- *
   * Wiring
   * ---------------------------------------------------------------- */

  els.createForm.addEventListener('submit', (e) => {
    e.preventDefault();
    createFighter(els.fighterLine.value);
  });

  els.examples.addEventListener('click', (e) => {
    const btn = e.target.closest('.example');
    if (!btn) return;
    els.fighterLine.value = btn.textContent;
    els.fighterLine.focus();
  });

  els.btnFight.addEventListener('click', () => startRung(state.rung || 1, null));
  els.btnReroll.addEventListener('click', () => {
    if (state.player && state.player.sourceLine) createFighter(state.player.sourceLine);
  });
  els.btnNew.addEventListener('click', goHome);

  els.btnNext.addEventListener('click', nextRound);
  els.btnSkip.addEventListener('click', skipToEnd);
  els.btnAuto.addEventListener('click', () => {
    state.auto = !state.auto;
    els.btnAuto.setAttribute('aria-pressed', String(state.auto));
    if (state.auto && !state.busy && state.battle && !state.battle.bout.over && state.key) {
      nextRound();
    }
  });

  els.commentary.addEventListener('click', () => {
    state.skipType = true;
  });

  els.btnShare.addEventListener('click', copyShare);
  els.btnNextChallenger.addEventListener('click', () => startRung(state.rung + 1, null));
  els.btnRematch.addEventListener('click', () => startRung(state.rung, state.foe));
  els.btnHome.addEventListener('click', goHome);
  els.brandHome.addEventListener('click', (e) => {
    e.preventDefault();
    goHome();
  });

  function goHome() {
    cancelTyping();
    stopSpeaking();
    state.shared = false;
    state.battle = null;
    state.player = null;
    state.foe = null;
    state.rung = 1;
    setScreen('create');
    renderRecordBox();
    setStatus('create', '');
    els.fighterLine.focus();
  }

  els.btnSound.addEventListener('click', () => {
    state.sound = !state.sound;
    els.btnSound.setAttribute('aria-pressed', String(state.sound));
    els.btnSoundLabel.textContent = state.sound ? 'VOICE ON' : 'VOICE OFF';
    if (!state.sound) stopSpeaking();
    else toast('Commentary will now be spoken aloud.');
  });

  els.btnModalSignIn.addEventListener('click', () => {
    if (location.protocol === 'file:') {
      toast('From a local file the redirect can\u2019t come back — paste a key instead.');
      els.pasteKey.focus();
      return;
    }
    signInRedirect();
  });
  els.btnModalClose.addEventListener('click', closeModal);
  els.modal.addEventListener('click', (e) => {
    if (e.target === els.modal) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
  els.btnPasteKey.addEventListener('click', () => {
    const k = els.pasteKey.value.trim();
    if (!/^sk_|^pk_/.test(k)) {
      els.pasteHint.textContent = 'That doesn\u2019t look like a Pollinations key (sk_\u2026).';
      return;
    }
    els.pasteKey.value = '';
    closeModal();
    setKey(k);
    toast('Key accepted. It lives in this tab only.');
  });
  els.pasteKey.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') els.btnPasteKey.click();
  });

  /* ---------------------------------------------------------------- *
   * Boot
   * ---------------------------------------------------------------- */

  function init() {
    try {
      const stored = sessionStorage.getItem(SS_KEY);
      if (stored) state.key = stored;
    } catch (e) {
      /* no session storage → paste-key still works this page */
    }
    renderAuthBox();
    const share = handleHashOnLoad();
    renderRecordBox();
    if (share) {
      initFromShare(share);
    } else {
      setScreen('create');
      els.fighterLine.focus();
    }
  }

  init();
})();
