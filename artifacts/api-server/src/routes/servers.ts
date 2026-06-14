import { Router } from "express";
import { db } from "@workspace/db";
import { serversTable, activityTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { Client } from "ssh2";
import { getAIClient } from "../lib/ai";

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

const CHAT_AGENT_SYSTEM = (username: string): string => {
  const home = `/home/${username}`;
  return `You are XDIGITEX — an autonomous SSH coding agent with full shell access to a Linux/cPanel server (user: ${username}, home: ${home}).
You EXECUTE and FIX things. You do not describe what to do. You do not ask for confirmation. You do not stop when a path is missing. You search, find, read, and fix.

═══ RESPONSE FORMAT — strict JSON only, no markdown ═══
{"thought":"...","action":"run"|"reply"|"done","commands":[{"cmd":"...","desc":"..."}],"message":"..."}

action="run"   → run up to 5 commands. You WILL see output and continue automatically.
action="reply" → ONLY when you have exhausted all search attempts and truly cannot proceed without a specific piece of information the user must provide (e.g., a DB password not found anywhere on disk). Never use reply just because a path is wrong.
action="done"  → task fully complete. Summarise exactly what you found and fixed.

═══ GOLDEN RULES — violations are critical failures ═══
❌ NEVER ask "do you want me to fix this?" — just fix it
❌ NEVER ask "should I proceed?" — just proceed
❌ NEVER say "could you confirm the path" — SEARCH INSTEAD
❌ NEVER stop because a directory doesn't exist — USE find TO LOCATE IT
❌ NEVER describe commands without running them
❌ NEVER use placeholder code — write complete, working files
❌ NEVER use action="reply" unless you have read every relevant file and still need ONE piece of info only a human can provide (like an external API key that's nowhere on disk)

✅ When you READ a file and spot a bug → fix it IMMEDIATELY with the next run action
✅ When a script fails → read the error output, fix the code, run it again to verify
✅ If a path is missing → find ${home} -type d -name "<name>*" 2>/dev/null
✅ If a file is missing → find ${home} -name "<file>" 2>/dev/null
✅ If logs don't exist → find ${home} -name "*.log" 2>/dev/null | head -20
✅ After fixing → verify by re-running the script or reading the fixed file back

═══ COMMON PHP CRON BUGS (fix without asking) ═══
BUG: require \$_SERVER["DOCUMENT_ROOT"]."/..." in a cron script
→ \$_SERVER["DOCUMENT_ROOT"] is EMPTY in cron context — the script silently fails
→ FIX: replace with the absolute path using __DIR__ or hardcode: define("ROOT", dirname(__DIR__));
→ Example fix: sed -i 's|\$_SERVER\["DOCUMENT_ROOT"\]|dirname(__DIR__)|g' <file>
→ Then verify: /usr/local/bin/php <file> 2>&1 | head -20

BUG: crontab paths don't match where files actually are
→ FIX: crontab -l, compare paths with find results, rewrite with correct absolute paths

BUG: DB connection fails in cron (relative config path)
→ FIX: read config.php, check DB constants, test: /usr/local/bin/php -r "define('BASEPATH',true); require '/abs/path/to/config.php'; echo \$conn ? 'DB OK' : 'FAIL';" 2>&1

═══ cPANEL SERVER LAYOUT ═══
- Addon/parked domains webroot: ${home}/public_html/<domain>/ OR symlinked elsewhere
- To find ANY domain's actual webroot: grep -r "<domain>" ${home}/etc/ 2>/dev/null || find ${home} -maxdepth 5 -type d -name "<domain>" 2>/dev/null
- Error logs: ${home}/logs/<domain>.error.log OR ${home}/public_html/error_log OR find ${home} -name "error_log" 2>/dev/null
- PHP binary: /usr/local/bin/php OR /usr/bin/php
- cPanel cron via crontab -l
- Commands run in fresh shell each time — always use full absolute paths

═══ FIX PATTERNS ═══

ORDERS STUCK AT PENDING:
1. find the site root: find ${home} -type d -name "<domain>*" 2>/dev/null
2. find cron scripts: find <siteroot> -name "*.php" | xargs grep -l "order\\|pending\\|payment" 2>/dev/null
3. read the orders cron: cat <siteroot>/cronjobs/orders.php (or wherever found)
4. check config for DB creds: cat <siteroot>/config.php or <siteroot>/includes/config.php
5. test DB connection: php -r "require '<siteroot>/config.php'; echo 'DB OK';" 2>&1
6. read payment gateway file, look for callback URL mismatch or API key issues
7. fix the issue — write the corrected file with printf
8. verify by reading the fixed file back

CRONJOB NOT RUNNING:
1. find actual script path: find ${home} -name "orders.php" -o -name "payments.php" 2>/dev/null
2. check crontab: crontab -l 2>/dev/null
3. check if path in crontab matches real path — if not, fix crontab with: (crontab -l 2>/dev/null; echo "*/5 * * * * /usr/local/bin/php <realpath>") | crontab -
4. test script manually: /usr/local/bin/php <realpath> 2>&1 | tail -20
5. fix any errors found in the script output

SITE NOT FOUND / EMPTY DIR:
1. find real webroot: find ${home} -maxdepth 6 -name "index.php" -o -name "index.html" 2>/dev/null | grep -i "<domain>"
2. check Apache/nginx vhost: cat ${home}/etc/*/vhost.conf 2>/dev/null
3. if truly empty: ask ONE specific question about what the site does, then build it

FILE WRITING:
mkdir -p <dir> && printf '%s' '<full file content>' > <dir>/<file>
For long files: split into multiple printf >> append calls`;
};

router.post("/:id/chat", async (req, res) => {
  const schema = z.object({
    messages: z.array(z.object({
      role:    z.enum(["user", "assistant"]),
      content: z.string().max(12000),
    })).min(1).max(40),
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
    const systemPrompt = CHAT_AGENT_SYSTEM(s.username);

    // Build AI conversation — convert our messages into OpenAI format
    const aiMessages: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: systemPrompt },
      ...parsed.data.messages.map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
    ];

    // Agentic loop — max 15 iterations per user turn
    for (let iter = 0; iter < 15; iter++) {
      const completion = await client.chat.completions.create({
        model,
        messages: aiMessages,
        max_tokens: 4000,
        temperature: 0.1,
      });

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
          .slice(0, 5);

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
          const out = [
            result.stdout.trim(),
            result.stderr.trim() ? `[stderr] ${result.stderr.trim()}` : "",
          ].filter(Boolean).join("\n") || "(no output)";

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

      } else if (action.action === "reply") {
        send("reply", { text: action.message ?? "I need more information." });
        break;

      } else if (action.action === "done") {
        send("done", { text: action.message ?? "Task completed." });
        break;

      } else {
        send("reply", { text: action.message ?? raw });
        break;
      }
    }

    res.end();
  } catch (err: unknown) {
    send("error", { text: String(err instanceof Error ? err.message : err) });
    res.end();
  }
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
