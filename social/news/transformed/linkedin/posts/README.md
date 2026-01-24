# LinkedIn Posts

This directory contains generated LinkedIn posts for Pollinations.ai.

## Post Format

Each JSON file contains:
- `date`: Post date
- `generated_at`: Generation timestamp
- `platform`: "linkedin"
- `post_type`: milestone | insight | behind_the_scenes | thought_leadership
- `hook`: First 1-2 lines (shows before "see more")
- `body`: Main content
- `cta`: Call to action
- `full_post`: Complete formatted post
- `hashtags`: Array of hashtags (3-5)
- `reasoning`: Why this angle was chosen
- `pr_references`: Source PRs
- `char_count`: Total character count

## Workflow

1. `linkedin-generate-post.yml` runs weekly (Mondays)
2. Creates PR with post JSON for review
3. On merge, `buffer-publish-post.yml` publishes via Buffer API

## Voice & Tone

- Professional but not boring
- Thought leadership focus
- Industry insights tied to our work
- Clear CTAs, 3-5 hashtags at end
