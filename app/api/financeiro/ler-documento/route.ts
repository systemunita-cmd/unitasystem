import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

async function autorizar(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !supabaseUrl || !supabaseAnon) return { erro: NextResponse.json({ error: "Não autorizado." }, { status: 401 }) };
  const cliente = createClient(supabaseUrl, supabaseAnon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const [{ data: usuario, error: authError }, { data: permitido }] = await Promise.all([
    cliente.auth.getUser(token), cliente.rpc("usuario_pode_acessar_financeiro"),
  ]);
  if (authError || !usuario.user || !permitido) return { erro: NextResponse.json({ error: "Acesso financeiro não autorizado." }, { status: 403 }) };
  return { usuario: usuario.user };
}

export async function GET(req: NextRequest) {
  const auth = await autorizar(req);
  if (auth.erro) return auth.erro;
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_FINANCE_MODEL || "gpt-5.6-sol";
  if (!apiKey) return NextResponse.json({ configurada: false, modelo: model, status: "sem_chave" }, { status: 503 });
  try {
    const resposta = await fetch(`https://api.openai.com/v1/models/${encodeURIComponent(model)}`, { headers: { Authorization: `Bearer ${apiKey}` }, cache: "no-store" });
    const json = await resposta.json();
    if (!resposta.ok) return NextResponse.json({ configurada: true, modelo: model, status: "erro", error: json?.error?.message || "A chave existe, mas o modelo não pôde ser validado." }, { status: 502 });
    return NextResponse.json({ configurada: true, modelo: json.id || model, status: "operacional" });
  } catch {
    return NextResponse.json({ configurada: true, modelo: model, status: "indisponivel", error: "Não foi possível alcançar a API da OpenAI." }, { status: 502 });
  }
}
export async function POST(req: NextRequest) {
  const auth = await autorizar(req);
  if (auth.erro) return auth.erro;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY não configurada no servidor." }, { status: 503 });
  }
  const form = await req.formData();
  const arquivo = form.get("arquivo");
  if (!(arquivo instanceof File)) return NextResponse.json({ error: "Arquivo ausente." }, { status: 400 });
  if (arquivo.size > 10 * 1024 * 1024) return NextResponse.json({ error: "Arquivo maior que 10 MB." }, { status: 400 });

  const base64 = Buffer.from(await arquivo.arrayBuffer()).toString("base64");
  const mime = arquivo.type || "application/octet-stream";
  const conteudo = mime === "application/pdf"
    ? { type: "input_file", filename: arquivo.name, file_data: `data:${mime};base64,${base64}` }
    : { type: "input_image", image_url: `data:${mime};base64,${base64}`, detail: "high" };

  const resposta = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_FINANCE_MODEL || "gpt-5.6-sol",
      store: false,
      input: [{
        role: "user",
        content: [
          conteudo,
          { type: "input_text", text: "Extraia os dados financeiros deste boleto, nota fiscal ou comprovante. Não invente valores ausentes." },
        ],
      }],
      text: {
        format: {
          type: "json_schema",
          name: "documento_financeiro",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              tipo_documento: { type: ["string", "null"] },
              fornecedor: { type: ["string", "null"] },
              documento: { type: ["string", "null"] },
              valor: { type: ["number", "null"] },
              emissao: { type: ["string", "null"] },
              vencimento: { type: ["string", "null"] },
              categoria_sugerida: { type: ["string", "null"] },
              descricao: { type: ["string", "null"] },
              confianca: { type: "number", minimum: 0, maximum: 1 },
            },
            required: ["tipo_documento","fornecedor","documento","valor","emissao","vencimento","categoria_sugerida","descricao","confianca"],
          },
        },
      },
    }),
  });
  const json = await resposta.json();
  if (!resposta.ok) return NextResponse.json({ error: json?.error?.message || "Falha na leitura por IA." }, { status: resposta.status });
  const texto = json.output?.flatMap((x: any) => x.content || []).find((x: any) => x.type === "output_text")?.text;
  try {
    return NextResponse.json({ dados: JSON.parse(texto) });
  } catch {
    return NextResponse.json({ error: "A IA não devolveu dados estruturados válidos." }, { status: 502 });
  }
}
