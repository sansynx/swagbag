import type { PagesFunction } from "@cloudflare/workers-types";

type Role = "hr" | "finance" | "employee";
type User = { id: string; email: string; name: string; role: Role };
type Env = {
  DB: D1Database;
  AI: Ai;
  PAYPAL_CLIENT_ID?: string;
  PAYPAL_CLIENT_SECRET?: string;
  BOOTSTRAP_SECRET?: string;
};
type Ctx = Parameters<PagesFunction<Env>>[0];

const rewards = [
  {
    id: "learn",
    title: "Learning pass",
    category: "Grow",
    description: "A course or certification contribution",
    tags: "learn course certification skills career",
  },
  {
    id: "stream",
    title: "Streaming night",
    category: "Unwind",
    description: "An entertainment voucher",
    tags: "movie streaming music family entertainment",
  },
  {
    id: "books",
    title: "Book credit",
    category: "Explore",
    description: "A bookshop voucher for your next read",
    tags: "books reading knowledge",
  },
  {
    id: "wellness",
    title: "Wellness hour",
    category: "Recharge",
    description: "A wellness or fitness session",
    tags: "health wellness fitness rest",
  },
  {
    id: "dining",
    title: "Dinner out",
    category: "Connect",
    description: "A meal with someone who matters",
    tags: "food dining family friends experience",
  },
  {
    id: "creative",
    title: "Creative workshop",
    category: "Make",
    description: "A hands-on workshop or class",
    tags: "art craft music creative class",
  },
] as const;

function json(data: unknown, status = 200, headers?: HeadersInit) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
}
function error(message: string, status = 400) {
  return json({ error: message }, status);
}
function csv(rows: unknown[][], filename: string) {
  const value = (cell: unknown) => {
    const raw = String(cell ?? "");
    const safe = /^[=+@\-\t\r]/.test(raw) ? `'${raw}` : raw;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  return new Response(
    rows.map((row) => row.map(value).join(",")).join("\r\n"),
    {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    },
  );
}
function hex(bytes: ArrayBuffer | Uint8Array) {
  return Array.from(new Uint8Array(bytes))
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
async function sha(input: string) {
  return hex(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input)),
  );
}
async function passwordHash(password: string, salt: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  return hex(
    await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: new TextEncoder().encode(salt),
        iterations: 210_000,
        hash: "SHA-256",
      },
      key,
      256,
    ),
  );
}
async function body(request: Ctx["request"]): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new Error("Expected JSON");
  const value = await request.json();
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid JSON");
  return value as Record<string, unknown>;
}
function field(value: unknown, max = 160) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function tokenFrom(request: Ctx["request"]) {
  return (
    request.headers.get("cookie")?.match(/(?:^|; )hrf_session=([^;]+)/)?.[1] ??
    ""
  );
}
function cookie(request: Ctx["request"], value: string, age: number) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `hrf_session=${value}; HttpOnly${secure}; SameSite=Lax; Path=/; Max-Age=${age}`;
}
async function currentUser(ctx: Ctx): Promise<User | null> {
  const token = tokenFrom(ctx.request);
  if (!token) return null;
  return (
    (await ctx.env.DB.prepare(
      "SELECT u.id,u.email,u.name,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>datetime('now')",
    )
      .bind(await sha(token))
      .first<User>()) ?? null
  );
}
function allowed(user: User | null, roles: Role[]) {
  return user && roles.includes(user.role);
}
async function audit(
  db: D1Database,
  actor: string | null,
  action: string,
  id: string,
  detail = "",
) {
  await db
    .prepare(
      "INSERT INTO audit_logs(id,actor_id,action,entity_id,detail) VALUES(?,?,?,?,?)",
    )
    .bind(crypto.randomUUID(), actor, action, id, detail)
    .run();
}
async function paypalToken(env: Env) {
  if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET)
    throw new Error("PayPal is not configured");
  const response = await fetch(
    "https://api-m.sandbox.paypal.com/v1/oauth2/token",
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    },
  );
  if (!response.ok) throw new Error("PayPal authentication failed");
  return ((await response.json()) as { access_token: string }).access_token;
}
async function paypal(
  env: Env,
  path: string,
  method: string,
  payload?: unknown,
) {
  const token = await paypalToken(env);
  const response = await fetch(`https://api-m.sandbox.paypal.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const data = (await response.json()) as Record<string, unknown>;
  if (!response.ok)
    throw new Error(`PayPal ${method} failed (${response.status})`);
  return data;
}

export const onRequest: PagesFunction<Env> = async (ctx) => {
  const request = ctx.request;
  const path = new URL(request.url).pathname.replace(/^\/api\/?/, "");
  const method = request.method;
  const db = ctx.env.DB;
  try {
    if (path === "bootstrap" && method === "POST") {
      if (
        !ctx.env.BOOTSTRAP_SECRET ||
        request.headers.get("x-bootstrap-secret") !== ctx.env.BOOTSTRAP_SECRET
      )
        return error("Forbidden", 403);
      const count = await db
        .prepare("SELECT COUNT(*) AS n FROM users")
        .first<{ n: number }>();
      if (count?.n) return error("Already initialized", 409);
      const input = await body(request);
      const email = field(input.email, 200).toLowerCase();
      const name = field(input.name, 80);
      const password = field(input.password, 200);
      if (!email.includes("@") || name.length < 2 || password.length < 12)
        return error("Valid name, email, and 12-character password required");
      const id = crypto.randomUUID(),
        salt = crypto.randomUUID();
      await db
        .prepare(
          "INSERT INTO users(id,email,name,role,password_salt,password_hash) VALUES(?,?,?,?,?,?)",
        )
        .bind(
          id,
          email,
          name,
          "finance",
          salt,
          await passwordHash(password, salt),
        )
        .run();
      await audit(db, id, "organization.initialized", id);
      return json({ ok: true }, 201);
    }
    if (path === "auth/login" && method === "POST") {
      const input = await body(request);
      const email = field(input.email, 200).toLowerCase();
      const password = field(input.password, 200);
      const emailHash = await sha(email);
      const throttle = await db
        .prepare(
          "SELECT failures FROM login_attempts WHERE email_hash=? AND window_start>datetime('now','-15 minutes')",
        )
        .bind(emailHash)
        .first<{ failures: number }>();
      if (throttle && throttle.failures >= 8)
        return error(
          "Too many sign-in attempts. Try again in 15 minutes.",
          429,
        );
      const user = await db
        .prepare("SELECT * FROM users WHERE email=?")
        .bind(email)
        .first<User & { password_salt: string; password_hash: string }>();
      const candidate = await passwordHash(
        password,
        user?.password_salt ?? "unknown-salt",
      );
      if (!user || candidate !== user.password_hash) {
        await db
          .prepare(
            "INSERT INTO login_attempts(email_hash,failures) VALUES(?,1) ON CONFLICT(email_hash) DO UPDATE SET failures=CASE WHEN window_start<=datetime('now','-15 minutes') THEN 1 ELSE failures+1 END, window_start=CASE WHEN window_start<=datetime('now','-15 minutes') THEN CURRENT_TIMESTAMP ELSE window_start END",
          )
          .bind(emailHash)
          .run();
        return error("Invalid credentials", 401);
      }
      await db
        .prepare("DELETE FROM login_attempts WHERE email_hash=?")
        .bind(emailHash)
        .run();
      const token = crypto.randomUUID() + crypto.randomUUID();
      await db
        .prepare(
          "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,datetime('now','+7 days'))",
        )
        .bind(await sha(token), user.id)
        .run();
      await audit(db, user.id, "auth.login", user.id);
      return json(
        {
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
          },
        },
        200,
        { "Set-Cookie": cookie(request, token, 604800) },
      );
    }
    const user = await currentUser(ctx);
    if (!user) return error("Sign in required", 401);
    if (method !== "GET" && method !== "HEAD") {
      const origin = request.headers.get("origin");
      if (origin && origin !== new URL(request.url).origin)
        return error("Origin rejected", 403);
    }
    if (path === "auth/logout" && method === "POST") {
      await db
        .prepare("DELETE FROM sessions WHERE token_hash=?")
        .bind(await sha(tokenFrom(request)))
        .run();
      return json({ ok: true }, 200, { "Set-Cookie": cookie(request, "", 0) });
    }
    if (path === "auth/password" && method === "POST") {
      const input = await body(request);
      const current = field(input.currentPassword, 200);
      const next = field(input.newPassword, 200);
      if (next.length < 12 || current === next)
        return error("Use a new password with at least 12 characters");
      const account = await db
        .prepare("SELECT password_salt,password_hash FROM users WHERE id=?")
        .bind(user.id)
        .first<{ password_salt: string; password_hash: string }>();
      if (
        !account ||
        (await passwordHash(current, account.password_salt)) !==
          account.password_hash
      )
        return error("Current password is incorrect", 403);
      const salt = crypto.randomUUID();
      await db.batch([
        db
          .prepare(
            "UPDATE users SET password_salt=?,password_hash=? WHERE id=?",
          )
          .bind(salt, await passwordHash(next, salt), user.id),
        db
          .prepare("DELETE FROM sessions WHERE user_id=? AND token_hash<>?")
          .bind(user.id, await sha(tokenFrom(request))),
      ]);
      await audit(db, user.id, "auth.password_changed", user.id);
      return json({ ok: true });
    }
    if (path === "me" && method === "GET")
      return json({
        user,
        paypalConfigured: !!(
          ctx.env.PAYPAL_CLIENT_ID && ctx.env.PAYPAL_CLIENT_SECRET
        ),
      });
    if (path === "rewards" && method === "GET") return json({ rewards });
    if (path === "users" && method === "GET") {
      if (!allowed(user, ["hr", "finance"])) return error("Forbidden", 403);
      return json({
        users: (
          await db
            .prepare(
              "SELECT id,email,name,role,created_at FROM users ORDER BY name",
            )
            .all()
        ).results,
      });
    }
    if (path === "users" && method === "POST") {
      if (!allowed(user, ["finance"])) return error("Forbidden", 403);
      const input = await body(request);
      const email = field(input.email, 200).toLowerCase(),
        name = field(input.name, 80),
        password = field(input.password, 200),
        role = field(input.role, 20) as Role;
      if (
        !email.includes("@") ||
        name.length < 2 ||
        password.length < 12 ||
        !["hr", "finance", "employee"].includes(role)
      )
        return error("Invalid user details");
      const id = crypto.randomUUID(),
        salt = crypto.randomUUID();
      await db
        .prepare(
          "INSERT INTO users(id,email,name,role,password_salt,password_hash) VALUES(?,?,?,?,?,?)",
        )
        .bind(id, email, name, role, salt, await passwordHash(password, salt))
        .run();
      await audit(db, user.id, "user.created", id, role);
      return json({ id }, 201);
    }
    if (path === "campaigns" && method === "GET") {
      const campaigns = (
        await db
          .prepare(
            `SELECT c.*,u.name AS creator_name,(SELECT COUNT(*) FROM selections s WHERE s.campaign_id=c.id) AS selection_count,(SELECT COUNT(*) FROM users WHERE role='employee') AS employee_count,COALESCE(p.status,'unpaid') AS payment_status FROM campaigns c JOIN users u ON u.id=c.created_by LEFT JOIN payments p ON p.campaign_id=c.id ORDER BY c.created_at DESC`,
          )
          .all()
      ).results;
      const selections =
        user.role === "employee"
          ? (
              await db
                .prepare(
                  "SELECT campaign_id,reward_id,private_reason FROM selections WHERE user_id=?",
                )
                .bind(user.id)
                .all()
            ).results
          : [];
      return json({ campaigns, selections });
    }
    if (path === "campaigns" && method === "POST") {
      if (!allowed(user, ["hr"])) return error("Forbidden", 403);
      const input = await body(request),
        title = field(input.title, 100),
        occasion = field(input.occasion, 60),
        message = field(input.message, 300),
        budget = Number(input.budgetCents);
      if (
        title.length < 3 ||
        !occasion ||
        !Number.isSafeInteger(budget) ||
        budget < 100 ||
        budget > 100_000_00
      )
        return error("Invalid campaign");
      const id = crypto.randomUUID();
      await db
        .prepare(
          "INSERT INTO campaigns(id,title,occasion,message,budget_cents,created_by) VALUES(?,?,?,?,?,?)",
        )
        .bind(id, title, occasion, message, budget, user.id)
        .run();
      await audit(
        db,
        user.id,
        "campaign.created",
        id,
        `${occasion}; ${budget} cents`,
      );
      return json({ id }, 201);
    }
    const match = path.match(
      /^campaigns\/([a-f0-9-]+)\/(recommend|select|checkout|capture)$/,
    );
    if (match && method === "POST") {
      const [, id, action] = match;
      const campaign = await db
        .prepare("SELECT * FROM campaigns WHERE id=?")
        .bind(id)
        .first<{
          id: string;
          title: string;
          occasion: string;
          message: string;
          budget_cents: number;
          status: string;
        }>();
      if (!campaign) return error("Campaign not found", 404);
      if (action === "recommend") {
        if (!allowed(user, ["employee"]) || campaign.status !== "open")
          return error("Unavailable", 403);
        const input = await body(request),
          preference = field(input.preference, 500);
        if (preference.length < 8) return error("Tell us what would be useful");
        const prompt = `You are a private employee reward assistant. Choose exactly 3 reward IDs from this approved list. Consider the occasion and employee's need. Return ONLY JSON: {"ids":["id1","id2","id3"],"reason":"one short supportive sentence"}. Never invent a reward. Campaign occasion: ${campaign.occasion}. Employee need: ${preference}. Rewards: ${JSON.stringify(rewards.map(({ id, title, description, tags }) => ({ id, title, description, tags })))}.`;
        let result: { response?: string | { ids?: unknown; reason?: unknown } };
        try {
          result = (await ctx.env.AI.run("@cf/meta/llama-3.2-3b-instruct", {
            messages: [{ role: "user", content: prompt }],
            max_tokens: 220,
          })) as { response?: string | { ids?: unknown; reason?: unknown } };
        } catch {
          return error(
            "AI suggestions are unavailable. You can still choose any reward.",
            503,
          );
        }
        let parsed: { ids?: string[]; reason?: string } = {};
        try {
          parsed =
            typeof result.response === "string"
              ? JSON.parse(result.response.match(/\{[\s\S]*\}/)?.[0] ?? "{}")
              : (result.response ?? {});
        } catch {
          return error("Recommendation is temporarily unavailable", 503);
        }
        const ids = [...new Set(Array.isArray(parsed.ids) ? parsed.ids : [])]
          .filter((x): x is (typeof rewards)[number]["id"] =>
            rewards.some((r) => r.id === x),
          )
          .slice(0, 3);
        if (ids.length < 2)
          return error("Recommendation is temporarily unavailable", 503);
        return json({
          rewards: ids.map((x) => rewards.find((r) => r.id === x)),
          reason: field(parsed.reason, 200),
        });
      }
      if (action === "select") {
        if (!allowed(user, ["employee"]) || campaign.status !== "open")
          return error("Unavailable", 403);
        const input = await body(request),
          rewardId = field(input.rewardId, 30),
          reason = field(input.reason, 500);
        if (!rewards.some((r) => r.id === rewardId))
          return error("Invalid reward");
        await db
          .prepare(
            "INSERT INTO selections(campaign_id,user_id,reward_id,private_reason) VALUES(?,?,?,?) ON CONFLICT(campaign_id,user_id) DO UPDATE SET reward_id=excluded.reward_id,private_reason=excluded.private_reason,selected_at=CURRENT_TIMESTAMP",
          )
          .bind(id, user.id, rewardId, reason)
          .run();
        await audit(db, user.id, "reward.selected", id, rewardId);
        return json({ ok: true });
      }
      if (!allowed(user, ["finance"])) return error("Forbidden", 403);
      if (action === "checkout") {
        if (campaign.status === "paid")
          return error("Campaign already paid", 409);
        const count =
          (
            await db
              .prepare(
                "SELECT COUNT(*) AS n FROM selections WHERE campaign_id=?",
              )
              .bind(id)
              .first<{ n: number }>()
          )?.n ?? 0;
        if (!count) return error("No employee selections yet");
        const total = count * campaign.budget_cents;
        const existing = await db
          .prepare("SELECT order_id FROM payments WHERE campaign_id=?")
          .bind(id)
          .first<{ order_id: string }>();
        if (existing) {
          const previous = await paypal(
            ctx.env,
            `/v2/checkout/orders/${encodeURIComponent(existing.order_id)}`,
            "GET",
          );
          const resume = (
            previous.links as { rel: string; href: string }[] | undefined
          )?.find((x) => x.rel === "payer-action" || x.rel === "approve")?.href;
          if (resume) return json({ approvalUrl: resume });
          return error("Existing PayPal order needs review", 409);
        }
        const origin = new URL(request.url).origin;
        const order = await paypal(ctx.env, "/v2/checkout/orders", "POST", {
          intent: "CAPTURE",
          purchase_units: [
            {
              reference_id: id,
              description: `HR Flings: ${campaign.title}`,
              amount: { currency_code: "USD", value: (total / 100).toFixed(2) },
            },
          ],
          payment_source: {
            paypal: {
              experience_context: {
                return_url: `${origin}/?payment=${id}`,
                cancel_url: `${origin}/?cancel=${id}`,
                user_action: "PAY_NOW",
              },
            },
          },
        });
        const orderId = String(order.id ?? "");
        const approve = (
          order.links as { rel: string; href: string }[] | undefined
        )?.find((x) => x.rel === "payer-action" || x.rel === "approve")?.href;
        if (!orderId || !approve)
          return error("PayPal did not return approval link", 502);
        await db.batch([
          db
            .prepare(
              "INSERT INTO payments(campaign_id,order_id,amount_cents,status) VALUES(?,?,?,?)",
            )
            .bind(id, orderId, total, "pending"),
          db
            .prepare(
              "UPDATE campaigns SET status='pending' WHERE id=? AND status='open'",
            )
            .bind(id),
        ]);
        await audit(db, user.id, "payment.started", id, orderId);
        return json({ approvalUrl: approve });
      }
      if (action === "capture") {
        const payment = await db
          .prepare("SELECT * FROM payments WHERE campaign_id=?")
          .bind(id)
          .first<{ order_id: string; status: string; amount_cents: number }>();
        if (!payment) return error("No payment found", 404);
        if (payment.status === "paid") return json({ ok: true });
        const order = await paypal(
          ctx.env,
          `/v2/checkout/orders/${encodeURIComponent(payment.order_id)}/capture`,
          "POST",
        );
        const unit = (
          order.purchase_units as
            | {
                payments?: {
                  captures?: {
                    id: string;
                    status: string;
                    amount: { value: string; currency_code: string };
                  }[];
                };
              }[]
            | undefined
        )?.[0];
        const capture = unit?.payments?.captures?.[0];
        if (
          capture?.status !== "COMPLETED" ||
          Math.round(Number(capture.amount.value) * 100) !==
            payment.amount_cents ||
          capture.amount.currency_code !== "USD"
        )
          return error("Payment not completed", 409);
        await db.batch([
          db
            .prepare(
              "UPDATE payments SET status='paid',capture_id=? WHERE campaign_id=? AND status='pending'",
            )
            .bind(capture.id, id),
          db
            .prepare(
              "UPDATE campaigns SET status='paid' WHERE id=? AND status='pending'",
            )
            .bind(id),
        ]);
        await audit(db, user.id, "payment.completed", id, capture.id);
        return json({ ok: true });
      }
    }
    if (path === "finance" && method === "GET") {
      if (!allowed(user, ["finance"])) return error("Forbidden", 403);
      const payments = (
        await db
          .prepare(
            "SELECT p.*,c.title,c.occasion FROM payments p JOIN campaigns c ON c.id=p.campaign_id ORDER BY p.created_at DESC",
          )
          .all()
      ).results;
      const auditLogs = (
        await db
          .prepare(
            "SELECT a.*,u.name AS actor_name FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.created_at DESC LIMIT 100",
          )
          .all()
      ).results;
      return json({ payments, auditLogs });
    }
    if (path === "finance/export/payments" && method === "GET") {
      if (!allowed(user, ["finance"])) return error("Forbidden", 403);
      const rows = (
        await db
          .prepare(
            "SELECT c.title,c.occasion,p.amount_cents,p.status,p.order_id,p.capture_id,p.created_at FROM payments p JOIN campaigns c ON c.id=p.campaign_id ORDER BY p.created_at DESC",
          )
          .all()
      ).results;
      return csv(
        [
          [
            "Campaign",
            "Occasion",
            "Amount USD",
            "Status",
            "PayPal order",
            "PayPal capture",
            "Created UTC",
          ],
          ...rows.map((r) => [
            r.title,
            r.occasion,
            (Number(r.amount_cents) / 100).toFixed(2),
            r.status,
            r.order_id,
            r.capture_id,
            r.created_at,
          ]),
        ],
        "hr-flings-payments.csv",
      );
    }
    if (path === "finance/export/audit" && method === "GET") {
      if (!allowed(user, ["finance"])) return error("Forbidden", 403);
      const rows = (
        await db
          .prepare(
            "SELECT a.action,u.email AS actor_email,a.entity_id,a.detail,a.created_at FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.created_at DESC",
          )
          .all()
      ).results;
      return csv(
        [
          ["Action", "Actor email", "Entity ID", "Detail", "Created UTC"],
          ...rows.map((r) => [
            r.action,
            r.actor_email,
            r.entity_id,
            r.detail,
            r.created_at,
          ]),
        ],
        "hr-flings-audit.csv",
      );
    }
    return error("Not found", 404);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unexpected error";
    if (message === "Expected JSON" || message === "Invalid JSON")
      return error(message);
    if (message.includes("UNIQUE constraint failed"))
      return error("Already exists", 409);
    if (message === "PayPal is not configured") return error(message, 503);
    return error("Request could not be completed", 500);
  }
};
