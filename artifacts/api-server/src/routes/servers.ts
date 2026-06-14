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

const SSH_AGENT_SYSTEM_PROMPT = `You are an expert Linux/DevOps and cPanel web hosting engineer.
The user will describe a task. You produce a JSON array of safe shell commands to accomplish it.

CRITICAL OUTPUT RULE: Your ENTIRE response must be ONLY the JSON array — no markdown, no code fences, no explanations, no text before or after.
Start your response with [ and end with ]

Each item: { "cmd": "shell command here", "desc": "one-line description" }

GENERAL RULES:
- Maximum 12 commands
- No rm -rf /, no DROP DATABASE without confirmation
- Prefer non-interactive (-y, --yes, --force flags)
- For writing/editing files, use printf or cat with heredoc — never open interactive editors

WEB HOSTING / CPANEL RULES (apply when user mentions a domain, folder, website, HTML, PHP, CSS):
- Website files live in ~/public_html/<domain>/ or ~/public_html/ — always search there
- To check a domain folder: ls -la ~/public_html/<domain>/ or find ~/public_html/<domain> -type f
- To read a file: cat ~/public_html/<domain>/index.html
- To improve a webpage appearance, use printf with a complete new HTML file — write it back with: printf '%s' "NEW HTML CONTENT" > ~/public_html/<domain>/index.html
- The improved HTML must use Bootstrap 5 CDN + Google Fonts + a professional color scheme
- Always cat the existing file first so you can base improvements on real content

"IMPROVE APPEARANCE" TASK PATTERN — use this exact 3-command pattern:
1. {"cmd": "find ~/public_html/<domain> -type f | head -20", "desc": "List website files"}
2. {"cmd": "cat ~/public_html/<domain>/index.html 2>/dev/null || cat ~/public_html/<domain>/index.php 2>/dev/null", "desc": "Read current homepage"}
3. {"cmd": "printf '%s' '<!DOCTYPE html>...[full improved HTML]...' > ~/public_html/<domain>/index.html", "desc": "Write improved homepage"}

EXAMPLE — "check folder novaspack.com and improve its appearance":
[
  {"cmd": "find ~/public_html/novaspack.com -type f | head -30", "desc": "List all website files"},
  {"cmd": "cat ~/public_html/novaspack.com/index.html 2>/dev/null || cat ~/public_html/novaspack.com/index.php 2>/dev/null || echo 'No index found'", "desc": "Read current homepage content"},
  {"cmd": "printf '%s' '<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Novaspack</title><link href=\"https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css\" rel=\"stylesheet\"><link href=\"https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap\" rel=\"stylesheet\"><style>body{font-family:Inter,sans-serif;background:#0f172a;color:#e2e8f0}.hero{background:linear-gradient(135deg,#7c3aed,#2563eb);padding:80px 0}.card{background:#1e293b;border:1px solid #334155}</style></head><body><nav class=\"navbar navbar-dark\" style=\"background:#1e293b\"><div class=\"container\"><a class=\"navbar-brand fw-bold\" href=\"#\">Novaspack</a></nav><section class=\"hero text-center text-white\"><div class=\"container\"><h1 class=\"display-4 fw-bold\">Welcome to Novaspack</h1><p class=\"lead\">Professional solutions for your business</p><a href=\"#contact\" class=\"btn btn-light btn-lg mt-3\">Get Started</a></div></section><section class=\"py-5\"><div class=\"container\"><div class=\"row g-4\"><div class=\"col-md-4\"><div class=\"card p-4 text-center\"><h5 class=\"text-primary\">Fast</h5><p class=\"text-secondary\">Lightning fast performance</p></div></div><div class=\"col-md-4\"><div class=\"card p-4 text-center\"><h5 class=\"text-primary\">Secure</h5><p class=\"text-secondary\">Enterprise-grade security</p></div></div><div class=\"col-md-4\"><div class=\"card p-4 text-center\"><h5 class=\"text-primary\">Reliable</h5><p class=\"text-secondary\">99.9% uptime guarantee</p></div></div></div></div></section></body></html>' > ~/public_html/novaspack.com/index.html", "desc": "Write modern improved homepage"}
]`;

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

  try {
    send("status", { value: "Planning commands…" });

    const modelMap: Record<string, { provider: "openrouter" | "deepseek" | "openai"; model: string }> = {
      "economy":    { provider: "openrouter", model: "google/gemini-2.0-flash-001" },
      "balanced":   { provider: "deepseek",   model: "deepseek-chat" },
      "high-power": { provider: "openai",     model: "gpt-4o" },
    };
    const { provider, model } = modelMap[parsed.data.mode];
    const client = getAIClient(provider);

    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: SSH_AGENT_SYSTEM_PROMPT },
        { role: "user", content: parsed.data.task },
      ],
      max_tokens: 4000,
    });

    const raw = completion.choices[0]?.message?.content ?? "[]";

    // Strip markdown code fences (```json ... ``` or ``` ... ```)
    const stripped = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();

    let commands: { cmd: string; desc: string }[] = [];
    try {
      // Try direct parse first
      commands = JSON.parse(stripped);
    } catch {
      // Fall back: extract first [...] block anywhere in the text
      const jsonMatch = stripped.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        try { commands = JSON.parse(jsonMatch[0]); } catch { /* fall through */ }
      }
    }

    if (!Array.isArray(commands) || !commands.length) {
      send("error", { value: `AI returned no commands. Raw response: ${raw.slice(0, 400)}` });
      res.end();
      return;
    }

    // Sanitise — drop any entry missing cmd
    commands = commands.filter(c => typeof c?.cmd === "string" && c.cmd.trim());

    send("plan", { commands });

    for (let i = 0; i < commands.length; i++) {
      const { cmd, desc } = commands[i];
      send("step", { index: i, total: commands.length, cmd, desc });

      try {
        const result = await sshExec(
          s.host, s.port, s.username, s.authType ?? "key",
          s.privateKey, s.password,
          cmd,
          (chunk) => send("output", { index: i, chunk }),
        );
        send("step_done", { index: i, code: result.code, stderr: result.stderr });
      } catch (err: unknown) {
        send("step_error", { index: i, error: String(err instanceof Error ? err.message : err) });
        break;
      }
    }

    send("done", { value: "All commands completed" });
    res.end();
  } catch (err: unknown) {
    send("error", { value: String(err instanceof Error ? err.message : err) });
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
