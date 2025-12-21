// scripts/inspect_kenney_collision.ts
//
// 这个脚本的目的：离线检查 Kenney GLB 模型的“几何包围盒”到底长什么样，
// 方便你 / 我（Codex）验证当前碰撞箱算法的直觉是否正确。
//
// 注意：
// - 只读 assets 目录，不修改任何线上逻辑或游戏代码。
// - 依赖 @gltf-transform/core 通过 npm 解析 GLB。
//
// 运行方式（在仓库根目录）：
//   deno run --allow-read --allow-net scripts/inspect_kenney_collision.ts
//
// 输出：
//   每个 GLB 文件的一些统计信息，例如：
//     - 多少个 mesh / primitive
//     - 对每个 primitive 的 POSITION 的 min/max（三维包围盒）
//   用来对比你在客户端用 Three.js 算出来的 Box3 是否在预期范围内。

// Deno 的 npm 支持：直接从 npm 导入 glTF-Transform
import { NodeIO, vec3 } from "npm:@gltf-transform/core@3.10.0";

// 工具函数：格式化 vec3 数组为短字符串
function fmtVec3(v: vec3 | null | undefined): string {
  if (!v) return "null";
  const [x, y, z] = v;
  const fx = Number.isFinite(x) ? x.toFixed(3) : String(x);
  const fy = Number.isFinite(y) ? y.toFixed(3) : String(y);
  const fz = Number.isFinite(z) ? z.toFixed(3) : String(z);
  return `[${fx}, ${fy}, ${fz}]`;
}

async function main() {
  // 以当前工作目录为基准，定位到 Kenney GLB 模型目录
  const modelsDirPath = "assets/kenney_holiday_kit/Models/GLB format";

  const entries: Deno.DirEntry[] = [];
  try {
    for await (const e of Deno.readDir(modelsDirPath)) {
      entries.push(e);
    }
  } catch (err) {
    console.error("Failed to read models directory:", err);
    return;
  }

  const glbFiles = entries
    .filter((e) => e.isFile && e.name.toLowerCase().endsWith(".glb"))
    .map((e) => e.name)
    .sort();

  if (glbFiles.length === 0) {
    console.log("No .glb files found.");
    return;
  }

  const io = new NodeIO();

  for (const file of glbFiles) {
    const path = `${modelsDirPath}/${file}`;
    console.log(`=== ${file} ===`);

    try {
      const doc = await io.read(path);
      const root = doc.getRoot();
      const meshes = root.listMeshes();

      if (meshes.length === 0) {
        console.log("  (no meshes)\n");
        continue;
      }

      console.log(`  meshes: ${meshes.length}`);

      // “视觉一致”方法：对每个 primitive 独立计算几何包围盒
      type Box = { min: vec3; max: vec3 };
      const perPrimBoxes: Box[] = [];

      const overallMin: vec3 = [Infinity, Infinity, Infinity];
      const overallMax: vec3 = [-Infinity, -Infinity, -Infinity];

      let meshIndex = 0;
      for (const mesh of meshes) {
        const meshName = mesh.getName() || `(mesh#${meshIndex})`;
        const prims = mesh.listPrimitives();
        console.log(`  - mesh[${meshIndex}]: ${meshName}, primitives: ${prims.length}`);

        let primIndex = 0;
        for (const prim of prims) {
          const pos = prim.getAttribute("POSITION");
          if (!pos) {
            console.log(`      prim[${primIndex}]: (no POSITION attribute)`);
            primIndex++;
            continue;
          }
          const count = pos.getCount();
          const elem: vec3 = [0, 0, 0];
          const min: vec3 = [Infinity, Infinity, Infinity];
          const max: vec3 = [-Infinity, -Infinity, -Infinity];
          for (let i = 0; i < count; i++) {
            pos.getElement(i, elem);
            const [x, y, z] = elem;
            if (x < min[0]) min[0] = x;
            if (y < min[1]) min[1] = y;
            if (z < min[2]) min[2] = z;
            if (x > max[0]) max[0] = x;
            if (y > max[1]) max[1] = y;
            if (z > max[2]) max[2] = z;
          }

          console.log(
            `      prim[${primIndex}]: POSITION min=${fmtVec3(min)} max=${fmtVec3(max)}`,
          );
          perPrimBoxes.push({ min, max });

          // 累积整体范围
          for (let k = 0; k < 3; k++) {
            if (min[k] < overallMin[k]) overallMin[k] = min[k];
            if (max[k] > overallMax[k]) overallMax[k] = max[k];
          }

          primIndex++;
        }

        meshIndex++;
      }

      if (!perPrimBoxes.length) {
        console.log("  (no POSITION data found)\n");
        continue;
      }

      console.log("  === 对拍: 视觉几何 vs. 当前整体包围盒近似 ===");
      console.log("  几何逐 primitive 包围盒 union:");
      console.log("    union min:", fmtVec3(overallMin));
      console.log("    union max:", fmtVec3(overallMax));

      // “当前方法”：整体包围盒（等价于 union）再按玩家半径在 XZ 扩展
      const playerRadius = 0.5;
      const approxMin: vec3 = [
        overallMin[0] - playerRadius,
        overallMin[1],
        overallMin[2] - playerRadius,
      ];
      const approxMax: vec3 = [
        overallMax[0] + playerRadius,
        overallMax[1],
        overallMax[2] + playerRadius,
      ];

      console.log("  当前碰撞方法（整体盒 + 玩家半径扩展 XZ）:");
      console.log("    approx min:", fmtVec3(approxMin));
      console.log("    approx max:", fmtVec3(approxMax));

      const sizeGeom: vec3 = [
        overallMax[0] - overallMin[0],
        overallMax[1] - overallMin[1],
        overallMax[2] - overallMin[2],
      ];
      const sizeApprox: vec3 = [
        approxMax[0] - approxMin[0],
        approxMax[1] - approxMin[1],
        approxMax[2] - approxMin[2],
      ];
      console.log("  几何 union 尺寸:", fmtVec3(sizeGeom));
      console.log("  当前碰撞近似 尺寸:", fmtVec3(sizeApprox));

      // 改进算法：尽量贴近视觉几何，只在 XZ 上轻微收缩一点，避免“刚刚擦边就被判撞上”。
      // 思路：
      //   - 以几何 union 作为基础
      //   - 计算中心和半尺寸
      //   - 在 X/Z 方向收缩一个固定余量 margin（例如 0.1），但保证不把盒子收缩成负尺寸
      const margin = 0.1;
      const sizeHalf: vec3 = [
        sizeGeom[0] * 0.5,
        sizeGeom[1] * 0.5,
        sizeGeom[2] * 0.5,
      ];
      const center: vec3 = [
        (overallMin[0] + overallMax[0]) * 0.5,
        (overallMin[1] + overallMax[1]) * 0.5,
        (overallMin[2] + overallMax[2]) * 0.5,
      ];

      // 新的半尺寸：在 X/Z 方向减去 margin，且不小于原始的一半（即不超过 50% 收缩）
      const shrinkHalfX = Math.max(sizeHalf[0] - margin, sizeHalf[0] * 0.5);
      const shrinkHalfZ = Math.max(sizeHalf[2] - margin, sizeHalf[2] * 0.5);

      const betterMin: vec3 = [
        center[0] - shrinkHalfX,
        overallMin[1],
        center[2] - shrinkHalfZ,
      ];
      const betterMax: vec3 = [
        center[0] + shrinkHalfX,
        overallMax[1],
        center[2] + shrinkHalfZ,
      ];

      const sizeBetter: vec3 = [
        betterMax[0] - betterMin[0],
        betterMax[1] - betterMin[1],
        betterMax[2] - betterMin[2],
      ];

      console.log("  改进算法 碰撞近似 尺寸:", fmtVec3(sizeBetter));
      console.log("");
    } catch (err) {
      console.error(`  ! Failed to read ${file}:`, err);
      console.log("");
    }
  }
}

if (import.meta.main) {
  main();
}
