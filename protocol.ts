// protocol.ts - 基础类型与协议定义

export type Vec3 = { x: number; y: number; z: number };

export type ClientHello = { t: "hello"; name: string };
export type ClientChat = { t: "chat"; text: string };
export type ClientState = {
  t: "state";
  pos: Vec3;
  rotY: number;
  vel?: Vec3;
  crouch?: boolean;
  ts?: number;
  pingMs?: number; // 客户端测得的当前 ping，附带在 state 中，用于服务端统计/广播
};
// snowball 带 id（shotId）用于去重
export type ClientSnowball = { t: "snowball"; id: string; dir: Vec3; ts?: number };
export type ClientPing = { t: "ping"; now?: number };
export type ClientRename = { t: "rename"; name: string };

export type ClientMsg = ClientHello | ClientChat | ClientState | ClientSnowball | ClientPing | ClientRename;

export type PlayerSnapshot = {
  id: string;
  name: string;
  pos: Vec3;
  rotY: number;
  vel: Vec3;
  hp: number;
  crouch: boolean;
  deadUntil?: number;
  updatedAt: number;
  pingMs?: number; // 最近一次客户端上报的延迟（毫秒）
};

export type WorldEvent =
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
      victimName: string;
      attackerId: string;
      attackerName: string;
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

export type ServerMsg =
  | { t: "welcome"; id: string; world: string; now: number; seed: number }
  | { t: "snapshot"; world: string; players: PlayerSnapshot[]; latestSeq: number }
  | { t: "event"; ev: WorldEvent }
  | { t: "pong"; now: number }
  | { t: "error"; message: string };
