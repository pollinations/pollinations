#!/bin/bash
# Verify .sops.yaml and sops-recipients.yaml agree on the active recipient set.
# Sourced by SOPS rotation scripts during pre-flight so a drifted state is
# caught before any rotation runs. Exits 1 on drift with a diff-style report.
#
# Caller expectations:
#   - SOPS_YAML, RECIPIENTS_FILE, RED, GREEN, YELLOW, BLUE, NC are set
#   - `error` and `log` functions are defined

_SOPS_PUBKEYS=$(grep -oE 'age1[a-z0-9]+' "$SOPS_YAML" | sort -u)
_METADATA_PUBKEYS=$(grep -oE 'age1[a-z0-9]+' "$RECIPIENTS_FILE" | sort -u)

if [ "$_SOPS_PUBKEYS" != "$_METADATA_PUBKEYS" ]; then
    error ".sops.yaml recipients disagree with $RECIPIENTS_FILE."
    echo "  Only in .sops.yaml:" >&2
    comm -23 <(echo "$_SOPS_PUBKEYS") <(echo "$_METADATA_PUBKEYS") | sed 's/^/    /' >&2
    echo "  Only in sops-recipients.yaml:" >&2
    comm -13 <(echo "$_SOPS_PUBKEYS") <(echo "$_METADATA_PUBKEYS") | sed 's/^/    /' >&2
    error "Reconcile both files before rotating."
    exit 1
fi
log "Recipient metadata matches .sops.yaml ($(echo "$_SOPS_PUBKEYS" | wc -l | tr -d ' ') recipients)."
unset _SOPS_PUBKEYS _METADATA_PUBKEYS
