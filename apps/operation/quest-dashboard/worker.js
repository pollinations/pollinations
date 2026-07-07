// Live quest dashboard — single Cloudflare Worker bound to prod D1.
//   GET /        -> HTML shell (loads @pollinations/ui bundle + styles as assets)
//   GET /data    -> rewards-ledger snapshot as JSON (polled every 20s by the page)
// No build step, no secrets: D1 binds by id at the account level.

// Recent feed with attribution.
const FEED_SQL = `
  SELECT r.id, r.quest_id, r.title, r.pollen_amount, r.balance_bucket,
         r.earned_at, r.claimed_at, u.github_username, u.name, u.image
    FROM rewards r LEFT JOIN user u ON u.id = r.user_id
   ORDER BY CASE WHEN r.earned_at > 10000000000 THEN r.earned_at ELSE r.earned_at * 1000 END DESC
   LIMIT 40`;

// Per-quest aggregates.
const AGG_SQL = `
  SELECT r.quest_id, r.title, COUNT(*) AS earned,
         SUM(CASE WHEN r.claimed_at IS NOT NULL THEN 1 ELSE 0 END) AS claimed,
         SUM(r.pollen_amount) AS pollen,
         SUM(CASE WHEN r.claimed_at IS NOT NULL THEN r.pollen_amount ELSE 0 END) AS claimed_pollen
    FROM rewards r GROUP BY r.quest_id, r.title
   ORDER BY claimed_pollen DESC, pollen DESC, earned DESC`;

const TOT_SQL = `
  SELECT COUNT(*) AS total_earned,
         SUM(CASE WHEN claimed_at IS NOT NULL THEN 1 ELSE 0 END) AS total_claimed,
         SUM(pollen_amount) AS total_pollen,
         COUNT(DISTINCT user_id) AS users
    FROM rewards`;

const TOP_SQL = `
  SELECT u.github_username, u.name, u.image, COUNT(*) AS quests,
         SUM(r.pollen_amount) AS pollen
    FROM rewards r LEFT JOIN user u ON u.id = r.user_id
   GROUP BY r.user_id ORDER BY pollen DESC LIMIT 8`;

// rewards timestamps can be seconds or ms. Normalize to ms for the client.
function normMs(v) {
    if (v == null) return null;
    v = Number(v);
    return v > 10_000_000_000 ? v : v * 1000;
}

async function snapshot(env) {
    const [feed, agg, tot, top] = await env.DB.batch([
        env.DB.prepare(FEED_SQL),
        env.DB.prepare(AGG_SQL),
        env.DB.prepare(TOT_SQL),
        env.DB.prepare(TOP_SQL),
    ]);
    const feedRows = feed.results.map((r) => ({
        ...r,
        earned_ms: normMs(r.earned_at),
        claimed_ms: normMs(r.claimed_at),
    }));
    return {
        feed: feedRows,
        agg: agg.results,
        totals: tot.results[0] || {},
        top: top.results,
        generated_at: Date.now(),
    };
}

const HTML = `<!doctype html>
<html class="dark" data-theme="neutral">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Quests — Live</title>
<link rel="stylesheet" href="/styles.css">
<style>
  html,body{margin:0;background:var(--polli-color-app-bg);min-height:100%}
  body{font-family:"Uncut Sans",ui-sans-serif,system-ui,sans-serif}
  #root{max-width:1180px;margin:0 auto;padding:22px 22px 48px}
  @keyframes flashrow{0%{background:var(--polli-color-success-bg-light,rgba(54,211,153,.18))}100%{background:transparent}}
  .flash{animation:flashrow 2.4s ease-out}
  .feedscroll{max-height:560px;overflow:auto}
  .feedscroll::-webkit-scrollbar{width:8px}
  .feedscroll::-webkit-scrollbar-thumb{background:var(--polli-color-border);border-radius:8px}
  .dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--polli-color-success-bright,#36d399);margin-right:6px}
  .dot.stale{background:var(--polli-color-warning-text,#e0a800)}
</style>
<script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
<script src="/bundle.js"></script>
</head>
<body>
<div id="root"></div>
<script>
(function () {
  const UI = window.PollinationsUI;
  const React = window.React, ReactDOM = window.ReactDOM;
  const h = React.createElement;
  const { StatCard, Chip, Surface, Section, Text, Heading } = UI;

  const seen = new Set();
  let firstRender = true;
  let root = null;
  let lastOk = Date.now();

  function rel(ms) {
    if (!ms) return "";
    const s = Math.max(0, (Date.now() - ms) / 1000);
    if (s < 60) return Math.floor(s) + "s ago";
    if (s < 3600) return Math.floor(s/60) + "m ago";
    if (s < 86400) return Math.floor(s/3600) + "h ago";
    return Math.floor(s/86400) + "d ago";
  }
  const who = (r) => r.github_username ? "@"+r.github_username : (r.name || "someone");
  function avatar(r, size) {
    const st = { width:size, height:size, borderRadius:"50%", flex:"0 0 auto", objectFit:"cover" };
    if (r.image) return h("img", { src:r.image, style:st, alt:"" });
    const initial = (who(r).replace(/^@/,"")[0] || "?").toUpperCase();
    return h("div", { style: Object.assign({}, st, { display:"grid", placeItems:"center",
      background:"var(--polli-color-bg-subtle)", fontWeight:700, fontSize:size*0.45 }) }, initial);
  }
  const num = (n) => (n==null?0:n).toLocaleString();
  const pollen = (n) => (Math.round((n||0)*100)/100) + " 🌸";

  function view(data) {
    const feed = data.feed||[], agg = data.agg||[], top = data.top||[], tot = data.totals||{};
    const claimRate = tot.total_earned ? Math.round(100*tot.total_claimed/tot.total_earned) : 0;
    const tile = (label, value) => h(Surface, { variant:"card", className:"polli:p-4" }, h(StatCard, { label, value }));
    const stats = h("div", { className:"polli:grid polli:gap-3",
        style:{ gridTemplateColumns:"repeat(5, minmax(0,1fr))", marginBottom:20 } },
      tile("Quests completed", num(tot.total_earned)),
      tile("Rewards claimed", num(tot.total_claimed)),
      tile("Claim rate", claimRate + "%"),
      tile("Pollen awarded", pollen(tot.total_pollen)),
      tile("Participants", num(tot.users)));

    const feedRows = feed.length ? feed.map((r) => {
      const isNew = !seen.has(r.id);
      if (isNew) seen.add(r.id);
      const claimed = r.claimed_ms != null;
      return h("div", { key:r.id, className:(isNew && !firstRender) ? "flash" : "",
          style:{ display:"flex", gap:11, alignItems:"center", padding:"9px 8px", borderRadius:10 } },
        avatar(r, 34),
        h("div", { style:{ minWidth:0, flex:1 } },
          h(Text, { as:"div", size:"sm", tone:"base" },
            who(r), " ",
            h(Text, { as:"span", size:"sm", tone:"muted" }, "completed"), " ",
            h("b", { style:{ color:"var(--polli-color-text-strong)" } }, r.title)),
          h("div", { style:{ marginTop:1, display:"flex", gap:8, alignItems:"center" } },
            h(Text, { as:"span", size:"xs", tone:"muted" }, rel(r.earned_ms)),
            h(Text, { as:"span", size:"xs", tone:"base" }, "+" + r.pollen_amount + " 🌸"),
            h(Chip, { intent: claimed ? "news" : "alpha", size:"sm" }, claimed ? "claimed" : "earned"))));
    }) : [h(Text, { key:"e", tone:"muted", className:"polli:p-4" }, "No completions yet…")];
    const feedCard = h(Surface, { variant:"card", className:"polli:p-4" },
      h(Section, { title:"Live feed · newest first" }, h("div", { className:"feedscroll" }, feedRows)));

    const maxClaimedPollen = Math.max(1, ...agg.map(a => a.claimed_pollen || 0));
    const questBars = agg.length ? agg.map((a) => {
      const claimedPollen = a.claimed_pollen||0;
      const pct = Math.round(100*claimedPollen/maxClaimedPollen);
      return h("div", { key:a.quest_id, style:{ marginBottom:13 } },
        h("div", { style:{ display:"flex", justifyContent:"space-between", marginBottom:5 } },
          h(Text, { as:"span", size:"sm", tone:"base" }, a.title || a.quest_id),
          h(Text, { as:"span", size:"sm", tone:"soft" }, pollen(claimedPollen))),
        h("div", { style:{ height:9, background:"var(--polli-color-bg-subtle)", borderRadius:6, overflow:"hidden" } },
          h("div", { style:{ width:pct+"%", height:"100%", borderRadius:6,
              background:"var(--polli-color-success-bright, #36d399)" } })));
    }) : [h(Text, { key:"e", tone:"muted" }, "—")];
    const questCard = h(Surface, { variant:"card", className:"polli:p-4", style:{ marginBottom:18 } },
      h(Section, { title:"Claimed pollen by quest" }, questBars));

    const lbRows = top.length ? top.map((r, i) =>
      h("div", { key:i, style:{ display:"flex", alignItems:"center", gap:10, padding:"6px 4px",
          borderBottom:"1px solid var(--polli-color-divider)" } },
        h(Text, { as:"span", size:"sm", tone:"muted", style:{ width:18, textAlign:"center" } }, i+1),
        avatar(r, 28),
        h(Text, { as:"span", size:"sm", tone:"base", style:{ flex:1, minWidth:0, overflow:"hidden",
          textOverflow:"ellipsis", whiteSpace:"nowrap" } }, who(r)),
        h(Text, { as:"span", size:"xs", tone:"soft" }, (r.quests||0) + " quests · " + pollen(r.pollen)))
    ) : [h(Text, { key:"e", tone:"muted" }, "—")];
    const lbCard = h(Surface, { variant:"card", className:"polli:p-4" },
      h(Section, { title:"Top earners" }, lbRows));

    const stale = (Date.now() - lastOk) > 45000;
    const header = h("div", null,
      h("div", { style:{ display:"flex", alignItems:"baseline", gap:12, marginBottom:2 } },
        h(Heading, { as:"h1", size:"title" }, "🌸 Quests — Live"),
        h(Chip, { intent:"news", size:"sm" }, "production")),
      h(Text, { tone:"muted", size:"sm", style:{ display:"block", marginBottom:18 } },
        h("span", { className:"dot" + (stale ? " stale" : "") }),
        "Every row is a completed quest from the rewards ledger · auto-refreshes every 20s"));

    return h("div", null, header, stats,
      h("div", { className:"polli:grid polli:gap-4",
          style:{ gridTemplateColumns:"1.15fr .85fr", alignItems:"start" } },
        feedCard, h("div", null, questCard, lbCard)));
  }

  function render(data) {
    if (!root) root = ReactDOM.createRoot(document.getElementById("root"));
    root.render(view(data));
    firstRender = false;
  }

  async function tick() {
    try {
      const r = await fetch("/data", { cache: "no-store" });
      if (r.ok) { lastOk = Date.now(); render(await r.json()); }
    } catch (e) { /* keep last frame; dot goes stale */ }
  }
  tick();
  setInterval(tick, 20000);
})();
</script>
</body>
</html>`;

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        if (url.pathname === "/data") {
            const data = await snapshot(env);
            return new Response(JSON.stringify(data), {
                headers: {
                    "content-type": "application/json",
                    "cache-control": "no-store",
                },
            });
        }
        if (url.pathname === "/styles.css" || url.pathname === "/bundle.js") {
            return env.ASSETS.fetch(request);
        }
        return new Response(HTML, {
            headers: { "content-type": "text/html; charset=utf-8" },
        });
    },
};
