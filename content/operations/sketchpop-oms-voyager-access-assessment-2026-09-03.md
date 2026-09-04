---
title: "SketchPop OMS access assessment for Voyager pilot"
description: "Access findings, ownership questions, and least-privilege requirements for giving James Bell's Voyager team read-only access to the SketchPop OMS."
publishedAt: "2026-09-03"
tags: [sketchpop, oms, mongodb-atlas, power-bi, voyager, access-control]
keywords: [SketchPop LLC, OMS, MongoDB Atlas, Atlas SQL Interface, Power BI, Fabric administrator, Voyager]
author: "Codex"
model: "gpt-5"
sources:
  - "gmail:1a0695c5fa890881"
  - "gmail:1a0257ed3a67804e"
  - "gmail:19b8c9a263161f5a"
  - "gmail:19ff706fdbd6711a"
  - "gmail:1992cea62cb0811b"
  - "https://www.mongodb.com/docs/atlas/reference/user-roles/"
  - "https://www.mongodb.com/docs/atlas/access/manage-project-access/"
  - "https://www.mongodb.com/docs/atlas/connect-to-database-deployment/"
  - "https://www.mongodb.com/docs/sql-interface/"
  - "https://www.mongodb.com/docs/sql-interface/query-with-sql/"
  - "https://learn.microsoft.com/en-us/fabric/admin/roles"
  - "https://learn.microsoft.com/en-us/power-bi/collaborate-share/service-roles-new-workspaces"
derived_from: []
regen_prompt: "Review the latest James Bell/Voyager, MongoDB Atlas, Power BI, and Ismail Bohri email threads; verify current MongoDB and Microsoft role requirements; and update the OMS pilot access plan without exposing credentials."
---

# SketchPop OMS access assessment for Voyager pilot

## Objective

Give James Bell's Voyager team enough read-only access to map the OMS and test an agentic BI workflow that could eventually replace Power BI, while excluding personally identifiable information and avoiding shared credentials.

## What James requested

In his September 3 reply, James agreed that read-only access is the right starting point. He asked whether Atlas SQL or the legacy BI Connector is enabled, whether access would be through Atlas, whether an existing Power BI semantic model can be shared, whether other documentation already exists, and whether a read-only account can see all needed collections through a view that excludes PII.

The August 21 meeting recap records the pilot goal as replacing Power BI for operational dashboards, beginning with non-sensitive customer-service data. Luis already sent James an OMS architecture one-pager describing MongoDB as the source and recommending an analytical read layer rather than direct use of the live operational database.

## Access findings

- Ismail invited Luis to the `SketchPop LLC` MongoDB Atlas organization in January 2026 and separately created a database user. The email does not say that Luis received `Organization Owner` or `Project Owner`. The absence of project access controls in Luis's Atlas UI is consistent with a non-owner role.
- Atlas application users and database users are separate. A database login does not grant the right to invite users, create database users, manage network access, or configure project access.
- MongoDB requires `Project Owner` to invite users or teams to a project and manage project access. `Project Owner` also includes database-access and IP-access-list management. `Organization Owner` is broader and is not required for this pilot if the work stays inside the existing project.
- The current Power BI login appears to be a standard shared user, not a Microsoft tenant administrator. In September 2025, the account-transfer thread explicitly stated that the team did not have a working Power BI admin login. No later email was found confirming that this was resolved.
- Power BI tenant settings are controlled by a Microsoft `Fabric Administrator`, `Power Platform Administrator`, or `Global Administrator`. Workspace access is separate: an Admin, Member, or Contributor can download a PBIX file, subject to tenant settings and other limitations.
- In August 2026, Ismail said the Power BI connection would need to migrate to MongoDB's SQL Interface or refreshes would stop. No email confirming completion of that migration was found.
- MongoDB documents the legacy BI Connector as reaching end of life in September 2026. The SQL Interface is read-only and is backed by Atlas Data Federation; it can expose virtual databases/collections and schemas to SQL clients.

## Recommended access design

1. Ask the current MongoDB `Project Owner` to create a dedicated Voyager integration rather than sharing the existing `biusers` or Luis database login.
2. Expose only the collections and fields required for the pilot through an Atlas Data Federation / SQL Interface read layer, excluding PII at the source.
3. Give Voyager a separate database/service credential with read-only privileges to that curated layer. Restrict network access to known IPs or an agreed private connection where practical.
4. Keep Atlas console access separate. James's team does not need `Project Owner`; Luis or Ismail needs that role to configure and revoke access. Grant James's team only the minimum Atlas project visibility needed, if any.
5. Identify the Power BI workspace owner or Microsoft Fabric/Global administrator. Export/share the existing PBIX or semantic-model documentation through workspace permissions; do not share the tenant login.
6. Rotate the OMS database credential that was previously transmitted by email before onboarding an external pilot, and share any new secret only through 1Password.
7. Start with the non-sensitive customer-service scope, validate row/field exposure, logging, query load, and revocation, then widen access collection by collection.

## Questions sent to Ismail

An unsent Gmail draft was created to `ismailbohri@gmail.com` with subject `OMS / Power BI admin access for Voyager pilot`. It asks:

- Whether Ismail has MongoDB Atlas `Organization Owner` or `Project Owner` access, or knows who does.
- Whether Ismail has Microsoft 365 `Global Administrator`, `Power Platform Administrator`, or `Fabric Administrator` access, or knows who does.
- Whether the BI Connector is still active or the SQL Interface migration was completed.
- Where the Power BI semantic model/PBIX lives and who can export or share it.
- Whether he can grant Luis the appropriate role or create a dedicated, least-privilege, read-only, non-PII connection for Voyager.
- That credentials should not be emailed; invitations, role assignment, and 1Password should be used.

## Current blocker

The 1Password MCP connector was not available in the session, and the local `1password-mcp` binary was not installed or registered. Therefore, the contents and role behavior of the `biusers@TurnedYellow.com` item could not be independently inspected. Gmail searches found no message containing that exact address. The visible lack of Power BI tenant settings is strong evidence that the account is not a tenant admin, but Ismail or the Microsoft 365 administrator must confirm.
