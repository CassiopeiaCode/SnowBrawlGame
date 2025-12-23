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
