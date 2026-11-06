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

// Mapping broker -> nama + halaman panduan pindah IB di indorebate.com
// Kunci (pindah_<broker>) TETAP sama untuk kedua bahasa: dipakai untuk statistik
// (logBrokerChoice) dan harus sinkron dengan daftar BROKERS di report-daily/monthly.js
const BROKER_LINKS = {
  pindah_headway:    { name: 'Headway',     id: 'pindah-ib-headway.html',    en: 'switch-partner-headway.html' },
  pindah_exness:     { name: 'Exness',      id: 'pindah-ib-exness.html',     en: 'switch-partner-exness.html' },
  pindah_hfm:        { name: 'HFM',         id: 'pindah-ib-hfm.html',        en: 'switch-partner-hfm.html' },
  pindah_tickmill:   { name: 'Tickmill',    id: 'pindah-ib-tickmill.html',   en: 'switch-partner-tickmill.html' },
  pindah_justmarkets:{ name: 'JustMarkets', id: 'pindah-ib-justmarkets.html',en: 'switch-partner-justmarkets.html' },
  pindah_roboforex:  { name: 'RoboForex',   id: 'pindah-ib-roboforex.html',  en: 'switch-partner-roboforex.html' },
  pindah_xm:         { name: 'XM Global',   id: 'pindah-ib-xm.html',         en: 'switch-partner-xm.html' },
  pindah_tmgm:       { name: 'TMGM',        id: 'pindah-ib-tmgm.html',       en: 'switch-partner-tmgm.html' },
};

// ============ BAHASA ============
// Bahasa ditentukan oleh parameter /start dari link di website:
//   t.me/<bot>?start=pindah     -> Indonesia (default)
//   t.me/<bot>?start=pindah_en  -> English
// Bahasa dibawa lewat callback_data tombol (pindah_en_<broker>), jadi tidak perlu
// menyimpan apa pun di KV. Tombol lama (pindah_<broker>) tetap berfungsi (Indonesia).
const TEXT = {
  id: {
    welcome:
      '👋 Selamat datang di *IndoRebate*!\n\n' +
      'Mau pindah IB ke broker apa? Silakan pilih salah satu di bawah ini:',
    unknown: 'Pilihan tidak dikenali, coba lagi ya.',
    preparing: (name) => `Menyiapkan link ${name}...`,
    chosen: (name, url) =>
      `✅ Kamu memilih pindah IB ke *${name}*.\n\n` +
      `Silakan lanjutkan proses pindah IB di sini:\n${url}`,
  },
  en: {
    welcome:
      '👋 Welcome to *IndoRebate*!\n\n' +
      'Which broker would you like to switch your IB to? Please choose one below:',
    unknown: 'Choice not recognized, please try again.',
    preparing: (name) => `Preparing your ${name} link...`,
    chosen: (name, url) =>
      `✅ You chose to switch your IB to *${name}*.\n\n` +
      `Continue the switch process here:\n${url}`,
  },
};

function brokerUrl(brokerKey, lang) {
  const b = BROKER_LINKS[brokerKey];
  return lang === 'en'
    ? `https://indorebate.com/en/${b.en}`
    : `https://indorebate.com/${b.id}`;
}

// callback_data: Indonesia = "pindah_<broker>", English = "pindah_en_<broker>"
function cb(brokerKey, lang) {
  return lang === 'en' ? brokerKey.replace('pindah_', 'pindah_en_') : brokerKey;
}

function buildBrokerKeyboard(lang = 'id') {
  const btn = (key) => Markup.button.callback(BROKER_LINKS[key].name, cb(key, lang));
  return Markup.inlineKeyboard([
    [btn('pindah_headway'), btn('pindah_exness')],
    [btn('pindah_hfm'), btn('pindah_tickmill')],
    [btn('pindah_justmarkets'), btn('pindah_roboforex')],
    [btn('pindah_xm'), btn('pindah_tmgm')],
  ]);
}

// ============ HANDLERS ============

bot.start(async (ctx) => {
  await logAccess(ctx.from.id);
  const lang = ctx.startPayload === 'pindah_en' ? 'en' : 'id';
  await ctx.reply(TEXT[lang].welcome, {
    parse_mode: 'Markdown',
    ...buildBrokerKeyboard(lang),
  });
});

// Satu handler untuk semua tombol broker (regex cocokkan semua callback_data
// yang diawali "pindah_", baik versi Indonesia maupun English)
bot.action(/^pindah_.+/, async (ctx) => {
  const data = ctx.callbackQuery.data;
  const lang = data.startsWith('pindah_en_') ? 'en' : 'id';
  // normalisasi ke kunci standar "pindah_<broker>" (dipakai statistik & laporan)
  const brokerKey = lang === 'en' ? data.replace('pindah_en_', 'pindah_') : data;
  const broker = BROKER_LINKS[brokerKey];

  if (!broker) {
    await ctx.answerCbQuery(TEXT[lang].unknown);
    return;
  }

  await logBrokerChoice(brokerKey);
  await ctx.answerCbQuery(TEXT[lang].preparing(broker.name));

  await ctx.editMessageText(
    TEXT[lang].chosen(broker.name, brokerUrl(brokerKey, lang)),
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
