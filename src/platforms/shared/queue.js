function resolveUrlEntry(entry) {
  if (typeof entry === "string") {
    return { url: entry, weight: 1 };
  }
  return {
    url: entry.url,
    weight: Math.max(1, Number(entry.weight) || 1),
  };
}

/** Cola 1:1 por producto (weight opcional). */
export function buildVisitQueue(urlsMap) {
  const queue = [];
  for (const [productName, entry] of Object.entries(urlsMap || {})) {
    const { url, weight } = resolveUrlEntry(entry);
    for (let i = 0; i < weight; i++) {
      queue.push({ productName, url });
    }
  }
  return queue;
}
