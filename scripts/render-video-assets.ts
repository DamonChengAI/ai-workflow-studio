import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const width = 1672;
const height = 941;
const assetDir = path.join(process.cwd(), "public/mock-assets");

function run(args: string[]) {
  execFileSync("magick", args, {
    cwd: process.cwd(),
    stdio: "pipe"
  });
}

function fontList() {
  try {
    return execFileSync("magick", ["-list", "font"], { encoding: "utf8" });
  } catch {
    return "";
  }
}

const fonts = fontList();

function pickFont(candidates: string[], fallback: string) {
  return candidates.find((font) => fonts.includes(`Font: ${font}`)) ?? fallback;
}

const displayFont = pickFont(["PingFang-SC-Semibold", "Hiragino-Sans-GB-W6", "Heiti-SC-Medium"], "Hiragino-Sans-GB-W6");
const bodyFont = pickFont(["PingFang-SC-Regular", "Hiragino-Sans-GB-W3", "Heiti-SC-Light"], "Hiragino-Sans-GB-W3");
const monoFont = pickFont(["SF-Mono-Regular", "Menlo-Regular", "Menlo"], "Menlo");

function gridDraw() {
  const lines: string[] = [];
  for (let x = 88; x <= width - 88; x += 88) lines.push(`line ${x},138 ${x},732`);
  for (let y = 164; y <= 724; y += 88) lines.push(`line 64,${y} ${width - 64},${y}`);
  return lines.join(" ");
}

function baseArgs(accent: string) {
  return [
    "-size",
    `${width}x${height}`,
    "gradient:#F8FAFC-#E8EEF5",
    "-fill",
    "rgba(18,32,51,0.045)",
    "-stroke",
    "none",
    "-draw",
    gridDraw(),
    "-fill",
    "#111D31",
    "-draw",
    `rectangle 0,0 ${width},132`,
    "-fill",
    accent,
    "-draw",
    `rectangle 0,132 ${width},142`,
    "-fill",
    "rgba(17,29,49,0.06)",
    "-draw",
    `rectangle 0,748 ${width},${height}`,
    "-fill",
    "rgba(255,255,255,0.62)",
    "-draw",
    "roundrectangle 68,184 1604,704 34,34",
    "-stroke",
    "rgba(17,29,49,0.10)",
    "-strokewidth",
    "2",
    "-fill",
    "none",
    "-draw",
    "roundrectangle 68,184 1604,704 34,34",
    "-stroke",
    "none"
  ];
}

function header(args: string[], eyebrow: string, title: string) {
  args.push(
    "-font",
    monoFont,
    "-pointsize",
    "28",
    "-fill",
    "rgba(255,255,255,0.62)",
    "-annotate",
    "+96+56",
    eyebrow,
    "-font",
    displayFont,
    "-pointsize",
    "54",
    "-fill",
    "#FFFFFF",
    "-annotate",
    "+96+108",
    title
  );
}

function annotate(args: string[], font: string, size: string, color: string, x: number, y: number, text: string) {
  args.push("-font", font, "-pointsize", size, "-fill", color, "-annotate", `+${x}+${y}`, text);
}

function drawCard(args: string[], x: number, y: number, w: number, h: number, fill: string, stroke: string) {
  args.push(
    "-fill",
    "rgba(17,29,49,0.10)",
    "-draw",
    `roundrectangle ${x + 10},${y + 14} ${x + w + 10},${y + h + 14} 28,28`,
    "-fill",
    fill,
    "-stroke",
    stroke,
    "-strokewidth",
    "2",
    "-draw",
    `roundrectangle ${x},${y} ${x + w},${y + h} 28,28`,
    "-stroke",
    "none"
  );
}

function pill(args: string[], x: number, y: number, w: number, label: string, fill = "#111D31", textFill = "#FFFFFF") {
  args.push("-fill", fill, "-draw", `roundrectangle ${x},${y} ${x + w},${y + 48} 24,24`);
  annotate(args, bodyFont, "28", textFill, x + 28, y + 34, label);
}

function renderCover() {
  const args = baseArgs("#E0B15A");
  header(args, "DOUBAO PRO / DECISION GUIDE", "豆包高级套餐");
  annotate(args, displayFont, "76", "#111D31", 118, 292, "先核对，再购买");
  annotate(args, bodyFont, "38", "#39465A", 124, 354, "把权益、频率和风险边界先讲清楚");
  pill(args, 124, 410, 284, "30 秒购买判断", "#D8A848", "#111D31");

  const cards = [
    ["01", "公开信息核对", "避免直接编广告"],
    ["02", "使用频率判断", "写作 / 搜索 / 图片 / 长任务"],
    ["03", "购买前确认", "以官方最新页面为准"]
  ];
  cards.forEach(([num, title, body], index) => {
    const y = 238 + index * 142;
    drawCard(args, 792, y, 712, 108, "#FFFFFF", "rgba(17,29,49,0.12)");
    args.push("-fill", index === 0 ? "#E0B15A" : "#1BA6A6", "-draw", `circle 846,${y + 54} 846,${y + 18}`);
    annotate(args, displayFont, "32", "#FFFFFF", 824, y + 66, num);
    annotate(args, displayFont, "42", "#111D31", 902, y + 50, title);
    annotate(args, bodyFont, "29", "#526071", 902, y + 88, body);
  });

  args.push(path.join(assetDir, "COVER_001.png"));
  run(args);
}

function renderValue() {
  const args = baseArgs("#1BA6A6");
  header(args, "BENEFITS / USAGE SCENES", "核心权益和使用场景");

  const items = [
    ["写作创作", "稳定输出长文、脚本、改写"],
    ["深度搜索", "先查证，再组织结论"],
    ["图片生成", "海报、封面、视觉草图"],
    ["长任务处理", "更少等待，更适合连续工作"]
  ];
  items.forEach(([title, body], index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = 124 + col * 540;
    const y = 230 + row * 196;
    drawCard(args, x, y, 464, 142, "#FFFFFF", "rgba(17,29,49,0.12)");
    args.push("-fill", index % 2 === 0 ? "#E0B15A" : "#1BA6A6", "-draw", `roundrectangle ${x + 30},${y + 30} ${x + 92},${y + 92} 18,18`);
    annotate(args, displayFont, "44", "#111D31", x + 124, y + 62, title);
    annotate(args, bodyFont, "29", "#526071", x + 124, y + 104, body);
  });

  drawCard(args, 1214, 230, 290, 338, "#111D31", "rgba(17,29,49,0.10)");
  annotate(args, bodyFont, "30", "rgba(255,255,255,0.66)", 1260, 286, "适合人群");
  annotate(args, displayFont, "48", "#FFFFFF", 1260, 356, "高频 AI 用户");
  annotate(args, bodyFont, "30", "#D9E3EE", 1260, 420, "每天都在写作");
  annotate(args, bodyFont, "30", "#D9E3EE", 1260, 466, "需要搜索判断");
  annotate(args, bodyFont, "30", "#D9E3EE", 1260, 512, "处理连续任务");
  args.push("-fill", "#E0B15A", "-draw", "roundrectangle 1260,602 1458,612 5,5");

  args.push(path.join(assetDir, "MEDIA_001.png"));
  run(args);
}

function renderDecision() {
  const args = baseArgs("#FF7A59");
  header(args, "BUYING CHECKLIST / RISK BOUNDARY", "购买提醒和风险边界");
  annotate(args, displayFont, "72", "#111D31", 124, 294, "认真比较，再下单");
  annotate(args, bodyFont, "36", "#39465A", 128, 354, "套餐是否值得买，取决于真实使用频率");

  drawCard(args, 124, 432, 446, 160, "#FFFFFF", "rgba(17,29,49,0.12)");
  annotate(args, bodyFont, "30", "#526071", 164, 488, "适合");
  annotate(args, displayFont, "42", "#111D31", 164, 542, "学习 / 创作 / 工作");
  annotate(args, bodyFont, "29", "#526071", 164, 580, "每天都要用 AI 处理任务");

  drawCard(args, 624, 432, 446, 160, "#FFFFFF", "rgba(17,29,49,0.12)");
  annotate(args, bodyFont, "30", "#526071", 664, 488, "确认");
  annotate(args, displayFont, "42", "#111D31", 664, 542, "官方最新权益");
  annotate(args, bodyFont, "29", "#526071", 664, 580, "价格、限制和服务条款");

  drawCard(args, 1124, 270, 380, 322, "#111D31", "rgba(17,29,49,0.10)");
  annotate(args, bodyFont, "30", "rgba(255,255,255,0.66)", 1172, 338, "最终判断");
  annotate(args, displayFont, "52", "#FFFFFF", 1170, 420, "值得认真比较");
  annotate(args, bodyFont, "30", "#D9E3EE", 1174, 486, "高频使用时");
  annotate(args, bodyFont, "30", "#D9E3EE", 1174, 532, "再考虑购买");
  args.push("-fill", "#FF7A59", "-draw", "roundrectangle 1174,602 1450,612 5,5");

  args.push(path.join(assetDir, "MEDIA_002.png"));
  run(args);
}

fs.mkdirSync(assetDir, { recursive: true });
renderCover();
renderValue();
renderDecision();

console.log("video:assets completed");
console.log("assets=public/mock-assets/COVER_001.png,public/mock-assets/MEDIA_001.png,public/mock-assets/MEDIA_002.png");
