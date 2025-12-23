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
          return;
        }

        // 雪球与静态障碍物碰撞：击中 Kenney 模型时提前销毁
        if (STATIC_OBSTACLES.length) {
          const radius = 0.2;
          const p = this.mesh.position;
          for (const box of STATIC_OBSTACLES) {
            if (p.y + radius < box.min.y || p.y - radius > box.max.y) continue;
            const minX = box.min.x - radius;
            const maxX = box.max.x + radius;
            const minZ = box.min.z - radius;
            const maxZ = box.max.z + radius;
            if (p.x >= minX && p.x <= maxX && p.z >= minZ && p.z <= maxZ) {
              this.destroy();
              break;
            }
          }
        }
      }

      destroy() {
        if (!this.active) return;
        this.active = false;
        scene.remove(this.mesh);
        snowballsById.delete(this.id);
      }
    }


      // 使用 Kenney Holiday Kit 的 GLB 模型摆放一些小镇建筑/长椅
      // 全部 GLB 清单
