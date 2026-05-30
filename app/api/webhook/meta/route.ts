import { NextRequest, NextResponse } from "next/server";

// ═══════════════════════════════════════════════════════════════════════
// 📨 WEBHOOK Meta (WhatsApp Business API) — UnitaSystem → UnitaZAP
// ───────────────────────────────────────────────────────────────────────
// A Meta envia eventos do WABA (mensagens recebidas, status de entrega)
// pra essa URL. O Next.js só repassa pro UnitaZAP processar.
//
// GET: usado pela Meta pra verificar o webhook (hub.challenge).
// POST: notificações reais (mensagens, status).
// ═══════════════════════════════════════════════════════════════════════

const UNITAZAP_URL = process.env.NEXT_PUBLIC_UNITAZAP_URL || "http://localhost:3001";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const params = new URLSearchParams();
  searchParams.forEach((value, key) => params.append(key, value));
  const resp = await fetch(`${UNITAZAP_URL}/webhook/meta?${params}`);
  const text = await resp.text();
  return new NextResponse(text, { status: resp.status });
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  await fetch(`${UNITAZAP_URL}/webhook/meta`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  // Sempre retorna 200 pra Meta não retentar — o processamento real é assíncrono no UnitaZAP
  return new NextResponse(null, { status: 200 });
}