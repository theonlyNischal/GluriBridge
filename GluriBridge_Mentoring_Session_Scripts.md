# GluriBridge — Mentoring Session Speaker Script

Companion to `GluriBridge_Mentoring_Session.pptx` (15 slides). Written for a ~30-minute
session — each slide lists a target time; actual pacing will vary with questions. Every
number spoken here matches the number on the slide exactly (both were pulled live from
the running system at build time) — nothing here should be read as needing a caveat
beyond what's already stated on the slide itself.

---

## Slide 1 — Title (≈30 sec)

"Thanks for the time today. I want to walk you through GluriBridge — what it does in one
line is right here: it's an evidence-backed partner-discovery pipeline, built for Gluri's
Indonesia forest-carbon pilot. Everything I'm about to show you is live — pulled from the
actual running system this morning, not a slide deck written from memory. Let's get into
it."

## Slide 2 — Gluri, the client (≈45 sec)

"First, quick context on who this is for. Gluri is a two-person startup out of Busan. Their
product is treXchange — satellite and AI-based forest-carbon dMRV, that's digital
measurement, reporting, and verification. They're preparing their first real proof-of-concept
in Indonesia, and they're doing this as part of Theme 2, Forestry and Ocean ESG, in the I'm
in Busan Impact Hackathon. So — two people, a real technical product, and a country they've
never operated in before. That last part is where the problem starts."

## Slide 3 — The problem (≈1.5 min)

"This is the problem in the client's own words, not our interpretation. The organizer framed
it simply: they measure and verify forest carbon with satellites and AI, but abroad, they
can't check the rules, the pilot conditions, or find local partners. When we asked Gluri
directly, here's what they told us. No existing candidate list. No trusted starting source.
No fixed target region or organization type. And this is the important one — the hardest
part isn't even finding candidates, it's judging whether a real point of collaboration
actually exists. They told us exactly what a useful shortlist needs: name, location, a
reason, a contact point, required permits, next questions — and critically, a label on every
claim distinguishing a confirmed fact from an inferred hypothesis. That single requirement is
why every rule in this system tags its output fact or hypothesis — it's not a design
preference, it's a direct spec requirement. And scope-wise: Indonesia is priority, not
exclusive — India and Nepal are admissible if genuinely stronger, though that's not built yet.
The organizer's own diagnosis, in Korean, translates to: judging hidden conditions — like
land rights and demand — is the core difficulty. That's exactly why land-rights evidence is
built into this pipeline as a first-class input, not an afterthought."

## Slide 4 — Solution overview (≈1.5 min)

"So here's the actual pipeline, top to bottom. On real data, on a schedule — SRUK and Verra
refresh daily, SRN-PPI monthly, BRWA manually, since it barely changes. Four inputs feed in:
SRUK plus SRN-PPI, which are Indonesia's carbon registries; Verra, the international
standard; BRWA, the land-rights registry covering 2,283 real customary territories; and
Tavily web search, which I want to call out specifically — it's drawn separately here on
purpose, in a different color, because it's a parallel discovery input, not just a
verification step. It feeds new candidates into the exact same pool the registries do.
Everything gets normalized into one shared schema, then goes through identity resolution —
real fuzzy matching across org name, description, and geography, with conflict detection, not
just 'first match wins.' Then we attach BRWA land-rights evidence — and this is a subtle but
important design choice: a customary territory is a fact about a place, it's never treated as
its own candidate. From there: scoring, a compliance check against real Indonesian
regulation, then dossier and bilingual outreach generation. All of that lands in a real
FastAPI plus SQLite backend, which serves the React frontend you'll see in a few slides."

## Slide 5 — Data sources (≈1.5 min)

"Here's exactly what's behind each of those boxes, with real counts pulled live just now.
SRUK: 92 raw project records. SRN-PPI: 191. Verra: 1,976 AFOLU-filtered projects out of
5,281 total listed — AFOLU is their land-use category, so that filter is already cutting
down to what's actually forestry-relevant. BRWA: 2,283 real customary territories, 1,756 of
those with usable geometry, that's 77 percent — and I'll come back to that number, it's a
real ceiling, not a work-in-progress gap. And Tavily: 146 real search queries run, which
produced new candidates and corroborations you'll see two slides from now. The right column
shows how many of our 144 final candidates each source actually contributed to.

One more real detail on BRWA specifically, since it's the least familiar source: every
territory carries two independent real axes — a policy tier, which is either 'penetapan,' a
specific government determination and the strongest standing; 'pengaturan,' a general
regional regulation, weaker; or 'belum ada,' no policy document at all — and separately, a
verification maturity of early, mid, or advanced, which is BRWA's own internal process
rating. Neither of those is guessed from document text; both come straight from BRWA's own
list-level classification."

## Slide 6 — How scoring works (≈1 min)

"This is probably the single most important design decision in the whole system. We score
two things, and we never combine them into one number. need_score is how much of a real
documentation or verification gap exists — that's the opportunity for Gluri. credibility_score
is how mature and confirmed the project already is. And I want to be really explicit: a
high-credibility, low-need project is not a bad candidate. It's a correctly-scored mature
partner. Here's the real contrast, live from the database right now. Katingan Peatland
Restoration — need score 11.1, credibility 88.2. Almost no gap, extremely mature — labeled
'Confirmed.' Compare that to this real candidate in Papua Tengah — need score 100, credibility
41.2 — labeled 'Opportunity.' Same system, two genuinely different real projects, and neither
number is 'worse.' They're just answering different questions."

## Slide 7 — How compliance works (≈2 min)

"Compliance is checked against Permenhut 6 of 2026, the actual regulation governing forest-
carbon trading in Indonesia. It encodes 25 real rules. Today, 4 are wired into live scoring —
Pasal 61, Pasal 10, Pasal 6(1), and Pasal 20. The other 21 aren't silently skipped — each one
is flagged with the specific reason it isn't evaluable yet against the fields we have. Here's
a real live example of the math, computed this morning, not looked up from an old run: this
same Papua Tengah candidate was registered November 6th, 2025 — before the April 13th, 2026
effective date — which means its Pasal 61 reporting deadline is October 13th, 2026. As of
today, that's 46 days away. This candidate is one of 53 real candidates, out of 144 total,
facing this exact transitional deadline.

Quickly, on the other three wired rules, so 'wired' doesn't stay an abstract word: Pasal 10
checks that a business actor actually holds a real Unit Karbon — either the domestic SPE GRK
scheme, or the international non-SPE GRK scheme — before it can trade carbon at all. Pasal
6(1) checks eligibility against five real legal categories of business actor defined in the
regulation, things like forest-utilization license holders and customary-law communities
with a formal forest-adat determination. And Pasal 20 is specifically the international-track
equivalent of the domestic DRAM document — it uses a DPP instead — which matters because a
Verra-track candidate missing a DRAM is not a documentation gap, it's just on the other
track, and our need-detection logic knows the difference."

## Slide 8 — Dossier and outreach (≈1.5 min)

"Every dossier and every outreach email this system generates comes from a deterministic
template — there is no LLM anywhere in this step. Every single sentence traces back to a
specific real field or rule; nothing is generated freeform. Every claim is tagged fact or
hypothesis, per Gluri's own requirement. Every citation points to a real source document.
Outreach is bilingual, English and Indonesian, and the hedging language — the wording that
signals 'this is inferred, not confirmed' — was verified sentence by sentence in both
languages. And when contact information is incomplete, the system says so honestly instead of
inventing an email address. Here's Katingan's real example: the dossier states, word for
word, that registration is actively progressing, tagged as a fact, citing the registry's own
step statuses. And its real contact on file is Asep Ayat at PT Rimba Makmur Utama — but the
system knows it only has a name, no email, so it surfaces an honest 'needs manual lookup'
warning instead of guessing an address. Why no LLM here at all? Three reasons: auditability,
zero hallucination risk, and it's cheap to re-run at any scale."

## Slide 9 — Web discovery verification (≈1.5 min)

"I want to spend real time on Tavily specifically, because 'we used a web search API' can
sound hand-wavy without evidence it actually works. To be clear on role first: Tavily is a
discovery and corroboration input, not a primary registry — every hit it finds still goes
through the exact same normalize, identity-resolve, and score pipeline as registry data. Now
the real numbers: 146 queries run, 685 hits processed, 114 of those corroborated candidates
we already had, and 16 became entirely new candidates we wouldn't have found otherwise. And
here's proof this was actually tested, not just assumed to work: during hardening, we found a
real bug. Fuzzy org-name matching alone risked merging two genuinely different, unrelated
Indonesian foundations that happened to share a naming template — 'Yayasan Meramu Alam
Nusantara' versus 'Yayasan Konservasi Alam Nusantara' — which scored 83.87 on name similarity
alone. We fixed it by requiring real content corroboration — the actual district or province
name, or a distinctive project keyword, genuinely present in the article text — before
accepting any match in that high-risk score band."

## Slide 10 — Real numbers snapshot (≈1 min)

"Here's the system's full real state, right now, not a projection. 144 total candidates — 128
rich, meaning well-documented, 16 thin, meaning news-derived with less on file. 85 have a
resolved contact — 83 with an actual name, 2 with just an organization-level contact. 59
genuinely don't have enough contact information yet, and that's shown honestly as a gap, not
hidden. 53 candidates are flagged amber for an approaching Pasal 61 deadline; 91 have no
applicable compliance rule triggered. BRWA geometry coverage sits at 1,756 of 2,283 — that
77 percent is a real ceiling for this data source, confirmed by re-crawling, not a number
still climbing. 11 candidates have a confirmed land-rights overlap with a specific real
territory. And by source: SRUK contributes 87 of our candidates, Verra 47, News and Tavily
16, Tavily's own contact lookup 2, and SRN-PPI 1 — note candidates can carry more than one
source when they're confirmed across registries."

## Slide 11 — Where we stand (≈1 min)

"This is the actual product, screenshotted from the running app this morning — not mockups.
The Dashboard gives one real snapshot: total candidates, the need-versus-credibility matrix,
a live map of every candidate location plus real BRWA territory overlaps, and a province
breakdown. Candidate Detail — here shown for Katingan — is where the evidence lives: the
two score cards, fact-and-hypothesis-tagged reasoning, land rights, and a suggested next
step. Territory Discovery is the map-first view, letting you filter candidates by province,
need, credibility, or land-rights status, and see which real BRWA territories have confirmed
candidate activity. And Partnerships is where outreach status actually gets tracked — a real
status, a note, and a full timestamped history per candidate."

## Slide 12 — Tech stack (≈30 sec)

"Nothing exotic here on purpose. Frontend is React, Vite, TypeScript, and Tailwind, covering
the four pages you just saw. Backend is FastAPI, SQLite, and Python, with a background
scheduler handling the real per-source refresh cadence — SRUK and Verra daily, SRN-PPI
monthly, BRWA manually. Boring technology, deliberately, so the actual innovation — the
scoring and evidence logic — isn't fighting the infrastructure."

## Slide 13 — API cost (≈1 min)

"On cost, I want to be as honest here as everywhere else. We logged 146 real Tavily queries.
The client is configured for 'basic' search depth, which per Tavily's own published pricing
is 1 credit per call — so that's roughly 146 credits consumed, historically, not per month.
What I can't tell you is a dollar figure, and I want to say that plainly rather than guess:
this codebase has no billing or API-key access, so we can't see which actual Tavily plan or
tier is active. What I can say is that Tavily's public free tier is commonly 1,000 credits a
month, and 146 queries would fit comfortably inside that if that's the plan being used. But
that's a plan assumption, not confirmed billing data — and I'd rather tell you that clearly
than make up a number that sounds precise."

## Slide 14 — Next steps (≈1.5 min)

"Four real open items, each deliberately scoped rather than just left vague. Korean
localization: we scoped this at roughly 2 to 3 dev-days to make the UI chrome swappable —
labels, navigation, headers. The harder part is the dashboard's executive-summary sentences,
which need real templates that handle word order properly, not simple find-and-replace. And
to be clear, real candidate and evidence data stays untranslated regardless — we're not going
to paraphrase real source material into Korean and call it the same fact. This is deferred
until we confirm the need is real, not just assumed. Tier C contact resolution — extracting a
named contact from free-form news text — is deferred because it has no structural anchor to
verify against, unlike Tier B, which already took four hardening rounds to trust for just one
real candidate. LLM-based prose polish is deliberately not pursued yet, because today's
deterministic templates guarantee zero hallucination and full auditability, and any future
LLM layer would need to meet that same bar first. And India and Nepal — Gluri told us those
are admissible if genuinely stronger than an Indonesia candidate, but that's not built; this
pipeline is Indonesia-only today."

## Slide 15 — Optional: day to day (≈1 min)

"Last thing, just to ground this in how someone non-technical actually uses it day to day.
Open the Dashboard for one real snapshot of the whole pipeline. Go to Candidates and sort or
filter by need or credibility — never blended into one number — or by province, richness, or
land-rights status. Click into any candidate to see real evidence, land rights, the
compliance deadline, and a suggested next step. Generate the dossier and a bilingual outreach
email in one click, with real citations and honest warnings when contact info is incomplete.
And track real outreach status on the Partnerships page — contacted, follow-up needed, done,
or rejected — with a note and a full real history. That's the whole loop, end to end, and
every part of it is real, live data. Happy to take questions, or go deeper on any one slide."

---

**Total estimated speaking time: ≈17.5–20 minutes** at a natural, unhurried pace (~130
words/min) — verified by an actual word count of this script, not asserted. That leaves
roughly 10 of the 30 minutes for questions and discussion, which fits a *mentoring* session
better than a scripted monologue trying to fill the entire slot; expand any section verbally
if the room wants more depth on a specific slide.
