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
 * Prefer Chrome for ML (menos account-verification que Edge+Puppeteer).
 * Prefer env override, then system browsers on Windows.
 */
export function resolveBrowserExecutablePath({ preferChrome = false } = {}) {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    const fromEnv = process.env.PUPPETEER_EXECUTABLE_PATH;
    if (fs.existsSync(fromEnv)) return fromEnv;
    console.warn(`⚠️ PUPPETEER_EXECUTABLE_PATH no existe: ${fromEnv}`);
  }

  if (os.platform() === "win32") {
    const ordered = preferChrome
      ? [
          ...WINDOWS_CANDIDATES.filter((p) => /chrome\.exe$/i.test(p || "")),
          ...WINDOWS_CANDIDATES.filter((p) => /msedge\.exe$/i.test(p || "")),
        ]
      : WINDOWS_CANDIDATES;

    const seen = new Set();
    for (const candidate of ordered) {
      if (!candidate || seen.has(candidate)) continue;
      seen.add(candidate);
      if (fs.existsSync(candidate)) return candidate;
    }
  }

  return undefined;
}
