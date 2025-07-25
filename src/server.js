import express from "express";
import http from "http";
import { Server as SocketIO } from "socket.io";

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

// Ruta de health check
app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// Debug de Socket.IO
io.on("connection", (socket) => {
  console.log("🔌 Cliente conectado:", socket.id);
  
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
      console.log(`🌐 URL: https://improve-product-statistics-bot.onrender.com/`);
    });
    
    // Iniciar el proceso de visitas después de un delay
    setTimeout(() => {
      console.log("🔄 Iniciando bot de visitas...");
      runIncrementViewsML();
    }, 3000);
    
  } catch (error) {
    console.error("❌ Error al iniciar el servidor:", error);
  }
};

await startServer(); 