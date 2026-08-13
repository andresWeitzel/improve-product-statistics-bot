import { fetchHistory } from "./api.js";
import {
  platformClass,
  platformLabel,
  resolvePlatformClient,
} from "./platforms.js";
import { els, PAGE_SIZE, state } from "./state.js";
import { escapeHtml } from "./util.js";

export function setTableLoading(isLoading) {
  if (!els.tbody) return;
  els.tbody.style.opacity = isLoading ? "0.45" : "1";
}

export function applyFiltersAndReload() {
  clearTimeout(state.refreshTimer);
  state.page = 1;
  loadHistory(true);
}

export function renderHistory(payload) {
  const items = payload.items || [];
  state.page = payload.page || 1;
  state.totalPages = payload.totalPages || 1;

  els.tbody.innerHTML = items
    .map((row) => {
      const plat = resolvePlatformClient(row.platform, row.url);
      return `
      <tr>
        <td>${escapeHtml(row.id)}</td>
        <td><span class="platform-pill ${platformClass(plat)}">${platformLabel(plat)}</span></td>
        <td>
          <span class="status-cell">
            <span class="lamp ${row.status === "ok" ? "ok" : "fail"}"></span>
            <span class="status-text">${row.status === "ok" ? "ok" : "fail"}</span>
          </span>
        </td>
        <td><a href="${escapeHtml(row.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(row.product)}</a></td>
        <td>${escapeHtml(row.datetime)}</td>
      </tr>`;
    })
    .join("");

  els.empty.classList.toggle("hidden", items.length > 0);
  els.pageInfo.textContent = `Página ${state.page} / ${state.totalPages} · ${payload.total || 0} registros`;
  els.prev.disabled = state.page <= 1;
  els.next.disabled = state.page >= state.totalPages;
  setTableLoading(false);
}

export async function loadHistory(showLoading = false) {
  const reqId = ++state.historyReq;
  if (showLoading) setTableLoading(true);
  try {
    const data = await fetchHistory({
      page: String(state.page),
      limit: String(PAGE_SIZE),
      status: state.status,
      platform: state.platform,
      range: state.date ? "all" : state.range,
      product: state.product,
      q: state.q,
      date: state.date,
      hourFrom: state.hourFrom,
      hourTo: state.hourTo,
    });
    if (reqId !== state.historyReq) return;
    renderHistory(data);
  } catch (err) {
    console.error("Error cargando historial:", err);
    if (reqId === state.historyReq) setTableLoading(false);
  }
}

export function bindPager() {
  els.prev.addEventListener("click", () => {
    if (state.page <= 1) return;
    state.page -= 1;
    loadHistory();
  });

  els.next.addEventListener("click", () => {
    if (state.page >= state.totalPages) return;
    state.page += 1;
    loadHistory();
  });
}
