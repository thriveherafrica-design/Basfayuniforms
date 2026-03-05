// functions/api/[[path]].js
// BASFAY optional login + orders API (Cloudflare Pages Functions + D1)

const COOKIE_NAME = "basfay_session";
const SESSION_TTL_DAYS = 30;
const PBKDF2_ITERS = 210000;

export async function onRequest(context) {
  const { request, env, params } = context;

  // [[path]].js -> params.path is usually an array of segments
  const segs = Array.isArray(params?.path)
    ? params.path
    : (params?.path ? [params.path] : []);
  const endpoint = (segs[0] || "").toLowerCase();

  try {
    // Basic same-origin protection for state-changing requests
    if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) {
      if (!isSameOrigin(request)) return json({ error: "Bad origin" }, 403);
    }

    // ✅ Health check (routing test)
    if (request.method === "GET" && endpoint === "ping") {
      return json({ ok: true, message: "API is alive" }, 200);
    }

    // ✅ DB sanity check (binding + D1 connectivity test)
    if (request.method === "GET" && endpoint === "db") {
      try {
        const t = await env.DB.prepare("SELECT 1 as one").first();
        return json({ ok: true, db: t.one }, 200);
      } catch (e) {
        return json(
          {
            ok: false,
            error:
              "DB not reachable. Check D1 binding name = DB and that you bound it in the correct environment (Production/Preview).",
            detail: String(e?.message || e),
          },
          500
        );
      }
    }

    // AUTH
    if (request.method === "POST" && endpoint === "register") return register(request, env);
    if (request.method === "POST" && endpoint === "login") return login(request, env);
    if (request.method === "POST" && endpoint === "logout") return logout(request, env);
    if (request.method === "GET" && endpoint === "me") return me(request, env);

    // ORDERS
    if (endpoint === "orders" && request.method === "POST") return createOrder(request, env);
    if (endpoint === "orders" && request.method === "GET") return listOrders(request, env);

    return json({ error: "Not found" }, 404);
  } catch (err) {
    // Always JSON (no HTML error pages)
    return json({ error: "Server error", detail: String(err?.message || err) }, 500);
  }
}

/* -----------------------------
   AUTH
----------------------------- */

async function register(request, env) {
  const body = await safeJson(request);
  const email = normEmail(body.email);
  const password = String(body.password || "");
  const name = cleanText(body.name, 80);
  const phone = cleanText(body.phone, 30);

  if (!email || password.length < 8) {
    return json({ error: "Email required and password must be 8+ chars." }, 400);
  }

  // Ensure DB binding exists
  if (!env?.DB) return json({ error: "DB binding missing (env.DB)" }, 500);

  const existing = await env.DB
    .prepare("SELECT id FROM users WHERE email = ?")
    .bind(email)
    .first();

  if (existing) return json({ error: "Email already registered." }, 409);

  const id = crypto.randomUUID();
  const createdAt = now();

  const salt = randomB64(16);
  const hash = await pbkdf2Hash(password, salt);

  await env.DB.prepare(`
    INSERT INTO users (id, email, phone, name, password_salt, password_hash, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(id, email, phone || null, name || null, salt, hash, createdAt).run();

  const { cookie } = await createSession(env, id);

  return json(
    { ok: true, user: { id, email, name: name || null, phone: phone || null } },
    200,
    { "Set-Cookie": cookie }
  );
}

async function login(request, env) {
  const body = await safeJson(request);
  const email = normEmail(body.email);
  const password = String(body.password || "");

  if (!email || !password) return json({ error: "Email and password required." }, 400);
  if (!env?.DB) return json({ error: "DB binding missing (env.DB)" }, 500);

  const user = await env.DB.prepare(`
    SELECT id, email, name, phone, password_salt, password_hash
    FROM users
    WHERE email = ?
  `).bind(email).first();

  if (!user) return json({ error: "Invalid credentials." }, 401);

  const calc = await pbkdf2Hash(password, user.password_salt);
  if (!timingSafeEqualB64(calc, user.password_hash)) {
    return json({ error: "Invalid credentials." }, 401);
  }

  const { cookie } = await createSession(env, user.id);

  return json(
    { ok: true, user: { id: user.id, email: user.email, name: user.name, phone: user.phone } },
    200,
    { "Set-Cookie": cookie }
  );
}

async function logout(request, env) {
  if (!env?.DB) {
    // Still clear cookie even if DB binding missing
    const cookie = `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
    return json({ ok: true }, 200, { "Set-Cookie": cookie });
  }

  const token = getCookie(request, COOKIE_NAME);
  if (token) {
    const tokenHash = await sha256B64(token);
    await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(tokenHash).run();
  }

  const cookie = `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
  return json({ ok: true }, 200, { "Set-Cookie": cookie });
}

async function me(request, env) {
  const user = await getAuthedUser(request, env);
  if (!user) return json({ ok: true, user: null }, 200);

  return json(
    { ok: true, user: { id: user.id, email: user.email, name: user.name, phone: user.phone } },
    200
  );
}

/* -----------------------------
   ORDERS
----------------------------- */

async function createOrder(request, env) {
  const body = await safeJson(request);

  const items = body.items;
  const totalKes = Number(body.total_kes);

  if (!Array.isArray(items) || !Number.isFinite(totalKes) || totalKes <= 0) {
    return json({ error: "Invalid order payload." }, 400);
  }

  if (!env?.DB) return json({ error: "DB binding missing (env.DB)" }, 500);

  const customerName = cleanText(body.customer_name, 80);
  const customerPhone = cleanText(body.customer_phone, 30);
  const note = cleanText(body.note, 300);

  const user = await getAuthedUser(request, env);

  const id = crypto.randomUUID();
  const createdAt = now();

  await env.DB.prepare(`
    INSERT INTO orders (id, user_id, customer_name, customer_phone, items_json, total_kes, status, note, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'received', ?, ?)
  `).bind(
    id,
    user ? user.id : null,
    customerName || null,
    customerPhone || null,
    JSON.stringify(items),
    Math.trunc(totalKes),
    note || null,
    createdAt
  ).run();

  return json({ ok: true, orderId: id }, 200);
}

async function listOrders(request, env) {
  const user = await getAuthedUser(request, env);
  if (!user) return json({ error: "Login required." }, 401);
  if (!env?.DB) return json({ error: "DB binding missing (env.DB)" }, 500);

  const rows = await env.DB.prepare(`
    SELECT id, total_kes, status, created_at, customer_name, customer_phone, items_json, note
    FROM orders
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 50
  `).bind(user.id).all();

  const orders = (rows.results || []).map((r) => ({
    id: r.id,
    total_kes: r.total_kes,
    status: r.status,
    created_at: r.created_at,
    customer_name: r.customer_name,
    customer_phone: r.customer_phone,
    items: safeParse(r.items_json),
    note: r.note,
  }));

  return json({ ok: true, orders }, 200);
}

/* -----------------------------
   SESSION HELPERS
----------------------------- */

async function createSession(env, userId) {
  const token = randomB64Url(32);
  const tokenHash = await sha256B64(token);

  const createdAt = now();
  const expiresAt = createdAt + SESSION_TTL_DAYS * 24 * 60 * 60;

  await env.DB.prepare(`
    INSERT INTO sessions (id, user_id, created_at, expires_at)
    VALUES (?, ?, ?, ?)
  `).bind(tokenHash, userId, createdAt, expiresAt).run();

  const maxAge = SESSION_TTL_DAYS * 24 * 60 * 60;
  const cookie = `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
  return { cookie };
}

async function getAuthedUser(request, env) {
  if (!env?.DB) return null;

  const token = getCookie(request, COOKIE_NAME);
  if (!token) return null;

  const tokenHash = await sha256B64(token);

  const row = await env.DB.prepare(`
    SELECT u.id, u.email, u.name, u.phone, s.expires_at
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.id = ?
  `).bind(tokenHash).first();

  if (!row) return null;

  if (row.expires_at <= now()) {
    await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(tokenHash).run();
    return null;
  }

  return { id: row.id, email: row.email, name: row.name, phone: row.phone };
}

/* -----------------------------
   UTILS + CRYPTO
----------------------------- */

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}

async function safeJson(request) {
  const ct = request.headers.get("Content-Type") || "";
  if (!ct.includes("application/json")) return {};
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function now() {
  return Math.floor(Date.now() / 1000);
}

function normEmail(v) {
  if (!v) return "";
  return String(v).trim().toLowerCase();
}

function cleanText(v, max) {
  if (v === undefined || v === null) return "";
  const s = String(v).trim();
  if (!s) return "";
  return s.length > max ? s.slice(0, max) : s;
}

function safeParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return [];
  }
}

function getCookie(request, name) {
  const cookie = request.headers.get("Cookie") || "";
  const parts = cookie.split(";").map((p) => p.trim());
  for (const p of parts) {
    if (p.startsWith(name + "=")) return p.slice(name.length + 1);
  }
  return "";
}

function isSameOrigin(request) {
  const origin = request.headers.get("Origin");
  if (!origin) return true; // allow non-browser clients
  const url = new URL(request.url);
  return origin === `${url.protocol}//${url.host}`;
}

function randomB64(bytesLen) {
  const bytes = new Uint8Array(bytesLen);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

function randomB64Url(bytesLen) {
  return randomB64(bytesLen)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function sha256B64(text) {
  const enc = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", enc);
  return btoa(String.fromCharCode(...new Uint8Array(digest)));
}

async function pbkdf2Hash(password, saltB64) {
  const enc = new TextEncoder();

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const saltBytes = Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0));

  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: saltBytes, iterations: PBKDF2_ITERS },
    keyMaterial,
    256
  );

  return btoa(String.fromCharCode(...new Uint8Array(bits)));
}

function timingSafeEqualB64(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}
