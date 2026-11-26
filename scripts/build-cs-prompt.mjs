// Jalankan setelah mengubah cs/system-prompt.md atau cs/knowledge-base.md:
//   node scripts/build-cs-prompt.mjs
// Hasilnya: api/_lib/cs-prompt.js (dipakai bot saat berjalan).
import { readFileSync, writeFileSync } from "node:fs";

const sp = readFileSync("cs/system-prompt.md", "utf8");
const kb = readFileSync("cs/knowledge-base.md", "utf8").trim();
const parts = sp.split(/^---\s*$/m);
if (parts.length < 3) throw new Error("system-prompt.md harus punya blok di antara dua baris '---'");
let prompt = parts[1].trim();
const slot = "(tempel isi knowledge-base.md di sini)";
if (!prompt.includes(slot)) throw new Error("Penanda knowledge-base tidak ditemukan di system-prompt.md");
prompt = prompt.replace(slot, kb);
writeFileSync(
  "api/_lib/cs-prompt.js",
  "// DIHASILKAN OTOMATIS oleh scripts/build-cs-prompt.mjs. Jangan diedit manual.\n" +
    "export const SYSTEM_PROMPT = " + JSON.stringify(prompt) + ";\n"
);
console.log("OK, panjang prompt:", prompt.length, "karakter");
