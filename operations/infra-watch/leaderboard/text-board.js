// The daily community text leaderboard: the pixel-art board and its post,
// copied from the EC2 community monitor's build-leaderboard.mjs. Its design
// is explained in .claude/skills/community-leaderboard/SKILL.md.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const MIN_REQUESTS = 50; // ignore models too quiet to be meaningful
const TOP_N = 10;
const SPEED_TOP_N = 3;

function hpBadge(success) {
    if (success >= 100) return '<span class="perfect">PERFECT</span>';
    const [n, cls] =
        success >= 99
            ? [3, "ok"]
            : success >= 95
              ? [2, "ok"]
              : success >= 80
                ? [1, "warn"]
                : [0, "bad"];
    if (n === 0) return '<i class="skull"></i>';
    return Array.from(
        { length: n },
        () => '<i class="ph ' + cls + '"></i>',
    ).join("");
}

function formatTokens(n) {
    return n.toLocaleString("en-US").replace(/,/g, "<i>,</i>");
}

function buildHtml({ rows, speedChampions, totals, date }) {
    const fontsCss = readFileSync(
        join(__dirname, "fonts-embedded.css"),
        "utf8",
    );
    const maxTokens = rows[0].total_tokens;

    const bodyRows = rows
        .map((r, i) => {
            const isFirst = i === 0;
            const [owner, ...rest] = r.model.split("/");
            const model = rest.join("/");
            const pct = (r.total_tokens / maxTokens) * 100;
            const crown = isFirst ? '<span class="crown"></span>' : "";
            return `  <div class="row${isFirst ? " first" : ""}">
    <div class="bar" style="width:${pct}%"></div>
    <span class="score">${formatTokens(r.total_tokens)}</span>
    <span class="name">${crown}<b>${owner}</b>/${model}</span>
    <span class="tpsl">${r.median_tps}</span>
    <span class="hp">${hpBadge(r.success)}</span>
  </div>`;
        })
        .join("\n");

    const maxSpeed = speedChampions[0].median_tps;
    const cards = speedChampions
        .map((c, i) => {
            const [owner, ...rest] = c.model.split("/");
            const model = rest.join("/");
            const pct = (c.median_tps / maxSpeed) * 100;
            const gold = i === 0 ? " gold" : "";
            const medal = i === 0 ? '<span class="medal">FASTEST</span>' : "";
            return `    <div class="card${gold}">
      ${medal}
      <div class="big">${c.median_tps} <span class="unit">T/S</span></div>
      <div class="sbar"><div class="fill" style="width:${pct}%"></div></div>
      <div class="who"><b>${owner}</b>/${model}</div>
    </div>`;
        })
        .join("\n");

    const tokensDisplay = totals.total_tokens.toLocaleString("en-US");

    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Community Model Leaderboard</title>
<style id="fonts">${fontsCss}</style>
<style>
  * { margin:0; padding:0; box-sizing:border-box; border-radius:0 !important; }
  html,body { width:1200px; }
  body {
    background:#F3EBDE;
    background-image: radial-gradient(#cfc8b8 1px, transparent 1px);
    background-size: 18px 18px;
    font-family:'IBM Plex Mono', monospace;
    color:#110518;
    padding:28px 40px 24px;
  }
  .px { font-family:'Press Start 2P', monospace; }
  .hud { display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; }
  .hud .px { font-size:9px; color:#4a3f5c; letter-spacing:1px; }
  .hud .lime-tag { background:#110518; color:#E8F372; padding:5px 8px; }
  .titlebar { display:flex; align-items:center; justify-content:center; gap:26px; margin-bottom:10px; }
  h1 { font-family:'Press Start 2P', monospace; font-size:30px; letter-spacing:2px; }
  .subtitle { text-align:center; font-family:'Press Start 2P', monospace; font-size:9px; color:#6b5f80; letter-spacing:2px; margin-bottom:18px; }
  .star { width:4px; height:4px; position:relative; background:transparent; margin-right:44px; margin-bottom:24px;
    box-shadow: 8px 0px 0 #818900, 32px 0px 0 #818900, 12px 4px 0 #818900, 28px 4px 0 #818900, 8px 8px 0 #818900, 12px 8px 0 #818900, 16px 8px 0 #818900, 20px 8px 0 #818900, 24px 8px 0 #818900, 28px 8px 0 #818900, 32px 8px 0 #818900, 4px 12px 0 #818900, 8px 12px 0 #818900, 16px 12px 0 #818900, 20px 12px 0 #818900, 24px 12px 0 #818900, 32px 12px 0 #818900, 36px 12px 0 #818900, 0px 16px 0 #818900, 4px 16px 0 #818900, 8px 16px 0 #818900, 12px 16px 0 #818900, 16px 16px 0 #818900, 20px 16px 0 #818900, 24px 16px 0 #818900, 28px 16px 0 #818900, 32px 16px 0 #818900, 36px 16px 0 #818900, 40px 16px 0 #818900, 0px 20px 0 #818900, 8px 20px 0 #818900, 12px 20px 0 #818900, 16px 20px 0 #818900, 20px 20px 0 #818900, 24px 20px 0 #818900, 28px 20px 0 #818900, 32px 20px 0 #818900, 40px 20px 0 #818900, 0px 24px 0 #818900, 8px 24px 0 #818900, 32px 24px 0 #818900, 40px 24px 0 #818900, 12px 28px 0 #818900, 16px 28px 0 #818900, 24px 28px 0 #818900, 28px 28px 0 #818900; }
  .star.flip { margin-right:0; margin-left:44px; }
  .counterwrap { text-align:center; margin-bottom:22px; }
  .counter { display:inline-flex; align-items:baseline; gap:16px; background:#110518; padding:14px 22px 12px; border:3px solid #110518; box-shadow:6px 6px 0 rgba(17,5,24,0.22); }
  .counter .cdig { font-family:'Press Start 2P', monospace; font-size:26px; color:#E8F372; letter-spacing:2px; }
  .counter .cunit { font-family:'Press Start 2P', monospace; font-size:9px; color:#b8c4ea; letter-spacing:1px; }
  .csub { margin-top:10px; font-family:'Press Start 2P', monospace; font-size:8px; color:#6b5f80; letter-spacing:1px; }
  .csub b { color:#4a3f5c; font-weight:400; }
  .cab { background:#fff; border:3px solid #110518; box-shadow:8px 8px 0 #110518; position:relative; overflow:hidden; }
  .thead { display:grid; grid-template-columns:200px 1fr 150px 170px; align-items:center; padding:12px 18px 11px; background:#110518; color:#E8F372; font-family:'Press Start 2P', monospace; font-size:10px; letter-spacing:1px; }
  .thead .r { text-align:right; }
  .thead .c { text-align:center; }
  .row { display:grid; grid-template-columns:200px 1fr 150px 170px; align-items:center; padding:0 18px; height:47px; position:relative; border-top:1px solid #cfc8b8; background:#fff; }
  .row > * { position:relative; z-index:2; }
  .bar { position:absolute; left:0; top:0; bottom:0; background:#D8DFF8; z-index:1; border-right:3px solid #A4B4DE; }
  .score { font-family:'Press Start 2P', monospace; font-size:12px; text-align:left; }
  .score i { font-style:normal; color:#a89fc0; }
  .name { font-size:14px; font-weight:400; color:#4a3f5c; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .name b { font-weight:700; color:#110518; }
  .tpsl { text-align:right; font-weight:700; font-size:13px; color:#4a3f5c; }
  .hp { display:flex; justify-content:center; align-items:center; }
  .ph { display:inline-block; width:3px; height:3px; background:transparent; position:relative; top:-8px; margin-right:24px;
    box-shadow: 3px 0 0 currentColor, 6px 0 0 currentColor, 12px 0 0 currentColor, 15px 0 0 currentColor, 0 3px 0 currentColor, 3px 3px 0 currentColor, 6px 3px 0 currentColor, 9px 3px 0 currentColor, 12px 3px 0 currentColor, 15px 3px 0 currentColor, 18px 3px 0 currentColor, 0 6px 0 currentColor, 3px 6px 0 currentColor, 6px 6px 0 currentColor, 9px 6px 0 currentColor, 12px 6px 0 currentColor, 15px 6px 0 currentColor, 18px 6px 0 currentColor, 3px 9px 0 currentColor, 6px 9px 0 currentColor, 9px 9px 0 currentColor, 12px 9px 0 currentColor, 15px 9px 0 currentColor, 6px 12px 0 currentColor, 9px 12px 0 currentColor, 12px 12px 0 currentColor, 9px 15px 0 currentColor; }
  .ph:last-child { margin-right:18px; }
  .ok { color:#3b9736; } .warn { color:#b8860b; } .bad { color:#b03a2e; }
  .skull { display:inline-block; width:3px; height:3px; background:transparent; position:relative; top:-8px; margin-right:18px;
    box-shadow: 3px 0 0 #b03a2e, 6px 0 0 #b03a2e, 9px 0 0 #b03a2e, 12px 0 0 #b03a2e, 15px 0 0 #b03a2e, 0 3px 0 #b03a2e, 3px 3px 0 #b03a2e, 6px 3px 0 #b03a2e, 9px 3px 0 #b03a2e, 12px 3px 0 #b03a2e, 15px 3px 0 #b03a2e, 18px 3px 0 #b03a2e, 0 6px 0 #b03a2e, 6px 6px 0 #b03a2e, 9px 6px 0 #b03a2e, 12px 6px 0 #b03a2e, 18px 6px 0 #b03a2e, 0 9px 0 #b03a2e, 3px 9px 0 #b03a2e, 6px 9px 0 #b03a2e, 9px 9px 0 #b03a2e, 12px 9px 0 #b03a2e, 15px 9px 0 #b03a2e, 18px 9px 0 #b03a2e, 3px 12px 0 #b03a2e, 9px 12px 0 #b03a2e, 15px 12px 0 #b03a2e; }
  .perfect { display:inline-block; background:#E8F372; color:#110518; border:2px solid #110518; box-shadow:2px 2px 0 #110518; font-family:'Press Start 2P', monospace; font-size:7px; letter-spacing:1px; padding:4px 6px 3px; }
  .row.first { height:66px; background:#F5FABC; border-top:none; border-bottom:3px solid #110518; }
  .row.first .bar { background:#E8F372; border-right:none; }
  .row.first .name { font-size:17px; }
  .row.first .score { font-size:14px; }
  .row.first .tpsl { font-size:14px; color:#110518; }
  .crown { width:3px; height:3px; background:transparent; position:relative; top:-6px; margin-right:30px; display:inline-block;
    box-shadow: 0 0 0 #110518, 12px 0 0 #110518, 24px 0 0 #110518, 0 3px 0 #110518, 3px 3px 0 #110518, 9px 3px 0 #110518, 12px 3px 0 #110518, 15px 3px 0 #110518, 21px 3px 0 #110518, 24px 3px 0 #110518, 0 6px 0 #110518, 3px 6px 0 #110518, 6px 6px 0 #110518, 9px 6px 0 #110518, 12px 6px 0 #110518, 15px 6px 0 #110518, 18px 6px 0 #110518, 21px 6px 0 #110518, 24px 6px 0 #110518, 0 9px 0 #110518, 3px 9px 0 #110518, 6px 9px 0 #110518, 9px 9px 0 #110518, 12px 9px 0 #110518, 15px 9px 0 #110518, 18px 9px 0 #110518, 21px 9px 0 #110518, 24px 9px 0 #110518; }
  .bonus { margin-top:26px; }
  .bonus-title { display:flex; align-items:center; gap:14px; margin-bottom:12px; }
  .bonus-title .px { font-size:13px; letter-spacing:1px; }
  .bonus-title .dash { flex:1; height:3px; background:#110518; }
  .cards { display:grid; grid-template-columns:1.25fr 1fr 1fr; gap:18px; }
  .card { background:#fff; border:3px solid #110518; box-shadow:6px 6px 0 #110518; padding:16px 18px 14px; position:relative; }
  .card.gold { background:#E8F372; }
  .card .big { font-family:'Press Start 2P', monospace; font-size:26px; display:flex; align-items:baseline; gap:8px; }
  .card.gold .big { font-size:32px; }
  .card .unit { font-family:'Press Start 2P', monospace; font-size:9px; color:#4a3f5c; }
  .card .who { margin-top:10px; font-size:13px; color:#4a3f5c; }
  .card .who b { color:#110518; }
  .card .sbar { margin-top:12px; height:12px; border:2px solid #110518; background:#fff; position:relative; }
  .card .sbar .fill { position:absolute; inset:0; right:auto; background:#818900; }
  .card.gold .sbar { background:#F5FABC; }
  .card .medal { position:absolute; top:-3px; right:12px; background:#110518; color:#E8F372; font-family:'Press Start 2P', monospace; font-size:7px; padding:4px 6px; letter-spacing:1px; }
  .footer { display:flex; justify-content:space-between; align-items:center; margin-top:22px; }
  .legend { display:flex; align-items:center; gap:20px; font-size:11px; color:#6b5f80; font-weight:600; }
  .legend .cap { font-family:'Press Start 2P', monospace; font-size:8px; color:#4a3f5c; letter-spacing:1px; }
  .legend .item { display:flex; align-items:center; gap:6px; }
  .legend .ph { top:-6px; margin-right:20px; }
  .legend .ph:last-child { margin-right:16px; }
  .legend .skull { top:-6px; margin-right:16px; }
  .legend .perfect { font-size:6px; padding:3px 5px 2px; }
  .site { font-family:'Press Start 2P', monospace; font-size:9px; color:#110518; letter-spacing:1px; }
</style></head>
<body>
<div class="hud">
  <span class="px lime-tag">COMMUNITY MODELS</span>
  <span class="px">${date}</span>
</div>
<div class="titlebar">
  <div class="star"></div>
  <h1>MODEL LEADERBOARD</h1>
  <div class="star flip"></div>
</div>
<div class="subtitle">RANKED BY TOKENS SERVED &middot; LAST 24 HOURS</div>
<div class="counterwrap">
  <div class="counter">
    <span class="cdig">${tokensDisplay}</span>
    <span class="cunit">TOKENS<br>&middot; 24H &middot;</span>
  </div>
  <div class="csub">${totals.requests.toLocaleString("en-US")} REQUESTS &middot; ${totals.models} MODELS</div>
</div>
<div class="cab">
  <div class="thead"><span>TOKENS &middot; 24H</span><span>MODEL</span><span class="r">SPEED T/S</span><span class="c">SUCCESS</span></div>
${bodyRows}
</div>
<div class="bonus">
  <div class="bonus-title">
    <span class="px">FASTEST</span>
    <div class="dash"></div>
    <span class="px" style="font-size:8px;color:#6b5f80">MEDIAN TOKENS PER SECOND &middot; 24H</span>
  </div>
  <div class="cards">
${cards}
  </div>
</div>
<div class="footer">
  <div class="legend">
    <span class="cap">SUCCESS RATE</span>
    <span class="item"><span class="perfect">PERFECT</span> 100%</span>
    <span class="item"><i class="ph ok"></i><i class="ph ok"></i><i class="ph ok"></i> &ge;99%</span>
    <span class="item"><i class="ph ok"></i><i class="ph ok"></i> &ge;95%</span>
    <span class="item"><i class="ph warn"></i> &ge;80%</span>
    <span class="item"><i class="skull"></i> &lt;80%</span>
  </div>
  <span class="site">POLLINATIONS.AI</span>
</div>
</body></html>`;
}

function buildDiscordMarkdown({ date, totals, rows, speedChampions }) {
    const top = rows[0];
    const [topOwner, ...topRest] = top.model.split("/");
    const topModel = topRest.join("/");
    const fastest = speedChampions[0];
    const [fastOwner, ...fastRest] = fastest.model.split("/");
    const fastModel = fastRest.join("/");

    const perfectCount = rows.filter((r) => r.success >= 100).length;
    const mostRequests = [...rows].sort((a, b) => b.requests - a.requests)[0];
    const [mrOwner, ...mrRest] = mostRequests.model.split("/");
    const mrModel = mrRest.join("/");

    const lines = [
        `# 🏆 COMMUNITY MODEL LEADERBOARD — ${date}`,
        "",
        `**${totals.total_tokens.toLocaleString("en-US")} tokens** served in 24 hours across ${totals.models} models.`,
        "",
        `👑 \`${topOwner}/${topModel}\` — ${top.total_tokens.toLocaleString("en-US")} tokens · ${top.success}% success`,
        `⚡ speed crown: \`${fastOwner}/${fastModel}\` — **${fastest.median_tps} tokens/sec** median`,
    ];
    if (mostRequests.model !== top.model) {
        lines.push(
            `🐝 workhorse: \`${mrOwner}/${mrModel}\` — ${mostRequests.requests.toLocaleString("en-US")} requests`,
        );
    }
    if (perfectCount > 0) {
        lines.push(
            `🛡️ flawless: ${perfectCount} model${perfectCount > 1 ? "s" : ""} at 100% success`,
        );
    }
    return lines.join("\n");
}

// The day's board and post from every community text model's 24-hour row,
// or null when none was busy enough to rank. Only `listed` models, the
// public ones, count: a private model is never ranked or totalled.
export function textBoard(rows, date, listed) {
    const all = rows.filter((r) => listed.has(r.model));
    const ranked = all
        .filter((r) => r.requests >= MIN_REQUESTS)
        .sort((a, b) => b.total_tokens - a.total_tokens);
    if (ranked.length === 0) return null;
    const sum = (field) => all.reduce((total, r) => total + r[field], 0);
    const data = {
        rows: ranked.slice(0, TOP_N),
        speedChampions: [...ranked]
            .sort((a, b) => b.median_tps - a.median_tps)
            .slice(0, SPEED_TOP_N),
        totals: {
            requests: sum("requests"),
            total_tokens: sum("total_tokens"),
            models: all.length,
        },
        date,
    };
    return { html: buildHtml(data), markdown: buildDiscordMarkdown(data) };
}
