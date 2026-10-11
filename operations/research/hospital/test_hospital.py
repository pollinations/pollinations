"""Offline checks of the driver's cost accounting and state gates."""
import json
import pathlib
import sys
import tempfile
from unittest.mock import patch
import hospital as h

rows = [dict(timestamp='2026-10-11 18:00:00',api_key='claude',cost_usd=1),
        dict(timestamp='2026-10-11 18:01:00',api_key='codex',cost_usd=2),
        dict(timestamp='2026-10-11 18:02:00',api_key='claude',cost_usd=4)]
assert h.costs(rows,'2026-10-11 18:01:00','2026-10-11 18:01:00') == {'codex':2}
assert h.costs(rows,'2026-10-11 18:00:00') == {'claude':5,'codex':2}
with tempfile.TemporaryDirectory() as tmp:
    root=pathlib.Path(tmp); folder=root/'cases'/'1'; folder.mkdir(parents=True)
    state=dict(number=1,outcome='active',next='plan',start='2026-10-11 18:00:00')
    (folder/'state.json').write_text(json.dumps(state))
    with patch.object(h,'ROOT',root), patch.object(h,'usage',return_value=[]), patch.object(sys,'argv',['hospital.py','implement','1']), patch.object(h.subprocess,'Popen') as proc:
        try: h.main()
        except SystemExit as e: assert str(e)=='Expected stage plan'
        else: raise AssertionError('implementation bypassed plan gate')
        proc.assert_not_called()
    with patch.object(h,'ROOT',root), patch.object(h,'usage',return_value=rows), patch.object(sys,'argv',['hospital.py','plan','1']), patch.object(h.subprocess,'Popen') as proc:
        h.main()
        assert json.loads((folder/'state.json').read_text())['outcome']=='escalated'
        proc.assert_not_called()
    with patch.object(h,'ROOT',root), patch.object(h,'usage',return_value=[dict(timestamp='2026-10-11 18:00:00',api_key='codex',cost_usd=15)]), patch.object(sys,'argv',['hospital.py','admit','2','--kind','bug']), patch.object(h,'git') as git:
        try: h.main()
        except SystemExit as e: assert str(e)=='Trial cost stop'
        else: raise AssertionError('trial budget bypassed')
        git.assert_not_called()
print('PASS: inclusive billing windows/key split; plan gate; case and trial budget gates')
