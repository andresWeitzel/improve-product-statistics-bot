/**
 * Prueba alerta de fallo (WhatsApp inmediato o fallback Gmail).
 *
 * Uso:
 *   npm run whatsapp:fail:preview
 *   npm run whatsapp:fail
 */
import "dotenv/config";
import {
  sendFailAlertTest,
  getFailAlertMeta,
  isMailConfigured,
  isWhatsAppConfigured,
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

console.log("🚨 Alerta de fallo (WhatsApp si inmediato · si no → Gmail)");
console.log(JSON.stringify(getFailAlertMeta(), null, 2));
console.log(`   mode=${opts.preview ? "preview" : "send"}`);

if (!opts.preview && !isWhatsAppConfigured() && !isMailConfigured()) {
  console.error("❌ Configurá WhatsApp y/o Gmail en .env");
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
    console.log(`\n✅ Alerta enviada · canal=${result.channel}`);
    if (result.whatsapp?.queued) {
      console.log(
        "   WhatsApp quedó en cola CallMeBot → el aviso útil fue por Gmail."
      );
    }
    if (result.email?.sent) {
      console.log("   Revisá Gmail (aviso inmediato).");
    }
    if (result.whatsapp?.sent && !result.whatsapp?.queued) {
      console.log("   Revisá WhatsApp (llegó al instante).");
    }
  }
} catch (err) {
  console.error("❌ Error:", err.message);
  process.exit(1);
}
