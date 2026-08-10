/**
 * Envía el reporte diario por mail (manual).
 *
 * Uso:
 *   npm run report:send
 *   npm run report:send -- --today
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
    today: false,
    date: null,
    platform: process.env.REPORT_PLATFORM || "facebook",
  };

  for (const arg of argv) {
    if (arg === "--preview" || arg === "-p") opts.preview = true;
    else if (arg === "--today") opts.today = true;
    else if (arg.startsWith("--date=")) opts.date = arg.slice("--date=".length);
    else if (arg.startsWith("--platform="))
      opts.platform = arg.slice("--platform=".length);
  }

  return opts;
}

const opts = parseArgs(process.argv.slice(2));

const dateYmd = opts.date
  ? opts.date
  : opts.today
    ? argentinaYmd(new Date())
    : addDaysToYmd(argentinaYmd(new Date()), -1);

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
    console.log("\n📋 Preview:");
    console.log(JSON.stringify(result.report, null, 2));
    if (!result.sent) {
      console.log(`\n(no enviado: ${result.reason || "dryRun"})`);
    }
  } else {
    console.log(`\n✅ Enviado · messageId=${result.messageId}`);
    console.log(
      `   ${result.report.total} visitas · ${result.report.ok} ok · ${result.report.fail} fail · ${result.report.successRate}%`
    );
  }
} catch (err) {
  console.error("❌ Error:", err.message);
  process.exit(1);
}
