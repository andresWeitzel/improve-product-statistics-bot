async function getNameFromUrlML(url) {
  const urlSplit = url.split("/").pop();

  // Elimina los primeros 15 caracteres
  let firstFormat = urlSplit.slice(15);

  // Elimina los últimos 4 caracteres y guiones
  let lastFormat = firstFormat.slice(0, -4).replace(/-/g, " ");

  // Limita la cantidad de caracteres a 40 y agrega "..." si es necesario
  let limitedFormat = lastFormat.slice(0, 40);
  if (lastFormat.length > 40) {
    limitedFormat += "...";
  }

  return limitedFormat;
}

module.exports = { getNameFromUrlML };
