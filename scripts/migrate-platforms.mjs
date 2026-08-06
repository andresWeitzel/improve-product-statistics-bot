import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const file = path.resolve(__dirname, "../data/visits.json");

function resolvePlatform(platform, url = "") {
  const p = String(platform || "").toLowerCase().trim();
  if (p === "facebook" || p === "fb") return "facebook";
  if (p === "mercadolibre" || p === "ml") return "mercadolibre";
  const u = String(url || "").toLowerCase();
  if (u.includes("facebook.com") || u.includes("fb.com")) return "facebook";
  return "mercadolibre";
}

if (!fs.existsSync(file)) {
  console.log("No visits.json");
  process.exit(0);
}

const data = JSON.parse(fs.readFileSync(file, "utf8"));
let changed = 0;
data.visits = (data.visits || []).map((v) => {
  const platform = resolvePlatform(v.platform, v.url);
  if (v.platform !== platform) changed += 1;
  return { ...v, platform };
});
data.savedAt = new Date().toISOString();
fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");

const ml = data.visits.filter((v) => v.platform === "mercadolibre").length;
const fb = data.visits.filter((v) => v.platform === "facebook").length;
console.log(`Migrated: ${changed} updated · ML=${ml} FB=${fb} total=${data.visits.length}`);
