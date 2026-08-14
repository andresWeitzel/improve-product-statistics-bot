import puppeteer from "puppeteer";
import path from "path";
import { fileURLToPath } from "url";
import { resolveBrowserExecutablePath } from "../src/utils/browserPath.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(__dirname, "../doc/assets");
const base = "http://localhost:9008";
const executablePath = resolveBrowserExecutablePath({ preferChrome: true });

const browser = await puppeteer.launch({
  headless: "new",
  executablePath,
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--window-size=1440,900"],
  defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
});

async function shot(pagePath, file, waitMs = 2500) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto(`${base}${pagePath}`, {
    waitUntil: "networkidle2",
    timeout: 60000,
  });
  await new Promise((r) => setTimeout(r, waitMs));
  const filePath = path.join(out, file);
  await page.screenshot({ path: filePath, fullPage: true, type: "png" });
  console.log("OK", file);
  await page.close();
}

try {
  await shot("/", "monitor_readme.png", 4000);
  await shot("/", "home_readme.png", 800);
  await shot("/actions.html", "actions_readme.png", 4000);
  await shot("/actions.html", "actions_panel_readme.png", 800);
  await shot("/admin.html", "admin_readme.png", 3500);
  console.log("done");
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await browser.close();
}
