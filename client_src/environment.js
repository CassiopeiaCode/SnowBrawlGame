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

      model.updateMatrixWorld(true);

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
        if (size.x < 0.2 && size.y < 0.2 && size.z < 0.2) return;

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

// 创建圣诞树（地图中心地标）
function createChristmasTree() {
  const treeGroup = new THREE.Group();
  const rng = makeRng(worldSeed + 12345); // 使用固定种子让圣诞树每次一致
  
  // 材质
  const leafMaterial = new THREE.MeshStandardMaterial({
    color: 0x0a4d15,
    roughness: 0.7,
    metalness: 0.1,
    flatShading: true
  });
  
  const trunkMaterial = new THREE.MeshStandardMaterial({
    color: 0x3e2723,
    roughness: 1.0
  });
  
  // 装饰球材质
  const ornamentMaterials = [
    new THREE.MeshStandardMaterial({ color: 0xff0000, roughness: 0.1, metalness: 0.4 }),
    new THREE.MeshStandardMaterial({ color: 0xffd700, roughness: 0.1, metalness: 0.8 }),
    new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.1, metalness: 0.5 }),
    new THREE.MeshStandardMaterial({ color: 0x2266ff, roughness: 0.1, metalness: 0.5 })
  ];
  
  // 1. 树干（加大尺寸）
  const treeScale = 1.5; // 整体放大1.5倍
  const trunkGeo = new THREE.CylinderGeometry(1.2 * treeScale, 1.8 * treeScale, 6 * treeScale, 8);
  const trunk = new THREE.Mesh(trunkGeo, trunkMaterial);
  trunk.position.y = 3 * treeScale;
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  treeGroup.add(trunk);
  
  // 2. 树叶层级（加大尺寸）
  const layers = [
    { y: 5.5 * treeScale, r: 6.0 * treeScale, h: 5.0 * treeScale },
    { y: 8.0 * treeScale, r: 5.2 * treeScale, h: 4.5 * treeScale },
    { y: 10.5 * treeScale, r: 4.2 * treeScale, h: 4.0 * treeScale },
    { y: 12.8 * treeScale, r: 3.2 * treeScale, h: 3.5 * treeScale },
    { y: 14.8 * treeScale, r: 2.2 * treeScale, h: 3.0 * treeScale },
    { y: 16.5 * treeScale, r: 1.2 * treeScale, h: 2.5 * treeScale }
  ];
  
  const christmasLights = []; // 存储彩灯用于动画
  
  layers.forEach((layer, tierIndex) => {
    // 创建圆锥形树叶
    const geometry = new THREE.ConeGeometry(layer.r, layer.h, 16, 2);
    const positions = geometry.attributes.position;
    
    // 轻微扭曲让树更自然
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const yPos = positions.getY(i);
      const z = positions.getZ(i);
      
      if (yPos < layer.h / 2 - 0.1) {
        positions.setX(i, x + (rng() - 0.5) * 0.3);
        positions.setY(i, yPos + (rng() - 0.5) * 0.2);
        positions.setZ(i, z + (rng() - 0.5) * 0.3);
      }
    }
    geometry.computeVertexNormals();
    
    const mesh = new THREE.Mesh(geometry, leafMaterial);
    mesh.position.y = layer.y;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    treeGroup.add(mesh);
    
    // 添加装饰（优化数量）
    const decorCount = Math.floor(layer.r * 4);
    for (let i = 0; i < decorCount; i++) {
      const angle = (i / decorCount) * Math.PI * 2 + (tierIndex * 1.5);
      const ratio = 0.3 + rng() * 0.5;
      const currentRadius = layer.r * ratio * 0.85;
      const actualY = layer.y - (layer.h / 2) + (layer.h * (1 - ratio));
      
      const x = Math.cos(angle) * currentRadius;
      const z = Math.sin(angle) * currentRadius;
      
      if (rng() > 0.5) {
        // 装饰球（按比例放大）
        const size = (0.25 + rng() * 0.15) * treeScale;
        const mat = ornamentMaterials[Math.floor(rng() * ornamentMaterials.length)];
        const ball = new THREE.Mesh(new THREE.SphereGeometry(size, 8, 8), mat);
        ball.position.set(x, actualY - 0.2 * treeScale, z);
        ball.castShadow = true;
        treeGroup.add(ball);
      } else {
        // 彩灯（按比例放大）
        const hue = rng();
        const colorVal = new THREE.Color().setHSL(hue, 1, 0.5);
        const bulbGeo = new THREE.SphereGeometry(0.12 * treeScale, 6, 6);
        const bulbMat = new THREE.MeshStandardMaterial({
          color: colorVal,
          emissive: colorVal,
          emissiveIntensity: 0.8,
          roughness: 0.1
        });
        const bulb = new THREE.Mesh(bulbGeo, bulbMat);
        bulb.position.set(x, actualY, z);
        treeGroup.add(bulb);
        
        christmasLights.push({
          mesh: bulb,
          baseColor: colorVal,
          speed: 0.8 + rng() * 1.2,
          phase: rng() * Math.PI * 2
        });
      }
    }
  });
  
  // 3. 星星（加大尺寸）
  const starGroup = new THREE.Group();
  starGroup.position.set(0, 18.2 * treeScale, 0);
  
  // 创建星星形状
  const starShape = new THREE.Shape();
  const pts = 5;
  for (let i = 0; i < pts * 2; i++) {
    const r = (i % 2 === 0) ? 1.0 * treeScale : 0.4 * treeScale;
    const a = (i / (pts * 2)) * Math.PI * 2;
    if (i === 0) starShape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else starShape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  starShape.closePath();
  
  const starGeo = new THREE.ExtrudeGeometry(starShape, {
    depth: 0.2 * treeScale,
    bevelEnabled: true,
    bevelThickness: 0.05 * treeScale,
    bevelSize: 0.05 * treeScale,
    bevelSegments: 1
  });
  
  const starMat = new THREE.MeshStandardMaterial({
    color: 0xffd700,
    emissive: 0xffaa00,
    emissiveIntensity: 0.8,
    metalness: 0.8,
    roughness: 0.2
  });
  
  const starMesh = new THREE.Mesh(starGeo, starMat);
  starGroup.add(starMesh);
  
  // 星星光源（加大范围）
  const starLight = new THREE.PointLight(0xffaa00, 1.5, 18 * treeScale);
  starGroup.add(starLight);
  
  treeGroup.add(starGroup);
  
  // 放置在地图中心
  const centerY = terrainHeight(0, 0);
  treeGroup.position.set(0, centerY, 0);
  scene.add(treeGroup);
  
  // 添加碰撞体积（圆柱形，按比例放大）
  const treeCollisionBox = new THREE.Box3(
    new THREE.Vector3(-3 * treeScale, centerY, -3 * treeScale),
    new THREE.Vector3(3 * treeScale, centerY + 18 * treeScale, 3 * treeScale)
  );
  STATIC_OBSTACLES.push(treeCollisionBox);
  
  // 返回动画数据
  return { treeGroup, starGroup, starMesh, christmasLights };
}

function createEnvironment() {
  const rng = makeRng(worldSeed);
  const groundSize = 400; // 扩大地图尺寸
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 200; i++) {
    ctx.fillStyle = rng() > 0.5 ? '#E0F7FA' : '#B2EBF2';
    ctx.fillRect(Math.floor(rng() * 64), Math.floor(rng() * 64), 2, 2);
  }
  const gridTex = new THREE.CanvasTexture(canvas);
  gridTex.magFilter = THREE.NearestFilter;
  gridTex.wrapS = THREE.RepeatWrapping;
  gridTex.wrapT = THREE.RepeatWrapping;
  gridTex.repeat.set(groundSize / 4, groundSize / 4);

  const groundGeo = new THREE.PlaneGeometry(groundSize, groundSize, 128, 128);
  groundGeo.rotateX(-Math.PI / 2);
  const posAttr = groundGeo.attributes.position;
  const posArrGround = posAttr.array;
  for (let i = 0; i < posArrGround.length; i += 3) {
    const x = posArrGround[i];
    const z = posArrGround[i + 2];
    posArrGround[i + 1] = terrainHeight(x, z);
  }
  posAttr.needsUpdate = true;
  groundGeo.computeVertexNormals();

  const groundMat = new THREE.MeshStandardMaterial({ map: gridTex, roughness: 0.5, metalness: 0.1 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.receiveShadow = true;
  scene.add(ground);

  const amb = new THREE.AmbientLight(0x8899AA, 0.6);
  scene.add(amb);
  const dirLight = new THREE.DirectionalLight(0xFFF0DD, 0.8);
  dirLight.position.set(50, 100, 50);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 2048;
  dirLight.shadow.mapSize.height = 2048;
  dirLight.shadow.camera.left = -100;
  dirLight.shadow.camera.right = 100;
  dirLight.shadow.camera.top = 100;
  dirLight.shadow.camera.bottom = -100;
  scene.add(dirLight);

  const snowCount = 4000; // 增加雪花数量以覆盖更大地图
  const snowGeo = new THREE.BufferGeometry();
  const posArr = new Float32Array(snowCount * 3);
  for (let i = 0; i < snowCount * 3; i += 3) {
    posArr[i] = (rng() - 0.5) * 240; // 扩大雪花范围
    posArr[i + 1] = rng() * 50;
    posArr[i + 2] = (rng() - 0.5) * 240; // 扩大雪花范围
  }
  snowGeo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
  const snowMat = new THREE.PointsMaterial({ color: 0xFFFFFF, size: 0.3, transparent: true, opacity: 0.8 });
  const snowPoints = new THREE.Points(snowGeo, snowMat);
  scene.add(snowPoints);
  
  // 创建圣诞树（地图中心地标）
  const christmasTree = createChristmasTree();
  
  // 将圣诞树动画数据存储到全局，供 animate 循环使用
  if (typeof window !== 'undefined') {
    window.christmasTreeAnim = christmasTree;
  }

  (function scatterKenneyModels() {
    const baseUrl = "/assets/kenney_holiday_kit/Models/GLB format/";
    const half = CONFIG.mapHalf - 10;
    const flatSampleOffset = 4;
    const maxSlopeDelta = 0.3;
    const allNames = KENNEY_OUTDOOR_GLBS.length ? KENNEY_OUTDOOR_GLBS : KENNEY_GLBS;
    const names = allNames; // 使用所有元素，不过滤
    const instancesPerModel = 2; // 每个模型出现两遍
    
    // 存储已放置的元素位置，用于防止重合
    const placedPositions = [];
    const minDistance = 15; // 元素之间的最小距离
    const centerExclusionRadius = 25; // 中心圣诞树周围的排除半径（加大）
    
    // 检查位置是否与已放置的元素太近
    function isTooClose(x, z) {
      // 检查是否太靠近中心圣诞树
      if (Math.sqrt(x * x + z * z) < centerExclusionRadius) {
        return true;
      }
      
      // 检查是否与其他元素太近
      for (const pos of placedPositions) {
        const dx = x - pos.x;
        const dz = z - pos.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < minDistance) {
          return true;
        }
      }
      return false;
    }
    
    for (const name of names) {
      for (let n = 0; n < instancesPerModel; n++) {
        let x = 0, z = 0, y = 0;
        let attempts = 0;
        let foundValidPosition = false;
        
        do {
          x = (rng() - 0.5) * half * 2;
          z = (rng() - 0.5) * half * 2;
          attempts++;
          
          // 检查是否太靠近其他元素
          if (isTooClose(x, z)) {
            if (attempts < 50) continue;
            else break; // 尝试太多次，放弃这个位置
          }
          
          y = terrainHeight(x, z);
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
          const tooSteep = (hMax - hMin) > maxSlopeDelta;
          
          if (!tooSteep) {
            foundValidPosition = true;
            break;
          }
        } while (attempts < 50);
        
        if (!foundValidPosition) continue; // 跳过这个实例
        
        // 记录位置
        placedPositions.push({ x, z });
        
        const rotY = rng() * Math.PI * 2;
        const scale = (0.7 + rng() * 0.6) * 9.0;
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
