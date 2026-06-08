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

function imageSignature(filePath: string) {
  return execFileSync("magick", [filePath, "-format", "%#", "info:"], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}

function writeIfPixelsChanged(tempPath: string, outputPath: string) {
  const shouldReplace = !fs.existsSync(outputPath) || imageSignature(tempPath) !== imageSignature(outputPath);
  if (shouldReplace) {
    fs.renameSync(tempPath, outputPath);
    return;
  }
  fs.unlinkSync(tempPath);
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
  const outputPath = path.join(assetDir, "COVER_001.png");
  const tempPath = path.join(assetDir, ".COVER_001.tmp.png");
  header(args, "2026 WORLD CUP / VIEWING GUIDE", "2026 世界杯");
  annotate(args, displayFont, "76", "#111D31", 118, 292, "三国联办，等你开场");
  annotate(args, bodyFont, "38", "#39465A", 124, 354, "把赛程、城市和观赛边界先讲清楚");
  pill(args, 124, 410, 284, "30 秒观赛提醒", "#D8A848", "#111D31");

  const cards = [
    ["01", "三国联办", "美国 / 墨西哥 / 加拿大"],
    ["02", "48 队扩军", "更多比赛和城市"],
    ["03", "赛程复核", "以 FIFA 官方页面为准"]
  ];
  cards.forEach(([num, title, body], index) => {
    const y = 238 + index * 142;
    drawCard(args, 792, y, 712, 108, "#FFFFFF", "rgba(17,29,49,0.12)");
    args.push("-fill", index === 0 ? "#E0B15A" : "#1BA6A6", "-draw", `circle 846,${y + 54} 846,${y + 18}`);
    annotate(args, displayFont, "32", "#FFFFFF", 824, y + 66, num);
    annotate(args, displayFont, "42", "#111D31", 902, y + 50, title);
    annotate(args, bodyFont, "29", "#526071", 902, y + 88, body);
  });

  args.push(tempPath);
  run(args);
  writeIfPixelsChanged(tempPath, outputPath);
}

function renderValue() {
  const args = baseArgs("#1BA6A6");
  const outputPath = path.join(assetDir, "MEDIA_001.png");
  const tempPath = path.join(assetDir, ".MEDIA_001.tmp.png");
  header(args, "MATCHDAY / VIEWING SCENES", "核心看点和观赛场景");

  const items = [
    ["开幕关注", "6 月 11 日拉开赛程"],
    ["决赛时间", "7 月 19 日收官"],
    ["球队扩军", "48 支球队同场竞争"],
    ["城市观赛", "跨三国多城市体验"]
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
  annotate(args, displayFont, "48", "#FFFFFF", 1260, 356, "看球的人");
  annotate(args, bodyFont, "30", "#D9E3EE", 1260, 420, "约朋友观赛");
  annotate(args, bodyFont, "30", "#D9E3EE", 1260, 466, "规划行程");
  annotate(args, bodyFont, "30", "#D9E3EE", 1260, 512, "关注赛程更新");
  args.push("-fill", "#E0B15A", "-draw", "roundrectangle 1260,602 1458,612 5,5");

  args.push(tempPath);
  run(args);
  writeIfPixelsChanged(tempPath, outputPath);
}

function renderDecision() {
  const args = baseArgs("#FF7A59");
  const outputPath = path.join(assetDir, "MEDIA_002.png");
  const tempPath = path.join(assetDir, ".MEDIA_002.tmp.png");
  header(args, "VIEWING CHECKLIST / INFO BOUNDARY", "观赛提醒和信息边界");
  annotate(args, displayFont, "72", "#111D31", 124, 294, "先核对，再出发");
  annotate(args, bodyFont, "36", "#39465A", 128, 354, "场馆、赛程和转播信息要以官方更新为准");

  drawCard(args, 124, 432, 446, 160, "#FFFFFF", "rgba(17,29,49,0.12)");
  annotate(args, bodyFont, "30", "#526071", 164, 488, "适合");
  annotate(args, displayFont, "42", "#111D31", 164, 542, "看球 / 旅行 / 聚会");
  annotate(args, bodyFont, "29", "#526071", 164, 580, "提前规划观赛时间");

  drawCard(args, 624, 432, 446, 160, "#FFFFFF", "rgba(17,29,49,0.12)");
  annotate(args, bodyFont, "30", "#526071", 664, 488, "确认");
  annotate(args, displayFont, "42", "#111D31", 664, 542, "官方最新赛程");
  annotate(args, bodyFont, "29", "#526071", 664, 580, "场馆、开球和转播窗口");

  drawCard(args, 1124, 270, 380, 322, "#111D31", "rgba(17,29,49,0.10)");
  annotate(args, bodyFont, "30", "rgba(255,255,255,0.66)", 1172, 338, "最终提醒");
  annotate(args, displayFont, "52", "#FFFFFF", 1170, 420, "以官方为准");
  annotate(args, bodyFont, "30", "#D9E3EE", 1174, 486, "赛程会更新");
  annotate(args, bodyFont, "30", "#D9E3EE", 1174, 532, "出发前再核对");
  args.push("-fill", "#FF7A59", "-draw", "roundrectangle 1174,602 1450,612 5,5");

  args.push(tempPath);
  run(args);
  writeIfPixelsChanged(tempPath, outputPath);
}

fs.mkdirSync(assetDir, { recursive: true });
renderCover();
renderValue();
renderDecision();

console.log("video:assets completed");
console.log("assets=public/mock-assets/COVER_001.png,public/mock-assets/MEDIA_001.png,public/mock-assets/MEDIA_002.png");
