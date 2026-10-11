"""Offline checks of the driver: cost accounting, gates, and a full case run with a stub model."""
import json
import pathlib
import subprocess
import sys
import tempfile
from unittest.mock import patch
import hospital as h

HERE = pathlib.Path(__file__).resolve().parent
KEYS = {'id-claude': 'claude', 'id-codex': 'codex'}
RUN = dict(start='2026-10-11 18:00:00', keys=KEYS, case_limit=3, trial_limit=10, max_cases=2)

# A stub for both models. It prints a note ending in a verdict, and in the
# implement and review stages edits the repo and runs tests through run-test.
FAKE = '''import os, pathlib, subprocess, sys
hospital, output, mode = sys.argv[1:4]
stage = os.environ['HOSPITAL_STAGE']
def test(code): subprocess.run([sys.executable, hospital, 'run-test', '--', sys.executable, '-c', f'raise SystemExit({code})'])
if stage == 'implement':
    pathlib.Path('fix.txt').write_text('fixed\\n')
    if mode != 'untested': test(0)
if stage == 'review': test(1); test(0)
note = f'{stage} note\\n**VERDICT: ' + ('CHANGES' if stage == mode else 'APPROVE') + '**\\n'
pathlib.Path(output).write_text(note)
print(note)
'''

def git(repo, *args): subprocess.run(['git', '-C', str(repo), '-c', 'user.name=t', '-c', 'user.email=t@t', *args], check=True, capture_output=True)

def fixture(tmp):
    root, repo = tmp / 'hospital', tmp / 'repo'
    (root / 'cache').mkdir(parents=True)
    (root / 'cases').mkdir()
    (root / 'chart-template.md').write_text((HERE / 'chart-template.md').read_text())
    (root / 'run.json').write_text(json.dumps(RUN))
    (root / 'cache' / 'issues.json').write_text(json.dumps([dict(number=7, state='open', labels=[], html_url='issue-7', title='a bug')]))
    (root / 'cache' / 'pulls.json').write_text(json.dumps([dict(number=8, title='fix it', body='Fixes #7', html_url='pull-8'),
                                                           dict(number=9, title='other', body='See #70', html_url='pull-9')]))
    (tmp / 'fake.py').write_text(FAKE)
    repo.mkdir()
    git(repo, 'init', '-q', '-b', 'main')
    (repo / 'a.txt').write_text('a\n')
    git(repo, 'add', 'a.txt')
    git(repo, 'commit', '-q', '-m', 'base')
    git(repo, 'update-ref', 'refs/remotes/origin/main', 'HEAD')
    return root, repo

def drive(tmp, root, repo, rows, *argv, mode='normal'):
    fake = lambda role, prompt, output: [sys.executable, str(tmp / 'fake.py'), str(HERE / 'hospital.py'), str(output), mode]
    with patch.object(h, 'ROOT', root), patch.object(h, 'REPO', repo), patch.object(h, 'POLL', 0.05), \
         patch.object(h, 'usage', return_value=rows), patch.object(h, 'role_cmd', fake), patch.object(sys, 'argv', ['hospital.py', *argv]):
        h.main()

def state(root, n=7): return json.loads((root / 'cases' / str(n) / 'state.json').read_text())

def expect_exit(message, fn):
    try: fn()
    except SystemExit as e: assert str(e) == message, e
    else: raise AssertionError(f'expected stop: {message}')

# Costs count only the run's keys, by ID, inside the window.
rows = [dict(timestamp='2026-10-11 18:00:00', api_key_id='id-claude', cost_usd=1),
        dict(timestamp='2026-10-11 18:01:00', api_key_id='id-codex', cost_usd=2),
        dict(timestamp='2026-10-11 18:02:00', api_key_id='id-claude', cost_usd=4),
        dict(timestamp='2026-10-11 18:02:00', api_key_id='id-other-sandbox', cost_usd=50)]
assert h.costs(rows, KEYS, '2026-10-11 18:01:00', '2026-10-11 18:01:00') == {'codex': 2}
assert h.costs(rows, KEYS, '2026-10-11 18:00:00') == {'claude': 5, 'codex': 2}
assert h.verdict('VERDICT: APPROVE\nmore\n**VERDICT: REWORK**') == 'REWORK'
assert h.verdict('Reply with VERDICT: APPROVE or VERDICT: REWORK') is None

with tempfile.TemporaryDirectory() as t:
    tmp = pathlib.Path(t)
    root, repo = fixture(tmp)
    # Full offline run: every stage, stub model, real git and run-test.
    drive(tmp, root, repo, [], 'admit', '7', '--kind', 'bug')
    chart = root / 'cases' / '7' / 'CHART.md'
    assert 'pull-8' in chart.read_text() and 'pull-9' not in chart.read_text()
    expect_exit('Expected stage workup', lambda: drive(tmp, root, repo, [], 'implement', '7'))
    for stage in h.STAGES: drive(tmp, root, repo, [], stage, '7')
    s = state(root)
    assert s['outcome'] == 'discharged', s
    assert h.exit_codes(root / 'cases' / '7', 'review') and sorted(h.exit_codes(root / 'cases' / '7', 'review')) == [0, 1]
    assert 'fix.txt' in subprocess.check_output(['git', '-C', str(repo), 'show', '--name-only', 'HEAD'], text=True)
    for tag in ['ADMISSION', 'WORKUP', 'PLAN_REVIEW', 'IMPLEMENT', 'REVIEW', 'DISCHARGE', 'CLOSED']: assert f'HOSPITAL:{tag} ' in chart.read_text(), tag

with tempfile.TemporaryDirectory() as t:
    tmp = pathlib.Path(t)
    root, repo = fixture(tmp)
    # An implementation approved without a passing run-test log escalates.
    drive(tmp, root, repo, [], 'admit', '7', '--kind', 'bug')
    for stage in ['workup', 'plan-review']: drive(tmp, root, repo, [], stage, '7')
    drive(tmp, root, repo, [], 'implement', '7', mode='untested')
    assert state(root)['outcome'] == 'escalated'
    assert 'no passing run-test log' in (root / 'cases' / '7' / 'CHART.md').read_text()
    # Case count and trial budget stop admissions before any git or model work.
    (root / 'run.json').write_text(json.dumps({**RUN, 'max_cases': 1}))
    expect_exit('Case count stop', lambda: drive(tmp, root, repo, [], 'admit', '8', '--kind', 'bug'))
    spent = [dict(timestamp='2026-10-11 18:05:00', api_key_id='id-codex', cost_usd=10)]
    expect_exit('Trial cost stop', lambda: drive(tmp, root, repo, spent, 'admit', '8', '--kind', 'bug'))

with tempfile.TemporaryDirectory() as t:
    tmp = pathlib.Path(t)
    root, repo = fixture(tmp)
    # Blockers in a contributor's diff end a PR case: the hospital may not rewrite it.
    drive(tmp, root, repo, [], 'admit', '7', '--kind', 'pr')
    drive(tmp, root, repo, [], 'workup', '7')
    drive(tmp, root, repo, [], 'plan-review', '7', mode='plan-review')
    assert state(root)['outcome'] == 'changes-requested'

with tempfile.TemporaryDirectory() as t:
    tmp = pathlib.Path(t)
    root, repo = fixture(tmp)
    # A case over its limit escalates without starting a model.
    drive(tmp, root, repo, [], 'admit', '7', '--kind', 'bug')
    spent = [dict(timestamp='2099-01-01 00:00:00', api_key_id='id-claude', cost_usd=3)]
    with patch.object(h.subprocess, 'Popen') as proc:
        drive(tmp, root, repo, spent, 'workup', '7')
        proc.assert_not_called()
    assert state(root)['outcome'] == 'escalated'

print('PASS: key-ID costs; verdict parsing; full offline run to discharge; test-evidence, case-count, trial and case budget gates')
