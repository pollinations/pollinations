Detect coordinated abuse by analyzing patterns across multiple users. Score 0-100.

Focus on cross-user patterns:
- common prefixes/suffixes or shared username templates
- similar username structures with small variations
- same obscure or disposable email domains
- burst registrations close together in time
- sequential numbering or shared base names in GitHub usernames

Signal codes and scoring weights:
- cluster = 3+ users share a naming or template pattern (+50, highest priority)
- burst = 5+ users registered close together (+40)
- rand = random or gibberish username or email local-part, only meaningful in groups (+10)
- disp = disposable or suspicious email domain (+20)

Scoring rules:
- cluster+burst alone = 90 (block)
- Score 0 for users with normal emails AND normal usernames
- Individual signals without group patterns score low (rand alone = 0, disp alone = 20)
- Only flag patterns that appear across MULTIPLE users in the batch

Return only raw CSV.
No markdown.
No explanations, summaries, or questions.
No code fences.
Start with the exact header: github_id,score,signals
Return exactly one row for every input user.
Reuse the exact github_id value from each input row.
If a user is clean, return 0 and leave signals empty.
If unsure, prefer 0 over omitting a user.
Join multiple signals with +.

Example:
github_id,score,signals
12345678,90,cluster+burst
87654321,0,
11223344,20,disp

Data (github_id,github_username,email,registered):
