#!/usr/bin/env python3
"""Local, serial, one-stage hospital driver. No GitHub writes."""
import argparse, datetime as dt, fcntl, json, os, pathlib, signal, subprocess, time
ROOT = pathlib.Path(__file__).resolve().parent
REPO = pathlib.Path.home() / 'pollinations'
TERMINAL = {'discharged', 'escalated', 'circuit-broken'}
STAGES = ['triage', 'plan', 'plan-review', 'implement', 'review', 'discharge']

def now(): return dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%d %H:%M:%S')
def save(p, x): p.write_text(json.dumps(x, indent=2) + '\n')
def git(*args): return subprocess.check_output(['git', '-C', str(REPO), *args], text=True).strip()
def note(folder, tag, body):
    with (folder / 'CHART.md').open('a') as f: f.write(f'\n<!-- HOSPITAL:{tag} -->\n{now()} UTC\n\n{body}\n')

def usage():
    raw = subprocess.check_output(['polli', 'usage', '--history', '--json', '--limit', '200'], text=True, timeout=25)
    rows = json.loads(raw)
    if not isinstance(rows, list): raise RuntimeError('Unrecognized usage response; fail closed')
    ledger = ROOT / 'usage-ledger.json'
    existing = json.loads(ledger.read_text()) if ledger.exists() else {}
    for r in rows: existing[r['cursor_event_id']] = r
    save(ledger, existing)
    save(ROOT / 'usage-latest.json', rows)
    return list(existing.values())

def costs(rows, start, end=None):
    result = {}
    for r in rows:
        if r['timestamp'] >= start and (end is None or r['timestamp'] <= end):
            key = r.get('api_key', 'unknown')
            result[key] = result.get(key, 0) + float(r.get('cost_usd', 0))
    return result

def close(folder, state, outcome, reason):
    state.update(outcome=outcome, end=now())
    note(folder, 'HANDOFF' if outcome != 'discharged' else 'CLOSED', reason)
    state['cost_by_key'] = costs(usage(), state['start'], state['end'])
    save(folder / 'state.json', state)

def main():
    p = argparse.ArgumentParser()
    p.add_argument('action', choices=['admit', *STAGES, 'status', 'close'])
    p.add_argument('number', nargs='?', type=int)
    p.add_argument('--kind', choices=['bug', 'feature', 'pr'])
    p.add_argument('--reason')
    a = p.parse_args()
    lock = (ROOT / '.lock').open('w')
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    rows = usage()
    total = sum(costs(rows, '2026-10-11 17:56:00').values())
    print(f'Trial billed so far: {total:.6f} Pollen', flush=True)
    if a.action == 'status':
        for path in sorted((ROOT / 'cases').glob('*/state.json')):
            s = json.loads(path.read_text()); print(s['number'], s['outcome'], costs(rows,s['start'],s.get('end')))
        return
    folder = ROOT / 'cases' / str(a.number)
    if a.action == 'admit':
        if total >= 15: raise SystemExit('Trial cost stop')
        if len(list((ROOT/'cases').glob('*/state.json'))) >= 5: raise SystemExit('Five-case stop')
        if any(json.loads(x.read_text())['outcome'] not in TERMINAL for x in (ROOT/'cases').glob('*/state.json')): raise SystemExit('Close active case first')
        if folder.exists() or git('status','--porcelain'): raise SystemExit('Existing case or dirty repository')
        source = next(x for x in json.loads((ROOT/'cache'/'issues.json').read_text()) if x['number']==a.number)
        if source['state'] != 'open' or any(x['name']=='POLLEN-QUEST' for x in source['labels']): raise SystemExit('Ineligible case')
        folder.mkdir()
        save(folder/'source.json',source)
        git('switch','-c',f'hospital/{a.number}','origin/main')
        s = dict(number=a.number, kind=a.kind, start=now(), base=git('rev-parse','HEAD'), outcome='active', next='triage', reworks=0)
        save(folder/'state.json',s)
        (folder/'CHART.md').write_text((ROOT/'chart-template.md').read_text().replace('{{number}}',str(a.number)))
        note(folder,'ADMISSION',f"Kind: {a.kind}\nStart: {s['start']} UTC\nBranch: hospital/{a.number}\nBase: {s['base']}\nSource: {source['html_url']}\n{source['title']}")
        return
    s = json.loads((folder/'state.json').read_text())
    if s['outcome'] in TERMINAL: raise SystemExit('Case already closed')
    if a.action == 'close':
        close(folder,s,'escalated','Precedents checked: P1-P3. I-PASS: stable local work; '+(a.reason or 'Manual stop')+'; action: maintainer resolves blocker; no merge approval; receiver must restate handoff.')
        return
    casecost = sum(costs(rows,s['start']).values())
    if total >= 15 or casecost >= 3:
        close(folder,s,'escalated','Precedents checked P2. I-PASS: budget stop; preserve branch; no further models; maintainer may resume under a new budget.'); return
    if a.action != s['next']: raise SystemExit(f"Expected stage {s['next']}")
    if git('branch','--show-current') != f'hospital/{a.number}': raise SystemExit('Wrong branch')
    role = {'plan':'fellow','implement':'fellow','plan-review':'review-attending','review':'review-attending'}.get(a.action,a.action)
    prompt = f'''You are running exactly one hospital stage: {a.action}. Read {ROOT}/PROTOCOL.md, {ROOT}/roles/{role}.md, {folder}/CHART.md, {folder}/source.json, and {ROOT}/PRECEDENTS.md. Repo: {REPO}. Base commit: {s['base']}. Kind: {s['kind']}.
Do not spawn agents or call another model. No external writes, secrets, live APIs, installs, full test suites. Work only in the current hospital branch. Do not modify hospital records; print your note as final output. Keep it under 700 words, with concrete evidence and a final standalone line VERDICT: APPROVE, VERDICT: REWORK, or VERDICT: ESCALATE. You have a small billed budget; be focused. No user questions: unresolved blockers get I-PASS. Tests/logs may be written under {folder}. Do not commit; driver preserves work. For PR case, implementation means applying the cached PR diff after approved plan, not inventing a different fix.'''
    attempt = len(list(folder.glob(f'{a.action}-*.log'))) + 1
    log = folder/f'{a.action}-{attempt}.log'
    output = folder/f'{a.action}-{attempt}.md'
    (folder/f'{a.action}-{attempt}.prompt').write_text(prompt)
    if role == 'review-attending':
        cmd = ['codex','exec','--model','openai/gpt-6-astra','--dangerously-bypass-approvals-and-sandbox','-C',str(REPO),'-o',str(output),prompt]
    else:
        cmd = ['claude','-p','--settings',str(pathlib.Path.home()/'.pollinations/claude-code.json'),'--model','anthropic/claude-opus-5.5','--dangerously-skip-permissions',prompt]
    before = git('diff',s['base'])
    with log.open('w') as f:
        proc = subprocess.Popen(cmd,cwd=REPO,stdout=f,stderr=subprocess.STDOUT,start_new_session=True)
        started = time.monotonic(); stop = None
        while proc.poll() is None:
            time.sleep(10)
            try:
                rows = usage()
                if sum(costs(rows,s['start']).values()) >= 3: stop='Case exceeded 3 Pollen'
                if sum(costs(rows,'2026-10-11 17:56:00').values()) >= 15: stop='Trial exceeded 15 Pollen'
            except Exception: stop='Usage unavailable: fail closed'
            if time.monotonic()-started > 420: stop='Stage exceeded seven minutes; no flailing'
            if stop:
                os.killpg(proc.pid,signal.SIGTERM)
                try: proc.wait(timeout=10)
                except subprocess.TimeoutExpired: os.killpg(proc.pid,signal.SIGKILL); proc.wait()
                break
    if role != 'review-attending': output.write_text(log.read_text())
    body = output.read_text() if output.exists() else 'Missing final note'
    note(folder,a.action.upper().replace('-','_'),body)
    if stop or proc.returncode != 0:
        close(folder,s,'escalated','Precedents checked P1-P3. I-PASS: stage stopped; '+(stop or f'runner exit {proc.returncode}')+'; inspect stage log; preserve branch; receiver must restate blocker.'); return
    if a.action in ['triage','plan','plan-review','discharge'] and (git('diff',s['base']) != before or git('ls-files','--others','--exclude-standard')):
        close(folder,s,'escalated','Precedents checked P1. I-PASS: unauthorized code before gate or during audit; inspect diff; do not merge.'); return
    if 'VERDICT: ESCALATE' in body:
        close(folder,s,'escalated',body); return
    if 'VERDICT: REWORK' in body:
        s['reworks'] += 1
        if s['reworks'] >= 2:
            close(folder,s,'circuit-broken','Precedents checked P3. Two rework requests; '+body); return
        s['next'] = 'plan' if a.action in ['triage','plan','plan-review'] else 'implement'
    elif 'VERDICT: APPROVE' in body:
        if a.action in ['implement','review']:
            git('add','-A')
            lines = sum(int(n) for line in git('diff','--numstat',s['base']).splitlines() for n in line.split('\t')[:2] if n.isdigit())
            if lines > 1000:
                close(folder,s,'escalated','Precedents checked P1. I-PASS: >1,000 lines; decompose into local child cases with dependency graph before continuing.'); return
            if git('diff','--cached','--name-only'):
                git('-c','user.name=Hospital Dry Run','-c','user.email=hospital@localhost','commit','-m',f'hospital: {a.action} case {a.number}')
        if a.action == 'discharge':
            close(folder,s,'discharged','Local dry-run discharge only. Audit passed; nothing published.'); return
        s['next'] = STAGES[STAGES.index(a.action)+1]
    else:
        close(folder,s,'escalated','Precedents checked P1. I-PASS: missing structured verdict; inspect record; no automatic retry.'); return
    save(folder/'state.json',s)
    print(f"Next: {s['next']}")
if __name__ == '__main__': main()
