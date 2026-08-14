import { loadPlatformUrls } from "../shared/loadPlatformUrls.js";

export const facebookConfig = {
  id: "facebook",
  label: "Facebook",
  short: "FB",
  enabled: true,
  // URLs: facebook.urls.json (plantilla: facebook.urls.example.json)
  urls: loadPlatformUrls("facebook"),
  pauseBetweenMs: 10000,
  pauseJitterMs: 5000,
  stayOnPageMs: 15000,
  navTimeoutMs: 70000,
  waitUntil: "domcontentloaded",
};
