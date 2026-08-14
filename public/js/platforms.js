import { fetchPlatforms } from "./api.js";
import { els, isMlEnabled, state } from "./state.js";

export function platformLabel(platform) {
  return platform === "facebook" ? "FB" : "ML";
}

export function platformClass(platform) {
  if (platform === "facebook") return "platform-pill--fb";
  const disabled = !isMlEnabled() ? " platform-pill--disabled" : "";
  return `platform-pill--ml${disabled}`;
}

export function resolvePlatformClient(platform, url = "") {
  const p = String(platform || "").toLowerCase();
  if (p === "facebook" || p === "fb") return "facebook";
  if (p === "mercadolibre" || p === "ml") return "mercadolibre";
  const u = String(url || "").toLowerCase();
  if (u.includes("facebook.com") || u.includes("fb.com")) return "facebook";
  return "mercadolibre";
}

export function applyPlatformAvailabilityUi(onReload) {
  const mlOn = isMlEnabled();

  if (els.metricMl) {
    els.metricMl.classList.toggle("metric--disabled", !mlOn);
    els.metricMl.title = mlOn ? "MercadoLibre" : "MercadoLibre próximamente";
  }

  if (els.filterPlatformMl) {
    els.filterPlatformMl.disabled = !mlOn;
    els.filterPlatformMl.classList.toggle("filter--disabled", !mlOn);
    els.filterPlatformMl.title = mlOn
      ? "Filtrar MercadoLibre"
      : "MercadoLibre próximamente";
  }

  if (!mlOn && state.platform === "mercadolibre") {
    state.platform = "facebook";
    document.querySelectorAll(".filter[data-platform]").forEach((b) => {
      b.classList.toggle("is-active", b.dataset.platform === "facebook");
    });
    onReload?.();
  }
}

export async function loadPlatforms(onReload) {
  try {
    const data = await fetchPlatforms();
    const map = {};
    for (const p of data || []) {
      map[p.id] = p;
    }
    state.platforms = {
      mercadolibre: map.mercadolibre || { enabled: false },
      facebook: map.facebook || { enabled: true },
    };
    applyPlatformAvailabilityUi(onReload);
  } catch (err) {
    console.error("platforms:", err);
    applyPlatformAvailabilityUi(onReload);
  }
}
