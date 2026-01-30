# Security Incident Investigation Report

**Incident:** PLN_ENTER_TOKEN Compromise  
**Date:** January 29, 2026  
**Status:** MITIGATED  

---

## Executive Summary

The `PLN_ENTER_TOKEN` was compromised through HTTP traffic interception between Cloudflare Workers and EC2 services. Three attackers were identified and blocked, preventing 12,660+ unauthorized API calls.

---

## Investigation Areas

### 1. GitHub Actions & CI/CD Pipeline

**Result:** NOT the leak source ✅

| Check | Finding |
|-------|---------|
| Token in workflow logs | Only first 10 chars logged (masked) |
| SSH action security | No credential logging |
| Artifact uploads | None found |
| PR trigger security | Only push events trigger deployment |

**Conclusion:** GitHub Actions properly handles secrets.

---

### 2. Server & Network Exposure

**Result:** PRIMARY LEAK VECTOR 🔴

#### Critical Findings

| Issue | Severity | Details |
|-------|----------|---------|
| HTTP not HTTPS | CRITICAL | `wrangler.toml` uses `http://` for service URLs |
| Open ports | CRITICAL | Ports 16384/16385 bound to `0.0.0.0` |
| No firewall | CRITICAL | No IP restrictions before incident |
| Public EC2 IP | HIGH | IP hardcoded in public repo |

#### Network Configuration (Before Fix)
```
Services listening: 0.0.0.0:16384, 0.0.0.0:16385
Firewall rules: Only 3 specific IPs blocked (attackers)
Traffic encryption: Plain HTTP
```

#### Attack Vector Confirmed
```
1. Attacker discovers EC2 IP (public in wrangler.toml)
2. Monitors HTTP traffic to ports 16384/16385
3. Captures x-enter-token header in plaintext
4. Uses token to bypass authentication
```

---

### 3. Codebase & Third-Party Services

**Result:** NOT the leak source ✅

| Check | Finding |
|-------|---------|
| Git history search | No token commits found |
| Tinybird events | Token not logged |
| Local .dev.vars | Properly gitignored |
| Old hardcoded token | Different token, returns 403 |
| Debug endpoints | All return 403 Unauthorized |

#### Files Checked
- `text.pollinations.ai/server.js` - Token validated, not logged ✅
- `image.pollinations.ai/src/index.ts` - Token validated, not logged ✅
- `enter.pollinations.ai/src/db/schema/event.ts` - No token in analytics ✅
- `image.pollinations.ai/z-image/setup-ionet.sh` - Old token removed ✅

---

## Root Cause Analysis

```
VULNERABILITY CHAIN:
1. EC2 IP hardcoded in public wrangler.toml
   └─> "http://ec2-3-80-56-235.compute-1.amazonaws.com:16384"
2. Services listening on 0.0.0.0 (all interfaces)
3. No IP restrictions on ports 16384/16385
4. Token transmitted in plaintext HTTP headers
   └─> "x-enter-token: [FULL_TOKEN]"
```

---

## Attack Timeline

| Time (UTC) | Event |
|------------|-------|
| Jan 28, ~15:00 | Token rotated (new: 1Slz...) |
| Jan 29, 19:15 | Attack begins from France (51.178.209.163) |
| Jan 29, 19:45 | First attacker blocked |
| Jan 29, 20:30 | Turkish attackers join |
| Jan 29, 20:50 | All attackers blocked |
| Jan 29, 23:55 | Cloudflare-only firewall rules applied |

---

## Attackers Identified

| IP Address | Location | ISP | Packets Blocked |
|------------|----------|-----|-----------------|
| 51.178.209.163 | France | OVH | 12,318 |
| 46.1.178.106 | İzmir, Turkey | Millenicom | 339 |
| 46.221.116.194 | Istanbul, Turkey | Vodafone | 3 |

---

## Mitigations Applied

### Immediate (Jan 29)
- [x] Blocked attacker IPs via iptables
- [x] Applied Cloudflare-only firewall rules
- [x] Verified direct access blocked

### Follow-up (Jan 30)
- [x] Fixed .env file permissions (644 → 600)
- [x] Removed PLN_ENTER_TOKEN from GitHub workflow
- [x] Token now read from local .env file

### Pending
- [ ] Enable HTTPS between Cloudflare and EC2
- [ ] Consider Cloudflare Tunnel for zero-trust
- [ ] Rotate token after HTTPS enabled

---

## Risk Assessment Summary

| Area | Risk Level | Status |
|------|------------|--------|
| GitHub Actions | LOW | ✅ Cleared |
| Server logs | LOW | ✅ Only 4 chars logged |
| Network exposure | CRITICAL → MITIGATED | ✅ Firewall applied |
| Codebase | LOW | ✅ Cleared |
| Third-party services | LOW | ✅ Cleared |

---

## Lessons Learned

### What Went Wrong
1. HTTP protocol for internal communication
2. EC2 IP exposed in public repository
3. No IP restrictions on service ports
4. Services bound to all interfaces (0.0.0.0)

### What Worked Well
1. Rapid detection (~30 minutes)
2. Quick attacker blocking
3. No customer data exposed
4. Clean logs for investigation

### Process Improvements Needed
1. Secret scanning in CI/CD
2. Zero-trust architecture between services
3. Automated anomaly detection
4. Regular security audits

---

## Commands Used in Investigation

### SSH Log Analysis
```bash
ssh enter-services "sudo cat /var/log/auth.log | grep 'Accepted' | grep -oP 'from \K[0-9.]+' | sort | uniq -c"
```

### Check Service Binding
```bash
ssh enter-services "sudo ss -tlnp | grep -E '16384|16385'"
```

### Firewall Rules
```bash
ssh enter-services "sudo iptables -L INPUT -n"
```

### Token in Logs
```bash
ssh enter-services "sudo journalctl -u text-pollinations.service --since '1 hour ago' | grep -i token"
```

---

*Investigation completed: January 30, 2026*
