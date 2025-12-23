// game.ts - 服务端游戏逻辑（纯内存）

import { CONFIG } from "./config.ts";
import type { Vec3, ClientChat, ClientState, ClientSnowball, PlayerSnapshot } from "./protocol.ts";
import {
  clampChat,
  clampName,
  intersectsPlayerCylinder,
  isFiniteVec3,
  isUuidLike,
  norm,
  snowballPosAt,
  vec3Mul,
  vec3Normalize,
} from "./utils.ts";
import { appendEventInMem, enqueuePendingState, playersCache } from "./state.ts";
import { recordKill } from "./storage.ts";

// shotId 去重（避免网络重发导致重复命中/重复扣血）
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

export async function serverOnHello(name: string): Promise<PlayerSnapshot> {
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

export async function serverHandleRename(clientId: string, newRawName: string) {
  const newName = clampName(newRawName);
  if (!newName) return;

  const prev = playersCache.get(clientId);
  if (prev) {
    const next = { ...prev, name: newName, updatedAt: Date.now() };
    playersCache.set(clientId, next);
  }

  await appendEventInMem({ t: "rename", playerId: clientId, name: newName });
}

export async function serverHandleChat(clientId: string, name: string, msg: ClientChat) {
  const text = clampChat(msg.text);
  if (!text) return;
  await appendEventInMem({ t: "chat", playerId: clientId, name, text });
}

export async function serverHandleState(clientId: string, name: string, msg: ClientState) {
  if (!isFiniteVec3(msg.pos) || !Number.isFinite(msg.rotY)) return;

  const vel = isFiniteVec3(msg.vel) ? msg.vel : { x: 0, y: 0, z: 0 };
  const crouch = !!msg.crouch;

  // 服务器侧防御：玩家不能跑出地图边界
  if (
    Math.abs(msg.pos.x) > CONFIG.MAP_HALF + 5 ||
    Math.abs(msg.pos.z) > CONFIG.MAP_HALF + 5 ||
    Math.abs(msg.pos.y) > 5000
  ) {
    return;
  }

  const now = Date.now();
  const prev = playersCache.get(clientId);

  // 1) 死亡冻结
  if (prev && (prev.hp ?? 100) <= 0 && (prev.deadUntil ?? 0) > now) return;

  // 2) 到点复活（下一次 state 触发）
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
      pingMs: typeof msg.pingMs === "number" ? msg.pingMs : prev.pingMs,
    };

    playersCache.set(clientId, revived);

    await appendEventInMem({ t: "respawn", playerId: clientId, pos: spawn, hp: 100 });

    enqueuePendingState({
      id: clientId,
      pos: revived.pos,
      rotY: revived.rotY,
      vel: revived.vel,
      crouch: revived.crouch,
      updatedAt: revived.updatedAt,
    });

    return;
  }

  const next: PlayerSnapshot = {
    id: clientId,
    name,
    pos: msg.pos,
    rotY: msg.rotY,
    vel,
    hp: prev?.hp ?? 100,
    crouch,
    deadUntil: prev?.deadUntil ?? 0,
    updatedAt: now,
    pingMs: typeof msg.pingMs === "number" ? msg.pingMs : prev?.pingMs,
  };

  playersCache.set(clientId, next);

  enqueuePendingState({
    id: clientId,
    pos: next.pos,
    rotY: next.rotY,
    vel: next.vel,
    crouch: next.crouch,
    updatedAt: next.updatedAt,
    pingMs: typeof msg.pingMs === "number" ? msg.pingMs : prev?.pingMs,
  });
}

export async function serverHandleSnowball(clientId: string, msg: ClientSnowball) {
  if (!isFiniteVec3(msg.dir)) return;

  const shotId = isUuidLike(msg.id) ? msg.id : crypto.randomUUID();
  if (seenShotBefore(shotId)) return;

  const snap = playersCache.get(clientId);
  if (!snap) return;

  const dir = norm(msg.dir);
  const origin: Vec3 = { x: snap.pos.x, y: snap.pos.y + 1.3, z: snap.pos.z };

  await appendEventInMem({
    t: "snowball",
    id: shotId,
    ownerId: clientId,
    origin,
    dir,
    speed: CONFIG.GAME.snowballSpeed,
  });

  const players = Array.from(playersCache.values());

  const v0 = vec3Mul(dir, CONFIG.GAME.snowballSpeed);
  const T = CONFIG.GAME.snowballLifeSec;
  const steps = CONFIG.GAME.snowballSimSteps;
  const dt = T / steps;

  let best: { victim: PlayerSnapshot; t: number } | null = null;

  for (const p of players) {
    if (p.id === clientId) continue;
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
    deadUntil: newHp === 0 ? respawnAt : victim.deadUntil ?? 0,
    updatedAt: now,
  };
  playersCache.set(victim.id, updatedVictim);

  await appendEventInMem({
    t: "hit",
    attackerId: clientId,
    victimId: victim.id,
    impulse: finalImpulse,
    victimHp: newHp,
    shotId,
  });

  if (newHp === 0) {
    // 记录击杀到数据库
    const attacker = playersCache.get(clientId);
    const attackerName = attacker?.name || "Unknown";
    recordKill({
      attackerId: clientId,
      attackerName,
      victimId: victim.id,
      victimName: victim.name,
      shotId,
    });

    await appendEventInMem({
      t: "death",
      victimId: victim.id,
      victimName: victim.name,
      attackerId: clientId,
      attackerName,
      shotId,
      respawnAt,
    });
  }
}
