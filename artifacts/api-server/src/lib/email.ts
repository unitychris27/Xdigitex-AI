const BREVO_API_KEY = process.env["BREVO_API_KEY"] ?? "";
const FROM_EMAIL = "aea25c001@smtp-brevo.com";
const FROM_NAME = "XDIGITEX AI";

async function brevoSend(payload: object): Promise<void> {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": BREVO_API_KEY,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Brevo API ${res.status}: ${text}`);
  }
}

function baseTemplate(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>XDIGITEX AI</title>
<style>
  body { margin:0; padding:0; background:#0a0a0f; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; color:#e2e8f0; }
  .wrapper { max-width:560px; margin:0 auto; padding:40px 20px; }
  .card { background:#111118; border:1px solid #1e1e2e; border-radius:16px; overflow:hidden; }
  .header { background:linear-gradient(135deg,#6d28d9 0%,#4f46e5 100%); padding:28px 40px; text-align:center; }
  .logo { font-size:20px; font-weight:800; color:#fff; letter-spacing:-0.5px; }
  .logo span { opacity:0.7; font-weight:400; }
  .body { padding:32px 40px; }
  h1 { font-size:20px; font-weight:700; color:#f1f5f9; margin:0 0 12px; }
  p { font-size:14px; line-height:1.7; color:#94a3b8; margin:0 0 14px; }
  .info-box { background:#0f0f1a; border:1px solid #1e1e2e; border-radius:10px; padding:14px 18px; margin:18px 0; }
  .info-row { display:flex; justify-content:space-between; padding:5px 0; border-bottom:1px solid #1e1e2e; font-size:13px; }
  .info-row:last-child { border-bottom:none; }
  .info-label { color:#64748b; }
  .info-value { color:#e2e8f0; font-weight:500; }
  .alert-box { background:#1a0a0a; border:1px solid #7f1d1d; border-radius:10px; padding:12px 16px; margin:16px 0; }
  .alert-box p { color:#fca5a5; margin:0; font-size:13px; }
  .btn { display:inline-block; background:linear-gradient(135deg,#6d28d9,#4f46e5); color:#fff !important; text-decoration:none; padding:12px 28px; border-radius:8px; font-size:14px; font-weight:600; }
  .footer { padding:18px 40px; border-top:1px solid #1e1e2e; text-align:center; }
  .footer p { font-size:12px; color:#475569; margin:0; }
  .footer a { color:#6d28d9; text-decoration:none; }
</style>
</head>
<body>
<div class="wrapper">
  <div class="card">
    <div class="header"><div class="logo">XD <span>XDIGITEX AI</span></div></div>
    <div class="body">${content}</div>
    <div class="footer">
      <p>© ${new Date().getFullYear()} XDIGITEX AI &nbsp;·&nbsp; <a href="#">Privacy</a> &nbsp;·&nbsp; <a href="#">Terms</a></p>
      <p style="margin-top:5px;">You received this because you have an account at XDIGITEX AI.</p>
    </div>
  </div>
</div>
</body>
</html>`;
}

// ── Login notification ────────────────────────────────────────────────────────
export async function sendLoginNotification(opts: {
  to: string;
  name: string;
  ip?: string;
  userAgent?: string;
  isGoogle?: boolean;
}): Promise<void> {
  const { to, name, ip, userAgent, isGoogle } = opts;
  const now = new Date().toLocaleString("en-US", { dateStyle: "full", timeStyle: "short" });
  const method = isGoogle ? "Google OAuth" : "Email & Password";

  const content = `
    <h1>New sign-in to your account</h1>
    <p>Hi ${name}, a new sign-in was detected on your XDIGITEX AI account.</p>
    <div class="info-box">
      <div class="info-row"><span class="info-label">Time</span><span class="info-value">${now}</span></div>
      <div class="info-row"><span class="info-label">Method</span><span class="info-value">${method}</span></div>
      ${ip ? `<div class="info-row"><span class="info-label">IP Address</span><span class="info-value">${ip}</span></div>` : ""}
      ${userAgent ? `<div class="info-row"><span class="info-label">Browser</span><span class="info-value">${userAgent.slice(0, 60)}</span></div>` : ""}
    </div>
    <div class="alert-box">
      <p>⚠️ If this wasn't you, change your password immediately and contact support.</p>
    </div>
    <p>If this was you, no action is needed.</p>
  `;

  await brevoSend({
    sender: { name: FROM_NAME, email: FROM_EMAIL },
    to: [{ email: to, name }],
    subject: "New sign-in to your XDIGITEX AI account",
    htmlContent: baseTemplate(content),
  });
}

// ── Welcome / registration ────────────────────────────────────────────────────
export async function sendWelcomeEmail(opts: {
  to: string;
  name: string;
  isGoogle?: boolean;
}): Promise<void> {
  const { to, name, isGoogle } = opts;

  const content = `
    <h1>Welcome to XDIGITEX AI! 🚀</h1>
    <p>Hi ${name}, your account is ready. You're now part of the AI-first development platform.</p>
    <div class="info-box">
      <div class="info-row"><span class="info-label">🤖 AI Workspace</span><span class="info-value">Build full projects with AI</span></div>
      <div class="info-row"><span class="info-label">⚡ My Automations</span><span class="info-value">Create &amp; manage automations</span></div>
      <div class="info-row"><span class="info-label">🚀 Deployments</span><span class="info-value">One-click publish to live URLs</span></div>
      <div class="info-row"><span class="info-label">🔑 Secrets Vault</span><span class="info-value">Securely store API keys</span></div>
    </div>
    ${isGoogle ? "<p>You signed up with Google — no password needed.</p>" : ""}
    <p style="text-align:center;margin-top:24px;">
      <a class="btn" href="https://xdigitex.ai/dashboard">Open Dashboard →</a>
    </p>
  `;

  await brevoSend({
    sender: { name: FROM_NAME, email: FROM_EMAIL },
    to: [{ email: to, name }],
    subject: "Welcome to XDIGITEX AI — your account is ready",
    htmlContent: baseTemplate(content),
  });
}

// ── Verify API key is configured ──────────────────────────────────────────────
export async function verifyEmailConfig(): Promise<boolean> {
  try {
    const res = await fetch("https://api.brevo.com/v3/account", {
      headers: { "api-key": BREVO_API_KEY, Accept: "application/json" },
    });
    return res.ok;
  } catch {
    return false;
  }
}
