function updateDateTime() {
  const now = new Date();
  const day = now.toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const time = now.toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return `${day}, ${time}`;
}

module.exports = { updateDateTime };
