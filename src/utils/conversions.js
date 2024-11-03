// Importing userAgents using an ES module import
import { userAgents } from "../const/web.js";

function getNameFromUrlML(url) {
  const urlSplit = url.split("/").pop();

  // Remove the first 15 characters
  let firstFormat = urlSplit.slice(15);

  // Remove the last 4 characters and replace dashes with spaces
  let lastFormat = firstFormat.slice(0, -4).replace(/-/g, " ");

  // Limit the number of characters and add "..." if needed
  let limitedFormat = lastFormat.slice(0, 50);
  if (lastFormat.length > 50) {
    limitedFormat += "...";
  }

  return limitedFormat;
}

function getRandomUserAgent() {
  return userAgents[Math.floor(Math.random() * userAgents.length)];
}

// Exporting functions in ES module syntax
export { getNameFromUrlML, getRandomUserAgent };
