# TODO: Migrate Instagram & Discord to Social

Follow-up work to consolidate remaining social media automation into this folder.

## Workflow Naming Convention

Rename remaining workflows to `NEWS_*` pattern:

- [ ] `instagram-generate-post.yml` → `NEWS_Instagram_generate_posts.yml`
- [ ] `instagram-publish-post.yml` → `NEWS_Instagram_publish_posts.yml`
- [ ] `discord-post-merged-pr.yml` → `NEWS_Discord_post_merged_pr.yml`
- [ ] `discord-post-weekly-news.yml` → `NEWS_Discord_post_weekly_news.yml`
- [ ] `pr-create-weekly-news.yml` → `NEWS_create_weekly_news.yml`
- [ ] `pr-create-highlights.yml` → `NEWS_create_highlights.yml`
- [ ] `pr-update-readme.yml` → `NEWS_update_readme.yml`

## Instagram

Currently in `.github/scripts/`:
- `instagram_generate_post.py`
- `instagram_publish_post.py`

### Tasks

- [ ] Extract Instagram prompts to `social/prompts/instagram/`
- [ ] Move scripts to `social/scripts/`
- [ ] Refactor to use `common.py` shared utilities
- [ ] Update workflow paths in `.github/workflows/instagram-*.yml`
- [ ] Add Instagram section to `AGENTS.md`

## Discord

Currently in `.github/scripts/`:
- `discord_post_weekly_news.py`
- `discord_post_merged_pr.py`

### Tasks

- [ ] Move scripts to `social/scripts/`
- [ ] Refactor to use `common.py` where applicable
- [ ] Update workflow paths in `.github/workflows/discord-*.yml`
- [ ] Add Discord section to `AGENTS.md`

## Documentation Cleanup

- [ ] Remove Reddit, Twitter, LinkedIn sections from `.github/docs/NEWS-SOCIAL.md`
- [ ] Keep only weekly news pipeline info in GitHub docs (or move entirely)
- [ ] Delete this TODO.md when complete
