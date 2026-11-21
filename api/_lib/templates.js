// Template email balasan validasi. Teks sama persis dengan "Generator Balasan Validasi".
// Password aktivasi EA TIDAK ditulis di kode: diambil dari env EA_PW_MULT dan EA_PW_ADD.

const IB_LINKS = {
  Headway: "https://indorebate.com/pindah-ib-headway.html",
  Exness: "https://indorebate.com/pindah-ib-exness.html",
  HFM: "https://indorebate.com/pindah-ib-hfm.html",
  Tickmill: "https://indorebate.com/pindah-ib-tickmill.html",
  Justmarkets: "https://indorebate.com/pindah-ib-justmarkets.html",
  Roboforex: "https://indorebate.com/pindah-ib-roboforex.html",
  XM: "https://indorebate.com/pindah-ib-xm.html",
  TMGM: "https://indorebate.com/pindah-ib-tmgm.html",
};

const IB_LINKS_EN = {
  Headway: "https://indorebate.com/en/switch-partner-headway.html",
  Exness: "https://indorebate.com/en/switch-partner-exness.html",
  HFM: "https://indorebate.com/en/switch-partner-hfm.html",
  Tickmill: "https://indorebate.com/en/switch-partner-tickmill.html",
  Justmarkets: "https://indorebate.com/en/switch-partner-justmarkets.html",
  Roboforex: "https://indorebate.com/en/switch-partner-roboforex.html",
  XM: "https://indorebate.com/en/switch-partner-xm.html",
  TMGM: "https://indorebate.com/en/switch-partner-tmgm.html",
};

// Catatan penting: arahkan ke Syarat & Ketentuan di halaman rebate masing-masing broker.
// Anchor: #syarat-ketentuan di rebate-<broker>.html (ID), #terms-conditions di en/rebate-<broker>.html (EN).
const TERMS_PAGE = {
  Headway: "headway", Exness: "exness", HFM: "hfm", Tickmill: "tickmill",
  Justmarkets: "justmarkets", Roboforex: "roboforex", XM: "xm", TMGM: "tmgm",
};
const DISPLAY_NAME = { Justmarkets: "JustMarkets", Roboforex: "RoboForex" };

function termsNote(brokerName, lang) {
  const slug = TERMS_PAGE[brokerName];
  if (!slug) return "";
  const name = DISPLAY_NAME[brokerName] || brokerName;
  if (lang === "en") {
    return `📌 Important Note:\nPlease read the ${name} Rebate Terms & Conditions at the following link:\nhttps://indorebate.com/en/rebate-${slug}.html#terms-conditions`;
  }
  return `📌 Catatan Penting:\nMohon membaca Syarat & Ketentuan Rebate ${name} melalui tautan berikut:\nhttps://indorebate.com/rebate-${slug}.html#syarat-ketentuan`;
}

export function canonicalBroker(raw) {
  const s = String(raw || "").toLowerCase().replace(/[^a-z]/g, "");
  if (s.startsWith("xm")) return "XM";
  const map = [
    ["headway", "Headway"], ["exness", "Exness"], ["hfm", "HFM"], ["tickmill", "Tickmill"],
    ["justmarkets", "Justmarkets"], ["roboforex", "Roboforex"], ["tmgm", "TMGM"],
  ];
  for (const [k, v] of map) if (s.includes(k)) return v;
  return null;
}

function eaPassword(acc) {
  const mult = Number(process.env.EA_PW_MULT);
  const add = Number(process.env.EA_PW_ADD);
  if (!process.env.EA_PW_MULT || !process.env.EA_PW_ADD || !Number.isFinite(mult) || !Number.isFinite(add)) {
    throw new Error("EA_PW_MULT / EA_PW_ADD belum diset di Vercel");
  }
  const digits = String(acc).replace(/\D/g, "");
  if (!digits) throw new Error("Nomor akun tidak valid");
  return String(parseInt(digits, 10) * mult + add);
}

function successText(brokerName, accNum, lang) {
  const isXM = brokerName === "XM";
  const isTickmill = brokerName === "Tickmill";
  const isTMGM = brokerName === "TMGM";

  if (lang === "en") {
    if (isTMGM) {
      return `Rebate Validation Successful

Trading Account No : ${accNum}
Broker : TMGM

Account no ${accNum} will serve as your rebate receiving wallet. Rebates are paid automatically on an H+1 basis after order closure into this Wallet Balance.

Important!
Please create an additional trading account for trading purposes.
In the future, any new trading account created (with the same email) will automatically have rebate active.

You can perform validation on the Indorebate website whenever you create a new trading account if you are unsure whether rebate is active.

Rebate calculation starts from the time the account is approved / rebate activation is successful. Previous trades will not be calculated.

${termsNote(brokerName, "en")}

----------------------------------------
🎁 Congratulations, you are eligible for Free Tools from Indorebate.

Free EA and Indicator info here:
https://indorebate.com/en/free-tools.html

If you have created an account for trading, please contact Indorebate admin WhatsApp to obtain the free EA & Indicator activation password.`;
    }
    const pw = eaPassword(accNum);
    let paymentText = "Rebates are paid automatically on an H+1 basis after order closure directly into your Trading Account Balance.";
    if (isXM) paymentText = "Rebates are paid automatically every 24 hours after order closure directly to myWallet.";
    else if (isTickmill) paymentText = "Rebates are paid automatically once a week every Monday into your Trading Account Balance.";
    const hfm = "\n\n" + termsNote(brokerName, "en");
    return `Rebate Validation Successful

Trading Account No : ${accNum}
Broker : ${brokerName}

${paymentText}

Please perform validation on the Indorebate website whenever you create a new trading account.

Rebate calculation starts from the time the account is approved / rebate activation is successful. Previous trades will not be calculated.${hfm}

----------------------------------------
🎁 Congratulations, you are eligible for Free Tools from Indorebate.

EA Activation Password : ${pw}
(specifically for registered account ${accNum})

Free EA and Indicator info here:
https://indorebate.com/en/free-tools.html`;
  }

  if (isTMGM) {
    return `Validasi Rebate Sukses

No akun trading : ${accNum}
Broker : ${brokerName}

No akun ${accNum} akan berubah menjadi wallet penampungan rebate anda. Rebate dibayarkan H+1 setelah penutupan order secara otomatis ke dalam Saldo Wallet ini

Penting!
Silakan membuat akun trading tambahan untuk keperluan trading.
Kedepan jika membuat akun trading baru lagi (dengan email yang sama) otomatis sudah aktif rebate nya

Anda bisa melakukan validasi di web indorebate setiap anda membuat akun trading baru jika anda tidak yakin sudah aktif rebate nya

Perhitungan rebate dimulai sejak akun disetujui / sukses aktivasi rebate. Untuk trade sebelumnya tidak diperhitungkan

${termsNote(brokerName, "id")}

----------------------------------------
🎁 Selamat anda berhak mendapatkan Free Tools dari Indorebate.

Info EA dan Indikator gratis disini:
https://indorebate.com/tools-gratis.html

Jika anda sudah membuat akun untuk trading silakan hubungi wa admin indorebate untuk memperoleh password aktivasi EA & Indikator gratis`;
  }

  const pw = eaPassword(accNum);
  let paymentText = "Rebate dibayarkan H+1 setelah penutupan order langsung ke dalam Saldo Akun Trading secara otomatis.";
  if (isXM) paymentText = "Rebate dibayarkan tiap 24 jam setelah penutupan order langsung ke myWallet secara otomatis.";
  else if (isTickmill) paymentText = "Rebate dibayarkan seminggu sekali setiap hari senin ke dalam Saldo Akun Trading secara otomatis.";
  const hfm = "\n\n" + termsNote(brokerName, "id");
  return `Validasi Rebate Sukses

No akun trading : ${accNum}
Broker : ${brokerName}

${paymentText}

Harap lakukan validasi di web indorebate setiap anda membuat akun trading baru.

Perhitungan rebate dimulai sejak akun disetujui / sukses aktivasi rebate. Untuk trade sebelumnya tidak diperhitungkan${hfm}

----------------------------------------
🎁 Selamat anda berhak mendapatkan Free Tools dari Indorebate.

Password aktivasi EA : ${pw}
(dapat digunakan khusus untuk akun terdaftar ${accNum})

Info EA dan Indikator gratis disini:
https://indorebate.com/tools-gratis.html`;
}

function failText(brokerName, accNum, lang) {
  if (lang === "en") {
    const link = IB_LINKS_EN[brokerName] || `https://indorebate.com/en/switch-partner-${brokerName.toLowerCase()}.html`;
    const footer = `----------------------------------------
🎁 Free EA & Indicators exclusively for Indorebate members
Full info : https://indorebate.com/en/free-tools.html`;
    return `Validation Failed

Trading Account No : ${accNum}
Broker : ${brokerName}

Your account number cannot be activated for rebate because it is not under our partner network (IB).

Please proceed with the change of IB / network process.

For broker ${brokerName}, follow the instructions at ${link}

${footer}`;
  }

  const link = IB_LINKS[brokerName] || `https://indorebate.com/pindah-ib-${brokerName.toLowerCase()}.html`;
  const footer = `----------------------------------------
🎁 Free EA & Indikator khusus member Indorebate
Info lengkap : https://indorebate.com/tools-gratis.html`;
  return `Validasi Gagal

No akun trading : ${accNum}
Broker : ${brokerName}

No akun anda tidak bisa kami aktivasi rebate karena akun anda tidak berada di bawah jaringan kami.

Silakan lakukan proses pindah IB / jaringan.

Untuk broker ${brokerName} ikuti petunjuk di ${link}

${footer}`;
}

export function buildEmail({ broker, account, status, lang = "id" }) {
  const brokerName = canonicalBroker(broker);
  if (!brokerName) throw new Error("Broker tidak dikenali: " + broker);
  const acc = String(account || "").trim();
  if (!acc) throw new Error("Nomor akun kosong");
  const l = lang === "en" ? "en" : "id";
  if (status === "sukses") {
    return {
      subject: l === "en" ? `Rebate Validation ${brokerName} #${acc}: SUCCESSFUL` : `Validasi Rebate ${brokerName} #${acc}: SUKSES`,
      text: successText(brokerName, acc, l),
    };
  }
  if (status === "gagal") {
    return {
      subject: l === "en" ? `Rebate Validation ${brokerName} #${acc}: FAILED` : `Validasi Rebate ${brokerName} #${acc}: GAGAL`,
      text: failText(brokerName, acc, l),
    };
  }
  throw new Error("Status tidak valid");
}
