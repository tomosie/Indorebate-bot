// Panggil model lewat endpoint yang kompatibel dengan OpenAI (/chat/completions).
// Bisa diarahkan ke 9Router (combo fallback), Gemini, atau penyedia lain lewat env.
//   CS_AI_BASE_URL, CS_AI_API_KEY, CS_AI_MODEL    -> penyedia utama
//   CS_AI2_BASE_URL, CS_AI2_API_KEY, CS_AI2_MODEL -> cadangan (opsional)

function providers() {
  const list = [];
  for (const p of ["CS_AI", "CS_AI2"]) {
    const base = process.env[`${p}_BASE_URL`];
    const key = process.env[`${p}_API_KEY`];
    const model = process.env[`${p}_MODEL`];
    if (base && key && model) list.push({ base: base.replace(/\/+$/, ""), key, model });
  }
  return list;
}

export async function askModel(system, history) {
  const ps = providers();
  if (!ps.length) throw new Error("CS_AI_BASE_URL / CS_AI_API_KEY / CS_AI_MODEL belum diset");
  let lastErr;
  for (const p of ps) {
    try {
      const r = await fetch(`${p.base}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${p.key}` },
        body: JSON.stringify({
          model: p.model,
          messages: [{ role: "system", content: system }, ...history],
          max_tokens: 600,
          temperature: 0.3,
        }),
        signal: AbortSignal.timeout(12000),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(`${r.status} ${data?.error?.message || ""}`.trim());
      const text = data?.choices?.[0]?.message?.content;
      if (!text || !String(text).trim()) throw new Error("jawaban kosong");
      return String(text).trim();
    } catch (e) {
      lastErr = e;
      console.error("CS AI gagal:", p.model, e.message);
    }
  }
  throw lastErr;
}
