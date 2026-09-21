// api/validasi.js
// Endpoint pengganti Formspree untuk form validasi akun di indorebate.com/validasi.html
//
// ENV VARS yang dipakai (mengikuti penamaan yang sudah ada di project indorebate-bot):
//   BOT_TOKEN         -> token bot Telegram yang sudah ada (Jul 1), dipakai ulang
//   VALIDASI_CHAT_ID  -> chat_id channel "Validasi Indorebate" (-1003933395442)
//   RESEND_API_KEY    -> sudah ada di project ini
//   RESEND_FROM_EMAIL -> sudah ada di project ini, isinya "Indorebate Validasi <noreply@indorebate.com>"
//   ADMIN_EMAIL       -> omahrebate@gmail.com, penerima notifikasi admin
//
// ALLOWED_ORIGIN di-hardcode langsung di kode (bukan env var) karena nilainya tidak akan berubah.

const ALLOWED_ORIGIN = 'https://indorebate.com';

const ALLOWED_BROKERS = [
  'Headway', 'Exness', 'HFM', 'Tickmill', 'JustMarkets', 'RoboForex', 'XM Global',
];

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Verifikasi token reCAPTCHA v3 dari client ke Google.
// Return true kalau valid & skornya di atas threshold, false kalau tidak.
async function verifyRecaptcha(token) {
  const secretKey = process.env.RECAPTCHA_SECRET_KEY;
  if (!secretKey) {
    console.warn('RECAPTCHA_SECRET_KEY belum diset, lewati verifikasi captcha.');
    return true; // biar tidak mengunci form kalau env var belum dipasang
  }
  if (!token) return false;

  const params = new URLSearchParams({ secret: secretKey, response: token });
  const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  const data = await res.json();

  // score 0.0 (kemungkinan besar bot) - 1.0 (kemungkinan besar manusia).
  // 0.5 adalah threshold default yang direkomendasikan Google.
  const RECAPTCHA_SCORE_THRESHOLD = 0.5;

  if (!data.success) {
    console.warn('reCAPTCHA gagal:', data['error-codes']);
    return false;
  }
  if (data.action !== 'validasi_akun') {
    console.warn('reCAPTCHA action tidak cocok:', data.action);
    return false;
  }
  if (typeof data.score === 'number' && data.score < RECAPTCHA_SCORE_THRESHOLD) {
    console.warn('reCAPTCHA score rendah:', data.score);
    return false;
  }
  return true;
}

async function sendTelegramMessage(text) {
  const token = process.env.BOT_TOKEN;
  const chatId = process.env.VALIDASI_CHAT_ID;
  if (!token || !chatId) throw new Error('Telegram env vars belum diset (BOT_TOKEN / VALIDASI_CHAT_ID)');

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error('Telegram API error: ' + JSON.stringify(data));
  return data;
}

async function sendEmail({ to, subject, html, replyTo }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) throw new Error('Resend env vars belum diset');

  const payload = { from, to, subject, html };
  if (replyTo) payload.reply_to = replyTo;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error('Resend API error: ' + JSON.stringify(data));
  return data;
}

// Simpan data pendaftar ke Google Sheets (lewat Apps Script Web App) — arsip
// permanen untuk dipakai lagi nanti (rekap, marketing, dll). Ini TIDAK
// mengubah apa pun yang user lihat: user tetap cukup submit form ini saja,
// tidak diarahkan ke mana pun.
async function saveToGoogleSheet({ full_name, account_number, broker_name, email }) {
  const webhookUrl = process.env.GOOGLE_SHEET_WEBHOOK_URL;

  if (!webhookUrl) {
    console.warn('Google Sheet webhook belum dikonfigurasi, lewati penyimpanan.');
    return;
  }

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      full_name,
      account_number,
      broker_name,
      email,
      tanggal_daftar: new Date().toISOString(),
    }),
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Google Sheet webhook respons tidak valid: ${text}`);
  }
  if (!data.success) {
    throw new Error(`Google Sheet webhook gagal: ${text}`);
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const body = req.body || {};
    const full_name = typeof body.full_name === 'string' ? body.full_name.trim() : '';
    const account_number = typeof body.account_number === 'string' ? body.account_number.trim() : '';
    const broker_name = typeof body.broker_name === 'string' ? body.broker_name.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const recaptcha_token = typeof body.recaptcha_token === 'string' ? body.recaptcha_token : '';

    // --- Verifikasi captcha dulu sebelum proses lain, biar bot tidak
    // membebani Telegram/Resend/Google Sheets ---
    const isHuman = await verifyRecaptcha(recaptcha_token);
    if (!isHuman) {
      return res.status(400).json({
        success: false,
        error: 'Verifikasi keamanan gagal. Silakan muat ulang halaman dan coba lagi.',
      });
    }

    // --- Validasi ulang di server, jangan percaya input client ---
    if (full_name.length < 2) {
      return res.status(400).json({ success: false, error: 'Nama tidak valid.' });
    }
    if (!/^[0-9]+$/.test(account_number)) {
      return res.status(400).json({ success: false, error: 'Nomor akun tidak valid.' });
    }
    if (!ALLOWED_BROKERS.includes(broker_name)) {
      return res.status(400).json({ success: false, error: 'Broker tidak valid.' });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ success: false, error: 'Email tidak valid.' });
    }

    const now = new Date().toLocaleString('id-ID', {
      timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short',
    });

    // --- 1. Kirim notifikasi ke Telegram (channel khusus validasi) ---
    const telegramText =
      `🆕 <b>Validasi Akun Baru</b>\n\n` +
      `👤 Nama: ${escapeHtml(full_name)}\n` +
      `🔢 No. Akun: ${escapeHtml(account_number)}\n` +
      `🏦 Broker: ${escapeHtml(broker_name)}\n` +
      `📧 Email: ${escapeHtml(email)}\n` +
      `🕒 ${now} WIB`;

    // --- 2 & 3. Kirim email ke admin (detail lengkap) & ke user (konfirmasi) ---
    const adminEmailHtml = `
      <h2>Validasi Akun Baru</h2>
      <p><strong>Nama:</strong> ${escapeHtml(full_name)}</p>
      <p><strong>No. Akun:</strong> ${escapeHtml(account_number)}</p>
      <p><strong>Broker:</strong> ${escapeHtml(broker_name)}</p>
      <p><strong>Email:</strong> ${escapeHtml(email)}</p>
      <p><strong>Waktu:</strong> ${now} WIB</p>
    `;

    const userEmailHtml = `
      <p>Halo ${escapeHtml(full_name)},</p>
      <p>Terima kasih, permintaan validasi akun trading Anda di <strong>Indorebate</strong> sudah kami terima dengan detail berikut:</p>
      <ul>
        <li><strong>No. Akun:</strong> ${escapeHtml(account_number)}</li>
        <li><strong>Broker:</strong> ${escapeHtml(broker_name)}</li>
      </ul>
      <p>Tim kami akan memproses validasi ini dalam waktu 1x24 jam. Untuk mempercepat proses, jangan lupa kirim juga konfirmasi via tombol <strong>KONFIRMASI REBATE</strong> di halaman validasi (WhatsApp).</p>
      <p>Jika Anda tidak merasa mengirim permintaan ini, abaikan email ini.</p>
      <p>— Tim Indorebate</p>
    `;

    // Jalankan Telegram + kedua email + simpan Airtable secara paralel.
    // Kalau salah satu gagal, jangan gagalkan seluruh request selama kedua email (jalur utama) berhasil.
    const results = await Promise.allSettled([
      sendTelegramMessage(telegramText),
      sendEmail({
        to: process.env.ADMIN_EMAIL,
        subject: `Validasi Akun Baru — ${full_name}`,
        html: adminEmailHtml,
        replyTo: email, // reply dari email admin akan otomatis terarah ke email client
      }),
      sendEmail({
        to: email,
        subject: 'Permintaan Validasi Akun Anda Sudah Diterima — Indorebate',
        html: userEmailHtml,
      }),
      saveToGoogleSheet({ full_name, account_number, broker_name, email }),
    ]);

    const [telegramResult, adminEmailResult, userEmailResult, sheetResult] = results;

    if (telegramResult.status === 'rejected') {
      console.error('Telegram gagal:', telegramResult.reason);
    }
    if (adminEmailResult.status === 'rejected') {
      console.error('Email admin gagal:', adminEmailResult.reason);
    }
    if (userEmailResult.status === 'rejected') {
      console.error('Email user gagal:', userEmailResult.reason);
    }
    if (sheetResult.status === 'rejected') {
      console.error('Simpan ke Google Sheet gagal:', sheetResult.reason);
    }

    // Email ke admin (omahrebate@gmail.com) dan email konfirmasi ke user
    // adalah jalur notifikasi utama — kalau salah satunya gagal, anggap
    // request gagal supaya kamu tahu ada masalah dan tidak kehilangan
    // submission diam-diam, dan user juga tahu untuk coba lagi kalau
    // konfirmasinya sendiri gagal terkirim. Telegram dan Google Sheet
    // dianggap pelengkap: kalau salah satunya gagal tapi kedua email
    // berhasil, request tetap dianggap sukses.
    if (adminEmailResult.status === 'rejected' || userEmailResult.status === 'rejected') {
      return res.status(502).json({
        success: false,
        error: 'Gagal mengirim notifikasi. Silakan coba lagi atau hubungi kami via WhatsApp.',
      });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Validasi handler error:', err);
    return res.status(500).json({
      success: false,
      error: 'Terjadi kesalahan server. Silakan coba lagi.',
    });
  }
}
