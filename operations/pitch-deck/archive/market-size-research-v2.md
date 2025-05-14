🩹  How to fix the market story

1. Start bottom‑up, not buzz‑up

Metric	You can prove today	2027 believable stretch
Monthly active users	3 M (from 300 live apps)	25 M
Media units / user / month	33 (100 M / 3 M)	40
Impressions / media unit	5 % (conservative)	8 % with richer placements
Monthly ad impressions	15 M	80 M
eCPM (range)	€3–8 (contextual display/native)	€5–12 (richer formats, direct sales)
Gross ad € / month	€45 k–€120 k	€400 k–€960 k
Net to platform (‑15 % fees, ‑50 % rev‑share top tier)	€19 k–€51 k	€170 k–€410 k

Scale this curve, show three scenarios (low/base/high) and tie feature milestones (rich formats, mediation, direct sales) to moving from low to high eCPMs.

2. Re‑label TAM/SAM with accepted buckets
	•	TAM – Global mobile in‑app & web creator ad spend, ~ $150 B (eMarketer).
	•	SAM – Inventory accessible via SDK integrations (Unity+AppLovin analog), ~ $20 B.
	•	SOM – Gen‑AI app inventory you can realistically onboard in 3 years, track it as impressions, then convert to € using your eCPM ladder.

3. Validate benchmarks
	•	Quote Unity Ads, AppLovin MAX, Google AdSense ranges for eCPM and rev‑share (70 % to devs). Cite actual filings / eMarketer data.
	•	Show why early Gen‑AI canvas inventory should sit above banner CPMs but below rewarded‑video.

4. Tie compute cost to revenue per unit

Investors love when cost & revenue scale in the same denominator. Your cost per media (GPU) is €0.0005. Show break‑even eCPM graph:

Breakeven eCPM € = (Cost per media × 1 000) / (Ad show rate × impressions per media)

At 5 % show‑rate you need only ~€1 eCPM to pay the GPU; everything above is margin.

5. Kill the vanity “$3.4 B Gen‑AI ad segment”

Replace with a real wedge you already dominate: “15 M Gen‑AI ad impressions / month with no competing network today”.

⸻

🛠️  Concrete slide‑deck tweaks
	1.	One‑liner under headline:
“Pollinations turns 100 M Gen‑AI render events/month into ad inventory that pays for creators’ GPU bills.”
	2.	Market slide:
	•	Left column: Proven usage metrics → future scaling curve.
	•	Right column: CPM benchmarks table + sensitivity chart.
	3.	Financial model slide:
	•	Show three CPM tiers (€3 / €7 / €12) and resulting net margin.
	•	Annotate levers (richer ad formats, direct brand deals) that lift you to the next tier.
	4.	Proof slide:
	•	Case study: Roblox integration with 1.8 M MAU — run an A/B EBITDA snippet once ads switch on.
	5.	Risk slide:
	•	Add “CPM‑sensitivity” explicitly; show you survive at €3.

⸻

🚀  Where this positions you
	•	Comp story: “We’re Unity Ads for Gen‑AI micro‑apps; Unity scaled ads from 0 → $1.6 B in revenue with similar developer base.”
	•	Defensibility: GPU subsidy flywheel locks in creators before traditional ad networks notice the niche.
	•	Upside: Once GDP per render > cost per render, you can layer subscription or premium compute without cannibalising ads.

Nail the data hygiene, and the pitch shifts from hand‑wavy hype to “we already own valuable impressions; your capital turns them into cash‑flow.”



What that line on the market slide really says

“SAM — Inventory accessible via SDK integrations (Unity + AppLovin analog), ≈ $20 B.”

Think of it as the slice of global mobile‑in‑app advertising spend that an indie developer can unlock by dropping a few lines of code (an SDK) into their build—no direct sales team, no walled‑garden contracts, just plug‑and‑play demand from the big mediation/ad‑network pipes.

Below is the detail investors will expect.

⸻

1 / What counts as “SDK‑accessible inventory”?

✅ Included	❌ Excluded
Ads sold via mediation/monetisation SDKs such as AppLovin MAX, Unity Ads (Grow), ironSource, Vungle, Chartboost, Digital Turbine, Liftoff, Mintegral, etc. These SDKs sit inside tens of thousands of third‑party mobile games & utility apps.	Direct‑sold inventory on mega‑platforms (Meta, TikTok, YouTube), web display bought through DSPs, and CTV/OTT. Those require APIs or agency deals, not a lightweight SDK.
Typical client: a 2‑person studio shipping hyper‑casual games, or a solo dev with a Gen‑AI image app.	Fortune‑100 brand apps, social networks, or premium publishers that build their own ad tech.

The relevance for Pollinations: your Gen‑AI monetisation SDK plugs into the same place in the app stack where Unity Ads or AppLovin sit, so any budget that flows through those pipes is, in principle, serviceable by you.

⸻

2 / Where the ≈ $20 B figure comes from

We start with reported 2024 net ad revenues of the two dominant SDK networks, add a third public player, convert those net numbers to gross advertiser spend (because that’s what “inventory size” means), and round conservatively:

Platform (FY‑2024)	Net ad revenue	Typical take‑rate¹	Implied advertiser spend
AppLovin (MAX + AppDiscovery)	$3.22 B  ￼	~25 %	≈ $12.9 B
Unity (Grow Solutions)	$1.20 B  ￼	~25 %	≈ $ 4.8 B
Digital Turbine / AdColony / Fyber bundle	$0.54 B  ￼	~25 %	≈ $ 2.2 B
Subtotal	$4.96 B	—	≈ $19.9 B

(¹Public filings + sell‑side notes show these mediation networks keep 20‑30 % of advertiser spend as platform take; 25 % is a midpoint used by analysts.)

Add a very modest ~5 % cushion for the long‑tail of private SDK networks (Chartboost, Mintegral, ironSource‑only deals, etc.) and you round cleanly to ≈ $20 B in annual gross spend that literally passes through SDKs a dev can install in an afternoon.

For context, that’s ~10 % of total global mobile in‑app ad spend (eMarketer pegs mobile at $203 B in 2024 → $218 B in 2025)  ￼—so the number is both material and believable.

⸻

3 / Why “Unity + AppLovin analog” is the right comparison
	•	Same channel mechanics: Pollinations, like Unity Ads or MAX, sits on‑device, decides when to show an ad, and splits revenue with the developer.
	•	Indie‑heavy publisher base: Unity and AppLovin together power >80 % of the top‑grossing indie‑built mobile games. That’s the exact persona you’re courting in Gen‑AI tooling.
	•	Proof of wallet: Because advertisers already pour ~$18 B into those SDK pipes, you don’t have to invent a new budget line—just redirect a fraction toward Gen‑AI contexts.

⸻

4 / Take‑aways for your deck
	1.	Replace the throw‑away “~$20 B” with the table above so diligence teams can follow the breadcrumbs.
	2.	Cite net‑revenue filings + take‑rate logic to show the conversion is methodical, not hand‑wavy.
	3.	Call out that this SAM is already proven and growing (AppLovin ad revenue up 75 % YoY; Unity still >$1B even in a reset year).
	4.	Position Pollinations as “the Gen‑AI inventory layer those SDK buyers can’t reach today.”

Stick that on one slide and investors will instantly see (a) the pot of spend, (b) why it’s serviceable via a single SDK, and (c) how you sized it without inflating the numbers.