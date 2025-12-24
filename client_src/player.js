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
    this.isBot = id.startsWith("bot-"); // 判断是否为人机

    this.velocity = new THREE.Vector3();
    this.onGround = false;
    this.isCrouching = false;
    this.targetCrouch = false;

    this.input = { w: false, a: false, s: false, d: false, space: false, shift: false, r: false };

    this.targetPos = new THREE.Vector3(pos.x, pos.y, pos.z);
    this.targetRotY = 0;
    this.targetVel = new THREE.Vector3();

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
    const initialY = isRemote ? pos.y : terrainHeight(pos.x, pos.z);
    this.mesh.position.set(pos.x, initialY, pos.z);

    // 如果是人机，加载雪人模型
    if (this.isBot) {
      this.loadSnowmanModel();
      // 创建名字标签
      this.nameSprite = this.createTextSprite(this.displayName(), 24, false);
      this.nameSprite.position.y = 3.5; // 雪人更高，标签位置调整
      this.mesh.add(this.nameSprite);

      this.chatSprite = this.createTextSprite("", 20, true);
      this.chatSprite.visible = false;
      this.chatSprite.position.y = 4.0;
      this.mesh.add(this.chatSprite);

      this.walkTime = 0;
      this.attackTime = 0;
      scene.add(this.mesh);
      return; // 人机不需要创建方块人模型
    }

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
    const btn1 = new THREE.Mesh(buttonGeo, btnMat);
    btn1.position.set(0, 0.4, 0.11);
    this.bodyGroup.add(btn1);
    const btn2 = new THREE.Mesh(buttonGeo, btnMat);
    btn2.position.set(0, 0.2, 0.11);
    this.bodyGroup.add(btn2);

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
    const eyeL = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.08), eyeMat);
    eyeL.position.set(-0.1, 0.2, -0.201);
    eyeL.rotation.y = Math.PI;
    this.headGroup.add(eyeL);
    const pupilL = new THREE.Mesh(new THREE.PlaneGeometry(0.04, 0.04), pupilMat);
    pupilL.position.set(-0.1, 0.2, -0.202);
    pupilL.rotation.y = Math.PI;
    this.headGroup.add(pupilL);
    const eyeR = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.08), eyeMat);
    eyeR.position.set(0.1, 0.2, -0.201);
    eyeR.rotation.y = Math.PI;
    this.headGroup.add(eyeR);
    const pupilR = new THREE.Mesh(new THREE.PlaneGeometry(0.04, 0.04), pupilMat);
    pupilR.position.set(0.1, 0.2, -0.202);
    pupilR.rotation.y = Math.PI;
    this.headGroup.add(pupilR);

    const hatBase = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.12, 0.44), new THREE.MeshStandardMaterial({ color: 0xFFFFFF }));
    hatBase.position.y = 0.4;
    this.headGroup.add(hatBase);

    const hatTop1 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.15, 0.3), new THREE.MeshStandardMaterial({ color: 0xD32F2F }));
    hatTop1.position.set(0, 0.53, 0);
    this.headGroup.add(hatTop1);

    const hatTop2 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.15, 0.2), new THREE.MeshStandardMaterial({ color: 0xD32F2F }));
    hatTop2.position.set(0, 0.65, -0.05);
    this.headGroup.add(hatTop2);

    const hatBall = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshStandardMaterial({ color: 0xFFFFFF }));
    hatBall.position.set(0, 0.7, -0.15);
    this.headGroup.add(hatBall);

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

  // 加载雪人模型
  loadSnowmanModel() {
    const loader = new THREE.GLTFLoader();
    const baseUrl = "/assets/kenney_holiday_kit/Models/GLB format/";
    
    // 随机选择雪人模型（有帽子或无帽子）
    const modelName = Math.random() > 0.5 ? "snowman-hat.glb" : "snowman.glb";
    
    loader.load(
      baseUrl + modelName,
      (gltf) => {
        this.snowmanModel = gltf.scene;
        this.snowmanModel.scale.set(2, 2, 2); // 放大雪人
        this.snowmanModel.position.y = 0;
        
        this.snowmanModel.traverse((obj) => {
          if (obj.isMesh) {
            obj.castShadow = true;
            obj.receiveShadow = true;
            // 保存原始材质用于受伤闪烁效果
            if (!this.originalMaterials) {
              this.originalMaterials = [];
            }
            this.originalMaterials.push({
              mesh: obj,
              material: obj.material.clone()
            });
          }
        });
        
        this.mesh.add(this.snowmanModel);
      },
      undefined,
      (err) => console.warn("Failed to load snowman model", err)
    );
  }

  destroy() {
    if (this.mesh) this.scene.remove(this.mesh);
  }

  displayName() {
    if (typeof this.pingMs === "number") {
      return this.name + " (" + this.pingMs + "ms)";
    }
    return this.name;
  }

  onHit() {
    this.hitFlashTime = 0.25;
  }

  updateNameLabel(name) {
    if (this.name === name) return;
    this.name = name;
    this.mesh.remove(this.nameSprite);
    this.nameSprite = this.createTextSprite(this.displayName(), 24, false);
    // 人机雪人模型更高，标签位置需要调整
    this.nameSprite.position.y = this.isBot ? 3.5 : 2.4;
    this.mesh.add(this.nameSprite);
  }

  updatePing(pingMs) {
    this.pingMs = pingMs;
    this.mesh.remove(this.nameSprite);
    this.nameSprite = this.createTextSprite(this.displayName(), 24, false);
    // 人机雪人模型更高，标签位置需要调整
    this.nameSprite.position.y = this.isBot ? 3.5 : 2.4;
    this.mesh.add(this.nameSprite);
  }

  createTextSprite(text, fontSize, isBubble) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const w = 512, h = 128;
    canvas.width = w;
    canvas.height = h;
    if (isBubble) {
      ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
      ctx.fillRect(10, 10, w - 20, h - 20);
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 6;
      ctx.strokeRect(10, 10, w - 20, h - 20);
      ctx.fillStyle = "#fff";
    } else {
      ctx.fillStyle = "#fff";
      ctx.shadowColor = "rgba(0,0,0,1)";
      ctx.shadowBlur = 6;
      ctx.shadowOffsetX = 3;
      ctx.shadowOffsetY = 3;
    }
    ctx.font = "bold " + (fontSize * 2) + "px 'Courier New'";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, w / 2, h / 2);
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
    this.chatTimer = setTimeout(() => {
      this.chatSprite.visible = false;
    }, 5000);
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
    this.velocity.x += impulse.x;
    this.velocity.y += impulse.y;
    this.velocity.z += impulse.z;
    this.onGround = false;
  }

  update(dt) {
    if (this.dead) {
      this.mesh.rotation.x = -Math.PI / 2;
      this.mesh.position.y = groundHeightWithObstacles(this.mesh.position.x, this.mesh.position.z) + 0.2;
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
      // 本地玩家控制逻辑（人机不会走这里）
      if (this.isBot) return; // 人机不需要本地控制
      
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
      this.velocity.x *= friction;
      this.velocity.z *= friction;
      this.velocity.y -= CONFIG.gravity * dt;

      if (this.input.space && this.onGround) {
        this.velocity.y = CONFIG.jumpForce;
        this.onGround = false;
        this.input.space = false;
      }

      if (this.input.r) {
        this.mesh.rotation.y += 20 * dt;
        cameraYaw = this.mesh.rotation.y;
      }

      this.mesh.position.add(this.velocity.clone().multiplyScalar(dt));

      resolvePlayerStaticCollisions(this.mesh.position);

      const half = CONFIG.mapHalf;
      this.mesh.position.x = THREE.MathUtils.clamp(this.mesh.position.x, -half, half);
      this.mesh.position.z = THREE.MathUtils.clamp(this.mesh.position.z, -half, half);

      const groundY = groundHeightWithObstacles(this.mesh.position.x, this.mesh.position.z);
      if (this.mesh.position.y <= groundY) {
        this.mesh.position.y = groundY;
        this.velocity.y = 0;
        this.onGround = true;
      }
    }

    // 人机不需要动画更新
    if (!this.isBot) {
      this.updateAnimation(dt);
    }

    if (this.hitFlashTime > 0) {
      this.hitFlashTime -= dt;
      
      if (this.isBot) {
        // 人机雪人模型的闪烁效果 
        if (this.snowmanModel && this.originalMaterials) {
          const flashIntensity = Math.max(this.hitFlashTime / 0.25, 0);
          this.snowmanModel.traverse((obj) => {
            if (obj.isMesh && obj.material) {
              // 设置红色发光效果
              obj.material.emissive = new THREE.Color(0xFF0000);
              obj.material.emissiveIntensity = flashIntensity * 0.5;
            }
          });
        }
      } else {
        // 普通玩家的闪烁效果
        const t = Math.max(this.hitFlashTime / 0.25, 0);
        const flashColor = 0xFF4444;
        this.skinMat.color.setHex(flashColor);
        this.shirtMat.color.setHex(flashColor);
        this.pantsMat.color.setHex(flashColor);
      }
    } else {
      if (this.isBot) {
        // 恢复人机雪人模型的原始材质
        if (this.snowmanModel && this.originalMaterials) {
          this.originalMaterials.forEach(item => {
            if (item.mesh.material) {
              item.mesh.material.emissive = new THREE.Color(0x000000);
              item.mesh.material.emissiveIntensity = 0;
            }
          });
        }
      } else {
        // 恢复普通玩家的原始颜色
        this.skinMat.color.setHex(this.baseColors.skin);
        this.shirtMat.color.setHex(this.baseColors.shirt);
        this.pantsMat.color.setHex(this.baseColors.pants);
      }
    }
  }

  updateAnimation(dt) {
    const hSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    const isMoving = hSpeed > 0.1;

    const targetBodyY = this.isCrouching ? 0.60 : 0.75;
    this.bodyGroup.position.y = THREE.MathUtils.lerp(this.bodyGroup.position.y, targetBodyY, dt * 15);

    const targetLean = this.isCrouching ? -0.8 : 0;
    this.bodyGroup.rotation.x = THREE.MathUtils.lerp(this.bodyGroup.rotation.x, targetLean, dt * 10);

    if (isMoving) {
      const animSpeed = this.isCrouching ? 6 : 10;
      this.walkTime += dt * animSpeed;

      const amp = this.isCrouching ? 0 : 0.6;

      const angle = Math.sin(this.walkTime) * amp;

      this.leftLeg.rotation.x = angle;
      this.rightLeg.rotation.x = -angle;

      this.leftArm.rotation.x = -angle;
      this.rightArm.rotation.x = angle;
      this.leftArm.rotation.z = 0;
      this.rightArm.rotation.z = 0;

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
      if (phase < 0.2) armRot = -Math.PI / 2 * (phase / 0.2);
      else armRot = -Math.PI / 2 + (Math.PI / 1.5) * ((phase - 0.2) / 0.8);
      this.rightArm.rotation.x = armRot;
    }
  }
}
