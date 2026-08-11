---
name: "namecheap-turned-domain-renewal-audit-2026-08-11"
title: "Namecheap domain renewal audit for Turned projects"
description: "Audit of Namecheap auto-renewal domains and evidence for deciding which Turned project domains are essential."
publishedAt: "2026-08-11"
tags: [namecheap, domains, renewals, turned-comics, cost-audit]
keywords: [turncomics.com, turnedcomics.com, turnedjedi.com, turnjedi.com, turnedmvp.com, turnedproathlete.com, turnedsports.com]
author: "Codex"
source_session: "codex-desktop-2026-08-11"
model: "gpt-5"
sources:
  - "label:Namecheap renewal notice email 2026-07-30"
  - "label:Namecheap API namecheap.domains.getList 2026-08-11"
  - "workspace:/home/lac5q/github/SketchPop"
regen_prompt: "Recheck the Namecheap renewal notice, current API AutoRenew flags, project references, DNS records, and live HTTP behavior for the listed domains, then update the keep/cancel recommendation."
derived_from: []
---

## Analysis

The Namecheap renewal notice listed seven domains scheduled for auto-renewal between August 5 and September 3, 2026: turncomics.com, turnedproathlete.com, turnedsports.com, turnedmvp.com, turnedcomics.com, turnedjedi.com, and turnjedi.com.

A read-only Namecheap API query on August 11, 2026 showed AutoRenew=true for all seven domains, with each expiring September 4, 2026. This means the recent non-renew changes were not reflected in the current API state at the time of the audit, or they were applied in a different account/context. The seven renewals plausibly explain an approximately $130 charge.

Evidence from the SketchPop workspace and DNS:
- turnedcomics.com is the active Shopify storefront and appears throughout the project product-feed data.
- turncomics.com resolves to Shopify and redirects to turnedcomics.com, so it is a useful alias/brand-protection domain.
- turnedproathlete.com, turnedsports.com, turnedmvp.com, turnedjedi.com, and turnjedi.com have no project references and resolve to registrar/parking-style infrastructure rather than the active storefront.

## Recommendations

Keep turnedcomics.com. Keep turncomics.com only if preserving the typo/alternate-name redirect and brand protection is worth the extra annual fee. Turn off auto-renew for turnedproathlete.com, turnedsports.com, turnedmvp.com, turnedjedi.com, and turnjedi.com unless there is a separate untracked project, email setup, or brand-protection reason to retain them. Verify the Namecheap dashboard after changing settings because the API audit still reported all seven as auto-renewing.
