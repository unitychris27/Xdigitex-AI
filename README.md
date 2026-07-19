# XDIGITEX AI

> **Multi-Agent Development Platform** — An AI-powered SaaS where autonomous coding agents connect to remote servers via SSH and build complete software projects without stopping.

---

## What It Does

XDIGITEX AI gives you a team of specialized AI agents that:
- SSH into your Linux / cPanel servers
- Plan, write code, and verify files — all automatically
- Build full applications (PHP, Node.js, Python, etc.) from a single prompt
- Detect and fix their own mistakes using screenshot analysis (Gemini Vision)
- Manage context smartly: fresh context per phase → never hits token limits

---

## Agent Architecture

```
User Prompt
    │
    ▼
Kimi K2.6  ────────── Planner       (breaks project into phases, writes spec to disk)
    │
    ▼
DeepSeek V4 Pro ────── Builder       (writes files, runs SSH commands, 80 iter max)
    │
    ├──> DeepSeek V4 Flash ── Verifier    (quick post-command checks)
    └──> GLM 5.1 ─────────── Recovery    (triggered after 2 consecutive failures)
                                │
                            Kimi replan  (if recovery fails)

Gemini 2.0 Flash ─── Screenshot QA  (Playwright browser → visual verification)
```

**Key reliability mechanisms:**
- **Fresh context per phase** — when checkpoint advances (phase 1→2→3), accumulated SSH output is wiped and the next phase starts clean (~2K tokens vs 36K+)
- **Spec on disk** — full project spec saved to `/root/.xd_spec.txt` at start; each phase reads from disk instead of carrying it in context
- **One file per cmd, max 80 lines** — prevents JSON truncation in SSH stream
- **Python `r"""..."""` raw strings** — safe for PHP `$vars`, quotes, backslashes with no escaping
- **Consecutive-fail replan** — after 2 all-fail batches → Kimi restrategizes → DeepSeek resumes

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 19, Vite 7, TypeScript, Tailwind CSS 4, Wouter, Framer Motion, TanStack Query |
| **Backend** | Express 5, Node.js 24, TypeScript, Pino logging |
| **Database** | PostgreSQL + Drizzle ORM |
| **AI** | OpenAI SDK (DeepSeek, NVIDIA NIM, xAI), Google Generative AI (Gemini 2.0, Imagen 3.0) |
| **SSH** | ssh2 (key + password auth) |
| **Browser** | Playwright + Chromium (headless testing + screenshot QA) |
| **Auth** | Google OAuth 2.0 + session-based auth |
| **Email** | Brevo SMTP |
| **Package Manager** | pnpm workspaces (monorepo) |

---

## Project Structure

```
xdigitex-ai/
├── artifacts/
│   ├── api-server/          # Express backend (port 8080)
│   │   └── src/
│   │       ├── routes/
│   │       │   ├── servers.ts        # ← SSH agent loop + AI orchestration (core)
│   │       │   ├── deployments.ts    # Deployment tracking
│   │       │   └── ...
│   │       └── lib/
│   │           ├── ai.ts             # Model routing, AI clients
│   │           └── browser.ts        # Playwright automation
│   └── xdigitex/            # React frontend (port served via Vite)
│       └── src/
│           ├── pages/
│           │   ├── servers/index.tsx # SSH agent UI
│           │   ├── workspace.tsx     # Dev workspace hub
│           │   └── ...
│           └── contexts/AuthContext.tsx
├── lib/
│   ├── db/                  # Drizzle schema + migrations
│   └── api-spec/            # OpenAPI spec + generated hooks
├── scripts/                 # Utility scripts
├── docker-compose.yml
├── Dockerfile
└── .env.example
```

---

## Quick Start (Docker)

### Prerequisites
- Docker + Docker Compose
- A PostgreSQL database (or use the included compose service)
- API keys (see `.env.example`)

### 1. Clone
```bash
git clone https://github.com/unitychris27/Xdigitex-AI.git
cd Xdigitex-AI
```

### 2. Configure environment
```bash
cp .env.example .env
# Edit .env with your API keys
nano .env
```

### 3. Start
```bash
docker compose up -d
```

App is live at `http://localhost:3000`  
API is at `http://localhost:8080`

---

## Quick Start (Manual / pnpm)

### Prerequisites
- Node.js 24+
- pnpm 9+
- PostgreSQL 15+

### 1. Install
```bash
corepack enable
pnpm install
```

### 2. Configure
```bash
cp .env.example .env
# Fill in DATABASE_URL and API keys
```

### 3. Database setup
```bash
pnpm --filter @workspace/db run push
```

### 4. Run (development)
```bash
# Terminal 1 — API server
pnpm --filter @workspace/api-server run dev

# Terminal 2 — Frontend
pnpm --filter @workspace/xdigitex run dev
```

---

## Environment Variables

See `.env.example` for the full list. Required keys:

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | Random secret for session encryption |
| `DEEPSEEK_API_KEY` | DeepSeek API key (builder agent) |
| `NVIDIA_API_KEY` | NVIDIA NIM key (Kimi planner) |
| `GEMINI_API_KEY` | Google Gemini key (screenshot QA) |
| `XAI_API_KEY` | xAI key (Grok fallback) |
| `OPENROUTER_API_KEY` | OpenRouter key (model routing) |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `BREVO_API_KEY` | Brevo email API key |
| `BREVO_SMTP_*` | Brevo SMTP credentials |

---

## Database Schema

Key tables (PostgreSQL / Drizzle ORM):

| Table | Purpose |
|---|---|
| `users` | User accounts, roles, Google OAuth |
| `api_keys` | Per-user API key management |
| `servers` | SSH server credentials (key/password auth) |
| `server_task_history` | Agent run history, token usage, logs |
| `projects` | Project definitions and status |
| `agents` | Agent configurations and routing rules |
| `deployments` | Deployment history and environments |
| `invoices` / `usage_logs` | Billing and usage tracking |
| `templates` | Marketplace project templates |
| `audit_logs` | Security and activity audit trail |

---

## How the Agent Loop Works

```
iter 0   → Kimi plans (saves spec to /root/.xd_spec.txt, writes checkpoint)
iter 1-N → DeepSeek builds (ONE file per cmd, ≤80 lines, python3 r"""...""")
           After each file: php -l / node -c / python3 -c to verify
           ↓
           Checkpoint phase advances? (e.g., phase 1→2)
           → FRESH CONTEXT RESET
           → All 30K+ tokens of SSH history wiped
           → Next phase starts with 2K-token clean slate
           → Reads spec + checkpoint from disk to resume
           ↓
           Consecutive failures (≥2)? → Kimi replan → resume
           ↓
iter final → action="done" with verification proof
```

---

## Development Commands

```bash
pnpm run typecheck              # Full typecheck (libs + all artifacts)
pnpm run build                  # Build all packages
pnpm --filter @workspace/api-spec run codegen   # Regenerate API hooks from OpenAPI
pnpm --filter @workspace/db run push            # Push schema changes (dev only)
pnpm --filter @workspace/api-server run build   # Build API server
```

---
## How OpenAI Codex & GPT-5.6 Were Used
This project was built with extensive assistance from OpenAI Codex and GPT-5.6 throughout development.
## Codex
Generated production-ready code.
Refactored and optimized existing code.
Fixed bugs and implementation issues.
Created project components and utilities.
Assisted with debugging and repository improvements.
## GPT-5.6
Designed agent architecture and workflows.
Generated prompts and reasoning logic.
Improved documentation and README files.
Helped plan automation features and user experience.
Assisted with testing strategies, feature planning, and technical explanations.
The combination of Codex for implementation and GPT-5.6 for planning, reasoning, debugging, and documentation significantly accelerated development and reduced engineering time.

## License

MIT — see [LICENSE](LICENSE)
