// app/api/midia/route.ts
// 🖼️ Proxy de mídia do backend UnitaZAP.
//
// PROBLEMA QUE RESOLVE: as mídias do WhatsApp ficam em http(s)://2.25.187.204:3001
// (IP cru, certificado autoassinado). O navegador BLOQUEIA essas imagens/áudios
// quando carregadas inline (<img>/<audio>) numa página HTTPS — mesmo que abram
// direto numa aba. A solução é servir a mídia pelo PRÓPRIO domínio (que tem
// certificado válido): o navegador chama /api/midia?u=..., o Next busca do
// servidor (servidor→servidor, sem barreira de certificado) e devolve o arquivo.
//
// Uso no front: /api/midia?u=<URL-encodada-da-midia>

import { NextRequest, NextResponse } from "next/server";
import https from "https";
import http from "http";

export const runtime = "nodejs";        // precisa do Node (módulos http/https), não Edge
export const dynamic = "force-dynamic"; // nunca cachear no build

// Base permitida (só deixa proxiar o próprio backend, por segurança).
const BACKEND = process.env.NEXT_PUBLIC_UNITAZAP_URL || process.env.UNITAZAP_URL || "http://2.25.187.204:3001";

// Extrai o "host:porta" do backend pra validar a URL pedida.
function hostDoBackend(): string {
  try { return new URL(BACKEND).host; } catch { return "2.25.187.204:3001"; }
}

// Busca o arquivo (segue http ou https) ignorando certificado autoassinado.
function buscar(url: string): Promise<{ status: number; contentType: string; buffer: Buffer }> {
  return new Promise((resolve, reject) => {
    let u: URL;
    try { u = new URL(url); } catch { return reject(new Error("URL inválida")); }
    const lib = u.protocol === "https:" ? https : http;
    const opts: https.RequestOptions = {
      method: "GET",
      // ⚠️ ignora certificado autoassinado/ inválido (é o nosso próprio servidor)
      rejectUnauthorized: false,
      timeout: 20000,
    };
    const req = lib.get(url, opts, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(Buffer.from(c)));
      res.on("end", () => {
        resolve({
          status: res.statusCode || 200,
          contentType: res.headers["content-type"] || "application/octet-stream",
          buffer: Buffer.concat(chunks),
        });
      });
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
  });
}

export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get("u");
  if (!u) {
    return NextResponse.json({ error: "Faltou o parâmetro 'u'." }, { status: 400 });
  }

  // Segurança: só proxia URLs do próprio backend (não vira proxy aberto pra qualquer site).
  let alvo: URL;
  try { alvo = new URL(u); } catch { return NextResponse.json({ error: "URL inválida." }, { status: 400 }); }
  if (alvo.host !== hostDoBackend()) {
    return NextResponse.json({ error: "Host não permitido." }, { status: 403 });
  }

  try {
    const r = await buscar(u);
    if (r.status >= 400) {
      return NextResponse.json({ error: `Mídia não encontrada (${r.status}).` }, { status: r.status });
    }
    return new NextResponse(r.buffer, {
      status: 200,
      headers: {
        "Content-Type": r.contentType,
        // cacheia no navegador por 1 dia (a mídia não muda)
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: "Erro ao buscar mídia: " + (e?.message || "desconhecido") }, { status: 502 });
  }
}