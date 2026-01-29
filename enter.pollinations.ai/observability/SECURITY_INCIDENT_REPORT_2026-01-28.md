# SECURITY INCIDENT REPORT
**Date:** January 28, 2026
**Severity:** CRITICAL
**Status:** RESOLVED
**Resolution Date:** January 29, 2026
**Author:** Security Analysis Team

---

## Executive Summary

Pollinations.ai experienced a security breach involving unauthorized access to the `PLN_ENTER_TOKEN` internal service token. An attacker (IP `51.178.209.163`, OVH Strasbourg) was directly accessing the text.pollinations.ai EC2 service, bypassing the enter.pollinations.ai gateway and billing system.

**Root Cause Identified:** The `PLN_ENTER_TOKEN` was hardcoded as a default value in `image.pollinations.ai/z-image/setup-ionet.sh`, which is in the public repository. Every token rotation updated this file, immediately exposing the new token.

**Resolution:** Token rotated, hardcoded default removed from `setup-ionet.sh`, rotation script updated to warn against hardcoding.

---

## Timeline of Events

### January 12, 2026 - Initial Compromise
- **19:54 UTC**: Commit `f9da6df50` adds AWS Bedrock support for Claude models
- **Configuration**: AWS credentials added for Claude Opus & Sonnet with Bedrock→Vertex fallback
- **Within hours**: Unauthorized AWS Bedrock usage begins

### January 12-27, 2026 - Escalating Abuse
- Daily unauthorized usage grows from 1,044 to 29,863 calls (Opus)
- Attackers specifically target expensive models ($15-75/million tokens)
- Legitimate traffic routes through Google Vertex (fallback) while attackers use Bedrock directly

### January 27, 2026 - Credential Rotation Attempt
- **14:51 UTC**: AWS Bedrock credentials rotated (commit `c5b793d36`)
- **15:00 UTC**: Attack temporarily stops (AWS drops to 1 call/hour)
- **16:00 UTC**: Attackers resume with NEW credentials (744 calls/hour)

### January 28, 2026 - Current Status
- **01:30 UTC**: PLN_ENTER_TOKEN rotated (commit `f9cb6fd62`)
- Attack continues unabated with ~12,000 unauthorized calls/day

---

## Impact Analysis

### Financial Impact (January 12-28, 2026)

| Model | Unauthorized Calls | Est. Tokens | Est. Cost |
|-------|-------------------|-------------|-----------|
| Claude Opus 4.5 | 154,438 | ~400M input, 6M output | ~$3,000 |
| Claude Sonnet 4.5 | 48,910 | ~120M input, 2M output | ~$500 |
| **TOTAL** | **203,348** | **~528M** | **~$3,500+** |

### Coverage Analysis (Last 48 Hours)

| Model | AWS CloudWatch | Tinybird (Legitimate) | Missing (Unauthorized) |
|-------|---------------|----------------------|------------------------|
| Claude Opus 4.5 | 19,612 | 6,952 (35.5%) | 12,660 (64.5%) |
| Claude Sonnet 4.5 | 8,133 | 5,600 (68.9%) | 2,533 (31.1%) |
| Nova Micro (cheap) | 395,704 | 395,694 (99.99%) | 10 (0.01%) |

**Pattern:** Attackers exclusively target expensive models, avoiding cheap models to stay under radar.

---

## Technical Analysis

### Attack Characteristics

1. **Selective Targeting**
   - Only expensive models (Opus: $15/1M input, $75/1M output)
   - Avoids cheap models (Nova: $0.035/1M) to prevent detection
   - Bypasses entire billing/logging infrastructure

2. **Direct API Access**
   - Calls go directly to AWS Bedrock API
   - Bypass enter.pollinations.ai gateway
   - No Tinybird logging = no billing

3. **Persistent Access**
   - Credentials compromised within 1-2 hours of rotation
   - Suggests automated credential extraction
   - Active, ongoing compromise

### System Configuration Issues

```javascript
// text.pollinations.ai/configs/modelConfigs.ts
"claude-opus-4-5-fallback": () => ({
    strategy: { mode: "fallback" },
    targets: [
        // Primary: AWS Bedrock (native)
        {
            provider: "bedrock",
            aws_access_key_id: process.env.AWS_ACCESS_KEY_ID,  // ← Compromised
            aws_secret_access_key: process.env.AWS_SECRET_ACCESS_KEY,  // ← Compromised
            aws_region: process.env.AWS_REGION || "us-east-1",
        },
        // Fallback: Google Vertex AI
        { provider: "vertex-ai", ... }
    ]
})
```

**Problem:** Despite Bedrock being configured as "primary", ALL legitimate traffic goes through Google Vertex (fallback), while attackers use Bedrock directly.

---

## Evidence of Credential Rotation Impact

### January 27, 14:51 UTC - AWS Credential Rotation

| Time | AWS Bedrock | Tinybird | Unauthorized % |
|------|-------------|----------|----------------|
| 14:00 | 320 | 63 | 80.3% |
| **15:00** | **1** | **31** | **-3000%** ← Rotation worked! |
| 16:00 | 744 | 276 | 62.9% ← Attackers back |
| 17:00 | 1,747 | 624 | 64.3% |

**Critical Finding:** Rotation blocked attackers for ~1 hour, then they obtained new credentials.

---

## Attack Vector Analysis

### Most Likely Scenarios (Ranked by Probability)

#### 1. **CI/CD Pipeline Compromise (HIGH PROBABILITY)**
- **Evidence:** Credentials compromised within hours of rotation
- **Mechanism:** GitHub Actions/deployment logs exposing environment variables
- **Investigation:** Review GitHub Actions logs from Jan 27, 15:00-16:00 UTC

#### 2. **Portkey Gateway Compromise (MEDIUM-HIGH)**
- **Evidence:** Custom gateway at `rubeus.thomash-efd.workers.dev`
- **Mechanism:** Gateway logging/leaking credentials to external service
- **Investigation:** Audit Cloudflare Workers logs and code

#### 3. **Supply Chain Attack (MEDIUM)**
- **Evidence:** Timing correlates with new Bedrock integration
- **Mechanism:** Malicious npm package exfiltrating environment variables
- **Investigation:** Audit dependencies added around Jan 12

#### 4. **SOPS/Secret Management Compromise (MEDIUM)**
- **Evidence:** Quick re-compromise after rotation
- **Mechanism:** Decrypted secrets cached in accessible location
- **Investigation:** Check for exposed decrypted files, git hooks

#### 5. **Insider Threat (LOW-MEDIUM)**
- **Evidence:** Targeted attack on expensive models only
- **Mechanism:** Repository access, compromised developer machine
- **Investigation:** Audit access logs, check for unusual account activity

---

## Immediate Recommendations

### CRITICAL - Do Within 24 Hours

1. **Create NEW AWS IAM User**
   ```bash
   # Don't just rotate keys - create entirely new IAM user
   # Delete the old IAM user completely
   # Add IP restrictions to only allow your server IPs
   ```

2. **Enable AWS CloudTrail**
   ```bash
   # Track WHO is using the credentials
   # Check source IPs, user agents, and API patterns
   aws cloudtrail create-trail --name bedrock-audit-trail
   ```

3. **Implement Request Signing**
   - Add HMAC-SHA256 signing at enter.pollinations.ai gateway
   - Reject all unsigned requests at text.pollinations.ai
   - This prevents credential use outside your infrastructure

4. **Disable Direct Bedrock Access Temporarily**
   ```javascript
   // In modelConfigs.ts, comment out Bedrock, use only Vertex
   // This stops the bleeding while investigating
   ```

### HIGH PRIORITY - Do Within 48 Hours

5. **Audit GitHub Actions Logs**
   ```bash
   # Check for exposed credentials in workflow logs
   gh run list --limit 100 --json conclusion,createdAt,displayTitle,headBranch
   ```

6. **Review Cloudflare Workers**
   - Audit `rubeus.thomash-efd.workers.dev` code
   - Check for external API calls
   - Review access logs

7. **Dependency Audit**
   ```bash
   npm audit
   npm ls | grep -E "added|modified" # Check recent additions
   ```

### MEDIUM PRIORITY - Do Within 1 Week

8. **Implement Credential Vault**
   - Move from environment variables to AWS Secrets Manager
   - Use IAM roles instead of access keys where possible
   - Implement automatic rotation

9. **Add Anomaly Detection**
   - Set up CloudWatch alarms for unusual API patterns
   - Alert on high-cost model usage spikes
   - Monitor for requests from unexpected IPs

10. **Security Audit**
    - Professional penetration testing
    - Code review of secret handling
    - Supply chain security assessment

---

## Monitoring Queries

### Check Current Attack Status (Tinybird)
```sql
-- Last 24h unauthorized traffic estimate
SELECT
    toStartOfHour(start_time) as hour,
    COUNT(*) as calls,
    SUM(token_count_prompt_text) as input_tokens
FROM generation_event
WHERE start_time >= now() - INTERVAL 24 HOUR
    AND model_used LIKE '%opus%'
GROUP BY hour
ORDER BY hour DESC
```

### Check AWS CloudWatch
```bash
# Get current Bedrock usage
aws cloudwatch get-metric-statistics \
  --namespace AWS/Bedrock \
  --metric-name Invocations \
  --dimensions Name=ModelId,Value=global.anthropic.claude-opus-4-5-20251101-v1:0 \
  --start-time $(date -u -v-24H +%Y-%m-%dT%H:%M:%SZ) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \
  --period 3600 \
  --statistics Sum \
  --region us-east-1
```

### Calculate Discrepancy
```python
# Compare AWS vs Tinybird to measure ongoing attack
aws_total = 19612  # From CloudWatch
tinybird_total = 6952  # From Tinybird
unauthorized = aws_total - tinybird_total
print(f"Unauthorized usage: {unauthorized} calls ({unauthorized/aws_total*100:.1f}%)")
```

---

## Long-term Recommendations

1. **Zero Trust Architecture**
   - Never trust requests based on credentials alone
   - Implement multiple layers of authentication
   - Use short-lived tokens instead of long-lived credentials

2. **Principle of Least Privilege**
   - Separate IAM users for each service
   - Minimal permissions per user
   - Regular permission audits

3. **Enhanced Monitoring**
   - Real-time cost monitoring
   - Automated anomaly detection
   - Daily cost reports with alerts

4. **Incident Response Plan**
   - Document credential rotation procedures
   - Establish escalation protocols
   - Regular security drills

---

## Appendix A: Historical Attack Pattern

![Historical Analysis](./opus_historical_analysis.png)

Key findings:
- No AWS Bedrock usage before January 12
- Attack started immediately after Bedrock integration
- Daily escalation from 1,044 to 29,863 unauthorized calls

## Appendix B: Credential Rotation Impact

![Rotation Impact](./credential_rotation_impact.png)

Key findings:
- Rotation at 14:51 UTC blocked attackers
- By 16:00 UTC, attackers had new credentials
- Suggests automated credential extraction

---

## Contact Information

For questions about this report or to provide additional information:
- Security Team: [security@pollinations.ai]
- Incident Response: [Use internal escalation]
- AWS Support Case: [Open HIGH priority case]

---

**Report Generated:** January 28, 2026, 20:45 UTC
**Next Update:** January 29, 2026, 09:00 UTC
**Classification:** CONFIDENTIAL - INTERNAL USE ONLY

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-28 | Security Analysis | Initial report |

---

END OF REPORT