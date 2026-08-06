import express from "express";
import http from "http";
import { Server as SocketIO } from "socket.io";
import {
  getHistory,
  getStats,
  getDbMeta,
  clearDb,
} from "./db/memoryDb.js";

// Selección dinámica de la función según entorno
let incrementViewsML;
if (process.env.NODE_ENV === "production") {
  incrementViewsML = (await import("./functions/prod/incrementViewsML.js")).incrementViewsML;
  console.log("🔧 Usando función de PRODUCCIÓN");
} else {
  incrementViewsML = (await import("./functions/local/incrementViewsML.js")).incrementViewsML;
  console.log("🔧 Usando función LOCAL");
}

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
  res.json(getHistory({ page, limit, status, product, q, range, date, hourFrom, hourTo }));
});

app.get("/api/stats", (_req, res) => {
  res.json(getStats());
});

app.get("/api/db", (_req, res) => {
  res.json(getDbMeta());
});

app.post("/api/db/clear", (_req, res) => {
  const meta = clearDb();
  io.emit("stats", getStats());
  io.emit("history", getHistory({ page: 1, limit: 15, status: "all" }));
  res.json({ cleared: true, meta });
});

io.on("connection", (socket) => {
  console.log("🔌 Cliente conectado:", socket.id);
  socket.emit("stats", getStats());
  socket.emit("history", getHistory({ page: 1, limit: 15, status: "all" }));

  socket.on("disconnect", () => {
    console.log("🔌 Cliente desconectado:", socket.id);
  });
});

const runIncrementViewsML = async () => {
  try {
    console.log("🚀 Iniciando incrementViewsML...");
    await incrementViewsML(io);
  } catch (error) {
    console.error("❌ Error en incrementViewsML:", error.message);
    await new Promise((resolve) => setTimeout(resolve, 3000));
    runIncrementViewsML();
  }
};

const startServer = async () => {
  try {
    const PORT = process.env.PORT || 9008;
    server.listen(PORT, () => {
      console.log(`✅ Servidor web en puerto ${PORT}`);
      console.log(`🌐 URL: http://localhost:${PORT}/`);
      console.log(`🧠 DB: http://localhost:${PORT}/api/db`);
    });

    setTimeout(() => {
      console.log("🔄 Iniciando bot de visitas...");
      runIncrementViewsML();
    }, 3000);
  } catch (error) {
    console.error("❌ Error al iniciar el servidor:", error);
  }
};

await startServer();
