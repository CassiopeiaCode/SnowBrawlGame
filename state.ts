// state.ts - 服务器内存状态与事件流

import { CONFIG, TTL } from "./config.ts";
import type { PlayerSnapshot, WorldEvent, ServerMsg, Vec3 } from "./protocol.ts";

// 事件序号（本 isolate 内自增）
export let latestSeq = 0;
// 在 snapshot 中返回给客户端的最近事件序号
export let lastSeenSeq = 0;

// 事件日志（内存滑窗）
export const events: WorldEvent[] = [];

export function pruneEvents(now = Date.now()) {
  const cutoff = now - TTL.EVENT_MS;
  while (events.length && (events[0].at ?? 0) < cutoff) {
    events.shift();
  }
}

// 玩家表（本 isolate 内权威玩家表）
export const playersCache = new Map<string, PlayerSnapshot>();

export type WSClient = {
  id: string;
  name: string;
  ws: WebSocket;
  connectedAt: number;
  bucketStart: number;
  bucketCount: number;
  lastStateAt: number;
};

export const clients = new Map<string, WSClient>();

export function broadcast(msg: ServerMsg) {
  const data = JSON.stringify(msg);
  for (const c of clients.values()) {
    try {
      c.ws.send(data);
    } catch {
      // ignore
    }
  }
}

// 事件应用到玩家缓存，保持 cache 与事件一致
export function applyEventToCache(ev: WorldEvent) {
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

// 内存 appendEvent：生成 seq/at、写 events、应用到 cache、并广播
// 这里参数使用宽松类型，避免联合类型上的复杂 excess property 检查问题。
export async function appendEventInMem(ev: any): Promise<WorldEvent> {
  const full = { ...(ev as any), seq: ++latestSeq, at: Date.now() } as WorldEvent;

  lastSeenSeq = latestSeq;
  events.push(full);
  pruneEvents(full.at);

  applyEventToCache(full);

  broadcast({ t: "event", ev: full });

  return full;
}

// 内存玩家清理（防异常断线导致的“幽灵玩家”）
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

// --- WS Gateway: snapshot/states 相关逻辑 ---

// backpressure：慢客户端丢“状态/快照帧”，不要让它排队
const DROP_BUFFER_BYTES = 256_000; // 256KB，可按需调大/调小

export function broadcastDroppable(msg: any) {
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

export function rateLimitOk(c: WSClient, now: number): boolean {
  if (now - c.bucketStart > CONFIG.RATE.windowMs) {
    c.bucketStart = now;
    c.bucketCount = 0;
  }
  c.bucketCount++;
  return c.bucketCount <= CONFIG.RATE.maxMsgs;
}

// 放宽一点，避免“卡边界抖动”导致丢太多 state
export function stateFreqOk(c: WSClient, now: number): boolean {
  const minInterval = 1000 / CONFIG.STATE_HZ;
  if (now - c.lastStateAt < minInterval * 0.75) return false;
  c.lastStateAt = now;
  return true;
}

// 待批量广播的玩家状态（每个玩家只保留最新一份）
type PendingState = {
  id: string;
  pos: Vec3;
  rotY: number;
  vel: Vec3;
  crouch: boolean;
  updatedAt: number;
  pingMs?: number;
};

const pendingStates = new Map<string, PendingState>();

export function enqueuePendingState(s: PendingState) {
  pendingStates.set(s.id, s);
}

// 低频 snapshot：兜底纠偏（全量）：1Hz 即可
const STATE_SYNC_HZ = 1;
let stateSyncStarted = false;

export function startStateSyncOnce() {
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

// 高频合并状态：把所有玩家“最新状态”合成 1 个包发出去
const STATE_TICK_HZ = 20;
let stateTickStarted = false;

export function startStateTickOnce() {
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
