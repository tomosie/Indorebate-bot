const { kv } = require('@vercel/kv');

const BOT_TOKEN = process.env.PINDAH_IB_BOT_TOKEN;
const REPORT_CHAT_ID = process.env.REPORT_CHAT_ID; // 218069818

function wibMonthString(offsetMonths = 0) {
  const wib = new Date(Date.now() + 7 * 60 * 60 * 1000);
  wib.setUTCMonth(wib.getUTCMonth() + offsetMonths);
  return wib.toISOString().slice(0, 7); // YYYY-MM
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
  if (process.env.CRON_SECRET) {
    const auth = req.headers['authorization'];
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }
  }

  try {
    const lastMonth = wibMonthString(-1); // bulan yang baru saja selesai (WIB)
    const [total, unik] = await Promise.all([
      kv.get(`pindahib:total:month:${lastMonth}`),
      kv.scard(`pindahib:users:month:${lastMonth}`),
    ]);

    const namaBulan = new Date(`${lastMonth}-01`).toLocaleDateString('id-ID', {
      month: 'long',
      year: 'numeric',
    });

    await sendTelegramMessage(
      `📈 *Laporan Bulanan - Bot Pindah IB*\n\n` +
      `Bulan: ${namaBulan}\n` +
      `Total akses: *${total || 0}*\n` +
      `Jumlah orang (unik): *${unik}*`
    );

    res.status(200).json({ ok: true, month: lastMonth, total: total || 0, unik });
  } catch (err) {
    console.error('report-monthly error:', err);
    res.status(500).json({ ok: false, error: String(err) });
  }
};
