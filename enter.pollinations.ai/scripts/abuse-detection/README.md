# Abuse Detection

LLM-based abuse detection using scoring (0-100 points).

## Usage

```bash
cd enter.pollinations.ai

# Test with mock data (no API calls)
npx tsx scripts/abuse-detection/detect-abuse.ts --dry-run

# Analyze last 7 days
npx tsx scripts/abuse-detection/detect-abuse.ts --days 7

# Full analysis (default: 30 days, 5000 users max)
npx tsx scripts/abuse-detection/detect-abuse.ts
```

## How It Works

1. **Fetch users** from D1 database
2. **Score with LLM** using overlapping chunks (catches sequential patterns)
3. **Assign actions** based on thresholds
4. **Export CSVs** for operations team

## Scoring

The LLM assigns 0-100 points. Higher = more suspicious.

**Common patterns:**
- Disposable email domains (+30)
- Sequential GitHub usernames (+35)
- Burst registrations (+40)
- Email variations (+30)
- Paid tier (-25, likely legitimate)

## Actions

| Score | Action | Description |
|-------|--------|-------------|
| 80-100 | 🔴 Block | Review immediately |
| 60-79 | 🟡 Review | Manual verification |
| 30-59 | 🟠 Monitor | Watch activity |
| 0-29 | 🟢 OK | Normal user |

## Output Files

- `abuse-scores.csv` - All users with scores
- `abuse-actions.csv` - Only actionable items
- `dry-run-*` prefix when testing

## Options

```bash
--dry-run         # Test mode with mock data
--days N          # Look back N days (default: 30)
--limit N         # Max users to analyze (default: 5000)
--chunk-size N    # Users per API call (default: 300)
```

## Why This Works

- **381 lines** instead of 1800
- **Semantic understanding** - catches patterns humans would spot
- **Overlapping chunks** - detects sequential abuse across boundaries
- **CSV format** - minimal token usage (~$0.10 per 5000 users)
- **Easy to tune** - just edit the prompt