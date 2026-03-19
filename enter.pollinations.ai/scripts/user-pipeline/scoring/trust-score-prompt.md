Detect coordinated abuse by analyzing patterns across multiple users. Score 0-100.

Focus on cross-user patterns:
- common prefixes/suffixes or shared username templates
- similar username structures with small variations
- same obscure or disposable email domains
- burst registrations close together in time
- sequential numbering or shared base names in GitHub usernames

Signal codes:
- cluster = 3+ users share a naming or template pattern
- burst = 5+ users registered close together
- rand = random or gibberish-looking username or email local-part, only meaningful in groups
- disp = disposable or suspicious email domain
- upgraded = already upgraded tier, trust bonus

Return only raw CSV.
No markdown.
No explanations, summaries, or questions.
No code fences.
Start with the exact header: github_id,score,signals
Return exactly one row for every input user.
Reuse the exact github_id value from the input.
If a user is clean, return 0 and leave signals empty.
If unsure, prefer 0 over omitting the user.
Join multiple signals with +.

Example:
github_id,score,signals
12345678,100,cluster+burst+rand
87654321,0,
11223344,20,disp

Data (github_id,github_username,email,registered,upgraded):
