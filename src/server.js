import "dotenv/config";
import express from "express";
import http from "http";
import { Server as SocketIO } from "socket.io";
import {
  getHistory,
  getStats,
  getDbMeta,
  clearDb,
  getDailyReport,
  argentinaYmd,
} from "./db/memoryDb.js";
import {
  getActionHistory,
  getActionSummary,
  recordWhatsAppTest,
  onAction,
} from "./db/actionsDb.js";
import { platforms, createVisitBot } from "./platforms/index.js";
import {
  sendDailyActivityReport,
  isDailyReportEnabled,
  startDailyReportScheduler,
  getFailAlertMeta,
  dailyReportHour,
  isWhatsAppEnabled,
  isWhatsAppConfigured,
  isMailConfigured,
  isMailFailEnabled,
  sendFailAlertTest,
  sendWhatsAppText,
  formatTestMessage,
} from "./notifications/index.js";

const app = express();
const server = http.createServer(app);
const io = new SocketIO(server);

app.use(express.json({ limit: "32kb" }));

function maskEmail(email) {
  const s = String(email || "");
  const at = s.indexOf("@");
  if (at < 1) return s ? "***" : "";
  const user = s.slice(0, at);
  const domain = s.slice(at);
  return `${user.slice(0, 2)}${"*".repeat(Math.max(1, user.length - 2))}${domain}`;
}

function maskPhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length <= 4) return "****";
  return `${"*".repeat(digits.length - 4)}${digits.slice(-4)}`;
}

function notificationStatus() {
  const fail = getFailAlertMeta();
  const mailTo = process.env.MAIL_TO || process.env.MAIL_USER || "";
  const phone = String(process.env.WHATSAPP_PHONE || "").replace(/\D/g, "");
  return {
    email: {
      configured: isMailConfigured(),
      dailyEnabled: isDailyReportEnabled(),
      failEnabled: isMailFailEnabled(),
      to: mailTo,
      toMasked: maskEmail(mailTo),
      reportHour: dailyReportHour(),
    },
    whatsapp: {
      enabled: isWhatsAppEnabled(),
      configured: isWhatsAppConfigured(),
      phone,
      phoneMasked: maskPhone(phone),
      rateLimited: Boolean(fail.whatsappRateLimited),
      rateLimitedUntil: fail.whatsappRateLimitedUntil,
      cooldownMs: fail.whatsapp?.cooldownMs ?? null,
    },
    fail,
    policy: fail.policy,
  };
}

app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString(), db: getDbMeta() });
});

app.get("/api/history", (req, res) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 15;
  const status = req.query.status || "all";
  const product = req.query.product || "";
  const q = req.query.q || "";
  const range = req.query.range || "all";
  const date = req.query.date || "";
  const hourFrom = req.query.hourFrom ?? "";
  const hourTo = req.query.hourTo ?? "";
  const platform = req.query.platform || "all";
  const since = req.query.since || "";
  res.json(
    getHistory({
      page,
      limit,
      status,
      product,
      q,
      range,
      date,
      hourFrom,
      hourTo,
      platform,
      since,
    })
  );
});

app.get("/api/stats", (req, res) => {
  res.json(getStats({ since: req.query.since || "" }));
});

app.get("/api/db", (_req, res) => {
  res.json(getDbMeta());
});

app.get("/api/notifications", (_req, res) => {
  res.json({ ...notificationStatus(), log: getActionSummary() });
});

app.get("/api/actions", (req, res) => {
  res.json(
    getActionHistory({
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 15,
      channel: req.query.channel || "all",
      type: req.query.type || "all",
      status: req.query.status || "all",
      range: req.query.range || "all",
      date: req.query.date || "",
      q: req.query.q || "",
    })
  );
});

app.get("/api/actions/summary", (_req, res) => {
  res.json(getActionSummary());
});

app.post("/api/notifications/test/whatsapp", async (_req, res) => {
  try {
    if (!isWhatsAppConfigured()) {
      return res.status(400).json({
        ok: false,
        reason: "notConfigured",
        error: "Faltan WHATSAPP_PHONE / WHATSAPP_APIKEY",
      });
    }
    const text = formatTestMessage();
    const result = await sendWhatsAppText(text);
    recordWhatsAppTest(result, "ui");
    res.json({
      kind: "whatsapp-test",
      ...result,
    });
  } catch (err) {
    console.error("📱 /api/notifications/test/whatsapp:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/notifications/test/fail", async (req, res) => {
  try {
    const dryRun = String(req.query.preview || req.query.dryRun || "") === "1";
    const result = await sendFailAlertTest({
      force: true,
      dryRun,
      platform: req.query.platform || "facebook",
    });
    res.json({ kind: "fail-test", ...result });
  } catch (err) {
    console.error("📱 /api/notifications/test/fail:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/platforms", (_req, res) => {
  res.json(
    Object.values(platforms).map((p) => ({
      id: p.id,
      label: p.label,
      short: p.short,
      enabled: p.enabled,
      products: Object.keys(p.urls || {}).length,
    }))
  );
});

app.post("/api/db/clear", (_req, res) => {
  const meta = clearDb();
  io.emit("stats", getStats());
  io.emit("history", getHistory({ page: 1, limit: 15, status: "all" }));
  res.json({ cleared: true, meta });
});

/** Vista previa / envío de prueba del reporte diario (Gmail). */
app.post("/api/reports/daily", async (req, res) => {
  try {
    const send = String(req.query.send || "") === "1";
    const platform = req.query.platform || process.env.REPORT_PLATFORM || "facebook";
    const dateYmd =
      req.query.date ||
      argentinaYmd(new Date());

    if (!send) {
      const report = getDailyReport({ dateYmd, platform });
      return res.json({
        preview: true,
        mailEnabled: isDailyReportEnabled(),
        report,
      });
    }

    const channelsRaw = String(req.query.channels || "all").toLowerCase();
    const channels =
      channelsRaw === "email" || channelsRaw === "whatsapp"
        ? channelsRaw
        : "all";

    const result = await sendDailyActivityReport({
      dateYmd,
      platform,
      dryRun: false,
      force: true,
      channels,
    });
    res.json(result);
  } catch (err) {
    console.error("📧 /api/reports/daily:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.use(express.static("public"));

onAction((entry) => {
  io.emit("action", entry);
});

io.on("connection", (socket) => {
  console.log("🔌 Cliente conectado:", socket.id);
  socket.emit("stats", getStats());
  socket.emit("history", getHistory({ page: 1, limit: 15, status: "all" }));

  socket.on("disconnect", () => {
    console.log("🔌 Cliente desconectado:", socket.id);
  });
});

async function runBotWithRestart(bot) {
  const name = bot.platform.label;
  while (true) {
    try {
      console.log(`🚀 Iniciando bot ${name}...`);
      await bot.run(io);
      // run() solo retorna si no hay URLs
      await new Promise((r) => setTimeout(r, 10000));
    } catch (error) {
      console.error(`❌ Bot ${name} crash:`, error.message);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

const startServer = async () => {
  try {
    const PORT = process.env.PORT || 9008;
    server.listen(PORT, () => {
      console.log(`✅ Servidor web en puerto ${PORT}`);
      console.log(`🌐 URL: http://localhost:${PORT}/`);
      console.log(`🧠 DB: http://localhost:${PORT}/api/db`);
      startDailyReportScheduler();
      const failMeta = getFailAlertMeta();
      const waCooldownMs = failMeta.whatsapp?.cooldownMs || 0;
      console.log(
        `📧 Reporte diario Gmail · ${String(dailyReportHour()).padStart(2, "0")}:00 AR`
      );
      console.log(`🌐 Acciones: http://localhost:${PORT}/actions.html`);
      console.log(`🧠 Admin DB: http://localhost:${PORT}/admin.html`);
      if (failMeta.whatsapp?.enabled || isWhatsAppEnabled()) {
        console.log(
          `📱 WhatsApp ON · fallos + reporte · cooldown fallos ${Math.round(waCooldownMs / 60000)} min`
        );
      } else {
        console.log(
          "📱 WhatsApp OFF (WHATSAPP_ENABLED=false o faltan PHONE/APIKEY)"
        );
      }
    });

    setTimeout(async () => {
      const enabled = Object.values(platforms).filter((p) => p.enabled);
      const disabled = Object.values(platforms).filter((p) => !p.enabled);
      console.log(`🔄 Lanzando ${enabled.length} bots en paralelo...`);
      for (const p of disabled) {
        console.log(`⏸️ ${p.label} deshabilitado (próximamente / no se visitan URLs)`);
      }
      for (let i = 0; i < enabled.length; i++) {
        const platform = enabled[i];
        const bot = createVisitBot(platform);
        if (i > 0) {
          await new Promise((r) => setTimeout(r, 5000));
        }
        runBotWithRestart(bot);
      }
    }, 3000);
  } catch (error) {
    console.error("❌ Error al iniciar el servidor:", error);
  }
};

await startServer();
