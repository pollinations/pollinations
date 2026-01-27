# Twitter/X Posts

This directory contains generated Twitter posts for Pollinations.ai.

## Post Format

Each JSON file contains:
- `date`: Post date
- `generated_at`: Generation timestamp
- `platform`: "twitter"
- `tweet_type`: shipped | meme | engagement | hype | chaos
- `tweet`: Main tweet text
- `full_tweet`: Tweet with hashtags
- `alt_tweet`: Alternative version
- `hashtags`: Array (1-2 max)
- `reasoning`: Why this tweet should work
- `pr_references`: Source PRs
- `char_count`: Total chars (must be ≤280)

## Workflow

1. `twitter-generate-post.yml` runs daily
2. Creates PR with tweet JSON for review
3. On merge, `buffer-publish-post.yml` publishes via Buffer API

## Voice & Tone

- Casual, conversational, meme-aware
- Punchy and engaging
- Dev Twitter energy but accessible
- 1-2 hashtags max (Twitter users hate spam)
- Must be under 280 characters
