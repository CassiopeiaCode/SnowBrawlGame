// build_prod.ts - 自动构建生产版本（JS 加密）
// 当 client_src/ 比 client.prod.html 新时，自动调用 jshaman API 加密并生成 prod 版本

import { WS_AES_KEY_HEX } from "./config.ts";

const CLIENT_SRC_DIR = "./client_src";
const PROD_HTML_PATH = "./client.prod.html";
const JSHAMAN_API = "https://www.jshaman.com:4430/submit_js_code/";

// JS 文件加载顺序（有依赖关系）
const JS_FILES = [
  "utils.js",
  "network.js",
  "player.js",
  "snowball.js",
  "environment.js",
  "init.js",
];

// 加密配置（免费版）
const OBFUSCATE_CONFIG = {
  compact: true,
  renameGlobalFunctionVariable: false,
  controlFlowFlattening: false,
  stringArray: true,
  stringArrayEncoding: false,
  disableConsoleOutput: false,
  debugProtection: false,
};

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

async function obfuscateJS(jsCode: string): Promise<string> {
  console.log("[build_prod] 调用 jshaman API 加密 JS...");
  
  try {
    const response = await fetch(JSHAMAN_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        js_code: jsCode,
        vip_code: "free",
        // 免费版不传 config 参数
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();

    if (result.status !== 0) {
      throw new Error(`jshaman API error: ${result.message}`);
    }

    console.log("[build_prod] JS 加密成功");
    return result.content;
  } catch (error) {
    console.error("[build_prod] JS 加密失败:", error);
    console.log("[build_prod] 使用未加密版本");
    return jsCode;
  }
}

async function buildProdHtml(): Promise<string> {
  console.log("[build_prod] 开始构建生产版本...");
  
  // 读取各部分
  const style = await Deno.readTextFile(`${CLIENT_SRC_DIR}/style.css`);
  const body = await Deno.readTextFile(`${CLIENT_SRC_DIR}/body.html`);
  
  // 按顺序读取并合并 JS 文件
  const jsContents: string[] = [];
  for (const file of JS_FILES) {
    let content = await Deno.readTextFile(`${CLIENT_SRC_DIR}/${file}`);
    // 在构建时替换 AES 密钥占位符
    content = content.replace(/__WS_AES_KEY__/g, WS_AES_KEY_HEX);
    jsContents.push(content);
  }
  const mergedJS = jsContents.join("\n\n");

  // 加密 JS
  const obfuscatedJS = await obfuscateJS(mergedJS);

  // 组装完整 HTML
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>圣诞雪球大乱斗</title>
  <style>
${style}
  </style>
</head>
<body>
${body}
  <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
  <script src="https://unpkg.com/three@0.128.0/examples/js/loaders/GLTFLoader.js"></script>
  <script>
${obfuscatedJS}
  </script>
</body>
</html>`;

  return html;
}

async function shouldRebuild(): Promise<boolean> {
  let prodMtime = 0;
  let prodExists = false;

  try {
    const prodStat = await Deno.stat(PROD_HTML_PATH);
    prodMtime = prodStat.mtime?.getTime() ?? 0;
    prodExists = true;
  } catch {
    // prod 文件不存在，需要构建
    return true;
  }

  let devMtime = 0;
  try {
    devMtime = await getLatestMtime(CLIENT_SRC_DIR);
  } catch {
    console.error("[build_prod] client_src/ 目录不存在");
    return false;
  }

  // dev 比 prod 新，需要重新构建
  if (devMtime > prodMtime) {
    console.log(`[build_prod] dev 更新 (${new Date(devMtime).toISOString()} > ${new Date(prodMtime).toISOString()})`);
    return true;
  }

  console.log("[build_prod] prod 已是最新版本");
  return false;
}

// 主函数
async function main() {
  const forceRebuild = Deno.args.includes("--force");
  if (forceRebuild || await shouldRebuild()) {
    console.log("[build_prod] 开始构建...");
    const html = await buildProdHtml();
    await Deno.writeTextFile(PROD_HTML_PATH, html);
    console.log(`[build_prod] 生产版本已写入 ${PROD_HTML_PATH}`);
  } else {
    console.log("[build_prod] 无需重新构建");
  }
}

// 如果直接运行此脚本
if (import.meta.main) {
  await main();
}

export { shouldRebuild, buildProdHtml };
