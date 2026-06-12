"use client";
import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart, Bar,
  LineChart, Line,
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
// 🎯 FUNIL DE INSTALAÇÃO — Grupo Unita (single-tenant)
// ───────────────────────────────────────────────────────────────────────────
// REFORMULAÇÃO v2 — foco em CONTAGEM, não em receita:
//   • Lê SOMENTE da tabela `proposta` (vendas do CRM). Sem atendimentos/chatbot.
//   • Funil: ENTROU → INSTALOU → CANCELOU (com % de cada).
//   • Cancelamento separado em INTERNO vs EXTERNO (status distintos).
//   • Sem "dinheiro que entrou": tudo é quantas vendas entraram/instalaram/cancelaram.
// ═══════════════════════════════════════════════════════════════════════════

// ─── TIPOS ─────────────────────────────────────────────────────────────────
type Proposta = {
  id: number;
  created_at: string;
  updated_at?: string | null;
  equipe_id_criador?: string | null;
  vendedor?: string | null;
  nome?: string | null;
  status_venda?: string | null;
  dados_customizados?: Record<string, any> | null;
  [key: string]: any;
};

type Usuario = { email: string; nome: string; equipe_id?: string | null };

type CampoUni = CampoUnificado & {
  mostrar_na_lista?: boolean;
  origem?: "fixo" | "custom";
  tipo: string;
  opcoes?: string[] | null;
  visivel?: boolean;
  ordem?: number;
};

type PeriodoKey = "semanal" | "mensal" | "trimestral" | "ano" | "tudo" | "custom";
type AbaKey = "visao" | "status" | "vendedores" | "dimensoes" | "metas" | "temporal" | "horarios" | "lista";
type OrdemLista = "recente" | "antiga" | "nome_az";

// Categoria de cada proposta no funil de instalação
type CatFunil = "instalado" | "canc_interno" | "canc_externo" | "canc_outro" | "andamento";

type FunilConfig = {
  campoStatus: string;
  campoData: string;
  statusInstalado: string[];
  statusCancInterno: string[];
  statusCancExterno: string[];
  statusCancOutro: string[];      // cancelamentos que não são nem interno nem externo
  metaInstalacoes: number;        // meta do mês (quantidade de instalações)
  diasParado: number;
};

// ─── PERÍODOS ───────────────────────────────────────────────────────────────
const PERIODOS: { key: PeriodoKey; label: string; curto: string; dias: number; icone: string; cor: string }[] = [
  { key: "semanal",    label: "Últimos 7 dias",  curto: "7d",   dias: 7,    icone: "📅", cor: "#2563eb" },
  { key: "mensal",     label: "Últimos 30 dias", curto: "30d",  dias: 30,   icone: "📊", cor: "#3b82f6" },
  { key: "trimestral", label: "Últimos 90 dias", curto: "90d",  dias: 90,   icone: "📈", cor: "#8b5cf6" },
  { key: "ano",        label: "Último 1 ano",    curto: "1ano", dias: 365,  icone: "🗓️", cor: "#f59e0b" },
  { key: "tudo",       label: "Tudo",            curto: "Tudo", dias: 99999, icone: "♾️", cor: "#6b7280" },
];
const PERIODOS_MAP = PERIODOS.reduce((a, p) => { a[p.key] = p; return a; }, {} as Record<PeriodoKey, typeof PERIODOS[number]>);

const PALETA = ["#3b82f6", "#2563eb", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#dc2626", "#14b8a6", "#a855f7", "#0ea5e9", "#f97316", "#84cc16"];
const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const DIAS_SEMANA_LONGO = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

// ─── REGEX de classificação de status ────────────────────────────────────────
const REGEX_INSTALADO = /instal|ativ(?:a|o|ad)|conclu|finaliz|sucesso/i;
const REGEX_CANCEL = /cancel|distrat|desinstal|reprovad|recus|perd|inviav/i;
const REGEX_INTERNO = /intern/i;
const REGEX_EXTERNO = /extern/i;

const carregarMapaCategoria = (opcoes: string[]) => {
  const inst: string[] = [], cancInt: string[] = [], cancExt: string[] = [], cancOut: string[] = [];
  for (const o of opcoes) {
    if (REGEX_INSTALADO.test(o)) { inst.push(o); continue; }
    if (REGEX_CANCEL.test(o)) {
      if (REGEX_INTERNO.test(o)) cancInt.push(o);
      else if (REGEX_EXTERNO.test(o)) cancExt.push(o);
      else cancOut.push(o);
    }
  }
  return { inst, cancInt, cancExt, cancOut };
};

// ─── HELPERS DE FORMATO (foco em número, não R$) ─────────────────────────────
const formatNum = (v: number) => (v || 0).toLocaleString("pt-BR");
const formatPct = (v: number) => `${Math.round(v || 0)}%`;
const pct = (parte: number, total: number) => (total > 0 ? Math.round((parte / total) * 100) : 0);

const formatDataCurta = (d: string | Date) => {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
};

const trendPct = (atual: number, anterior: number): number => {
  if (anterior === 0) return atual > 0 ? 100 : 0;
  return Math.round(((atual - anterior) / anterior) * 100);
};

// ─── LEITORES DE CAMPO ───────────────────────────────────────────────────────
const lerValorBruto = (p: Proposta, campo: CampoUni | undefined): any => {
  if (!campo) return null;
  if (campo.origem === "custom") return p.dados_customizados?.[campo.slug];
  return (p as any)[campo.slug];
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

// ─── localStorage da config (key fixa "unita") ───────────────────────────────
const FUNIL_CFG_KEY = "funil_instalacao_v2__unita";
const carregarConfigSalva = (): Partial<FunilConfig> | null => {
  if (typeof window === "undefined") return null;
  try { const raw = window.localStorage.getItem(FUNIL_CFG_KEY); return raw ? JSON.parse(raw) : null; }
  catch { return null; }
};
const salvarConfig = (cfg: FunilConfig) => {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(FUNIL_CFG_KEY, JSON.stringify(cfg)); } catch { /* noop */ }
};

// ─── AUTO-DETECÇÃO da config a partir dos campos ─────────────────────────────
const autoDetectarConfig = (campos: CampoUni[]): FunilConfig => {
  const visiveis = campos.filter(c => c.visivel !== false);
  const dropdowns = visiveis.filter(c => c.tipo === "dropdown");
  const datas = visiveis.filter(c => c.tipo === "data");

  const statusPreferido =
    dropdowns.find(c => /status|situac|fase|etapa|estagio|estágio/i.test(c.slug) || /status|situac|fase|etapa/i.test(c.label)) ||
    dropdowns.find(c => (c.opcoes || []).some(o => REGEX_INSTALADO.test(o) || REGEX_CANCEL.test(o))) ||
    dropdowns[0];

  const campoStatus = statusPreferido?.slug || "status_venda";
  const opcoesStatus = statusPreferido?.opcoes || [];

  const dataPreferida =
    datas.find(c => /proposta|abertura|entrada|criac|criação|inicio|início|cadastro/i.test(c.slug)) || datas[0];
  const campoData = dataPreferida?.slug || "";

  const { inst, cancInt, cancExt, cancOut } = carregarMapaCategoria(opcoesStatus);

  return {
    campoStatus, campoData,
    statusInstalado: inst,
    statusCancInterno: cancInt,
    statusCancExterno: cancExt,
    statusCancOutro: cancOut,
    metaInstalacoes: 0,
    diasParado: 14,
  };
};

// ═══════════════════════════════════════════════════════════════════════════
// 🎭 MOCK DATA (modo demo quando `proposta` está vazia)
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
// Distribuição que privilegia instalação, com cancelamentos internos/externos
const STATUS_MOCK = [
  "INSTALADA", "INSTALADA", "INSTALADA", "INSTALADA", "INSTALADA",
  "GERADA", "GERADA", "AGUARDANDO AUDITORIA", "PENDENTE",
  "CANCELADA INTERNA", "CANCELADA EXTERNA", "CANCELADA EXTERNA",
];

function gerarMockData(): Proposta[] {
  const propostas: Proposta[] = [];
  const agora = new Date();
  for (let i = 0; i < 240; i++) {
    const diasAtras = Math.floor(Math.random() * 120);
    const data = new Date(agora);
    data.setDate(data.getDate() - diasAtras);
    data.setHours(8 + Math.floor(Math.random() * 12), Math.floor(Math.random() * 60));
    const statusEscolhido = STATUS_MOCK[Math.floor(Math.random() * STATUS_MOCK.length)];
    const diasDesdeUpdate = Math.floor(Math.random() * Math.min(diasAtras || 1, 30));
    const updated = new Date(data);
    updated.setDate(updated.getDate() + diasDesdeUpdate);
    propostas.push({
      id: i + 1,
      created_at: data.toISOString(),
      updated_at: updated.toISOString(),
      data_proposta: data.toISOString(),
      nome: `Cliente ${String(i + 1).padStart(3, "0")}`,
      vendedor: VENDEDORES_MOCK[Math.floor(Math.random() * VENDEDORES_MOCK.length)].email,
      status_venda: statusEscolhido,
      operadora: OPERADORAS_MOCK[Math.floor(Math.random() * OPERADORAS_MOCK.length)],
      plano: PLANOS_MOCK[Math.floor(Math.random() * PLANOS_MOCK.length)],
      dados_customizados: {},
    });
  }
  return propostas.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

function camposMockTelecom(): CampoUni[] {
  return [
    { slug: "status_venda", label: "Status da Venda", tipo: "dropdown", origem: "fixo", visivel: true, ordem: 1, opcoes: ["GERADA", "AGUARDANDO AUDITORIA", "PENDENTE", "INSTALADA", "CANCELADA INTERNA", "CANCELADA EXTERNA"], obrigatorio: false } as any,
    { slug: "plano", label: "Plano", tipo: "dropdown", origem: "fixo", visivel: true, ordem: 2, opcoes: PLANOS_MOCK, obrigatorio: false } as any,
    { slug: "operadora", label: "Operadora", tipo: "dropdown", origem: "fixo", visivel: true, ordem: 3, opcoes: OPERADORAS_MOCK, obrigatorio: false } as any,
    { slug: "data_proposta", label: "Data da Proposta", tipo: "data", origem: "fixo", visivel: true, ordem: 4, opcoes: null, obrigatorio: false } as any,
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

// Cores semânticas do funil de instalação
const COR = {
  entrou: "#6366f1",
  instalou: "#16a34a",
  andamento: "#f59e0b",
  cancInt: "#dc2626",
  cancExt: "#b91c1c",
  cancel: "#dc2626",
};

// ═══════════════════════════════════════════════════════════════════════════
// 🎯 COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════
export default function Funil() {
  const router = useRouter();
  const { isDono, isSuperAdmin, permissoes } = usePermissao();

  const [propostas, setPropostas] = useState<Proposta[]>([]);
  const [campos, setCampos] = useState<CampoUni[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [modoDemo, setModoDemo] = useState(false);

  const { equipeId, EquipeSelector } = useEquipeFiltro();

  const [config, setConfig] = useState<FunilConfig | null>(null);
  const [showConfig, setShowConfig] = useState(false);

  const [periodo, setPeriodo] = useState<PeriodoKey>("mensal");
  const [dataInicio, setDataInicio] = useState<string>("");
  const [dataFim, setDataFim] = useState<string>("");
  const [filtroVendedor, setFiltroVendedor] = useState("todos");
  const [filtroBusca, setFiltroBusca] = useState("");
  const [filtrosDim, setFiltrosDim] = useState<Record<string, string>>({});

  const [aba, setAba] = useState<AbaKey>("visao");
  const [dimensaoSel, setDimensaoSel] = useState<string>("");

  const [listaOrdem, setListaOrdem] = useState<OrdemLista>("recente");
  const [listaPagina, setListaPagina] = useState(1);
  const LISTA_SIZE = 20;
  const [agrupTempo, setAgrupTempo] = useState<"dia" | "semana" | "mes">("dia");

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // ─── CARGA INICIAL (somente proposta + campos + usuários) ──────────────────
  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }

      // 1) Config de campos (Editor de Proposta)
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
        camposUnificados = camposMockTelecom();
      }
      if (camposUnificados.length === 0) camposUnificados = camposMockTelecom();
      setCampos(camposUnificados);

      // 2) Config semântica (salva ou auto-detectada)
      const salva = carregarConfigSalva();
      const auto = autoDetectarConfig(camposUnificados);
      const cfg: FunilConfig = {
        campoStatus: salva?.campoStatus || auto.campoStatus,
        campoData: salva?.campoData ?? auto.campoData,
        statusInstalado: salva?.statusInstalado || auto.statusInstalado,
        statusCancInterno: salva?.statusCancInterno || auto.statusCancInterno,
        statusCancExterno: salva?.statusCancExterno || auto.statusCancExterno,
        statusCancOutro: salva?.statusCancOutro || auto.statusCancOutro,
        metaInstalacoes: salva?.metaInstalacoes ?? auto.metaInstalacoes,
        diasParado: salva?.diasParado ?? auto.diasParado,
      };
      setConfig(cfg);

      const primeiraDim = camposUnificados.find(c => c.tipo === "dropdown" && c.slug !== cfg.campoStatus && c.visivel !== false);
      if (primeiraDim) setDimensaoSel(primeiraDim.slug);

      // 3) Propostas (single-tenant, paginado)
      let propostasReais: Proposta[] = [];
      let usouMock = false;
      try {
        const PAGE = 1000, MAX_TOTAL = 600000;
        let acc: any[] = [], off = 0;
        while (off < MAX_TOTAL) {
          const { data: pag, error } = await supabase.from("proposta").select("*")
            .order("created_at", { ascending: false })
            .range(off, off + PAGE - 1);
          if (error) throw error;
          if (!pag || pag.length === 0) break;
          acc = acc.concat(pag);
          if (pag.length < PAGE) break;
          off += PAGE;
        }
        propostasReais = acc as Proposta[];
      } catch {
        usouMock = true;
      }
      if (propostasReais.length === 0) { usouMock = true; propostasReais = gerarMockData(); }
      setPropostas(propostasReais);
      setModoDemo(usouMock);

      // 4) Usuários (lookup de nome do vendedor)
      let usuariosLista: Usuario[] = [];
      try {
        const { data: us } = await supabase.from("usuarios").select("email, nome, equipe_id");
        usuariosLista = (us || []) as Usuario[];
      } catch { /* tabela não existe */ }
      if (usuariosLista.length === 0 && usouMock) usuariosLista = VENDEDORES_MOCK;
      setUsuarios(usuariosLista);

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
  const campoData = useMemo(() => (config && config.campoData) ? camposMap.get(config.campoData) : undefined, [config, camposMap]);

  const opcoesStatus = useMemo<string[]>(() => {
    if (!campoStatus) return [];
    if (campoStatus.opcoes && campoStatus.opcoes.length) return campoStatus.opcoes;
    const set = new Set<string>();
    for (const p of propostas) { const v = lerTexto(p, campoStatus); if (v) set.add(v); }
    return Array.from(set);
  }, [campoStatus, propostas]);

  const dimensoesDisponiveis = useMemo<CampoUni[]>(() => {
    return campos.filter(c =>
      (c.tipo === "dropdown" || c.tipo === "checkbox") &&
      c.visivel !== false &&
      c.slug !== config?.campoStatus
    );
  }, [campos, config]);

  const camposStatusDisp = useMemo(() => campos.filter(c => c.tipo === "dropdown" && c.visivel !== false), [campos]);
  const camposDataDisp = useMemo(() => campos.filter(c => c.tipo === "data" && c.visivel !== false), [campos]);

  // ─── HELPERS SEMÂNTICOS ─────────────────────────────────────────────────────
  const statusDe = useCallback((p: Proposta): string => lerTexto(p, campoStatus), [campoStatus]);
  const dataDe = useCallback((p: Proposta): Date => lerData(p, campoData) || new Date(p.created_at), [campoData]);

  // Sets pra categorização rápida
  const setsCat = useMemo(() => ({
    inst: new Set((config?.statusInstalado || []).map(s => s.toLowerCase())),
    cancInt: new Set((config?.statusCancInterno || []).map(s => s.toLowerCase())),
    cancExt: new Set((config?.statusCancExterno || []).map(s => s.toLowerCase())),
    cancOut: new Set((config?.statusCancOutro || []).map(s => s.toLowerCase())),
  }), [config]);

  const categoriaDe = useCallback((p: Proposta): CatFunil => {
    const s = statusDe(p).toLowerCase();
    if (setsCat.inst.has(s)) return "instalado";
    if (setsCat.cancInt.has(s)) return "canc_interno";
    if (setsCat.cancExt.has(s)) return "canc_externo";
    if (setsCat.cancOut.has(s)) return "canc_outro";
    return "andamento";
  }, [statusDe, setsCat]);

  const ehInstalado = useCallback((p: Proposta) => categoriaDe(p) === "instalado", [categoriaDe]);
  const ehCancelado = useCallback((p: Proposta) => {
    const c = categoriaDe(p);
    return c === "canc_interno" || c === "canc_externo" || c === "canc_outro";
  }, [categoriaDe]);

  // ─── FILTRO MESTRE ──────────────────────────────────────────────────────────
  const passaFiltrosBase = useCallback((p: Proposta): boolean => {
    if (equipeId && String(p.equipe_id_criador ?? "") !== String(equipeId)) return false;
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

  const propsFiltradas = useMemo(() => propostas.filter(p => passaFiltrosBase(p) && dentroPeriodo(p)), [propostas, passaFiltrosBase, dentroPeriodo]);

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

  // ─── MÉTRICAS (contagem + %) ─────────────────────────────────────────────────
  const m = useMemo(() => {
    const pf = propsFiltradas;
    const total = pf.length;
    let instalado = 0, cancInt = 0, cancExt = 0, cancOut = 0, andamento = 0;
    for (const p of pf) {
      switch (categoriaDe(p)) {
        case "instalado": instalado++; break;
        case "canc_interno": cancInt++; break;
        case "canc_externo": cancExt++; break;
        case "canc_outro": cancOut++; break;
        default: andamento++;
      }
    }
    const canceladoTotal = cancInt + cancExt + cancOut;
    const decididos = instalado + canceladoTotal;

    // período anterior (pra tendência)
    let instAnt = 0, cancAnt = 0;
    for (const p of propsAnterior) {
      const c = categoriaDe(p);
      if (c === "instalado") instAnt++;
      else if (c === "canc_interno" || c === "canc_externo" || c === "canc_outro") cancAnt++;
    }

    return {
      total, instalado, cancInt, cancExt, cancOut, canceladoTotal, andamento, decididos,
      // percentuais sobre o total que entrou
      pctInstalado: pct(instalado, total),
      pctCancelado: pct(canceladoTotal, total),
      pctCancInt: pct(cancInt, total),
      pctCancExt: pct(cancExt, total),
      pctAndamento: pct(andamento, total),
      // taxa de instalação sobre os já decididos (instalou vs cancelou)
      taxaInstalacaoDecididos: pct(instalado, decididos),
      // cancelamento interno vs externo dentro dos cancelamentos
      pctCancIntDoCancel: pct(cancInt, canceladoTotal),
      pctCancExtDoCancel: pct(cancExt, canceladoTotal),
      // tendências (contagem)
      tTotal: trendPct(total, propsAnterior.length),
      tInstalado: trendPct(instalado, instAnt),
      tCancelado: trendPct(canceladoTotal, cancAnt),
    };
  }, [propsFiltradas, propsAnterior, categoriaDe]);

  // ─── BREAKDOWN POR STATUS (todos os status com contagem + %) ─────────────────
  const statusBreakdown = useMemo(() => {
    const mapa: Record<string, number> = {};
    for (const p of propsFiltradas) {
      const s = statusDe(p) || "(sem status)";
      mapa[s] = (mapa[s] || 0) + 1;
    }
    return Object.entries(mapa).map(([status, qtd]) => {
      const sl = status.toLowerCase();
      const cat: CatFunil =
        setsCat.inst.has(sl) ? "instalado" :
        setsCat.cancInt.has(sl) ? "canc_interno" :
        setsCat.cancExt.has(sl) ? "canc_externo" :
        setsCat.cancOut.has(sl) ? "canc_outro" : "andamento";
      const cor = cat === "instalado" ? COR.instalou
        : cat === "canc_interno" ? COR.cancInt
        : cat === "canc_externo" ? COR.cancExt
        : cat === "canc_outro" ? COR.cancel
        : COR.andamento;
      return { status, qtd, cat, cor, pct: pct(qtd, propsFiltradas.length) };
    }).sort((a, b) => b.qtd - a.qtd);
  }, [propsFiltradas, statusDe, setsCat]);

  // ─── POR VENDEDOR (contagem) ─────────────────────────────────────────────────
  const vendedoresStats = useMemo(() => {
    const mapa: Record<string, { total: number; instalado: number; cancInt: number; cancExt: number; cancOut: number; andamento: number }> = {};
    for (const p of propsFiltradas) {
      const k = p.vendedor || "—";
      if (!mapa[k]) mapa[k] = { total: 0, instalado: 0, cancInt: 0, cancExt: 0, cancOut: 0, andamento: 0 };
      const r = mapa[k];
      r.total++;
      switch (categoriaDe(p)) {
        case "instalado": r.instalado++; break;
        case "canc_interno": r.cancInt++; break;
        case "canc_externo": r.cancExt++; break;
        case "canc_outro": r.cancOut++; break;
        default: r.andamento++;
      }
    }
    return Object.entries(mapa).map(([email, d]) => {
      const cancelado = d.cancInt + d.cancExt + d.cancOut;
      return {
        email, nome: nomeVendedor(email), ...d, cancelado,
        taxaInstalacao: pct(d.instalado, d.total),
        taxaCancelamento: pct(cancelado, d.total),
      };
    }).sort((a, b) => b.instalado - a.instalado || b.total - a.total);
  }, [propsFiltradas, categoriaDe, nomeVendedor]);

  // ─── POR DIMENSÃO (operadora/plano — contagem) ───────────────────────────────
  const breakdownDim = useMemo(() => {
    const campo = camposMap.get(dimensaoSel);
    if (!campo) return [];
    const mapa: Record<string, { qtd: number; instalado: number; cancelado: number; andamento: number }> = {};
    for (const p of propsFiltradas) {
      const k = lerTexto(p, campo) || "(vazio)";
      if (!mapa[k]) mapa[k] = { qtd: 0, instalado: 0, cancelado: 0, andamento: 0 };
      const r = mapa[k];
      r.qtd++;
      if (ehInstalado(p)) r.instalado++;
      else if (ehCancelado(p)) r.cancelado++;
      else r.andamento++;
    }
    return Object.entries(mapa).map(([valor, d]) => ({
      valor, ...d,
      taxaInstalacao: pct(d.instalado, d.qtd),
    })).sort((a, b) => b.instalado - a.instalado || b.qtd - a.qtd);
  }, [dimensaoSel, camposMap, propsFiltradas, ehInstalado, ehCancelado]);

  // ─── SÉRIE TEMPORAL (entradas / instalações / cancelamentos) ─────────────────
  const serieTemporal = useMemo(() => {
    const dias = janela.tudo ? 90 : janela.dias;
    const tamMs = agrupTempo === "dia" ? 86400000 : agrupTempo === "semana" ? 7 * 86400000 : 30 * 86400000;
    const n = Math.max(1, Math.ceil(dias / (tamMs / 86400000)));
    const ini = janela.tudo ? new Date(Date.now() - dias * 86400000) : janela.ini;
    const buckets = Array.from({ length: n }, (_, i) => {
      const start = new Date(ini.getTime() + i * tamMs);
      return { label: formatDataCurta(start), start, entrou: 0, instalou: 0, cancelou: 0 };
    });
    for (const p of propsFiltradas) {
      const d = dataDe(p);
      if (d < ini) continue;
      const idx = Math.floor((d.getTime() - ini.getTime()) / tamMs);
      if (idx < 0 || idx >= buckets.length) continue;
      const b = buckets[idx];
      b.entrou++;
      if (ehInstalado(p)) b.instalou++;
      else if (ehCancelado(p)) b.cancelou++;
    }
    return buckets;
  }, [propsFiltradas, janela, agrupTempo, dataDe, ehInstalado, ehCancelado]);

  // ─── HEATMAP (volume de entradas por dia × hora) ─────────────────────────────
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

  // ─── METAS DO MÊS (instalações) ──────────────────────────────────────────────
  const metas = useMemo(() => {
    const agora = new Date();
    const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1);
    const fimMes = new Date(agora.getFullYear(), agora.getMonth() + 1, 0);
    const diasNoMes = fimMes.getDate();
    const diaAtual = agora.getDate();
    const fracaoDecorrida = diaAtual / diasNoMes;

    const base = propostas.filter(passaFiltrosBase);
    const instaladasMes = base.filter(p => {
      if (!ehInstalado(p)) return false;
      const d = dataDe(p);
      return d >= inicioMes && d <= new Date(fimMes.getFullYear(), fimMes.getMonth(), fimMes.getDate(), 23, 59, 59);
    }).length;

    const meta = config?.metaInstalacoes || 0;
    const pctMeta = meta > 0 ? Math.round((instaladasMes / meta) * 100) : 0;
    const projecao = fracaoDecorrida > 0 ? Math.round(instaladasMes / fracaoDecorrida) : 0;
    const pctRitmo = Math.round(fracaoDecorrida * 100);
    const falta = Math.max(0, meta - instaladasMes);
    const diasRestantes = diasNoMes - diaAtual;

    return {
      instaladasMes, meta, pctMeta, projecao, pctRitmo, falta, diasRestantes, diasNoMes, diaAtual,
      noRitmo: projecao >= meta,
      mesLabel: agora.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }),
    };
  }, [propostas, passaFiltrosBase, ehInstalado, dataDe, config]);

  // ─── LISTA ────────────────────────────────────────────────────────────────
  const listaOrdenada = useMemo(() => {
    const arr = [...propsFiltradas];
    switch (listaOrdem) {
      case "recente": arr.sort((a, b) => dataDe(b).getTime() - dataDe(a).getTime()); break;
      case "antiga":  arr.sort((a, b) => dataDe(a).getTime() - dataDe(b).getTime()); break;
      case "nome_az": arr.sort((a, b) => (a.nome || "").localeCompare(b.nome || "")); break;
    }
    return arr;
  }, [propsFiltradas, listaOrdem, dataDe]);
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
    dimensoesDisponiveis.slice(0, 2).forEach(c => escolhidos.push(c));
    return escolhidos.slice(0, 6);
  }, [campos, camposMap, config, dimensoesDisponiveis]);

  // ─── HANDLERS ───────────────────────────────────────────────────────────────
  const salvarConfigFunil = (novo: FunilConfig) => { setConfig(novo); salvarConfig(novo); };

  // alterna um status entre as categorias (instalado / cancInt / cancExt)
  const toggleStatusCategoria = (opt: string, alvo: "inst" | "int" | "ext") => {
    if (!config) return;
    const tirar = (arr: string[]) => arr.filter(x => x !== opt);
    let inst = tirar(config.statusInstalado);
    let int_ = tirar(config.statusCancInterno);
    let ext = tirar(config.statusCancExterno);
    let out = tirar(config.statusCancOutro);
    const jaEra =
      (alvo === "inst" && config.statusInstalado.includes(opt)) ||
      (alvo === "int" && config.statusCancInterno.includes(opt)) ||
      (alvo === "ext" && config.statusCancExterno.includes(opt));
    if (!jaEra) {
      if (alvo === "inst") inst = [...inst, opt];
      if (alvo === "int") int_ = [...int_, opt];
      if (alvo === "ext") ext = [...ext, opt];
    }
    salvarConfigFunil({ ...config, statusInstalado: inst, statusCancInterno: int_, statusCancExterno: ext, statusCancOutro: out });
  };

  const limparFiltros = () => {
    setPeriodo("mensal"); setDataInicio(""); setDataFim("");
    setFiltroVendedor("todos"); setFiltroBusca(""); setFiltrosDim({});
  };

  const algumFiltro = periodo !== "mensal" || filtroVendedor !== "todos" || filtroBusca !== "" || Object.values(filtrosDim).some(Boolean);
  const vendedoresUnicos = useMemo(() => Array.from(new Set(propostas.map(p => p.vendedor).filter(Boolean) as string[])).sort(), [propostas]);

  // ═══ ACESSO RESTRITO ═══
  if (!isDono && !isSuperAdmin && !permissoes.funil) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh", padding: 32 }}>
        <div style={{ ...cardStyle, padding: 48, textAlign: "center", maxWidth: 480 }}>
          <div style={{ width: 80, height: 80, borderRadius: 20, background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40, margin: "0 auto 16px" }}>
            <span style={{ filter: "saturate(0) brightness(2)" }}>🔒</span>
          </div>
          <h1 style={{ color: "#1f2937", fontSize: 18, fontWeight: 700, margin: "0 0 8px" }}>Acesso restrito</h1>
          <p style={{ color: "#6b7280", fontSize: 13, margin: 0 }}>Você não tem permissão para ver o Funil.</p>
        </div>
      </div>
    );
  }

  const periodoInfo = PERIODOS_MAP[periodo] || PERIODOS_MAP["mensal"];
  const periodoLabelCurto = periodo === "custom" && dataInicio && dataFim
    ? `${dataInicio.split("-").reverse().slice(0, 2).join("/")}–${dataFim.split("-").reverse().slice(0, 2).join("/")}`
    : periodoInfo.curto;

  const TABS: { key: AbaKey; label: string; icone: string; color: string }[] = [
    { key: "visao",      label: "Resumo geral",    icone: "📊", color: "#2563eb" },
    { key: "status",     label: "Por status",      icone: "🏷️", color: "#3b82f6" },
    { key: "vendedores", label: "Vendedores",      icone: "👥", color: "#0891b2" },
    { key: "dimensoes",  label: "Por categoria",   icone: "🧩", color: "#8b5cf6" },
    { key: "metas",      label: "Meta de instalação", icone: "🏆", color: "#eab308" },
    { key: "temporal",   label: "Linha do tempo",  icone: "📈", color: "#f59e0b" },
    { key: "horarios",   label: "Horários",        icone: "🗓️", color: "#14b8a6" },
    { key: "lista",      label: "Lista completa",  icone: "📑", color: "#6366f1" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 16 : 22 }}>

      {/* ═══ BANNER DEMO ═══ */}
      {modoDemo && (
        <div style={{ background: "linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)", border: "1px solid #bfdbfe", borderLeft: "4px solid #2563eb", borderRadius: 12, padding: "12px 18px", display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 22 }}>💡</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ color: "#1e40af", fontSize: 13.5, margin: 0, fontWeight: 700 }}>Modo demonstração ativo</p>
            <p style={{ color: "#3b82f6", fontSize: 12, margin: "2px 0 0", lineHeight: 1.4 }}>
              Mostrando 240 propostas fictícias — a tabela <code style={{ background: "#dbeafe", padding: "1px 6px", borderRadius: 4, fontFamily: "monospace", fontSize: 11.5 }}>proposta</code> ainda não foi criada ou está vazia.
            </p>
          </div>
        </div>
      )}

      {/* ═══ HEADER ═══ */}
      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: isMobile ? "stretch" : "center", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: "linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0 }}>
            <span style={{ filter: "saturate(0) brightness(2)" }}>🎯</span>
          </div>
          <div>
            <h1 style={{ color: "#1f2937", fontSize: isMobile ? 20 : 24, fontWeight: 700, margin: 0, letterSpacing: -0.3 }}>Funil de Instalação</h1>
            <p style={{ color: "#6b7280", fontSize: 12, margin: "2px 0 0" }}>
              <b style={{ color: "#2563eb" }}>{m.total}</b> entradas · <b style={{ color: COR.instalou }}>{m.instalado}</b> instaladas · {periodoLabelCurto}
              {equipeId && <> · <span style={{ color: "#a855f7", fontWeight: 700 }}>👥 equipe</span></>}
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <EquipeSelector />
          <button onClick={() => setShowConfig(s => !s)} style={{ ...inputStyle, display: "flex", alignItems: "center", gap: 6, background: showConfig ? "#eff6ff" : "#ffffff", color: showConfig ? "#2563eb" : "#6b7280", borderColor: showConfig ? "#bfdbfe" : "#e5e7eb" }}>⚙️ Ajustar</button>
        </div>
      </div>

      {/* ═══ CONFIG ═══ */}
      {showConfig && config && (
        <div style={{ ...cardStyle, padding: isMobile ? 16 : 20, borderTop: "3px solid #2563eb" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
            <h3 style={{ ...sectionTitleStyle, margin: 0, fontSize: 14 }}>
              <span style={{ width: 28, height: 28, borderRadius: 8, background: "#eff6ff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>⚙️</span>
              Como classificar os status
            </h3>
            <button onClick={() => salvarConfigFunil(autoDetectarConfig(campos))} style={{ background: "#f9fafb", color: "#6b7280", border: "1px solid #e5e7eb", borderRadius: 8, padding: "6px 12px", fontSize: 11, cursor: "pointer", fontWeight: 700 }}>🔄 Auto-detectar</button>
          </div>
          <p style={{ color: "#6b7280", fontSize: 12, margin: "0 0 16px", lineHeight: 1.5 }}>
            Diga qual campo é o <b>status</b> e marque cada situação como <b style={{ color: COR.instalou }}>instalada</b>, <b style={{ color: COR.cancInt }}>cancelada interna</b> ou <b style={{ color: COR.cancExt }}>cancelada externa</b>. O resto conta como <b style={{ color: COR.andamento }}>em andamento</b>.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12, marginBottom: 16 }}>
            <div>
              <label style={{ color: "#6b7280", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 6 }}>🏷️ Campo de Status</label>
              <select value={config.campoStatus} onChange={e => { const auto = autoDetectarConfig(campos); salvarConfigFunil({ ...config, campoStatus: e.target.value, statusInstalado: [], statusCancInterno: [], statusCancExterno: [], statusCancOutro: [] }); void auto; }} style={{ ...inputStyle, width: "100%" }}>
                {camposStatusDisp.length === 0 && <option value={config.campoStatus}>{config.campoStatus}</option>}
                {camposStatusDisp.map(c => <option key={c.slug} value={c.slug}>{c.label}</option>)}
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
          {opcoesStatus.length === 0 ? (
            <p style={{ color: "#9ca3af", fontSize: 12, fontStyle: "italic" }}>O campo de status não tem opções definidas no Editor de Proposta.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {opcoesStatus.map(opt => {
                const sl = opt.toLowerCase();
                const isInst = setsCat.inst.has(sl);
                const isInt = setsCat.cancInt.has(sl);
                const isExt = setsCat.cancExt.has(sl);
                const btn = (label: string, ativo: boolean, cor: string, bg: string, onClick: () => void) => (
                  <button onClick={onClick} style={{ background: ativo ? bg : "#ffffff", color: ativo ? cor : "#9ca3af", border: `1px solid ${ativo ? cor : "#e5e7eb"}`, borderRadius: 8, padding: "5px 11px", fontSize: 11, cursor: "pointer", fontWeight: 700, whiteSpace: "nowrap" }}>{label}</button>
                );
                return (
                  <div key={opt} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8, flexWrap: "wrap" }}>
                    <span style={{ color: "#1f2937", fontSize: 12, fontWeight: 700, flex: 1, minWidth: 120 }}>{opt}</span>
                    <div style={{ display: "flex", gap: 4 }}>
                      {btn("✅ Instalada", isInst, COR.instalou, "#f0fdf4", () => toggleStatusCategoria(opt, "inst"))}
                      {btn("❌ Canc. interna", isInt, COR.cancInt, "#fef2f2", () => toggleStatusCategoria(opt, "int"))}
                      {btn("🚫 Canc. externa", isExt, COR.cancExt, "#fef2f2", () => toggleStatusCategoria(opt, "ext"))}
                    </div>
                  </div>
                );
              })}
              <p style={{ color: "#9ca3af", fontSize: 11, margin: "4px 0 0", lineHeight: 1.4 }}>Situações sem marcação contam como <b style={{ color: COR.andamento }}>em andamento</b>. Suas escolhas ficam salvas neste navegador.</p>
            </div>
          )}
          <div style={{ marginTop: 18, paddingTop: 18, borderTop: "1px dashed #e5e7eb", display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ color: "#6b7280", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 6 }}>🏆 Meta de instalações no mês</label>
              <input type="number" min={0} value={config.metaInstalacoes || ""} placeholder="0" onChange={e => salvarConfigFunil({ ...config, metaInstalacoes: parseInt(e.target.value) || 0 })} style={{ ...inputStyle, width: "100%", cursor: "text" }} />
            </div>
            <div>
              <label style={{ color: "#6b7280", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 6 }}>🥶 Dias p/ "parado"</label>
              <input type="number" min={1} value={config.diasParado || ""} placeholder="14" onChange={e => salvarConfigFunil({ ...config, diasParado: parseInt(e.target.value) || 14 })} style={{ ...inputStyle, width: "100%", cursor: "text" }} />
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
                <button key={p.key} onClick={() => setPeriodo(p.key)} style={{ background: at ? `${p.cor}15` : "#ffffff", color: at ? p.cor : "#6b7280", border: `1px solid ${at ? `${p.cor}50` : "#e5e7eb"}`, borderRadius: 10, padding: "8px 14px", fontSize: 12, cursor: "pointer", fontWeight: at ? 700 : 600 }}>{p.icone} {p.label}</button>
              );
            })}
            <button onClick={() => setPeriodo("custom")} style={{ background: periodo === "custom" ? "#ec489915" : "#ffffff", color: periodo === "custom" ? "#ec4899" : "#6b7280", border: `1px solid ${periodo === "custom" ? "#ec489950" : "#e5e7eb"}`, borderRadius: 10, padding: "8px 14px", fontSize: 12, cursor: "pointer", fontWeight: periodo === "custom" ? 700 : 600 }}>📅 Personalizado</button>
          </div>
          {periodo === "custom" && (
            <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap", alignItems: "flex-end", background: "#fdf2f8", border: "1px solid #fbcfe8", borderRadius: 10, padding: 12 }}>
              <div>
                <label style={{ color: "#9d174d", fontSize: 10, fontWeight: 700, textTransform: "uppercase", display: "block", marginBottom: 5 }}>De</label>
                <input type="date" value={dataInicio} max={dataFim || undefined} onChange={e => setDataInicio(e.target.value)} style={{ ...inputStyle, cursor: "text", borderColor: "#fbcfe8" }} />
              </div>
              <div>
                <label style={{ color: "#9d174d", fontSize: 10, fontWeight: 700, textTransform: "uppercase", display: "block", marginBottom: 5 }}>Até</label>
                <input type="date" value={dataFim} min={dataInicio || undefined} onChange={e => setDataFim(e.target.value)} style={{ ...inputStyle, cursor: "text", borderColor: "#fbcfe8" }} />
              </div>
              {(!dataInicio || !dataFim) && <span style={{ color: "#9d174d", fontSize: 11, fontWeight: 600, alignSelf: "center" }}>👈 escolha as duas datas</span>}
            </div>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : `repeat(${Math.min(4, 2 + dimensoesDisponiveis.slice(0, 2).length)}, 1fr)`, gap: 10, alignItems: "end" }}>
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
                {(dim.opcoes && dim.opcoes.length ? dim.opcoes : Array.from(new Set(propostas.map(p => lerTexto(p, dim)).filter(Boolean)))).map(o => <option key={o} value={o}>{o}</option>)}
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
            <p style={{ color: "#6b7280", fontSize: 11, margin: 0 }}><b style={{ color: "#1f2937" }}>{propsFiltradas.length}</b> de <b style={{ color: "#1f2937" }}>{propostas.length}</b> registros</p>
            <button onClick={limparFiltros} style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", borderRadius: 10, padding: "6px 14px", fontSize: 11, cursor: "pointer", fontWeight: 700 }}>✕ Limpar filtros</button>
          </div>
        )}
      </div>

      {/* ═══ TABS ═══ */}
      <div style={{ ...cardStyle, padding: 6, display: "flex", gap: 4, overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
        {TABS.map(t => {
          const at = aba === t.key;
          return (
            <button key={t.key} onClick={() => setAba(t.key)} style={{ background: at ? `linear-gradient(135deg, ${t.color} 0%, ${t.color}dd 100%)` : "transparent", color: at ? "white" : "#6b7280", border: "none", borderRadius: 10, padding: "9px 16px", fontSize: 12, cursor: "pointer", fontWeight: 700, whiteSpace: "nowrap", flexShrink: 0 }}>{t.icone} {t.label}</button>
          );
        })}
      </div>

      {loading ? (
        <div style={{ ...cardStyle, padding: 48, textAlign: "center", color: "#6b7280" }}>Carregando funil...</div>
      ) : !config ? (
        <div style={{ ...cardStyle, padding: 48, textAlign: "center", color: "#6b7280" }}>Carregando configuração...</div>
      ) : m.total === 0 ? (
        <div style={{ ...cardStyle, padding: 48, textAlign: "center" }}>
          <div style={{ width: 80, height: 80, borderRadius: 20, background: "linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40, margin: "0 auto 16px" }}>
            <span style={{ filter: "saturate(0) brightness(2)" }}>🎯</span>
          </div>
          <h3 style={{ color: "#1f2937", fontSize: 16, fontWeight: 700, margin: "0 0 8px" }}>Sem registros no período</h3>
          <p style={{ color: "#6b7280", fontSize: 13, margin: 0 }}>Amplie o período, limpe filtros, ou confira a config (⚙️).</p>
        </div>
      ) : (
        <>
          {/* ════════════ ABA: VISÃO GERAL ════════════ */}
          {aba === "visao" && (
            <>
              {/* Resumo em palavras */}
              <div style={{ ...cardStyle, padding: isMobile ? 16 : 20, borderLeft: "4px solid #2563eb", background: "linear-gradient(135deg,#f8faff,#ffffff)" }}>
                <p style={{ color: "#6b7280", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, margin: "0 0 6px" }}>📣 Em poucas palavras</p>
                <p style={{ color: "#1f2937", fontSize: isMobile ? 15 : 17, fontWeight: 600, margin: 0, lineHeight: 1.6 }}>
                  {`Entraram ${formatNum(m.total)} vendas. ${formatNum(m.instalado)} instalaram (${m.pctInstalado}%). ${formatNum(m.canceladoTotal)} cancelaram (${m.pctCancelado}%) — ${formatNum(m.cancInt)} internas e ${formatNum(m.cancExt)} externas. ${formatNum(m.andamento)} ainda em andamento.`}
                </p>
              </div>

              {/* 5 números grandes (contagem + %) */}
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(5, 1fr)", gap: isMobile ? 10 : 14 }}>
                {[
                  { emoji: "📥", titulo: "ENTRARAM", numero: formatNum(m.total), sub: "vendas no período", cor: COR.entrou, bg: "#eef2ff", trend: m.tTotal },
                  { emoji: "✅", titulo: "INSTALARAM", numero: formatNum(m.instalado), sub: `${m.pctInstalado}% das que entraram`, cor: COR.instalou, bg: "#f0fdf4", trend: m.tInstalado },
                  { emoji: "🔄", titulo: "EM ANDAMENTO", numero: formatNum(m.andamento), sub: `${m.pctAndamento}% ainda abertas`, cor: COR.andamento, bg: "#fffbeb" },
                  { emoji: "❌", titulo: "CANC. INTERNA", numero: formatNum(m.cancInt), sub: `${m.pctCancInt}% do total`, cor: COR.cancInt, bg: "#fef2f2" },
                  { emoji: "🚫", titulo: "CANC. EXTERNA", numero: formatNum(m.cancExt), sub: `${m.pctCancExt}% do total`, cor: COR.cancExt, bg: "#fef2f2" },
                ].map(c => (
                  <div key={c.titulo} style={{ ...cardStyle, padding: isMobile ? 14 : 18, borderTop: `4px solid ${c.cor}` }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 34, height: 34, borderRadius: 10, background: c.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>{c.emoji}</div>
                        <p style={{ color: "#6b7280", fontSize: 10.5, fontWeight: 700, margin: 0 }}>{c.titulo}</p>
                      </div>
                      {typeof c.trend === "number" && c.trend !== 0 && (
                        <span style={{ background: c.trend > 0 ? "#f0fdf4" : "#fef2f2", color: c.trend > 0 ? "#16a34a" : "#dc2626", border: `1px solid ${c.trend > 0 ? "#bbf7d0" : "#fecaca"}`, borderRadius: 8, padding: "2px 6px", fontSize: 9.5, fontWeight: 700 }}>{c.trend > 0 ? "▲" : "▼"} {Math.abs(c.trend)}%</span>
                      )}
                    </div>
                    <p style={{ color: c.cor, fontSize: isMobile ? 24 : 30, fontWeight: 800, margin: 0, letterSpacing: -0.5 }}>{c.numero}</p>
                    <p style={{ color: "#9ca3af", fontSize: 11.5, margin: "3px 0 0", fontWeight: 500 }}>{c.sub}</p>
                  </div>
                ))}
              </div>

              {/* Taxas-chave */}
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: isMobile ? 10 : 14 }}>
                <div style={{ ...cardStyle, padding: isMobile ? 16 : 18, display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 50, height: 50, borderRadius: 14, background: "#f0fdf4", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0 }}>🎯</div>
                  <div>
                    <p style={{ color: "#1f2937", fontSize: isMobile ? 14 : 16, fontWeight: 700, margin: 0 }}>Taxa de instalação: <span style={{ color: COR.instalou }}>{m.pctInstalado}%</span></p>
                    <p style={{ color: "#9ca3af", fontSize: 12, margin: "3px 0 0" }}>{m.instalado} instaladas de {m.total} que entraram.</p>
                  </div>
                </div>
                <div style={{ ...cardStyle, padding: isMobile ? 16 : 18, display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 50, height: 50, borderRadius: 14, background: "#fef2f2", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0 }}>📉</div>
                  <div>
                    <p style={{ color: "#1f2937", fontSize: isMobile ? 14 : 16, fontWeight: 700, margin: 0 }}>Taxa de cancelamento: <span style={{ color: COR.cancel }}>{m.pctCancelado}%</span></p>
                    <p style={{ color: "#9ca3af", fontSize: 12, margin: "3px 0 0" }}>{m.pctCancIntDoCancel}% internas · {m.pctCancExtDoCancel}% externas.</p>
                  </div>
                </div>
                <div style={{ ...cardStyle, padding: isMobile ? 16 : 18, display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 50, height: 50, borderRadius: 14, background: "#eef2ff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0 }}>⚖️</div>
                  <div>
                    <p style={{ color: "#1f2937", fontSize: isMobile ? 14 : 16, fontWeight: 700, margin: 0 }}>Já decididas: <span style={{ color: COR.instalou }}>{m.taxaInstalacaoDecididos}%</span> instalaram</p>
                    <p style={{ color: "#9ca3af", fontSize: 12, margin: "3px 0 0" }}>de {m.decididos} que já instalaram ou cancelaram.</p>
                  </div>
                </div>
              </div>

              {/* FUNIL: Entrou → Instalou → Cancelou */}
              <div style={{ ...cardStyle, padding: isMobile ? 16 : 24 }}>
                <h3 style={sectionTitleStyle}>
                  <span style={{ width: 32, height: 32, borderRadius: 8, background: "#eff6ff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>📊</span>
                  Funil — Entrou → Instalou → Cancelou
                </h3>
                <div style={{ maxWidth: 640, margin: "0 auto", display: "flex", flexDirection: "column", gap: 8 }}>
                  {[
                    { label: "📥 Entraram", qtd: m.total, pctNum: 100, cor: COR.entrou },
                    { label: "✅ Instalaram", qtd: m.instalado, pctNum: m.pctInstalado, cor: COR.instalou },
                    { label: "🔄 Em andamento", qtd: m.andamento, pctNum: m.pctAndamento, cor: COR.andamento },
                    { label: "❌ Cancelaram (total)", qtd: m.canceladoTotal, pctNum: m.pctCancelado, cor: COR.cancel },
                  ].map(f => (
                    <div key={f.label} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ width: isMobile ? 130 : 190, fontSize: 13, color: "#1f2937", fontWeight: 700, flexShrink: 0 }}>{f.label}</div>
                      <div style={{ flex: 1, height: 34, background: "#f9fafb", borderRadius: 8, overflow: "hidden", position: "relative", border: "1px solid #e5e7eb" }}>
                        <div style={{ width: `${Math.max(3, f.pctNum)}%`, height: "100%", background: `linear-gradient(90deg, ${f.cor} 0%, ${f.cor}dd 100%)`, transition: "width 0.4s", display: "flex", alignItems: "center", paddingLeft: 10 }}>
                          <span style={{ color: "white", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>{formatNum(f.qtd)} ({f.pctNum}%)</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* sub-quebra dos cancelamentos */}
                <div style={{ maxWidth: 640, margin: "16px auto 0", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                  {[
                    { l: "Internas", qtd: m.cancInt, cor: COR.cancInt },
                    { l: "Externas", qtd: m.cancExt, cor: COR.cancExt },
                    { l: "Outras", qtd: m.cancOut, cor: "#9ca3af" },
                  ].map(c => (
                    <div key={c.l} style={{ background: `${c.cor}10`, border: `1px solid ${c.cor}30`, borderRadius: 10, padding: 10, textAlign: "center" }}>
                      <p style={{ color: c.cor, fontSize: 20, fontWeight: 800, margin: 0 }}>{formatNum(c.qtd)}</p>
                      <p style={{ color: "#6b7280", fontSize: 10, margin: "2px 0 0", fontWeight: 600 }}>Canc. {c.l}</p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ════════════ ABA: POR STATUS ════════════ */}
          {aba === "status" && (
            <div style={{ ...cardStyle, overflow: "hidden" }}>
              <div style={{ padding: "16px 20px", borderBottom: "1px solid #e5e7eb" }}>
                <h3 style={{ ...sectionTitleStyle, margin: 0 }}>
                  <span style={{ width: 32, height: 32, borderRadius: 8, background: "#eff6ff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>🏷️</span>
                  Cada status — quantas e quanto representa
                </h3>
              </div>
              {statusBreakdown.length === 0 ? (
                <p style={{ color: "#9ca3af", fontSize: 13, fontStyle: "italic", padding: 24, textAlign: "center" }}>Sem dados.</p>
              ) : (
                <div style={{ padding: isMobile ? 14 : 20, display: "flex", flexDirection: "column", gap: 10 }}>
                  {statusBreakdown.map(s => {
                    const catLabel = s.cat === "instalado" ? "✅ Instalada" : s.cat === "canc_interno" ? "❌ Canc. interna" : s.cat === "canc_externo" ? "🚫 Canc. externa" : s.cat === "canc_outro" ? "❌ Cancelada" : "🔄 Em andamento";
                    return (
                      <div key={s.status} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ width: isMobile ? 130 : 210, flexShrink: 0, minWidth: 0 }}>
                          <p style={{ color: "#1f2937", fontSize: 13, fontWeight: 700, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.status}</p>
                          <p style={{ color: s.cor, fontSize: 10, margin: "1px 0 0", fontWeight: 600 }}>{catLabel}</p>
                        </div>
                        <div style={{ flex: 1, height: 30, background: "#f9fafb", borderRadius: 8, overflow: "hidden", position: "relative", border: "1px solid #e5e7eb" }}>
                          <div style={{ width: `${Math.max(3, s.pct)}%`, height: "100%", background: `linear-gradient(90deg, ${s.cor} 0%, ${s.cor}dd 100%)`, display: "flex", alignItems: "center", paddingLeft: 10 }}>
                            <span style={{ color: "white", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>{formatNum(s.qtd)} ({s.pct}%)</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ════════════ ABA: VENDEDORES ════════════ */}
          {aba === "vendedores" && (
            <div style={{ ...cardStyle, overflow: "hidden" }}>
              <div style={{ padding: "16px 20px", borderBottom: "1px solid #e5e7eb" }}>
                <h3 style={{ ...sectionTitleStyle, margin: 0 }}>
                  <span style={{ width: 32, height: 32, borderRadius: 8, background: "#eff6ff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>👥</span>
                  Por vendedor — foco em instalação
                </h3>
              </div>
              {vendedoresStats.length === 0 ? (
                <p style={{ color: "#9ca3af", fontSize: 13, fontStyle: "italic", padding: 24, textAlign: "center" }}>Sem dados de vendedores.</p>
              ) : (
                <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: isMobile ? 760 : "auto" }}>
                    <thead>
                      <tr style={{ background: "#f9fafb" }}>
                        {["#", "Vendedor", "Entrou", "✅ Instalou", "Taxa Inst.", "❌ Interna", "🚫 Externa", "🔄 Andamento"].map(h => (
                          <th key={h} style={{ padding: "12px 14px", color: "#6b7280", fontSize: 11, textAlign: "left", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700, borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {vendedoresStats.map((v, i) => {
                        const corTaxa = v.taxaInstalacao >= 60 ? "#16a34a" : v.taxaInstalacao >= 30 ? "#f59e0b" : "#dc2626";
                        return (
                          <tr key={v.email} style={{ borderTop: "1px solid #f3f4f6", background: i % 2 === 0 ? "#ffffff" : "#fafbfc" }}>
                            <td style={{ padding: "14px", fontSize: 16 }}>{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : <span style={{ color: "#9ca3af", fontSize: 12 }}>#{i + 1}</span>}</td>
                            <td style={{ padding: "14px", color: "#1f2937", fontSize: 13, fontWeight: 700 }}>{v.nome}</td>
                            <td style={{ padding: "14px", color: "#2563eb", fontSize: 13, fontWeight: 700 }}>{v.total}</td>
                            <td style={{ padding: "14px" }}><span style={{ background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0", fontSize: 12, padding: "3px 10px", borderRadius: 10, fontWeight: 700 }}>{v.instalado}</span></td>
                            <td style={{ padding: "14px" }}><span style={{ background: `${corTaxa}15`, color: corTaxa, fontSize: 13, padding: "4px 12px", borderRadius: 10, fontWeight: 800 }}>{v.taxaInstalacao}%</span></td>
                            <td style={{ padding: "14px" }}><span style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", fontSize: 12, padding: "3px 10px", borderRadius: 10, fontWeight: 700 }}>{v.cancInt}</span></td>
                            <td style={{ padding: "14px" }}><span style={{ background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca", fontSize: 12, padding: "3px 10px", borderRadius: 10, fontWeight: 700 }}>{v.cancExt}</span></td>
                            <td style={{ padding: "14px", color: "#f59e0b", fontSize: 13, fontWeight: 700 }}>{v.andamento}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ════════════ ABA: DIMENSÕES ════════════ */}
          {aba === "dimensoes" && (
            <>
              <div style={{ ...cardStyle, padding: isMobile ? 14 : 18 }}>
                <p style={{ color: "#6b7280", fontSize: 12, margin: "0 0 12px", fontWeight: 600 }}>Quebra as instalações por qualquer campo de seleção. Escolha a categoria:</p>
                {dimensoesDisponiveis.length === 0 ? (
                  <p style={{ color: "#9ca3af", fontSize: 13, fontStyle: "italic" }}>Nenhum campo do tipo "Seleção" configurado.</p>
                ) : (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {dimensoesDisponiveis.map(dim => (
                      <button key={dim.slug} onClick={() => setDimensaoSel(dim.slug)} style={{ ...chipStyle, background: dimensaoSel === dim.slug ? "#8b5cf6" : "#ffffff", color: dimensaoSel === dim.slug ? "white" : "#6b7280", borderColor: dimensaoSel === dim.slug ? "#8b5cf6" : "#e5e7eb", fontWeight: dimensaoSel === dim.slug ? 700 : 600 }}>{dim.label}</button>
                    ))}
                  </div>
                )}
              </div>

              {dimensaoSel && breakdownDim.length > 0 && (
                <>
                  <div style={{ ...cardStyle, padding: isMobile ? 16 : 24 }}>
                    <h3 style={sectionTitleStyle}>
                      <span style={{ width: 32, height: 32, borderRadius: 8, background: "#f3e8ff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>🧩</span>
                      {camposMap.get(dimensaoSel)?.label} — entradas vs instalações
                    </h3>
                    <ResponsiveContainer width="100%" height={Math.min(360, breakdownDim.length * 38 + 40)}>
                      <BarChart data={breakdownDim.slice(0, 12).map(d => ({ ...d, nomeCurto: d.valor.length > 18 ? d.valor.slice(0, 16) + "…" : d.valor }))} layout="vertical" margin={{ top: 5, right: 20, left: 90, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                        <XAxis type="number" stroke="#6b7280" fontSize={10} allowDecimals={false} />
                        <YAxis dataKey="nomeCurto" type="category" stroke="#6b7280" fontSize={10} width={85} />
                        <Tooltip contentStyle={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 10, fontSize: 12 }} formatter={(v: any, n: string) => [formatNum(v), n === "instalado" ? "Instaladas" : n === "cancelado" ? "Canceladas" : "Em andamento"]} cursor={{ fill: "#f3f4f6" }} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="instalado" stackId="a" fill="#16a34a" name="Instaladas" />
                        <Bar dataKey="andamento" stackId="a" fill="#f59e0b" name="Em andamento" />
                        <Bar dataKey="cancelado" stackId="a" fill="#dc2626" name="Canceladas" radius={[0, 8, 8, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div style={{ ...cardStyle, overflow: "hidden" }}>
                    <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: isMobile ? 600 : "auto" }}>
                        <thead>
                          <tr style={{ background: "#f9fafb" }}>
                            {[camposMap.get(dimensaoSel)?.label || "Valor", "Entrou", "✅ Instalou", "Taxa Inst.", "❌ Cancelou", "🔄 Andamento"].map(h => (
                              <th key={h} style={{ padding: "12px 16px", color: "#6b7280", fontSize: 11, textAlign: "left", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700, borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {breakdownDim.map((d, i) => {
                            const corTaxa = d.taxaInstalacao >= 60 ? "#16a34a" : d.taxaInstalacao >= 30 ? "#f59e0b" : "#dc2626";
                            return (
                              <tr key={d.valor} style={{ borderTop: "1px solid #f3f4f6", background: i % 2 === 0 ? "#ffffff" : "#fafbfc" }}>
                                <td style={{ padding: "12px 16px", color: "#1f2937", fontSize: 13, fontWeight: 700 }}>{d.valor}</td>
                                <td style={{ padding: "12px 16px", color: "#2563eb", fontSize: 13, fontWeight: 700 }}>{d.qtd}</td>
                                <td style={{ padding: "12px 16px" }}><span style={{ background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0", fontSize: 12, padding: "3px 10px", borderRadius: 10, fontWeight: 700 }}>{d.instalado}</span></td>
                                <td style={{ padding: "12px 16px" }}><span style={{ background: `${corTaxa}15`, color: corTaxa, fontSize: 12, padding: "3px 10px", borderRadius: 10, fontWeight: 800 }}>{d.taxaInstalacao}%</span></td>
                                <td style={{ padding: "12px 16px" }}><span style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", fontSize: 12, padding: "3px 10px", borderRadius: 10, fontWeight: 700 }}>{d.cancelado}</span></td>
                                <td style={{ padding: "12px 16px", color: "#f59e0b", fontSize: 13, fontWeight: 600 }}>{d.andamento}</td>
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

          {/* ════════════ ABA: METAS DE INSTALAÇÃO ════════════ */}
          {aba === "metas" && (
            <>
              {metas.meta === 0 ? (
                <div style={{ ...cardStyle, padding: 40, textAlign: "center" }}>
                  <p style={{ fontSize: 36, margin: "0 0 8px" }}>🏆</p>
                  <h3 style={{ color: "#1f2937", fontSize: 16, fontWeight: 700, margin: "0 0 6px" }}>Defina sua meta de instalações</h3>
                  <p style={{ color: "#6b7280", fontSize: 13, margin: "0 0 16px" }}>Configure a meta de instalações do mês em ⚙️ Ajustar pra acompanhar o ritmo.</p>
                  <button onClick={() => setShowConfig(true)} style={{ background: "linear-gradient(135deg, #eab308 0%, #ca8a04 100%)", color: "white", border: "none", borderRadius: 10, padding: "10px 20px", fontSize: 13, cursor: "pointer", fontWeight: 700 }}>⚙️ Definir meta</button>
                </div>
              ) : (
                <div style={{ ...cardStyle, padding: isMobile ? 16 : 24 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexWrap: "wrap", gap: 8 }}>
                    <h3 style={{ ...sectionTitleStyle, margin: 0, textTransform: "capitalize" }}>
                      <span style={{ width: 32, height: 32, borderRadius: 8, background: "#fefce8", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>🏆</span>
                      Meta de instalações — {metas.mesLabel}
                    </h3>
                    <span style={{ color: "#6b7280", fontSize: 12, fontWeight: 600 }}>Dia {metas.diaAtual}/{metas.diasNoMes} · faltam {metas.diasRestantes}d · {metas.pctRitmo}% do mês</span>
                  </div>
                  <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 12, padding: 18, maxWidth: 560 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
                      <span style={{ color: "#1f2937", fontSize: 13, fontWeight: 700 }}>✅ Instalações</span>
                      <span style={{ color: metas.pctMeta >= 100 ? "#16a34a" : "#6b7280", fontSize: 22, fontWeight: 800 }}>{metas.pctMeta}%</span>
                    </div>
                    <div style={{ background: "#e5e7eb", borderRadius: 8, height: 16, overflow: "hidden", marginBottom: 6, position: "relative" }}>
                      <div style={{ background: metas.pctMeta >= 100 ? "linear-gradient(90deg,#16a34a,#22c55e)" : "linear-gradient(90deg,#eab308,#facc15)", width: `${Math.min(100, metas.pctMeta)}%`, height: "100%", transition: "width 0.4s" }} />
                      <div style={{ position: "absolute", top: -2, left: `${metas.pctRitmo}%`, width: 2, height: 20, background: "#6b7280" }} title="ritmo esperado" />
                    </div>
                    <p style={{ color: "#6b7280", fontSize: 12, margin: "0 0 12px" }}><b style={{ color: "#16a34a" }}>{metas.instaladasMes}</b> de <b>{metas.meta}</b> instalações</p>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <div style={{ background: "#ffffff", border: "1px solid #f3f4f6", borderRadius: 8, padding: 10 }}>
                        <p style={{ color: "#9ca3af", fontSize: 10, margin: 0, fontWeight: 600, textTransform: "uppercase" }}>Falta</p>
                        <p style={{ color: "#dc2626", fontSize: 18, fontWeight: 800, margin: "2px 0 0" }}>{metas.falta}</p>
                      </div>
                      <div style={{ background: "#ffffff", border: "1px solid #f3f4f6", borderRadius: 8, padding: 10 }}>
                        <p style={{ color: "#9ca3af", fontSize: 10, margin: 0, fontWeight: 600, textTransform: "uppercase" }}>Projeção</p>
                        <p style={{ color: metas.projecao >= metas.meta ? "#16a34a" : "#f59e0b", fontSize: 18, fontWeight: 800, margin: "2px 0 0" }}>{metas.projecao}</p>
                      </div>
                    </div>
                    <p style={{ color: metas.noRitmo ? "#16a34a" : "#dc2626", fontSize: 11, fontWeight: 700, margin: "10px 0 0", textAlign: "center" }}>{metas.noRitmo ? "✅ No ritmo pra bater a meta" : "⚠️ Abaixo do ritmo necessário"}</p>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ════════════ ABA: TEMPORAL ════════════ */}
          {aba === "temporal" && (
            <div style={{ ...cardStyle, padding: isMobile ? 16 : 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
                <h3 style={{ ...sectionTitleStyle, margin: 0 }}>
                  <span style={{ width: 32, height: 32, borderRadius: 8, background: "#f0fdf4", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>📈</span>
                  Entradas, instalações e cancelamentos ao longo do tempo
                </h3>
                <div style={{ display: "flex", gap: 4 }}>
                  {(["dia", "semana", "mes"] as const).map(mm => (
                    <button key={mm} onClick={() => setAgrupTempo(mm)} style={{ ...chipStyle, background: agrupTempo === mm ? "#eff6ff" : "#ffffff", color: agrupTempo === mm ? "#2563eb" : "#6b7280", borderColor: agrupTempo === mm ? "#2563eb" : "#e5e7eb", fontWeight: agrupTempo === mm ? 700 : 600 }}>{mm === "dia" ? "Diário" : mm === "semana" ? "Semanal" : "Mensal"}</button>
                  ))}
                </div>
              </div>
              <ResponsiveContainer width="100%" height={isMobile ? 240 : 300}>
                <LineChart data={serieTemporal} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="label" stroke="#6b7280" fontSize={10} interval="preserveStartEnd" />
                  <YAxis stroke="#6b7280" fontSize={10} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 10, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
                  <Line type="monotone" dataKey="entrou" stroke="#6366f1" strokeWidth={2} dot={false} name="Entraram" />
                  <Line type="monotone" dataKey="instalou" stroke="#16a34a" strokeWidth={2.5} dot={false} name="Instalaram" />
                  <Line type="monotone" dataKey="cancelou" stroke="#dc2626" strokeWidth={2} dot={false} name="Cancelaram" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* ════════════ ABA: HORÁRIOS ════════════ */}
          {aba === "horarios" && (
            <>
              <div style={{ ...cardStyle, padding: isMobile ? 16 : 24, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                <div style={{ width: 56, height: 56, borderRadius: 16, background: "linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, flexShrink: 0 }}>
                  <span style={{ filter: "saturate(0) brightness(2)" }}>🔥</span>
                </div>
                <div>
                  <p style={{ color: "#6b7280", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, margin: 0 }}>Horário de pico de entradas</p>
                  <p style={{ color: "#0d9488", fontSize: isMobile ? 18 : 22, fontWeight: 800, margin: "2px 0 0", letterSpacing: -0.3 }}>{picoHorario.qtd > 0 ? `${DIAS_SEMANA_LONGO[picoHorario.dia]} às ${picoHorario.hora}h` : "Sem dados"}</p>
                  <p style={{ color: "#9ca3af", fontSize: 12, margin: "2px 0 0" }}>{picoHorario.qtd > 0 ? `${picoHorario.qtd} entrada(s) nesse horário` : "—"}</p>
                </div>
              </div>

              <div style={{ ...cardStyle, padding: isMobile ? 14 : 24 }}>
                <h3 style={sectionTitleStyle}>
                  <span style={{ width: 32, height: 32, borderRadius: 8, background: "#ccfbf1", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>🗓️</span>
                  Mapa de calor — dia × hora (entradas)
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
                          return <div key={hi} title={`${dia} ${hi}h — ${qtd}`} style={{ aspectRatio: "1", borderRadius: 3, background: bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700, color: inten > 0.5 ? "#ffffff" : "#0d9488", minHeight: 18 }}>{qtd > 0 ? qtd : ""}</div>;
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 14 }}>
                <div style={{ ...cardStyle, padding: isMobile ? 16 : 20 }}>
                  <h3 style={{ ...sectionTitleStyle, fontSize: 14, margin: "0 0 14px" }}><span style={{ width: 28, height: 28, borderRadius: 8, background: "#ccfbf1", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>📅</span>Por dia da semana</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={porDiaSemana} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="dia" stroke="#6b7280" fontSize={11} />
                      <YAxis stroke="#6b7280" fontSize={11} allowDecimals={false} />
                      <Tooltip contentStyle={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 10, fontSize: 12 }} cursor={{ fill: "#f0fdfa" }} />
                      <Bar dataKey="qtd" fill="#14b8a6" radius={[8, 8, 0, 0]} name="Entradas" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ ...cardStyle, padding: isMobile ? 16 : 20 }}>
                  <h3 style={{ ...sectionTitleStyle, fontSize: 14, margin: "0 0 14px" }}><span style={{ width: 28, height: 28, borderRadius: 8, background: "#ccfbf1", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>⏰</span>Por hora do dia</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={porHora} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="hora" stroke="#6b7280" fontSize={8} interval={1} />
                      <YAxis stroke="#6b7280" fontSize={11} allowDecimals={false} />
                      <Tooltip contentStyle={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 10, fontSize: 12 }} cursor={{ fill: "#f0fdfa" }} />
                      <Bar dataKey="qtd" fill="#0d9488" radius={[6, 6, 0, 0]} name="Entradas" />
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
                  {([{ k: "recente", l: "📅 Recente" }, { k: "antiga", l: "🕰️ Antiga" }, { k: "nome_az", l: "🔤 Nome" }] as { k: OrdemLista; l: string }[]).map(o => (
                    <button key={o.k} onClick={() => setListaOrdem(o.k)} style={{ ...chipStyle, fontSize: 11, background: listaOrdem === o.k ? "#eef2ff" : "#f9fafb", color: listaOrdem === o.k ? "#6366f1" : "#6b7280", borderColor: listaOrdem === o.k ? "#6366f1" : "#e5e7eb", fontWeight: listaOrdem === o.k ? 700 : 600 }}>{o.l}</button>
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
                      <tr key={p.id} onClick={() => router.push("/crm/vendas")} style={{ borderTop: "1px solid #f3f4f6", background: i % 2 === 0 ? "#ffffff" : "#fafbfc", cursor: "pointer" }}
                        onMouseEnter={ev => ev.currentTarget.style.background = "#f3f4f6"}
                        onMouseLeave={ev => ev.currentTarget.style.background = i % 2 === 0 ? "#ffffff" : "#fafbfc"}>
                        {colunasLista.map(c => {
                          const txt = lerTexto(p, c) || "—";
                          return <td key={c.slug} style={{ padding: "12px 16px", color: "#1f2937", fontSize: 12, fontWeight: 500, whiteSpace: "nowrap", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis" }}>{txt}</td>;
                        })}
                        <td style={{ padding: "12px 16px", color: "#6b7280", fontSize: 12 }}>{nomeVendedor(p.vendedor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {listaTotalPag > 1 && (
                <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, padding: 14 }}>
                  <button onClick={() => setListaPagina(p => Math.max(1, p - 1))} disabled={listaPagina === 1} style={{ background: listaPagina === 1 ? "#f3f4f6" : "#ffffff", color: listaPagina === 1 ? "#9ca3af" : "#374151", border: "1px solid #e5e7eb", borderRadius: 10, padding: "8px 14px", fontSize: 12, cursor: listaPagina === 1 ? "not-allowed" : "pointer", fontWeight: 600 }}>← Anterior</button>
                  <span style={{ color: "#6b7280", fontSize: 13, padding: "0 12px", fontWeight: 600 }}>Pág. <b style={{ color: "#1f2937" }}>{listaPagina}</b> / <b style={{ color: "#1f2937" }}>{listaTotalPag}</b></span>
                  <button onClick={() => setListaPagina(p => Math.min(listaTotalPag, p + 1))} disabled={listaPagina === listaTotalPag} style={{ background: listaPagina === listaTotalPag ? "#f3f4f6" : "#ffffff", color: listaPagina === listaTotalPag ? "#9ca3af" : "#374151", border: "1px solid #e5e7eb", borderRadius: 10, padding: "8px 14px", fontSize: 12, cursor: listaPagina === listaTotalPag ? "not-allowed" : "pointer", fontWeight: 600 }}>Próxima →</button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}