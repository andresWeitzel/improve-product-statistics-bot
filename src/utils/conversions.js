async function getNameFromUrlML(url) {
  const urlSplit = url.split("/").pop();

  // Elimina los primeros 15 caracteres
  let firstFormat = urlSplit.slice(15);

  // Elimina los últimos 4 caracteres y guiones
  let lastFormat = firstFormat.slice(0, -4).replace(/-/g, " ");

  // Limita la cantidad de caracteres y agrega "..." si es necesario
  let limitedFormat = lastFormat.slice(0, 50);
  if (lastFormat.length > 50) {
    limitedFormat += "...";
  }

  return limitedFormat;
}

module.exports = { getNameFromUrlML };
