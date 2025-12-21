// config.ts - 全局配置与常量

export const CONFIG = {
  WORLD: "global",
  CORS: "*",
  RATE: { windowMs: 10_000, maxMsgs: 1200 },
  STATE_HZ: 20, // 服务器期望的客户端 state 上报频率（Hz）
  MAX_NAME: 20,
  MAX_CHAT: 80,
  CLEANUP_IDLE_MS: 60_000,
  CLEANUP_SCAN_MS: 10_000,
  MAP_HALF: 95, // 地图半径（玩家活动区域）与前端保持一致

  GAME: {
    gravity: 20,
    snowballSpeed: 25,
    snowballLifeSec: 3,
    snowballSimSteps: 60, // 命中判定离散步数
    // 命中判定圆柱：稍微放大一点，让雪球更容易打中玩家
    hitRadius: 0.9, // 近似圆柱半径（原来约 0.6）
    hitHeight: 2.2, // 近似人体高度（原来约 1.8）
    knockbackForce: 26,
    knockUp: 1.2,
    damage: 10,
    respawnMs: 3000,
  },
} as const;

export const TTL = {
  PLAYER_MS: 60_000, // 玩家快照：只要玩家还在动/发包就不断续命
  GONE_MS: 5 * 60_000, // 离线标记：用于 cron/兜底
  EVENT_MS: 2 * 60_000, // 事件日志：只保留最近 2 分钟
} as const;

export const PORT = Number(Deno.env.get("PORT") ?? "8000");

// 每次服务器启动生成一个世界种子，用于地形等需要全客户端一致的随机性
const seedBuf = new Uint32Array(1);
crypto.getRandomValues(seedBuf);
export const WORLD_SEED = seedBuf[0] >>> 0;
