/**
 * Envía el reporte diario (manual / test).
 *
 * Uso:
 *   npm run report:send                 → Gmail + WhatsApp
 *   npm run report:send:gmail           → solo Gmail
 *   npm run report:send:whatsapp        → solo WhatsApp
 *   npm run report:send -- --yesterday
 *   npm run report:send -- --date=2026-08-10
 *   npm run report:send -- --preview
 */
import "dotenv/config";
import {
  argentinaYmd,
  addDaysToYmd,
} from "../src/db/memoryDb.js";
import {
  sendDailyActivityReport,
  isMailConfigured,
  isWhatsAppConfigured,
} from "../src/notifications/index.js";

function parseArgs(argv) {
  const opts = {
    preview: false,
    yesterday: false,
    date: null,
    platform: process.env.REPORT_PLATFORM || "facebook",
    channels: "all",
  };

  for (const arg of argv) {
    if (arg === "--preview" || arg === "-p") opts.preview = true;
    else if (arg === "--yesterday") opts.yesterday = true;
    else if (arg === "--today") opts.yesterday = false;
    else if (arg === "--email-only" || arg === "--gmail-only")
      opts.channels = "email";
    else if (arg === "--whatsapp-only" || arg === "--wa-only")
      opts.channels = "whatsapp";
    else if (arg.startsWith("--date=")) opts.date = arg.slice("--date=".length);
    else if (arg.startsWith("--platform="))
      opts.platform = arg.slice("--platform=".length);
    else if (arg.startsWith("--channels=")) {
      const c = arg.slice("--channels=".length).toLowerCase();
      if (c === "email" || c === "gmail") opts.channels = "email";
      else if (c === "whatsapp" || c === "wa") opts.channels = "whatsapp";
      else opts.channels = "all";
    }
  }

  return opts;
}

const opts = parseArgs(process.argv.slice(2));

const dateYmd = opts.date
  ? opts.date
  : opts.yesterday
    ? addDaysToYmd(argentinaYmd(new Date()), -1)
    : argentinaYmd(new Date());

const channelLabel =
  opts.channels === "email"
    ? "SOLO Gmail"
    : opts.channels === "whatsapp"
      ? "SOLO WhatsApp"
      : "Gmail + WhatsApp";

console.log(`📊 report:send → ${channelLabel}`);
console.log("   (no manda alerta de fallo de visita)");
console.log(`   date=${dateYmd}`);
console.log(`   platform=${opts.platform}`);
console.log(`   channels=${opts.channels}`);
console.log(`   mode=${opts.preview ? "preview" : "send"}`);

if (!opts.preview) {
  if (
    (opts.channels === "all" || opts.channels === "email") &&
    !isMailConfigured()
  ) {
    console.error("❌ Faltan MAIL_USER / MAIL_PASS en .env");
    process.exit(1);
  }
  if (
    (opts.channels === "all" || opts.channels === "whatsapp") &&
    opts.channels === "whatsapp" &&
    !isWhatsAppConfigured()
  ) {
    console.error("❌ Faltan WHATSAPP_PHONE / WHATSAPP_APIKEY en .env");
    process.exit(1);
  }
  if (opts.channels === "all" && !isWhatsAppConfigured()) {
    console.log("⚠️ WhatsApp no configurado — se enviará solo Gmail si aplica");
  }
}

try {
  const result = await sendDailyActivityReport({
    dateYmd,
    platform: opts.platform,
    dryRun: opts.preview,
    force: true,
    channels: opts.channels,
  });

  if (opts.preview || !result.sent) {
    console.log("\n📋 Preview datos:");
    console.log(JSON.stringify(result.report, null, 2));
    if (result.whatsappPreview) {
      console.log("\n📋 Preview WhatsApp:");
      console.log(result.whatsappPreview);
    }
    if (!result.sent) {
      console.log(`\n(no enviado: ${result.reason || "dryRun"})`);
    }
  } else {
    if (result.email?.sent) {
      console.log(`\n✅ Gmail enviado · messageId=${result.email.messageId}`);
    } else if (opts.channels !== "whatsapp") {
      console.log(`\n📧 Gmail: ${result.email?.reason || "no enviado"}`);
    }

    console.log(
      `   ${result.report.total} visitas · ${result.report.ok} ok · ${result.report.fail} fail · ${result.report.successRate}%`
    );

    if (result.whatsapp?.sent) {
      if (result.whatsapp.queued) {
        console.log(
          "⚠️ WhatsApp reporte EN COLA CallMeBot (~16 msgs / 240 min)"
        );
      } else {
        console.log("✅ WhatsApp reporte enviado");
      }
    } else if (opts.channels !== "email") {
      console.log(
        `📱 WhatsApp reporte: ${result.whatsapp?.reason || "no enviado"}`
      );
    }
  }
} catch (err) {
  console.error("❌ Error:", err.message);
  process.exit(1);
}
