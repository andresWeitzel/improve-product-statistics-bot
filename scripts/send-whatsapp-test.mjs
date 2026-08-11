/**
 * Prueba CallMeBot (mensaje corto).
 *
 *   npm run whatsapp:test
 */
import "dotenv/config";
import {
  isWhatsAppConfigured,
  isWhatsAppEnabled,
  sendWhatsAppText,
  getFailAlertMeta,
  formatTestMessage,
} from "../src/notifications/index.js";

console.log("📱 WhatsApp test (CallMeBot)");
console.log(JSON.stringify(getFailAlertMeta(), null, 2));

if (!isWhatsAppConfigured()) {
  console.error("❌ Faltan WHATSAPP_PHONE / WHATSAPP_APIKEY en .env");
  process.exit(1);
}

if (!isWhatsAppEnabled()) {
  console.log("⚠️ WHATSAPP_ENABLED=false — igual pruebo el envío...");
}

try {
  const text = formatTestMessage();
  const result = await sendWhatsAppText(text);
  if (result.ok) {
    console.log("✅ Mensaje de prueba enviado — mirá WhatsApp (chat CallMeBot).");
  } else {
    console.error("❌ No enviado:", result.reason || result.body || result.status);
    process.exit(1);
  }
} catch (err) {
  console.error("❌ Error:", err.message);
  process.exit(1);
}
