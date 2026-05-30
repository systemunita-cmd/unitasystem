import { NextRequest, NextResponse } from "next/server";

// ═══════════════════════════════════════════════════════════════════════
// 🐺 PROXY WhatsApp — UnitaSystem → UnitaZAP
// ───────────────────────────────────────────────────────────────────────
// Repassa requisições do frontend pro backend UnitaZAP (Node.js separado).
// Configure NEXT_PUBLIC_UNITAZAP_URL no .env.local apontando pro endereço
// do UnitaZAP (ex: http://localhost:3001 em dev ou https://api.seu-dominio
// em produção).
// ═══════════════════════════════════════════════════════════════════════

const UNITAZAP_URL = process.env.NEXT_PUBLIC_UNITAZAP_URL || "http://localhost:3001";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rota = searchParams.get("rota") || "status";
  const extraParams = new URLSearchParams();
  searchParams.forEach((v, k) => { if (k !== "rota") extraParams.set(k, v); });
  const queryStr = extraParams.toString();
  const url = `${UNITAZAP_URL}/${rota}${queryStr ? "?" + queryStr : ""}`;

  try {
    const resp = await fetch(url, {
      headers: { "ngrok-skip-browser-warning": "true" },
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
  const body = await req.json().catch(() => ({}));

  try {
    const resp = await fetch(`${UNITAZAP_URL}/${rota}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
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