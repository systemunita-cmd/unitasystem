"use client";
export const dynamic = "force-dynamic";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { supabase } from "../../lib/supabase";
import { useTemPermissao } from "../../hooks/useTemPermissao";

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
  created_at: string;
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
};

type AbaKey = "do_crm" | "planilha" | "campanhas";
type FiltroVenc = "todos" | "hoje" | "vencendo_7d" | "vencidos" | "este_mes";

// ─── HELPERS ───────────────────────────────────────────────────────────────
const formatBRL = (v: number) =>
  `R$ ${(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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

const formatNumeroRef = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

const formatMesExtenso = (numRef: string): string => {
  const [ano, mes] = numRef.split("-");
  const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return `${meses[parseInt(mes, 10) - 1]}/${ano.slice(2)}`;
};

const calcularPrimeiraFatura = (dataInstalacao: Date, diaVencimento: number) => {
  if (isNaN(dataInstalacao.getTime())) return null;
  if (diaVencimento < 1 || diaVencimento > 31) return null;
  const trintaDiasDepois = new Date(dataInstalacao);
  trintaDiasDepois.setDate(trintaDiasDepois.getDate() + 30);
  let venc = new Date(trintaDiasDepois.getFullYear(), trintaDiasDepois.getMonth(), diaVencimento);
  if (venc.getTime() < trintaDiasDepois.getTime()) {
    venc = new Date(trintaDiasDepois.getFullYear(), trintaDiasDepois.getMonth() + 1, diaVencimento);
  }
  const diasProp = Math.round((venc.getTime() - trintaDiasDepois.getTime()) / 86400000);
  return { vencimento: venc, diasCobertos: 30 + diasProp, proporcional: diasProp };
};

const gerarFaturasDeProposta = (p: Proposta, ateMeses: number = 2): Fatura[] => {
  if (!p.data_instalacao || !p.vencimento || !p.valor_plano) return [];
  const diaVenc = parseInt(String(p.vencimento).replace(/\D/g, ""), 10);
  if (isNaN(diaVenc)) return [];
  const inst = new Date(p.data_instalacao + (p.data_instalacao.length === 10 ? "T00:00:00" : ""));
  if (isNaN(inst.getTime())) return [];
  const valorMensal = p.valor_plano;
  const primeira = calcularPrimeiraFatura(inst, diaVenc);
  if (!primeira) return [];
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const limite = new Date(hoje.getFullYear(), hoje.getMonth() + ateMeses, diaVenc);

  type FaturaBase = Omit<Fatura, "proposta" | "status" | "status_visual" | "dias_atraso" | "data_pagamento" | "observacoes">;
  const faturas: FaturaBase[] = [];
  const valorPrimeira = valorMensal + (valorMensal / 30) * primeira.proporcional;
  faturas.push({
    numero_referencia: formatNumeroRef(primeira.vencimento),
    data_vencimento: primeira.vencimento,
    valor: Math.round(valorPrimeira * 100) / 100,
    proporcional: primeira.proporcional > 0,
    dias_cobertos: primeira.diasCobertos,
  });
  let proxVenc = new Date(primeira.vencimento);
  while (true) {
    proxVenc = new Date(proxVenc.getFullYear(), proxVenc.getMonth() + 1, diaVenc);
    if (proxVenc.getTime() > limite.getTime()) break;
    faturas.push({
      numero_referencia: formatNumeroRef(proxVenc),
      data_vencimento: new Date(proxVenc),
      valor: valorMensal, proporcional: false, dias_cobertos: 30,
    });
  }
  return faturas.map(f => ({
    ...f, proposta: p,
    status: "pendente" as StatusFatura, status_visual: "pendente" as StatusFatura,
    dias_atraso: 0, data_pagamento: null, observacoes: null,
  }));
};

const aplicarStatusEAtrasos = (faturas: Fatura[], statusMap: Map<string, FaturaStatusDB>): Fatura[] => {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return faturas.map(f => {
    const chave = `${f.proposta.id}_${f.numero_referencia}`;
    const db = statusMap.get(chave);
    const status = (db?.status || "pendente") as StatusFatura;
    const diasAtraso = Math.round((hoje.getTime() - f.data_vencimento.getTime()) / 86400000);
    const visual: StatusFatura = (status === "pendente" && diasAtraso > 0) ? "atrasada" : status;
    return {
      ...f, status, status_visual: visual, dias_atraso: diasAtraso,
      data_pagamento: db?.data_pagamento || null,
      observacoes: db?.observacoes || null,
    };
  });
};

const STATUS_META: Record<StatusFatura, {
  label: string; icone: string; bg: string; border: string; color: string;
  recebido: boolean; pendencia: boolean; descricao: string;
}> = {
  pendente:     { label: "A pagar",            icone: "⏳", bg: "#fffbeb", border: "#fde68a", color: "#d97706", recebido: false, pendencia: true,  descricao: "Aguardando pagamento" },
  atrasada:     { label: "Atrasada",           icone: "🔴", bg: "#fef2f2", border: "#fecaca", color: "#dc2626", recebido: false, pendencia: true,  descricao: "Venceu e não foi paga" },
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
  borderRadius: 16,
  border: "1px solid #ececf1",
  boxShadow: "0 1px 2px rgba(16,24,40,0.04)",
};
const inputStyle = {
  background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 10,
  padding: "10px 12px", color: "#0f172a", fontSize: 13, outline: "none",
  width: "100%", boxSizing: "border-box" as const,
};
const labelStyle = {
  color: "#64748b", fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const,
  letterSpacing: 0.5, display: "block", marginBottom: 6,
};
const btnPrimario = {
  background: "#d97706",
  color: "#ffffff", border: "none", borderRadius: 10, padding: "10px 18px",
  fontSize: 13, cursor: "pointer", fontWeight: 700,
  boxShadow: "0 1px 2px rgba(217,119,6,0.35)",
};
const btnSecundario = {
  background: "#ffffff", color: "#334155", border: "1px solid #e2e8f0",
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
  const [statusMap, setStatusMap] = useState<Map<string, FaturaStatusDB>>(new Map());

  const [filtroVenc, setFiltroVenc] = useState<FiltroVenc>("vencendo_7d");
  const [filtroBusca, setFiltroBusca] = useState("");
  const [selecionadasFat, setSelecionadasFat] = useState<Set<string>>(new Set());
  const [filtroStatus, setFiltroStatus] = useState<string>("todas");

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

  const [showEnvio, setShowEnvio] = useState(false);
  const [envioFonte, setEnvioFonte] = useState<"crm" | "planilha">("crm");
  const [envioContatos, setEnvioContatos] = useState<{ nome: string; telefone: string; vars: Record<string, string> }[]>([]);
  const [envioCanalId, setEnvioCanalId] = useState<number | null>(null);
  const [envioTipo, setEnvioTipo] = useState<"webjs" | "waba">("webjs");
  const [envioTemplateId, setEnvioTemplateId] = useState<number | null>(null);
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
    const { data, error } = await supabase.from("faturas_status").select("*");
    if (error) {
      if (error.code === "PGRST205") faltando?.push("faturas_status");
      setStatusMap(new Map());
      return;
    }
    const m = new Map<string, FaturaStatusDB>();
    for (const r of (data || [])) m.set(`${r.proposta_id}_${r.numero_referencia}`, r);
    setStatusMap(m);
  }

  async function fetchPropostas(faltando?: string[]) {
    const { data, error } = await supabase
      .from("proposta")
      .select("id, nome, telefone1, telefone2, telefone3, plano, valor_plano, vencimento, forma_pagamento, status_venda, data_instalacao, operadora, created_at")
      .order("created_at", { ascending: false });
    if (error?.code === "PGRST205") faltando?.push("proposta");
    setPropostas(data || []);
  }

  async function fetchCanais(faltando?: string[]) {
    const { data, error } = await supabase
      .from("conexoes")
      .select("id, nome, tipo, status, waba_id");
    if (error?.code === "PGRST205") { faltando?.push("conexoes"); return; }
    setCanais(data || []);
    const primeiro = (data || []).find(c => c.status === "conectado" || c.status === "pronto");
    if (primeiro && !envioCanalId) setEnvioCanalId(primeiro.id);
  }

  async function fetchTemplates(faltando?: string[]) {
    const { data, error } = await supabase
      .from("templates_waba")
      .select("id, canal_id, meta_template_name, nome_amigavel, categoria, idioma, status, componentes")
      .eq("status", "aprovado");
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

  const todasFaturas = useMemo<Fatura[]>(() => {
    const instalados = propostas.filter(p => (p.status_venda || "").toUpperCase() === "INSTALADA");
    const result: Fatura[] = [];
    for (const p of instalados) result.push(...gerarFaturasDeProposta(p));
    return aplicarStatusEAtrasos(result, statusMap);
  }, [propostas, statusMap]);

  const faturasFiltradas = useMemo(() => {
    let arr = todasFaturas;
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    if (filtroVenc !== "todos") {
      arr = arr.filter(f => {
        const dias = f.dias_atraso;
        if (filtroVenc === "hoje") return dias === 0;
        if (filtroVenc === "vencendo_7d") return dias >= -7 && dias <= 0;
        if (filtroVenc === "vencidos") return dias > 0 && f.status !== "paga";
        if (filtroVenc === "este_mes") {
          return f.data_vencimento.getMonth() === hoje.getMonth() && f.data_vencimento.getFullYear() === hoje.getFullYear();
        }
        return true;
      });
    }

    if (filtroStatus === "pendentes")        arr = arr.filter(f => f.status_visual === "pendente");
    else if (filtroStatus === "atrasadas")   arr = arr.filter(f => f.status_visual === "atrasada");
    else if (filtroStatus === "pagas")       arr = arr.filter(f => STATUS_META[f.status_visual]?.recebido);
    else if (filtroStatus !== "todas")       arr = arr.filter(f => f.status_visual === filtroStatus);

    if (filtroBusca) {
      const b = filtroBusca.toLowerCase();
      arr = arr.filter(f =>
        (f.proposta.nome || "").toLowerCase().includes(b) ||
        (f.proposta.telefone1 || "").includes(b) ||
        (f.proposta.plano || "").toLowerCase().includes(b)
      );
    }

    return [...arr].sort((a, b) => {
      const ordem = { atrasada: 0, pendente: 1, paga: 2 };
      const oa = ordem[a.status_visual as keyof typeof ordem] ?? 3;
      const ob = ordem[b.status_visual as keyof typeof ordem] ?? 3;
      if (oa !== ob) return oa - ob;
      return a.data_vencimento.getTime() - b.data_vencimento.getTime();
    });
  }, [todasFaturas, filtroVenc, filtroStatus, filtroBusca]);

  const kpis = useMemo(() => {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    let aReceberMes = 0, recebidoMes = 0, atrasado = 0, totalMes = 0, pagasMes = 0, atrasadasCnt = 0;
    for (const f of todasFaturas) {
      const meta = STATUS_META[f.status_visual];
      const ehDesteMes = f.data_vencimento.getMonth() === hoje.getMonth() && f.data_vencimento.getFullYear() === hoje.getFullYear();
      if (ehDesteMes) {
        totalMes++;
        if (meta?.recebido) { pagasMes++; recebidoMes += f.valor; }
        if (meta?.pendencia) aReceberMes += f.valor;
      }
      if (f.status_visual === "atrasada") { atrasado += f.valor; atrasadasCnt++; }
    }
    const inadimplencia = totalMes > 0 ? Math.round((atrasadasCnt / totalMes) * 100) : 0;
    return { aReceberMes, recebidoMes, atrasado, atrasadasCnt, pagasMes, totalMes, inadimplencia };
  }, [todasFaturas]);

  const chaveSelecao = (f: Fatura) => `${f.proposta.id}_${f.numero_referencia}`;
  const toggleSelFat = (k: string) => {
    setSelecionadasFat(prev => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  };
  const selecionarTodasFat = () => {
    setSelecionadasFat(prev => prev.size === faturasFiltradas.length ? new Set() : new Set(faturasFiltradas.map(chaveSelecao)));
  };

  const abrirStatus = (f: Fatura, statusInicial: StatusFatura = "paga") => {
    setNovoStatus(statusInicial);
    if (statusInicial === "paga" && f.dias_atraso > 0) setNovoStatus("paga_atraso");
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
    const contatos = faturasFiltradas
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
    setEnvioContatos(contatos);
    setEnvioNomeCampanha(`Cobrança CRM ${new Date().toLocaleDateString("pt-BR")} (${contatos.length} faturas)`);
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
      <div style={{ ...cardStyle, padding: isMobile ? 16 : "18px 22px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "#fffbeb", border: "1px solid #fde68a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>💰</div>
          <div>
            <h1 style={{ color: "#0f172a", fontSize: isMobile ? 18 : 22, fontWeight: 800, margin: 0, letterSpacing: -0.4 }}>Cobrança</h1>
            <p style={{ color: "#94a3b8", fontSize: 12.5, margin: "2px 0 0" }}>
              Grupo Unita · receba e acompanhe as mensalidades dos clientes
            </p>
          </div>
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
        <KPI cor="#2563eb" bg="#eff6ff" icone="📅" label="A receber (mês)" valor={formatBRLCompacto(kpis.aReceberMes)} sub={`${kpis.totalMes - kpis.pagasMes} fatura(s) pendente(s)`} isMobile={isMobile} />
        <KPI cor="#16a34a" bg="#f0fdf4" icone="💵" label="Recebido (mês)"  valor={formatBRLCompacto(kpis.recebidoMes)} sub={`${kpis.pagasMes} fatura(s) paga(s)`} isMobile={isMobile} />
        <KPI cor="#dc2626" bg="#fef2f2" icone="🔴" label="Atrasado"         valor={formatBRLCompacto(kpis.atrasado)}    sub={`${kpis.atrasadasCnt} fatura(s) vencida(s)`} isMobile={isMobile} />
        <KPI cor="#4f46e5" bg="#eef2ff" icone="📊" label="Inadimplência"    valor={`${kpis.inadimplencia}%`}             sub="Atrasadas / total do mês" isMobile={isMobile} />
      </div>

      {/* TABS */}
      <div style={{ ...cardStyle, padding: 6, display: "flex", gap: 4, overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
        {([
          { key: "do_crm",    label: "📅 Do CRM",   color: "#dc2626" },
          { key: "planilha",  label: "📤 Planilha", color: "#a855f7" },
          { key: "campanhas", label: "📊 Campanhas", color: "#2563eb" },
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
          {/* ════════════ ABA: DO CRM ════════════ */}
          {aba === "do_crm" && (
            <>
              <div style={{ ...cardStyle, padding: isMobile ? 12 : 16, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                {([
                  { k: "vencendo_7d", l: "🟡 Próximos 7 dias", cor: "#f59e0b" },
                  { k: "hoje",        l: "⏰ Vencendo hoje",    cor: "#ea580c" },
                  { k: "vencidos",    l: "🔴 Vencidos",         cor: "#dc2626" },
                  { k: "este_mes",    l: "📅 Este mês",         cor: "#2563eb" },
                  { k: "todos",       l: "🌐 Todos",            cor: "#6b7280" },
                ] as { k: FiltroVenc; l: string; cor: string }[]).map(f => {
                  const at = filtroVenc === f.k;
                  return (
                    <button key={f.k} onClick={() => { setFiltroVenc(f.k); setSelecionadasFat(new Set()); }}
                      style={{ background: at ? `${f.cor}15` : "#ffffff", color: at ? f.cor : "#6b7280", border: `1px solid ${at ? f.cor : "#e5e7eb"}`, borderRadius: 20, padding: "6px 12px", fontSize: 12, cursor: "pointer", fontWeight: at ? 700 : 600, whiteSpace: "nowrap" }}>
                      {f.l}
                    </button>
                  );
                })}
                <input value={filtroBusca} onChange={e => setFiltroBusca(e.target.value)} placeholder="🔍 Buscar nome/telefone/plano..."
                  style={{ ...inputStyle, flex: 1, minWidth: 180, padding: "7px 12px" }} />
              </div>

              <div style={{ ...cardStyle, padding: isMobile ? 10 : 12, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ color: "#6b7280", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, marginRight: 4 }}>Status:</span>
                {([
                  { k: "todas",     l: "🌐 Todas",        cor: "#374151" },
                  { k: "pendentes", l: "⏳ A pagar",      cor: "#d97706" },
                  { k: "atrasadas", l: "🔴 Atrasadas",    cor: "#dc2626" },
                  { k: "pagas",     l: "✅ Pagas",         cor: "#16a34a" },
                  { k: "promessa",  l: "🤝 Promessa",     cor: "#2563eb" },
                  { k: "negociacao",l: "📞 Negociação",   cor: "#7c3aed" },
                  { k: "acordo",    l: "📋 Acordo",       cor: "#0284c7" },
                  { k: "nao_pagara",l: "❌ Não vai pagar", cor: "#991b1b" },
                  { k: "cancelada", l: "🚫 Canceladas",   cor: "#6b7280" },
                  { k: "juridico",  l: "⚖️ Jurídico",     cor: "#7f1d1d" },
                ] as { k: string; l: string; cor: string }[]).map(f => {
                  const at = filtroStatus === f.k;
                  return (
                    <button key={f.k} onClick={() => { setFiltroStatus(f.k); setSelecionadasFat(new Set()); }}
                      style={{ background: at ? `${f.cor}15` : "#ffffff", color: at ? f.cor : "#6b7280", border: `1px solid ${at ? f.cor : "#e5e7eb"}`, borderRadius: 20, padding: "5px 12px", fontSize: 12, cursor: "pointer", fontWeight: at ? 700 : 600, whiteSpace: "nowrap" }}>
                      {f.l}
                    </button>
                  );
                })}
              </div>

              <div style={{ ...cardStyle, overflow: "hidden" }}>
                <div style={{ padding: "12px 16px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                  <div style={{ color: "#6b7280", fontSize: 12, fontWeight: 600 }}>
                    {faturasFiltradas.length} fatura(s) · {selecionadasFat.size} selecionada(s)
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={selecionarTodasFat} style={btnSecundario}>
                      {selecionadasFat.size === faturasFiltradas.length && faturasFiltradas.length > 0 ? "✗ Desmarcar todos" : "✓ Selecionar todos"}
                    </button>
                    {podeDisparar && (
                      <button onClick={abrirEnvioCrm} disabled={selecionadasFat.size === 0} style={{ ...btnPrimario, opacity: selecionadasFat.size === 0 ? 0.5 : 1, cursor: selecionadasFat.size === 0 ? "not-allowed" : "pointer" }}>
                        📤 Cobrar {selecionadasFat.size} fatura(s)
                      </button>
                    )}
                  </div>
                </div>

                {faturasFiltradas.length === 0 ? (
                  <div style={{ padding: 40, textAlign: "center" }}>
                    <div style={{ fontSize: 40, marginBottom: 8 }}>📋</div>
                    <p style={{ color: "#1f2937", fontSize: 14, fontWeight: 700, margin: "0 0 6px" }}>Nenhuma fatura nesse filtro</p>
                    <p style={{ color: "#9ca3af", fontSize: 12, margin: 0 }}>
                      As faturas são calculadas pra cada cliente <b>INSTALADO</b> a partir de <b>data_instalacao</b> + dia de <b>vencimento</b> + <b>valor_plano</b>.<br/>
                      Sem instalados ou sem esses 3 campos preenchidos, nada aparece aqui.
                    </p>
                  </div>
                ) : (
                  <div>
                    {faturasFiltradas.map((f, i) => {
                      const k = chaveSelecao(f);
                      const sel = selecionadasFat.has(k);
                      const c = corStatus(f.status_visual);
                      const pago = f.status_visual === "paga" || f.status_visual === "paga_atraso" || f.status_visual === "paga_parcial";
                      return (
                        <div key={k} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: isMobile ? "12px 12px" : "14px 16px", borderTop: i === 0 ? "none" : "1px solid #f1f5f9", borderLeft: `3px solid ${c.color}`, background: sel ? "#fffbeb" : "#ffffff" }}>
                          <input type="checkbox" checked={sel} onChange={() => toggleSelFat(k)} style={{ cursor: "pointer", width: 16, height: 16, accentColor: "#d97706", marginTop: 3 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ color: "#0f172a", fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: isMobile ? 200 : 340 }}>{f.proposta.nome || "—"}</div>
                                <div style={{ color: "#94a3b8", fontSize: 11.5, marginTop: 1 }}>{f.proposta.telefone1 || "—"} · {f.proposta.plano || "—"}</div>
                              </div>
                              <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                                <div style={{ color: pago ? "#059669" : "#0f172a", fontSize: 16, fontWeight: 800, letterSpacing: -0.4, fontVariantNumeric: "tabular-nums" }}>{formatBRL(f.valor)}</div>
                                <div style={{ color: "#94a3b8", fontSize: 11, marginTop: 1 }}>{formatMesExtenso(f.numero_referencia)} · vence {formatData(f.data_vencimento)}</div>
                              </div>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                              <span style={{ background: c.bg, color: c.color, border: `1px solid ${c.border}`, borderRadius: 999, padding: "3px 10px", fontSize: 11, fontWeight: 700 }}>{c.label}</span>
                              {f.status_visual === "atrasada" && <span style={{ color: "#dc2626", fontSize: 11, fontWeight: 700 }}>🔴 {f.dias_atraso}d em atraso</span>}
                              {f.status_visual === "pendente" && f.dias_atraso < 0 && <span style={{ color: "#059669", fontSize: 11, fontWeight: 600 }}>🟢 vence em {Math.abs(f.dias_atraso)}d</span>}
                              {f.proporcional && <span style={{ color: "#a855f7", fontSize: 11, fontWeight: 600 }}>1ª proporcional</span>}
                              {pago && f.data_pagamento && <span style={{ color: c.color, fontSize: 11, fontWeight: 600 }}>✓ pago {formatData(f.data_pagamento)}</span>}
                              {f.observacoes && <span style={{ color: "#94a3b8", fontSize: 11, fontStyle: "italic", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={f.observacoes}>💬 {f.observacoes}</span>}
                              {podeMudarStatus ? (
                                <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
                                  {!pago ? (
                                    <button onClick={() => abrirStatus(f, "paga")} style={{ background: "#059669", color: "#ffffff", border: "none", borderRadius: 8, padding: "6px 14px", fontSize: 12, cursor: "pointer", fontWeight: 700 }}>Receber</button>
                                  ) : (
                                    <button onClick={() => marcarAPagar(f)} style={{ background: "#ffffff", color: "#d97706", border: "1px solid #fde68a", borderRadius: 8, padding: "6px 12px", fontSize: 12, cursor: "pointer", fontWeight: 700 }}>Reabrir</button>
                                  )}
                                  <button onClick={() => abrirStatus(f, "promessa")} title="Outros status (promessa, acordo, negociação...)" style={{ background: "#ffffff", color: "#475569", border: "1px solid #e2e8f0", borderRadius: 8, padding: "6px 12px", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>Status</button>
                                  <button onClick={() => clienteCancelou(f)} title="Cliente cancelou o serviço" style={{ background: "#ffffff", color: "#dc2626", border: "1px solid #fecaca", borderRadius: 8, padding: "6px 10px", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>✕</button>
                                </div>
                              ) : (
                                <span style={{ color: "#94a3b8", fontSize: 11, fontStyle: "italic", marginLeft: "auto" }}>somente leitura</span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}

          {/* ════════════ ABA: PLANILHA ════════════ */}
          {aba === "planilha" && (
            <>
              <div style={{ ...cardStyle, padding: isMobile ? 16 : 24 }}>
                <h3 style={{ color: "#1f2937", fontSize: 14, fontWeight: 700, margin: "0 0 12px" }}>1. Suba sua planilha</h3>
                <input ref={inputArquivoRef} type="file" accept=".csv,.xlsx,.xls" onChange={onArquivoSelecionado} style={{ display: "none" }} />
                <div style={{ border: "2px dashed #93c5fd", borderRadius: 12, padding: 24, textAlign: "center", background: "#eff6ff", cursor: "pointer" }} onClick={() => inputArquivoRef.current?.click()}>
                  <div style={{ fontSize: 36, marginBottom: 6 }}>📤</div>
                  <p style={{ color: "#2563eb", fontSize: 14, fontWeight: 700, margin: "0 0 4px" }}>
                    {planilhaNomeArquivo || "Clique pra escolher um arquivo"}
                  </p>
                  <p style={{ color: "#3b82f6", fontSize: 12, margin: 0 }}>Aceita .csv, .xlsx, .xls — primeira linha geralmente é o cabeçalho.</p>
                </div>
                {planilhaLinhas.length > 0 && (
                  <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, color: "#374151", fontSize: 12, cursor: "pointer" }}>
                    <input type="checkbox" checked={primeiraLinhaCabecalho} onChange={e => setPrimeiraLinhaCabecalho(e.target.checked)} style={{ accentColor: "#2563eb" }} />
                    Primeira linha é o cabeçalho da planilha
                  </label>
                )}
              </div>

              {planilhaLinhas.length > 0 && (
                <div style={{ ...cardStyle, padding: isMobile ? 16 : 24 }}>
                  <h3 style={{ color: "#1f2937", fontSize: 14, fontWeight: 700, margin: "0 0 4px" }}>2. Mapeie as colunas</h3>
                  <p style={{ color: "#9ca3af", fontSize: 11, margin: "0 0 16px" }}>Diga qual coluna da planilha corresponde a cada campo do sistema. Auto-detectei o que pude pelo nome.</p>
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
                    {CAMPOS_PLANILHA.map(campo => (
                      <div key={campo.key}>
                        <label style={labelStyle}>{campo.label}{campo.obrigatorio && <span style={{ color: "#dc2626" }}> *</span>}</label>
                        <select
                          value={mapeamento[campo.key] ?? ""}
                          onChange={e => {
                            const v = e.target.value;
                            setMapeamento(prev => {
                              const novo = { ...prev };
                              if (v === "") delete novo[campo.key];
                              else novo[campo.key] = parseInt(v, 10);
                              return novo;
                            });
                          }}
                          style={inputStyle}
                        >
                          <option value="">— Nenhuma —</option>
                          {cabecalhoColunas.map((col, idx) => (
                            <option key={idx} value={idx}>{col}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {planilhaLinhas.length > 0 && (
                <div style={{ ...cardStyle, overflow: "hidden" }}>
                  <div style={{ padding: "12px 16px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                    <div>
                      <h3 style={{ color: "#1f2937", fontSize: 14, fontWeight: 700, margin: 0 }}>3. Confira e dispare</h3>
                      <p style={{ color: "#9ca3af", fontSize: 11, margin: "2px 0 0" }}>
                        {planilhaDados.length} linha(s) · <b style={{ color: "#16a34a" }}>{linhasValidas.length} válidas</b> (telefone com 10+ dígitos) · {selecionadosPlanilha.size} selecionada(s)
                      </p>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={selecionarTodosPlanilha} style={btnSecundario}>
                        {selecionadosPlanilha.size === linhasValidas.length && linhasValidas.length > 0 ? "✗ Desmarcar" : "✓ Todos"}
                      </button>
                      <button onClick={abrirEnvioPlanilha} disabled={linhasValidas.length === 0} style={{ ...btnPrimario, opacity: linhasValidas.length === 0 ? 0.5 : 1, cursor: linhasValidas.length === 0 ? "not-allowed" : "pointer" }}>
                        📤 Cobrar {selecionadosPlanilha.size || linhasValidas.length} contato(s)
                      </button>
                    </div>
                  </div>

                  {linhasMapeadas.length === 0 ? (
                    <p style={{ color: "#9ca3af", fontSize: 13, fontStyle: "italic", padding: 32, textAlign: "center" }}>Sem dados pra mostrar.</p>
                  ) : (
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: isMobile ? 760 : "auto" }}>
                        <thead>
                          <tr style={{ background: "#f9fafb" }}>
                            <th style={{ width: 36, padding: "10px 12px", borderBottom: "1px solid #e5e7eb" }}></th>
                            {["#", "Nome", "Telefone", "Valor", "Vencimento", "Plano", "Válido"].map(h => (
                              <th key={h} style={{ padding: "10px 12px", color: "#6b7280", fontSize: 11, textAlign: "left", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700, borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {linhasMapeadas.slice(0, 100).map((l, i) => {
                            const tel = normalizarTelefone(l.telefone);
                            const valido = tel.length >= 10;
                            const idxValido = linhasValidas.indexOf(l);
                            const sel = idxValido >= 0 && selecionadosPlanilha.has(idxValido);
                            return (
                              <tr key={i}
                                onClick={() => { if (valido && idxValido >= 0) toggleSelPlanilha(idxValido); }}
                                style={{ borderTop: "1px solid #f3f4f6", background: !valido ? "#fef2f2" : (sel ? "#eff6ff" : (i % 2 === 0 ? "#ffffff" : "#fafbfc")), cursor: valido ? "pointer" : "default", opacity: valido ? 1 : 0.5 }}>
                                <td style={{ padding: "12px", textAlign: "center" }}>
                                  {valido && (
                                    <input type="checkbox" checked={sel} onChange={() => toggleSelPlanilha(idxValido)} onClick={e => e.stopPropagation()} style={{ cursor: "pointer", width: 16, height: 16, accentColor: "#2563eb" }} />
                                  )}
                                </td>
                                <td style={{ padding: "12px", color: "#9ca3af", fontSize: 11 }}>{i + 1}</td>
                                <td style={{ padding: "12px", color: "#1f2937", fontSize: 12, fontWeight: 600, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.nome || "—"}</td>
                                <td style={{ padding: "12px", color: "#6b7280", fontSize: 12, fontFamily: "monospace", whiteSpace: "nowrap" }}>{l.telefone || "—"}</td>
                                <td style={{ padding: "12px", color: "#16a34a", fontSize: 12, fontWeight: 600 }}>{l.valor || "—"}</td>
                                <td style={{ padding: "12px", color: "#6b7280", fontSize: 12 }}>{l.vencimento || "—"}</td>
                                <td style={{ padding: "12px", color: "#374151", fontSize: 12, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.plano || "—"}</td>
                                <td style={{ padding: "12px" }}>
                                  {valido
                                    ? <span style={{ background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0", borderRadius: 8, padding: "2px 7px", fontSize: 10, fontWeight: 700 }}>✓ OK</span>
                                    : <span style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", borderRadius: 8, padding: "2px 7px", fontSize: 10, fontWeight: 700 }}>✗ Sem telefone</span>}
                                </td>
                              </tr>
                            );
                          })}
                          {linhasMapeadas.length > 100 && (
                            <tr><td colSpan={8} style={{ padding: 14, textAlign: "center", color: "#9ca3af", fontSize: 12, fontStyle: "italic" }}>
                              + {linhasMapeadas.length - 100} linha(s) (mostrando primeiras 100)
                            </td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </>
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
        <div onClick={() => !envioEnviando && setShowEnvio(false)} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }}>
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
          <div onClick={() => setShowStatus(null)} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }}>
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
                    {(Object.keys(STATUS_META) as StatusFatura[])
                      .filter(s => s !== "atrasada" && s !== "pendente")
                      .filter(s => {
                        // 🛡️ Filtra por toggles específicos
                        if (s === "cancelada"  && !podeCancelar)   return false;
                        if (s === "juridico"   && !podeJuridico)   return false;
                        if (s === "protestada" && !podeProtestada) return false;
                        return true;
                      })
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
          <div onClick={() => !ehConfirm && setFeedback(null)} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 110, padding: 16 }}>
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
    </div>
  );
}

function KPI({ cor, bg, icone, label, valor, sub, isMobile }: {
  cor: string; bg: string; icone: string; label: string; valor: string; sub: string; isMobile: boolean;
}) {
  return (
    <div style={{ ...cardStyle, padding: isMobile ? 14 : "16px 18px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: cor, display: "inline-block" }} aria-hidden>{bg ? "" : icone}</span>
        <p style={{ color: "#64748b", fontSize: 10.5, margin: 0, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</p>
      </div>
      <p style={{ color: "#0f172a", fontSize: isMobile ? 22 : 28, fontWeight: 800, margin: 0, letterSpacing: -0.8, fontVariantNumeric: "tabular-nums" as const }}>{valor}</p>
      <p style={{ color: "#94a3b8", fontSize: 11, margin: "5px 0 0", fontWeight: 500 }}>{sub}</p>
    </div>
  );
}