// Capture review stills: node scenes/stills.js OUT_DIR scene01:1.5,4 scene02:0.5 ...
// Each still is a 1080x1920 PNG named sceneNN-t<time>.png.
const { chromium } = require("playwright");
const path = require("path");

(async () => {
  const [out, ...jobs] = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.error("page error:", e.message));
  for (const job of jobs) {
    const [name, times] = job.split(":");
    await page.goto("file://" + path.resolve(__dirname, `${name}.html`) + "?capture");
    await page.waitForFunction(() => window.sceneReady === true);
    for (const t of times.split(",")) {
      await page.evaluate((tt) => window.renderAt(tt), parseFloat(t));
      const file = path.join(out, `${name}-t${t}.png`);
      await page.screenshot({ path: file });
      console.log(file);
    }
  }
  await browser.close();
})();
