import type { PagesFunction } from "@cloudflare/workers-types";

type Role = "hr" | "finance" | "employee";
type User = { id: string; email: string; name: string; role: Role };
type Env = {
  DB: D1Database;
  AI: Ai;
  JWT_SECRET?: string;
  PAYPAL_CLIENT_ID?: string;
  PAYPAL_CLIENT_SECRET?: string;
  BOOTSTRAP_SECRET?: string;
  COUPON_KEY?: string;
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
        iterations: 100_000,
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
function base64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes));
}
async function couponKey(env: Env) {
  if (!env.COUPON_KEY) throw new Error("Coupon delivery is not configured");
  const bytes = Uint8Array.from(atob(env.COUPON_KEY), (char) =>
    char.charCodeAt(0),
  );
  if (bytes.length !== 32) throw new Error("Coupon delivery is not configured");
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}
async function encryptCoupon(env: Env, code: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const value = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await couponKey(env),
    new TextEncoder().encode(code),
  );
  return { ciphertext: base64(new Uint8Array(value)), iv: base64(iv) };
}
async function decryptCoupon(env: Env, ciphertext: string, iv: string) {
  const value = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: Uint8Array.from(atob(iv), (char) => char.charCodeAt(0)),
    },
    await couponKey(env),
    Uint8Array.from(atob(ciphertext), (char) => char.charCodeAt(0)),
  );
  return new TextDecoder().decode(value);
}
async function employeeIds(
  db: D1Database,
  value: unknown,
): Promise<string[] | null> {
  if (!Array.isArray(value) || !value.length || value.length > 500) return null;
  if (
    !value.every((id) => typeof id === "string" && /^[a-f0-9-]{36}$/.test(id))
  )
    return null;
  const ids = [...new Set(value as string[])];
  if (ids.length !== value.length) return null;
  const count = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM users WHERE role='employee' AND id IN (${ids.map(() => "?").join(",")})`,
    )
    .bind(...ids)
    .first<{ n: number }>();
  return count?.n === ids.length ? ids : null;
}
function cookieFrom(request: Ctx["request"], name: string) {
  return (
    request.headers
      .get("cookie")
      ?.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))?.[1] ?? ""
  );
}
function cookie(
  request: Ctx["request"],
  name: string,
  value: string,
  age: number,
  path = "/",
) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${name}=${value}; HttpOnly${secure}; SameSite=Lax; Path=${path}; Max-Age=${age}`;
}
function cookies(
  response: Response,
  request: Ctx["request"],
  access: string,
  refresh: string,
) {
  response.headers.append(
    "Set-Cookie",
    cookie(request, "hrf_access", access, access ? 900 : 0),
  );
  response.headers.append(
    "Set-Cookie",
    cookie(request, "hrf_refresh", refresh, refresh ? 604800 : 0, "/api/auth"),
  );
  return response;
}
function base64url(value: Uint8Array | string) {
  const bytes =
    typeof value === "string" ? new TextEncoder().encode(value) : value;
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}
function decode64(value: string) {
  const raw = value.replaceAll("-", "+").replaceAll("_", "/");
  return Uint8Array.from(
    atob(raw.padEnd(Math.ceil(raw.length / 4) * 4, "=")),
    (c) => c.charCodeAt(0),
  );
}
type Jwt = {
  sub: string;
  jti: string;
  kind: "access" | "refresh";
  iat: number;
  exp: number;
  v: number;
};
async function signingKey(env: Env) {
  if (!env.JWT_SECRET || env.JWT_SECRET.length < 32)
    throw new Error("JWT_SECRET is not configured");
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.JWT_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}
async function signJwt(env: Env, claims: Jwt) {
  const value = `${base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${base64url(JSON.stringify(claims))}`;
  return `${value}.${base64url(new Uint8Array(await crypto.subtle.sign("HMAC", await signingKey(env), new TextEncoder().encode(value))))}`;
}
async function verifyJwt(
  env: Env,
  token: string,
  kind: Jwt["kind"],
): Promise<Jwt | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const header = JSON.parse(new TextDecoder().decode(decode64(parts[0]))) as {
      alg?: string;
      typ?: string;
    };
    if (header.alg !== "HS256" || header.typ !== "JWT") return null;
    const valid = await crypto.subtle.verify(
      "HMAC",
      await signingKey(env),
      decode64(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
    if (!valid) return null;
    const claims = JSON.parse(
      new TextDecoder().decode(decode64(parts[1])),
    ) as Partial<Jwt>;
    if (
      claims.kind !== kind ||
      typeof claims.sub !== "string" ||
      typeof claims.jti !== "string" ||
      typeof claims.iat !== "number" ||
      typeof claims.exp !== "number" ||
      typeof claims.v !== "number" ||
      !Number.isSafeInteger(claims.iat) ||
      !Number.isSafeInteger(claims.exp) ||
      !Number.isSafeInteger(claims.v) ||
      claims.exp <= Math.floor(Date.now() / 1000) ||
      claims.iat > Math.floor(Date.now() / 1000) + 60
    )
      return null;
    return claims as Jwt;
  } catch {
    return null;
  }
}
async function newTokens(
  env: Env,
  userId: string,
  version: number,
  refreshExpires = Math.floor(Date.now() / 1000) + 604800,
) {
  const now = Math.floor(Date.now() / 1000);
  const access = await signJwt(env, {
    sub: userId,
    jti: crypto.randomUUID(),
    kind: "access",
    iat: now,
    exp: Math.min(now + 900, refreshExpires),
    v: version,
  });
  const refresh = await signJwt(env, {
    sub: userId,
    jti: crypto.randomUUID(),
    kind: "refresh",
    iat: now,
    exp: refreshExpires,
    v: version,
  });
  return { access, refresh, refreshExpires };
}
async function createTokens(ctx: Ctx, userId: string, version: number) {
  const pair = await newTokens(ctx.env, userId, version);
  await ctx.env.DB.prepare(
    "INSERT INTO refresh_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)",
  )
    .bind(await sha(pair.refresh), userId, pair.refreshExpires)
    .run();
  return pair;
}
async function currentUser(ctx: Ctx): Promise<User | null> {
  const access = await verifyJwt(
    ctx.env,
    cookieFrom(ctx.request, "hrf_access"),
    "access",
  );
  if (access) {
    const user = await ctx.env.DB.prepare(
      "SELECT id,email,name,role,auth_version FROM users WHERE id=?",
    )
      .bind(access.sub)
      .first<User & { auth_version: number }>();
    if (user && user.auth_version === access.v) return user;
  }
  const legacy = cookieFrom(ctx.request, "hrf_session");
  if (!legacy) return null;
  return (
    (await ctx.env.DB.prepare(
      "SELECT u.id,u.email,u.name,u.role,u.auth_version FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>datetime('now')",
    )
      .bind(await sha(legacy))
      .first<User & { auth_version: number }>()) ?? null
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
  requestId?: string,
) {
  const token = await paypalToken(env);
  const response = await fetch(`https://api-m.sandbox.paypal.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(requestId ? { "PayPal-Request-Id": requestId } : {}),
    },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const data = (await response.json()) as Record<string, unknown>;
  if (!response.ok)
    throw new Error(`PayPal ${method} failed (${response.status})`);
  return data;
}

export const onRequest = async (ctx: Ctx) => {
  const request = ctx.request;
  const path = new URL(request.url).pathname.replace(/^\/api\/?/, "");
  const method = request.method;
  const db = ctx.env.DB;
  try {
    if (method !== "GET" && method !== "HEAD") {
      const origin = request.headers.get("origin");
      if (
        (origin && origin !== new URL(request.url).origin) ||
        request.headers.get("sec-fetch-site") === "cross-site"
      )
        return error("Origin rejected", 403);
      if (request.headers.has("cookie") && !origin)
        return error("Origin required", 403);
    }
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
        .first<
          User & {
            password_salt: string;
            password_hash: string;
            auth_version: number;
          }
        >();
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
      const pair = await createTokens(ctx, user.id, user.auth_version);
      await audit(db, user.id, "auth.login", user.id);
      return cookies(
        json({
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
          },
        }),
        request,
        pair.access,
        pair.refresh,
      );
    }
    if (path === "auth/invitation" && method === "GET") {
      const token = new URL(request.url).searchParams.get("token") ?? "";
      if (token.length < 32 || token.length > 256)
        return error("Invalid invitation", 404);
      const invitation = await db
        .prepare(
          "SELECT email,name,role,expires_at FROM invitations WHERE token_hash=? AND used_at IS NULL AND expires_at>unixepoch()",
        )
        .bind(await sha(token))
        .first<{
          email: string;
          name: string;
          role: Role;
          expires_at: number;
        }>();
      if (!invitation) return error("Invitation unavailable", 404);
      return json({
        invitation: {
          email: invitation.email,
          name: invitation.name,
          role: invitation.role,
          expiresAt: new Date(invitation.expires_at * 1000).toISOString(),
        },
      });
    }
    if (path === "auth/register" && method === "POST") {
      const input = await body(request);
      const token = field(input.token, 256);
      const password = field(input.password, 200);
      const name = field(input.name, 80);
      if (token.length < 32 || password.length < 12 || name.length < 2)
        return error("Invitation, name, and 12-character password required");
      const invitation = await db
        .prepare(
          "SELECT id,email,role FROM invitations WHERE token_hash=? AND used_at IS NULL AND expires_at>unixepoch()",
        )
        .bind(await sha(token))
        .first<{ id: string; email: string; role: Role }>();
      if (!invitation) return error("Invitation unavailable", 404);
      const id = crypto.randomUUID();
      const salt = crypto.randomUUID();
      const pair = await newTokens(ctx.env, id, 0);
      await db.batch([
        db
          .prepare(
            "INSERT INTO users(id,email,name,role,password_salt,password_hash) VALUES(?,?,?,?,?,?)",
          )
          .bind(
            id,
            invitation.email,
            name,
            invitation.role,
            salt,
            await passwordHash(password, salt),
          ),
        db
          .prepare(
            "UPDATE invitations SET used_at=CURRENT_TIMESTAMP WHERE id=? AND used_at IS NULL",
          )
          .bind(invitation.id),
        db
          .prepare(
            "INSERT INTO refresh_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)",
          )
          .bind(await sha(pair.refresh), id, pair.refreshExpires),
      ]);
      await audit(db, id, "auth.register", id, invitation.role);
      return cookies(
        json(
          {
            user: { id, email: invitation.email, name, role: invitation.role },
          },
          201,
        ),
        request,
        pair.access,
        pair.refresh,
      );
    }
    if (path === "auth/refresh" && method === "POST") {
      const old = cookieFrom(request, "hrf_refresh");
      const claims = await verifyJwt(ctx.env, old, "refresh");
      if (claims) {
        const record = await db
          .prepare(
            "SELECT r.expires_at,u.email,u.name,u.role,u.auth_version FROM refresh_sessions r JOIN users u ON u.id=r.user_id WHERE r.token_hash=? AND r.user_id=? AND r.expires_at>unixepoch()",
          )
          .bind(await sha(old), claims.sub)
          .first<{
            expires_at: number;
            email: string;
            name: string;
            role: Role;
            auth_version: number;
          }>();
        if (
          record &&
          record.auth_version === claims.v &&
          record.expires_at === claims.exp
        ) {
          const pair = await newTokens(
            ctx.env,
            claims.sub,
            claims.v,
            record.expires_at,
          );
          const updated = await db
            .prepare(
              "UPDATE refresh_sessions SET token_hash=? WHERE token_hash=? AND user_id=? AND expires_at>unixepoch()",
            )
            .bind(await sha(pair.refresh), await sha(old), claims.sub)
            .run();
          if (updated.meta.changes === 1)
            return cookies(
              json({
                user: {
                  id: claims.sub,
                  email: record.email,
                  name: record.name,
                  role: record.role,
                },
              }),
              request,
              pair.access,
              pair.refresh,
            );
        }
      }
      const legacy = cookieFrom(request, "hrf_session");
      if (legacy) {
        const user = (await currentUser(ctx)) as
          | (User & { auth_version?: number })
          | null;
        if (user) {
          const pair = await createTokens(ctx, user.id, user.auth_version ?? 0);
          await db
            .prepare("DELETE FROM sessions WHERE token_hash=?")
            .bind(await sha(legacy))
            .run();
          const response = cookies(
            json({
              user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
              },
            }),
            request,
            pair.access,
            pair.refresh,
          );
          response.headers.append(
            "Set-Cookie",
            cookie(request, "hrf_session", "", 0),
          );
          return response;
        }
      }
      return cookies(error("Sign in required", 401), request, "", "");
    }
    if (path === "auth/logout" && method === "POST") {
      const signedIn = await currentUser(ctx);
      if (signedIn) {
        await db.batch([
          db
            .prepare("UPDATE users SET auth_version=auth_version+1 WHERE id=?")
            .bind(signedIn.id),
          db
            .prepare("DELETE FROM refresh_sessions WHERE user_id=?")
            .bind(signedIn.id),
          db.prepare("DELETE FROM sessions WHERE user_id=?").bind(signedIn.id),
        ]);
      }
      const refresh = cookieFrom(request, "hrf_refresh");
      if (refresh)
        await db
          .prepare("DELETE FROM refresh_sessions WHERE token_hash=?")
          .bind(await sha(refresh))
          .run();
      const legacy = cookieFrom(request, "hrf_session");
      if (legacy)
        await db
          .prepare("DELETE FROM sessions WHERE token_hash=?")
          .bind(await sha(legacy))
          .run();
      const response = cookies(json({ ok: true }), request, "", "");
      response.headers.append(
        "Set-Cookie",
        cookie(request, "hrf_session", "", 0),
      );
      return response;
    }
    const user = await currentUser(ctx);
    if (!user) return error("Sign in required", 401);
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
      const nextVersion =
        ((user as User & { auth_version?: number }).auth_version ?? 0) + 1;
      const pair = await newTokens(ctx.env, user.id, nextVersion);
      await db.batch([
        db
          .prepare(
            "UPDATE users SET password_salt=?,password_hash=?,auth_version=? WHERE id=?",
          )
          .bind(salt, await passwordHash(next, salt), nextVersion, user.id),
        db.prepare("DELETE FROM sessions WHERE user_id=?").bind(user.id),
        db
          .prepare("DELETE FROM refresh_sessions WHERE user_id=?")
          .bind(user.id),
        db
          .prepare(
            "INSERT INTO refresh_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)",
          )
          .bind(await sha(pair.refresh), user.id, pair.refreshExpires),
      ]);
      await audit(db, user.id, "auth.password_changed", user.id);
      const response = cookies(
        json({ ok: true }),
        request,
        pair.access,
        pair.refresh,
      );
      response.headers.append(
        "Set-Cookie",
        cookie(request, "hrf_session", "", 0),
      );
      return response;
    }
    if (path === "me" && method === "GET")
      return json({
        user,
        paypalConfigured: !!(
          ctx.env.PAYPAL_CLIENT_ID && ctx.env.PAYPAL_CLIENT_SECRET
        ),
      });
    if (path === "rewards" && method === "GET") return json({ rewards });
    if (path === "notifications" && method === "GET") {
      if (!allowed(user, ["employee"])) return error("Forbidden", 403);
      const notifications = (
        await db
          .prepare(
            "SELECT c.id,c.title,c.occasion,c.created_at FROM campaigns c JOIN campaign_recipients cr ON cr.campaign_id=c.id AND cr.user_id=? LEFT JOIN notification_reads r ON r.campaign_id=c.id AND r.user_id=? WHERE r.campaign_id IS NULL ORDER BY c.created_at DESC LIMIT 20",
          )
          .bind(user.id, user.id)
          .all()
      ).results;
      return json({ notifications });
    }
    if (path === "notifications/read" && method === "POST") {
      if (!allowed(user, ["employee"])) return error("Forbidden", 403);
      const id = field((await body(request)).campaignId, 60);
      const campaign = await db
        .prepare(
          "SELECT campaign_id FROM campaign_recipients WHERE campaign_id=? AND user_id=?",
        )
        .bind(id, user.id)
        .first();
      if (!campaign) return error("Campaign not found", 404);
      await db
        .prepare(
          "INSERT OR IGNORE INTO notification_reads(campaign_id,user_id) VALUES(?,?)",
        )
        .bind(id, user.id)
        .run();
      return json({ ok: true });
    }
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
    if (path === "invitations" && method === "GET") {
      if (!allowed(user, ["finance"])) return error("Forbidden", 403);
      const invitations = (
        await db
          .prepare(
            "SELECT id,email,name,role,expires_at,used_at,created_at FROM invitations ORDER BY created_at DESC LIMIT 100",
          )
          .all()
      ).results;
      return json({
        invitations: invitations.map((item) => ({
          ...item,
          expiresAt: new Date(Number(item.expires_at) * 1000).toISOString(),
        })),
      });
    }
    if (path === "invitations" && method === "POST") {
      if (!allowed(user, ["finance"])) return error("Forbidden", 403);
      const input = await body(request);
      const email = field(input.email, 200).toLowerCase(),
        name = field(input.name, 80),
        role = field(input.role, 20) as Role;
      if (
        !email.includes("@") ||
        name.length < 2 ||
        !["hr", "finance", "employee"].includes(role)
      )
        return error("Invalid user details");
      const exists = await db
        .prepare("SELECT id FROM users WHERE email=?")
        .bind(email)
        .first();
      if (exists) return error("Already exists", 409);
      const id = crypto.randomUUID();
      const token =
        crypto.randomUUID().replaceAll("-", "") +
        crypto.randomUUID().replaceAll("-", "");
      const expiresAt = Math.floor(Date.now() / 1000) + 604800;
      await db
        .prepare(
          "INSERT INTO invitations(id,email,name,role,token_hash,expires_at,created_by) VALUES(?,?,?,?,?,?,?)",
        )
        .bind(id, email, name, role, await sha(token), expiresAt, user.id)
        .run();
      await audit(db, user.id, "invitation.created", id, role);
      return json(
        {
          id,
          invitationUrl: `${new URL(request.url).origin}/?invite=${token}`,
          expiresAt: new Date(expiresAt * 1000).toISOString(),
        },
        201,
      );
    }
    if (path === "users" && method === "POST")
      return error("Use invitations to add people", 410);
    if (path === "groups" && method === "GET") {
      if (!allowed(user, ["hr"])) return error("Forbidden", 403);
      const rows = (
        await db
          .prepare(
            "SELECT g.id,g.name,g.created_at,m.user_id FROM groups g LEFT JOIN group_members m ON m.group_id=g.id WHERE g.created_by=? ORDER BY g.created_at DESC,g.name",
          )
          .bind(user.id)
          .all<{
            id: string;
            name: string;
            created_at: string;
            user_id: string | null;
          }>()
      ).results;
      const groups = new Map<
        string,
        { id: string; name: string; created_at: string; member_ids: string[] }
      >();
      for (const row of rows) {
        if (!groups.has(row.id))
          groups.set(row.id, {
            id: row.id,
            name: row.name,
            created_at: row.created_at,
            member_ids: [],
          });
        if (row.user_id) groups.get(row.id)?.member_ids.push(row.user_id);
      }
      return json({ groups: [...groups.values()] });
    }
    if (path === "groups" && method === "POST") {
      if (!allowed(user, ["hr"])) return error("Forbidden", 403);
      const input = await body(request);
      const name = field(input.name, 80);
      const members = await employeeIds(db, input.memberIds);
      if (name.length < 3 || !members)
        return error("Group needs a name and valid employees");
      const id = crypto.randomUUID();
      await db.batch([
        db
          .prepare("INSERT INTO groups(id,name,created_by) VALUES(?,?,?)")
          .bind(id, name, user.id),
        ...members.map((memberId) =>
          db
            .prepare("INSERT INTO group_members(group_id,user_id) VALUES(?,?)")
            .bind(id, memberId),
        ),
      ]);
      await audit(
        db,
        user.id,
        "group.created",
        id,
        `${members.length} members`,
      );
      return json({ id }, 201);
    }
    const groupMembers = path.match(/^groups\/([a-f0-9-]{36})\/members$/);
    if (groupMembers && method === "POST") {
      if (!allowed(user, ["hr"])) return error("Forbidden", 403);
      const group = await db
        .prepare("SELECT id FROM groups WHERE id=? AND created_by=?")
        .bind(groupMembers[1], user.id)
        .first();
      if (!group) return error("Group not found", 404);
      const members = await employeeIds(db, (await body(request)).memberIds);
      if (!members) return error("Choose valid employees");
      await db.batch([
        db
          .prepare("DELETE FROM group_members WHERE group_id=?")
          .bind(groupMembers[1]),
        ...members.map((memberId) =>
          db
            .prepare("INSERT INTO group_members(group_id,user_id) VALUES(?,?)")
            .bind(groupMembers[1], memberId),
        ),
      ]);
      await audit(
        db,
        user.id,
        "group.members_updated",
        groupMembers[1],
        `${members.length} members`,
      );
      return json({ ok: true });
    }
    if (path === "campaigns" && method === "GET") {
      const campaigns = (
        await db
          .prepare(
            `SELECT c.*,u.name AS creator_name,(SELECT COUNT(*) FROM selections s WHERE s.campaign_id=c.id) AS selection_count,(SELECT COUNT(*) FROM campaign_recipients r WHERE r.campaign_id=c.id) AS employee_count,(SELECT COUNT(*) FROM coupon_deliveries d WHERE d.campaign_id=c.id) AS coupon_count,COALESCE(p.status,'unpaid') AS payment_status,CASE WHEN c.audience_type='group' THEN (SELECT name FROM groups WHERE id=c.audience_id) WHEN c.audience_type='person' THEN (SELECT name FROM users WHERE id=c.audience_id) ELSE 'Everyone' END AS audience_name FROM campaigns c JOIN users u ON u.id=c.created_by LEFT JOIN payments p ON p.campaign_id=c.id ${user.role === "employee" ? "WHERE EXISTS (SELECT 1 FROM campaign_recipients r WHERE r.campaign_id=c.id AND r.user_id=?)" : ""} ORDER BY c.created_at DESC`,
          )
          .bind(...(user.role === "employee" ? [user.id] : []))
          .all()
      ).results;
      const selections =
        user.role === "employee"
          ? (
              await db
                .prepare(
                  "SELECT campaign_id,reward_id,private_reason FROM selections WHERE user_id=? AND EXISTS (SELECT 1 FROM campaign_recipients r WHERE r.campaign_id=selections.campaign_id AND r.user_id=?)",
                )
                .bind(user.id, user.id)
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
        budget = Number(input.budgetCents),
        audienceType = field(input.audienceType, 20) || "all",
        audienceId = field(input.audienceId, 60);
      if (
        title.length < 3 ||
        !occasion ||
        !["all", "group", "person"].includes(audienceType) ||
        !Number.isSafeInteger(budget) ||
        budget < 100 ||
        budget > 100_000_00
      )
        return error("Invalid campaign");
      let recipients: string[];
      if (audienceType === "group") {
        const group = await db
          .prepare("SELECT id FROM groups WHERE id=? AND created_by=?")
          .bind(audienceId, user.id)
          .first();
        if (!group) return error("Group not found", 404);
        recipients = (
          await db
            .prepare("SELECT user_id FROM group_members WHERE group_id=?")
            .bind(audienceId)
            .all<{ user_id: string }>()
        ).results.map((row) => row.user_id);
      } else if (audienceType === "person") {
        const employee = await db
          .prepare("SELECT id FROM users WHERE id=? AND role='employee'")
          .bind(audienceId)
          .first<{ id: string }>();
        if (!employee) return error("Employee not found", 404);
        recipients = [employee.id];
      } else {
        if (audienceId) return error("Invalid audience");
        recipients = (
          await db
            .prepare("SELECT id FROM users WHERE role='employee'")
            .all<{ id: string }>()
        ).results.map((row) => row.id);
      }
      if (!recipients.length) return error("Choose at least one recipient");
      const id = crypto.randomUUID();
      await db.batch([
        db
          .prepare(
            "INSERT INTO campaigns(id,title,occasion,message,budget_cents,created_by,audience_type,audience_id) VALUES(?,?,?,?,?,?,?,?)",
          )
          .bind(
            id,
            title,
            occasion,
            message,
            budget,
            user.id,
            audienceType,
            audienceType === "all" ? null : audienceId,
          ),
        ...recipients.map((recipientId) =>
          db
            .prepare(
              "INSERT INTO campaign_recipients(campaign_id,user_id) VALUES(?,?)",
            )
            .bind(id, recipientId),
        ),
      ]);
      await audit(
        db,
        user.id,
        "campaign.created",
        id,
        `${occasion}; ${budget} cents; ${audienceType}; ${recipients.length} recipients`,
      );
      return json({ id }, 201);
    }
    if (path === "coupons" && method === "GET") {
      if (!allowed(user, ["employee"])) return error("Forbidden", 403);
      const rows = (
        await db
          .prepare(
            "SELECT campaign_id,code_ciphertext,code_iv,created_at FROM coupon_deliveries WHERE user_id=? ORDER BY created_at DESC",
          )
          .bind(user.id)
          .all<{
            campaign_id: string;
            code_ciphertext: string;
            code_iv: string;
            created_at: string;
          }>()
      ).results;
      const coupons = await Promise.all(
        rows.map(async (row) => ({
          campaign_id: row.campaign_id,
          code: await decryptCoupon(ctx.env, row.code_ciphertext, row.code_iv),
          created_at: row.created_at,
        })),
      );
      return json({ coupons });
    }
    const recipientsMatch = path.match(
      /^campaigns\/([a-f0-9-]{36})\/recipients$/,
    );
    if (recipientsMatch && method === "GET") {
      if (!allowed(user, ["hr", "finance"])) return error("Forbidden", 403);
      const campaign = await db
        .prepare("SELECT created_by FROM campaigns WHERE id=?")
        .bind(recipientsMatch[1])
        .first<{ created_by: string }>();
      if (!campaign || (user.role === "hr" && campaign.created_by !== user.id))
        return error("Campaign not found", 404);
      const recipients = (
        await db
          .prepare(
            "SELECT u.id,u.name,u.email,s.reward_id IS NOT NULL AS chosen,d.user_id IS NOT NULL AS delivered FROM campaign_recipients r JOIN users u ON u.id=r.user_id LEFT JOIN selections s ON s.campaign_id=r.campaign_id AND s.user_id=r.user_id LEFT JOIN coupon_deliveries d ON d.campaign_id=r.campaign_id AND d.user_id=r.user_id WHERE r.campaign_id=? ORDER BY u.name",
          )
          .bind(recipientsMatch[1])
          .all()
      ).results;
      return json({ recipients });
    }
    const couponMatch = path.match(/^campaigns\/([a-f0-9-]{36})\/coupons$/);
    if (couponMatch && method === "POST") {
      if (!allowed(user, ["hr"])) return error("Forbidden", 403);
      const campaign = await db
        .prepare("SELECT created_by FROM campaigns WHERE id=?")
        .bind(couponMatch[1])
        .first<{ created_by: string }>();
      if (!campaign || campaign.created_by !== user.id)
        return error("Campaign not found", 404);
      const input = await body(request);
      const userId = field(input.userId, 60);
      const code = field(input.code, 128);
      if (!/^[\x21-\x7e]{4,128}$/.test(code))
        return error("Enter a valid coupon code");
      const recipient = await db
        .prepare(
          "SELECT user_id FROM campaign_recipients WHERE campaign_id=? AND user_id=?",
        )
        .bind(couponMatch[1], userId)
        .first();
      if (!recipient) return error("Recipient not found", 404);
      const existing = await db
        .prepare(
          "SELECT user_id FROM coupon_deliveries WHERE campaign_id=? AND user_id=?",
        )
        .bind(couponMatch[1], userId)
        .first();
      if (existing) return error("Code already sent to this person", 409);
      const encrypted = await encryptCoupon(ctx.env, code);
      await db
        .prepare(
          "INSERT INTO coupon_deliveries(campaign_id,user_id,code_ciphertext,code_iv,sent_by) VALUES(?,?,?,?,?)",
        )
        .bind(
          couponMatch[1],
          userId,
          encrypted.ciphertext,
          encrypted.iv,
          user.id,
        )
        .run();
      await audit(
        db,
        user.id,
        "coupon.sent",
        couponMatch[1],
        `Recipient ${userId}`,
      );
      return json({ ok: true }, 201);
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
      if (action === "recommend" || action === "select") {
        const recipient = await db
          .prepare(
            "SELECT user_id FROM campaign_recipients WHERE campaign_id=? AND user_id=?",
          )
          .bind(id, user.id)
          .first();
        if (!recipient) return error("Unavailable", 403);
      }
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
        const saved = await db
          .prepare(
            "INSERT INTO selections(campaign_id,user_id,reward_id,private_reason) SELECT ?,?,?,? WHERE EXISTS (SELECT 1 FROM campaigns WHERE id=? AND status='open') ON CONFLICT(campaign_id,user_id) DO UPDATE SET reward_id=excluded.reward_id,private_reason=excluded.private_reason,selected_at=CURRENT_TIMESTAMP WHERE EXISTS (SELECT 1 FROM campaigns WHERE id=? AND status='open')",
          )
          .bind(id, user.id, rewardId, reason, id, id)
          .run();
        if (saved.meta.changes !== 1)
          return error("Campaign is no longer open", 409);
        await audit(db, user.id, "reward.selected", id, rewardId);
        return json({ ok: true });
      }
      if (!allowed(user, ["finance"])) return error("Forbidden", 403);
      if (action === "checkout") {
        if (campaign.status === "paid")
          return error("Campaign already paid", 409);
        if (!ctx.env.PAYPAL_CLIENT_ID || !ctx.env.PAYPAL_CLIENT_SECRET)
          return error("PayPal is not configured", 503);
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
        const claimed = await db
          .prepare(
            "UPDATE campaigns SET status='pending',checkout_started_at=unixepoch() WHERE id=? AND (status='open' OR (status='pending' AND COALESCE(checkout_started_at,0)<unixepoch()-120 AND NOT EXISTS (SELECT 1 FROM payments WHERE campaign_id=?))) AND EXISTS (SELECT 1 FROM selections WHERE campaign_id=?)",
          )
          .bind(id, id, id)
          .run();
        if (claimed.meta.changes !== 1)
          return error("No selections or payment is already in progress", 409);
        const count =
          (
            await db
              .prepare(
                "SELECT COUNT(*) AS n FROM selections WHERE campaign_id=?",
              )
              .bind(id)
              .first<{ n: number }>()
          )?.n ?? 0;
        const total = count * campaign.budget_cents;
        const origin = new URL(request.url).origin;
        const order = await paypal(
          ctx.env,
          "/v2/checkout/orders",
          "POST",
          {
            intent: "CAPTURE",
            purchase_units: [
              {
                reference_id: id,
                description: `SwagBag: ${campaign.title}`,
                amount: {
                  currency_code: "USD",
                  value: (total / 100).toFixed(2),
                },
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
          },
          `swagbag-${id}`,
        );
        const orderId = String(order.id ?? "");
        const approve = (
          order.links as { rel: string; href: string }[] | undefined
        )?.find((x) => x.rel === "payer-action" || x.rel === "approve")?.href;
        if (!orderId || !approve)
          return error("PayPal did not return approval link", 502);
        await db
          .prepare(
            "INSERT INTO payments(campaign_id,order_id,amount_cents,status) VALUES(?,?,?,?)",
          )
          .bind(id, orderId, total, "pending")
          .run();
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
        const selectionCount =
          (
            await db
              .prepare(
                "SELECT COUNT(*) AS n FROM selections WHERE campaign_id=?",
              )
              .bind(id)
              .first<{ n: number }>()
          )?.n ?? 0;
        if (payment.amount_cents !== selectionCount * campaign.budget_cents)
          return error("Payment amount needs review", 409);
        const order = await paypal(
          ctx.env,
          `/v2/checkout/orders/${encodeURIComponent(payment.order_id)}/capture`,
          "POST",
          undefined,
          `swagbag-capture-${id}`,
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
        "swagbag-payments.csv",
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
        "swagbag-audit.csv",
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
    console.error("API request failed:", message);
    return error("Request could not be completed", 500);
  }
};
