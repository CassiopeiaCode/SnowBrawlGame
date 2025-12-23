// client_html.ts - 双版本 HTML 加载器
// client_src/  - 开发版源文件（拆分成多个小文件，方便修改）
// client.prod.html - 生产版（你加密后的版本，用于防作弊）
// 
// 逻辑：如果 client_src/ 中任何文件比 client.prod.html 新，则构建并使用 dev 版
//       否则使用 prod 版

const CLIENT_SRC_DIR = "./client_src";
const PROD_HTML_PATH = "./client.prod.html";

// JS 文件加载顺序（有依赖关系）
const JS_FILES = [
  "utils.js",
  "network.js",
  "player.js",
  "snowball.js",
  "environment.js",
  "init.js",
];

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

async function buildDevHtml(): Promise<string> {
  // 读取各部分
  const style = await Deno.readTextFile(`${CLIENT_SRC_DIR}/style.css`);
  const body = await Deno.readTextFile(`${CLIENT_SRC_DIR}/body.html`);
  
  // 按顺序读取并合并 JS 文件
  const jsContents: string[] = [];
  for (const file of JS_FILES) {
    const content = await Deno.readTextFile(`${CLIENT_SRC_DIR}/${file}`);
    jsContents.push(`// === ${file} ===\n${content}`);
  }
  const script = jsContents.join("\n\n");

  // 组装完整 HTML
  return `<!DOCTYPE html>
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
${script}
  </script>
</body>
</html>`;
}

async function loadClientHtml(): Promise<string> {
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

  // 只有 dev 存在
  if (devExists && !prodExists) {
    CLIENT_HTML_SOURCE = "dev";
    console.log(`[client_html] Building from client_src/ (no prod file)`);
    return await buildDevHtml();
  }

  // 两个都存在，比较时间戳
  if (devMtime > prodMtime) {
    CLIENT_HTML_SOURCE = "dev";
    console.log(`[client_html] Building from client_src/ (dev newer: ${new Date(devMtime).toISOString()} > ${new Date(prodMtime).toISOString()})`);
    return await buildDevHtml();
  } else {
    CLIENT_HTML_SOURCE = "prod";
    console.log(`[client_html] Using client.prod.html (prod newer: ${new Date(prodMtime).toISOString()})`);
    return await Deno.readTextFile(PROD_HTML_PATH);
  }
}

// 启动时加载
CLIENT_HTML = await loadClientHtml();

export { CLIENT_HTML, CLIENT_HTML_SOURCE };
