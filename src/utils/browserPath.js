import fs from "fs";
import path from "path";
import os from "os";

const WINDOWS_CANDIDATES = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  path.join(
    process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)",
    "Microsoft",
    "Edge",
    "Application",
    "msedge.exe"
  ),
  path.join(
    process.env.PROGRAMFILES || "C:\\Program Files",
    "Microsoft",
    "Edge",
    "Application",
    "msedge.exe"
  ),
  path.join(
    process.env.LOCALAPPDATA || "",
    "Microsoft",
    "Edge",
    "Application",
    "msedge.exe"
  ),
  path.join(
    process.env.PROGRAMFILES || "C:\\Program Files",
    "Google",
    "Chrome",
    "Application",
    "chrome.exe"
  ),
  path.join(
    process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)",
    "Google",
    "Chrome",
    "Application",
    "chrome.exe"
  ),
  path.join(
    process.env.LOCALAPPDATA || "",
    "Google",
    "Chrome",
    "Application",
    "chrome.exe"
  ),
].filter(Boolean);

/**
 * Resolve a browser binary for Puppeteer.
 * Prefer env override, then system Edge/Chrome on Windows.
 * Returns undefined so Puppeteer can use its bundled Chrome when available.
 */
export function resolveBrowserExecutablePath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    const fromEnv = process.env.PUPPETEER_EXECUTABLE_PATH;
    if (fs.existsSync(fromEnv)) return fromEnv;
    console.warn(`⚠️ PUPPETEER_EXECUTABLE_PATH no existe: ${fromEnv}`);
  }

  if (os.platform() === "win32") {
    for (const candidate of WINDOWS_CANDIDATES) {
      if (candidate && fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }

  return undefined;
}
