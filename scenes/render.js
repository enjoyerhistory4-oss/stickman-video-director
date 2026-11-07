// Render all scenes to one video with the final audio mix.
// Usage: node scenes/render.js OUT.mp4   (needs ffmpeg + Playwright)
const { chromium } = require("playwright");
const { spawn } = require("child_process");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SCENES = [1, 2, 3, 4, 5, 6, 7, 8];
const out = process.argv[2] || path.join(ROOT, "stay-inside-ep1.mp4");

(async () => {
  const ff = spawn("ffmpeg", [
    "-y", "-hide_banner", "-loglevel", "error",
    "-f", "image2pipe", "-framerate", "30", "-c:v", "png", "-i", "-",
    "-i", path.join(ROOT, "audio", "ep1-mix.mp3"),
    "-map", "0:v", "-map", "1:a",
    "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
    "-r", "30", "-c:a", "aac", "-b:a", "192k", "-t", "60", "-movflags", "+faststart", out,
  ], { stdio: ["pipe", "inherit", "inherit"] });
  const ffDone = new Promise((res, rej) => ff.on("close", (c) => (c === 0 ? res() : rej(new Error("ffmpeg exit " + c)))));

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => { console.error("page error:", e.message); process.exit(1); });
  let total = 0;
  for (const n of SCENES) {
    const name = `scene${String(n).padStart(2, "0")}`;
    await page.goto("file://" + path.join(__dirname, `${name}.html`) + "?capture");
    await page.waitForFunction(() => window.sceneReady === true);
    const { frames } = await page.evaluate(() => window.sceneInfo);
    for (let f = 0; f < frames; f++) {
      await page.evaluate((i) => window.renderFrame(i), f);
      const png = await page.screenshot({ type: "png" });
      if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once("drain", r));
    }
    total += frames;
    console.log(`${name}: ${frames} frames (total ${total})`);
  }
  await browser.close();
  ff.stdin.end();
  await ffDone;
  console.log(`wrote ${out}: ${total} frames = ${(total / 30).toFixed(2)}s`);
})();
