#!/bin/bash
# Rotate a personal SOPS age key (one bound to a single human).
#
# Detects your current local private key, finds the matching recipient in
# .sops.yaml, and rotates it. Refuses to run if your key is the shared 'core'
# key (since that would invalidate access for everyone else who holds it).
#
# Two-phase rotation with overlap window:
#   Phase 1: add new personal recipient → PR → auto-merge. Old + new both decrypt.
#   Phase 2: install new private key locally, verify decryption with new key only.
#   Phase 3: remove old personal recipient → PR → auto-merge. Only new decrypts.
#
# Between Phase 1 and Phase 2 you keep working with both keys available.
# Between Phase 2 and Phase 3 you're on the new key; the old key is still a
# valid fallback if you need to roll back.
#
# Usage: ./rotate-infra-sops-personal.sh [--execute]
#
# Default: dry-run. Pass --execute to perform the rotation.
#
# Prerequisites:
# - sops, age-keygen, jq, gh, git, python3
# - Either SOPS_AGE_KEY env var set OR ~/.config/sops/age/keys.txt populated
# - The local key must match exactly one recipient in .sops.yaml
# - Recipient metadata in tools/scripts/rotation/sops-recipients.yaml

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

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${GREEN}[INFO]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }
section() { echo -e "\n${BLUE}=== $1 ===${NC}"; }

SOPS_YAML="$REPO_ROOT/.sops.yaml"
RECIPIENTS_FILE="$SCRIPT_DIR/sops-recipients.yaml"
REPO="pollinations/pollinations"
LOCAL_KEYS_FILE="${SOPS_AGE_KEY_FILE:-$HOME/.config/sops/age/keys.txt}"

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

for f in "$SOPS_YAML" "$RECIPIENTS_FILE"; do
    [ -f "$f" ] || { error "Required file missing: $f"; exit 1; }
done

# Read labeled recipients. Same parser as rotate-infra-sops-ci.sh.
read_recipient() {
    local role="$1"
    grep -E "^\s+${role}:\s*age1" "$RECIPIENTS_FILE" | head -1 | awk '{print $2}'
}
CORE_PUBKEY=$(read_recipient core)
ITACHI_PUBKEY=$(read_recipient itachi)
CI_PUBKEY=$(read_recipient ci)
if [ -z "$CORE_PUBKEY" ] || [ -z "$ITACHI_PUBKEY" ] || [ -z "$CI_PUBKEY" ]; then
    error "Could not read all 3 recipients from $RECIPIENTS_FILE"
    exit 1
fi

# Derive all public keys we have locally: env var first (highest precedence), then file.
LOCAL_PUBKEYS=""
if [ -n "${SOPS_AGE_KEY:-}" ]; then
    if DERIVED=$(printf '%s\n' "$SOPS_AGE_KEY" | age-keygen -y 2>/dev/null); then
        LOCAL_PUBKEYS="$DERIVED"
    fi
fi
if [ -f "$LOCAL_KEYS_FILE" ]; then
    if DERIVED=$(age-keygen -y "$LOCAL_KEYS_FILE" 2>/dev/null); then
        LOCAL_PUBKEYS="$LOCAL_PUBKEYS
$DERIVED"
    fi
fi
LOCAL_PUBKEYS=$(echo "$LOCAL_PUBKEYS" | grep -E '^age1' | sort -u)
if [ -z "$LOCAL_PUBKEYS" ]; then
    error "No age private keys found. Set SOPS_AGE_KEY or populate $LOCAL_KEYS_FILE."
    exit 1
fi

# Match our local pubkeys against .sops.yaml recipients.
MATCHES=""
for pub in $LOCAL_PUBKEYS; do
    if grep -q "$pub" "$SOPS_YAML"; then
        MATCHES="$MATCHES $pub"
    fi
done
MATCHES=$(echo "$MATCHES" | tr ' ' '\n' | grep -vE '^$' | sort -u)
MATCH_COUNT=$(echo "$MATCHES" | grep -c '^age1' || true)

if [ "$MATCH_COUNT" -eq 0 ]; then
    error "None of your local age keys are listed as recipients in .sops.yaml."
    error "You cannot decrypt SOPS files in this repo; nothing to rotate."
    exit 1
fi
if [ "$MATCH_COUNT" -gt 1 ]; then
    error "Multiple local keys match .sops.yaml recipients — rotation is ambiguous:"
    echo "$MATCHES" | sed 's/^/    /'
    error "Remove keys you don't want to rotate from your local set first."
    exit 1
fi

OLD_PUBKEY="$MATCHES"

# Identify which labeled role this is so we know what NOT to touch.
OLD_ROLE=""
if [ "$OLD_PUBKEY" = "$CORE_PUBKEY" ]; then OLD_ROLE="core"; fi
if [ "$OLD_PUBKEY" = "$ITACHI_PUBKEY" ]; then OLD_ROLE="itachi"; fi
if [ "$OLD_PUBKEY" = "$CI_PUBKEY" ]; then OLD_ROLE="ci"; fi

if [ -z "$OLD_ROLE" ]; then
    warn "Your key matches a recipient but has no label in $RECIPIENTS_FILE."
    warn "Rotation will proceed but sops-recipients.yaml will not be auto-updated."
fi

log "Detected local identity: ${OLD_PUBKEY:0:24}... (role: ${OLD_ROLE:-unlabeled})"

# Safety: refuse to rotate the shared 'core' key.
if [ "$OLD_ROLE" = "core" ]; then
    error "Your key is the shared 'core' key (held by multiple people)."
    error "Rotating it here would invalidate access for everyone else holding the same"
    error "private key. Use a team-split procedure first to create a personal identity."
    error ""
    error "This script is for personal identities only (today: 'itachi')."
    exit 1
fi

# Safety: refuse to rotate the CI key via this script.
if [ "$OLD_ROLE" = "ci" ]; then
    error "Your key matches the CI recipient. Use rotate-infra-sops-ci.sh instead."
    error "(It handles the GH Actions secret swap + staging deploy verification.)"
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
    # Decrypt smoke test with current key.
    if ! sops -d "$(echo "$SOPS_FILES" | head -1)" >/dev/null 2>&1; then
        error "Cannot decrypt with current key. Fix local setup before --execute."
        exit 1
    fi
fi

log "Pre-flight OK"

if $DRY_RUN; then
    warn "DRY RUN — no changes will be made. Pass --execute to rotate."
    echo
    log "Plan (rotating role '${OLD_ROLE:-unlabeled}'):"
    echo "  1. Generate new age keypair → ~/.config/sops/age/rotated-personal-<ts>.txt"
    echo "  2. [Phase 1] Add new recipient to .sops.yaml alongside the old one"
    echo "     → sops updatekeys on $SOPS_FILE_COUNT files"
    echo "     → PR → auto-merge (old + new both decrypt)"
    echo "  3. [Phase 2] Install new private key into local keyring"
    echo "     → decrypt smoke test with NEW key only (NEW_KEY_FILE env)"
    echo "  4. [Phase 3] Remove old recipient from .sops.yaml"
    echo "     → sops updatekeys on $SOPS_FILE_COUNT files"
    echo "     → PR → auto-merge (only new decrypts)"
    echo "  5. Update sops-recipients.yaml: $OLD_ROLE → new pubkey"
    echo "  6. Prune old private key from local keyring (if in keys.txt)"
    exit 0
fi

ORIGINAL_BRANCH=$(git rev-parse --abbrev-ref HEAD)
TS=$(date +%Y%m%d-%H%M%S)

#######################################
# 1. Generate new keypair
#######################################
section "Generating new personal age keypair"

NEW_KEY_FILE="$HOME/.config/sops/age/rotated-personal-${TS}.txt"
mkdir -p "$(dirname "$NEW_KEY_FILE")"
rm -f "$NEW_KEY_FILE"  # age-keygen refuses to overwrite
age-keygen -o "$NEW_KEY_FILE" 2>&1 | head -2
chmod 600 "$NEW_KEY_FILE"
NEW_PUBKEY=$(age-keygen -y "$NEW_KEY_FILE")
log "New personal recipient: $NEW_PUBKEY"
log "Private key written to: $NEW_KEY_FILE"

#######################################
# 2. Phase 1: add new recipient → PR → merge
#######################################
section "Phase 1: add new personal recipient to .sops.yaml"

PHASE1_BRANCH="rotate/sops-personal-${OLD_ROLE:-unlabeled}-add-${TS}"
git checkout -b "$PHASE1_BRANCH"

# Build the new recipient list: all current recipients + the new pubkey.
# We read the existing list from .sops.yaml so we don't miss any labels.
CURRENT_LIST=$(grep -E '^\s+age1' "$SOPS_YAML" | head -1 | sed 's/^\s*//')
[ -z "$CURRENT_LIST" ] && { error "Could not parse recipient list from .sops.yaml"; exit 1; }
NEW_AGE_LIST="${CURRENT_LIST},${NEW_PUBKEY}"

python3 - "$SOPS_YAML" "$NEW_AGE_LIST" <<'PYEOF'
import sys, re
path, new_list = sys.argv[1], sys.argv[2]
with open(path) as f: txt = f.read()
new_txt = re.sub(r'(age:\s*>-\s*\n\s*)[^\n]+', lambda m: m.group(1) + new_list, txt, count=1)
if new_txt == txt:
    print("ERROR: age block not matched in .sops.yaml", file=sys.stderr); sys.exit(1)
with open(path, 'w') as f: f.write(new_txt)
PYEOF

log ".sops.yaml updated with new personal pubkey (overlap window)"

log "Re-wrapping DEK on $SOPS_FILE_COUNT files..."
for f in $SOPS_FILES; do
    sops updatekeys -y "$f" >/dev/null 2>&1 || { error "updatekeys failed on $f"; exit 1; }
done

# Sanity: new key can decrypt after updatekeys.
if ! SOPS_AGE_KEY_FILE="$NEW_KEY_FILE" SOPS_AGE_KEY="" sops -d "$(echo "$SOPS_FILES" | head -1)" >/dev/null 2>&1; then
    error "New key failed to decrypt sample file after updatekeys. Aborting."
    exit 1
fi
log "New key verified: decrypts sample file."

git add "$SOPS_YAML" $SOPS_FILES
git commit -m "rotate: SOPS personal age key (${OLD_ROLE:-unlabeled}) phase 1/2 — add new recipient

Adds $NEW_PUBKEY as an additional recipient alongside the existing one.
'sops updatekeys' re-wraps DEKs on all $SOPS_FILE_COUNT SOPS files so both old
and new keys can decrypt. No secret values changed.

Part of a two-phase personal key rotation — old key stays a recipient until
phase 2 after the new key is installed locally and verified."
git push -u origin "$PHASE1_BRANCH"

gh pr create --repo "$REPO" \
    --base main --head "$PHASE1_BRANCH" \
    --title "rotate: SOPS personal age key (${OLD_ROLE:-unlabeled}) phase 1/2 — add new recipient" \
    --body "Automated by \`rotate-infra-sops-personal.sh\`. Adds new recipient \`$NEW_PUBKEY\`; old stays valid."
gh pr merge "$PHASE1_BRANCH" --repo "$REPO" --auto --squash

log "Waiting for Phase 1 PR to merge..."
MERGE_TIMEOUT=900; ELAPSED=0
while :; do
    STATE=$(gh pr view "$PHASE1_BRANCH" --repo "$REPO" --json state -q .state 2>/dev/null || echo "UNKNOWN")
    case "$STATE" in
        MERGED) log "Phase 1 PR merged."; break ;;
        CLOSED) error "Phase 1 PR closed without merging."; exit 1 ;;
    esac
    [ "$ELAPSED" -ge "$MERGE_TIMEOUT" ] && { error "Timed out waiting for Phase 1 merge."; exit 1; }
    sleep 15; ELAPSED=$((ELAPSED + 15))
done

git checkout main
git pull --ff-only origin main

#######################################
# 3. Phase 2: verify new key decrypts post-merge
#######################################
section "Phase 2: verify new key decrypts main post-merge"

if ! SOPS_AGE_KEY_FILE="$NEW_KEY_FILE" SOPS_AGE_KEY="" sops -d "$(echo "$SOPS_FILES" | head -1)" >/dev/null 2>&1; then
    error "Post-merge decrypt with new key FAILED. Old key still works; do not proceed to Phase 3."
    exit 1
fi
log "Post-merge verification: new key decrypts cleanly."

#######################################
# 4. Phase 3: remove old recipient → PR → merge
#######################################
section "Phase 3: remove old personal recipient"

PHASE3_BRANCH="rotate/sops-personal-${OLD_ROLE:-unlabeled}-remove-${TS}"
git checkout -b "$PHASE3_BRANCH"

# Drop the old pubkey from the recipient list.
FINAL_LIST=$(echo "$NEW_AGE_LIST" | tr ',' '\n' | grep -v "$OLD_PUBKEY" | paste -sd, -)
if [ -z "$FINAL_LIST" ] || ! echo "$FINAL_LIST" | grep -q "$NEW_PUBKEY"; then
    error "Recipient list would be empty or missing new key after dropping old. Aborting."
    exit 1
fi

python3 - "$SOPS_YAML" "$FINAL_LIST" <<'PYEOF'
import sys, re
path, new_list = sys.argv[1], sys.argv[2]
with open(path) as f: txt = f.read()
new_txt = re.sub(r'(age:\s*>-\s*\n\s*)[^\n]+', lambda m: m.group(1) + new_list, txt, count=1)
if new_txt == txt:
    print("ERROR: age block not matched in .sops.yaml", file=sys.stderr); sys.exit(1)
with open(path, 'w') as f: f.write(new_txt)
PYEOF

log ".sops.yaml updated: old recipient removed"

for f in $SOPS_FILES; do
    sops updatekeys -y "$f" >/dev/null 2>&1 || { error "updatekeys failed on $f"; exit 1; }
done

# Update recipient metadata if we have a labeled role.
if [ -n "$OLD_ROLE" ]; then
    python3 - "$RECIPIENTS_FILE" "$OLD_ROLE" "$NEW_PUBKEY" <<'PYEOF'
import sys, re
path, role, new_pubkey = sys.argv[1], sys.argv[2], sys.argv[3]
with open(path) as f: txt = f.read()
new_txt = re.sub(rf'({role}:\s*)age1\S+', lambda m: m.group(1) + new_pubkey, txt, count=1)
if new_txt == txt:
    print(f"ERROR: {role}: line not matched in recipients metadata", file=sys.stderr); sys.exit(1)
with open(path, 'w') as f: f.write(new_txt)
PYEOF
    git add "$RECIPIENTS_FILE"
fi

git add "$SOPS_YAML" $SOPS_FILES
git commit -m "rotate: SOPS personal age key (${OLD_ROLE:-unlabeled}) phase 2/2 — remove old recipient

Removes the old personal recipient ($OLD_PUBKEY).
Updates sops-recipients.yaml: $OLD_ROLE now points to new pubkey.
New key was already verified to decrypt post-Phase-1 merge before opening this PR."
git push -u origin "$PHASE3_BRANCH"

gh pr create --repo "$REPO" \
    --base main --head "$PHASE3_BRANCH" \
    --title "rotate: SOPS personal age key (${OLD_ROLE:-unlabeled}) phase 2/2 — remove old recipient" \
    --body "Automated by \`rotate-infra-sops-personal.sh\`. New key was verified; this PR removes the now-unused old recipient."
gh pr merge "$PHASE3_BRANCH" --repo "$REPO" --auto --squash

log "Waiting for Phase 3 PR to merge..."
ELAPSED=0
while :; do
    STATE=$(gh pr view "$PHASE3_BRANCH" --repo "$REPO" --json state -q .state 2>/dev/null || echo "UNKNOWN")
    case "$STATE" in
        MERGED) log "Phase 3 PR merged."; break ;;
        CLOSED) error "Phase 3 PR closed. New key is in the recipient list but old is too. Resolve manually."; exit 1 ;;
    esac
    [ "$ELAPSED" -ge "$MERGE_TIMEOUT" ] && { error "Timed out waiting for Phase 3 merge."; exit 1; }
    sleep 15; ELAPSED=$((ELAPSED + 15))
done

git checkout main
git pull --ff-only origin main
git checkout "$ORIGINAL_BRANCH" 2>/dev/null || true

#######################################
# 5. Local keyring hygiene
#######################################
section "Local keyring hygiene"

if [ -n "${SOPS_AGE_KEY:-}" ]; then
    warn "SOPS_AGE_KEY env var is set — this script cannot modify your shell config."
    warn "Manual steps to complete the rotation:"
    warn "  1. Add the contents of $NEW_KEY_FILE to wherever SOPS_AGE_KEY is exported"
    warn "     (typically ~/.zshrc or ~/.bashrc)"
    warn "  2. Remove the old AGE-SECRET-KEY entry matching public key $OLD_PUBKEY"
    warn "  3. Restart your shell"
else
    # keys.txt mode: we can manage the file directly.
    if [ -f "$LOCAL_KEYS_FILE" ] && grep -qE "^AGE-SECRET-KEY-" "$LOCAL_KEYS_FILE"; then
        # Remove any entry whose derived public key matches OLD_PUBKEY.
        TMP_KEYS="$(mktemp)"
        python3 - "$LOCAL_KEYS_FILE" "$OLD_PUBKEY" "$TMP_KEYS" <<'PYEOF'
import sys, subprocess
path, old_pub, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
with open(path) as f: content = f.read()
# Split into blocks separated by "# created:" comments; each block has one AGE-SECRET-KEY.
blocks = []
current = []
for line in content.splitlines(keepends=True):
    if line.startswith("# created:") and current:
        blocks.append("".join(current))
        current = [line]
    else:
        current.append(line)
if current: blocks.append("".join(current))
kept = []
for b in blocks:
    secret_lines = [l for l in b.splitlines() if l.startswith("AGE-SECRET-KEY-")]
    if not secret_lines:
        kept.append(b); continue
    try:
        derived = subprocess.run(["age-keygen", "-y"], input="\n".join(secret_lines),
                                 capture_output=True, text=True, check=True).stdout.strip()
    except Exception:
        kept.append(b); continue
    if old_pub in derived:
        continue  # drop this block
    kept.append(b)
with open(out_path, "w") as f: f.write("".join(kept))
PYEOF
        mv "$TMP_KEYS" "$LOCAL_KEYS_FILE"
        chmod 600 "$LOCAL_KEYS_FILE"
        log "Removed old key block from $LOCAL_KEYS_FILE"
    fi
    # Append the new key if it isn't already there.
    if ! grep -qF "$(head -n1 "$NEW_KEY_FILE")" "$LOCAL_KEYS_FILE" 2>/dev/null; then
        cat "$NEW_KEY_FILE" >> "$LOCAL_KEYS_FILE"
        chmod 600 "$LOCAL_KEYS_FILE"
        log "Appended new key to $LOCAL_KEYS_FILE"
    fi
fi

#######################################
# Done
#######################################
section "SOPS Personal Key Rotation Complete"
echo ""
log "Old personal recipient: $OLD_PUBKEY (removed)"
log "New personal recipient: $NEW_PUBKEY (active; role: ${OLD_ROLE:-unlabeled})"
echo ""
warn "Back up the new private key file to your password manager NOW:"
warn "  $NEW_KEY_FILE"
warn "Losing this file means losing access to SOPS files. You've been warned."
echo ""
log "Run any 'sops -d <file>' to confirm decryption still works before closing the terminal."
