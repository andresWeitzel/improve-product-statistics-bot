/**
 * Monitor UI — punto de entrada.
 * Módulos: state, api, charts, platforms, history, stats, filters.
 */
import { setConnection } from "./connection.js";
import { bindFilters, fillHourSelects, resetFilters } from "./filters.js";
import {
  applyFiltersAndReload,
  bindPager,
  loadHistory,
} from "./history.js";
import { loadPlatforms } from "./platforms.js";
import { bindEls, els, isMlEnabled, state } from "./state.js";
import { copyFailLogs, loadActivityChart, loadStats, renderStats } from "./stats.js";

bindEls();

const socket = io();

function refreshAll() {
  return loadPlatforms(applyFiltersAndReload).then(() => {
    loadHistory();
    loadStats();
    loadActivityChart();
  });
}

function scheduleRefresh() {
  clearTimeout(state.refreshTimer);
  state.refreshTimer = setTimeout(() => {
    if (state.page === 1) loadHistory();
    loadStats();
    loadActivityChart();
  }, 350);
}

function bindActions() {
  bindFilters();
  bindPager();
  els.clearFiltersBtn?.addEventListener("click", resetFilters);
  els.copyFailsBtn?.addEventListener("click", copyFailLogs);
}

socket.on("connect", () => {
  setConnection("ok", "Conectado");
  refreshAll();
});

socket.on("disconnect", () => {
  setConnection("fail", "Desconectado");
});

socket.on("stats", (stats) => {
  renderStats(stats);
  if (!stats?.timeline) loadActivityChart();
});

socket.on("update", () => {
  scheduleRefresh();
});

window.addEventListener("resize", () => {
  loadActivityChart();
  loadStats();
});

fillHourSelects();
bindActions();
loadPlatforms(applyFiltersAndReload).then(() => {
  if (!isMlEnabled() && state.platform === "all") {
    state.platform = "facebook";
    document.querySelectorAll(".filter[data-platform]").forEach((b) => {
      b.classList.toggle("is-active", b.dataset.platform === "facebook");
    });
  }
  loadHistory();
  loadStats();
  loadActivityChart();
});
