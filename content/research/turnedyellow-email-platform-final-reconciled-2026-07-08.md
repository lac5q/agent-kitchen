# TurnedYellow email platform — final reconciled model (post 3rd GLM-5.2 review)

## What GLM-5.2 corrected (third-opinion findings)

| # | Parent's claim | GLM-5.2 correction | Source |
|---|---|---|---|
| 1 | Brevo Standard 500K @ $499/mo | **Standard maxes at 150K = $169/mo. Above 150K = Professional $499+** | emailtooltester 2026, emailvendorselection |
| 2 | Mautic 4b = $12-20K/yr | **Double-counted ops. Actual $5-9K/yr for 1 instance** | math audit |
| 3 | Mautic serves 5 brands on 1 instance | **Community = single-tenant. 5 brands = 5 instances, 4× ops cost** | forum.mautic.org/t/10525, axelerant.com |
| 4 | Other 3 brands at 5-15K each | **Unknown; could be 50-100K each pre-cleanup. S1 worst case 2× parent's estimate** | API page-cap acknowledged |
| 5 | SendGrid 10-20% prepay | **Twilio support: "no prepayment, quarterly, or annual billing"** | support.sendgrid.com (primary) |
| 6 | (missed) Brevo 10% annual prepay | **Confirmed by 3+ secondary sources** | emailvendorselection, techjury, elitecontentmarketer |

**Plus: send volume central estimate was too high.** Parent said 1-1.5M/mo. GLM-5.2 says 400-800K/mo given:
- Klaviyo 2026 benchmark: flows = 5.3% of sends (not 20% as parent assumed)
- TY's -79% YoY GMV trajectory
- 12 campaigns in 7 days early-Jul suggests monthly rate is much lower than 110-175

## FINAL CORRECTED COST TABLE (3-yr TCO, USD)

| Scenario | Annual | Setup | 3-yr TCO |
|---|---:|---:|---:|
| **1. Stay on Omnisend (5 brands, conservative)** | $15,600-24,000 | $0 | $46,800-72,000 |
| **1b. Stay on Omnisend (5 brands, worst-case unmeasured brands at 50-80K each)** | $30,000-43,500 | $0 | $90,000-130,500 |
| **2. Brevo Business Standard 150K + 10% annual prepay (TY+MMJ)** | $1,824-2,475 | $1,500-4,000 | **$7,000-12,000** |
| **2b. Brevo Business Standard 250K (if 250K tier exists in 2026)** | $2,580-3,490 | $1,500-4,000 | $9,200-14,500 |
| **2c. Brevo Professional 500K+ (parent's wrong tier)** | $5,388-7,288 | $1,500-4,000 | $17,700-26,000 |
| **3. Brevo pre-cleanup (irrelevant — same cost as S2)** | same as 2 | same | same |
| **4a. Mautic 1 instance + SES (Luis DIY, includes opportunity cost)** | $7,128-12,036 | $3,000-8,000 | $24,400-44,108 |
| **4b. Mautic 1 instance + SES (contractor ops, no double-count)** | $5,240-8,600 | $3,000-8,000 | **$18,720-33,800** |
| **4c. Mautic 5 instances + SES (correct 5-brand serving, contractor ops)** | $26,500-43,000 | $15,000-40,000 | **$94,500-169,000** |

## BREAK-EVEN ANALYSIS (FINAL)

**S2 (Brevo) vs S1 (Omnisend) on operating cost:**
- Conservative Omnisend ($15.6-24K/yr) → Annual save $13,200-22,176/yr → Payback at $1.5-4K setup = **0.8-3.6 months**
- Worst-case Omnisend ($30-43.5K/yr) → Annual save $28,176-41,676/yr → Payback = **0.4-1.7 months**
- **Range: 0.4-3.6 months (still overwhelmingly positive)**

**S4 (Mautic) vs S2 (Brevo):**
- Mautic 1 instance loses by $3,400-6,125/yr vs Brevo Standard 150K
- Mautic 5 instances loses by $24,676-40,176/yr vs Brevo Standard 150K
- **Mautic is decisively worse than Brevo at every scale**

**S4 (Mautic) vs S1 (Omnisend) on cash cost only:**
- Mautic 1 instance wins by $7-19K/yr (if portfolio is conservative Omnisend)
- Mautic 5 instances loses by $7-22K/yr even at worst-case Omnisend
- **Mautic only wins on cash if (a) you're staying at 1 instance (TY+MMJ only) AND (b) Luis is OK with DIY Mautic ops**

## WHAT I CHANGED IN MY RECOMMENDATION

**Before GLM-5.2 review:** "Move to Brevo at Standard 500K tier within 30-60 days for active brands"
**After GLM-5.2 review:** "Move to Brevo at **Standard 150K tier ($169/mo, $152/mo with annual prepay)** within 30-60 days for active brands (TY+MMJ). Do NOT migrate TurnedComics + TurnedSuperhero. Reassess TurnedWizard once you have actual contact data."

**The Mautic 5-brand path is dead at this scale.** The single-tenant constraint means 5 brands = 5 instances = $25-40K/yr in contractor ops alone, which is more than the entire Brevo Standard 150K bill.

## MIGRATION RISK — THE ONE THING THAT MATTERS

Per Klaviyo 2026 benchmark (183K+ brands): **flows generate 41% of email revenue at 5.3% of send volume.** The 19 active TY automations are revenue-critical even if volume-minor. Migration risk is **not in the email cost** — it's in:
1. **2-4 week automation performance degradation** during rebuild (welcome, abandoned cart, abandoned checkout, browse, post-purchase, sunset, winback, illustration approval)
2. **Aimerce/Elevar integration re-linking** (already deployed for TY)
3. **Historical reporting** (Omnisend API doesn't expose per-campaign sent count, so reports must be rebuilt from scratch on Brevo)
4. **Sender reputation** (new dedicated IP on Brevo, no warmup history; Brevo manages shared IP warmup better than self-managed)

**Mitigation: run Brevo + Omnisend in parallel for 30 days.** Cost: ~$1,000 extra during overlap, but you get real data on whether the automations work before killing Omnisend.

## OPEN QUESTIONS FOR THE USER

1. **What's the 12-month TY GMV outlook?** Decides whether to migrate now or wait 6-9 months.
2. **TurnedWizard's actual contact count + email revenue.** Without it, all 5-brand cost projections are speculation.
3. **Are the 3 unmeasured brands (TurnedWizard, TurnedComics, TurnedSuperhero) actually generating email revenue?** If not, don't migrate them.
4. **Is multi-brand contact consolidation on the 12-month roadmap?** If yes, that alone justifies re-running this analysis at portfolio scale.
5. **Are you willing to take 2-4 weeks of automation performance hit during migration?** If 19 automations drive 30%+ of TY revenue, this is real.
6. **Willing to run Brevo + Omnisend in parallel for 30 days?** Best practice, but costs ~$1,000 extra.

## FINAL RANKING

| Rank | Scenario | When it's right |
|---|---|---|
| **1. Brevo Standard 150K + annual prepay** | Most cases: $194K GMV at $368/day, 5 brands partly active, 2-5 month payback | **RECOMMENDED** |
| 2. Stay on Omnisend | Only if Brevo migration breaks 19 automations AND automations drive >30% of revenue | Low confidence |
| 3. Mautic 5-instance self-hosted | Only if: 5-brand consolidation real + 1M+ emails/mo + DevOps contractor on retainer ($25-40K/yr) | Not currently viable |
| 4. Brevo pre-cleanup | Same as Scenario 2 — cleanup is deliverability, not cost. Drop as a separate option. | N/A |
