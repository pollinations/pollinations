from pathlib import Path
from sys import argv


SERVER = Path(argv[1] if len(argv) > 1 else "/app/optillm/server.py")


def replace_once(source: str, old: str, new: str) -> str:
    if source.count(old) != 1:
        raise RuntimeError(f"Expected exactly one OptiLLM source match: {old[:80]}")
    return source.replace(old, new)


source = SERVER.read_text()
source = replace_once(
    source,
    'if bearer_token != "" and bearer_token.startswith("sk-"):',
    'if bearer_token != "" and bearer_token.startswith(("sk-", "ag_")):',
)
source = replace_once(
    source,
    "best_of_n_sampling(system_prompt, initial_query, client, model, server_config['best_of_n'], request_config, request_id)",
    "best_of_n_sampling(system_prompt, initial_query, client, model, request_config.get('best_of_n', server_config['best_of_n']), request_config, request_id)",
)
source = replace_once(
    source,
    "max_depth=server_config['rstar_max_depth'], num_rollouts=server_config['rstar_num_rollouts'],\n                          c=server_config['rstar_c'], request_config=request_config, request_id=request_id)",
    "max_depth=request_config.get('rstar_max_depth', server_config['rstar_max_depth']), num_rollouts=request_config.get('rstar_num_rollouts', server_config['rstar_num_rollouts']),\n                          c=request_config.get('rstar_c', server_config['rstar_c']), request_config=request_config, request_id=request_id)",
)
source = replace_once(
    source,
    "    if message_optillm_approach:\n        optillm_approach = message_optillm_approach",
    "    if message_optillm_approach and 'optillm_approach' not in data:\n        optillm_approach = message_optillm_approach",
)
SERVER.write_text(source)
