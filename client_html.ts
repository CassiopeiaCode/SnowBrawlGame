// client_html.ts - 双版本 HTML 加载器
// client_src/  - 开发版源文件（拆分成多个小文件，方便修改）
// client.prod.html - 生产版（你加密后的版本，用于防作弊）
// 
// 逻辑：如果 client_src/ 中任何文件比 client.prod.html 新，则自动构建加密版本并使用 dev 版
//       否则使用 prod 版

import { shouldRebuild, buildProdHtml } from "./build_prod.ts";

const CLIENT_SRC_DIR = "./client_src";
const PROD_HTML_PATH = "./client.prod.html";

let CLIENT_HTML = "";
let CLIENT_HTML_SOURCE = "";

async function getLatestMtime(dir: string): Promise<number> {
  let latest = 0;
  for await (const entry of Deno.readDir(dir)) {
    if (entry.isFile) {
      const stat = await Deno.stat(`${dir}/${entry.name}`);
      const mtime = stat.mtime?.getTime() ?? 0;
      if (mtime > latest) latest = mtime;
    }
  }
  return latest;
}

async function loadClientHtml(): Promise<string> {
  // 首先检查是否需要重新构建 prod 版本
  if (await shouldRebuild()) {
    console.log("[client_html] 检测到 dev 更新，自动构建加密版本...");
    try {
      const prodHtml = await buildProdHtml();
      await Deno.writeTextFile(PROD_HTML_PATH, prodHtml);
      console.log("[client_html] 加密版本已写入 client.prod.html");
    } catch (error) {
      console.error("[client_html] 构建加密版本失败:", error);
    }
  }

  let prodMtime = 0;
  let prodExists = false;

  try {
    const prodStat = await Deno.stat(PROD_HTML_PATH);
    prodMtime = prodStat.mtime?.getTime() ?? 0;
    prodExists = true;
  } catch {
    // prod 文件不存在
  }

  let devMtime = 0;
  let devExists = false;

  try {
    devMtime = await getLatestMtime(CLIENT_SRC_DIR);
    devExists = devMtime > 0;
  } catch {
    // dev 目录不存在
  }

  // 都不存在则报错
  if (!devExists && !prodExists) {
    throw new Error("Neither client_src/ nor client.prod.html found!");
  }

  // 只有 prod 存在
  if (!devExists && prodExists) {
    CLIENT_HTML_SOURCE = "prod";
    console.log(`[client_html] Using client.prod.html (no dev sources)`);
    return await Deno.readTextFile(PROD_HTML_PATH);
  }

  // 只有 dev 存在或 dev 更新
  if (devExists) {
    CLIENT_HTML_SOURCE = "dev";
    if (!prodExists) {
      console.log(`[client_html] Using dev (no prod file)`);
    } else if (devMtime > prodMtime) {
      console.log(`[client_html] Using dev (dev newer: ${new Date(devMtime).toISOString()} > ${new Date(prodMtime).toISOString()})`);
    } else {
      // dev 存在但不比 prod 新，使用 prod
      CLIENT_HTML_SOURCE = "prod";
      console.log(`[client_html] Using client.prod.html (prod newer: ${new Date(prodMtime).toISOString()})`);
      return await Deno.readTextFile(PROD_HTML_PATH);
    }
    
    // 使用 dev 版本（从 prod 读取，因为已经自动构建过了）
    return await Deno.readTextFile(PROD_HTML_PATH);
  }

  // 默认使用 prod
  CLIENT_HTML_SOURCE = "prod";
  return await Deno.readTextFile(PROD_HTML_PATH);
}

// 启动时加载
CLIENT_HTML = await loadClientHtml();

export { CLIENT_HTML, CLIENT_HTML_SOURCE };
