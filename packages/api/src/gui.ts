// The single-page GUI (M6), inlined so it ships in dist with no asset paths.
// Read-only Marvin-style funnel + Sunsama-style day-plan + flags + explain.

export const INDEX_HTML = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Caius</title>
<style>
  :root {
    --bg: #0e1116; --panel: #161b22; --panel2: #1c2330; --line: #2a3340;
    --ink: #e6edf3; --dim: #8b97a7; --accent: #5aa9ff; --warn: #ffb454;
    --over: #ff6b6b; --now: #3fb950; --good: #3fb950;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink);
    font: 14px/1.45 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
  header { padding: 14px 20px; border-bottom: 1px solid var(--line);
    display: flex; align-items: baseline; gap: 16px; flex-wrap: wrap; }
  header h1 { font-size: 18px; margin: 0; letter-spacing: .5px; }
  header .vault { color: var(--dim); font-size: 12px; font-family: ui-monospace, monospace; }
  header .stats { margin-left: auto; color: var(--dim); font-size: 12px; }
  header .stats b { color: var(--ink); }
  main { padding: 16px 20px 60px; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: var(--dim);
    margin: 22px 0 10px; }
  .funnel { display: flex; gap: 12px; overflow-x: auto; padding-bottom: 4px; }
  .lane { flex: 0 0 220px; background: var(--panel); border: 1px solid var(--line);
    border-radius: 10px; padding: 10px; max-height: 62vh; display: flex; flex-direction: column; }
  .lane h3 { margin: 0 0 8px; font-size: 12px; text-transform: uppercase; letter-spacing: .6px;
    display: flex; align-items: center; gap: 8px; color: var(--dim); }
  .lane[data-lane="now"] h3 { color: var(--now); }
  .lane[data-lane="overdue"] h3 { color: var(--over); }
  .lane .badge { margin-left: auto; background: var(--panel2); color: var(--ink);
    border-radius: 999px; padding: 1px 9px; font-size: 12px; }
  .cards { overflow-y: auto; display: flex; flex-direction: column; gap: 7px; }
  .task { background: var(--panel2); border: 1px solid var(--line); border-left: 3px solid var(--line);
    border-radius: 7px; padding: 8px 9px; cursor: pointer; }
  .task:hover { border-color: var(--accent); }
  .task[data-state="in_progress"] { border-left-color: var(--now); }
  .task .t { font-size: 13px; }
  .task .meta { color: var(--dim); font-size: 11px; margin-top: 4px; display: flex; gap: 8px; flex-wrap: wrap; }
  .task .proj { color: var(--accent); }
  .empty { color: var(--dim); font-size: 12px; font-style: italic; padding: 6px 2px; }
  .grid { display: grid; grid-template-columns: 2fr 1fr; gap: 16px; align-items: start; }
  .panel { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 14px; }
  .cap { height: 10px; background: var(--panel2); border-radius: 999px; overflow: hidden; margin: 8px 0; }
  .cap > span { display: block; height: 100%; background: var(--good); }
  .cap.over > span { background: var(--over); }
  #explain .row { display: flex; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--line); }
  #explain .axis { color: var(--dim); width: 70px; flex: 0 0 70px; text-transform: capitalize; }
  #explain .val { font-weight: 600; }
  #explain .src { color: var(--dim); font-size: 12px; }
  .flag { display: flex; gap: 8px; align-items: center; padding: 5px 0; }
  .pill { font-size: 11px; padding: 1px 7px; border-radius: 999px; background: var(--panel2); }
  .pill.warn { color: var(--warn); } .pill.info { color: var(--accent); } .pill.error { color: var(--over); }
  .ok { color: var(--good); }
</style>
</head>
<body>
<header>
  <h1>Caius</h1>
  <span class="vault" data-testid="vault"></span>
  <span class="stats" data-testid="stats"></span>
</header>
<main>
  <h2>Funnel</h2>
  <div class="funnel" id="funnel" data-testid="funnel"></div>

  <div class="grid">
    <div>
      <h2>Day plan — today</h2>
      <div class="panel" id="dayplan" data-testid="dayplan"></div>
    </div>
    <div>
      <h2>Explain</h2>
      <div class="panel" id="explain" data-testid="explain"><div class="empty">Click a task to see why.</div></div>
      <h2>Integrity flags</h2>
      <div class="panel" id="flags" data-testid="flags"></div>
    </div>
  </div>
</main>
<script>
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const get = (u) => fetch(u).then((r) => r.json());

function taskCard(t) {
  const meta = [];
  if (t.project) meta.push('<span class="proj">' + esc(t.project) + '</span>');
  if (t.estMinutes != null) meta.push('~' + t.estMinutes + 'm');
  if (t.importance) meta.push('!'.repeat(t.importance));
  meta.push('<span>' + esc(t.file.split('/').pop()) + ':' + (t.line + 1) + '</span>');
  return '<div class="task" data-rowid="' + t.rowid + '" data-state="' + t.state + '" onclick="showExplain(' + t.rowid + ')">'
    + '<div class="t">' + esc(t.text || '(untitled)') + '</div>'
    + '<div class="meta">' + meta.join('') + '</div></div>';
}

function lane(name, tasks, key) {
  const cards = tasks.length ? tasks.map(taskCard).join('') : '<div class="empty">empty</div>';
  return '<div class="lane" data-lane="' + key + '">'
    + '<h3>' + esc(name) + '<span class="badge" data-testid="lane-count">' + tasks.length + '</span></h3>'
    + '<div class="cards">' + cards + '</div></div>';
}

async function load() {
  const [summary, fun, plan, flags] = await Promise.all([
    get('/api/summary'), get('/api/funnel'), get('/api/day-plan'), get('/api/flags'),
  ]);
  $('[data-testid=vault]').textContent = summary.vault;
  $('[data-testid=stats]').innerHTML = '<b>' + summary.report.fileCount + '</b> files · <b>'
    + summary.report.taskCount + '</b> tasks · <b>' + summary.report.liveCount + '</b> live';

  let html = lane('Now', fun.now, 'now');
  for (const l of fun.lanes) html += lane(l.horizon.replace('_', ' '), l.tasks, l.horizon);
  $('#funnel').innerHTML = html;

  const pct = plan.capacityMinutes ? Math.min(100, Math.round(100 * plan.estimatedMinutes / plan.capacityMinutes)) : 0;
  const over = plan.estimatedMinutes > plan.capacityMinutes;
  let dp = '<div data-testid="plan-capacity">' + plan.estimatedMinutes + ' / ' + plan.capacityMinutes
    + ' min estimated' + (plan.unestimated.length ? ' · ' + plan.unestimated.length + ' unestimated' : '') + '</div>'
    + '<div class="cap ' + (over ? 'over' : '') + '"><span style="width:' + pct + '%"></span></div>';
  if (!plan.tasks.length) dp += '<div class="empty">No live tasks scheduled for today.</div>';
  for (const g of plan.byProject) {
    dp += '<div style="margin-top:10px"><div class="meta" style="color:var(--dim);margin-bottom:4px">'
      + esc(g.project || 'no project') + '</div>' + g.tasks.map(taskCard).join('') + '</div>';
  }
  $('#dayplan').innerHTML = dp;

  $('#flags').innerHTML = flags.length
    ? flags.map((f) => '<div class="flag"><span class="pill ' + f.severity + '">' + f.severity
        + '</span> ' + esc(f.kind) + ' <span class="badge">' + f.count + '</span></div>').join('')
    : '<div class="ok" data-testid="flags-ok">No integrity flags ✓</div>';
}

window.showExplain = async function (rowid) {
  const e = await get('/api/explain?rowid=' + rowid);
  if (!e) return;
  const rows = e.derivations.map((d) => '<div class="row"><span class="axis">' + esc(d.axis)
    + '</span><div><div class="val">' + esc(d.value ?? 'null') + '</div><div class="src">'
    + esc(d.rule) + ' — ' + esc(d.source) + '</div></div></div>').join('');
  $('#explain').innerHTML = '<div style="margin-bottom:8px">' + esc(e.task.text) + '</div>'
    + (rows || '<div class="empty">No derivations.</div>');
};

load();
</script>
</body>
</html>`;
