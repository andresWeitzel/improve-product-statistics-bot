import { escapeHtml } from "./util.js";

let root = null;
let active = null;

function ensureRoot() {
  if (root) return root;
  root = document.createElement("div");
  root.id = "appDialogRoot";
  root.className = "dialog-root";
  root.hidden = true;
  root.innerHTML = `
    <div class="dialog-backdrop" data-dialog-dismiss></div>
    <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialogTitle" aria-describedby="dialogBody">
      <div class="dialog__accent" aria-hidden="true"></div>
      <h3 id="dialogTitle" class="dialog__title"></h3>
      <p id="dialogBody" class="dialog__body"></p>
      <div class="dialog__actions">
        <button type="button" class="ghost-btn" data-dialog-cancel>Cancelar</button>
        <button type="button" class="primary-btn" data-dialog-confirm>Confirmar</button>
      </div>
    </div>
  `;
  document.body.appendChild(root);
  return root;
}

function closeDialog(result) {
  if (!active) return;
  const { resolve, onKey } = active;
  document.removeEventListener("keydown", onKey);
  root.hidden = true;
  root.classList.remove("is-open");
  document.body.classList.remove("dialog-open");
  active = null;
  resolve(result);
}

/**
 * @param {{
 *   title?: string,
 *   message: string,
 *   confirmLabel?: string,
 *   cancelLabel?: string,
 *   tone?: "default"|"danger"|"accent",
 *   showCancel?: boolean,
 * }} opts
 * @returns {Promise<boolean>}
 */
export function confirmDialog(opts = {}) {
  const {
    title = "Confirmar",
    message,
    confirmLabel = "Confirmar",
    cancelLabel = "Cancelar",
    tone = "default",
    showCancel = true,
  } = opts;

  ensureRoot();
  if (active) closeDialog(false);

  return new Promise((resolve) => {
    const dialog = root.querySelector(".dialog");
    const titleEl = root.querySelector("#dialogTitle");
    const bodyEl = root.querySelector("#dialogBody");
    const confirmBtn = root.querySelector("[data-dialog-confirm]");
    const cancelBtn = root.querySelector("[data-dialog-cancel]");
    const backdrop = root.querySelector("[data-dialog-dismiss]");

    titleEl.textContent = title;
    bodyEl.innerHTML = escapeHtml(message).replace(/\n/g, "<br>");
    confirmBtn.textContent = confirmLabel;
    cancelBtn.textContent = cancelLabel;
    cancelBtn.hidden = !showCancel;

    dialog.dataset.tone = tone;
    confirmBtn.className =
      tone === "danger" ? "danger-btn" : tone === "accent" ? "primary-btn" : "primary-btn";

    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeDialog(false);
      } else if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        closeDialog(true);
      }
    };

    active = { resolve, onKey };

    const onConfirm = () => closeDialog(true);
    const onCancel = () => closeDialog(false);

    confirmBtn.onclick = onConfirm;
    cancelBtn.onclick = onCancel;
    backdrop.onclick = onCancel;

    root.hidden = false;
    requestAnimationFrame(() => {
      root.classList.add("is-open");
      document.body.classList.add("dialog-open");
      (showCancel ? cancelBtn : confirmBtn).focus();
    });

    document.addEventListener("keydown", onKey);
  });
}

/** Aviso simple (un solo botón). */
export function alertDialog(opts = {}) {
  return confirmDialog({
    title: opts.title || "Aviso",
    message: opts.message || "",
    confirmLabel: opts.confirmLabel || "Entendido",
    tone: opts.tone || "default",
    showCancel: false,
  });
}
