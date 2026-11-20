// Webhook bot validasi (bot BARU, token VALIDASI_BOT_TOKEN).
// Alur tombol: Sukses -> konfirmasi -> kirim | Gagal -> alasan -> konfirmasi -> kirim.
import { kv } from "@vercel/kv";
import { tg, esc } from "./_lib/telegram.js";
import { buildEmail, FAIL_REASONS } from "./_lib/templates.js";
import { sendReply } from "./_lib/mailer.js";
import { pendingText, startKeyboard } from "./_lib/validasi-queue.js";

export const config = { maxDuration: 30 };

const answer = (id, text, alert = false) =>
  tg("answerCallbackQuery", { callback_query_id: id, text: text || "", show_alert: alert }).catch(() => {});

function wibTime(d = new Date()) {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(d) + " WIB";
}

function edit(cq, text, keyboard) {
  return tg("editMessageText", {
    chat_id: cq.message.chat.id,
    message_id: cq.message.message_id,
    text,
    parse_mode: "HTML",
    reply_markup: keyboard || { inline_keyboard: [] },
  });
}

function confirmSuccess(r) {
  return `⚠️ <b>Konfirmasi SUKSES</b>

Akun <code>${esc(r.account)}</code> (<b>${esc(r.broker)}</b>) <b>ADA di bawah IB saya</b>.
Kirim email <b>SUKSES</b> ke ${esc(r.email)}?`;
}

function confirmFail(r, code) {
  const reason = FAIL_REASONS[code];
  return `⚠️ <b>Konfirmasi GAGAL</b>

Akun <code>${esc(r.account)}</code> (<b>${esc(r.broker)}</b>) <b>${esc(reason.confirm)}</b>.
Kirim email <b>GAGAL</b> ke ${esc(r.email)}?`;
}

async function logSheet(payload) {
  const url = process.env.GOOGLE_SHEET_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "hasil", ...payload }),
      signal: AbortSignal.timeout(8000),
    });
  } catch (e) {
    console.error("Sheet log gagal:", e.message);
  }
}

async function handleCallback(cq) {
  const parts = String(cq.data || "").split(":");
  if (parts[0] !== "v") return answer(cq.id);
  const [, id, act, a1, a2] = parts;

  // Otorisasi: hanya chat validasi dan hanya user admin yang terdaftar
  if (String(cq.message?.chat?.id) !== String(process.env.VALIDASI_CHAT_ID)) {
    return answer(cq.id, "Chat tidak diizinkan", true);
  }
  const allowed = (process.env.ADMIN_USER_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!allowed.includes(String(cq.from?.id))) {
    return answer(cq.id, "Kamu tidak punya izin", true);
  }

  const r = await kv.get(`vreq:${id}`);
  if (!r) return answer(cq.id, "Request tidak ditemukan / kedaluwarsa", true);
  if (r.status === "done") return answer(cq.id, "Sudah diproses sebelumnya", true);

  const backRow = [{ text: "↩️ Kembali", callback_data: `v:${id}:b` }];

  if (act === "b") {
    await edit(cq, pendingText(r), startKeyboard(id));
    return answer(cq.id);
  }
  if (act === "s") {
    await edit(cq, confirmSuccess(r), {
      inline_keyboard: [[{ text: "✅ Ya, kirim email SUKSES", callback_data: `v:${id}:y:s` }], backRow],
    });
    return answer(cq.id);
  }
  if (act === "g") {
    const rows = Object.entries(FAIL_REASONS).map(([code, v]) => [
      { text: `❌ ${v.label}`, callback_data: `v:${id}:r:${code}` },
    ]);
    rows.push(backRow);
    await edit(cq, `❌ <b>Alasan gagal?</b>\nAkun <code>${esc(r.account)}</code> (<b>${esc(r.broker)}</b>)`, { inline_keyboard: rows });
    return answer(cq.id);
  }
  if (act === "r") {
    if (!FAIL_REASONS[a1]) return answer(cq.id, "Alasan tidak dikenal", true);
    await edit(cq, confirmFail(r, a1), {
      inline_keyboard: [[{ text: "❌ Ya, kirim email GAGAL", callback_data: `v:${id}:y:g:${a1}` }], backRow],
    });
    return answer(cq.id);
  }
  if (act === "y") {
    const status = a1 === "s" ? "sukses" : a1 === "g" ? "gagal" : null;
    const reason = status === "gagal" ? a2 : null;
    if (!status || (status === "gagal" && !FAIL_REASONS[reason])) return answer(cq.id, "Data tombol tidak valid", true);

    // Kunci supaya tap ganda tidak mengirim email dua kali
    const locked = await kv.set(`vlock:${id}`, 1, { nx: true, ex: 120 });
    if (!locked) return answer(cq.id, "Sedang diproses...", false);

    try {
      const mail = buildEmail({ broker: r.broker, account: r.account, status, reason: reason || "notib", lang: r.lang });
      await sendReply({ to: r.email, subject: mail.subject, text: mail.text, inReplyTo: r.messageId || undefined });
    } catch (e) {
      await kv.del(`vlock:${id}`);
      console.error("Kirim email gagal:", e);
      return answer(cq.id, `Email GAGAL terkirim: ${String(e.message).slice(0, 150)}. Tekan lagi untuk coba ulang.`, true);
    }

    const by = cq.from.username ? "@" + cq.from.username : cq.from.first_name || String(cq.from.id);
    const doneRec = { ...r, status: "done", result: status, reason, by, at: new Date().toISOString() };
    await kv.set(`vreq:${id}`, doneRec, { ex: 60 * 60 * 24 * 90 });

    const label = status === "sukses" ? "✅ SELESAI: SUKSES" : `❌ SELESAI: GAGAL (${FAIL_REASONS[reason].label})`;
    await edit(cq, `${label}

Broker: <b>${esc(r.broker)}</b>
Akun: <code>${esc(r.account)}</code>
Email terkirim ke: ${esc(r.email)}
Oleh ${esc(by)}, ${wibTime()}
ID: <code>${esc(r.id)}</code>`).catch((e) => console.error("Edit pesan gagal:", e.message));

    await logSheet({
      id: r.id, broker: r.broker, account: r.account, name: r.name, email: r.email,
      hasil: status, alasan: reason || "", oleh: by, waktu: doneRec.at,
    });
    return answer(cq.id, "Email terkirim ✅");
  }
  return answer(cq.id);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).send("ok");
  const secret = process.env.VALIDASI_WEBHOOK_SECRET;
  if (!secret || req.headers["x-telegram-bot-api-secret-token"] !== secret) {
    return res.status(401).json({ ok: false });
  }
  const cq = req.body?.callback_query;
  if (!cq) return res.status(200).json({ ok: true });
  try {
    await handleCallback(cq);
  } catch (e) {
    console.error("validasi-bot error:", e);
    await answer(cq.id, "Terjadi error, coba lagi", true);
  }
  return res.status(200).json({ ok: true });
}
