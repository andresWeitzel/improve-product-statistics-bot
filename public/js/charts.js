import { els } from "./state.js";

function sizeCanvas(canvas) {
  const parent = canvas.parentElement;
  const cssW = Math.max(1, parent.clientWidth || 300);
  const cssH = Math.max(1, parent.clientHeight || 220);
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, width: cssW, height: cssH };
}

export function buildTimelineFromVisits(visits, minutes = 30) {
  const now = Date.now();
  const stamped = (visits || [])
    .map((v) => ({ ...v, ts: v.iso ? Date.parse(v.iso) : NaN }))
    .filter((v) => !Number.isNaN(v.ts));

  let windowMs = minutes * 60 * 1000;
  let start = now - windowMs;
  const inWindow = stamped.filter((v) => v.ts >= start);

  if (inWindow.length === 0 && stamped.length > 0) {
    const oldest = Math.min(...stamped.map((v) => v.ts));
    windowMs = Math.min(Math.max(now - oldest, 5 * 60 * 1000), 24 * 60 * 60 * 1000);
    start = now - windowMs;
  }

  let bucketMs = 60 * 1000;
  if (windowMs > 2 * 60 * 60 * 1000) bucketMs = 5 * 60 * 1000;
  if (windowMs > 8 * 60 * 60 * 1000) bucketMs = 15 * 60 * 1000;

  const bucketCount = Math.max(8, Math.ceil(windowMs / bucketMs));
  start = now - bucketCount * bucketMs;

  const labels = [];
  const ok = Array(bucketCount).fill(0);
  const fail = Array(bucketCount).fill(0);

  for (let i = 0; i < bucketCount; i++) {
    const t = new Date(start + i * bucketMs);
    labels.push(
      t.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })
    );
  }

  for (const v of stamped) {
    if (v.ts < start) continue;
    const idx = Math.min(
      bucketCount - 1,
      Math.max(0, Math.floor((v.ts - start) / bucketMs))
    );
    if (v.status === "ok") ok[idx] += 1;
    else fail[idx] += 1;
  }

  return {
    labels,
    ok,
    fail,
    minutes: Math.round(windowMs / 60000),
    totalInWindow: ok.reduce((a, b) => a + b, 0) + fail.reduce((a, b) => a + b, 0),
  };
}

export function drawTimeline(timeline) {
  if (!els.timelineChart) return;
  const { ctx, width, height } = sizeCanvas(els.timelineChart);
  ctx.clearRect(0, 0, width, height);

  const labels = timeline?.labels || [];
  const ok = timeline?.ok || [];
  const fail = timeline?.fail || [];
  const total =
    (timeline?.totalInWindow ?? 0) ||
    ok.reduce((a, b) => a + b, 0) + fail.reduce((a, b) => a + b, 0);

  if (els.timelineTitle) {
    const mins = timeline?.minutes || 30;
    els.timelineTitle.textContent = `Actividad (últimos ${mins} min · ${total} visitas)`;
  }

  if (!labels.length || total === 0) {
    els.timelineEmpty?.classList.remove("hidden");
    return;
  }
  els.timelineEmpty?.classList.add("hidden");

  const pad = { top: 16, right: 12, bottom: 36, left: 36 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const maxVal = Math.max(1, ...ok.map((v, i) => v + fail[i]));
  const gap = 2;
  const barW = Math.max(2, plotW / labels.length - gap);

  ctx.strokeStyle = "rgba(232,238,245,0.08)";
  ctx.fillStyle = "#8b9aab";
  ctx.font = "10px IBM Plex Mono, monospace";
  ctx.textAlign = "right";
  for (let i = 0; i <= 3; i++) {
    const y = pad.top + (plotH * i) / 3;
    const val = Math.round(maxVal * (1 - i / 3));
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(width - pad.right, y);
    ctx.stroke();
    ctx.fillText(String(val), pad.left - 6, y + 3);
  }

  for (let i = 0; i < labels.length; i++) {
    const x = pad.left + i * (barW + gap);
    const okH = (ok[i] / maxVal) * plotH;
    const failH = (fail[i] / maxVal) * plotH;
    const base = pad.top + plotH;

    if (okH > 0) {
      ctx.fillStyle = "#3dba7c";
      ctx.fillRect(x, base - okH, barW, okH);
    }
    if (failH > 0) {
      ctx.fillStyle = "#e86a5c";
      ctx.fillRect(x, base - okH - failH, barW, failH);
    }
  }

  ctx.fillStyle = "#8b9aab";
  ctx.textAlign = "center";
  const step = Math.max(1, Math.ceil(labels.length / 8));
  for (let i = 0; i < labels.length; i += step) {
    const x = pad.left + i * (barW + gap) + barW / 2;
    ctx.fillText(labels[i], x, height - 12);
  }

  ctx.textAlign = "left";
  ctx.fillStyle = "#3dba7c";
  ctx.fillRect(pad.left, 4, 8, 8);
  ctx.fillStyle = "#8b9aab";
  ctx.fillText("OK", pad.left + 12, 11);
  ctx.fillStyle = "#e86a5c";
  ctx.fillRect(pad.left + 48, 4, 8, 8);
  ctx.fillStyle = "#8b9aab";
  ctx.fillText("Fallos", pad.left + 60, 11);
}

export function drawRatio(ok, fail) {
  if (!els.ratioChart) return;
  const { ctx, width, height } = sizeCanvas(els.ratioChart);
  ctx.clearRect(0, 0, width, height);

  const total = (ok || 0) + (fail || 0);
  const cx = width / 2;
  const cy = height / 2 - 8;
  const r = Math.min(width, height) * 0.32;
  const thickness = r * 0.42;

  if (total === 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(232,238,245,0.15)";
    ctx.lineWidth = thickness;
    ctx.stroke();
  } else {
    const okAngle = (ok / total) * Math.PI * 2;
    let start = -Math.PI / 2;
    ctx.lineWidth = thickness;
    ctx.lineCap = "butt";

    ctx.beginPath();
    ctx.arc(cx, cy, r, start, start + okAngle);
    ctx.strokeStyle = "#3dba7c";
    ctx.stroke();

    start += okAngle;
    ctx.beginPath();
    ctx.arc(cx, cy, r, start, start + Math.PI * 2 - okAngle);
    ctx.strokeStyle = "#e86a5c";
    ctx.stroke();
  }

  ctx.fillStyle = "#e8eef5";
  ctx.font = "600 18px Outfit, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(total), cx, cy - 2);
  ctx.fillStyle = "#8b9aab";
  ctx.font = "10px IBM Plex Mono, monospace";
  ctx.fillText("total", cx, cy + 16);

  ctx.font = "11px Outfit, sans-serif";
  ctx.fillStyle = "#3dba7c";
  ctx.fillText(`OK ${ok || 0}`, cx - 40, height - 14);
  ctx.fillStyle = "#e86a5c";
  ctx.fillText(`Fail ${fail || 0}`, cx + 40, height - 14);
}
