// smoke_page.js —— 页面冒烟测试（Node）。
// 抽取 page/index.html 主脚本的纯函数段（算法 + 打包 + 帧头），在最小 sandbox 里跑断言。
// 覆盖：CRC16 金标准、帧头 16 字节字段、packIdx 纯色打包、
//       R1.0.12 结构（Cropper 内嵌 / 文字对象 / 留白 / 双 script 闭合符）、
//       R1.2.0 统一升级入口（/api/upload）+ 单一版本号显示。
//
// 用法：node tools/smoke_page.js   （tools/ 下已有 package.json 声明 commonjs）
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const page = fs.readFileSync(path.join(__dirname, "..", "page", "index.html"), "utf8");
const captive = fs.readFileSync(path.join(__dirname, "..", "src", "captive.c"), "utf8");
const netifAp = fs.readFileSync(path.join(__dirname, "..", "src", "netif_ap.c"), "utf8");
const settings = fs.readFileSync(path.join(__dirname, "..", "src", "settings.c"), "utf8");
// R1.0.12 起页面有两个 <script> 块（第 1 块 = 内嵌 Cropper.js，第 2 块 = 主脚本）。
// \r?\n：兼容 core.autocrlf 检出为 CRLF 的工作区（2026-09-22 修正）。
const m = page.match(/<script>\r?\n"use strict";\r?\n([\s\S]*?)\r?\n<\/script>/);
if (!m) { console.error("no main <script> found"); process.exit(1); }
const js = m[1];

// 只取 DOM 代码之前的纯函数段：截止到 `var $ = function` 之前。
const cut = js.indexOf("var $ = function");
if (cut < 0) { console.error("pure-section marker not found"); process.exit(1); }
const pure = js.slice(0, cut);

const sandbox = { window: {}, console: console, Uint8Array: Uint8Array,
                  Float64Array: Float64Array, Int32Array: Int32Array,
                  Math: Math, JSON: JSON, Infinity: Infinity, NaN: NaN,
                  Date: Date };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

let failed = 0;
function ok(name, cond) {
  console.log((cond ? "PASS" : "FAIL") + "  " + name);
  if (!cond) failed++;
}
function eq(name, got, want) { ok(name + " (got " + got + " want " + want + ")", got === want); }

// 静态防线：脚本串里若出现字面量 </script>，浏览器会提前终结脚本块。
// R1.0.12 起：合法闭合符数量随功能块增加而调整（R1.1.0 = 3），详见下方断言。
// R1.1.0 起 = 3 个合法闭合符（内嵌 Cropper 块 + 页脚版本填充块 + 主脚本块），多一个都不行。
eq("script closer count (cropper + footer + main = exactly 3)", (page.match(/<\/script>/g) || []).length, 3);
ok("offline export keeps </script> escaped in injected html", page.indexOf("<\\/script>") >= 0);
ok("cropper.js inlined (first script block)", /<script>\s*\n?\/\* ===== Cropper\.js v1\.6\.2/.test(page));
ok("startup block intact (loadSettings call present)", /loadSettings\(\)/.test(js));
// R1.0.12 结构检查
ok("page version meta present (R1.x.y)", /moink-page-version" content="R1\.\d+\.\d+"/.test(page));
// 10. R1.0.18 UI 重构：齿轮入口 / 返回按钮 / 无页签 / 步骤条 / 设备信息网格 / 分栏 / 文案
ok("R1.0.18 gear + back nav present", page.includes('id="gearBtn"') && page.includes('id="backBtn"'));
ok("mobile viewport zoom disabled without disabling Cropper touch zoom",
   page.includes('maximum-scale=1, user-scalable=no')
   && page.includes('touch-action:pan-x pan-y')
   && js.indexOf('document.addEventListener("gesturestart", stopViewportGesture, { passive:false })') >= 0
   && js.indexOf('zoomOnTouch: true') >= 0);
ok("mobile crop completion shortcut scrolls past Cropper",
   page.includes('id="cropDone"') && page.includes("裁剪完成&nbsp;↓")
   && page.includes("#cropDone.show{ display:inline-flex; }")
   && js.indexOf('$("styleCard").scrollIntoView({ behavior:"smooth", block:"start" })') >= 0
   && js.indexOf('window.addEventListener("scroll", scheduleCropDone, { passive:true })') >= 0);
ok("R1.0.18 tab bar removed", page.indexOf('data-t="image"') < 0 && page.indexOf('id="tabs"') < 0);
ok("R1.0.18 subtitle", page.includes("把喜欢的瞬间，放在身边"));
ok("R1.0.18 header version line removed", page.indexOf('id="i-fw"') < 0);
ok("R1.0.18 dev copy cleaned (no 预览已跑通/预览还没跑通)",
   page.indexOf("预览已跑通") < 0 && page.indexOf("预览还没跑通") < 0);
ok("R1.0.18 steps bar + updateSteps", page.includes('id="steps"') && js.indexOf("function updateSteps") >= 0);
ok("R1.0.18 infoGrid device info", page.includes('class="infoGrid"'));
ok("R1.0.18 editor split columns", page.includes('id="editorGrid"') && page.includes('id="editRight"'));
ok("R1.0.21 mode desc removed", page.indexOf("\u50cf\u62cd\u7acb\u5f97\u4e00\u6837") < 0 && page.indexOf("\u5199\u70b9\u60f3\u8bf4\u7684") < 0 && page.indexOf("modeDesc") < 0 && js.indexOf("MODE_DEF") < 0);
ok("R1.0.19 image h2 removed", page.indexOf("选图 · 裁剪 · 上传") < 0);
ok("R1.0.19 autoPush fully removed", js.indexOf("scheduleAutoPush") < 0 && page.indexOf("autoPushRow") < 0 && js.indexOf("cfg.autoPush") < 0);
ok("R1.0.19 four-color stroke/bg/tbg/objbg", page.includes("黄边") && page.includes("红边") && page.includes("黄底") && page.includes("红底"));
ok("R1.0.19 dither hint wired", page.includes('id="dmodeHint"') && js.indexOf("DMODE_HINT") >= 0);
ok("R1.0.20 pad per-side checkboxes + default-on-check",
   page.includes('id="padTOn"') && page.includes('id="padBOn"')
   && page.includes('id="padLOn"') && page.includes('id="padROn"')
   && js.indexOf("function padSideVal") >= 0 && js.indexOf('pv("padTOn"') < 0);
ok("R1.0.20 numeric-only display (no units)", js.indexOf("return s + c.unit") < 0 && js.indexOf('v * 100 : v') >= 0);
ok("R1.0.20 textarea always editable", js.indexOf('tObjBg","txt') < 0);
ok("R1.0.21 steps mode-aware", js.indexOf("\u2460 \u7f16\u8f91\u6587\u5b57") >= 0 && js.indexOf("has ? 2 : 1") >= 0);
ok("R1.0.21 padGrid grid layout", js.indexOf('padOn ? "grid"') >= 0 && page.indexOf("grid-template-columns:repeat(4,1fr)") >= 0);
ok("R1.0.21 bg selects merged row", page.indexOf('id="tbgRow"') < 0 && js.indexOf("tbgRow") < 0 && page.indexOf('id="objBgRow"') >= 0);
ok("R1.0.19 text add no auto-create", js.indexOf('text:"新文字"') < 0 && js.indexOf("请先输入文字") >= 0);
ok("R1.0.19 offline lab hint removed", page.indexOf("\u79bb\u7ebf\u5ba2\u6237\u7aef\u5bfc\u51fa\u4e3a\u5b9e\u9a8c\u6027\u529f\u80fd") < 0);
ok("R1.0.19 gamma unit + signed b/c", page.indexOf('unit:"\u00d7"') >= 0 && js.indexOf("fmtCtrl") >= 0);
// R1.0.22 修复与清理
ok("R1.0.22 upload error precedence + timeout",
   js.indexOf('xhr.responseText || ("HTTP " + xhr.status)') >= 0 && js.indexOf("xhr.timeout = 30000") >= 0);
ok("R1.0.22 stroke four-color echo", js.indexOf('tStrokeC").value = String(clamp(+o.strokeC|0, 0, 3))') >= 0);
ok("R1.0.22 pointerId guard", js.indexOf("pid:e.pointerId") >= 0 && js.indexOf("e.pointerId !== od.pid") >= 0);
ok("R1.0.22 offline export cleans runtime nodes",
   js.indexOf("cloneNode(true)") >= 0 && js.indexOf("#ctrls > *, #objLayer > *") >= 0);
ok("R1.0.22 EXIF revoke timing fixed",
   js.indexOf("function cleanup(keep)") >= 0
   && js.indexOf("if (urls[i] !== keep){ try { URL.revokeObjectURL(urls[i]); }") >= 0);
ok("R1.2.3 iOS repeated photo selection and async race guarded",
   js.indexOf('fileEl.value = "";') >= 0
   && js.indexOf("var f = fileEl.files && fileEl.files[0]") >= 0
   && js.indexOf("var imageLoadSeq = 0, cancelImageLoad = null") >= 0
   && js.indexOf("if (cancelImageLoad) cancelImageLoad()") >= 0
   && js.indexOf("function current(){ return seq === imageLoadSeq; }") >= 0
   && js.indexOf("if (sourceLoaded) commit(im, url, true)") >= 0
   && js.indexOf("}, 12000);") >= 0
   && js.indexOf('msg("正在读取照片…", "")') >= 0);
// 9. R1.0.17 EXIF 归一 + 换图重置旋转 + 文字开关过滤
ok("R1.0.17 exifOrientation present", /function exifOrientation\(/.test(page));
ok("R1.0.17 cropRot reset on adoptImg", /curRot = 0; cfg\.cropRot = 0; syncRotUI\(\);/.test(page));
ok("R1.2.2 single-source image orientation + absolute user rotation",
   js.indexOf("imgNeedsCropperOrientation = !!needsCropperOrientation") >= 0
   && js.indexOf("checkOrientation: needsExif") >= 0
   && js.indexOf("scalable: needsExif") >= 0
   && js.indexOf("cropBaseRot = Number(d && d.rotate) || 0") >= 0
   && js.indexOf("cr.rotateTo(cropBaseRot + a)") >= 0
   && js.indexOf("cr.rotate(d)") < 0
   && page.indexOf("#rotRange{ touch-action:pan-y; }") >= 0);
ok("R1.0.17 textOn filter in renderComposite", /cfg\.textOn \? cfg\.objsImg : \[\]/.test(page));
ok("text object system (drawObjs + normObjs)", js.indexOf("function drawObjs") >= 0 && js.indexOf("function normObjs") >= 0);
ok("padding module (contentRect/contentAR)", js.indexOf("function contentRect") >= 0 && js.indexOf("function contentAR") >= 0);
ok("cropper bridge (initCrop/getCropCanvas)", js.indexOf("function initCrop") >= 0 && js.indexOf("function getCropCanvas") >= 0);
ok("R1.2.2 crop reset returns current photo to its loaded state",
   page.includes('id="cropReset"')
   && js.indexOf("function crReset()") >= 0
   && js.indexOf("cr.reset()") >= 0
   && js.indexOf("cr.rotateTo(cropBaseRot)") >= 0
   && js.indexOf("curRot = 0; cfg.cropRot = 0; syncRotUI(); saveCfg();") >= 0
   && js.indexOf('$("cropReset").addEventListener("click", crReset)') >= 0);
ok("rot snap 90 (rotSnap)", js.indexOf("function rotSnap") >= 0);
ok("old crop code retired", js.indexOf("drawCropInto") < 0 && js.indexOf("imgSig") < 0 && js.indexOf("textMetrics") < 0);
ok("frozen algorithm intact (WARM_SAT_K + power law)", js.indexOf("WARM_SAT_K = 0.75") >= 0 && js.indexOf("Math.pow(s, 1 - WARM_SAT_K*g)") >= 0);

try {
  vm.runInContext(pure, sandbox, { filename: "page.js" });
} catch (e) {
  console.error("evaluate failed:", e.message);
  process.exit(1);
}

// 1. CRC16 金标准
const crc = sandbox.crc16(new Uint8Array([0x31,0x32,0x33,0x34,0x35,0x36,0x37,0x38,0x39]));
eq("crc16('123456789')", crc, 0x29B1);

// 2. 帧头 16 字节
const payload = new Uint8Array(105984).fill(0x55);
const frame = sandbox.frameWithHeader(payload);
eq("frame length", frame.length, 105984 + 16);
eq("magic0", frame[0], 0xA5);
eq("magic1", frame[1], 0x5A);
eq("version", frame[2], 1);
eq("width", (frame[4] << 8) | frame[5], 768);
eq("height", (frame[6] << 8) | frame[7], 552);
const len = (frame[8] << 24) | (frame[9] << 16) | (frame[10] << 8) | frame[11];
eq("payload length", len, 105984);
eq("crc match", ((frame[12] << 8) | frame[13]), sandbox.crc16(payload));

// 3. packIdx 纯色
const white = new Uint8Array(768 * 552).fill(1);
const buf = sandbox.packIdx(white);
eq("packIdx buffer length", buf.length, 105984);
eq("packIdx all-white == 0x55", buf.every(b => b === 0x55), true);

// 4/5. R1.0.22：modeAR / statsOf 死代码已删除
ok("R1.0.22 dead code removed (modeAR/statsOf)",
   js.indexOf("function modeAR") < 0 && js.indexOf("function statsOf") < 0);

// R1.2.2：内置屏幕自检直接生成设备方向索引帧，不走裁剪/旋转/照片算法。
ok("R1.2.2 screen-test controls present",
   page.includes('id="screenTest"') && page.includes('id="screenTestButtons"')
   && page.includes('data-test="white"') && page.includes('data-test="black"')
   && page.includes('data-test="red"') && page.includes('data-test="yellow"')
   && page.includes('data-test="grid"') && page.includes('data-test="checker"'));
ok("R1.2.2 four-color E-Paper introduction present and collapsed by default",
   page.includes('<details class="card" id="epdIntro">')
   && page.includes("了解四色墨水屏")
   && page.includes("画面抖动")
   && page.includes("双稳态")
   && page.indexOf('<details class="card" id="epdIntro" open>') < 0);
ok("R1.2.2 dither demonstration copy and control present",
   page.includes('id="ditherDemoBtn"') && page.includes('id="ditherDemoMsg"')
   && page.includes("亲眼看看四色如何模拟更多颜色")
   && page.includes("利用人眼的空间混色效应")
   && page.includes("点击后会覆盖屏幕当前画面"));
ok("R1.2.2 screen-test uses direct frame path",
   js.indexOf("function buildScreenTestIdx") >= 0
   && js.indexOf("function buildScreenTestFrame") >= 0
   && js.indexOf("frameWithHeader(packIdx(buildScreenTestIdx(kind)))") >= 0
   && js.indexOf('xhr.open("POST", api("/api/frame"))') >= 0);
const testRed = sandbox.buildScreenTestIdx("red");
eq("screen-test red dimensions", testRed.length, 768 * 552);
eq("screen-test red is palette index 3", testRed.every(v => v === 3), true);
const testChecker = sandbox.buildScreenTestIdx("checker");
eq("screen-test checker first four 8px blocks",
   [testChecker[0], testChecker[8], testChecker[16], testChecker[24]].join(","), "0,1,2,3");
const testGrid = sandbox.buildScreenTestIdx("grid");
eq("screen-test grid corner markers K/R/Y/K",
   [testGrid[20*768+20], testGrid[20*768+700],
    testGrid[500*768+20], testGrid[500*768+700]].join(","), "0,3,2,0");
const testWhiteFrame = sandbox.buildScreenTestFrame("white");
eq("screen-test full frame length", testWhiteFrame.length, 105984 + 16);
eq("screen-test white payload == 0x55",
   testWhiteFrame.slice(16).every(v => v === 0x55), true);
ok("R1.2.2 dither demo uses exact direct-frame path",
   js.indexOf("function buildDitherDemoBaseIdx") >= 0
   && js.indexOf("function buildDitherDemoIdx") >= 0
   && js.indexOf("frameWithHeader(packIdx(buildDitherDemoIdx()))") >= 0
   && js.indexOf('sendDirectFrame("ditherDemoMsg"') >= 0);
const ditherBase = sandbox.buildDitherDemoBaseIdx();
eq("dither demo dimensions", ditherBase.length, 768 * 552);
ok("dither demo base has only four palette indices",
   ditherBase.every(v => v === 0 || v === 1 || v === 2 || v === 3));
eq("dither demo native swatches K/W/R/Y",
   [ditherBase[80*768+30], ditherBase[80*768+220],
    ditherBase[80*768+400], ditherBase[80*768+600]].join(","), "0,1,3,2");
eq("dither demo grayscale endpoints W/K",
   [ditherBase[150*768+160], ditherBase[150*768+740]].join(","), "1,0");
eq("dither demo orange endpoints Y/R",
   [ditherBase[450*768+160], ditherBase[450*768+740]].join(","), "2,3");
ok("dither demo final layout uses large direction labels and removes redundant copy",
   js.indexOf('demoText("四色抖动色阶", 384, 8, 34, "#000", "center"') >= 0
   && js.indexOf('demoText(routes[l], 16, ly + 36, 34') >= 0
   && js.indexOf("近看四色点阵 · 远看连续色调") < 0
   && js.indexOf('var names = ["灰阶"') < 0
   && js.indexOf('384, 538, 20') >= 0
   && js.indexOf("ditherDemoZoom") < 0
   && js.indexOf("放大观察点阵") < 0);

// 6. R1.0.16 竖屏编辑 + rotateCW 桥接
eq("PANEL device frame 768x552", sandbox.PANEL.w + "x" + sandbox.PANEL.h, "768x552");
eq("edit space portrait 552x768", sandbox.EW + "x" + sandbox.EH, "552x768");
const rot = sandbox.rotateCW(new Uint8Array([1,2,3,4,5,6]), 3, 2);
eq("rotateCW mapping (CW 90)", Array.from(rot).join(","), "4,1,5,2,6,3");
ok("packFull bridge (rotateCW -> packIdx)", js.indexOf("packIdx(rotateCW(renderComposite(EW, EH), EW, EH))") >= 0);
// 7. R1.0.16 文字框宽度边柄
ok("wrap handle h-w (left-bottom) + red delete handle h-del",
   js.indexOf('"hnd h-w"') >= 0 && js.indexOf('"hnd h-del"') >= 0
   && js.indexOf('od.act === "wl"') >= 0 && js.indexOf('"hnd h-wr"') < 0
   && page.indexOf(".h-wl") < 0);
// 8. R1.0.16 卡片顺序：选图 → 风格 → 留白 → 文字
{
  const o1 = page.indexOf('id="pickCard"'), o2 = page.indexOf('id="styleCard"'),
        o3 = page.indexOf('id="padCard"'), o4 = page.indexOf('id="textCard"');
  ok("card order pick < style < pad < text", o1 >= 0 && o1 < o2 && o2 < o3 && o3 < o4);
}
ok("portrait migration (m16rot)", js.indexOf("cfg.m16rot") >= 0);

// R1.1.0（FB-010）：A1 驱动模式 + 编辑空间几何随模式切换
// R1.1.1（FB-011/FB-012）：已删 a1Hint + DEV_API 三态 + OTA 同步页面
// R1.1.2（FB-013）：真机定案后 A1 收敛为两档（768x552 顺序默认 / 800x600 对照）
ok("personal branch fixed settings are read-only",
   page.indexOf('id="sleepSel"') < 0 && page.indexOf('id="wakeSel"') < 0
   && page.indexOf('id="wifiPwrSel"') < 0 && page.indexOf('id="panelSel"') < 0
   && page.indexOf('id="saveSleep"') < 0 && page.indexOf('id="savePanel"') < 0
   && page.indexOf("此专用版本固定") >= 0);
ok("personal branch fixed defaults and battery display",
   settings.indexOf(".sleep_s  = SETT_SLEEP_OFF") >= 0
   && settings.indexOf("旧 NVS 也不得覆盖固定值") >= 0
   && settings.indexOf("s_cfg.wifi_pwr = SETT_WIFI_PWR_MID") >= 0
   && settings.indexOf("s_cfg.sleep_s = SETT_SLEEP_OFF") >= 0
   && settings.indexOf("s_cfg.hflip = 0;") >= 0
   && page.indexOf('<b id="i-panel">A0</b>') >= 0
   && page.indexOf('<b id="i-bat">未连接电池</b>') >= 0
   && js.indexOf('$("i-bat").textContent = "未连接电池"') >= 0);
ok("R1.1.2 A1MODE default = 1 / max = 2",
   js.indexOf("var A1MODE = 1;") >= 0 && js.indexOf("var A1MODE_MAX = 2;") >= 0);
ok("R1.1.1 geometry helpers",
   js.indexOf("function panelGeomOf") >= 0 && js.indexOf("function applyPanelGeom") >= 0
   && js.indexOf("function migrateGeomTo") >= 0 && js.indexOf("function onGeomChanged") >= 0);
ok("R1.1.0 frame version follows geometry", js.indexOf("(PANEL.w === 800) ? 2 : 1") >= 0);
ok("R1.1.1 DEV_API tri-state + apiAtLeast2()",
   js.indexOf("var DEV_API = 0") >= 0 && js.indexOf("function apiAtLeast2()") >= 0
   && js.indexOf("DEV_API === 0 || DEV_API >= 2") >= 0);
ok("personal branch locks editor geometry to A0",
   js.indexOf('PANEL.name = "A0"; PANEL.id = 0; A1MODE = 1;') >= 0
   && js.indexOf("applyPanelGeom(0, 1)") >= 0);
// R1.2.0（FB-015）：版本号由 fw/page 两套合并为 MOINK_VERSION 一套；
//   固件与控制页合并到同一入口 /api/upload，由固件按请求体首块内容嗅探分流。
ok("R1.2.0 统一升级入口 UI (upFile/upGo/upmsg)",
   page.includes('id="upFile"') && page.includes('id="upGo"')
   && page.includes('class="savestate" id="upmsg"')
   && page.includes('accept=".bin,.html,.htm"') && page.includes('id="webClear"'));
ok("R1.2.0 旧的两个入口与同步复选框已删",
   page.indexOf('id="fwFile"') < 0 && page.indexOf('id="fwGo"') < 0
   && page.indexOf('id="webFile"') < 0 && page.indexOf('id="webGo"') < 0
   && page.indexOf("fwSyncPage") < 0 && page.indexOf("sync_page") < 0);
ok("R1.2.0 单一入口常量 + 无旧路由残留",
   js.indexOf('var UP_URL = "http://192.168.4.1/api/upload";') >= 0
   && js.indexOf("OTA_URL") < 0 && js.indexOf('"/api/ota"') < 0
   && page.indexOf('"/api/ota"') < 0);
ok("R1.2.0 双端同规则嗅探 (sniffKind + readHead, 固件 0xE9 / 页面 <!doctype)",
   js.indexOf("function sniffKind(bytes)") >= 0
   && js.indexOf("function readHead(file, cb)") >= 0
   && js.indexOf("bytes[0] === 0xE9") >= 0
   && js.indexOf('head.indexOf("<!doctype")') >= 0
   && js.indexOf("改 sniffKind() 必须同步改 src/ota_web.c 的 sniff_kind()") >= 0);
ok("R1.2.0 固件重启导致响应可能收不到 -> sentAll 兜底",
   js.indexOf("var sentAll = false") >= 0 && js.indexOf("if (isFw && sentAll)") >= 0);
// R1.1.3（FB-014）：设置项就地保存状态（不再依赖图片页里不可见的 #msg）+ 保存后回读核对
ok("personal branch has no editable device settings",
   page.indexOf('id="hflip"') < 0 && page.indexOf('id="saveHflip"') < 0
   && page.indexOf('id="hflipmsg"') < 0 && page.indexOf('id="sleepmsg"') < 0
   && page.indexOf('id="panelmsg"') < 0 && page.indexOf('id="apmsg"') < 0);
ok("R1.1.3 就地状态助手 (saveState/readSettings/verifyFields)",
   js.indexOf("function saveState(id, kind, text)") >= 0
   && js.indexOf("function readSettings(cb)") >= 0
   && js.indexOf("function verifyFields(fields, cb)") >= 0);
ok("R1.1.3 保存后回读 /api/settings 逐字段核对（不轻信 HTTP 200）",
   js.indexOf('fetch(api("/api/settings?t=" + Date.now()))') >= 0
   && js.indexOf("badLabel(bad)") >= 0 && js.indexOf("SETT_LABEL") >= 0);
ok("R1.1.3 失败/未生效/没收到应答都有明确提示",
   js.indexOf('"✗ 保存失败：设备返回 "') >= 0 && js.indexOf('"✗ 未生效："') >= 0
   && js.indexOf('"⚠ 没收到应答：') >= 0);
ok("R1.1.3 本地预览不谎报网络异常（且照常切档预览）",
   js.indexOf("if (LOCAL_PREVIEW){") >= 0
   && js.indexOf("本地预览（未连设备）：只在本页生效") >= 0);
ok("R1.1.3 旧的静默提示路径已移除",
   page.indexOf('msg("保存失败", "err")') < 0 && page.indexOf('msg("网络错误", "err")') < 0);
ok("personal branch hotspot is display-only",
   page.indexOf('id="apSsidView"') >= 0 && page.indexOf('id="apPassView"') >= 0
   && page.indexOf('id="apSsid"') < 0 && page.indexOf('id="apPass"') < 0
   && page.indexOf('id="apClearPw"') < 0 && page.indexOf('id="saveAp"') < 0
   && js.indexOf('$("apPassView").textContent = s.pass_set ? "已设置" : "开放热点"') >= 0);
ok("R1.2.3 版本 meta", page.indexOf('content="R1.2.3"') >= 0);
ok("R1.2.1 正式配置页不含 iOS captive 专用渲染逻辑",
   js.indexOf("captiveLitePreview") < 0 && js.indexOf("iosDevice") < 0
   && page.indexOf("iosCaptiveNotice") < 0
   && js.indexOf("return packIdx(rotateCW(renderComposite(EW, EH), EW, EH))") >= 0);
ok("R1.2.1 上传前显示 loading",
   page.indexOf('id="workLoading"') >= 0 && page.indexOf('id="workLoadingText"') >= 0
   && js.indexOf("function afterLoadingPaint(fn)") >= 0
   && js.indexOf('showWorkLoading("正在生成上传数据…")') >= 0
   && js.indexOf("afterLoadingPaint(buildAndUpload)") >= 0);
ok("R1.2.1 裁剪手势松手后才生成目标预览",
   js.indexOf("crop: function(){ schedulePreview(true); }") < 0
   && js.indexOf("cropend: function(){ cropInvalid(); schedulePreview(false); }") >= 0);
ok("R1.2.1 Apple captive 使用轻量 Safari 引导页并返回 Success",
   captive.indexOf("请使用 Safari 打开配置页") >= 0
   && captive.indexOf("<p>墨印 · MoInk</p>") >= 0
   && captive.indexOf("连接窗口性能较低") < 0
   && captive.indexOf("复制地址并继续") >= 0
   && captive.indexOf('id=\\"addr\\">192.168.4.1') >= 0
   && captive.indexOf('id=\\"addr\\">http://192.168.4.1') < 0
   && captive.indexOf('name=\\"format-detection\\"') >= 0
   && captive.indexOf("clipboard.writeText('http://192.168.4.1')") >= 0
   && captive.indexOf("t.value='http://192.168.4.1'") >= 0
   && captive.indexOf("moink_done=1") >= 0
   && captive.indexOf("随后可在下一页尝试打开 Safari") >= 0
   && captive.indexOf("setTimeout(function(){location.replace('/hotspot-detect.html?moink_done=1');},700)") < 0
   && captive.indexOf("b.disabled=true;n.disabled=true;b.textContent='地址已复制'") >= 0
   && captive.indexOf("s.className='loadingState'") >= 0
   && captive.indexOf('class=\\"spinner\\" aria-hidden=\\"true\\"') >= 0
   && captive.indexOf("正在加载下一步，请稍候…") >= 0
   && captive.indexOf("requestAnimationFrame(function(){requestAnimationFrame(function(){") >= 0
   && captive.indexOf("location.replace('/hotspot-detect.html?moink_done=1')") >= 0
   && captive.indexOf('href=\\"http://192.168.4.1/\\" target=\\"_blank\\"') >= 0
   && captive.indexOf("尝试在 Safari 中打开") >= 0
   && captive.indexOf("部分版本可能不会弹出打开提示") >= 0
   && captive.indexOf("如果没有弹出提示，或仍停留在当前页面") >= 0
   && captive.indexOf("右上角的完成按钮（✓）") >= 0
   && captive.indexOf('id=\\"manualAddr\\" type=\\"text\\" value=\\"http://192.168.4.1\\" readonly') >= 0
   && captive.indexOf("自动复制失败，请长按下面的完整地址复制") >= 0
   && captive.indexOf("已手动复制，继续") >= 0
   && captive.indexOf("document.getElementById('manualNext').onclick=finish") >= 0
   && captive.indexOf("window.getSelection().selectAllChildren(a)") < 0
   && captive.indexOf("<TITLE>Success</TITLE>") >= 0
   && captive.indexOf("APPLE_SUCCESS_WINDOW_MS") < 0
   && captive.indexOf("return s_apple_success_pending;") >= 0
   && netifAp.indexOf("captive_apple_station_connected();") >= 0
   && netifAp.indexOf("captive_apple_station_disconnected();") >= 0
   && captive.indexOf("captive_deauth_task") < 0);
ok("R1.2.1 小米文件选择兜底缩短为 0.8 秒",
   js.indexOf('if (!pickerLeftPage) $("browserFallback").classList.add("show");') >= 0
   && js.indexOf("}, 800);") >= 0 && js.indexOf("}, 1200);") < 0);
ok("R1.2.2 Android captive 兜底显示完整 HTTP 地址并跳系统浏览器",
   page.indexOf("打开 http://192.168.4.1 继续") >= 0
   && page.indexOf("在系统浏览器中打开 http://192.168.4.1") >= 0
   && page.indexOf("intent://192.168.4.1/#Intent;scheme=http;") >= 0
   && page.indexOf("S.browser_fallback_url=http%3A%2F%2F192.168.4.1%2F") >= 0);
ok("R1.2.1 文字框仅当前会话有效，重新打开页面为空",
   js.indexOf("delete stored.objsImg; delete stored.objsNote; delete stored.text;") >= 0
   && js.indexOf("cfg.objsImg = [];") >= 0
   && js.indexOf("cfg.objsNote = [];") >= 0
   && js.indexOf('if (!o){ txtEl.value = ""; return; }') >= 0);
ok("R1.2.2 文字拖动缓存静态画布、选中文字度量与页面缩放",
   js.indexOf("liveBase = renderLiveBase(EW, EH, od ? od.i : -1)") >= 0
   && js.indexOf("function ensureObjHandles(el)") >= 0
   && js.indexOf('if (el.querySelector(".hnd")) return') >= 0
   && js.indexOf("function renderLiveBase(cw, ch, skipIndex)") >= 0
   && js.indexOf("if (i !== skipIndex) drawObj(ctx, objs[i], cw)") >= 0
   && js.indexOf("ctx.drawImage(liveBase, 0, 0)") >= 0
   && js.indexOf("ctx.putImageData(liveBase, 0, 0)") < 0
   && js.indexOf("liveMetric = o ? objMetrics(o, 1) : null") >= 0
   && js.indexOf("scale:dragScale") >= 0
   && js.indexOf("var s = od.scale") >= 0
   && js.indexOf('el.textContent = "";\n  var hS') < 0);
// DEV_API 三态行为：0 = 未连设备（离线乐观） / 1 = 旧固件（收紧） / 2 = 新固件
// R1.1.2（FB-013）：mode 1 = 768x552 顺序（默认正解，任何 api 下都是 768x552）；
//                   mode 2 = 方案A 原生 800x600（需 api>=2，离线按可用乐观）。
sandbox.DEV_API = 0;
eq("R1.1.2 offline(0) + mode 1 (default) -> 768x552",
   sandbox.panelGeomOf(1, 1).w + "x" + sandbox.panelGeomOf(1, 1).h, "768x552");
eq("R1.1.2 offline(0) + mode 2 (native800) -> 800x600",
   sandbox.panelGeomOf(1, 2).w + "x" + sandbox.panelGeomOf(1, 2).h, "800x600");
sandbox.DEV_API = 1;
eq("R1.1.2 legacy api=1 + mode 2 -> 768x552 (tightened)",
   sandbox.panelGeomOf(1, 2).w + "x" + sandbox.panelGeomOf(1, 2).h, "768x552");
eq("R1.1.2 legacy api=1 + mode 1 -> 768x552",
   sandbox.panelGeomOf(1, 1).w + "x" + sandbox.panelGeomOf(1, 1).h, "768x552");
sandbox.DEV_API = 2;
eq("R1.1.2 api=2 + mode 2 -> native 800x600",
   sandbox.panelGeomOf(1, 2).w + "x" + sandbox.panelGeomOf(1, 2).h, "800x600");
eq("R1.1.2 api=2 + mode 1 (default) -> 768x552",
   sandbox.panelGeomOf(1, 1).w + "x" + sandbox.panelGeomOf(1, 1).h, "768x552");
sandbox.DEV_API = 0;   /* 还原初态，避免污染后续断言 */
eq("R1.1.0 panelGeomOf A0 ignores mode", sandbox.panelGeomOf(0, 1).w + "x" + sandbox.panelGeomOf(0, 1).h, "768x552");
eq("R1.1.0 GEOM_SRC default geometry", sandbox.GEOM_SRC.w + "x" + sandbox.GEOM_SRC.h, "552x768");

ok("R1.2.0 状态栏单版本号 (版本/帧协议版本, 无 fw/page 双行)",
   page.includes('id="i-verD"') && page.includes('id="i-apiD"')
   && page.includes('<span>帧协议版本</span>') && page.includes('<span>当前已连接设备</span>')
   && page.indexOf('id="i-fw"') < 0 && page.indexOf('id="i-page"') < 0);
ok("R1.2.0 热更页落后固件时红字警示 (DEV_FW + verNum + j.ver||j.fw)",
   js.indexOf('var DEV_FW = "";') >= 0 && js.indexOf("function verNum(v)") >= 0
   && js.indexOf("var ver = j.ver || j.fw") >= 0
   && js.indexOf("控制页版本低于固件") >= 0);
ok("R1.2.0 A1.1 诊断变体 UI 整块删除 (选项/行/字段)",
   page.indexOf("A1.1") < 0 && page.indexOf('id="a11Sel"') < 0
   && page.indexOf('id="a11Row"') < 0 && js.indexOf("a11_var") < 0
   && js.indexOf("a11Sel") < 0);
ok("R1.2.0 版本号比较按 主*10000+次*100+修订",
   js.indexOf("+m[1] * 10000 + +m[2] * 100 + +m[3]") >= 0);
ok("页脚存在 (footer#appFoot)",
   page.indexOf('id="appFoot"') >= 0 && page.indexOf("footer#appFoot") >= 0);
ok("页脚含个人版标识和 yuan GitHub 地址",
   page.indexOf('href="https://github.com/yuan910715/moink"') >= 0
   && page.indexOf("GitHub · yuan910715/moink") >= 0
   && page.indexOf('m.content+" · yuan个人版"') >= 0);
ok("页脚版本号运行时填充 (footVer + meta)",
   page.indexOf('id="footVer"') >= 0 && page.indexOf('meta[name="moink-page-version"]') >= 0);

console.log(failed === 0 ? "SMOKE: ALL PASS" : ("SMOKE: " + failed + " FAILED"));
process.exit(failed === 0 ? 0 : 1);
