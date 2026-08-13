import { escapeHtml } from "./util.js";
import { els } from "./state.js";

export function setConnection(kind, text) {
  els.conn.className = `conn conn--${kind}`;
  els.conn.innerHTML = `<span class="conn__dot" aria-hidden="true"></span><span class="conn__text">${escapeHtml(text)}</span>`;
}
