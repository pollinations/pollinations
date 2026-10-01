// Focus — where the team's effort goes, by area. Public, no login.
//   GET /      -> the page (@pollinations/ui browser bundle, served from packages/ui/dist)
//   GET /data  -> Dev project items as JSON: everything open, plus items closed in the last 90 days
// Reads GitHub with GITHUB_TOKEN; the token never reaches the browser.

const DAYS = 90;
const CACHE_MS = 10 * 60 * 1000;

const ITEMS = `query($cursor: String, $q: String!) {
  organization(login: "pollinations") { projectV2(number: 20) {
    items(first: 50, after: $cursor, query: $q) {
      pageInfo { hasNextPage endCursor }
      nodes {
        area: fieldValueByName(name: "Area") { ... on ProjectV2ItemFieldSingleSelectValue { name } }
        source: fieldValueByName(name: "Source") { ... on ProjectV2ItemFieldSingleSelectValue { name } }
        priority: fieldValueByName(name: "Priority") { ... on ProjectV2ItemFieldSingleSelectValue { name } }
        content {
          __typename
          ... on Issue {
            number title url state createdAt closedAt
            issueType { name }
            parent { number title url state }
            subIssuesSummary { total completed }
          }
          ... on PullRequest {
            number title url state createdAt mergedAt closedAt additions deletions
            commits { totalCount }
            closingIssuesReferences(first: 10) { nodes { number } }
          }
        }
      }
    }
  } }
}`;

async function github(env, query, variables) {
    const r = await fetch("https://api.github.com/graphql", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${env.GITHUB_TOKEN}`,
            "Content-Type": "application/json",
            "User-Agent": "pollinations-focus",
        },
        body: JSON.stringify({ query, variables }),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok || body.errors) throw new Error(`GitHub ${r.status}: ${JSON.stringify(body.errors || body).slice(0, 300)}`);
    return body.data;
}

async function items(env, q) {
    const out = [];
    let cursor = null;
    do {
        const page = (await github(env, ITEMS, { cursor, q })).organization.projectV2.items;
        out.push(...page.nodes);
        cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
    } while (cursor);
    return out;
}

function toItem(node) {
    const c = node.content;
    if (!c || (c.__typename !== "Issue" && c.__typename !== "PullRequest")) return null;
    const isPr = c.__typename === "PullRequest";
    return {
        kind: isPr ? "pr" : "issue",
        number: c.number,
        title: c.title,
        url: c.url,
        state: c.state.toLowerCase(), // issue: open | closed; pr: open | merged | closed
        area: node.area?.name || null,
        source: node.source?.name || null,
        priority: node.priority?.name || null,
        type: c.issueType?.name || null,
        parent: c.parent || null,
        subIssues: c.subIssuesSummary?.total ? c.subIssuesSummary : null,
        fixes: isPr ? c.closingIssuesReferences.nodes.map((n) => n.number) : [],
        commits: isPr ? c.commits.totalCount : 0,
        additions: c.additions || 0,
        deletions: c.deletions || 0,
        createdAt: c.createdAt,
        closedAt: c.mergedAt || c.closedAt,
    };
}

// Open items, plus closed ones in 30-day slices fetched side by side.
async function snapshot(env) {
    const day = 86400000;
    const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
    const now = Date.now();
    const queries = ["is:open"];
    for (let start = DAYS; start > 0; start -= 30) {
        queries.push(`is:closed updated:${iso(now - start * day)}..${iso(now - (start - 30) * day)}`);
    }
    const nodes = (await Promise.all(queries.map((q) => items(env, q)))).flat();
    const byNumber = new Map();
    for (const node of nodes) {
        const item = toItem(node);
        if (item) byNumber.set(item.number, item);
    }
    return { fetchedAt: now, days: DAYS, items: [...byNumber.values()] };
}

let cached = null;
let pending = null;

// Serve the last snapshot right away and refresh it in the background once it is older than CACHE_MS.
async function data(env, ctx) {
    const refresh = () => {
        pending ??= snapshot(env)
            .then((s) => (cached = s))
            .finally(() => (pending = null));
        return pending;
    };
    if (!cached) return refresh();
    if (Date.now() - cached.fetchedAt > CACHE_MS) ctx.waitUntil(refresh().catch(() => {}));
    return cached;
}

export default {
    async fetch(request, env, ctx) {
        const { pathname } = new URL(request.url);
        if (pathname === "/") return new Response(PAGE, { headers: { "Content-Type": "text/html; charset=utf-8" } });
        if (pathname === "/data") {
            try {
                return Response.json(await data(env, ctx), { headers: { "Cache-Control": "no-store" } });
            } catch (e) {
                return Response.json({ error: String(e.message || e) }, { status: 502 });
            }
        }
        return env.ASSETS.fetch(request);
    },
};

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pollinations Focus</title>
<link rel="stylesheet" href="/styles.css">
<style>
  html,body{margin:0;background:var(--polli-color-app-bg);min-height:100%;color:var(--polli-color-text-base)}
  body{font-family:"Uncut Sans",ui-sans-serif,system-ui,sans-serif}
  #root{max-width:1180px;margin:0 auto;padding:24px 20px 56px}
  a{color:inherit;text-decoration:none}
  .grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(260px,1fr))}
  .row{display:flex;gap:10px;align-items:center;padding:9px 10px;border-radius:10px}
  .row:hover{background:var(--polli-color-bg-subtle)}
  .num{font-variant-numeric:tabular-nums}
  .bar{height:6px;border-radius:3px;background:var(--polli-color-bg-subtle);overflow:hidden;display:flex}
  .bar>span{display:block;height:100%}
  .muted{color:var(--polli-color-text-muted)}
  .card{cursor:pointer}
  @media (max-width:600px){.meta{display:none}}
  .card:hover{outline:2px solid var(--polli-color-border)}
  .toggle button{font:inherit;border:0;background:transparent;padding:6px 10px;border-radius:8px;cursor:pointer;color:var(--polli-color-text-muted)}
  .toggle button.on{background:var(--polli-color-bg-subtle);color:var(--polli-color-text-strong);font-weight:600}
</style>
<script crossorigin="anonymous" integrity="sha384-DGyLxAyjq0f9SPpVevD6IgztCFlnMF6oW/XQGmfe+IsZ8TqEiDrcHkMLKI6fiB/Z" src="https://unpkg.com/react@18.3.1/umd/react.production.min.js"></script>
<script crossorigin="anonymous" integrity="sha384-gTGxhz21lVGYNMcdJOyq01Edg0jhn/c22nsx0kyqP0TxaV5WVdsSH1fSDUf5YJj1" src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js"></script>
<script src="/index.browser.min.js"></script>
</head>
<body>
<div id="root"></div>
<script>
(function () {
  const UI = window.PollinationsUI;
  const React = window.React, ReactDOM = window.ReactDOM;
  const h = React.createElement;
  const { Surface, StatCard, Chip, Text } = UI;
  const root = ReactDOM.createRoot(document.getElementById("root"));
  const num = (n) => (n || 0).toLocaleString();
  const count = (n, word) => num(n) + " " + word + (n === 1 ? "" : "s");
  let data = null, error = null;

  // Route lives in the hash: #/ , #/area/<name> , #/parent/<number> ; ?days=7|30|90
  function route() {
    const [path, qs] = location.hash.slice(1).split("?");
    const parts = (path || "/").split("/").filter(Boolean).map(decodeURIComponent);
    const days = Number(new URLSearchParams(qs).get("days")) || 30;
    return { view: parts[0] || "overview", key: parts[1], days };
  }
  const link = (view, key, days) => "#/" + (view === "overview" ? "" : view + "/" + encodeURIComponent(key)) + "?days=" + days;

  function stats(items, since) {
    const s = { openIssues: 0, closedIssues: 0, openPrs: 0, mergedPrs: 0, mergedByPeople: 0, commits: 0, lines: 0 };
    for (const i of items) {
      const recent = i.closedAt && Date.parse(i.closedAt) >= since;
      if (i.kind === "issue") {
        if (i.state === "open") s.openIssues++;
        else if (recent) s.closedIssues++;
      } else if (i.state === "open") s.openPrs++;
      else if (i.state === "merged" && recent) {
        s.mergedPrs++;
        if (i.source !== "Agent") s.mergedByPeople++;
        s.commits += i.commits;
        s.lines += i.additions + i.deletions;
      }
    }
    return s;
  }

  function header(r, title, back) {
    return h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 18, flexWrap: "wrap" } },
      h("div", null,
        back ? h("a", { href: back, className: "muted", style: { fontSize: 13 } }, "← All areas") : h(Text, { as: "div", size: "xs", tone: "muted" }, "pollinations/pollinations · Dev board"),
        h("h1", { style: { margin: "4px 0 0", fontSize: 26 } }, title)),
      h("div", { className: "toggle" }, [7, 30, 90].map((d) =>
        h("button", { key: d, className: d === r.days ? "on" : "", onClick: () => { location.hash = link(r.view, r.key, d); } }, d + " days"))));
  }

  function statRow(s) {
    const tile = (label, value) => h(Surface, { variant: "card", className: "polli:p-4" }, h(StatCard, { label, value }));
    return h("div", { className: "grid", style: { gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", marginBottom: 22 } },
      tile("Open issues", num(s.openIssues)), tile("Closed issues", num(s.closedIssues)),
      tile("Open PRs", num(s.openPrs)), tile("Merged PRs", num(s.mergedPrs)),
      tile("Commits", num(s.commits)), tile("Lines changed", num(s.lines)));
  }

  function areaCard(name, s, r) {
    const people = s.mergedByPeople, agents = s.mergedPrs - people, total = Math.max(s.mergedPrs, 1);
    return h("a", { key: name, href: link("area", name, r.days) },
      h(Surface, { variant: "card", className: "polli:p-4 card" },
        h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 } },
          h("b", { style: { fontSize: 15 } }, name),
          h("span", { className: "num", style: { fontSize: 22, fontWeight: 700 } }, num(s.mergedPrs))),
        h(Text, { as: "div", size: "xs", tone: "muted" }, "merged PRs"),
        h("div", { className: "bar", style: { margin: "10px 0" } },
          h("span", { style: { width: (100 * people / total) + "%", background: "var(--polli-color-text-strong)" } }),
          h("span", { style: { width: (100 * agents / total) + "%", background: "var(--polli-color-border)" } })),
        h("div", { className: "num muted", style: { fontSize: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 } },
          h("span", null, count(s.openPrs, "open PR")), h("span", null, count(s.openIssues, "open issue")),
          h("span", null, count(s.closedIssues, "closed issue")), h("span", null, count(s.commits, "commit")))));
  }

  function overview(r, since) {
    const byArea = new Map();
    for (const i of data.items) if (i.area) (byArea.get(i.area) || byArea.set(i.area, []).get(i.area)).push(i);
    const areas = [...byArea].map(([name, list]) => [name, stats(list, since)]).sort((a, b) => b[1].mergedPrs - a[1].mergedPrs || b[1].openIssues - a[1].openIssues);
    return h("div", null, header(r, "Where the effort goes"), statRow(stats(data.items, since)),
      h(Text, { as: "div", size: "xs", tone: "muted", className: "polli:mb-3" }, "Bar: merged PRs by people (dark) and by agents (light)."),
      h("div", { className: "grid" }, areas.map(([name, s]) => areaCard(name, s, r))));
  }

  function itemRow(i, extra) {
    const state = i.kind === "pr" ? i.state : (i.state === "open" ? "open" : "closed");
    return h("a", { key: i.kind + i.number, href: i.url, target: "_blank", rel: "noopener", className: "row" },
      h(Chip, { size: "sm", intent: state === "open" ? "alpha" : "news" }, (i.kind === "pr" ? "PR " : "") + state),
      h("span", { className: "num muted", style: { width: 56 } }, "#" + i.number),
      h("span", { style: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, i.title),
      i.type ? h("span", { className: "muted meta", style: { fontSize: 12 } }, i.type) : null,
      i.priority ? h("span", { className: "muted meta", style: { fontSize: 12, width: 60, textAlign: "right" } }, i.priority) : null,
      extra || null);
  }

  function section(title, children, note) {
    return h(Surface, { variant: "card", className: "polli:p-4", style: { marginBottom: 14 } },
      h("div", { style: { display: "flex", justifyContent: "space-between", marginBottom: 6 } },
        h("b", null, title), note ? h("span", { className: "muted", style: { fontSize: 12 } }, note) : null),
      children.length ? children : h(Text, { as: "div", size: "sm", tone: "muted" }, "Nothing here in this window."));
  }

  // PRs that close an issue, by issue number.
  function prsByIssue() {
    const m = new Map();
    for (const i of data.items) if (i.kind === "pr") for (const n of i.fixes) (m.get(n) || m.set(n, []).get(n)).push(i);
    return m;
  }
  // Everything open, plus issues closed and PRs merged in the window (PRs closed unmerged are left out).
  const relevant = (i, since) => i.state === "open" || (i.closedAt && Date.parse(i.closedAt) >= since && i.state !== "closed") || (i.kind === "issue" && i.state === "closed" && i.closedAt && Date.parse(i.closedAt) >= since);

  function areaView(r, since) {
    const inArea = data.items.filter((i) => i.area === r.key);
    const prs = prsByIssue();
    const parents = new Map();
    for (const i of data.items) {
      if (i.kind !== "issue" || !i.parent || i.parent.state !== "OPEN") continue;
      const parent = data.items.find((p) => p.number === i.parent.number);
      if ((parent ? parent.area : i.area) !== r.key) continue;
      const entry = parents.get(i.parent.number) || parents.set(i.parent.number, { parent: i.parent, children: [] }).get(i.parent.number);
      entry.children.push(i);
    }
    const parentRows = [...parents.values()].map(({ parent, children }) => {
      const done = children.filter((c) => c.state === "closed").length;
      const linked = children.flatMap((c) => prs.get(c.number) || []);
      const open = linked.filter((p) => p.state === "open").length, merged = linked.filter((p) => p.state === "merged").length;
      return h("a", { key: parent.number, href: link("parent", parent.number, r.days), className: "row" },
        h("span", { className: "num muted", style: { width: 56 } }, "#" + parent.number),
        h("span", { style: { flex: 1, minWidth: 0 } }, parent.title),
        h("div", { className: "bar", style: { width: 120 } }, h("span", { style: { width: (100 * done / children.length) + "%", background: "var(--polli-color-text-strong)" } })),
        h("span", { className: "num muted", style: { fontSize: 12, width: 210, textAlign: "right", whiteSpace: "nowrap" } }, done + "/" + children.length + " done · " + open + " open · " + merged + " merged PRs"));
    });
    const underParent = new Set([...parents.values()].flatMap((p) => p.children.map((c) => c.number)));
    const parentNumbers = new Set(parents.keys());
    const issues = inArea.filter((i) => i.kind === "issue" && !underParent.has(i.number) && !parentNumbers.has(i.number) && relevant(i, since));
    const issueNumbers = new Set(data.items.filter((i) => i.kind === "issue").map((i) => i.number));
    const direct = inArea.filter((i) => i.kind === "pr" && relevant(i, since) && !i.fixes.some((n) => issueNumbers.has(n)));
    return h("div", null, header(r, r.key, link("overview", null, r.days)), statRow(stats(inArea, since)),
      section("Parent issues", parentRows),
      section("Other issues", issues.map((i) => itemRow(i)), issues.length + " open or recently closed"),
      section("Direct PRs", direct.map((i) => itemRow(i)), "PRs that close no issue"));
  }

  function parentView(r, since) {
    const number = Number(r.key);
    const parent = data.items.find((i) => i.number === number);
    const children = data.items.filter((i) => i.kind === "issue" && i.parent && i.parent.number === number);
    const prs = prsByIssue();
    const rows = children.flatMap((c) => [itemRow(c), ...(prs.get(c.number) || []).filter((p) => relevant(p, since)).map((p) => h("div", { key: "p" + p.number, style: { paddingLeft: 28 } }, itemRow(p)))]);
    const title = parent ? parent.title : (children[0] && children[0].parent.title) || "#" + number;
    return h("div", null, header(r, title, link("overview", null, r.days)),
      section("Sub-issues and their PRs", rows, children.filter((c) => c.state === "closed").length + "/" + children.length + " done"));
  }

  function render() {
    const r = route();
    const since = Date.now() - r.days * 86400000;
    if (error) return root.render(h(Text, { tone: "muted" }, "Could not load: " + error));
    if (!data) return root.render(h(Text, { tone: "muted" }, "Loading the Dev board…"));
    const body = r.view === "area" ? areaView(r, since) : r.view === "parent" ? parentView(r, since) : overview(r, since);
    root.render(h("div", null, body,
      h(Text, { as: "div", size: "xs", tone: "muted", className: "polli:mt-6" }, "Updated " + new Date(data.fetchedAt).toLocaleString() + " · " + num(data.items.length) + " items")));
  }

  window.addEventListener("hashchange", render);
  render();
  fetch("/data").then((res) => res.json()).then((d) => { if (d.error) error = d.error; else data = d; render(); }).catch((e) => { error = String(e); render(); });
})();
</script>
</body>
</html>`;
