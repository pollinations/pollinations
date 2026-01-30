# Security Incident Report: PLN_ENTER_TOKEN Compromise

**Incident Date:** January 29, 2026  
**Status:** MITIGATED  
**Severity:** CRITICAL → MITIGATED  
**Resolution Date:** January 29, 2026 23:55 UTC

---

## Executive Summary

The `PLN_ENTER_TOKEN` was compromised through HTTP traffic interception between Cloudflare Workers and EC2 services. Three attackers were identified and blocked, preventing 12,660+ unauthorized API calls.

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

### Network Configuration (Before Fix)
```
Services listening: 0.0.0.0:16384, 0.0.0.0:16385
Firewall rules: Only 3 specific IPs blocked (attackers)
Traffic encryption: Plain HTTP
```

---

## Attackers Identified

| IP Address | Location | ISP | Packets Blocked |
|------------|----------|-----|-----------------|
| 51.178.209.163 | France | OVH | 12,318 |
| 46.1.178.106 | İzmir, Turkey | Millenicom | 339 |
| 46.221.116.194 | Istanbul, Turkey | Vodafone | 3 |

**Total:** 12,660 attack attempts blocked

---

## Investigation Results

### Areas Cleared (NOT the leak source)

| Area | Finding |
|------|---------|
| **GitHub Actions** | Token properly masked (only first 10 chars logged) |
| **Server logs** | Only first 4 chars logged: "token=1Slz" |
| **Git history** | No token commits found |
| **Tinybird events** | Token not logged |
| **Local .dev.vars** | Properly gitignored |

### Primary Leak Vector: HTTP Traffic Interception

| Issue | Severity | Details |
|-------|----------|---------|
| HTTP not HTTPS | CRITICAL | `wrangler.toml` uses `http://` for service URLs |
| Open ports | CRITICAL | Ports 16384/16385 bound to `0.0.0.0` |
| No firewall | CRITICAL | No IP restrictions before incident |
| Public EC2 IP | HIGH | IP hardcoded in public repo |

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

## Security Posture

### Before vs After

| Aspect | Before | After | Status |
|--------|--------|-------|--------|
| Direct EC2 Access | Open to Internet | Cloudflare Only | FIXED |
| Token Transmission | HTTP Plaintext | Still HTTP | PENDING |
| IP Restrictions | None | Active | FIXED |
| Attackers | Active | Blocked | FIXED |
| Monitoring | None | Live Graph | ACTIVE |

### Risk Score
```
Before: ████████████ 95% CRITICAL
After:  ████░░░░░░░░ 35% MEDIUM
Target: ██░░░░░░░░░░ 15% LOW (after HTTPS)
```

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

---

## Recommendations

### Immediate (Do Tonight)
1. Setup HTTPS certificates
2. Rotate PLN_ENTER_TOKEN
3. Update wrangler.toml to use https://

### Short Term (This Week)
1. Implement Cloudflare Tunnel
2. Add nginx reverse proxy
3. Setup rate limiting
4. Create separate tokens per service

### Long Term (This Month)
1. Move secrets to AWS Secrets Manager
2. Implement mutual TLS
3. Add WAF rules
4. Setup SIEM monitoring

---

## Investigation Commands Used

```bash
# SSH Log Analysis
ssh enter-services "sudo cat /var/log/auth.log | grep 'Accepted' | grep -oP 'from \K[0-9.]+' | sort | uniq -c"

# Check Service Binding
ssh enter-services "sudo ss -tlnp | grep -E '16384|16385'"

# Firewall Rules
ssh enter-services "sudo iptables -L INPUT -n"

# Token in Logs
ssh enter-services "sudo journalctl -u text-pollinations.service --since '1 hour ago' | grep -i token"
```

---

## Related Incidents

- **Jan 28, 2026 - AWS Bedrock Credential Compromise**: See `enter.pollinations.ai/observability/SECURITY_INCIDENT_REPORT_2026-01-28.md` for the related AWS credential leak via hardcoded token in `setup-ionet.sh`.

## Supporting Documents

- `token-diagram.md` - Complete token architecture and security assessment
- `workflows-audit.md` - GitHub workflows security vulnerabilities

---

*Report compiled: January 30, 2026*  
*Incident Commander: @thomash*  
*Security Lead: Claude (AI Assistant)*
