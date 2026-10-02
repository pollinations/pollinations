// Focus — where the team's effort goes, by area. Public, no login.
//   GET /      -> the page (@pollinations/ui browser bundle, served from packages/ui/dist)
//   GET /data  -> Dev project items with an Area, as JSON
// Reads GitHub with GITHUB_TOKEN; the token never reaches the browser.

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
    if (!r.ok || body.errors)
        throw new Error(
            `GitHub ${r.status}: ${JSON.stringify(body.errors || body).slice(0, 300)}`,
        );
    return body.data;
}

async function items(env, q) {
    const out = [];
    let cursor = null;
    do {
        const page = (await github(env, ITEMS, { cursor, q })).organization
            .projectV2.items;
        out.push(...page.nodes);
        cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
    } while (cursor);
    return out;
}

function toItem(node) {
    const c = node.content;
    if (!c || (c.__typename !== "Issue" && c.__typename !== "PullRequest"))
        return null;
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

const AREAS = `{ organization(login: "pollinations") { projectV2(number: 20) {
  field(name: "Area") { ... on ProjectV2SingleSelectField { options { name } } }
} } }`;

// Open and closed items of each area, fetched side by side: a few short page chains instead of one long one.
async function snapshot(env) {
    const areas = (
        await github(env, AREAS)
    ).organization.projectV2.field.options.map((o) => o.name);
    const queries = areas.flatMap((a) => [
        `is:open area:"${a}"`,
        `is:closed area:"${a}"`,
    ]);
    const nodes = (await Promise.all(queries.map((q) => items(env, q)))).flat();
    const byNumber = new Map();
    for (const node of nodes) {
        const item = toItem(node);
        if (item) byNumber.set(item.number, item);
    }
    return { fetchedAt: Date.now(), items: [...byNumber.values()] };
}

let cached = null;
let pending = null;

// Serve the last snapshot right away and refresh it in the background once it is older than CACHE_MS.
async function data(env, ctx) {
    const refresh = () => {
        pending ??= snapshot(env)
            .then((s) => {
                cached = s;
                return s;
            })
            .finally(() => {
                pending = null;
            });
        return pending;
    };
    if (!cached) return refresh();
    if (Date.now() - cached.fetchedAt > CACHE_MS)
        ctx.waitUntil(refresh().catch(() => {}));
    return cached;
}

export default {
    async fetch(request, env, ctx) {
        const { pathname } = new URL(request.url);
        if (pathname === "/")
            return new Response(PAGE, {
                headers: { "Content-Type": "text/html; charset=utf-8" },
            });
        if (pathname === "/data") {
            try {
                return Response.json(await data(env, ctx), {
                    headers: { "Cache-Control": "no-store" },
                });
            } catch (e) {
                return Response.json(
                    { error: String(e.message || e) },
                    { status: 502 },
                );
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
  body{font-family:"Uncut Sans",ui-sans-serif,system-ui,sans-serif;font-size:14px}
  #root{max-width:980px;margin:0 auto;padding:28px 20px 56px}
  a{color:inherit;text-decoration:none}
  button{font:inherit;color:inherit;background:none;border:0;padding:0;cursor:pointer;text-align:left}
  svg{width:16px;height:16px;flex:none}
  .row{display:flex;align-items:center;gap:12px;padding:10px 12px;width:100%;box-sizing:border-box;border-radius:10px}
  .cells{display:grid;grid-template-columns:repeat(4,46px) repeat(4,58px);align-items:center;flex:none}
  .row:hover{background:var(--polli-color-bg-subtle)}
  .grow{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .n{display:inline-flex;align-items:center;gap:4px;font-variant-numeric:tabular-nums;color:var(--polli-color-text-base)}
  .soft{color:var(--polli-color-text-muted)}
  .open{color:#1a7f37}.done{color:#8250df}
  .area{border:1px solid transparent;border-top-color:var(--polli-color-border)}
  .area.on{border-color:var(--polli-color-border);border-radius:14px;background:var(--polli-color-surface-white);margin:6px 0}
  .kids{margin:0 0 8px 34px}
  .kids .row{padding:7px 12px}
  .leaf{margin-left:28px}
  .bar{width:60px;height:6px;border-radius:3px;background:var(--polli-color-bg-subtle);overflow:hidden;flex:none}
  .bar>span{display:block;height:100%;background:#1a7f37}
  .chev{transition:transform .15s;transform:rotate(-90deg)}.on>.row .chev,.chev.on{transform:none}
  .zero{opacity:.35}
  .toggle button{padding:6px 10px;border-radius:8px;color:var(--polli-color-text-muted)}
  .toggle button.sel{background:var(--polli-color-bg-subtle);color:var(--polli-color-text-strong);font-weight:600}
  .legend{display:flex;flex-wrap:wrap;gap:16px;margin-top:22px;font-size:12px}
  .legend span{display:inline-flex;align-items:center;gap:5px}
  @media (max-width:640px){.cells{grid-template-columns:repeat(4,0) repeat(4,46px)}.type{visibility:hidden}}
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
  const root = ReactDOM.createRoot(document.getElementById("root"));
  let data = null, error = null;

  // Icons: @pollinations/ui where it has one, otherwise the same 24px stroke style inline.
  const stroke = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true" };
  const svg = (...d) => (p) => h("svg", Object.assign({}, stroke, p), d.map((x, i) => x.startsWith("c") ? h("circle", { key: i, cx: +x.split(",")[1], cy: +x.split(",")[2], r: +x.split(",")[3] }) : h("path", { key: i, d: x })));
  const I = {
    bug: UI.BugIcon, feature: UI.SparklesIcon,
    task: svg("M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z", "m8 12 3 3 5-6"),
    question: svg("c,12,12,9", "M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6", "M12 17h.01"),
    pr: UI.GitPullRequestIcon, parent: UI.TargetIcon, chevron: UI.ChevronIcon,
    issue: svg("c,12,12,9", "c,12,12,1.5"),
    closed: svg("c,12,12,9", "m8.5 12 2.5 2.5 4.5-5"),
    merged: svg("c,6,5,2", "c,6,19,2", "c,18,12,2", "M6 7v10", "M6 7c0 4 4 5 10 5"),
    stack: svg("m12 3 9 5-9 5-9-5 9-5z", "m3 13 9 5 9-5"),
  };
  const TYPES = [["Bug", "bug"], ["Feature", "feature"], ["Task", "task"], ["Question", "question"]];
  const icon = (name, cls) => h(I[name], { className: cls });
  const n = (name, value, cls, title, col) => h("span", { key: col, className: "n" + (value ? "" : " zero"), title, style: { gridColumn: col } }, icon(name, cls), value || 0);
  const cells = (...children) => h("span", { className: "cells" }, children);

  // Source is the Dev board's field: exactly one per item (set by the project manager).
  const SOURCES = ["All", "Team", "Community", "Agent", "Apps", "Quests"];
  const pick = (source) => (source === "All" ? data.items : data.items.filter((i) => i.source === source));

  // State lives in the hash: #days=30&source=Team&open=Models|p15935
  function state() {
    const p = new URLSearchParams(location.hash.slice(1));
    const source = SOURCES.includes(p.get("source")) ? p.get("source") : "All";
    return { days: Number(p.get("days")) || 30, source, open: new Set((p.get("open") || "").split("|").filter(Boolean)) };
  }
  function setState(s) {
    const p = new URLSearchParams({ days: s.days });
    if (s.source !== "All") p.set("source", s.source);
    if (s.open.size) p.set("open", [...s.open].join("|"));
    location.hash = p.toString();
  }
  const toggle = (key) => { const s = state(); s.open.has(key) ? s.open.delete(key) : s.open.add(key); setState(s); };

  // Open items, plus issues closed and PRs merged inside the window.
  const live = (i, since) => i.state === "open" || ((i.state === "closed" && i.kind === "issue") || i.state === "merged") && Date.parse(i.closedAt) >= since;

  function counts(issues, prs, since) {
    const c = { open: 0, closed: 0, openPrs: 0, merged: 0 };
    for (const [type] of TYPES) c[type] = 0;
    for (const i of issues) if (live(i, since)) { if (i.type in c) c[i.type]++; i.state === "open" ? c.open++ : c.closed++; }
    for (const p of prs) if (live(p, since)) p.state === "open" ? c.openPrs++ : c.merged++;
    return c;
  }
  // Columns 1–4: issue types (empty when zero). 5: open issues, 6: closed issues, 7: open PRs, 8: merged PRs.
  const typeCells = (c) => TYPES.map(([t, name], i) => c[t] ? h("span", { key: t, className: "n soft type", title: t + "s", style: { gridColumn: i + 1 } }, icon(name), c[t]) : null);
  const prCells = (c) => [n("pr", c.openPrs, "open", "Open PRs", 7), n("merged", c.merged, "done", "Merged PRs", 8)];

  function build(since, source) {
    const items = pick(source);
    const byNumber = new Map(items.map((i) => [i.number, i]));
    // A sub-issue, and any PR that closes it, belongs to its parent's area: one area per item on this page.
    const openParent = (i) => (i.parent && i.parent.state === "OPEN" ? i.parent : null);
    const areaOf = (i) => {
      if (i.kind === "pr") {
        const sub = i.fixes.map((k) => byNumber.get(k)).find((x) => x && openParent(x));
        return sub ? areaOf(sub) : i.area;
      }
      const parent = openParent(i) && byNumber.get(i.parent.number);
      return parent ? parent.area : i.area;
    };
    const prsFor = new Map();
    for (const p of items) if (p.kind === "pr") for (const k of p.fixes) (prsFor.get(k) || prsFor.set(k, []).get(k)).push(p);
    const areas = new Map();
    const area = (name) => areas.get(name) || areas.set(name, { name, issues: [], prs: [], parents: new Map(), loose: [] }).get(name);
    for (const i of items) {
      if (i.kind === "pr") { area(areaOf(i)).prs.push(i); continue; }
      area(areaOf(i)).issues.push(i);
      const parent = openParent(i);
      if (parent) {
        const owner = area(areaOf(i));
        (owner.parents.get(parent.number) || owner.parents.set(parent.number, { parent, item: byNumber.get(parent.number), children: [] }).get(parent.number)).children.push(i);
      }
    }
    for (const a of areas.values()) {
      const inParent = new Set([...a.parents.values()].flatMap((p) => p.children.map((c) => c.number)));
      a.loose = a.issues.filter((i) => !inParent.has(i.number) && !a.parents.has(i.number) && live(i, since));
      const parentPrs = new Set([...inParent].flatMap((k) => (prsFor.get(k) || []).map((p) => p.number)));
      a.loosePrs = a.prs.filter((p) => !parentPrs.has(p.number));
      a.c = counts(a.issues, a.prs, since);
    }
    return { areas: [...areas.values()].sort((x, y) => y.c.merged - x.c.merged || y.c.open - x.c.open), prsFor };
  }

  function issueRow(i, prsFor, since) {
    const prs = (prsFor.get(i.number) || []).filter((p) => live(p, since));
    const open = prs.filter((p) => p.state === "open").length, merged = prs.length - open;
    return h("a", { key: i.number, href: i.url, target: "_blank", rel: "noopener", className: "row" },
      icon(i.state === "open" ? "issue" : "closed", i.state === "open" ? "open" : "done"),
      h("span", { className: "grow" + (i.state === "open" ? "" : " soft") }, i.title),
      cells(open ? n("pr", open, "open", "Open PRs", 7) : null, merged ? n("merged", merged, "done", "Merged PRs", 8) : null));
  }

  function parentRow(p, s, prsFor, since) {
    const key = "p" + p.parent.number, on = s.open.has(key);
    const kids = p.children.slice().sort((a, b) => (a.state === "open" ? 0 : 1) - (b.state === "open" ? 0 : 1));
    const summary = p.item && p.item.subIssues;
    const total = summary ? summary.total : kids.length, done = summary ? summary.completed : kids.filter((k) => k.state !== "open").length;
    const c = counts(kids, kids.flatMap((k) => prsFor.get(k.number) || []), since);
    return h("div", { key },
      h("button", { className: "row", onClick: () => toggle(key) },
        icon("chevron", "chev soft" + (on ? " on" : "")), icon("parent", "done"),
        h("span", { className: "grow" }, p.parent.title),
        cells(h("span", { key: "p", style: { gridColumn: "1 / 7", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, paddingRight: 12 }, title: done + " of " + total + " done" },
          h("span", { className: "bar" }, h("span", { style: { width: (total ? 100 * done / total : 0) + "%" } })), h("span", { className: "n soft" }, done + "/" + total)), ...prCells(c))),
      on ? h("div", { className: "leaf" }, kids.map((k) => issueRow(k, prsFor, since))) : null);
  }

  function looseRow(a, s, prsFor, since) {
    const key = "l" + a.name, on = s.open.has(key);
    if (!a.loose.length && !a.loosePrs.some((p) => live(p, since))) return null;
    return h("div", { key },
      h("button", { className: "row", onClick: () => toggle(key) },
        icon("chevron", "chev soft" + (on ? " on" : "")), icon("stack", "soft"),
        h("span", { className: "grow soft" }, "No parent"), (() => { const c = counts(a.loose, a.loosePrs, since); return cells(n("issue", c.open, "open", "Open issues", 5), ...prCells(c)); })()),
      on ? h("div", { className: "leaf" }, a.loose.map((i) => issueRow(i, prsFor, since))) : null);
  }

  function areaBlock(a, s, prsFor, since) {
    const on = s.open.has(a.name);
    return h("div", { key: a.name, className: "area" + (on ? " on" : "") },
      h("button", { className: "row", onClick: () => toggle(a.name) },
        icon("chevron", "chev soft"), h("b", { className: "grow" }, a.name),
        cells(...typeCells(a.c), n("issue", a.c.open, "open", "Open issues", 5), n("closed", a.c.closed, "done", "Closed issues", 6), ...prCells(a.c))),
      on ? h("div", { className: "kids" }, [...a.parents.values()].map((p) => parentRow(p, s, prsFor, since)), looseRow(a, s, prsFor, since)) : null);
  }

  const legend = () => h("div", { className: "legend soft" },
    [["bug", "Bug"], ["feature", "Feature"], ["task", "Task"], ["question", "Question"], ["parent", "Parent issue", "done"], ["issue", "Open issue", "open"], ["closed", "Closed issue", "done"], ["pr", "Open PR", "open"], ["merged", "Merged PR", "done"]]
      .map(([name, label, cls]) => h("span", { key: name }, icon(name, cls), label)));

  function render() {
    if (error) return root.render(h("p", { className: "soft" }, "Could not load: " + error));
    if (!data) return root.render(h("p", { className: "soft" }, "Loading the Dev board from GitHub…"));
    const s = state(), since = Date.now() - s.days * 86400000;
    const { areas, prsFor } = build(since, s.source);
    root.render(h("div", null,
      h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 12, flexWrap: "wrap" } },
        h("h1", { style: { margin: 0, fontSize: 24 } }, "Where the effort goes"),
        h("div", { style: { display: "flex", gap: 16, flexWrap: "wrap" } },
          h("div", { className: "toggle" }, SOURCES.map((x) => h("button", { key: x, className: x === s.source ? "sel" : "", onClick: () => setState(Object.assign(s, { source: x })) }, x))),
          h("div", { className: "toggle" }, [7, 30, 90].map((d) => h("button", { key: d, className: d === s.days ? "sel" : "", onClick: () => setState(Object.assign(s, { days: d })) }, d + "d"))))),
      areas.map((a) => areaBlock(a, s, prsFor, since)),
      legend(),
      h("p", { className: "soft", style: { fontSize: 12, marginTop: 10 } }, "Updated " + new Date(data.fetchedAt).toLocaleString())));
  }

  window.addEventListener("hashchange", render);
  render();
  fetch("/data").then((r) => r.json()).then((d) => { if (d.error) error = d.error; else data = d; render(); }).catch((e) => { error = String(e); render(); });
})();
</script>
</body>
</html>`;
