import { userAgents } from "../const/userAgents.js";

function getRandomUserAgent() {
  return userAgents[Math.floor(Math.random() * userAgents.length)];
}

export { getRandomUserAgent };
