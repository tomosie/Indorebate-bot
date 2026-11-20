// Dipanggil dari api/validasi.js: simpan request ke KV lalu kirim pesan Telegram dengan tombol hasil.
import { kv } from "@vercel/kv";
import { tg, esc } from "./telegram.js";
import { canonicalBroker } from "./templates.js";

export function newId() {
  const abc = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < 10; i++) s += abc[Math.floor(Math.random() * abc.length)];
  return s;
}

export function pendingText(r) {
  return `📝 <b>Request Validasi</b>
Broker: <b>${esc(r.broker)}</b>
Akun: <code>${esc(r.account)}</code>
Nama: ${esc(r.name)}
Email: ${esc(r.email)}
Bahasa email: ${r.lang === "en" ? "English" : "Indonesia"}
ID: <code>${esc(r.id)}</code>

Cek akun di portal broker, lalu tekan hasilnya.`;
}

export function startKeyboard(id) {
  return {
    inline_keyboard: [[
      { text: "✅ Sukses", callback_data: `v:${id}:s` },
      { text: "❌ Gagal", callback_data: `v:${id}:g` },
    ]],
  };
}

export async function queueValidasi({ name, account, broker, email, lang = "id", messageId }) {
  const canon = canonicalBroker(broker) || String(broker);
  const id = newId();
  const rec = {
    id,
    name: String(name || "").slice(0, 120),
    account: String(account || "").replace(/\D/g, ""),
    broker: canon,
    email: String(email || "").trim(),
    lang: lang === "en" ? "en" : "id",
    messageId: messageId || null,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  await kv.set(`vreq:${id}`, rec, { ex: 60 * 60 * 24 * 30 });
  await tg("sendMessage", {
    chat_id: process.env.VALIDASI_CHAT_ID,
    text: pendingText(rec),
    parse_mode: "HTML",
    reply_markup: startKeyboard(id),
  });
  return id;
}
