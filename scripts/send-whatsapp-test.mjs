/**
 * Prueba SOLO conectividad CallMeBot.
 * No envía reporte diario ni alerta de fallo.
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

console.log("📱 whatsapp:test → SOLO mensaje de conectividad");
console.log("   (no manda fallo · no manda reporte diario)");
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
  if (/FALLO DE VISITA|REPORTE DIARIO/i.test(text)) {
    throw new Error("Bug: el test no debe formatear fallo ni reporte");
  }

  const result = await sendWhatsAppText(text);
  if (result.ok) {
    if (result.queued) {
      console.log(
        "⚠️ Test aceptado pero EN COLA CallMeBot (~16 msgs / 240 min). Esperá a que vacíe la cola."
      );
    } else {
      console.log("✅ Test enviado (1 mensaje). Revisá CallMeBot.");
    }
  } else {
    console.error("❌ No enviado:", result.reason || result.body || result.status);
    process.exit(1);
  }
} catch (err) {
  console.error("❌ Error:", err.message);
  process.exit(1);
}
