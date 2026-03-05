// functions/api/auth/google/[[path]].js
// Google OAuth for BASFAY (Cloudflare Pages Functions + D1)
// Routes:
//   GET /api/auth/google/start
//   GET /api/auth/google/callback

const COOKIE_NAME = "basfay_session";
const STATE_COOKIE = "basfay_google_state";
const SESSION_TTL_DAYS = 30;

export async function onRequest({ request, env, params }) {
  const segs = Array.isArray(params?.path)
    ? params.path
    : (params?.path ? [params.path] : []);
  const action = (segs[0] || "").toLowerCase();

  if (request.method !== "GET") return new Response("Method not allowed", { status: 405 });

  if (action === "start") return start(request, env);
  if (action === "callback") return callback(request, env);

  return new Response("Not found", { status: 404 });
}

function baseUrl(env) {
  return String(env.SITE_BASE_URL || "").replace(/\/+$/g, "");
}

function redirect(url, cookies = []) {
  const headers = new Headers({ Location: url });
  for (const c of cookies) headers.append("Set-Cookie", c);
  return new Response(null, { status: 302, headers });
}

function getCookie(request, name) {
  const cookie = request.headers.get("Cookie") || "";
  const parts = cookie.split(";").map(p => p.trim());
  for (const p of parts) if (p.startsWith(name + "=")) return p.slice(name.length + 1);
  return "";
}

function now() {
  return Math.floor(Date.now() / 1000);
}

function randomB64Url(bytesLen) {
  const bytes = new Uint8Array(bytesLen);
  crypto.getRandomValues(bytes);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256B64(text) {
  const enc = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", enc);
  let s = "";
  for (const b of new Uint8Array(digest)) s += String.fromCharCode(b);
  return btoa(s);
}

async function start(request, env) {
  const base = baseUrl(env);
  if (!base || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return new Response("Google OAuth not configured (missing env vars).", { status: 500 });
  }

  const state = randomB64Url(24);
  const redirectUri = `${base}/api/auth/google/callback`;

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("prompt", "select_account");

  const stateCookie = `${STATE_COOKIE}=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`;
  return redirect(authUrl.toString(), [stateCookie]);
}

async function callback(request, env) {
  const base = baseUrl(env);
  const url = new URL(request.url);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const savedState = getCookie(request, STATE_COOKIE);

  const clearStateCookie = `${STATE_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

  if (!base || !code || !state || !savedState || state !== savedState) {
    return redirect(`${base || ""}/#main`, [clearStateCookie]);
  }

  const redirectUri = `${base}/api/auth/google/callback`;

  // Exchange code for token
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) return redirect(`${base}/#main`, [clearStateCookie]);

  const tokenJson = await tokenRes.json();
  const accessToken = tokenJson.access_token;
  if (!accessToken) return redirect(`${base}/#main`, [clearStateCookie]);

  // Fetch user profile
  const userRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!userRes.ok) return redirect(`${base}/#main`, [clearStateCookie]);

  const userInfo = await userRes.json();
  const email = String(userInfo.email || "").trim().toLowerCase();
  const givenName = String(userInfo.given_name || userInfo.name || "").trim();

  if (!email) return redirect(`${base}/#main`, [clearStateCookie]);

  // Find or create user in your existing users table
  const existing = await env.DB
    .prepare("SELECT id FROM users WHERE email = ?")
    .bind(email)
    .first();

  let userId = existing?.id;

  // users.password_salt / password_hash are NOT NULL in your schema,
  // so for Google accounts we store placeholders.
  // (Password login for these users is not enabled unless you later add "Set password".)
  if (!userId) {
    userId = crypto.randomUUID();
    const createdAt = now();
    const passwordSalt = randomB64Url(18);
    const passwordHash = randomB64Url(36);

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
  }

  // Create session
  const token = randomB64Url(32);
  const tokenHash = await sha256B64(token);

  const createdAt = now();
  const expiresAt = createdAt + SESSION_TTL_DAYS * 24 * 60 * 60;

  await env.DB.prepare(`
    INSERT INTO sessions (id, user_id, created_at, expires_at)
    VALUES (?, ?, ?, ?)
  `).bind(tokenHash, userId, createdAt, expiresAt).run();

  const maxAge = SESSION_TTL_DAYS * 24 * 60 * 60;
  const sessionCookie = `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;

  return redirect(`${base}/#main`, [sessionCookie, clearStateCookie]);
}
