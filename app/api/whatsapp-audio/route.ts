import { NextRequest, NextResponse } from "next/server";

// ═══════════════════════════════════════════════════════════════════════
// 🎤 PROXY de ÁUDIO — UnitaSystem → UnitaZAP
// ───────────────────────────────────────────────────────────────────────
// Recebe FormData (audio + numero + canalId) do frontend e repassa
// pro UnitaZAP. Single-tenant: NÃO precisa de workspaceId.
// ═══════════════════════════════════════════════════════════════════════

const UNITAZAP_URL = process.env.NEXT_PUBLIC_UNITAZAP_URL || "http://localhost:3001";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const audioBlob = formData.get("audio") as Blob | null;
    const numero = formData.get("numero") as string | null;
    const canalId = formData.get("canalId") as string | null;

    if (!audioBlob || !numero || !canalId) {
      return NextResponse.json(
        { success: false, error: "audio, numero e canalId são obrigatórios" },
        { status: 400 }
      );
    }

    const unitaForm = new FormData();
    unitaForm.append("audio", audioBlob, `audio_${Date.now()}.ogg`);
    unitaForm.append("numero", numero);
    unitaForm.append("canalId", canalId);

    const resp = await fetch(`${UNITAZAP_URL}/enviar-audio`, {
      method: "POST",
      body: unitaForm,
      headers: { "ngrok-skip-browser-warning": "true" },
    });

    const data = await resp.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Erro /api/whatsapp-audio:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Erro ao enviar áudio" },
      { status: 500 }
    );
  }
}