// ws.ts - WebSocket 入口与消息分发

import { CONFIG, WORLD_SEED } from "./config.ts";
import type { ClientMsg } from "./protocol.ts";
import { decodeClientWsMsg, wsSend } from "./utils.ts";
import {
  WSClient,
  appendEventInMem,
  clients,
  lastSeenSeq,
  playersCache,
  rateLimitOk,
  startStateSyncOnce,
  startStateTickOnce,
  stateFreqOk,
} from "./state.ts";
import {
  serverOnHello,
  serverHandleChat,
  serverHandleRename,
  serverHandleSnowball,
  serverHandleState,
} from "./game.ts";

export async function handleWs(req: Request): Promise<Response> {
  const { socket, response } = Deno.upgradeWebSocket(req);

  // 纯内存：不跨 isolate，同一实例内做状态同步
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
    const msg = await decodeClientWsMsg(evt.data);
    if (!msg) return;

    const now = Date.now();

    if (!client) {
      if (msg.t !== "hello") return;

      clearTimeout(helloTimer);

      // 检查是否允许同名玩家
      if (!CONFIG.ALLOW_DUPLICATE_NAMES) {
        const existingClient = Array.from(clients.values()).find(c => c.name === msg.name);
        if (existingClient) {
          await wsSend(socket, { t: "error", message: "该用户名已在线，请使用其他名称或稍后再试" });
          try {
            socket.close(4001, "duplicate name");
          } catch {
            // ignore
          }
          return;
        }
      }

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

      // 先写 cache
      playersCache.set(snap.id, snap);

      // join 事件（会广播、也会 applyEventToCache）
      await appendEventInMem({ t: "join", player: snap });

      wsSend(socket, { t: "welcome", id: client.id, world: CONFIG.WORLD, now, seed: WORLD_SEED });

      // hello 后给一份 snapshot（纯内存不再 load KV 权威集合）
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
      } catch {
        // ignore
      }
      return;
    }

    switch (msg.t) {
      case "ping":
        wsSend(client.ws, { t: "pong", now: Date.now() });
        return;

      case "chat":
        await serverHandleChat(client.id, client.name, msg);
        return;

      case "state":
        if (!stateFreqOk(client, now)) return;
        await serverHandleState(client.id, client.name, msg);
        return;

      case "snowball":
        await serverHandleSnowball(client.id, msg);
        return;

      case "hello":
        return;

      case "rename":
        client.name = msg.name;
        await serverHandleRename(client.id, msg.name);
        return;
    }
  };

  socket.onclose = async () => {
    clearTimeout(helloTimer);
    if (!client) return;

    clients.delete(client.id);

    await appendEventInMem({ t: "leave", playerId: client.id, name: client.name });
  };

  socket.onerror = () => {
    // ignore
  };

  return response;
}
