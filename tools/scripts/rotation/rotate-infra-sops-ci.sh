#!/bin/bash
# Rotate the SOPS CI age key (the one stored as GH Actions SOPS_AGE_KEY secret,
# consumed by deploy-enter-services.yml).
#
# Two-phase rotation with an overlap window:
#   Phase 1: add new CI recipient → PR → auto-merge. Old + new both decrypt.
#   Phase 2: update GH secret to new private key, trigger staging deploy,
#            verify the "Decrypt .env files with SOPS" step succeeds with
#            the new key.
#   Phase 3: remove old CI recipient → PR → auto-merge. Only new key decrypts.
#
# Between Phase 1 and Phase 2, CI still works with the old key; between Phase 2
# and Phase 3, CI works with the new key and the old key is still a valid
# fallback. Zero-downtime by design.
#
# Usage: ./rotate-infra-sops-ci.sh [--execute]
#
# Default: dry-run. Pass --execute to perform the rotation.
#
# Prerequisites:
# - sops, age-keygen, jq, gh, git, python3
# - SOPS_AGE_KEY set locally (so this machine can still decrypt after Phase 1)
# - Admin permission on pollinations/pollinations (to set GH secret + merge PRs)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$(dirname "$(dirname "$SCRIPT_DIR")")")"

DRY_RUN=true
while [[ "$1" == --* ]]; do
    case "$1" in
        --execute) DRY_RUN=false; shift ;;
        *) echo "Unknown flag: $1"; exit 1 ;;
    esac
done

source "$SCRIPT_DIR/_log.sh"
source "$SCRIPT_DIR/_pr-deploy.sh"

SOPS_YAML="$REPO_ROOT/.sops.yaml"
RECIPIENTS_FILE="$SCRIPT_DIR/sops-recipients.yaml"
REPO="pollinations/pollinations"
DEPLOY_WORKFLOW="deploy-enter-services.yml"
SECRET_NAME="SOPS_AGE_KEY"

#######################################
# Pre-flight
#######################################
section "Pre-flight: checks"

cd "$REPO_ROOT"

for tool in sops age-keygen jq gh git python3; do
    if ! command -v "$tool" >/dev/null 2>&1; then
        error "Required tool not found: $tool"
        exit 1
    fi
done

if ! gh auth status >/dev/null 2>&1; then
    error "gh CLI not authenticated. Run 'gh auth login'."
    exit 1
fi

if [ ! -f "$SOPS_YAML" ]; then
    error ".sops.yaml not found at repo root: $SOPS_YAML"
    exit 1
fi

if [ ! -f "$RECIPIENTS_FILE" ]; then
    error "Recipient metadata file missing: $RECIPIENTS_FILE"
    exit 1
fi

source "$SCRIPT_DIR/_check-sops-recipients.sh"

read_recipient() {
    # Reads `<role>: <age-pubkey>` from sops-recipients.yaml. Simple file,
    # known shape — a grep is more portable than depending on yq.
    local role="$1"
    grep -E "^\s+${role}:\s*age1" "$RECIPIENTS_FILE" | head -1 | awk '{print $2}'
}
OLD_CI_PUBKEY=$(read_recipient ci)
CORE_PUBKEY=$(read_recipient core)
ITACHI_PUBKEY=$(read_recipient itachi)

if [ -z "$OLD_CI_PUBKEY" ] || [ -z "$CORE_PUBKEY" ] || [ -z "$ITACHI_PUBKEY" ]; then
    error "Could not read all 3 recipients from $RECIPIENTS_FILE"
    error "  core=$CORE_PUBKEY  itachi=$ITACHI_PUBKEY  ci=$OLD_CI_PUBKEY"
    exit 1
fi
log "Current CI recipient: ${OLD_CI_PUBKEY:0:20}..."

if ! grep -q "$OLD_CI_PUBKEY" "$SOPS_YAML"; then
    error "CI recipient from metadata file not found in .sops.yaml."
    error "  Metadata says:  $OLD_CI_PUBKEY"
    error "  .sops.yaml has a different set. Reconcile manually."
    exit 1
fi

SOPS_FILES=$(git grep -l '"sops":' -- '*.json' | grep -v node_modules || true)
if [ -z "$SOPS_FILES" ]; then
    error "No SOPS-encrypted files found via 'git grep'."
    exit 1
fi
SOPS_FILE_COUNT=$(echo "$SOPS_FILES" | wc -l | tr -d ' ')
log "Found $SOPS_FILE_COUNT SOPS-encrypted files."

if ! $DRY_RUN; then
    if [ -n "$(git status --porcelain)" ]; then
        error "Working tree not clean — commit or stash before --execute."
        git status --short
        exit 1
    fi

    if ! sops -d "$(echo "$SOPS_FILES" | head -1)" >/dev/null 2>&1; then
        error "Cannot decrypt with current SOPS_AGE_KEY. Fix local key before --execute."
        exit 1
    fi

    CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
    if [ "$CURRENT_BRANCH" != "main" ]; then
        warn "Current branch is '$CURRENT_BRANCH' — rotation PRs will be opened against main."
    fi

    if ! gh secret list --repo "$REPO" 2>/dev/null | grep -q "^$SECRET_NAME"; then
        error "GH secret $SECRET_NAME not found on $REPO."
        exit 1
    fi
fi

log "Pre-flight OK"

if $DRY_RUN; then
    warn "DRY RUN — no changes will be made. Pass --execute to rotate."
    echo
    log "Plan:"
    echo "  1. Generate new CI age keypair → temp file (chmod 600)"
    echo "  2. [Phase 1] Add new CI pubkey to .sops.yaml alongside the old one"
    echo "     → sops updatekeys on $SOPS_FILE_COUNT files"
    echo "     → PR 'rotate: SOPS CI age key (phase 1/2 — add new)' → auto-merge"
    echo "  3. [Phase 2] gh secret set $SECRET_NAME to new private key on $REPO"
    echo "  4. [Phase 2] Trigger $DEPLOY_WORKFLOW staging → gh run watch → verify decrypt step green"
    echo "  5. [Phase 3] Remove old CI pubkey from .sops.yaml"
    echo "     → sops updatekeys on $SOPS_FILE_COUNT files"
    echo "     → PR 'rotate: SOPS CI age key (phase 2/2 — remove old)' → auto-merge"
    echo "  6. Update sops-recipients.yaml with new CI public key"
    echo "  7. Shred temp private key file"
    exit 0
fi

ORIGINAL_BRANCH=$(git rev-parse --abbrev-ref HEAD)
TS=$(date +%Y%m%d-%H%M%S)

cleanup() {
    if [ -n "${NEW_KEY_FILE:-}" ] && [ -f "$NEW_KEY_FILE" ]; then
        if command -v shred >/dev/null 2>&1; then
            shred -u "$NEW_KEY_FILE" 2>/dev/null || rm -f "$NEW_KEY_FILE"
        else
            rm -f "$NEW_KEY_FILE"
        fi
    fi
}
trap cleanup EXIT

#######################################
# 1. Generate new CI keypair
#######################################
section "Generating new CI age keypair"

NEW_KEY_FILE="$(mktemp -t sops-ci-key-${TS}-XXXXXX)"
rm -f "$NEW_KEY_FILE"  # age-keygen refuses to overwrite
age-keygen -o "$NEW_KEY_FILE" 2>&1 | head -2
chmod 600 "$NEW_KEY_FILE"
NEW_CI_PUBKEY=$(age-keygen -y "$NEW_KEY_FILE")
log "New CI recipient: $NEW_CI_PUBKEY"

#######################################
# 2. Phase 1: add new recipient → updatekeys → PR → merge
#######################################
section "Phase 1: add new CI recipient to .sops.yaml"

PHASE1_BRANCH="rotate/sops-ci-add-new-${TS}"
git checkout -b "$PHASE1_BRANCH"

# Insert new pubkey into .sops.yaml (append to age list)
NEW_AGE_LIST="${CORE_PUBKEY},${ITACHI_PUBKEY},${OLD_CI_PUBKEY},${NEW_CI_PUBKEY}"
python3 - "$SOPS_YAML" "$NEW_AGE_LIST" <<'PYEOF'
import sys, re
path, new_list = sys.argv[1], sys.argv[2]
with open(path) as f: txt = f.read()
# Match the full folded `age: >-` block: header line, then all indented
# continuation lines until the next yaml key at a lower/equal indent.
m = re.search(r'^([ \t]+)age:\s*>-\s*\n((?:\1[ \t]+\S[^\n]*\n)+)', txt, re.MULTILINE)
if not m:
    print("ERROR: folded age: >- block not matched in .sops.yaml", file=sys.stderr); sys.exit(1)
parent_indent = m.group(1)
first_cont = re.match(r'([ \t]+)', m.group(2))
cont_indent = first_cont.group(1) if first_cont else parent_indent + '    '
replacement = f"{parent_indent}age: >-\n{cont_indent}{new_list}\n"
new_txt = txt[:m.start()] + replacement + txt[m.end():]
with open(path, 'w') as f: f.write(new_txt)
PYEOF

log ".sops.yaml updated: 4 recipients (core, itachi, old-CI, new-CI)"

log "Re-wrapping DEK on $SOPS_FILE_COUNT files..."
for f in $SOPS_FILES; do
    if ! UPDATEKEYS_OUT=$(sops updatekeys -y "$f" 2>&1); then
        error "updatekeys failed on $f:"
        echo "$UPDATEKEYS_OUT" | head -10
        exit 1
    fi
done

# Sanity: new key can decrypt
if ! SOPS_AGE_KEY_FILE="$NEW_KEY_FILE" SOPS_AGE_KEY="" sops -d "$(echo "$SOPS_FILES" | head -1)" >/dev/null 2>&1; then
    error "New key failed to decrypt after updatekeys. Aborting before PR."
    exit 1
fi
log "New key verified: decrypts sample file."

git add "$SOPS_YAML" $SOPS_FILES
git commit -m "rotate: SOPS CI age key (phase 1/2 — add new recipient)

Adds $NEW_CI_PUBKEY as a 4th recipient alongside the existing CI key.
'sops updatekeys' re-wraps DEKs on all $SOPS_FILE_COUNT SOPS files so both old
and new CI keys can decrypt. No secret values changed.

Part of a two-phase SOPS CI key rotation — old key stays a recipient until
phase 2 after GH secret + staging verification."
open_pr_and_merge "$PHASE1_BRANCH" \
    "rotate: SOPS CI age key (phase 1/2 — add new recipient)" \
    "Automated by \`rotate-infra-sops-ci.sh\`. Adds new CI recipient; old still valid." \
    || exit 1

git checkout main
git pull --ff-only origin main

#######################################
# 3. Phase 2: swap GH secret → trigger staging deploy → verify
#######################################
section "Phase 2: swap GH Actions SOPS_AGE_KEY + verify"

gh secret set "$SECRET_NAME" --repo "$REPO" < "$NEW_KEY_FILE"
log "GH Actions $SECRET_NAME swapped to new CI key."

log "Dispatching staging deploy to verify new key..."
gh workflow run "$DEPLOY_WORKFLOW" --repo "$REPO" -f environment=staging
sleep 10

RUN_ID=""
DISPATCH_WAIT=60
while [ $DISPATCH_WAIT -gt 0 ]; do
    RUN_ID=$(gh run list --repo "$REPO" --workflow="$DEPLOY_WORKFLOW" --event=workflow_dispatch --limit=1 --json databaseId,status -q '.[0].databaseId' 2>/dev/null || echo "")
    [ -n "$RUN_ID" ] && break
    sleep 5; DISPATCH_WAIT=$((DISPATCH_WAIT - 5))
done
if [ -z "$RUN_ID" ]; then
    error "Could not find staging deploy run."
    error "  GH secret was swapped. Manually revert by running:"
    error "    echo \"\$SOPS_AGE_KEY\" | gh secret set $SECRET_NAME --repo $REPO"
    exit 1
fi
log "Watching staging deploy run $RUN_ID..."

if ! gh run watch "$RUN_ID" --repo "$REPO" --exit-status; then
    error "Staging deploy FAILED with the new CI key."
    error "  Revert the GH secret to the previous value to restore CI:"
    error "    echo \"\$SOPS_AGE_KEY\" | gh secret set $SECRET_NAME --repo $REPO"
    error "  Old CI key is still a recipient — reverting is safe and zero-downtime."
    exit 1
fi
log "Staging deploy green — new CI key works in production CI."

#######################################
# 4. Phase 3: remove old recipient → updatekeys → PR → merge
#######################################
section "Phase 3: remove old CI recipient"

PHASE3_BRANCH="rotate/sops-ci-remove-old-${TS}"
git checkout -b "$PHASE3_BRANCH"

FINAL_AGE_LIST="${CORE_PUBKEY},${ITACHI_PUBKEY},${NEW_CI_PUBKEY}"
python3 - "$SOPS_YAML" "$FINAL_AGE_LIST" <<'PYEOF'
import sys, re
path, new_list = sys.argv[1], sys.argv[2]
with open(path) as f: txt = f.read()
new_txt = re.sub(r'(age:\s*>-\s*\n\s*)[^\n]+', lambda m: m.group(1) + new_list, txt, count=1)
if new_txt == txt:
    print("ERROR: age block not matched in .sops.yaml", file=sys.stderr); sys.exit(1)
with open(path, 'w') as f: f.write(new_txt)
PYEOF

log ".sops.yaml updated: 3 recipients (core, itachi, new-CI only)"

for f in $SOPS_FILES; do
    if ! UPDATEKEYS_OUT=$(sops updatekeys -y "$f" 2>&1); then
        error "updatekeys failed on $f:"
        echo "$UPDATEKEYS_OUT" | head -10
        exit 1
    fi
done

# Update recipient metadata
python3 - "$RECIPIENTS_FILE" "$NEW_CI_PUBKEY" <<'PYEOF'
import sys, re
path, new_ci = sys.argv[1], sys.argv[2]
with open(path) as f: txt = f.read()
new_txt = re.sub(r'(ci:\s*)age1\S+', lambda m: m.group(1) + new_ci, txt, count=1)
if new_txt == txt:
    print("ERROR: ci: line not matched in recipients metadata", file=sys.stderr); sys.exit(1)
with open(path, 'w') as f: f.write(new_txt)
PYEOF

git add "$SOPS_YAML" "$RECIPIENTS_FILE" $SOPS_FILES
git commit -m "rotate: SOPS CI age key (phase 2/2 — remove old recipient)

Removes the old CI recipient ($OLD_CI_PUBKEY).
Updates sops-recipients.yaml to reflect the new CI key.
GH Actions SOPS_AGE_KEY was already swapped to the new key and verified
via a staging deploy before this PR was opened."
open_pr_and_merge "$PHASE3_BRANCH" \
    "rotate: SOPS CI age key (phase 2/2 — remove old recipient)" \
    "Automated by \`rotate-infra-sops-ci.sh\`. Phase 1 PR already merged; staging deploy already verified new key works in CI. This PR removes the now-unused old CI recipient." \
    || { error "Phase 3 PR did not merge. New key is live in CI but .sops.yaml still lists the old recipient. Resolve manually."; exit 1; }

git checkout main
git pull --ff-only origin main
git checkout "$ORIGINAL_BRANCH" 2>/dev/null || true

#######################################
# Done
#######################################
section "SOPS CI Key Rotation Complete"
echo ""
log "Old CI recipient: $OLD_CI_PUBKEY (no longer in .sops.yaml)"
log "New CI recipient: $NEW_CI_PUBKEY (active)"
log "GH Actions $SECRET_NAME updated; staging deploy verified."
echo ""
warn "Back up the new CI private key to your password manager NOW."
warn "Temp file $NEW_KEY_FILE will be shredded when this script exits."
echo ""
log "Read back new private key one final time (copy into password manager):"
echo "--- begin ---"
cat "$NEW_KEY_FILE"
echo "--- end ---"
