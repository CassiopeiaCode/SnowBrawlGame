// main.ts — Deno Deploy 单文件：全服同房间 + 雪球服务端命中判定 + 发射去重修复
// GET  /       -> 客户端（Three.js 联机版）
// WS   /ws     -> WebSocket
// GET  /health -> health

//////////////////////////////
// SECTION 0: Config
//////////////////////////////

const CONFIG = {
  WORLD: "global",
  CORS: "*",
  RATE: { windowMs: 10_000, maxMsgs: 1200 },
  STATE_HZ: 12,
  MAX_NAME: 20,
  MAX_CHAT: 80,
  CLEANUP_IDLE_MS: 60_000,
  CLEANUP_SCAN_MS: 10_000,

  GAME: {
    gravity: 20,
    snowballSpeed: 25,
    snowballLifeSec: 3,
    snowballSimSteps: 60, // 命中判定离散步数
    hitRadius: 0.6, // 近似圆柱半径
    hitHeight: 1.8, // 近似人体高度
    knockbackForce: 26,
    knockUp: 1.2,
    damage: 10,  
    respawnMs: 3000,

  },
} as const;

const TTL = {
  PLAYER_MS: 60_000,        // 玩家快照：只要玩家还在动/发包就不断续命
  GONE_MS: 5 * 60_000,      // 离线标记：用于 cron/兜底
  EVENT_MS: 2 * 60_000,     // 事件日志：只保留最近 2 分钟（你也可以 10 分钟）
} as const;


//////////////////////////////
// SECTION 1: Types
//////////////////////////////

type Vec3 = { x: number; y: number; z: number };

type ClientHello = { t: "hello"; name: string };
type ClientChat = { t: "chat"; text: string };
type ClientState = { t: "state"; pos: Vec3; rotY: number; vel?: Vec3; crouch?: boolean; ts?: number };
// ✅ 新增：snowball 带 id（shotId）用于去重
type ClientSnowball = { t: "snowball"; id: string; dir: Vec3; ts?: number };
type ClientPing = { t: "ping"; now?: number };
type ClientRename = { t: "rename"; name: string };
type ClientMsg = ClientHello | ClientChat | ClientState | ClientSnowball | ClientPing | ClientRename;

type PlayerSnapshot = {
  id: string;
  name: string;
  pos: Vec3;
  rotY: number;
  vel: Vec3;
  hp: number;
  crouch: boolean;          // ✅ 新增：下蹲同步
  deadUntil?: number;       // ✅ 新增：死亡到什么时候
  updatedAt: number;
};

type WorldEvent =
  | { t: "join"; seq: number; at: number; player: PlayerSnapshot }
  | { t: "leave"; seq: number; at: number; playerId: string; name: string }
  | { t: "chat"; seq: number; at: number; playerId: string; name: string; text: string }
  | { t: "state"; seq: number; at: number; playerId: string; pos: Vec3; rotY: number; vel: Vec3; crouch: boolean }
  | {
      t: "snowball";
      seq: number;
      at: number;
      id: string; // shotId
      ownerId: string;
      origin: Vec3;
      dir: Vec3;
      speed: number;
    }
  // ✅ 新增：服务端命中事件
  | {
      t: "hit";
      seq: number;
      at: number;
      attackerId: string;
      victimId: string;
      impulse: Vec3;
      victimHp: number;
      shotId: string;
    } 
  | { t: "rename"; seq: number; at: number; playerId: string; name: string }
  | {
      t: "death";
      seq: number;
      at: number;
      victimId: string;
      attackerId: string;
      shotId: string;
      respawnAt: number;
    }
  | {
      t: "respawn";
      seq: number;
      at: number;
      playerId: string;
      pos: Vec3;
      hp: number;
    }; 


type ServerMsg =
  | { t: "welcome"; id: string; world: string; now: number }
  | { t: "snapshot"; world: string; players: PlayerSnapshot[]; latestSeq: number }
  | { t: "event"; ev: WorldEvent }
  | { t: "pong"; now: number }
  | { t: "error"; message: string };

//////////////////////////////
// SECTION 2: Utils
//////////////////////////////

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": CONFIG.CORS,
    },
  });
}

function text(data: string, status = 200): Response {
  return new Response(data, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "access-control-allow-origin": CONFIG.CORS,
    },
  });
}

function safeParse<T>(s: string): T | null {
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

function isFiniteVec3(v: any): v is Vec3 {
  return v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

function norm(v: Vec3): Vec3 {
  const len = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

function clampName(name: string): string {
  const trimmed = (name ?? "").trim().replace(/\s+/g, " ");
  return (trimmed || "Player").slice(0, CONFIG.MAX_NAME);
}

function clampChat(text: string): string {
  return ((text ?? "").trim()).slice(0, CONFIG.MAX_CHAT);
}

function wsSend(ws: WebSocket, msg: ServerMsg) {
  ws.send(JSON.stringify(msg));
}

function isUuidLike(s: string): boolean {
  // 宽松校验（避免太严格导致兼容问题）
  return typeof s === "string" && s.length >= 8 && s.length <= 64;
}
//////////////////////////////
// SECTION 3: In-Memory Store (NO KV)
//////////////////////////////

// ✅ 事件序号（本 isolate 内自增）
let latestSeq = 0;
// ✅ 你原代码里用 lastSeenSeq 给 snapshot，这里继续保留并同步
let lastSeenSeq = 0;

// ✅ 事件日志（内存滑窗）
const events: WorldEvent[] = [];

function pruneEvents(now = Date.now()) {
  const cutoff = now - TTL.EVENT_MS;
  while (events.length && (events[0].at ?? 0) < cutoff) {
    events.shift();
  }
}

// 把事件应用到 playersCache，保持 cache 与事件一致
function applyEventToCache(ev: WorldEvent) {
  if (ev.t === "join") {
    playersCache.set(ev.player.id, ev.player);
    return;
  }
  if (ev.t === "leave") {
    playersCache.delete(ev.playerId);
    return;
  }
  if (ev.t === "state") {
    const prev = playersCache.get(ev.playerId);
    if (!prev) return;
    playersCache.set(ev.playerId, {
      ...prev,
      pos: ev.pos,
      rotY: ev.rotY,
      vel: ev.vel,
      crouch: ev.crouch,
      updatedAt: ev.at ?? Date.now(),
    });
    return;
  }
  if (ev.t === "rename") {
    const prev = playersCache.get(ev.playerId);
    if (!prev) return;
    playersCache.set(ev.playerId, { ...prev, name: ev.name, updatedAt: ev.at ?? Date.now() });
    return;
  }
  if (ev.t === "respawn") {
    const prev = playersCache.get(ev.playerId);
    if (!prev) return;
    playersCache.set(ev.playerId, {
      ...prev,
      pos: ev.pos,
      hp: ev.hp ?? 100,
      deadUntil: 0,
      updatedAt: ev.at ?? Date.now(),
    });
    return;
  }
  if (ev.t === "hit") {
    const prev = playersCache.get(ev.victimId);
    if (!prev) return;
    playersCache.set(ev.victimId, { ...prev, hp: ev.victimHp, updatedAt: ev.at ?? Date.now() });
    return;
  }
  if (ev.t === "death") {
    const prev = playersCache.get(ev.victimId);
    if (!prev) return;
    playersCache.set(ev.victimId, {
      ...prev,
      hp: 0,
      deadUntil: ev.respawnAt,
      updatedAt: ev.at ?? Date.now(),
    });
    return;
  }
}

// ✅ 内存 appendEvent：生成 seq/at、写 events、应用到 cache、并广播
async function appendEventInMem(ev: Omit<WorldEvent, "seq" | "at">): Promise<WorldEvent> {
  const full = { ...(ev as any), seq: ++latestSeq, at: Date.now() } as WorldEvent;

  lastSeenSeq = latestSeq;
  events.push(full);
  pruneEvents(full.at);

  applyEventToCache(full);

  // 注意：broadcast 函数在 SECTION 4 定义，这里调用时运行期已存在
  broadcast({ t: "event", ev: full });

  return full;
}

//////////////////////////////
// SECTION 4: Local Hub (Pure Memory)
//////////////////////////////

// ✅ 本 isolate 内权威玩家表（纯内存）
const playersCache = new Map<string, PlayerSnapshot>();

type WSClient = {
  id: string;
  name: string;
  ws: WebSocket;
  connectedAt: number;
  bucketStart: number;
  bucketCount: number;
  lastStateAt: number;
};

const clients = new Map<string, WSClient>();

function broadcast(msg: ServerMsg) {
  const data = JSON.stringify(msg);
  for (const c of clients.values()) {
    try {
      c.ws.send(data);
    } catch {
      // ignore
    }
  }
}

// ✅ 可选：内存玩家清理（防异常断线导致的“幽灵玩家”）
// 如果你不想要，可删掉这段 interval
setInterval(() => {
  const now = Date.now();
  for (const [id, snap] of playersCache.entries()) {
    if (clients.has(id)) continue; // 在线永不清
    const age = now - (snap.updatedAt ?? 0);
    if (age > CONFIG.CLEANUP_IDLE_MS) {
      playersCache.delete(id);
    }
  }
}, CONFIG.CLEANUP_SCAN_MS);

//////////////////////////////
// SECTION 5: Cross-isolate Fanout (REMOVED)
// 纯内存版：不 watch，不跨 isolate 同步。
// 如果部署在 Deno Deploy，多 isolate 时会变成多个房间。
//////////////////////////////

//////////////////////////////
// SECTION 7: Server Game Logic (Pure Memory)
//////////////////////////////

// ✅ 状态合并：只保留每个玩家“最新一份”状态，定时批量广播（可丢帧）
const pendingStates = new Map<
  string,
  { id: string; pos: Vec3; rotY: number; vel: Vec3; crouch: boolean; updatedAt: number }
>();

async function serverOnHello(name: string): Promise<PlayerSnapshot> {
  const now = Date.now();
  const spawn: Vec3 = {
    x: (Math.random() - 0.5) * 40,
    y: 0,
    z: (Math.random() - 0.5) * 40,
  };

  return {
    id: crypto.randomUUID(),
    name: clampName(name),
    pos: spawn,
    rotY: 0,
    vel: { x: 0, y: 0, z: 0 },
    hp: 100,
    crouch: false,
    deadUntil: 0,
    updatedAt: now,
  };
}

async function serverHandleRename(client: WSClient, name: string) {
  const newName = clampName(name);
  if (!newName) return;

  client.name = newName;

  const prev = playersCache.get(client.id);
  if (prev) {
    const next = { ...prev, name: newName, updatedAt: Date.now() };
    playersCache.set(client.id, next);
  }

  await appendEventInMem({ t: "rename", playerId: client.id, name: newName });
}

async function serverHandleChat(client: WSClient, msg: ClientChat) {
  const text = clampChat(msg.text);
  if (!text) return;
  await appendEventInMem({ t: "chat", playerId: client.id, name: client.name, text });
}

async function serverHandleState(client: WSClient, msg: ClientState) {
  if (!isFiniteVec3(msg.pos) || !Number.isFinite(msg.rotY)) return;

  const vel = isFiniteVec3(msg.vel) ? msg.vel : { x: 0, y: 0, z: 0 };
  const crouch = !!msg.crouch;

  if (Math.abs(msg.pos.x) > 5000 || Math.abs(msg.pos.y) > 5000 || Math.abs(msg.pos.z) > 5000) return;

  const now = Date.now();
  const prev = playersCache.get(client.id);

  // ✅ 1) 死亡冻结
  if (prev && (prev.hp ?? 100) <= 0 && (prev.deadUntil ?? 0) > now) return;

  // ✅ 2) 到点复活（下一次 state 触发）
  if (prev && (prev.hp ?? 100) <= 0 && (prev.deadUntil ?? 0) <= now) {
    const spawn: Vec3 = {
      x: (Math.random() - 0.5) * 40,
      y: 0,
      z: (Math.random() - 0.5) * 40,
    };

    const revived: PlayerSnapshot = {
      ...prev,
      pos: spawn,
      rotY: msg.rotY,
      vel: { x: 0, y: 0, z: 0 },
      hp: 100,
      crouch: false,
      deadUntil: 0,
      updatedAt: now,
    };

    playersCache.set(client.id, revived);

    await appendEventInMem({ t: "respawn", playerId: client.id, pos: spawn, hp: 100 });

    // ✅ 立刻把复活后的状态塞进“合并状态流”
    pendingStates.set(client.id, {
      id: client.id,
      pos: revived.pos,
      rotY: revived.rotY,
      vel: revived.vel,
      crouch: revived.crouch,
      updatedAt: revived.updatedAt,
    });

    return;
  }

  const next: PlayerSnapshot = {
    id: client.id,
    name: client.name,
    pos: msg.pos,
    rotY: msg.rotY,
    vel,
    hp: prev?.hp ?? 100,
    crouch,
    deadUntil: prev?.deadUntil ?? 0,
    updatedAt: now,
  };

  // ✅ 写 cache
  playersCache.set(client.id, next);

  // ✅ 合并状态流（批量发）
  pendingStates.set(client.id, {
    id: client.id,
    pos: next.pos,
    rotY: next.rotY,
    vel: next.vel,
    crouch: next.crouch,
    updatedAt: next.updatedAt,
  });
}

// --- 服务端雪球命中判定（核心） ---
function vec3Mul(a: Vec3, s: number): Vec3 {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}
function vec3Len(a: Vec3): number {
  return Math.hypot(a.x, a.y, a.z);
}
function vec3Normalize(a: Vec3): Vec3 {
  const L = vec3Len(a) || 1;
  return { x: a.x / L, y: a.y / L, z: a.z / L };
}

function snowballPosAt(origin: Vec3, v0: Vec3, t: number): Vec3 {
  return {
    x: origin.x + v0.x * t,
    y: origin.y + v0.y * t - 0.5 * CONFIG.GAME.gravity * t * t,
    z: origin.z + v0.z * t,
  };
}

function intersectsPlayerCylinder(p: Vec3, playerPos: Vec3): boolean {
  const dx = p.x - playerPos.x;
  const dz = p.z - playerPos.z;
  const horizontal = Math.hypot(dx, dz);
  if (horizontal > CONFIG.GAME.hitRadius) return false;

  const yMin = playerPos.y;
  const yMax = playerPos.y + CONFIG.GAME.hitHeight;
  return p.y >= yMin && p.y <= yMax;
}

// ✅ shotId 去重（避免网络重发导致重复命中/重复扣血）
const seenShots = new Map<string, number>(); // shotId -> expireAt
const SHOT_DEDUP_MS = 10_000;

function seenShotBefore(shotId: string): boolean {
  const now = Date.now();
  const exp = seenShots.get(shotId);
  if (exp && exp > now) return true;
  seenShots.set(shotId, now + SHOT_DEDUP_MS);
  return false;
}

setInterval(() => {
  const now = Date.now();
  for (const [id, exp] of seenShots.entries()) {
    if (exp <= now) seenShots.delete(id);
  }
}, 2000);

async function serverHandleSnowball(client: WSClient, msg: ClientSnowball) {
  if (!isFiniteVec3(msg.dir)) return;

  const shotId = isUuidLike(msg.id) ? msg.id : crypto.randomUUID();
  if (seenShotBefore(shotId)) return;

  // ✅ origin 从 cache 取
  const snap = playersCache.get(client.id);
  if (!snap) return;

  const dir = norm(msg.dir);
  const origin: Vec3 = { x: snap.pos.x, y: snap.pos.y + 1.3, z: snap.pos.z };

  await appendEventInMem({
    t: "snowball",
    id: shotId,
    ownerId: client.id,
    origin,
    dir,
    speed: CONFIG.GAME.snowballSpeed,
  });

  // ✅ 命中判定用 cache
  const players = Array.from(playersCache.values());

  const v0 = vec3Mul(dir, CONFIG.GAME.snowballSpeed);
  const T = CONFIG.GAME.snowballLifeSec;
  const steps = CONFIG.GAME.snowballSimSteps;
  const dt = T / steps;

  let best: { victim: PlayerSnapshot; t: number } | null = null;

  for (const p of players) {
    if (p.id === client.id) continue;
    if ((p.hp ?? 100) <= 0 && (p.deadUntil ?? 0) > Date.now()) continue;

    for (let i = 0; i <= steps; i++) {
      const t = i * dt;
      const pos = snowballPosAt(origin, v0, t);
      if (pos.y < 0) break;
      if (intersectsPlayerCylinder(pos, p.pos)) {
        if (!best || t < best.t) best = { victim: p, t };
        break;
      }
    }
  }

  if (!best) return;

  const victim = best.victim;

  const finalImpulse = vec3Mul(
    vec3Normalize({ x: v0.x, y: CONFIG.GAME.knockUp, z: v0.z }),
    CONFIG.GAME.knockbackForce,
  );

  const now = Date.now();
  const respawnAt = now + CONFIG.GAME.respawnMs;
  const newHp = Math.max(0, (victim.hp ?? 100) - CONFIG.GAME.damage);

  const updatedVictim: PlayerSnapshot = {
    ...victim,
    hp: newHp,
    deadUntil: newHp === 0 ? respawnAt : (victim.deadUntil ?? 0),
    updatedAt: now,
  };
  playersCache.set(victim.id, updatedVictim);

  await appendEventInMem({
    t: "hit",
    attackerId: client.id,
    victimId: victim.id,
    impulse: finalImpulse,
    victimHp: newHp,
    shotId,
  });

  if (newHp === 0) {
    await appendEventInMem({
      t: "death",
      victimId: victim.id,
      attackerId: client.id,
      shotId,
      respawnAt,
    });
  }
}

//////////////////////////////
// SECTION 8: WS Gateway (Pure Memory)
//////////////////////////////

// ✅ backpressure：慢客户端丢“状态/快照帧”，不要让它排队
const DROP_BUFFER_BYTES = 256_000; // 256KB，可按需调大/调小

function broadcastImportant(msg: ServerMsg) {
  const data = JSON.stringify(msg);
  for (const c of clients.values()) {
    try {
      c.ws.send(data);
    } catch {
      // ignore
    }
  }
}

// 仅用于“可丢弃的大流量消息”：snapshot / states
function broadcastDroppable(msg: any) {
  const data = JSON.stringify(msg);
  for (const c of clients.values()) {
    try {
      if ((c.ws as any).bufferedAmount != null && (c.ws as any).bufferedAmount > DROP_BUFFER_BYTES) continue;
      c.ws.send(data);
    } catch {
      // ignore
    }
  }
}

function rateLimitOk(c: WSClient, now: number): boolean {
  if (now - c.bucketStart > CONFIG.RATE.windowMs) {
    c.bucketStart = now;
    c.bucketCount = 0;
  }
  c.bucketCount++;
  return c.bucketCount <= CONFIG.RATE.maxMsgs;
}

// ✅ 放宽一点，避免“卡边界抖动”导致丢太多 state
function stateFreqOk(c: WSClient, now: number): boolean {
  const minInterval = 1000 / CONFIG.STATE_HZ;
  if (now - c.lastStateAt < minInterval * 0.75) return false;
  c.lastStateAt = now;
  return true;
}

// ✅ 低频 snapshot：兜底纠偏
const STATE_SYNC_HZ = 2;
let stateSyncStarted = false;

function startStateSyncOnce() {
  if (stateSyncStarted) return;
  stateSyncStarted = true;

  (async () => {
    const intervalMs = Math.floor(1000 / STATE_SYNC_HZ);

    for (;;) {
      await new Promise((r) => setTimeout(r, intervalMs));
      if (clients.size === 0) continue;

      try {
        const players = Array.from(playersCache.values());
        broadcastDroppable({ t: "snapshot", world: CONFIG.WORLD, players, latestSeq: lastSeenSeq });
      } catch {
        // ignore
      }
    }
  })();
}

// ✅ 高频合并状态：20Hz，把所有玩家“最新状态”合成 1 个包发出去
const STATE_TICK_HZ = 20;
let stateTickStarted = false;

function startStateTickOnce() {
  if (stateTickStarted) return;
  stateTickStarted = true;

  (async () => {
    const intervalMs = Math.floor(1000 / STATE_TICK_HZ);

    for (;;) {
      await new Promise((r) => setTimeout(r, intervalMs));
      if (clients.size === 0) continue;
      if (pendingStates.size === 0) continue;

      const list = Array.from(pendingStates.values());
      pendingStates.clear();

      broadcastDroppable({ t: "states", at: Date.now(), list });
    }
  })();
}

async function handleWs(req: Request): Promise<Response> {
  const { socket, response } = Deno.upgradeWebSocket(req);

  // ✅ 纯内存：不 startWatch / 不 flush / 不 reconcile
  startStateSyncOnce();
  startStateTickOnce();

  let client: WSClient | null = null;

  const helloTimer = setTimeout(() => {
    try {
      socket.close(4000, "hello timeout");
    } catch {
      // ignore
    }
  }, 5000);

  socket.onmessage = async (evt) => {
    if (typeof evt.data !== "string") return;
    const msg = safeParse<ClientMsg>(evt.data);
    if (!msg) return;

    const now = Date.now();

    if (!client) {
      if (msg.t !== "hello") return;

      clearTimeout(helloTimer);

      const snap = await serverOnHello(msg.name);

      client = {
        id: snap.id,
        name: snap.name,
        ws: socket,
        connectedAt: now,
        bucketStart: now,
        bucketCount: 0,
        lastStateAt: 0,
      };

      clients.set(client.id, client);

      // ✅ 先写 cache
      playersCache.set(snap.id, snap);

      // ✅ join 事件（会广播、也会 applyEventToCache，但 apply 会覆盖同一份无害）
      await appendEventInMem({ t: "join", player: snap });

      wsSend(socket, { t: "welcome", id: client.id, world: CONFIG.WORLD, now });

      // ✅ hello 后给一份 snapshot（纯内存不再 load KV 权威集合）
      wsSend(socket, {
        t: "snapshot",
        world: CONFIG.WORLD,
        players: Array.from(playersCache.values()),
        latestSeq: lastSeenSeq,
      });

      return;
    }

    if (!rateLimitOk(client, now)) {
      wsSend(client.ws, { t: "error", message: "rate limited" });
      try {
        client.ws.close(4008, "rate limited");
      } catch {}
      return;
    }

    switch (msg.t) {
      case "ping":
        wsSend(client.ws, { t: "pong", now: Date.now() });
        return;

      case "chat":
        await serverHandleChat(client, msg);
        return;

      case "state":
        if (!stateFreqOk(client, now)) return;
        await serverHandleState(client, msg);
        return;

      case "snowball":
        await serverHandleSnowball(client, msg);
        return;

      case "hello":
        return;

      case "rename":
        await serverHandleRename(client, msg.name);
        return;
    }
  };

  socket.onclose = async () => {
    clearTimeout(helloTimer);
    if (!client) return;

    clients.delete(client.id);

    // leave 事件会广播，并从 cache 中删除
    await appendEventInMem({ t: "leave", playerId: client.id, name: client.name });
  };

  socket.onerror = () => {
    // ignore
  };

  return response;
}


//////////////////////////////
// SECTION 9: Client App
//////////////////////////////
const CLIENT_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>MC圣诞雪球大乱斗</title>
  <style>
    body { margin: 0; overflow: hidden; background-color: #D6EAF8; font-family: 'Courier New', Courier, monospace; user-select: none; }
    
    #canvas-container { width: 100vw; height: 100vh; display: block; }

    #ui-layer {
      position: absolute; top: 0; left: 0; width: 100%; height: 100%;
      pointer-events: none; display: flex; flex-direction: column; justify-content: space-between;
    }

    /* MC 风格 UI */
    #chat-container {
      pointer-events: auto;
      background: rgba(0, 0, 0, 0.6);
      padding: 10px; margin: 20px; border: 2px solid #aaa;
      width: 340px; display: flex; flex-direction: column;
      image-rendering: pixelated;
    }

    input[type="text"] {
      width: 100%; padding: 8px; border: 2px solid #555;
      margin-top: 5px; box-sizing: border-box;
      background: #333; color: white; outline: none; font-family: inherit; font-weight: bold;
    }
    input[type="text"]:focus { border-color: #fff; background: #000; }

    #controls-hint {
      position: absolute; top: 20px; right: 20px;
      background: rgba(0,0,0,0.6); color: #eee;
      padding: 15px; border: 2px solid #aaa; text-align: right; pointer-events: none;
      line-height: 1.6; font-size: 14px; font-weight: bold;
    }

    .key {
      background: #bbb; color: #222; box-shadow: 0 2px 0 #555;
      padding: 2px 6px; border-radius: 2px; font-weight: bold;
      margin: 0 2px; display: inline-block;
    }

    #crosshair {
      position: absolute; top: 50%; left: 50%; width: 18px; height: 18px; pointer-events: none;
      transform: translate(-50%, -50%);
    }
    #crosshair::before, #crosshair::after {
      content: ''; position: absolute; background: rgba(255,255,255,0.9); mix-blend-mode: difference;
    }
    #crosshair::before { top: 8px; left: 0; width: 18px; height: 2px; }
    #crosshair::after { left: 8px; top: 0; width: 2px; height: 18px; }

    #net-status { margin-top: 5px; font-size: 14px; color: #FFFF55; text-shadow: 2px 2px 0 #000; }

    #hp-bar-bg { margin-top: 5px; width: 100%; height: 12px; background: #333; border: 2px solid #000; }
    #hp-bar-fill { width: 100%; height: 100%; background: #ff3333; image-rendering: pixelated; }
    #hp-text { font-size: 14px; color: white; margin-top: 2px; text-shadow: 2px 2px 0 #000; text-align: center; }
    
    #click-to-play {
        position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
        color: #fff; font-size: 24px; font-weight: bold; text-shadow: 3px 3px 0 #000;
        background: rgba(0,0,0,0.5); padding: 20px; border: 4px solid #fff;
        pointer-events: none; text-align: center;
    }
  </style>
</head>
<body>

<div id="dead-overlay" style="
  position:fixed; inset:0; display:none; align-items:center; justify-content:center;
  background:rgba(150,0,0,0.6); color:white; font-size:48px; font-weight:bold; z-index:9999;
  text-shadow:4px 4px 0 #000; flex-direction: column;
">
  <div>你死了!</div>
  <div style="font-size: 24px; margin-top: 10px;">重生倒计时...</div>
</div>

  <div id="canvas-container"></div>
  <div id="crosshair"></div>
  <div id="click-to-play">点击屏幕<br>加入雪球大战</div>

  <div id="ui-layer">
    <div id="chat-container">
      <div style="color: #55FF55; font-weight:bold; font-size: 16px; margin-bottom: 4px; text-shadow: 2px 2px 0 #000;">🎄 MC 圣诞服</div>
      <input type="text" id="name-input" placeholder="输入昵称" maxlength="12" />
      <input type="text" id="chat-input" placeholder="按 T 或回车聊天" maxlength="80" />
      <div id="net-status">🔴 未连接</div>
      <div id="hp-bar-bg"><div id="hp-bar-fill"></div></div>
      <div id="hp-text">❤❤❤❤❤</div>
    </div>

    <div id="controls-hint">
      <p><span class="key">W</span><span class="key">A</span><span class="key">S</span><span class="key">D</span> 移动</p>
      <p><span class="key">SHIFT</span> 潜行</p>
      <p><span class="key">SPACE</span> 跳跃</p>
      <p><span class="key">左键</span> 丢雪球</p>
      <p><span class="key">R</span>旋转嘲讽</p>
      <p>ESC 释放鼠标</p>
    </div>
  </div>

  <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>

  <script>
    const CONFIG = {
      gravity: 22,
      moveSpeed: 8,       
      crouchSpeed: 3,  
      jumpForce: 9.5,
      snowballSpeed: 28,
      snowballCooldown: 250, 
      netSendHz: 12,
      remoteLerp: 12,
      lookSensitivity: 0.002,
      minPitch: -1.5, maxPitch: 1.5, 
    };

    let scene, camera, renderer, clock;
    let localPlayer = null;
    let localPlayerId = null;

    const players = [];
    const playersById = new Map();
    const snowballsById = new Map();
    let snowballs = [];

    let networkManager;
    let cameraYaw = 0;
    let cameraPitch = 0;

    let isPointerLocked = false;

    function setDeadUI(on) {
      document.getElementById("dead-overlay").style.display = on ? "flex" : "none";
    }
    function setHpUI(hp) {
      const pct = Math.max(0, Math.min(100, hp));
      document.getElementById("hp-bar-fill").style.width = pct + "%";
      const hearts = Math.ceil(hp / 20); 
      document.getElementById("hp-text").textContent = "❤".repeat(Math.max(0, hearts));
    }

    class NetworkManager {
      constructor() {
        this.ws = null;
        this.connected = false;
        this.lastStateSend = 0;
        this.pendingSnapshot = null;
      }
      sendRename(name) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify({ t: "rename", name })); }
      status(text, color) {
        const el = document.getElementById("net-status");
        el.textContent = text; if(color) el.style.color = color;
      }
      wsUrl() {
        const proto = location.protocol === "https:" ? "wss" : "ws";
        return proto + "://" + location.host + "/ws";
      }
      connect(playerName) {
        this.status("🟡 连接中...", "#FFFF55");
        const ws = new WebSocket(this.wsUrl());
        this.ws = ws;

        ws.onopen = () => {
          this.connected = true;
          this.status("🟢 已连接", "#55FF55");
          ws.send(JSON.stringify({ t: "hello", name: playerName }));
        };
        ws.onclose = () => {
          this.connected = false;
          this.status("🔴 连接断开", "#FF5555");
        };
        ws.onmessage = (ev) => {
          let msg; try { msg = JSON.parse(ev.data); } catch { return; }

          if (msg.t === "welcome") {
            localPlayerId = msg.id;
            if (this.pendingSnapshot) { this.applySnapshot(this.pendingSnapshot); this.pendingSnapshot = null; }

          } else if (msg.t === "snapshot") {
            if (!localPlayerId) this.pendingSnapshot = msg.players || [];
            else this.applySnapshot(msg.players || []);

          } else if (msg.t === "states") {
            // ✅ 新增：服务器 20Hz 合并状态流（比 event state + 高频 snapshot 更顺滑）
            const list = msg.list || [];
            for (const s of list) {
              if (!s?.id) continue;
              if (s.id === localPlayerId) continue;

              let rp = playersById.get(s.id);
              if (!rp) {
                // 名字可能还没拿到，先占位，2Hz snapshot 会纠正 name
                rp = new PlayerModel(scene, s.id, s.pos, "Player", true);
                players.push(rp);
                playersById.set(s.id, rp);
              }
              rp.setRemoteTarget(s.pos, s.rotY, s.vel, !!s.crouch);
            }

          } else if (msg.t === "event") {
            this.applyEvent(msg.ev);
          }
        };

      }
      sendChat(text) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify({ t: "chat", text })); }
      maybeSendLocalState() {
        if (this.ws?.readyState !== 1 || !localPlayer) return;
        const now = performance.now();
        if (now - this.lastStateSend < (1000 / CONFIG.netSendHz)) return;
        this.lastStateSend = now;
        const { mesh, velocity } = localPlayer;
        this.ws.send(JSON.stringify({
          t: "state",
          pos: { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z },
          rotY: mesh.rotation.y,
          vel: { x: velocity.x, y: velocity.y, z: velocity.z },
          crouch: !!localPlayer.input.shift,
        }));
      }
      sendSnowball(shotId, dir) {
        if (this.ws?.readyState === 1) {
          this.ws.send(JSON.stringify({ t: "snowball", id: shotId, dir, ts: Date.now() }));
        }
      }
      applySnapshot(list) {
        const ids = new Set();
        for (const snap of list) {
          if (!snap.id) continue;
          ids.add(snap.id);
          if (snap.id === localPlayerId) {
            if (!localPlayer) createLocalPlayer(snap);
            const snapAt = snap.updatedAt ?? 0;
            const lastHpAt = localPlayer.lastHpAt ?? 0;
            if (snapAt >= lastHpAt) {
              localPlayer.health = snap.hp ?? localPlayer.health ?? 100;
              localPlayer.lastHpAt = snapAt;
              setHpUI(localPlayer.health);
            }
            continue;
          } else {
            let rp = playersById.get(snap.id);
            if (!rp) {
              rp = new PlayerModel(scene, snap.id, snap.pos, snap.name, true);
              players.push(rp); playersById.set(snap.id, rp);
            }
            rp.setRemoteTarget(snap.pos, snap.rotY, snap.vel, !!snap.crouch);
            rp.updateNameLabel(snap.name);
          }
        }
        for (const [id, p] of playersById.entries()) {
          if (id !== localPlayerId && !ids.has(id)) { removePlayer(id); }
        }
      }
      applyEvent(ev) {
        if (!ev) return;
        switch (ev.t) {
          case "join":
            if (ev.player.id === localPlayerId) { if(!localPlayer) createLocalPlayer(ev.player); }
            else {
               if(!playersById.has(ev.player.id)) {
                 const rp = new PlayerModel(scene, ev.player.id, ev.player.pos, ev.player.name, true);
                 players.push(rp); playersById.set(ev.player.id, rp);
               }
            }
            break;
          case "leave": removePlayer(ev.playerId); break;
          case "chat":
            const p = playersById.get(ev.playerId);
            if(p) p.showChat(ev.text);
            break;
          case "state":
            const remote = playersById.get(ev.playerId);
            if(remote && ev.playerId !== localPlayerId) {
              remote.setRemoteTarget(ev.pos, ev.rotY, ev.vel, !!ev.crouch);
            }
            break;
          case "snowball":
            if (snowballsById.has(ev.id)) return;
            const sb = new Snowball(ev.id, ev.origin, ev.dir, ev.ownerId);
            snowballs.push(sb); snowballsById.set(ev.id, sb);
            break;
          case "hit": 
            if (ev.victimId === localPlayerId && localPlayer) {
              localPlayer.applyKnockback(ev.impulse);
              localPlayer.health = ev.victimHp;
              localPlayer.lastHpAt = ev.at || Date.now();
              setHpUI(localPlayer.health);
              const flash = document.createElement("div");
              flash.style.position = "absolute"; flash.style.top=0; flash.style.left=0;
              flash.style.width="100%"; flash.style.height="100%";
              flash.style.background="rgba(255,0,0,0.3)"; flash.style.pointerEvents="none";
              document.body.appendChild(flash);
              setTimeout(()=>flash.remove(), 100);
              if (localPlayer.health <= 0) { localPlayer.dead = true; setDeadUI(true); }
            }
            break;
          case "rename": 
            { const p = playersById.get(ev.playerId); if (p) p.updateNameLabel(ev.name); } break;
          case "death":
            { const victim = playersById.get(ev.victimId); if (victim) { victim.dead = true; if (victim.id === localPlayerId) setDeadUI(true); if (victim.isRemote) victim.mesh.visible = false; } } break;
          case "respawn":
            { const p = playersById.get(ev.playerId); if (p) { p.dead = false; p.health = ev.hp ?? 100; p.mesh.visible = true; p.mesh.position.set(ev.pos.x, ev.pos.y, ev.pos.z); if (p.id === localPlayerId) { setDeadUI(false); setHpUI(p.health); } } } break;
        }
      }
    }

    function createLocalPlayer(snap) {
      localPlayer = new PlayerModel(scene, snap.id, snap.pos, snap.name, false);
      players.push(localPlayer);
      localPlayer.lastHpAt = snap.updatedAt ?? 0;
      playersById.set(snap.id, localPlayer);
      cameraYaw = snap.rotY || 0;
      localPlayer.health = snap.hp ?? 100;
      setHpUI(localPlayer.health);
    }
    function removePlayer(id) {
      const p = playersById.get(id);
      if (p) { p.destroy(); playersById.delete(id); const idx = players.indexOf(p); if (idx >= 0) players.splice(idx, 1); }
    }

    // --- MC 风格人物模型 (节日版) ---
    class PlayerModel {
      constructor(scene, id, pos, name, isRemote) {
        this.id = id;
        this.isRemote = isRemote;
        this.name = name;
        this.scene = scene;
        this.dead = false;
        this.health = 100;
        this.lastShotAt = 0;
        
        this.velocity = new THREE.Vector3();
        this.onGround = false;
        this.isCrouching = false;
        this.targetCrouch = false;
        
        this.input = { w: false, a: false, s: false, d: false, space: false, shift: false, r: false };
        
        this.targetPos = new THREE.Vector3(pos.x, pos.y, pos.z);
        this.targetRotY = 0;
        this.targetVel = new THREE.Vector3();

        const isRed = (id.charCodeAt(0) % 2 === 0);
        const colorMain = isRed ? 0xD32F2F : 0x2E7D32; 
        const colorSec = isRed ? 0xFFFFFF : 0xC62828;  
        
        const skinMat = new THREE.MeshStandardMaterial({ color: 0xFACC9E }); 
        const shirtMat = new THREE.MeshStandardMaterial({ color: colorMain });
        const pantsMat = new THREE.MeshStandardMaterial({ color: 0x303F9F });

        this.mesh = new THREE.Group();
        this.mesh.position.set(pos.x, pos.y, pos.z);

        // --- 1. 身体 ---
        this.bodyGroup = new THREE.Group();
        this.bodyGroup.position.y = 0.75; 
        this.mesh.add(this.bodyGroup);

        const torsoGeo = new THREE.BoxGeometry(0.4, 0.6, 0.2);
        this.torso = new THREE.Mesh(torsoGeo, shirtMat);
        this.torso.position.y = 0.3; 
        this.torso.castShadow = true;
        this.bodyGroup.add(this.torso);

        const buttonGeo = new THREE.BoxGeometry(0.05, 0.05, 0.02);
        const btnMat = new THREE.MeshBasicMaterial({ color: colorSec });
        const btn1 = new THREE.Mesh(buttonGeo, btnMat); btn1.position.set(0, 0.4, 0.11); this.bodyGroup.add(btn1);
        const btn2 = new THREE.Mesh(buttonGeo, btnMat); btn2.position.set(0, 0.2, 0.11); this.bodyGroup.add(btn2);

        // --- 2. 头 & 圣诞帽 ---
        this.headGroup = new THREE.Group();
        this.headGroup.position.y = 0.6; 
        this.bodyGroup.add(this.headGroup);

        const headGeo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
        this.head = new THREE.Mesh(headGeo, skinMat);
        this.head.position.y = 0.2; 
        this.head.castShadow = true;
        this.headGroup.add(this.head);

        const eyeMat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
        const pupilMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
        const eyeL = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.08), eyeMat); eyeL.position.set(-0.1, 0.2, -0.201); eyeL.rotation.y = Math.PI; this.headGroup.add(eyeL);
        const pupilL = new THREE.Mesh(new THREE.PlaneGeometry(0.04, 0.04), pupilMat); pupilL.position.set(-0.1, 0.2, -0.202); pupilL.rotation.y = Math.PI; this.headGroup.add(pupilL);
        const eyeR = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.08), eyeMat); eyeR.position.set(0.1, 0.2, -0.201); eyeR.rotation.y = Math.PI; this.headGroup.add(eyeR);
        const pupilR = new THREE.Mesh(new THREE.PlaneGeometry(0.04, 0.04), pupilMat); pupilR.position.set(0.1, 0.2, -0.202); pupilR.rotation.y = Math.PI; this.headGroup.add(pupilR);

        const hatBase = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.12, 0.44), new THREE.MeshStandardMaterial({color: 0xFFFFFF}));
        hatBase.position.y = 0.4; 
        this.headGroup.add(hatBase);
        
        const hatTop1 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.15, 0.3), new THREE.MeshStandardMaterial({color: 0xD32F2F}));
        hatTop1.position.set(0, 0.53, 0); 
        this.headGroup.add(hatTop1);
        
        const hatTop2 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.15, 0.2), new THREE.MeshStandardMaterial({color: 0xD32F2F}));
        hatTop2.position.set(0, 0.65, -0.05); 
        this.headGroup.add(hatTop2);

        const hatBall = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshStandardMaterial({color: 0xFFFFFF}));
        hatBall.position.set(0, 0.7, -0.15);
        this.headGroup.add(hatBall);

        // --- 3. 四肢 ---
        const limbGeo = new THREE.BoxGeometry(0.18, 0.6, 0.18);
        const createLimb = (x, y, mat) => {
            const pivot = new THREE.Group();
            pivot.position.set(x, y, 0);
            const mesh = new THREE.Mesh(limbGeo, mat);
            mesh.position.y = -0.3; 
            mesh.castShadow = true;
            pivot.add(mesh);
            return pivot;
        };

        this.rightArm = createLimb(0.29, 0.55, shirtMat);
        this.bodyGroup.add(this.rightArm);
        this.leftArm = createLimb(-0.29, 0.55, shirtMat);
        this.bodyGroup.add(this.leftArm);

        this.rightLeg = createLimb(0.1, 0.75, pantsMat);
        this.mesh.add(this.rightLeg);
        this.leftLeg = createLimb(-0.1, 0.75, pantsMat);
        this.mesh.add(this.leftLeg);

        this.nameSprite = this.createTextSprite(name, 24, false);
        this.nameSprite.position.y = 2.4;
        this.mesh.add(this.nameSprite);

        this.chatSprite = this.createTextSprite("", 20, true);
        this.chatSprite.visible = false;
        this.chatSprite.position.y = 2.8;
        this.mesh.add(this.chatSprite);

        this.walkTime = 0;
        this.attackTime = 0; 
        scene.add(this.mesh);
      }

      destroy() { if(this.mesh) this.scene.remove(this.mesh); }

      updateNameLabel(name) {
        if(this.name === name) return;
        this.name = name;
        this.mesh.remove(this.nameSprite);
        this.nameSprite = this.createTextSprite(name, 24, false);
        this.nameSprite.position.y = 2.4;
        this.mesh.add(this.nameSprite);
      }

      createTextSprite(text, fontSize, isBubble) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const w = 512, h = 128; canvas.width = w; canvas.height = h;
        if (isBubble) {
          ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
          ctx.fillRect(10,10,w-20,h-20);
          ctx.strokeStyle = "#fff"; ctx.lineWidth = 6; ctx.strokeRect(10,10,w-20,h-20);
          ctx.fillStyle = "#fff";
        } else {
          ctx.fillStyle = "#fff";
          ctx.shadowColor = "rgba(0,0,0,1)"; ctx.shadowBlur = 6; ctx.shadowOffsetX = 3; ctx.shadowOffsetY = 3;
        }
        ctx.font = "bold " + (fontSize*2) + "px 'Courier New'";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(text, w/2, h/2);
        const tex = new THREE.CanvasTexture(canvas);
        tex.magFilter = THREE.NearestFilter; 
        const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
        const sprite = new THREE.Sprite(mat);
        sprite.scale.set(3, 0.75, 1);
        return sprite;
      }

      showChat(text) {
        this.mesh.remove(this.chatSprite);
        this.chatSprite = this.createTextSprite(text, 20, true);
        this.chatSprite.position.y = 2.8;
        this.chatSprite.visible = true;
        this.mesh.add(this.chatSprite);
        if (this.chatTimer) clearTimeout(this.chatTimer);
        this.chatTimer = setTimeout(() => { this.chatSprite.visible = false; }, 5000);
      }

      setRemoteTarget(pos, rotY, vel, crouch) {
        this.targetPos.set(pos.x, pos.y, pos.z);
        this.targetRotY = rotY;
        this.targetVel.set(vel.x, vel.y, vel.z);
        this.targetCrouch = !!crouch;
      }

      throwSnowball() {
        if (this.dead) return;
        if (!networkManager) return;
        const now = performance.now();
        if (now - this.lastShotAt < CONFIG.snowballCooldown) return;
        this.lastShotAt = now;
        this.attackTime = 1.0; 

        const shotId = crypto.randomUUID();
        const euler = new THREE.Euler(cameraPitch, this.mesh.rotation.y, 0, 'YXZ');
        const dir = new THREE.Vector3(0, 0, -1).applyEuler(euler).normalize();
        const origin = this.mesh.position.clone();
        origin.y += 1.4; 
        origin.add(dir.clone().multiplyScalar(0.5));

        const sb = new Snowball(shotId, origin, dir, this.id);
        snowballs.push(sb);
        snowballsById.set(shotId, sb);
        networkManager.sendSnowball(shotId, { x: dir.x, y: dir.y, z: dir.z });
      }

      applyKnockback(impulse) {
        this.velocity.x += impulse.x; this.velocity.y += impulse.y; this.velocity.z += impulse.z;
        this.onGround = false;
      }

      update(dt) {
        if (this.dead) {
             this.mesh.rotation.x = -Math.PI / 2;
             this.mesh.position.y = 0.2;
             return;
        } else {
             this.mesh.rotation.x = 0; 
        }

        if (this.isRemote) {
          const k = 1 - Math.exp(-CONFIG.remoteLerp * dt);
          this.mesh.position.lerp(this.targetPos, k);
          let curY = this.mesh.rotation.y;
          let tarY = this.targetRotY;
          while (tarY - curY > Math.PI) curY += Math.PI * 2;
          while (tarY - curY < -Math.PI) curY -= Math.PI * 2;
          this.mesh.rotation.y = curY + (tarY - curY) * k;
          this.velocity.lerp(this.targetVel, k);
          this.isCrouching = this.targetCrouch;
        } else {
          let speed = CONFIG.moveSpeed;
          this.isCrouching = this.input.shift;
          if (this.isCrouching) speed = CONFIG.crouchSpeed;

          const moveDir = new THREE.Vector3();
          if (this.input.w) moveDir.z -= 1;
          if (this.input.s) moveDir.z += 1;
          if (this.input.a) moveDir.x -= 1;
          if (this.input.d) moveDir.x += 1;

          if (moveDir.length() > 0) {
            moveDir.normalize().applyEuler(new THREE.Euler(0, this.mesh.rotation.y, 0));
            this.velocity.x += moveDir.x * speed * dt * 8; 
            this.velocity.z += moveDir.z * speed * dt * 8;
          }

          const friction = this.onGround ? Math.exp(-10 * dt) : Math.exp(-2 * dt);
          this.velocity.x *= friction; this.velocity.z *= friction;
          this.velocity.y -= CONFIG.gravity * dt;

          if (this.input.space && this.onGround) {
            this.velocity.y = CONFIG.jumpForce;
            this.onGround = false; this.input.space = false;
          }
          
          // R 嘲讽旋转
          if (this.input.r) {
             this.mesh.rotation.y += 20 * dt; // 疯狂旋转
             cameraYaw = this.mesh.rotation.y; // 同步视角
          }

          this.mesh.position.add(this.velocity.clone().multiplyScalar(dt));
          if (this.mesh.position.y < 0) {
            this.mesh.position.y = 0; this.velocity.y = 0; this.onGround = true;
          }
        }

        this.updateAnimation(dt);
      }

      updateAnimation(dt) {
         const hSpeed = Math.hypot(this.velocity.x, this.velocity.z);
         const isMoving = hSpeed > 0.1;
         
         const targetBodyY = this.isCrouching ? 0.60 : 0.75; 
         this.bodyGroup.position.y = THREE.MathUtils.lerp(this.bodyGroup.position.y, targetBodyY, dt * 15);
         
         // 1. 修改：大幅度前倾 (约 45度)
         const targetLean = this.isCrouching ? -0.8 : 0;
         this.bodyGroup.rotation.x = THREE.MathUtils.lerp(this.bodyGroup.rotation.x, targetLean, dt * 10);

         if (isMoving) {
             const animSpeed = this.isCrouching ? 6 : 10; 
             this.walkTime += dt * animSpeed;
             
             // 2. 修改：潜行时腿部摆幅为 0 (看起来不动)
             const amp = this.isCrouching ? 0 : 0.6;
             
             const angle = Math.sin(this.walkTime) * amp;

             this.leftLeg.rotation.x = angle;
             this.rightLeg.rotation.x = -angle;
             
             // 潜行时手臂也固定
             this.leftArm.rotation.x = -angle;
             this.rightArm.rotation.x = angle;
             this.leftArm.rotation.z = 0; 
             this.rightArm.rotation.z = 0;
             
             // 如果是潜行，手臂稍微向后摆一点，像火影跑
             if (this.isCrouching) {
                 this.leftArm.rotation.x = 0.5;
                 this.rightArm.rotation.x = 0.5;
             }

         } else {
             const lerpSpeed = dt * 10;
             this.leftLeg.rotation.x = THREE.MathUtils.lerp(this.leftLeg.rotation.x, 0, lerpSpeed);
             this.rightLeg.rotation.x = THREE.MathUtils.lerp(this.rightLeg.rotation.x, 0, lerpSpeed);
             
             const breath = Math.sin(Date.now() / 300) * 0.02;
             this.leftArm.rotation.z = 0.05 + breath; 
             this.rightArm.rotation.z = -0.05 - breath;
             
             if (this.attackTime <= 0) {
                this.leftArm.rotation.x = THREE.MathUtils.lerp(this.leftArm.rotation.x, 0, lerpSpeed);
                this.rightArm.rotation.x = THREE.MathUtils.lerp(this.rightArm.rotation.x, 0, lerpSpeed);
             }
         }

         if (this.attackTime > 0) {
             this.attackTime -= dt * 4; 
             const phase = 1.0 - this.attackTime; 
             let armRot = 0;
             if (phase < 0.2) armRot = -Math.PI/2 * (phase/0.2); 
             else armRot = -Math.PI/2 + (Math.PI/1.5) * ((phase-0.2)/0.8);
             this.rightArm.rotation.x = armRot;
         }
      }
    }

    class Snowball {
      constructor(id, pos, dir, ownerId) {
        this.id = id; this.active = true; this.ownerId = ownerId;

        // ✅ 1) 更大：0.25 -> 0.4（你也可以 0.35~0.5 自己调）
        const geo = new THREE.SphereGeometry(0.20, 12, 12); // 半径 0.20 ≈ 直径 0.40

        // ✅ 2) 更显眼：带发光（emissive），在雾/雪景里更突出
        const mat = new THREE.MeshStandardMaterial({
          color: 0xFFFFFF,
          emissive: 0x66CCFF,      // 淡蓝发光
          emissiveIntensity: 1.5,
          roughness: 0.2,
          metalness: 0.0,
        });

        this.mesh = new THREE.Mesh(geo, mat);
        this.mesh.position.copy(pos);

        // ✅ 3) 小灯：让雪球附近亮一下（非常显眼）
        this.light = new THREE.PointLight(0x99DDFF, 0.8, 6); // 颜色/强度/距离
        this.light.position.set(0, 0, 0);
        this.mesh.add(this.light);

        this.velocity = new THREE.Vector3(dir.x, dir.y, dir.z).multiplyScalar(CONFIG.snowballSpeed);
        scene.add(this.mesh);

        setTimeout(() => this.destroy(), 3000);
      }

      update(dt) {
        if (!this.active) return;
        this.velocity.y -= CONFIG.gravity * dt;
        this.mesh.position.add(this.velocity.clone().multiplyScalar(dt));
        this.mesh.rotation.x += dt * 10;
        this.mesh.rotation.y += dt * 10;
        if (this.mesh.position.y < 0) { this.destroy(); }
      }

      destroy() {
        if (!this.active) return;
        this.active = false;
        scene.remove(this.mesh);
        snowballsById.delete(this.id);
      }
    }


    function createEnvironment() {
      const groundSize = 200;
      const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 64;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0,0,64,64); 
      for(let i=0;i<200;i++) {
          ctx.fillStyle = Math.random()>0.5 ? '#E0F7FA' : '#B2EBF2';
          ctx.fillRect(Math.floor(Math.random()*64), Math.floor(Math.random()*64), 2, 2);
      }
      const gridTex = new THREE.CanvasTexture(canvas);
      gridTex.magFilter = THREE.NearestFilter;
      gridTex.wrapS = THREE.RepeatWrapping; gridTex.wrapT = THREE.RepeatWrapping;
      gridTex.repeat.set(groundSize/4, groundSize/4);
      
      const groundGeo = new THREE.PlaneGeometry(groundSize, groundSize);
      const groundMat = new THREE.MeshStandardMaterial({ map: gridTex, roughness: 0.5, metalness: 0.1 });
      const ground = new THREE.Mesh(groundGeo, groundMat);
      ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
      scene.add(ground);

      const amb = new THREE.AmbientLight(0x8899AA, 0.6); scene.add(amb);
      const dirLight = new THREE.DirectionalLight(0xFFF0DD, 0.8);
      dirLight.position.set(50, 100, 50); dirLight.castShadow = true;
      dirLight.shadow.mapSize.width = 2048; dirLight.shadow.mapSize.height = 2048;
      dirLight.shadow.camera.left = -50; dirLight.shadow.camera.right = 50;
      dirLight.shadow.camera.top = 50; dirLight.shadow.camera.bottom = -50;
      scene.add(dirLight);

      const treeGroup = new THREE.Group();
      const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4E342E });
      const leafMat = new THREE.MeshStandardMaterial({ color: 0x1B5E20 });
      const starMat = new THREE.MeshBasicMaterial({ color: 0xFFD700 }); 
      
      const ornamentMats = [
        new THREE.MeshStandardMaterial({ color: 0xFF0000 }), 
        new THREE.MeshStandardMaterial({ color: 0xFFD700 }), 
        new THREE.MeshStandardMaterial({ color: 0x00BFFF })  
      ];

      for(let i=0; i<15; i++) {
         const tg = new THREE.Group();
         const x = (Math.random()-0.5)*120;
         const z = (Math.random()-0.5)*120;
         if (Math.abs(x) < 5 && Math.abs(z) < 5) continue;
         tg.position.set(x, 0, z);
         
         const trunk = new THREE.Mesh(new THREE.BoxGeometry(0.8, 2, 0.8), trunkMat);
         trunk.position.y = 1; trunk.castShadow = true;
         tg.add(trunk);
         
         const layers = [
           { w: 4.0, h: 1.5, y: 2.0 },
           { w: 2.8, h: 1.5, y: 3.5 },
           { w: 1.6, h: 1.5, y: 5.0 }
         ];
         
         layers.forEach(layer => {
             const leaf = new THREE.Mesh(new THREE.BoxGeometry(layer.w, layer.h, layer.w), leafMat);
             leaf.position.y = layer.y; leaf.castShadow = true;
             tg.add(leaf);
             for(let k=0; k<4; k++) {
                 const mat = ornamentMats[Math.floor(Math.random()*ornamentMats.length)];
                 const ball = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), mat);
                 const side = Math.random() > 0.5 ? 1 : -1;
                 if (Math.random() > 0.5) {
                    ball.position.set(side * layer.w/2, layer.y + (Math.random()-0.5), (Math.random()-0.5)*layer.w);
                 } else {
                    ball.position.set((Math.random()-0.5)*layer.w, layer.y + (Math.random()-0.5), side * layer.w/2);
                 }
                 tg.add(ball);
             }
         });

         const star = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), starMat);
         star.position.y = 6.0; 
         tg.add(star);
         treeGroup.add(tg);
      }
      scene.add(treeGroup);

      const snowCount = 2000;
      const snowGeo = new THREE.BufferGeometry();
      const posArr = new Float32Array(snowCount * 3);
      for(let i=0; i<snowCount*3; i+=3) {
          posArr[i] = (Math.random()-0.5) * 120;
          posArr[i+1] = Math.random() * 50; 
          posArr[i+2] = (Math.random()-0.5) * 120;
      }
      snowGeo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
      const snowMat = new THREE.PointsMaterial({ color: 0xFFFFFF, size: 0.3, transparent: true, opacity: 0.8 });
      const snowSystem = new THREE.Points(snowGeo, snowMat);
      scene.add(snowSystem);
      return snowSystem;
    }

    function init() {
      scene = new THREE.Scene(); scene.background = new THREE.Color(0xD6EAF8); scene.fog = new THREE.Fog(0xD6EAF8, 15, 70);
      
      camera = new THREE.PerspectiveCamera(70, window.innerWidth/window.innerHeight, 0.1, 1000);
      renderer = new THREE.WebGLRenderer({ antialias: false }); 
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      document.getElementById("canvas-container").appendChild(renderer.domElement);
      clock = new THREE.Clock();
      
      const snowSystem = createEnvironment();
      networkManager = new NetworkManager();

      const nameInput = document.getElementById("name-input");
      const chatInput = document.getElementById("chat-input");
      let tabId = sessionStorage.getItem("tab_id");
      if (!tabId) { tabId = crypto.randomUUID().slice(0, 4); sessionStorage.setItem("tab_id", tabId); }
      const savedName = sessionStorage.getItem("p_name");
      if (savedName) nameInput.value = savedName; else nameInput.value = "Guest-" + tabId;
      networkManager.connect(nameInput.value);

      const inputs = [nameInput, chatInput];
      inputs.forEach(el => {
          el.addEventListener("focus", () => { if(document.pointerLockElement) document.exitPointerLock(); });
          el.addEventListener("keydown", (e) => {
              e.stopPropagation(); 
              if(e.key === "Escape") { el.blur(); }
              if(e.key === "Enter") {
                  if (el === nameInput) {
                    const newName = el.value.trim(); sessionStorage.setItem("p_name", newName);
                    if (networkManager) networkManager.sendRename(newName);
                    if (localPlayer) localPlayer.updateNameLabel(newName);
                    el.blur(); document.body.requestPointerLock();
                  }
                  if(el === chatInput) {
                      const txt = el.value.trim();
                      if(txt) { if(localPlayer) localPlayer.showChat(txt); networkManager.sendChat(txt); el.value = ""; }
                  }
              }
          });
      });

      window.addEventListener("resize", () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });
      
      document.addEventListener("pointerlockchange", () => { 
          isPointerLocked = !!document.pointerLockElement; 
          document.getElementById("click-to-play").style.display = isPointerLocked ? "none" : "block";
      });

      document.addEventListener("mousedown", (e) => {
          const active = document.activeElement; 
          if (active === chatInput || active === nameInput) return;
          if (e.button === 0) { 
              if (!isPointerLocked) document.body.requestPointerLock();
              else if (localPlayer) localPlayer.throwSnowball();
          }
      });
      
      document.addEventListener("mousemove", (e) => {
          if(!localPlayer || !isPointerLocked) return;
          cameraYaw -= e.movementX * CONFIG.lookSensitivity;
          cameraPitch -= e.movementY * CONFIG.lookSensitivity;
          cameraPitch = Math.max(CONFIG.minPitch, Math.min(CONFIG.maxPitch, cameraPitch));
          
          if(!localPlayer.input.r) { 
             localPlayer.mesh.rotation.y = cameraYaw; 
          }
      });

      document.addEventListener("keydown", (e) => {
          if (document.activeElement === chatInput || document.activeElement === nameInput) return;
          if (e.code === "KeyT" || e.code === "Enter") { e.preventDefault(); chatInput.focus(); return; }
          if (localPlayer) {
              switch(e.code) {
                  case "KeyW": localPlayer.input.w = true; break;
                  case "KeyS": localPlayer.input.s = true; break;
                  case "KeyA": localPlayer.input.a = true; break;
                  case "KeyD": localPlayer.input.d = true; break;
                  case "Space": localPlayer.input.space = true; break;
                  case "ShiftLeft": localPlayer.input.shift = true; break;
                  case "KeyR": localPlayer.input.r = true; break;
              }
          }
      });
      document.addEventListener("keyup", (e) => {
          if (localPlayer) {
              switch(e.code) {
                  case "KeyW": localPlayer.input.w = false; break;
                  case "KeyS": localPlayer.input.s = false; break;
                  case "KeyA": localPlayer.input.a = false; break;
                  case "KeyD": localPlayer.input.d = false; break;
                  case "Space": localPlayer.input.space = false; break;
                  case "ShiftLeft": localPlayer.input.shift = false; break;
                  case "KeyR": localPlayer.input.r = false; break;
              }
          }
      });

      function animate() {
          requestAnimationFrame(animate);
          const dt = Math.min(clock.getDelta(), 0.1);
          players.forEach(p => p.update(dt));
          for (let i = snowballs.length - 1; i >= 0; i--) {
              snowballs[i].update(dt); if (!snowballs[i].active) snowballs.splice(i, 1);
          }
          if (networkManager) networkManager.maybeSendLocalState();

          if (localPlayer) {
              const eyeOffset = localPlayer.input.shift ? 1.35 : 1.5;
              const headPos = localPlayer.mesh.position.clone();
              headPos.y += eyeOffset; 
              
              const rot = new THREE.Euler(cameraPitch, cameraYaw, 0, 'YXZ');
              const camOffset = new THREE.Vector3(0, 0, 3.5).applyEuler(rot);
              
              const targetCamPos = headPos.clone().add(camOffset);
              camera.position.lerp(targetCamPos, 0.5); 
              camera.lookAt(headPos);
          }
          
          if (snowSystem) {
              const positions = snowSystem.geometry.attributes.position.array;
              for(let i=1; i<positions.length; i+=3) {
                  positions[i] -= 5 * dt; 
                  if(positions[i] < 0) positions[i] = 50; 
              }
              snowSystem.geometry.attributes.position.needsUpdate = true;
          }

          renderer.render(scene, camera);
      }
      animate();
    }
    init();
  </script>
</body>
</html>`;

//////////////////////////////
// SECTION 10: HTTP Router
//////////////////////////////

const PORT = Number(Deno.env.get("PORT") ?? "8000");

Deno.serve({ port: PORT }, async (req) => {
  const url = new URL(req.url);

//////////////////////////////
// ✅ PATCH 2/2: /health 也用 cache（避免 KV 慢时 health 卡住）
// 直接替换你 SECTION 10 里 /health 这个分支（if (url.pathname === "/health") {...}）
//////////////////////////////

  if (url.pathname === "/health") {
    return json({
      ok: true,
      world: CONFIG.WORLD,
      connectionsOnThisIsolate: clients.size,
      latestSeq: lastSeenSeq,
      playersCachedOnThisIsolate: playersCache.size,
      eventsInMemory: (typeof events !== "undefined" ? events.length : -1),
    });
  }



  if (url.pathname === "/ws") {
    return await handleWs(req);
  }

  if (url.pathname === "/") {
    return new Response(CLIENT_HTML, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "access-control-allow-origin": CONFIG.CORS,
      },
    });
  }

  return text("Not Found", 404);
});
