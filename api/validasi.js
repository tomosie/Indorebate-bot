// api/validasi.js
// Endpoint pengganti Formspree untuk form validasi akun di indorebate.com/validasi.html
//
// ENV VARS yang wajib diset di Vercel (Project Settings -> Environment Variables):
//   TELEGRAM_BOT_TOKEN         -> token bot Telegram (boleh pakai bot yang sudah ada)
//   TELEGRAM_VALIDASI_CHAT_ID  -> chat_id channel/grup BARU khusus notifikasi validasi
//   RESEND_API_KEY             -> API key dari resend.com
//   RESEND_FROM_EMAIL          -> alamat pengirim terverifikasi, mis. "Indorebate <noreply@indorebate.com>"
//   ADMIN_EMAIL                -> email kamu sendiri, penerima notifikasi admin
//   ALLOWED_ORIGIN             -> origin yang boleh akses, mis. "https://indorebate.com"

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

async function sendTelegramMessage(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_VALIDASI_CHAT_ID;
  if (!token || !chatId) throw new Error('Telegram env vars belum diset');

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

async function sendEmail({ to, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) throw new Error('Resend env vars belum diset');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, html }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error('Resend API error: ' + JSON.stringify(data));
  return data;
}

export default async function handler(req, res) {
  const allowedOrigin = process.env.ALLOWED_ORIGIN || 'https://indorebate.com';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
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

    // --- 1. Kirim notifikasi ke Telegram (channel/chat khusus validasi) ---
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

    // Jalankan Telegram + kedua email secara paralel.
    // Kalau salah satu gagal, jangan gagalkan seluruh request selama Telegram (jalur utama) berhasil.
    const results = await Promise.allSettled([
      sendTelegramMessage(telegramText),
      sendEmail({
        to: process.env.ADMIN_EMAIL,
        subject: `Validasi Akun Baru — ${full_name}`,
        html: adminEmailHtml,
      }),
      sendEmail({
        to: email,
        subject: 'Permintaan Validasi Akun Anda Sudah Diterima — Indorebate',
        html: userEmailHtml,
      }),
    ]);

    const [telegramResult, adminEmailResult, userEmailResult] = results;

    if (telegramResult.status === 'rejected') {
      console.error('Telegram gagal:', telegramResult.reason);
    }
    if (adminEmailResult.status === 'rejected') {
      console.error('Email admin gagal:', adminEmailResult.reason);
    }
    if (userEmailResult.status === 'rejected') {
      console.error('Email user gagal:', userEmailResult.reason);
    }

    // Telegram adalah jalur notifikasi utama — kalau ini gagal, anggap request gagal
    // supaya kamu tahu ada masalah dan tidak kehilangan submission diam-diam.
    if (telegramResult.status === 'rejected') {
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
