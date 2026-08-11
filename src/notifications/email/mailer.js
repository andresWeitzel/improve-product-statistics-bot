import nodemailer from "nodemailer";

export function envFlag(name, fallback = false) {
  const v = String(process.env[name] ?? "").trim().toLowerCase();
  if (!v) return fallback;
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

export function isMailConfigured() {
  return Boolean(
    process.env.MAIL_USER &&
      process.env.MAIL_PASS &&
      (process.env.MAIL_TO || process.env.MAIL_USER)
  );
}

export function isDailyReportEnabled() {
  return envFlag("MAIL_ENABLED", false) && isMailConfigured();
}

export function createTransport() {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.MAIL_USER,
      pass: String(process.env.MAIL_PASS || "").replace(/\s+/g, ""),
    },
  });
}

export function mailFrom() {
  return (
    process.env.MAIL_FROM ||
    `Improve Product Stats <${process.env.MAIL_USER}>`
  );
}

export function mailTo() {
  return process.env.MAIL_TO || process.env.MAIL_USER;
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
