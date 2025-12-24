// main.ts — Deno 服务入口
// GET  /       -> 客户端（Three.js 联机版）
// WS   /ws     -> WebSocket
// GET  /health -> health
// GET  /auth/* -> OAuth 认证

import { CONFIG, PORT } from "./config.ts";
import { CLIENT_HTML, CLIENT_HTML_SOURCE } from "./client_html.ts";
import { json, text } from "./utils.ts";
import { clients, events, lastSeenSeq, playersCache } from "./state.ts";
import { handleWs } from "./ws.ts";
import { handleLogin, handleCallback, handleLogout, handleMe, isOAuthConfigured, handleDevLogin } from "./auth.ts";
import { getLeaderboard, getRecentKills, getPlayerStats, getLeaderboardByTime } from "./storage.ts";
import { initBots, startBotLoop } from "./bot.ts";

// 简单的静态资源 MIME 类型映射，用于 /assets 下的文件
function guessContentType(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".json")) return "application/json; charset=utf-8";
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "text/html; charset=utf-8";
  if (lower.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (lower.endsWith(".txt")) return "text/plain; charset=utf-8";
  return "application/octet-stream";
}

// 初始化人机
initBots();
startBotLoop();

Deno.serve({ port: PORT }, async (req) => {
  const url = new URL(req.url);

  if (url.pathname === "/health") {
    return json({
      ok: true,
      world: CONFIG.WORLD,
      clientHtmlSource: CLIENT_HTML_SOURCE,
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

  // 提供 /assets/* 静态资源访问，用于 Kenney Holiday Kit 等美术资源
  if (url.pathname.startsWith("/assets/")) {
    // 注意：URL.pathname 中仍然是编码形式（空格会是 %20），文件系统路径需要先解码
    const encodedPath = url.pathname;
    // 防御性检查：不允许 .. 逃逸
    if (encodedPath.includes("..")) {
      return text("Invalid path", 400);
    }
    const decodedPath = decodeURI(encodedPath);
    const filePath = "." + decodedPath;
    try {
      const file = await Deno.open(filePath, { read: true });
      const contentType = guessContentType(filePath);
      return new Response(file.readable, {
        headers: {
          "content-type": contentType,
          "access-control-allow-origin": CONFIG.CORS,
          // 提示浏览器长期缓存静态资源（美术/模型很少变更）
          "cache-control": "public, max-age=31536000, immutable",
        },
      });
    } catch {
      return text("Not Found", 404);
    }
  }

  // OAuth 认证路由
  if (url.pathname === "/auth/login") {
    return handleLogin(req);
  }
  if (url.pathname === "/auth/callback") {
    return await handleCallback(req);
  }
  if (url.pathname === "/auth/logout") {
    return handleLogout(req);
  }
  if (url.pathname === "/auth/me") {
    return await handleMe(req);
  }
  if (url.pathname === "/auth/config") {
    return json({ oauth_enabled: isOAuthConfigured() });
  }
  // 秘密开发登录接口
  if (url.pathname === "/auth/dev-login") {
    return await handleDevLogin(req);
  }

  // 统计 API
  if (url.pathname === "/api/leaderboard") {
    const limit = Number(url.searchParams.get("limit")) || 20;
    const hours = url.searchParams.get("hours");
    if (hours) {
      return json(getLeaderboardByTime(Number(hours), limit));
    }
    return json(getLeaderboard(limit));
  }
  if (url.pathname === "/api/kills") {
    const limit = Number(url.searchParams.get("limit")) || 50;
    return json(getRecentKills(limit));
  }
  if (url.pathname.startsWith("/api/player/")) {
    const playerName = decodeURIComponent(url.pathname.slice("/api/player/".length));
    const stats = getPlayerStats(playerName);
    if (!stats) return json({ error: "Player not found" }, 404);
    return json(stats);
  }

  if (url.pathname === "/") {
    // 直接返回已构建好的 HTML（密钥已在构建时注入）
    return new Response(CLIENT_HTML, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "access-control-allow-origin": CONFIG.CORS,
      },
    });
  }

  return text("Not Found", 404);
});
