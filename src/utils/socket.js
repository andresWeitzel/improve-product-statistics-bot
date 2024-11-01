const { updateDateTime } = require("./dateTime");

async function emitStatus(io, id, status, product, url) {
  io.emit("update", {
    id,
    status,
    product,
    url,
    datetime: updateDateTime(),
  });
}

module.exports = { emitStatus };
