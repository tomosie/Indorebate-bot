const { Telegraf, Markup } = require('telegraf');
const { kv } = require('@vercel/kv');

// ============ KONFIGURASI ============
// Token BOT BERBEDA dari bot validasi akun (webhook.js) — pastikan
// PINDAH_IB_BOT_TOKEN diisi dengan token bot yang khusus untuk fitur ini.
const BOT_TOKEN = process.env.PINDAH_IB_BOT_TOKEN;

const bot = new Telegraf(BOT_TOKEN);

// ============ TRACKING AKSES (untuk laporan harian/bulanan) ============
// Tanggal/bulan dihitung berdasarkan waktu WIB (UTC+7), bukan UTC,
// supaya "hari" dan "bulan" sesuai zona waktu Indonesia.
function wibDateString(offsetDays = 0) {
  const wib = new Date(Date.now() + 7 * 60 * 60 * 1000);
  wib.setUTCDate(wib.getUTCDate() + offsetDays);
  return wib.toISOString().slice(0, 10); // YYYY-MM-DD
}
function wibMonthString(offsetMonths = 0) {
  const wib = new Date(Date.now() + 7 * 60 * 60 * 1000);
  wib.setUTCMonth(wib.getUTCMonth() + offsetMonths);
  return wib.toISOString().slice(0, 7); // YYYY-MM
}

// Simpan user ID ke Set harian & bulanan (unik) + counter total akses
async function logAccess(userId) {
  const today = wibDateString();
  const month = wibMonthString();
  await Promise.all([
    kv.sadd(`pindahib:users:day:${today}`, userId),
    kv.sadd(`pindahib:users:month:${month}`, userId),
    kv.incr(`pindahib:total:day:${today}`),
    kv.incr(`pindahib:total:month:${month}`),
    kv.expire(`pindahib:users:day:${today}`, 45 * 24 * 60 * 60),
    kv.expire(`pindahib:users:month:${month}`, 400 * 24 * 60 * 60),
    kv.expire(`pindahib:total:day:${today}`, 45 * 24 * 60 * 60),
    kv.expire(`pindahib:total:month:${month}`, 400 * 24 * 60 * 60),
  ]);
}

// Catat pilihan broker (untuk breakdown per-broker di laporan)
async function logBrokerChoice(brokerKey) {
  const today = wibDateString();
  const month = wibMonthString();
  await Promise.all([
    kv.incr(`pindahib:broker:day:${today}:${brokerKey}`),
    kv.incr(`pindahib:broker:month:${month}:${brokerKey}`),
    kv.expire(`pindahib:broker:day:${today}:${brokerKey}`, 45 * 24 * 60 * 60),
    kv.expire(`pindahib:broker:month:${month}:${brokerKey}`, 400 * 24 * 60 * 60),
  ]);
}

// Mapping callback_data -> link pindah IB di indorebate.com
const BROKER_LINKS = {
  pindah_headway: {
    name: 'Headway',
    url: 'https://indorebate.com/pindah-ib-headway.html',
  },
  pindah_exness: {
    name: 'Exness',
    url: 'https://indorebate.com/pindah-ib-exness.html',
  },
  pindah_hfm: {
    name: 'HFM',
    url: 'https://indorebate.com/pindah-ib-hfm.html',
  },
  pindah_tickmill: {
    name: 'Tickmill',
    url: 'https://indorebate.com/pindah-ib-tickmill.html',
  },
  pindah_justmarkets: {
    name: 'JustMarkets',
    url: 'https://indorebate.com/pindah-ib-justmarkets.html',
  },
  pindah_roboforex: {
    name: 'RoboForex',
    url: 'https://indorebate.com/pindah-ib-roboforex.html',
  },
  pindah_xm: {
    name: 'XM Global',
    url: 'https://indorebate.com/pindah-ib-xm.html',
  },
  pindah_tmgm: {
    name: 'TMGM',
    url: 'https://indorebate.com/pindah-ib-tmgm.html',
  },
};

function buildBrokerKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('Headway', 'pindah_headway'),
      Markup.button.callback('Exness', 'pindah_exness'),
    ],
    [
      Markup.button.callback('HFM', 'pindah_hfm'),
      Markup.button.callback('Tickmill', 'pindah_tickmill'),
    ],
    [
      Markup.button.callback('JustMarkets', 'pindah_justmarkets'),
      Markup.button.callback('RoboForex', 'pindah_roboforex'),
    ],
    [
      Markup.button.callback('XM Global', 'pindah_xm'),
      Markup.button.callback('TMGM', 'pindah_tmgm'),
    ],
  ]);
}

// ============ HANDLERS ============

bot.start(async (ctx) => {
  await logAccess(ctx.from.id);
  await ctx.reply(
    '👋 Selamat datang di *IndoRebate*!\n\n' +
    'Mau pindah IB ke broker apa? Silakan pilih salah satu di bawah ini:',
    { parse_mode: 'Markdown', ...buildBrokerKeyboard() }
  );
});

// Satu handler untuk semua tombol broker (regex cocokkan semua callback_data
// yang diawali "pindah_")
bot.action(/^pindah_.+/, async (ctx) => {
  const data = ctx.callbackQuery.data;
  const broker = BROKER_LINKS[data];

  if (!broker) {
    await ctx.answerCbQuery('Pilihan tidak dikenali, coba lagi ya.');
    return;
  }

  await logBrokerChoice(data);
  await ctx.answerCbQuery(`Menyiapkan link ${broker.name}...`);

  await ctx.editMessageText(
    `✅ Kamu memilih pindah IB ke *${broker.name}*.\n\n` +
    `Silakan lanjutkan proses pindah IB di sini:\n${broker.url}`,
    { parse_mode: 'Markdown' }
  );
});

bot.catch((err, ctx) => {
  console.error(`Error untuk ${ctx.updateType}:`, err);
});

// ============ VERCEL SERVERLESS HANDLER ============
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(200).send('IndoRebate pindah-IB bot webhook aktif.');
  }

  try {
    await bot.handleUpdate(req.body);
  } catch (err) {
    console.error('Webhook error:', err);
  }

  res.status(200).json({ ok: true });
};
