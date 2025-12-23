// 全局登录状态
    let currentUser = null;
    let oauthEnabled = false;

    // 加载排行榜
    async function loadLeaderboards() {
      try {
        // 24小时排行
        const res24h = await fetch("/api/leaderboard?hours=24&limit=10");
        const data24h = await res24h.json();
        renderLeaderboard("leaderboard-24h", data24h);

        // 7天排行
        const res7d = await fetch("/api/leaderboard?hours=168&limit=10");
        const data7d = await res7d.json();
        renderLeaderboard("leaderboard-7d", data7d);
      } catch (e) {
        console.error("Failed to load leaderboards:", e);
      }
    }

    function renderLeaderboard(elementId, data) {
      const el = document.getElementById(elementId);
      if (!data || data.length === 0) {
        el.innerHTML = '<div style="color:#888; text-align:center;">暂无数据</div>';
        return;
      }

      const medals = ["🥇", "🥈", "🥉"];
      el.innerHTML = data.map((p, i) => {
        const medal = medals[i] || `${i + 1}.`;
        const name = p.playerName || "Unknown";
        const displayName = name.length > 10 ? name.slice(0, 10) + "..." : name;
        return `<div style="display:flex; justify-content:space-between; padding:4px 0; border-bottom:1px solid rgba(255,255,255,0.1);">
          <span>${medal} ${displayName}</span>
          <span style="color:#4CAF50; font-weight:bold;">${p.kills}</span>
        </div>`;
      }).join("");
    }

    // 检查登录状态
    async function checkAuthStatus() {
      const statusEl = document.getElementById("login-status");
      try {
        // 检查 OAuth 是否启用
        const configRes = await fetch("/auth/config");
        const configData = await configRes.json();
        oauthEnabled = configData.oauth_enabled;

        // 检查用户登录状态
        const res = await fetch("/auth/me");
        const data = await res.json();

        if (data.authenticated && data.user) {
          currentUser = data.user;
          showLoggedInUI();
        } else {
          showLoginUI();
        }
      } catch (e) {
        console.error("Auth check failed:", e);
        statusEl.textContent = "连接服务器失败，请刷新页面";
        // 降级到游客模式
        showLoginUI();
      }
    }

    function showLoginUI() {
      const statusEl = document.getElementById("login-status");
      const oauthBtn = document.getElementById("oauth-login-btn");
      const guestLogin = document.getElementById("guest-login");
      const loggedInInfo = document.getElementById("logged-in-info");

      loggedInInfo.style.display = "none";

      if (oauthEnabled) {
        oauthBtn.style.display = "inline-block";
        guestLogin.style.display = "none";
        statusEl.textContent = "请使用 Linux.do 账号登录";
      } else {
        oauthBtn.style.display = "none";
        guestLogin.style.display = "block";
        statusEl.textContent = "开发模式 - 游客登录";
        
        // 恢复之前的游客名
        const savedName = sessionStorage.getItem("p_name");
        const guestInput = document.getElementById("guest-name-input");
        if (savedName) guestInput.value = savedName;
        else {
          let tabId = sessionStorage.getItem("tab_id");
          if (!tabId) { tabId = randomId().slice(0, 4); sessionStorage.setItem("tab_id", tabId); }
          guestInput.value = "Guest-" + tabId;
        }
      }
    }

    function showLoggedInUI() {
      const statusEl = document.getElementById("login-status");
      const oauthBtn = document.getElementById("oauth-login-btn");
      const guestLogin = document.getElementById("guest-login");
      const loggedInInfo = document.getElementById("logged-in-info");
      const loggedInName = document.getElementById("logged-in-name");

      oauthBtn.style.display = "none";
      guestLogin.style.display = "none";
      loggedInInfo.style.display = "block";
      loggedInName.textContent = currentUser.name || currentUser.sub;
      statusEl.textContent = "";
    }

    function hideLoginOverlay() {
      document.getElementById("login-overlay").style.display = "none";
    }

    function startGame(playerName) {
      hideLoginOverlay();
      
      // 显示玩家名（不可编辑）
      const nameDisplay = document.getElementById("player-name-display");
      if (nameDisplay) {
        nameDisplay.textContent = "👤 " + playerName;
        nameDisplay.style.display = "block";
      }

      networkManager.connect(playerName);
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

      // 检查登录状态
      checkAuthStatus();
      
      // 加载排行榜
      loadLeaderboards();

      // 开始游戏按钮（已登录用户）
      document.getElementById("start-game-btn").addEventListener("click", () => {
        const playerName = currentUser.name || currentUser.sub;
        startGame(playerName);
      });

      // 游客模式按钮
      document.getElementById("guest-play-btn").addEventListener("click", () => {
        const guestInput = document.getElementById("guest-name-input");
        const playerName = guestInput.value.trim() || "Guest";
        sessionStorage.setItem("p_name", playerName);
        startGame(playerName);
      });

      // 游客名输入框回车
      document.getElementById("guest-name-input").addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          document.getElementById("guest-play-btn").click();
        }
      });

      const chatInput = document.getElementById("chat-input");
      chatInput.addEventListener("focus", () => { if(document.pointerLockElement) document.exitPointerLock(); });
      chatInput.addEventListener("keydown", (e) => {
          e.stopPropagation(); 
          if(e.key === "Escape") { chatInput.blur(); }
          if(e.key === "Enter") {
              const txt = chatInput.value.trim();
              if(txt) { if(localPlayer) localPlayer.showChat(txt); networkManager.sendChat(txt); chatInput.value = ""; }
          }
      });

      window.addEventListener("resize", () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });
      
      document.addEventListener("pointerlockchange", () => { 
          isPointerLocked = !!document.pointerLockElement; 
          document.getElementById("click-to-play").style.display = isPointerLocked ? "none" : "block";
      });

      document.addEventListener("mousedown", (e) => {
          const active = document.activeElement; 
          if (active === chatInput) return;
          // 登录界面显示时不处理点击
          if (document.getElementById("login-overlay").style.display !== "none") return;
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
          if (document.activeElement === chatInput) return;
          // 登录界面显示时不处理按键
          if (document.getElementById("login-overlay").style.display !== "none") return;
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
