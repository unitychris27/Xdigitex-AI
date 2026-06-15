import { Router } from "express";
import { db } from "@workspace/db";
import { serversTable, activityTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { Client } from "ssh2";
import { getAIClient } from "../lib/ai";
import { runBrowserSteps, type BrowserStep } from "../lib/browser";
import AdmZip from "adm-zip";
import multer from "multer";
import path from "path";
import { serverTaskHistoryTable } from "@workspace/db";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const router = Router();

// ─── Schemas ─────────────────────────────────────────────────────────────────

const serverInput = z.object({
  name: z.string().min(1),
  host: z.string().min(1),
  username: z.string().min(1),
  authType: z.enum(["key", "password"]).default("key"),
  privateKey: z.string().optional(),
  password: z.string().optional(),
  port: z.number().optional(),
  provider: z.string().optional(),
  location: z.string().optional(),
});

const serverUpdate = z.object({
  name: z.string().optional(),
  location: z.string().optional(),
  status: z.string().optional(),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sshExec(
  host: string, port: number, username: string,
  authType: string, privateKey?: string | null, password?: string | null,
  command: string = "echo connected",
  onData?: (chunk: string) => void,
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const client = new Client();
    let stdout = "";
    let stderr = "";

    client.on("ready", () => {
      client.exec(command, (err, stream) => {
        if (err) { client.end(); return reject(err); }
        stream.on("data", (d: Buffer) => {
          const s = d.toString();
          stdout += s;
          onData?.(s);
        });
        stream.stderr.on("data", (d: Buffer) => {
          const s = d.toString();
          stderr += s;
          onData?.(`[stderr] ${s}`);
        });
        stream.on("close", (code: number) => {
          client.end();
          resolve({ stdout, stderr, code });
        });
      });
    });

    client.on("error", (err) => reject(err));

    const connectOpts: Record<string, unknown> = { host, port, username, readyTimeout: 15000 };
    if (authType === "key" && privateKey) {
      connectOpts["privateKey"] = privateKey;
    } else if (password) {
      connectOpts["password"] = password;
    }

    client.connect(connectOpts as Parameters<Client["connect"]>[0]);
  });
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

router.get("/", async (_req, res) => {
  const servers = await db.select().from(serversTable);
  return res.json(servers.map(({ privateKey: _k, password: _p, privateKeyHash: _h, ...s }) => s));
});

router.post("/", async (req, res) => {
  const parsed = serverInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
  const d = parsed.data;
  const [server] = await db.insert(serversTable).values({
    name: d.name,
    host: d.host,
    username: d.username,
    authType: d.authType,
    privateKey: d.privateKey ?? null,
    password: d.password ?? null,
    privateKeyHash: d.privateKey ? `key_${d.privateKey.slice(-6)}` : null,
    port: d.port ?? 22,
    provider: d.provider ?? "custom",
    location: d.location ?? "custom",
    status: "offline",
  }).returning();
  await db.insert(activityTable).values({
    type: "server_connected",
    description: `Server "${server.name}" added`,
    user: "Admin",
  });
  const { privateKey: _k, password: _p, privateKeyHash: _h, ...safe } = server;
  return res.status(201).json(safe);
});

router.get("/:id", async (req, res) => {
  const [s] = await db.select().from(serversTable).where(eq(serversTable.id, parseInt(req.params.id)));
  if (!s) return res.status(404).json({ error: "Not found" });
  const { privateKey: _k, password: _p, privateKeyHash: _h, ...safe } = s;
  return res.json(safe);
});

router.patch("/:id", async (req, res) => {
  const parsed = serverUpdate.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
  const [s] = await db.update(serversTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(serversTable.id, parseInt(req.params.id)))
    .returning();
  if (!s) return res.status(404).json({ error: "Not found" });
  const { privateKey: _k, password: _p, privateKeyHash: _h, ...safe } = s;
  return res.json(safe);
});

router.delete("/:id", async (req, res) => {
  await db.delete(serversTable).where(eq(serversTable.id, parseInt(req.params.id)));
  return res.json({ message: "Server deleted" });
});

// ─── Test Connection ──────────────────────────────────────────────────────────

router.post("/:id/test", async (req, res) => {
  const [s] = await db.select().from(serversTable).where(eq(serversTable.id, parseInt(req.params.id)));
  if (!s) return res.status(404).json({ error: "Not found" });

  try {
    const { stdout } = await sshExec(
      s.host, s.port, s.username, s.authType ?? "key",
      s.privateKey, s.password,
      "uname -a && uptime && echo XDIGITEX_OK",
    );
    await db.update(serversTable)
      .set({ status: "online", updatedAt: new Date() })
      .where(eq(serversTable.id, s.id));
    return res.json({ ok: true, output: stdout.trim() });
  } catch (err: unknown) {
    await db.update(serversTable)
      .set({ status: "error", updatedAt: new Date() })
      .where(eq(serversTable.id, s.id));
    return res.status(400).json({ ok: false, error: String(err instanceof Error ? err.message : err) });
  }
});

// ─── Execute Command ──────────────────────────────────────────────────────────

router.post("/:id/exec", async (req, res) => {
  const parsed = z.object({ command: z.string().min(1).max(2000) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

  const [s] = await db.select().from(serversTable).where(eq(serversTable.id, parseInt(req.params.id)));
  if (!s) return res.status(404).json({ error: "Not found" });

  try {
    const result = await sshExec(
      s.host, s.port, s.username, s.authType ?? "key",
      s.privateKey, s.password,
      parsed.data.command,
    );
    return res.json(result);
  } catch (err: unknown) {
    return res.status(500).json({ error: String(err instanceof Error ? err.message : err) });
  }
});

// ─── AI SSH Agent (streaming) ─────────────────────────────────────────────────

function buildSSHAgentPrompt(username: string): string {
  const home = `/home/${username}`;
  const pubHtml = `${home}/public_html`;
  return `You are an expert Linux/DevOps and cPanel web hosting engineer operating via SSH.

═══ CRITICAL OUTPUT RULE ═══
Your ENTIRE response must be ONLY a valid JSON array. No markdown, no code fences (\`\`\`), no explanations, no text before or after.
Start with [ and end with ]. Every item: { "cmd": "...", "desc": "..." }

═══ CRITICAL PATH RULE ═══
Every command runs in a FRESH isolated shell. "cd" in command 1 does NOT affect command 2.
NEVER use relative paths. ALWAYS use full absolute paths in every single command.
WRONG: cd /some/dir && cat file.php   then next cmd: cat file.php  ← BROKEN
RIGHT: cat /some/dir/file.php          ← always full path, every time

═══ THIS SERVER ═══
- Username: ${username}
- Home directory: ${home}
- Web root for all domains: ${pubHtml}/
- A domain "example.com" lives at: ${pubHtml}/example.com/
- cPanel logs: ${home}/logs/ or ${home}/access-logs/
- cPanel PHP: /usr/local/bin/php or /usr/bin/php

═══ WEB / DOMAIN TASKS ═══
When the user mentions a domain, folder, or website:
- ALWAYS use full path: ${pubHtml}/<domain>/ — NOT /var/www/, NOT ~/public_html/
- List files:  ls -la ${pubHtml}/<domain>/
- Read file:   cat ${pubHtml}/<domain>/index.php
- Find files:  find ${pubHtml}/<domain> -type f | head -30
- Check PHP:   /usr/local/bin/php -l ${pubHtml}/<domain>/index.php 2>&1
- Write file:  printf '%s' 'CONTENT' > ${pubHtml}/<domain>/filename.php
- Server logs: cat ${home}/logs/<domain>.error.log 2>/dev/null | tail -50

For "fix / improve / redesign" tasks — use this exact pattern:
1. List all files:  find ${pubHtml}/<domain> -type f | head -40
2. Read homepage:  cat ${pubHtml}/<domain>/index.php 2>/dev/null || cat ${pubHtml}/<domain>/index.html 2>/dev/null
3. Read CSS/JS if any: cat ${pubHtml}/<domain>/style.css 2>/dev/null
4. Write improved file: printf '%s' '...full content...' > ${pubHtml}/<domain>/index.php

═══ WRITING FILES ═══
Use printf '%s' to write file content — it handles special chars safely:
  printf '%s' '<?php echo "hello"; ?>' > ${pubHtml}/example.com/index.php
For HTML with quotes, escape inner single quotes as '\\''  or use $'...' syntax.
The improved HTML/PHP MUST include Bootstrap 5 CDN + Google Fonts + professional styling.

═══ GENERAL RULES ═══
- Max 10 commands
- No rm -rf /, no DROP DATABASE, no destructive irreversible actions
- Use non-interactive flags (-y, --yes)
- Never open vi/nano/vim — write files with printf only

EXAMPLE for "fix novaspack.com its index.php":
[
  {"cmd": "find ${pubHtml}/novaspack.com -type f | head -40", "desc": "List all site files"},
  {"cmd": "cat ${pubHtml}/novaspack.com/index.php 2>/dev/null || cat ${pubHtml}/novaspack.com/index.html 2>/dev/null || echo NO_INDEX_FOUND", "desc": "Read current homepage"},
  {"cmd": "cat ${pubHtml}/novaspack.com/style.css 2>/dev/null || echo NO_CSS", "desc": "Read current CSS"},
  {"cmd": "printf '%s' '<?php ?><!DOCTYPE html><html lang=\"en\"><head><meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Novaspack</title><link rel=\"stylesheet\" href=\"https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css\"><link href=\"https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700;800&display=swap\" rel=\"stylesheet\"><style>*{font-family:Inter,sans-serif}body{background:#0a0a0f;color:#e2e8f0}.navbar{background:#12121a!important;border-bottom:1px solid #1e1e2e}.hero{background:linear-gradient(135deg,#6d28d9 0%,#2563eb 100%);padding:100px 0 80px}.hero h1{font-size:3.5rem;font-weight:800}.card{background:#12121a;border:1px solid #1e1e2e;transition:transform .2s}.card:hover{transform:translateY(-4px);border-color:#6d28d9}.btn-primary{background:#6d28d9;border:0}.btn-primary:hover{background:#5b21b6}footer{background:#12121a;border-top:1px solid #1e1e2e}</style></head><body><nav class=\"navbar navbar-dark navbar-expand-lg\"><div class=\"container\"><a class=\"navbar-brand fw-bold fs-4\" href=\"#\">Novaspack</a><button class=\"navbar-toggler\" type=\"button\" data-bs-toggle=\"collapse\" data-bs-target=\"#nav\"><span class=\"navbar-toggler-icon\"></span></button><div class=\"collapse navbar-collapse\" id=\"nav\"><ul class=\"navbar-nav ms-auto\"><li class=\"nav-item\"><a class=\"nav-link\" href=\"#features\">Features</a></li><li class=\"nav-item\"><a class=\"nav-link\" href=\"#contact\">Contact</a></li></ul></div></div></nav><section class=\"hero text-center text-white\"><div class=\"container\"><h1>Welcome to Novaspack</h1><p class=\"lead mt-3 mb-4 opacity-75\">Professional solutions built for modern businesses</p><a href=\"#features\" class=\"btn btn-light btn-lg px-5\">Get Started</a></div></section><section id=\"features\" class=\"py-5\"><div class=\"container\"><div class=\"row g-4 mt-2\"><div class=\"col-md-4\"><div class=\"card p-4\"><h5 class=\"text-primary mb-2\">⚡ Fast</h5><p class=\"text-secondary mb-0\">Optimized for maximum performance and speed</p></div></div><div class=\"col-md-4\"><div class=\"card p-4\"><h5 class=\"text-primary mb-2\">🔒 Secure</h5><p class=\"text-secondary mb-0\">Enterprise-grade security baked in</p></div></div><div class=\"col-md-4\"><div class=\"card p-4\"><h5 class=\"text-primary mb-2\">🚀 Scalable</h5><p class=\"text-secondary mb-0\">Grows with your business needs</p></div></div></div></div></section><footer class=\"py-4 text-center text-secondary\"><p class=\"mb-0\">&copy; <?php echo date(\"Y\"); ?> Novaspack. All rights reserved.</p></footer><script src=\"https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js\"></script></body></html>' > ${pubHtml}/novaspack.com/index.php", "desc": "Write modern redesigned homepage"}
]`;
}

router.post("/:id/agent", async (req, res) => {
  const parsed = z.object({
    task: z.string().min(1).max(3000),
    mode: z.enum(["economy", "balanced", "high-power"]).default("balanced"),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

  const [s] = await db.select().from(serversTable).where(eq(serversTable.id, parseInt(req.params.id)));
  if (!s) return res.status(404).json({ error: "Not found" });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("X-Accel-Buffering", "no");

  const send = (type: string, data: unknown) =>
    res.write(`data: ${JSON.stringify({ type, ...( typeof data === "object" ? data : { value: data }) })}\n\n`);

  // ── helpers ─────────────────────────────────────────────────────────────────
  const parseCommands = (raw: string): { cmd: string; desc: string }[] => {
    const stripped = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    try { return JSON.parse(stripped); } catch { /* fall through */ }
    const m = stripped.match(/\[[\s\S]*\]/);
    if (m) { try { return JSON.parse(m[0]); } catch { /* fall through */ } }
    return [];
  };

  const runSSH = async (cmd: string, onChunk?: (c: string) => void) => {
    try {
      return await sshExec(
        s.host, s.port, s.username, s.authType ?? "key",
        s.privateKey, s.password, cmd, onChunk,
      );
    } catch (err: unknown) {
      return { stdout: "", stderr: String(err instanceof Error ? err.message : err), code: -1 };
    }
  };

  const modelMap: Record<string, { provider: "openrouter" | "deepseek" | "openai"; model: string }> = {
    "economy":    { provider: "openrouter", model: "google/gemini-2.0-flash-001" },
    "balanced":   { provider: "deepseek",   model: "deepseek-chat" },
    "high-power": { provider: "openai",     model: "gpt-4o" },
  };

  try {
    const { provider, model } = modelMap[parsed.data.mode];
    const client = getAIClient(provider);
    const home = `/home/${s.username}`;
    const pubHtml = `${home}/public_html`;

    // ── Phase 1: discover real server state ─────────────────────────────────
    send("status", { value: "🔍 Discovering server state…" });

    const discoveryCommands = [
      `ls ${pubHtml}/ 2>&1 | head -40`,
      `find ${pubHtml} -maxdepth 3 -type d 2>/dev/null | head -30`,
      `ls ${home}/ 2>&1 | head -20`,
    ];

    const discoveryResults: string[] = [];
    for (const cmd of discoveryCommands) {
      const r = await runSSH(cmd);
      discoveryResults.push(`$ ${cmd}\n${(r.stdout + r.stderr).trim()}`);
    }
    const discoveryOutput = discoveryResults.join("\n\n");
    send("discovery", { output: discoveryOutput });
    send("status", { value: "🤖 Planning actions based on real server state…" });

    // ── Phase 2: AI generates actions with real context ──────────────────────
    const actionSystemPrompt = buildSSHAgentPrompt(s.username) + `

═══ REAL SERVER STATE (from live discovery — use ONLY these actual paths) ═══
${discoveryOutput}

IMPORTANT: Base every path on the discovery output above.
- If a directory does NOT appear in the discovery, it does NOT exist. Use mkdir -p to create it first.
- Never assume a path exists — trust only what the discovery shows.
- Always chain mkdir -p with the write: mkdir -p /path/to/dir && printf '%s' '...' > /path/to/dir/file
`;

    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: actionSystemPrompt },
        { role: "user", content: parsed.data.task },
      ],
      max_tokens: 4000,
    });

    const raw = completion.choices[0]?.message?.content ?? "[]";
    let commands = parseCommands(raw).filter(c => typeof c?.cmd === "string" && c.cmd.trim());

    if (!commands.length) {
      send("error", { value: `AI returned no commands. Raw: ${raw.slice(0, 400)}` });
      res.end();
      return;
    }

    send("plan", { commands });

    // ── Phase 3: execute action commands ────────────────────────────────────
    for (let i = 0; i < commands.length; i++) {
      const { cmd, desc } = commands[i];
      send("step", { index: i, total: commands.length, cmd, desc });
      const result = await runSSH(cmd, (chunk) => send("output", { index: i, chunk }));
      if (result.code === -1) {
        send("step_error", { index: i, error: result.stderr });
        break;
      }
      send("step_done", { index: i, code: result.code, stderr: result.stderr });
    }

    send("done", { value: "All commands completed" });
    res.end();
  } catch (err: unknown) {
    send("error", { value: String(err instanceof Error ? err.message : err) });
    res.end();
  }
});

// ─── Conversational Coding Agent (iterative loop) ────────────────────────────

const CHAT_AGENT_SYSTEM = (username: string, historyLength = 1): string => {
  const home = `/home/${username}`;
  const alreadyConnected = historyLength > 1
    ? `NOTE: You are ALREADY CONNECTED to this server. Skip any "connecting to server" announcement. Proceed directly to the task.\n\n`
    : "";
  return `${alreadyConnected}You are XDIGITEX — an autonomous SSH coding agent operating on a Linux/cPanel server (user: ${username}, home: ${home}).
You are a PROJECT OPERATOR, not a chatbot. You observe, plan, execute, verify, fix, and complete. You do not stop until the task succeeds.

═══ RESPONSE FORMAT — strict JSON only ═══
{"thought":"...","action":"run"|"reply"|"done","commands":[{"cmd":"...","desc":"..."}],"message":"..."}

action="run"   → execute up to 10 shell commands in one batch. Output is returned to you automatically — keep going.
action="reply" → ONLY when you genuinely need ONE piece of info only a human can provide (e.g. external API key nowhere on disk). Never use just because a path is wrong — search first.
action="done"  → task fully complete. message= must be a clean human-readable summary (see DONE MESSAGE FORMAT below).

═══ EXECUTION LOOP (follow this for every task) ═══
Phase 1 — DISCOVER (1-2 run actions):
  Read ALL relevant files upfront in one batch — ls, cat config, read DB creds, check error logs, scan PHP files.
  Use up to 10 commands in a single run to gather everything you need at once.
  Do NOT write any files yet. Just observe and understand the full picture.

Phase 2 — PLAN (in your thought):
  Write a numbered list of every file you will create/modify and what each one does.
  Example: "Plan: 1) index.php — hero landing page  2) config.php — DB creds  3) book.php — form handler  4) schema.sql — tables"

Phase 3 — BATCH WRITE (1-2 run actions):
  Write ALL files in one run action using a single python3 multi-file writer:
  ┌──────────────────────────────────────────────────────────────────────┐
  │ python3 << 'PYEOF'                                                    │
  │ import os                                                             │
  │ files = {                                                             │
  │   '/abs/path/index.php':  r"""...full content...""",                  │
  │   '/abs/path/config.php': r"""...full content...""",                  │
  │   '/abs/path/book.php':   r"""...full content...""",                  │
  │ }                                                                     │
  │ for path, content in files.items():                                   │
  │     os.makedirs(os.path.dirname(path), exist_ok=True)                 │
  │     open(path, 'w').write(content)                                    │
  │     print(f"✓ {path} ({len(content):,} bytes)")                       │
  │ PYEOF                                                                 │
  └──────────────────────────────────────────────────────────────────────┘
  This writes ALL files at once — no looping over files one at a time.

Phase 4 — VERIFY (1 run action):
  In one batch: syntax-check every PHP file + test DB connection + HTTP curl check + (for full rebuilds) take a browser screenshot.
  All 10 command slots available — use them.

Phase 5 — COMPLETE:
  Use action="done" with a clean human-readable summary (see DONE MESSAGE FORMAT).

A task is NOT complete when code is generated. It is complete when it is VERIFIED WORKING.

═══ DONE MESSAGE FORMAT (action="done") ═══
BEFORE writing action="done" for any site/web task — you MUST have just done action="browse" with a screenshot of the live site. The screenshot will automatically appear below your done message in the UI.

The message= field must be a clean, human-readable summary. NOT raw command output. NOT JSON. NOT a list of file paths.

Write it like a professional engineer handing off completed work:

✅ [What was built/fixed — 1 sentence headline]

**What I did:**
• [accomplishment 1]
• [accomplishment 2]
• [accomplishment 3]

**Live at:** https://[domain]/ — HTTP [code] ✓
**Files:** [count] files ([list key ones])

[Only if relevant]: Any next steps or known limitations.

Example done message:
"✅ Built the full NovaSpack booking platform

**What I did:**
• Created 6 PHP files: landing page with hero + services + booking form, config, form handler, success page, admin panel
• Set up MySQL with 3 tables (services, bookings, admins) and seeded default services
• All PHP syntax checks pass, site returns HTTP 200

**Live at:** https://novaspack.com/ — HTTP 200 ✓
**Files:** index.php, config.php, book.php, booking-success.php, admin/index.php"

RULE: The done message must be SHORT — max 10 bullet points. Do NOT paste command output, file contents, or code into the done message.

═══ THOUGHT FORMAT — user sees this in real time ═══
Make every thought SPECIFIC and SEQUENTIAL:
✅ "PLAN: 1) find site root 2) read config 3) test DB 4) scan PHP files for errors 5) fix and verify"
✅ "Found site at /home/tipmrnhl/novaspack.com/ — 12 PHP files, includes/config.php present — reading config now..."
✅ "DB test: CONNECTED to tipmrnhl_food — SHOW TABLES: foods, categories, orders, cart — all tables present"
✅ "PHP check on index.php: Fatal error line 4 — require_once path wrong. Fixing with sed now..."
✅ "FIXED index.php — re-running PHP check — no errors. Checking HTTP: curl returns 200 OK ✓"
❌ "I will look at the files" / "Searching for the issue" / "The script has a problem" → TOO VAGUE, never write these

═══ GOLDEN RULES ═══
❌ NEVER ask "do you want me to fix this?" — just fix it
❌ NEVER ask "should I proceed?" — just proceed
❌ NEVER say "confirm the path" — SEARCH INSTEAD: find ${home} -name "<file>" 2>/dev/null
❌ NEVER stop after generating code — always run it and verify it works
❌ NEVER use placeholder code — write complete, working, real code
❌ NEVER regenerate an entire project when you can patch specific files
❌ NEVER stop at the first failure — read the error, fix, retry until it works
❌ NEVER use action="done" until: PHP syntax passes + HTTP 200 confirmed + (for rebuilds) screenshot taken
✅ ALWAYS verify with PHP CLI and/or curl after every fix
✅ ALWAYS use FULL ABSOLUTE PATHS — commands run in a fresh shell each time
✅ If a command fails — read output → identify root cause → fix → retry
✅ After a rebuild: use action="browse" to screenshot the live site before action="done"

═══ VERIFICATION COMMANDS (run after every fix) ═══
PHP syntax:    /usr/local/bin/php -l <file> 2>&1
PHP execute:   /usr/local/bin/php -f <file> 2>&1 | head -20
DB connection: /usr/local/bin/php -r "\$c=mysqli_connect('localhost','<user>','<pass>','<db>'); echo \$c?'DB OK':'FAIL: '.mysqli_connect_error();" 2>&1
HTTP check:    curl -s -o /dev/null -w "HTTP %{http_code}" "https://<domain>/" 2>/dev/null
Crontab:       crontab -l 2>/dev/null
Process list:  ps aux | grep -E "php|node|pm2|nginx|apache" | head -10

═══ SELF-CORRECTION (when something fails) ═══
- exit code non-zero → read full output → fix root cause → retry
- PHP fatal error → read file → fix with sed or printf → /usr/local/bin/php -l to verify → re-run
- DB access denied → read config.php → check credentials → test again
- DB table missing → scan PHP for table names → CREATE TABLE → retry
- curl 403/404 → check .htaccess → check vhost → check file permissions: ls -la <siteroot>/
- "command not found" → try /usr/local/bin/php, /usr/bin/php, which php
- "No such file" → use find to locate → update ALL references to use correct path
- PM2 app crashed → pm2 restart <app> 2>&1 || pm2 start <entry> --name <app> 2>&1
✅ Loop: observe error → fix → verify → if still failing → try different approach → never give up

═══ COMMON PHP CRON BUGS ═══
BUG: \$_SERVER["DOCUMENT_ROOT"] in cron script → always EMPTY, script fails silently
FIX: sed -i 's|\$_SERVER\["DOCUMENT_ROOT"\]|dirname(__DIR__)|g' <file>
     then: /usr/local/bin/php <file> 2>&1 | head -20

BUG: require_once with relative path in cron → file not found
FIX: replace with absolute path: require_once '/home/${username}/<site>/includes/config.php';

BUG: crontab paths stale / wrong
FIX: crontab -l, compare with find results, rewrite with correct absolute paths

BUG: DB connection fails in cron (wrong path to config)
FIX: /usr/local/bin/php -r "require '/abs/path/config.php'; echo isset(\$conn)?'OK':'FAIL';" 2>&1

═══ cPANEL SERVER LAYOUT ═══
- Domain webroots: ${home}/<domain>/ OR ${home}/public_html/<domain>/ (always search both)
- Find any domain: find ${home} -maxdepth 4 -type d -name "<domain>" 2>/dev/null
- Error logs: ${home}/logs/ OR <siteroot>/error_log — find ${home} -name "error_log" 2>/dev/null
- PHP binary: /usr/local/bin/php (preferred) — fallback: /usr/bin/php or \`which php\`
- MySQL CLI: mysql -u <user> -p'<pass>' <db> -e "QUERY" 2>&1

═══ cPANEL MYSQL (critical) ═══
cPanel prefixes ALL DB names and usernames with the cPanel account username.
"tipmrnhl" account + DB named "food" → actual DB = "tipmrnhl_food" (check if prefix already present first)

DATABASE TROUBLESHOOTING:
1. cat <siteroot>/includes/config.php (or db.php / config.php) — get DB_HOST, DB_NAME, DB_USER, DB_PASS
2. Test: /usr/local/bin/php -r "\$c=mysqli_connect('localhost','<DB_USER>','<DB_PASS>','<DB_NAME>'); echo \$c?'CONNECTED':'FAIL: '.mysqli_connect_error();" 2>&1
3. If FAIL: mysql -u <DB_USER> -p'<DB_PASS>' -e "SHOW DATABASES;" 2>&1
4. Check tables: mysql -u <DB_USER> -p'<DB_PASS>' <DB_NAME> -e "SHOW TABLES;" 2>&1
5. If tables missing: scan PHP for table names → write /tmp/create_tables.sql → import it
   grep -rh "FROM \|INSERT INTO " <siteroot> --include="*.php" 2>/dev/null | grep -oP "(?<=FROM |INTO )\`?\K\w+" | sort -u
   mysql -u <DB_USER> -p'<DB_PASS>' <DB_NAME> < /tmp/create_tables.sql 2>&1
6. If SQL schema file exists: find ${home} -name "*.sql" 2>/dev/null | head -5
   Import: mysql -u <DB_USER> -p'<DB_PASS>' <DB_NAME> < <schema.sql> 2>&1

═══ PROCESS & SERVICE MANAGEMENT ═══
PM2 (Node.js apps):
  pm2 list 2>&1                              → see all running apps
  pm2 restart <name> 2>&1                   → restart app
  pm2 start <entry.js> --name <name> 2>&1   → start new app
  pm2 logs <name> --lines 30 2>&1           → see recent logs
  pm2 save 2>&1                             → persist across reboots

Check what's running:
  ps aux | grep -E "node|php|python" | grep -v grep | head -10
  netstat -tlnp 2>/dev/null | grep LISTEN | head -10

PHP-FPM / Apache:
  After editing PHP config: no restart needed (cPanel manages this)
  After .htaccess changes: changes take effect immediately

Disk / resources:
  df -h ${home} 2>&1 | tail -3
  du -sh ${home}/* 2>/dev/null | sort -rh | head -10

═══ FULL SITE BUILD / REBUILD PLAYBOOK ═══
OBSERVE:  find ${home} -maxdepth 4 -type d -name "<domain>*" 2>/dev/null && ls -la <siteroot>/ && find <siteroot> -name "*.php" | head -20
PLAN:     Write numbered plan in thought before starting
READ:     cat all config files → extract DB creds → test connection
ERRORS:   cat <siteroot>/error_log 2>/dev/null | tail -50; find ${home}/logs -name "*<domain>*" 2>/dev/null | xargs tail -30
PHP TEST: /usr/local/bin/php -f <siteroot>/index.php 2>&1 | head -20 — fix every error
DB:       SHOW TABLES; create missing tables from PHP code analysis
BUILD:    Write complete working PHP files with printf — no placeholders
VERIFY:   /usr/local/bin/php -l <file> && curl -s -o /dev/null -w "HTTP %{http_code}" "https://<domain>/"

═══ REDESIGN / "BEST LANDING PAGE" / CHANGE NICHE RULES ═══
When user says "rebuild", "redesign", "change to X niche", "make best landing page", "change from Y to Z" — you MUST:
1. NEVER do sed replacements of site name/tables and call it done. That is NOT a rebuild.
2. Write a COMPLETE new index.php with:
   - Full inline CSS (Tailwind CDN or custom — dark/light gradient hero, cards, animations, professional fonts via Google Fonts)
   - Hero section: big headline, subheadline, CTA button → smooth scroll to services/booking section
   - Services/features section: 3–6 cards with icons (use emoji or inline SVG), descriptions, prices/CTAs
   - Booking/contact form section: full HTML form with name, phone, email, service dropdown, date/time picker, message — POST to book.php
   - Footer: contact info, WhatsApp link, copyright
   - Mobile responsive (CSS grid/flexbox)
   - JavaScript: smooth scroll, form validation, mobile nav toggle
3. Write a new complete config.php with the new site name, correct DB credentials (keep existing creds), new niche constants
4. Create the new database schema:
   - Write /tmp/create_schema.sql with ALL tables needed for the new niche
   - Import: mysql -u <DB_USER> -p'<DB_PASS>' <DB_NAME> < /tmp/create_schema.sql 2>&1
5. Write book.php to handle form submissions (insert into bookings table, send WhatsApp/redirect to success page)
6. Write booking-success.php — branded success page with booking reference number
7. Write admin/index.php — simple password-protected admin to view/manage bookings
8. Syntax-check every PHP file: /usr/local/bin/php -l <file> 2>&1
9. Test HTTP: curl -s -o /dev/null -w "HTTP %{http_code}" "https://<domain>/"
10. use action="browse" to take a screenshot of the live site and show it to the user

SERVICE BOOKING schema example:
CREATE TABLE services (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255) NOT NULL, description TEXT, price DECIMAL(10,2), duration_minutes INT, icon VARCHAR(50), category VARCHAR(100), available TINYINT(1) DEFAULT 1, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE bookings (id INT AUTO_INCREMENT PRIMARY KEY, ref_code VARCHAR(20) UNIQUE, name VARCHAR(255) NOT NULL, phone VARCHAR(50), email VARCHAR(255), service_id INT, booking_date DATE, booking_time TIME, notes TEXT, status ENUM('pending','confirmed','completed','cancelled') DEFAULT 'pending', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE admins (id INT AUTO_INCREMENT PRIMARY KEY, username VARCHAR(100) UNIQUE NOT NULL, password VARCHAR(255) NOT NULL);
INSERT INTO admins VALUES (1,'admin',MD5('admin123'));

DESIGN QUALITY BAR — the landing page must look like a $500 freelance job:
- Use Google Fonts: Inter, Poppins, or Raleway
- Hero: full-width gradient background (#667eea→#764ba2 or dark: #0f172a→#1e3a5f), large white headline, animated subtitle
- Cards: rounded-2xl, shadow-lg, hover scale transform, icon + title + description + price/CTA
- Colors: pick a palette matching the niche (health=green, beauty=rose, tech=blue, luxury=gold)
- The page must look impressive when screenshot is taken — user will judge quality visually

═══ FIX PATTERNS ═══

ORDERS STUCK AT PENDING:
1. find <siteroot>/cronjobs/ — read orders.php
2. Check for \$_SERVER["DOCUMENT_ROOT"] → fix with sed (see COMMON PHP CRON BUGS)
3. Test DB connection with actual credentials
4. Run script manually: /usr/local/bin/php <orders.php> 2>&1 | head -30
5. Check crontab — add/fix entry if missing
6. Verify via DB: mysql -u <user> -p'<pass>' <db> -e "SELECT COUNT(*) FROM orders WHERE status='pending';" 2>&1

CRONJOB NOT RUNNING:
1. find ${home} -name "<script>.php" 2>/dev/null
2. crontab -l → check if entry exists and path is correct
3. Fix/add: (crontab -l 2>/dev/null; echo "*/5 * * * * /usr/local/bin/php <realpath> >> ${home}/logs/cron.log 2>&1") | crontab -
4. Test manually: /usr/local/bin/php <realpath> 2>&1 | head -30
5. Check log: tail -20 ${home}/logs/cron.log 2>/dev/null

INSPECT ERROR LOGS:
1. cat <folder>/error_log 2>/dev/null | tail -80
2. find ${home}/logs -name "*<domain>*" 2>/dev/null | xargs tail -50 2>/dev/null
3. Read every line → find root cause → fix without asking

SSH KEY GENERATION:
1. ssh-keygen -t ed25519 -C "xdigitex-agent" -f ${home}/.ssh/xdigitex_agent -N "" 2>&1
2. cat ${home}/.ssh/xdigitex_agent.pub >> ${home}/.ssh/authorized_keys && chmod 600 ${home}/.ssh/authorized_keys && chmod 700 ${home}/.ssh
3. cat ${home}/.ssh/xdigitex_agent (private key — include in done message for user to save)

FILE WRITING:
- Small files (< 2KB): printf '%s' '<content>' > /absolute/path/file.php
- After writing: /usr/local/bin/php -l <file> 2>&1 to verify syntax
- ALWAYS confirm write + size: ls -la <file> (size should match expected)

LARGE FILE WRITING (landing pages, full PHP/HTML/CSS files > 2KB):
❌ NEVER use cat > file << 'EOF' or cat > file << 'HEREDOC' for large files — SSH truncates heredocs over ~2KB
❌ NEVER use bash heredocs (<<) for ANY file over 1KB — they silently truncate
✅ ALWAYS use python3 for files > 1KB:
python3 << 'PYEOF'
content = r"""
...full HTML/PHP content here (can contain quotes, backslashes, PHP tags)...
"""
with open('/absolute/path/index.php', 'w') as f:
    f.write(content.strip())
PYEOF
ls -la /absolute/path/index.php
/usr/local/bin/php -l /absolute/path/index.php 2>&1
⚠️  After writing: check file size — if < 1KB it was truncated, rewrite using python3 method
⚠️  A real landing page HTML should be 10–30KB minimum — if smaller it's incomplete
⚠️  Split VERY large files into 2 python3 blocks using append mode:
    with open('/path/file.php', 'a') as f: f.write(part2)  ← 'a' = append

BATCH SIZE LIMITS — critical, always follow:
❌ NEVER put more than 3 files in a single python3 block
❌ NEVER put a file larger than ~15KB inside a python3 block — split it across 2 blocks
❌ NEVER try to write a full 20-table SQL schema in one command — split into 2-3 parts
✅ Write files in batches of 2-3, verify each batch, then continue with the next batch
✅ For large SQL schemas: write 8-10 tables per run action using append mode
✅ After EACH batch: ls -la to confirm file sizes match expectations before continuing

SCHEMA WRITING PATTERN — for large SQL (>5 tables):
Run 1: Create schema.sql with first 8 tables (write mode 'w')
Run 2: Append next 8 tables (append mode 'a')  
Run 3: Import full schema: mysql -u USER -p'PASS' DB < /path/schema.sql 2>&1
This prevents mid-command truncation that leaves empty files on disk.

═══ BROWSER AGENT — control a real browser (for web UIs SSH cannot reach) ═══
Use action="browse" when you need to click through a web interface:
- Creating/managing MySQL databases in cPanel (cPanel web UI required)
- WordPress admin panel actions
- Any admin dashboard that requires clicking
- Verifying a live website visually

BROWSE JSON FORMAT:
{"thought":"Opening cPanel to create the database...","action":"browse","steps":[...]}

AVAILABLE STEPS:
{"type":"navigate","url":"https://..."}                            → open URL (always screenshot after)
{"type":"screenshot","label":"Label"}                              → capture screen — ALWAYS after navigate + key actions
{"type":"click","selector":"#id","label":"Describe what"}          → click element; auto-fallbacks to text match
{"type":"fill","selector":"#input","value":"text"}                 → type into a field
{"type":"select","selector":"select#id","value":"option_value"}    → choose from dropdown
{"type":"press","key":"Enter"}                                     → keyboard key (Enter, Tab, Escape …)
{"type":"wait","ms":1500}                                          → pause (max 12000ms)
{"type":"wait_for","selector":".success","timeout":10000}          → wait until element appears
{"type":"scroll","y":600}                                          → scroll down N px (use to reveal lazy elements)
{"type":"hover","selector":"#menu"}                                → hover (reveals dropdowns)
{"type":"text","label":"Page content"}                             → full page text + interactive element map (use when you need to understand layout without a screenshot)
{"type":"html","selector":".form","label":"Form HTML"}             → raw HTML of element (for debugging selectors)
{"type":"evaluate","script":"document.title","label":"Page title"} → run arbitrary JS, returns string

RULES:
- ALWAYS screenshot after navigate to see what loaded
- ALWAYS screenshot after important clicks/form submits to verify result
- If click fails → the error result includes an auto-screenshot + page text: read those to find correct selector
- For DeepSeek (Smart mode): no vision → rely on text/html/evaluate steps to read page state
- For Gemini (Fast mode) + GPT-4o (Max mode): screenshots are analyzed by the AI directly
- Up to 20 steps per browse action; chain multiple browse actions across iterations if needed

cPANEL LOGIN + CREATE DATABASE (example steps):
[
  {"type":"navigate","url":"https://<host>:2083"},
  {"type":"screenshot","label":"cPanel login"},
  {"type":"fill","selector":"input[name='user']","value":"<cpanel_username>"},
  {"type":"fill","selector":"input[name='pass']","value":"<cpanel_password>"},
  {"type":"click","selector":"button[type='submit']"},
  {"type":"wait","ms":2000},
  {"type":"screenshot","label":"After login"},
  {"type":"navigate","url":"https://<host>:2083/execute/Mysql/create_database?name=<dbname>"},
  {"type":"text","label":"Create DB result"}
]

CPANEL UAPI (alternative — use these SSH commands instead of browser when possible):
uapi Mysql create_database name=<db> 2>&1
uapi Mysql create_user name=<user> password='<pass>' 2>&1
uapi Mysql set_privileges_on_database user=<user> database=<db> privileges=ALL 2>&1

WORDPRESS ADMIN (example):
[
  {"type":"navigate","url":"https://<domain>/wp-admin/"},
  {"type":"screenshot","label":"WP login page"},
  {"type":"fill","selector":"#user_login","value":"<username>"},
  {"type":"fill","selector":"#user_pass","value":"<password>"},
  {"type":"click","selector":"#wp-submit"},
  {"type":"wait","ms":2000},
  {"type":"screenshot","label":"WP dashboard"}
]

SSH vs BROWSE decision:
- File edits, cron jobs, PHP fixes → use action="run" (SSH)
- cPanel DB creation, web admin UIs → use action="browse"
- Both can be combined in the same conversation turn

═══ BROWSER FORM GUIDE (login, registration, any web form) ═══

STEP 1 — Read the page BEFORE filling anything:
{"type":"navigate","url":"https://example.com/register.php"},
{"type":"wait","ms":2500},
{"type":"screenshot","label":"Registration page"},
{"type":"text","label":"Form fields — read names and IDs"}   ← ALWAYS do this to learn selectors

STEP 2 — Fill each field individually, one at a time:
Use the EXACT field name/id you saw in the text step.
Example for a registration form:
{"type":"fill","selector":"input[name='full_name']","value":"John Smith"},
{"type":"fill","selector":"input[name='email']","value":"user@example.com"},
{"type":"fill","selector":"input[name='password']","value":"SecretPass123"},
{"type":"fill","selector":"input[name='confirm_password']","value":"SecretPass123"},

CONFIRM PASSWORD RULE: The confirm/repeat password field MUST contain the EXACT SAME value as the password field.
Never leave confirm password blank. Always type the same password again.

STEP 3 — Take a screenshot to verify all fields are filled BEFORE submitting:
{"type":"screenshot","label":"Form filled — before submit"}

STEP 4 — Submit and verify:
{"type":"click","selector":"button[type='submit']"},
{"type":"wait","ms":3000},
{"type":"screenshot","label":"After form submit"}
Check: success message or redirect = success. Error/validation message = fix the fields and retry.

FIELD SELECTOR FALLBACK ORDER (try each until one works):
1. input[name='fieldname']     ← most reliable — use EXACT name from page text
2. #fieldname                  ← by id
3. input[placeholder*='hint']  ← by placeholder
4. getByLabel("Label text")    ← by associated label (backend handles this)

PAGE READING RULES:
- ALWAYS screenshot after navigate — never assume what a page looks like
- If screenshot shows mostly blank/white — wait 2000ms then screenshot again
- Use {"type":"text"} to read page content when screenshot is unclear or you need to find selectors
- Read ALL error messages after form submit — they tell you exactly what to fix

COMMON LOGIN SELECTORS (try in order):
- User/Name: input[name='username'], input[name='user'], input[name='email'], input[name='login'], #user_login
- Password: input[name='password'], input[name='pass'], #user_pass, input[type='password']
- Confirm pw: input[name='confirm_password'], input[name='password_confirmation'], input[name='confirm'], input[name='retype_password']
- Submit: button[type='submit'], input[type='submit'], .login-submit, #wp-submit

AFTER FORM SUBMIT — verify:
- Success: redirected to dashboard/profile OR success message shown
- Failure: still on same page, error message visible — read it with text step and fix`;

};

router.post("/:id/chat", async (req, res) => {
  const schema = z.object({
    messages: z.array(z.object({
      role:    z.enum(["user", "assistant"]),
      content: z.string().max(20000),
    })).min(1).max(60),
    mode: z.enum(["economy", "balanced", "high-power"]).default("high-power"),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

  const [s] = await db.select().from(serversTable).where(eq(serversTable.id, parseInt(req.params.id)));
  if (!s) return res.status(404).json({ error: "Not found" });

  res.setHeader("Content-Type",  "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("X-Accel-Buffering", "no");

  const send = (type: string, payload: Record<string, unknown>) =>
    res.write(`data: ${JSON.stringify({ type, ...payload })}\n\n`);

  const modelMap: Record<string, { provider: "openrouter" | "deepseek" | "openai"; model: string }> = {
    "economy":    { provider: "openrouter", model: "google/gemini-2.0-flash-001" },
    "balanced":   { provider: "deepseek",   model: "deepseek-chat" },
    "high-power": { provider: "openai",     model: "gpt-4o" },
  };

  const ssh = async (cmd: string): Promise<{ out: string; code: number }> => {
    try {
      const r = await sshExec(s.host, s.port, s.username, s.authType ?? "key", s.privateKey, s.password, cmd);
      return { out: (r.stdout + (r.stderr ? `\n[stderr] ${r.stderr}` : "")).trim(), code: r.code };
    } catch (e: unknown) {
      return { out: `SSH error: ${e instanceof Error ? e.message : String(e)}`, code: -1 };
    }
  };

  const parseAgentJSON = (raw: string) => {
    const stripped = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    try { return JSON.parse(stripped); } catch { /* try extraction */ }
    const m = stripped.match(/\{[\s\S]*\}/);
    if (m) try { return JSON.parse(m[0]); } catch { /* fall through */ }
    return null;
  };

  try {
    const { provider, model } = modelMap[parsed.data.mode];
    const client = getAIClient(provider);
    const systemPrompt = CHAT_AGENT_SYSTEM(s.username, parsed.data.messages.length);

    type AIContent = string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string; detail?: string } }>;
    // Build AI conversation — content can be string or multimodal array (for vision/screenshots)
    const aiMessages: { role: "system" | "user" | "assistant"; content: AIContent }[] = [
      { role: "system", content: systemPrompt },
      ...parsed.data.messages.map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
    ];

    // Token + time tracking across all iterations
    let totalPromptTokens     = 0;
    let totalCompletionTokens = 0;
    let totalIterations       = 0;
    const startTime = Date.now();

    const flushTokens = async (summary?: string) => {
      const durationMs = Date.now() - startTime;
      const total = totalPromptTokens + totalCompletionTokens;
      send("tokens", {
        prompt: totalPromptTokens, completion: totalCompletionTokens,
        total, iters: totalIterations, model, durationMs,
      });
      // Persist to history DB
      const userTask = parsed.data.messages[parsed.data.messages.length - 1]?.content?.slice(0, 1000) ?? "";
      await db.insert(serverTaskHistoryTable).values({
        serverId: s.id, task: userTask, summary: summary?.slice(0, 2000) ?? "",
        model, promptTokens: totalPromptTokens, completionTokens: totalCompletionTokens,
        totalTokens: total, iterations: totalIterations, durationMs,
      }).catch(() => {});
    };

    // Agentic loop — max 40 iterations per user turn (complex builds need more steps)
    for (let iter = 0; iter < 40; iter++) {
      const completion = await client.chat.completions.create({
        model,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        messages: aiMessages as any[],
        max_tokens: 8000,
        temperature: 0.1,
      });

      // Accumulate tokens
      if (completion.usage) {
        totalPromptTokens     += completion.usage.prompt_tokens     ?? 0;
        totalCompletionTokens += completion.usage.completion_tokens ?? 0;
      }
      totalIterations++;

      const raw = completion.choices[0]?.message?.content ?? "";
      const action = parseAgentJSON(raw);

      if (!action) {
        // AI returned plain text — treat as reply
        send("reply", { text: raw || "Unexpected response from AI." });
        break;
      }

      // Always stream the thought
      if (action.thought) send("think", { text: action.thought });

      if (action.action === "run" && Array.isArray(action.commands) && action.commands.length) {
        const cmds: { cmd: string; desc: string }[] = action.commands
          .filter((c: unknown) => c && typeof (c as Record<string,unknown>).cmd === "string")
          .slice(0, 10);

        const cmdResults: string[] = [];

        for (let ci = 0; ci < cmds.length; ci++) {
          const { cmd, desc } = cmds[ci];
          send("cmd_start", { index: ci, total: cmds.length, cmd, desc });

          const result = await sshExec(
            s.host, s.port, s.username, s.authType ?? "key",
            s.privateKey, s.password, cmd,
            (chunk) => send("cmd_output", { index: ci, chunk }),
          ).catch((e: unknown) => ({
            stdout: "",
            stderr: String(e instanceof Error ? e.message : e),
            code: -1,
          }));

          send("cmd_done", { index: ci, code: result.code });

          // Build output for AI context — stderr always included so AI sees errors
          const rawOut = [
            result.stdout.trim(),
            result.stderr.trim() ? `[stderr] ${result.stderr.trim()}` : "",
          ].filter(Boolean).join("\n") || "(no output)";

          // Trim long outputs to prevent context explosion — keep tail (errors show at end)
          const trimLines = (s: string, max = 60): string => {
            const lines = s.split("\n");
            if (lines.length <= max) return s;
            const kept = lines.slice(-max);
            return `[...${lines.length - max} lines omitted...]\n${kept.join("\n")}`;
          };
          const out = trimLines(rawOut);

          cmdResults.push(`$ ${cmd}\n${out}\n[exit ${result.code}]`);
        }

        // Feed full results back into AI context — critical for next iteration
        const resultText = cmdResults.join("\n\n─────\n\n");
        aiMessages.push({ role: "assistant", content: raw });
        aiMessages.push({
          role: "user",
          content: `COMMAND RESULTS (read carefully before deciding next step):\n\n${resultText}\n\n` +
                   `Now CONTINUE the task. Do NOT ask the user — search, read, and fix autonomously.`,
        });

        // Also stream results summary so frontend can add to history
        send("cmd_results", { text: resultText });

      } else if (action.action === "browse" && Array.isArray(action.steps) && action.steps.length) {
        const steps = (action.steps as BrowserStep[]).slice(0, 20);
        const browseLog: string[] = [];
        const visionParts: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string; detail?: string } }> = [];
        let shotCount = 0;

        send("browser_start", { stepCount: steps.length });

        await runBrowserSteps(steps, (result) => {
          if (result.screenshot) {
            shotCount++;
            const label = result.label ?? `Screenshot ${shotCount}`;
            // Stream screenshot to frontend
            send("browser_shot", { index: result.index, label, data: result.screenshot });
            // Queue for vision message to AI (max 5 images to save tokens)
            if (shotCount <= 5) {
              visionParts.push({ type: "text", text: `[${label}]` });
              visionParts.push({ type: "image_url", image_url: { url: `data:image/png;base64,${result.screenshot}`, detail: "low" } });
            }
            browseLog.push(`step ${result.index}: screenshot — ${label}`);
          } else if (result.text) {
            const snippet = result.text.slice(0, 800);
            browseLog.push(`step ${result.index}: page text — ${snippet}`);
            visionParts.push({ type: "text", text: `Page text: ${snippet}` });
            send("browser_text", { index: result.index, text: snippet });
          } else if (!result.ok) {
            browseLog.push(`step ${result.index}: ${result.type} FAILED — ${result.error}`);
            // Auto-screenshot on failure — stream it so user can see what happened
            if (result.screenshot) {
              shotCount++;
              const label = `Error state (step ${result.index}: ${result.type})`;
              send("browser_shot", { index: result.index, label, data: result.screenshot });
              if (shotCount <= 5) {
                visionParts.push({ type: "text", text: `[${label}]` });
                visionParts.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${result.screenshot}`, detail: "low" } });
              }
            }
            if (result.text) {
              browseLog.push(`  auto-captured page text: ${result.text.slice(0, 400)}`);
              visionParts.push({ type: "text", text: `Page state on failure: ${result.text.slice(0, 800)}` });
            }
            send("browser_err", { index: result.index, type: result.type, error: result.error });
          } else {
            browseLog.push(`step ${result.index}: ${result.type} OK${result.label ? ` (${result.label})` : ""}`);
          }
        });

        const resultSummary = browseLog.join("\n");
        send("browser_done", { stepsDone: steps.length });

        // Vision capability map — check current model
        const visionCapable: Record<string, boolean> = {
          "gpt-4o":                      true,
          "google/gemini-2.0-flash-001": true,
          "deepseek-chat":               false,  // DeepSeek-V3 has no image vision
        };
        const hasVision = (visionCapable[model] ?? false) && visionParts.length > 0;

        aiMessages.push({ role: "assistant", content: raw });
        if (hasVision) {
          aiMessages.push({
            role: "user",
            content: [
              { type: "text", text: `BROWSER RESULTS (${steps.length} steps done):\n${resultSummary}\n\nScreenshots attached — analyze what you see and decide next steps. Continue autonomously.` },
              ...visionParts,
            ],
          });
        } else {
          // No image vision: text + interactive element map gives full page awareness
          aiMessages.push({
            role: "user",
            content: `BROWSER RESULTS (${steps.length} steps done):\n${resultSummary}\n\nDecide next steps and continue autonomously. Add {"type":"text"} steps to read page content when you need to understand what's on screen.`,
          });
        }

      } else if (action.action === "reply") {
        await flushTokens(action.message);
        send("reply", { text: action.message ?? "I need more information." });
        break;

      } else if (action.action === "done") {
        // Early-done guard: if done in <4 iters on a complex task without verifying, keep going
        const userTask = (parsed.data.messages[parsed.data.messages.length - 1]?.content ?? "").toLowerCase();
        const isComplexTask = /build|rebuild|fix|deploy|install|setup|creat|redesign|payment|api|site|connect/i.test(userTask);
        const doneMsg = (action.message ?? "").toLowerCase();
        const hasVerification = /http 200|verified|working|syntax.*ok|no.*error|curl.*200|screenshot|success|live|deployed/i.test(doneMsg);

        if (isComplexTask && !hasVerification && totalIterations < 5) {
          // Agent quit too early — force it to verify
          send("think", { text: "⚠️ Checking verification before finishing…" });
          aiMessages.push({ role: "assistant", content: raw });
          aiMessages.push({
            role: "user",
            content: `You said done but haven't shown verification. You MUST complete these steps:\n` +
                     `1. For PHP sites: /usr/local/bin/php -l <main_file> 2>&1\n` +
                     `2. Test live: curl -s -o /dev/null -w "HTTP %{http_code}" "https://<domain>/" 2>/dev/null\n` +
                     `3. Take a screenshot with action="browse"\n` +
                     `Continue now — do NOT skip these steps.`,
          });
          continue; // Force another iteration
        }

        await flushTokens(action.message);
        send("done", { text: action.message ?? "Task completed." });
        break;

      } else {
        await flushTokens(action.message ?? raw);
        send("reply", { text: action.message ?? raw });
        break;
      }
    }

    // If loop exhausted without done/reply — flush tokens anyway
    await flushTokens("Max iterations reached").catch(() => {});

    res.end();
  } catch (err: unknown) {
    send("error", { text: String(err instanceof Error ? err.message : err) });
    res.end();
  }
});

// ─── ZIP File Upload → extract + send to AI ──────────────────────────────────

router.post("/:id/upload", upload.single("file"), async (req, res) => {
  const [s] = await db.select().from(serversTable).where(eq(serversTable.id, parseInt(req.params.id as string)));
  if (!s) return res.status(404).json({ error: "Not found" });
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const ext = path.extname(req.file.originalname).toLowerCase();
  if (ext !== ".zip") return res.status(400).json({ error: "Only .zip files are supported" });

  try {
    const zip = new AdmZip(req.file.buffer);
    const entries = zip.getEntries();

    const TEXT_EXTS = new Set([".php", ".html", ".htm", ".css", ".js", ".ts", ".json", ".sql", ".txt", ".md", ".env", ".htaccess", ".xml", ".yaml", ".yml"]);
    const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico"]);

    const files: { path: string; content: string; size: number; isImage?: boolean }[] = [];
    let totalText = 0;

    for (const entry of entries) {
      if (entry.isDirectory) continue;
      const entryPath = entry.entryName;
      const entryExt = path.extname(entryPath).toLowerCase();
      const size = entry.header.size;

      if (IMAGE_EXTS.has(entryExt)) {
        files.push({ path: entryPath, content: "[image file]", size, isImage: true });
        continue;
      }

      if (TEXT_EXTS.has(entryExt) || entryExt === "") {
        if (totalText < 80000) {
          try {
            const content = entry.getData().toString("utf8").slice(0, 8000);
            files.push({ path: entryPath, content, size });
            totalText += content.length;
          } catch { files.push({ path: entryPath, content: "[binary file]", size }); }
        } else {
          files.push({ path: entryPath, content: "[content truncated — too many files]", size });
        }
      } else {
        files.push({ path: entryPath, content: "[binary file]", size });
      }
    }

    return res.json({
      zipName: req.file.originalname,
      fileCount: files.length,
      files,
    });
  } catch (err: unknown) {
    return res.status(500).json({ error: `Failed to read zip: ${err instanceof Error ? err.message : String(err)}` });
  }
});

// ─── Task History ─────────────────────────────────────────────────────────────

router.get("/:id/history", async (req, res) => {
  const [s] = await db.select().from(serversTable).where(eq(serversTable.id, parseInt(req.params.id)));
  if (!s) return res.status(404).json({ error: "Not found" });
  const rows = await db.select().from(serverTaskHistoryTable)
    .where(eq(serverTaskHistoryTable.serverId, s.id))
    .orderBy(serverTaskHistoryTable.id)
    .limit(50);
  return res.json(rows.reverse());
});

// ─── Metrics ─────────────────────────────────────────────────────────────────

router.get("/:id/metrics", async (req, res) => {
  const [s] = await db.select().from(serversTable).where(eq(serversTable.id, parseInt(req.params.id)));
  if (!s) return res.status(404).json({ error: "Not found" });

  if (s.status !== "online") {
    return res.json({ cpu: 0, ram: 0, storage: 0, network: 0, uptime: 0, status: s.status });
  }

  try {
    const { stdout } = await sshExec(
      s.host, s.port, s.username, s.authType ?? "key",
      s.privateKey, s.password,
      `echo CPU:$(top -bn1 | grep 'Cpu(s)' | awk '{print $2}' | tr -d '%us,') MEM:$(free | awk '/Mem:/{printf "%.0f", $3/$2*100}') DISK:$(df / | awk 'NR==2{print $5}' | tr -d '%')`,
    );
    const cpu = parseFloat(stdout.match(/CPU:([\d.]+)/)?.[1] ?? "0");
    const ram = parseFloat(stdout.match(/MEM:([\d.]+)/)?.[1] ?? "0");
    const storage = parseFloat(stdout.match(/DISK:([\d.]+)/)?.[1] ?? "0");
    const uptimeSeconds = Math.floor((Date.now() - new Date(s.createdAt).getTime()) / 1000);
    return res.json({ cpu, ram, storage, network: 0, uptime: uptimeSeconds, status: s.status });
  } catch {
    return res.json({ cpu: 0, ram: 0, storage: 0, network: 0, uptime: 0, status: s.status });
  }
});

export default router;
