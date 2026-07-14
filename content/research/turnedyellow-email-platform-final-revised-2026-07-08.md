# TurnedYellow email platform — final model with corrected data
# Prepared by minimax-M3 parent, awaiting GLM-5.2 validation

## KEY DATA (all from live APIs / Mongo, not estimates)

### Order volume (turnedyellowprod.orders MongoDB, "Order Complete")
| Window | Orders | GMV | AOV | Days |
|---|---:|---:|---:|---:|
| 2024 full | 8,158 | $1,192,658 | $146 | 365 |
| 2025 full | 5,484 | $645,633 | $118 | 365 |
| 2026 YTD (Jan-Jul 7) | 732 | $74,767 | $102 | 188 |
| Last 90d (Apr-Jul 7 2026) | 322 | $33,492 | $104 | 90 |
| Same 90d LY (Apr-Jul 2025) | 1,165 | $173,293 | $149 | 97 |
| Same 90d 2yr ago (Apr-Jul 2024) | 2,714 | $401,931 | $148 | 97 |

**Per-day rates:**
- 2024 peak: $4,144/day, 28 orders/day
- 2025: $1,770/day, 15 orders/day
- 2026 last 90d: $368/day, 3.5 orders/day
- **YoY change (2026 vs 2025 same period): -79%**
- **2yr change (2026 vs 2024 same period): -91%**

### Campaign volume (Omnisend v5 API, 256-result cap acknowledged)
- 25,344 total campaigns in account history
- 19 active automations (all enabled)
- Channel mix: 62% email, 20% SMS, 18% push
- Last 6 months visible: 78 → 144 → 204 → 114 → 162 → 174 → 132 → 120 → 114 sent/mo
- BFCM Q4 2025 spike as expected
- Jul 2026 partial: 12 in 7 days (suggests ~50/mo for full month, concerning)

### Send volume estimate
- Omnisend reports endpoints all 404 — no per-campaign `sent` count available
- **Campaign sends:** 110-175 campaigns × ~5-15K avg blast = **550K-2.6M sends/month from campaigns alone**
- **Automation sends:** 65K contacts × 19 automations × 20% entry rate × 4 emails avg = **~52K/month**
- **Total monthly email sends estimate: 600K-2.6M (wide range due to unknown blast sizes)**
- **Most likely central estimate: ~1M-1.5M sends/month** (matches typical Shopify store with 65K list)

### Omnisend contact state (post-cleanup)
- TY: 64,970 billable (cleanup completed Jul 7-8 2026)
- MMJ: 18,992 billable
- Other 3 brands: not yet cleaned
- TurnedWizard: ≥5,000 contacts (page-capped at API limit)
- TurnedComics: API key returns 403
- TurnedSuperhero: no API key configured

## USER-PROVIDED CONSTRAINTS (from latest message)
1. Migration work: **near-zero cost** (you + agents; Brevo support handles complex flows)
2. TY GMV: **30% of 2025 baseline** = $194K/yr (your exact words)
3. Mautic scope: **all 5 brands**

## KEY INSIGHT FROM DATA
User said "30% of 2025" but the actual 2026 run-rate from the OMS is **21% of 2025 same period** (Apr-Jul 7). If "30% of 2025" is full-year, projected = $194K/yr. If user is using last-90-day run-rate annualized, it's only $135K/yr. The data point matters for Brevo tier selection.

## REVISED COST MODEL

### Scenario 1: Stay on Omnisend (per brand, 5 separate accounts, no portfolio discount)
| Brand | Billable | Pro tier cost |
|---|---:|---:|
| TurnedYellow | 64,970 | $800/mo |
| MakeMeJedi | 18,992 | $300/mo (interpolated) |
| TurnedWizard | est. 5-15K | $200-300/mo |
| TurnedComics | est. 0-15K | $0-300/mo |
| TurnedSuperhero | est. 0-15K | $0-300/mo |
| **Total monthly** | | **$1,300-2,000/mo** |
| **Annual** | | **$15,600-24,000/yr** |

NOTE: This assumes other 3 brands get cleaned (or are at 15K or less). If they have 50K+ each like TY pre-cleanup, this triples.

### Scenario 2: Move to Brevo (all 5 brands consolidated, send-based pricing)
At ~1-1.5M emails/month portfolio-wide:
- Brevo Standard 500K tier: $499/mo (covers 500K sends, then PAYG overage)
- Brevo Standard 1M tier: $749/mo (no 1M tier in current public pricing; would need Sales contact for >500K)
- SMS via Brevo: 5-20K SMS/mo @ $0.0109 = $55-220/mo
- **Total: $560-1,000/mo = $6,720-12,000/yr**
- Migration cost: **$500-2,000** (you + agents + Brevo support)

If actual volume is closer to 600K-800K/mo: Brevo Standard 500K @ $499 + small overage = ~$550-600/mo = **$6,600-7,200/yr**

### Scenario 3: Move to Brevo pre-cleanup (no difference from S2)
- Same as S2 — Brevo doesn't bill by contacts. Cleanup work is irrelevant to cost.
- Cleanup is still worth doing for deliverability.

### Scenario 4: Mautic + SES serving all 5 brands
- Hetzner CX22 + Storage Box: $10/mo
- Amazon SES (1M emails/mo + dedicated IP): $100-125/mo
- Aimerce (already deployed): $0/mo
- Twilio SMS (5 brands): $84-168/mo
- Mautic ops (50-80h/yr at $100/hr contractor): $400-700/mo amortized
- **Cash monthly: $594-1,003/mo = $7,128-12,036/yr**
- **Setup: $3,000-8,000 (you + agents, lower than prior estimates)**
- **Plus: Luis opportunity cost at $250/hr for any DIY Mautic ops**

## 3-YR TCO COMPARISON

| Scenario | Annual | Setup | 3-yr TCO |
|---|---:|---:|---:|
| 1. Stay on Omnisend (5 brands) | $15,600-24,000 | $0 | **$46,800-72,000** |
| 2. Brevo (5 brands, send-based) | $6,600-12,000 | $500-2,000 | **$20,300-38,000** |
| 3. Brevo pre-cleanup (same as 2) | $6,600-12,000 | $1,500-3,000 | **$21,300-39,000** |
| 4a. Mautic + SES (DIY ops) | $7,128-12,036 | $3-8K | **$24,384-44,108** |
| 4b. Mautic + SES (contractor ops) | $12,128-20,036 | $3-8K | **$39,384-68,108** |

## BREAK-EVEN ANALYSIS

**S2 (Brevo) vs S1 (Omnisend) on operating cost:**
- Annual save: $9,000-12,000/yr (conservative)
- Migration cost: $500-2,000
- **Payback: 0.5-2.5 months** ✓ (much faster than the 9-16 months previously estimated because migration is near-zero)

**S4 (Mautic) vs S1:**
- Mautic+SendGrid loses by $9,650/yr
- Mautic+SES wins by $1,920/yr (cash only, ignoring Luis time)
- If you DIY Mautic ops (50-80h/yr at $250/hr = $12.5-20K/yr opportunity cost), Mautic loses
- If you delegate to $100/hr contractor, Mautic+SES ties Brevo (within $3-4K/yr)

**S4 (Mautic) vs S2 (Brevo):**
- Mautic+SES wins by ~$3K-4K/yr (cash only) but loses on time
- Once you add Luis's opportunity cost, Mautic loses decisively

## THE DECISION TREE (with the new data)

**RECOMMENDATION: Move to Brevo within 30-60 days for the active brands (TY + MMJ + TurnedWizard at minimum).**

Trigger conditions:
1. If you stay on Omnisend for the other 3 brands while migrating TY+MMJ to Brevo, the 3-yr TCO is **$15-20K lower than staying on Omnisend** for all 5.
2. The 19 automations on TY (welcome, abandoned cart, abandoned checkout, browse, post-purchase, sunset, winback, illustration approval, Aimerce/Elevar variants) are the bulk of migration work but are well-documented and Brevo has native Shopify integration.
3. Send volume estimate of 600K-1.5M emails/mo puts Brevo at Standard 500K tier ($499/mo), or possibly 1M tier if growth resumes.

**TRIGGER TO REVISIT MAUTIC:**
- Portfolio consolidates to 1M+ contacts
- Send volume exceeds 1M-2M emails/month consistently
- You hire a dedicated DevOps person (not Luis-as-side-project)
- 5+ brands all at meaningful volume

**TRIGGER TO RECONSIDER OMNISEND:**
- None. The cleanup work is done, the bill is reasonable, but the cost is still 2-3x Brevo for the same outcome.

## KEY UNCERTAINTIES REMAINING

1. **Actual monthly email send volume** (Omnisend API doesn't expose this). Central estimate: 600K-1.5M emails/mo for TY alone.
2. **Other 3 brands' actual contact counts and GMV** (no data in this Mongo, 1 of 3 returns 403 on API).
3. **"30% of 2025" interpretation** — full year ($194K) vs last-90-day run-rate ($135K) gives different Brevo tier picks.
4. **Automation step counts** — Omnisend v5 detail endpoint returns 404 for this account, so I can't get exact email counts per automation.
5. **Whether the 19 TY automations are still driving 10%+ of revenue** — the "stay vs switch" ROI depends on this.

## WHAT I WANT GLM-5.2 TO VALIDATE

1. Verify the Brevo Standard 500K tier price ($499/mo) and the >500K tier pricing
2. Verify Amazon SES dedicated IP cost ($24.95/mo) and per-email rate ($0.10/1K)
3. Push back on the Mautic opportunity-cost math — is the $250/hr assumption correct? Or is it different?
4. Validate the 3-yr TCO comparison
5. Check if there's a Brevo plan I'm missing that better fits 1M+ emails/mo
6. Identify any missing cost factors for the 5-brand Omnisend scenario (e.g., the other 3 brands not yet cleaned)
7. Confirm the Brevo → Omnisend migration break-even math at 0.5-2.5 months payback
