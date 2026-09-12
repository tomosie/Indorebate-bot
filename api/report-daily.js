const { kv } = require('@vercel/kv');

const BOT_TOKEN = process.env.PINDAH_IB_BOT_TOKEN;
const REPORT_CHAT_ID = process.env.REPORT_CHAT_ID; // 218069818

function wibDateString(offsetDays = 0) {
  const wib = new Date(Date.now() + 7 * 60 * 60 * 1000);
  wib.setUTCDate(wib.getUTCDate() + offsetDays);
  return wib.toISOString().slice(0, 10);
}

async function sendTelegramMessage(text) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: REPORT_CHAT_ID,
      text,
      parse_mode: 'Markdown',
    }),
  });
}

module.exports = async (req, res) => {
  // Keamanan: hanya boleh dipicu oleh Vercel Cron (mengirim header ini
  // otomatis kalau env var CRON_SECRET di-set di project settings)
  if (process.env.CRON_SECRET) {
    const auth = req.headers['authorization'];
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }
  }

  try {
    const yesterday = wibDateString(-1); // hari yang baru saja selesai (WIB)
    const [total, unik] = await Promise.all([
      kv.get(`pindahib:total:day:${yesterday}`),
      kv.scard(`pindahib:users:day:${yesterday}`),
    ]);

    const tanggalIndo = new Date(yesterday).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    await sendTelegramMessage(
      `📊 *Laporan Harian - Bot Pindah IB*\n\n` +
      `Tanggal: ${tanggalIndo}\n` +
      `Total akses: *${total || 0}*\n` +
      `Jumlah orang (unik): *${unik}*`
    );

    res.status(200).json({ ok: true, date: yesterday, total: total || 0, unik });
  } catch (err) {
    console.error('report-daily error:', err);
    res.status(500).json({ ok: false, error: String(err) });
  }
};
