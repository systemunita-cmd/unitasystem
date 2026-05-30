"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { usePermissao } from "../../hooks/usePermissao";
import { useTemPermissao } from "../../hooks/useTemPermissao";

const UNITAZAP_URL = process.env.NEXT_PUBLIC_UNITAZAP_URL || "http://localhost:3001";

type Canal = { id: number; nome: string; tipo: string; waba_id: string; };
type Template = {
  id: number;
  meta_template_id: string; meta_template_name: string; nome_amigavel: string;
  categoria: string; idioma: string; status: string;
  componentes: any[]; motivo_rejeicao?: string;
  criado_por: string; ultima_sincronizacao?: string; enviado_meta_em?: string;
  aprovado_em?: string; created_at: string;
};

const CATEGORIAS = [
  { v: "MARKETING", l: "📢 Marketing", d: "Promoções, novidades, ofertas" },
  { v: "UTILITY", l: "🔧 Utility", d: "Confirmações, avisos de pedido, suporte" },
  { v: "AUTHENTICATION", l: "🔒 Authentication", d: "Códigos OTP, verificação 2FA" }
];
const IDIOMAS = [
  { v: "pt_BR", l: "🇧🇷 Português (Brasil)" },
  { v: "en_US", l: "🇺🇸 Inglês (EUA)" },
  { v: "es_ES", l: "🇪🇸 Espanhol" }
];
const STATUS_COLORS: Record<string, string> = {
  rascunho: "#6b7280", pendente: "#f59e0b", aprovado: "#16a34a",
  rejeitado: "#dc2626", pausado: "#f59e0b", desativado: "#6b7280",
  em_recurso: "#2563eb", deletando: "#6b7280", deletado: "#6b7280"
};
const STATUS_LABELS: Record<string, string> = {
  rascunho: "📝 Rascunho", pendente: "⏳ Pendente", aprovado: "✅ Aprovado",
  rejeitado: "❌ Rejeitado", pausado: "⏸️ Pausado", desativado: "🚫 Desativado",
  em_recurso: "🔄 Em recurso", deletando: "🗑️ Deletando", deletado: "🗑️ Deletado"
};

// 🆕 Traduz motivos de rejeição da Meta (vêm em inglês via API) pra português.
// Quando o template é APROVADO, a Meta retorna "NONE" no campo rejected_reason — ou seja,
// "não houve motivo de rejeição". Antes esse "NONE" aparecia como se fosse um motivo real
// poluindo todos os cards aprovados. Agora retorna null nesse caso e o componente esconde.
const traduzirMotivoRejeicao = (motivo: string | null | undefined): string | null => {
  if (!motivo) return null;
  const m = String(motivo).trim().toUpperCase();
  // "NONE" / "NULL" / vazio = template aprovado, não há motivo de rejeição → não exibe
  if (m === "NONE" || m === "" || m === "NULL") return null;

  const traducoes: Record<string, string> = {
    "INVALID_FORMAT":           "Formato inválido (variáveis ou estrutura erradas)",
    "ABUSIVE_CONTENT":          "Conteúdo abusivo ou ofensivo",
    "INCORRECT_CATEGORY":       "Categoria incorreta — solicite reclassificação à Meta",
    "TAG_CONTENT_MISMATCH":     "Conteúdo não combina com a categoria escolhida",
    "SCAM":                     "Conteúdo suspeito de golpe/fraude",
    "PROMOTIONAL":              "Promocional na categoria errada — use MARKETING",
    "NON_TRANSACTIONAL_GAMBLING_CONTENT": "Conteúdo de apostas não permitido",
    "TAX_FINANCIAL_STOCKS_CRYPTOCURRENCY": "Conteúdo financeiro/cripto restrito",
    "TEMPLATE_REVIEW_FAILED":   "Template reprovado na revisão da Meta",
    "PAUSED":                   "Template pausado por baixa performance ou bloqueios de usuários",
    "DISABLED":                 "Template desativado pela Meta"};
  return traducoes[m] || `Motivo: ${motivo}`; // motivo desconhecido → mostra o código original
};

export default function TemplatesPage() {
  const router = useRouter();
  // useWorkspace removido (Unita single-tenant)
  const workspace = null as any;
  const wsId: string | null = null;
  const [user, setUser] = useState<{ email: string; id?: string; nome?: string } | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!alive || !data.user) return;
      let nome = data.user.email?.split("@")[0] || "";
      try {
        const { data: u } = await supabase.from("usuarios").select("nome").eq("auth_user_id", data.user.id).maybeSingle();
        if (u?.nome) nome = u.nome;
      } catch {}
      setUser({ email: data.user.email || "", id: data.user.id, nome });
    })();
    return () => { alive = false; };
  }, []);
  const { isDono, permissoes } = usePermissao();
  // 🛡️ Sistema novo
  const perm = useTemPermissao();
  const novoPodeVer        = perm.tem("templates.ver");
  const novoPodeCriar      = perm.tem("templates.criar");
  const novoPodeSincronizar = perm.tem("templates.sincronizar");

  const [canais, setCanais] = useState<Canal[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [detalhe, setDetalhe] = useState<Template | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  // 🆕 Filtro de canal — ids dos canais marcados pra exibição (vazio = mostra todos)
  const [canaisSelecionados, setCanaisSelecionados] = useState<number[]>([]);

  // 💬 Modal visual de feedback (substitui alert() nativo)
  //    tipo: erro = vermelho, aviso = amarelo, sucesso = verde, info = azul
  const [feedback, setFeedback] = useState<{
    tipo: "erro" | "aviso" | "sucesso" | "info";
    titulo: string;
    mensagem: string;
    detalhes?: string[];      // bullets opcionais (lista de problemas, dicas, etc.)
    onConfirmar?: () => void; // se setado, vira modal de confirmação (mostra Cancelar + Continuar)
    confirmarLabel?: string;  // texto do botão de continuar (default "Enviar mesmo assim")
  } | null>(null);

  const podeAcessar = isDono || perm.superAdmin || novoPodeVer || novoPodeCriar;

  const formInicial = {
    canalId: "",
    nomeAmigavel: "",
    metaTemplateName: "",
    categoria: "MARKETING",
    idioma: "pt_BR",
    headerTipo: "none" as "none" | "text" | "image" | "video" | "document",
    headerTexto: "",
    headerUrl: "",
    body: "",
    footer: "",
    botoes: [] as { type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER"; text: string; url?: string; phone_number?: string }[]
  };
  const [form, setForm] = useState(formInicial);

  const wa = async (rota: string, body?: object) => {
    if (body !== undefined) {
      const resp = await fetch(`/api/whatsapp?rota=${rota}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      return resp.json();
    }
    const resp = await fetch(`/api/whatsapp?rota=${rota}`);
    return resp.json();
  };

  const fetchCanais = async () => {
    if (!wsId) return;
    const { data } = await supabase.from("conexoes").select("id, nome, tipo, waba_id").eq("tipo", "waba");
    setCanais(data || []);
  };

  const fetchTemplates = async () => {
    if (!wsId) return;
    const { data } = await supabase.from("templates_waba").select("*").order("created_at", { ascending: false });
    setTemplates(data || []);
  };

  useEffect(() => {
    if (!wsId) return;
    fetchCanais();
    fetchTemplates();

    // Realtime no Supabase
    const ch = supabase.channel("templates_rt_" + wsId)
      .on("postgres_changes", { event: "*", schema: "public", table: "templates_waba"}, () => fetchTemplates())
      .subscribe();

    // Polling 30s (UI)
    const interval = setInterval(fetchTemplates, 30000);

    return () => { supabase.removeChannel(ch); clearInterval(interval); };
  }, [wsId]);

  // Monta o array de componentes no formato da Meta
  const montarComponentes = () => {
    const comps: any[] = [];
    if (form.headerTipo === "text" && form.headerTexto) {
      comps.push({ type: "HEADER", format: "TEXT", text: form.headerTexto });
    } else if (["image", "video", "document"].includes(form.headerTipo) && form.headerUrl) {
      comps.push({ type: "HEADER", format: form.headerTipo.toUpperCase(), example: { header_handle: [form.headerUrl] } });
    }
    if (form.body) comps.push({ type: "BODY", text: form.body });
    if (form.footer) comps.push({ type: "FOOTER", text: form.footer });
    if (form.botoes.length > 0) {
      comps.push({
        type: "BUTTONS",
        buttons: form.botoes.map(b => {
          if (b.type === "QUICK_REPLY") return { type: "QUICK_REPLY", text: b.text };
          if (b.type === "URL") return { type: "URL", text: b.text, url: b.url };
          if (b.type === "PHONE_NUMBER") return { type: "PHONE_NUMBER", text: b.text, phone_number: b.phone_number };
          return b;
        })
      });
    }
    return comps;
  };

  // 🧼 Limpa mensagem de erro técnica antes de mostrar pro usuário.
  // Remove "VPS 500:", "Erro:", "Meta:", JSON malformado, códigos entre parênteses, fbtrace.
  // Se receber JSON stringificado, faz parse e pega só o campo .error.
  const limparMensagemErro = (raw: string): string => {
    if (!raw) return "Erro desconhecido. Tente novamente.";
    let msg = String(raw);
    // 1) Se for JSON stringificado (ex: VPS 500 manda body inteiro), tenta parsear
    const matchJson = msg.match(/\{.*"error".*\}/);
    if (matchJson) {
      try {
        const obj = JSON.parse(matchJson[0]);
        if (obj.error) msg = String(obj.error);
      } catch { /* mantém raw */ }
    }
    // 2) Remove prefixos técnicos
    msg = msg
      .replace(/^VPS\s*\d+\s*:\s*/i, "")
      .replace(/^Erro de rede:\s*/i, "")
      .replace(/^Erro:\s*/i, "")
      .replace(/^Meta:\s*/i, "");
    // 3) Remove sufixos de código (code 100, subcode 2388072, fbtrace ABC123)
    msg = msg
      .replace(/\s*\(code\s*\d+(\s*\(subcode\s*\d+\))?\)\s*/gi, "")
      .replace(/\s*\[fbtrace[^\]]+\]\s*/gi, "")
      .replace(/\s*\(subcode\s*\d+\)\s*/gi, "")
      .trim();
    return msg || "Erro desconhecido. Tente novamente.";
  };

  const enviarParaMeta = async () => {
    if (!form.canalId)
      return setFeedback({ tipo: "aviso", titulo: "Canal não selecionado", mensagem: "Escolha um canal WhatsApp Business (WABA) antes de criar o template." });
    if (!form.metaTemplateName.trim())
      return setFeedback({ tipo: "aviso", titulo: "Nome do template vazio", mensagem: "Digite um nome técnico em snake_case (ex: boas_vindas_cliente)." });
    if (!form.body.trim())
      return setFeedback({ tipo: "aviso", titulo: "Corpo da mensagem vazio", mensagem: "O corpo (BODY) da mensagem é obrigatório." });
    if (!/^[a-z0-9_]+$/.test(form.metaTemplateName))
      return setFeedback({ tipo: "aviso", titulo: "Nome inválido", mensagem: "O nome técnico deve ter apenas letras minúsculas, números e _ (underline).", detalhes: ["Exemplo correto: boas_vindas_cliente", "Sem espaço, sem acento, sem maiúscula."] });

    // 🛡️ PRÉ-VALIDADOR — detecta antes de gastar chamada com a Meta.
    const problemas: string[] = [];
    const textoTudo = `${form.headerTexto || ""} ${form.body || ""} ${form.footer || ""}`.toLowerCase();

    // HEADER de texto: Meta proíbe quebra de linha, emoji, asterisco, formatação
    if (form.headerTipo === "text" && form.headerTexto) {
      const headerProblemas: string[] = [];
      if (/\n|\r/.test(form.headerTexto)) headerProblemas.push("quebra de linha");
      // Emoji: range Unicode emoji
      if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}\u{1F100}-\u{1F1FF}\u{1F200}-\u{1F2FF}]/u.test(form.headerTexto)) headerProblemas.push("emoji");
      if (/\*/.test(form.headerTexto)) headerProblemas.push("asterisco (*)");
      if (/_(?!_)/.test(form.headerTexto)) headerProblemas.push("underline (_)");
      if (/~/.test(form.headerTexto)) headerProblemas.push("til (~)");
      if (form.headerTexto.length > 60) headerProblemas.push(`tem ${form.headerTexto.length} caracteres (máximo 60)`);
      if (headerProblemas.length > 0) {
        problemas.push(`Header tem: ${headerProblemas.join(", ")}. Header de texto só aceita texto simples.`);
      }
    }

    // Marcas registradas
    const marcas = ["claro", "vivo", "tim", "oi telecom", "nextel", "algar", "sky", "nubank", "itaú", "itau", "bradesco", "santander", "caixa econômica", "banco do brasil", "mercado livre", "mercado pago", "magalu", "magazine luiza", "americanas", "ifood", "uber", "99", "amazon", "shopee", "aliexpress", "netflix", "spotify", "disney", "globo", "sbt", "record", "whatsapp", "instagram", "facebook", "meta", "google", "apple", "microsoft"];
    const marcasEncontradas = marcas.filter(m => textoTudo.includes(m));
    if (marcasEncontradas.length > 0) {
      problemas.push(`Marcas registradas detectadas (${marcasEncontradas.join(", ")}). A Meta rejeita templates que mencionam marcas de terceiros sem autorização.`);
    }

    // UTILITY com palavras promocionais
    if (form.categoria === "UTILITY") {
      const palavrasPromo = ["promoção", "promocao", "promoções", "promocoes", "oferta", "desconto", "cupom", "black friday", "imperdível", "imperdivel", "exclusiva", "exclusivo", "upgrade", "novidade", "lançamento", "lancamento", "venda", "compre", "aproveite", "garanta"];
      const promoEncontradas = palavrasPromo.filter(p => textoTudo.includes(p));
      if (promoEncontradas.length > 0) {
        problemas.push(`Palavras promocionais (${promoEncontradas.join(", ")}) em template UTILITY. Use a categoria MARKETING para conteúdo promocional.`);
      }
    }

    // Variáveis
    const varsMatch = form.body.match(/\{\{[^}]*\}\}/g) || [];
    const varsRuins = varsMatch.filter((v: string) => !/^\{\{[1-9]\d?\}\}$/.test(v));
    if (varsRuins.length > 0) {
      problemas.push(`Variáveis com formato errado: ${varsRuins.join(", ")}. Use {{1}}, {{2}}, {{3}} (numeradas, começando em 1).`);
    }
    const numsRaw: number[] = varsMatch
      .map((v: string) => parseInt(v.replace(/[^0-9]/g, ""), 10))
      .filter((n: number) => !isNaN(n));
    const numsUsados: number[] = Array.from(new Set<number>(numsRaw)).sort((a, b) => a - b);
    if (numsUsados.length > 0) {
      const esperado = numsUsados.map((_, i) => i + 1);
      if (JSON.stringify(numsUsados) !== JSON.stringify(esperado)) {
        problemas.push(`Variáveis não-sequenciais: ${numsUsados.join(", ")}. Use {{1}}, {{2}}, {{3}}... sem pular números.`);
      }
    }

    // Se tem problemas, mostra modal de confirmação
    if (problemas.length > 0) {
      setFeedback({
        tipo: "aviso",
        titulo: "Possíveis problemas detectados",
        mensagem: "Encontrei coisas que a Meta costuma rejeitar. Você pode tentar mesmo assim, mas tem grande chance de ser recusado.",
        detalhes: problemas,
        confirmarLabel: "Enviar mesmo assim",
        onConfirmar: () => { setFeedback(null); enviarParaMetaSemValidar(); }});
      return;
    }

    enviarParaMetaSemValidar();
  };

  // Envia direto sem revalidar (chamado pelo enviarParaMeta após validação ou após user confirmar mesmo com avisos)
  const enviarParaMetaSemValidar = async () => {
    setEnviando(true);
    try {
      const resp = await wa("templates/criar", {
        canalId: parseInt(form.canalId),
        nomeAmigavel: form.nomeAmigavel || form.metaTemplateName,
        metaTemplateName: form.metaTemplateName,
        categoria: form.categoria,
        idioma: form.idioma,
        componentes: montarComponentes(),
        criadoPor: user?.email
      });

      if (resp.success) {
        setShowModal(false);
        setForm(formInicial);
        fetchTemplates();
        setFeedback({
          tipo: "sucesso",
          titulo: "Template enviado!",
          mensagem: "Sua solicitação foi enviada para a Meta. A aprovação costuma sair entre 15 e 60 minutos."});
      } else {
        setFeedback({
          tipo: "erro",
          titulo: "Template não foi aceito",
          mensagem: limparMensagemErro(resp.error || "")});
      }
    } catch (e: any) {
      setFeedback({
        tipo: "erro",
        titulo: "Não foi possível conectar",
        mensagem: limparMensagemErro(e?.message || "Verifique sua conexão e tente novamente.")});
    }
    setEnviando(false);
  };

  const deletarTemplate = async (t: Template) => {
    setFeedback({
      tipo: "aviso",
      titulo: "Deletar template?",
      mensagem: `O template "${t.nome_amigavel || t.meta_template_name}" será removido do sistema e também da Meta. Essa ação não pode ser desfeita.`,
      confirmarLabel: "Sim, deletar",
      onConfirmar: async () => {
        setFeedback(null);
        try {
          const resp = await wa("templates/deletar", { templateId: t.id});
          if (resp.success) {
            fetchTemplates();
            setFeedback({ tipo: "sucesso", titulo: "Template deletado", mensagem: "Foi removido do sistema e da Meta." });
          } else {
            setFeedback({ tipo: "erro", titulo: "Não foi possível deletar", mensagem: limparMensagemErro(resp.error || "") });
          }
        } catch (e: any) {
          setFeedback({ tipo: "erro", titulo: "Não foi possível deletar", mensagem: limparMensagemErro(e?.message || "") });
        }
      }});
  };

  const sincronizarAgora = async () => {
    setSincronizando(true);
    try {
      if (canais.length === 0) {
        setFeedback({ tipo: "aviso", titulo: "Nenhum canal WABA conectado", mensagem: "Conecte um canal WhatsApp Business na tela de Conexões antes de sincronizar templates." });
        setSincronizando(false);
        return;
      }

      // 🆕 Templates pertencem ao WABA, não ao canal. Se você tem 2 canais com o mesmo
      // waba_id, eles compartilham os mesmos templates. Agrupa por waba_id pra evitar
      // chamar a mesma sincronização 2 vezes (e dá feedback claro por WABA).
      const porWaba = new Map<string, Canal[]>();
      const semWaba: Canal[] = [];
      canais.forEach(c => {
        if (!c.waba_id) { semWaba.push(c); return; }
        const arr = porWaba.get(c.waba_id) || [];
        arr.push(c);
        porWaba.set(c.waba_id, arr);
      });

      const resultados: string[] = [];
      let teveErro = false;

      for (const [wabaId, canaisDoWaba] of porWaba) {
        // Usa o primeiro canal do WABA como "porta de entrada"
        const canalPrincipal = canaisDoWaba[0];
        const compartilhados = canaisDoWaba.length > 1
          ? ` (compartilha com ${canaisDoWaba.slice(1).map(c => c.nome).join(", ")})`
          : "";
        try {
          const resp: any = await wa("templates/sincronizar", { canalId: canalPrincipal.id});
          const ok = resp?.success || resp?.sucesso;
          const count = resp?.count ?? resp?.total ?? resp?.templates?.length ?? "?";
          if (ok === false || resp?.error || resp?.erro) {
            resultados.push(`${canalPrincipal.nome}: ${limparMensagemErro(resp?.error || resp?.erro || "erro desconhecido")}`);
            teveErro = true;
          } else {
            resultados.push(`${canalPrincipal.nome}${compartilhados}: ${count} templates da Meta`);
          }
        } catch (e: any) {
          resultados.push(`${canalPrincipal.nome}: ${limparMensagemErro(e?.message || "falha de rede")}`);
          teveErro = true;
        }
      }

      if (semWaba.length > 0) {
        resultados.push(`${semWaba.length} canal(is) sem WABA ID: ${semWaba.map(c => c.nome).join(", ")}`);
      }

      await fetchTemplates();
      setFeedback({
        tipo: teveErro ? "aviso" : "sucesso",
        titulo: teveErro ? "Sincronização finalizada com avisos" : "Sincronização concluída",
        mensagem: `Total no banco: ${templates.length} template(s).`,
        detalhes: resultados});
    } catch (e: any) {
      setFeedback({ tipo: "erro", titulo: "Não foi possível sincronizar", mensagem: limparMensagemErro(e?.message || "") });
    }
    setSincronizando(false);
  };

  const adicionarBotao = () => {
    if (form.botoes.length >= 3) {
      setFeedback({ tipo: "aviso", titulo: "Limite de botões", mensagem: "Um template pode ter no máximo 3 botões." });
      return;
    }
    setForm(p => ({ ...p, botoes: [...p.botoes, { type: "QUICK_REPLY", text: "" }] }));
  };
  const removerBotao = (i: number) => setForm(p => ({ ...p, botoes: p.botoes.filter((_, idx) => idx !== i) }));
  const atualizarBotao = (i: number, campo: string, valor: string) => {
    setForm(p => ({ ...p, botoes: p.botoes.map((b, idx) => idx === i ? { ...b, [campo]: valor } : b) }));
  };

  // 🆕 Filtro de canal — helpers
  const toggleCanalFiltro = (id: number) => {
    setCanaisSelecionados(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  const contarTemplatesCanal = (id: number) => templates.filter(t => t.canal_id === id).length;

  // 🎨 ESTILOS LIGHT TECH
  const IS = { width: "100%", background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 14px", color: "#1f2937", fontSize: 13, boxSizing: "border-box" as const, outline: "none", transition: "border-color 0.15s, box-shadow 0.15s" };
  const cardStyle = {
    background: "#ffffff",
    borderRadius: 14,
    border: "1px solid #e5e7eb",
    boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)"};

  if (!podeAcessar) {
    return (
      <div style={{ padding: 32, minHeight: "100vh", background: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ ...cardStyle, padding: 48, textAlign: "center", maxWidth: 480 }}>
          <div style={{
            width: 80, height: 80, borderRadius: 20,
            background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 40, margin: "0 auto 16px",
            boxShadow: "0 12px 24px rgba(239,68,68,0.25)"}}>
            <span style={{ filter: "saturate(0) brightness(2)" }}>🔒</span>
          </div>
          <h1 style={{ color: "#1f2937", fontSize: 20, fontWeight: 700, margin: "0 0 8px" }}>Acesso Restrito</h1>
          <p style={{ color: "#6b7280", fontSize: 13, margin: 0 }}>Apenas o dono do workspace pode gerenciar templates.</p>
        </div>
      </div>
    );
  }

  // Contagem de variáveis detectadas no body
  const varsBody = (form.body.match(/\{\{\d+\}\}/g) || []).length;

  // 🆕 Templates exibidos conforme os canais marcados no filtro (vazio = todos)
  const templatesFiltrados = canaisSelecionados.length === 0
    ? templates
    : templates.filter(t => canaisSelecionados.includes(t.canal_id));

  return (
    <div style={{ padding: 32, display: "flex", flexDirection: "column", gap: 24, background: "#f8fafc", minHeight: "100vh" }}>

      {/* ═══ HEADER ═══ */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <button onClick={() => router.push("/chatbot")}
          style={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "9px 14px", color: "#4b5563", fontSize: 12, cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
          ← Voltar
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flex: 1, minWidth: 280 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14,
            background: "linear-gradient(135deg, #2563eb 0%, #6366f1 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 24, boxShadow: "0 8px 20px rgba(37,99,235,0.25)"}}>
            <span style={{ filter: "saturate(0) brightness(2)" }}>📨</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ color: "#1f2937", fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: -0.3 }}>Templates WABA</h1>
            <p style={{ color: "#6b7280", fontSize: 13, margin: "2px 0 0", lineHeight: 1.5 }}>
              Cadastre templates e envie pra aprovação da Meta. Aprovados podem ser usados em disparos.
            </p>
          </div>
        </div>
        <button onClick={sincronizarAgora} disabled={sincronizando}
          style={{ background: "#eff6ff", color: "#2563eb", border: "1px solid #bfdbfe", borderRadius: 10, padding: "10px 18px", fontSize: 13, cursor: sincronizando ? "wait" : "pointer", fontWeight: 700 }}>
          {sincronizando ? "⏳ Sincronizando..." : "🔄 Sincronizar agora"}
        </button>
        <button onClick={() => { setForm({ ...formInicial, canalId: canaisSelecionados.length === 1 ? String(canaisSelecionados[0]) : "" }); setShowModal(true); }}
          style={{
            background: "linear-gradient(135deg, #16a34a 0%, #22c55e 100%)",
            color: "white", border: "none", borderRadius: 12,
            padding: "12px 22px", fontSize: 13, cursor: "pointer", fontWeight: 700,
            boxShadow: "0 4px 12px rgba(22,163,74,0.3)"}}>
          + Novo Template
        </button>
      </div>

      {/* ═══ INFO ═══ */}
      <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderLeft: "4px solid #2563eb", borderRadius: 12, padding: "14px 18px" }}>
        <p style={{ color: "#1e40af", fontSize: 12, margin: 0, lineHeight: 1.6 }}>
          <b>ℹ️ Como funciona:</b> Você cadastra aqui, o sistema envia pra Meta revisar.
          A Meta leva em média 15 a 60 minutos pra aprovar (pode levar até 24h).
          O sistema verifica o status a cada 30 minutos automaticamente.
          Você recebe notificação quando for aprovado ou rejeitado.
        </p>
      </div>

      {/* ═══ AVISO SEM CANAL ═══ */}
      {canais.length === 0 && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderLeft: "4px solid #dc2626", borderRadius: 12, padding: "14px 18px" }}>
          <p style={{ color: "#991b1b", fontSize: 13, margin: 0, fontWeight: 600 }}>
            ⚠️ Nenhum canal WABA conectado. Conecte um canal WABA em <b>Conexões</b> antes de criar templates.
          </p>
        </div>
      )}

      {/* ═══ 🆕 FILTRO DE CANAL ═══ */}
      {canais.length > 1 && (
        <div style={{ ...cardStyle, padding: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
            <span style={{ color: "#6b7280", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>📡 Filtrar por canal</span>
            {canaisSelecionados.length > 0 && (
              <span style={{ color: "#2563eb", fontSize: 11, fontWeight: 600 }}>
                · mostrando {templatesFiltrados.length} de {templates.length} template(s)
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {/* Todos */}
            <button onClick={() => setCanaisSelecionados([])}
              style={{
                background: canaisSelecionados.length === 0 ? "#2563eb15" : "#f9fafb",
                color: canaisSelecionados.length === 0 ? "#2563eb" : "#6b7280",
                border: `1px solid ${canaisSelecionados.length === 0 ? "#2563eb50" : "#e5e7eb"}`,
                borderRadius: 10, padding: "8px 16px", fontSize: 12,
                fontWeight: canaisSelecionados.length === 0 ? 700 : 600, cursor: "pointer",
                display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
                transition: "all 0.15s",
                boxShadow: canaisSelecionados.length === 0 ? "0 2px 8px #2563eb25" : "none"}}>
              📡 Todos ({templates.length})
            </button>
            {/* Um por canal */}
            {canais.map(c => {
              const ativo = canaisSelecionados.includes(c.id);
              const n = contarTemplatesCanal(c.id);
              return (
                <button key={c.id} onClick={() => toggleCanalFiltro(c.id)}
                  style={{
                    background: ativo ? "#16a34a15" : "#f9fafb",
                    color: ativo ? "#16a34a" : "#6b7280",
                    border: `1px solid ${ativo ? "#16a34a50" : "#e5e7eb"}`,
                    borderRadius: 10, padding: "8px 16px", fontSize: 12,
                    fontWeight: ativo ? 700 : 600, cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
                    transition: "all 0.15s",
                    boxShadow: ativo ? "0 2px 8px #16a34a25" : "none"}}>
                  {ativo ? "✅" : "📱"} {c.nome} ({n})
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══ LISTA DE TEMPLATES ═══ */}
      <div style={{ ...cardStyle, padding: 24 }}>
        <h2 style={{ color: "#1f2937", fontSize: 15, fontWeight: 700, margin: "0 0 18px" }}>
          📋 Meus Templates ({canaisSelecionados.length === 0 ? templates.length : `${templatesFiltrados.length} de ${templates.length}`})
        </h2>
        {templates.length === 0 ? (
          <div style={{ textAlign: "center", padding: 32 }}>
            <p style={{ fontSize: 40, margin: "0 0 10px" }}>📭</p>
            <p style={{ color: "#9ca3af", fontSize: 13 }}>
              Nenhum template cadastrado ainda. Clique em <b>+ Novo Template</b> pra começar.
            </p>
          </div>
        ) : templatesFiltrados.length === 0 ? (
          <div style={{ textAlign: "center", padding: 32 }}>
            <p style={{ fontSize: 40, margin: "0 0 10px" }}>🔍</p>
            <p style={{ color: "#9ca3af", fontSize: 13, margin: "0 0 14px" }}>
              Nenhum template nos canais selecionados.
            </p>
            <button onClick={() => setCanaisSelecionados([])}
              style={{ background: "#eff6ff", color: "#2563eb", border: "1px solid #bfdbfe", borderRadius: 10, padding: "8px 18px", fontSize: 12, cursor: "pointer", fontWeight: 700 }}>
              📡 Ver todos os canais
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {templatesFiltrados.map(t => {
              const canal = canais.find(c => c.id === t.canal_id);
              const color = STATUS_COLORS[t.status] || "#6b7280";
              const bodyComp = (t.componentes || []).find((c: any) => c.type === "BODY");
              const bodyPreview = bodyComp?.text ? (bodyComp.text.length > 120 ? bodyComp.text.slice(0, 120) + "..." : bodyComp.text) : "";
              // 🆕 Traduz motivo da rejeição (retorna null pra "NONE"/""/null → não exibe nada)
              const motivoTraduzido = traduzirMotivoRejeicao(t.motivo_rejeicao);
              return (
                <div key={t.id}
                  style={{
                    background: "#ffffff", borderRadius: 12, padding: 18,
                    border: "1px solid #e5e7eb",
                    borderLeft: `4px solid ${color}`,
                    transition: "all 0.15s"}}
                  onMouseEnter={(e) => { e.currentTarget.style.boxShadow = `0 4px 12px ${color}15`; }}
                  onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "none"; }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12, gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ color: "#1f2937", fontSize: 14, fontWeight: 700, margin: 0 }}>
                        {t.nome_amigavel || t.meta_template_name}
                      </p>
                      <p style={{ color: "#6b7280", fontSize: 11, margin: "4px 0 0", fontFamily: "monospace" }}>
                        {t.meta_template_name} · {t.idioma} · {t.categoria}
                      </p>
                      <p style={{ color: "#9ca3af", fontSize: 11, margin: "4px 0 0" }}>
                        📱 {canal?.nome || "Canal removido"} · 👤 {t.criado_por}
                      </p>
                    </div>
                    <span style={{
                      background: `${color}15`, color,
                      border: `1px solid ${color}40`,
                      fontSize: 11, padding: "5px 12px", borderRadius: 12, fontWeight: 700, whiteSpace: "nowrap"}}>
                      {STATUS_LABELS[t.status] || t.status}
                    </span>
                  </div>
                  {bodyPreview && (
                    <p style={{
                      color: "#374151", fontSize: 12, margin: "0 0 12px",
                      background: "#f9fafb", padding: 12, borderRadius: 8,
                      whiteSpace: "pre-wrap", lineHeight: 1.5,
                      border: "1px solid #e5e7eb"}}>
                      {bodyPreview}
                    </p>
                  )}
                  {/* 🆕 Só mostra o motivo se houver tradução real (NONE/vazio retorna null) */}
                  {motivoTraduzido && (
                    <div style={{
                      background: "#fef2f2", border: "1px solid #fecaca",
                      borderLeft: "3px solid #dc2626",
                      borderRadius: 8, padding: "10px 14px", marginBottom: 12}}>
                      <p style={{ color: "#991b1b", fontSize: 10, margin: 0, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3 }}>
                        ❌ Motivo da rejeição
                      </p>
                      <p style={{ color: "#dc2626", fontSize: 12, margin: "4px 0 0", fontWeight: 600, lineHeight: 1.4 }}>
                        {motivoTraduzido}
                      </p>
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <button onClick={() => setDetalhe(t)}
                      style={{ background: "#eff6ff", color: "#2563eb", border: "1px solid #bfdbfe", borderRadius: 8, padding: "5px 14px", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>
                      👁️ Detalhes
                    </button>
                    <button onClick={() => deletarTemplate(t)}
                      style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", borderRadius: 8, padding: "5px 14px", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>
                      🗑️ Deletar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ═══ MODAL — CRIAR TEMPLATE ═══ */}
      {showModal && (
        <div onClick={() => setShowModal(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", backdropFilter: "blur(4px)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ ...cardStyle, width: "100%", maxWidth: 720, maxHeight: "92vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "18px 22px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ color: "#1f2937", fontSize: 16, fontWeight: 700, margin: 0 }}>➕ Novo Template</h3>
              <button onClick={() => setShowModal(false)} style={{ background: "#f3f4f6", border: "none", color: "#6b7280", fontSize: 16, cursor: "pointer", width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
            </div>

            <div style={{ padding: 22, overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 18 }}>

              {/* Canal */}
              <div>
                <label style={{ color: "#6b7280", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 6 }}>Canal WABA *</label>
                <select value={form.canalId} onChange={e => setForm(p => ({ ...p, canalId: e.target.value }))} style={IS}>
                  <option value="">Selecione o canal</option>
                  {canais.map(c => (<option key={c.id} value={c.id}>{c.nome} (WABA: {c.waba_id})</option>))}
                </select>
                <p style={{ color: "#9ca3af", fontSize: 10, margin: "4px 0 0" }}>O template será cadastrado neste WABA específico.</p>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <label style={{ color: "#6b7280", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 6 }}>Nome Técnico *</label>
                  <input value={form.metaTemplateName} onChange={e => setForm(p => ({ ...p, metaTemplateName: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") }))} placeholder="boas_vindas_cliente" style={{ ...IS, fontFamily: "monospace" }} />
                  <p style={{ color: "#9ca3af", fontSize: 10, margin: "4px 0 0" }}>Só minúsculas, números e _</p>
                </div>
                <div>
                  <label style={{ color: "#6b7280", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 6 }}>Nome Amigável</label>
                  <input value={form.nomeAmigavel} onChange={e => setForm(p => ({ ...p, nomeAmigavel: e.target.value }))} placeholder="Boas-vindas ao cliente" style={IS} />
                  <p style={{ color: "#9ca3af", fontSize: 10, margin: "4px 0 0" }}>Pra aparecer no sistema</p>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <label style={{ color: "#6b7280", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 6 }}>Categoria *</label>
                  <select value={form.categoria} onChange={e => setForm(p => ({ ...p, categoria: e.target.value }))} style={IS}>
                    {CATEGORIAS.map(c => (<option key={c.v} value={c.v}>{c.l}</option>))}
                  </select>
                  <p style={{ color: "#9ca3af", fontSize: 10, margin: "4px 0 0" }}>{CATEGORIAS.find(c => c.v === form.categoria)?.d}</p>
                </div>
                <div>
                  <label style={{ color: "#6b7280", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 6 }}>Idioma *</label>
                  <select value={form.idioma} onChange={e => setForm(p => ({ ...p, idioma: e.target.value }))} style={IS}>
                    {IDIOMAS.map(i => (<option key={i.v} value={i.v}>{i.l}</option>))}
                  </select>
                </div>
              </div>

              {/* HEADER */}
              <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
                <p style={{ color: "#6b7280", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, margin: "0 0 10px" }}>HEADER (opcional)</p>
                <select value={form.headerTipo} onChange={e => setForm(p => ({ ...p, headerTipo: e.target.value as any }))} style={{ ...IS, marginBottom: 10 }}>
                  <option value="none">Sem cabeçalho</option>
                  <option value="text">📝 Texto</option>
                  <option value="image">🖼️ Imagem</option>
                  <option value="video">🎬 Vídeo</option>
                  <option value="document">📄 Documento</option>
                </select>
                {form.headerTipo === "text" && (
                  <input value={form.headerTexto} onChange={e => setForm(p => ({ ...p, headerTexto: e.target.value }))} placeholder="Ex: Olá, {{1}}!" maxLength={60} style={IS} />
                )}
                {["image", "video", "document"].includes(form.headerTipo) && (
                  <input value={form.headerUrl} onChange={e => setForm(p => ({ ...p, headerUrl: e.target.value }))} placeholder="URL do arquivo (exemplo pra Meta analisar)" style={IS} />
                )}
              </div>

              {/* BODY */}
              <div>
                <label style={{ color: "#6b7280", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 6 }}>Mensagem (BODY) *</label>
                <textarea value={form.body} onChange={e => setForm(p => ({ ...p, body: e.target.value }))} rows={5}
                  placeholder="Olá {{1}}, seu pedido {{2}} foi confirmado!"
                  style={{ ...IS, resize: "vertical", minHeight: 120, fontFamily: "monospace" }} />
                <p style={{ color: varsBody > 0 ? "#16a34a" : "#9ca3af", fontSize: 10, margin: "4px 0 0", fontWeight: varsBody > 0 ? 700 : 400 }}>
                  {form.body.length}/1024 caracteres · {varsBody} variável(is) detectada(s) — use {"{{1}}"}, {"{{2}}"}, etc
                </p>
              </div>

              {/* FOOTER */}
              <div>
                <label style={{ color: "#6b7280", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 6 }}>Rodapé (opcional)</label>
                <input value={form.footer} onChange={e => setForm(p => ({ ...p, footer: e.target.value }))} maxLength={60} placeholder="Ex: Responda STOP pra descadastrar" style={IS} />
              </div>

              {/* BUTTONS */}
              <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <p style={{ color: "#6b7280", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, margin: 0 }}>BOTÕES (até 3, opcional)</p>
                  <button onClick={adicionarBotao} disabled={form.botoes.length >= 3}
                    style={{ background: "#eff6ff", color: "#2563eb", border: "1px solid #bfdbfe", borderRadius: 8, padding: "5px 12px", fontSize: 11, cursor: form.botoes.length >= 3 ? "not-allowed" : "pointer", fontWeight: 600, opacity: form.botoes.length >= 3 ? 0.5 : 1 }}>
                    + Adicionar
                  </button>
                </div>
                {form.botoes.map((b, i) => (
                  <div key={i} style={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, marginBottom: 8 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "140px 1fr auto", gap: 8, alignItems: "center" }}>
                      <select value={b.type} onChange={e => atualizarBotao(i, "type", e.target.value)} style={{ ...IS, fontSize: 12, padding: "8px 10px" }}>
                        <option value="QUICK_REPLY">Resposta Rápida</option>
                        <option value="URL">Link (URL)</option>
                        <option value="PHONE_NUMBER">Telefone</option>
                      </select>
                      <input value={b.text} onChange={e => atualizarBotao(i, "text", e.target.value)} placeholder="Texto do botão" maxLength={25} style={{ ...IS, fontSize: 12, padding: "8px 10px" }} />
                      <button onClick={() => removerBotao(i)}
                        style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", borderRadius: 8, padding: "8px 10px", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>✕</button>
                    </div>
                    {b.type === "URL" && (
                      <input value={b.url || ""} onChange={e => atualizarBotao(i, "url", e.target.value)} placeholder="https://..." style={{ ...IS, fontSize: 12, padding: "8px 10px", marginTop: 8 }} />
                    )}
                    {b.type === "PHONE_NUMBER" && (
                      <input value={b.phone_number || ""} onChange={e => atualizarBotao(i, "phone_number", e.target.value)} placeholder="+5562999999999" style={{ ...IS, fontSize: 12, padding: "8px 10px", marginTop: 8 }} />
                    )}
                  </div>
                ))}
                {form.botoes.length === 0 && <p style={{ color: "#9ca3af", fontSize: 11, margin: 0, textAlign: "center", padding: 10 }}>Nenhum botão adicionado</p>}
              </div>
            </div>

            <div style={{ padding: "16px 22px", borderTop: "1px solid #e5e7eb", display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setShowModal(false)}
                style={{ background: "#ffffff", color: "#6b7280", border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 20px", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>
                Cancelar
              </button>
              <button onClick={enviarParaMeta} disabled={enviando}
                style={{
                  background: enviando ? "#15803d" : "linear-gradient(135deg, #16a34a 0%, #22c55e 100%)",
                  color: "white", border: "none", borderRadius: 10,
                  padding: "10px 24px", fontSize: 13, cursor: enviando ? "wait" : "pointer", fontWeight: 700,
                  boxShadow: "0 4px 12px rgba(22,163,74,0.3)"}}>
                {enviando ? "⏳ Enviando..." : "📤 Enviar pra Meta"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL — DETALHES ═══ */}
      {detalhe && (
        <div onClick={() => setDetalhe(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", backdropFilter: "blur(4px)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ ...cardStyle, width: "100%", maxWidth: 600, maxHeight: "85vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "18px 22px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ color: "#1f2937", fontSize: 16, fontWeight: 700, margin: 0 }}>{detalhe.nome_amigavel || detalhe.meta_template_name}</h3>
              <button onClick={() => setDetalhe(null)} style={{ background: "#f3f4f6", border: "none", color: "#6b7280", fontSize: 16, cursor: "pointer", width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
            </div>
            <div style={{ padding: 22, overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <p style={{ color: "#9ca3af", fontSize: 11, fontWeight: 700, margin: "0 0 4px", textTransform: "uppercase", letterSpacing: 0.5 }}>Status</p>
                <p style={{ color: STATUS_COLORS[detalhe.status], fontSize: 14, fontWeight: 700, margin: 0 }}>{STATUS_LABELS[detalhe.status]}</p>
              </div>
              <div>
                <p style={{ color: "#9ca3af", fontSize: 11, fontWeight: 700, margin: "0 0 4px", textTransform: "uppercase", letterSpacing: 0.5 }}>Nome Técnico (Meta)</p>
                <p style={{ color: "#1f2937", fontSize: 13, fontFamily: "monospace", margin: 0, background: "#f3f4f6", padding: "6px 10px", borderRadius: 6, border: "1px solid #e5e7eb" }}>{detalhe.meta_template_name}</p>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div>
                  <p style={{ color: "#9ca3af", fontSize: 11, fontWeight: 700, margin: "0 0 4px", textTransform: "uppercase", letterSpacing: 0.5 }}>Categoria</p>
                  <p style={{ color: "#1f2937", fontSize: 13, margin: 0, fontWeight: 600 }}>{detalhe.categoria}</p>
                </div>
                <div>
                  <p style={{ color: "#9ca3af", fontSize: 11, fontWeight: 700, margin: "0 0 4px", textTransform: "uppercase", letterSpacing: 0.5 }}>Idioma</p>
                  <p style={{ color: "#1f2937", fontSize: 13, margin: 0, fontWeight: 600 }}>{detalhe.idioma}</p>
                </div>
              </div>
              {/* 🆕 Motivo só aparece se houver tradução real (NONE/vazio retorna null) */}
              {(() => {
                const motivoTraduzido = traduzirMotivoRejeicao(detalhe.motivo_rejeicao);
                if (!motivoTraduzido) return null;
                return (
                  <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderLeft: "4px solid #dc2626", borderRadius: 10, padding: 14 }}>
                    <p style={{ color: "#991b1b", fontSize: 11, margin: 0, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3 }}>❌ Motivo da rejeição</p>
                    <p style={{ color: "#dc2626", fontSize: 13, margin: "5px 0 0", lineHeight: 1.5, fontWeight: 600 }}>{motivoTraduzido}</p>
                    {/* Mostra também o código original em pequeno quando for motivo desconhecido (fallback) */}
                    {detalhe.motivo_rejeicao && motivoTraduzido.startsWith("Motivo:") && (
                      <p style={{ color: "#9ca3af", fontSize: 10, margin: "6px 0 0", fontFamily: "monospace" }}>
                        Código Meta: {detalhe.motivo_rejeicao}
                      </p>
                    )}
                  </div>
                );
              })()}
              <div>
                <p style={{ color: "#9ca3af", fontSize: 11, fontWeight: 700, margin: "0 0 6px", textTransform: "uppercase", letterSpacing: 0.5 }}>Componentes</p>
                <div style={{ background: "#1f2937", borderRadius: 10, padding: 14, fontSize: 12, fontFamily: "monospace", color: "#e5e7eb", whiteSpace: "pre-wrap", maxHeight: 300, overflowY: "auto", border: "1px solid #374151" }}>
                  {JSON.stringify(detalhe.componentes, null, 2)}
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, fontSize: 11 }}>
                <div>
                  <p style={{ color: "#9ca3af", fontWeight: 700, margin: "0 0 2px", textTransform: "uppercase", letterSpacing: 0.5 }}>Criado em</p>
                  <p style={{ color: "#374151", margin: 0, fontWeight: 500 }}>{new Date(detalhe.created_at).toLocaleString("pt-BR")}</p>
                </div>
                {detalhe.aprovado_em && (
                  <div>
                    <p style={{ color: "#9ca3af", fontWeight: 700, margin: "0 0 2px", textTransform: "uppercase", letterSpacing: 0.5 }}>Aprovado em</p>
                    <p style={{ color: "#16a34a", margin: 0, fontWeight: 700 }}>{new Date(detalhe.aprovado_em).toLocaleString("pt-BR")}</p>
                  </div>
                )}
                {detalhe.ultima_sincronizacao && (
                  <div>
                    <p style={{ color: "#9ca3af", fontWeight: 700, margin: "0 0 2px", textTransform: "uppercase", letterSpacing: 0.5 }}>Última sync</p>
                    <p style={{ color: "#374151", margin: 0, fontWeight: 500 }}>{new Date(detalhe.ultima_sincronizacao).toLocaleString("pt-BR")}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL VISUAL DE FEEDBACK (substitui alerts/confirms nativos) ═══ */}
      {feedback && (() => {
        const cores = {
          erro:    { bg: "#fef2f2", border: "#fecaca", iconBg: "#fee2e2", icon: "#dc2626", titulo: "#991b1b", botao: "#dc2626", botaoHover: "#b91c1c", emoji: "⚠️" },
          aviso:   { bg: "#fffbeb", border: "#fde68a", iconBg: "#fef3c7", icon: "#d97706", titulo: "#92400e", botao: "#d97706", botaoHover: "#b45309", emoji: "🛡️" },
          sucesso: { bg: "#f0fdf4", border: "#bbf7d0", iconBg: "#dcfce7", icon: "#16a34a", titulo: "#14532d", botao: "#16a34a", botaoHover: "#15803d", emoji: "✅" },
          info:    { bg: "#eff6ff", border: "#bfdbfe", iconBg: "#dbeafe", icon: "#2563eb", titulo: "#1e3a8a", botao: "#2563eb", botaoHover: "#1d4ed8", emoji: "ℹ️" }}[feedback.tipo];
        const ehConfirmacao = !!feedback.onConfirmar;
        return (
          <div onClick={() => !ehConfirmacao && setFeedback(null)}
            style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 3000, padding: 16, animation: "fadeIn 0.15s" }}>
            <div onClick={e => e.stopPropagation()}
              style={{ background: "#ffffff", borderRadius: 16, maxWidth: 520, width: "100%", maxHeight: "85vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 20px 50px rgba(0,0,0,0.25)" }}>
              {/* Topo colorido */}
              <div style={{ background: cores.bg, borderBottom: `1px solid ${cores.border}`, padding: "22px 24px", display: "flex", gap: 14, alignItems: "flex-start" }}>
                <div style={{ width: 48, height: 48, borderRadius: 14, background: cores.iconBg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0, boxShadow: `0 4px 12px ${cores.icon}25` }}>
                  {cores.emoji}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{ color: cores.titulo, fontSize: 16, fontWeight: 800, margin: "2px 0 6px", letterSpacing: -0.2 }}>{feedback.titulo}</h3>
                  <p style={{ color: "#374151", fontSize: 13, margin: 0, lineHeight: 1.55 }}>{feedback.mensagem}</p>
                </div>
              </div>

              {/* Lista de detalhes (se houver) */}
              {feedback.detalhes && feedback.detalhes.length > 0 && (
                <div style={{ padding: "16px 24px", overflowY: "auto", flex: 1, borderBottom: "1px solid #f3f4f6" }}>
                  <p style={{ color: "#6b7280", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, margin: "0 0 10px" }}>O que pode estar acontecendo</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {feedback.detalhes.map((d, i) => (
                      <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 12px" }}>
                        <span style={{ width: 22, height: 22, borderRadius: 8, background: cores.iconBg, color: cores.icon, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, flexShrink: 0 }}>{i + 1}</span>
                        <p style={{ color: "#374151", fontSize: 12.5, margin: 0, lineHeight: 1.5, flex: 1 }}>{d}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Botões */}
              <div style={{ padding: "14px 24px", background: "#fafbfc", display: "flex", justifyContent: "flex-end", gap: 8 }}>
                {ehConfirmacao && (
                  <button onClick={() => setFeedback(null)}
                    style={{ background: "#ffffff", color: "#6b7280", border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 18px", fontSize: 13, cursor: "pointer", fontWeight: 700 }}>
                    Cancelar
                  </button>
                )}
                <button onClick={() => { if (feedback.onConfirmar) feedback.onConfirmar(); else setFeedback(null); }}
                  onMouseEnter={e => e.currentTarget.style.background = cores.botaoHover}
                  onMouseLeave={e => e.currentTarget.style.background = cores.botao}
                  style={{ background: cores.botao, color: "#ffffff", border: "none", borderRadius: 10, padding: "10px 22px", fontSize: 13, cursor: "pointer", fontWeight: 700, boxShadow: `0 4px 12px ${cores.botao}40`, transition: "background 0.15s" }}>
                  {ehConfirmacao ? (feedback.confirmarLabel || "Continuar") : "Entendi"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}