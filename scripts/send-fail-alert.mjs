/**
 * Prueba alerta de fallo por WhatsApp (CallMeBot).
 *
 * Uso:
 *   npm run report:fail:preview
 *   npm run report:fail
 *   npm run report:fail -- --product="Multigym Everlast"
 *   npm run report:fail -- --error="HTTP 403 al cargar"
 */
import "dotenv/config";
import {
  isWhatsAppConfigured,
  sendFailAlertTest,
  getFailAlertMeta,
} from "../src/notifications/index.js";

function parseArgs(argv) {
  const opts = {
    preview: false,
    platform: "facebook",
    product: null,
    error: null,
    url: null,
  };

  for (const arg of argv) {
    if (arg === "--preview" || arg === "-p") opts.preview = true;
    else if (arg.startsWith("--platform="))
      opts.platform = arg.slice("--platform=".length);
    else if (arg.startsWith("--product="))
      opts.product = arg.slice("--product=".length);
    else if (arg.startsWith("--error="))
      opts.error = arg.slice("--error=".length);
    else if (arg.startsWith("--url=")) opts.url = arg.slice("--url=".length);
  }

  return opts;
}

const opts = parseArgs(process.argv.slice(2));

console.log("📱 Alerta de fallo WhatsApp (prueba)");
console.log(JSON.stringify(getFailAlertMeta(), null, 2));
console.log(`   mode=${opts.preview ? "preview" : "send"}`);

if (!opts.preview && !isWhatsAppConfigured()) {
  console.error("❌ Faltan WHATSAPP_PHONE / WHATSAPP_APIKEY en .env");
  console.error(
    "   Setup: https://www.callmebot.com/blog/free-api-whatsapp-messages/"
  );
  process.exit(1);
}

try {
  const result = await sendFailAlertTest({
    dryRun: opts.preview,
    force: true,
    platform: opts.platform,
    product: opts.product || undefined,
    error: opts.error || undefined,
    url: opts.url || undefined,
  });

  if (opts.preview || !result.sent) {
    console.log("\n📋 Preview:");
    console.log(JSON.stringify(result.preview || result, null, 2));
    if (!result.sent) {
      console.log(`\n(no enviado: ${result.reason || "dryRun"})`);
    }
  } else {
    console.log("\n✅ WhatsApp enviado — revisá el chat de CallMeBot.");
  }
} catch (err) {
  console.error("❌ Error:", err.message);
  process.exit(1);
}
