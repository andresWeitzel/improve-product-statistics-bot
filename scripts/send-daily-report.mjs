/**
 * Envía el reporte diario por mail (manual).
 *
 * Uso:
 *   npm run report:send
 *   npm run report:send -- --yesterday
 *   npm run report:send -- --date=2026-08-10
 *   npm run report:send -- --platform=facebook
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
} from "../src/notifications/index.js";

function parseArgs(argv) {
  const opts = {
    preview: false,
    yesterday: false,
    date: null,
    platform: process.env.REPORT_PLATFORM || "facebook",
  };

  for (const arg of argv) {
    if (arg === "--preview" || arg === "-p") opts.preview = true;
    else if (arg === "--yesterday") opts.yesterday = true;
    else if (arg === "--today") opts.yesterday = false; // default ya es hoy
    else if (arg.startsWith("--date=")) opts.date = arg.slice("--date=".length);
    else if (arg.startsWith("--platform="))
      opts.platform = arg.slice("--platform=".length);
  }

  return opts;
}

const opts = parseArgs(process.argv.slice(2));

const dateYmd = opts.date
  ? opts.date
  : opts.yesterday
    ? addDaysToYmd(argentinaYmd(new Date()), -1)
    : argentinaYmd(new Date());

console.log("📧 Reporte manual");
console.log(`   date=${dateYmd}`);
console.log(`   platform=${opts.platform}`);
console.log(`   mode=${opts.preview ? "preview" : "send"}`);

  if (!opts.preview) {
  if (!isMailConfigured()) {
    console.error("❌ Faltan MAIL_USER / MAIL_PASS en .env");
    process.exit(1);
  }
}

try {
  const result = await sendDailyActivityReport({
    dateYmd,
    platform: opts.platform,
    dryRun: opts.preview,
    force: true,
  });

  if (opts.preview || !result.sent) {
    console.log("\n📋 Preview Gmail (resumen):");
    console.log(JSON.stringify(result.report, null, 2));
    if (result.whatsappPreview) {
      console.log("\n📋 Preview WhatsApp:");
      console.log(result.whatsappPreview);
    }
    if (!result.sent) {
      console.log(`\n(no enviado: ${result.reason || "dryRun"})`);
    }
  } else {
    console.log(`\n✅ Gmail enviado · messageId=${result.messageId}`);
    console.log(
      `   ${result.report.total} visitas · ${result.report.ok} ok · ${result.report.fail} fail · ${result.report.successRate}%`
    );
    if (result.whatsapp?.sent) {
      console.log("✅ WhatsApp reporte enviado");
    } else {
      console.log(
        `📱 WhatsApp reporte: ${result.whatsapp?.reason || "no enviado"}`
      );
    }
  }
} catch (err) {
  console.error("❌ Error:", err.message);
  process.exit(1);
}
