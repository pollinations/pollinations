# Discord Merged PR Announcer - User Prompt Template

--Merged PR Information--

Title: '{title}'
Branch: '{branch}'
{description_section}

The PR code changes:
======
{diff}
======

ANALYSIS TASK:
Analyze these code changes and create a user-facing Discord announcement for the Pollinations AI community.

REMEMBER: You're talking to USERS of the service, NOT developers!

FIRST: Determine the PR type based on file paths:
- **Core Platform** (API/backend/models): Focus on user-visible changes, bug fixes, new features
- **Community Project** (projects/examples/apps): Celebrate contributor, describe the project
- **Documentation** (README/docs/guides): Highlight what's easier to understand now
- **Infrastructure** (deploy/monitoring/CI): Only mention if users will notice performance/reliability improvements

THEN: Focus on USER IMPACT:
1. **What changed for users** - not how it was implemented
2. **Bug fixes they noticed** - "X now works", "Y is fixed"
3. **New features they can use** - be specific about what they can do now
4. **Performance improvements they'll feel** - "faster", "more reliable"
5. **Rate limit/quota changes** - VERY important to mention
6. **UI/UX improvements** - what looks or works better

SKIP:
- Backend refactoring (unless it fixes a user-facing bug)
- Database migrations (unless they improve user experience)
- Internal API changes (unless they break existing integrations)
- Code cleanup/organization
- Developer tooling

LENGTH GUIDANCE:
- **Default**: 150-400 chars (tight bullet points)
- **Only expand** if genuinely major update with multiple significant changes

MENTION HANDLING:
- Check if PR description contains "@mention" or "mention updates" or similar
- If YES: Start message with "Hey <@&1424461167883194418>! "
- If NO: Start directly with the summary (no mention)

Create a concise Discord message (raw text, not YAML/JSON) with:
- One-line summary
- Bullet points with emojis
- NO headings or sections
- Keep it tight and scannable
