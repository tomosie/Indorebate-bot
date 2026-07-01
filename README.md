# IndoRebate Telegram Bot (Vercel + GitHub, tanpa penyimpanan data permanen)

Bot Telegram untuk menggantikan Formspree pada proses validasi akun rebate di indorebate.com.
Bot berjalan sebagai **serverless function di Vercel** (webhook, bukan polling), kode di-host
di **GitHub**. Data pendaftar **tidak disimpan permanen** — hanya diteruskan ke chat Telegram
admin, lalu session dihapus. Kalau user berhenti di tengah jalan, session otomatis expire
sendiri dalam 10 menit.

## 1. Bikin Bot di Telegram

1. Chat **@BotFather** → `/newbot` → ikuti instruksi → dapatkan **BOT_TOKEN**.
2. Chat **@userinfobot** → dapatkan **ADMIN_CHAT_ID** (chat ID kamu).
3. Kirim `/start` ke bot barumu sendiri dari akun Telegram kamu (wajib, supaya bot bisa
   kirim pesan ke kamu nanti).

## 2. Push Kode ke GitHub

```bash
cd indorebate-bot-vercel
git init
git add .
git commit -m "Initial commit: IndoRebate validation bot"
git branch -M main
git remote add origin https://github.com/tomosie/indorebate-bot.git
git push -u origin main
```

## 3. Deploy ke Vercel + Setup KV (session sementara)

1. Buka [vercel.com](https://vercel.com) → **Add New Project** → import repo GitHub yang baru dibuat.
2. Deploy dulu (biarkan default settings, Vercel otomatis kenali folder `api/` sebagai serverless function).
3. Setelah project ada, buka tab **Storage** di dashboard project Vercel → **Create Database** → pilih **KV** (gratis di Hobby plan) → beri nama misal `indorebate-session` → **Connect** ke project ini.
   - Vercel otomatis inject `KV_REST_API_URL` dan `KV_REST_API_TOKEN` ke environment variables project — tidak perlu isi manual.
4. Buka tab **Settings → Environment Variables**, tambahkan:
   - `BOT_TOKEN` = token dari BotFather
   - `ADMIN_CHAT_ID` = chat ID kamu
5. Redeploy project (Settings → Deployments → klik `...` pada deployment terakhir → **Redeploy**) supaya env variable baru terbaca.

## 4. Daftarkan Webhook ke Telegram

Setelah deploy sukses, kamu akan dapat URL project, misal `https://indorebate-bot.vercel.app`.
Daftarkan webhook dengan membuka URL berikut di browser (ganti `<BOT_TOKEN>` dan domain):

```
https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=https://indorebate-bot.vercel.app/api/webhook
```

Kalau berhasil, akan muncul respons JSON `{"ok":true,"result":true,"description":"Webhook was set"}`.

Cek status webhook kapan saja:
```
https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo
```

## 5. Ganti Tombol "Validasi Akun" di indorebate.com

```html
<a href="https://t.me/username_bot_kamu?start=validasi" target="_blank">
  Validasi Akun
</a>
```

## 6. Update Otomatis Setelahnya

Karena sudah terhubung GitHub ↔ Vercel, setiap kali kamu `git push` ke branch `main`,
Vercel otomatis redeploy versi terbaru. Tidak perlu upload manual atau restart VPS.

## Kenapa Tidak Ada Database

- Data (Nama, Akun Trading, Broker, Email) hanya diteruskan langsung sebagai pesan Telegram ke `ADMIN_CHAT_ID` lalu **tidak disimpan di mana pun**.
- Session per user (lagi di step pertanyaan ke berapa) disimpan sementara di Vercel KV dengan TTL 10 menit, otomatis terhapus baik saat validasi selesai maupun saat expire.
- Cocok kalau kamu hanya butuh notifikasi real-time tanpa perlu histori/database pendaftar.

Kalau nanti berubah pikiran dan mau ada histori pendaftar (misal buat rekap bulanan), tinggal
tambahkan penyimpanan ke Supabase yang sudah kamu pakai untuk affiliate tracking — cukup
tambah satu `insert` sebelum baris `await kv.del(...)` di `api/webhook.js`.
