// AES-GCM 加密密钥（服务端注入）
const WS_AES_KEY_HEX = "__WS_AES_KEY__";

// AES-GCM 加密工具
let aesKey = null;

async function getAesKey() {
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

async function aesEncrypt(plaintext) {
  const key = await getAesKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded
  );
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return btoa(String.fromCharCode(...combined));
}

async function aesDecrypt(encrypted) {
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
    console.error("[Client] AES decrypt failed:", e, "raw:", encrypted.slice(0, 100));
    return null;
  }
}

// 简单 randomUUID 兼容实现：优先使用原生，其次使用 getRandomValues，最后退回 Math.random
function randomId() {
  const g = (typeof crypto !== "undefined") ? crypto : (typeof window !== "undefined" ? (window.crypto || window.msCrypto) : null);
  if (g && typeof g.randomUUID === "function") {
    return g.randomUUID();
  }
  if (g && typeof g.getRandomValues === "function") {
    const buf = new Uint8Array(16);
    g.getRandomValues(buf);
    buf[6] = (buf[6] & 0x0f) | 0x40;
    buf[8] = (buf[8] & 0x3f) | 0x80;
    const hex = Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
    return (
      hex.slice(0, 8) + "-" +
      hex.slice(8, 12) + "-" +
      hex.slice(12, 16) + "-" +
      hex.slice(16, 20) + "-" +
      hex.slice(20)
    );
  }
  return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function appendChatLog(line) {
  const log = document.getElementById("chat-log");
  if (!log) return;
  const item = document.createElement("div");
  item.textContent = line;
  log.appendChild(item);
  // 只保留最近 50 条
  while (log.childNodes.length > 50) {
    log.removeChild(log.firstChild);
  }
  log.scrollTop = log.scrollHeight;
  // 30 秒后自动移除这条消息
  setTimeout(() => {
    if (item.parentNode === log) {
      log.removeChild(item);
    }
  }, 30000);
}

// 简单字符串哈希，用于把名字映射到稳定的颜色
function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

// 马卡龙色系调色板（柔和的粉色/蓝色/绿色等）
const PASTEL_COLORS = [
  0xFFB3BA, // 粉红
  0xFFDFBA, // 桃色
  0xFFFFBA, // 淡黄
  0xBAFFC9, // 薄荷绿
  0xBAE1FF, // 婴儿蓝
  0xE0BBE4, // 薰衣草紫
  0xFFD6E0, // 淡玫瑰
  0xCFFAFE, // 浅青
];

function pickPastelPair(key) {
  const h = hashString(key || "");
  const main = PASTEL_COLORS[h % PASTEL_COLORS.length];
  let pants = PASTEL_COLORS[(h >> 3) % PASTEL_COLORS.length];
  if (pants === main) {
    pants = PASTEL_COLORS[(h >> 5) % PASTEL_COLORS.length];
  }
  return { shirt: main, pants };
}

// 简单种子随机数（mulberry32）
function makeRng(seed) {
  let s = seed >>> 0;
  return function() {
    s |= 0;
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 地形高度函数：基于世界种子 + 三角函数叠加，制造起伏较大的地形
function terrainHeight(x, z) {
  const scale1 = 0.06;
  const scale2 = 0.12;
  const s = worldSeed * 0.0001;
  const n1 = Math.sin(x * scale1 + s * 13.37) + Math.cos(z * scale1 - s * 7.21);
  const n2 = Math.sin((x + 1000) * scale2 - s * 3.17) - Math.cos((z - 500) * scale2 + s * 9.99);
  let h = n1 * 0.7 + n2 * 0.3;
  // 增加陡峭程度，并整体抬高到 > 0（避免服务端 y<0 时的隐形地板问题）
  const sign = h >= 0 ? 1 : -1;
  h = sign * Math.pow(Math.abs(h), 1.8) * 2.5; // 原始约 [-5, 5]
  return h + 6; // 整体抬升，保证最低高度 > 0
}

// 计算给定 XZ 下的"地面高度"，仅基于程序化地形。
// Kenney 静态模型不再影响玩家的地面高度（玩家不再与它们发生碰撞），
// 但仍然用于雪球碰撞。
function groundHeightWithObstacles(x, z) {
  return terrainHeight(x, z);
}

const CONFIG = {
  gravity: 22,
  moveSpeed: 8,
  crouchSpeed: 3,
  jumpForce: 9.5,
  snowballSpeed: 28,
  snowballCooldown: 250,
  netSendHz: 20,
  remoteLerp: 12,
  lookSensitivity: 0.002,
  minPitch: -1.5, maxPitch: 1.5,
  mapHalf: 95,
};

let scene, camera, renderer, clock;
let localPlayer = null;
let localPlayerId = null;

const players = [];
const playersById = new Map();
const snowballsById = new Map();
let snowballs = [];

// 静态场景碰撞体（Kenney 模型的包围盒），仅在客户端用于简单碰撞
const STATIC_OBSTACLES = [];

let networkManager;
let cameraYaw = 0;
let cameraPitch = 0;
let cameraMode = "third"; // "third" or "first" person view
let uiHidden = false;     // 是否隐藏左侧聊天和右侧按键提示

let isPointerLocked = false;

// 世界种子与环境
let worldSeed = 1;
let snowSystem = null;
let environmentReady = false;

function setDeadUI(on) {
  document.getElementById("dead-overlay").style.display = on ? "flex" : "none";
}

function setHpUI(hp) {
  const pct = Math.max(0, Math.min(100, hp));
  document.getElementById("hp-bar-fill").style.width = pct + "%";
  const hearts = Math.ceil(hp / 20);
  document.getElementById("hp-text").textContent = "❤".repeat(Math.max(0, hearts));
}

// 玩家不再与 Kenney 静态障碍物发生碰撞（只保留地形 + 雪球 vs 障碍物碰撞）。
function resolvePlayerStaticCollisions(pos) {
  // no-op：玩家只与地形碰撞，不再与 Kenney 模型发生碰撞。
  return;
}

// WS 消息使用 AES-GCM 加密
async function wsEncode(obj) {
  return await aesEncrypt(JSON.stringify(obj));
}

async function wsDecode(str) {
  try {
    const decrypted = await aesDecrypt(str);
    if (!decrypted) return null;
    return JSON.parse(decrypted);
  } catch {
    return null;
  }
}
