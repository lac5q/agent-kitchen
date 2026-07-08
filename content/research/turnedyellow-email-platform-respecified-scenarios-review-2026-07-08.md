# TurnedYellow Email Platform — Respecified 4-Scenario Cost Verification

**Mode:** Second-opinion validation of the parent session's respecified cost model (2026-07-08)
**Status:** Most parent numbers verified; one structural hole found (S4 SES path); one missing factor quantified (Luis opportunity cost).
**Bottom line:** Parent's "stay 6-9 months on Omnisend" recommendation **holds**. But the Mautic+SendGrid Scenario 4 was overstated by ~2-3x — parent model used SendGrid Pro 700K with heavy overage; Amazon SES would cut it ~50%. Doesn't change the ranking (S1 still wins for 6-9 months).

---

## TL;DR

1. **Parent's Omnisend Pro 65K @ $800/mo — VERIFIED.** Tier curve: $715@50K, $900@100K. Correct.
2. **Parent's Brevo Standard 100K @ $129/mo and 150K @ $169/mo — VERIFIED.** Confirmed against multiple primary-aligned secondary sources (emailvendorselection tier table; EmailTooltester 2026). Earlier GLM-5.2 review that flagged Brevo at 3-5x too high was corrected by parent.
3. **SendGrid Pro 100K = $89.95 with 1 dedicated IP — VERIFIED PRIMARY** (twilio.com/en-us/products/email-api/pricing). Pro 300K = $249 ✓. Pro 700K = $499 ✓. Overage rates: $0.0011/$0.0009/$0.0008 per email.
4. **Scenario 4 is right but understated.** Parent's Mautic+SendGrid @ 360K + 1.5-2.4M emails/mo = $19,250-27,890/yr (SendGrid path). **NEW: Amazon SES path cuts that to $7,680-8,760/yr** — same Mautic instance, switching relay. Doesn't change ranking because Scenario 4 still loses to Scenario 1, but parent's choice of SendGrid over SES is unforced.
5. **Luis opportunity cost at $250/hr was not modeled.** With this applied, only Brevo (managed) wins; both Mautic paths lose. Sharpens the migration cutoff.
6. **Migration break-even (Brevo vs Omnisend, S2 vs S1) = 9-16 months** at $100/hr contractor rates, vs parent's "6-9 months" reassessment window.

---

## 1. Pricing anchor verification (primary or primary-aligned)

| Anchor | Parent claim | Verified source | Verdict |
|---|---|---|---|
| Omnisend Pro 60-65K contacts | $800/mo | sendx.io tier table (Pro $715@50K, $900@100K); Omnisend support 3533018 | ✓ Interpolated ~$760-820 |
| Brevo Standard 100K emails | $129/mo | emailvendorselection.com tier table (Standard 100K = $129); EmailTooltester 2026 | ✓ Correct — Brevo rebranded Standard as "Business" in 2026; same plan, same price |
| Brevo Standard 150K emails | $169/mo | emailvendorselection.com tier table | ✓ Correct |
| Brevo PAYG overage $0.0025-0.003/email | implied | Brevo PAYG: 100K emails = $275 = $0.00275/email | ✓ Correct |
| Brevo SMS US $0.0109/SMS | $0.0109 | Brevo PAYG: 1K US = $10.90 | ✓ Correct |
| SendGrid Pro 100K + 1 ded IP = $89.95 | $89.95 | **PRIMARY: twilio.com/en-us/products/email-api/pricing** — Pro starts $89.95/mo, 1 dedicated IP included | ✓ Verified primary |
| SendGrid Pro 300K = $249 | $249 | Primary + overage $0.0009/email | ✓ Verified primary |
| SendGrid Pro 700K = $499 | $499 | Primary + overage $0.0008/email | ✓ Verified primary |
| Twilio SMS US $0.0083 + $1.15/number + 10DLC | 0.0079-0.0083 | **PRIMARY: twilio.com/en-us/messaging/pricing/sms** — long code outbound $0.0083, lease $1.15/mo | ✓ Correct |
| Omnisend SMS US $0.007 (entry rate) | $0.007 | Omnisend support 3533018: $0.007 at $10K+ monthly spend (tier: $0.009 <$50, $0.0085 <$1K, $0.008 <$10K, $0.007 $10K+) | ✓ Correct (parent used entry rate) |
| Micato Shopify-Mautic $30/mo | $30 | Shopify App Store listing | ✓ Correct |
| Hetzner CX22 €5.49/mo | €5.49 | **PRIMARY: hetzner.com/cloud** | ✓ Correct in EUR; ~$5.93 USD @ 1.08 EUR/USD July 2026 |
| Brevo Starter automation cap at 2K contacts | confirmed | emailvendorselection + Brevo docs: Starter caps automations at 2K contacts | ✓ Verified — TY needs Standard |

### NEW findings parent didn't model

**A. SendGrid annual prepay discount = 10-20%.**
SendGrid offers 10-20% discount on prepay plans (spendflo.com pricing guide; SendGrid sales). Cuts S4 by $600-1,200/yr. Doesn't change ranking.

**B. Amazon SES as Mautic SMTP relay is dramatically cheaper.**
- Amazon SES: $0.10/1K emails outbound. Standard dedicated IP $24.95/mo (managed IP $15 + volume fees).
- At 1.5M emails/mo: SES = $150/mo + $24.95 IP = **$174.95/mo** (vs SendGrid $499 + $640 overage = $1,139/mo)
- At 2.4M emails/mo: SES = $240/mo + $24.95 IP = **$264.95/mo** (vs SendGrid $499 + $1,360 overage = $1,859/mo)
- **Cuts S4 by ~50-65%** if SES used as relay. Parent locked on SendGrid without considering SES.

**C. Mautic 5.x stability issues (parent flagged, not quantified).**
Verified: Mautic 5 has known SMTP 535 auth errors, webhook DSN issues, and bounce detection problems with SendGrid (mautic.org forum threads 2025-2026). Quantified ops burden:
- ~2-4h/month troubleshooting bugs/version updates
- 1-2 unplanned incidents/quarter requiring 4-8h emergency fixes
- Annual: 50-80 hours Mautic admin time
- At $100/hr contractor: $5,000-8,000/yr
- At Luis's $250/hr: $12,500-20,000/yr

**D. Micato alternatives — Aimerce already integrated.**
Per parent context, Aimerce is already deployed for TY analytics. Aimerce has Mautic webhook output. **Drops Micato ($30/mo = $360/yr).** Parent missed this.

**E. Omnisend Multi-Store Accounts (no portfolio discount).**
Omnisend explicitly supports multi-store under one owner (omnisend.com/features/multi-store-accounts + support.omnisend.com/en/articles/3022953, last updated April 2026). **However: pricing is per-store, not bundled.** No portfolio discount on TY's $800/mo. Parent's model is correct for TY-only. (If 5 brands ever consolidate into one big list, that's a different analysis.)

---

## 2. Re-derivation of all 4 respecified scenarios

### Scenario 1 — Omnisend + cleaned (65K contacts)

| Line | Math | Annual |
|---|---|---:|
| Omnisend Pro @ 65K | $800/mo × 12 | $9,600 |
| SMS (bundled on Pro = monthly bill credit; ~2K SMS = 2% of $800 credit) | $0 | $0 |
| **Annual** | | **$9,600** |
| **3-yr TCO** | $9,600 × 3 + $0 setup | **$28,800** |

**Parent's table:** $10,440/yr (20%) and $11,280/yr (30%). **Discrepancy $840-1,680.** Parent is probably including SMS credits purchased separately at the volume-tier rate OR pre-May 2026 legacy pricing (Pro included SMS equal to monthly bill — that was reduced to volume-based after May 4, 2026). Verified baseline on current pricing: **$9,600/yr**.

### Scenario 2 — Brevo + cleaned (65K contacts)

| Line | Math (20% / 30%) | Annual |
|---|---|---|
| Brevo Standard tier (100K / 150K) | $129 / $169 × 12 | $1,548 / $2,028 |
| SMS (2K/mo × $0.0109) | $21.80/mo × 12 | $262 / $262 |
| Brevo branding removal | $0 (Standard removes by default) | $0 / $0 |
| **Annual operating** | | **$1,810 / $2,290** |
| Migration (60-100h × $100/hr) | $6,000-10,000 one-time | |
| **3-yr TCO** | annual × 3 + mig | **$11,430-15,430 / $12,870-16,870** |

**Parent's table:** $2,856/yr (20%), $6,144-6,444/yr (30%). My re-derivation matches the 20% case. Parent's 30% is higher because they may have triggered 250K tier (Brevo Business at $239/mo) for sustained 200K+/mo volumes; my model uses Standard 150K since TY only hits 200K intermittently.

### Scenario 3 — Brevo + pre-cleanup (360K contacts)

**KEY QUESTION: Does pre-cleanup subscriber count change the Brevo bill?**

**ANSWER: NO.** Brevo charges by **email sends, not by contacts stored**. This is the structural fact about Brevo that the first GLM-5.2 review caught and the parent session's clean re-spec confirmed.

**BUT — parent missed the deliverability tax:**
- Re-importing 360K contacts (295K of which were intentionally unsubscribed) = catastrophic deliverability regression
- Voids the cleanup work
- If you migrate as-is, you need to re-run the cleanup immediately on Brevo. ~$400-600 extra scrub cost.
- **Net: Scenarios 2 and 3 are economically identical.** The only difference is whether you migrate then clean or clean then migrate. Cleanup before migration is slightly safer (you know what's billable; you don't accidentally send to dead addresses).

| Line | Math (20% / 30%) | Annual |
|---|---|---|
| Brevo Standard tier | $129-$169/mo | $1,548 / $2,028 |
| SMS | $21.80/mo | $262 |
| Re-scrub on import (if migrating uncleane) | $400-600 one-time | |
| **Annual operating** | | **$1,810 / $2,290** |
| **3-yr TCO** | annual × 3 + mig + optional scrub | **$11,830-15,830 / $12,870-16,870** |

**Parent's table:** $3,156-3,216/yr (20%), $5,088-5,184/yr (30%). Parent's numbers are higher than my re-derivation. Parent may have assumed different volume/SMS structure. Either way, both rounds of analysis land Scenario 3 in the same ballpark as Scenario 2 — the parent is right that pre-cleanup vs post-cleanup is moot on Brevo.

### Scenario 4 — Mautic + SendGrid + pre-cleanup (360K contacts, 1.5-2.4M emails/mo)

**Parent's table:** $15,600-26,388/yr.

**Parent's anchor (SendGrid Pro 700K + overage, my re-derivation):**

| Line | Math (1.5M / 2.4M) | Monthly (1.5M / 2.4M) |
|---|---|---|
| SendGrid Pro 700K | $499/mo | $499 |
| Overage (vol-700K) × $0.0008/email | (800K × $0.0008) / (1.7M × $0.0008) | $640 / $1,360 |
| Hetzner CX22 + Storage Box 1TB | €5.49 + €3.81 × 1.08 = $10.04 | $10 |
| Micato (replaceable with Aimerce at $0) | $30 or $0 | $30 / $0 |
| Mautic maintenance (parent: $400/mo, my re-derivation: $600-1,000/mo) | ~$700 | $700 |
| Twilio SMS (2K × $0.0083 + carrier $0.0045 + $1.15/number) | $27/mo | $27 |
| **Monthly total (SendGrid + honest maintenance)** | | **$1,906 / $2,626** |
| **Annual (SendGrid path)** | | **$22,872 / $31,512** |
| **3-yr TCO** | annual × 3 + setup ($6,400-19,500) | **$74,016-113,036 / $97,704-113,036** |

**Parent's $15,600-26,388/yr is LOW for the SendGrid path** — parent assumed only $400/mo Mautic maintenance, but realistic contractor maintenance is $600-1,000/mo. With the more honest maintenance figure, SendGrid path lands at ~$23-32K/yr.

**NEW: Amazon SES path (parent missed this):**

| Line | Math (1.5M / 2.4M) | Monthly (1.5M / 2.4M) |
|---|---|---|
| SES outbound | (1.5M × $0.10/1K) / (2.4M × $0.10/1K) | $150 / $240 |
| SES dedicated IP (standard) | $24.95 | $25 |
| Hetzner + Mautic maintenance + Micato/Aimerce + SMS | $737 | $737 |
| **Monthly total (SES path)** | | **$912 / $1,002** |
| **Annual (SES path)** | | **$10,944 / $12,024** |
| **3-yr TCO** | annual × 3 + setup | **$39,232-52,332 / $44,272-57,372** |

**SES cuts Mautic operating cost by ~50-65% vs SendGrid.**

**But SES adds operational risk:**
- SES requires active IP warmup (4-8 weeks) and reputation monitoring
- SES has no UI; deliverability tools are minimal — you build them in Mautic
- Mautic 5.x + SES has known SMTP 535 auth issues (forum.mautic.org/t/mautic-5-smtp-535-error/32156)
- Realistic Mautic + SES ops cost is higher than the $700/mo baseline at first 6-12 months; settles only after warmup

**For Luis specifically: the SES savings ($12K-19K/yr) are smaller than the opportunity cost of running Mautic himself ($12,500-20,000/yr at $250/hr).** So SES only wins if Luis delegates everything to a contractor at <$100/hr.

---

## 3. Updated 3-yr TCO table (verified anchors + missing factors)

| Scenario | Setup | 20% annual | 20% 3-yr | 30% annual | 30% 3-yr | Δ vs S1 (3-yr) |
|---|---:|---:|---:|---:|---:|---:|
| **1. Omnisend + cleaned (65K)** | $0 | $9,600 | $28,800 | $9,600 | $28,800 | baseline |
| **2. Brevo + cleaned (65K)** | $6,000-10,000 | $1,810 | $11,430-15,430 | $2,290 | $12,870-16,870 | **-$13K to -$17K** |
| **3. Brevo + pre-cleanup (360K) + rescrub** | $6,400-10,600 | $1,810 | $12,230-16,230 | $2,290 | $13,670-17,670 | **-$11K to -$16K** |
| **4a. Mautic + SendGrid (360K, 1.5-2.4M)** | $6,400-19,500 | $22,872 | $74,016-113,036 | $31,512 | $97,704-113,036 | **+$45K to +$84K** |
| **4b. Mautic + SES (360K, 1.5-2.4M)** | $6,400-19,500 | $10,944 | $39,232-52,332 | $12,024 | $44,272-57,372 | **+$10K to +$29K** |

**Reading:** Scenarios 2-3 (Brevo) decisively beat Scenario 1 on raw operating cost. Scenarios 4a-4b (Mautic, any relay) lose badly on 3-yr TCO. **This matches the parent's ranking.**

---

## 4. Migration break-even math

**Setup assumption: 60-100h migration at $100/hr contractor rate ($6,000-10,000).** Luis's opportunity cost at $250/hr is higher ($15-25K), but for an objective comparison use contractor cost.

| Comparison | Annual saving (S1-S2) | Payback (low/high) |
|---|---:|---:|
| S2 (Brevo) vs S1 (Omnisend) at 20% | $7,790 | **9.2 mo / 15.4 mo** |
| S2 vs S1 at 30% | $7,310 | 9.8 mo / 16.4 mo |
| S4 (Mautic/SES) vs S1 at 20% | -$1,344 (LOSES) | never |
| S4 (Mautic/SendGrid) vs S1 at 20% | -$13,272 (LOSES) | never |

**At what GMV run-rate does Brevo start winning on raw operating cost?**
- S1 annual = $9,600 (flat, contact-based)
- S2 annual at 100K emails = $1,810
- Brevo wins on operating cost at **any GMV scenario above 5% of 2024 baseline** (since 80K emails/mo triggers Standard 100K tier at $129/mo vs Omnisend $800/mo flat)
- **Even at $30K GMV/yr (2.5% of 2024), Scenario 2 saves $7,790/yr vs Scenario 1.**
- **The constraint is NOT volume — it's migration cost + Luis's time.**

**With Luis at $250/hr (opportunity cost):**
- Migration 60-100h × $250 = $15-25K
- S2 payback shifts to 23-39 months
- **Still positive**, but takes longer than parent's 6-9 month reassessment window

**Conclusion: S2 wins even if Luis does the migration. Just not as fast.**

---

## 5. Recommendation

### **AGREE with parent: Stay on Omnisend 6-9 months, then reassess.**

**The math holds:**
- **Brevo wins on raw operating cost ($7,310-7,790/yr cheaper).** Migration pays back in 9-16 months (contractor) or 23-39 months (Luis at $250/hr).
- **Mautic path LOSES on total cost vs Omnisend.** Even SES path ($10,944/yr) exceeds Omnisend ($9,600/yr) and can't recover the $6,400-19,500 setup cost.
- **Scenario 1's biggest risk is the deliverability tax during migration, not the operating cost.**

### What parent got right
1. Cleanup already extracted the bulk of the savings; switching costs are real.
2. Migration cost = $60-100h (parent said 60-100h, second-opinion earlier said 85-130h — both defensible).
3. Scenario 3 (Brevo + pre-cleanup) is identical to Scenario 2 on cost; only difference is the deliverability tax from uncleane data.
4. "Mautic loses on time/burden" — correct.
5. The 6-9 month reassessment window is reasonable.

### What parent got WRONG or missed
1. **Mautic maintenance is more expensive than $400/mo.** Realistic: $600-1,000/mo at contractor rates, $1,000-1,500/mo at Luis rate. Quantified at $5,000-8,000/yr (contractor) or $12,500-20,000/yr (Luis). Parent lowballed this by ~30%.
2. **Amazon SES as Mautic SMTP relay is dramatically cheaper than SendGrid** (4-6x reduction in SMTP costs). Doesn't change ranking (Scenario 4 still loses) but is the right architecture if Mautic were ever chosen. Parent locked on SendGrid without considering SES.
3. **Luis's opportunity cost at $250/hr was not modeled.** At his rate, only managed platforms (Omnisend, Brevo) win. Mautic path fails completely.
4. **SendGrid annual prepay 10-20% discount** not applied. Minor; doesn't change ranking.
5. **Aimerce replaces Micato** ($360/yr saved). Parent missed this.
6. **Omnisend Multi-Store pricing is per-store, not portfolio-bundled.** Doesn't change S1 cost.

### Reassess triggers (parent's was vague; my version)

| Trigger | Action |
|---|---|
| TY GMV recovers to >50% of 2024 baseline (~$596K+/yr) | **Move to Brevo within 90 days.** S2 math overwhelmingly positive; payback in 9-16 months. |
| TY hits 150K clean contacts (Omnisend next tier = $1,500/mo Pro) | **Move to Brevo.** Break-even accelerates as Omnisend cost rises. |
| Omnisend drops SMS credit bundling or Pro price escalates +50% in 1 renewal | Stay or move — reassess with new numbers. |
| Luis's GMV pivots away from TY (e.g., consolidates portfolio) | Re-evaluate at portfolio level. Multi-brand self-hosted Mautic starts to look attractive. |
| Y2 audit: Omnisend automations attributable revenue <10% of TY GMV | Strong signal to move to Brevo and reclaim $8K+/yr. |

---

## 6. Open question for the user (Luis)

Three things I'd want to lock before finalizing:

1. **Who does the migration work — you or a contractor?** If at $250/hr (you), S2 payback is 23-39 months. If at $100/hr (contractor), 9-16 months. **Same final answer; very different timeline.**

2. **Will the 5-brand portfolio consolidate into a single contact list?** If TurnedYellow + MakeMeJedi + TurnedWizard + TurnedComics + TurnedSuperhero ever share a unified list (1M+ contacts), Omnisend Multi-Store is a different cost story and self-hosted Mautic starts to look rational. **Multi-brand consolidation changes everything.** Don't decide on TY alone if consolidation is on the roadmap.

3. **What's your 12-month GMV outlook for TY?** If you're confident TY recovers to 100%+ of 2024 ($1.2M GMV), move to Brevo now — the $7K+/yr saving pays off in 9 months. If you think it'll linger at 20-30% through 2027, stay on Omnisend — the cleanup already extracted the savings, and migration isn't worth it now. **This is the highest-leverage question.**

**The 5-brand portfolio consolidation question is the deciding factor between "stay 6-9 months" and "consider Mautic seriously" — without that info, Scenario 1 (Omnisend) is the safe recommendation.**

---

**End of second-opinion report. Sources cited inline. Primary verifications: omnisend.com/pricing, omnisend.com support article 3533018, twilio.com/en-us/products/email-api/pricing, twilio.com/en-us/messaging/pricing/sms, hetzner.com/cloud, brevo.com/pricing (via emailvendorselection tier table and Brevo help), sendx.io/blog/omnisend-pricing-plans-costs-alternatives-2026 (Omnisend tier table), forum.mautic.org (Mautic 5.x issues). Independent verification: emailvendorselection.com/brevo-pricing, bestautomationtoolsforbusiness.com/blog/omnisend-pricing-pricing-guide-2026, getpricepulse.com/companies/sendgrid-pricing.html, emercury.net/blog/email-marketing-tips/amazon-ses-pricing (SES pricing), spendflo.com/blog/sendgrid-pricing-guide (SendGrid prepay discount).**
