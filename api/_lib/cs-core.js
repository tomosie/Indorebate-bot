// Fungsi murni untuk bot CS (tanpa dependensi), supaya mudah diuji.

export const MAX_USER_CHARS = 1000;
export const MAX_HISTORY = 12; // jumlah pesan terakhir yang dikirim ke model
export const CATEGORIES = ["akun", "pembayaran", "keluhan", "teknis", "kerjasama", "lainnya"];

const MARK = /<<\s*ESKALASI\s*\|\s*([^|>]*?)\s*\|\s*([^>]*?)\s*>>/i;

// Ambil penanda eskalasi dari jawaban model, dan buang dari teks untuk pengguna.
export function extractEscalation(raw) {
  let t = String(raw || "").replace(/<think>[\s\S]*?<\/think>/gi, "");
  const m = t.match(MARK);
  t = t
    .replace(/<<\s*ESKALASI[^>]*>>/gi, "")
    .replace(/<<\s*ESKALASI[^\n]*$/gim, "")
    .trim();
  if (!m) return { reply: t, esc: null };
  const cat = m[1].trim().toLowerCase();
  return {
    reply: t,
    esc: { category: CATEGORIES.includes(cat) ? cat : "lainnya", summary: m[2].trim().slice(0, 300) },
  };
}

// Cegah pengguna menyisipkan penanda eskalasi lewat pesannya sendiri.
export function sanitizeUser(text) {
  return String(text || "")
    .replace(/<</g, "\u2039\u2039")
    .replace(/>>/g, "\u203A\u203A")
    .trim()
    .slice(0, MAX_USER_CHARS);
}

export function trimHistory(h) {
  return (Array.isArray(h) ? h : []).slice(-MAX_HISTORY);
}

// Jaring pengaman: model kadang berjanji meneruskan ke admin tanpa menulis penanda.
// Jika balasan berisi janji seperti itu, anggap sebagai eskalasi.
const PROMISE =
  /(teruskan|diteruskan|meneruskan|saya\s+forward|forward(ed)?\s+(this|it|your)|pass(ed)?\s+(this|it|your)[^.\n]{0,25}\s+(on\s+)?to\s+(the\s+)?admin)[^.\n]{0,60}admin|admin[^.\n]{0,60}(menindaklanjuti|akan\s+(membalas|menghubungi|mengecek|memeriksa)|will\s+(get\s+back|reply|follow|check|contact))|(hubungi|tulis\s+ke)\s+admin/i;

const GUESS = [
  ["pembayaran", /bayar|payout|withdraw|wd\b|rebate\s+(belum|tidak)|belum\s+masuk|payment|not\s+received/i],
  ["keluhan", /komplain|kecewa|kesal|marah|penipu|scam|complain|refund|angry/i],
  ["teknis", /error|bug|tidak\s+bisa\s+(dibuka|diakses)|rusak|gagal\s+(login|submit)|not\s+working/i],
  ["kerjasama", /kerja\s*sama|kemitraan|partnership|media|iklan|sponsor/i],
  ["akun", /akun|validasi|account|valid|pindah\s+mitra|ditolak|rejected/i],
];

export function detectImplicitEscalation(reply, userText) {
  if (!PROMISE.test(String(reply || ""))) return null;
  const u = String(userText || "");
  const cat = (GUESS.find(([, re]) => re.test(u)) || ["lainnya"])[0];
  return { category: cat, summary: ("(otomatis) " + u).slice(0, 300) };
}
