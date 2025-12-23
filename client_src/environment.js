const KENNEY_GLBS = [
        "bench-short.glb",
        "bench.glb",
        "cabin-corner-bottom.glb",
        "cabin-corner-logs.glb",
        "cabin-corner.glb",
        "cabin-door-rotate.glb",
        "cabin-doorway-center.glb",
        "cabin-doorway-left.glb",
        "cabin-doorway-right.glb",
        "cabin-doorway.glb",
        "cabin-fence.glb",
        "cabin-overhang-door-rotate.glb",
        "cabin-overhang-doorway.glb",
        "cabin-roof-chimney.glb",
        "cabin-roof-corner.glb",
        "cabin-roof-dormer.glb",
        "cabin-roof-point.glb",
        "cabin-roof-snow-chimney.glb",
        "cabin-roof-snow-corner.glb",
        "cabin-roof-snow-dormer.glb",
        "cabin-roof-snow-point.glb",
        "cabin-roof-snow.glb",
        "cabin-roof-top.glb",
        "cabin-roof.glb",
        "cabin-wall-low.glb",
        "cabin-wall-roof-center.glb",
        "cabin-wall-roof.glb",
        "cabin-wall-wreath.glb",
        "cabin-wall.glb",
        "cabin-window-a.glb",
        "cabin-window-b.glb",
        "cabin-window-c.glb",
        "cabin-window-large.glb",
        "candy-cane-green.glb",
        "candy-cane-red.glb",
        "festivus-pole.glb",
        "floor-stone.glb",
        "floor-wood-snow.glb",
        "floor-wood.glb",
        "gingerbread-man.glb",
        "gingerbread-woman.glb",
        "hanukkah-dreidel.glb",
        "hanukkah-menorah-candles.glb",
        "hanukkah-menorah.glb",
        "kwanzaa-kikombe.glb",
        "kwanzaa-kinara-alternative.glb",
        "kwanzaa-kinara.glb",
        "lantern-hanging.glb",
        "lantern.glb",
        "lights-colored.glb",
        "lights-green.glb",
        "lights-red.glb",
        "nutcracker.glb",
        "present-a-cube.glb",
        "present-a-rectangle.glb",
        "present-a-round.glb",
        "present-b-cube.glb",
        "present-b-rectangle.glb",
        "present-b-round.glb",
        "reindeer.glb",
        "rocks-large.glb",
        "rocks-medium.glb",
        "rocks-small.glb",
        "sled-long.glb",
        "sled.glb",
        "snow-bunker.glb",
        "snow-flat-large.glb",
        "snow-flat.glb",
        "snow-pile.glb",
        "snowflake-a.glb",
        "snowflake-b.glb",
        "snowflake-c.glb",
        "snowman-hat.glb",
        "snowman.glb",
        "sock-green-cane.glb",
        "sock-green.glb",
        "sock-red-cane.glb",
        "sock-red.glb",
        "train-locomotive.glb",
        "train-tender.glb",
        "train-wagon-flat-short.glb",
        "train-wagon-flat.glb",
        "train-wagon-logs.glb",
        "train-wagon-short.glb",
        "train-wagon.glb",
        "trainset-rail-bend.glb",
        "trainset-rail-corner.glb",
        "trainset-rail-detailed-bend.glb",
        "trainset-rail-detailed-corner.glb",
        "trainset-rail-detailed-straight.glb",
        "trainset-rail-straight.glb",
        "tree-decorated-snow.glb",
        "tree-decorated.glb",
        "tree-snow-a.glb",
        "tree-snow-b.glb",
        "tree-snow-c.glb",
        "tree.glb",
        "wreath-decorated.glb",
        "wreath.glb",
      ];

      // 仅用于户外随机散布的模型子集：排除 cabin 结构、floor、wall、window、
      // sock（壁炉袜）、节日桌面道具等更偏室内/建筑细节的资源。
      const KENNEY_OUTDOOR_GLBS = [
        "bench-short.glb",
        "bench.glb",
        "candy-cane-green.glb",
        "candy-cane-red.glb",
        "festivus-pole.glb",
        "gingerbread-man.glb",
        "gingerbread-woman.glb",
        "lantern-hanging.glb",
        "lantern.glb",
        "lights-colored.glb",
        "lights-green.glb",
        "lights-red.glb",
        "nutcracker.glb",
        "present-a-cube.glb",
        "present-a-rectangle.glb",
        "present-a-round.glb",
        "present-b-cube.glb",
        "present-b-rectangle.glb",
        "present-b-round.glb",
        "reindeer.glb",
        "rocks-large.glb",
        "rocks-medium.glb",
        "rocks-small.glb",
        "sled-long.glb",
        "sled.glb",
        "snow-bunker.glb",
        "snow-flat-large.glb",
        "snow-flat.glb",
        "snow-pile.glb",
        "snowflake-a.glb",
        "snowflake-b.glb",
        "snowflake-c.glb",
        "snowman-hat.glb",
        "snowman.glb",
        "train-locomotive.glb",
        "train-tender.glb",
        "train-wagon-flat-short.glb",
        "train-wagon-flat.glb",
        "train-wagon-logs.glb",
        "train-wagon-short.glb",
        "train-wagon.glb",
        "tree-decorated-snow.glb",
        "tree-decorated.glb",
        "tree-snow-a.glb",
        "tree-snow-b.glb",
        "tree-snow-c.glb",
        "tree.glb",
        "wreath-decorated.glb",
        "wreath.glb",
      ];

      function placeKenneyModel(url, pos, rotY, scale) {
        if (!THREE || !THREE.GLTFLoader) {
          console.warn("GLTFLoader not available, skip model:", url);
          return;
        }
        const loader = new THREE.GLTFLoader();
        loader.load(
          url,
          function(gltf) {
            const model = gltf.scene;
            model.position.set(pos.x, pos.y, pos.z);
            if (typeof rotY === "number") {
              model.rotation.y = rotY;
            }
            if (typeof scale === "number") {
              model.scale.set(scale, scale, scale);
            }

            // 先更新一次世界矩阵，保证下面的包围盒计算基于最终变换
            model.updateMatrixWorld(true);

            // 为每个可见网格计算基于几何体的原生包围盒，并转换到世界坐标系；
            // 这样碰撞盒严格来源于“看到的网格”，然后在 X/Z 方向稍微收缩一点，
            // 使得碰撞范围更贴近视觉几何，而不是过于“虚胖”把缝隙封死。
            model.traverse(function(obj) {
              if (!obj.isMesh) return;
              if (!obj.visible) return;

              obj.castShadow = true;
              obj.receiveShadow = true;

              const geom = obj.geometry;
              if (!geom) return;
              if (!geom.boundingBox) {
                geom.computeBoundingBox();
              }
              const localBox = geom.boundingBox;
              if (!localBox) return;

              const worldBox = localBox.clone();
              worldBox.applyMatrix4(obj.matrixWorld);

              const size = new THREE.Vector3();
              worldBox.getSize(size);
              // 过滤掉极小的细节碎片，避免到处都是看不见但会绊脚的小盒子
              if (size.x < 0.2 && size.y < 0.2 && size.z < 0.2) return;

              // 改进算法：在 X/Z 方向轻微收缩碰撞盒，使其更贴近视觉几何。
              // 以几何盒为基础，围绕中心收缩固定余量 margin，并限制最多收缩 50%。
              const center = new THREE.Vector3();
              worldBox.getCenter(center);
              const halfX = size.x * 0.5;
              const halfZ = size.z * 0.5;
              const margin = 0.1;
              const shrinkHalfX = Math.max(halfX - margin, halfX * 0.5);
              const shrinkHalfZ = Math.max(halfZ - margin, halfZ * 0.5);
              worldBox.min.x = center.x - shrinkHalfX;
              worldBox.max.x = center.x + shrinkHalfX;
              worldBox.min.z = center.z - shrinkHalfZ;
              worldBox.max.z = center.z + shrinkHalfZ;

              STATIC_OBSTACLES.push(worldBox);
            });

            scene.add(model);
          },
          undefined,
          function(err) {
            console.warn("Failed to load Kenney model", url, err);
          }
        );
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

      // 原版方块树已移除，树木由 Kenney Holiday Kit 的模型负责呈现

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

        // 在整个地图上随机摆放 Kenney Holiday Kit 的所有 GLB 模型
        (function scatterKenneyModels() {
          const baseUrl = "/assets/kenney_holiday_kit/Models/GLB format/";
          const half = CONFIG.mapHalf - 10;
          const flatSampleOffset = 4;      // 用于检测地形平坦度的采样距离（略放大采样范围）
          const maxSlopeDelta = 0.3;       // 四周高度差阈值，较小 -> 只认为“非常平”的区域可用
          const allNames = KENNEY_OUTDOOR_GLBS.length ? KENNEY_OUTDOOR_GLBS : KENNEY_GLBS;
          // 只取 1/5 的模型参与散布，以减少整体元素数量
          const names = allNames.filter((_, idx) => idx % 5 === 0);
          const instancesPerModel = 1; // 每种户外元素只实例化一次，总数量约为原来的 1/5
          for (const name of names) {
            for (let n = 0; n < instancesPerModel; n++) {
              let x = 0, z = 0, y = 0;
              let attempts = 0;
              do {
                x = (rng() - 0.5) * half * 2;
                z = (rng() - 0.5) * half * 2;
                attempts++;
                y = terrainHeight(x, z);
                // 要求附近区域“非常平坦”：采样八个方向 + 中心的高度
                const h1 = terrainHeight(x + flatSampleOffset, z);
                const h2 = terrainHeight(x - flatSampleOffset, z);
                const h3 = terrainHeight(x, z + flatSampleOffset);
                const h4 = terrainHeight(x, z - flatSampleOffset);
                const h5 = terrainHeight(x + flatSampleOffset, z + flatSampleOffset);
                const h6 = terrainHeight(x - flatSampleOffset, z + flatSampleOffset);
                const h7 = terrainHeight(x + flatSampleOffset, z - flatSampleOffset);
                const h8 = terrainHeight(x - flatSampleOffset, z - flatSampleOffset);
                const hMin = Math.min(y, h1, h2, h3, h4, h5, h6, h7, h8);
                const hMax = Math.max(y, h1, h2, h3, h4, h5, h6, h7, h8);
                const isNearCenter = Math.abs(x) < 8 && Math.abs(z) < 8;
                const tooSteep = (hMax - hMin) > maxSlopeDelta;
                // 如果在出生点附近，或者地势太陡，就继续找新的点
                if (!isNearCenter && !tooSteep) break;
              } while (attempts < 25);
              const rotY = rng() * Math.PI * 2;
              // 已经放大过一次的基础尺寸再放大 3 倍，总体约为原始模型的 9 倍
              const scale = (0.7 + rng() * 0.6) * 9.0;
              // 使用 encodeURI 把中间的空格等字符编码成合法 URL
              const url = encodeURI(baseUrl + name);
              placeKenneyModel(url, { x, y, z }, rotY, scale);
            }
          }
        })();

	      return snowPoints;
	    }

	    function ensureEnvironment() {
	      if (environmentReady) return;
	      snowSystem = createEnvironment();
	      environmentReady = true;
	    }
