const express = require("express");
const http = require("http");
const socketIO = require("socket.io");
const { incrementViewsML } = require("./src/functions/incrementViewsML");

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

app.use(express.static("public"));

// Iniciar la función de visitas y pasar el objeto io
incrementViewsML(io);

// Iniciar el servidor
const PORT=9008
server.listen(PORT, () => {
  console.log("Servidor web en http://localhost:9008");
});
