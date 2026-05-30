"use client";
import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart, Bar,
  LineChart, Line,
  AreaChart, Area,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { supabase } from "../../lib/supabase";
import { usePermissao } from "../../hooks/usePermissao";
import { useEquipeFiltro } from "../../hooks/useEquipeFiltro";
import {
  montarCamposUnificados,
  type CampoUnificado,
  type ConfigCampoPadrao,
  type CampoCustom,
} from "../../lib/campos_proposta_definicao";

// ═══════════════════════════════════════════════════════════════════════════
// 🎯 FUNIL DE VENDAS — UnitaSystem (single-tenant, motor genérico)
// ───────────────────────────────────────────────────────────────────────────
// Mantém o motor multi-vertical do Wolf: o funil LÊ a config dos campos
// (Editor de Proposta) e se adapta sozinho a telecom/cobrança/advocacia/etc.
//
// Diferenças vs Wolf:
//   • Single-tenant (sem workspace_id em queries)
//   • Cores ajustadas: verde mantido só onde representa "ganho/sucesso"
//     (semântica universal). Identidade visual = azul Unita.
//   • Modo demo: gera dados mockados se tabela `proposta` vazia/inexistente
//   • Sem painel "workspace" no header — mostra "Grupo Unita"
//   • localStorage usa key fixa "unita" (sem workspaceId)
// ═══════════════════════════════════════════════════════════════════════════

// ─── TIPOS ─────────────────────────────────────────────────────────────────
type Proposta = {
  id: number;
  created_at: string;
  updated_at?: string | null;
  equipe_id?: string | null;
  vendedor?: string | null;
  // Campos fixos comuns (podem ou não estar visíveis conforme config)
  nome?: string | null;
  status_venda?: string | null;
  valor_plano?: number | null;
  // jsonb com os valores dos campos customizados
  dados_customizados?: Record<string, any> | null;
  // index pra ler qualquer coluna fixa dinamicamente
  [key: string]: any;
};

type Usuario = { email: string; nome: string; equipe_id?: string | null };

// 📞 Atendimentos
type Atendimento = {
  id: number;
  created_at: string;
  numero: string;
  nome?: string | null;
  atendente?: string | null;
  fila?: string | null;
  status?: string | null;
  finalizado_em?: string | null;
};

// 🏷️ Etiquetas
type Etiqueta = {
  id: number;
  nome: string;
  cor?: string | null;
  icone?: string | null;
  equipe_id?: string | null;
};

// Pivot atendimento_etiquetas (N×N)
type AtEt = { atendimento_id: number; etiqueta_id: number };

type CategoriaEtiqueta = "venda" | "inviavel" | "andamento";

// Campo unificado enriquecido
type CampoUni = CampoUnificado & {
  mostrar_na_lista?: boolean;
  origem?: "fixo" | "custom";
  tipo: string;
  opcoes?: string[] | null;
  visivel?: boolean;
  ordem?: number;
};

type PeriodoKey = "semanal" | "mensal" | "trimestral" | "ano" | "tudo" | "custom";
type AbaKey = "visao" | "etapas" | "dimensoes" | "vendedores" | "atendimentos" | "metas" | "temporal" | "cohort" | "horarios" | "lista";
type OrdemLista = "recente" | "antiga" | "valor_desc" | "valor_asc" | "nome_az";

type FunilConfig = {
  campoStatus: string;
  campoValor: string;
  campoData: string;
  statusGanho: string[];
  statusPerdido: string[];
  probabilidades: Record<string, number>;
  metaReceita: number;
  metaGanhos: number;
  diasParado: number;
};

// ─── PERÍODOS (cor "semanal" trocada de verde p/ azul Unita) ───────────────
const PERIODOS: { key: PeriodoKey; label: string; curto: string; dias: number; icone: string; cor: string }[] = [
  { key: "semanal",    label: "Últimos 7 dias",  curto: "7d",   dias: 7,    icone: "📅", cor: "#2563eb" },
  { key: "mensal",     label: "Últimos 30 dias", curto: "30d",  dias: 30,   icone: "📊", cor: "#3b82f6" },
  { key: "trimestral", label: "Últimos 90 dias", curto: "90d",  dias: 90,   icone: "📈", cor: "#8b5cf6" },
  { key: "ano",        label: "Último 1 ano",    curto: "1ano", dias: 365,  icone: "🗓️", cor: "#f59e0b" },
  { key: "tudo",       label: "Tudo",            curto: "Tudo", dias: 99999,icone: "♾️", cor: "#6b7280" },
];
const PERIODOS_MAP = PERIODOS.reduce((a, p) => { a[p.key] = p; return a; }, {} as Record<PeriodoKey, typeof PERIODOS[number]>);

const PALETA = ["#3b82f6", "#2563eb", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#dc2626", "#14b8a6", "#a855f7", "#0ea5e9", "#f97316", "#84cc16"];

const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const DIAS_SEMANA_LONGO = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

const REGEX_GANHO = /instal|ganho|conclu|fechad|aprovad|pago|ativ|sucesso|vendid|efetiv|finaliz/i;
const REGEX_PERDIDO = /cancel|perd|recus|reprovad|inativ|desist|inadimpl|nao_?fechad|abortad|devolvid/i;

const REGEX_ETQ_VENDA = /vend|fechad|ganho|conclu|aprovad|pago|sucesso|vendid|contrato|cliente|convertid|efetiv|instal|ativ/i;
const REGEX_ETQ_INVIAVEL = /inviav|perd|recus|desist|sem.?perfil|frio|nao.?quis|n.o.?quis|spam|incorret|errado|trote|duplicad|invalid|inadimpl|desinteress|fora.?regi.o|sem.?condi/i;

const classificarEtiquetaAuto = (nome: string): CategoriaEtiqueta => {
  if (REGEX_ETQ_VENDA.test(nome)) return "venda";
  if (REGEX_ETQ_INVIAVEL.test(nome)) return "inviavel";
  return "andamento";
};

// localStorage do mapeamento de etiquetas (key fixa "unita")
const MAPA_ETQ_KEY = "funil_etq_mapa_v1__unita";
const carregarMapaEtq = (): Record<string, CategoriaEtiqueta> => {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(window.localStorage.getItem(MAPA_ETQ_KEY) || "{}"); }
  catch { return {}; }
};
const salvarMapaEtq = (m: Record<string, CategoriaEtiqueta>) => {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(MAPA_ETQ_KEY, JSON.stringify(m)); } catch { /* noop */ }
};

// ─── HELPERS DE FORMATO ──────────────────────────────────────────────────────
const formatBRL = (v: number) =>
  `R$ ${(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const formatBRLCompacto = (v: number): string => {
  v = v || 0;
  if (Math.abs(v) >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000)     return `R$ ${(v / 1_000).toFixed(1)}k`;
  return formatBRL(v);
};

const formatNum = (v: number) => (v || 0).toLocaleString("pt-BR");

const formatDataCurta = (d: string | Date) => {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
};

const mediana = (nums: number[]): number => {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
};

const trendPct = (atual: number, anterior: number): number => {
  if (anterior === 0) return atual > 0 ? 100 : 0;
  return Math.round(((atual - anterior) / anterior) * 100);
};

// ─── LEITORES GENÉRICOS DE CAMPO ─────────────────────────────────────────────
const lerValorBruto = (p: Proposta, campo: CampoUni | undefined): any => {
  if (!campo) return null;
  if (campo.origem === "custom") return p.dados_customizados?.[campo.slug];
  return (p as any)[campo.slug];
};

const lerNumero = (p: Proposta, campo: CampoUni | undefined): number => {
  const raw = lerValorBruto(p, campo);
  if (raw == null || raw === "") return 0;
  if (typeof raw === "number") return raw;
  const limpo = String(raw).replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3})/g, "").replace(",", ".");
  const n = parseFloat(limpo);
  return isNaN(n) ? 0 : n;
};

const lerTexto = (p: Proposta, campo: CampoUni | undefined): string => {
  const raw = lerValorBruto(p, campo);
  if (raw == null) return "";
  if (typeof raw === "boolean") return raw ? "Sim" : "Não";
  return String(raw);
};

const lerData = (p: Proposta, campo: CampoUni | undefined): Date | null => {
  if (!campo || !campo.slug) return new Date(p.created_at);
  const raw = lerValorBruto(p, campo);
  if (!raw) return new Date(p.created_at);
  const d = new Date(raw);
  return isNaN(d.getTime()) ? new Date(p.created_at) : d;
};

// ─── localStorage da config do funil (key fixa "unita") ─────────────────────
const FUNIL_CFG_KEY = "funil_config_v1__unita";

const carregarConfigSalva = (): Partial<FunilConfig> | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(FUNIL_CFG_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
};

const salvarConfig = (cfg: FunilConfig) => {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(FUNIL_CFG_KEY, JSON.stringify(cfg)); } catch { /* noop */ }
};

// ─── AUTO-DETECÇÃO da config a partir dos campos ─────────────────────────────
const autoDetectarConfig = (campos: CampoUni[]): FunilConfig => {
  const visiveis = campos.filter(c => c.visivel !== false);
  const dropdowns = visiveis.filter(c => c.tipo === "dropdown");
  const moedas = visiveis.filter(c => c.tipo === "moeda" || c.tipo === "numero");
  const datas = visiveis.filter(c => c.tipo === "data");

  const statusPreferido =
    dropdowns.find(c => /status|situac|fase|etapa|estagio|estágio/i.test(c.slug) || /status|situac|fase|etapa/i.test(c.label)) ||
    dropdowns.find(c => (c.opcoes || []).some(o => REGEX_GANHO.test(o) || REGEX_PERDIDO.test(o))) ||
    dropdowns[0];

  const campoStatus = statusPreferido?.slug || "status_venda";
  const opcoesStatus = statusPreferido?.opcoes || [];

  const valorPreferido =
    moedas.find(c => c.tipo === "moeda" && /valor|honorar|divida|dívida|causa|preco|preço|mensalidade|ticket/i.test(c.slug)) ||
    moedas.find(c => c.tipo === "moeda") ||
    moedas[0];
  const campoValor = valorPreferido?.slug || "valor_plano";

  const dataPreferida =
    datas.find(c => /proposta|abertura|entrada|criac|criação|inicio|início|cadastro/i.test(c.slug)) ||
    datas[0];
  const campoData = dataPreferida?.slug || "";

  const statusGanho = opcoesStatus.filter(o => REGEX_GANHO.test(o));
  const statusPerdido = opcoesStatus.filter(o => REGEX_PERDIDO.test(o));

  const pipeline = opcoesStatus.filter(o => !statusGanho.includes(o) && !statusPerdido.includes(o));
  const probabilidades: Record<string, number> = {};
  statusGanho.forEach(o => { probabilidades[o] = 100; });
  statusPerdido.forEach(o => { probabilidades[o] = 0; });
  pipeline.forEach((o, i) => {
    probabilidades[o] = pipeline.length <= 1 ? 50 : Math.round(20 + (60 * i) / (pipeline.length - 1));
  });

  return {
    campoStatus, campoValor, campoData, statusGanho, statusPerdido,
    probabilidades,
    metaReceita: 0,
    metaGanhos: 0,
    diasParado: 14,
  };
};

// ═══════════════════════════════════════════════════════════════════════════
// 🎭 MOCK DATA — gerado quando tabela proposta está vazia (modo demo)
// ═══════════════════════════════════════════════════════════════════════════

const VENDEDORES_MOCK: Usuario[] = [
  { email: "ana.silva@grupounita.com.br", nome: "Ana Silva" },
  { email: "roberto.almeida@grupounita.com.br", nome: "Roberto Almeida" },
  { email: "carla.santos@grupounita.com.br", nome: "Carla Santos" },
  { email: "joao.pereira@grupounita.com.br", nome: "João Pereira" },
  { email: "mariana.costa@grupounita.com.br", nome: "Mariana Costa" },
];

const OPERADORAS_MOCK = ["Vivo", "Claro", "Tim", "Oi", "Sercomtel"];
const PLANOS_MOCK = ["100MB Fibra", "200MB Fibra", "500MB Fibra", "1GB Fibra", "Empresarial 2GB"];
const STATUS_MOCK = ["INSTALADA", "INSTALADA", "INSTALADA", "INSTALADA", "GERADA", "GERADA", "PENDENTE", "AGUARDANDO AUDITORIA", "CANCELADA"];

function gerarMockData(): Proposta[] {
  const propostas: Proposta[] = [];
  const agora = new Date();
  for (let i = 0; i < 220; i++) {
    const diasAtras = Math.floor(Math.random() * 120);
    const data = new Date(agora);
    data.setDate(data.getDate() - diasAtras);
    data.setHours(8 + Math.floor(Math.random() * 12), Math.floor(Math.random() * 60));
    const statusEscolhido = STATUS_MOCK[Math.floor(Math.random() * STATUS_MOCK.length)];
    // updated_at: alguns têm data próxima (atualizados), outros antiga (parados)
    const diasDesdeUpdate = Math.floor(Math.random() * Math.min(diasAtras, 30));
    const updated = new Date(data);
    updated.setDate(updated.getDate() + diasDesdeUpdate);
    propostas.push({
      id: i + 1,
      created_at: data.toISOString(),
      updated_at: updated.toISOString(),
      data_proposta: data.toISOString(),
      nome: `Cliente ${String(i + 1).padStart(3, "0")}`,
      vendedor: VENDEDORES_MOCK[Math.floor(Math.random() * VENDEDORES_MOCK.length)].email,
      valor_plano: 80 + Math.floor(Math.random() * 320),
      status_venda: statusEscolhido,
      operadora: OPERADORAS_MOCK[Math.floor(Math.random() * OPERADORAS_MOCK.length)],
      plano: PLANOS_MOCK[Math.floor(Math.random() * PLANOS_MOCK.length)],
      dados_customizados: {},
    });
  }
  return propostas.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

// Campos mockados pra quando não tem tabela proposta_campos_padrao_config
function camposMockTelecom(): CampoUni[] {
  return [
    { slug: "status_venda", label: "Status da Venda", tipo: "dropdown", origem: "fixo", visivel: true, ordem: 1, opcoes: ["GERADA", "AGUARDANDO AUDITORIA", "PENDENTE", "INSTALADA", "CANCELADA"], obrigatorio: false } as any,
    { slug: "valor_plano", label: "Valor", tipo: "moeda", origem: "fixo", visivel: true, ordem: 2, opcoes: null, obrigatorio: false } as any,
    { slug: "plano", label: "Plano", tipo: "dropdown", origem: "fixo", visivel: true, ordem: 3, opcoes: PLANOS_MOCK, obrigatorio: false } as any,
    { slug: "operadora", label: "Operadora", tipo: "dropdown", origem: "fixo", visivel: true, ordem: 4, opcoes: OPERADORAS_MOCK, obrigatorio: false } as any,
    { slug: "data_proposta", label: "Data da Proposta", tipo: "data", origem: "fixo", visivel: true, ordem: 5, opcoes: null, obrigatorio: false } as any,
  ];
}

// ═══════════════════════════════════════════════════════════════════════════
// 🎨 ESTILOS
// ═══════════════════════════════════════════════════════════════════════════
const cardStyle = {
  background: "#ffffff",
  borderRadius: 14,
  border: "1px solid #e5e7eb",
  boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
};
const inputStyle = {
  background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 10,
  padding: "9px 12px", color: "#1f2937", fontSize: 13, outline: "none",
  cursor: "pointer", fontWeight: 600,
};
const chipStyle = {
  borderRadius: 20, padding: "6px 13px", fontSize: 12, cursor: "pointer",
  fontWeight: 600, transition: "all 0.15s", border: "1px solid #e5e7eb",
  background: "#ffffff", color: "#6b7280",
  display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" as const,
};
const sectionTitleStyle = {
  color: "#1f2937", fontSize: 15, fontWeight: 700, margin: "0 0 18px 0",
  display: "flex", alignItems: "center", gap: 8,
};

// ═══════════════════════════════════════════════════════════════════════════
// 🎯 COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════
export default function Funil() {
  const router = useRouter();
  const { isDono, isSuperAdmin, permissoes } = usePermissao();

  // ─── DADOS BRUTOS ─────────────────────────────────────────────────────────
  const [propostas, setPropostas] = useState<Proposta[]>([]);
  const [campos, setCampos] = useState<CampoUni[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [modoDemo, setModoDemo] = useState(false);

  // 📞 Atendimentos + etiquetas
  const [atendimentos, setAtendimentos] = useState<Atendimento[]>([]);
  const [etiquetas, setEtiquetas] = useState<Etiqueta[]>([]);
  const [atEtiquetas, setAtEtiquetas] = useState<AtEt[]>([]);
  const [mapaEtq, setMapaEtq] = useState<Record<string, CategoriaEtiqueta>>({});
  const [showMapearEtq, setShowMapearEtq] = useState(false);

  // 👥 Filtro de equipe
  const { equipeId, EquipeSelector } = useEquipeFiltro();

  // ─── CONFIG SEMÂNTICA DO FUNIL ────────────────────────────────────────────
  const [config, setConfig] = useState<FunilConfig | null>(null);
  const [showConfig, setShowConfig] = useState(false);

  // ─── FILTROS ──────────────────────────────────────────────────────────────
  const [periodo, setPeriodo] = useState<PeriodoKey>("mensal");
  const [dataInicio, setDataInicio] = useState<string>("");
  const [dataFim, setDataFim] = useState<string>("");
  const [filtroVendedor, setFiltroVendedor] = useState("todos");
  const [filtroBusca, setFiltroBusca] = useState("");
  const [filtrosDim, setFiltrosDim] = useState<Record<string, string>>({});

  // ─── NAVEGAÇÃO ────────────────────────────────────────────────────────────
  const [aba, setAba] = useState<AbaKey>("visao");
  const [etapaAberta, setEtapaAberta] = useState<string | null>(null);
  const [dimensaoSel, setDimensaoSel] = useState<string>("");

  // ─── LISTA ────────────────────────────────────────────────────────────────
  const [listaOrdem, setListaOrdem] = useState<OrdemLista>("recente");
  const [listaPagina, setListaPagina] = useState(1);
  const LISTA_SIZE = 20;
  const [drillPagina, setDrillPagina] = useState(1);
  const DRILL_SIZE = 15;

  const [agrupTempo, setAgrupTempo] = useState<"dia" | "semana" | "mes">("dia");

  // ─── MOBILE ───────────────────────────────────────────────────────────────
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // ─── CARGA INICIAL ────────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }

      // 1) Carrega config de campos (Editor de Proposta)
      let camposUnificados: CampoUni[] = [];
      try {
        const [respConfig, respCustom] = await Promise.all([
          supabase.from("proposta_campos_padrao_config").select("*"),
          supabase.from("proposta_campos_customizados").select("*").eq("ativo", true).order("ordem", { ascending: true }),
        ]);
        const configs: ConfigCampoPadrao[] = (respConfig.data || []).map((c: any) => ({
          id: c.id, campo_slug: c.campo_slug, label_custom: c.label_custom,
          obrigatorio: c.obrigatorio, visivel: c.visivel, ordem: c.ordem,
          opcoes: Array.isArray(c.opcoes) ? c.opcoes : (typeof c.opcoes === "string" && c.opcoes ? JSON.parse(c.opcoes) : null),
          placeholder_custom: c.placeholder_custom,
        }));
        const customs: CampoCustom[] = (respCustom.data || []).map((c: any) => ({
          id: c.id, slug: c.slug, label: c.label, tipo: c.tipo,
          obrigatorio: c.obrigatorio, ordem: c.ordem,
          opcoes: Array.isArray(c.opcoes) ? c.opcoes : (typeof c.opcoes === "string" ? JSON.parse(c.opcoes) : []),
          placeholder: c.placeholder, ativo: c.ativo,
        }));
        camposUnificados = montarCamposUnificados(configs, customs) as CampoUni[];
      } catch {
        // Tabelas não existem ainda → fallback mock telecom
        camposUnificados = camposMockTelecom();
      }
      // Se config retornou vazio, ainda usa mock pra demo
      if (camposUnificados.length === 0) {
        camposUnificados = camposMockTelecom();
      }
      setCampos(camposUnificados);

      // 2) Define config semântica (salva ou auto-detectada)
      const salva = carregarConfigSalva();
      const auto = autoDetectarConfig(camposUnificados);
      const cfg: FunilConfig = {
        campoStatus: salva?.campoStatus || auto.campoStatus,
        campoValor: salva?.campoValor || auto.campoValor,
        campoData: salva?.campoData ?? auto.campoData,
        statusGanho: salva?.statusGanho || auto.statusGanho,
        statusPerdido: salva?.statusPerdido || auto.statusPerdido,
        probabilidades: salva?.probabilidades || auto.probabilidades,
        metaReceita: salva?.metaReceita ?? auto.metaReceita,
        metaGanhos: salva?.metaGanhos ?? auto.metaGanhos,
        diasParado: salva?.diasParado ?? auto.diasParado,
      };
      setConfig(cfg);

      const primeiraDim = camposUnificados.find(c => c.tipo === "dropdown" && c.slug !== cfg.campoStatus && c.visivel !== false);
      if (primeiraDim) setDimensaoSel(primeiraDim.slug);

      // 3) Carrega propostas (single-tenant, sem workspace_id)
      let propostasReais: Proposta[] = [];
      let usouMock = false;
      try {
        const { data: props, error } = await supabase.from("proposta").select("*")
          .order("created_at", { ascending: false })
          .limit(10000);
        if (error) throw error;
        propostasReais = (props || []) as Proposta[];
      } catch {
        usouMock = true;
      }

      if (propostasReais.length === 0) {
        usouMock = true;
        propostasReais = gerarMockData();
      }
      setPropostas(propostasReais);
      setModoDemo(usouMock);

      // 4) Lookup de usuários
      let usuariosLista: Usuario[] = [];
      try {
        const { data: us } = await supabase.from("usuarios").select("email, nome, equipe_id");
        usuariosLista = (us || []) as Usuario[];
      } catch {
        // Tabela não existe
      }
      if (usuariosLista.length === 0 && usouMock) {
        usuariosLista = VENDEDORES_MOCK;
      }
      setUsuarios(usuariosLista);

      // 5) 📞 Atendimentos + etiquetas + pivot
      try {
        const [respAt, respEtq] = await Promise.all([
          supabase.from("atendimentos").select("id, created_at, numero, nome, atendente, fila, status, finalizado_em")
            .order("created_at", { ascending: false })
            .limit(20000),
          supabase.from("etiquetas").select("id, nome, cor, icone, equipe_id"),
        ]);
        const ats = (respAt.data || []) as Atendimento[];
        const etqs = (respEtq.data || []) as Etiqueta[];
        setAtendimentos(ats);
        setEtiquetas(etqs);

        if (ats.length > 0) {
          const ids = ats.map(a => a.id);
          const pares: AtEt[] = [];
          for (let i = 0; i < ids.length; i += 500) {
            const lote = ids.slice(i, i + 500);
            const { data: pv } = await supabase.from("atendimento_etiquetas")
              .select("atendimento_id, etiqueta_id")
              .in("atendimento_id", lote);
            if (pv) pares.push(...(pv as AtEt[]));
          }
          setAtEtiquetas(pares);
        }

        setMapaEtq(carregarMapaEtq());
      } catch {
        // Tabelas não existem ainda
      }

      setLoading(false);
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const nomeVendedor = useCallback((v: string | null | undefined): string => {
    if (!v) return "—";
    const u = usuarios.find(x => x.email?.toLowerCase() === v?.toLowerCase());
    return u?.nome || v.split("@")[0] || v;
  }, [usuarios]);

  // ─── MAPA slug → campo ──────────────────────────────────────────────────────
  const camposMap = useMemo(() => {
    const m = new Map<string, CampoUni>();
    for (const c of campos) m.set(c.slug, c);
    return m;
  }, [campos]);

  const campoStatus = useMemo(() => config ? camposMap.get(config.campoStatus) : undefined, [config, camposMap]);
  const campoValor = useMemo(() => config ? camposMap.get(config.campoValor) : undefined, [config, camposMap]);
  const campoData = useMemo(() => (config && config.campoData) ? camposMap.get(config.campoData) : undefined, [config, camposMap]);

  const opcoesStatus = useMemo<string[]>(() => {
    if (!campoStatus) return [];
    if (campoStatus.opcoes && campoStatus.opcoes.length) return campoStatus.opcoes;
    const set = new Set<string>();
    for (const p of propostas) {
      const v = lerTexto(p, campoStatus);
      if (v) set.add(v);
    }
    return Array.from(set);
  }, [campoStatus, propostas]);

  const dimensoesDisponiveis = useMemo<CampoUni[]>(() => {
    return campos.filter(c =>
      (c.tipo === "dropdown" || c.tipo === "checkbox") &&
      c.visivel !== false &&
      c.slug !== config?.campoStatus
    );
  }, [campos, config]);

  const camposValorDisp = useMemo(() => campos.filter(c => (c.tipo === "moeda" || c.tipo === "numero") && c.visivel !== false), [campos]);
  const camposStatusDisp = useMemo(() => campos.filter(c => c.tipo === "dropdown" && c.visivel !== false), [campos]);
  const camposDataDisp = useMemo(() => campos.filter(c => c.tipo === "data" && c.visivel !== false), [campos]);

  // ─── HELPERS SEMÂNTICOS ─────────────────────────────────────────────────────
  const statusDe = useCallback((p: Proposta): string => lerTexto(p, campoStatus), [campoStatus]);
  const valorDe = useCallback((p: Proposta): number => lerNumero(p, campoValor), [campoValor]);
  const dataDe = useCallback((p: Proposta): Date => lerData(p, campoData) || new Date(p.created_at), [campoData]);

  const ehGanho = useCallback((p: Proposta): boolean => !!config && config.statusGanho.includes(statusDe(p)), [config, statusDe]);
  const ehPerdido = useCallback((p: Proposta): boolean => !!config && config.statusPerdido.includes(statusDe(p)), [config, statusDe]);
  const ehPipeline = useCallback((p: Proposta): boolean => !ehGanho(p) && !ehPerdido(p), [ehGanho, ehPerdido]);

  // ─── FILTRO MESTRE ──────────────────────────────────────────────────────────
  const passaFiltrosBase = useCallback((p: Proposta): boolean => {
    if (equipeId && p.equipe_id !== equipeId) return false;
    if (filtroVendedor !== "todos" && p.vendedor !== filtroVendedor) return false;
    for (const [slug, val] of Object.entries(filtrosDim)) {
      if (!val) continue;
      const campo = camposMap.get(slug);
      if (lerTexto(p, campo) !== val) return false;
    }
    if (filtroBusca) {
      const b = filtroBusca.toLowerCase();
      const campoNome = camposMap.get("nome");
      const txtNome = (lerTexto(p, campoNome) || p.nome || "").toLowerCase();
      const txtVend = nomeVendedor(p.vendedor).toLowerCase();
      const txtStatus = statusDe(p).toLowerCase();
      if (!txtNome.includes(b) && !txtVend.includes(b) && !txtStatus.includes(b)) return false;
    }
    return true;
  }, [equipeId, filtroVendedor, filtrosDim, camposMap, filtroBusca, nomeVendedor, statusDe]);

  const janela = useMemo(() => {
    const agora = new Date();
    if (periodo === "custom" && dataInicio && dataFim) {
      const ini = new Date(dataInicio + "T00:00:00");
      const fim = new Date(dataFim + "T23:59:59");
      const dias = Math.max(1, Math.round((fim.getTime() - ini.getTime()) / 86400000));
      return { ini, fim, dias, tudo: false };
    }
    const dias = PERIODOS_MAP[periodo === "custom" ? "mensal" : periodo].dias;
    if (dias >= 99999) return { ini: new Date(0), fim: agora, dias: 99999, tudo: true };
    return { ini: new Date(agora.getTime() - dias * 86400000), fim: agora, dias, tudo: false };
  }, [periodo, dataInicio, dataFim]);

  const dentroPeriodo = useCallback((p: Proposta): boolean => {
    if (janela.tudo) return true;
    const d = dataDe(p);
    return d >= janela.ini && d <= janela.fim;
  }, [dataDe, janela]);

  const propsFiltradas = useMemo(() => {
    return propostas.filter(p => passaFiltrosBase(p) && dentroPeriodo(p));
  }, [propostas, passaFiltrosBase, dentroPeriodo]);

  const propsAnterior = useMemo(() => {
    if (janela.tudo) return [];
    const durMs = janela.fim.getTime() - janela.ini.getTime();
    const fimAnt = janela.ini;
    const iniAnt = new Date(janela.ini.getTime() - durMs);
    return propostas.filter(p => {
      if (!passaFiltrosBase(p)) return false;
      const d = dataDe(p);
      return d >= iniAnt && d < fimAnt;
    });
  }, [propostas, janela, passaFiltrosBase, dataDe]);

  // ─── MÉTRICAS ───────────────────────────────────────────────────────────────
  const metricas = useMemo(() => {
    const pf = propsFiltradas;
    const ganhos = pf.filter(ehGanho);
    const perdidos = pf.filter(ehPerdido);
    const pipeline = pf.filter(ehPipeline);

    const receita = ganhos.reduce((a, p) => a + valorDe(p), 0);
    const valorPipeline = pipeline.reduce((a, p) => a + valorDe(p), 0);
    const valorPerdido = perdidos.reduce((a, p) => a + valorDe(p), 0);
    const fechados = ganhos.length + perdidos.length;
    const winRate = fechados > 0 ? Math.round((ganhos.length / fechados) * 100) : 0;
    const taxaPerda = fechados > 0 ? Math.round((perdidos.length / fechados) * 100) : 0;
    const ticket = ganhos.length > 0 ? receita / ganhos.length : 0;
    const ticketMediana = mediana(ganhos.map(valorDe));

    let ciclo = 0;
    if (ganhos.length > 0) {
      const dias = ganhos.map(p => {
        const ini = new Date(p.created_at).getTime();
        const fim = p.updated_at ? new Date(p.updated_at).getTime() : Date.now();
        return Math.max(0, (fim - ini) / 86400000);
      });
      ciclo = Math.round(dias.reduce((a, b) => a + b, 0) / dias.length);
    }

    const diasPer = janela.tudo ? 365 : janela.dias;
    const velocity = receita / Math.max(diasPer, 1);
    const forecast = Math.round(valorPipeline * (winRate / 100));

    const probs = config?.probabilidades || {};
    const forecastPonderado = Math.round(pipeline.reduce((a, p) => {
      const prob = probs[statusDe(p)] ?? 0;
      return a + valorDe(p) * (prob / 100);
    }, 0));
    const receitaProjetada = receita + forecastPonderado;

    const gAnt = propsAnterior.filter(ehGanho);
    const pAnt = propsAnterior.filter(ehPerdido);
    const recAnt = gAnt.reduce((a, p) => a + valorDe(p), 0);
    const wrAnt = (gAnt.length + pAnt.length) > 0 ? Math.round((gAnt.length / (gAnt.length + pAnt.length)) * 100) : 0;
    const tktAnt = gAnt.length > 0 ? recAnt / gAnt.length : 0;

    return {
      total: pf.length,
      ganhos: ganhos.length,
      perdidos: perdidos.length,
      pipelineCount: pipeline.length,
      receita, valorPipeline, valorPerdido,
      winRate, taxaPerda, ticket, ticketMediana, ciclo, velocity, forecast,
      forecastPonderado, receitaProjetada,
      tRec: trendPct(receita, recAnt),
      tWin: trendPct(winRate, wrAnt),
      tTicket: trendPct(ticket, tktAnt),
      tTotal: trendPct(pf.length, propsAnterior.length),
      tGanhos: trendPct(ganhos.length, gAnt.length),
    };
  }, [propsFiltradas, propsAnterior, ehGanho, ehPerdido, ehPipeline, valorDe, janela, config, statusDe]);

  // ─── AGING / HIGIENE ────────────────────────────────────────────────────────
  const aging = useMemo(() => {
    const limite = config?.diasParado ?? 14;
    const abertos = propsFiltradas.filter(ehPipeline);
    const agora = Date.now();
    const calcDiasParado = (p: Proposta) => {
      const ref = p.updated_at ? new Date(p.updated_at).getTime() : new Date(p.created_at).getTime();
      return Math.floor((agora - ref) / 86400000);
    };
    const calcDiasAberto = (p: Proposta) => Math.floor((agora - new Date(p.created_at).getTime()) / 86400000);

    const faixas = [
      { label: "0–7 dias", min: 0, max: 7, qtd: 0, valor: 0, cor: "#16a34a" },
      { label: "8–15 dias", min: 8, max: 15, qtd: 0, valor: 0, cor: "#84cc16" },
      { label: "16–30 dias", min: 16, max: 30, qtd: 0, valor: 0, cor: "#f59e0b" },
      { label: "31–60 dias", min: 31, max: 60, qtd: 0, valor: 0, cor: "#f97316" },
      { label: "60+ dias", min: 61, max: Infinity, qtd: 0, valor: 0, cor: "#dc2626" },
    ];
    for (const p of abertos) {
      const d = calcDiasAberto(p);
      const f = faixas.find(x => d >= x.min && d <= x.max);
      if (f) { f.qtd++; f.valor += valorDe(p); }
    }

    const parados = abertos
      .map(p => ({ p, diasParado: calcDiasParado(p), diasAberto: calcDiasAberto(p), valor: valorDe(p) }))
      .filter(x => x.diasParado >= limite)
      .sort((a, b) => b.diasParado - a.diasParado);

    const valorParado = parados.reduce((a, x) => a + x.valor, 0);
    return { faixas, parados, valorParado, limite, totalAbertos: abertos.length };
  }, [propsFiltradas, ehPipeline, valorDe, config]);

  // ─── METAS DO MÊS ATUAL ─────────────────────────────────────────────────────
  const metas = useMemo(() => {
    const agora = new Date();
    const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1);
    const fimMes = new Date(agora.getFullYear(), agora.getMonth() + 1, 0);
    const diasNoMes = fimMes.getDate();
    const diaAtual = agora.getDate();
    const fracaoDecorrida = diaAtual / diasNoMes;

    const base = propostas.filter(passaFiltrosBase);
    const ganhosMes = base.filter(p => {
      if (!ehGanho(p)) return false;
      const d = dataDe(p);
      return d >= inicioMes && d <= new Date(fimMes.getFullYear(), fimMes.getMonth(), fimMes.getDate(), 23, 59, 59);
    });
    const receitaMes = ganhosMes.reduce((a, p) => a + valorDe(p), 0);
    const qtdMes = ganhosMes.length;

    const metaReceita = config?.metaReceita || 0;
    const metaGanhos = config?.metaGanhos || 0;

    const pctReceita = metaReceita > 0 ? Math.round((receitaMes / metaReceita) * 100) : 0;
    const pctGanhos = metaGanhos > 0 ? Math.round((qtdMes / metaGanhos) * 100) : 0;

    const projReceita = fracaoDecorrida > 0 ? Math.round(receitaMes / fracaoDecorrida) : 0;
    const projGanhos = fracaoDecorrida > 0 ? Math.round(qtdMes / fracaoDecorrida) : 0;
    const pctRitmo = Math.round(fracaoDecorrida * 100);

    const faltaReceita = Math.max(0, metaReceita - receitaMes);
    const faltaGanhos = Math.max(0, metaGanhos - qtdMes);
    const diasRestantes = diasNoMes - diaAtual;

    return {
      receitaMes, qtdMes, metaReceita, metaGanhos,
      pctReceita, pctGanhos, projReceita, projGanhos, pctRitmo,
      faltaReceita, faltaGanhos, diasRestantes, diasNoMes, diaAtual,
      noRitmo: projReceita >= metaReceita,
      mesLabel: agora.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }),
    };
  }, [propostas, passaFiltrosBase, ehGanho, dataDe, valorDe, config]);

  // ─── ETAPAS DO FUNIL ────────────────────────────────────────────────────────
  const etapas = useMemo(() => {
    return opcoesStatus.map((opt, i) => {
      const props = propsFiltradas.filter(p => statusDe(p) === opt);
      const valor = props.reduce((a, p) => a + valorDe(p), 0);
      const tipo = config?.statusGanho.includes(opt) ? "ganho" : config?.statusPerdido.includes(opt) ? "perdido" : "pipeline";
      const cor = tipo === "ganho" ? "#16a34a" : tipo === "perdido" ? "#dc2626" : PALETA[i % PALETA.length];
      return { opcao: opt, qtd: props.length, valor, tipo, cor };
    });
  }, [opcoesStatus, propsFiltradas, statusDe, valorDe, config]);

  const etapasFunil = useMemo(() => etapas.filter(e => e.tipo !== "perdido"), [etapas]);
  const etapasPerdidas = useMemo(() => etapas.filter(e => e.tipo === "perdido"), [etapas]);
  const maxQtdEtapa = useMemo(() => Math.max(1, ...etapasFunil.map(e => e.qtd)), [etapasFunil]);

  // ─── BREAKDOWN POR DIMENSÃO ─────────────────────────────────────────────────
  const breakdownDim = useMemo(() => {
    const campo = camposMap.get(dimensaoSel);
    if (!campo) return [];
    const mapa: Record<string, { qtd: number; ganhos: number; perdidos: number; receita: number; pipeline: number }> = {};
    for (const p of propsFiltradas) {
      const k = lerTexto(p, campo) || "(vazio)";
      if (!mapa[k]) mapa[k] = { qtd: 0, ganhos: 0, perdidos: 0, receita: 0, pipeline: 0 };
      const r = mapa[k];
      r.qtd++;
      const v = valorDe(p);
      if (ehGanho(p)) { r.ganhos++; r.receita += v; }
      else if (ehPerdido(p)) { r.perdidos++; }
      else { r.pipeline += v; }
    }
    return Object.entries(mapa).map(([valor, d]) => {
      const fechados = d.ganhos + d.perdidos;
      return {
        valor, ...d,
        winRate: fechados > 0 ? Math.round((d.ganhos / fechados) * 100) : 0,
        total: d.receita + d.pipeline,
      };
    }).sort((a, b) => b.receita - a.receita || b.qtd - a.qtd);
  }, [dimensaoSel, camposMap, propsFiltradas, valorDe, ehGanho, ehPerdido]);

  // ─── DRILLDOWN DA ETAPA ABERTA ──────────────────────────────────────────────
  const propsEtapa = useMemo(() => {
    if (!etapaAberta) return [];
    return propsFiltradas.filter(p => statusDe(p) === etapaAberta);
  }, [etapaAberta, propsFiltradas, statusDe]);

  const metricasEtapa = useMemo(() => {
    const valores = propsEtapa.map(valorDe);
    const total = valores.reduce((a, b) => a + b, 0);
    return {
      count: propsEtapa.length,
      total,
      ticket: propsEtapa.length > 0 ? total / propsEtapa.length : 0,
      mediana: mediana(valores),
      max: valores.length ? Math.max(...valores) : 0,
      min: valores.length ? Math.min(...valores) : 0,
    };
  }, [propsEtapa, valorDe]);

  const etapaPorDimensao = useCallback((slug: string) => {
    const campo = camposMap.get(slug);
    if (!campo) return [] as { chave: string; qtd: number; total: number }[];
    const mapa: Record<string, { qtd: number; total: number }> = {};
    for (const p of propsEtapa) {
      const k = lerTexto(p, campo) || "(vazio)";
      if (!mapa[k]) mapa[k] = { qtd: 0, total: 0 };
      mapa[k].qtd++;
      mapa[k].total += valorDe(p);
    }
    return Object.entries(mapa)
      .map(([chave, d]) => ({ chave, qtd: d.qtd, total: d.total }))
      .sort((a, b) => b.total - a.total);
  }, [propsEtapa, camposMap, valorDe]);

  const etapaPorVendedor = useMemo(() => {
    const mapa: Record<string, { qtd: number; valor: number }> = {};
    for (const p of propsEtapa) {
      const k = p.vendedor || "—";
      if (!mapa[k]) mapa[k] = { qtd: 0, valor: 0 };
      mapa[k].qtd++;
      mapa[k].valor += valorDe(p);
    }
    return Object.entries(mapa).map(([email, d]) => ({ email, nome: nomeVendedor(email), ...d })).sort((a, b) => b.valor - a.valor);
  }, [propsEtapa, valorDe, nomeVendedor]);

  const histogramaEtapa = useMemo(() => {
    if (propsEtapa.length === 0) return [];
    const valores = propsEtapa.map(valorDe);
    const max = Math.max(...valores, 1);
    const step = max / 5;
    const faixas = Array.from({ length: 5 }, (_, i) => ({
      label: `${formatBRLCompacto(i * step)}–${formatBRLCompacto((i + 1) * step)}`,
      min: i * step, max: (i + 1) * step,
      qtd: 0, valor: 0, cor: PALETA[i],
    }));
    for (const v of valores) {
      let idx = Math.floor(v / step);
      if (idx >= 5) idx = 4;
      if (idx < 0) idx = 0;
      faixas[idx].qtd++;
      faixas[idx].valor += v;
    }
    return faixas;
  }, [propsEtapa, valorDe]);

  const propsEtapaOrdenadas = useMemo(() => {
    const arr = [...propsEtapa];
    switch (listaOrdem) {
      case "recente":    arr.sort((a, b) => dataDe(b).getTime() - dataDe(a).getTime()); break;
      case "antiga":     arr.sort((a, b) => dataDe(a).getTime() - dataDe(b).getTime()); break;
      case "valor_desc": arr.sort((a, b) => valorDe(b) - valorDe(a)); break;
      case "valor_asc":  arr.sort((a, b) => valorDe(a) - valorDe(b)); break;
      case "nome_az":    arr.sort((a, b) => (a.nome || "").localeCompare(b.nome || "")); break;
    }
    return arr;
  }, [propsEtapa, listaOrdem, dataDe, valorDe]);

  const drillTotalPag = Math.max(1, Math.ceil(propsEtapaOrdenadas.length / DRILL_SIZE));
  const propsEtapaPagina = useMemo(() => propsEtapaOrdenadas.slice((drillPagina - 1) * DRILL_SIZE, drillPagina * DRILL_SIZE), [propsEtapaOrdenadas, drillPagina]);
  useEffect(() => { setDrillPagina(1); }, [etapaAberta, listaOrdem]);

  // ─── VENDEDORES ─────────────────────────────────────────────────────────────
  const vendedoresStats = useMemo(() => {
    const mapa: Record<string, { total: number; ganhos: number; perdidos: number; receita: number; pipeline: number }> = {};
    for (const p of propsFiltradas) {
      const k = p.vendedor || "—";
      if (!mapa[k]) mapa[k] = { total: 0, ganhos: 0, perdidos: 0, receita: 0, pipeline: 0 };
      const r = mapa[k];
      r.total++;
      const v = valorDe(p);
      if (ehGanho(p)) { r.ganhos++; r.receita += v; }
      else if (ehPerdido(p)) { r.perdidos++; }
      else { r.pipeline += v; }
    }
    return Object.entries(mapa).map(([email, d]) => {
      const fechados = d.ganhos + d.perdidos;
      return {
        email, nome: nomeVendedor(email), ...d,
        winRate: fechados > 0 ? Math.round((d.ganhos / fechados) * 100) : 0,
        ticket: d.ganhos > 0 ? d.receita / d.ganhos : 0,
      };
    }).sort((a, b) => b.receita - a.receita || b.winRate - a.winRate);
  }, [propsFiltradas, valorDe, ehGanho, ehPerdido, nomeVendedor]);

  // ─── SÉRIE TEMPORAL ─────────────────────────────────────────────────────────
  const serieTemporal = useMemo(() => {
    const dias = janela.tudo ? 90 : janela.dias;
    const tamMs = agrupTempo === "dia" ? 86400000 : agrupTempo === "semana" ? 7 * 86400000 : 30 * 86400000;
    const n = Math.max(1, Math.ceil(dias / (tamMs / 86400000)));
    const ini = janela.tudo ? new Date(Date.now() - dias * 86400000) : janela.ini;
    const buckets = Array.from({ length: n }, (_, i) => {
      const start = new Date(ini.getTime() + i * tamMs);
      return { label: formatDataCurta(start), start, geradas: 0, ganhos: 0, perdidos: 0, receita: 0 };
    });
    for (const p of propsFiltradas) {
      const d = dataDe(p);
      if (d < ini) continue;
      const idx = Math.floor((d.getTime() - ini.getTime()) / tamMs);
      if (idx < 0 || idx >= buckets.length) continue;
      const b = buckets[idx];
      b.geradas++;
      if (ehGanho(p)) { b.ganhos++; b.receita += valorDe(p); }
      else if (ehPerdido(p)) { b.perdidos++; }
    }
    return buckets;
  }, [propsFiltradas, janela, agrupTempo, dataDe, ehGanho, ehPerdido, valorDe]);

  // ─── COHORT ─────────────────────────────────────────────────────────────────
  const cohort = useMemo(() => {
    const base = propostas.filter(passaFiltrosBase);
    const agora = new Date();
    const hoje0 = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
    return Array.from({ length: 12 }, (_, idx) => {
      const i = 11 - idx;
      const ini = new Date(hoje0.getTime() - (i + 1) * 7 * 86400000);
      const fim = new Date(hoje0.getTime() - i * 7 * 86400000);
      const semana = base.filter(p => { const d = new Date(p.created_at); return d >= ini && d < fim; });
      const g = semana.filter(ehGanho);
      const perd = semana.filter(ehPerdido).length;
      const aberto = semana.length - g.length - perd;
      const total = semana.length;
      return {
        label: formatDataCurta(ini),
        total, ganhos: g.length, perdidos: perd, aberto,
        receita: g.reduce((a, p) => a + valorDe(p), 0),
        taxaGanho: total > 0 ? Math.round((g.length / total) * 100) : 0,
        taxaPerda: total > 0 ? Math.round((perd / total) * 100) : 0,
        taxaAberto: total > 0 ? Math.round((aberto / total) * 100) : 0,
      };
    });
  }, [propostas, passaFiltrosBase, ehGanho, ehPerdido, valorDe]);

  // ─── HEATMAP ────────────────────────────────────────────────────────────────
  const heatmap = useMemo(() => {
    const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    for (const p of propsFiltradas) {
      const d = new Date(p.created_at);
      grid[d.getDay()][d.getHours()]++;
    }
    let max = 0;
    for (const row of grid) for (const v of row) if (v > max) max = v;
    return { grid, max };
  }, [propsFiltradas]);

  const picoHorario = useMemo(() => {
    let best = { dia: 0, hora: 0, qtd: 0 };
    heatmap.grid.forEach((row, dia) => row.forEach((qtd, hora) => { if (qtd > best.qtd) best = { dia, hora, qtd }; }));
    return best;
  }, [heatmap]);

  const porDiaSemana = useMemo(() => heatmap.grid.map((row, i) => ({ dia: DIAS_SEMANA[i], qtd: row.reduce((a, b) => a + b, 0) })), [heatmap]);
  const porHora = useMemo(() => { const t = Array(24).fill(0); heatmap.grid.forEach(r => r.forEach((v, h) => t[h] += v)); return t.map((qtd, h) => ({ hora: `${h}h`, qtd })); }, [heatmap]);

  // ─── LISTA GERAL ────────────────────────────────────────────────────────────
  const listaOrdenada = useMemo(() => {
    const arr = [...propsFiltradas];
    switch (listaOrdem) {
      case "recente":    arr.sort((a, b) => dataDe(b).getTime() - dataDe(a).getTime()); break;
      case "antiga":     arr.sort((a, b) => dataDe(a).getTime() - dataDe(b).getTime()); break;
      case "valor_desc": arr.sort((a, b) => valorDe(b) - valorDe(a)); break;
      case "valor_asc":  arr.sort((a, b) => valorDe(a) - valorDe(b)); break;
      case "nome_az":    arr.sort((a, b) => (a.nome || "").localeCompare(b.nome || "")); break;
    }
    return arr;
  }, [propsFiltradas, listaOrdem, dataDe, valorDe]);
  const listaTotalPag = Math.max(1, Math.ceil(listaOrdenada.length / LISTA_SIZE));
  const listaPaginaArr = useMemo(() => listaOrdenada.slice((listaPagina - 1) * LISTA_SIZE, listaPagina * LISTA_SIZE), [listaOrdenada, listaPagina]);
  useEffect(() => { setListaPagina(1); }, [propsFiltradas.length, listaOrdem]);

  const colunasLista = useMemo<CampoUni[]>(() => {
    const naLista = campos.filter(c => c.mostrar_na_lista && c.visivel !== false);
    if (naLista.length > 0) return naLista.slice(0, 6);
    const escolhidos: CampoUni[] = [];
    const add = (slug: string) => { const c = camposMap.get(slug); if (c && !escolhidos.includes(c)) escolhidos.push(c); };
    add("nome");
    if (config?.campoStatus) add(config.campoStatus);
    if (config?.campoValor) add(config.campoValor);
    dimensoesDisponiveis.slice(0, 2).forEach(c => escolhidos.push(c));
    return escolhidos.slice(0, 6);
  }, [campos, camposMap, config, dimensoesDisponiveis]);

  // ─── HANDLERS ───────────────────────────────────────────────────────────────
  const abrirEtapa = (opt: string) => {
    if (etapaAberta === opt) { setEtapaAberta(null); return; }
    setEtapaAberta(opt);
    setAba("etapas");
    setListaOrdem("recente");
    setTimeout(() => {
      const el = document.getElementById("drill-etapa");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  const salvarConfigFunil = (novo: FunilConfig) => {
    setConfig(novo);
    salvarConfig(novo);
  };

  const limparFiltros = () => {
    setPeriodo("mensal");
    setDataInicio("");
    setDataFim("");
    setFiltroVendedor("todos");
    setFiltroBusca("");
    setFiltrosDim({});
    setEtapaAberta(null);
  };

  const algumFiltro = periodo !== "mensal" || filtroVendedor !== "todos" || filtroBusca !== "" || Object.values(filtrosDim).some(Boolean);
  const vendedoresUnicos = useMemo(() => Array.from(new Set(propostas.map(p => p.vendedor).filter(Boolean) as string[])).sort(), [propostas]);

  // ═══════════════════════════════════════════════════════════════════════════
  // 📞 ATENDIMENTOS — FUNIL POR ETIQUETA
  // ═══════════════════════════════════════════════════════════════════════════
  const etiquetasComCategoria = useMemo(() => {
    return etiquetas.map(e => ({
      ...e,
      categoria: (mapaEtq[String(e.id)] || classificarEtiquetaAuto(e.nome)) as CategoriaEtiqueta,
    }));
  }, [etiquetas, mapaEtq]);

  const etqById = useMemo(() => {
    const m = new Map<number, typeof etiquetasComCategoria[number]>();
    for (const e of etiquetasComCategoria) m.set(e.id, e);
    return m;
  }, [etiquetasComCategoria]);

  const etiquetasPorAtendimento = useMemo(() => {
    const m = new Map<number, number[]>();
    for (const r of atEtiquetas) {
      const arr = m.get(r.atendimento_id) || [];
      arr.push(r.etiqueta_id);
      m.set(r.atendimento_id, arr);
    }
    return m;
  }, [atEtiquetas]);

  const equipePorEmail = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const u of usuarios) m.set(u.email.toLowerCase(), u.equipe_id || null);
    return m;
  }, [usuarios]);

  const atendimentosFiltrados = useMemo(() => {
    return atendimentos.filter(a => {
      if (!janela.tudo) {
        const d = new Date(a.created_at);
        if (d < janela.ini || d > janela.fim) return false;
      }
      if (equipeId) {
        const eq = a.atendente ? equipePorEmail.get(a.atendente.toLowerCase()) : null;
        if (eq !== equipeId) return false;
      }
      if (filtroBusca) {
        const b = filtroBusca.toLowerCase();
        const nome = (a.nome || "").toLowerCase();
        const num = (a.numero || "").toLowerCase();
        if (!nome.includes(b) && !num.includes(b)) return false;
      }
      return true;
    });
  }, [atendimentos, janela, equipeId, equipePorEmail, filtroBusca]);

  const categoriaDoAtendimento = useCallback((atId: number): CategoriaEtiqueta => {
    const etqIds = etiquetasPorAtendimento.get(atId) || [];
    if (etqIds.length === 0) return "andamento";
    let temVenda = false, temInviavel = false;
    for (const id of etqIds) {
      const e = etqById.get(id);
      if (!e) continue;
      if (e.categoria === "venda") temVenda = true;
      else if (e.categoria === "inviavel") temInviavel = true;
    }
    if (temVenda) return "venda";
    if (temInviavel) return "inviavel";
    return "andamento";
  }, [etiquetasPorAtendimento, etqById]);

  const kpisAtendimento = useMemo(() => {
    let total = atendimentosFiltrados.length;
    let venda = 0, inviavel = 0, andamento = 0, semEtiqueta = 0;
    for (const a of atendimentosFiltrados) {
      const etqIds = etiquetasPorAtendimento.get(a.id) || [];
      if (etqIds.length === 0) { semEtiqueta++; andamento++; continue; }
      const cat = categoriaDoAtendimento(a.id);
      if (cat === "venda") venda++;
      else if (cat === "inviavel") inviavel++;
      else andamento++;
    }
    const taxaConv = total > 0 ? Math.round((venda / total) * 100) : 0;
    const taxaInv = total > 0 ? Math.round((inviavel / total) * 100) : 0;
    return { total, venda, inviavel, andamento, semEtiqueta, taxaConv, taxaInv };
  }, [atendimentosFiltrados, etiquetasPorAtendimento, categoriaDoAtendimento]);

  const performanceAtendentes = useMemo(() => {
    const mapa: Record<string, { email: string; nome: string; total: number; venda: number; inviavel: number; andamento: number; }> = {};
    for (const a of atendimentosFiltrados) {
      const email = a.atendente || "—";
      if (!mapa[email]) mapa[email] = { email, nome: nomeVendedor(email), total: 0, venda: 0, inviavel: 0, andamento: 0 };
      mapa[email].total++;
      const cat = categoriaDoAtendimento(a.id);
      if (cat === "venda") mapa[email].venda++;
      else if (cat === "inviavel") mapa[email].inviavel++;
      else mapa[email].andamento++;
    }
    return Object.values(mapa).map(r => ({
      ...r,
      taxaConv: r.total > 0 ? Math.round((r.venda / r.total) * 100) : 0,
      taxaInv: r.total > 0 ? Math.round((r.inviavel / r.total) * 100) : 0,
    })).sort((a, b) => b.venda - a.venda || b.total - a.total);
  }, [atendimentosFiltrados, categoriaDoAtendimento, nomeVendedor]);

  const rankingEtiquetas = useMemo(() => {
    const cont: Record<number, number> = {};
    const idsFiltrados = new Set(atendimentosFiltrados.map(a => a.id));
    for (const r of atEtiquetas) {
      if (!idsFiltrados.has(r.atendimento_id)) continue;
      cont[r.etiqueta_id] = (cont[r.etiqueta_id] || 0) + 1;
    }
    return etiquetasComCategoria
      .map(e => ({ ...e, qtd: cont[e.id] || 0 }))
      .filter(e => e.qtd > 0)
      .sort((a, b) => b.qtd - a.qtd);
  }, [atendimentosFiltrados, atEtiquetas, etiquetasComCategoria]);

  const salvarMapeamentoEtq = useCallback((etqId: number, cat: CategoriaEtiqueta) => {
    setMapaEtq(prev => {
      const novo = { ...prev, [String(etqId)]: cat };
      salvarMapaEtq(novo);
      return novo;
    });
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // 🚫 ACESSO RESTRITO
  // ═══════════════════════════════════════════════════════════════════════════
  if (!isDono && !isSuperAdmin && !permissoes.funil) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh", padding: 32 }}>
        <div style={{ ...cardStyle, padding: 48, textAlign: "center", maxWidth: 480 }}>
          <div style={{ width: 80, height: 80, borderRadius: 20, background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40, margin: "0 auto 16px", boxShadow: "0 12px 24px rgba(239,68,68,0.25)" }}>
            <span style={{ filter: "saturate(0) brightness(2)" }}>🔒</span>
          </div>
          <h1 style={{ color: "#1f2937", fontSize: 18, fontWeight: 700, margin: "0 0 8px" }}>Acesso restrito</h1>
          <p style={{ color: "#6b7280", fontSize: 13, margin: 0 }}>Você não tem permissão para ver o Funil de Vendas.</p>
        </div>
      </div>
    );
  }

  const periodoInfo = PERIODOS_MAP[periodo] || PERIODOS_MAP["mensal"];
  const periodoLabelCurto = periodo === "custom" && dataInicio && dataFim
    ? `${dataInicio.split("-").reverse().slice(0, 2).join("/")}–${dataFim.split("-").reverse().slice(0, 2).join("/")}`
    : periodoInfo.curto;

  // ═══════════════════════════════════════════════════════════════════════════
  // 🔬 DRILLDOWN DA ETAPA
  // ═══════════════════════════════════════════════════════════════════════════
  const renderDrilldownEtapa = () => {
    if (!etapaAberta) return null;
    const e = etapas.find(x => x.opcao === etapaAberta);
    const cor = e?.cor || "#2563eb";
    const tipoLabel = e?.tipo === "ganho" ? "✅ Ganho" : e?.tipo === "perdido" ? "❌ Perdido" : "▸ Em pipeline";

    return (
      <div id="drill-etapa" style={{ ...cardStyle, borderTop: `4px solid ${cor}`, overflow: "hidden", boxShadow: `0 4px 20px ${cor}15` }}>
        <div style={{ padding: isMobile ? "16px 18px" : "20px 24px", background: `linear-gradient(135deg, ${cor}08 0%, transparent 100%)`, borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: `linear-gradient(135deg, ${cor} 0%, ${cor}dd 100%)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, boxShadow: `0 4px 12px ${cor}40` }}>
              <span style={{ filter: "saturate(0) brightness(2)" }}>{e?.tipo === "ganho" ? "✅" : e?.tipo === "perdido" ? "❌" : "🎯"}</span>
            </div>
            <div>
              <h2 style={{ color: "#1f2937", fontSize: isMobile ? 16 : 18, fontWeight: 700, margin: 0 }}>{etapaAberta}</h2>
              <p style={{ color: "#6b7280", fontSize: 11, margin: "2px 0 0" }}>{tipoLabel} · {metricasEtapa.count} registro(s) · {formatBRL(metricasEtapa.total)}</p>
            </div>
          </div>
          <button onClick={() => setEtapaAberta(null)} style={{ background: "#f3f4f6", color: "#6b7280", border: "none", borderRadius: 10, padding: "8px 14px", fontSize: 11, cursor: "pointer", fontWeight: 700 }}>✕ Fechar</button>
        </div>

        <div style={{ padding: isMobile ? 16 : 24, display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Mini-stats */}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr 1fr" : "repeat(6, 1fr)", gap: 10 }}>
            <Mini label="Registros" valor={formatNum(metricasEtapa.count)} cor={cor} bg={`${cor}12`} icone="#️⃣" isMobile={isMobile} />
            <Mini label="Valor Total" valor={formatBRLCompacto(metricasEtapa.total)} cor="#16a34a" bg="#f0fdf4" icone="💰" isMobile={isMobile} />
            <Mini label="Ticket Médio" valor={formatBRLCompacto(metricasEtapa.ticket)} cor="#06b6d4" bg="#ecfeff" icone="🎫" isMobile={isMobile} />
            <Mini label="Mediana" valor={formatBRLCompacto(metricasEtapa.mediana)} cor="#8b5cf6" bg="#f3e8ff" icone="📊" isMobile={isMobile} />
            <Mini label="Mínimo" valor={formatBRLCompacto(metricasEtapa.min)} cor="#6b7280" bg="#f9fafb" icone="🔻" isMobile={isMobile} />
            <Mini label="Máximo" valor={formatBRLCompacto(metricasEtapa.max)} cor="#f59e0b" bg="#fffbeb" icone="🔺" isMobile={isMobile} />
          </div>

          {/* Histograma de valor */}
          {histogramaEtapa.length > 0 && metricasEtapa.total > 0 && (
            <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
              <p style={{ color: "#1f2937", fontSize: 13, fontWeight: 700, margin: "0 0 12px" }}>💸 Distribuição por faixa de valor ({campoValor?.label})</p>
              <ResponsiveContainer width="100%" height={190}>
                <BarChart data={histogramaEtapa} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="label" stroke="#6b7280" fontSize={9} />
                  <YAxis stroke="#6b7280" fontSize={10} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 10, fontSize: 12 }} formatter={(v: any) => [`${v} registro(s)`, "Qtd"]} cursor={{ fill: "#f3f4f6" }} />
                  <Bar dataKey="qtd" radius={[8, 8, 0, 0]}>
                    {histogramaEtapa.map((h, i) => <Cell key={i} fill={h.cor} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Quebras */}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
            <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 12, padding: 14 }}>
              <p style={{ color: "#1f2937", fontSize: 12, fontWeight: 700, margin: "0 0 10px" }}>👤 Por vendedor</p>
              {etapaPorVendedor.length === 0 ? <p style={{ color: "#9ca3af", fontSize: 11, fontStyle: "italic", margin: 0 }}>Sem dados.</p> :
                etapaPorVendedor.slice(0, 6).map((v, i) => (
                  <div key={v.email} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 10px", background: "#ffffff", borderRadius: 8, marginBottom: 6, border: "1px solid #f3f4f6" }}>
                    <span style={{ color: "#1f2937", fontSize: 12, fontWeight: 600, display: "flex", gap: 6, minWidth: 0, overflow: "hidden" }}>
                      <span>{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}</span>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.nome}</span>
                    </span>
                    <span style={{ color: cor, fontSize: 12, fontWeight: 800, flexShrink: 0 }}>{v.qtd} · {formatBRLCompacto(v.valor)}</span>
                  </div>
                ))}
            </div>
            <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 12, padding: 14 }}>
              <p style={{ color: "#1f2937", fontSize: 12, fontWeight: 700, margin: "0 0 10px" }}>
                🧩 Por {dimensoesDisponiveis[0]?.label || "dimensão"}
              </p>
              {(() => {
                const dim = dimensoesDisponiveis[0];
                if (!dim) return <p style={{ color: "#9ca3af", fontSize: 11, fontStyle: "italic", margin: 0 }}>Nenhuma dimensão configurada.</p>;
                const dados = etapaPorDimensao(dim.slug);
                if (dados.length === 0) return <p style={{ color: "#9ca3af", fontSize: 11, fontStyle: "italic", margin: 0 }}>Sem dados.</p>;
                return dados.slice(0, 6).map((d, i) => (
                  <div key={d.chave} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 10px", background: "#ffffff", borderRadius: 8, marginBottom: 6, border: "1px solid #f3f4f6" }}>
                    <span style={{ color: "#1f2937", fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{d.chave}</span>
                    <span style={{ color: cor, fontSize: 12, fontWeight: 800, flexShrink: 0 }}>{d.qtd} · {formatBRLCompacto(d.total)}</span>
                  </div>
                ));
              })()}
            </div>
          </div>

          {/* Lista de registros */}
          <div>
            <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ color: "#6b7280", fontSize: 11, fontWeight: 700 }}>Ordenar:</span>
              {([
                { k: "recente", l: "📅 Recente" },
                { k: "valor_desc", l: "💰 Maior valor" },
                { k: "valor_asc", l: "💸 Menor valor" },
                { k: "nome_az", l: "🔤 Nome" },
              ] as { k: OrdemLista; l: string }[]).map(o => (
                <button key={o.k} onClick={() => setListaOrdem(o.k)}
                  style={{ ...chipStyle, fontSize: 11, background: listaOrdem === o.k ? `${cor}15` : "#f9fafb", color: listaOrdem === o.k ? cor : "#6b7280", borderColor: listaOrdem === o.k ? cor : "#e5e7eb", fontWeight: listaOrdem === o.k ? 700 : 600 }}>
                  {o.l}
                </button>
              ))}
            </div>
            {propsEtapaPagina.length === 0 ? (
              <p style={{ color: "#9ca3af", fontSize: 13, fontStyle: "italic", textAlign: "center", padding: 24 }}>Nenhum registro.</p>
            ) : (
              <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", border: "1px solid #e5e7eb", borderRadius: 10 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: isMobile ? 560 : "auto" }}>
                  <thead>
                    <tr style={{ background: "#f9fafb" }}>
                      {colunasLista.map(c => (
                        <th key={c.slug} style={{ padding: "10px 14px", color: "#6b7280", fontSize: 10, textAlign: "left", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700, borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap" }}>{c.label}</th>
                      ))}
                      <th style={{ padding: "10px 14px", color: "#6b7280", fontSize: 10, textAlign: "left", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700, borderBottom: "1px solid #e5e7eb" }}>Vendedor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {propsEtapaPagina.map((p, i) => (
                      <tr key={p.id} onClick={() => router.push("/crm/vendas")}
                        style={{ borderTop: "1px solid #f3f4f6", background: i % 2 === 0 ? "#ffffff" : "#fafbfc", cursor: "pointer" }}
                        onMouseEnter={ev => ev.currentTarget.style.background = "#f3f4f6"}
                        onMouseLeave={ev => ev.currentTarget.style.background = i % 2 === 0 ? "#ffffff" : "#fafbfc"}>
                        {colunasLista.map(c => {
                          const isValor = c.tipo === "moeda";
                          const txt = isValor ? formatBRL(lerNumero(p, c)) : (lerTexto(p, c) || "—");
                          return (
                            <td key={c.slug} style={{ padding: "10px 14px", color: isValor ? "#16a34a" : "#1f2937", fontSize: 12, fontWeight: isValor ? 700 : 500, whiteSpace: "nowrap", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" }}>{txt}</td>
                          );
                        })}
                        <td style={{ padding: "10px 14px", color: "#6b7280", fontSize: 12 }}>{nomeVendedor(p.vendedor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {drillTotalPag > 1 && (
              <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, marginTop: 14 }}>
                <button onClick={() => setDrillPagina(p => Math.max(1, p - 1))} disabled={drillPagina === 1}
                  style={{ background: drillPagina === 1 ? "#f3f4f6" : "#ffffff", color: drillPagina === 1 ? "#9ca3af" : "#374151", border: "1px solid #e5e7eb", borderRadius: 10, padding: "7px 12px", fontSize: 12, cursor: drillPagina === 1 ? "not-allowed" : "pointer", fontWeight: 600 }}>← Anterior</button>
                <span style={{ color: "#6b7280", fontSize: 12, padding: "0 10px", fontWeight: 600 }}>Pág. <b style={{ color: "#1f2937" }}>{drillPagina}</b> / <b style={{ color: "#1f2937" }}>{drillTotalPag}</b></span>
                <button onClick={() => setDrillPagina(p => Math.min(drillTotalPag, p + 1))} disabled={drillPagina === drillTotalPag}
                  style={{ background: drillPagina === drillTotalPag ? "#f3f4f6" : "#ffffff", color: drillPagina === drillTotalPag ? "#9ca3af" : "#374151", border: "1px solid #e5e7eb", borderRadius: 10, padding: "7px 12px", fontSize: 12, cursor: drillPagina === drillTotalPag ? "not-allowed" : "pointer", fontWeight: 600 }}>Próxima →</button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 🎨 RENDER PRINCIPAL
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 16 : 22 }}>

      {/* ═══ BANNER MODO DEMO ═══ */}
      {modoDemo && (
        <div style={{
          background: "linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)",
          border: "1px solid #bfdbfe",
          borderLeft: "4px solid #2563eb",
          borderRadius: 12,
          padding: "12px 18px",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}>
          <span style={{ fontSize: 22 }}>💡</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ color: "#1e40af", fontSize: 13.5, margin: 0, fontWeight: 700 }}>
              Modo demonstração ativo
            </p>
            <p style={{ color: "#3b82f6", fontSize: 12, margin: "2px 0 0", lineHeight: 1.4 }}>
              Mostrando 220 propostas fictícias — a tabela <code style={{ background: "#dbeafe", padding: "1px 6px", borderRadius: 4, fontFamily: "monospace", fontSize: 11.5 }}>proposta</code> ainda não foi criada ou está vazia.
            </p>
          </div>
        </div>
      )}

      {/* ═══ HEADER ═══ */}
      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: isMobile ? "stretch" : "center", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: "linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, boxShadow: "0 8px 20px rgba(37,99,235,0.25)", flexShrink: 0 }}>
            <span style={{ filter: "saturate(0) brightness(2)" }}>🎯</span>
          </div>
          <div>
            <h1 style={{ color: "#1f2937", fontSize: isMobile ? 20 : 24, fontWeight: 700, margin: 0, letterSpacing: -0.3 }}>Funil de Vendas</h1>
            <p style={{ color: "#6b7280", fontSize: 12, margin: "2px 0 0" }}>
              <b style={{ color: "#2563eb" }}>{metricas.total}</b> registros · {periodoLabelCurto}
              {campoStatus && <> · etapa: <b>{campoStatus.label}</b></>}
              {campoValor && <> · valor: <b>{campoValor.label}</b></>}
              {equipeId && <> · <span style={{ color: "#a855f7", fontWeight: 700 }}>👥 equipe</span></>}
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <EquipeSelector />
          <button onClick={() => setShowConfig(s => !s)}
            style={{ ...inputStyle, display: "flex", alignItems: "center", gap: 6, background: showConfig ? "#eff6ff" : "#ffffff", color: showConfig ? "#2563eb" : "#6b7280", borderColor: showConfig ? "#bfdbfe" : "#e5e7eb" }}>
            ⚙️ Configurar funil
          </button>
        </div>
      </div>

      {/* ═══ PAINEL DE CONFIG ═══ */}
      {showConfig && config && (
        <div style={{ ...cardStyle, padding: isMobile ? 16 : 20, borderTop: "3px solid #2563eb" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
            <h3 style={{ ...sectionTitleStyle, margin: 0, fontSize: 14 }}>
              <span style={{ width: 28, height: 28, borderRadius: 8, background: "#eff6ff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>⚙️</span>
              Como ler este funil no Grupo Unita
            </h3>
            <button onClick={() => { const auto = autoDetectarConfig(campos); salvarConfigFunil(auto); }}
              style={{ background: "#f9fafb", color: "#6b7280", border: "1px solid #e5e7eb", borderRadius: 8, padding: "6px 12px", fontSize: 11, cursor: "pointer", fontWeight: 700 }}>
              🔄 Auto-detectar
            </button>
          </div>
          <p style={{ color: "#6b7280", fontSize: 12, margin: "0 0 16px", lineHeight: 1.5 }}>
            O funil lê os campos que você criou no <b>Editor de Proposta</b>. Aqui você só diz o que cada coisa significa — qual campo é a <b>etapa</b>, qual é o <b>valor (R$)</b>, e quais situações contam como <b style={{ color: "#16a34a" }}>ganho</b> ou <b style={{ color: "#dc2626" }}>perdido</b>.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
            <div>
              <label style={{ color: "#6b7280", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 6 }}>🏷️ Campo de Etapa/Status</label>
              <select value={config.campoStatus} onChange={e => salvarConfigFunil({ ...config, campoStatus: e.target.value, statusGanho: [], statusPerdido: [] })} style={{ ...inputStyle, width: "100%" }}>
                {camposStatusDisp.length === 0 && <option value={config.campoStatus}>{config.campoStatus}</option>}
                {camposStatusDisp.map(c => <option key={c.slug} value={c.slug}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ color: "#6b7280", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 6 }}>💰 Campo de Valor (R$)</label>
              <select value={config.campoValor} onChange={e => salvarConfigFunil({ ...config, campoValor: e.target.value })} style={{ ...inputStyle, width: "100%" }}>
                {camposValorDisp.length === 0 && <option value={config.campoValor}>{config.campoValor}</option>}
                {camposValorDisp.map(c => <option key={c.slug} value={c.slug}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ color: "#6b7280", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 6 }}>📅 Campo de Data</label>
              <select value={config.campoData} onChange={e => salvarConfigFunil({ ...config, campoData: e.target.value })} style={{ ...inputStyle, width: "100%" }}>
                <option value="">Data de criação (padrão)</option>
                {camposDataDisp.map(c => <option key={c.slug} value={c.slug}>{c.label}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
            <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: 12 }}>
              <p style={{ color: "#15803d", fontSize: 11, fontWeight: 700, margin: "0 0 8px" }}>✅ Situações que contam como GANHO</p>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {opcoesStatus.map(opt => {
                  const at = config.statusGanho.includes(opt);
                  return (
                    <button key={opt} onClick={() => {
                      const ng = at ? config.statusGanho.filter(x => x !== opt) : [...config.statusGanho, opt];
                      const np = config.statusPerdido.filter(x => x !== opt);
                      salvarConfigFunil({ ...config, statusGanho: ng, statusPerdido: np });
                    }}
                      style={{ ...chipStyle, background: at ? "#16a34a" : "#ffffff", color: at ? "white" : "#6b7280", borderColor: at ? "#16a34a" : "#e5e7eb", fontWeight: at ? 700 : 600 }}>
                      {at ? "✓ " : ""}{opt}
                    </button>
                  );
                })}
                {opcoesStatus.length === 0 && <span style={{ color: "#9ca3af", fontSize: 11, fontStyle: "italic" }}>O campo de etapa não tem opções definidas.</span>}
              </div>
            </div>
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: 12 }}>
              <p style={{ color: "#991b1b", fontSize: 11, fontWeight: 700, margin: "0 0 8px" }}>❌ Situações que contam como PERDIDO</p>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {opcoesStatus.map(opt => {
                  const at = config.statusPerdido.includes(opt);
                  return (
                    <button key={opt} onClick={() => {
                      const np = at ? config.statusPerdido.filter(x => x !== opt) : [...config.statusPerdido, opt];
                      const ng = config.statusGanho.filter(x => x !== opt);
                      salvarConfigFunil({ ...config, statusPerdido: np, statusGanho: ng });
                    }}
                      style={{ ...chipStyle, background: at ? "#dc2626" : "#ffffff", color: at ? "white" : "#6b7280", borderColor: at ? "#dc2626" : "#e5e7eb", fontWeight: at ? 700 : 600 }}>
                      {at ? "✗ " : ""}{opt}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <p style={{ color: "#9ca3af", fontSize: 11, margin: "12px 0 0", lineHeight: 1.4 }}>
            As situações que <b>não</b> forem ganho nem perdido são tratadas como <b>pipeline em aberto</b>. Sua escolha fica salva neste navegador.
          </p>

          {opcoesStatus.length > 0 && (
            <div style={{ marginTop: 18, paddingTop: 18, borderTop: "1px dashed #e5e7eb" }}>
              <p style={{ color: "#1f2937", fontSize: 12, fontWeight: 700, margin: "0 0 4px" }}>🔮 Probabilidade de fechar por etapa</p>
              <p style={{ color: "#9ca3af", fontSize: 11, margin: "0 0 12px" }}>Usada no <b>forecast ponderado</b>: cada negócio em aberto vale valor × probabilidade da etapa.</p>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
                {opcoesStatus.map(opt => {
                  const isG = config.statusGanho.includes(opt);
                  const isP = config.statusPerdido.includes(opt);
                  const val = isG ? 100 : isP ? 0 : (config.probabilidades[opt] ?? 0);
                  return (
                    <div key={opt} style={{ display: "flex", alignItems: "center", gap: 10, background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 12px" }}>
                      <span style={{ color: "#1f2937", fontSize: 12, fontWeight: 600, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {isG ? "✅ " : isP ? "❌ " : "▸ "}{opt}
                      </span>
                      <input type="range" min={0} max={100} step={5} value={val} disabled={isG || isP}
                        onChange={e => salvarConfigFunil({ ...config, probabilidades: { ...config.probabilidades, [opt]: parseInt(e.target.value) } })}
                        style={{ flex: 1, accentColor: "#2563eb", cursor: isG || isP ? "not-allowed" : "pointer" }} />
                      <span style={{ color: isG ? "#16a34a" : isP ? "#dc2626" : "#2563eb", fontSize: 12, fontWeight: 800, width: 42, textAlign: "right" }}>{val}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ marginTop: 18, paddingTop: 18, borderTop: "1px dashed #e5e7eb" }}>
            <p style={{ color: "#1f2937", fontSize: 12, fontWeight: 700, margin: "0 0 12px" }}>🏆 Metas do mês</p>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 12 }}>
              <div>
                <label style={{ color: "#6b7280", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 6 }}>💰 Meta de receita (R$)</label>
                <input type="number" min={0} value={config.metaReceita || ""} placeholder="0"
                  onChange={e => salvarConfigFunil({ ...config, metaReceita: parseFloat(e.target.value) || 0 })}
                  style={{ ...inputStyle, width: "100%", cursor: "text" }} />
              </div>
              <div>
                <label style={{ color: "#6b7280", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 6 }}>✅ Meta de ganhos (qtd)</label>
                <input type="number" min={0} value={config.metaGanhos || ""} placeholder="0"
                  onChange={e => salvarConfigFunil({ ...config, metaGanhos: parseInt(e.target.value) || 0 })}
                  style={{ ...inputStyle, width: "100%", cursor: "text" }} />
              </div>
              <div>
                <label style={{ color: "#6b7280", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 6 }}>🥶 Dias p/ "parado"</label>
                <input type="number" min={1} value={config.diasParado || ""} placeholder="14"
                  onChange={e => salvarConfigFunil({ ...config, diasParado: parseInt(e.target.value) || 14 })}
                  style={{ ...inputStyle, width: "100%", cursor: "text" }} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ FILTROS ═══ */}
      <div style={{ ...cardStyle, padding: isMobile ? 14 : 16, display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <p style={{ color: "#6b7280", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, margin: "0 0 8px" }}>📆 Período</p>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {PERIODOS.map(p => {
              const at = periodo === p.key;
              return (
                <button key={p.key} onClick={() => setPeriodo(p.key)}
                  style={{ background: at ? `${p.cor}15` : "#ffffff", color: at ? p.cor : "#6b7280", border: `1px solid ${at ? `${p.cor}50` : "#e5e7eb"}`, borderRadius: 10, padding: "8px 14px", fontSize: 12, cursor: "pointer", fontWeight: at ? 700 : 600, boxShadow: at ? `0 2px 8px ${p.cor}20` : "none", transition: "all 0.15s" }}>
                  {p.icone} {p.label}
                </button>
              );
            })}
            <button onClick={() => setPeriodo("custom")}
              style={{ background: periodo === "custom" ? "#ec489915" : "#ffffff", color: periodo === "custom" ? "#ec4899" : "#6b7280", border: `1px solid ${periodo === "custom" ? "#ec489950" : "#e5e7eb"}`, borderRadius: 10, padding: "8px 14px", fontSize: 12, cursor: "pointer", fontWeight: periodo === "custom" ? 700 : 600, boxShadow: periodo === "custom" ? "0 2px 8px #ec489920" : "none", transition: "all 0.15s" }}>
              📅 Personalizado
            </button>
          </div>
          {periodo === "custom" && (
            <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap", alignItems: "flex-end", background: "#fdf2f8", border: "1px solid #fbcfe8", borderRadius: 10, padding: 12 }}>
              <div>
                <label style={{ color: "#9d174d", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 5 }}>De</label>
                <input type="date" value={dataInicio} max={dataFim || undefined} onChange={e => setDataInicio(e.target.value)}
                  style={{ ...inputStyle, cursor: "text", borderColor: "#fbcfe8" }} />
              </div>
              <div>
                <label style={{ color: "#9d174d", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 5 }}>Até</label>
                <input type="date" value={dataFim} min={dataInicio || undefined} onChange={e => setDataFim(e.target.value)}
                  style={{ ...inputStyle, cursor: "text", borderColor: "#fbcfe8" }} />
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {([
                  { l: "Este mês", calc: () => { const n = new Date(); return [new Date(n.getFullYear(), n.getMonth(), 1), new Date(n.getFullYear(), n.getMonth() + 1, 0)] as [Date, Date]; } },
                  { l: "Mês passado", calc: () => { const n = new Date(); return [new Date(n.getFullYear(), n.getMonth() - 1, 1), new Date(n.getFullYear(), n.getMonth(), 0)] as [Date, Date]; } },
                  { l: "Este ano", calc: () => { const n = new Date(); return [new Date(n.getFullYear(), 0, 1), new Date(n.getFullYear(), 11, 31)] as [Date, Date]; } },
                ]).map(a => (
                  <button key={a.l} onClick={() => { const [i, f] = a.calc(); setDataInicio(i.toISOString().slice(0, 10)); setDataFim(f.toISOString().slice(0, 10)); }}
                    style={{ background: "#ffffff", color: "#9d174d", border: "1px solid #fbcfe8", borderRadius: 8, padding: "7px 11px", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>
                    {a.l}
                  </button>
                ))}
              </div>
              {(!dataInicio || !dataFim) && <span style={{ color: "#9d174d", fontSize: 11, fontWeight: 600, alignSelf: "center" }}>👈 escolha as duas datas</span>}
            </div>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : `repeat(${Math.min(4, 2 + dimensoesDisponiveis.slice(0,2).length)}, 1fr)`, gap: 10, alignItems: "end" }}>
          <div>
            <p style={{ color: "#6b7280", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, margin: "0 0 6px" }}>👤 Vendedor</p>
            <select value={filtroVendedor} onChange={e => setFiltroVendedor(e.target.value)} style={{ ...inputStyle, width: "100%" }}>
              <option value="todos">Todos</option>
              {vendedoresUnicos.map(v => <option key={v} value={v}>{nomeVendedor(v)}</option>)}
            </select>
          </div>
          {dimensoesDisponiveis.slice(0, 2).map(dim => (
            <div key={dim.slug}>
              <p style={{ color: "#6b7280", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, margin: "0 0 6px" }}>{dim.label}</p>
              <select value={filtrosDim[dim.slug] || ""} onChange={e => setFiltrosDim(f => ({ ...f, [dim.slug]: e.target.value }))} style={{ ...inputStyle, width: "100%" }}>
                <option value="">Todos</option>
                {(dim.opcoes && dim.opcoes.length ? dim.opcoes : Array.from(new Set(propostas.map(p => lerTexto(p, dim)).filter(Boolean)))).map(o => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>
          ))}
          <div>
            <p style={{ color: "#6b7280", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, margin: "0 0 6px" }}>🔍 Buscar</p>
            <input placeholder="Nome, vendedor, status..." value={filtroBusca} onChange={e => setFiltroBusca(e.target.value)} style={{ ...inputStyle, width: "100%", cursor: "text", borderRadius: 20 }} />
          </div>
        </div>

        {algumFiltro && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 4 }}>
            <p style={{ color: "#6b7280", fontSize: 11, margin: 0 }}>
              <b style={{ color: "#1f2937" }}>{propsFiltradas.length}</b> de <b style={{ color: "#1f2937" }}>{propostas.length}</b> registros
            </p>
            <button onClick={limparFiltros} style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", borderRadius: 10, padding: "6px 14px", fontSize: 11, cursor: "pointer", fontWeight: 700 }}>
              ✕ Limpar filtros
            </button>
          </div>
        )}
      </div>

      {/* ═══ TABS (Vendedores: verde→azul; resto mantém cores) ═══ */}
      <div style={{ ...cardStyle, padding: 6, display: "flex", gap: 4, overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
        {([
          { key: "visao",      label: "Visão Geral",  icone: "📊", color: "#2563eb" },
          { key: "etapas",     label: "Etapas",       icone: "🎯", color: "#3b82f6" },
          { key: "dimensoes",  label: "Quebras",      icone: "🧩", color: "#8b5cf6" },
          { key: "vendedores", label: "Vendedores",   icone: "👥", color: "#0891b2" },
          { key: "atendimentos", label: "Atendimentos", icone: "📞", color: "#a855f7" },
          { key: "metas",      label: "Metas",        icone: "🏆", color: "#eab308" },
          { key: "temporal",   label: "Temporal",     icone: "📈", color: "#f59e0b" },
          { key: "cohort",     label: "Coorte",       icone: "🧬", color: "#0ea5e9" },
          { key: "horarios",   label: "Horários",     icone: "🗓️", color: "#14b8a6" },
          { key: "lista",      label: "Lista",        icone: "📑", color: "#6366f1" },
        ] as { key: AbaKey; label: string; icone: string; color: string }[]).map(t => {
          const at = aba === t.key;
          return (
            <button key={t.key} onClick={() => setAba(t.key)}
              style={{ background: at ? `linear-gradient(135deg, ${t.color} 0%, ${t.color}dd 100%)` : "transparent", color: at ? "white" : "#6b7280", border: "none", borderRadius: 10, padding: "9px 16px", fontSize: 12, cursor: "pointer", fontWeight: 700, boxShadow: at ? `0 4px 12px ${t.color}40` : "none", transition: "all 0.15s", whiteSpace: "nowrap", flexShrink: 0 }}>
              {t.icone} {t.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div style={{ ...cardStyle, padding: 48, textAlign: "center", color: "#6b7280" }}>Carregando funil...</div>
      ) : !config ? (
        <div style={{ ...cardStyle, padding: 48, textAlign: "center", color: "#6b7280" }}>Carregando configuração de campos...</div>
      ) : metricas.total === 0 ? (
        <div style={{ ...cardStyle, padding: 48, textAlign: "center" }}>
          <div style={{ width: 80, height: 80, borderRadius: 20, background: "linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40, margin: "0 auto 16px", boxShadow: "0 12px 24px rgba(37,99,235,0.25)" }}>
            <span style={{ filter: "saturate(0) brightness(2)" }}>🎯</span>
          </div>
          <h3 style={{ color: "#1f2937", fontSize: 16, fontWeight: 700, margin: "0 0 8px" }}>Sem registros no período</h3>
          <p style={{ color: "#6b7280", fontSize: 13, margin: 0 }}>Amplie o período, limpe filtros, ou confira a config do funil (⚙️).</p>
        </div>
      ) : (
        <>
          {/* ════════════ ABA: VISÃO GERAL ════════════ */}
          {aba === "visao" && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: isMobile ? 10 : 14 }}>
                <KPI cor="#16a34a" bg="#f0fdf4" icone="💰" label="Receita (ganhos)" valor={formatBRLCompacto(metricas.receita)} titulo={formatBRL(metricas.receita)} sub={`${metricas.ganhos} ganhos`} trend={metricas.tRec} isMobile={isMobile} />
                <KPI cor="#2563eb" bg="#eff6ff" icone="🎯" label="Pipeline" valor={formatBRLCompacto(metricas.valorPipeline)} titulo={formatBRL(metricas.valorPipeline)} sub={`${metricas.pipelineCount} em aberto`} isMobile={isMobile} />
                <KPI cor="#8b5cf6" bg="#f3e8ff" icone="📊" label="Win Rate" valor={`${metricas.winRate}%`} sub={`${metricas.ganhos} ✓ / ${metricas.perdidos} ✗`} trend={metricas.tWin} isMobile={isMobile} />
                <KPI cor="#06b6d4" bg="#ecfeff" icone="🎫" label="Ticket Médio" valor={formatBRLCompacto(metricas.ticket)} titulo={formatBRL(metricas.ticket)} sub={`mediana ${formatBRLCompacto(metricas.ticketMediana)}`} trend={metricas.tTicket} isMobile={isMobile} />
                <KPI cor="#f59e0b" bg="#fffbeb" icone="⏱️" label="Ciclo Médio" valor={`${metricas.ciclo}d`} sub="Entrada → ganho" isMobile={isMobile} />
                <KPI cor="#a855f7" bg="#f5f3ff" icone="🔮" label="Forecast Ponderado" valor={formatBRLCompacto(metricas.forecastPonderado)} titulo={formatBRL(metricas.forecastPonderado)} sub="valor × prob. por etapa" isMobile={isMobile} />
                <KPI cor="#6366f1" bg="#eef2ff" icone="📨" label="Total" valor={formatNum(metricas.total)} sub={periodoLabelCurto} trend={metricas.tTotal} isMobile={isMobile} />
                <KPI cor="#dc2626" bg="#fef2f2" icone="🚫" label="Perdidos" valor={formatNum(metricas.perdidos)} sub={`${metricas.taxaPerda}% dos fechados`} isMobile={isMobile} />
              </div>

              {/* Funil visual */}
              <div style={{ ...cardStyle, padding: isMobile ? 16 : 24 }}>
                <h3 style={sectionTitleStyle}>
                  <span style={{ width: 32, height: 32, borderRadius: 8, background: "#eff6ff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>📊</span>
                  Funil — {campoStatus?.label || "Etapas"}
                  <span style={{ color: "#9ca3af", fontSize: 11, fontWeight: 600, marginLeft: "auto" }}>clique numa etapa pra abrir o dashboard</span>
                </h3>
                {etapasFunil.length === 0 ? (
                  <p style={{ color: "#9ca3af", fontSize: 13, fontStyle: "italic" }}>
                    O campo de etapa ("{campoStatus?.label}") não tem opções. Configure as opções no Editor de Proposta ou escolha outro campo em ⚙️.
                  </p>
                ) : (
                  <div style={{ maxWidth: 620, margin: "0 auto", display: "flex", flexDirection: "column", gap: 5 }}>
                    {etapasFunil.map((e) => {
                      const largura = Math.max(40, 100 * (e.qtd / maxQtdEtapa));
                      const aberta = etapaAberta === e.opcao;
                      return (
                        <div key={e.opcao} onClick={() => abrirEtapa(e.opcao)}
                          style={{ display: "flex", justifyContent: "center", cursor: "pointer" }}>
                          <div style={{ width: `${largura}%`, minWidth: 0, background: `linear-gradient(135deg, ${e.cor} 0%, ${e.cor}dd 100%)`, color: "white", borderRadius: 10, padding: "9px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, boxShadow: `0 2px 8px ${e.cor}35`, outline: aberta ? `2px solid ${e.cor}` : "none", outlineOffset: 2, transition: "all 0.15s" }}>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <p style={{ margin: 0, fontSize: 12, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {e.tipo === "ganho" ? "✅ " : "▸ "}{e.opcao}{aberta && " 📂"}
                              </p>
                              <p style={{ margin: "1px 0 0", fontSize: 9, opacity: 0.9 }}>{formatBRLCompacto(e.valor)}</p>
                            </div>
                            <p style={{ margin: 0, fontSize: 18, fontWeight: 800, letterSpacing: -0.5, flexShrink: 0 }}>{e.qtd}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {etapasPerdidas.length > 0 && (
                  <div style={{ maxWidth: 620, margin: "12px auto 0", display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {etapasPerdidas.map(e => (
                      <div key={e.opcao} onClick={() => abrirEtapa(e.opcao)}
                        style={{ flex: "1 1 200px", background: "#fef2f2", border: "1px solid #fecaca", borderLeft: "4px solid #dc2626", borderRadius: 10, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", outline: etapaAberta === e.opcao ? "2px solid #dc2626" : "none", outlineOffset: 2 }}>
                        <div>
                          <p style={{ color: "#991b1b", fontSize: 12, fontWeight: 700, margin: 0 }}>❌ {e.opcao}</p>
                          <p style={{ color: "#7f1d1d", fontSize: 10, margin: "2px 0 0" }}>{formatBRLCompacto(e.valor)}</p>
                        </div>
                        <p style={{ color: "#dc2626", fontSize: 20, fontWeight: 800, margin: 0 }}>{e.qtd}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Cards de etapa */}
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : `repeat(${Math.min(5, etapas.length || 1)}, 1fr)`, gap: isMobile ? 8 : 12 }}>
                {etapas.map(e => (
                  <div key={e.opcao} onClick={() => abrirEtapa(e.opcao)}
                    style={{ ...cardStyle, padding: isMobile ? 12 : 16, borderLeft: `4px solid ${e.cor}`, cursor: "pointer", outline: etapaAberta === e.opcao ? `2px solid ${e.cor}` : "none", outlineOffset: 2, transition: "all 0.15s" }}
                    onMouseEnter={ev => { ev.currentTarget.style.boxShadow = `0 8px 20px ${e.cor}25`; ev.currentTarget.style.transform = "translateY(-2px)"; }}
                    onMouseLeave={ev => { ev.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)"; ev.currentTarget.style.transform = "translateY(0)"; }}>
                    <p style={{ color: e.cor, fontSize: isMobile ? 20 : 26, fontWeight: 800, margin: 0, letterSpacing: -0.5 }}>{e.qtd}</p>
                    <p style={{ color: "#6b7280", fontSize: 11, margin: "2px 0 0", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.opcao}</p>
                    <p style={{ color: "#9ca3af", fontSize: 10, margin: "4px 0 0" }}>{formatBRLCompacto(e.valor)}</p>
                  </div>
                ))}
              </div>

              {/* Higiene de pipeline */}
              {aging.totalAbertos > 0 && (
                <div style={{ ...cardStyle, padding: isMobile ? 16 : 24 }}>
                  <h3 style={sectionTitleStyle}>
                    <span style={{ width: 32, height: 32, borderRadius: 8, background: "#fff7ed", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>🌡️</span>
                    Higiene do pipeline — há quanto tempo os negócios estão abertos
                    {aging.parados.length > 0 && (
                      <span style={{ marginLeft: "auto", background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", fontSize: 11, padding: "4px 10px", borderRadius: 10, fontWeight: 700 }}>
                        🥶 {aging.parados.length} parado(s) · {formatBRLCompacto(aging.valorParado)}
                      </span>
                    )}
                  </h3>
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(5, 1fr)", gap: 10, marginBottom: aging.parados.length > 0 ? 18 : 0 }}>
                    {aging.faixas.map(f => (
                      <div key={f.label} style={{ background: `${f.cor}10`, border: `1px solid ${f.cor}30`, borderRadius: 10, padding: 12, textAlign: "center" }}>
                        <p style={{ color: f.cor, fontSize: 22, fontWeight: 800, margin: 0 }}>{f.qtd}</p>
                        <p style={{ color: "#6b7280", fontSize: 10, margin: "2px 0 0", fontWeight: 600 }}>{f.label}</p>
                        <p style={{ color: "#9ca3af", fontSize: 10, margin: "3px 0 0" }}>{formatBRLCompacto(f.valor)}</p>
                      </div>
                    ))}
                  </div>
                  {aging.parados.length > 0 && (
                    <div>
                      <p style={{ color: "#991b1b", fontSize: 12, fontWeight: 700, margin: "0 0 10px" }}>
                        ⚠️ Parados há {aging.limite}+ dias sem atualização — precisam de atenção:
                      </p>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {aging.parados.slice(0, 8).map(({ p, diasParado, valor }) => (
                          <div key={p.id} onClick={() => router.push("/crm/vendas")}
                            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, background: "#fffbeb", border: "1px solid #fde68a", borderLeft: "4px solid #f59e0b", borderRadius: 8, padding: "9px 12px", cursor: "pointer" }}>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <p style={{ color: "#1f2937", fontSize: 12, fontWeight: 700, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.nome || `#${p.id}`}</p>
                              <p style={{ color: "#92400e", fontSize: 10, margin: "2px 0 0" }}>{statusDe(p)} · {nomeVendedor(p.vendedor)}</p>
                            </div>
                            <div style={{ textAlign: "right", flexShrink: 0 }}>
                              <p style={{ color: "#dc2626", fontSize: 12, fontWeight: 800, margin: 0 }}>{diasParado}d parado</p>
                              <p style={{ color: "#16a34a", fontSize: 11, fontWeight: 700, margin: "2px 0 0" }}>{formatBRLCompacto(valor)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {etapaAberta && renderDrilldownEtapa()}
            </>
          )}

          {/* ════════════ ABA: ETAPAS ════════════ */}
          {aba === "etapas" && (
            <>
              <div style={{ ...cardStyle, padding: isMobile ? 14 : 18 }}>
                <p style={{ color: "#6b7280", fontSize: 12, margin: "0 0 12px", fontWeight: 600 }}>
                  Selecione uma etapa pra abrir o dashboard completo dela:
                </p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {etapas.map(e => (
                    <button key={e.opcao} onClick={() => setEtapaAberta(e.opcao)}
                      style={{ ...chipStyle, background: etapaAberta === e.opcao ? e.cor : "#ffffff", color: etapaAberta === e.opcao ? "white" : "#6b7280", borderColor: e.cor, fontWeight: etapaAberta === e.opcao ? 700 : 600 }}>
                      {e.tipo === "ganho" ? "✅" : e.tipo === "perdido" ? "❌" : "▸"} {e.opcao} <b style={{ marginLeft: 4 }}>{e.qtd}</b>
                    </button>
                  ))}
                </div>
              </div>
              {etapaAberta ? renderDrilldownEtapa() : (
                <div style={{ ...cardStyle, padding: 40, textAlign: "center" }}>
                  <p style={{ fontSize: 32, margin: "0 0 8px" }}>👆</p>
                  <p style={{ color: "#6b7280", fontSize: 13 }}>Escolha uma etapa acima pra ver o dashboard dela.</p>
                </div>
              )}
            </>
          )}

          {/* ════════════ ABA: QUEBRAS ════════════ */}
          {aba === "dimensoes" && (
            <>
              <div style={{ ...cardStyle, padding: isMobile ? 14 : 18 }}>
                <p style={{ color: "#6b7280", fontSize: 12, margin: "0 0 12px", fontWeight: 600 }}>
                  Quebra os números por qualquer campo de seleção. Escolha a dimensão:
                </p>
                {dimensoesDisponiveis.length === 0 ? (
                  <p style={{ color: "#9ca3af", fontSize: 13, fontStyle: "italic" }}>
                    Nenhum campo do tipo "Seleção" configurado.
                  </p>
                ) : (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {dimensoesDisponiveis.map(dim => (
                      <button key={dim.slug} onClick={() => setDimensaoSel(dim.slug)}
                        style={{ ...chipStyle, background: dimensaoSel === dim.slug ? "#8b5cf6" : "#ffffff", color: dimensaoSel === dim.slug ? "white" : "#6b7280", borderColor: dimensaoSel === dim.slug ? "#8b5cf6" : "#e5e7eb", fontWeight: dimensaoSel === dim.slug ? 700 : 600 }}>
                        {dim.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {dimensaoSel && breakdownDim.length > 0 && (
                <>
                  <div style={{ ...cardStyle, padding: isMobile ? 16 : 24 }}>
                    <h3 style={sectionTitleStyle}>
                      <span style={{ width: 32, height: 32, borderRadius: 8, background: "#f3e8ff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>🧩</span>
                      {camposMap.get(dimensaoSel)?.label} — receita e pipeline
                    </h3>
                    <ResponsiveContainer width="100%" height={Math.min(360, breakdownDim.length * 38 + 40)}>
                      <BarChart data={breakdownDim.slice(0, 12).map(d => ({ ...d, nomeCurto: d.valor.length > 18 ? d.valor.slice(0, 16) + "…" : d.valor }))} layout="vertical" margin={{ top: 5, right: 20, left: 90, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                        <XAxis type="number" stroke="#6b7280" fontSize={10} tickFormatter={v => `R$${v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}`} />
                        <YAxis dataKey="nomeCurto" type="category" stroke="#6b7280" fontSize={10} width={85} />
                        <Tooltip contentStyle={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 10, fontSize: 12 }} formatter={(v: any, n: string) => [formatBRL(v), n === "receita" ? "Realizado" : "Pipeline"]} cursor={{ fill: "#f3f4f6" }} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="receita" stackId="a" fill="#16a34a" name="Realizado" />
                        <Bar dataKey="pipeline" stackId="a" fill="#2563eb" name="Pipeline" radius={[0, 8, 8, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div style={{ ...cardStyle, overflow: "hidden" }}>
                    <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: isMobile ? 640 : "auto" }}>
                        <thead>
                          <tr style={{ background: "#f9fafb" }}>
                            {[camposMap.get(dimensaoSel)?.label || "Valor", "Total", "Ganhos", "Perdidos", "Win Rate", "Receita", "Pipeline"].map(h => (
                              <th key={h} style={{ padding: "12px 16px", color: "#6b7280", fontSize: 11, textAlign: "left", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700, borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {breakdownDim.map((d, i) => {
                            const corWr = d.winRate >= 60 ? "#16a34a" : d.winRate >= 30 ? "#f59e0b" : "#dc2626";
                            return (
                              <tr key={d.valor} style={{ borderTop: "1px solid #f3f4f6", background: i % 2 === 0 ? "#ffffff" : "#fafbfc" }}>
                                <td style={{ padding: "12px 16px", color: "#1f2937", fontSize: 13, fontWeight: 700 }}>{d.valor}</td>
                                <td style={{ padding: "12px 16px", color: "#2563eb", fontSize: 13, fontWeight: 700 }}>{d.qtd}</td>
                                <td style={{ padding: "12px 16px" }}><span style={{ background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0", fontSize: 12, padding: "3px 10px", borderRadius: 10, fontWeight: 700 }}>{d.ganhos}</span></td>
                                <td style={{ padding: "12px 16px" }}><span style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", fontSize: 12, padding: "3px 10px", borderRadius: 10, fontWeight: 700 }}>{d.perdidos}</span></td>
                                <td style={{ padding: "12px 16px" }}><span style={{ background: `${corWr}15`, color: corWr, fontSize: 12, padding: "3px 10px", borderRadius: 10, fontWeight: 800 }}>{d.winRate}%</span></td>
                                <td style={{ padding: "12px 16px", color: "#16a34a", fontSize: 13, fontWeight: 700 }}>{formatBRL(d.receita)}</td>
                                <td style={{ padding: "12px 16px", color: "#2563eb", fontSize: 13, fontWeight: 600 }}>{formatBRL(d.pipeline)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {/* ════════════ ABA: VENDEDORES ════════════ */}
          {aba === "vendedores" && (
            <div style={{ ...cardStyle, overflow: "hidden" }}>
              <div style={{ padding: "16px 20px", borderBottom: "1px solid #e5e7eb" }}>
                <h3 style={{ ...sectionTitleStyle, margin: 0 }}>
                  <span style={{ width: 32, height: 32, borderRadius: 8, background: "#eff6ff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>👥</span>
                  Desempenho por vendedor
                </h3>
              </div>
              {vendedoresStats.length === 0 ? (
                <p style={{ color: "#9ca3af", fontSize: 13, fontStyle: "italic", padding: 24, textAlign: "center" }}>Sem dados de vendedores.</p>
              ) : (
                <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: isMobile ? 720 : "auto" }}>
                    <thead>
                      <tr style={{ background: "#f9fafb" }}>
                        {["#", "Vendedor", "Total", "Ganhos", "Perdidos", "Win Rate", "Ticket", "Pipeline", "Receita"].map(h => (
                          <th key={h} style={{ padding: "12px 14px", color: "#6b7280", fontSize: 11, textAlign: "left", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700, borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {vendedoresStats.map((v, i) => {
                        const corWr = v.winRate >= 60 ? "#16a34a" : v.winRate >= 30 ? "#f59e0b" : "#dc2626";
                        return (
                          <tr key={v.email} style={{ borderTop: "1px solid #f3f4f6", background: i % 2 === 0 ? "#ffffff" : "#fafbfc" }}>
                            <td style={{ padding: "14px", fontSize: 16 }}>{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : <span style={{ color: "#9ca3af", fontSize: 12 }}>#{i + 1}</span>}</td>
                            <td style={{ padding: "14px", color: "#1f2937", fontSize: 13, fontWeight: 700 }}>{v.nome}</td>
                            <td style={{ padding: "14px", color: "#2563eb", fontSize: 13, fontWeight: 700 }}>{v.total}</td>
                            <td style={{ padding: "14px" }}><span style={{ background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0", fontSize: 12, padding: "3px 10px", borderRadius: 10, fontWeight: 700 }}>{v.ganhos}</span></td>
                            <td style={{ padding: "14px" }}><span style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", fontSize: 12, padding: "3px 10px", borderRadius: 10, fontWeight: 700 }}>{v.perdidos}</span></td>
                            <td style={{ padding: "14px" }}><span style={{ background: `${corWr}15`, color: corWr, fontSize: 13, padding: "4px 12px", borderRadius: 10, fontWeight: 800 }}>{v.winRate}%</span></td>
                            <td style={{ padding: "14px", color: "#06b6d4", fontSize: 12, fontWeight: 600 }}>{formatBRLCompacto(v.ticket)}</td>
                            <td style={{ padding: "14px", color: "#2563eb", fontSize: 12, fontWeight: 600 }}>{formatBRLCompacto(v.pipeline)}</td>
                            <td style={{ padding: "14px", color: "#16a34a", fontSize: 13, fontWeight: 800 }}>{formatBRL(v.receita)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ════════════ ABA: ATENDIMENTOS ════════════ */}
          {aba === "atendimentos" && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(5, 1fr)", gap: isMobile ? 10 : 14 }}>
                <KPI cor="#a855f7" bg="#f3e8ff" icone="📞" label="Total atendidos" valor={formatNum(kpisAtendimento.total)} sub={`${kpisAtendimento.semEtiqueta} sem etiqueta`} isMobile={isMobile} />
                <KPI cor="#16a34a" bg="#f0fdf4" icone="✅" label="Viraram venda" valor={formatNum(kpisAtendimento.venda)} sub={`${kpisAtendimento.taxaConv}% de conversão`} isMobile={isMobile} />
                <KPI cor="#dc2626" bg="#fef2f2" icone="❌" label="Inviáveis" valor={formatNum(kpisAtendimento.inviavel)} sub={`${kpisAtendimento.taxaInv}% descartados`} isMobile={isMobile} />
                <KPI cor="#f59e0b" bg="#fffbeb" icone="🔄" label="Em andamento" valor={formatNum(kpisAtendimento.andamento)} sub="Sem decisão ainda" isMobile={isMobile} />
                <KPI cor="#2563eb" bg="#eff6ff" icone="📊" label="Taxa conversão" valor={`${kpisAtendimento.taxaConv}%`} sub={`${kpisAtendimento.venda} de ${kpisAtendimento.total}`} isMobile={isMobile} />
              </div>

              <div style={{ ...cardStyle, padding: isMobile ? 16 : 24, marginTop: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
                  <h3 style={{ ...sectionTitleStyle, margin: 0 }}>
                    <span style={{ width: 32, height: 32, borderRadius: 8, background: "#f3e8ff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>🎯</span>
                    Funil de atendimento (por etiqueta)
                  </h3>
                  <button onClick={() => setShowMapearEtq(true)}
                    style={{ background: "#f3e8ff", color: "#a855f7", border: "1px solid #d8b4fe", borderRadius: 10, padding: "8px 14px", fontSize: 12, cursor: "pointer", fontWeight: 700 }}>
                    ⚙️ Mapear etiquetas
                  </button>
                </div>
                {kpisAtendimento.total === 0 ? (
                  <p style={{ color: "#9ca3af", fontSize: 13, fontStyle: "italic", textAlign: "center", padding: 32 }}>Sem atendimentos no período.</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {[
                      { label: "📞 Total atendidos", qtd: kpisAtendimento.total, pct: 100, cor: "#a855f7" },
                      { label: "🔄 Em andamento", qtd: kpisAtendimento.andamento, pct: kpisAtendimento.total > 0 ? Math.round((kpisAtendimento.andamento / kpisAtendimento.total) * 100) : 0, cor: "#f59e0b" },
                      { label: "❌ Inviáveis", qtd: kpisAtendimento.inviavel, pct: kpisAtendimento.taxaInv, cor: "#dc2626" },
                      { label: "✅ Viraram venda", qtd: kpisAtendimento.venda, pct: kpisAtendimento.taxaConv, cor: "#16a34a" },
                    ].map(f => (
                      <div key={f.label} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ width: isMobile ? 130 : 200, fontSize: 13, color: "#1f2937", fontWeight: 700, flexShrink: 0 }}>{f.label}</div>
                        <div style={{ flex: 1, height: 32, background: "#f9fafb", borderRadius: 8, overflow: "hidden", position: "relative", border: "1px solid #e5e7eb" }}>
                          <div style={{ width: `${Math.max(2, f.pct)}%`, height: "100%", background: `linear-gradient(90deg, ${f.cor} 0%, ${f.cor}dd 100%)`, transition: "width 0.4s", display: "flex", alignItems: "center", paddingLeft: 10 }}>
                            <span style={{ color: "white", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>{f.qtd} ({f.pct}%)</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ ...cardStyle, overflow: "hidden", marginTop: 14 }}>
                <div style={{ padding: "16px 20px", borderBottom: "1px solid #e5e7eb" }}>
                  <h3 style={{ ...sectionTitleStyle, margin: 0 }}>
                    <span style={{ width: 32, height: 32, borderRadius: 8, background: "#f3e8ff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>👤</span>
                    Performance por atendente
                  </h3>
                  <p style={{ color: "#9ca3af", fontSize: 11, margin: "4px 0 0" }}>Baseado nas etiquetas marcadas no chat. Reclassifique em "⚙️ Mapear etiquetas".</p>
                </div>
                {performanceAtendentes.length === 0 ? (
                  <p style={{ color: "#9ca3af", fontSize: 13, fontStyle: "italic", padding: 24, textAlign: "center" }}>Sem atendimentos no período.</p>
                ) : (
                  <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", minWidth: isMobile ? 720 : "auto" }}>
                      <thead>
                        <tr style={{ background: "#f9fafb" }}>
                          {["#", "Atendente", "Total", "✅ Venda", "❌ Inviável", "🔄 Andamento", "Conv.", "Perda"].map(h => (
                            <th key={h} style={{ padding: "12px 14px", color: "#6b7280", fontSize: 11, textAlign: "left", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700, borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {performanceAtendentes.map((r, i) => {
                          const corConv = r.taxaConv >= 30 ? "#16a34a" : r.taxaConv >= 10 ? "#f59e0b" : "#dc2626";
                          return (
                            <tr key={r.email} style={{ borderTop: "1px solid #f3f4f6", background: i % 2 === 0 ? "#ffffff" : "#fafbfc" }}>
                              <td style={{ padding: "14px", fontSize: 16 }}>{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : <span style={{ color: "#9ca3af", fontSize: 12 }}>#{i + 1}</span>}</td>
                              <td style={{ padding: "14px", color: "#1f2937", fontSize: 13, fontWeight: 700 }}>{r.nome}</td>
                              <td style={{ padding: "14px", color: "#2563eb", fontSize: 13, fontWeight: 700 }}>{r.total}</td>
                              <td style={{ padding: "14px" }}><span style={{ background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0", fontSize: 12, padding: "3px 10px", borderRadius: 10, fontWeight: 700 }}>{r.venda}</span></td>
                              <td style={{ padding: "14px" }}><span style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", fontSize: 12, padding: "3px 10px", borderRadius: 10, fontWeight: 700 }}>{r.inviavel}</span></td>
                              <td style={{ padding: "14px" }}><span style={{ background: "#fffbeb", color: "#f59e0b", border: "1px solid #fde68a", fontSize: 12, padding: "3px 10px", borderRadius: 10, fontWeight: 700 }}>{r.andamento}</span></td>
                              <td style={{ padding: "14px" }}><span style={{ background: `${corConv}15`, color: corConv, fontSize: 13, padding: "4px 12px", borderRadius: 10, fontWeight: 800 }}>{r.taxaConv}%</span></td>
                              <td style={{ padding: "14px", color: "#9ca3af", fontSize: 12, fontWeight: 600 }}>{r.taxaInv}%</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div style={{ ...cardStyle, padding: isMobile ? 16 : 20, marginTop: 14 }}>
                <h3 style={{ ...sectionTitleStyle, margin: "0 0 14px" }}>
                  <span style={{ width: 32, height: 32, borderRadius: 8, background: "#f3e8ff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>🏷️</span>
                  Etiquetas mais usadas no período
                </h3>
                {rankingEtiquetas.length === 0 ? (
                  <p style={{ color: "#9ca3af", fontSize: 13, fontStyle: "italic", padding: 12 }}>Nenhuma etiqueta marcada em atendimentos do período.</p>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 8 }}>
                    {rankingEtiquetas.slice(0, 16).map(e => {
                      const cor = e.cor || "#6b7280";
                      const corCat = e.categoria === "venda" ? "#16a34a" : e.categoria === "inviavel" ? "#dc2626" : "#f59e0b";
                      const bgCat = e.categoria === "venda" ? "#f0fdf4" : e.categoria === "inviavel" ? "#fef2f2" : "#fffbeb";
                      const labelCat = e.categoria === "venda" ? "✅ Venda" : e.categoria === "inviavel" ? "❌ Inviável" : "🔄 Andamento";
                      return (
                        <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10 }}>
                          <span style={{ width: 12, height: 12, borderRadius: 4, background: cor, flexShrink: 0 }}></span>
                          <span style={{ fontSize: 13, color: "#1f2937", fontWeight: 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                            {e.icone ? `${e.icone} ` : ""}{e.nome}
                          </span>
                          <span style={{ background: bgCat, color: corCat, border: `1px solid ${corCat}33`, fontSize: 10, padding: "2px 7px", borderRadius: 8, fontWeight: 700, whiteSpace: "nowrap" }}>{labelCat}</span>
                          <span style={{ color: "#1f2937", fontSize: 13, fontWeight: 800, minWidth: 36, textAlign: "right" }}>{e.qtd}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {showMapearEtq && (
                <div onClick={() => setShowMapearEtq(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16 }}>
                  <div onClick={(e) => e.stopPropagation()} style={{ background: "#ffffff", borderRadius: 14, maxWidth: 600, width: "100%", maxHeight: "85vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
                    <div style={{ padding: "18px 22px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <h3 style={{ color: "#1f2937", fontSize: 15, fontWeight: 700, margin: 0 }}>⚙️ Mapear etiquetas do funil</h3>
                        <p style={{ color: "#9ca3af", fontSize: 11, margin: "3px 0 0" }}>Defina o que cada etiqueta significa. Padrão = auto-detectado pelo nome.</p>
                      </div>
                      <button onClick={() => setShowMapearEtq(false)} style={{ background: "#f3f4f6", color: "#6b7280", border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 12, cursor: "pointer", fontWeight: 700 }}>✕</button>
                    </div>
                    <div style={{ overflowY: "auto", padding: 18, flex: 1 }}>
                      {etiquetasComCategoria.length === 0 ? (
                        <p style={{ color: "#9ca3af", fontSize: 13, fontStyle: "italic", textAlign: "center" }}>Nenhuma etiqueta cadastrada ainda.</p>
                      ) : etiquetasComCategoria.map(e => {
                        const cor = e.cor || "#6b7280";
                        const opts: { v: CategoriaEtiqueta; l: string; c: string; bg: string }[] = [
                          { v: "venda",     l: "✅ Venda",     c: "#16a34a", bg: "#f0fdf4" },
                          { v: "inviavel",  l: "❌ Inviável",  c: "#dc2626", bg: "#fef2f2" },
                          { v: "andamento", l: "🔄 Andamento", c: "#f59e0b", bg: "#fffbeb" },
                        ];
                        return (
                          <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderBottom: "1px solid #f3f4f6", flexWrap: "wrap" }}>
                            <span style={{ width: 12, height: 12, borderRadius: 4, background: cor, flexShrink: 0 }}></span>
                            <span style={{ fontSize: 13, color: "#1f2937", fontWeight: 600, flex: 1, minWidth: 120 }}>
                              {e.icone ? `${e.icone} ` : ""}{e.nome}
                            </span>
                            <div style={{ display: "flex", gap: 4 }}>
                              {opts.map(o => {
                                const at = e.categoria === o.v;
                                return (
                                  <button key={o.v} onClick={() => salvarMapeamentoEtq(e.id, o.v)}
                                    style={{ background: at ? o.bg : "#ffffff", color: at ? o.c : "#9ca3af", border: `1px solid ${at ? o.c : "#e5e7eb"}`, borderRadius: 8, padding: "5px 10px", fontSize: 11, cursor: "pointer", fontWeight: 700, whiteSpace: "nowrap" }}>
                                    {o.l}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ padding: "12px 18px", borderTop: "1px solid #e5e7eb", background: "#f9fafb", fontSize: 11, color: "#6b7280" }}>
                      💾 Suas escolhas ficam salvas neste navegador. Funil atualiza ao fechar.
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ════════════ ABA: METAS ════════════ */}
          {aba === "metas" && (
            <>
              {(metas.metaReceita === 0 && metas.metaGanhos === 0) ? (
                <div style={{ ...cardStyle, padding: 40, textAlign: "center" }}>
                  <p style={{ fontSize: 36, margin: "0 0 8px" }}>🏆</p>
                  <h3 style={{ color: "#1f2937", fontSize: 16, fontWeight: 700, margin: "0 0 6px" }}>Defina suas metas do mês</h3>
                  <p style={{ color: "#6b7280", fontSize: 13, margin: "0 0 16px" }}>Configure a meta de receita e/ou de ganhos em ⚙️ Configurar funil pra acompanhar o pace.</p>
                  <button onClick={() => setShowConfig(true)} style={{ background: "linear-gradient(135deg, #eab308 0%, #ca8a04 100%)", color: "white", border: "none", borderRadius: 10, padding: "10px 20px", fontSize: 13, cursor: "pointer", fontWeight: 700 }}>⚙️ Definir metas</button>
                </div>
              ) : (
                <>
                  <div style={{ ...cardStyle, padding: isMobile ? 16 : 24 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexWrap: "wrap", gap: 8 }}>
                      <h3 style={{ ...sectionTitleStyle, margin: 0, textTransform: "capitalize" }}>
                        <span style={{ width: 32, height: 32, borderRadius: 8, background: "#fefce8", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>🏆</span>
                        Metas — {metas.mesLabel}
                      </h3>
                      <span style={{ color: "#6b7280", fontSize: 12, fontWeight: 600 }}>Dia {metas.diaAtual}/{metas.diasNoMes} · faltam {metas.diasRestantes}d · {metas.pctRitmo}% do mês decorrido</span>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
                      {metas.metaReceita > 0 && (
                        <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 12, padding: 18 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
                            <span style={{ color: "#1f2937", fontSize: 13, fontWeight: 700 }}>💰 Receita</span>
                            <span style={{ color: metas.pctReceita >= 100 ? "#16a34a" : "#6b7280", fontSize: 20, fontWeight: 800 }}>{metas.pctReceita}%</span>
                          </div>
                          <div style={{ background: "#e5e7eb", borderRadius: 8, height: 14, overflow: "hidden", marginBottom: 6, position: "relative" }}>
                            <div style={{ background: metas.pctReceita >= 100 ? "linear-gradient(90deg,#16a34a,#22c55e)" : "linear-gradient(90deg,#eab308,#facc15)", width: `${Math.min(100, metas.pctReceita)}%`, height: "100%", transition: "width 0.4s" }} />
                            <div style={{ position: "absolute", top: -2, left: `${metas.pctRitmo}%`, width: 2, height: 18, background: "#6b7280" }} title="ritmo esperado" />
                          </div>
                          <p style={{ color: "#6b7280", fontSize: 12, margin: "0 0 12px" }}>
                            <b style={{ color: "#16a34a" }}>{formatBRL(metas.receitaMes)}</b> de <b>{formatBRL(metas.metaReceita)}</b>
                          </p>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                            <div style={{ background: "#ffffff", border: "1px solid #f3f4f6", borderRadius: 8, padding: 10 }}>
                              <p style={{ color: "#9ca3af", fontSize: 10, margin: 0, fontWeight: 600, textTransform: "uppercase" }}>Falta</p>
                              <p style={{ color: "#dc2626", fontSize: 15, fontWeight: 800, margin: "2px 0 0" }}>{formatBRLCompacto(metas.faltaReceita)}</p>
                            </div>
                            <div style={{ background: "#ffffff", border: "1px solid #f3f4f6", borderRadius: 8, padding: 10 }}>
                              <p style={{ color: "#9ca3af", fontSize: 10, margin: 0, fontWeight: 600, textTransform: "uppercase" }}>Projeção</p>
                              <p style={{ color: metas.projReceita >= metas.metaReceita ? "#16a34a" : "#f59e0b", fontSize: 15, fontWeight: 800, margin: "2px 0 0" }}>{formatBRLCompacto(metas.projReceita)}</p>
                            </div>
                          </div>
                          <p style={{ color: metas.projReceita >= metas.metaReceita ? "#16a34a" : "#dc2626", fontSize: 11, fontWeight: 700, margin: "10px 0 0", textAlign: "center" }}>
                            {metas.projReceita >= metas.metaReceita ? "✅ No ritmo pra bater a meta" : "⚠️ Abaixo do ritmo necessário"}
                          </p>
                        </div>
                      )}

                      {metas.metaGanhos > 0 && (
                        <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 12, padding: 18 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
                            <span style={{ color: "#1f2937", fontSize: 13, fontWeight: 700 }}>✅ Ganhos (quantidade)</span>
                            <span style={{ color: metas.pctGanhos >= 100 ? "#16a34a" : "#6b7280", fontSize: 20, fontWeight: 800 }}>{metas.pctGanhos}%</span>
                          </div>
                          <div style={{ background: "#e5e7eb", borderRadius: 8, height: 14, overflow: "hidden", marginBottom: 6, position: "relative" }}>
                            <div style={{ background: metas.pctGanhos >= 100 ? "linear-gradient(90deg,#16a34a,#22c55e)" : "linear-gradient(90deg,#2563eb,#60a5fa)", width: `${Math.min(100, metas.pctGanhos)}%`, height: "100%", transition: "width 0.4s" }} />
                            <div style={{ position: "absolute", top: -2, left: `${metas.pctRitmo}%`, width: 2, height: 18, background: "#6b7280" }} title="ritmo esperado" />
                          </div>
                          <p style={{ color: "#6b7280", fontSize: 12, margin: "0 0 12px" }}>
                            <b style={{ color: "#16a34a" }}>{metas.qtdMes}</b> de <b>{metas.metaGanhos}</b> ganhos
                          </p>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                            <div style={{ background: "#ffffff", border: "1px solid #f3f4f6", borderRadius: 8, padding: 10 }}>
                              <p style={{ color: "#9ca3af", fontSize: 10, margin: 0, fontWeight: 600, textTransform: "uppercase" }}>Falta</p>
                              <p style={{ color: "#dc2626", fontSize: 15, fontWeight: 800, margin: "2px 0 0" }}>{metas.faltaGanhos}</p>
                            </div>
                            <div style={{ background: "#ffffff", border: "1px solid #f3f4f6", borderRadius: 8, padding: 10 }}>
                              <p style={{ color: "#9ca3af", fontSize: 10, margin: 0, fontWeight: 600, textTransform: "uppercase" }}>Projeção</p>
                              <p style={{ color: metas.projGanhos >= metas.metaGanhos ? "#16a34a" : "#f59e0b", fontSize: 15, fontWeight: 800, margin: "2px 0 0" }}>{metas.projGanhos}</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ ...cardStyle, padding: isMobile ? 16 : 24 }}>
                    <h3 style={sectionTitleStyle}>
                      <span style={{ width: 32, height: 32, borderRadius: 8, background: "#f0fdf4", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>🤝</span>
                      Quem está puxando a meta (receita ganha no período filtrado)
                    </h3>
                    {vendedoresStats.filter(v => v.receita > 0).length === 0 ? (
                      <p style={{ color: "#9ca3af", fontSize: 13, fontStyle: "italic" }}>Ninguém com receita ganha ainda.</p>
                    ) : (
                      <ResponsiveContainer width="100%" height={Math.min(320, vendedoresStats.filter(v => v.receita > 0).length * 42 + 30)}>
                        <BarChart data={vendedoresStats.filter(v => v.receita > 0).slice(0, 10).map(v => ({ nome: v.nome.length > 16 ? v.nome.slice(0, 14) + "…" : v.nome, receita: v.receita }))} layout="vertical" margin={{ top: 5, right: 20, left: 80, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                          <XAxis type="number" stroke="#6b7280" fontSize={10} tickFormatter={v => formatBRLCompacto(v)} />
                          <YAxis dataKey="nome" type="category" stroke="#6b7280" fontSize={11} width={76} />
                          <Tooltip contentStyle={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 10, fontSize: 12 }} formatter={(v: any) => [formatBRL(v), "Receita"]} cursor={{ fill: "#f0fdf4" }} />
                          <Bar dataKey="receita" fill="#16a34a" radius={[0, 8, 8, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </>
              )}
            </>
          )}

          {/* ════════════ ABA: TEMPORAL ════════════ */}
          {aba === "temporal" && (
            <>
              <div style={{ ...cardStyle, padding: isMobile ? 16 : 24 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
                  <h3 style={{ ...sectionTitleStyle, margin: 0 }}>
                    <span style={{ width: 32, height: 32, borderRadius: 8, background: "#f0fdf4", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>📈</span>
                    Receita ao longo do tempo
                  </h3>
                  <div style={{ display: "flex", gap: 4 }}>
                    {(["dia", "semana", "mes"] as const).map(m => (
                      <button key={m} onClick={() => setAgrupTempo(m)}
                        style={{ ...chipStyle, background: agrupTempo === m ? "#eff6ff" : "#ffffff", color: agrupTempo === m ? "#2563eb" : "#6b7280", borderColor: agrupTempo === m ? "#2563eb" : "#e5e7eb", fontWeight: agrupTempo === m ? 700 : 600 }}>
                        {m === "dia" ? "Diário" : m === "semana" ? "Semanal" : "Mensal"}
                      </button>
                    ))}
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={isMobile ? 220 : 280}>
                  <AreaChart data={serieTemporal} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                    <defs>
                      <linearGradient id="recGrad" x1="0" y1="0" x2="0" y2="1">
                       // ═══════════════════════════════════════════════════════════════════════════
// 📌 CONTINUAÇÃO DO funil-page.tsx
// ═══════════════════════════════════════════════════════════════════════════
// Cola TUDO ABAIXO a partir da linha onde seu arquivo parou:
//
//     <stop offset="0%" stopColor="#16a34a" stopOpacity={0.4} />
//
// ↓ A partir daqui (essa linha É A PRÓXIMA depois da que ficou no seu arquivo) ↓
// ═══════════════════════════════════════════════════════════════════════════

                        <stop offset="100%" stopColor="#16a34a" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="label" stroke="#6b7280" fontSize={10} interval="preserveStartEnd" />
                    <YAxis stroke="#6b7280" fontSize={10} tickFormatter={v => formatBRLCompacto(v)} />
                    <Tooltip contentStyle={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 10, fontSize: 12 }} formatter={(v: any) => [formatBRL(v), "Receita"]} />
                    <Area type="monotone" dataKey="receita" stroke="#16a34a" strokeWidth={2.5} fill="url(#recGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div style={{ ...cardStyle, padding: isMobile ? 16 : 24 }}>
                <h3 style={sectionTitleStyle}>
                  <span style={{ width: 32, height: 32, borderRadius: 8, background: "#eff6ff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>📊</span>
                  Registros por período (gerados, ganhos, perdidos)
                </h3>
                <ResponsiveContainer width="100%" height={isMobile ? 220 : 280}>
                  <LineChart data={serieTemporal} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="label" stroke="#6b7280" fontSize={10} interval="preserveStartEnd" />
                    <YAxis stroke="#6b7280" fontSize={10} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 10, fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
                    <Line type="monotone" dataKey="geradas" stroke="#2563eb" strokeWidth={2} dot={false} name="Gerados" />
                    <Line type="monotone" dataKey="ganhos" stroke="#16a34a" strokeWidth={2} dot={false} name="Ganhos" />
                    <Line type="monotone" dataKey="perdidos" stroke="#dc2626" strokeWidth={2} dot={false} name="Perdidos" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          )}

          {/* ════════════ ABA: COORTE ════════════ */}
          {aba === "cohort" && (
            <>
              <div style={{ ...cardStyle, padding: isMobile ? 16 : 24 }}>
                <h3 style={sectionTitleStyle}>
                  <span style={{ width: 32, height: 32, borderRadius: 8, background: "#e0f2fe", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>🧬</span>
                  Coorte — últimas 12 semanas
                </h3>
                <p style={{ color: "#6b7280", fontSize: 12, margin: "0 0 18px", lineHeight: 1.5 }}>
                  Cada linha é a semana em que os registros entraram. Mostra quantos viraram <b style={{ color: "#16a34a" }}>ganho</b>, <b style={{ color: "#dc2626" }}>perdido</b> ou seguem <b style={{ color: "#f59e0b" }}>em aberto</b>. Vê se o funil esquenta ou esfria com o tempo.
                </p>
                <ResponsiveContainer width="100%" height={isMobile ? 200 : 260}>
                  <BarChart data={cohort} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="label" stroke="#6b7280" fontSize={10} />
                    <YAxis stroke="#6b7280" fontSize={10} tickFormatter={v => `${v}%`} domain={[0, 100]} />
                    <Tooltip contentStyle={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 10, fontSize: 12 }} formatter={(v: any, n: string) => [`${v}%`, n === "taxaGanho" ? "Ganho" : n === "taxaPerda" ? "Perdido" : "Em aberto"]} />
                    <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v) => v === "taxaGanho" ? "Ganho" : v === "taxaPerda" ? "Perdido" : "Em aberto"} />
                    <Bar dataKey="taxaGanho" stackId="a" fill="#16a34a" />
                    <Bar dataKey="taxaAberto" stackId="a" fill="#f59e0b" />
                    <Bar dataKey="taxaPerda" stackId="a" fill="#dc2626" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div style={{ ...cardStyle, overflow: "hidden" }}>
                <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: isMobile ? 640 : "auto" }}>
                    <thead>
                      <tr style={{ background: "#f9fafb" }}>
                        {["Semana de", "Entraram", "✅ Ganho", "❌ Perdido", "⏳ Aberto", "Receita", "Taxa Ganho"].map(h => (
                          <th key={h} style={{ padding: "12px 16px", color: "#6b7280", fontSize: 11, textAlign: "left", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700, borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {cohort.map((c, i) => {
                        const cc = c.taxaGanho >= 50 ? "#16a34a" : c.taxaGanho >= 25 ? "#f59e0b" : "#dc2626";
                        const bg = c.taxaGanho >= 50 ? "#f0fdf4" : c.taxaGanho >= 25 ? "#fffbeb" : "#fef2f2";
                        return (
                          <tr key={i} style={{ borderTop: "1px solid #f3f4f6", background: i % 2 === 0 ? "#ffffff" : "#fafbfc" }}>
                            <td style={{ padding: "12px 16px", color: "#1f2937", fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" }}>{c.label}</td>
                            <td style={{ padding: "12px 16px", color: "#2563eb", fontSize: 13, fontWeight: 700 }}>{c.total}</td>
                            <td style={{ padding: "12px 16px" }}><span style={{ background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0", fontSize: 12, padding: "3px 10px", borderRadius: 10, fontWeight: 700 }}>{c.ganhos}</span></td>
                            <td style={{ padding: "12px 16px" }}><span style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", fontSize: 12, padding: "3px 10px", borderRadius: 10, fontWeight: 700 }}>{c.perdidos}</span></td>
                            <td style={{ padding: "12px 16px" }}><span style={{ background: "#fffbeb", color: "#f59e0b", border: "1px solid #fde68a", fontSize: 12, padding: "3px 10px", borderRadius: 10, fontWeight: 700 }}>{c.aberto}</span></td>
                            <td style={{ padding: "12px 16px", color: "#16a34a", fontSize: 13, fontWeight: 700 }}>{formatBRLCompacto(c.receita)}</td>
                            <td style={{ padding: "12px 16px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <div style={{ flex: 1, background: "#f3f4f6", borderRadius: 4, height: 6, overflow: "hidden", minWidth: 50, maxWidth: 90 }}>
                                  <div style={{ background: cc, width: `${c.taxaGanho}%`, height: "100%" }} />
                                </div>
                                <span style={{ background: bg, color: cc, fontSize: 11, padding: "3px 8px", borderRadius: 8, fontWeight: 800 }}>{c.taxaGanho}%</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* ════════════ ABA: HORÁRIOS (heatmap) ════════════ */}
          {aba === "horarios" && (
            <>
              <div style={{ ...cardStyle, padding: isMobile ? 16 : 24, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                <div style={{ width: 56, height: 56, borderRadius: 16, background: "linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, boxShadow: "0 8px 20px rgba(20,184,166,0.25)", flexShrink: 0 }}>
                  <span style={{ filter: "saturate(0) brightness(2)" }}>🔥</span>
                </div>
                <div>
                  <p style={{ color: "#6b7280", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, margin: 0 }}>Horário de pico</p>
                  <p style={{ color: "#0d9488", fontSize: isMobile ? 18 : 22, fontWeight: 800, margin: "2px 0 0", letterSpacing: -0.3 }}>
                    {picoHorario.qtd > 0 ? `${DIAS_SEMANA_LONGO[picoHorario.dia]} às ${picoHorario.hora}h` : "Sem dados"}
                  </p>
                  <p style={{ color: "#9ca3af", fontSize: 12, margin: "2px 0 0" }}>{picoHorario.qtd > 0 ? `${picoHorario.qtd} registro(s) nesse horário` : "—"}</p>
                </div>
              </div>

              <div style={{ ...cardStyle, padding: isMobile ? 14 : 24 }}>
                <h3 style={sectionTitleStyle}>
                  <span style={{ width: 32, height: 32, borderRadius: 8, background: "#ccfbf1", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>🗓️</span>
                  Mapa de calor — dia × hora
                </h3>
                <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
                  <div style={{ minWidth: 680 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "40px repeat(24, 1fr)", gap: 2, marginBottom: 2 }}>
                      <div />
                      {Array.from({ length: 24 }, (_, h) => <div key={h} style={{ textAlign: "center", color: "#9ca3af", fontSize: 8, fontWeight: 600 }}>{h}</div>)}
                    </div>
                    {DIAS_SEMANA.map((dia, di) => (
                      <div key={dia} style={{ display: "grid", gridTemplateColumns: "40px repeat(24, 1fr)", gap: 2, marginBottom: 2 }}>
                        <div style={{ display: "flex", alignItems: "center", color: "#6b7280", fontSize: 10, fontWeight: 700 }}>{dia}</div>
                        {heatmap.grid[di].map((qtd, hi) => {
                          const inten = heatmap.max > 0 ? qtd / heatmap.max : 0;
                          const bg = qtd === 0 ? "#f9fafb" : `rgba(20,184,166,${0.15 + inten * 0.85})`;
                          return (
                            <div key={hi} title={`${dia} ${hi}h — ${qtd}`} style={{ aspectRatio: "1", borderRadius: 3, background: bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700, color: inten > 0.5 ? "#ffffff" : "#0d9488", minHeight: 18 }}>{qtd > 0 ? qtd : ""}</div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 14 }}>
                <div style={{ ...cardStyle, padding: isMobile ? 16 : 20 }}>
                  <h3 style={{ ...sectionTitleStyle, fontSize: 14, margin: "0 0 14px" }}>
                    <span style={{ width: 28, height: 28, borderRadius: 8, background: "#ccfbf1", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>📅</span>
                    Por dia da semana
                  </h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={porDiaSemana} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="dia" stroke="#6b7280" fontSize={11} />
                      <YAxis stroke="#6b7280" fontSize={11} allowDecimals={false} />
                      <Tooltip contentStyle={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 10, fontSize: 12 }} cursor={{ fill: "#f0fdfa" }} />
                      <Bar dataKey="qtd" fill="#14b8a6" radius={[8, 8, 0, 0]} name="Registros" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ ...cardStyle, padding: isMobile ? 16 : 20 }}>
                  <h3 style={{ ...sectionTitleStyle, fontSize: 14, margin: "0 0 14px" }}>
                    <span style={{ width: 28, height: 28, borderRadius: 8, background: "#ccfbf1", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>⏰</span>
                    Por hora do dia
                  </h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={porHora} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="hora" stroke="#6b7280" fontSize={8} interval={1} />
                      <YAxis stroke="#6b7280" fontSize={11} allowDecimals={false} />
                      <Tooltip contentStyle={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 10, fontSize: 12 }} cursor={{ fill: "#f0fdfa" }} />
                      <Bar dataKey="qtd" fill="#0d9488" radius={[6, 6, 0, 0]} name="Registros" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </>
          )}

          {/* ════════════ ABA: LISTA ════════════ */}
          {aba === "lista" && (
            <div style={{ ...cardStyle, overflow: "hidden" }}>
              <div style={{ padding: "14px 18px", borderBottom: "1px solid #e5e7eb", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ color: "#1f2937", fontSize: 13, fontWeight: 700 }}>{listaOrdenada.length} registro(s)</span>
                <div style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {([
                    { k: "recente", l: "📅 Recente" },
                    { k: "valor_desc", l: "💰 Maior" },
                    { k: "valor_asc", l: "💸 Menor" },
                    { k: "nome_az", l: "🔤 Nome" },
                  ] as { k: OrdemLista; l: string }[]).map(o => (
                    <button key={o.k} onClick={() => setListaOrdem(o.k)}
                      style={{ ...chipStyle, fontSize: 11, background: listaOrdem === o.k ? "#eef2ff" : "#f9fafb", color: listaOrdem === o.k ? "#6366f1" : "#6b7280", borderColor: listaOrdem === o.k ? "#6366f1" : "#e5e7eb", fontWeight: listaOrdem === o.k ? 700 : 600 }}>
                      {o.l}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: isMobile ? 640 : "auto" }}>
                  <thead>
                    <tr style={{ background: "#f9fafb" }}>
                      {colunasLista.map(c => (
                        <th key={c.slug} style={{ padding: "12px 16px", color: "#6b7280", fontSize: 11, textAlign: "left", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700, borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap" }}>{c.label}</th>
                      ))}
                      <th style={{ padding: "12px 16px", color: "#6b7280", fontSize: 11, textAlign: "left", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700, borderBottom: "1px solid #e5e7eb" }}>Vendedor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listaPaginaArr.map((p, i) => (
                      <tr key={p.id} onClick={() => router.push("/crm/vendas")}
                        style={{ borderTop: "1px solid #f3f4f6", background: i % 2 === 0 ? "#ffffff" : "#fafbfc", cursor: "pointer" }}
                        onMouseEnter={ev => ev.currentTarget.style.background = "#f3f4f6"}
                        onMouseLeave={ev => ev.currentTarget.style.background = i % 2 === 0 ? "#ffffff" : "#fafbfc"}>
                        {colunasLista.map(c => {
                          const isValor = c.tipo === "moeda";
                          const txt = isValor ? formatBRL(lerNumero(p, c)) : (lerTexto(p, c) || "—");
                          return <td key={c.slug} style={{ padding: "12px 16px", color: isValor ? "#16a34a" : "#1f2937", fontSize: 12, fontWeight: isValor ? 700 : 500, whiteSpace: "nowrap", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis" }}>{txt}</td>;
                        })}
                        <td style={{ padding: "12px 16px", color: "#6b7280", fontSize: 12 }}>{nomeVendedor(p.vendedor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {listaTotalPag > 1 && (
                <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, padding: 14 }}>
                  <button onClick={() => setListaPagina(p => Math.max(1, p - 1))} disabled={listaPagina === 1}
                    style={{ background: listaPagina === 1 ? "#f3f4f6" : "#ffffff", color: listaPagina === 1 ? "#9ca3af" : "#374151", border: "1px solid #e5e7eb", borderRadius: 10, padding: "8px 14px", fontSize: 12, cursor: listaPagina === 1 ? "not-allowed" : "pointer", fontWeight: 600 }}>← Anterior</button>
                  <span style={{ color: "#6b7280", fontSize: 13, padding: "0 12px", fontWeight: 600 }}>Pág. <b style={{ color: "#1f2937" }}>{listaPagina}</b> / <b style={{ color: "#1f2937" }}>{listaTotalPag}</b></span>
                  <button onClick={() => setListaPagina(p => Math.min(listaTotalPag, p + 1))} disabled={listaPagina === listaTotalPag}
                    style={{ background: listaPagina === listaTotalPag ? "#f3f4f6" : "#ffffff", color: listaPagina === listaTotalPag ? "#9ca3af" : "#374151", border: "1px solid #e5e7eb", borderRadius: 10, padding: "8px 14px", fontSize: 12, cursor: listaPagina === listaTotalPag ? "not-allowed" : "pointer", fontWeight: 600 }}>Próxima →</button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 🧩 SUB-COMPONENTES
// ═══════════════════════════════════════════════════════════════════════════
function KPI({ cor, bg, icone, label, valor, titulo, sub, trend, isMobile }: {
  cor: string; bg: string; icone: string; label: string; valor: string;
  titulo?: string; sub: string; trend?: number; isMobile: boolean;
}) {
  return (
    <div style={{ ...cardStyle, padding: isMobile ? 14 : 18, borderTop: `3px solid ${cor}`, transition: "all 0.15s" }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = `0 8px 20px ${cor}20`; e.currentTarget.style.transform = "translateY(-2px)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)"; e.currentTarget.style.transform = "translateY(0)"; }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>{icone}</div>
          <p style={{ color: "#6b7280", fontSize: 10, margin: 0, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.3 }}>{label}</p>
        </div>
        {typeof trend === "number" && trend !== 0 && (
          <span style={{ background: trend > 0 ? "#f0fdf4" : "#fef2f2", color: trend > 0 ? "#16a34a" : "#dc2626", border: `1px solid ${trend > 0 ? "#bbf7d0" : "#fecaca"}`, borderRadius: 8, padding: "2px 7px", fontSize: 10, fontWeight: 700 }}>
            {trend > 0 ? "▲" : "▼"} {Math.abs(trend)}%
          </span>
        )}
      </div>
      <p title={titulo || valor} style={{ color: cor, fontSize: isMobile ? 19 : 25, fontWeight: 800, margin: 0, letterSpacing: -0.5, wordBreak: "break-word" }}>{valor}</p>
      <p style={{ color: "#9ca3af", fontSize: 10, margin: "4px 0 0", fontWeight: 500 }}>{sub}</p>
    </div>
  );
}

function Mini({ label, valor, cor, bg, icone, isMobile }: {
  label: string; valor: string; cor: string; bg: string; icone?: string; isMobile: boolean;
}) {
  return (
    <div style={{ background: bg, border: `1px solid ${cor}33`, borderRadius: 10, padding: isMobile ? 10 : 12, textAlign: "center" }}>
      {icone && <p style={{ fontSize: 14, margin: "0 0 2px" }}>{icone}</p>}
      <p style={{ color: cor, fontSize: isMobile ? 14 : 16, fontWeight: 800, margin: 0, letterSpacing: -0.3, wordBreak: "break-word" }}>{valor}</p>
      <p style={{ color: "#6b7280", fontSize: 9, margin: "2px 0 0", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</p>
    </div>
  );
}