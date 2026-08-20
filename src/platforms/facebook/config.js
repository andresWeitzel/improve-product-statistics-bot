import { loadPlatformUrls } from "../shared/loadPlatformUrls.js";

function envFlag(name, defaultValue) {
  const v = process.env[name];
  if (v === undefined || v === "") return defaultValue;
  return ["1", "true", "yes", "on"].includes(String(v).trim().toLowerCase());
}

export const facebookConfig = {
  id: "facebook",
  label: "Facebook",
  short: "FB",
  // Local default on; en Render: FACEBOOK_ENABLED=true|false
  enabled: envFlag("FACEBOOK_ENABLED", true),
  // URLs: FACEBOOK_URLS_JSON (Render) o facebook.urls.json (local)
  urls: loadPlatformUrls("facebook"),
  pauseBetweenMs: 10000,
  pauseJitterMs: 5000,
  stayOnPageMs: 15000,
  navTimeoutMs: 70000,
  waitUntil: "domcontentloaded",
};
