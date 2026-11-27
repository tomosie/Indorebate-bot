// Webhook bot CS Indorebate (bot Telegram terpisah, token CS_BOT_TOKEN).
// Alur: pesan pengguna -> model AI (basis pengetahuan) -> balasan.
// Jika model menulis <<ESKALASI|kategori|ringkasan>>, ringkasan dikirim ke admin.
import { kv } from "@vercel/kv";
import { esc } from "./_lib/telegram.js";
import { askModel } from "./_lib/cs-ai.js";
import { SYSTEM_PROMPT } from "./_lib/cs-prompt.js";
import { extractEscalation, detectImplicitEscalation, sanitizeUser, trimHistory } from "./_lib/cs-core.js";

export const config = { maxDuration: 30 };

const API = "https://api.telegram.org";
const HIST_TTL = 60 * 60 * 24; // riwayat chat hilang otomatis setelah 24 jam
const HOURLY_LIMIT = 20; // maksimal pesan per pengguna per jam

const GREETING =
  "Halo! Saya asisten CS Indorebate. Tanyakan seputar rebate, validasi akun, pindah mitra, atau tools gratis. " +
  "Hello! I'm Indorebate's support assistant, feel free to ask in English too.\n\n" +
  "Jangan pernah mengirim password trading atau kode OTP di chat ini.";
const GREETING_ID =
  "Halo! Saya asisten CS Indorebate. Tanyakan seputar rebate, validasi akun, pindah mitra, atau tools gratis.\n\n" +
  "Jangan pernah mengirim password trading atau kode OTP di chat ini.";
const GREETING_EN =
  "Hello! I'm Indorebate's support assistant. Ask me about rebates, account validation, switching partners, or the free tools.\n\n" +
  "Never send your trading password or OTP codes in this chat.";
const FALLBACK =
  "Mohon maaf, saya sedang mengalami gangguan. Pertanyaan Anda sudah saya teruskan ke admin dan akan dibalas secepatnya. " +
  "Anda juga bisa menulis ke support@indorebate.com.";
const LIMIT_MSG = "Anda sudah mengirim banyak pesan dalam satu jam terakhir. Silakan coba lagi nanti, atau tulis ke support@indorebate.com.";

async function tgCs(method, body) {
  const token = process.env.CS_BOT_TOKEN;
  if (!token) throw new Error("CS_BOT_TOKEN belum diset");
  const r = await fetch(`${API}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  const data = await r.json().catch(() => ({}));
  if (!data.ok) throw new Error(`Telegram ${method}: ${data.description || r.status}`);
  return data.result;
}

// Abaikan spasi dan tanda kutip yang tidak sengaja ikut terketik di Vercel.
const adminChatId = () => String(process.env.CS_ADMIN_CHAT_ID || "").trim().replace(/^["']+|["']+$/g, "").trim();

const clip = (s, n) => (String(s).length > n ? String(s).slice(0, n) + "…" : String(s));

async function notifyAdmin({ from, category, summary, history, replyTo }) {
  const chatId = adminChatId();
  if (!chatId) { console.error("CS_ADMIN_CHAT_ID belum diset, eskalasi tidak terkirim"); return { ok: false, error: "CS_ADMIN_CHAT_ID belum diset" }; }
  const who = [from.first_name, from.last_name].filter(Boolean).join(" ") || "Tanpa nama";
  const tail = history
    .slice(-4)
    .map((m) => `${m.role === "user" ? "👤" : "🤖"} ${esc(clip(m.content, 300))}`)
    .join("\n");
  const head = replyTo ? "📎 <b>CS update" : "🆘 <b>CS eskalasi";
  const text = clip(
    `${head}: ${esc(category)}</b>\nDari: ${esc(who)}${from.username ? " (@" + esc(from.username) + ")" : ""} <code>${from.id}</code>\n` +
      `Ringkasan: ${esc(summary || "-")}\n\n<b>Percakapan terakhir</b>\n${tail}`,
    3900
  );
  const body = { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true };
  if (replyTo) { body.reply_to_message_id = replyTo; body.allow_sending_without_reply = true; }
  if (from.username) body.reply_markup = { inline_keyboard: [[{ text: "Buka chat pengguna", url: `https://t.me/${from.username}` }]] };
  try {
    const sent = await tgCs("sendMessage", body);
    return { ok: true, mid: sent?.message_id };
  } catch (e) {
    console.error("Notif admin gagal:", e.message);
    return { ok: false, error: e.message };
  }
}

async function handleMessage(msg) {
  if (msg.chat?.type !== "private") return;
  const chatId = msg.chat.id;
  const uid = msg.from.id;
  const reply = (text) => tgCs("sendMessage", { chat_id: chatId, text: String(text).slice(0, 4000), disable_web_page_preview: true });

  if (typeof msg.text !== "string") {
    await reply("Maaf, saya hanya bisa membaca pesan teks. Sorry, I can only read text messages.");
    return;
  }
  const raw = msg.text.trim();
  const histKey = `cs:hist:${chatId}`;

  const start = raw.match(/^\/start(?:@\w+)?(?:\s+(\S+))?$/);
  if (start) {
    // Tombol Chat CS di situs memakai ?start=web_id atau ?start=web_en
    await reply(start[1] === "web_en" ? GREETING_EN : start[1] === "web_id" ? GREETING_ID : GREETING);
    return;
  }
  if (raw === "/id") { await reply(`ID chat ini: ${chatId}\nID pengguna: ${uid}`); return; }
  if (raw === "/tesadmin") {
    // Hanya admin: kirim notifikasi uji dan laporkan hasilnya.
    const adminId = adminChatId();
    if (!adminId) { await reply("CS_ADMIN_CHAT_ID belum diset di Vercel."); return; }
    if (adminId !== String(chatId) && adminId !== String(uid)) { await reply(`Perintah ini hanya untuk admin. ID chat Anda: ${chatId}, ID pengguna: ${uid}. Angka ini berbeda dengan CS_ADMIN_CHAT_ID di Vercel. Samakan, lalu Redeploy.`); return; }
    const r = await notifyAdmin({ from: msg.from, category: "lainnya", summary: "Tes notifikasi admin", history: [{ role: "user", content: "tes" }] });
    await reply(r.ok ? "Notifikasi uji terkirim ke chat admin." : `Gagal mengirim ke chat admin: ${r.error}`);
    return;
  }
  if (raw === "/reset") { await kv.del(histKey); await reply("Percakapan direset. Silakan mulai bertanya lagi."); return; }

  // Batas pesan per jam
  const rlKey = `cs:rl:${uid}:${Math.floor(Date.now() / 3600000)}`;
  const n = await kv.incr(rlKey);
  if (n === 1) await kv.expire(rlKey, 3700);
  if (n > HOURLY_LIMIT) { if (n === HOURLY_LIMIT + 1) await reply(LIMIT_MSG); return; }

  const text = sanitizeUser(raw);
  if (!text) return;

  const hist = trimHistory(await kv.get(histKey));
  const messages = [...hist, { role: "user", content: text }];
  tgCs("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => {});

  let out;
  try {
    out = extractEscalation(await askModel(SYSTEM_PROMPT, messages));
  } catch (e) {
    console.error("CS gagal menjawab:", e.message);
    await reply(FALLBACK);
    await notifyAdmin({ from: msg.from, category: "teknis", summary: "Semua model gagal menjawab. Pesan pengguna: " + clip(text, 200), history: messages });
    return;
  }

  if (!out.reply) out.reply = FALLBACK;
  if (!out.esc) out.esc = detectImplicitEscalation(out.reply, text);
  await reply(out.reply);
  const newHist = trimHistory([...messages, { role: "assistant", content: out.reply }]);
  await kv.set(histKey, newHist, { ex: HIST_TTL });
  if (out.esc) {
    // Satu tiket per percakapan: eskalasi berikutnya dalam 30 menit dikirim sebagai balasan ke tiket pertama.
    const escKey = `cs:esc:${chatId}`;
    const prev = await kv.get(escKey);
    const r = await notifyAdmin({ from: msg.from, category: out.esc.category, summary: out.esc.summary, history: newHist, replyTo: prev?.mid });
    if (r.ok) await kv.set(escKey, { mid: prev?.mid ?? r.mid }, { ex: 1800 });
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).send("ok");
  const secret = process.env.CS_WEBHOOK_SECRET;
  if (!secret || req.headers["x-telegram-bot-api-secret-token"] !== secret) {
    return res.status(401).json({ ok: false });
  }
  const msg = req.body?.message;
  if (msg?.from && !msg.from.is_bot) {
    try {
      await handleMessage(msg);
    } catch (e) {
      console.error("cs-bot error:", e);
    }
  }
  return res.status(200).json({ ok: true });
}
