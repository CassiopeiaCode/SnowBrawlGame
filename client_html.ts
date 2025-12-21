// client_html.ts - 提取自旧 main.ts
export const CLIENT_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>MC圣诞雪球大乱斗</title>
  <style>
    body { margin: 0; overflow: hidden; background-color: #D6EAF8; font-family: 'Courier New', Courier, monospace; user-select: none; }
    
    #canvas-container { width: 100vw; height: 100vh; display: block; }

    #ui-layer {
      position: absolute; top: 0; left: 0; width: 100%; height: 100%;
      pointer-events: none; display: flex; flex-direction: column; justify-content: space-between;
    }

    /* MC 风格 UI */
    #chat-container {
      pointer-events: auto;
      background: rgba(0, 0, 0, 0.6);
      padding: 10px; margin: 20px; border: 2px solid #aaa;
      width: 340px; display: flex; flex-direction: column;
      image-rendering: pixelated;
    }

    #chat-log {
      max-height: 180px;
      overflow-y: auto;
      font-size: 13px;
      color: #EEEEEE;
      margin-bottom: 6px;
    }
    #chat-log div {
      margin: 2px 0;
      word-break: break-word;
    }

    input[type="text"] {
      width: 100%; padding: 8px; border: 2px solid #555;
      margin-top: 5px; box-sizing: border-box;
      background: #333; color: white; outline: none; font-family: inherit; font-weight: bold;
    }
    input[type="text"]:focus { border-color: #fff; background: #000; }

    #controls-hint {
      position: absolute; top: 20px; right: 20px;
      background: rgba(0,0,0,0.6); color: #eee;
      padding: 15px; border: 2px solid #aaa; text-align: right; pointer-events: none;
      line-height: 1.6; font-size: 14px; font-weight: bold;
    }

    .key {
      background: #bbb; color: #222; box-shadow: 0 2px 0 #555;
      padding: 2px 6px; border-radius: 2px; font-weight: bold;
      margin: 0 2px; display: inline-block;
    }

    #crosshair {
      position: absolute; top: 50%; left: 50%; width: 18px; height: 18px; pointer-events: none;
      transform: translate(-50%, -50%);
    }
    #crosshair::before, #crosshair::after {
      content: ''; position: absolute; background: rgba(255,255,255,0.9); mix-blend-mode: difference;
    }
    #crosshair::before { top: 8px; left: 0; width: 18px; height: 2px; }
    #crosshair::after { left: 8px; top: 0; width: 2px; height: 18px; }

    #net-status { margin-top: 5px; font-size: 14px; color: #FFFF55; text-shadow: 2px 2px 0 #000; }

    #hp-bar-bg { margin-top: 5px; width: 100%; height: 12px; background: #333; border: 2px solid #000; }
    #hp-bar-fill { width: 100%; height: 100%; background: #ff3333; image-rendering: pixelated; }
    #hp-text { font-size: 14px; color: white; margin-top: 2px; text-shadow: 2px 2px 0 #000; text-align: center; }
    
    #click-to-play {
        position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
        color: #fff; font-size: 24px; font-weight: bold; text-shadow: 3px 3px 0 #000;
        background: rgba(0,0,0,0.5); padding: 20px; border: 4px solid #fff;
        pointer-events: none; text-align: center;
    }
  </style>
</head>
<body>

<div id="dead-overlay" style="
  position:fixed; inset:0; display:none; align-items:center; justify-content:center;
  background:rgba(150,0,0,0.6); color:white; font-size:48px; font-weight:bold; z-index:9999;
  text-shadow:4px 4px 0 #000; flex-direction: column;
">
  <div>你死了!</div>
  <div style="font-size: 24px; margin-top: 10px;">重生倒计时...</div>
</div>

  <div id="canvas-container"></div>
  <div id="crosshair"></div>
  <div id="click-to-play">点击屏幕<br>加入雪球大战</div>

  <div id="ui-layer">
    <div id="chat-container">
      <div style="color: #55FF55; font-weight:bold; font-size: 16px; margin-bottom: 4px; text-shadow: 2px 2px 0 #000;">🎄 MC 圣诞服</div>
      <div id="chat-log"></div>
      <input type="text" id="name-input" placeholder="输入昵称" maxlength="12" />
      <input type="text" id="chat-input" placeholder="按 T 或回车聊天" maxlength="80" />
      <div id="net-status">🔴 未连接</div>
      <div id="hp-bar-bg"><div id="hp-bar-fill"></div></div>
      <div id="hp-text">❤❤❤❤❤</div>
    </div>

    <div id="controls-hint">
      <p><span class="key">W</span><span class="key">A</span><span class="key">S</span><span class="key">D</span> 移动</p>
      <p><span class="key">SHIFT</span> 潜行</p>
      <p><span class="key">SPACE</span> 跳跃</p>
      <p><span class="key">左键</span> 丢雪球</p>
      <p><span class="key">R</span>旋转嘲讽</p>
      <p><span class="key">V</span> 切换第一/第三人称</p>
      <p><span class="key">H</span> 隐藏/显示 UI</p>
      <p>ESC 释放鼠标</p>
    </div>
  </div>

  <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>

	  <script>
	    // 简单 randomUUID 兼容实现：优先使用原生，其次使用 getRandomValues，最后退回 Math.random
	    function randomId() {
      const g = (typeof crypto !== "undefined") ? crypto : (typeof window !== "undefined" ? (window.crypto || window.msCrypto) : null);
      if (g && typeof g.randomUUID === "function") {
        return g.randomUUID();
      }
      if (g && typeof g.getRandomValues === "function") {
        const buf = new Uint8Array(16);
        g.getRandomValues(buf);
        buf[6] = (buf[6] & 0x0f) | 0x40;
        buf[8] = (buf[8] & 0x3f) | 0x80;
        const hex = Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
        return (
          hex.slice(0, 8) + "-" +
          hex.slice(8, 12) + "-" +
          hex.slice(12, 16) + "-" +
          hex.slice(16, 20) + "-" +
          hex.slice(20)
        );
      }
	      return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
	    }

	    function appendChatLog(line) {
	      const log = document.getElementById("chat-log");
	      if (!log) return;
	      const item = document.createElement("div");
	      item.textContent = line;
	      log.appendChild(item);
	      // 只保留最近 50 条
	      while (log.childNodes.length > 50) {
	        log.removeChild(log.firstChild);
	      }
	      log.scrollTop = log.scrollHeight;
	      // 30 秒后自动移除这条消息
	      setTimeout(() => {
	        if (item.parentNode === log) {
	          log.removeChild(item);
	        }
	      }, 30_000);
	    }
	    // 简单字符串哈希，用于把名字映射到稳定的颜色
	    function hashString(str) {
	      let h = 0;
	      for (let i = 0; i < str.length; i++) {
	        h = ((h << 5) - h + str.charCodeAt(i)) | 0;
	      }
	      return h >>> 0;
	    }
	    // 马卡龙色系调色板（柔和的粉色/蓝色/绿色等）
	    const PASTEL_COLORS = [
	      0xFFB3BA, // 粉红
	      0xFFDFBA, // 桃色
	      0xFFFFBA, // 淡黄
	      0xBAFFC9, // 薄荷绿
	      0xBAE1FF, // 婴儿蓝
	      0xE0BBE4, // 薰衣草紫
	      0xFFD6E0, // 淡玫瑰
	      0xCFFAFE, // 浅青
	    ];
	    function pickPastelPair(key) {
	      const h = hashString(key || "");
	      const main = PASTEL_COLORS[h % PASTEL_COLORS.length];
	      let pants = PASTEL_COLORS[(h >> 3) % PASTEL_COLORS.length];
	      if (pants === main) {
	        pants = PASTEL_COLORS[(h >> 5) % PASTEL_COLORS.length];
	      }
	      return { shirt: main, pants };
	    }
	    // 简单种子随机数（mulberry32）
	    function makeRng(seed) {
	      let s = seed >>> 0;
	      return function() {
	        s |= 0;
	        s = (s + 0x6D2B79F5) | 0;
	        let t = Math.imul(s ^ (s >>> 15), 1 | s);
	        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
	        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	      };
	    }
    // 地形高度函数：基于世界种子 + 三角函数叠加，制造起伏较大的地形
    function terrainHeight(x, z) {
      const scale1 = 0.06;
      const scale2 = 0.12;
      const s = worldSeed * 0.0001;
      const n1 = Math.sin(x * scale1 + s * 13.37) + Math.cos(z * scale1 - s * 7.21);
      const n2 = Math.sin((x + 1000) * scale2 - s * 3.17) - Math.cos((z - 500) * scale2 + s * 9.99);
      let h = n1 * 0.7 + n2 * 0.3;
      // 增加陡峭程度，并整体抬高到 > 0（避免服务端 y<0 时的隐形地板问题）
      const sign = h >= 0 ? 1 : -1;
      h = sign * Math.pow(Math.abs(h), 1.8) * 2.5; // 原始约 [-5, 5]
      return h + 6; // 整体抬升，保证最低高度 > 0
    }
    const CONFIG = {
      gravity: 22,
      moveSpeed: 8,       
      crouchSpeed: 3,  
      jumpForce: 9.5,
      snowballSpeed: 28,
      snowballCooldown: 250, 
      netSendHz: 20,
      remoteLerp: 12,
      lookSensitivity: 0.002,
      minPitch: -1.5, maxPitch: 1.5, 
      mapHalf: 95,
    };

    let scene, camera, renderer, clock;
    let localPlayer = null;
    let localPlayerId = null;

    const players = [];
    const playersById = new Map();
    const snowballsById = new Map();
    let snowballs = [];

    let networkManager;
    let cameraYaw = 0;
    let cameraPitch = 0;
    let cameraMode = "third"; // "third" or "first" person view
    let uiHidden = false;     // 是否隐藏左侧聊天和右侧按键提示

    let isPointerLocked = false;

    // 世界种子与环境
    let worldSeed = 1;
    let snowSystem = null;
    let environmentReady = false;

    function setDeadUI(on) {
      document.getElementById("dead-overlay").style.display = on ? "flex" : "none";
    }
    function setHpUI(hp) {
      const pct = Math.max(0, Math.min(100, hp));
      document.getElementById("hp-bar-fill").style.width = pct + "%";
      const hearts = Math.ceil(hp / 20); 
      document.getElementById("hp-text").textContent = "❤".repeat(Math.max(0, hearts));
    }

    class NetworkManager {
      constructor() {
        this.ws = null;
        this.connected = false;
        this.lastStateSend = 0;
        this.pendingSnapshot = null;
        this.lastPingMs = null;
        this.lastPingSentAt = 0;
        this.pingIntervalMs = 2000;
        this.pingTimerId = null;
        this.playerName = null;
        this.connectAttempts = 0;
        this.maxConnectAttempts = 5;
        this.baseReconnectDelayMs = 1000;
      }
      sendRename(name) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify({ t: "rename", name })); }
      status(text, color) {
        const el = document.getElementById("net-status");
        el.textContent = text; if(color) el.style.color = color;
      }
      wsUrl() {
        const proto = location.protocol === "https:" ? "wss" : "ws";
        return proto + "://" + location.host + "/ws";
      }
      scheduleReconnect() {
        if (this.connectAttempts >= this.maxConnectAttempts) {
          this.status("🔴 多次重连失败，正在刷新页面...", "#FF5555");
          setTimeout(() => {
            try {
              location.reload();
            } catch {
              // ignore
            }
          }, 1500);
          return;
        }
        this.connectAttempts++;
        const delay = Math.min(
          this.baseReconnectDelayMs * Math.pow(2, this.connectAttempts - 1),
          30000,
        );
        const secs = Math.round(delay / 100) / 10;
        this.status("🟡 连接断开，第 " + this.connectAttempts + " 次重连，" + secs + " 秒后重试...", "#FFFF55");
        setTimeout(() => {
          this.connect(this.playerName || "Player");
        }, delay);
      }
      startPingLoop() {
        if (this.pingTimerId) return;
        const tick = () => {
          if (!this.ws || this.ws.readyState !== 1) {
            this.pingTimerId = null;
            return;
          }
          this.lastPingSentAt = performance.now();
          try {
            this.ws.send(JSON.stringify({ t: "ping", now: Date.now() }));
          } catch {
            // ignore
          }
          this.pingTimerId = setTimeout(tick, this.pingIntervalMs);
        };
        tick();
      }
      connect(playerName) {
        if (playerName) this.playerName = playerName;
        this.status("🟡 连接中...", "#FFFF55");
        const ws = new WebSocket(this.wsUrl());
        this.ws = ws;

        ws.onopen = () => {
          this.connected = true;
          this.connectAttempts = 0;
          this.status("🟢 已连接", "#55FF55");
          ws.send(JSON.stringify({ t: "hello", name: this.playerName || playerName }));
          this.startPingLoop();
        };
        ws.onclose = () => {
          this.connected = false;
          if (this.pingTimerId) {
            clearTimeout(this.pingTimerId);
            this.pingTimerId = null;
          }
          this.scheduleReconnect();
        };
        ws.onmessage = (ev) => {
	          let msg; try { msg = JSON.parse(ev.data); } catch { return; }
	
	          if (msg.t === "welcome") {
            // 新连接 / 重连：如果已有本地玩家且 id 不同，清理旧的本地玩家
            if (localPlayer && localPlayer.id !== msg.id) {
              removePlayer(localPlayer.id);
              localPlayer = null;
            }
            localPlayerId = msg.id;
            if (typeof msg.seed === "number") {
              worldSeed = msg.seed;
              ensureEnvironment();
            } else {
              ensureEnvironment();
            }
            if (this.pendingSnapshot) { this.applySnapshot(this.pendingSnapshot); this.pendingSnapshot = null; }

          } else if (msg.t === "snapshot") {
            if (!localPlayerId) this.pendingSnapshot = msg.players || [];
            else this.applySnapshot(msg.players || []);

          } else if (msg.t === "states") {
            // ✅ 新增：服务器 20Hz 合并状态流（比 event state + 高频 snapshot 更顺滑）
            const list = msg.list || [];
            for (const s of list) {
              if (!s?.id) continue;
              if (s.id === localPlayerId) continue;

              let rp = playersById.get(s.id);
              if (!rp) {
                // 名字可能还没拿到，先占位，2Hz snapshot 会纠正 name
                rp = new PlayerModel(scene, s.id, s.pos, "Player", true);
                players.push(rp);
                playersById.set(s.id, rp);
              }
              rp.setRemoteTarget(s.pos, s.rotY, s.vel, !!s.crouch);
            }

          } else if (msg.t === "event") {
            this.applyEvent(msg.ev);
          } else if (msg.t === "pong") {
            if (this.lastPingSentAt) {
              const rtt = performance.now() - this.lastPingSentAt;
              this.lastPingMs = Math.round(rtt);
              this.status("🟢 已连接 - ping: " + this.lastPingMs + " ms", "#55FF55");
            }
          }
        };

      }
      sendChat(text) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify({ t: "chat", text })); }
      maybeSendLocalState() {
        if (this.ws?.readyState !== 1 || !localPlayer) return;
        const now = performance.now();
        if (now - this.lastStateSend < (1000 / CONFIG.netSendHz)) return;
        this.lastStateSend = now;
        const { mesh, velocity } = localPlayer;
        this.ws.send(JSON.stringify({
          t: "state",
          pos: { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z },
          rotY: mesh.rotation.y,
          vel: { x: velocity.x, y: velocity.y, z: velocity.z },
          crouch: !!localPlayer.input.shift,
          pingMs: typeof this.lastPingMs === "number" ? this.lastPingMs : undefined,
        }));
      }
      sendSnowball(shotId, dir) {
        if (this.ws?.readyState === 1) {
          this.ws.send(JSON.stringify({ t: "snowball", id: shotId, dir, ts: Date.now() }));
        }
      }
      applySnapshot(list) {
        const ids = new Set();
        for (const snap of list) {
          if (!snap.id) continue;
          ids.add(snap.id);
          if (snap.id === localPlayerId) {
            if (!localPlayer) createLocalPlayer(snap);
            const snapAt = snap.updatedAt ?? 0;
            const lastHpAt = localPlayer.lastHpAt ?? 0;
            if (snapAt >= lastHpAt) {
              localPlayer.health = snap.hp ?? localPlayer.health ?? 100;
              localPlayer.lastHpAt = snapAt;
              setHpUI(localPlayer.health);
            }
            // 本地玩家也可以在头顶看到自己的 ping（可选体验）
            if (typeof snap.pingMs === "number" && localPlayer) {
              localPlayer.updatePing(snap.pingMs);
            }
            continue;
          } else {
            let rp = playersById.get(snap.id);
            if (!rp) {
              rp = new PlayerModel(scene, snap.id, snap.pos, snap.name, true);
              players.push(rp); playersById.set(snap.id, rp);
            }
            rp.setRemoteTarget(snap.pos, snap.rotY, snap.vel, !!snap.crouch);
            rp.updateNameLabel(snap.name);
            if (typeof snap.pingMs === "number") {
              rp.updatePing(snap.pingMs);
            }
          }
        }
        for (const [id, p] of playersById.entries()) {
          if (id !== localPlayerId && !ids.has(id)) { removePlayer(id); }
        }
      }
	      applyEvent(ev) {
	        if (!ev) return;
	        switch (ev.t) {
	          case "join":
	            // 在收到 welcome 之前忽略 join 事件，避免把自己当作远程玩家创建一次
	            if (!localPlayerId) break;
	            if (ev.player.id === localPlayerId) {
	              if (!localPlayer) createLocalPlayer(ev.player);
	            } else {
	              if (!playersById.has(ev.player.id)) {
	                const rp = new PlayerModel(scene, ev.player.id, ev.player.pos, ev.player.name, true);
	                players.push(rp);
	                playersById.set(ev.player.id, rp);
	              }
	            }
	            break;
	          case "leave": removePlayer(ev.playerId); break;
	          case "chat":
	            {
	              const p = playersById.get(ev.playerId);
	              const name = p ? p.name : ev.name;
	              if (p) p.showChat(ev.text);
	              appendChatLog(name + ": " + ev.text);
	            }
	            break;
          case "state":
            const remote = playersById.get(ev.playerId);
            if(remote && ev.playerId !== localPlayerId) {
              remote.setRemoteTarget(ev.pos, ev.rotY, ev.vel, !!ev.crouch);
            }
            break;
          case "snowball":
            if (snowballsById.has(ev.id)) return;
            const sb = new Snowball(ev.id, ev.origin, ev.dir, ev.ownerId);
            snowballs.push(sb); snowballsById.set(ev.id, sb);
            break;
	          case "hit": 
	            {
	              const victim = playersById.get(ev.victimId);
	              if (victim) victim.onHit();
	              if (ev.victimId === localPlayerId && localPlayer) {
	                localPlayer.applyKnockback(ev.impulse);
	                localPlayer.health = ev.victimHp;
	                localPlayer.lastHpAt = ev.at || Date.now();
	                setHpUI(localPlayer.health);
	                const flash = document.createElement("div");
	                flash.style.position = "absolute"; flash.style.top=0; flash.style.left=0;
	                flash.style.width="100%"; flash.style.height="100%";
	                flash.style.background="rgba(255,0,0,0.3)"; flash.style.pointerEvents="none";
	                document.body.appendChild(flash);
	                setTimeout(()=>flash.remove(), 100);
	                if (localPlayer.health <= 0) { localPlayer.dead = true; setDeadUI(true); }
	              }
	            }
	            break;
          case "rename": 
            { const p = playersById.get(ev.playerId); if (p) p.updateNameLabel(ev.name); } break;
          case "death":
            {
              const victim = playersById.get(ev.victimId);
              if (victim) {
                victim.dead = true;
                // 本地玩家死亡：显示“你死了”遮罩
                if (victim.id === localPlayerId) setDeadUI(true);
                // 远程玩家死亡：不再隐藏 mesh，让他们以倒地姿态留在场景中
              }
            }
            break;
          case "respawn":
            { const p = playersById.get(ev.playerId); if (p) { p.dead = false; p.health = ev.hp ?? 100; p.mesh.visible = true; p.mesh.position.set(ev.pos.x, ev.pos.y, ev.pos.z); if (p.id === localPlayerId) { setDeadUI(false); setHpUI(p.health); } } } break;
        }
      }
    }

    function createLocalPlayer(snap) {
      localPlayer = new PlayerModel(scene, snap.id, snap.pos, snap.name, false);
      players.push(localPlayer);
      localPlayer.lastHpAt = snap.updatedAt ?? 0;
      playersById.set(snap.id, localPlayer);
      cameraYaw = snap.rotY || 0;
      localPlayer.health = snap.hp ?? 100;
      setHpUI(localPlayer.health);
    }
    function removePlayer(id) {
      const p = playersById.get(id);
      if (p) { p.destroy(); playersById.delete(id); const idx = players.indexOf(p); if (idx >= 0) players.splice(idx, 1); }
    }

	    // --- MC 风格人物模型 (节日版) ---
		    class PlayerModel {
		      constructor(scene, id, pos, name, isRemote) {
		        this.id = id;
		        this.isRemote = isRemote;
		        this.name = name;
	        this.pingMs = null;
	        this.scene = scene;
        this.dead = false;
        this.health = 100;
        this.lastShotAt = 0;
        
        this.velocity = new THREE.Vector3();
        this.onGround = false;
        this.isCrouching = false;
        this.targetCrouch = false;
        
	        this.input = { w: false, a: false, s: false, d: false, space: false, shift: false, r: false };
	        
	        this.targetPos = new THREE.Vector3(pos.x, pos.y, pos.z);
	        this.targetRotY = 0;
	        this.targetVel = new THREE.Vector3();

	        // 基于玩家名字的马卡龙配色：相同名字 -> 相同颜色
	        const paletteKey = (name && name.trim()) ? name.trim() : id;
	        const pastel = pickPastelPair(paletteKey);
	        const buttonColor = 0xFFFFFF;
	        
		        this.skinMat = new THREE.MeshStandardMaterial({ color: 0xFACC9E }); 
		        this.shirtMat = new THREE.MeshStandardMaterial({ color: pastel.shirt });
		        this.pantsMat = new THREE.MeshStandardMaterial({ color: pastel.pants });
	        this.baseColors = {
	          skin: this.skinMat.color.getHex(),
	          shirt: this.shirtMat.color.getHex(),
	          pants: this.pantsMat.color.getHex(),
	        };
	        this.hitFlashTime = 0;

	        this.mesh = new THREE.Group();
	        // 对于本地玩家，初始 Y 取地形高度，避免出生时悬空/埋地
	        const initialY = isRemote ? pos.y : terrainHeight(pos.x, pos.z);
	        this.mesh.position.set(pos.x, initialY, pos.z);

        // --- 1. 身体 ---
        this.bodyGroup = new THREE.Group();
        this.bodyGroup.position.y = 0.75; 
        this.mesh.add(this.bodyGroup);

	        const torsoGeo = new THREE.BoxGeometry(0.4, 0.6, 0.2);
	        this.torso = new THREE.Mesh(torsoGeo, this.shirtMat);
        this.torso.position.y = 0.3; 
        this.torso.castShadow = true;
        this.bodyGroup.add(this.torso);

	        const buttonGeo = new THREE.BoxGeometry(0.05, 0.05, 0.02);
	        const btnMat = new THREE.MeshBasicMaterial({ color: buttonColor });
        const btn1 = new THREE.Mesh(buttonGeo, btnMat); btn1.position.set(0, 0.4, 0.11); this.bodyGroup.add(btn1);
        const btn2 = new THREE.Mesh(buttonGeo, btnMat); btn2.position.set(0, 0.2, 0.11); this.bodyGroup.add(btn2);

        // --- 2. 头 & 圣诞帽 ---
        this.headGroup = new THREE.Group();
        this.headGroup.position.y = 0.6; 
        this.bodyGroup.add(this.headGroup);

	        const headGeo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
	        this.head = new THREE.Mesh(headGeo, this.skinMat);
        this.head.position.y = 0.2; 
        this.head.castShadow = true;
        this.headGroup.add(this.head);

        const eyeMat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
        const pupilMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
        const eyeL = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.08), eyeMat); eyeL.position.set(-0.1, 0.2, -0.201); eyeL.rotation.y = Math.PI; this.headGroup.add(eyeL);
        const pupilL = new THREE.Mesh(new THREE.PlaneGeometry(0.04, 0.04), pupilMat); pupilL.position.set(-0.1, 0.2, -0.202); pupilL.rotation.y = Math.PI; this.headGroup.add(pupilL);
        const eyeR = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.08), eyeMat); eyeR.position.set(0.1, 0.2, -0.201); eyeR.rotation.y = Math.PI; this.headGroup.add(eyeR);
        const pupilR = new THREE.Mesh(new THREE.PlaneGeometry(0.04, 0.04), pupilMat); pupilR.position.set(0.1, 0.2, -0.202); pupilR.rotation.y = Math.PI; this.headGroup.add(pupilR);

        const hatBase = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.12, 0.44), new THREE.MeshStandardMaterial({color: 0xFFFFFF}));
        hatBase.position.y = 0.4; 
        this.headGroup.add(hatBase);
        
        const hatTop1 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.15, 0.3), new THREE.MeshStandardMaterial({color: 0xD32F2F}));
        hatTop1.position.set(0, 0.53, 0); 
        this.headGroup.add(hatTop1);
        
        const hatTop2 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.15, 0.2), new THREE.MeshStandardMaterial({color: 0xD32F2F}));
        hatTop2.position.set(0, 0.65, -0.05); 
        this.headGroup.add(hatTop2);

        const hatBall = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshStandardMaterial({color: 0xFFFFFF}));
        hatBall.position.set(0, 0.7, -0.15);
        this.headGroup.add(hatBall);

        // --- 3. 四肢 ---
        const limbGeo = new THREE.BoxGeometry(0.18, 0.6, 0.18);
        const createLimb = (x, y, mat) => {
            const pivot = new THREE.Group();
            pivot.position.set(x, y, 0);
            const mesh = new THREE.Mesh(limbGeo, mat);
            mesh.position.y = -0.3; 
            mesh.castShadow = true;
            pivot.add(mesh);
            return pivot;
        };

	        this.rightArm = createLimb(0.29, 0.55, this.shirtMat);
        this.bodyGroup.add(this.rightArm);
	        this.leftArm = createLimb(-0.29, 0.55, this.shirtMat);
        this.bodyGroup.add(this.leftArm);

	        this.rightLeg = createLimb(0.1, 0.75, this.pantsMat);
        this.mesh.add(this.rightLeg);
	        this.leftLeg = createLimb(-0.1, 0.75, this.pantsMat);
        this.mesh.add(this.leftLeg);

	        this.nameSprite = this.createTextSprite(this.displayName(), 24, false);
        this.nameSprite.position.y = 2.4;
        this.mesh.add(this.nameSprite);

        this.chatSprite = this.createTextSprite("", 20, true);
        this.chatSprite.visible = false;
        this.chatSprite.position.y = 2.8;
        this.mesh.add(this.chatSprite);

        this.walkTime = 0;
        this.attackTime = 0; 
        scene.add(this.mesh);
      }

	      destroy() { if(this.mesh) this.scene.remove(this.mesh); }

	      displayName() {
	        if (typeof this.pingMs === "number") {
	          return this.name + " (" + this.pingMs + "ms)";
	        }
	        return this.name;
	      }

	      onHit() {
	        this.hitFlashTime = 0.25; // 250ms 闪红
	      }

	      updateNameLabel(name) {
	        if (this.name === name) return;
	        this.name = name;
	        this.mesh.remove(this.nameSprite);
	        this.nameSprite = this.createTextSprite(this.displayName(), 24, false);
	        this.nameSprite.position.y = 2.4;
	        this.mesh.add(this.nameSprite);
	      }

	      updatePing(pingMs) {
	        this.pingMs = pingMs;
	        // 重建名字精灵以更新显示的 ping
	        this.mesh.remove(this.nameSprite);
	        this.nameSprite = this.createTextSprite(this.displayName(), 24, false);
	        this.nameSprite.position.y = 2.4;
	        this.mesh.add(this.nameSprite);
	      }

      createTextSprite(text, fontSize, isBubble) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const w = 512, h = 128; canvas.width = w; canvas.height = h;
        if (isBubble) {
          ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
          ctx.fillRect(10,10,w-20,h-20);
          ctx.strokeStyle = "#fff"; ctx.lineWidth = 6; ctx.strokeRect(10,10,w-20,h-20);
          ctx.fillStyle = "#fff";
        } else {
          ctx.fillStyle = "#fff";
          ctx.shadowColor = "rgba(0,0,0,1)"; ctx.shadowBlur = 6; ctx.shadowOffsetX = 3; ctx.shadowOffsetY = 3;
        }
        ctx.font = "bold " + (fontSize*2) + "px 'Courier New'";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(text, w/2, h/2);
        const tex = new THREE.CanvasTexture(canvas);
        tex.magFilter = THREE.NearestFilter; 
        const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
        const sprite = new THREE.Sprite(mat);
        sprite.scale.set(3, 0.75, 1);
        return sprite;
      }

      showChat(text) {
        this.mesh.remove(this.chatSprite);
        this.chatSprite = this.createTextSprite(text, 20, true);
        this.chatSprite.position.y = 2.8;
        this.chatSprite.visible = true;
        this.mesh.add(this.chatSprite);
        if (this.chatTimer) clearTimeout(this.chatTimer);
        this.chatTimer = setTimeout(() => { this.chatSprite.visible = false; }, 5000);
      }

	      setRemoteTarget(pos, rotY, vel, crouch) {
	        const half = CONFIG.mapHalf;
	        const clampedX = THREE.MathUtils.clamp(pos.x, -half, half);
	        const clampedZ = THREE.MathUtils.clamp(pos.z, -half, half);
	        this.targetPos.set(clampedX, pos.y, clampedZ);
        this.targetRotY = rotY;
        this.targetVel.set(vel.x, vel.y, vel.z);
        this.targetCrouch = !!crouch;
      }

      throwSnowball() {
        if (this.dead) return;
        if (!networkManager) return;
        const now = performance.now();
        if (now - this.lastShotAt < CONFIG.snowballCooldown) return;
        this.lastShotAt = now;
        this.attackTime = 1.0; 

        const shotId = randomId();
        const euler = new THREE.Euler(cameraPitch, this.mesh.rotation.y, 0, 'YXZ');
        const dir = new THREE.Vector3(0, 0, -1).applyEuler(euler).normalize();
        const origin = this.mesh.position.clone();
        origin.y += 1.4; 
        origin.add(dir.clone().multiplyScalar(0.5));

        const sb = new Snowball(shotId, origin, dir, this.id);
        snowballs.push(sb);
        snowballsById.set(shotId, sb);
        networkManager.sendSnowball(shotId, { x: dir.x, y: dir.y, z: dir.z });
      }

      applyKnockback(impulse) {
        this.velocity.x += impulse.x; this.velocity.y += impulse.y; this.velocity.z += impulse.z;
        this.onGround = false;
      }

	      update(dt) {
	        if (this.dead) {
	             this.mesh.rotation.x = -Math.PI / 2;
             this.mesh.position.y = terrainHeight(this.mesh.position.x, this.mesh.position.z) + 0.2;
	             return;
        } else {
             this.mesh.rotation.x = 0; 
	        }

        if (this.isRemote) {
          const k = 1 - Math.exp(-CONFIG.remoteLerp * dt);
          this.mesh.position.lerp(this.targetPos, k);
          let curY = this.mesh.rotation.y;
          let tarY = this.targetRotY;
          while (tarY - curY > Math.PI) curY += Math.PI * 2;
          while (tarY - curY < -Math.PI) curY -= Math.PI * 2;
          this.mesh.rotation.y = curY + (tarY - curY) * k;
          this.velocity.lerp(this.targetVel, k);
          this.isCrouching = this.targetCrouch;
	        } else {
	          let speed = CONFIG.moveSpeed;
	          this.isCrouching = this.input.shift;
	          if (this.isCrouching) speed = CONFIG.crouchSpeed;

          const moveDir = new THREE.Vector3();
          if (this.input.w) moveDir.z -= 1;
          if (this.input.s) moveDir.z += 1;
          if (this.input.a) moveDir.x -= 1;
          if (this.input.d) moveDir.x += 1;

          if (moveDir.length() > 0) {
            moveDir.normalize().applyEuler(new THREE.Euler(0, this.mesh.rotation.y, 0));
            this.velocity.x += moveDir.x * speed * dt * 8; 
            this.velocity.z += moveDir.z * speed * dt * 8;
          }

          const friction = this.onGround ? Math.exp(-10 * dt) : Math.exp(-2 * dt);
          this.velocity.x *= friction; this.velocity.z *= friction;
          this.velocity.y -= CONFIG.gravity * dt;

          if (this.input.space && this.onGround) {
            this.velocity.y = CONFIG.jumpForce;
            this.onGround = false; this.input.space = false;
          }
          
          // R 嘲讽旋转
	          if (this.input.r) {
	             this.mesh.rotation.y += 20 * dt; // 疯狂旋转
	             cameraYaw = this.mesh.rotation.y; // 同步视角
	          }
	
	          this.mesh.position.add(this.velocity.clone().multiplyScalar(dt));
	          // 限制玩家不能走出地图
	          const half = CONFIG.mapHalf;
	          this.mesh.position.x = THREE.MathUtils.clamp(this.mesh.position.x, -half, half);
	          this.mesh.position.z = THREE.MathUtils.clamp(this.mesh.position.z, -half, half);

	          const groundY = terrainHeight(this.mesh.position.x, this.mesh.position.z);
	          if (this.mesh.position.y <= groundY) {
	            this.mesh.position.y = groundY;
	            this.velocity.y = 0;
            this.onGround = true;
          }
	        }

	        this.updateAnimation(dt);

	        // 命中闪红效果：在短时间内把皮肤/衣服/裤子染红，然后恢复
	        if (this.hitFlashTime > 0) {
	          this.hitFlashTime -= dt;
	          const t = Math.max(this.hitFlashTime / 0.25, 0);
	          const flashColor = 0xFF4444;
	          this.skinMat.color.setHex(flashColor);
	          this.shirtMat.color.setHex(flashColor);
	          this.pantsMat.color.setHex(flashColor);
	        } else {
	          this.skinMat.color.setHex(this.baseColors.skin);
          this.shirtMat.color.setHex(this.baseColors.shirt);
	          this.pantsMat.color.setHex(this.baseColors.pants);
	        }
	      }

      updateAnimation(dt) {
         const hSpeed = Math.hypot(this.velocity.x, this.velocity.z);
         const isMoving = hSpeed > 0.1;
         
         const targetBodyY = this.isCrouching ? 0.60 : 0.75; 
         this.bodyGroup.position.y = THREE.MathUtils.lerp(this.bodyGroup.position.y, targetBodyY, dt * 15);
         
         // 1. 修改：大幅度前倾 (约 45度)
         const targetLean = this.isCrouching ? -0.8 : 0;
         this.bodyGroup.rotation.x = THREE.MathUtils.lerp(this.bodyGroup.rotation.x, targetLean, dt * 10);

         if (isMoving) {
             const animSpeed = this.isCrouching ? 6 : 10; 
             this.walkTime += dt * animSpeed;
             
             // 2. 修改：潜行时腿部摆幅为 0 (看起来不动)
             const amp = this.isCrouching ? 0 : 0.6;
             
             const angle = Math.sin(this.walkTime) * amp;

             this.leftLeg.rotation.x = angle;
             this.rightLeg.rotation.x = -angle;
             
             // 潜行时手臂也固定
             this.leftArm.rotation.x = -angle;
             this.rightArm.rotation.x = angle;
             this.leftArm.rotation.z = 0; 
             this.rightArm.rotation.z = 0;
             
             // 如果是潜行，手臂稍微向后摆一点，像火影跑
             if (this.isCrouching) {
                 this.leftArm.rotation.x = 0.5;
                 this.rightArm.rotation.x = 0.5;
             }

         } else {
             const lerpSpeed = dt * 10;
             this.leftLeg.rotation.x = THREE.MathUtils.lerp(this.leftLeg.rotation.x, 0, lerpSpeed);
             this.rightLeg.rotation.x = THREE.MathUtils.lerp(this.rightLeg.rotation.x, 0, lerpSpeed);
             
             const breath = Math.sin(Date.now() / 300) * 0.02;
             this.leftArm.rotation.z = 0.05 + breath; 
             this.rightArm.rotation.z = -0.05 - breath;
             
             if (this.attackTime <= 0) {
                this.leftArm.rotation.x = THREE.MathUtils.lerp(this.leftArm.rotation.x, 0, lerpSpeed);
                this.rightArm.rotation.x = THREE.MathUtils.lerp(this.rightArm.rotation.x, 0, lerpSpeed);
             }
         }

         if (this.attackTime > 0) {
             this.attackTime -= dt * 4; 
             const phase = 1.0 - this.attackTime; 
             let armRot = 0;
             if (phase < 0.2) armRot = -Math.PI/2 * (phase/0.2); 
             else armRot = -Math.PI/2 + (Math.PI/1.5) * ((phase-0.2)/0.8);
             this.rightArm.rotation.x = armRot;
         }
      }
    }

    class Snowball {
      constructor(id, pos, dir, ownerId) {
        this.id = id; this.active = true; this.ownerId = ownerId;

        // ✅ 1) 更大：0.25 -> 0.4（你也可以 0.35~0.5 自己调）
        const geo = new THREE.SphereGeometry(0.20, 12, 12); // 半径 0.20 ≈ 直径 0.40

        // ✅ 2) 更显眼：带发光（emissive），在雾/雪景里更突出
        const mat = new THREE.MeshStandardMaterial({
          color: 0xFFFFFF,
          emissive: 0x66CCFF,      // 淡蓝发光
          emissiveIntensity: 1.5,
          roughness: 0.2,
          metalness: 0.0,
        });

        this.mesh = new THREE.Mesh(geo, mat);
        this.mesh.position.copy(pos);

        // ✅ 3) 小灯：让雪球附近亮一下（非常显眼）
        this.light = new THREE.PointLight(0x99DDFF, 0.8, 6); // 颜色/强度/距离
        this.light.position.set(0, 0, 0);
        this.mesh.add(this.light);

        this.velocity = new THREE.Vector3(dir.x, dir.y, dir.z).multiplyScalar(CONFIG.snowballSpeed);
        scene.add(this.mesh);

        setTimeout(() => this.destroy(), 3000);
      }

      update(dt) {
        if (!this.active) return;
        this.velocity.y -= CONFIG.gravity * dt;
        this.mesh.position.add(this.velocity.clone().multiplyScalar(dt));
        this.mesh.rotation.x += dt * 10;
        this.mesh.rotation.y += dt * 10;
        const groundY = terrainHeight(this.mesh.position.x, this.mesh.position.z);
        if (this.mesh.position.y <= groundY) {
          // 视觉上在碰到地形时销毁雪球
          this.destroy();
        }
      }

      destroy() {
        if (!this.active) return;
        this.active = false;
        scene.remove(this.mesh);
        snowballsById.delete(this.id);
      }
    }


	    function createEnvironment() {
	      const rng = makeRng(worldSeed);
	      const groundSize = 200;
	      const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 64;
	      const ctx = canvas.getContext('2d');
	      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0,0,64,64); 
	      for(let i=0;i<200;i++) {
	          ctx.fillStyle = rng()>0.5 ? '#E0F7FA' : '#B2EBF2';
	          ctx.fillRect(Math.floor(rng()*64), Math.floor(rng()*64), 2, 2);
	      }
      const gridTex = new THREE.CanvasTexture(canvas);
      gridTex.magFilter = THREE.NearestFilter;
      gridTex.wrapS = THREE.RepeatWrapping; gridTex.wrapT = THREE.RepeatWrapping;
      gridTex.repeat.set(groundSize/4, groundSize/4);
      
	      const groundGeo = new THREE.PlaneGeometry(groundSize, groundSize, 128, 128);
	      // 先把平面旋转到 XZ 平面（Y 为高度），再写入高度
	      groundGeo.rotateX(-Math.PI / 2);
	      const posAttr = groundGeo.attributes.position;
	      const posArrGround = posAttr.array;
	      for (let i = 0; i < posArrGround.length; i += 3) {
	        const x = posArrGround[i];
	        const z = posArrGround[i + 2];
	        posArrGround[i + 1] = terrainHeight(x, z); // Y 轴为高度
	      }
	      posAttr.needsUpdate = true;
	      groundGeo.computeVertexNormals();

	      const groundMat = new THREE.MeshStandardMaterial({ map: gridTex, roughness: 0.5, metalness: 0.1 });
	      const ground = new THREE.Mesh(groundGeo, groundMat);
	      ground.receiveShadow = true;
      scene.add(ground);

      const amb = new THREE.AmbientLight(0x8899AA, 0.6); scene.add(amb);
      const dirLight = new THREE.DirectionalLight(0xFFF0DD, 0.8);
      dirLight.position.set(50, 100, 50); dirLight.castShadow = true;
      dirLight.shadow.mapSize.width = 2048; dirLight.shadow.mapSize.height = 2048;
      dirLight.shadow.camera.left = -50; dirLight.shadow.camera.right = 50;
      dirLight.shadow.camera.top = 50; dirLight.shadow.camera.bottom = -50;
      scene.add(dirLight);

	      const treeGroup = new THREE.Group();
      const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4E342E });
      const leafMat = new THREE.MeshStandardMaterial({ color: 0x1B5E20 });
      const starMat = new THREE.MeshBasicMaterial({ color: 0xFFD700 }); 
      
      const ornamentMats = [
        new THREE.MeshStandardMaterial({ color: 0xFF0000 }), 
        new THREE.MeshStandardMaterial({ color: 0xFFD700 }), 
        new THREE.MeshStandardMaterial({ color: 0x00BFFF })  
      ];

	      for(let i=0; i<15; i++) {
	         const tg = new THREE.Group();
	         const x = (rng()-0.5)*120;
	         const z = (rng()-0.5)*120;
	         if (Math.abs(x) < 5 && Math.abs(z) < 5) continue;
	         const y = terrainHeight(x, z);
	         tg.position.set(x, y, z);
         
         const trunk = new THREE.Mesh(new THREE.BoxGeometry(0.8, 2, 0.8), trunkMat);
         trunk.position.y = 1; trunk.castShadow = true;
         tg.add(trunk);
         
         const layers = [
           { w: 4.0, h: 1.5, y: 2.0 },
           { w: 2.8, h: 1.5, y: 3.5 },
           { w: 1.6, h: 1.5, y: 5.0 }
         ];
         
         layers.forEach(layer => {
             const leaf = new THREE.Mesh(new THREE.BoxGeometry(layer.w, layer.h, layer.w), leafMat);
             leaf.position.y = layer.y; leaf.castShadow = true;
             tg.add(leaf);
	             for(let k=0; k<4; k++) {
	                 const mat = ornamentMats[Math.floor(rng()*ornamentMats.length)];
	                 const ball = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), mat);
	                 const side = rng() > 0.5 ? 1 : -1;
	                 if (rng() > 0.5) {
	                    ball.position.set(side * layer.w/2, layer.y + (rng()-0.5), (rng()-0.5)*layer.w);
	                 } else {
	                    ball.position.set((rng()-0.5)*layer.w, layer.y + (rng()-0.5), side * layer.w/2);
	                 }
                 tg.add(ball);
             }
         });

         const star = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), starMat);
         star.position.y = 6.0; 
         tg.add(star);
         treeGroup.add(tg);
      }
      scene.add(treeGroup);

	      const snowCount = 2000;
      const snowGeo = new THREE.BufferGeometry();
	      const posArr = new Float32Array(snowCount * 3);
	      for(let i=0; i<snowCount*3; i+=3) {
	          posArr[i] = (rng()-0.5) * 120;
	          posArr[i+1] = rng() * 50; 
	          posArr[i+2] = (rng()-0.5) * 120;
	      }
      snowGeo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
      const snowMat = new THREE.PointsMaterial({ color: 0xFFFFFF, size: 0.3, transparent: true, opacity: 0.8 });
	      const snowPoints = new THREE.Points(snowGeo, snowMat);
	      scene.add(snowPoints);
	      return snowPoints;
	    }

	    function ensureEnvironment() {
	      if (environmentReady) return;
	      snowSystem = createEnvironment();
	      environmentReady = true;
	    }

	    function init() {
      scene = new THREE.Scene(); scene.background = new THREE.Color(0xD6EAF8); scene.fog = new THREE.Fog(0xD6EAF8, 15, 70);
      
      camera = new THREE.PerspectiveCamera(70, window.innerWidth/window.innerHeight, 0.1, 1000);
      renderer = new THREE.WebGLRenderer({ antialias: false }); 
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      document.getElementById("canvas-container").appendChild(renderer.domElement);
      clock = new THREE.Clock();
      
	      networkManager = new NetworkManager();

      const nameInput = document.getElementById("name-input");
      const chatInput = document.getElementById("chat-input");
      let tabId = sessionStorage.getItem("tab_id");
      if (!tabId) { tabId = randomId().slice(0, 4); sessionStorage.setItem("tab_id", tabId); }
      const savedName = sessionStorage.getItem("p_name");
      if (savedName) nameInput.value = savedName; else nameInput.value = "Guest-" + tabId;
      networkManager.connect(nameInput.value);

      const inputs = [nameInput, chatInput];
      inputs.forEach(el => {
          el.addEventListener("focus", () => { if(document.pointerLockElement) document.exitPointerLock(); });
          el.addEventListener("keydown", (e) => {
              e.stopPropagation(); 
              if(e.key === "Escape") { el.blur(); }
              if(e.key === "Enter") {
                  if (el === nameInput) {
                    const newName = el.value.trim(); sessionStorage.setItem("p_name", newName);
                    if (networkManager) networkManager.sendRename(newName);
                    if (localPlayer) localPlayer.updateNameLabel(newName);
                    el.blur(); document.body.requestPointerLock();
                  }
                  if(el === chatInput) {
                      const txt = el.value.trim();
                      if(txt) { if(localPlayer) localPlayer.showChat(txt); networkManager.sendChat(txt); el.value = ""; }
                  }
              }
          });
      });

      window.addEventListener("resize", () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });
      
      document.addEventListener("pointerlockchange", () => { 
          isPointerLocked = !!document.pointerLockElement; 
          document.getElementById("click-to-play").style.display = isPointerLocked ? "none" : "block";
      });

      document.addEventListener("mousedown", (e) => {
          const active = document.activeElement; 
          if (active === chatInput || active === nameInput) return;
          if (e.button === 0) { 
              if (!isPointerLocked) document.body.requestPointerLock();
              else if (localPlayer) localPlayer.throwSnowball();
          }
      });
      
      document.addEventListener("mousemove", (e) => {
          if(!localPlayer || !isPointerLocked) return;
          cameraYaw -= e.movementX * CONFIG.lookSensitivity;
          cameraPitch -= e.movementY * CONFIG.lookSensitivity;
          cameraPitch = Math.max(CONFIG.minPitch, Math.min(CONFIG.maxPitch, cameraPitch));
          
          if(!localPlayer.input.r) { 
             localPlayer.mesh.rotation.y = cameraYaw; 
          }
      });

      document.addEventListener("keydown", (e) => {
          if (document.activeElement === chatInput || document.activeElement === nameInput) return;
          if (e.code === "KeyT" || e.code === "Enter") { e.preventDefault(); chatInput.focus(); return; }
          if (e.code === "KeyH") {
              e.preventDefault();
              uiHidden = !uiHidden;
              const chat = document.getElementById("chat-container");
              const hint = document.getElementById("controls-hint");
              if (chat) chat.style.display = uiHidden ? "none" : "block";
              if (hint) hint.style.display = uiHidden ? "none" : "block";
              return;
          }
          if (e.code === "KeyV") {
              e.preventDefault();
              cameraMode = cameraMode === "third" ? "first" : "third";
              return;
          }
          if (localPlayer) {
              switch(e.code) {
                  case "KeyW": localPlayer.input.w = true; break;
                  case "KeyS": localPlayer.input.s = true; break;
                  case "KeyA": localPlayer.input.a = true; break;
                  case "KeyD": localPlayer.input.d = true; break;
                  case "Space": localPlayer.input.space = true; break;
                  case "ShiftLeft": localPlayer.input.shift = true; break;
                  case "KeyR": localPlayer.input.r = true; break;
              }
          }
      });
      document.addEventListener("keyup", (e) => {
          if (localPlayer) {
              switch(e.code) {
                  case "KeyW": localPlayer.input.w = false; break;
                  case "KeyS": localPlayer.input.s = false; break;
                  case "KeyA": localPlayer.input.a = false; break;
                  case "KeyD": localPlayer.input.d = false; break;
                  case "Space": localPlayer.input.space = false; break;
                  case "ShiftLeft": localPlayer.input.shift = false; break;
                  case "KeyR": localPlayer.input.r = false; break;
              }
          }
      });

      function animate() {
          requestAnimationFrame(animate);
          const dt = Math.min(clock.getDelta(), 0.1);
          players.forEach(p => p.update(dt));
          for (let i = snowballs.length - 1; i >= 0; i--) {
              snowballs[i].update(dt); if (!snowballs[i].active) snowballs.splice(i, 1);
          }
          if (networkManager) networkManager.maybeSendLocalState();

          if (localPlayer) {
              const eyeOffset = localPlayer.input.shift ? 1.35 : 1.5;
              const headPos = localPlayer.mesh.position.clone();
              headPos.y += eyeOffset; 
              
              const rot = new THREE.Euler(cameraPitch, cameraYaw, 0, 'YXZ');
              
              if (cameraMode === "third") {
                  // 第三人称：相机在玩家身后一定距离，朝向玩家头部
                  const camOffset = new THREE.Vector3(0, 0, 3.5).applyEuler(rot);
                  const targetCamPos = headPos.clone().add(camOffset);
                  camera.position.lerp(targetCamPos, 0.5); 
                  camera.lookAt(headPos);
                  // 第三人称渲染本地角色模型
                  localPlayer.mesh.visible = true;
              } else {
                  // 第一人称：相机放在玩家头部位置，沿视角方向看出去
                  const targetCamPos = headPos;
                  camera.position.lerp(targetCamPos, 0.5);
                  const lookDir = new THREE.Vector3(0, 0, -1).applyEuler(rot);
                  const lookAtPos = headPos.clone().add(lookDir);
                  camera.lookAt(lookAtPos);
                  // 第一人称不渲染本地角色模型，避免身体遮挡视野
                  localPlayer.mesh.visible = false;
              }
          }
          
          if (snowSystem) {
              const positions = snowSystem.geometry.attributes.position.array;
              for(let i=1; i<positions.length; i+=3) {
                  positions[i] -= 5 * dt; 
                  if(positions[i] < 0) positions[i] = 50; 
              }
              snowSystem.geometry.attributes.position.needsUpdate = true;
          }

          renderer.render(scene, camera);
      }
      animate();
    }
    init();
  </script>
</body>
</html>`;
