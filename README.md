# SnowBrawlGame (Deno)

一个基于 Deno 的多人联机 3D 雪球对战小游戏：HTTP 提供客户端与统计 API，WebSocket 承载实时同步；支持 Linux.do OAuth2 登录、SQLite 统计与排行榜、以及简单的机器人（bot）。

## 功能概览

- 实时联机：WebSocket `/ws` 推送玩家状态与事件（加入/离开/聊天/移动/雪球/命中/死亡/复活）
- 客户端：Three.js + Kenney Holiday Kit 场景资源
- 排行榜与击杀记录：SQLite 本地文件 `snowbrawl.db`（已在 `.gitignore` 中忽略）
- OAuth 登录：Linux.do OAuth2（/auth/*）
- 开发快捷登录：`/auth/dev-login`（仅建议在本地/测试环境使用）
- 自动构建生产版 HTML：合并 `client_src/` 并调用第三方混淆服务生成 `client.prod.html`

## 目录结构

- `main.ts`：服务入口（HTTP 路由 + WS 升级 + 静态资源）
- `auth.ts`：Linux.do OAuth2 + JWT Cookie
- `ws.ts` / `state.ts`：WebSocket 连接与状态分发（实时同步）
- `game.ts`：服务端游戏逻辑（纯内存）
- `storage.ts`：SQLite 数据库（击杀记录、玩家统计、排行榜）
- `client_src/`：客户端开发源文件（拆分 JS/CSS/HTML）
- `client.prod.html`：生产版客户端（自动构建/加密后的单文件）
- `build_prod.ts`：构建生产版（合并 + 注入密钥占位符 + 混淆/包装）
- `assets/`：美术资源（Kenney Holiday Kit 等）

## 运行要求

- Deno（建议最新版）
- 运行权限：脚本使用 `deno run -A`（全权限）
- SQLite：使用 `jsr:@db/sqlite`（包含 FFI；某些环境需要正确设置 `DENO_DIR`）

## 快速启动

### Linux/macOS

```bash
./start.sh
```

`start.sh` 会：
- 固定到脚本目录运行（避免相对路径问题）
- 设置默认端口 `PORT=48230`
- 可选加载同目录 `.env`
- 设置 `DENO_DIR`（用于缓解某些环境的 SQLite FFI 加载问题）
- 启动：`deno run -A --unstable-kv main.ts`

### Windows

```bat
start.bat
```

脚本会设置 `PORT=48230` 并启动 `deno run -A --unstable-kv main.ts`。

### 访问

- 首页（客户端）：`http://localhost:48230/`
- 健康检查：`http://localhost:48230/health`

## HTTP 路由

### 客户端与静态资源

- `GET /`：返回客户端 HTML（来自 `client_html.ts` 加载逻辑）
- `GET /assets/*`：提供静态资源（带长期缓存头）

### WebSocket

- `WS /ws`：实时联机通道  
  注意：如果直接 `GET /ws`（没有 `Upgrade: websocket`），会 302 重定向回 `/`。

### OAuth

- `GET /auth/login`
- `GET /auth/callback`
- `GET /auth/logout`
- `GET /auth/me`
- `GET /auth/config`：返回 `{ oauth_enabled: boolean }`
- `GET /auth/dev-login?secret=...`：开发快捷登录（见“安全注意事项”）

### 统计 API

- `GET /api/leaderboard?limit=20`：排行榜（按累计 kills 排序）
- `GET /api/leaderboard?hours=24&limit=20`：最近 N 小时排行（按击杀记录聚合）
- `GET /api/kills?limit=50`：最近击杀列表
- `GET /api/player/{playerName}`：玩家统计（按用户名）

## 环境变量

服务端会从环境变量读取 OAuth/JWT 配置；若未设置，`auth.ts` 中当前存在默认值（这在生产环境不安全，见下方说明）。

- `PORT`：监听端口（默认 8000；`start.*` 默认设置为 48230）
- `LINUXDO_CLIENT_ID`
- `LINUXDO_CLIENT_SECRET`
- `LINUXDO_REDIRECT_URI`（例如 `http://localhost:48230/auth/callback`）
- `JWT_SECRET`（用于签发/校验登录 Cookie）
- `LINUXDO_USE_CN`：默认使用 `linuxdo.org` 国内端点；设置为 `false` 则使用 `linux.do`

建议本地 `.env`（与 `start.sh` 同目录）示例：

```ini
PORT=48230
LINUXDO_CLIENT_ID=...
LINUXDO_CLIENT_SECRET=...
LINUXDO_REDIRECT_URI=http://localhost:48230/auth/callback
JWT_SECRET=please_change_me
LINUXDO_USE_CN=true
```

## 数据库

- 文件名：`snowbrawl.db`
- 由 `storage.ts` 初始化表结构并定期清理旧击杀记录（默认保留 30 天）
- 已在 `.gitignore` 中忽略：`*.db`, `*.db-shm`, `*.db-wal`

提示：仓库历史中曾误提交过数据库文件，已通过重写历史移除。

## 客户端构建（生产版）

`client_html.ts` 的策略是：
- 如果检测到 `client_src/` 的文件更新时间比 `client.prod.html` 新，会自动构建生产版；
- 最终对外返回 `client.prod.html`（并记录 `CLIENT_HTML_SOURCE` 状态）。

你也可以手动强制构建：

```bash
deno run -A build_prod.ts --force
```

构建过程要点：
- 读取 `client_src/style.css`、`client_src/body.html`
- 按固定顺序合并 `client_src/*.js`
- 将客户端代码中的 `__WS_AES_KEY__` 占位符替换为 `config.ts` 的 `WS_AES_KEY_HEX`
- 调用第三方 `jshaman` API 混淆/加密 JS，并进行 base64 包装后 `eval` 执行
- 写入 `client.prod.html`

## 协议概览（WS）

协议类型定义在 `protocol.ts`：

客户端消息 `ClientMsg`（示例）：
- `hello`：进入世界/初始化
- `state`：位置/朝向/速度/蹲伏/延迟（pingMs）
- `chat`：聊天消息
- `snowball`：发射雪球（带 shotId 去重）
- `ping`：心跳
- `rename`：改名

服务端消息 `ServerMsg`（示例）：
- `welcome`：分配 id、世界信息、seed
- `snapshot`：玩家快照
- `event`：世界事件流（join/leave/chat/state/snowball/hit/death/respawn）
- `pong`：心跳响应
- `error`：错误消息

## 安全注意事项（重要）

当前代码中存在几处“仅适合本地/测试”的默认值与机制，部署到公网前建议处理：

1) OAuth/JWT 默认值不安全  
`auth.ts` 中 `LINUXDO_CLIENT_ID` / `LINUXDO_CLIENT_SECRET` / `JWT_SECRET` 如果未设置环境变量，会回退到硬编码字符串。  
生产环境务必通过环境变量覆盖，并考虑移除默认值（避免误部署）。

2) `/auth/dev-login` 不应在公网长期开放  
当前实现使用 `secret` 参数与 `LINUXDO_CLIENT_SECRET` 比对。即使你设置了真正的 client_secret，也不建议拿它当“开发口令”。  
建议：
- 仅在开发环境启用（比如增加 `DEV_LOGIN_ENABLED=true` 才允许）
- 或使用单独的 `DEV_LOGIN_SECRET`，且与 OAuth client_secret 分离

3) WebSocket AES key 与前端注入  
`config.ts` 里 `WS_AES_KEY_HEX` 当前是硬编码；构建时会注入到客户端 JS。  
这更像“轻量混淆”，不能作为真正的安全边界；如果你依赖它做防作弊/防抓包，需要重新评估威胁模型。

4) 第三方混淆服务的隐私风险  
`build_prod.ts` 会把合并后的客户端 JS 上传到 `https://www.jshaman.com:4430/submit_js_code/`。  
如果客户端代码包含敏感逻辑或你介意代码外传，请替换为本地混淆方案。

## License / Assets

`assets/kenney_holiday_kit/` 内含 Kenney 资源与许可文件（见 `License.txt`）。