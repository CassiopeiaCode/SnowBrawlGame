// bot.ts - 人机逻辑

import { CONFIG } from "./config.ts";
import type { Vec3, PlayerSnapshot } from "./protocol.ts";
import { appendEventInMem, playersCache, enqueuePendingState } from "./state.ts";
import { vec3Mul, vec3Normalize, norm, snowballPosAt, intersectsPlayerCylinder } from "./utils.ts";
import { WORLD_SEED } from "./config.ts";

// 地形高度函数：与客户端保持一致
function terrainHeight(x: number, z: number): number {
  const scale1 = 0.06;
  const scale2 = 0.12;
  const s = WORLD_SEED * 0.0001;
  const n1 = Math.sin(x * scale1 + s * 13.37) + Math.cos(z * scale1 - s * 7.21);
  const n2 = Math.sin((x + 1000) * scale2 - s * 3.17) - Math.cos((z - 500) * scale2 + s * 9.99);
  let h = n1 * 0.7 + n2 * 0.3;
  // 增加陡峭程度，并整体抬高到 > 0
  const sign = h >= 0 ? 1 : -1;
  h = sign * Math.pow(Math.abs(h), 1.8) * 2.5;
  return h + 6; // 整体抬升，保证最低高度 > 0
}

export type Bot = {
  id: string;
  name: string;
  pos: Vec3;
  rotY: number;
  vel: Vec3;
  hp: number;
  targetPos: Vec3 | null;
  lastShotAt: number;
  moveTimer: number;
};

const bots = new Map<string, Bot>();
const BOT_COUNT = 3;
const BOT_NAMES = ["雪人Bot-1", "雪人Bot-2", "雪人Bot-3"];
const SHOT_INTERVAL = 10000; // 10秒射击一次
const MOVE_INTERVAL = 3000; // 3秒换一次目标位置
const BOT_SPEED = 3.0;
const CHRISTMAS_TREE_RADIUS = 25; // 圣诞树排除半径

// 初始化人机
export function initBots() {
  for (let i = 0; i < BOT_COUNT; i++) {
    const id = `bot-${i}`;
    const spawn = getRandomSpawnPos();
    
    const bot: Bot = {
      id,
      name: BOT_NAMES[i],
      pos: spawn,
      rotY: Math.random() * Math.PI * 2,
      vel: { x: 0, y: 0, z: 0 },
      hp: 100,
      targetPos: null,
      lastShotAt: Date.now() + Math.random() * SHOT_INTERVAL, // 随机初始射击时间
      moveTimer: Date.now(),
    };
    
    bots.set(id, bot);
    
    // 添加到玩家缓存
    const snapshot: PlayerSnapshot = {
      id: bot.id,
      name: bot.name,
      pos: bot.pos,
      rotY: bot.rotY,
      vel: bot.vel,
      hp: bot.hp,
      crouch: false,
      deadUntil: 0,
      updatedAt: Date.now(),
    };
    
    playersCache.set(id, snapshot);
    
    console.log(`[Bot] Initialized bot: ${bot.name} at (${bot.pos.x.toFixed(1)}, ${bot.pos.z.toFixed(1)})`);
  }
  
  console.log(`[Bot] Total ${BOT_COUNT} bots initialized and added to playersCache`);
}

// 获取随机出生点（避开圣诞树）
function getRandomSpawnPos(): Vec3 {
  let x: number, z: number, y: number;
  let attempts = 0;
  
  do {
    x = (Math.random() - 0.5) * (CONFIG.MAP_HALF * 1.5);
    z = (Math.random() - 0.5) * (CONFIG.MAP_HALF * 1.5);
    attempts++;
    
    // 检查是否太靠近圣诞树（中心点）
    const distToCenter = Math.sqrt(x * x + z * z);
    if (distToCenter > CHRISTMAS_TREE_RADIUS) {
      break;
    }
  } while (attempts < 50);
  
  // 限制在地图范围内
  const half = CONFIG.MAP_HALF;
  x = Math.max(-half, Math.min(half, x));
  z = Math.max(-half, Math.min(half, z));
  
  // 计算地形高度
  y = terrainHeight(x, z);
  
  return { x, y, z };
}

// 获取随机移动目标（避开圣诞树）
function getRandomMoveTarget(currentPos: Vec3): Vec3 {
  let x: number, z: number, y: number;
  let attempts = 0;
  
  do {
    // 在当前位置附近随机移动
    const angle = Math.random() * Math.PI * 2;
    const distance = 10 + Math.random() * 20;
    x = currentPos.x + Math.cos(angle) * distance;
    z = currentPos.z + Math.sin(angle) * distance;
    
    // 限制在地图范围内
    const half = CONFIG.MAP_HALF;
    x = Math.max(-half, Math.min(half, x));
    z = Math.max(-half, Math.min(half, z));
    
    attempts++;
    
    // 检查是否太靠近圣诞树
    const distToCenter = Math.sqrt(x * x + z * z);
    if (distToCenter > CHRISTMAS_TREE_RADIUS) {
      break;
    }
  } while (attempts < 20);
  
  // 计算地形高度
  y = terrainHeight(x, z);
  
  return { x, y, z };
}

// 找到最近的真实玩家
function findNearestPlayer(botPos: Vec3): PlayerSnapshot | null {
  let nearest: PlayerSnapshot | null = null;
  let minDist = Infinity;
  
  for (const player of playersCache.values()) {
    // 跳过人机自己
    if (player.id.startsWith("bot-")) continue;
    
    // 跳过死亡玩家
    if ((player.hp ?? 100) <= 0) continue;
    
    const dx = player.pos.x - botPos.x;
    const dz = player.pos.z - botPos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    
    if (dist < minDist) {
      minDist = dist;
      nearest = player;
    }
  }
  
  return nearest;
}

// 人机射击
async function botShoot(bot: Bot, target: PlayerSnapshot) {
  // 计算射击方向
  const dx = target.pos.x - bot.pos.x;
  const dy = (target.pos.y + 1.0) - (bot.pos.y + 1.3); // 瞄准玩家身体
  const dz = target.pos.z - bot.pos.z;
  
  const dir = norm({ x: dx, y: dy, z: dz });
  const origin: Vec3 = { x: bot.pos.x, y: bot.pos.y + 1.3, z: bot.pos.z };
  const shotId = crypto.randomUUID();
  
  // 发射雪球事件
  await appendEventInMem({
    t: "snowball",
    id: shotId,
    ownerId: bot.id,
    origin,
    dir,
    speed: CONFIG.GAME.snowballSpeed,
  });
  
  // 执行命中判定（与 serverHandleSnowball 相同的逻辑）
  const players = Array.from(playersCache.values());
  const v0 = vec3Mul(dir, CONFIG.GAME.snowballSpeed);
  const T = CONFIG.GAME.snowballLifeSec;
  const steps = CONFIG.GAME.snowballSimSteps;
  const dt = T / steps;

  let best: { victim: PlayerSnapshot; t: number } | null = null;

  for (const p of players) {
    if (p.id === bot.id) continue; // 跳过自己
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

  if (!best) {
    bot.lastShotAt = Date.now();
    return;
  }

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
    attackerId: bot.id,
    victimId: victim.id,
    impulse: finalImpulse,
    victimHp: newHp,
    shotId,
  });

  if (newHp === 0) {
    // 人机击杀不记录到数据库
    await appendEventInMem({
      t: "death",
      victimId: victim.id,
      victimName: victim.name,
      attackerId: bot.id,
      attackerName: bot.name,
      shotId,
      respawnAt,
    });
  }
  
  bot.lastShotAt = now;
}

// 更新人机逻辑
export async function updateBots() {
  const now = Date.now();
  
  for (const bot of bots.values()) {
    const snapshot = playersCache.get(bot.id);
    if (!snapshot) continue;
    
    // 检查是否需要复活
    if (snapshot.hp <= 0 && (snapshot.deadUntil ?? 0) <= now) {
      const spawn = getRandomSpawnPos();
      bot.pos = spawn;
      bot.hp = 100;
      bot.vel = { x: 0, y: 0, z: 0 };
      bot.targetPos = null;
      
      const revived: PlayerSnapshot = {
        ...snapshot,
        pos: spawn,
        hp: 100,
        deadUntil: 0,
        updatedAt: now,
      };
      
      playersCache.set(bot.id, revived);
      
      await appendEventInMem({
        t: "respawn",
        playerId: bot.id,
        pos: spawn,
        hp: 100,
      });
      
      continue;
    }
    
    // 死亡状态不更新
    if (snapshot.hp <= 0) continue;
    
    // 随机游走逻辑
    if (!bot.targetPos || now - bot.moveTimer > MOVE_INTERVAL) {
      bot.targetPos = getRandomMoveTarget(bot.pos);
      bot.moveTimer = now;
    }
    
    // 移动到目标位置
    if (bot.targetPos) {
      const dx = bot.targetPos.x - bot.pos.x;
      const dz = bot.targetPos.z - bot.pos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      
      if (dist > 0.5) {
        // 计算移动方向
        const moveDir = { x: dx / dist, y: 0, z: dz / dist };
        bot.vel.x = moveDir.x * BOT_SPEED;
        bot.vel.z = moveDir.z * BOT_SPEED;
        
        // 更新朝向
        bot.rotY = Math.atan2(dx, dz);
        
        // 更新位置
        const dt = 0.05; // 假设50ms更新间隔
        bot.pos.x += bot.vel.x * dt;
        bot.pos.z += bot.vel.z * dt;
        
        // 限制在地图范围内
        const half = CONFIG.MAP_HALF;
        bot.pos.x = Math.max(-half, Math.min(half, bot.pos.x));
        bot.pos.z = Math.max(-half, Math.min(half, bot.pos.z));
        
        // 更新Y坐标以跟随地形
        bot.pos.y = terrainHeight(bot.pos.x, bot.pos.z);
      } else {
        // 到达目标，停止移动
        bot.vel.x = 0;
        bot.vel.z = 0;
        bot.targetPos = null;
      }
    }
    
    // 定时射击逻辑
    if (now - bot.lastShotAt > SHOT_INTERVAL) {
      const target = findNearestPlayer(bot.pos);
      if (target) {
        // 朝向目标
        const dx = target.pos.x - bot.pos.x;
        const dz = target.pos.z - bot.pos.z;
        bot.rotY = Math.atan2(dx, dz);
        
        await botShoot(bot, target);
      } else {
        // 没有目标也重置射击时间
        bot.lastShotAt = now;
      }
    }
    
    // 更新玩家缓存
    const updated: PlayerSnapshot = {
      ...snapshot,
      pos: bot.pos,
      rotY: bot.rotY,
      vel: bot.vel,
      updatedAt: now,
    };
    
    playersCache.set(bot.id, updated);
    
    // 广播状态
    enqueuePendingState({
      id: bot.id,
      pos: bot.pos,
      rotY: bot.rotY,
      vel: bot.vel,
      crouch: false,
      updatedAt: now,
    });
  }
}

// 启动人机更新循环
export function startBotLoop() {
  setInterval(updateBots, 50); // 20Hz更新频率
}
