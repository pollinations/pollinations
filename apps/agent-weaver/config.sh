#!/usr/bin/env bash
# Assemble the registration request, or verify an authenticated agents-get response on stdin.
set -euo pipefail
agent_dir="$(dirname "$0")"
config=$(jq --rawfile prompt "$agent_dir/system-prompt.md" \
  '. + {systemPrompt: ($prompt | gsub("^\\s+|\\s+$"; ""))}' "$agent_dir/agent.json")

case "${1:-assemble}" in
  assemble) printf '%s\n' "$config" ;;
  verify)
    : "${2:?provide the agent ID from registration}" "${3:?provide its callable model ID}"
    jq -er --argjson config "$config" --arg id "$2" --arg model "$3" '
      if .id == $id and .model == $model and .model == ("community/pollinations-ai/" + $config.name)
        and .type == "prompt_agent" and .name == $config.name and .title == $config.title
        and .description == $config.description and .visibility == $config.visibility and .baseModel == $config.baseModel
        and .systemPrompt == $config.systemPrompt and .mcpServers == $config.mcpServers
      then .model else error("Saved Weaver configuration differs from the release") end'
    ;;
  *) exit 2 ;;
esac
