// client_html.ts - 双版本 HTML 加载器
// client.dev.html  - 开发版（明文，方便调试）
// client.prod.html - 生产版（你加密后的版本，用于防作弊）
// 服务器启动时比较两个文件的修改时间，自动选择较新的版本

let CLIENT_HTML = "";
let CLIENT_HTML_SOURCE = "";

async function loadClientHtml(): Promise<string> {
  const devPath = "./client.dev.html";
  const prodPath = "./client.prod.html";

  let devStat: Deno.FileInfo | null = null;
  let prodStat: Deno.FileInfo | null = null;

  try {
    devStat = await Deno.stat(devPath);
  } catch {
    // dev 文件不存在
  }

  try {
    prodStat = await Deno.stat(prodPath);
  } catch {
    // prod 文件不存在
  }

  // 都不存在则报错
  if (!devStat && !prodStat) {
    throw new Error("Neither client.dev.html nor client.prod.html found!");
  }

  // 只有一个存在则用那个
  if (devStat && !prodStat) {
    CLIENT_HTML_SOURCE = "dev";
    return await Deno.readTextFile(devPath);
  }
  if (prodStat && !devStat) {
    CLIENT_HTML_SOURCE = "prod";
    return await Deno.readTextFile(prodPath);
  }

  // 两个都存在，比较修改时间，选较新的
  const devMtime = devStat!.mtime?.getTime() ?? 0;
  const prodMtime = prodStat!.mtime?.getTime() ?? 0;

  if (prodMtime >= devMtime) {
    CLIENT_HTML_SOURCE = "prod";
    console.log(`[client_html] Using client.prod.html (mtime: ${new Date(prodMtime).toISOString()})`);
    return await Deno.readTextFile(prodPath);
  } else {
    CLIENT_HTML_SOURCE = "dev";
    console.log(`[client_html] Using client.dev.html (mtime: ${new Date(devMtime).toISOString()})`);
    return await Deno.readTextFile(devPath);
  }
}

// 启动时加载
CLIENT_HTML = await loadClientHtml();

export { CLIENT_HTML, CLIENT_HTML_SOURCE };
