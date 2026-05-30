// app/api/whatsapp-midia/route.ts
// Proxy de upload de mídia (arquivos multipart) — UnitaSystem → UnitaZAP.
// Encaminha o FormData inteiro sem modificar.

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
// Upload de arquivo até 25MB — aumenta o limite padrão do Next.js
export const maxDuration = 60;

const UNITAZAP_URL = process.env.NEXT_PUBLIC_UNITAZAP_URL || "http://localhost:3001";

export async function POST(req: NextRequest) {
  try {
    // Recebe o FormData do cliente e encaminha pro UnitaZAP sem modificar
    const formData = await req.formData();

    const resp = await fetch(`${UNITAZAP_URL}/enviar-midia`, {
      method: "POST",
      body: formData,
      // Não setar Content-Type manualmente — o fetch define o boundary automaticamente
    });

    const data = await resp.json();
    return NextResponse.json(data, { status: resp.status });
  } catch (error: any) {
    console.error("Erro proxy /api/whatsapp-midia:", error.message);
    return NextResponse.json(
      { success: false, error: "Proxy: " + error.message },
      { status: 500 }
    );
  }
}