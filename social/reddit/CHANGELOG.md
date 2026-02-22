## Update [12-02-2026]

- Updated deploy.sh to accrpt setting the LINK and TITLE to the link.ts via a subroutine call
- Removed pipeline.ts execution for direct deployment mode
- Modified main.ts to read IMAGE_LINK and POST_TITLE from link.ts 
- Eliminated dependency on loadPrompts, and system_prompt for direct posting

## Update [03-02-2026]

- Added a new key type for finegrained control
- Updated the time logic for the last 24 hours PR pickup 
- Curated the loading of the PR summary to avoid overload


## Update [23-01-2026]

- Added Reddit integration to post generated images directly to a specified subreddit.
- Updated timer synchronization for 1-minute persistence intervals.
- Deployed updated link.ts and main.ts files.
- Fixed pipeline calling to reference latest file.
- Configured npx to use /usr/bin binary explicitly.
- Updated systemd service configuration for Reddit bot.
- Integrated new PROD pipeline code.
- Reorganized folder structure and added changelog tracking.
- Improved system prompt for Reddit-themed image generation.
- Implemented new prompt generation system.
- Refined styling for Reddit compatibility.
- Added bee level mascot to all posts.
- Merged main branch with latest updates.