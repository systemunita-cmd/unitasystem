"use client";
export const dynamic = "force-dynamic";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { supabase } from "../../../lib/supabase";
import { useTemPermissao } from "../../../hooks/useTemPermissao";
import { ChatSection } from "../../../chatbot/_sections/ChatSection";

// ═══════════════════════════════════════════════════════════════════════════
// 💰 COBRANÇA — UnitaSystem
// ───────────────────────────────────────────────────────────────────────────
// Single-tenant · Cores azul Unita · Mantém 12 status de fatura e disparos
// Duas fontes:
//   • "Do CRM"     → puxa propostas com status INSTALADA, gera faturas dinâmicas
//   • "Da planilha" → upload CSV/XLSX
// ═══════════════════════════════════════════════════════════════════════════

type Proposta = {
  id: number;
  nome?: string | null;
  telefone1?: string | null;
  telefone2?: string | null;
  telefone3?: string | null;
  plano?: string | null;
  valor_plano?: number | null;
  vencimento?: string | null;
  forma_pagamento?: string | null;
  status_venda?: string | null;
  data_instalacao?: string | null;
  operadora?: string | null;
  cpf?: string | null;
  dados_customizados?: Record<string, any> | null;
  created_at: string;
};

// 🔍 Busca de cliente: nome, telefone, plano, CPF (com ou sem pontos) e OS do CRM
const buscaMatch = (p: Proposta, termo: string): boolean => {
  const t = termo.toLowerCase();
  const dig = termo.replace(/\D/g, "");
  const cpfDig = String(p.cpf || "").replace(/\D/g, "");
  const os = String(p.dados_customizados?.os || "").toLowerCase();
  const custcode = String(p.dados_customizados?.custcode || "").toLowerCase();
  return (p.nome || "").toLowerCase().includes(t)
    || (p.telefone1 || "").includes(termo)
    || (p.plano || "").toLowerCase().includes(t)
    || String(p.cpf || "").toLowerCase().includes(t)
    || (dig.length > 0 && cpfDig.includes(dig))
    || (os.length > 0 && os.includes(t))
    || (custcode.length > 0 && custcode.includes(t));
};

type Canal = { id: number; nome: string; tipo: string; status: string; waba_id?: string };
type Template = {
  id: number; canal_id: number; meta_template_name: string; nome_amigavel: string;
  categoria: string; idioma: string; status: string; componentes: any[];
};
type Campanha = {
  id: number; nome: string; criado_por: string; status: string; modo: string;
  total_contatos: number; total_enviados: number; total_falhas: number;
  created_at: string; finalizado_em?: string;
};

type StatusFatura =
  | "pendente" | "paga" | "paga_atraso" | "paga_parcial" | "promessa"
  | "negociacao" | "acordo" | "nao_pagara" | "cancelada" | "juridico"
  | "protestada" | "atrasada";

type FaturaStatusDB = {
  proposta_id: number; numero_referencia: string;
  status: StatusFatura; data_pagamento?: string | null; forma_pagamento?: string | null;
  valor_pago?: number | null; promessa_data?: string | null; observacoes?: string | null;
  atualizado_por?: string | null; updated_at?: string;
};

type Fatura = {
  proposta: Proposta;
  numero_referencia: string;
  data_vencimento: Date;
  valor: number;
  proporcional: boolean;
  dias_cobertos: number;
  status: StatusFatura;
  status_visual: StatusFatura;
  data_pagamento?: string | null;
  observacoes?: string | null;
  dias_atraso: number;
  // 🆕 dados CRUS da planilha (uma fatura = uma linha real da planilha)
  numero_fatura?: number | null;     // 1..10
  codigo_status?: string | null;     // "01".."05"
  status_planilha?: string | null;   // texto cru "02 - PAGOU ATÉ 30 DIAS..."
  detalhamento?: string | null;
  mes_gross?: string | null;
  nome_banco?: string | null;
  opcao_pagamento?: string | null;   // BOLETO / DACC
  suspensao_fraude?: boolean | null;
  churn?: boolean | null;
  insucesso_dacc?: boolean | null;
  daPlanilha?: boolean;              // veio da planilha (true) ou gerada pelo CRM (false)
};

type AbaKey = "do_crm" | "planilha" | "campanhas" | "atendimentos";
type FiltroVenc = "todos" | "hoje" | "vencendo_7d" | "vencidos" | "este_mes";

// ─── HELPERS ───────────────────────────────────────────────────────────────
const formatBRL = (v: number) =>
  `R$ ${(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatNum = (v: number) => (v || 0).toLocaleString("pt-BR");
const formatBRLCompacto = (v: number): string => {
  v = v || 0;
  if (Math.abs(v) >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000)     return `R$ ${(v / 1_000).toFixed(1)}k`;
  return formatBRL(v);
};

const formatData = (d: Date | string | null | undefined) => {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d + (d.length === 10 ? "T00:00:00" : "")) : d;
  if (isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
};

const formatMesExtenso = (numRef: string): string => {
  const [ano, mes] = numRef.split("-");
  const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return `${meses[parseInt(mes, 10) - 1]}/${ano.slice(2)}`;
};

const aplicarStatusEAtrasos = (faturas: Fatura[], statusMap: Map<string, FaturaStatusDB>): Fatura[] => {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return faturas.map(f => {
    const chave = `${f.proposta.id}_${f.numero_referencia}`;
    const db = statusMap.get(chave);
    const diasAtraso = Math.round((hoje.getTime() - f.data_vencimento.getTime()) / 86400000);
    // 🆕 fatura que veio da planilha já carrega o status correto (código 01..05).
    //    Só deixamos o operador SOBRESCREVER quando ele mexeu manualmente — ou seja,
    //    quando há uma linha de status com atualizado_por preenchido (ação humana).
    if (f.daPlanilha && (!db || !db.atualizado_por)) {
      return { ...f, dias_atraso: diasAtraso };
    }
    const status = (db?.status || f.status || "pendente") as StatusFatura;
    const visual: StatusFatura = (status === "pendente" && diasAtraso > 0) ? "atrasada" : status;
    return {
      ...f, status, status_visual: visual, dias_atraso: diasAtraso,
      data_pagamento: db?.data_pagamento ?? f.data_pagamento ?? null,
      observacoes: db?.observacoes ?? f.observacoes ?? null,
    };
  });
};

const STATUS_META: Record<StatusFatura, {
  label: string; icone: string; bg: string; border: string; color: string;
  recebido: boolean; pendencia: boolean; descricao: string;
}> = {
  pendente:     { label: "Em vencer",          icone: "⏳", bg: "#fffbeb", border: "#fde68a", color: "#d97706", recebido: false, pendencia: true,  descricao: "Ainda não venceu" },
  atrasada:     { label: "Em aberto",          icone: "🔴", bg: "#fef2f2", border: "#fecaca", color: "#dc2626", recebido: false, pendencia: true,  descricao: "Venceu e não foi paga" },
  paga:         { label: "Paga",               icone: "✅", bg: "#f0fdf4", border: "#bbf7d0", color: "#16a34a", recebido: true,  pendencia: false, descricao: "Paga em dia" },
  paga_atraso:  { label: "Paga c/ atraso",     icone: "⏰", bg: "#ecfdf5", border: "#a7f3d0", color: "#059669", recebido: true,  pendencia: false, descricao: "Paga depois do vencimento" },
  paga_parcial: { label: "Paga parcial",       icone: "💰", bg: "#fffbeb", border: "#fcd34d", color: "#b45309", recebido: true,  pendencia: true,  descricao: "Pagou só parte do valor" },
  promessa:     { label: "Promessa pagto",     icone: "🤝", bg: "#eff6ff", border: "#bfdbfe", color: "#2563eb", recebido: false, pendencia: true,  descricao: "Cliente prometeu pagar" },
  negociacao:   { label: "Em negociação",      icone: "📞", bg: "#f5f3ff", border: "#ddd6fe", color: "#7c3aed", recebido: false, pendencia: true,  descricao: "Renegociando prazo/valor" },
  acordo:       { label: "Acordo / Parcelada", icone: "📋", bg: "#f0f9ff", border: "#bae6fd", color: "#0284c7", recebido: false, pendencia: true,  descricao: "Acordo de parcelamento ativo" },
  nao_pagara:   { label: "Não vai pagar",      icone: "❌", bg: "#fef2f2", border: "#fca5a5", color: "#991b1b", recebido: false, pendencia: false, descricao: "Cliente recusou pagar" },
  cancelada:    { label: "Cancelada",          icone: "🚫", bg: "#f3f4f6", border: "#d1d5db", color: "#6b7280", recebido: false, pendencia: false, descricao: "Fatura anulada / cortesia" },
  juridico:     { label: "Jurídico",           icone: "⚖️", bg: "#fef2f2", border: "#fca5a5", color: "#7f1d1d", recebido: false, pendencia: true,  descricao: "Escalonada pro jurídico" },
  protestada:   { label: "Protestada",         icone: "📋", bg: "#fef2f2", border: "#fca5a5", color: "#7f1d1d", recebido: false, pendencia: true,  descricao: "Em protesto em cartório" },
};

const corStatus = (s: StatusFatura) => {
  const m = STATUS_META[s] || STATUS_META.pendente;
  return { bg: m.bg, border: m.border, color: m.color, label: `${m.icone} ${m.label}` };
};

const normalizarTelefone = (t: string | null | undefined): string => {
  if (!t) return "";
  return String(t).replace(/\D/g, "");
};

const substituirVars = (texto: string, vars: Record<string, string>): string =>
  texto.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");

// ─── ESTILOS ───────────────────────────────────────────────────────────────
const cardStyle = {
  background: "#ffffff",
  borderRadius: 14,
  border: "1px solid #e5e7eb",
  boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
};
const inputStyle = {
  background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 10,
  padding: "9px 12px", color: "#1f2937", fontSize: 13, outline: "none",
  width: "100%", boxSizing: "border-box" as const,
};
const labelStyle = {
  color: "#6b7280", fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const,
  letterSpacing: 0.5, display: "block", marginBottom: 6,
};
const btnPrimario = {
  background: "linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)",
  color: "#ffffff", border: "none", borderRadius: 10, padding: "10px 18px",
  fontSize: 13, cursor: "pointer", fontWeight: 700,
  boxShadow: "0 4px 12px rgba(220,38,38,0.3)",
};
const btnSecundario = {
  background: "#ffffff", color: "#374151", border: "1px solid #e5e7eb",
  borderRadius: 10, padding: "10px 16px", fontSize: 13, cursor: "pointer", fontWeight: 600,
};

const CAMPOS_PLANILHA = [
  { key: "telefone", label: "📱 Telefone (obrigatório)", obrigatorio: true },
  { key: "nome",     label: "👤 Nome do cliente",         obrigatorio: false },
  { key: "valor",    label: "💰 Valor da fatura",         obrigatorio: false },
  { key: "vencimento", label: "📅 Vencimento",            obrigatorio: false },
  { key: "plano",    label: "📦 Plano / produto",         obrigatorio: false },
  { key: "codigo",   label: "🔖 Código / identificador",  obrigatorio: false },
] as const;

export default function CobrancaPage() {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState<string>("");
  const [userId, setUserId] = useState<string>("");

  // 🛡️ Sistema novo de permissões
  const perm = useTemPermissao();
  const escopoCobranca = perm.escopo("cobranca.acessar");
  const podeMudarStatus = perm.escopo("cobranca.mudar_status") !== "none" || perm.superAdmin;
  const podeDisparar     = perm.tem("cobranca.disparar");
  const podeCancelar     = perm.tem("cobranca.cancelar_fatura");
  const podeJuridico     = perm.tem("cobranca.juridico");
  const podeProtestada   = perm.tem("cobranca.protestada");
  const permitido: boolean | null = perm.carregando
    ? null
    : (perm.superAdmin || escopoCobranca !== "none");

  const [aba, setAba] = useState<AbaKey>("do_crm");
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [tabelasFaltando, setTabelasFaltando] = useState<string[]>([]);

  const [propostas, setPropostas] = useState<Proposta[]>([]);
  const [canais, setCanais] = useState<Canal[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);

  // 💬 ATENDIMENTOS DA COBRANÇA — leads que RESPONDERAM os disparos
  const [respostasCob, setRespostasCob] = useState<any[]>([]);
  const [carregandoResp, setCarregandoResp] = useState(false);
  const [convAberta, setConvAberta] = useState<string | null>(null);
  const [msgsConv, setMsgsConv] = useState<any[]>([]);

  const so8 = (t: any) => String(t || "").replace(/\D/g, "").slice(-8);

  const fetchRespostasCobranca = async () => {
    setCarregandoResp(true);
    try {
      // 1. desde quando vale: o PRIMEIRO disparo de cobrança
      const { data: disp } = await supabase.from("disparos")
        .select("created_at").eq("origem", "cobranca")
        .order("created_at", { ascending: true }).limit(1);
      const desde = disp && disp[0] ? disp[0].created_at : null;
      if (!desde) { setRespostasCob([]); setCarregandoResp(false); return; }
      // 2. mapa telefone(8 últimos dígitos) -> proposta (clientes da cobrança)
      const mapaTel = new Map<string, Proposta>();
      for (const pr of propostas) {
        if ((pr.status_venda || "").toUpperCase() !== "INSTALADA") continue;
        for (const t of [pr.telefone1, pr.telefone2, pr.telefone3]) {
          const k = so8(t);
          if (k.length === 8 && !mapaTel.has(k)) mapaTel.set(k, pr);
        }
      }
      // 3. atendimentos mexidos depois do disparo, casados com cliente da cobrança
      const { data: ats } = await supabase.from("atendimentos").select("*")
        .gte("updated_at", desde)
        .order("updated_at", { ascending: false })
        .limit(1000);
      const lista = (ats || [])
        .map((a: any) => ({ a, cli: mapaTel.get(so8(a.numero)) }))
        .filter((x: any) => !!x.cli);
      setRespostasCob(lista);
    } catch (e) {
      console.error("[Cobrança] respostas:", e);
      setRespostasCob([]);
    }
    setCarregandoResp(false);
  };

  const abrirConversaCob = async (numero: string) => {
    if (convAberta === numero) { setConvAberta(null); setMsgsConv([]); return; }
    setConvAberta(numero);
    setMsgsConv([]);
    try {
      const { data } = await supabase.from("mensagens").select("*")
        .eq("numero", numero)
        .order("created_at", { ascending: false }).limit(60);
      setMsgsConv((data || []).reverse());
    } catch { setMsgsConv([]); }
  };

  useEffect(() => {
    if (aba === "atendimentos") fetchRespostasCobranca();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aba, propostas.length]);
  const [statusMap, setStatusMap] = useState<Map<string, FaturaStatusDB>>(new Map());

  const [filtroVenc, setFiltroVenc] = useState<FiltroVenc>("todos");
  const [filtroBusca, setFiltroBusca] = useState("");
  const [selecionadasFat, setSelecionadasFat] = useState<Set<string>>(new Set());
  const [filtroStatus, setFiltroStatus] = useState<string>("todas");
  // 🆕 MENU LATERAL de clientes: abre/fecha (libera a tabela em largura total)
  const [showSidebar, setShowSidebar] = useState(false);
  // 🆕 DROPDOWN de vencimento detectado da base (dia + mês reais)
  //    "" = todos | "dia:10" = todas que vencem dia 10 | "mes:2026-05" = vencem em mai/26
  const [filtroVencSel, setFiltroVencSel] = useState("");
  // 🆕 filtro por MÊS DE INSTALAÇÃO (mês a mês) — opcional, segue existindo
  const [mesInst, setMesInst] = useState("");
  // 🆕 filtros por coluna (cabeçalho da tabela)
  const [colNome, setColNome] = useState("");
  const [colOs, setColOs] = useState("");
  const [colCust, setColCust] = useState("");
  const [colFraude, setColFraude] = useState("");  // "" todos | "sim" | "nao"
  const [colChurn, setColChurn] = useState("");    // "" todos | "sim" | "nao"
  const [segmento, setSegmento] = useState<"inadimplentes" | "em_dia" | "todos">("inadimplentes");
  const [clienteSel, setClienteSel] = useState<number | null>(null);
  // 🆕 paginação da tabela principal (10 por página pra não pesar)
  const [pagina, setPagina] = useState(1);
  const TAM_PAGINA = 10;
  // 🆕 Histórico REAL da planilha (colunas numero_fatura/codigo_status/detalhamento/datas)
  const [histPlanilha, setHistPlanilha] = useState<Map<number, any[]>>(new Map());
  const [buscaCliente, setBuscaCliente] = useState("");

  const [showStatus, setShowStatus] = useState<Fatura | null>(null);
  const [novoStatus, setNovoStatus] = useState<StatusFatura>("paga");
  const [statusData, setStatusData] = useState("");
  const [statusForma, setStatusForma] = useState("");
  const [statusValor, setStatusValor] = useState("");
  const [statusPromessa, setStatusPromessa] = useState("");
  const [statusObs, setStatusObs] = useState("");

  const [planilhaLinhas, setPlanilhaLinhas] = useState<any[][]>([]);
  const [planilhaNomeArquivo, setPlanilhaNomeArquivo] = useState("");
  const [mapeamento, setMapeamento] = useState<Record<string, number>>({});
  const [primeiraLinhaCabecalho, setPrimeiraLinhaCabecalho] = useState(true);
  const [selecionadosPlanilha, setSelecionadosPlanilha] = useState<Set<number>>(new Set());
  const inputArquivoRef = useRef<HTMLInputElement>(null);

  // ✏️ ADIÇÃO: edição COMPLETA do cliente (igual nas vendas)
  const [editCliente, setEditCliente] = useState<Proposta | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [salvandoEdit, setSalvandoEdit] = useState(false);
  const abrirEdicaoCliente = (p: Proposta) => {
    setEditCliente(p);
    setEditForm({
      nome: String(p.nome || ""),
      cpf: String(p.cpf || ""),
      telefone1: String(p.telefone1 || ""),
      plano: String(p.plano || ""),
      operadora: String((p as any).operadora || ""),
      valor_plano: p.valor_plano != null ? String(p.valor_plano) : "",
      vencimento: String(p.vencimento || ""),
      forma_pagamento: String(p.forma_pagamento || ""),
      data_instalacao: String(p.data_instalacao || "").slice(0, 10),
      os: String(p.dados_customizados?.os || ""),
      custcode: String(p.dados_customizados?.custcode || ""),
    });
  };
  const salvarEdicaoCliente = async () => {
    if (!editCliente) return;
    setSalvandoEdit(true);
    const novoDados = { ...(editCliente.dados_customizados || {}) } as Record<string, any>;
    if (editForm.os.trim()) novoDados.os = editForm.os.trim(); else delete novoDados.os;
    if (editForm.custcode.trim()) novoDados.custcode = editForm.custcode.trim(); else delete novoDados.custcode;
    const payload: Record<string, any> = {
      nome: editForm.nome.trim() || null,
      cpf: editForm.cpf.trim() || null,
      telefone1: editForm.telefone1.trim() || null,
      plano: editForm.plano.trim() || null,
      operadora: editForm.operadora.trim() || null,
      valor_plano: editForm.valor_plano.trim() !== "" ? parseFloat(editForm.valor_plano.replace(",", ".")) || null : null,
      vencimento: editForm.vencimento.trim() || null,
      forma_pagamento: editForm.forma_pagamento.trim() || null,
      data_instalacao: editForm.data_instalacao.trim() || null,
      dados_customizados: novoDados,
    };
    const { error } = await supabase.from("proposta").update(payload).eq("id", editCliente.id);
    setSalvandoEdit(false);
    if (error) {
      setFeedback({ tipo: "erro", titulo: "Não foi possível salvar", mensagem: error.message });
      return;
    }
    setEditCliente(null);
    await fetchPropostas();
    setFeedback({ tipo: "sucesso", titulo: "Cliente atualizado", mensagem: `Dados de ${editForm.nome || "—"} salvos.` });
  };

  const [showEnvio, setShowEnvio] = useState(false);
  const [envioFonte, setEnvioFonte] = useState<"crm" | "planilha">("crm");
  const [envioContatos, setEnvioContatos] = useState<{ nome: string; telefone: string; vars: Record<string, string> }[]>([]);
  const [envioCanalId, setEnvioCanalId] = useState<number | null>(null);
  const [envioTipo, setEnvioTipo] = useState<"webjs" | "waba">("webjs");
  const [envioTemplateId, setEnvioTemplateId] = useState<number | null>(null);
  // 🆕 seleção de CLIENTES na tabela principal + modo de disparo (por cliente ou por fatura)
  const [clientesSel, setClientesSel] = useState<Set<number>>(new Set());
  const [envioModo, setEnvioModo] = useState<"cliente" | "fatura">("cliente");
  const [envioModoTrocavel, setEnvioModoTrocavel] = useState(true); // origem permite trocar o modo?
  const [envioOrigemClientes, setEnvioOrigemClientes] = useState<any[]>([]); // clientes que originaram o disparo
  const [envioMensagem, setEnvioMensagem] = useState(
    "Olá {{nome}}! 👋\n\nLembrete: sua fatura referente a {{mes_referencia}} no valor de {{valor}} vence em {{vencimento}}.\n\nPara evitar atrasos, faça o pagamento até o vencimento.\n\nQualquer dúvida, estou à disposição!\n\nGrupo Unita"
  );
  const [envioNomeCampanha, setEnvioNomeCampanha] = useState("");
  const [envioDelayMin, setEnvioDelayMin] = useState(30);
  const [envioDelayMax, setEnvioDelayMax] = useState(60);
  const [envioEnviando, setEnvioEnviando] = useState(false);

  const [feedback, setFeedback] = useState<{
    tipo: "erro" | "aviso" | "sucesso" | "info";
    titulo: string; mensagem: string; detalhes?: string[];
    onConfirmar?: () => void; confirmarLabel?: string;
  } | null>(null);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // 🔐 Pega só os dados básicos do user logado (permissão vem do hook acima)
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/"); return; }
      setUserEmail(user.email || "");
      setUserId(user.id);
    })();
  }, [router]);

  useEffect(() => {
    if (permitido !== true) return;
    fetchTudo();

    const ch = supabase.channel("cobranca_rt_unita")
      .on("postgres_changes", { event: "*", schema: "public", table: "proposta" }, () => fetchPropostas())
      .on("postgres_changes", { event: "*", schema: "public", table: "faturas_status" }, () => fetchStatusFaturas())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permitido]);

  async function fetchTudo() {
    setLoading(true);
    const fts: string[] = [];
    await Promise.all([
      fetchPropostas(fts),
      fetchStatusFaturas(fts),
      fetchCanais(fts),
      fetchTemplates(fts),
      fetchCampanhas(fts),
    ]);
    setTabelasFaltando(fts);
    setLoading(false);
  }

  async function fetchStatusFaturas(faltando?: string[]) {
    // ⚠️ Mesmo corte de 1000 linhas — pagina tudo (já temos 1500+ faturas com status)
    const PAGE_SIZE = 1000;
    let data: any[] = [];
    let error: any = null;
    try {
      const { count, error: errCount } = await supabase
        .from("faturas_status").select("proposta_id", { count: "exact", head: true });
      if (errCount) {
        error = errCount;
      } else {
        const total = count || 0;
        const nPaginas = Math.max(1, Math.ceil(total / PAGE_SIZE));
        const reqs = [];
        for (let i = 0; i < nPaginas; i++) {
          reqs.push(supabase.from("faturas_status").select("*").order("proposta_id", { ascending: true }).order("numero_referencia", { ascending: true }).range(i * PAGE_SIZE, i * PAGE_SIZE + PAGE_SIZE - 1));
        }
        const resultados = await Promise.all(reqs);
        for (const r of resultados) {
          if (r.error) { error = r.error; break; }
          data = data.concat(r.data || []);
        }
      }
    } catch (e) {
      error = e;
    }
    if (error) {
      if (error.code === "PGRST205") faltando?.push("faturas_status");
      setStatusMap(new Map());
      return;
    }
    const m = new Map<string, FaturaStatusDB>();
    for (const r of (data || [])) m.set(`${r.proposta_id}_${r.numero_referencia}`, r);
    setStatusMap(m);
    // 🆕 Histórico por proposta: só as linhas que vieram da planilha (têm numero_fatura)
    const h = new Map<number, any[]>();
    for (const r of (data || [])) {
      if (r.numero_fatura == null) continue;
      const arr = h.get(r.proposta_id) || [];
      arr.push(r); h.set(r.proposta_id, arr);
    }
    for (const arr of h.values()) arr.sort((a, b) => (a.numero_fatura || 0) - (b.numero_fatura || 0));
    setHistPlanilha(h);
  }

  async function fetchPropostas(faltando?: string[]) {
    // ⚠️ Sem paginação o Supabase devolve no máximo 1000 linhas — com 2k+ vendas
    //    os clientes mais antigos sumiam da cobrança. Busca TODAS as páginas em paralelo.
    const PAGE_SIZE = 1000;
    const COLS = "id, nome, telefone1, telefone2, telefone3, plano, valor_plano, vencimento, forma_pagamento, status_venda, data_instalacao, operadora, cpf, dados_customizados, created_at";
    try {
      const { count, error: errCount } = await supabase
        .from("proposta").select("id", { count: "exact", head: true });
      if (errCount) {
        if ((errCount as any)?.code === "PGRST205") faltando?.push("proposta");
        setPropostas([]);
        return;
      }
      const total = count || 0;
      const nPaginas = Math.max(1, Math.ceil(total / PAGE_SIZE));
      const reqs = [];
      for (let i = 0; i < nPaginas; i++) {
        reqs.push(
          supabase.from("proposta").select(COLS)
            .order("created_at", { ascending: false })
            .order("id", { ascending: false })
            .range(i * PAGE_SIZE, i * PAGE_SIZE + PAGE_SIZE - 1)
        );
      }
      const resultados = await Promise.all(reqs);
      let lista: any[] = [];
      for (const r of resultados) {
        if (r.error) {
          if ((r.error as any)?.code === "PGRST205") faltando?.push("proposta");
          continue;
        }
        lista = lista.concat(r.data || []);
      }
      setPropostas(lista);
    } catch {
      setPropostas([]);
    }
  }

  async function fetchCanais(faltando?: string[]) {
    const { data, error } = await supabase
      .from("conexoes")
      .select("id, nome, tipo, status");
    if (error?.code === "PGRST205") { faltando?.push("conexoes"); return; }
    setCanais(data || []);
    const primeiro = (data || []).find(c => c.status === "conectado" || c.status === "pronto");
    if (primeiro && !envioCanalId) setEnvioCanalId(primeiro.id);
  }

  async function fetchTemplates(faltando?: string[]) {
    const { data, error } = await supabase
      .from("templates_waba")
      .select("id, canal_id, meta_template_name, nome_amigavel, categoria, idioma, status, componentes")
      .in("status", ["aprovado", "approved", "APPROVED", "Approved"]);
    if (error?.code === "PGRST205") { faltando?.push("templates_waba"); return; }
    setTemplates(data || []);
  }

  async function fetchCampanhas(faltando?: string[]) {
    try {
      const { data, error } = await supabase
        .from("disparos")
        .select("id, nome, criado_por, status, total_contatos, total_enviados, total_falhas, created_at, finalizado_em, tipo, origem")
        .eq("origem", "cobranca")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) {
        if (error.code === "PGRST205") faltando?.push("disparos");
        else if (String(error.message || "").toLowerCase().includes("origem")) {
          console.warn("[Cobrança Unita] coluna disparos.origem ainda não existe");
        }
        return;
      }
      setCampanhas((data || []).map((d: any) => ({
        id: d.id, nome: d.nome, criado_por: d.criado_por, status: d.status, modo: "crm",
        total_contatos: d.total_contatos || 0,
        total_enviados: d.total_enviados || 0,
        total_falhas: d.total_falhas || 0,
        created_at: d.created_at, finalizado_em: d.finalizado_em,
      })));
    } catch (e) { console.warn("[Cobrança Unita]", e); }
  }

  // 🆕 mapeia o código bruto da planilha (01..05) -> status visual da fatura
  const statusVisualDoCodigo = (cod: string | null | undefined, venc: Date, hoje: Date): StatusFatura => {
    const c = String(cod || "").replace(/\D/g, "");
    if (c === "01") return "paga";
    if (c === "02" || c === "03" || c === "04") return "paga_atraso";
    if (c === "05") {
      const diasAtraso = Math.round((hoje.getTime() - venc.getTime()) / 86400000);
      return diasAtraso > 0 ? "atrasada" : "pendente";
    }
    return "pendente";
  };

  const todasFaturas = useMemo<Fatura[]>(() => {
    const instalados = propostas.filter(p => (p.status_venda || "").toUpperCase() === "INSTALADA");
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const CICLO = 10; // 10 faturas por cliente a partir do mês gross
    const result: Fatura[] = [];

    const parseDataBR = (v: any): Date | null => {
      if (!v) return null;
      const s = String(v).trim();
      // ISO completa (formato do banco): 2026-01-01
      let d = new Date(s.slice(0, 10) + "T00:00:00");
      if (!isNaN(d.getTime()) && /^\d{4}-\d{2}-\d{2}/.test(s)) return d;
      // mês abreviado PT (defensivo): jan/26, mai/26, set/25
      const MESES: Record<string, number> = { jan: 0, fev: 1, mar: 2, abr: 3, mai: 4, jun: 5, jul: 6, ago: 7, set: 8, out: 9, nov: 10, dez: 11 };
      const m = s.toLowerCase().match(/^([a-zç]{3,})[\/\-\s.]+(\d{2,4})$/);
      if (m && m[1].slice(0, 3) in MESES) {
        let ano = Number(m[2]); if (ano < 100) ano += 2000;
        return new Date(ano, MESES[m[1].slice(0, 3)], 1);
      }
      return isNaN(d.getTime()) ? null : d;
    };

    for (const p of instalados) {
      const hist = histPlanilha.get(p.id) || [];
      // 1) indexa as faturas REAIS da planilha por numero_fatura
      const porNum = new Map<number, any>();
      for (const r of hist) {
        if (r.numero_fatura == null) continue;
        porNum.set(Number(r.numero_fatura), r);
      }

      // 2) descobre o MÊS GROSS e o DIA DE VENCIMENTO do cliente (a partir da planilha)
      let mesGrossDate: Date | null = null;
      const diasVenc: number[] = [];
      for (const r of hist) {
        const mg = parseDataBR(r.mes_gross);
        if (mg && !mesGrossDate) mesGrossDate = mg;
        const dv = parseDataBR(r.data_vencimento);
        if (dv) diasVenc.push(dv.getDate());
      }
      // dia de vencimento = o mais comum da planilha; fallback no cadastro do CRM; senão 10
      let diaVenc = parseInt(String(p.vencimento || "").replace(/\D/g, ""), 10);
      if (diasVenc.length > 0) {
        const cont = new Map<number, number>();
        for (const d of diasVenc) cont.set(d, (cont.get(d) || 0) + 1);
        diaVenc = [...cont.entries()].sort((a, b) => b[1] - a[1])[0][0];
      }
      if (!diaVenc || diaVenc < 1 || diaVenc > 31) diaVenc = 10;

      // se não tem mês gross nenhum (cliente sem planilha), não há ciclo a gerar
      if (!mesGrossDate) continue;

      // 3) gera o CICLO de 10 faturas: fatura N vence (mês gross + N meses) no dia de venc.
      for (let n = 1; n <= CICLO; n++) {
        const r = porNum.get(n);
        // data de vencimento da fatura N
        let dv: Date | null = r ? parseDataBR(r.data_vencimento) : null;
        if (!dv) dv = new Date(mesGrossDate.getFullYear(), mesGrossDate.getMonth() + n, diaVenc);
        const diasAtraso = Math.round((hoje.getTime() - dv.getTime()) / 86400000);

        if (r) {
          // FATURA REAL da planilha — usa os dados crus
          const sv = statusVisualDoCodigo(r.codigo_status, dv, hoje);
          result.push({
            proposta: p,
            numero_referencia: r.numero_referencia || `${dv.getFullYear()}-${String(dv.getMonth() + 1).padStart(2, "0")}`,
            data_vencimento: dv, valor: p.valor_plano || 0, proporcional: false, dias_cobertos: 30,
            status: sv, status_visual: sv,
            data_pagamento: r.data_pagamento || null, observacoes: r.observacao || null, dias_atraso: diasAtraso,
            numero_fatura: n, codigo_status: r.codigo_status || null, status_planilha: r.status_planilha || null,
            detalhamento: r.detalhamento || null, mes_gross: r.mes_gross || null,
            nome_banco: r.nome_banco || null, opcao_pagamento: r.opcao_pagamento || null,
            suspensao_fraude: r.suspensao_fraude ?? null, churn: r.churn ?? null, insucesso_dacc: r.insucesso_dacc ?? null,
            daPlanilha: true,
          } as Fatura);
        } else {
          // FATURA GERADA (não veio na planilha) — a vencer ou em aberto conforme a data
          const sv: StatusFatura = diasAtraso > 0 ? "atrasada" : "pendente";
          result.push({
            proposta: p,
            numero_referencia: `${dv.getFullYear()}-${String(dv.getMonth() + 1).padStart(2, "0")}`,
            data_vencimento: dv, valor: p.valor_plano || 0, proporcional: false, dias_cobertos: 30,
            status: sv, status_visual: sv,
            data_pagamento: null, observacoes: null, dias_atraso: diasAtraso,
            numero_fatura: n, codigo_status: null, status_planilha: null,
            detalhamento: null, mes_gross: mesGrossDate ? `${mesGrossDate.getFullYear()}-${String(mesGrossDate.getMonth() + 1).padStart(2, "0")}-01` : null,
            nome_banco: null, opcao_pagamento: null,
            suspensao_fraude: null, churn: null, insucesso_dacc: null,
            daPlanilha: false,
          } as Fatura);
        }
      }
    }
    return aplicarStatusEAtrasos(result, statusMap);
  }, [propostas, statusMap, histPlanilha]);

  // 🆕 VENCIMENTOS DISPONÍVEIS na base — alimenta o menu suspenso de filtro.
  //    Detecta os DIAS de vencimento (1..31) e os MESES (YYYY-MM) que realmente existem,
  //    com a contagem de faturas de cada um.
  const vencimentosDisponiveis = useMemo(() => {
    const dias = new Map<number, number>();
    const meses = new Map<string, number>();
    for (const f of todasFaturas) {
      const d = f.data_vencimento;
      if (!d || isNaN(d.getTime())) continue;
      dias.set(d.getDate(), (dias.get(d.getDate()) || 0) + 1);
      const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      meses.set(mk, (meses.get(mk) || 0) + 1);
    }
    const mesesNome = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    const listaDias = Array.from(dias.entries()).sort((a, b) => a[0] - b[0])
      .map(([dia, n]) => ({ value: `dia:${dia}`, label: `Dia ${String(dia).padStart(2, "0")}`, n }));
    const listaMeses = Array.from(meses.entries()).sort((a, b) => a[0].localeCompare(b[0]))
      .map(([mk, n]) => { const [y, m] = mk.split("-"); return { value: `mes:${mk}`, label: `${mesesNome[Number(m) - 1]}/${y.slice(2)}`, n }; });
    return { listaDias, listaMeses };
  }, [todasFaturas]);

  // 🆕 Lista de clientes: agrupa faturas por cliente com resumo completo.
  const clientes = useMemo<any[]>(() => {
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const MS = 86400000;
    const map = new Map<number, any>();
    for (const f of todasFaturas) {
      const id = f.proposta.id;
      let c = map.get(id);
      if (!c) { c = { proposta: f.proposta, faturas: [], totalAberto: 0, atrasadas: 0, atrasoMax: 0, pagas: 0, emAberto: 0, aVencer: 0, proxVenc: null as Date | null, proxDias: null as number | null, temFraude: false, temChurn: false }; map.set(id, c); }
      c.faturas.push(f);
      const meta = STATUS_META[f.status_visual];
      if (meta?.recebido) c.pagas++;
      else {
        c.totalAberto += f.valor;
        const dias = Math.round((f.data_vencimento.getTime() - hoje.getTime()) / MS);
        if (f.status_visual === "atrasada") { c.atrasadas++; c.emAberto++; c.atrasoMax = Math.max(c.atrasoMax, f.dias_atraso); }
        else { c.aVencer++; }
        // próximo vencimento em aberto (o mais cedo a vencer, dias >= 0)
        if (dias >= 0 && (c.proxDias == null || dias < c.proxDias)) { c.proxDias = dias; c.proxVenc = f.data_vencimento; }
      }
      if (f.suspensao_fraude === true) c.temFraude = true;
      if (f.churn === true) c.temChurn = true;
    }
    const arr = Array.from(map.values()).map(c => ({ ...c, situacao: c.atrasadas > 0 ? "inadimplente" : "em_dia" }));
    return arr.sort((a, b) => {
      const ina = a.situacao === "inadimplente", inb = b.situacao === "inadimplente";
      if (ina !== inb) return ina ? -1 : 1;
      if (b.atrasoMax !== a.atrasoMax) return b.atrasoMax - a.atrasoMax;
      return b.totalAberto - a.totalAberto;
    });
  }, [todasFaturas]);
  const qtdInad = useMemo(() => clientes.filter(c => c.situacao === "inadimplente").length, [clientes]);
  const qtdEmDia = useMemo(() => clientes.length - qtdInad, [clientes, qtdInad]);
  const clientesFiltrados = useMemo(() => {
    let arr = clientes;
    if (segmento === "inadimplentes") arr = arr.filter(c => c.situacao === "inadimplente");
    else if (segmento === "em_dia") arr = arr.filter(c => c.situacao === "em_dia");
    // 🆕 clientes que INSTALARAM no mês escolhido
    if (mesInst) arr = arr.filter(c => String(c.proposta.data_instalacao || "").startsWith(mesInst));
    if (buscaCliente) {
      arr = arr.filter(c => buscaMatch(c.proposta, buscaCliente));
    }
    return arr;
  }, [clientes, segmento, buscaCliente, mesInst]);

  // 🆕 CLIENTES para a TABELA PRINCIPAL (uma linha por cliente). Aplica os filtros
  //    de cima: status, dropdown de vencimento, busca da barra e mês de instalação.
  const clientesTabela = useMemo(() => {
    let arr = clientes;
    // segmento (inadimplente/em dia/todos) compartilhado com a barra de status
    if (filtroStatus === "atrasadas") arr = arr.filter(c => c.atrasadas > 0);
    else if (filtroStatus === "pagas") arr = arr.filter(c => c.pagas > 0);
    else if (filtroStatus === "pendentes") arr = arr.filter(c => c.aVencer > 0);
    // mês de instalação
    if (mesInst) arr = arr.filter(c => String(c.proposta.data_instalacao || "").startsWith(mesInst));
    // dropdown de vencimento (dia ou mês) — cliente entra se TEM alguma fatura nesse vencimento
    if (filtroVencSel.startsWith("dia:")) {
      const dia = Number(filtroVencSel.slice(4));
      arr = arr.filter(c => c.faturas.some((f: Fatura) => f.data_vencimento.getDate() === dia));
    } else if (filtroVencSel.startsWith("mes:")) {
      const mk = filtroVencSel.slice(4);
      arr = arr.filter(c => c.faturas.some((f: Fatura) => `${f.data_vencimento.getFullYear()}-${String(f.data_vencimento.getMonth() + 1).padStart(2, "0")}` === mk));
    }
    // janela de vencimento (próx 7 dias / hoje / vencidos / este mês)
    if (filtroVenc !== "todos" && !filtroBusca) {
      const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
      arr = arr.filter(c => c.faturas.some((f: Fatura) => {
        const dias = f.dias_atraso;
        if (filtroVenc === "hoje") return dias === 0;
        if (filtroVenc === "vencendo_7d") return dias >= -7 && dias <= 0;
        if (filtroVenc === "vencidos") return dias > 0 && f.status_visual === "atrasada";
        if (filtroVenc === "este_mes") return f.data_vencimento.getMonth() === hoje.getMonth() && f.data_vencimento.getFullYear() === hoje.getFullYear();
        return true;
      }));
    }
    // busca da barra (nome, cpf, os, telefone, plano)
    if (filtroBusca) arr = arr.filter(c => buscaMatch(c.proposta, filtroBusca));
    // filtros por coluna (nome, os, custcode)
    const inc = (v: any, q: string) => String(v ?? "").toLowerCase().includes(q.toLowerCase());
    if (colNome) arr = arr.filter(c => inc(c.proposta.nome, colNome));
    if (colOs)   arr = arr.filter(c => inc(c.proposta.dados_customizados?.os, colOs));
    if (colCust) arr = arr.filter(c => inc(c.proposta.dados_customizados?.custcode, colCust));
    if (colFraude === "sim") arr = arr.filter(c => c.temFraude === true);
    if (colFraude === "nao") arr = arr.filter(c => !c.temFraude);
    if (colChurn === "sim")  arr = arr.filter(c => c.temChurn === true);
    if (colChurn === "nao")  arr = arr.filter(c => !c.temChurn);
    return arr;
  }, [clientes, filtroStatus, mesInst, filtroVencSel, filtroVenc, filtroBusca, colNome, colOs, colCust, colFraude, colChurn]);

  // 🆕 PAGINAÇÃO POR CLIENTE: 10 clientes por página. Volta pra pág. 1 ao mudar filtro.
  const totalPaginas = Math.max(1, Math.ceil(clientesTabela.length / TAM_PAGINA));
  useEffect(() => { setPagina(1); }, [filtroVenc, filtroStatus, filtroBusca, mesInst, filtroVencSel, colNome, colOs, colCust, colFraude, colChurn]);
  const paginaSegura = Math.min(pagina, totalPaginas);
  const clientesPagina = useMemo(
    () => clientesTabela.slice((paginaSegura - 1) * TAM_PAGINA, paginaSegura * TAM_PAGINA),
    [clientesTabela, paginaSegura]
  );

  // 🆕 MODAL de faturas do cliente: guarda a proposta_id do cliente aberto (null = fechado).
  const [modalCliente, setModalCliente] = useState<number | null>(null);

  const kpis = useMemo(() => {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const MS = 86400000;
    let pagas = 0, aPagar = 0, vence7d = 0, atrasadas = 0;
    // faturas em aberto que vencem ATÉ tal dia (pra montar o "pague até dia X")
    const venceEmAberto: { dias: number; data: Date }[] = [];
    for (const f of todasFaturas) {
      const meta = STATUS_META[f.status_visual];
      if (meta?.recebido) { pagas++; continue; }
      // não paga:
      aPagar++;
      const dias = Math.round((f.data_vencimento.getTime() - hoje.getTime()) / MS); // >0 = ainda vai vencer
      if (f.status_visual === "atrasada") atrasadas++;
      if (dias >= 0 && dias <= 7) vence7d++;
      if (dias >= 0) venceEmAberto.push({ dias, data: f.data_vencimento });
    }
    // próxima data de corte: a fatura em aberto mais próxima de vencer
    venceEmAberto.sort((a, b) => a.dias - b.dias);
    const prox = venceEmAberto[0] || null;
    const proxData = prox ? prox.data : null;
    const proxDias = prox ? prox.dias : null;
    // quantas faturas vencem exatamente nessa próxima data de corte (viram inadimplentes se não pagar)
    let viramInad = 0;
    if (proxData) {
      for (const v of venceEmAberto) if (v.data.getTime() === proxData.getTime()) viramInad++;
    }
    const total = pagas + aPagar;
    const pctPago = total > 0 ? Math.round((pagas / total) * 100) : 0;
    return { pagas, aPagar, vence7d, atrasadas, total, pctPago, viramInad, proxData, proxDias };
  }, [todasFaturas]);

  const chaveSelecao = (f: Fatura) => `${f.proposta.id}_${f.numero_fatura ?? f.numero_referencia}`;
  const toggleSelFat = (k: string) => {
    setSelecionadasFat(prev => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  };
  const selecionarTodasFat = (lista: Fatura[]) => {
    const chaves = lista.map(chaveSelecao);
    const todasSelecionadas = chaves.length > 0 && chaves.every(k => selecionadasFat.has(k));
    setSelecionadasFat(prev => {
      const n = new Set(prev);
      if (todasSelecionadas) chaves.forEach(k => n.delete(k));
      else chaves.forEach(k => n.add(k));
      return n;
    });
  };

  // 🆕 seleção de CLIENTES na tabela principal
  const toggleSelCliente = (id: number) => {
    setClientesSel(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };
  const selecionarTodosClientesPagina = () => {
    const ids = clientesPagina.map(c => c.proposta.id);
    const todosSel = ids.length > 0 && ids.every(id => clientesSel.has(id));
    setClientesSel(prev => {
      const n = new Set(prev);
      if (todosSel) ids.forEach(id => n.delete(id));
      else ids.forEach(id => n.add(id));
      return n;
    });
  };

  const abrirStatus = (f: Fatura, statusInicial: StatusFatura = "paga") => {
    setNovoStatus(statusInicial);
    setStatusData(new Date().toISOString().slice(0, 10));
    setStatusForma(f.proposta.forma_pagamento || "");
    setStatusValor(String(f.valor.toFixed(2)));
    setStatusPromessa("");
    setStatusObs(f.observacoes || "");
    setShowStatus(f);
  };

  const confirmarStatus = async () => {
    if (!showStatus) return;
    const f = showStatus;
    const meta = STATUS_META[novoStatus];
    const payload: any = {
      proposta_id: f.proposta.id,
      numero_referencia: f.numero_referencia,
      status: novoStatus,
      atualizado_por: userEmail || null,
      observacoes: statusObs || null,
    };
    if (meta?.recebido) {
      payload.data_pagamento = statusData || new Date().toISOString().slice(0, 10);
      payload.forma_pagamento = statusForma || null;
      payload.valor_pago = statusValor ? parseFloat(statusValor.replace(",", ".")) : f.valor;
    } else {
      payload.data_pagamento = null;
      payload.valor_pago = null;
    }
    if (novoStatus === "promessa" && statusPromessa) {
      payload.promessa_data = statusPromessa;
    } else {
      payload.promessa_data = null;
    }

    const { error } = await supabase.from("faturas_status").upsert(payload, {
      onConflict: "proposta_id,numero_referencia",
    });
    if (error) {
      setFeedback({ tipo: "erro", titulo: "Não foi possível salvar", mensagem: error.message });
      return;
    }
    setShowStatus(null);
    await fetchStatusFaturas();
  };

  const marcarAPagar = async (f: Fatura) => {
    const { error } = await supabase.from("faturas_status").upsert({
      proposta_id: f.proposta.id, numero_referencia: f.numero_referencia,
      status: "pendente", data_pagamento: null, valor_pago: null, promessa_data: null,
      atualizado_por: userEmail || null,
    }, { onConflict: "proposta_id,numero_referencia" });
    if (error) {
      setFeedback({ tipo: "erro", titulo: "Erro ao atualizar", mensagem: error.message });
      return;
    }
    await fetchStatusFaturas();
  };

  const clienteCancelou = (f: Fatura) => {
    setFeedback({
      tipo: "aviso",
      titulo: "Cliente cancelou o serviço?",
      mensagem: `Isso vai mudar o status da proposta de ${f.proposta.nome || "—"} para CANCELADA. As faturas dele param de aparecer na cobrança. Faturas já pagas ficam no histórico.`,
      onConfirmar: async () => {
        setFeedback(null);
        const { error } = await supabase
          .from("proposta")
          .update({ status_venda: "CANCELADA", data_cancelamento: new Date().toISOString().slice(0, 10) })
          .eq("id", f.proposta.id);
        if (error) {
          setFeedback({ tipo: "erro", titulo: "Erro ao cancelar", mensagem: error.message });
          return;
        }
        await fetchPropostas();
        setFeedback({ tipo: "sucesso", titulo: "Cliente cancelado", mensagem: `${f.proposta.nome || "—"} foi marcado como CANCELADA no CRM.` });
      },
    });
  };

  const abrirEnvioCrm = () => {
    if (selecionadasFat.size === 0) {
      setFeedback({ tipo: "aviso", titulo: "Nenhuma fatura selecionada", mensagem: "Marque ao menos uma fatura pra disparar a cobrança." });
      return;
    }
    const contatos = todasFaturas
      .filter(f => selecionadasFat.has(chaveSelecao(f)))
      .map(f => {
        const p = f.proposta;
        const tel = normalizarTelefone(p.telefone1) || normalizarTelefone(p.telefone2) || normalizarTelefone(p.telefone3);
        return {
          nome: p.nome || "Cliente", telefone: tel,
          vars: {
            nome: p.nome || "Cliente", telefone: tel,
            plano: p.plano || "",
            valor: formatBRL(f.valor),
            vencimento: formatData(f.data_vencimento),
            mes_referencia: formatMesExtenso(f.numero_referencia),
            dias_atraso: f.dias_atraso > 0 ? String(f.dias_atraso) : "0",
            operadora: p.operadora || "",
          },
        };
      })
      .filter(c => c.telefone.length >= 10);
    if (contatos.length === 0) {
      setFeedback({ tipo: "aviso", titulo: "Nenhum telefone válido", mensagem: "Os clientes selecionados não têm telefone com 10+ dígitos." });
      return;
    }
    setEnvioFonte("crm");
    setEnvioModoTrocavel(false);   // veio de faturas específicas → modo fixo "fatura"
    setEnvioModo("fatura");
    setEnvioContatos(contatos);
    setEnvioNomeCampanha(`Cobrança CRM ${new Date().toLocaleDateString("pt-BR")} (${contatos.length} faturas)`);
    setShowEnvio(true);
  };

  // 🆕 monta os contatos de uma lista de CLIENTES, conforme o modo escolhido.
  //    modo "cliente" = 1 mensagem por cliente (resumo das faturas em aberto)
  //    modo "fatura"  = 1 mensagem por fatura em aberto
  const montarContatosClientes = (lista: any[], modo: "cliente" | "fatura") => {
    const contatos: { nome: string; telefone: string; vars: Record<string, string> }[] = [];
    for (const c of lista) {
      const p = c.proposta;
      const tel = normalizarTelefone(p.telefone1) || normalizarTelefone(p.telefone2) || normalizarTelefone(p.telefone3);
      if (tel.length < 10) continue;
      // faturas em aberto do cliente (não pagas)
      const abertas = (c.faturas as Fatura[]).filter(f => !STATUS_META[f.status_visual]?.recebido);
      const base = abertas.length > 0 ? abertas : (c.faturas as Fatura[]);
      if (modo === "fatura") {
        for (const f of abertas) {
          contatos.push({
            nome: p.nome || "Cliente", telefone: tel,
            vars: {
              nome: p.nome || "Cliente", telefone: tel, plano: p.plano || "",
              valor: formatBRL(f.valor), vencimento: formatData(f.data_vencimento),
              mes_referencia: formatMesExtenso(f.numero_referencia),
              dias_atraso: f.dias_atraso > 0 ? String(f.dias_atraso) : "0",
              operadora: p.operadora || "",
              qtd_faturas: "1", total_aberto: formatBRL(f.valor),
            },
          });
        }
      } else {
        // 1 mensagem por cliente: resumo. Usa a fatura em aberto mais antiga como referência.
        const ref = [...base].sort((a, b) => a.data_vencimento.getTime() - b.data_vencimento.getTime())[0];
        const totalAberto = abertas.reduce((s, f) => s + f.valor, 0);
        contatos.push({
          nome: p.nome || "Cliente", telefone: tel,
          vars: {
            nome: p.nome || "Cliente", telefone: tel, plano: p.plano || "",
            valor: formatBRL(totalAberto || ref?.valor || 0),
            vencimento: ref ? formatData(ref.data_vencimento) : "",
            mes_referencia: ref ? formatMesExtenso(ref.numero_referencia) : "",
            dias_atraso: ref && ref.dias_atraso > 0 ? String(ref.dias_atraso) : "0",
            operadora: p.operadora || "",
            qtd_faturas: String(abertas.length || base.length),
            total_aberto: formatBRL(totalAberto),
          },
        });
      }
    }
    return contatos;
  };

  // 🆕 abre o disparo a partir de uma lista de CLIENTES (tabela ou modal). Modo trocável.
  const abrirEnvioClientes = (lista: any[], modoInicial: "cliente" | "fatura" = "cliente") => {
    if (lista.length === 0) {
      setFeedback({ tipo: "aviso", titulo: "Nenhum cliente selecionado", mensagem: "Marque ao menos um cliente pra disparar a cobrança." });
      return;
    }
    const contatos = montarContatosClientes(lista, modoInicial);
    if (contatos.length === 0) {
      setFeedback({ tipo: "aviso", titulo: "Nenhum telefone válido", mensagem: "Os clientes selecionados não têm telefone com 10+ dígitos, ou não têm fatura em aberto." });
      return;
    }
    setEnvioFonte("crm");
    setEnvioOrigemClientes(lista);
    setEnvioModoTrocavel(true);
    setEnvioModo(modoInicial);
    setEnvioContatos(contatos);
    setEnvioNomeCampanha(`Cobrança CRM ${new Date().toLocaleDateString("pt-BR")} (${lista.length} cliente${lista.length > 1 ? "s" : ""})`);
    setShowEnvio(true);
  };

  const onArquivoSelecionado = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setPlanilhaNomeArquivo(f.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, raw: false, defval: "" });
        if (!rows || rows.length === 0) {
          setFeedback({ tipo: "aviso", titulo: "Planilha vazia", mensagem: "Não consegui ler nenhuma linha do arquivo." });
          return;
        }
        setPlanilhaLinhas(rows);
        setSelecionadosPlanilha(new Set());
        const cabec = (rows[0] || []).map((c: any) => String(c || "").toLowerCase().trim());
        const novoMap: Record<string, number> = {};
        const padroes = {
          telefone: ["telefone", "celular", "fone", "whatsapp", "numero", "número", "tel", "phone"],
          nome:     ["nome", "cliente", "name", "contato"],
          valor:    ["valor", "preço", "preco", "value", "fatura", "boleto", "amount", "total"],
          vencimento: ["vencimento", "vence", "due", "data", "dia"],
          plano:    ["plano", "produto", "servico", "serviço", "pacote"],
          codigo:   ["codigo", "código", "id", "ref", "referencia", "referência"],
        };
        for (const [campo, palavras] of Object.entries(padroes)) {
          const idx = cabec.findIndex(c => palavras.some(p => c.includes(p)));
          if (idx >= 0) novoMap[campo] = idx;
        }
        setMapeamento(novoMap);
      } catch (err: any) {
        setFeedback({ tipo: "erro", titulo: "Não consegui ler o arquivo", mensagem: err?.message || "Verifique se o arquivo é .csv, .xlsx ou .xls válido." });
      }
    };
    reader.readAsArrayBuffer(f);
    if (inputArquivoRef.current) inputArquivoRef.current.value = "";
  };

  const planilhaDados = useMemo(() => {
    if (planilhaLinhas.length === 0) return [];
    return primeiraLinhaCabecalho ? planilhaLinhas.slice(1) : planilhaLinhas;
  }, [planilhaLinhas, primeiraLinhaCabecalho]);

  const cabecalhoColunas = useMemo(() => {
    if (planilhaLinhas.length === 0) return [];
    if (primeiraLinhaCabecalho) return (planilhaLinhas[0] || []).map((c: any) => String(c || "").trim() || "(vazio)");
    const n = (planilhaLinhas[0] || []).length;
    return Array.from({ length: n }, (_, i) => `Coluna ${String.fromCharCode(65 + i)}`);
  }, [planilhaLinhas, primeiraLinhaCabecalho]);

  const linhasMapeadas = useMemo(() => {
    return planilhaDados.map(linha => {
      const obj: Record<string, string> = {};
      for (const campo of CAMPOS_PLANILHA) {
        const idx = mapeamento[campo.key];
        obj[campo.key] = idx !== undefined ? String(linha[idx] || "").trim() : "";
      }
      return obj;
    });
  }, [planilhaDados, mapeamento]);

  const linhasValidas = useMemo(() => {
    return linhasMapeadas.filter(l => normalizarTelefone(l.telefone).length >= 10);
  }, [linhasMapeadas]);

  const toggleSelPlanilha = (idx: number) => {
    setSelecionadosPlanilha(prev => {
      const novo = new Set(prev);
      if (novo.has(idx)) novo.delete(idx); else novo.add(idx);
      return novo;
    });
  };
  const selecionarTodosPlanilha = () => {
    setSelecionadosPlanilha(prev => {
      if (prev.size === linhasValidas.length) return new Set();
      return new Set(linhasValidas.map((_, i) => i));
    });
  };

  const abrirEnvioPlanilha = () => {
    const idsParaEnvio = selecionadosPlanilha.size > 0
      ? linhasValidas.filter((_, i) => selecionadosPlanilha.has(i))
      : linhasValidas;
    if (idsParaEnvio.length === 0) {
      setFeedback({ tipo: "aviso", titulo: "Nenhuma linha válida", mensagem: "Faça o mapeamento de pelo menos a coluna Telefone, ou selecione linhas com telefone válido." });
      return;
    }
    const contatos = idsParaEnvio.map(l => ({
      nome: l.nome || "Cliente",
      telefone: normalizarTelefone(l.telefone),
      vars: {
        nome: l.nome || "Cliente",
        telefone: normalizarTelefone(l.telefone),
        plano: l.plano || "", valor: l.valor || "",
        vencimento: l.vencimento || "", codigo: l.codigo || "",
      },
    }));
    setEnvioFonte("planilha");
    setEnvioContatos(contatos);
    setEnvioNomeCampanha(`Cobrança planilha ${planilhaNomeArquivo || ""} (${contatos.length} contatos)`);
    setShowEnvio(true);
  };

  const dispararCobranca = async () => {
    if (!envioCanalId) {
      setFeedback({ tipo: "aviso", titulo: "Selecione um canal", mensagem: "Escolha qual WhatsApp vai disparar a cobrança." });
      return;
    }
    if (envioTipo === "webjs" && !envioMensagem.trim()) {
      setFeedback({ tipo: "aviso", titulo: "Mensagem vazia", mensagem: "Escreva a mensagem de cobrança." });
      return;
    }
    if (envioTipo === "waba" && !envioTemplateId) {
      setFeedback({ tipo: "aviso", titulo: "Template não selecionado", mensagem: "Escolha um template WABA aprovado." });
      return;
    }

    setEnvioEnviando(true);
    try {
      const rota = envioTipo === "waba" ? "disparos/criar-waba" : "disparos/criar";
      const resp = await fetch(`/api/whatsapp?rota=${rota}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          canalId: envioCanalId,
          criadoPor: userEmail,
          nome: envioNomeCampanha,
          origem: "cobranca",
          contatos: envioContatos.map(c => ({ numero: c.telefone, vars: c.vars })),
          mensagem: envioTipo === "webjs" ? envioMensagem : undefined,
          templateId: envioTipo === "waba" ? envioTemplateId : undefined,
          delayMinSeg: envioDelayMin,
          delayMaxSeg: envioDelayMax,
        }),
      });
      const data = await resp.json();
      if (data.success) {
        setShowEnvio(false);
        setSelecionadasFat(new Set());
        setClientesSel(new Set());
        setSelecionadosPlanilha(new Set());
        setFeedback({
          tipo: "sucesso",
          titulo: "Cobrança disparada!",
          mensagem: `Campanha "${envioNomeCampanha}" criada com ${envioContatos.length} contatos. Os envios começam agora, respeitando o delay configurado.`,
          detalhes: [`Disparo ID: ${data.disparoId}`, `Acompanhe na aba Campanhas.`],
        });
        await fetchCampanhas();
        setAba("campanhas");
      } else {
        setFeedback({ tipo: "erro", titulo: "Não foi possível disparar", mensagem: data.error || "Erro desconhecido do backend." });
      }
    } catch (e: any) {
      setFeedback({
        tipo: "erro",
        titulo: "Erro de rede ao disparar",
        mensagem: e?.message || "Não consegui conectar com o servidor de WhatsApp.",
        detalhes: ["Verifique se o backend de WhatsApp está rodando."],
      });
    }
    setEnvioEnviando(false);
  };

  const previewMensagem = useMemo(() => {
    if (envioContatos.length === 0) return envioMensagem;
    return substituirVars(envioMensagem, envioContatos[0].vars);
  }, [envioMensagem, envioContatos]);

  // Loading permissão
  if (permitido === null) {
    return (
      <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "#6b7280", fontSize: 13 }}>⏳ Verificando permissões...</div>
      </div>
    );
  }

  if (!permitido) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh", padding: 32 }}>
        <div style={{ ...cardStyle, padding: 48, textAlign: "center", maxWidth: 480 }}>
          <div style={{ width: 80, height: 80, borderRadius: 20, background: "linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40, margin: "0 auto 16px", boxShadow: "0 12px 24px rgba(220,38,38,0.25)" }}>🔒</div>
          <h1 style={{ color: "#1f2937", fontSize: 18, fontWeight: 700, margin: "0 0 8px" }}>Sem acesso à Cobrança</h1>
          <p style={{ color: "#6b7280", fontSize: 13, margin: "0 0 8px" }}>
            Teu grupo de permissão <b style={{ color: "#374151" }}>{perm.grupoNome || "(sem grupo)"}</b> não tem acesso ao módulo de Cobrança.
          </p>
          <p style={{ color: "#9ca3af", fontSize: 12, margin: "0 0 22px" }}>Peça ao admin pra ativar <code style={{ background: "#f3f4f6", padding: "1px 6px", borderRadius: 4, fontFamily: "monospace" }}>cobranca.acessar</code> no teu grupo.</p>
          <button onClick={() => router.back()}
            style={{ background: "linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)", color: "white", border: "none", borderRadius: 12, padding: "11px 24px", fontSize: 13, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 12px rgba(37,99,235,0.3)" }}>← Voltar</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: isMobile ? 14 : 24, background: "#f8fafc", minHeight: "100vh", display: "flex", flexDirection: "column", gap: 14 }}>
      {/* HEADER */}
      <div style={{ ...cardStyle, padding: isMobile ? 16 : 20, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: "linear-gradient(135deg, #2563eb 0%, #3b82f6 50%, #4f46e5 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, boxShadow: "0 4px 12px rgba(37,99,235,0.3)" }}>💰</div>
          <div>
            <h1 style={{ color: "#1f2937", fontSize: isMobile ? 17 : 20, fontWeight: 800, margin: 0, letterSpacing: -0.3 }}>Cobrança — Negociações</h1>
            <p style={{ color: "#6b7280", fontSize: 12, margin: "2px 0 0" }}>
              UnitaSystem · <b style={{ color: "#2563eb" }}>Grupo Unita</b> · Cobre direto do CRM ou suba uma planilha
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => router.push("/crm/cobranca/dashboard")} style={{ background: "#fff", color: "#374151", border: "1px solid #e5e7eb", borderRadius: 10, padding: "9px 14px", fontSize: 12.5, cursor: "pointer", fontWeight: 600 }}>📊 Dashboard</button>
          <button onClick={() => router.push("/crm/cobranca/atualizacao")} style={{ background: "#fff", color: "#374151", border: "1px solid #e5e7eb", borderRadius: 10, padding: "9px 14px", fontSize: 12.5, cursor: "pointer", fontWeight: 600 }}>📤 Atualizar planilha</button>
        </div>
      </div>

      {/* BANNER TABELAS FALTANDO */}
      {tabelasFaltando.length > 0 && (
        <div style={{
          background: "linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)",
          border: "1px solid #fcd34d", borderLeft: "4px solid #f59e0b",
          borderRadius: 12, padding: "12px 16px",
          display: "flex", gap: 12, alignItems: "flex-start",
        }}>
          <span style={{ fontSize: 22 }}>⚠️</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ color: "#92400e", fontSize: 13, margin: 0, fontWeight: 700 }}>Algumas tabelas não foram encontradas no Supabase</p>
            <p style={{ color: "#78350f", fontSize: 12, margin: "4px 0 0", lineHeight: 1.5 }}>
              {tabelasFaltando.map(t => <code key={t} style={{ background: "#fef3c7", padding: "1px 6px", borderRadius: 4, fontFamily: "monospace", fontSize: 11.5, marginRight: 4 }}>{t}</code>)}
              <br/>Rode o SQL de setup correspondente pra liberar essa funcionalidade. {tabelasFaltando.includes("faturas_status") && <b>(faturas_status guarda quais faturas foram pagas)</b>}
            </p>
          </div>
        </div>
      )}

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: isMobile ? 10 : 14 }}>
        <KPI cor="#16a34a" bg="#f0fdf4" icone="✅" label="Faturas pagas"      valor={formatNum(kpis.pagas)}     sub={`${kpis.pctPago}% do total`} isMobile={isMobile} />
        <KPI cor="#d97706" bg="#fffbeb" icone="⏳" label="Faturas a pagar"    valor={formatNum(kpis.aPagar)}    sub={`${formatNum(kpis.atrasadas)} já vencida(s)`} isMobile={isMobile} />
        <KPI cor="#2563eb" bg="#eff6ff" icone="📅" label="Vencem em 7 dias"   valor={formatNum(kpis.vence7d)}   sub="faturas a vencer" isMobile={isMobile} />
        <KPI cor="#dc2626" bg="#fef2f2" icone="🚨" label={kpis.proxData ? `Pague até ${kpis.proxData.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}` : "Próximo corte"} valor={formatNum(kpis.viramInad)} sub={kpis.proxDias != null ? (kpis.proxDias === 0 ? "viram inadimplentes HOJE" : `viram inadimplentes em ${kpis.proxDias}d`) : "nenhuma a vencer"} isMobile={isMobile} />
      </div>

      {/* TABS */}
      <div style={{ ...cardStyle, padding: 6, display: "flex", gap: 4, overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
        {([
          { key: "do_crm",    label: "📅 Do CRM",   color: "#dc2626" },
          { key: "campanhas", label: "📊 Campanhas", color: "#2563eb" },
          { key: "atendimentos", label: "💬 Atendimentos", color: "#16a34a" },
        ] as { key: AbaKey; label: string; color: string }[]).map(t => {
          const at = aba === t.key;
          return (
            <button key={t.key} onClick={() => setAba(t.key)}
              style={{ background: at ? `linear-gradient(135deg, ${t.color} 0%, ${t.color}dd 100%)` : "transparent", color: at ? "white" : "#6b7280", border: "none", borderRadius: 10, padding: "9px 16px", fontSize: 12, cursor: "pointer", fontWeight: 700, boxShadow: at ? `0 4px 12px ${t.color}40` : "none", whiteSpace: "nowrap", flexShrink: 0 }}>
              {t.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div style={{ ...cardStyle, padding: 48, textAlign: "center", color: "#6b7280" }}>Carregando...</div>
      ) : (
        <>
          {/* ════════════ ABA: ATENDIMENTOS (retornos do disparo) ════════════ */}
          {aba === "atendimentos" && (
            <>
            <div style={{ ...cardStyle, padding: 18 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
                <div>
                  <h2 style={{ margin: 0, color: "#1f2937", fontSize: 15, fontWeight: 800 }}>💬 Leads que responderam a cobrança</h2>
                  <p style={{ margin: "3px 0 0", color: "#6b7280", fontSize: 12 }}>Clientes da cobrança com conversa movimentada após o 1º disparo · {respostasCob.length} encontrado(s)</p>
                </div>
                <button onClick={fetchRespostasCobranca} disabled={carregandoResp}
                  style={{ background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0", borderRadius: 10, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  {carregandoResp ? "⏳ Buscando..." : "🔄 Atualizar"}
                </button>
              </div>
              {carregandoResp ? (
                <p style={{ color: "#6b7280", fontSize: 13, textAlign: "center", padding: 24 }}>⏳ Cruzando disparos com os atendimentos...</p>
              ) : respostasCob.length === 0 ? (
                <p style={{ color: "#9ca3af", fontSize: 13, textAlign: "center", padding: 24 }}>Nenhum retorno ainda — dispare uma cobrança e os clientes que responderem aparecem aqui.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {respostasCob.map(({ a, cli }: any) => (
                    <div key={a.id} style={{ border: "1px solid #e5e7eb", borderLeft: "4px solid #16a34a", borderRadius: 12, background: "#ffffff" }}>
                      <div onClick={() => abrirConversaCob(a.numero)}
                        style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", cursor: "pointer", flexWrap: "wrap" }}>
                        <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                          <p style={{ margin: 0, color: "#1f2937", fontSize: 13.5, fontWeight: 800 }}>{cli.nome || a.nome || a.numero}</p>
                          <p style={{ margin: "2px 0 0", color: "#6b7280", fontSize: 11.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>💬 {a.mensagem || "(sem prévia)"}</p>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <p style={{ margin: 0, color: "#16a34a", fontSize: 12.5, fontWeight: 800 }}>R$ {Number(cli.valor_plano || 0).toFixed(2).replace(".", ",")}</p>
                          <p style={{ margin: "2px 0 0", color: "#9ca3af", fontSize: 10.5 }}>{cli.plano || ""}</p>
                        </div>
                        <div style={{ textAlign: "right", minWidth: 110 }}>
                          <p style={{ margin: 0, color: "#374151", fontSize: 11, fontWeight: 700 }}>{a.updated_at ? new Date(a.updated_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}</p>
                          <p style={{ margin: "2px 0 0", color: a.status === "resolvido" ? "#16a34a" : "#d97706", fontSize: 10.5, fontWeight: 700 }}>{a.status || ""}{a.atendente ? ` · ${String(a.atendente).split("@")[0]}` : ""}</p>
                        </div>
                        <span style={{ color: "#9ca3af", fontSize: 14, fontWeight: 700 }}>{convAberta === a.numero ? "▾" : "▸"}</span>
                      </div>
                      {convAberta === a.numero && (
                        <div style={{ borderTop: "1px solid #f3f4f6", background: "#f8fafc", padding: 12 }}>
                          {msgsConv.length === 0 ? (
                            <p style={{ color: "#9ca3af", fontSize: 12, margin: 0, textAlign: "center" }}>⏳ Carregando conversa...</p>
                          ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 320, overflowY: "auto" }}>
                              {msgsConv.map((m: any, i: number) => {
                                const doCliente = m.de === "cliente";
                                return (
                                  <div key={m.id || i} style={{ alignSelf: doCliente ? "flex-start" : "flex-end", maxWidth: "78%", background: doCliente ? "#ffffff" : "#dcfce7", border: "1px solid " + (doCliente ? "#e5e7eb" : "#bbf7d0"), borderRadius: 10, padding: "7px 11px" }}>
                                    <p style={{ margin: 0, color: "#1f2937", fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.mensagem}</p>
                                    <p style={{ margin: "3px 0 0", color: "#9ca3af", fontSize: 9.5, textAlign: "right" }}>{doCliente ? "cliente" : m.de} · {m.created_at ? new Date(m.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}</p>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          <div style={{ display: "flex", gap: 8, marginTop: 10, justifyContent: "flex-end" }}>
                            <a href="/chatbot" style={{ background: "linear-gradient(135deg, #16a34a 0%, #22c55e 100%)", color: "#fff", borderRadius: 9, padding: "8px 14px", fontSize: 12, fontWeight: 800, textDecoration: "none", boxShadow: "0 4px 12px rgba(22,163,74,0.3)" }}>↩️ Responder no Atendimento</a>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ░░ CHAT COMPLETO — só conversas dos canais de cobrança ░░ */}
            <div style={{ ...cardStyle, padding: 0, marginTop: 14, overflow: "hidden" }}>
              <div style={{ padding: "14px 18px", borderBottom: "1px solid #eef2f7" }}>
                <h2 style={{ margin: 0, color: "#1f2937", fontSize: 15, fontWeight: 800 }}>💬 Atendimentos dos canais de cobrança</h2>
                <p style={{ margin: "3px 0 0", color: "#6b7280", fontSize: 12 }}>Todas as conversas dos canais marcados com o módulo Cobrança.</p>
              </div>
              <div style={{ height: "70vh", minHeight: 480 }}>
                <ChatSection moduloFiltro="cobranca" />
              </div>
            </div>
            </>
          )}

          {/* ════════════ ABA: DO CRM ════════════ */}
          {/* ════════════ ABA: DO CRM ════════════ */}
          {aba === "do_crm" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

              {/* ░░ BARRA DE FILTROS — largura total ░░ */}
              <div style={{ ...cardStyle, padding: isMobile ? 12 : 16, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                {/* botão que abre/fecha o menu lateral de clientes */}
                <button onClick={() => setShowSidebar(s => !s)}
                  style={{ background: showSidebar ? "#2563eb" : "#eff6ff", color: showSidebar ? "#fff" : "#2563eb", border: `1px solid ${showSidebar ? "#2563eb" : "#bfdbfe"}`, borderRadius: 10, padding: "8px 14px", fontSize: 12.5, cursor: "pointer", fontWeight: 800, whiteSpace: "nowrap" }}>
                  {showSidebar ? "✕ Fechar clientes" : "👥 Clientes"}
                </button>

                {/* 🆕 MENU SUSPENSO de vencimentos detectados */}
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ color: "#6b7280", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>📅 Vencimento:</span>
                  <select value={filtroVencSel} onChange={e => { setFiltroVencSel(e.target.value); setSelecionadasFat(new Set()); setClienteSel(null); }}
                    style={{ ...inputStyle, width: "auto", padding: "8px 10px", cursor: "pointer", fontWeight: 600, minWidth: 180 }}>
                    <option value="">Todos os vencimentos</option>
                    {vencimentosDisponiveis.listaDias.length > 0 && (
                      <optgroup label="Por dia do mês">
                        {vencimentosDisponiveis.listaDias.map(o => (
                          <option key={o.value} value={o.value}>{o.label} — {formatNum(o.n)} fatura(s)</option>
                        ))}
                      </optgroup>
                    )}
                    {vencimentosDisponiveis.listaMeses.length > 0 && (
                      <optgroup label="Por mês de vencimento">
                        {vencimentosDisponiveis.listaMeses.map(o => (
                          <option key={o.value} value={o.value}>{o.label} — {formatNum(o.n)} fatura(s)</option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                  {filtroVencSel && (
                    <button onClick={() => setFiltroVencSel("")} style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", borderRadius: 20, padding: "6px 12px", fontSize: 12, cursor: "pointer", fontWeight: 700 }}>✕ Limpar</button>
                  )}
                </div>

                {/* atalhos rápidos de janela de vencimento */}
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {([
                    { k: "todos",       l: "🌐 Todos",          cor: "#6b7280" },
                    { k: "vencendo_7d", l: "🟡 Próx. 7 dias",   cor: "#f59e0b" },
                    { k: "hoje",        l: "⏰ Hoje",            cor: "#ea580c" },
                    { k: "vencidos",    l: "🔴 Vencidos",        cor: "#dc2626" },
                    { k: "este_mes",    l: "📆 Este mês",        cor: "#2563eb" },
                  ] as { k: FiltroVenc; l: string; cor: string }[]).map(f => {
                    const at = filtroVenc === f.k;
                    return (
                      <button key={f.k} onClick={() => { setFiltroVenc(f.k); setSelecionadasFat(new Set()); }}
                        style={{ background: at ? `${f.cor}15` : "#ffffff", color: at ? f.cor : "#6b7280", border: `1px solid ${at ? f.cor : "#e5e7eb"}`, borderRadius: 20, padding: "6px 12px", fontSize: 12, cursor: "pointer", fontWeight: at ? 700 : 600, whiteSpace: "nowrap" }}>
                        {f.l}
                      </button>
                    );
                  })}
                </div>

                <input value={filtroBusca} onChange={e => { const v = e.target.value; setFiltroBusca(v); if (v) { setFiltroVenc("todos"); setClienteSel(null); } }} placeholder="🔍 Nome, CPF, OS, telefone, plano..."
                  style={{ ...inputStyle, flex: 1, minWidth: 200, padding: "8px 12px" }} />
              </div>

              {/* ░░ STATUS + MÊS DE INSTALAÇÃO ░░ */}
              <div style={{ ...cardStyle, padding: isMobile ? 10 : 12, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ color: "#6b7280", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, marginRight: 4 }}>Status:</span>
                {([
                  { k: "todas",     l: "🌐 Todas",          cor: "#374151" },
                  { k: "pagas",     l: "✅ Pagas",           cor: "#16a34a" },
                  { k: "atrasadas", l: "🔴 Em aberto",      cor: "#dc2626" },
                  { k: "pendentes", l: "⏳ Em vencer",      cor: "#d97706" },
                  { k: "negociacao",l: "📞 Em negociação",  cor: "#7c3aed" },
                ] as { k: string; l: string; cor: string }[]).map(f => {
                  const at = filtroStatus === f.k;
                  return (
                    <button key={f.k} onClick={() => { setFiltroStatus(f.k); setSelecionadasFat(new Set()); }}
                      style={{ background: at ? `${f.cor}15` : "#ffffff", color: at ? f.cor : "#6b7280", border: `1px solid ${at ? f.cor : "#e5e7eb"}`, borderRadius: 20, padding: "5px 12px", fontSize: 12, cursor: "pointer", fontWeight: at ? 700 : 600, whiteSpace: "nowrap" }}>
                      {f.l}
                    </button>
                  );
                })}
                <span style={{ width: 1, height: 22, background: "#e5e7eb", margin: "0 4px" }} />
                <span style={{ color: "#6b7280", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>🛠️ Instalaram em:</span>
                <input type="month" value={mesInst} onChange={e => { setMesInst(e.target.value); setSelecionadasFat(new Set()); }} style={{ ...inputStyle, padding: "6px 10px", width: "auto" }} />
                {mesInst && (
                  <button onClick={() => setMesInst("")} style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", borderRadius: 20, padding: "5px 12px", fontSize: 12, cursor: "pointer", fontWeight: 700 }}>✕ Limpar mês</button>
                )}
              </div>

              {/* ░░ TABELA PRINCIPAL — UMA LINHA POR CLIENTE (clique abre as faturas) ░░ */}
              <div style={{ ...cardStyle, overflow: "hidden" }}>
                <div style={{ padding: "12px 16px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                  <div style={{ color: "#6b7280", fontSize: 12, fontWeight: 600 }}>
                    {clientesTabela.length > 0 ? (
                      <>Mostrando {(paginaSegura - 1) * TAM_PAGINA + 1}–{Math.min(paginaSegura * TAM_PAGINA, clientesTabela.length)} de {formatNum(clientesTabela.length)} cliente(s){clientesSel.size > 0 ? ` · ${clientesSel.size} selecionado(s)` : ""}</>
                    ) : (
                      <>0 cliente(s)</>
                    )}
                  </div>
                  {podeDisparar && clientesSel.size > 0 ? (
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <button onClick={() => setClientesSel(new Set())} style={{ ...btnSecundario, padding: "7px 12px" }}>✕ Limpar seleção</button>
                      <button onClick={() => abrirEnvioClientes(clientes.filter(c => clientesSel.has(c.proposta.id)), "cliente")}
                        style={{ ...btnPrimario, padding: "8px 16px" }}>
                        📤 Cobrar {clientesSel.size} cliente(s)
                      </button>
                    </div>
                  ) : (
                    <div style={{ color: "#9ca3af", fontSize: 11.5, fontWeight: 600 }}>👆 Clique no cliente pra ver as faturas{podeDisparar ? " · marque pra cobrar em lote" : ""}</div>
                  )}
                </div>

                {clientesTabela.length === 0 ? (
                  <div style={{ padding: 40, textAlign: "center" }}>
                    <div style={{ fontSize: 40, marginBottom: 8 }}>📋</div>
                    <p style={{ color: "#1f2937", fontSize: 14, fontWeight: 700, margin: "0 0 6px" }}>Nenhum cliente nesse filtro</p>
                    <p style={{ color: "#9ca3af", fontSize: 12, margin: "0 0 14px" }}>
                      As faturas vêm da planilha de status (uma linha por fatura). Suba a planilha em <b>Atualizar planilha</b> pra preencher os dados.<br/>
                      Confira também os filtros ativos acima — eles se somam.
                    </p>
                    <button onClick={() => { setFiltroVenc("todos"); setFiltroStatus("todas"); setFiltroBusca(""); setMesInst(""); setFiltroVencSel(""); setColNome(""); setColOs(""); setColCust(""); }}
                      style={{ background: "#eff6ff", color: "#2563eb", border: "1px solid #bfdbfe", borderRadius: 20, padding: "8px 18px", fontSize: 12.5, cursor: "pointer", fontWeight: 700 }}>
                      ✕ Limpar todos os filtros
                    </button>
                  </div>
                ) : (
                  <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", minWidth: isMobile ? 820 : "auto" }}>
                      <thead>
                        <tr style={{ background: "#f9fafb" }}>
                          {podeDisparar && (
                            <th style={{ width: 36, padding: "11px 12px", borderBottom: "1px solid #e5e7eb", textAlign: "center" }}>
                              <input type="checkbox" title="Selecionar página"
                                checked={clientesPagina.length > 0 && clientesPagina.every(c => clientesSel.has(c.proposta.id))}
                                onChange={selecionarTodosClientesPagina} style={{ cursor: "pointer", width: 15, height: 15, accentColor: "#2563eb" }} />
                            </th>
                          )}
                          {["Cliente", "Fraude", "Churn", "OS", "Custcode", "Situação", "Faturas", "Total em aberto", "Próximo vencimento", ""].map(h => (
                            <th key={h} style={{ padding: "11px 14px", color: "#6b7280", fontSize: 11, textAlign: "left", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700, borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap" }}>{h}</th>
                          ))}
                        </tr>
                        {/* linha de filtros por coluna (nome / OS / custcode) */}
                        <tr style={{ background: "#fff" }}>
                          {podeDisparar && <th style={{ borderBottom: "1px solid #e5e7eb" }}></th>}
                          {/* filtro Nome */}
                          <th style={{ padding: "4px 14px 8px", borderBottom: "1px solid #e5e7eb" }}>
                            <input value={colNome} onChange={e => setColNome(e.target.value)} placeholder="filtrar nome"
                              style={{ width: "100%", minWidth: 80, padding: "5px 8px", fontSize: 11, borderRadius: 7, border: `1px solid ${colNome ? "#bfdbfe" : "#e5e7eb"}`, background: colNome ? "#eff6ff" : "#fff", outline: "none", fontWeight: 400 }} />
                          </th>
                          {/* filtros Fraude e Churn */}
                          {([
                            { v: colFraude, set: setColFraude },
                            { v: colChurn, set: setColChurn },
                          ] as { v: string; set: (s: string) => void }[]).map((c, i) => (
                            <th key={"fc" + i} style={{ padding: "4px 14px 8px", borderBottom: "1px solid #e5e7eb" }}>
                              <select value={c.v} onChange={e => c.set(e.target.value)}
                                style={{ width: "100%", minWidth: 70, padding: "5px 8px", fontSize: 11, borderRadius: 7, border: `1px solid ${c.v ? "#bfdbfe" : "#e5e7eb"}`, background: c.v ? "#eff6ff" : "#fff", outline: "none", fontWeight: 400, cursor: "pointer" }}>
                                <option value="">Todos</option>
                                <option value="sim">Sim</option>
                                <option value="nao">Não</option>
                              </select>
                            </th>
                          ))}
                          {/* filtros OS e Custcode */}
                          <th style={{ padding: "4px 14px 8px", borderBottom: "1px solid #e5e7eb" }}>
                            <input value={colOs} onChange={e => setColOs(e.target.value)} placeholder="OS"
                              style={{ width: "100%", minWidth: 80, padding: "5px 8px", fontSize: 11, borderRadius: 7, border: `1px solid ${colOs ? "#bfdbfe" : "#e5e7eb"}`, background: colOs ? "#eff6ff" : "#fff", outline: "none", fontWeight: 400 }} />
                          </th>
                          <th style={{ padding: "4px 14px 8px", borderBottom: "1px solid #e5e7eb" }}>
                            <input value={colCust} onChange={e => setColCust(e.target.value)} placeholder="custcode"
                              style={{ width: "100%", minWidth: 80, padding: "5px 8px", fontSize: 11, borderRadius: 7, border: `1px solid ${colCust ? "#bfdbfe" : "#e5e7eb"}`, background: colCust ? "#eff6ff" : "#fff", outline: "none", fontWeight: 400 }} />
                          </th>
                          <th colSpan={4} style={{ borderBottom: "1px solid #e5e7eb", padding: "4px 14px" }}>
                            {(colNome || colOs || colCust || colFraude || colChurn) && (
                              <button onClick={() => { setColNome(""); setColOs(""); setColCust(""); setColFraude(""); setColChurn(""); }}
                                title="Limpar filtros de coluna" style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", borderRadius: 7, padding: "5px 10px", fontSize: 11, cursor: "pointer", fontWeight: 700, whiteSpace: "nowrap" }}>✕ Limpar</button>
                            )}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {clientesPagina.map((c, i) => {
                          const inad = c.situacao === "inadimplente";
                          return (
                            <tr key={c.proposta.id} onClick={() => setModalCliente(c.proposta.id)}
                              style={{ borderTop: "1px solid #f3f4f6", background: clientesSel.has(c.proposta.id) ? "#eff6ff" : (i % 2 === 0 ? "#ffffff" : "#fafbfc"), cursor: "pointer" }}
                              onMouseEnter={e => (e.currentTarget.style.background = "#eff6ff")}
                              onMouseLeave={e => (e.currentTarget.style.background = clientesSel.has(c.proposta.id) ? "#eff6ff" : (i % 2 === 0 ? "#ffffff" : "#fafbfc"))}>
                              {podeDisparar && (
                                <td onClick={e => e.stopPropagation()} style={{ padding: "12px", textAlign: "center" }}>
                                  <input type="checkbox" checked={clientesSel.has(c.proposta.id)} onChange={() => toggleSelCliente(c.proposta.id)}
                                    style={{ cursor: "pointer", width: 15, height: 15, accentColor: "#2563eb" }} />
                                </td>
                              )}
                              <td style={{ padding: "12px 14px", maxWidth: 240, borderLeft: `3px solid ${inad ? "#dc2626" : "#16a34a"}` }}>
                                <div style={{ color: "#1f2937", fontSize: 13.5, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.proposta.nome || "—"}</div>
                                <div style={{ color: "#9ca3af", fontSize: 11, fontFamily: "monospace" }}>{c.proposta.telefone1 || "—"} · {c.proposta.plano || "—"}</div>
                              </td>
                              {/* coluna Fraude */}
                              <td style={{ padding: "12px 14px", textAlign: "center", whiteSpace: "nowrap" }}>
                                {c.temFraude
                                  ? <span style={{ background: "#fef2f2", color: "#b91c1c", fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 999 }}>FRAUDE</span>
                                  : <span style={{ color: "#d1d5db", fontSize: 12 }}>—</span>}
                              </td>
                              {/* coluna Churn */}
                              <td style={{ padding: "12px 14px", textAlign: "center", whiteSpace: "nowrap" }}>
                                {c.temChurn
                                  ? <span style={{ background: "#fff7ed", color: "#c2410c", fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 999 }}>CHURN</span>
                                  : <span style={{ color: "#d1d5db", fontSize: 12 }}>—</span>}
                              </td>
                              <td style={{ padding: "12px 14px", whiteSpace: "nowrap" }}>
                                {c.proposta.dados_customizados?.os
                                  ? <span style={{ fontFamily: "monospace", fontSize: 11.5, color: "#7c3aed", fontWeight: 700 }}>{c.proposta.dados_customizados.os}</span>
                                  : <span style={{ color: "#d1d5db", fontSize: 12 }}>—</span>}
                              </td>
                              <td style={{ padding: "12px 14px", whiteSpace: "nowrap" }}>
                                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                                  {c.proposta.dados_customizados?.custcode
                                    ? <span style={{ fontFamily: "monospace", fontSize: 11.5, color: "#2563eb", fontWeight: 700 }}>{c.proposta.dados_customizados.custcode}</span>
                                    : <span style={{ color: "#d1d5db", fontSize: 12 }}>—</span>}
                                  <button onClick={e => { e.stopPropagation(); abrirEdicaoCliente(c.proposta); }} title="Editar OS / custcode" style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 11, color: "#9ca3af", padding: "0 2px" }}>✏️</button>
                                </span>
                              </td>
                              <td style={{ padding: "12px 14px", whiteSpace: "nowrap" }}>
                                {inad ? (
                                  <span style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", borderRadius: 8, padding: "3px 9px", fontSize: 11, fontWeight: 700 }}>🔴 Inadimplente</span>
                                ) : (
                                  <span style={{ background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0", borderRadius: 8, padding: "3px 9px", fontSize: 11, fontWeight: 700 }}>✅ Em dia</span>
                                )}
                              </td>
                              <td style={{ padding: "12px 14px", whiteSpace: "nowrap" }}>
                                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                  <span title="Total de faturas" style={{ color: "#374151", fontSize: 13, fontWeight: 700 }}>{c.faturas.length}</span>
                                  <span style={{ display: "flex", gap: 5, fontSize: 11, fontWeight: 700 }}>
                                    <span title="Pagas" style={{ color: c.pagas > 0 ? "#16a34a" : "#d1d5db" }}>✅{c.pagas}</span>
                                    <span title="Em aberto (vencidas)" style={{ color: c.emAberto > 0 ? "#dc2626" : "#d1d5db" }}>🔴{c.emAberto}</span>
                                    <span title="A vencer" style={{ color: c.aVencer > 0 ? "#d97706" : "#d1d5db" }}>⏳{c.aVencer}</span>
                                  </span>
                                </div>
                              </td>
                              <td style={{ padding: "12px 14px", whiteSpace: "nowrap", color: c.totalAberto > 0 ? "#dc2626" : "#9ca3af", fontSize: 13, fontWeight: 800 }}>
                                {c.totalAberto > 0 ? formatBRL(c.totalAberto) : "—"}
                              </td>
                              <td style={{ padding: "12px 14px", whiteSpace: "nowrap" }}>
                                {c.proxVenc ? (
                                  <div>
                                    <div style={{ color: "#1f2937", fontSize: 12, fontWeight: 600 }}>{formatData(c.proxVenc)}</div>
                                    <div style={{ color: c.proxDias <= 5 ? "#d97706" : "#2563eb", fontSize: 10, fontWeight: 700 }}>
                                      {c.proxDias === 0 ? "vence hoje" : `em ${c.proxDias}d`}
                                    </div>
                                  </div>
                                ) : c.atrasadas > 0 ? (
                                  <span style={{ color: "#dc2626", fontSize: 11, fontWeight: 700 }}>🔴 {c.atrasoMax}d em atraso</span>
                                ) : (
                                  <span style={{ color: "#16a34a", fontSize: 11, fontWeight: 600 }}>tudo pago</span>
                                )}
                              </td>
                              <td style={{ padding: "12px 14px", whiteSpace: "nowrap", textAlign: "right" }}>
                                <span style={{ color: "#2563eb", fontSize: 12, fontWeight: 700 }}>Ver faturas →</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* 🆕 RODAPÉ DE PAGINAÇÃO (10 clientes por página) */}
                {clientesTabela.length > TAM_PAGINA && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: 14, borderTop: "1px solid #f1f5f9", flexWrap: "wrap" }}>
                    <button onClick={() => setPagina(1)} disabled={paginaSegura === 1}
                      style={{ ...btnSecundario, padding: "7px 12px", opacity: paginaSegura === 1 ? 0.4 : 1, cursor: paginaSegura === 1 ? "not-allowed" : "pointer" }}>« Primeira</button>
                    <button onClick={() => setPagina(p => Math.max(1, p - 1))} disabled={paginaSegura === 1}
                      style={{ ...btnSecundario, padding: "7px 12px", opacity: paginaSegura === 1 ? 0.4 : 1, cursor: paginaSegura === 1 ? "not-allowed" : "pointer" }}>← Anterior</button>
                    <span style={{ color: "#374151", fontSize: 13, fontWeight: 700, padding: "0 8px" }}>Página {paginaSegura} de {formatNum(totalPaginas)}</span>
                    <button onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))} disabled={paginaSegura === totalPaginas}
                      style={{ ...btnSecundario, padding: "7px 12px", opacity: paginaSegura === totalPaginas ? 0.4 : 1, cursor: paginaSegura === totalPaginas ? "not-allowed" : "pointer" }}>Próxima →</button>
                    <button onClick={() => setPagina(totalPaginas)} disabled={paginaSegura === totalPaginas}
                      style={{ ...btnSecundario, padding: "7px 12px", opacity: paginaSegura === totalPaginas ? 0.4 : 1, cursor: paginaSegura === totalPaginas ? "not-allowed" : "pointer" }}>Última »</button>
                  </div>
                )}
              </div>
              {showSidebar && (
                <div onClick={() => setShowSidebar(false)} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.4)", zIndex: 200, display: "flex", justifyContent: "flex-start" }}>
                  <div onClick={e => e.stopPropagation()} style={{ width: isMobile ? "88%" : 380, maxWidth: "92vw", height: "100%", background: "#fff", boxShadow: "4px 0 24px rgba(0,0,0,0.18)", display: "flex", flexDirection: "column" }}>
                    <div style={{ padding: "14px 16px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 14, fontWeight: 800, color: "#1f2937" }}>👥 Clientes</span>
                      <button onClick={() => setShowSidebar(false)} style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 18, color: "#9ca3af" }}>✕</button>
                    </div>
                    <div style={{ display: "flex", gap: 6, padding: 10, borderBottom: "1px solid #f1f5f9" }}>
                      {([
                        { k: "inadimplentes", l: "Inadimplentes", n: qtdInad, cor: "#dc2626" },
                        { k: "em_dia", l: "Em dia", n: qtdEmDia, cor: "#16a34a" },
                        { k: "todos", l: "Todos", n: clientes.length, cor: "#475569" },
                      ] as { k: "inadimplentes" | "em_dia" | "todos"; l: string; n: number; cor: string }[]).map(seg => {
                        const at = segmento === seg.k;
                        return (
                          <button key={seg.k} onClick={() => { setSegmento(seg.k); setClienteSel(null); }}
                            style={{ flex: 1, background: at ? seg.cor : "#ffffff", color: at ? "#ffffff" : "#6b7280", border: `1px solid ${at ? seg.cor : "#e5e7eb"}`, borderRadius: 10, padding: "7px 4px", fontSize: 11, fontWeight: 700, cursor: "pointer", lineHeight: 1.3 }}>
                            {seg.l}<br /><span style={{ fontSize: 15, fontWeight: 800 }}>{seg.n}</span>
                          </button>
                        );
                      })}
                    </div>
                    <div style={{ padding: 10, borderBottom: "1px solid #f1f5f9" }}>
                      <input value={buscaCliente} onChange={e => setBuscaCliente(e.target.value)} placeholder="🔍 Nome, CPF ou OS..." style={{ ...inputStyle, padding: "8px 12px" }} />
                    </div>
                    <div style={{ overflowY: "auto", flex: 1, minHeight: 140 }}>
                      {clientesFiltrados.length === 0 ? (
                        <div style={{ padding: 28, textAlign: "center", color: "#9ca3af", fontSize: 12.5 }}>Nenhum cliente nesse filtro.</div>
                      ) : clientesFiltrados.map(c => {
                        const inad = c.situacao === "inadimplente";
                        return (
                          <button key={c.proposta.id} onClick={() => { setModalCliente(c.proposta.id); setShowSidebar(false); }}
                            style={{ width: "100%", textAlign: "left", display: "flex", gap: 10, alignItems: "center", padding: "11px 12px", border: "none", borderLeft: `3px solid ${inad ? "#dc2626" : "#16a34a"}`, borderBottom: "1px solid #f6f7f9", background: "#ffffff", cursor: "pointer" }}>
                            <span style={{ width: 9, height: 9, borderRadius: 999, background: inad ? "#dc2626" : "#16a34a", flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
                                <span style={{ color: "#1f2937", fontSize: 13, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.proposta.nome || "—"}</span>
                                <span onClick={ev => { ev.stopPropagation(); abrirEdicaoCliente(c.proposta); }} title="Editar OS / custcode" style={{ fontSize: 11, cursor: "pointer", color: "#9ca3af", flexShrink: 0 }}>✏️</span>
                              </div>
                              <div style={{ fontFamily: "monospace", fontSize: 10.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                <span style={{ color: c.proposta.dados_customizados?.os ? "#7c3aed" : "#d1d5db", fontWeight: 700 }}>{c.proposta.dados_customizados?.os || "sem OS"}</span>
                                <span style={{ color: "#d1d5db" }}> · </span>
                                <span style={{ color: c.proposta.dados_customizados?.custcode ? "#2563eb" : "#d1d5db", fontWeight: 700 }}>{c.proposta.dados_customizados?.custcode || "sem custcode"}</span>
                              </div>
                              <div style={{ color: "#9ca3af", fontSize: 11, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.proposta.plano || "—"}</div>
                            </div>
                            <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                              {inad ? (
                                <>
                                  <div style={{ color: "#dc2626", fontSize: 13, fontWeight: 800 }}>{formatBRL(c.totalAberto)}</div>
                                  <div style={{ color: "#9ca3af", fontSize: 10 }}>{c.atrasadas} mês · {c.atrasoMax}d</div>
                                </>
                              ) : (
                                <div style={{ color: "#16a34a", fontSize: 12, fontWeight: 700 }}>em dia</div>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}


          {/* ════════════ ABA: CAMPANHAS ════════════ */}
          {aba === "campanhas" && (
            <div style={{ ...cardStyle, overflow: "hidden" }}>
              <div style={{ padding: "14px 18px", borderBottom: "1px solid #e5e7eb" }}>
                <h3 style={{ color: "#1f2937", fontSize: 14, fontWeight: 700, margin: 0 }}>Campanhas de cobrança</h3>
                <p style={{ color: "#9ca3af", fontSize: 11, margin: "2px 0 0" }}>Histórico das cobranças disparadas. Atualiza em tempo real conforme o backend processa.</p>
              </div>
              {campanhas.length === 0 ? (
                <div style={{ padding: 48, textAlign: "center" }}>
                  <div style={{ fontSize: 40, marginBottom: 8 }}>📊</div>
                  <p style={{ color: "#1f2937", fontSize: 14, fontWeight: 700, margin: "0 0 6px" }}>Nenhuma campanha ainda</p>
                  <p style={{ color: "#9ca3af", fontSize: 12, margin: 0 }}>
                    Dispare uma cobrança na aba Do CRM ou Planilha que ela aparece aqui.
                  </p>
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "#f9fafb" }}>
                        {["Campanha", "Modo", "Status", "Contatos", "Enviados", "Falhas", "Criada"].map(h => (
                          <th key={h} style={{ padding: "10px 12px", color: "#6b7280", fontSize: 11, textAlign: "left", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700, borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {campanhas.map((c, i) => (
                        <tr key={c.id} style={{ borderTop: "1px solid #f3f4f6", background: i % 2 === 0 ? "#ffffff" : "#fafbfc" }}>
                          <td style={{ padding: "12px", color: "#1f2937", fontSize: 13, fontWeight: 700 }}>{c.nome}</td>
                          <td style={{ padding: "12px", color: "#6b7280", fontSize: 12 }}>{c.modo === "planilha" ? "📤 Planilha" : "📅 CRM"}</td>
                          <td style={{ padding: "12px" }}>
                            <span style={{ background: c.status === "concluida" ? "#f0fdf4" : c.status === "rodando" ? "#fffbeb" : "#fef2f2", color: c.status === "concluida" ? "#16a34a" : c.status === "rodando" ? "#f59e0b" : "#dc2626", border: "1px solid", borderRadius: 8, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>
                              {c.status}
                            </span>
                          </td>
                          <td style={{ padding: "12px", color: "#2563eb", fontSize: 12, fontWeight: 700 }}>{c.total_contatos}</td>
                          <td style={{ padding: "12px", color: "#16a34a", fontSize: 12, fontWeight: 700 }}>{c.total_enviados}</td>
                          <td style={{ padding: "12px", color: "#dc2626", fontSize: 12, fontWeight: 700 }}>{c.total_falhas}</td>
                          <td style={{ padding: "12px", color: "#9ca3af", fontSize: 11 }}>{new Date(c.created_at).toLocaleString("pt-BR")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* MODAL DE ENVIO */}
      {showEnvio && (
        <div onClick={() => !envioEnviando && setShowEnvio(false)} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#ffffff", borderRadius: 16, maxWidth: 720, width: "100%", maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 20px 50px rgba(0,0,0,0.25)" }}>
            <div style={{ padding: "18px 22px", borderBottom: "1px solid #e5e7eb", background: "linear-gradient(135deg, #eff6ff 0%, #ffffff 100%)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h3 style={{ color: "#1f2937", fontSize: 16, fontWeight: 800, margin: 0 }}>📤 Disparar cobrança</h3>
                <p style={{ color: "#6b7280", fontSize: 12, margin: "2px 0 0" }}>{envioContatos.length} contato(s) · fonte: {envioFonte === "crm" ? "📅 CRM" : "📤 Planilha"}</p>
              </div>
              <button onClick={() => setShowEnvio(false)} disabled={envioEnviando} style={{ background: "#f3f4f6", color: "#6b7280", border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 12, cursor: "pointer", fontWeight: 700 }}>✕</button>
            </div>

            <div style={{ padding: 22, overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={labelStyle}>Nome da campanha</label>
                <input value={envioNomeCampanha} onChange={e => setEnvioNomeCampanha(e.target.value)} style={inputStyle} placeholder="Ex: Cobrança Janeiro" />
              </div>

              {/* 🆕 MODO DE DISPARO — escolha na hora (só quando veio de seleção de clientes) */}
              {envioModoTrocavel && (
                <div>
                  <label style={labelStyle}>Como disparar</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    {([
                      { v: "cliente", l: "👤 1 mensagem por cliente", sub: "resumo das faturas em aberto" },
                      { v: "fatura",  l: "📄 1 mensagem por fatura", sub: "uma msg para cada fatura em aberto" },
                    ] as { v: "cliente" | "fatura"; l: string; sub: string }[]).map(o => (
                      <button key={o.v} onClick={() => { setEnvioModo(o.v); setEnvioContatos(montarContatosClientes(envioOrigemClientes, o.v)); }}
                        style={{ flex: 1, padding: "10px 12px", borderRadius: 10, textAlign: "left", border: envioModo === o.v ? "2px solid #2563eb" : "1px solid #e5e7eb", background: envioModo === o.v ? "#eff6ff" : "#ffffff", color: envioModo === o.v ? "#2563eb" : "#6b7280", cursor: "pointer" }}>
                        <div style={{ fontSize: 12.5, fontWeight: 700 }}>{o.l}</div>
                        <div style={{ fontSize: 10.5, color: "#9ca3af", marginTop: 2 }}>{o.sub}</div>
                      </button>
                    ))}
                  </div>
                  <p style={{ color: "#9ca3af", fontSize: 11, margin: "6px 0 0" }}>
                    💡 No modo por cliente use <code>{"{{qtd_faturas}}"}</code> e <code>{"{{total_aberto}}"}</code> na mensagem.
                  </p>
                </div>
              )}

              <div>
                <label style={labelStyle}>Tipo de envio</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {([
                    { v: "webjs", l: "📱 WhatsApp comum (texto livre)" },
                    { v: "waba",  l: "📨 WABA (template aprovado)" },
                  ] as { v: "webjs" | "waba"; l: string }[]).map(o => (
                    <button key={o.v} onClick={() => setEnvioTipo(o.v)}
                      style={{ flex: 1, padding: "10px 12px", borderRadius: 10, border: envioTipo === o.v ? "2px solid #2563eb" : "1px solid #e5e7eb", background: envioTipo === o.v ? "#eff6ff" : "#ffffff", color: envioTipo === o.v ? "#2563eb" : "#6b7280", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                      {o.l}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={labelStyle}>Canal WhatsApp</label>
                <select value={envioCanalId ?? ""} onChange={e => setEnvioCanalId(e.target.value ? parseInt(e.target.value) : null)} style={inputStyle}>
                  <option value="">Selecione um canal...</option>
                  {canais.filter(c => envioTipo === "waba" ? c.tipo === "waba" : c.tipo !== "waba").map(c => (
                    <option key={c.id} value={c.id}>{c.nome} ({c.tipo})</option>
                  ))}
                </select>
                {canais.length === 0 && (
                  <p style={{ color: "#f59e0b", fontSize: 11, margin: "4px 0 0" }}>⚠️ Nenhum canal cadastrado. Configure em Chatbot → Conexões.</p>
                )}
              </div>

              {envioTipo === "webjs" && (
                <>
                  <div>
                    <label style={labelStyle}>Mensagem (use {`{{nome}}, {{valor}}, {{vencimento}}, {{plano}}`})</label>
                    <textarea value={envioMensagem} onChange={e => setEnvioMensagem(e.target.value)} rows={6} style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} />
                  </div>
                  {envioContatos.length > 0 && (
                    <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: 12 }}>
                      <p style={{ color: "#14532d", fontSize: 11, fontWeight: 700, margin: "0 0 6px", textTransform: "uppercase", letterSpacing: 0.4 }}>👁️ Preview (1º contato: {envioContatos[0].nome})</p>
                      <p style={{ color: "#374151", fontSize: 13, margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{previewMensagem}</p>
                    </div>
                  )}
                </>
              )}

              {envioTipo === "waba" && (
                <div>
                  <label style={labelStyle}>Template aprovado</label>
                  <select value={envioTemplateId ?? ""} onChange={e => setEnvioTemplateId(e.target.value ? parseInt(e.target.value) : null)} style={inputStyle}>
                    <option value="">Selecione um template...</option>
                    {templates.filter(t => !envioCanalId || t.canal_id === envioCanalId).map(t => (
                      <option key={t.id} value={t.id}>{t.nome_amigavel || t.meta_template_name} ({t.idioma})</option>
                    ))}
                  </select>
                  {templates.length === 0 && (
                    <p style={{ color: "#f59e0b", fontSize: 11, margin: "4px 0 0" }}>⚠️ Nenhum template aprovado. Crie em Chatbot → Templates.</p>
                  )}
                </div>
              )}

              <div>
                <label style={labelStyle}>Delay entre envios (segundos)</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <input type="number" min={1} max={300} value={envioDelayMin} onChange={e => setEnvioDelayMin(parseInt(e.target.value) || 30)} style={inputStyle} placeholder="Mínimo" />
                  <input type="number" min={1} max={300} value={envioDelayMax} onChange={e => setEnvioDelayMax(parseInt(e.target.value) || 60)} style={inputStyle} placeholder="Máximo" />
                </div>
                <p style={{ color: "#9ca3af", fontSize: 10, margin: "4px 0 0" }}>💡 Recomendo 30-60s pra WebJS evitar ban. WABA pode ser mais rápido (1-3s).</p>
              </div>
            </div>

            <div style={{ padding: "14px 22px", borderTop: "1px solid #e5e7eb", background: "#fafbfc", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <span style={{ color: "#6b7280", fontSize: 12 }}>Vão ser enviadas {envioContatos.length} mensagens.</span>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setShowEnvio(false)} disabled={envioEnviando} style={btnSecundario}>Cancelar</button>
                <button onClick={dispararCobranca} disabled={envioEnviando} style={{ ...btnPrimario, opacity: envioEnviando ? 0.7 : 1, cursor: envioEnviando ? "wait" : "pointer" }}>
                  {envioEnviando ? "⏳ Enviando..." : "🚀 Disparar agora"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: MUDAR STATUS DA FATURA */}
      {showStatus && (() => {
        const f = showStatus;
        const meta = STATUS_META[novoStatus];
        const mostraDataPag = meta?.recebido;
        const mostraValor = meta?.recebido;
        const mostraForma = meta?.recebido;
        const mostraPromessa = novoStatus === "promessa";
        return (
          <div onClick={() => setShowStatus(null)} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100, padding: 16 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: "#ffffff", borderRadius: 16, maxWidth: 560, width: "100%", maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 20px 50px rgba(0,0,0,0.25)" }}>
              <div style={{ padding: "18px 22px", borderBottom: "1px solid #e5e7eb", background: `linear-gradient(135deg, ${meta.bg} 0%, #ffffff 100%)` }}>
                <h3 style={{ color: meta.color, fontSize: 16, fontWeight: 800, margin: 0 }}>{meta.icone} Mudar status da fatura</h3>
                <p style={{ color: "#6b7280", fontSize: 12, margin: "4px 0 0" }}>
                  {f.proposta.nome} · {formatMesExtenso(f.numero_referencia)} · {formatBRL(f.valor)} · venceu {formatData(f.data_vencimento)}
                </p>
              </div>
              <div style={{ padding: 22, display: "flex", flexDirection: "column", gap: 12, overflowY: "auto", flex: 1 }}>
                <div>
                  <label style={labelStyle}>Qual o status dessa fatura?</label>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 6 }}>
                    {(["paga", "atrasada", "pendente", "negociacao"] as StatusFatura[])
                      .map(s => {
                        const m = STATUS_META[s];
                        const at = novoStatus === s;
                        return (
                          <button key={s} type="button" onClick={() => setNovoStatus(s)}
                            style={{
                              background: at ? m.bg : "#ffffff",
                              border: at ? `2px solid ${m.color}` : "1px solid #e5e7eb",
                              borderRadius: 10, padding: "8px 10px", textAlign: "left",
                              cursor: "pointer", fontWeight: at ? 700 : 600,
                              color: at ? m.color : "#374151", fontSize: 12,
                              transition: "all 0.15s",
                            }}
                            title={m.descricao}>
                            <div>{m.icone} {m.label}</div>
                            <div style={{ fontSize: 10, fontWeight: 500, color: at ? m.color : "#9ca3af", marginTop: 2 }}>{m.descricao}</div>
                          </button>
                        );
                      })}
                  </div>
                </div>

                {mostraDataPag && (
                  <div>
                    <label style={labelStyle}>Data do pagamento</label>
                    <input type="date" value={statusData} onChange={e => setStatusData(e.target.value)} style={inputStyle} />
                  </div>
                )}
                {(mostraValor || mostraForma) && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    {mostraValor && (
                      <div>
                        <label style={labelStyle}>
                          {novoStatus === "paga_parcial" ? "Valor pago (parcial) *" : "Valor pago"}
                        </label>
                        <input type="text" value={statusValor} onChange={e => setStatusValor(e.target.value)} placeholder="0,00" style={inputStyle} />
                      </div>
                    )}
                    {mostraForma && (
                      <div>
                        <label style={labelStyle}>Forma de pagamento</label>
                        <select value={statusForma} onChange={e => setStatusForma(e.target.value)} style={inputStyle}>
                          <option value="">—</option>
                          <option value="PIX">PIX</option>
                          <option value="Boleto">Boleto</option>
                          <option value="Cartão de Crédito">Cartão de Crédito</option>
                          <option value="Cartão de Débito">Cartão de Débito</option>
                          <option value="Transferência">Transferência</option>
                          <option value="Dinheiro">Dinheiro</option>
                        </select>
                      </div>
                    )}
                  </div>
                )}
                {mostraPromessa && (
                  <div>
                    <label style={labelStyle}>Data prometida pelo cliente *</label>
                    <input type="date" value={statusPromessa} onChange={e => setStatusPromessa(e.target.value)} style={inputStyle} />
                    <p style={{ color: "#9ca3af", fontSize: 10, margin: "4px 0 0" }}>💡 Se passar dessa data sem pagar, a fatura volta a aparecer como atrasada.</p>
                  </div>
                )}
                <div>
                  <label style={labelStyle}>Observações (opcional)</label>
                  <textarea value={statusObs} onChange={e => setStatusObs(e.target.value)} rows={2} style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
                    placeholder={
                      novoStatus === "negociacao"  ? "Ex: pediu pra renegociar valor pra R$ 80" :
                      novoStatus === "acordo"      ? "Ex: parcelado em 3x" :
                      novoStatus === "paga_parcial" ? "Ex: pagou metade, restante pra próxima semana" :
                      novoStatus === "nao_pagara"  ? "Ex: cliente disse que vai cancelar" :
                      novoStatus === "cancelada"   ? "Ex: cortesia / erro de cobrança" :
                      novoStatus === "juridico"    ? "Ex: enviado pro dr. Fulano" :
                      "Notas internas sobre essa fatura"
                    } />
                </div>
              </div>
              <div style={{ padding: "14px 22px", borderTop: "1px solid #e5e7eb", background: "#fafbfc", display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button onClick={() => setShowStatus(null)} style={btnSecundario}>Cancelar</button>
                <button onClick={confirmarStatus}
                  style={{ background: `linear-gradient(135deg, ${meta.color} 0%, ${meta.color}dd 100%)`, color: "#ffffff", border: "none", borderRadius: 10, padding: "10px 22px", fontSize: 13, cursor: "pointer", fontWeight: 700, boxShadow: `0 4px 12px ${meta.color}40` }}>
                  {meta.icone} Confirmar como {meta.label}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* MODAL DE FEEDBACK */}
      {feedback && (() => {
        const cores = {
          erro:    { bg: "#fef2f2", border: "#fecaca", iconBg: "#fee2e2", icon: "#dc2626", titulo: "#991b1b", botao: "#dc2626", emoji: "⚠️" },
          aviso:   { bg: "#fffbeb", border: "#fde68a", iconBg: "#fef3c7", icon: "#d97706", titulo: "#92400e", botao: "#d97706", emoji: "🛡️" },
          sucesso: { bg: "#f0fdf4", border: "#bbf7d0", iconBg: "#dcfce7", icon: "#16a34a", titulo: "#14532d", botao: "#16a34a", emoji: "✅" },
          info:    { bg: "#eff6ff", border: "#bfdbfe", iconBg: "#dbeafe", icon: "#2563eb", titulo: "#1e3a8a", botao: "#2563eb", emoji: "ℹ️" },
        }[feedback.tipo];
        const ehConfirm = !!feedback.onConfirmar;
        return (
          <div onClick={() => !ehConfirm && setFeedback(null)} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1200, padding: 16 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: "#ffffff", borderRadius: 16, maxWidth: 520, width: "100%", maxHeight: "85vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 20px 50px rgba(0,0,0,0.25)" }}>
              <div style={{ background: cores.bg, borderBottom: `1px solid ${cores.border}`, padding: "22px 24px", display: "flex", gap: 14, alignItems: "flex-start" }}>
                <div style={{ width: 48, height: 48, borderRadius: 14, background: cores.iconBg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0 }}>{cores.emoji}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{ color: cores.titulo, fontSize: 16, fontWeight: 800, margin: "2px 0 6px" }}>{feedback.titulo}</h3>
                  <p style={{ color: "#374151", fontSize: 13, margin: 0, lineHeight: 1.55 }}>{feedback.mensagem}</p>
                </div>
              </div>
              {feedback.detalhes && feedback.detalhes.length > 0 && (
                <div style={{ padding: "16px 24px", overflowY: "auto", flex: 1, borderBottom: "1px solid #f3f4f6" }}>
                  <p style={{ color: "#6b7280", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, margin: "0 0 10px" }}>Detalhes</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {feedback.detalhes.map((d, i) => (
                      <div key={i} style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#374151" }}>{d}</div>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ padding: "14px 24px", background: "#fafbfc", display: "flex", justifyContent: "flex-end", gap: 8 }}>
                {ehConfirm && (
                  <button onClick={() => setFeedback(null)} style={btnSecundario}>Cancelar</button>
                )}
                <button onClick={() => { if (feedback.onConfirmar) feedback.onConfirmar(); else setFeedback(null); }}
                  style={{ background: cores.botao, color: "#ffffff", border: "none", borderRadius: 10, padding: "10px 22px", fontSize: 13, cursor: "pointer", fontWeight: 700, boxShadow: `0 4px 12px ${cores.botao}40` }}>
                  {ehConfirm ? (feedback.confirmarLabel || "Continuar") : "Entendi"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 🆕 MODAL — FATURAS DO CLIENTE (abre ao clicar numa linha da tabela) */}
      {modalCliente != null && (() => {
        const c = clientes.find(x => x.proposta.id === modalCliente);
        if (!c) return null;
        const faturasCli = [...c.faturas].sort((a: Fatura, b: Fatura) => (a.numero_fatura ?? 999) - (b.numero_fatura ?? 999) || a.data_vencimento.getTime() - b.data_vencimento.getTime());
        const corCod = (cod: string | null | undefined): { bg: string; cor: string; txt: string } => {
          const k = String(cod || "").replace(/\D/g, "").padStart(2, "0");
          if (k === "01") return { bg: "#f0fdf4", cor: "#16a34a", txt: "Pagou no prazo" };
          if (k === "02") return { bg: "#ecfdf5", cor: "#059669", txt: "Pagou até 30d" };
          if (k === "03") return { bg: "#fffbeb", cor: "#d97706", txt: "Pagou até 60d" };
          if (k === "04") return { bg: "#fef2f2", cor: "#dc2626", txt: "Pagou após 60d" };
          if (k === "05") return { bg: "#fef2f2", cor: "#b91c1c", txt: "Não pagou" };
          return { bg: "#f3f4f6", cor: "#6b7280", txt: "—" };
        };
        const mesAnoBR = (d: Date | string | null | undefined) => {
          if (!d) return "—";
          const dt = typeof d === "string" ? new Date(d.slice(0, 10) + "T00:00:00") : d;
          if (!dt || isNaN(dt.getTime())) return "—";
          return dt.toLocaleDateString("pt-BR", { month: "2-digit", year: "numeric" });
        };
        const precoce = faturasCli.some((f: Fatura) => f.codigo_status === "03" || f.codigo_status === "04");
        const selecionarTodasDoModal = () => selecionarTodasFat(faturasCli);
        return (
          <div onClick={() => setModalCliente(null)} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300, padding: isMobile ? 8 : 24 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 1100, maxHeight: "92vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 24px 60px rgba(0,0,0,0.3)" }}>
              {/* cabeçalho do modal */}
              <div style={{ padding: isMobile ? "14px 16px" : "18px 22px", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <h3 style={{ color: "#1f2937", fontSize: isMobile ? 16 : 18, fontWeight: 800, margin: 0 }}>{c.proposta.nome || "—"}</h3>
                    {c.temFraude && <span style={{ background: "#fef2f2", color: "#b91c1c", fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 999 }}>FRAUDE</span>}
                    {c.temChurn && <span style={{ background: "#fff7ed", color: "#c2410c", fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 999 }}>CHURN</span>}
                    {precoce && <span style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 999 }}>⚠️ INADIMPLÊNCIA PRECOCE</span>}
                  </div>
                  <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 6, fontSize: 12 }}>
                    <span style={{ color: "#6b7280" }}>OS: <b style={{ fontFamily: "monospace", color: "#7c3aed" }}>{c.proposta.dados_customizados?.os || "—"}</b></span>
                    <span style={{ color: "#6b7280" }}>Custcode: <b style={{ fontFamily: "monospace", color: "#2563eb" }}>{c.proposta.dados_customizados?.custcode || "—"}</b></span>
                    <span style={{ color: "#6b7280" }}>Plano: <b style={{ color: "#374151" }}>{c.proposta.plano || "—"}</b></span>
                    <span style={{ color: "#6b7280" }}>Tel: <b style={{ fontFamily: "monospace", color: "#374151" }}>{c.proposta.telefone1 || "—"}</b></span>
                  </div>
                </div>
                <button onClick={() => setModalCliente(null)} style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 20, color: "#9ca3af" }}>✕</button>
              </div>

              {/* resumo rápido */}
              <div style={{ padding: "10px 22px", borderBottom: "1px solid #f1f5f9", display: "flex", gap: 18, flexWrap: "wrap", fontSize: 12.5 }}>
                <span style={{ color: "#374151" }}>📄 <b>{c.faturas.length}</b> fatura(s)</span>
                <span style={{ color: "#16a34a" }}>✅ <b>{c.pagas}</b> paga(s)</span>
                <span style={{ color: "#dc2626" }}>🔴 <b>{c.emAberto}</b> em aberto</span>
                <span style={{ color: "#d97706" }}>⏳ <b>{c.aVencer}</b> a vencer</span>
                {c.totalAberto > 0 && <span style={{ color: "#dc2626", marginLeft: "auto", fontWeight: 800 }}>Total em aberto: {formatBRL(c.totalAberto)}</span>}
              </div>

              {/* tabela de faturas do cliente */}
              <div style={{ overflow: "auto", flex: 1 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 980 }}>
                  <thead style={{ position: "sticky", top: 0, zIndex: 1 }}>
                    <tr style={{ background: "#f9fafb" }}>
                      {podeDisparar && <th style={{ width: 36, padding: "10px 12px", borderBottom: "1px solid #e5e7eb" }}></th>}
                      {["Nº fat.", "Status pagamento", "Detalhamento", "Mês gross", "Mês venc.", "Data venc.", "Data pgto.", "Banco / Opção", "Fraude", "Churn", "Ações"].map(h => (
                        <th key={h} style={{ padding: "10px 12px", color: "#6b7280", fontSize: 10.5, textAlign: "left", textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 700, borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {faturasCli.map((f: Fatura, i: number) => {
                      const k = chaveSelecao(f);
                      const sel = selecionadasFat.has(k);
                      const cc = corCod(f.codigo_status);
                      const st = corStatus(f.status_visual);
                      return (
                        <tr key={k} style={{ borderTop: "1px solid #f3f4f6", background: sel ? "#eff6ff" : (i % 2 === 0 ? "#fff" : "#fafbfc") }}>
                          {podeDisparar && (
                            <td style={{ padding: "10px 12px", textAlign: "center" }}>
                              <input type="checkbox" checked={sel} onChange={() => toggleSelFat(k)} style={{ cursor: "pointer", width: 15, height: 15, accentColor: "#2563eb" }} />
                            </td>
                          )}
                          <td style={{ padding: "10px 12px", textAlign: "center" }}>
                            {f.numero_fatura != null
                              ? <span style={{ background: "#eff6ff", color: "#2563eb", fontWeight: 800, fontSize: 12, padding: "2px 9px", borderRadius: 999 }}>{f.numero_fatura}</span>
                              : <span style={{ color: "#d1d5db" }}>—</span>}
                          </td>
                          <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                            <span style={{ background: cc.bg, color: cc.cor, fontWeight: 700, fontSize: 11, padding: "2px 9px", borderRadius: 999 }}>{f.codigo_status || "—"} · {cc.txt}</span>
                            <div style={{ marginTop: 3 }}>
                              <span style={{ background: st.bg, color: st.color, border: `1px solid ${st.border}`, borderRadius: 6, padding: "1px 7px", fontSize: 10, fontWeight: 700 }}>{st.label}</span>
                            </div>
                          </td>
                          <td style={{ padding: "10px 12px", color: f.detalhamento ? "#374151" : "#d1d5db", maxWidth: 230, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 11.5 }} title={f.detalhamento || undefined}>{f.detalhamento || "—"}</td>
                          <td style={{ padding: "10px 12px", whiteSpace: "nowrap", color: f.mes_gross ? "#6b7280" : "#d1d5db" }}>{mesAnoBR(f.mes_gross)}</td>
                          <td style={{ padding: "10px 12px", whiteSpace: "nowrap", color: "#6b7280" }}>{mesAnoBR(f.data_vencimento)}</td>
                          <td style={{ padding: "10px 12px", whiteSpace: "nowrap", color: "#1f2937", fontWeight: 600 }}>
                            {formatData(f.data_vencimento)}
                            {f.status_visual === "atrasada" && <div style={{ color: "#dc2626", fontSize: 10, fontWeight: 700 }}>🔴 {f.dias_atraso}d atraso</div>}
                          </td>
                          <td style={{ padding: "10px 12px", whiteSpace: "nowrap", color: f.data_pagamento ? "#16a34a" : "#d1d5db", fontWeight: f.data_pagamento ? 700 : 400 }}>{f.data_pagamento ? formatData(f.data_pagamento) : "—"}</td>
                          <td style={{ padding: "10px 12px", whiteSpace: "nowrap", fontSize: 11 }}>
                            {f.nome_banco && <div style={{ color: "#374151" }}>{f.nome_banco}</div>}
                            {f.opcao_pagamento && <span style={{ background: "#f5f3ff", color: "#7c3aed", fontWeight: 700, fontSize: 10, padding: "1px 7px", borderRadius: 999 }}>{f.opcao_pagamento}</span>}
                            {!f.nome_banco && !f.opcao_pagamento && <span style={{ color: "#d1d5db" }}>—</span>}
                          </td>
                          <td style={{ padding: "10px 12px", textAlign: "center" }}>
                            {f.suspensao_fraude == null ? <span style={{ color: "#d1d5db" }}>—</span>
                              : f.suspensao_fraude ? <span style={{ background: "#fef2f2", color: "#b91c1c", fontWeight: 800, fontSize: 10, padding: "2px 8px", borderRadius: 999 }}>SIM</span>
                              : <span style={{ color: "#9ca3af", fontSize: 11 }}>não</span>}
                          </td>
                          <td style={{ padding: "10px 12px", textAlign: "center" }}>
                            {f.churn == null ? <span style={{ color: "#d1d5db" }}>—</span>
                              : f.churn ? <span style={{ background: "#fff7ed", color: "#c2410c", fontWeight: 800, fontSize: 10, padding: "2px 8px", borderRadius: 999 }}>SIM</span>
                              : <span style={{ color: "#9ca3af", fontSize: 11 }}>não</span>}
                          </td>
                          <td style={{ padding: "10px 12px" }}>
                            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                              {podeMudarStatus ? (
                                <>
                                  {STATUS_META[f.status]?.pendencia !== false || f.status === "pendente" ? (
                                    <button onClick={() => abrirStatus(f, "paga")} title="Marcar como paga"
                                      style={{ background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0", borderRadius: 6, padding: "4px 8px", fontSize: 10.5, cursor: "pointer", fontWeight: 700, whiteSpace: "nowrap" }}>✓ Paga</button>
                                  ) : (
                                    <button onClick={() => marcarAPagar(f)} title="Reverter status"
                                      style={{ background: "#fffbeb", color: "#d97706", border: "1px solid #fde68a", borderRadius: 6, padding: "4px 8px", fontSize: 10.5, cursor: "pointer", fontWeight: 700, whiteSpace: "nowrap" }}>↩ A pagar</button>
                                  )}
                                  <button onClick={() => abrirStatus(f, "promessa")} title="Mais status"
                                    style={{ background: "#eff6ff", color: "#2563eb", border: "1px solid #bfdbfe", borderRadius: 6, padding: "4px 8px", fontSize: 10.5, cursor: "pointer", fontWeight: 700, whiteSpace: "nowrap" }}>⚙</button>
                                </>
                              ) : (
                                <span style={{ color: "#9ca3af", fontSize: 10, fontStyle: "italic" }}>leitura</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* rodapé do modal */}
              <div style={{ padding: "12px 22px", borderTop: "1px solid #e5e7eb", background: "#fafbfc", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "space-between" }}>
                <button onClick={() => { abrirEdicaoCliente(c.proposta); }} style={{ ...btnSecundario, padding: "8px 14px" }}>✏️ Editar cliente</button>
                {podeDisparar && (
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <button onClick={() => abrirEnvioClientes([c], "cliente")}
                      style={{ ...btnSecundario, padding: "8px 14px", borderColor: "#bfdbfe", color: "#2563eb" }}>
                      📨 Cobrar cliente
                    </button>
                    <button onClick={selecionarTodasDoModal} style={{ ...btnSecundario, padding: "8px 14px" }}>
                      {faturasCli.every((f: Fatura) => selecionadasFat.has(chaveSelecao(f))) ? "✗ Desmarcar todas" : "✓ Selecionar todas"}
                    </button>
                    <button onClick={abrirEnvioCrm} disabled={selecionadasFat.size === 0}
                      style={{ ...btnPrimario, padding: "8px 16px", opacity: selecionadasFat.size === 0 ? 0.5 : 1, cursor: selecionadasFat.size === 0 ? "not-allowed" : "pointer" }}>
                      📤 Cobrar {selecionadasFat.size} fatura(s)
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ✏️ ADIÇÃO: MODAL — edição completa do cliente */}
      {editCliente && (
        <div onClick={() => setEditCliente(null)} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16, overflowY: "auto" }}>
          <div onClick={ev => ev.stopPropagation()} style={{ ...cardStyle, width: "100%", maxWidth: 620, padding: 24, maxHeight: "92vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
              <h3 style={{ color: "#1f2937", fontSize: 16, fontWeight: 800, margin: 0 }}>✏️ Editar cliente</h3>
              <button onClick={() => setEditCliente(null)} style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 18, color: "#9ca3af" }}>✕</button>
            </div>
            <p style={{ color: "#6b7280", fontSize: 12, margin: "0 0 16px" }}>Alterações salvam direto na venda do CRM.</p>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
              <div style={{ gridColumn: isMobile ? "auto" : "1 / -1" }}>
                <label style={labelStyle}>👤 Nome do cliente</label>
                <input value={editForm.nome || ""} onChange={e => setEditForm(f => ({ ...f, nome: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>🪪 CPF</label>
                <input value={editForm.cpf || ""} onChange={e => setEditForm(f => ({ ...f, cpf: e.target.value }))} style={{ ...inputStyle, fontFamily: "monospace" }} />
              </div>
              <div>
                <label style={labelStyle}>📱 Telefone</label>
                <input value={editForm.telefone1 || ""} onChange={e => setEditForm(f => ({ ...f, telefone1: e.target.value }))} style={{ ...inputStyle, fontFamily: "monospace" }} />
              </div>
              <div>
                <label style={labelStyle}>📦 Plano</label>
                <input value={editForm.plano || ""} onChange={e => setEditForm(f => ({ ...f, plano: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>📡 Operadora</label>
                <input value={editForm.operadora || ""} onChange={e => setEditForm(f => ({ ...f, operadora: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>💰 Valor do plano (R$)</label>
                <input value={editForm.valor_plano || ""} onChange={e => setEditForm(f => ({ ...f, valor_plano: e.target.value }))} placeholder="ex: 119.99" style={{ ...inputStyle, fontFamily: "monospace" }} />
              </div>
              <div>
                <label style={labelStyle}>📅 Vencimento (dia)</label>
                <input value={editForm.vencimento || ""} onChange={e => setEditForm(f => ({ ...f, vencimento: e.target.value }))} placeholder="ex: 10" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>💳 Forma de pagamento</label>
                <input value={editForm.forma_pagamento || ""} onChange={e => setEditForm(f => ({ ...f, forma_pagamento: e.target.value }))} placeholder="BOLETO / DACC..." style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>🛠️ Data de instalação</label>
                <input type="date" value={editForm.data_instalacao || ""} onChange={e => setEditForm(f => ({ ...f, data_instalacao: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>🔖 Ordem de serviço (OS)</label>
                <input value={editForm.os || ""} onChange={e => setEditForm(f => ({ ...f, os: e.target.value }))} placeholder="ex: 1-1688493179641" style={{ ...inputStyle, fontFamily: "monospace", borderColor: "#ddd6fe" }} />
              </div>
              <div>
                <label style={labelStyle}>🏷️ Custcode</label>
                <input value={editForm.custcode || ""} onChange={e => setEditForm(f => ({ ...f, custcode: e.target.value }))} placeholder="ex: 1.347330633" style={{ ...inputStyle, fontFamily: "monospace", borderColor: "#bfdbfe" }} />
              </div>
            </div>
            <p style={{ color: "#9ca3af", fontSize: 11, margin: "14px 0 0", lineHeight: 1.5 }}>💡 A <b>OS</b> é como a planilha de pagamento acha esse cliente. O <b>custcode</b> preenche sozinho quando você sobe a planilha na Atualização — aqui é só pra ajuste manual.</p>
            <div style={{ display: "flex", gap: 8, marginTop: 18, justifyContent: "flex-end" }}>
              <button onClick={() => setEditCliente(null)} style={btnSecundario}>Cancelar</button>
              <button onClick={salvarEdicaoCliente} disabled={salvandoEdit} style={{ ...btnPrimario, opacity: salvandoEdit ? 0.6 : 1 }}>{salvandoEdit ? "⏳ Salvando..." : "💾 Salvar alterações"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KPI({ cor, bg, icone, label, valor, sub, isMobile }: {
  cor: string; bg: string; icone: string; label: string; valor: string; sub: string; isMobile: boolean;
}) {
  return (
    <div style={{ ...cardStyle, padding: isMobile ? 14 : 18, borderTop: `3px solid ${cor}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>{icone}</div>
        <p style={{ color: "#6b7280", fontSize: 10, margin: 0, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.3 }}>{label}</p>
      </div>
      <p style={{ color: cor, fontSize: isMobile ? 19 : 25, fontWeight: 800, margin: 0, letterSpacing: -0.5 }}>{valor}</p>
      <p style={{ color: "#9ca3af", fontSize: 10, margin: "4px 0 0", fontWeight: 500 }}>{sub}</p>
    </div>
  );
}