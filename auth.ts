// auth.ts - Linux.do OAuth2 认证

import { CONFIG } from "./config.ts";

// OAuth/JWT 配置（必须通过环境变量提供；禁止硬编码默认值）
const LINUXDO_CLIENT_ID = Deno.env.get("LINUXDO_CLIENT_ID") ?? "";
const LINUXDO_CLIENT_SECRET = Deno.env.get("LINUXDO_CLIENT_SECRET") ?? "";
const LINUXDO_REDIRECT_URI = Deno.env.get("LINUXDO_REDIRECT_URI") ?? "http://localhost:8000/auth/callback";
const JWT_SECRET = Deno.env.get("JWT_SECRET") ?? "";

const AUTHORIZE_URL = "https://connect.linux.do/oauth2/authorize";
// 国内备用端点（默认使用 linuxdo.org，设置 LINUXDO_USE_CN=false 可切换回 linux.do）
const USE_CN_ENDPOINT = Deno.env.get("LINUXDO_USE_CN") !== "false";
const TOKEN_URL = USE_CN_ENDPOINT 
  ? "https://connect.linuxdo.org/oauth2/token"
  : "https://connect.linux.do/oauth2/token";
const USERINFO_URL = USE_CN_ENDPOINT
  ? "https://connect.linuxdo.org/api/user"
  : "https://connect.linux.do/api/user";

const JWT_EXPIRE_HOURS = 24;

// 简单的 state 存储（生产环境应该用 Redis）
const pendingStates = new Map<string, number>();

// 清理过期 state
setInterval(() => {
  const now = Date.now();
  for (const [state, ts] of pendingStates) {
    if (now - ts > 10 * 60 * 1000) pendingStates.delete(state);
  }
}, 60_000);

// Base64URL 编码（支持 UTF-8）
function base64url(data: Uint8Array | string): string {
  let bytes: Uint8Array;
  if (typeof data === "string") {
    bytes = new TextEncoder().encode(data);
  } else {
    bytes = data;
  }
  // 使用 Uint8Array 转 base64，避免 btoa 的 Latin1 限制
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// 生成 JWT
async function createJWT(payload: Record<string, unknown>): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = { ...payload, iat: now, exp: now + JWT_EXPIRE_HOURS * 3600 };

  const headerB64 = base64url(JSON.stringify(header));
  const payloadB64 = base64url(JSON.stringify(fullPayload));
  const data = `${headerB64}.${payloadB64}`;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(JWT_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  const sigB64 = base64url(new Uint8Array(sig));

  return `${data}.${sigB64}`;
}

// 验证 JWT
async function verifyJWT(token: string): Promise<Record<string, unknown> | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, sigB64] = parts;
    const data = `${headerB64}.${payloadB64}`;

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(JWT_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    // 还原 base64url
    const sigStr = sigB64.replace(/-/g, "+").replace(/_/g, "/");
    const sig = Uint8Array.from(atob(sigStr), (c) => c.charCodeAt(0));

    const valid = await crypto.subtle.verify("HMAC", key, sig, new TextEncoder().encode(data));
    if (!valid) return null;

    const payloadStr = payloadB64.replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(payloadStr));

    // 检查过期
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;

    return payload;
  } catch {
    return null;
  }
}

// 从 Cookie 获取用户
export async function getUserFromCookie(req: Request): Promise<Record<string, unknown> | null> {
  const cookie = req.headers.get("cookie") || "";
  const match = cookie.match(/auth_token=([^;]+)/);
  if (!match) return null;
  return await verifyJWT(match[1]);
}

// 检查 OAuth 是否配置
export function isOAuthConfigured(): boolean {
  return !!(LINUXDO_CLIENT_ID && LINUXDO_CLIENT_SECRET);
}

// 处理 /auth/login
export function handleLogin(req: Request): Response {
  if (!isOAuthConfigured()) {
    return new Response("OAuth not configured", { status: 500 });
  }

  const state = crypto.randomUUID();
  pendingStates.set(state, Date.now());

  const params = new URLSearchParams({
    client_id: LINUXDO_CLIENT_ID,
    redirect_uri: LINUXDO_REDIRECT_URI,
    response_type: "code",
    scope: "read",
    state,
  });

  return Response.redirect(`${AUTHORIZE_URL}?${params}`, 302);
}

// 获取基础 URL
function getBaseUrl(req: Request): string {
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

// 处理 /auth/callback
export async function handleCallback(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const baseUrl = getBaseUrl(req);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state || !pendingStates.has(state)) {
    return Response.redirect(`${baseUrl}/?error=invalid_state`, 302);
  }
  pendingStates.delete(state);

  try {
    // 换取 token
    const tokenRes = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: LINUXDO_CLIENT_ID,
        client_secret: LINUXDO_CLIENT_SECRET,
        redirect_uri: LINUXDO_REDIRECT_URI,
        code,
      }),
    });

    if (!tokenRes.ok) {
      console.error("Token exchange failed:", await tokenRes.text());
      return Response.redirect(`${baseUrl}/?error=token_failed`, 302);
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    // 获取用户信息
    const userRes = await fetch(USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!userRes.ok) {
      console.error("User info failed:", await userRes.text());
      return Response.redirect(`${baseUrl}/?error=userinfo_failed`, 302);
    }

    const userInfo = await userRes.json();

    // 生成 JWT
    const jwt = await createJWT({
      sub: userInfo.username,
      id: userInfo.id,
      name: userInfo.name || userInfo.username,
      trust_level: userInfo.trust_level || 0,
    });

    // 设置 Cookie 并重定向
    const headers = new Headers();
    headers.set(
      "Set-Cookie",
      `auth_token=${jwt}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${JWT_EXPIRE_HOURS * 3600}`
    );
    headers.set("Location", `${baseUrl}/`);

    return new Response(null, { status: 302, headers });
  } catch (e) {
    console.error("OAuth callback error:", e);
    return Response.redirect(`${baseUrl}/?error=callback_failed`, 302);
  }
}

// 处理 /auth/logout
export function handleLogout(req: Request): Response {
  const baseUrl = getBaseUrl(req);
  const headers = new Headers();
  headers.set("Set-Cookie", "auth_token=; Path=/; HttpOnly; Max-Age=0");
  headers.set("Location", `${baseUrl}/`);
  return new Response(null, { status: 302, headers });
}

// 处理 /auth/me
export async function handleMe(req: Request): Promise<Response> {
  const user = await getUserFromCookie(req);
  if (!user) {
    return new Response(JSON.stringify({ authenticated: false }), {
      headers: { "Content-Type": "application/json" },
    });
  }
  return new Response(JSON.stringify({ authenticated: true, user }), {
    headers: { "Content-Type": "application/json" },
  });
}

// 处理 /auth/dev-login - 秘密接口，用于开发/测试环境快速登录
export async function handleDevLogin(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const baseUrl = getBaseUrl(req);
  const secret = url.searchParams.get("secret");
  
  // 验证秘密参数
  if (secret !== LINUXDO_CLIENT_SECRET) {
    return new Response("Forbidden", { status: 403 });
  }
  
  // 生成随机用户名
  const randomId = crypto.randomUUID().slice(0, 8);
  const randomNames = [
    "SnowWarrior", "IceKnight", "FrostMage", "WinterHero", "ChillMaster",
    "SnowNinja", "IceWizard", "FrostGuard", "WinterStar", "ColdFighter",
    "SnowHunter", "IceDragon", "FrostLord", "WinterKing", "ChillHero"
  ];
  const randomName = randomNames[Math.floor(Math.random() * randomNames.length)] + randomId;
  
  // 生成 JWT（模拟 OAuth 用户）
  const jwt = await createJWT({
    sub: randomName,
    id: `dev_${randomId}`,
    name: randomName,
    trust_level: 1,
    dev_account: true, // 标记为开发账号
  });
  
  // 设置 Cookie 并重定向
  const headers = new Headers();
  headers.set(
    "Set-Cookie",
    `auth_token=${jwt}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${JWT_EXPIRE_HOURS * 3600}`
  );
  headers.set("Location", `${baseUrl}/`);
  
  return new Response(null, { status: 302, headers });
}
