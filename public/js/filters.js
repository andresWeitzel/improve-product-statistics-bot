import { applyFiltersAndReload, loadHistory } from "./history.js";
import { isMlEnabled, els, state } from "./state.js";
import { pad2 } from "./util.js";

export function setRangeActive(range) {
  document.querySelectorAll(".filter[data-range]").forEach((b) => {
    b.classList.toggle("is-active", b.dataset.range === range);
  });
}

export function fillHourSelects() {
  const opts = ['<option value="">--</option>'];
  for (let h = 0; h < 24; h++) {
    opts.push(`<option value="${h}">${pad2(h)}:00</option>`);
  }
  const html = opts.join("");
  if (els.hourFromFilter) els.hourFromFilter.innerHTML = html;
  if (els.hourToFilter) els.hourToFilter.innerHTML = html;
}

export function resetFilters() {
  state.status = "all";
  state.platform = isMlEnabled() ? "all" : "facebook";
  state.range = "all";
  state.date = "";
  state.hourFrom = "";
  state.hourTo = "";
  state.product = "";
  state.q = "";
  state.page = 1;

  document.querySelectorAll(".filter[data-status]").forEach((b) => {
    b.classList.toggle("is-active", b.dataset.status === "all");
  });
  document.querySelectorAll(".filter[data-platform]").forEach((b) => {
    b.classList.toggle("is-active", b.dataset.platform === state.platform);
  });
  setRangeActive("all");
  if (els.dateFilter) els.dateFilter.value = "";
  if (els.hourFromFilter) els.hourFromFilter.value = "";
  if (els.hourToFilter) els.hourToFilter.value = "";
  if (els.productFilter) els.productFilter.value = "";
  if (els.searchFilter) els.searchFilter.value = "";
  loadHistory();
}

export function bindFilters() {
  document.querySelectorAll(".filter[data-status]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll(".filter[data-status]")
        .forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      state.status = btn.dataset.status;
      applyFiltersAndReload();
    });
  });

  document.querySelectorAll(".filter[data-platform]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.disabled || btn.classList.contains("filter--disabled")) return;
      if (btn.dataset.platform === "mercadolibre" && !isMlEnabled()) return;
      document
        .querySelectorAll(".filter[data-platform]")
        .forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      state.platform = btn.dataset.platform;
      applyFiltersAndReload();
    });
  });

  document.querySelectorAll(".filter[data-range]").forEach((btn) => {
    btn.addEventListener("click", () => {
      setRangeActive(btn.dataset.range);
      state.range = btn.dataset.range;
      state.date = "";
      if (els.dateFilter) els.dateFilter.value = "";
      applyFiltersAndReload();
    });
  });

  els.dateFilter?.addEventListener("change", () => {
    state.date = els.dateFilter.value || "";
    if (state.date) {
      state.range = "all";
      setRangeActive("all");
    }
    applyFiltersAndReload();
  });

  els.hourFromFilter?.addEventListener("change", () => {
    state.hourFrom = els.hourFromFilter.value;
    applyFiltersAndReload();
  });

  els.hourToFilter?.addEventListener("change", () => {
    state.hourTo = els.hourToFilter.value;
    applyFiltersAndReload();
  });

  els.productFilter?.addEventListener("change", () => {
    state.product = els.productFilter.value;
    applyFiltersAndReload();
  });

  els.searchFilter?.addEventListener("input", () => {
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(() => {
      state.q = els.searchFilter.value.trim();
      applyFiltersAndReload();
    }, 250);
  });
}
