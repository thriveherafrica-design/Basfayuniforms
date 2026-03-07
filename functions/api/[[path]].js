// functions/api/[[path]].js
// BASFAY optional login + orders API (Cloudflare Pages Functions + D1)
// ✅ Google OAuth routes:
//    GET /api/auth/google/start
//    GET /api/auth/google/callback
// ✅ Guest order tracking:
//    POST /api/orders/track  { order_id, phone }
// ✅ Reviews:
//    GET  /api/reviews?product_id=...
//    POST /api/reviews/submit

const COOKIE_NAME = "basfay_session";
const SESSION_TTL_DAYS = 30;
const PBKDF2_ITERS = 100000; // keep <= 100000 on CF
const GOOGLE_STATE_COOKIE = "basfay_google_state";

export async function onRequest(context) {
  const { request, env, params } = context;

  // ✅ Robust: params.path can be ["orders","track"] OR "orders/track"
  const rawPath = Array.isArray(params?.path)
    ? params.path.join("/")
    : String(params?.path || "");

  const segs = rawPath.split("/").filter(Boolean).map((s) => String(s).toLowerCase());
  const endpoint = segs[0] || "";
  const sub = segs[1] || "";
  const action = segs[2] || "";

  try {
    // Basic same-origin protection for state-changing requests
    if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) {
      if (!isSameOrigin(request)) return json({ error: "Bad origin" }, 403);
    }

    /* -----------------------------
       ✅ GOOGLE OAUTH ROUTES
    ----------------------------- */
    if (request.method === "GET" && endpoint === "auth" && sub === "google" && action === "start") {
      return await googleStart(request, env);
    }
    if (request.method === "GET" && endpoint === "auth" && sub === "google" && action === "callback") {
      return await googleCallback(request, env);
    }

    /* -----------------------------
       Health / DB sanity
    ----------------------------- */
    if (request.method === "GET" && endpoint === "ping") {
      return json({ ok: true, message: "API is alive" }, 200);
    }

    if (request.method === "GET" && endpoint === "db") {
      try {
        if (!env?.DB) throw new Error("DB binding missing (env.DB)");
        const t = await env.DB.prepare("SELECT 1 as one").first();
        return json({ ok: true, db: t?.one ?? 1 }, 200);
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

    /* -----------------------------
       Auth (email/password)
    ----------------------------- */
    if (request.method === "POST" && endpoint === "register") return await register(request, env);
    if (request.method === "POST" && endpoint === "login") return await login(request, env);
    if (request.method === "POST" && endpoint === "logout") return await logout(request, env);
    if (request.method === "GET" && endpoint === "me") return await me(request, env);

    /* -----------------------------
       Reviews
       - GET  /api/reviews?product_id=...
       - POST /api/reviews/submit
    ----------------------------- */
    if (request.method === "GET" && endpoint === "reviews" && !sub) {
      return await getProductReviews(request, env);
    }

    if (request.method === "POST" && endpoint === "reviews" && sub === "submit") {
      return await submitReview(request, env);
    }

    /* -----------------------------
       Orders
       - POST /api/orders
       - GET  /api/orders
       - POST /api/orders/track
    ----------------------------- */
    if (request.method === "POST" && endpoint === "orders" && sub === "track") {
      return await trackOrder(request, env);
    }

    if (endpoint === "orders" && !sub && request.method === "POST") return await createOrder(request, env);
    if (endpoint === "orders" && !sub && request.method === "GET") return await listOrders(request, env);

    return json({ error: "Not found" }, 404);
  } catch (err) {
    return json({ error: "Server error", detail: String(err?.message || err) }, 500);
  }
}

/* -----------------------------
   AUTH (email/password)
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
  if (!env?.DB) return json({ error: "DB binding missing (env.DB)" }, 500);

  const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
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
  const clearCookie = `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

  if (!env?.DB) return json({ ok: true }, 200, { "Set-Cookie": clearCookie });

  const token = getCookie(request, COOKIE_NAME);
  if (token) {
    const tokenHash = await sha256B64(token);
    await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(tokenHash).run();
  }

  return json({ ok: true }, 200, { "Set-Cookie": clearCookie });
}

async function me(request, env) {
  const user = await getAuthedUser(request, env);
  if (!user) return json({ ok: true, user: null }, 200);
  return json({ ok: true, user }, 200);
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
  const customerPhoneRaw = cleanText(body.customer_phone, 30);
  const customerPhone = customerPhoneRaw ? normalizePhone(customerPhoneRaw) : "";
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
    note: r.note
  }));

  return json({ ok: true, orders }, 200);
}

/* -----------------------------
   ✅ GUEST TRACKING
   POST /api/orders/track
   { order_id, phone }
----------------------------- */
async function trackOrder(request, env) {
  const body = await safeJson(request);
  const orderId = cleanText(body.order_id, 120);
  const phoneRaw = cleanText(body.phone, 30);
  const phone = phoneRaw ? normalizePhone(phoneRaw) : "";

  if (!orderId || !phone) return json({ error: "order_id and phone are required." }, 400);
  if (!env?.DB) return json({ error: "DB binding missing (env.DB)" }, 500);

  const row = await env.DB.prepare(`
    SELECT id, user_id, customer_name, customer_phone, items_json, total_kes, status, note, created_at
    FROM orders
    WHERE id = ?
    LIMIT 1
  `).bind(orderId).first();

  if (!row) return json({ error: "Not found" }, 404);

  const authed = await getAuthedUser(request, env);
  const owns = authed?.id && row.user_id && authed.id === row.user_id;

  const storedPhone = row.customer_phone ? normalizePhone(String(row.customer_phone)) : "";
  const phoneOk = storedPhone && storedPhone === phone;

  // Don’t leak order existence
  if (!owns && !phoneOk) return json({ error: "Not found" }, 404);

  return json({
    ok: true,
    order: {
      id: row.id,
      status: row.status,
      created_at: row.created_at,
      total_kes: row.total_kes,
      customer_name: row.customer_name || null,
      items: safeParse(row.items_json),
      note: row.note || null
    }
  }, 200);
}

/* -----------------------------
   REVIEWS
----------------------------- */

async function getProductReviews(request, env) {
  const url = new URL(request.url);
  const productId = cleanText(url.searchParams.get("product_id"), 120);

  if (!productId) return json({ error: "product_id is required." }, 400);
  if (!env?.DB) return json({ error: "DB binding missing (env.DB)" }, 500);

  const summary = await env.DB.prepare(`
    SELECT
      COUNT(*) AS review_count,
      ROUND(AVG(rating), 1) AS average_rating
    FROM reviews
    WHERE product_id = ?
      AND status = 'approved'
  `).bind(productId).first();

  const rows = await env.DB.prepare(`
    SELECT
      id,
      customer_name,
      rating,
      review_text,
      verified_purchase,
      created_at
    FROM reviews
    WHERE product_id = ?
      AND status = 'approved'
    ORDER BY created_at DESC
    LIMIT 10
  `).bind(productId).all();

  const reviewCount = Number(summary?.review_count || 0);
  const averageRating = reviewCount ? Number(summary?.average_rating || 0) : 0;

  return json({
    ok: true,
    product_id: productId,
    average_rating: averageRating,
    review_count: reviewCount,
    reviews: (rows.results || []).map((r) => ({
      id: r.id,
      customer_name: r.customer_name || "Verified Buyer",
      rating: r.rating,
      review_text: r.review_text,
      verified_purchase: !!r.verified_purchase,
      created_at: r.created_at
    }))
  }, 200);
}

async function submitReview(request, env) {
  const body = await safeJson(request);

  const productId = cleanText(body.product_id || body.productId, 120);
  const orderId = cleanText(body.order_id || body.orderId, 120);
  const phone = normalizePhone(cleanText(body.customer_phone || body.phone, 30));
  const customerName = cleanText(body.customer_name || body.name, 80);
  const reviewText = cleanText(body.review_text || body.reviewBody, 1000);
  const rating = Number(body.rating);
  const turnstileToken = cleanText(body.turnstile_token || body.turnstileToken, 4000);

  if (!productId || !orderId || !phone || !reviewText) {
    return json({ error: "product_id, order_id, phone and review_text are required." }, 400);
  }

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return json({ error: "rating must be an integer between 1 and 5." }, 400);
  }

  if (reviewText.length < 8) {
    return json({ error: "Review is too short." }, 400);
  }

  if (!env?.DB) return json({ error: "DB binding missing (env.DB)" }, 500);

  const turnstile = await verifyTurnstileToken(turnstileToken, request, env);
  if (!turnstile.ok) {
    return json({ error: "Turnstile verification failed." }, 400);
  }

  const row = await env.DB.prepare(`
    SELECT id, user_id, customer_name, customer_phone, items_json, total_kes, status, note, created_at
    FROM orders
    WHERE id = ?
    LIMIT 1
  `).bind(orderId).first();

  if (!row) return json({ error: "Order not found." }, 404);

  const authed = await getAuthedUser(request, env);
  const owns = authed?.id && row.user_id && authed.id === row.user_id;

  const storedPhone = row.customer_phone ? normalizePhone(String(row.customer_phone)) : "";
  const phoneOk = storedPhone && storedPhone === phone;

  // Don’t leak order existence
  if (!owns && !phoneOk) {
    return json({ error: "Order not found." }, 404);
  }

  const orderItems = safeParse(row.items_json);
  const matchedItem = findProductInOrder(orderItems, productId);

  if (!matchedItem) {
    return json({
      error: "This product was not found in that order.",
      detail: "Order items must include product_id, productId, or id for review verification to work."
    }, 400);
  }

  const existing = await env.DB.prepare(`
    SELECT id, status
    FROM reviews
    WHERE product_id = ?
      AND order_id = ?
      AND customer_phone = ?
    LIMIT 1
  `).bind(productId, orderId, phone).first();

  if (existing) {
    return json({
      error: "A review for this product and order already exists.",
      status: existing.status
    }, 409);
  }

  const ts = now();
  const reviewId = crypto.randomUUID();

  await env.DB.prepare(`
    INSERT INTO reviews (
      id,
      product_id,
      order_id,
      user_id,
      customer_name,
      customer_phone,
      rating,
      review_text,
      verified_purchase,
      status,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'pending', ?, ?)
  `).bind(
    reviewId,
    productId,
    orderId,
    authed?.id || row.user_id || null,
    customerName || row.customer_name || null,
    phone,
    Math.trunc(rating),
    reviewText,
    ts,
    ts
  ).run();

  return json({
    ok: true,
    message: "Review submitted and pending approval.",
    reviewId
  }, 200);
}

async function verifyTurnstileToken(token, request, env) {
  if (!token) return { ok: false, error: "Missing turnstile token." };

  const secret = String(env?.TURNSTILE_SECRET || "").trim();
  if (!secret) return { ok: false, error: "TURNSTILE_SECRET missing." };

  const form = new URLSearchParams();
  form.set("secret", secret);
  form.set("response", token);

  const ip = request.headers.get("CF-Connecting-IP") || "";
  if (ip) form.set("remoteip", ip);

  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form
    });

    const data = await res.json().catch(() => ({ success: false }));
    if (!res.ok || !data?.success) {
      return { ok: false, detail: data };
    }

    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

function findProductInOrder(items, productId) {
  if (!Array.isArray(items)) return null;
  return items.find((item) => extractOrderItemProductId(item) === productId) || null;
}

function extractOrderItemProductId(item) {
  if (!item || typeof item !== "object") return "";
  return cleanText(
    item.product_id ||
    item.productId ||
    item.id ||
    item?.product?.id ||
    "",
    120
  );
}

/* -----------------------------
   ✅ GOOGLE OAUTH
----------------------------- */

function baseUrlFromEnv(env) {
  return String(env?.SITE_BASE_URL || "").trim().replace(/\/+$/g, "");
}

function redirectWithCookies(location, cookies = []) {
  const headers = new Headers({ Location: location });
  for (const c of cookies) headers.append("Set-Cookie", c);
  return new Response(null, { status: 302, headers });
}

async function googleStart(request, env) {
  const base = baseUrlFromEnv(env);

  const clientId = String(env?.GOOGLE_CLIENT_ID || "").trim().replace(/^['"]|['"]$/g, "");
  const clientSecret = String(env?.GOOGLE_CLIENT_SECRET || "").trim().replace(/^['"]|['"]$/g, "");

  if (!base || !clientId || !clientSecret) {
    return json(
      { error: "Google OAuth not configured. Need SITE_BASE_URL, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET." },
      500
    );
  }

  const state = randomB64Url(24);
  const redirectUri = `${base}/api/auth/google/callback`;

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("prompt", "select_account");

  const url = new URL(request.url);
  if (url.searchParams.get("debug") === "1") {
    return json(
      {
        ok: true,
        site_base_url: base,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_id_ends_with: clientId.slice(-25),
        auth_url: authUrl.toString(),
      },
      200
    );
  }

  const stateCookie = `${GOOGLE_STATE_COOKIE}=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`;
  return redirectWithCookies(authUrl.toString(), [stateCookie]);
}

async function googleCallback(request, env) {
  const base = baseUrlFromEnv(env);
  const url = new URL(request.url);

  const clientId = String(env?.GOOGLE_CLIENT_ID || "").trim().replace(/^['"]|['"]$/g, "");
  const clientSecret = String(env?.GOOGLE_CLIENT_SECRET || "").trim().replace(/^['"]|['"]$/g, "");

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const savedState = getCookie(request, GOOGLE_STATE_COOKIE);

  const clearStateCookie = `${GOOGLE_STATE_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

  if (!base || !code || !state || !savedState || state !== savedState) {
    return redirectWithCookies(`${base || ""}/#main`, [clearStateCookie]);
  }

  const redirectUri = `${base}/api/auth/google/callback`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) return redirectWithCookies(`${base}/#main`, [clearStateCookie]);

  const tokenJson = await tokenRes.json();
  const accessToken = tokenJson.access_token;
  if (!accessToken) return redirectWithCookies(`${base}/#main`, [clearStateCookie]);

  const userRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!userRes.ok) return redirectWithCookies(`${base}/#main`, [clearStateCookie]);

  const userInfo = await userRes.json();
  const email = String(userInfo.email || "").trim().toLowerCase();
  const givenName = String(userInfo.given_name || userInfo.name || "").trim();

  if (!email) return redirectWithCookies(`${base}/#main`, [clearStateCookie]);
  if (!env?.DB) return json({ error: "DB binding missing (env.DB)" }, 500);

  const existing = await env.DB
    .prepare("SELECT id, name FROM users WHERE email = ?")
    .bind(email)
    .first();

  let userId = existing?.id;

  if (!userId) {
    userId = crypto.randomUUID();
    const createdAt = now();
    const passwordSalt = randomB64(16);
    const passwordHash = randomB64(32);

    await env.DB.prepare(`
      INSERT INTO users (id, email, phone, name, password_salt, password_hash, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      userId,
      email,
      null,
      givenName || null,
      passwordSalt,
      passwordHash,
      createdAt
    ).run();
  } else if (!existing?.name && givenName) {
    await env.DB.prepare("UPDATE users SET name = ? WHERE id = ?")
      .bind(givenName, userId)
      .run();
  }

  const { cookie } = await createSession(env, userId);

  return redirectWithCookies(`${base}/#main`, [cookie, clearStateCookie]);
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
  try { return await request.json(); } catch { return {}; }
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
  try { return JSON.parse(s); } catch { return []; }
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
  if (!origin) return true;
  const url = new URL(request.url);
  return origin === `${url.protocol}//${url.host}`;
}

// ✅ normalize so 0712... matches 254712...
function normalizePhone(v) {
  const digits = String(v || "").replace(/[^\d]/g, "");
  if (!digits) return "";
  if (digits.startsWith("0") && digits.length === 10) return "254" + digits.slice(1);
  if (digits.startsWith("7") && digits.length === 9) return "254" + digits;
  if (digits.startsWith("254") && digits.length === 12) return digits;
  return digits;
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
