#!/usr/bin/env python3
"""Local, serial, one-stage hospital driver. No GitHub writes."""
import argparse, datetime as dt, fcntl, json, os, pathlib, re, shlex, signal, subprocess, sys, time
ROOT = pathlib.Path(__file__).resolve().parent
REPO = pathlib.Path.home() / 'pollinations'
TERMINAL = {'discharged', 'escalated', 'circuit-broken', 'changes-requested'}
STAGES = ['workup', 'plan-review', 'implement', 'review', 'discharge']
ROLES = {'implement': 'fellow', 'plan-review': 'review-attending', 'review': 'review-attending'}
POLL = 10
STAGE_SECONDS = 600

def now(): return dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%d %H:%M:%S')
def save(p, x): p.write_text(json.dumps(x, indent=2) + '\n')
def git(*args): return subprocess.check_output(['git', '-C', str(REPO), *args], text=True).strip()
def note(folder, tag, body):
    with (folder / 'CHART.md').open('a') as f: f.write(f'\n<!-- HOSPITAL:{tag} -->\n{now()} UTC\n\n{body}\n')

# run.json stays local (gitignored): the run's start, limits and key IDs.
def config(): return json.loads((ROOT / 'run.json').read_text())

def usage():
    raw = subprocess.check_output(['polli', 'usage', '--history', '--json', '--limit', '200'], text=True, timeout=25)
    rows = json.loads(raw)
    if not isinstance(rows, list): raise RuntimeError('Unrecognized usage response; fail closed')
    ledger = ROOT / 'usage-ledger.json'
    existing = json.loads(ledger.read_text()) if ledger.exists() else {}
    for r in rows: existing[r['cursor_event_id']] = r
    save(ledger, existing)
    return list(existing.values())

def costs(rows, keys, start, end=None):
    """Cost per role label of the run's keys. Matches key IDs: key names repeat across sandboxes."""
    result = {}
    for r in rows:
        label = keys.get(r.get('api_key_id'))
        if label and r['timestamp'] >= start and (end is None or r['timestamp'] <= end):
            result[label] = result.get(label, 0) + float(r.get('cost_usd', 0))
    return result

def run_test(cmd):
    """Runs one test command and keeps its raw output: the only test evidence the driver accepts."""
    folder = pathlib.Path(os.environ['HOSPITAL_CASE']) / 'tests'
    stage = os.environ['HOSPITAL_STAGE']
    folder.mkdir(exist_ok=True)
    log = folder / f'{stage}-{len(list(folder.glob(f"{stage}-*.log"))) + 1}.log'
    with log.open('w') as f:
        f.write(f'$ cd {os.getcwd()} && {shlex.join(cmd)}\n')
        f.flush()
        code = subprocess.run(cmd, stdout=f, stderr=subprocess.STDOUT).returncode
        f.write(f'\nexit {code}\n')
    print(f'[full log: {log}]\n' + log.read_text()[-6000:])
    return code

def exit_codes(folder, stage):
    found = (re.search(r'\nexit (-?\d+)\n$', p.read_text()) for p in (folder / 'tests').glob(f'{stage}-*.log'))
    return [int(m.group(1)) for m in found if m]

def missing_evidence(folder, stage):
    codes = exit_codes(folder, stage)
    if stage == 'implement' and 0 not in codes: return 'no passing run-test log'
    if stage == 'review' and not (0 in codes and any(codes)): return 'no red and green run-test logs'

def verdict(body):
    found = re.findall(r'^\W*VERDICT:\s*(APPROVE|REWORK|ESCALATE|CHANGES)\b', body, re.M)
    return found[-1] if found else None

def role_cmd(role, prompt, output):
    if role == 'review-attending':
        return ['codex', 'exec', '--model', 'openai/gpt-6-astra', '--dangerously-bypass-approvals-and-sandbox', '-C', str(REPO), '-o', str(output), prompt]
    # Only the tools a role needs: no subagents or web access, and a smaller prompt.
    return ['claude', '-p', '--settings', str(pathlib.Path.home() / '.pollinations/claude-code.json'), '--model', 'anthropic/claude-opus-5.5',
            '--tools', 'Bash,Read,Edit,Write,Grep,Glob', '--dangerously-skip-permissions', prompt]

def close(folder, state, outcome, reason, keys):
    state.update(outcome=outcome, end=now())
    note(folder, 'HANDOFF' if outcome != 'discharged' else 'CLOSED', reason)
    state['cost_by_role'] = costs(usage(), keys, state['start'], state['end'])
    save(folder / 'state.json', state)

def main():
    if sys.argv[1:2] == ['run-test']:
        raise SystemExit(run_test(sys.argv[3:] if sys.argv[2:3] == ['--'] else sys.argv[2:]))
    p = argparse.ArgumentParser()
    p.add_argument('action', choices=['admit', *STAGES, 'status', 'close'])
    p.add_argument('number', nargs='?', type=int)
    p.add_argument('--kind', choices=['bug', 'feature', 'pr'])
    p.add_argument('--reason')
    a = p.parse_args()
    lock = (ROOT / '.lock').open('w')
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    run = config()
    keys = run['keys']
    rows = usage()
    total = sum(costs(rows, keys, run['start']).values())
    print(f'Run billed so far: {total:.6f} Pollen', flush=True)
    if a.action == 'status':
        for path in sorted((ROOT / 'cases').glob('*/state.json')):
            s = json.loads(path.read_text()); print(s['number'], s['outcome'], costs(rows, keys, s['start'], s.get('end')))
        return
    folder = ROOT / 'cases' / str(a.number)
    if a.action == 'admit':
        if total >= run['trial_limit']: raise SystemExit('Trial cost stop')
        if len(list((ROOT/'cases').glob('*/state.json'))) >= run['max_cases']: raise SystemExit('Case count stop')
        if any(json.loads(x.read_text())['outcome'] not in TERMINAL for x in (ROOT/'cases').glob('*/state.json')): raise SystemExit('Close active case first')
        if folder.exists() or git('status','--porcelain'): raise SystemExit('Existing case or dirty repository')
        source = next(x for x in json.loads((ROOT/'cache'/'issues.json').read_text()) if x['number']==a.number)
        if source['state'] != 'open' or any(x['name']=='POLLEN-QUEST' for x in source['labels']): raise SystemExit('Ineligible case')
        # Run 1's triage missed an open PR that already fixed its issue.
        related = [f"{x['html_url']} {x['title']}" for x in json.loads((ROOT/'cache'/'pulls.json').read_text())
                   if x['number'] != a.number and re.search(rf'#{a.number}\b', f"{x['title']} {x.get('body') or ''}")]
        folder.mkdir(parents=True)
        save(folder/'source.json',source)
        git('switch','-c',f'hospital/{a.number}','origin/main')
        s = dict(number=a.number, kind=a.kind, start=now(), base=git('rev-parse','HEAD'), outcome='active', next='workup', reworks=0)
        save(folder/'state.json',s)
        (folder/'CHART.md').write_text((ROOT/'chart-template.md').read_text().replace('{{number}}',str(a.number)))
        note(folder,'ADMISSION',f"Kind: {a.kind}\nStart: {s['start']} UTC\nBranch: hospital/{a.number}\nBase: {s['base']}\nSource: {source['html_url']}\n{source['title']}\nOpen PRs that mention this case: {', '.join(related) or 'none in cache'}")
        return
    s = json.loads((folder/'state.json').read_text())
    if s['outcome'] in TERMINAL: raise SystemExit('Case already closed')
    if a.action == 'close':
        close(folder,s,'escalated','Precedents checked: P1-P3. I-PASS: stable local work; '+(a.reason or 'Manual stop')+'; action: maintainer resolves blocker; no merge approval; receiver must restate handoff.',keys)
        return
    casecost = sum(costs(rows,keys,s['start']).values())
    if total >= run['trial_limit'] or casecost >= run['case_limit']:
        close(folder,s,'escalated','Precedents checked P2. I-PASS: budget stop; preserve branch; no further models; maintainer may resume under a new budget.',keys); return
    if a.action != s['next']: raise SystemExit(f"Expected stage {s['next']}")
    if git('branch','--show-current') != f'hospital/{a.number}': raise SystemExit('Wrong branch')
    role = ROLES.get(a.action, a.action)
    prompt = f'''You are running exactly one hospital stage: {a.action}. Read {ROOT}/PROTOCOL.md, {ROOT}/roles/{role}.md, {folder}/CHART.md, {folder}/source.json, and {ROOT}/PRECEDENTS.md. Repo: {REPO}. Base commit: {s['base']}. Kind: {s['kind']}. Cached GitHub data: {ROOT}/cache/ (a PR's diff is pr-<number>.diff). Test logs so far: {folder}/tests/.
Run every test command through `python3 {ROOT}/hospital.py run-test -- <command>` from the directory it needs. Its logs are the only test evidence the driver and discharge accept.
Do not spawn agents or call another model. No external writes, secrets, live APIs, installs, full test suites. Work only in the current hospital branch. Do not modify hospital records; print your note as final output. Keep it under 700 words, with concrete evidence and a final standalone line VERDICT: APPROVE, VERDICT: REWORK, or VERDICT: ESCALATE. In a PR case, VERDICT: CHANGES ends the case when the PR's own diff must change before merge; REWORK is only for the hospital's plan or implementation. You have a small billed budget: aim for about 15 tool calls, and read only the lines you need. If verification needs live services or production data, or you cannot conclude within that scope, stop and escalate with what you found; a stage killed at its time limit loses its note. No user questions: unresolved blockers get I-PASS. Do not commit; driver preserves work. For PR case, implementation means applying the cached PR diff after approved plan, not inventing a different fix.'''
    attempt = len(list(folder.glob(f'{a.action}-*.log'))) + 1
    log = folder/f'{a.action}-{attempt}.log'
    output = folder/f'{a.action}-{attempt}.md'
    (folder/f'{a.action}-{attempt}.prompt').write_text(prompt)
    env = {**os.environ, 'HOSPITAL_CASE': str(folder), 'HOSPITAL_STAGE': a.action}
    before = git('diff',s['base'])
    with log.open('w') as f:
        proc = subprocess.Popen(role_cmd(role,prompt,output),cwd=REPO,env=env,stdout=f,stderr=subprocess.STDOUT,start_new_session=True)
        started = time.monotonic(); stop = None
        while proc.poll() is None:
            time.sleep(POLL)
            try:
                rows = usage()
                if sum(costs(rows,keys,s['start']).values()) >= run['case_limit']: stop=f"Case exceeded {run['case_limit']} Pollen"
                if sum(costs(rows,keys,run['start']).values()) >= run['trial_limit']: stop=f"Run exceeded {run['trial_limit']} Pollen"
            except Exception: stop='Usage unavailable: fail closed'
            if time.monotonic()-started > STAGE_SECONDS: stop=f'Stage exceeded {STAGE_SECONDS} s; no flailing'
            if stop:
                os.killpg(proc.pid,signal.SIGTERM)
                try: proc.wait(timeout=10)
                except subprocess.TimeoutExpired: os.killpg(proc.pid,signal.SIGKILL); proc.wait()
                break
    if role != 'review-attending': output.write_text(log.read_text())
    body = output.read_text() if output.exists() else 'Missing final note'
    note(folder,a.action.upper().replace('-','_'),body)
    if stop or proc.returncode != 0:
        close(folder,s,'escalated','Precedents checked P1-P3. I-PASS: stage stopped; '+(stop or f'runner exit {proc.returncode}')+'; inspect stage log; preserve branch; receiver must restate blocker.',keys); return
    if a.action in ['workup','plan-review','discharge'] and (git('diff',s['base']) != before or git('ls-files','--others','--exclude-standard')):
        close(folder,s,'escalated','Precedents checked P1. I-PASS: unauthorized code before gate or during audit; inspect diff; do not merge.',keys); return
    v = verdict(body)
    if v == 'ESCALATE':
        close(folder,s,'escalated',body,keys); return
    if v == 'CHANGES' and s['kind'] == 'pr':
        # The hospital never rewrites a contributor's diff: blockers in it go back to the PR author.
        close(folder,s,'changes-requested',body,keys); return
    if v == 'REWORK':
        s['reworks'] += 1
        if s['reworks'] >= 2:
            close(folder,s,'circuit-broken','Precedents checked P3. Two rework requests; '+body,keys); return
        s['next'] = 'workup' if a.action in ['workup','plan-review'] else 'implement'
    elif v == 'APPROVE':
        if a.action in ['implement','review']:
            gap = missing_evidence(folder,a.action)
            if gap:
                close(folder,s,'escalated',f'Precedents checked P3. I-PASS: approval without test evidence ({gap}); see {folder}/tests/.',keys); return
            git('add','-A')
            lines = sum(int(n) for line in git('diff','--cached','--numstat',s['base']).splitlines() for n in line.split('\t')[:2] if n.isdigit())
            if lines > 1000:
                close(folder,s,'escalated','Precedents checked P1. I-PASS: >1,000 lines; decompose into local child cases with dependency graph before continuing.',keys); return
            if git('diff','--cached','--name-only'):
                git('-c','user.name=Hospital Dry Run','-c','user.email=hospital@localhost','commit','-m',f'hospital: {a.action} case {a.number}')
        if a.action == 'discharge':
            close(folder,s,'discharged','Local dry-run discharge only. Audit passed; nothing published.',keys); return
        s['next'] = STAGES[STAGES.index(a.action)+1]
    else:
        close(folder,s,'escalated','Precedents checked P1. I-PASS: missing structured verdict; inspect record; no automatic retry.',keys); return
    save(folder/'state.json',s)
    print(f"Next: {s['next']}")
if __name__ == '__main__': main()
