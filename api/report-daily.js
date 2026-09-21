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
    // Tambahkan ?preview=today di URL untuk lihat data HARI INI (untuk testing).
    // Tanpa parameter ini (kondisi normal via cron), tetap laporkan hari kemarin.
    const targetOffset = req.query && req.query.preview === 'today' ? 0 : -1;
    const targetDate = wibDateString(targetOffset);
    const [total, unik, brokerCounts] = await Promise.all([
      kv.get(`pindahib:total:day:${targetDate}`),
      kv.scard(`pindahib:users:day:${targetDate}`),
      Promise.all(
        BROKERS.map((b) => kv.get(`pindahib:broker:day:${targetDate}:${b.key}`))
      ),
    ]);

    const tanggalIndo = new Date(targetDate).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    // Susun breakdown, urut dari yang paling banyak dipilih, skip yang 0
    const breakdown = BROKERS.map((b, i) => ({ name: b.name, count: brokerCounts[i] || 0 }))
      .filter((b) => b.count > 0)
      .sort((a, b) => b.count - a.count)
      .map((b) => `  • ${b.name}: ${b.count}`)
      .join('\n');

    await sendTelegramMessage(
      `📊 *Laporan Harian - Bot Pindah IB*\n\n` +
      `Tanggal: ${tanggalIndo}\n` +
      `Total akses: *${total || 0}*\n` +
      `Jumlah orang (unik): *${unik}*\n\n` +
      `*Breakdown per broker:*\n` +
      (breakdown || '  (belum ada yang pilih broker)')
    );

    res.status(200).json({ ok: true, date: targetDate, total: total || 0, unik });
  } catch (err) {
    console.error('report-daily error:', err);
    res.status(500).json({ ok: false, error: String(err) });
  }
};
