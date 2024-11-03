import express from "express";
import http from "http";
import { Server as SocketIO } from "socket.io"; // Importa como Server para evitar conflictos
import { incrementViewsML } from "./functions/local/incrementViewsML.js";

const app = express();
const server = http.createServer(app);
const io = new SocketIO(server);

app.use(express.static("public"));

// Iniciar la función de visitas y pasar el objeto io
incrementViewsML(io);

// Iniciar el servidor
const PORT = 9008;
server.listen(PORT, () => {
  console.log("Servidor web en http://localhost:9008");
});
