// storage.ts - 数据持久化模块（使用 SQLite）

import { Database } from "jsr:@db/sqlite@0.12";

const db = new Database("snowbrawl.db");

// 初始化表结构
db.exec(`
  CREATE TABLE IF NOT EXISTS kills (
    id TEXT PRIMARY KEY,
    attacker_id TEXT NOT NULL,
    attacker_name TEXT NOT NULL,
    victim_id TEXT NOT NULL,
    victim_name TEXT NOT NULL,
    shot_id TEXT NOT NULL,
    timestamp INTEGER NOT NULL
  );
  
  CREATE INDEX IF NOT EXISTS idx_kills_timestamp ON kills(timestamp DESC);
  CREATE INDEX IF NOT EXISTS idx_kills_attacker ON kills(attacker_id);
  CREATE INDEX IF NOT EXISTS idx_kills_victim ON kills(victim_id);
  CREATE INDEX IF NOT EXISTS idx_kills_attacker_name ON kills(attacker_name);
  
  CREATE TABLE IF NOT EXISTS player_stats (
    player_name TEXT PRIMARY KEY,
    kills INTEGER DEFAULT 0,
    deaths INTEGER DEFAULT 0,
    last_seen INTEGER NOT NULL,
    last_player_id TEXT
  );
`);

// 击杀记录
export interface KillRecord {
  id: string;
  attackerId: string;
  attackerName: string;
  victimId: string;
  victimName: string;
  shotId: string;
  timestamp: number;
}

// 玩家统计
export interface PlayerStats {
  playerName: string;
  kills: number;
  deaths: number;
  lastSeen: number;
  lastPlayerId?: string;
}

// 预编译语句
const insertKillStmt = db.prepare(`
  INSERT INTO kills (id, attacker_id, attacker_name, victim_id, victim_name, shot_id, timestamp)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const upsertStatsStmt = db.prepare(`
  INSERT INTO player_stats (player_name, kills, deaths, last_seen, last_player_id)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(player_name) DO UPDATE SET
    kills = player_stats.kills + excluded.kills,
    deaths = player_stats.deaths + excluded.deaths,
    last_seen = excluded.last_seen,
    last_player_id = excluded.last_player_id
`);

const getStatsStmt = db.prepare(`
  SELECT player_name, kills, deaths, last_seen, last_player_id
  FROM player_stats WHERE player_name = ?
`);

const getRecentKillsStmt = db.prepare(`
  SELECT id, attacker_id, attacker_name, victim_id, victim_name, shot_id, timestamp
  FROM kills ORDER BY timestamp DESC LIMIT ?
`);

const getLeaderboardStmt = db.prepare(`
  SELECT player_name, kills, deaths, last_seen, last_player_id
  FROM player_stats ORDER BY kills DESC LIMIT ?
`);

// 按时间范围统计击杀排行（按用户名聚合）
const getLeaderboardByTimeStmt = db.prepare(`
  SELECT 
    attacker_name as player_name, 
    COUNT(*) as kills,
    MAX(attacker_id) as player_id
  FROM kills
  WHERE timestamp > ?
  GROUP BY attacker_name
  ORDER BY kills DESC
  LIMIT ?
`);

const cleanupStmt = db.prepare(`
  DELETE FROM kills WHERE timestamp < ?
`);

// 记录一次击杀
export function recordKill(record: Omit<KillRecord, "id" | "timestamp">): KillRecord {
  const id = crypto.randomUUID();
  const timestamp = Date.now();
  
  insertKillStmt.run(
    id,
    record.attackerId,
    record.attackerName,
    record.victimId,
    record.victimName,
    record.shotId,
    timestamp
  );

  // 更新攻击者统计（+1 kill）- 按用户名聚合
  upsertStatsStmt.run(record.attackerName, 1, 0, timestamp, record.attackerId);
  
  // 更新受害者统计（+1 death）- 按用户名聚合
  upsertStatsStmt.run(record.victimName, 0, 1, timestamp, record.victimId);

  return { ...record, id, timestamp };
}

// 获取玩家统计（按用户名查询）
export function getPlayerStats(playerName: string): PlayerStats | null {
  const row = getStatsStmt.get(playerName) as any;
  if (!row) return null;
  
  return {
    playerName: row.player_name,
    kills: row.kills,
    deaths: row.deaths,
    lastSeen: row.last_seen,
    lastPlayerId: row.last_player_id,
  };
}

// 获取最近的击杀记录
export function getRecentKills(limit = 50): KillRecord[] {
  const rows = getRecentKillsStmt.all(limit) as any[];
  
  return rows.map(row => ({
    id: row.id,
    attackerId: row.attacker_id,
    attackerName: row.attacker_name,
    victimId: row.victim_id,
    victimName: row.victim_name,
    shotId: row.shot_id,
    timestamp: row.timestamp,
  }));
}

// 获取排行榜（按击杀数排序）
export function getLeaderboard(limit = 20): PlayerStats[] {
  const rows = getLeaderboardStmt.all(limit) as any[];
  
  return rows.map(row => ({
    playerName: row.player_name,
    kills: row.kills,
    deaths: row.deaths,
    lastSeen: row.last_seen,
    lastPlayerId: row.last_player_id,
  }));
}

// 获取指定时间范围内的排行榜（按用户名聚合）
export function getLeaderboardByTime(hours: number, limit = 20): { playerName: string; kills: number }[] {
  const since = Date.now() - hours * 60 * 60 * 1000;
  const rows = getLeaderboardByTimeStmt.all(since, limit) as any[];
  
  return rows.map(row => ({
    playerName: row.player_name,
    kills: row.kills,
  }));
}

// 清理旧的击杀记录（保留最近 30 天）
export function cleanupOldKills(): number {
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const result = cleanupStmt.run(cutoff);
  return result;
}

// 定期清理（每小时）
setInterval(() => {
  const deleted = cleanupOldKills();
  if (deleted > 0) {
    console.log(`[storage] Cleaned up ${deleted} old kill records`);
  }
}, 60 * 60 * 1000);

// 关闭数据库（进程退出时）
globalThis.addEventListener("unload", () => {
  db.close();
});
