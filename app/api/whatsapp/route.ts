import { NextRequest, NextResponse } from "next/server";

// ═══════════════════════════════════════════════════════════════════════
// 🐺 PROXY WhatsApp — UnitaSystem → UnitaZAP
// ───────────────────────────────────────────────────────────────────────
// Repassa requisições do frontend pro backend UnitaZAP (Node.js separado).
// Configure NEXT_PUBLIC_UNITAZAP_URL no .env.local apontando pro endereço
// do UnitaZAP (ex: http://localhost:3001 em dev ou https://api.seu-dominio
// em produção).
// ═══════════════════════════════════════════════════════════════════════

// URL e token ficam em variáveis SERVER-SIDE (sem NEXT_PUBLIC_) — nunca chegam
// no navegador. Configure no Vercel: UNITAZAP_URL e UNITAZAP_SHARED_TOKEN.
const UNITAZAP_URL =
  process.env.UNITAZAP_URL ||
  process.env.NEXT_PUBLIC_UNITAZAP_URL ||
  "http://localhost:3001";
const UNITAZAP_TOKEN = process.env.UNITAZAP_SHARED_TOKEN || "";

// Headers padrão de toda chamada pro UnitaZAP (inclui o X-Unita-Token)
function headersBase(extra?: Record<string, string>) {
  const h: Record<string, string> = { "ngrok-skip-browser-warning": "true", ...extra };
  if (UNITAZAP_TOKEN) h["X-Unita-Token"] = UNITAZAP_TOKEN;
  return h;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rota = searchParams.get("rota") || "status";
  const extraParams = new URLSearchParams();
  searchParams.forEach((v, k) => { if (k !== "rota") extraParams.set(k, v); });
  const queryStr = extraParams.toString();
  const url = `${UNITAZAP_URL}/${rota}${queryStr ? "?" + queryStr : ""}`;

  try {
    const resp = await fetch(url, {
      headers: headersBase(),
      cache: "no-store",
    });
    const text = await resp.text();
    if (!resp.ok) {
      console.error(`[proxy GET] ${rota} → ${resp.status}:`, text.slice(0, 500));
      return NextResponse.json({ status: "erro", error: `UnitaZAP ${resp.status}: ${text.slice(0, 300)}` }, { status: 200 });
    }
    try {
      return NextResponse.json(JSON.parse(text));
    } catch {
      return NextResponse.json({ status: "erro", error: "UnitaZAP não-JSON: " + text.slice(0, 200) }, { status: 200 });
    }
  } catch (error: any) {
    console.error(`[proxy GET] ${rota} catch:`, error.message);
    return NextResponse.json({ status: "desconectado", error: "UnitaZAP offline: " + error.message }, { status: 200 });
  }
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rota = searchParams.get("rota") || "status";

  // 📎 UPLOAD (multipart/form-data: enviar-audio / enviar-midia) — repassa o
  // FormData inteiro pro UnitaZAP. NÃO setar Content-Type manualmente: o fetch
  // gera o boundary correto sozinho.
  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    try {
      const fd = await req.formData();
      const resp = await fetch(`${UNITAZAP_URL}/${rota}`, { method: "POST", headers: headersBase(), body: fd });
      const text = await resp.text();
      try { return NextResponse.json(JSON.parse(text)); }
      catch { return NextResponse.json({ success: false, error: "UnitaZAP não-JSON: " + text.slice(0, 200) }, { status: 200 }); }
    } catch (error: any) {
      console.error(`[proxy POST multipart] ${rota} catch:`, error.message);
      return NextResponse.json({ success: false, error: "UnitaZAP offline: " + error.message }, { status: 200 });
    }
  }

  const body = await req.json().catch(() => ({}));

  try {
    const resp = await fetch(`${UNITAZAP_URL}/${rota}`, {
      method: "POST",
      headers: headersBase({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });
    const text = await resp.text();
    if (!resp.ok) {
      console.error(`[proxy POST] ${rota} → ${resp.status}:`, text.slice(0, 500));
      return NextResponse.json({ success: false, error: `UnitaZAP ${resp.status}: ${text.slice(0, 300)}` }, { status: 200 });
    }
    try {
      return NextResponse.json(JSON.parse(text));
    } catch {
      return NextResponse.json({ success: false, error: "UnitaZAP não-JSON: " + text.slice(0, 200) }, { status: 200 });
    }
  } catch (error: any) {
    console.error(`[proxy POST] ${rota} catch:`, error.message);
    return NextResponse.json({ success: false, error: "UnitaZAP offline: " + error.message }, { status: 200 });
  }
}