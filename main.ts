// main.ts — Deno 服务入口
// GET  /       -> 客户端（Three.js 联机版）
// WS   /ws     -> WebSocket
// GET  /health -> health

import { CONFIG, PORT } from "./config.ts";
import { CLIENT_HTML } from "./client_html.ts";
import { json, text } from "./utils.ts";
import { clients, events, lastSeenSeq, playersCache } from "./state.ts";
import { handleWs } from "./ws.ts";

Deno.serve({ port: PORT }, async (req) => {
  const url = new URL(req.url);

  if (url.pathname === "/health") {
    return json({
      ok: true,
      world: CONFIG.WORLD,
      connectionsOnThisIsolate: clients.size,
      latestSeq: lastSeenSeq,
      playersCachedOnThisIsolate: playersCache.size,
      eventsInMemory: events.length,
    });
  }

  if (url.pathname === "/ws") {
    // 如果是普通 GET 请求 /ws（例如被 anti-bot 或爬虫直接访问），重定向回首页
    const upgrade = req.headers.get("upgrade") || req.headers.get("Upgrade");
    if (!upgrade || upgrade.toLowerCase() !== "websocket") {
      const redirectUrl = new URL("/", req.url);
      return Response.redirect(redirectUrl, 302);
    }
    // 正常的 WebSocket 握手（带 Upgrade: websocket）才交给 WS 处理
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
