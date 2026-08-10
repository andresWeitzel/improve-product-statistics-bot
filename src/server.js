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
  addDaysToYmd,
} from "./db/memoryDb.js";
import { platforms } from "./const/platforms.js";
import { createVisitBot } from "./bots/visitRunner.js";
import {
  sendDailyActivityReport,
  isDailyReportEnabled,
  startDailyReportScheduler,
} from "./notifications/index.js";

const app = express();
const server = http.createServer(app);
const io = new SocketIO(server);

app.use(express.static("public"));

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
    })
  );
});

app.get("/api/stats", (_req, res) => {
  res.json(getStats());
});

app.get("/api/db", (_req, res) => {
  res.json(getDbMeta());
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
      addDaysToYmd(argentinaYmd(new Date()), -1);

    if (!send) {
      const report = getDailyReport({ dateYmd, platform });
      return res.json({
        preview: true,
        mailEnabled: isDailyReportEnabled(),
        report,
      });
    }

    const result = await sendDailyActivityReport({
      dateYmd,
      platform,
      dryRun: false,
      force: true,
    });
    res.json(result);
  } catch (err) {
    console.error("📧 /api/reports/daily:", err.message);
    res.status(500).json({ error: err.message });
  }
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
