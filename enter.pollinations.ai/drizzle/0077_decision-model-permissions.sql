-- Decision models move from the `text` category to `decision`. On chat
-- endpoints `text` still allows them, but `/alpha/decisions` now needs
-- `decision`. Keys that list `text` and called a decision model before the
-- split get `decision` too, so they keep working there.
-- The IDs are those keys, from a read-only production check on 2026-10-16:
-- generation_event_v2 calls to the seven decision models since their first
-- traffic on 2026-09-04, joined with keys whose model list includes `text`
-- (40 own keys, 8 app keys). Keys that no longer list `text` keep the list
-- their owner set. All of them list only categories, so appending keeps the
-- canonical order. Rerunning this file changes nothing.
UPDATE apikey
SET permissions = json_insert(permissions, '$.models[#]', 'decision')
WHERE id IN (
    '08p3ULLlTrb2oYFfxYBgT5mRIO6V0qE9',
    '1u2efjg52TsS84xFjWQ4tgkgZ2esPtRh',
    '1wzTKvt3azdiwr3uYyOG4UmF64Ao68RX',
    '3e24eGCmVlE30cRpldz3Mhmw6tZmth1s',
    '3llSLmUNg2R9zWTS2jyaGfPyXMBrqrVY',
    '4iWaaaCos9TwOSnEnrsZfW6BF5I3Oc1q',
    '5QxeaGkwmKzMHJLLSahpehUcf1587WFB',
    '7Gh1ud2JJGp2jKyR3u7SsVY1siQuA6Ut',
    '7X47iVACBgLzIytpmMhgt6EWLAMO3lHl',
    '9l6aGyejFY5lLmr22TRtGvHhDlc9XcWB',
    'AOcZFNrPl9N66dMfkWtT7lB0D09tVlxe',
    'GhW5A3hnHdliXVWuQM1zNhVBsghvhsAC',
    'H8U22Gt0ViY79mrdHtKbu5Ip5C39IBLr',
    'KJ2mGDukSn5Ihqwe9FG46RyW3zm4IxWY',
    'NyQcjXn7dirSmdP7BR2fHgDc87QWLsIE',
    'PBSLwnksV0q2JmuBesgGJPX2BLZpkWz8',
    'QNEd7O1fNmWXZTqxG38h8XL1mFCBp3qh',
    'Qor16gSi8vPQAxeiKsIZuHCAuivKlmbC',
    'Qzvx0fGWXptRLVzOomBFVxv1sCpY7vuS',
    'RD1FuMtOeJS7553CqO9r68hSQUTFzBkn',
    'TTWGzf7yNDUirF6SzqxdKCSOlCxm6zvV',
    'UGf8KiblN1zU75lzfnZo9iuWi4Jcg9zb',
    'VZn7rAOrzZeO4hIGFYQrwN2l0gXSnP6o',
    'XG6b4UNnD1OnDq0SuhySGOAinaScCOiy',
    'Xdak7E19TicCd1XAZKCr6aBpM08N6HQ7',
    'Xrtnkzb5E1EvMyygHTk7MKI8AlCKoelF',
    'XzMdsj4UfTUHiu87mo7IHyIw7NneVOSk',
    'ZROakIGkr99WWJbQNa64KqDyuNkK8kLd',
    'a3qLMTpW2mhi7gRzsyfIcz9zeZd5B7ls',
    'aVEcT7YFeQQsTJhsePJ2TPum2uj6a6vW',
    'cqfPFYr0jSSG7aCnAj750XqltXxFXvbH',
    'crxSCUzWvMTGuIRqBBjMx0rd1JcouTKU',
    'e6XzCDneasw05Cej1n6vP66SvkrLGOGF',
    'fZlfSayRG4MA7LcqHjrjRZznKRmPZbjC',
    'kpNo2g5XEdLE9TCQ5oQg9QxgabA3Ke3O',
    'lM6tDtJdGfBenNvN6sL0dL81EzYgoY9w',
    'lOkrIDZr8xyAtEFnlv4iliZhNyiNYJae',
    'lnPzpsNrFhnxCFt45AAhqw0q8Xs0ygVd',
    'mAiclroXTxXqj33QgLsi4Nv2QTcRIIk0',
    'mjnezi5OJKZ4ZcamWBtWdQomxUlPoysL',
    'nWY6KR33b0xdeXlvW565XrlwjvcupUoE',
    'oD1E5cz3LeNYSHuIyTRMVBckDbUneylJ',
    'raLl8dwHFPzZtFk7BJf2Kmj997VRhmwN',
    'uzCJ8RSt0ZLYr3WCmuv5sniTRDinO5GM',
    'wGx41C5VcgQc8rhdu7g8kMC1pBHJVDAS',
    'woKG6iZDiftER9W1STtbyN3MEWBmzRnJ',
    'xDmPcBjTCtDey4ovLMvxtxbB0L38uDFj',
    'yCGxJZywVQOaGCzXSfrZS1HnaJEiWMYL'
)
  AND json_valid(permissions)
  AND json_type(permissions, '$.models') = 'array'
  AND EXISTS (
    SELECT 1 FROM json_each(permissions, '$.models') WHERE value = 'text'
  )
  AND NOT EXISTS (
    SELECT 1 FROM json_each(permissions, '$.models') WHERE value = 'decision'
  );
