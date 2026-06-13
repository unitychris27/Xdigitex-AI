---
name: XDIGITEX DB schema
description: Database schema layout and seeding for XDIGITEX AI
---

## Tables (all in lib/db/src/schema/)
users, projects, agents, agent_timeline, agent_routing, bots, deployments, servers, secrets, invoices, usage_logs, referral_links, referrals, promotions, templates, notifications, team_members, api_keys, ai_providers, audit_logs, activity

## Key enums (must match Postgres enum values exactly)
- user_role: super_admin, admin, moderator, support, user
- project_status: active, paused, completed, archived
- agent_type: planner, architect, frontend, backend, devops, qa, security, reviewer, research, telegram_bot_builder
- agent_status: idle, running, completed, failed, paused
- bot_status: active, inactive, deploying, error
- secret_type: api_key, ssh_key, database_credential, token, certificate
- template_category: telegram_bots, saas_apps, ai_agents, automation_workflows

## Secrets handling
Secret values are base64-encoded (not real encryption) stored as `encrypted_value`. Never return `encrypted_value` field to clients — always destructure it out before returning.

## Push command
`pnpm --filter @workspace/db run push` — pushes schema to dev DB
