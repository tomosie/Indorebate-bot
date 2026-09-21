const { kv } = require('@vercel/kv');

const BOT_TOKEN = process.env.PINDAH_IB_BOT_TOKEN;
const REPORT_CHAT_ID = process.env.REPORT_CHAT_ID; // 218069818

// Daftar broker (harus sinkron dengan BROKER_LINKS di pindah-ib.js)
const BROKERS = [
  { key: 'pindah_headway', name: 'Headway' },
  { key: 'pindah_exness', name: 'Exness' },
  { key: 'pindah_hfm', name: 'HFM' },
  { key: 'pindah_tickmill', name: 'Tickmill' },
  { key: 'pindah_justmarkets', name: 'JustMarkets' },
  { key: 'pindah_roboforex', name: 'RoboForex' },
  { key: 'pindah_xm', name: 'XM Global' },
  { key: 'pindah_tmgm', name: 'TMGM' },
];

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
    const [total, unik, brokerCounts] = await Promise.all([
      kv.get(`pindahib:total:month:${lastMonth}`),
      kv.scard(`pindahib:users:month:${lastMonth}`),
      Promise.all(
        BROKERS.map((b) => kv.get(`pindahib:broker:month:${lastMonth}:${b.key}`))
      ),
    ]);

    const namaBulan = new Date(`${lastMonth}-01`).toLocaleDateString('id-ID', {
      month: 'long',
      year: 'numeric',
    });

    const breakdown = BROKERS.map((b, i) => ({ name: b.name, count: brokerCounts[i] || 0 }))
      .filter((b) => b.count > 0)
      .sort((a, b) => b.count - a.count)
      .map((b) => `  • ${b.name}: ${b.count}`)
      .join('\n');

    await sendTelegramMessage(
      `📈 *Laporan Bulanan - Bot Pindah IB*\n\n` +
      `Bulan: ${namaBulan}\n` +
      `Total akses: *${total || 0}*\n` +
      `Jumlah orang (unik): *${unik}*\n\n` +
      `*Breakdown per broker:*\n` +
      (breakdown || '  (belum ada yang pilih broker)')
    );

    res.status(200).json({ ok: true, month: lastMonth, total: total || 0, unik });
  } catch (err) {
    console.error('report-monthly error:', err);
    res.status(500).json({ ok: false, error: String(err) });
  }
};
