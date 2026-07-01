const { Telegraf } = require('telegraf');
const { kv } = require('@vercel/kv');

// ============ KONFIGURASI ============
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

const bot = new Telegraf(BOT_TOKEN);

// Session sementara — auto-expire, TIDAK ada penyimpanan permanen.
// Kalau user tinggal di tengah jalan, session otomatis hilang sendiri.
const SESSION_TTL_SECONDS = 600; // 10 menit

const STEPS = ['nama', 'akun_trading', 'broker', 'email'];

const QUESTIONS = {
  nama: 'Silakan masukkan *Nama Lengkap* Anda:',
  akun_trading: 'Masukkan *Nomor Akun Trading* Anda:',
  broker: 'Masukkan *Nama Broker* yang Anda gunakan (contoh: Exness, HFM, Tickmill):',
  email: 'Terakhir, masukkan *Email* aktif Anda:',
};

function sessionKey(userId) {
  return `session:${userId}`;
}

function validateInput(step, text) {
  const value = text.trim();
  if (value.length < 2) return 'Input terlalu pendek, coba lagi ya.';

  if (step === 'akun_trading') {
    if (!/^\d{4,15}$/.test(value)) {
      return 'Nomor akun trading harus berupa angka (4-15 digit). Coba lagi:';
    }
  }

  if (step === 'email') {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      return 'Format email tidak valid. Contoh: nama@email.com. Coba lagi:';
    }
  }

  return null; // valid
}

// ============ HANDLERS ============

bot.start(async (ctx) => {
  await ctx.reply(
    '👋 Selamat datang di *IndoRebate Validasi Akun*!\n\n' +
    'Saya akan menanyakan beberapa data untuk proses aktivasi rebate Anda.\n' +
    'Data Anda TIDAK disimpan permanen — hanya diteruskan untuk proses aktivasi.\n\n' +
    'Ketik /validasi untuk memulai, atau /batal untuk membatalkan kapan saja.',
    { parse_mode: 'Markdown' }
  );
});

bot.command('validasi', async (ctx) => {
  const userId = ctx.from.id;
  await kv.set(sessionKey(userId), { step: 0, data: {} }, { ex: SESSION_TTL_SECONDS });
  await ctx.reply(QUESTIONS[STEPS[0]], { parse_mode: 'Markdown' });
});

bot.command('batal', async (ctx) => {
  const userId = ctx.from.id;
  await kv.del(sessionKey(userId));
  await ctx.reply('Proses dibatalkan. Ketik /validasi kapan saja untuk mulai lagi.');
});

bot.on('text', async (ctx) => {
  const userId = ctx.from.id;
  const text = ctx.message.text;

  if (text.startsWith('/')) return; // command lain, abaikan di sini

  const state = await kv.get(sessionKey(userId));
  if (!state) {
    return ctx.reply('Ketik /validasi untuk memulai proses validasi akun.');
  }

  const currentStep = STEPS[state.step];
  const errorMsg = validateInput(currentStep, text);

  if (errorMsg) {
    return ctx.reply(errorMsg);
  }

  state.data[currentStep] = text.trim();
  state.step += 1;

  // masih ada pertanyaan berikutnya -> perpanjang session, lanjut tanya
  if (state.step < STEPS.length) {
    await kv.set(sessionKey(userId), state, { ex: SESSION_TTL_SECONDS });
    const nextStep = STEPS[state.step];
    return ctx.reply(QUESTIONS[nextStep], { parse_mode: 'Markdown' });
  }

  // ============ SEMUA DATA LENGKAP ============
  const { nama, akun_trading, broker, email } = state.data;

  // Hapus session SEGERA — data tidak disimpan di mana pun setelah ini.
  await kv.del(sessionKey(userId));

  await ctx.reply(
    '✅ Terima kasih! Data Anda sudah kami terima:\n\n' +
    `👤 Nama: ${nama}\n` +
    `📊 Akun Trading: ${akun_trading}\n` +
    `🏦 Broker: ${broker}\n` +
    `📧 Email: ${email}\n\n` +
    'Akun Anda sedang diproses untuk aktivasi rebate. Mohon tunggu konfirmasi selanjutnya.'
  );

  const adminMessage =
    '🔔 *Pendaftaran Rebate Baru*\n\n' +
    `👤 Nama: ${nama}\n` +
    `📊 Akun Trading: ${akun_trading}\n` +
    `🏦 Broker: ${broker}\n` +
    `📧 Email: ${email}\n\n` +
    `Telegram: @${ctx.from.username || '(no username)'} (ID: ${userId})`;

  try {
    await bot.telegram.sendMessage(ADMIN_CHAT_ID, adminMessage, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('Gagal kirim notifikasi ke admin:', err);
  }
});

bot.catch((err, ctx) => {
  console.error(`Error untuk ${ctx.updateType}:`, err);
});

// ============ VERCEL SERVERLESS HANDLER ============
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(200).send('IndoRebate bot webhook aktif.');
  }

  try {
    await bot.handleUpdate(req.body);
  } catch (err) {
    console.error('Webhook error:', err);
  }

  res.status(200).json({ ok: true });
};
