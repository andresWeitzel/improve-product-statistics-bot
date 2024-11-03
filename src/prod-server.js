const express = require("express");
const http = require("http");
const socketIO = require("socket.io");
const { incrementViewsML } = require("./functions/prod/incrementViewsML");

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Servir archivos estáticos desde la carpeta "public"
app.use(express.static("public"));

// Iniciar la función de visitas y pasar el objeto io
incrementViewsML(io);

// Iniciar el servidor en el puerto especificado por Render
const PORT = process.env.PORT || 9008; // 9008 es el puerto local por defecto
server.listen(PORT, () => {
  console.log(`Servidor web en puerto ${PORT}`);
});


