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
    this.maxConnectAttempts = 3;
    this.baseReconnectDelayMs = 1000;
  }
  // sendRename 已禁用 - 用户名由 OAuth 决定，不可修改
  sendRename(name) {
    // no-op
  }
  status(text, color) {
    const el = document.getElementById("net-status");
    el.textContent = text;
    if (color) el.style.color = color;
  }
  wsUrl() {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    return proto + "://" + location.host + "/ws";
  }
  scheduleReconnect() {
    if (this.connectAttempts >= this.maxConnectAttempts) {
      this.status("🔴 重连失败 3 次，1 秒后刷新页面...", "#FF5555");
      setTimeout(() => {
        try {
          location.reload();
        } catch {
          // ignore
        }
      }, 1000);
      return;
    }
    this.connectAttempts++;
    this.status(
      "🟡 连接断开，第 " + this.connectAttempts + " 次重连（1 秒后重试）...",
      "#FFFF55",
    );
    setTimeout(() => {
      this.connect(this.playerName || "Player");
    }, 1000);
  }
  startPingLoop() {
    if (this.pingTimerId) return;
    const tick = () => {
      if (!this.ws || this.ws.readyState !== 1) {
        this.pingTimerId = null;
        return;
      }
      this.lastPingSentAt = performance.now();
      wsEncode({ t: "ping", now: Date.now() }).then((enc) => {
        try {
          if (this.ws?.readyState === 1) this.ws.send(enc);
        } catch {
          // ignore
        }
      });
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
      wsEncode({ t: "hello", name: this.playerName || playerName }).then(
        (enc) => ws.send(enc),
      );
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
    ws.onmessage = async (ev) => {
      let msg;
      try {
        msg = await wsDecode(ev.data);
      } catch {
        return;
      }
      if (!msg) return;

      if (msg.t === "error") {
        this.status("🔴 " + (msg.message || "连接错误"), "#FF5555");
        // 显示错误提示
        alert(msg.message || "连接错误");
        // 不自动重连
        this.connectAttempts = this.maxConnectAttempts;
        return;
      }

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
        if (this.pendingSnapshot) {
          this.applySnapshot(this.pendingSnapshot);
          this.pendingSnapshot = null;
        }
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
          this.status(
            "🟢 已连接 - ping: " + this.lastPingMs + " ms",
            "#55FF55",
          );
        }
      }
    };
  }
  sendChat(text) {
    if (this.ws?.readyState === 1) {
      wsEncode({ t: "chat", text }).then((enc) => this.ws.send(enc));
    }
  }
  maybeSendLocalState() {
    if (this.ws?.readyState !== 1 || !localPlayer) return;
    const now = performance.now();
    if (now - this.lastStateSend < (1000 / CONFIG.netSendHz)) return;
    this.lastStateSend = now;
    const { mesh, velocity } = localPlayer;
    wsEncode({
      t: "state",
      pos: { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z },
      rotY: mesh.rotation.y,
      vel: { x: velocity.x, y: velocity.y, z: velocity.z },
      crouch: !!localPlayer.input.shift,
      pingMs: typeof this.lastPingMs === "number" ? this.lastPingMs : undefined,
    }).then((enc) => {
      if (this.ws?.readyState === 1) this.ws.send(enc);
    });
  }
  sendSnowball(shotId, dir) {
    if (this.ws?.readyState === 1) {
      wsEncode({ t: "snowball", id: shotId, dir, ts: Date.now() }).then(
        (enc) => {
          if (this.ws?.readyState === 1) this.ws.send(enc);
        },
      );
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
          players.push(rp);
          playersById.set(snap.id, rp);
        }
        rp.setRemoteTarget(snap.pos, snap.rotY, snap.vel, !!snap.crouch);
        rp.updateNameLabel(snap.name);
        if (typeof snap.pingMs === "number") {
          rp.updatePing(snap.pingMs);
        }
      }
    }
    for (const [id, p] of playersById.entries()) {
      if (id !== localPlayerId && !ids.has(id)) removePlayer(id);
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
            const rp = new PlayerModel(
              scene,
              ev.player.id,
              ev.player.pos,
              ev.player.name,
              true,
            );
            players.push(rp);
            playersById.set(ev.player.id, rp);
          }
        }
        break;
      case "leave":
        removePlayer(ev.playerId);
        break;
      case "chat":
        {
          const p = playersById.get(ev.playerId);
          const name = p ? p.name : fixUTF8(ev.name || "Unknown");
          if (p) p.showChat(ev.text);
          appendChatLog(name + ": " + ev.text);
        }
        break;
      case "state":
        const remote = playersById.get(ev.playerId);
        if (remote && ev.playerId !== localPlayerId) {
          remote.setRemoteTarget(ev.pos, ev.rotY, ev.vel, !!ev.crouch);
        }
        break;
      case "snowball":
        if (snowballsById.has(ev.id)) return;
        const sb = new Snowball(ev.id, ev.origin, ev.dir, ev.ownerId);
        snowballs.push(sb);
        snowballsById.set(ev.id, sb);
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
            flash.style.position = "absolute";
            flash.style.top = 0;
            flash.style.left = 0;
            flash.style.width = "100%";
            flash.style.height = "100%";
            flash.style.background = "rgba(255,0,0,0.3)";
            flash.style.pointerEvents = "none";
            document.body.appendChild(flash);
            setTimeout(() => flash.remove(), 100);
            if (localPlayer.health <= 0) {
              localPlayer.dead = true;
              setDeadUI(true);
            }
          }
        }
        break;
      case "rename":
        {
          const p = playersById.get(ev.playerId);
          if (p) p.updateNameLabel(ev.name);
        }
        break;
      case "death":
        {
          const victim = playersById.get(ev.victimId);
          if (victim) {
            victim.dead = true;
            // 本地玩家死亡：显示"你死了"遮罩
            if (victim.id === localPlayerId) setDeadUI(true);
            // 远程玩家死亡：不再隐藏 mesh，让他们以倒地姿态留在场景中
          }
          // 显示击杀信息到聊天（修复 UTF-8 编码）
          const attackerName = fixUTF8(ev.attackerName || "???");
          const victimName = fixUTF8(ev.victimName || "???");
          appendChatLog("💀 " + attackerName + " 击杀了 " + victimName);
        }
        break;
      case "respawn":
        {
          const p = playersById.get(ev.playerId);
          if (p) {
            p.dead = false;
            p.health = ev.hp ?? 100;
            p.mesh.visible = true;
            p.mesh.position.set(ev.pos.x, ev.pos.y, ev.pos.z);
            if (p.id === localPlayerId) {
              setDeadUI(false);
              setHpUI(p.health);
            }
          }
        }
        break;
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
  if (p) {
    p.destroy();
    playersById.delete(id);
    const idx = players.indexOf(p);
    if (idx >= 0) players.splice(idx, 1);
  }
}

// --- MC 风格人物模型 (节日版) ---
