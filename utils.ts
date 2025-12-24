// utils.ts - 公共工具函数

import { CONFIG, WS_AES_KEY_HEX } from "./config.ts";
import type { Vec3, ServerMsg, ClientMsg } from "./protocol.ts";

// --- AES-GCM 加密工具 ---

let aesKey: CryptoKey | null = null;

async function getAesKey(): Promise<CryptoKey> {
  if (aesKey) return aesKey;
  const keyBytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    keyBytes[i] = parseInt(WS_AES_KEY_HEX.slice(i * 2, i * 2 + 2), 16);
  }
  aesKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
  return aesKey;
}

export async function aesEncrypt(plaintext: string): Promise<string> {
  const key = await getAesKey();
  const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded
  );
  // 格式: base64(iv + ciphertext)
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return btoa(String.fromCharCode(...combined));
}

export async function aesDecrypt(encrypted: string): Promise<string | null> {
  try {
    const key = await getAesKey();
    const combined = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ciphertext
    );
    return new TextDecoder().decode(decrypted);
  } catch (e) {
    console.error("[Server] AES decrypt failed:", e, "raw:", encrypted.slice(0, 100));
    return null;
  }
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": CONFIG.CORS,
    },
  });
}

export function text(data: string, status = 200): Response {
  return new Response(data, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "access-control-allow-origin": CONFIG.CORS,
    },
  });
}

export function safeParse<T>(s: string): T | null {
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

export function isFiniteVec3(v: any): v is Vec3 {
  return v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

export function norm(v: Vec3): Vec3 {
  const len = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

export function clampName(name: string): string {
  const trimmed = (name ?? "").trim().replace(/\s+/g, " ");
  return (trimmed || "Player").slice(0, CONFIG.MAX_NAME);
}

export function clampChat(textValue: string): string {
  return ((textValue ?? "").trim()).slice(0, CONFIG.MAX_CHAT);
}

export async function wsSend(ws: WebSocket, msg: ServerMsg) {
  const encrypted = await aesEncrypt(JSON.stringify(msg));
  ws.send(encrypted);
}

export async function decodeClientWsMsg(s: string): Promise<ClientMsg | null> {
  const decrypted = await aesDecrypt(s);
  if (!decrypted) return null;
  return safeParse<ClientMsg>(decrypted);
}

// 宽松校验（避免太严格导致兼容问题）
export function isUuidLike(s: string): boolean {
  return typeof s === "string" && s.length >= 8 && s.length <= 64;
}

// --- 向量工具 & 雪球弹道 ---

export function vec3Mul(a: Vec3, s: number): Vec3 {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}

export function vec3Len(a: Vec3): number {
  return Math.hypot(a.x, a.y, a.z);
}

export function vec3Normalize(a: Vec3): Vec3 {
  const L = vec3Len(a) || 1;
  return { x: a.x / L, y: a.y / L, z: a.z / L };
}

export function snowballPosAt(origin: Vec3, v0: Vec3, t: number): Vec3 {
  return {
    x: origin.x + v0.x * t,
    y: origin.y + v0.y * t - 0.5 * CONFIG.GAME.gravity * t * t,
    z: origin.z + v0.z * t,
  };
}

export function intersectsPlayerCylinder(p: Vec3, playerPos: Vec3): boolean {
  const dx = p.x - playerPos.x;
  const dz = p.z - playerPos.z;
  const horizontal = Math.hypot(dx, dz);
  if (horizontal > CONFIG.GAME.hitRadius) return false;

  const yMin = playerPos.y;
  const yMax = playerPos.y + CONFIG.GAME.hitHeight;
  return p.y >= yMin && p.y <= yMax;
}
