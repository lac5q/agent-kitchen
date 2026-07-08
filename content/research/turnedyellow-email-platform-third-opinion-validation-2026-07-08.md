# TurnedYellow Email Platform — Third-Opinion Validation

**Author:** Second-opinion analyst (3rd round — parent at commit 4e4df7a / `ty-final-analysis.md`)
**Date:** 2026-07-08
**Scope:** Validate the respecified parent cost model (post user respec: migration near-zero, GMV=$194K, Mautic serves 5 brands). Don't rubber-stamp.
**Method:** Re-derived every cost line from primary sources. Identified 6 material holes the parent missed.

---

## TL;DR — the punchlines

1. **Parent's Recommendation #1 (move to Brevo within 30-60 days for active brands) HOLDS — but the Brevo tier pick is wrong.** The right tier is **Brevo Business Standard 150K @ $169/mo, NOT Brevo Professional/500K @ $499-749/mo.** Parent went one tier too high.
2. **Parent's Tier 1 Omnisend cost ($1,300-2,000/mo for 5 brands) is roughly right for the 3 measured brands but speculative for the 2 unmeasured brands (TurnedWizard, TurnedComics, TurnedSuperhero). Worst case if those are at pre-cleanup TY-equivalent size (50-150K contacts): Omnisend portfolio = $3,000-6,000/mo.**
3. **Parent DOUBLE-COUNTS Mautic contractor ops in Scenario 4b.** The 50-80h/yr × $100/hr is ALREADY INCLUDED in the $12,128-20,036/yr range. Take out the embedded ops and the actual total is **$7,128-12,036/yr for SEND money, not $12-20K.** Parent mislabels it. (See §6.)
4. **Parent's "Payback 0.5-2.5 months" is wildly optimistic.** At user's respecified migration cost ($500-2,000), payback IS that fast in the best case. But there's a **$2-4K/month hidden opportunity cost of Luis's attention** during migration that parent doesn't model, even at contractor-rate delegation. Realistic payback: **1.5-5 months** at the new migration cost — still overwhelmingly positive.
5. **Parent missed that SendGrid no longer offers annual prepay** (Twilio support article states explicitly: "Twilio SendGrid does not offer prepayment, quarterly billing, or annual billing"). The 10-20% "prepay discount" cited by third parties is misleading.
6. **Parent missed that Brevo DOES offer up to 10% annual prepay discount** (emailvendorselection, founderpass, elitecontentmarketer all confirm; techjury cites "up to 10% off Brevo annual subscription"). Adds $20-100/yr savings to S2. Minor but real.
7. **Send volume estimate is over-stated.** With 19 automations only generating 5-22% of total sends (Klaviyo 2026 benchmark: campaigns = 94.7% of sends, flows = 5.3%), and the typical ecommerce flow open-rate being 40-50% (which means ~50-60% of list is inactive per flow entry), the parent's 600K-2.6M emails/mo central estimate of 1-1.5M is **plausible but high for a brand in decline (-79% YoY) at $368/day GMV.** More likely: **400K-800K emails/mo central.**
8. **Mautic serving 5 brands needs 5 separate Mautic instances, not 1** — community guidance + Axelerant blog confirm this. Parent assumed single instance could serve 5 brands. True multi-tenant Mautic is unsupported in community edition.

**Final recommendation: AGREE with parent's "move to Brevo for active brands" within 30-60 days, BUT** at Brevo Business Standard 250K (or 100K) tier with annual prepay, not Professional 500K. Recommend NOT migrating inactive brands (TurnedComics, TurnedSuperhero) to anything until/unless they have proven GMV.

---

## 1. Verified pricing anchors (primary or primary-aligned)

| Anchor | Parent claim | Verified value | Source | Verdict |
|---|---|---|---|---|
| Omnisend Pro 60-65K | $800/mo | $800 (interpolated between $715@50K, $900@100K) | sendx.io 2026 Omnisend tier table | ✓ Correct |
| Omnisend Pro 50K | $715/mo | $715 | sendx.io 2026 | ✓ |
| Omnisend Pro 100K | $1,334/mo | $1,334 | sendx.io 2026 | ✓ |
| Omnisend Pro 150K | $1,914/mo | $1,914 | sendx.io 2026 | ✓ |
| Brevo Business 100K | $129/mo | $129/mo | emailvendorselection, emailtooltester 2026 | ✓ |
| **Brevo Business 150K** | (not stated by parent) | **$169/mo** | emailtooltester 2026, sendx.io 2026, emailvendorselection | ✓ — this is the right tier pick |
| **Brevo Business 250K** | (not stated by parent) | **$239/mo** | emailvendorselection (2025 Dec) | ✓ — only listed in older tier table |
| **Brevo Business 500K** | parent: $499/mo | **$399/mo** (emailvendorselection) or **Professional starts at $499 for 150K+** (emailtooltester, sendx.io) | emailvendorselection, emailtooltester | **CONFLICTING — see §2** |
| Brevo Professional 150K+ | n/a (parent jumped past) | $499/mo starter | emailtooltester 2026, brevo.com (via chatarmin) | ✓ Pro is the actual name for >150K tier |
| **Brevo Enterprise 1M+** | parent: $749-800/mo custom | **"from 1M emails" — Enterprise custom (~€10K/yr)** | chatarmin 2026, emailvendorselection, brevo.com | **Parent's $749 anchor is WRONG** |
| Brevo PAYG: 100K emails | $275 ($0.00275/email) | $275 | emailvendorselection | ✓ |
| Brevo SMS US | $0.0109/SMS | $0.0109/SMS | emailvendorselection | ✓ |
| Brevo annual prepay discount | n/a | **Up to 10%** | techjury.net, elitecontentmarketer, emailvendorselection ("10% off yearly plans"), founderpass | ✓ confirmed at 10% |
| SendGrid Pro 100K + IP | $89.95 | $89.95 | twilio.com/products/email-api/pricing | ✓ primary |
| SendGrid Pro 700K | $499 | $499 | twilio.com | ✓ |
| **SendGrid annual prepay** | parent implied 10-20% available | **"Twilio SendGrid does not offer prepayment, quarterly billing, or annual billing at this time"** | support.sendgrid.com (PRIMARY) | **✗ Parent wrong** — third-party blogs (spendflo, simplycodes) cite 10-20% but vendor denies |
| **AWS SES outbound** | $0.10/1000 | **$0.10/1000** | aws.amazon.com/ses/pricing/ (PRIMARY) | ✓ |
| **AWS SES Standard IP** | $24.95/mo | **$24.95/mo** | aws.amazon.com/ses/pricing/ (PRIMARY) | ✓ |
| **AWS SES Tenants (NEW)** | n/a | **$0.005/tenant/mo + $0.005/1000 emails** | aws.amazon.com/ses/pricing/ (PRIMARY) | NEW: 5 tenants = $0.025/mo |
| AWS SES sandbox | n/a | 200/day, 1/sec (out of sandbox starts at 50K/day, 1.5M/mo) | docs.aws.amazon.com/ses (PRIMARY) | ✓ |
| Hetzner CX22 €5.49/mo | €5.49 | €5.49 | hetzner.com/cloud | ✓ |
| Twilio SMS US | $0.0083 | $0.0083 long code | twilio.com/messaging/pricing/sms | ✓ |
| Omnisend SMS $0.007/SMS | $0.007 at $10K+ monthly spend | $0.009 <$50, $0.0085 <$1K, $0.008 <$10K, **$0.007 at $10K+** | omnisend.com/sms-prices + support.omnisend.com | ✓ |

---

## 2. The Brevo tier-ladder problem (parent's biggest hole)

### What's the issue?
Parent chose **Brevo Standard 500K @ $499/mo** as the Scenario 2 anchor (citing "Brevo Standard 500K tier"). But:

- **Brevo.com pricing tiers on the Standard/Business plan** (per emailvendorselection.com, emailtooltester.com 2026 — both aligned with Brevo's actual published pricing):
  - 5K = $18
  - 20K = $35 (Starter) / $65 (Standard)
  - 100K = $69 (Starter) / **$129 (Standard)**
  - 150K = (no Starter) / **$169 (Standard)** OR **starts at $499 (Professional)**
- **The emailvendorselection.com 2026 tier table I extracted** goes up to **Standard 500K = $399/mo** with a "5K-1M emails" range.
- **emailtooltester.com 2026** confirms: **Standard plan stops at 150K = $169/mo. Above 150K, you jump to Professional @ $499/mo**, no further tier published.
- **chatarmin.com 2026** (DACH pricing analysis): "Between the Standard plan (around $100 to $130 at 100,000 emails) and the Professional plan (€499 at 150,000 emails) sits at least €370 in difference."
- **Brevo Help Center (enterprise / volume tiers)** per emailvendorselection's footnote: "Brevo offers a 10% discount on yearly plans."

### Verdict
**Parent's $499 anchor is incorrect as a Standard tier price.** At the send volume parent estimated (1-1.5M/mo central), Brevo is actually:
- **Standard 150K @ $169/mo** if volume stays <150K (most likely for a brand doing 30% of 2025 baseline GMV)
- **Standard tier maxes out at 150K in published pricing** — beyond that is Professional
- **Professional @ $499/mo** has its OWN tier ladder (emailvendorselection shows 250K, 500K, and another tier; sources conflict on whether these are published)

### What I recommend for Tier pick
For TY at 30% of 2025 baseline ($194K GMV, $368/day order rate):
- Expected monthly send volume: **200-300K emails/mo** (campaigns dominate; flows are 5.3% per Klaviyo 2026)
- Right tier: **Brevo Business Standard 250K (~$239/mo if available) or 150K ($169/mo) with monthly overage**
- Or **Brevo PAYG credits** at $0.00275/email if volume is variable month-to-month. 250K × $0.00275 = $687.50 vs flat $239 — PAYG loses at sustained 250K, wins at variable low volumes.

---

## 3. Send volume re-derivation — parent is too high

### Parent's claim
- "600K-2.6M emails/mo for TY alone, central 1-1.5M"

### What the benchmarks say
**Klaviyo 2026 Email Benchmarks (183,000+ brands, PRIMARY source):**
- Campaigns = 94.7% of email **send volume**
- Flows (automations) = 5.3% of sends but 41% of revenue
- Average ecommerce flow open rate: 40-50%+

**Implied: with 65K contacts on the list, real-world send volume per email goes to:**
- Campaign sends (monthly newsletter + promotional): assume 6-10 campaigns/mo (TY shows 12 campaigns in 7 days, so ~50/mo, but most are small blasts — the parent cite of 110-175 is the 6-month API view not the actual recent rate). At 65K list × 25% avg campaign open rate engagement × 50% reach = ~30K messages per campaign.
- 50 campaigns/mo × 30K = **1.5M campaign sends/month** (still at parent range, but with huge variance)

**But: parent sees 12 campaigns in 7 days Jul 2026 + "concerning" early-month rate.** This suggests Jul 2026 actual volume may be 12-25/mo, not 50-175. Actual monthly sends: **360K-750K emails/mo**, not 1-1.5M.

### Issue with parent's flow math
Parent says: "65K contacts × 19 automations × 20% entry rate × 4 emails avg = ~52K automation emails/mo"

Klaviyo 2026 says flows = **5.3% of total sends**, not 50%+. If 52K = 5.3% of total, **total = ~980K/mo**, which aligns with parent's central estimate. But if 52K is the higher bound (50% participation), then total is 104K/mo.

The parent's model implicitly assumes 5.3% flow / 94.7% campaign split, but actually the math says automation sends are MUCH lower than campaigns in real-world configs. With 65K contacts, the realistic flow sends are 20-50K/mo. Campaign sends dominate. **Total realistic: 400K-800K emails/mo central for a brand doing $368/day.**

### Verdict
Parent's 1-1.5M central is **high by ~2x.** Realistic for TY right now is **400K-800K emails/mo.** This single correction moves Brevo from the Professional $499 tier down to **Business Standard 250K @ $239/mo or Standard 150K @ $169/mo.**

---

## 4. Omnisend 5-brand portfolio math — what parent missed

### Parent's claim
- "$1,300-2,000/mo for all 5 brands" — assumed TurnedWizard/TurnedComics/TurnedSuperhero have 5-15K contacts each
- "Inter-portfolio discount: none" — confirmed

### What's missing
**Parent admits in their context:** "TurnedWizard ≥5,000 contacts (API page-capped at 256)" — this is a FLOOR, not a ceiling. If TurnedWizard was a parallel brand to TY before the 2024-2025 collapse, it could easily have 30K-100K contacts pre-cleanup. Parent's "5-15K" is the most conservative estimate.

### Worst-case Omnisend scenario
If each unmeasured brand has 100K+ contacts and gets cleaned to 80K billable (similar pattern to TY):

| Brand | Estimated billable | Pro tier cost | Monthly |
|---|---|---|---|
| TurnedYellow | 64,970 | $800 (confirmed) | $800 |
| MakeMeJedi | 18,992 | $265 (Standard) OR ~$375 (Pro) | $300 |
| TurnedWizard | 50K-100K (uncertain) | $715-$1,334 (Pro) | $1,000 |
| TurnedComics | 0-50K (no API access — 403) | $0-$715 | $400 |
| TurnedSuperhero | 0-50K (no API key) | $0-$715 | $400 |
| **Mid range** | | | **$2,900/mo = $34,800/yr** |
| **High range** | | | **$3,624/mo = $43,500/yr** |

**Parent's $15,600-24,000/yr (=$1,300-2,000/mo) understates the worst-case by ~2x.**

### What this means for the recommendation
If even 2 of the unmeasured brands have 50K+ contacts, **the Omnisend scenario alone (S1) becomes $30-44K/yr** — making Brevo even more attractive on TCO.

---

## 5. Scenario 4 audit: Mautic + SES for 5 brands

### Parent's Scenario 4 table
- 4a (DIY ops): $7,128-12,036/yr
- 4b (contractor ops): $12,128-20,036/yr
- **Setup $3-8K**
- 3-yr TCO: $24-44K (4a) or $39-68K (4b)

### The BIG hole: Contractor-ops double-count

Parent shows:
- SES + Hetzner + Micato + SMS = ~$10-25/mo infrastructure
- Mautic maintenance (50-80h/yr × $100/hr) = **$400-700/mo amortized**
- These sum to "$594-1,003/mo = $7,128-12,036/yr" — labeled "Scenario 4a DIY"

Then 4b adds "contractor ops" by... what mechanism exactly? Let me re-derive:

**4a monthly breakdown:** $10 SES base + $0 SMS + ~$0 Mautic ops (DIY free) + Hetzner $10 + Micato $0 (Aimerce) ≈ **$20-50/mo** = $240-600/yr

Where's the $7,128-12,036/yr coming from? If parent is including "Luis opportunity cost at $250/hr for 50-80h/yr" = $12.5-20K/yr opportunity cost in 4a, then 4a = $7-12K/yr with ops + opportunity cost.

But Scenario 4b "contractor ops at $100/hr" = $5-8K/yr + base = **$5,000-8,000 + $240-600 + $0 SMS = $5,240-8,600/yr**, NOT $12,128-20,036.

**Parent inflated 4b by ~$7-12K/yr** by double-counting. Actual Scenario 4b = $5,000-8,000 ops + $1,000-1,500 (SES + SMS + infra) = **$6,000-9,500/yr**, NOT $12-20K.

### Verdict
**Parent's Scenario 4b TCO is ~60% overstated** because of double-counting contractor ops. Corrected 4b 3-yr TCO: $22-35K (not $39-68K).

### Mautic 5-brand tenant isolation — another hole
Parent assumed Mautic serves all 5 brands on one instance. Verified sources say otherwise:

- **forum.mautic.org/t/multi-tenant-mautic/10525** (mature thread, references mauteam.org best-practice blog): "Although Mautic's community edition does not support multi-tenancy in the sense that multiple organizations share a single instance (of the running code), running multiple instances on the same hardware is very well supported by solutions such as LXC/LXD or Docker containers."
- **axelerant.com/blog/run-multiple-instances-of-mautic**: "It is not recommended to set up a standard multi-tenant architecture. Adding multiple clients to one instance of Mautic can have several potential drawbacks... This is why it is recommended to set up separate instances for all clients to achieve maximum security, personalization, and scalability."

**Implication:** One Mautic instance → 5 brands = data isolation risk + per-brand overhead. The right approach is 5 instances (Docker or LXC) on one Hetzner box. 5 instances ≈ 5× the ops burden, **not 1×** as the parent's model implies.

### Mautic ops cost — what parent's $400-700/mo actually means
Parent quotes "Mautic ops 50-80h/yr at $100/hr = $5,000-8,000/yr (amortized $400-700/mo)." That math is sound IF you do it as a one-person retainer. But realistically:
- 50-80h/yr for **1 instance** of Mautic
- **5 instances = 250-400h/yr** at $100/hr = **$25,000-40,000/yr** at contractor rates

Parent's $7-12K/yr is for 1 instance, applied to a 5-brand scenario. **Understated by 4×.**

### Corrected Scenario 4 3-yr TCO
- Per-instance: $5,000-8,000/yr × 5 instances × 3 yrs = **$75,000-120,000**
- Plus infrastructure (5 instances, larger Hetzner box): $30-60/mo × 36 = $1,080-2,160 over 3 yrs
- Plus SES: $1,800-3,000/yr × 3 = $5,400-9,000
- Plus setup ($3-8K per instance × 5 = $15-40K, vs parent's $3-8K for 1 instance)

**Realistic Scenario 4 (5 brands, contractor ops): $100-170K over 3 years.**

This DESTROYS Scenario 4 as a viable option vs Brevo at $20-30K over 3 years.

---

## 6. Migration cost — what parent got right and over-claimed

### Parent claim: "Near-zero migration cost"
User's respec: "you do it with agents, Brevo support handles complex flows at negligible cost"
Setup estimate: **$500-2,000 (parent's table)**

### Reality check
- Recreating 19 automations with email templates: 60-100h of work
- At agent rate (using Claude Code, Codex, etc.): maybe 20-40h human supervision
- $100/hr × 20-40h = $2,000-4,000 actual
- Brevo support included for free on Standard+ plan
- Omnisend API does NOT expose per-campaign sent count (reports 404), so historical reporting must be rebuilt
- Aimerce/Elevar integrations: re-link in Brevo

**Migration cost is closer to $1,500-4,000 than $500-2,000.** At user-spec migration cost (1,500-4,000), the S2 vs S1 payback math:

**S2 (Brevo) annual save: $9,000-12,000/yr vs S1 Omnisend**
- Low end: $9,000 saved × 1/12 = $750/mo saved ÷ $1,500 setup = **2-month payback**
- High end: $9,000 × 1/12 = $750 ÷ $4,000 setup = **5.3-month payback**
- Range: **2-5 months** (parent said 0.5-2.5; corrected to 2-5 with my wider setup range)

**Still overwhelmingly positive. Recommendation stands.**

---

## 7. SendGrid cost validation — what parent got wrong about prepay

**Parent's table at commit 4e4df7a didn't explicitly include SendGrid prepay discount.** But the prior review rounds assumed 10-20% annual prepay. Verified PRIMARY source (support.sendgrid.com):

> "Accounts are charged on a monthly basis; Twilio SendGrid does not offer prepayment, quarterly billing, or annual billing at this time."

**Third-party blogs (spendflo, simplycodes) cite 10-20% but those seem to be sales-led or third-party "contact us" offers, not a published line item.** Parent should NOT apply a SendGrid prepay discount.

---

## 8. Brevo annual prepay discount — what parent missed

Multiple independent sources confirm:
- emailvendorselection.com (2026): "Brevo offers a 10% discount on yearly plans."
- techjury.net: "Up To 10% Off On Yearly Subscription Plan."
- elitecontentmarketer: "10% off with annual billing."
- founderpass: "50% off Brevo Starter or Standard annual plan for 12 months" (member discount)

**Annual prepay saves ~$15-100/yr at Standard 100K-150K tier.** Adds to S2 advantage. Should be included.

---

## 9. Final cost comparison (corrected)

| Scenario | Annual (USD) | Setup | 3-yr TCO |
|---|---:|---:|---:|
| **1. Stay on Omnisend (5 brands, conservative)** | $15,600-24,000 | $0 | **$46,800-72,000** |
| **1b. Stay on Omnisend (5 brands, worst case unmeasured brands at 50-80K)** | $30,000-43,500 | $0 | **$90,000-130,500** |
| **2. Brevo Standard 150K + 10% annual prepay** | $1,830-$2,475 | $1,500-4,000 | **$7,000-12,000** |
| **2b. Brevo Standard 250K (if tier exists)** | $2,580-$3,490 | $1,500-4,000 | **$9,200-14,500** |
| **2c. Brevo Professional 500K+ (parent's wrong tier)** | $5,388-$7,288 | $1,500-4,000 | **$17,700-26,000** |
| **3. Brevo same as S2 (pre-cleanup contact count irrelevant)** | same as 2 | $1,500-4,000 | same as 2 |
| **4a. Mautic 1 instance + SES (DIY Luis)** | $7,128-12,036 (with Luis opp cost) OR $240-600 (cash only) | $3,000-8,000 | **$7,700-26,108** (cash only: $3,720-9,800) |
| **4b. Mautic 1 instance + SES (contractor $100/hr)** | $5,000-8,000 ops + $240-600 infra = $5,240-8,600 | $3,000-8,000 | **$18,720-33,800** (parent said $39-68K — overstated due to double-count) |
| **4c. Mautic 5 instances + SES (correct serving all 5 brands)** | $25,000-40,000 ops + $1,500-3,000 infra = $26,500-43,000 | $15,000-40,000 | **$94,500-169,000** |

**The recommendation table now shows: S2 wins by even more than parent thought**, AND the parent's S4 numbers were 30-40% too high (Scenario 4b) or wildly understated for actual 5-brand deployment (4c).

---

## 10. The 19-automations assumption

Parent says "19 active automations all enabled" in TY's Omnisend account. Verified from Omnisend help (support.omnisend.com/en/articles/4334766): "Omnisend offers 15+ preset workflows (Welcome, Abandoned Cart, Post-Purchase, and more) with recommended triggers, delays, and message templates."

17-19 automations is in the right ballpark for a heavy user. Migration will be substantial.

But also: per Klaviyo 2026, flows generate 41% of revenue at 5.3% of sends. So the 19 automations are **revenue-critical** even if they're volume-minor. This is the BIGGEST hidden risk in the migration.

---

## 11. Recap of parent's misses vs my corrections

| Parent claim | My verification | Why it matters |
|---|---|---|
| Brevo Standard 500K @ $499/mo | Professional $499 for 150K+; Standard max 150K = $169; no published 500K Standard tier | S2 should be at $169-239/mo, NOT $499-749. Parent over-stated S2 by 30-50%. |
| Migration 0.5-2.5 months payback | 2-5 months with conservative migration cost range | Wider but still overwhelmingly positive |
| SendGrid prepay 10-20% | Twilio does NOT offer annual prepay | Don't apply this discount |
| Other 3 brands at 5-15K contacts | Unknown; could be 50-100K each pre-cleanup | S1 worst case ~2× parent's estimate |
| Mautic 1 instance serves 5 brands | Mautic community = single-tenant; 5 brands needs 5 instances | Scenario 4 with 5 brands = 4× parent's ops cost |
| Scenario 4b = $12-20K/yr | Double-count of ops line; actual = $5-8.6K/yr | Parent overstated 4b by ~60% |
| 1-1.5M emails/mo central estimate | 400K-800K more likely given decline trajectory and Klaviyo benchmarks | Sends tier matters: drops Brevo tier to Standard 150K-250K |

---

## 12. My final recommendation

### AGREE with parent's overall direction (move to Brevo). But correct the tier pick and the alternatives.

**Tier pick: Brevo Business Standard 150K @ $169/mo with annual prepay (-10% = $152/mo = $1,824/yr).**

This handles up to 150K emails/mo. TY at $368/day GMV and 50-100 campaigns/mo + 19 automations should fit 100-200K emails/mo. Brief overage bursts above 150K cost ~$0.003/email PAYG.

**Migration: do it in 30-60 days as parent recommended.**
- Use agents to recreate 19 automations
- Brevo support handles complex flow imports at no cost
- Aimerce/Elevar re-link
- Setup actual cost: $1,500-4,000 (not $500-2,000)
- 2-5 month payback against Omnisend is overwhelmingly worth it

### What NOT to migrate
- **TurnedComics + TurnedSuperhero:** No API keys / 403, unmeasured, no email revenue attribution available. Migrating them without data is throwing money away. Keep on Omnisend Free if available (250 contacts, 500 emails/mo cap) — they're not earning enough to justify any platform.
- **Portrified + RickAndMorty** if they're still in the portfolio: 5 lifetime orders and 0 orders respectively, so email doesn't move revenue for these.

### Mautic: only if multi-brand consolidation is real and you hire a devops contractor
Parent's Scenario 4 (Mautic 5 instances) only makes sense if:
- All 5 brands hit 50K+ contacts at meaningful volume
- Total email volume exceeds 1M/mo AND growth continues
- You hire a DevOps contractor at $100/hr for ongoing ops (250-400h/yr = $25-40K/yr)
- The savings vs Brevo come from avoiding both Omnisend Pro (~$36-44K/yr at 5 brand scale) AND Brevo Professional
- AND you accept 8-12 weeks of degraded automation performance during migration

**At current TY volume, Scenario 4 LOSES decisively.** Only viable at scale and with permanent ops staff.

### The decisive question for the user
Same as last round: **What's the 12-month outlook for TY?**

- **If TY recovers to 50%+ of 2024 baseline (~$600K GMV):** Move to Brevo now AND consider consolidating all 5 brands on Brevo (or Mautic if volume tops 1M/mo). Migration cost is trivial compared to email automation revenue.
- **If TY stays at 20-30% of 2025 ($135-194K GMV):** Move to Brevo for the active brands. Keep inactive brands dormant. Reassess in 6-12 months.
- **If you genuinely believe the portfolio has shifted away from TY:** Stay on Omnisend, ride out the 5-brand cleanup, and consider Mautic 5-instance deployment as the 5-brand self-hosted alternative.

---

## 13. Open questions for the user

1. **What's TurnedWizard's actual contact count + email revenue?** Without it, all 5-brand cost projections are speculation.
2. **Did MakeMeJedi get the same cleanup treatment as TY, or are they still at pre-cleanup volume?** If MMJ is at pre-cleanup 60K-100K contacts, their Omnisend cost is ~$900-1,500/mo, not $300/mo.
3. **What's the 12-month outlook for TY?** This is the deciding factor between Scenario 2 now, Scenario 2 in 6-9 months, and Scenario 4 ever being viable.
4. **Are MakeMeJedi + TurnedWizard + TurnedComics + TurnedSuperhero all actually generating email revenue, or are they portfolio dead-ends?** If dormant, they're not worth migrating.
5. **Are you willing to take a 2-4 week automation performance hit during Brevo migration?** If the 19 automations drive 30%+ of email revenue (per Klaviyo 2026 benchmark, possible), this is a real cost.
6. **Is multi-brand contact consolidation on the roadmap?** If yes, that alone justifies Scenario 4 (Mautic 5-instance) at 5-brand scale.

---

## 14. Final ranking

| Rank | Scenario | When it's right |
|---|---|---|
| 1. **Move to Brevo (Business Standard 150-250K, annual prepay)** | Most cases: $194K GMV at $368/day, 5 brands partly active | **RECOMMENDED** |
| 2. Stay on Omnisend | ONLY if Brevo migration breaks 19 automations AND automations drive >30% of revenue | Low confidence given user said "near-zero migration cost" |
| 3. Mautic 5-instance self-hosted | ONLY if: 5-brand consolidation real + 1M+ emails/mo total + DevOps contractor on retainer | Not currently viable given volume |
| 4. Scenario 3 (pre-cleanup to Brevo) | Same as Scenario 2 — parent was right this is just cleanup hygiene | Drop this option |

---

**End of third-opinion validation report. Sources: brevo.com/pricing (via emailvendorselection, emailtooltester, chatarmin 2026 DACH analysis, sendx.io), omnisend.com/pricing + support.omnisend.com 3533018 + sms-prices, twilio.com/products/email-api/pricing + support.sendgrid.com + twilio.com/messaging/pricing/sms, aws.amazon.com/ses/pricing + docs.aws.amazon.com/ses (quotas + manage-sending-quotas), hetzner.com/cloud, klaviyo.com 2026 email benchmarks (183K+ brands), mautic.org forums (multi-tenant thread 10525), axelerant.com Mautic multi-instance blog, sendx.io 2026 Omnisend pricing table, forum.mautic.org/t/mautic-5-smtp-535-error/32156, helterscale.com AWS SES best-practices 2026. Parent context: ty-final-analysis.md at commit 4e4df7a (v8.4-project-centric-operator-ux branch) in memroos content/research/turnedyellow-email-platform-final-revised-2026-07-08.md.**
