import nodemailer from "nodemailer";

// Satu koneksi SMTP per akun Gmail.
const transporters = new Map();
function getTransporter(user, pass) {
  if (!transporters.has(user)) {
    transporters.set(user, nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user, pass },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    }));
  }
  return transporters.get(user);
}

// Akun utama: GMAIL_USER + GMAIL_APP_PASSWORD (balasan hasil dari tombol Telegram
// dan cadangan email konfirmasi ke user).
function defaultAccount() {
  const user = process.env.GMAIL_USER;
  const pass = (process.env.GMAIL_APP_PASSWORD || "").replace(/\s/g, "");
  if (!user || !pass) throw new Error("GMAIL_USER / GMAIL_APP_PASSWORD belum diset");
  return { user, pass };
}

// Akun pengirim notifikasi admin (OPSIONAL): ADMIN_SMTP_USER + ADMIN_SMTP_APP_PASSWORD.
// Kalau tidak diisi, notifikasi admin memakai akun utama di atas.
function adminAccount() {
  const user = process.env.ADMIN_SMTP_USER;
  const pass = (process.env.ADMIN_SMTP_APP_PASSWORD || "").replace(/\s/g, "");
  if (user && pass) return { user, pass };
  return defaultAccount();
}

async function send(account, { to, subject, text, html, inReplyTo, replyTo, fromName }) {
  const headers = inReplyTo ? { "In-Reply-To": inReplyTo, References: inReplyTo } : undefined;
  return getTransporter(account.user, account.pass).sendMail({
    from: `${fromName} <${account.user}>`,
    replyTo: replyTo || account.user,
    to,
    subject,
    text,
    html,
    headers,
  });
}

export async function sendReply({ to, subject, text, html, inReplyTo }) {
  return send(defaultAccount(), { to, subject, text, html, inReplyTo, fromName: "Indorebate" });
}

export async function sendAdminNotice({ to, subject, text, html, replyTo }) {
  return send(adminAccount(), { to, subject, text, html, replyTo, fromName: "Indorebate Validasi" });
}
