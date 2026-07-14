# TurnedYellow Email Platform — Independent Second-Opinion Cost Analysis

**Author:** Second-opinion cost analyst (delegated by parent session)
**Date:** 2026-07-08
**Scope:** Recompute all four option costs from current 2026 public pricing, push back on the prior analyst's numbers and recommendation, deliver a final call.
**Sources:** Cited inline. All pricing is from primary vendor pages or independent 2026 roundups; I checked where possible against the actual calculator tier tables, not just blog summaries.

---

## TL;DR (the punchlines)

1. **The prior analyst's Omnisend Pro number ($1,300-1,500/mo) is roughly 60-90% too high.** Verified tier table shows Pro at 60-65K contacts = **$800/mo** (Apr 2026 source). This single correction crushes Option 1's "obvious choice" status.
2. **The prior analyst's Brevo estimate ($350-450/mo at 125K emails) is roughly 2-3x too high.** Verified 2026 table shows Standard at 100K emails = **$129/mo**, Standard at 150K = **$169/mo**. They skipped the Standard tier and quoted Professional pricing.
3. **Mautic+SendGrid is the right long-term play but the prior analyst understated setup risk.** Micato is $30/mo (not free); SendGrid Pro 100K ($89.95) includes a dedicated IP, but you still need 4-6 weeks of IP warmup and you need someone competent to own it. Realistic dev-time is 60-100h, not 40-80h.
4. **My final recommendation differs from the prior analyst's.** I recommend **Option 1 (stay on Omnisend with cleanup) for the next 6-9 months, then reassess.** Not Option 2. Reasoning below.

---

## 1. Re-derived cost tables

### Option 1: Stay on Omnisend (post-cleanup, 65K contacts, Pro tier for SMS)

**Annual cost = ~$9,600/yr baseline (email-only SMS-send assumed modest) → ~$10,800-12,000/yr with realistic US SMS volume.**

| Item | Per month | Annual | Source |
|---|---:|---:|---|
| Omnisend Pro 60-65K contacts | $800 | $9,600 | InboxArmy tier table Apr 2026 ([inboxarmy.com](https://www.inboxarmy.com/blog/omnisend-pricing/)) — verified against Omnisend's own pricing calculator dropdown (band 60,001-65,000 visible at omnisend.com/pricing) |
| SMS at $0.007/SMS (volume-based 2026 pricing, est. ~5-10K SMS/mo for TY based on 52 SMS campaigns) | $35-70 | $420-840 | Omnisend 2026 support article; EmailTooltester 2026 confirms US base rate $0.007 post-May 2026 |
| **Total** | **$835-870** | **$10,020-10,440** | |

⚠️ **Prior analyst said $1,300-1,500/mo.** That is wrong by ~60%. They likely quoted the 130K-135K band. Cleanup took TY to 64,970 contacts, so the correct band is 60,001-65,000 = $800/mo Pro per the published tier table.

⚠️ **Also note:** Standard plan does NOT include SMS for accounts that subscribed after May 4, 2026. Since TY is on Pro (required for SMS), they're grandfathered on legacy SMS credits, but if they ever downgrade they lose SMS. Treat SMS as a Pro-only feature going forward.

### Option 2: Move to Brevo, keep 65K contacts (send-based pricing)

**Annual cost at TY's actual send volume: $1,800-3,200/yr (email only). Add $2,500-7,500/yr for SMS via Brevo credits.**

Email volume assumption (per parent session): ~80-200K emails/month at 20-30% of 2024 baseline. **Crucially, Brevo counts *emails sent*, not *contacts* — and Brevo's 19 automations drive heavy transactional/behavioral sends (welcome 11, abandoned cart 5, abandoned checkout 19, browse, post-purchase, sunset, winback, illustration approval, Aimerce/Elevar variants).** This dramatically changes the bill.

| Item | Per month | Annual | Source |
|---|---:|---:|---|
| Brevo Standard 100K emails/mo (covers 20% scenario) | $129 | $1,548 | EmailTooltester 2026 verified table |
| Brevo Standard 150K emails/mo (covers 30% scenario) | $169 | $2,028 | EmailTooltester 2026 verified table |
| Overage on Standard @ $0.0025-0.003/email above 150K (if true 200K+ runs through) | $125-150 | $1,500-1,800 | Brevo PAYG schedule |
| Brevo branding removal (Starter only — Standard includes it free) | $0 | $0 | Brevo help: "Standard, Professional, or Enterprise plan, the Brevo logo does not appear" |
| SMS via Brevo (100 US SMS = $1.09, est. 5-10K/mo for TY) | $55-110 | $660-1,320 | Brevo help center SMS calculator; emailtooltester 2026 |
| **Total email only (20% scenario, 100K)** | **$129** | **$1,548** | |
| **Total email only (30% scenario, 150K)** | **$169** | **$2,028** | |
| **Total with SMS (20%)** | **$184-239** | **$2,208-2,868** | |
| **Total with SMS (30%)** | **$224-279** | **$2,688-3,348** | |

⚠️ **Prior analyst said $4,200-5,400 (20%) and $8,400-10,800 (30%).** This is wrong by **3-5x**. They likely quoted Brevo **Professional at $499/mo** for every scenario, ignoring the Standard tier that includes automation up to 150K emails. Standard includes "Marketing automation: Create an unlimited number of automated, multi-step workflows" (brevo.com/pricing).

⚠️ **Hidden catch I have to flag:** Brevo's Starter plan caps automation at 2,000 contacts per month. TY needs Standard. Standard includes unlimited automation contacts. So Standard it is — but at Standard pricing, not Professional.

⚠️ **Brevo's sub-tiers cap contacts on Starter only.** Standard and above are "unlimited contacts." So **Option 2 and Option 3 are identical on contact count** — there is no contact-based reason to clean the list before moving to Brevo, and there is no cost savings from cleanup. Prior analyst was right to flag this. **Option 3 is a waste of time — confirmed.**

### Option 3: Move to Brevo with cleanup first

**Same as Option 2.** Cleanup adds zero value because Brevo doesn't bill by contacts on Standard and above. Prior analyst was correct to call this out. Recommend **dropping this option entirely.**

### Option 4: Mautic + SendGrid (self-hosted)

**Annual run cost: $1,200-2,000/yr (infra + SaaS). Setup cost: $6,000-12,000 + 60-100h dev time over 8-12 weeks.**

| Item | Per month | Annual | Source |
|---|---:|---:|---|
| SendGrid Pro 100K emails (incl. 1 dedicated IP, 2,500 free email validations, link branding, reverse DNS, 5 event webhooks) | $89.95 | $1,079 | Twilio SendGrid pricing 2026 (twilio.com/en-us/products/email-api/pricing) |
| SendGrid Pro 300K emails (covers both 20% and 30% scenarios with headroom for automation) | $249 | $2,988 | SendX 2026 SendGrid pricing summary (sendx.io/blog/sendgrid-pricing) |
| SendGrid Pro 700K (only if volume really runs that high) | $499 | $5,988 | Same |
| Micato Shopify-to-Mautic integration (Shopify App Store) | $30 | $360 | owlmix.webflow.io Micato listing, $30/mo band |
| Hetzner CX22 cloud VPS (4 vCPU, 8GB RAM, NVMe) or Contabo Cloud VPS 4 (8GB) for Mautic + MariaDB + Redis | $6-15 | $72-180 | Hetzner cloud pricing; Contabo blog 2026 |
| Backups (Hetzner Storage Box 1TB) | $4 | $48 | Hetzner |
| Domain + SSL (already have) | $0-2 | $0-25 | — |
| **Subtotal: infra + SaaS (mid-volume, Pro 100K)** | **$130-140** | **$1,560-1,680** | |
| **Subtotal: infra + SaaS (high-volume, Pro 300K)** | **$290-300** | **$3,480-3,600** | |

**IP warmup is the killer nobody talks about.** SendGrid Pro includes a dedicated IP, but a fresh dedicated IP has zero reputation. **Gmail/Outlook will throttle you to ~50-100 emails/day for weeks 1-2, scaling to full volume by week 6-8.** During warmup, expect:
- 4-6 weeks of low deliverability (potentially 60-80% inbox placement)
- Manual warmup schedule (SendGrid auto-warmup is included on Pro, but it's conservative)
- A real risk of "we did everything right but our 19 automations are landing in spam" during the first 60 days

**Setup cost (one-time):**
- Micato setup + webhook config: 8-12h
- Mautic install on Hetzner: 4-6h (Docker compose, MariaDB, Redis, cron, queue worker)
- SPF/DKIM/DMARC on Shopify sending domain: 2-3h
- Reverse DNS + SendGrid IP warmup configuration: 2-4h
- Recreate 19 automations: 40-60h (each has multiple email templates, splits, delays, conditions, dynamic content blocks)
- Email template HTML rebuild (Omnisend → Mautic builder has different syntax): 15-25h
- QA, deliverability testing, list re-import, suppression handling: 10-15h
- Documentation / runbook for ongoing maintenance: 4-6h
- **Total dev: 85-129h** at $75-150/h = **$6,400-19,350**

⚠️ **Prior analyst said $4-8K + 40-80h.** Dev-time is closer to 85-130h. I expanded because:
- 19 automations with extensive branching (19 messages on abandoned checkout alone) does not port 1:1
- Template HTML rebuild in Mautic is genuinely time-consuming
- IP warmup is invisible work that the prior analyst's table didn't account for

⚠️ **Hidden catch: who runs Mautic when Luis is busy?** Mautic is PHP + MySQL/MariaDB. It needs:
- Security patches (Mautic 5.x had multiple CVEs in 2024-2025)
- MariaDB/Redis maintenance
- Cron/queue worker monitoring
- VPS OS updates
- SendGrid IP warmup tweaks
- Deliverability triage when something breaks

If Luis has 5 brands and a $2-3M portfolio, **he is not going to be the one doing this work at 2am**. You either hire a DevOps contractor (~$500-1,500/mo retainer) or you accept that Mautic will rot within 6-12 months. Prior analyst didn't price this.

⚠️ **Twilio SMS pricing vs. Brevo vs. Omnisend** (prior analyst under-emphasized this):
- **Omnisend SMS:** $0.007-$0.15/SMS (volume tiered, US base 2026: $0.007 per Omnisend's announcement)
- **Brevo SMS:** $0.0109/SMS US (100-pack), tiered by country
- **Twilio SMS:** $0.0079-$0.0083/SMS US base, plus carrier surcharges and 10DLC fees ($1.50-$15 registration per brand)
- **Mautic + Twilio:** Cheapest per-message but you pay a developer to integrate it. Plus Twilio charges $1.15/mo per phone number, and 10DLC registration is mandatory for US A2P since 2024.

For 5-10K SMS/month to US, the difference is ~$30-50/mo between the three. **Not a deal-breaker for any option, but Omnisend is cheapest, Twilio cheapest per-message but with overhead.**

---

## 2. What the prior analyst got right

- ✅ **Avoiding Option 3 is correct** — cleanup before Brevo is a waste of effort.
- ✅ **Holdout test for automations before switching** — solid advice. If the 19 automations (especially abandoned checkout at 19 messages and welcome at 11) drive >10% of revenue, killing them for 2-3 months during migration is a real cost.
- ✅ **Don't switch if you can't measure** — this is a decision-grade input, not a "move fast" decision.
- ✅ **The $10.80/mo Brevo branding add-on** (only on Starter; Standard includes logo removal) is real and the prior analyst caught it.

## 3. What the prior analyst got wrong

| Claim | Prior analyst | Verified | Why it matters |
|---|---|---|---|
| Omnisend Pro 65K contacts | $1,300-1,500/mo | **$800/mo** | Makes Option 1 dramatically more attractive than presented |
| Brevo 125K emails/mo | $350-450/mo | **$129/mo Standard** (100K), **$169/mo** (150K) | Makes Options 2/3 dramatically cheaper than presented |
| Brevo 200K emails/mo | $700-900/mo | **$169 Standard + ~$125-150 overage = $295-320/mo** | Still cheaper than presented, but less so |
| Mautic+SendGrid infra | $96-174/mo | **$130-300/mo** (depending on volume) | Roughly correct for low-volume, much higher for 300K |
| Mautic dev time | 40-80h | **85-130h** | Undercounted by ~2x |
| Mautic SMS | "via Twilio plugin" (no cost) | **$0.0079/SMS + $1.15/number + 10DLC $1.50-15** | Add $50-100/mo for 5-10K SMS |
| Micato cost | not mentioned | **$30/mo** | Adds $360/yr to Mautic option |
| Ongoing Mautic maintenance | not mentioned | **$500-1,500/mo contractor OR 5-10h/mo of Luis's time** | Big operational risk |

## 4. Missing factors the prior analyst didn't flag

1. **Omnisend migration cost if you leave.** Omnisend's API does not expose per-campaign `sent` count for this account (per the parent session's evidence — reports endpoints 404). The data export path is undocumented and likely incomplete for automations, segments, and history. You're rebuilding state on the destination. **This applies symmetrically** — if you stay, you've already paid the cost. If you leave, you pay it again.

2. **Brevo deliverability on a Shopify-owned sending domain with no warmup history.** Brevo sends from shared IPs by default on Standard. Shared IP reputation is decent on Brevo (mid-tier provider, ~85-90% typical inbox placement) but variable. Shopify's own email system uses different infrastructure. SPF/DKIM/DMARC on the TY sending domain must be set up correctly or you will land in spam. **Estimate 2-3 weeks of tuning before steady-state.**

3. **The Omnisend→Mautic porting asymmetry.** Omnisend has prebuilt Shopify automations that "just work" (abandoned cart, browse, post-purchase). Mautic has none — you build everything from scratch with Micato feeding it webhooks. Even after migration, you'll have a feature gap on abandoned-cart templates for 2-4 weeks.

4. **Brand-portfolio consolidation.** TY is part of a 5-brand portfolio doing $2-3M. If other brands are also on Omnisend, there's a portfolio-volume discount at play (and a single-ESP management cost) that doesn't apply to Brevo/Mautic. The decision is for TY, but the parent owns the broader stack.

5. **The 5-brand portfolio's existing Omnisend migration is at $0 incremental cost.** Prior analyst correctly noted this. Worth restating: **the cleanup is done, the bill is dropping from ~$1,500-2,000/mo to ~$800/mo on Omnisend, and the rest of the work on the other 4 brands is amortized across the portfolio.**

6. **Brevo's hidden scaling cliff.** If TY grows from 30% back toward 2024 levels (8,158 orders/$1.19M), email volume goes from 200K to ~600-800K/mo. Brevo Standard tops at 150K; next is Professional at 500K @ $499/mo, then 1M @ ~$800+/mo. **Brevo gets expensive fast as you grow**, whereas Omnisend's contact-based model scales more linearly and is capped at known tiers. Mautic+SendGrid scales purely on infrastructure.

7. **Mautic 5.0 was released April 2024; 5.2 in late 2025.** The platform is alive but has had stability issues post-5.0 (Mautic forum threads on cron jobs, queue worker crashes, SMTP API integration flakiness with SendGrid). Not a deal-breaker, but it adds to the "who runs this" question.

8. **The accounting cost of dev time at $0.** Luis's time is not $0 even if he doesn't pay himself a salary. Opportunity cost of 85-130h of his attention vs. running a different brand initiative is real. Prior analyst didn't quantify.

## 5. Updated cost comparison (annual, USD)

| Option | 20% scenario | 30% scenario | Setup | Hidden | 3-yr TCO (20%) | 3-yr TCO (30%) |
|---|---:|---:|---:|---|---:|---:|
| 1. Omnisend + cleanup | **$10,020-10,440** | **$10,020-10,440** (no scenario difference) | $0 | $0 (done) | **$30,060-31,320** | **$30,060-31,320** |
| 2. Brevo as-is | **$2,208-2,868** | **$2,688-3,348** | $0 (done) | $0 | **$6,624-8,604** | **$8,064-10,044** |
| 3. Brevo + cleaned list | (same as 2) | (same as 2) | (waste of time) | — | — | — |
| 4. Mautic + SendGrid | **$1,560-1,680 + $6,400-19,350 setup** | **$3,480-3,600 + $6,400-19,350 setup** | $6,400-19,350 + 85-130h | $500-1,500/mo ongoing maintenance | **$15,080-39,300** (with setup amortized) | **$22,040-46,260** |

**Key insight: 3-year TCO tells a different story than annual cost.** Option 2 (Brevo) is the cheapest if you only compare subscription fees. Option 4 (Mautic) becomes the cheapest *only if* the setup costs amortize over 5+ years AND you actually keep it maintained. Option 1 (Omnisend) is the most expensive on a pure-subscription basis but has the lowest setup risk and zero marginal cost.

## 6. My final recommendation

### **Option 1: Stay on Omnisend for 6-9 months, then reassess.**

Reasoning, in order of weight:

1. **The cleanup already happened.** The hard part is done. Switching to anything else is pure extra cost with no new information.
2. **The $800/mo Pro cost (verified) is not as bad as the prior analyst made it look.** For $9,600/yr you get Shopify-native automations, SMS, push, advanced reporting, and zero operational burden. That's not crazy for a brand doing $130-195K GMV.
3. **Switching has a real deliverability tax.** Brevo on a new sending domain = 2-3 weeks of tuning. Mautic on a fresh dedicated IP = 4-6 weeks of warmup with potential spam-placement losses on the 19 automations.
4. **Automations are 19 and your data export path is broken.** You cannot easily port them. You'll rebuild from scratch on any other platform.
5. **The 6-9 month reassessment point matters.** If TY recovers to 50%+ of 2024 baseline, the calculus changes — Option 4 starts looking more attractive. If TY continues declining, Option 1 (or even 2) is the right call and the savings are real.

### When to pick Option 2 instead (Brevo)

Pick Brevo now if:
- You can run a holdout test on TY's automations and prove they're driving <10% of revenue
- You're willing to lose 2-3 weeks of automation performance during migration
- You want email cost down to $2-3K/yr immediately
- You don't expect TY to grow back toward 2024 baseline

### When to pick Option 4 (Mautic+SendGrid)

Pick Mautic only if:
- You're committed to the 5-brand portfolio strategy of self-hosting all email infra
- You have a real DevOps person (not Luis-as-side-project) maintaining it
- You can absorb 8-12 weeks of degraded automation performance during migration
- TY's volume grows past 500K emails/mo (where Brevo Professional's $499/mo starts to lose to Mautic)
- You're going to do this for all 5 brands, not just TY

### What I would NOT do

- Do not pay for Option 3 (Brevo with cleanup). Wasted effort.
- Do not start Mautic work without first doing a holdout test on Omnisend automations.
- Do not rush this. The cleanup already extracted most of the savings. The remaining decision is "do we accept the Omnisend tax for 6-9 months while we measure properly?" The answer to that is probably yes.

## 7. Specific question for the user

**Before locking the decision, I need one number:** **What % of TY's $130-195K annual GMV is currently attributable to email automations vs. other channels (paid social, organic, direct)?**

If automations are driving <10% of revenue: switch to Brevo (Option 2), save $7-8K/yr immediately, measure for 6 months, consider Mautic later if growth returns.

If automations are driving 10-30% of revenue: stay on Omnisend (Option 1), ride the cleanup, reassess in 6-9 months when you have stable data on TY's run-rate.

If automations are driving >30% of revenue: this is a much harder problem. You'd want to A/B test Brevo with a 10% holdout on the TY list before committing. Don't make the migration decision without that test.

The Omnisend API exposing `sent` count as 404 means you can't easily get per-automation revenue attribution from their side. You'd need to either:
- Pull from Shopify order attribution (coupon codes per automation, UTM params)
- Run a 30-day holdout where 10% of the list gets NO automation emails
- Use a third-party attribution tool (Triple Whale, Northbeam, etc.) that you may already have via Elevar (which the prior session mentioned is integrated)

If you can give me a number on that, I can sharpen this recommendation from "stay 6-9 months" to a specific decision and timeline.

---

**End of second-opinion report. Sources: Omnisend support article 3533018, Omnisend.com/pricing calculator tiers, InboxArmy April 2026 tier table, EmailTooltester 2026 Omnisend+Brevo reviews, Twilio.com/en-us/products/email-api/pricing, Brevo.com/pricing, Brevo help center on logo removal and SMS credits, SendX 2026 SendGrid pricing summary, Hetzner.com/cloud, Contabo.com/blog 2026 VPS comparison, forum.mautic.org on VPS recommendations and DO SMTP block, Micato/Shopify App Store listing, Twilio help center on US SMS tiered pricing, InboxArmy 2026 Omnisend tier table (April 2026).**
