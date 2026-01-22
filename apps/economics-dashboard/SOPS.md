# SOPS Secrets Management

## Quick Reference

```bash
# Decrypt and view
sops -d secrets/secrets.vars.json

# Edit interactively (opens $EDITOR) - DON'T USE IN SCRIPTS
sops secrets/secrets.vars.json

# Update a single key
sops --set '["KEY_NAME"] "new_value"' secrets/secrets.vars.json

# Decrypt → modify → re-encrypt (RECOMMENDED for scripts)
sops -d secrets/secrets.vars.json > /tmp/plain.json
# ... edit /tmp/plain.json ...
cp /tmp/plain.json secrets/secrets.vars.json
sops -e -i secrets/secrets.vars.json
rm /tmp/plain.json
```

## Common Pitfalls

### ❌ DON'T: Encrypt from stdin
```bash
# This FAILS - no matching creation rules
sops -e /dev/stdin > secrets/secrets.vars.json
cat file.json | sops -e > secrets/secrets.vars.json
```

**Why:** SOPS uses path-based rules in `.sops.yaml`. Stdin doesn't match any path.

### ✅ DO: Encrypt in-place
```bash
# Copy plaintext to target path FIRST, then encrypt in-place
cp /tmp/plain.json secrets/secrets.vars.json
sops -e -i secrets/secrets.vars.json
```

**Why:** The `-i` flag encrypts the file at its current path, which matches `.sops.yaml` rules.

### ❌ DON'T: Use interactive `sops filename` in automated scripts
The command `sops filename` opens an editor. If your terminal doesn't support it, the file may get corrupted/emptied.

### ✅ DO: Use explicit decrypt/encrypt flags
```bash
sops -d filename  # decrypt to stdout
sops -e filename  # encrypt to stdout  
sops -e -i filename  # encrypt in-place
sops -d -i filename  # decrypt in-place (rarely needed)
```

## Creation Rules (.sops.yaml)

```yaml
creation_rules:
    - path_regex: (\.env$|\.encrypted\.env$|\.vars.json$|env\.json$)
      age: age1dd8ammekey2t9tzvvznwwx9m35q7jyxvzaydwqjawy99hgmdp3ms9556l5
```

Files must match `path_regex` for encryption to work. Stdin never matches.

## Workflow: Update a Secret

```bash
# 1. Decrypt to temp file
sops -d secrets/secrets.vars.json > /tmp/plain.json

# 2. Edit with jq (or manually)
jq '.MY_SECRET = "new_value"' /tmp/plain.json > /tmp/updated.json

# 3. Copy back and encrypt in-place
cp /tmp/updated.json secrets/secrets.vars.json
sops -e -i secrets/secrets.vars.json

# 4. Clean up
rm /tmp/plain.json /tmp/updated.json

# 5. Verify
sops -d secrets/secrets.vars.json | jq '.MY_SECRET'
```
