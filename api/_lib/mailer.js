import nodemailer from "nodemailer";

let transporter;
function getTransporter() {
  if (!transporter) {
    const user = process.env.GMAIL_USER;
    const pass = (process.env.GMAIL_APP_PASSWORD || "").replace(/\s/g, "");
    if (!user || !pass) throw new Error("GMAIL_USER / GMAIL_APP_PASSWORD belum diset");
    transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user, pass },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });
  }
  return transporter;
}

export async function sendReply({ to, subject, text, html, inReplyTo }) {
  const user = process.env.GMAIL_USER;
  const headers = inReplyTo ? { "In-Reply-To": inReplyTo, References: inReplyTo } : undefined;
  return getTransporter().sendMail({
    from: `Indorebate <${user}>`,
    replyTo: user,
    to,
    subject,
    text,
    html,
    headers,
  });
}
