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
