---
name: cordant-host-access-isolation-audit
title: "Cordant host access isolation audit"
description: "Live audit of whether users with access to cordant-hermes-01 can reach maeve-u1, private GitHub repositories, or deployed MemroOS source."
publishedAt: "2026-08-19"
tags: [security, access-control, tailscale, ssh, github, memroos]
keywords: [cordant-hermes-01, maeve-u1, memroos-product, private-repository, SSH keys]
author: "Pi"
source_session: "01a0191b-1627-7a5f-a9b4-ffa417409cb5"
model: "gpt-5.6-luna"
sources:
  - "label:live-host-audit:cordant-hermes-01:2026-08-19"
  - "label:live-host-audit:maeve-u1:2026-08-19"
  - "https://github.com/lac5q/memroos-product"
derived_from: []
regen_prompt: "Re-audit cordant-hermes-01 and maeve-u1 for Tailscale reachability, SSH authorization, GitHub credentials, source copies, and attributable login/copy evidence without exposing secrets."
---

## Analysis

The current cordant-hermes-01 configuration does not isolate the host from the owner's machines or private GitHub resources. The host has a system-wide Tailscale node (`100.82.89.3`) and its firewall permits Tailnet traffic. A live probe from cordant-hermes-01 reached maeve-u1 (`100.109.19.110`) by ping and TCP/22.

The `ubuntu` account is root-equivalent: it is allowed `sudo (ALL) NOPASSWD: ALL` and belongs to `sudo`, `docker`, and `lxd`. Any accepted SSH key for that account can therefore read the Tailscale node state, use root privileges, and access all files and network routes available to the host.

A GitHub CLI login for account `lac5q` was present at `/home/ubuntu/.config/gh/hosts.yml`. Its token had the `repo` scope plus administrative scopes. Before any remediation, `gh repo view` from cordant confirmed access to `lac5q/memroos-product`, which was reported private. The `lac5q/memroos` repository was reported public. No token value was recorded in this report.

Copies of the source are already present on cordant: `/home/ubuntu/memroos` is a working source tree, and `/home/ubuntu/github/memroos-product` is a symlink to that same tree. The source root is owned by `ubuntu:ubuntu` with mode `775`; 15,268 files were world-readable in the audit. This is a deployed copy, not evidence by itself of an unauthorized copy.

## Evidence about JD/KSH

No operating-system accounts named JD or KSH were present; the host has one interactive account, `ubuntu`, so SSH logs cannot attribute activity to a human once a key is accepted. The authorized-key file contained six key lines/five unique fingerprints, including entries commented `Luis PEM`, `lac5q@maeve-u1` (duplicated), and `@lcalderon`, plus entries without a clear owner. Accepted-login logs inspected for the recent period showed sessions from maeve-u1 using fingerprint `SHA256:tijod8nCKeS8XDM15/wFboilh2v3OpRHxZjGEfgAPaE` and from main-mac using `SHA256:5nirVlg7P6NoIujGUoShl+8Zo57T/urBymc9hTHxGTY`. No accepted login attributable to JD/KSH was identified, but the shared `ubuntu` account prevents a definitive attribution.

The shell history contained references to `~/github/memroos` and `github/memroos-product`; no explicit `scp` or `rsync` command naming those repositories appeared in the short history scan. Auditd was inactive and had no file-read rules, so there is no reliable historical record of who read or copied files. Session/log stores contained source-related references, but those references alone do not prove an unauthorized copy.

## Recommendations

1. Treat the cordant GitHub token as exposed: revoke it in GitHub, then remove the remote `gh` credential and rotate any other credentials that were present on the host.
2. Remove Tailscale from this shared host, or place it in a restricted Tailnet/tag with no route to maeve-u1 or other owner machines. Tailscale is node-wide, not per-user; merely keeping the daemon installed cannot provide the requested isolation.
3. Replace shared `ubuntu` SSH access with a user-specific administrator account/key, remove unknown authorized keys, and remove `ubuntu` from `sudo`, `docker`, and `lxd` unless that account is intentionally trusted. Keep a separate non-login service account for MemroOS.
4. Move the deployed source under a dedicated service account with restrictive permissions, or deploy artifacts rather than a full working clone. Do not delete `/home/ubuntu/memroos` until the running services have been migrated.
5. Enable auditd or equivalent command/file audit before granting any further access. Without pre-existing audit rules, past source reads cannot be proven or disproven.

This audit recorded findings only; it did not yet change the Tailscale configuration, SSH authorized keys, GitHub token, or source tree.


## Remediation update — auditd enabled (2026-08-19)

Installed [1mauditd[0m and [1maudispd-plugins[0m on cordant-hermes-01. The audit daemon is active and enabled at boot. Persistent rules are stored in [1m/etc/audit/rules.d/50-memroos-access.rules[0m and load successfully through augenrules.

The rules record login-attributed command execution, reads from [1m/home/ubuntu/memroos[0m, source/Git metadata changes, GitHub credential changes, SSH authorized-key changes, Tailscale node-state changes, SSH/sudo/systemd/audit-rule changes, and the ubuntu shell history. Audit log rotation was increased to 64 MB per file with 10 rotated files. A benign source-read verification generated matching audit events; audit status reported active, enabled, and zero lost events at verification time.

Audit is detection, not prevention. A root user can disable or erase host-local auditing, so this must be combined with removal of shared sudo/root access and Tailscale isolation. Use [1msudo ausearch -if /var/log/audit/audit.log -k memroos-source-read -i[0m (and the other rule keys) when reviewing events; the default current-log selector did not include the rotated/current audit file consistently on this host.
