/*
 * TINY FIGHTER ARENA — core.js
 * Pure game logic: prompts, defensive JSON parsing, deterministic battle engine,
 * seeded RNG and a small LZW codec for share links. No DOM, no network.
 * Works as a classic <script> in the browser (global `TFA`) and in Node
 * (module.exports) so the exact production code can be tested headless.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.TFA = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var CONFIG = Object.freeze({
    API_BASE: 'https://gen.pollinations.ai',
    AUTH_BASE: 'https://enter.pollinations.ai',
    TEXT_MODEL: 'openai/gpt-5.4-nano',
    IMAGE_MODEL: 'tongyi-mai/z-image-turbo',
    IMAGE_SIZE: 512,
    TTS_MODEL: 'openai/tts-1',
    TTS_VOICE: 'alloy',
    LADDER_LENGTH: 5,
    MAX_ROUNDS: 10
  });

  /* ------------------------------------------------------------------ *
   * Prompts
   * ------------------------------------------------------------------ */

  var FIGHTER_SHAPE =
    '{"name":"string","epithet":"string","lookPrompt":"string",' +
    '"stats":{"power":1-10,"defense":1-10,"speed":1-10,"chaos":1-10},' +
    '"abilities":[{"name":"string","effect":"string","power":1-10}],' +
    '"quirk":"string","style":"string","intro":"string"}';

  function fighterSystemPrompt() {
    return [
      'You are the engineer of TINY FIGHTER ARENA, a comedy browser fighting game.',
      'A player describes a fighter in one short line; you turn it into a complete, battle-ready fighter sheet.',
      '',
      'Hard rules:',
      '- Honor the description literally: every noun, verb and adjective the player wrote must shape the stats, abilities, quirk and fighting style. Vague or lazy descriptions produce average fighters; clever, specific, exploitable descriptions produce genuinely dangerous ones.',
      '- Stats are numbers from 1 to 10, decimals allowed: power = damage, defense = toughness, speed = dodging and initiative, chaos = critical hits and weird ability procs. The four stats combined must land between 18 and 24. Only an exceptionally clever description justifies up to 27; a boring description should sit near 18.',
      '- abilities: 2 or 3 signature moves whose names and effects clearly grow out of the player\'s exact words, each with power 1-10. At least one attack; at most one defensive or healing move.',
      '- quirk: one sentence, a funny habit or weakness that can misfire mid-fight.',
      '- style: one short sentence on how the fighter moves and fights.',
      '- intro: one sentence of first-person trash talk, max 20 words, funny, no emojis.',
      '- name: a pun or riff on the description. epithet: a 2-4 word title.',
      '- lookPrompt: one vivid image prompt, max 40 words: the fighter exactly as described, dramatic arena spotlight, dark background, punchy game cover art. No text, letters or logos in the image.',
      '',
      'Return ONLY a JSON object. No markdown fences, no commentary. Exact shape:',
      FIGHTER_SHAPE
    ].join('\n');
  }

  function challengerSystemPrompt(playerFighter, rung, ladderLength) {
    var total = statTotal(playerFighter);
    var target = total - 3 + rung * 2; // rung 1 ≈ total-3, final rung ≈ total+5
    var flavor = [
      'rung 1: a pushover the audience will adore watching lose',
      'rung 2: a fair match',
      'rung 3: a fair match with a mean streak',
      'rung 4: a serious threat',
      'rung 5: the FINAL BOSS — grandiose, theatrical, one genuinely scary signature ability'
    ];
    var flavorLine =
      rung >= 1 && rung <= 5 ? flavor[rung - 1] : 'an escalations of the theme';
    return [
      'You are the matchmaker of TINY FIGHTER ARENA, a comedy browser fighting game.',
      'Design the challenger the player must fight next. The ladder has ' +
        ladderLength +
        ' rungs; this challenger is rung ' +
        rung +
        ': ' +
        flavorLine +
        '.',
      '',
      'The challenger\'s concept must riff on the player\'s fighter: an ironic opposite, a natural predator, or an absurd escalation of the same idea. Never copy the player\'s fighter.',
      'Aim the four stats (power+defense+speed+chaos, each 1-10) at a combined total near ' +
        target +
        '.',
      'Give 2-3 abilities with power 1-10 that grow from the challenger\'s own theme (at most one defensive move), a funny exploitable quirk, a fighting style sentence, a lookPrompt of max 40 words (dramatic arena spotlight, dark background, game cover art, no text in image), and intro: one sentence of trash talk aimed AT the player\'s fighter by name.',
      '',
      'Return ONLY a JSON object. No markdown fences, no commentary. Exact shape:',
      FIGHTER_SHAPE
    ].join('\n');
  }

  function challengerUserPrompt(playerFighter) {
    return (
      'The player\'s fighter is "' +
      playerFighter.name +
      '" (' +
      playerFighter.epithet +
      '), built from the description: "' +
      (playerFighter.sourceLine || 'unknown') +
      '". Stats: power ' +
      playerFighter.stats.power +
      ', defense ' +
      playerFighter.stats.defense +
      ', speed ' +
      playerFighter.stats.speed +
      ', chaos ' +
      playerFighter.stats.chaos +
      '. Fighting style: ' +
      playerFighter.style
    );
  }

  function narratorSystemPrompt() {
    return [
      'You are the loudspeaker announcer of TINY FIGHTER ARENA.',
      'You commentate exactly one exchange of an arena fight in 2-3 short, punchy sentences (3-4 if the fight just ended).',
      'Reference the exact events you are given: names, ability names, hits, misses, quirks, crowd mood. Exaggerate like a pro wrestling commentator on his last night.',
      'Never invent events, damage or fighters that are not in the data. No emojis, no markdown, no stage directions. Plain spoken text only.'
    ].join('\n');
  }

  function narratorUserPrompt(bout) {
    var lines = [
      'BOUT: "' +
        bout.a.fighter.name +
        '" (HP ' +
        Math.round(bout.a.hp) +
        '/' +
        bout.a.maxHp +
        ') vs "' +
        bout.b.fighter.name +
        '" (HP ' +
        Math.round(bout.b.hp) +
        '/' +
        bout.b.maxHp +
        '), round ' +
        bout.round +
        ' of ' +
        CONFIG.MAX_ROUNDS +
        '.'
    ];
    bout.lastEvents.forEach(function (ev, i) {
      lines.push((i + 1) + '. ' + eventToText(ev, bout));
    });
    if (bout.over) {
      lines.push(
        'THE FIGHT IS OVER — winner: ' + (bout.winner ? bout.winner.fighter.name : 'nobody (draw)')
      );
      lines.push('Declare the winner gloriously and give the crowd\'s reaction.');
    } else {
      lines.push('Commentate these exact events. Do not continue the fight.');
    }
    return lines.join('\n');
  }

  function eventToText(ev) {
    var who = ev.attacker ? ev.attacker.fighter : null;
    var foe = ev.defender ? ev.defender.fighter : null;
    if (ev.type === 'attack') {
      var s = who.name + ' attacks ' + foe.name;
      if (ev.dodged) {
        s += ': ' + foe.name + ' DODGES completely, no damage';
      } else {
        s += ' for ' + ev.damage + ' damage';
        if (ev.crit) s += ' (CRITICAL)';
        if (ev.ability) {
          s +=
            ' using signature move "' +
            ev.ability.name +
            '" (' +
            ev.ability.effect +
            ')';
        }
        s += ' → ' + foe.name + ' now ' + Math.round(ev.defenderHpAfter) + '/' + ev.defender.maxHp + ' HP';
      }
      return s;
    }
    if (ev.type === 'quirk') {
      var qside = ev.side;
      return (
        'QUIRK of ' +
        qside.fighter.name +
        ': "' +
        qside.fighter.quirk +
        '" — it ' +
        ev.text +
        ' (' +
        (ev.hpDelta >= 0 ? '+' : '') +
        ev.hpDelta +
        ' HP, now ' +
        Math.round(ev.hpAfter) +
        '/' +
        qside.maxHp +
        ')'
      );
    }
    return 'something happens';
  }

  /* ------------------------------------------------------------------ *
   * Defensive JSON parsing + fighter normalization
   * ------------------------------------------------------------------ */

  /**
   * Extract a JSON object from a noisy LLM reply: strips code fences,
   * slices from first { to last }, tries common repairs.
   * Returns the parsed value or throws.
   */
  function extractJSON(text) {
    if (text == null) throw new Error('empty reply');
    var s = String(text).trim();
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/g, '');
    var start = s.indexOf('{');
    var end = s.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
      throw new Error('no JSON object found');
    }
    s = s.slice(start, end + 1);
    try {
      return JSON.parse(s);
    } catch (e) {
      // common repair: trailing commas
      var repaired = s.replace(/,\s*([}\]])/g, '$1');
      return JSON.parse(repaired);
    }
  }

  function clamp(n, lo, hi) {
    n = Number(n);
    if (!isFinite(n)) n = lo;
    return Math.min(hi, Math.max(lo, n));
  }

  function str(v, fallback, maxLen) {
    if (typeof v !== 'string') v = '';
    v = v.replace(/\s+/g, ' ').trim();
    if (!v) v = fallback;
    if (maxLen && v.length > maxLen) v = v.slice(0, maxLen - 1) + '…';
    return v;
  }

  /** Normalize any parsed object into a safe fighter sheet. Throws if unusable. */
  function coerceFighter(obj, opts) {
    opts = opts || {};
    var src = opts.sourceLine || '';
    var fallbackName = opts.fallbackName || 'The Nameless Lump';
    if (!obj || typeof obj !== 'object') throw new Error('not an object');
    var statsRaw = obj.stats || {};
    var stats = {
      power: clamp(round1(statsRaw.power), 1, 10),
      defense: clamp(round1(statsRaw.defense), 1, 10),
      speed: clamp(round1(statsRaw.speed), 1, 10),
      chaos: clamp(round1(statsRaw.chaos), 1, 10)
    };
    var abilities = Array.isArray(obj.abilities) ? obj.abilities : [];
    var clean = abilities
      .filter(function (a) {
        return a && typeof a === 'object';
      })
      .slice(0, 3)
      .map(function (a) {
        return {
          name: str(a.name, 'Wild Swing', 40),
          effect: str(a.effect, 'A desperate, unremarkable attack.', 160),
          power: clamp(round1(a.power), 1, 10)
        };
      });
    if (!clean.length) {
      clean.push({
        name: 'Wild Swing',
        effect: 'Flails with whatever it has.',
        power: 4
      });
    }
    if (!statsRaw.power && !statsRaw.defense && !statsRaw.speed && !statsRaw.chaos) {
      // model ignored the schema entirely → average fighter
      stats = { power: 5, defense: 5, speed: 5, chaos: 5 };
    }
    var total = stats.power + stats.defense + stats.speed + stats.chaos;
    if (total > 32) {
      // absurd inflation → rescale proportionally to a legit 24
      var k = 24 / total;
      stats = {
        power: clamp(round1(stats.power * k), 1, 10),
        defense: clamp(round1(stats.defense * k), 1, 10),
        speed: clamp(round1(stats.speed * k), 1, 10),
        chaos: clamp(round1(stats.chaos * k), 1, 10)
      };
    }
    return {
      name: str(obj.name, fallbackName, 34),
      epithet: str(obj.epithet, 'The Unnamed', 40),
      lookPrompt: str(obj.lookPrompt, 'a mysterious masked arena fighter, dramatic spotlight, dark background, game cover art', 400),
      stats: stats,
      abilities: clean,
      quirk: str(obj.quirk, 'Freezes up whenever the crowd goes quiet.', 180),
      style: str(obj.style, 'Fights like it is late for a bus.', 160),
      intro: str(obj.intro, 'I have come to win, allegedly.', 160),
      sourceLine: str(src, '', 300)
    };
  }

  function statTotal(f) {
    return f.stats.power + f.stats.defense + f.stats.speed + f.stats.chaos;
  }

  function round1(n) {
    return Math.round(n * 10) / 10;
  }

  /* ------------------------------------------------------------------ *
   * Seeded RNG (mulberry32)
   * ------------------------------------------------------------------ */

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hashString(s) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  /* ------------------------------------------------------------------ *
   * Battle engine — fully deterministic for a given (fighters, seed)
   * ------------------------------------------------------------------ */

  function maxHpFor(f) {
    return Math.round(60 + f.stats.defense * 4);
  }

  var QUIRK_BLUNDERS = [
    'trips over absolutely nothing',
    'waves at a fan mid-swing and loses focus',
    'forgets how arms work for a second',
    'gets distracted by its own reflection'
  ];
  var QUIRK_RALLIES = [
    'roars loud enough to scare itself stronger',
    'remembers who it is fighting for',
    'smells victory, and vaguely of cheese',
    'hears the crowd chant its name'
  ];

  function newBattle(playerFighter, foeFighter, seed) {
    var rng = mulberry32(seed == null ? (Math.random() * 4294967296) >>> 0 : seed);
    var bout = {
      seed: seed,
      round: 0,
      over: false,
      winner: null,
      lastEvents: [],
      a: side(playerFighter),
      b: side(foeFighter)
    };
    function side(f) {
      return { fighter: f, hp: maxHpFor(f), maxHp: maxHpFor(f), empowered: false };
    }

    function pick(list) {
      return list[Math.floor(rng() * list.length)];
    }

    function attack(att, def) {
      var dodgeChance = clamp(def.fighter.stats.speed * 0.032 - att.fighter.stats.speed * 0.006, 0.03, 0.38);
      var ev = {
        type: 'attack',
        attacker: att,
        defender: def,
        dodged: false,
        crit: false,
        ability: null,
        quirkText: null,
        damage: 0,
        defenderHpAfter: def.hp
      };
      if (rng() < dodgeChance) {
        ev.dodged = true;
        return ev;
      }
      var st = att.fighter.stats;
      var base = st.power * (1.7 + rng() * 1.3);
      var dmg = base * (1 - def.fighter.stats.defense / 24);
      if (att.empowered) {
        dmg *= 1.35;
        att.empowered = false;
      }
      if (rng() < 0.05 + st.chaos * 0.03) {
        ev.crit = true;
        dmg *= 1.75;
      }
      if (rng() < 0.22 + st.chaos * 0.025) {
        var abilities = att.fighter.abilities;
        var total = abilities.reduce(function (s, a) {
          return s + a.power + 1;
        }, 0);
        var roll = rng() * total;
        for (var i = 0; i < abilities.length; i++) {
          roll -= abilities[i].power + 1;
          if (roll <= 0) {
            ev.ability = abilities[i];
            break;
          }
        }
        dmg += ev.ability.power * 1.5;
      }
      ev.damage = Math.max(1, Math.round(dmg));
      def.hp = Math.max(0, def.hp - ev.damage);
      ev.defenderHpAfter = def.hp;
      return ev;
    }

    function quirk(sideRef) {
      var kind = rng() < 0.5 ? 'blunder' : rng() < 0.5 ? 'rally' : 'adrenaline';
      var ev = { type: 'quirk', side: sideRef, kind: kind, hpDelta: 0, hpAfter: sideRef.hp, text: '' };
      if (kind === 'blunder') {
        ev.hpDelta = -Math.round(2 + rng() * 4);
        ev.text = pick(QUIRK_BLUNDERS);
      } else if (kind === 'rally') {
        ev.hpDelta = Math.round(3 + rng() * 4);
        ev.text = pick(QUIRK_RALLIES);
      } else {
        sideRef.empowered = true;
        ev.text = 'enters a terrifying focus — next attack hits harder';
      }
      sideRef.hp = clamp(sideRef.hp + ev.hpDelta, 0, sideRef.maxHp);
      ev.hpAfter = sideRef.hp;
      return ev;
    }

    function nextRound() {
      if (bout.over) return bout;
      bout.round++;
      bout.lastEvents = [];
      // initiative: faster goes first, with rng jitter
      var order;
      if (
        bout.a.fighter.stats.speed + rng() * 2 >=
        bout.b.fighter.stats.speed + rng() * 2
      ) {
        order = [bout.a, bout.b];
      } else {
        order = [bout.b, bout.a];
      }
      for (var i = 0; i < order.length; i++) {
        var att = order[i];
        var def = att === bout.a ? bout.b : bout.a;
        if (att.hp <= 0 || def.hp <= 0) break;
        if (rng() < 0.11) bout.lastEvents.push(quirk(att));
        if (att.hp <= 0) break; // blunder can KO yourself
        if (def.hp > 0) bout.lastEvents.push(attack(att, def));
      }
      if (bout.a.hp <= 0 || bout.b.hp <= 0) {
        bout.over = true;
        bout.winner = bout.a.hp <= 0 && bout.b.hp <= 0 ? (bout.a.hp >= bout.b.hp ? bout.a : bout.b) : bout.a.hp <= 0 ? bout.b : bout.a;
      } else if (bout.round >= CONFIG.MAX_ROUNDS) {
        bout.over = true;
        var pa = bout.a.hp / bout.a.maxHp;
        var pb = bout.b.hp / bout.b.maxHp;
        if (Math.abs(pa - pb) < 0.001) {
          bout.winner = statTotal(bout.a.fighter) >= statTotal(bout.b.fighter) ? bout.a : bout.b;
        } else {
          bout.winner = pa > pb ? bout.a : bout.b;
        }
        bout.judgesDecision = true;
      }
      return bout;
    }

    return { bout: bout, nextRound: nextRound };
  }

  /* ------------------------------------------------------------------ *
   * Share codec — compact JSON + LZW + base64url in URL hash (#f=...)
   * ------------------------------------------------------------------ */

  function compactFighter(f) {
    return {
      n: f.name,
      e: f.epithet,
      l: f.lookPrompt,
      s: [f.stats.power, f.stats.defense, f.stats.speed, f.stats.chaos],
      a: f.abilities.map(function (ab) {
        return [ab.name, ab.effect, ab.power];
      }),
      q: f.quirk,
      y: f.style,
      i: f.intro,
      c: f.sourceLine || ''
    };
  }

  function expandFighter(c) {
    return {
      name: c.n,
      epithet: c.e,
      lookPrompt: c.l,
      stats: { power: c.s[0], defense: c.s[1], speed: c.s[2], chaos: c.s[3] },
      abilities: c.a.map(function (x) {
        return { name: x[0], effect: x[1], power: x[2] };
      }),
      quirk: c.q,
      style: c.y,
      intro: c.i,
      sourceLine: c.c || ''
    };
  }

  function encodeShare(playerFighter, foeFighter, rung, seed) {
    var payload = {
      v: 1,
      r: rung,
      d: seed,
      f: [compactFighter(playerFighter), compactFighter(foeFighter)]
    };
    return b64urlFromBytes(lzwCompress(utf8Encode(JSON.stringify(payload))));
  }

  function decodeShare(encoded) {
    var payload = JSON.parse(utf8Decode(lzwDecompress(bytesFromB64url(encoded))));
    if (!payload || payload.v !== 1 || !Array.isArray(payload.f) || payload.f.length !== 2) {
      throw new Error('bad share payload');
    }
    return {
      rung: payload.r || 1,
      seed: payload.d >>> 0,
      player: expandFighter(payload.f[0]),
      foe: expandFighter(payload.f[1])
    };
  }

  /* UTF-8 <-> bytes helpers. Hand-rolled so the codec is lossless even for
   * lone surrogates and behaves identically in every browser and in Node. */

  function utf8Encode(str) {
    var out = [];
    var i = 0;
    while (i < str.length) {
      var code = str.charCodeAt(i);
      if (code >= 0xd800 && code <= 0xdbff && i + 1 < str.length) {
        var lo = str.charCodeAt(i + 1);
        if (lo >= 0xdc00 && lo <= 0xdfff) {
          code = 0x10000 + ((code - 0xd800) << 10) + (lo - 0xdc00);
          i++;
        }
      }
      i++;
      if (code < 0x80) {
        out.push(code);
      } else if (code < 0x800) {
        out.push(0xc0 | (code >> 6), 0x80 | (code & 63));
      } else if (code < 0x10000) {
        out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
      } else {
        out.push(
          0xf0 | (code >> 18),
          0x80 | ((code >> 12) & 63),
          0x80 | ((code >> 6) & 63),
          0x80 | (code & 63)
        );
      }
    }
    return new Uint8Array(out);
  }

  function utf8Decode(bytes) {
    var out = '';
    var i = 0;
    while (i < bytes.length) {
      var b = bytes[i];
      var cp;
      if (b < 0x80) {
        cp = b;
        i += 1;
      } else if (b < 0xe0) {
        cp = ((b & 31) << 6) | (bytes[i + 1] & 63);
        i += 2;
      } else if (b < 0xf0) {
        cp = ((b & 15) << 12) | ((bytes[i + 1] & 63) << 6) | (bytes[i + 2] & 63);
        i += 3;
      } else {
        cp =
          ((b & 7) << 18) |
          ((bytes[i + 1] & 63) << 12) |
          ((bytes[i + 2] & 63) << 6) |
          (bytes[i + 3] & 63);
        i += 4;
      }
      out +=
        cp < 0x10000
          ? String.fromCharCode(cp)
          : String.fromCharCode(0xd800 + ((cp - 0x10000) >> 10), 0xdc00 + ((cp - 0x10000) & 0x3ff));
    }
    return out;
  }

  var B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

  function b64urlFromBytes(bytes) {
    var out = '';
    var bits = 0;
    var acc = 0;
    for (var i = 0; i < bytes.length; i++) {
      acc = (acc << 8) | bytes[i];
      bits += 8;
      while (bits >= 6) {
        out += B64URL.charAt((acc >> (bits - 6)) & 63);
        bits -= 6;
      }
    }
    if (bits > 0) out += B64URL.charAt((acc << (6 - bits)) & 63);
    return out;
  }

  function bytesFromB64url(str) {
    var clean = str.replace(/[^A-Za-z0-9\-_]/g, '');
    var bits = 0;
    var acc = 0;
    var out = [];
    for (var i = 0; i < clean.length; i++) {
      var v = B64URL.indexOf(clean.charAt(i));
      if (v < 0) throw new Error('bad base64');
      acc = (acc << 6) | v;
      bits += 6;
      if (bits >= 8) {
        out.push((acc >> (bits - 8)) & 0xff);
        bits -= 8;
      }
    }
    return new Uint8Array(out);
  }

  /**
   * LZW over UTF-8 bytes. Codes 9..16 bits; width depends only on the number
   * of codes emitted so far (k): width = smallest w with 2^w > 256 + k, so
   * encoder and decoder can never disagree. Dictionary caps at 65536 entries.
   * Bitstream is MSB-first.
   */
  var LZW_MAX = 65536;

  function lzwCompress(bytes) {
    var dict = new Map();
    var dictSize = 256;
    var w = '';
    var codes = [];
    for (var i = 0; i < bytes.length; i++) {
      var c = String.fromCharCode(bytes[i]);
      var wc = w + c;
      var known = w === '' || wc.length === 1 || dict.has(wc);
      if (known) {
        w = wc;
      } else {
        codes.push(codeOf(w, dict));
        if (dictSize < LZW_MAX) dict.set(wc, dictSize++);
        w = c;
      }
    }
    if (w !== '') codes.push(codeOf(w, dict));
    // pack MSB-first with width from k only
    var out = [];
    var acc = 0;
    var bits = 0;
    for (var k = 0; k < codes.length; k++) {
      var width = widthFor(k);
      acc = acc * Math.pow(2, width) + codes[k]; // stays < 2^24
      bits += width;
      while (bits >= 8) {
        out.push((acc >>> (bits - 8)) & 0xff);
        bits -= 8;
      }
      acc &= (1 << bits) - 1; // keep only unconsumed low bits (bits <= 7 here)
    }
    if (bits > 0) out.push((acc << (8 - bits)) & 0xff);
    return new Uint8Array(out);
  }

  function lzwDecompress(bytes) {
    // unpack MSB-first
    var codes = [];
    var acc = 0;
    var bits = 0;
    var bitpos = 0;
    var k = 0;
    while (true) {
      var width = widthFor(k);
      while (bits < width && bitpos < bytes.length) {
        acc = (acc << 8) | bytes[bitpos++];
        bits += 8;
      }
      if (bits < width) break;
      codes.push((acc >> (bits - width)) & ((1 << width) - 1));
      bits -= width;
      acc &= (1 << bits) - 1;
      k++;
    }
    // classic LZW expansion
    var dict = [];
    for (var i = 0; i < 256; i++) dict[i] = String.fromCharCode(i);
    var dictSize = 256;
    var prev = null;
    var outBytes = [];
    for (var j = 0; j < codes.length; j++) {
      var code = codes[j];
      var entry;
      if (dict[code] !== undefined) {
        entry = dict[code];
      } else if (prev !== null && code === dictSize) {
        entry = prev + prev.charAt(0);
      } else {
        throw new Error('lzw: bad code');
      }
      for (var q = 0; q < entry.length; q++) outBytes.push(entry.charCodeAt(q));
      if (prev !== null && dictSize < LZW_MAX) {
        dict[dictSize++] = prev + entry.charAt(0);
      }
      prev = entry;
    }
    return new Uint8Array(outBytes);
  }

  function widthFor(k) {
    var w = 9;
    while (Math.pow(2, w) <= 256 + k) w++;
    return w;
  }

  function codeOf(w, dict) {
    if (w.length === 1) return w.charCodeAt(0);
    var v = dict.get(w);
    if (v === undefined) throw new Error('lzw: missing entry');
    return v;
  }

  /* ------------------------------------------------------------------ */

  return {
    CONFIG: CONFIG,
    fighterSystemPrompt: fighterSystemPrompt,
    challengerSystemPrompt: challengerSystemPrompt,
    challengerUserPrompt: challengerUserPrompt,
    narratorSystemPrompt: narratorSystemPrompt,
    narratorUserPrompt: narratorUserPrompt,
    extractJSON: extractJSON,
    describeEvent: eventToText,
    coerceFighter: coerceFighter,
    statTotal: statTotal,
    mulberry32: mulberry32,
    hashString: hashString,
    maxHpFor: maxHpFor,
    newBattle: newBattle,
    encodeShare: encodeShare,
    decodeShare: decodeShare,
    utf8Encode: utf8Encode,
    utf8Decode: utf8Decode,
    lzwCompress: lzwCompress,
    lzwDecompress: lzwDecompress
  };
});
