"use client";
import { useState, useEffect, useRef, useMemo, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { usePermissao } from "../../hooks/usePermissao";
import { useEquipeFiltro } from "../../hooks/useEquipeFiltro";
import {
  STATUS_OPCOES,
  montarCamposUnificados,
  type CampoUnificado,
  type ConfigCampoPadrao,
  type CampoCustom,
} from "../../lib/campos_proposta_definicao";

// ═══════════════════════════════════════════════════════════════════════════
// 💰 VENDAS — UnitaSystem (single-tenant)
// ───────────────────────────────────────────────────────────────────────────
// Tabela mestra de propostas. Mantém o motor genérico do Wolf (colunas e
// modal lidos do Editor de Proposta), mas:
//   • Single-tenant: sem workspace_id em queries
//   • Cores: verde mantido só onde é semântica (R$, INSTALADA, ✓ Sim).
//     Identidade visual é AZUL UNITA
//   • Modo demo: gera 220 propostas mockadas se tabela vazia
//   • Real-time channel fixo "proposta_rt_unita"
// ═══════════════════════════════════════════════════════════════════════════

type Proposta = {
  id: number; created_at: string; data_proposta: string; nome: string;
  cpf?: string; rg?: string; data_nascimento?: string; nome_mae?: string;
  email?: string; endereco?: string; cep?: string; cidade?: string; estado?: string;
  telefone1?: string; telefone2?: string; telefone3?: string;
  vencimento?: string; forma_pagamento?: string;
  vendedor: string; valor_plano: number; status_venda: string;
  operadora: string; plano: string;
  data_agendamento?: string; periodo_instalacao?: string;
  data_instalacao?: string; data_cancelamento?: string;
  dados_customizados?: Record<string, any>;
  equipe_id?: string | null;
  criado_por?: string | null;
  equipe_id_criador?: number | string | null;
};
type Usuario = { email: string; nome: string; equipe_id?: string | null; fila_id?: number | string | null; };

// Cores semânticas dos status — mantêm padrão CRM (INSTALADA = verde, CANCELADA = vermelho)
const statusColor: Record<string, string> = {
  PENDENTE: "#f59e0b",
  "AGUARDANDO AUDITORIA": "#3b82f6",
  CANCELADA: "#dc2626",
  INSTALADA: "#16a34a",
  GERADA: "#8b5cf6",
  REPROVADA: "#ef4444",
};

// ═══ MOCK DATA pra modo demo ═══
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
const CIDADES_MOCK = ["Goiânia", "Anápolis", "Aparecida de Goiânia", "Senador Canedo", "Trindade"];
const ESTADOS_MOCK = ["GO", "GO", "GO", "GO", "GO"];

function gerarMockData(): Proposta[] {
  const propostas: Proposta[] = [];
  const agora = new Date();
  for (let i = 0; i < 220; i++) {
    const diasAtras = Math.floor(Math.random() * 120);
    const data = new Date(agora);
    data.setDate(data.getDate() - diasAtras);
    data.setHours(8 + Math.floor(Math.random() * 12), Math.floor(Math.random() * 60));
    const statusEscolhido = STATUS_MOCK[Math.floor(Math.random() * STATUS_MOCK.length)];
    const cidIdx = Math.floor(Math.random() * CIDADES_MOCK.length);
    propostas.push({
      id: i + 1,
      created_at: data.toISOString(),
      data_proposta: data.toISOString().slice(0, 10),
      nome: `Cliente ${String(i + 1).padStart(3, "0")}`,
      cpf: `${String(Math.floor(Math.random() * 900) + 100)}.${String(Math.floor(Math.random() * 900) + 100)}.${String(Math.floor(Math.random() * 900) + 100)}-${String(Math.floor(Math.random() * 90) + 10)}`,
      email: `cliente${i + 1}@email.com`,
      telefone1: `(62) 9${String(Math.floor(Math.random() * 9000) + 1000).slice(0,4)}-${String(Math.floor(Math.random() * 9000) + 1000)}`,
      cidade: CIDADES_MOCK[cidIdx],
      estado: ESTADOS_MOCK[cidIdx],
      vendedor: VENDEDORES_MOCK[Math.floor(Math.random() * VENDEDORES_MOCK.length)].email,
      valor_plano: 80 + Math.floor(Math.random() * 320),
      status_venda: statusEscolhido,
      operadora: OPERADORAS_MOCK[Math.floor(Math.random() * OPERADORAS_MOCK.length)],
      plano: PLANOS_MOCK[Math.floor(Math.random() * PLANOS_MOCK.length)],
      vencimento: String([5, 10, 15, 20, 25][Math.floor(Math.random() * 5)]),
      dados_customizados: {},
    });
  }
  return propostas.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

function camposMockTelecom(): CampoUnificado[] {
  return [
    { slug: "nome", label: "Nome", tipo: "texto", origem: "fixo", visivel: true, ordem: 1, opcoes: null, obrigatorio: true, larguraTotal: false } as any,
    { slug: "cpf", label: "CPF", tipo: "texto", origem: "fixo", visivel: true, ordem: 2, opcoes: null, obrigatorio: false } as any,
    { slug: "email", label: "E-mail", tipo: "email", origem: "fixo", visivel: true, ordem: 3, opcoes: null, obrigatorio: false } as any,
    { slug: "telefone1", label: "Telefone Principal", tipo: "telefone", origem: "fixo", visivel: true, ordem: 4, opcoes: null, obrigatorio: false } as any,
    { slug: "cidade", label: "Cidade", tipo: "texto", origem: "fixo", visivel: true, ordem: 5, opcoes: null, obrigatorio: false } as any,
    { slug: "estado", label: "Estado", tipo: "texto", origem: "fixo", visivel: true, ordem: 6, opcoes: null, obrigatorio: false } as any,
    { slug: "vendedor", label: "Vendedor", tipo: "vendedor", origem: "fixo", visivel: true, ordem: 7, opcoes: null, obrigatorio: true } as any,
    { slug: "operadora", label: "Operadora", tipo: "dropdown", origem: "fixo", visivel: true, ordem: 8, opcoes: OPERADORAS_MOCK, obrigatorio: false } as any,
    { slug: "plano", label: "Plano", tipo: "dropdown", origem: "fixo", visivel: true, ordem: 9, opcoes: PLANOS_MOCK, obrigatorio: false } as any,
    { slug: "valor_plano", label: "Valor", tipo: "moeda", origem: "fixo", visivel: true, ordem: 10, opcoes: null, obrigatorio: true } as any,
    { slug: "vencimento", label: "Vencimento", tipo: "dropdown", origem: "fixo", visivel: true, ordem: 11, opcoes: ["5", "10", "15", "20", "25"], obrigatorio: false } as any,
    { slug: "status_venda", label: "Status da Venda", tipo: "dropdown", origem: "fixo", visivel: true, ordem: 12, opcoes: ["GERADA", "AGUARDANDO AUDITORIA", "PENDENTE", "INSTALADA", "CANCELADA"], obrigatorio: true } as any,
    { slug: "data_proposta", label: "Data da Proposta", tipo: "data", origem: "fixo", visivel: true, ordem: 13, opcoes: null, obrigatorio: false } as any,
  ];
}

type AnexoMeta = { url: string; nome: string; tipo: string; tamanho: number; enviado_em: string };

const formatarTamanhoArquivo = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

const iconeArquivo = (tipo: string): string => {
  if (tipo?.startsWith("image/")) return "🖼️";
  if (tipo?.includes("pdf")) return "📄";
  if (tipo?.includes("word") || tipo?.includes("document")) return "📝";
  if (tipo?.includes("sheet") || tipo?.includes("excel")) return "📊";
  return "📎";
};

export default function Vendas() {
  const router = useRouter();
  const { isDono, perfil, permissoes } = usePermissao();
  const [propostas, setPropostas] = useState<Proposta[]>([]);
  const [loading, setLoading] = useState(true);
  const [modoDemo, setModoDemo] = useState(false);

  // 👥 Filtro por equipe (dropdown que aparece pro admin)
  const { equipeId, EquipeSelector, equipes } = useEquipeFiltro();

  const [busca, setBusca] = useState("");
  const [buscaDebounced, setBuscaDebounced] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [filtroDataInicio, setFiltroDataInicio] = useState("");
  const [filtroDataFim, setFiltroDataFim] = useState("");
  const [propostaVisualizando, setPropostaVisualizando] = useState<Proposta | null>(null);
  const [userEmail, setUserEmail] = useState<string>("");
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [filas, setFilas] = useState<{ id: any; nome: string }[]>([]);
  const [etiquetas, setEtiquetas] = useState<{ id: any; nome: string }[]>([]);

  const [camposUnificados, setCamposUnificados] = useState<CampoUnificado[]>([]);
  const [slugsNaLista, setSlugsNaLista] = useState<Set<string>>(new Set());

  // 🔎 Filtros dinâmicos por coluna (slug → valor)
  const [filtrosColuna, setFiltrosColuna] = useState<Record<string, string>>({});
  const [pagina, setPagina] = useState(1);

  // 📏 Refs pro scrollbar superior sincronizado com o de baixo
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const topScrollerRef = useRef<HTMLDivElement>(null);
  const tableInnerRef = useRef<HTMLTableElement>(null);
  const [topInnerWidth, setTopInnerWidth] = useState(0);
  const sincronizando = useRef(false);

  // ⬆️⬇️ Botões flutuantes — mostra "topo" só quando rolou um pouco
  const [scrollY, setScrollY] = useState(0);
  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // 📏 Mede a tabela pra dimensionar o scrollbar superior e ver se transborda
  const [tabelaTransborda, setTabelaTransborda] = useState(false);
  useEffect(() => {
    const medir = () => {
      if (tableContainerRef.current && tableInnerRef.current) {
        const innerW = tableInnerRef.current.offsetWidth;
        const containerW = tableContainerRef.current.offsetWidth;
        setTopInnerWidth(innerW);
        setTabelaTransborda(innerW > containerW + 1);
      }
    };
    medir();
    const t = setTimeout(medir, 50);
    window.addEventListener("resize", medir);
    return () => { clearTimeout(t); window.removeEventListener("resize", medir); };
  });

  // Modal edição
  const [showModal, setShowModal] = useState(false);
  const [propostaEditando, setPropostaEditando] = useState<Proposta | null>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const [dadosCustomizadosEdit, setDadosCustomizadosEdit] = useState<Record<string, any>>({});
  const [uploadandoEdit, setUploadandoEdit] = useState<Record<string, boolean>>({});
  const [salvando, setSalvando] = useState(false);

  const podeExcluir = isDono || perfil === "Administrador";
  const podeEditarCamposCustom = isDono || perfil === "Administrador";
  const podeVerTudo = isDono || perfil === "Administrador" || !!permissoes?.vendas_equipe;

  // 🔑 Recorte de visibilidade por FILA:
  //   • veTudo (super/admin/dono) → vê todas as propostas.
  //   • veEquipe ("ver vendas da equipe") → vê só os vendedores da PRÓPRIA FILA
  //     (cai pra própria EQUIPE/PDV se o usuário não tiver fila definida).
  //   • Sem nada disso → vê só as próprias.
  const veTudo = isDono || perfil === "Administrador" || !!permissoes?.vendas_todas;
  const veEquipe = !!permissoes?.vendas_equipe;
  // Map e-mail -> usuário (O(1)) — evita varrer a lista de usuários por linha (lento com 7,5k vendas)
  const usuariosMap = useMemo(() => {
    const m = new Map<string, Usuario>();
    for (const u of usuarios) if (u.email) m.set(u.email.toLowerCase(), u);
    return m;
  }, [usuarios]);
  const meuRegistro = usuariosMap.get(userEmail.toLowerCase());
  const minhaFila = meuRegistro?.fila_id ?? null;
  const minhaEquipe = meuRegistro?.equipe_id ?? null;
  const regDoVendedor = (emailVend: string) => usuariosMap.get((emailVend || "").toLowerCase());

  // 🎨 ESTILOS
  const inputStyle = {
    width: "100%", background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 10,
    padding: "9px 12px", color: "#1f2937", fontSize: 13, boxSizing: "border-box" as const,
    outline: "none", transition: "border-color 0.15s, box-shadow 0.15s",
  };
  const cardStyle = {
    background: "#ffffff",
    borderRadius: 14,
    border: "1px solid #e5e7eb",
    boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
  };

  const nomeVendedor = (v: string): string => {
    if (!v) return "—";
    const u = usuariosMap.get((v || "").toLowerCase());
    return u?.nome || v;
  };

  // Resolve id -> nome usando uma lista { id, nome } (cai pro próprio valor se não achar)
  const nomePorId = (lista: { id: any; nome: string }[], id: any): string => {
    const item = (lista || []).find(x => String(x.id) === String(id));
    return item?.nome || String(id);
  };

  // ═══ Renderização dinâmica de cada célula da tabela ═══
  const renderCelulaTabela = (c: CampoUnificado, v: Proposta): ReactNode => {
    const raw = c.origem === "fixo"
      ? (v as any)[c.slug]
      : v.dados_customizados?.[c.slug];

    // Estilizações especiais por slug
    if (c.slug === "status_venda") {
      const cor = statusColor[raw] || "#6b7280";
      return raw ? (
        <span style={{
          background: `${cor}15`, color: cor, border: `1px solid ${cor}40`,
          padding: "3px 10px", borderRadius: 10, fontSize: 10, fontWeight: 700, whiteSpace: "nowrap",
        }}>{raw}</span>
      ) : <span style={{ color: "#d1d5db" }}>—</span>;
    }
    if (c.slug === "valor_plano") {
      return (
        <span style={{ color: "#16a34a", fontSize: 13, fontWeight: 800, letterSpacing: -0.2, whiteSpace: "nowrap" }}>
          R$ {Number(raw || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      );
    }
    if (c.slug === "vendedor") {
      return <span style={{ color: "#4b5563", fontSize: 12 }}>{nomeVendedor(raw)}</span>;
    }
    if (c.slug === "nome") {
      return <span style={{ color: "#1f2937", fontSize: 13, fontWeight: 700 }}>{raw || <span style={{ color: "#d1d5db" }}>—</span>}</span>;
    }
    if (c.slug === "cpf") {
      return <span style={{ color: "#6b7280", fontSize: 12, fontFamily: "monospace" }}>{raw || <span style={{ color: "#d1d5db" }}>—</span>}</span>;
    }

    if (raw === undefined || raw === null || raw === "") {
      return <span style={{ color: "#d1d5db" }}>—</span>;
    }

    if (c.tipo === "data") {
      try {
        return <span style={{ color: "#6b7280", fontSize: 12, whiteSpace: "nowrap" }}>
          {new Date(raw + "T00:00:00").toLocaleDateString("pt-BR")}
        </span>;
      } catch { return <span style={{ color: "#4b5563", fontSize: 12 }}>{String(raw)}</span>; }
    }
    if (c.tipo === "moeda") {
      return <span style={{ color: "#4b5563", fontSize: 12, whiteSpace: "nowrap" }}>
        R$ {Number(raw).toFixed(2).replace(".", ",")}
      </span>;
    }
    if (c.tipo === "checkbox") {
      return <span style={{ color: raw === true ? "#16a34a" : "#9ca3af", fontSize: 12, fontWeight: 600 }}>
        {raw === true ? "✓ Sim" : "Não"}
      </span>;
    }
    if (c.slug === "vencimento") {
      return <span style={{ color: "#4b5563", fontSize: 12 }}>Dia {String(raw)}</span>;
    }

    // 🔤 Campos de seleção mostram o NOME, não o id cru (ex.: PDV/equipe = "UNITA GYN")
    if ((c.tipo as string) === "arquivo") {
      const n = Array.isArray(raw) ? raw.length : 0;
      return <span style={{ color: n ? "#2563eb" : "#d1d5db", fontSize: 12, fontWeight: 600 }}>{n ? `📎 ${n}` : "—"}</span>;
    }
    if (c.tipo === "equipe") {
      return <span style={{ color: "#4b5563", fontSize: 12 }}>{nomePorId(equipes as any, raw)}</span>;
    }
    if (c.tipo === "fila") {
      return <span style={{ color: "#4b5563", fontSize: 12 }}>{nomePorId(filas, raw)}</span>;
    }
    if (c.tipo === "etiqueta") {
      return <span style={{ color: "#4b5563", fontSize: 12 }}>{nomePorId(etiquetas, raw)}</span>;
    }
    if (c.tipo === "usuario") {
      return <span style={{ color: "#4b5563", fontSize: 12 }}>{nomeVendedor(String(raw))}</span>;
    }

    return <span style={{ color: "#4b5563", fontSize: 12 }}>{String(raw)}</span>;
  };

  // ═══ Filtro por coluna ═══
  const filtroInputStyle = {
    width: "100%",
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: 6,
    padding: "4px 8px",
    color: "#1f2937",
    fontSize: 11,
    boxSizing: "border-box" as const,
    outline: "none",
    fontWeight: 500,
  };

  const setarFiltroColuna = (slug: string, valor: string) => {
    setFiltrosColuna(prev => {
      const novo = { ...prev };
      if (!valor) delete novo[slug];
      else novo[slug] = valor;
      return novo;
    });
  };

  const renderFiltroColuna = (c: CampoUnificado): ReactNode => {
    const val = filtrosColuna[c.slug] ?? "";

    if (c.tipo === "data") {
      return <input type="date" value={val} onChange={e => setarFiltroColuna(c.slug, e.target.value)} style={filtroInputStyle} />;
    }

    if (c.tipo === "checkbox") {
      return (
        <select value={val} onChange={e => setarFiltroColuna(c.slug, e.target.value)} style={filtroInputStyle}>
          <option value="">Todos</option>
          <option value="sim">Sim</option>
          <option value="nao">Não</option>
        </select>
      );
    }

    // 🔄 Opções DINÂMICAS: vêm dos valores que existem de fato nas propostas (custom ou fixo).
    const distintos = opcoesPorColuna[c.slug] || [];
    if (distintos.length > 0 && distintos.length <= 150) {
      const rotulo = (op: string): string => {
        if (c.slug === "vendedor" || c.tipo === "vendedor" || (c.tipo as string) === "usuario") return nomeVendedor(op);
        if ((c.tipo as string) === "equipe") return nomePorId(equipes as any, op);
        if ((c.tipo as string) === "fila") return nomePorId(filas, op);
        if ((c.tipo as string) === "etiqueta") return nomePorId(etiquetas, op);
        if (c.slug === "vencimento") return `Dia ${op}`;
        return op;
      };
      return (
        <select value={val} onChange={e => setarFiltroColuna(c.slug, e.target.value)} style={filtroInputStyle}>
          <option value="">Todos</option>
          {distintos.map(op => <option key={op} value={op}>{rotulo(op)}</option>)}
        </select>
      );
    }

    // muitos valores distintos (nome, cpf, etc.) → busca por texto
    return <input placeholder="filtrar..." value={val} onChange={e => setarFiltroColuna(c.slug, e.target.value)} style={filtroInputStyle} />;
  };

  const passaFiltrosColuna = (p: Proposta): boolean => {
    for (const [slug, valor] of Object.entries(filtrosColuna)) {
      if (!valor) continue;
      const campo = camposUnificados.find(c => c.slug === slug);
      if (!campo) continue;

      const raw = campo.origem === "fixo"
        ? (p as any)[slug]
        : p.dados_customizados?.[slug];

      if (campo.tipo === "checkbox") {
        const esperado = valor === "sim";
        if (!!raw !== esperado) return false;
        continue;
      }

      if (campo.tipo === "dropdown" || campo.tipo === "vendedor" || slug === "vendedor") {
        if (String(raw ?? "") !== valor) return false;
        continue;
      }

      if (campo.tipo === "data") {
        if (String(raw ?? "") !== valor) return false;
        continue;
      }

      const txt = String(raw ?? "").toLowerCase();
      if (!txt.includes(valor.toLowerCase())) return false;
    }
    return true;
  };

  // ═══ FETCH (single-tenant — sem workspace_id) ═══
  const fetchPropostas = async (): Promise<boolean> => {
    const PAGE_SIZE = 1000;
    const MAX_PAGINAS = 60; // teto de segurança
    let lista: any[] = [];
    try {
      // Descobre o total e busca todas as páginas EM PARALELO (bem mais rápido que sequencial)
      const { count, error: errCount } = await supabase
        .from("proposta").select("id", { count: "exact", head: true });
      if (errCount) throw errCount;
      const total = Math.min(count || 0, PAGE_SIZE * MAX_PAGINAS);
      const nPaginas = Math.ceil(total / PAGE_SIZE);
      if (nPaginas > 0) {
        const reqs = [];
        for (let i = 0; i < nPaginas; i++) {
          reqs.push(
            supabase.from("proposta").select("*")
              .order("created_at", { ascending: false })
              .order("id", { ascending: false })
              .range(i * PAGE_SIZE, i * PAGE_SIZE + PAGE_SIZE - 1)
          );
        }
        const resultados = await Promise.all(reqs);
        for (const r of resultados) {
          if (r.error) throw r.error;
          lista = lista.concat(r.data || []);
        }
      }
    } catch {
      lista = [];
    }
    let usouMock = false;
    if (lista.length === 0) {
      usouMock = true;
      lista = gerarMockData();
    }
    setPropostas(lista);
    return usouMock;
  };

  const fetchUsuarios = async (usouMock: boolean) => {
    let lista: Usuario[] = [];
    try {
      const { data: us } = await supabase.from("usuarios").select("email, nome, equipe_id, fila_id");
      lista = (us || []) as Usuario[];
    } catch {
      // tabela não existe
    }
    if (lista.length === 0 && usouMock) {
      lista = VENDEDORES_MOCK;
    }
    setUsuarios(lista);
  };

  // Listas auxiliares pra traduzir id -> nome nas colunas (PDV/equipe, fila, etiqueta)
  const fetchListasAux = async () => {
    try {
      const [rf, re] = await Promise.all([
        supabase.from("filas").select("id, nome"),
        supabase.from("etiquetas").select("id, nome"),
      ]);
      setFilas((rf.data as any) || []);
      setEtiquetas((re.data as any) || []);
    } catch {
      /* tabelas podem não existir — segue sem tradução */
    }
  };

  const fetchCamposUnificados = async (usouMock: boolean) => {
    let configs: ConfigCampoPadrao[] = [];
    let customs: CampoCustom[] = [];
    let slugsListaSet = new Set<string>();
    try {
      const [respConfig, respCustom] = await Promise.all([
        supabase.from("proposta_campos_padrao_config").select("*"),
        supabase.from("proposta_campos_customizados").select("*").eq("ativo", true).order("ordem", { ascending: true }),
      ]);
      configs = (respConfig.data || []).map((c: any) => ({
        id: c.id, campo_slug: c.campo_slug, label_custom: c.label_custom,
        obrigatorio: c.obrigatorio, visivel: c.visivel, ordem: c.ordem,
        opcoes: Array.isArray(c.opcoes) ? c.opcoes : (typeof c.opcoes === "string" && c.opcoes ? JSON.parse(c.opcoes) : null),
        placeholder_custom: c.placeholder_custom,
      }));
      customs = (respCustom.data || []).map((c: any) => ({
        id: c.id, slug: c.slug, label: c.label, tipo: c.tipo,
        obrigatorio: c.obrigatorio, ordem: c.ordem,
        opcoes: Array.isArray(c.opcoes) ? c.opcoes : (typeof c.opcoes === "string" ? JSON.parse(c.opcoes) : []),
        placeholder: c.placeholder, ativo: c.ativo,
      }));

      for (const c of (respConfig.data || [])) {
        if (c.mostrar_na_lista) slugsListaSet.add(c.campo_slug);
      }
      for (const c of (respCustom.data || [])) {
        if (c.mostrar_na_lista) slugsListaSet.add(c.slug);
      }
    } catch {
      // tabelas não existem
    }
    setSlugsNaLista(slugsListaSet);

    let camposFinais = montarCamposUnificados(configs, customs).filter(c => c.visivel);
    if (camposFinais.length === 0 && usouMock) {
      camposFinais = camposMockTelecom();
    }
    setCamposUnificados(camposFinais);
  };

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      setUserEmail(user.email || "");

      const usouMock = await fetchPropostas();
      setModoDemo(usouMock);
      await fetchUsuarios(usouMock);
      await fetchListasAux();
      await fetchCamposUnificados(usouMock);
      setLoading(false);
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Real-time updates (channel fixo single-tenant)
  useEffect(() => {
    if (loading || modoDemo) return; // sem realtime em modo demo
    const ch = supabase.channel("proposta_rt_unita")
      .on("postgres_changes", { event: "*", schema: "public", table: "proposta" }, async () => { await fetchPropostas(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "usuarios" }, () => fetchUsuarios(false))
      .on("postgres_changes", { event: "*", schema: "public", table: "proposta_campos_customizados" }, () => fetchCamposUnificados(false))
      .on("postgres_changes", { event: "*", schema: "public", table: "proposta_campos_padrao_config" }, () => fetchCamposUnificados(false))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, modoDemo]);

  const abrirEditar = (p: Proposta) => {
    if (modoDemo) {
      alert("⚠️ Modo demonstração ativo. Edição desabilitada até a tabela 'proposta' ser criada.");
      return;
    }
    setPropostaEditando(p);
    setForm({ ...p });
    const dadosIniciais: Record<string, any> = {};
    for (const c of camposUnificados) {
      if (c.origem === "custom") {
        const v = p.dados_customizados?.[c.slug];
        dadosIniciais[c.slug] = v !== undefined ? v : (c.tipo === "checkbox" ? false : "");
      }
    }
    setDadosCustomizadosEdit(dadosIniciais);
    setShowModal(true);
  };

  const salvar = async () => {
    if (!propostaEditando) return;
    for (const c of camposUnificados) {
      if (!c.obrigatorio) continue;
      const v = c.origem === "fixo" ? form[c.slug] : dadosCustomizadosEdit[c.slug];
      const vazio = c.tipo === "checkbox" ? v !== true : (v === undefined || v === null || String(v).trim() === "");
      if (vazio) { alert(`O campo "${c.label}" é obrigatório.`); return; }
    }
    setSalvando(true);
    try {
      const { error } = await supabase.from("proposta").update({
        data_proposta: form.data_proposta, nome: form.nome, cpf: form.cpf, rg: form.rg,
        data_nascimento: form.data_nascimento, nome_mae: form.nome_mae, email: form.email,
        endereco: form.endereco, cep: form.cep, cidade: form.cidade, estado: form.estado,
        telefone1: form.telefone1, telefone2: form.telefone2, telefone3: form.telefone3,
        vencimento: form.vencimento, forma_pagamento: form.forma_pagamento, plano: form.plano,
        valor_plano: form.valor_plano ? Number(form.valor_plano) : null,
        data_agendamento: form.data_agendamento, periodo_instalacao: form.periodo_instalacao,
        vendedor: form.vendedor, status_venda: form.status_venda,
        data_instalacao: form.data_instalacao, data_cancelamento: form.data_cancelamento,
        operadora: form.operadora,
        dados_customizados: dadosCustomizadosEdit,
      })
        .eq("id", propostaEditando.id);
      if (error) { alert("Erro ao salvar: " + error.message); setSalvando(false); return; }
      await fetchPropostas();
      setShowModal(false);
      setPropostaEditando(null);
      alert("✅ Proposta atualizada!");
    } catch (e: any) { alert("Erro: " + e.message); }
    setSalvando(false);
  };

  const excluir = async (p: Proposta) => {
    if (modoDemo) {
      alert("⚠️ Modo demonstração ativo. Exclusão desabilitada.");
      return;
    }
    if (!podeExcluir) { alert("Você não tem permissão para excluir!"); return; }
    if (!confirm(`⚠️ Excluir a proposta de ${p.nome}?\n\nEsta ação NÃO pode ser desfeita.`)) return;
    try {
      const { error } = await supabase.from("proposta").delete().eq("id", p.id);
      if (error) { alert("Erro ao excluir: " + error.message); return; }
      await fetchPropostas();
      alert("✅ Proposta excluída!");
    } catch (e: any) { alert("Erro: " + e.message); }
  };

  // ═══ Renderização dinâmica de campos no modal ═══
  // ── Upload / remoção de anexos no modal de edição (bucket propostas-anexos) ──
  const uploadArquivoEdit = async (slug: string, files: FileList) => {
    setUploadandoEdit(prev => ({ ...prev, [slug]: true }));
    const novos: AnexoMeta[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > 20 * 1024 * 1024) { alert(`"${file.name}" excede 20 MB e foi pulado.`); continue; }
      try {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `vendas/${Date.now()}-${safeName}`;
        const { error } = await supabase.storage.from("propostas-anexos").upload(path, file, { cacheControl: "3600", upsert: false });
        if (error) { alert(`Erro ao enviar "${file.name}": ${error.message}`); continue; }
        const { data: urlData } = supabase.storage.from("propostas-anexos").getPublicUrl(path);
        novos.push({ url: urlData.publicUrl, nome: file.name, tipo: file.type || "application/octet-stream", tamanho: file.size, enviado_em: new Date().toISOString() });
      } catch (e: any) {
        console.error("Falha no upload:", e);
        alert(`Erro inesperado em "${file.name}".`);
      }
    }
    if (novos.length > 0) {
      setDadosCustomizadosEdit(prev => {
        const atuais = Array.isArray(prev[slug]) ? prev[slug] : [];
        return { ...prev, [slug]: [...atuais, ...novos] };
      });
    }
    setUploadandoEdit(prev => ({ ...prev, [slug]: false }));
  };

  const removerAnexoEdit = (slug: string, idx: number) => {
    setDadosCustomizadosEdit(prev => {
      const atuais = Array.isArray(prev[slug]) ? prev[slug] : [];
      return { ...prev, [slug]: atuais.filter((_: any, i: number) => i !== idx) };
    });
  };

  const renderCampoModal = (c: CampoUnificado) => {
    const labelComObr = (
      <>
        {c.label}
        {c.obrigatorio && <span style={{ color: "#dc2626", marginLeft: 4 }}>*</span>}
      </>
    );
    const lab = (
      <label style={{ color: "#6b7280", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 5, fontWeight: 700 }}>
        {labelComObr}
      </label>
    );

    if (c.origem === "fixo") {
      const val = form[c.slug] ?? "";
      const set = (v: any) => setForm({ ...form, [c.slug]: v });

      if (c.tipo === "vendedor") {
        return (
          <div>{lab}
            {podeVerTudo ? (
              <select value={val} onChange={e => set(e.target.value)} style={inputStyle}>
                <option value="">Selecione...</option>
                {usuarios.map(u => <option key={u.email} value={u.email}>{u.nome}</option>)}
                {val && !usuarios.find(u => u.email?.toLowerCase() === String(val).toLowerCase()) && (
                  <option value={val}>⚠️ {val} (legado)</option>
                )}
              </select>
            ) : (
              <input value={nomeVendedor(val)} disabled style={{ ...inputStyle, background: "#f3f4f6", color: "#6b7280", cursor: "not-allowed" }} />
            )}
          </div>
        );
      }

      if (c.tipo === "data") return <div>{lab}<input type="date" value={val || ""} onChange={e => set(e.target.value)} style={inputStyle} /></div>;
      if (c.tipo === "email") return <div>{lab}<input type="email" placeholder={c.placeholder || ""} value={val} onChange={e => set(e.target.value)} style={inputStyle} /></div>;
      if (c.tipo === "numero") return <div>{lab}<input type="number" placeholder={c.placeholder || ""} value={val} onChange={e => set(e.target.value)} style={inputStyle} /></div>;
      if (c.tipo === "moeda") return <div>{lab}<input type="number" step="0.01" placeholder={c.placeholder || ""} value={val} onChange={e => set(e.target.value)} style={inputStyle} /></div>;
      if (c.tipo === "telefone") return <div>{lab}<input type="tel" placeholder={c.placeholder || ""} value={val} onChange={e => set(e.target.value)} style={inputStyle} /></div>;
      if (c.tipo === "dropdown") {
        const prefixoVenc = c.slug === "vencimento";
        return (
          <div>{lab}
            <select value={val} onChange={e => set(e.target.value)} style={inputStyle}>
              <option value="">Selecione...</option>
              {(c.opcoes || []).map(op => <option key={op} value={op}>{prefixoVenc ? `Dia ${op}` : op}</option>)}
            </select>
          </div>
        );
      }
      return <div>{lab}<input placeholder={c.placeholder || ""} value={val} onChange={e => set(e.target.value)} style={inputStyle} /></div>;
    }

    // CUSTOM
    const val = dadosCustomizadosEdit[c.slug];
    const set = (v: any) => setDadosCustomizadosEdit(prev => ({ ...prev, [c.slug]: v }));

    if (c.tipo === "arquivo") {
      const arquivos: AnexoMeta[] = Array.isArray(val) ? val : [];
      const carregando = !!uploadandoEdit[c.slug];
      return (
        <div style={{ gridColumn: "1 / -1" }}>{lab}
          <label style={{
            display: "block", padding: "12px 14px", background: "#fafbfc",
            border: "2px dashed #93c5fd", borderRadius: 10,
            cursor: carregando ? "wait" : "pointer", textAlign: "center" as const,
          }}>
            <input type="file" multiple disabled={carregando} style={{ display: "none" }}
              onChange={(e) => { if (e.target.files && e.target.files.length > 0) { uploadArquivoEdit(c.slug, e.target.files); e.target.value = ""; } }} />
            <p style={{ color: carregando ? "#9ca3af" : "#2563eb", fontSize: 13, margin: 0, fontWeight: 700 }}>
              {carregando ? "Enviando..." : "Clique para anexar arquivos"}
            </p>
            <p style={{ color: "#9ca3af", fontSize: 11, margin: "4px 0 0" }}>Vários arquivos · até 20 MB cada</p>
          </label>
          {arquivos.length > 0 && (
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column" as const, gap: 6 }}>
              {arquivos.map((a, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 8 }}>
                  <span style={{ fontSize: 20 }}>{iconeArquivo(a.tipo)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ color: "#1f2937", fontSize: 12, margin: 0, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{a.nome}</p>
                    <p style={{ color: "#9ca3af", fontSize: 10, margin: "1px 0 0" }}>{formatarTamanhoArquivo(a.tamanho)}</p>
                  </div>
                  <a href={a.url} target="_blank" rel="noopener noreferrer" download style={{ color: "#2563eb", fontSize: 11, fontWeight: 600, textDecoration: "none", padding: "4px 10px", border: "1px solid #bfdbfe", borderRadius: 6 }}>Baixar</a>
                  <button type="button" onClick={() => removerAnexoEdit(c.slug, i)} style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", borderRadius: 6, padding: "4px 10px", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>Remover</button>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    if (c.tipo === "textarea") return <div>{lab}<textarea placeholder={c.placeholder || ""} value={val || ""} onChange={e => set(e.target.value)} rows={3} style={{ ...inputStyle, resize: "vertical" as const, fontFamily: "inherit" }} /></div>;
    if (c.tipo === "numero") return <div>{lab}<input type="number" placeholder={c.placeholder || ""} value={val || ""} onChange={e => set(e.target.value)} style={inputStyle} /></div>;
    if (c.tipo === "moeda") return <div>{lab}<input type="number" step="0.01" placeholder={c.placeholder || "0,00"} value={val || ""} onChange={e => set(e.target.value)} style={inputStyle} /></div>;
    if (c.tipo === "data") return <div>{lab}<input type="date" value={val || ""} onChange={e => set(e.target.value)} style={inputStyle} /></div>;
    if (c.tipo === "dropdown") return (
      <div>{lab}<select value={val || ""} onChange={e => set(e.target.value)} style={inputStyle}>
        <option value="">Selecione...</option>
        {(c.opcoes || []).map((op, i) => <option key={i} value={op}>{op}</option>)}
      </select></div>
    );
    if (c.tipo === "checkbox") {
      const marcado = val === true;
      return (
        <div>{lab}
          <label style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "9px 14px",
            background: marcado ? "#f0fdf4" : "#ffffff",
            borderRadius: 10,
            border: `1px solid ${marcado ? "#bbf7d0" : "#e5e7eb"}`,
            cursor: "pointer",
            transition: "all 0.15s",
          }}>
            <input type="checkbox" checked={marcado} onChange={e => set(e.target.checked)} style={{ accentColor: "#16a34a", width: 16, height: 16, cursor: "pointer" }} />
            <span style={{ color: marcado ? "#16a34a" : "#6b7280", fontSize: 13, fontWeight: 600 }}>{marcado ? "Sim" : "Não"}</span>
          </label>
        </div>
      );
    }
    return <div>{lab}<input placeholder={c.placeholder || ""} value={val || ""} onChange={e => set(e.target.value)} style={inputStyle} /></div>;
  };

  const propostasFiltradas = useMemo(() => propostas
    // 👁️ Recorte de visibilidade (vendedor vê só a própria fila):
    .filter(p => {
      if (veTudo) return true; // super/admin/dono vê tudo
      const minha = (p.vendedor && p.vendedor.toLowerCase() === userEmail.toLowerCase())
        || (p.criado_por && p.criado_por.toLowerCase() === userEmail.toLowerCase());
      if (minha) return true; // sempre vê as próprias
      if (veEquipe) {
        const rv = regDoVendedor(p.vendedor);
        if (minhaFila != null) return !!rv && String(rv.fila_id ?? "") === String(minhaFila);     // mesma FILA
        if (minhaEquipe != null) return !!rv && String(rv.equipe_id ?? "") === String(minhaEquipe); // mesma EQUIPE/PDV
      }
      return false;
    })
    // 🔒 O seletor de equipe (que vem do localStorage) só filtra quem vê tudo.
    // Compara equipe_id_criador (coluna que de fato é gravada) — equipe_id fica sempre NULL.
    .filter(p => !veTudo || !equipeId || String(p.equipe_id_criador ?? "") === String(equipeId))
    .filter(p => filtroStatus === "todos" || p.status_venda === filtroStatus)
    .filter(p => !buscaDebounced || p.nome?.toLowerCase().includes(buscaDebounced.toLowerCase()) || p.cpf?.includes(buscaDebounced) || nomeVendedor(p.vendedor).toLowerCase().includes(buscaDebounced.toLowerCase()))
    .filter(p => {
      if (!filtroDataInicio && !filtroDataFim) return true;
      const dt = p.data_proposta || "";
      if (filtroDataInicio && dt < filtroDataInicio) return false;
      if (filtroDataFim && dt > filtroDataFim) return false;
      return true;
    })
    .filter(p => passaFiltrosColuna(p)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [propostas, podeVerTudo, veTudo, veEquipe, minhaFila, minhaEquipe, userEmail, equipeId, filtroStatus, buscaDebounced, filtroDataInicio, filtroDataFim, filtrosColuna, usuarios, camposUnificados]
  );

  // 📊 Colunas a renderizar
  const COLUNAS_LEGADO = ["nome", "cpf", "vendedor", "plano", "valor_plano", "status_venda", "data_proposta"];
  const colunasTabela = slugsNaLista.size > 0
    ? camposUnificados.filter(c => slugsNaLista.has(c.slug))
    : camposUnificados.filter(c => COLUNAS_LEGADO.includes(c.slug));

  // Opções de filtro por coluna = valores distintos presentes nas propostas
  const opcoesPorColuna = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const c of camposUnificados) {
      if (c.tipo === "data" || c.tipo === "checkbox") continue;
      const set = new Set<string>();
      for (const p of propostas) {
        const raw = c.origem === "fixo" ? (p as any)[c.slug] : p.dados_customizados?.[c.slug];
        if (raw === null || raw === undefined || raw === "") continue;
        set.add(String(raw));
      }
      map[c.slug] = Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propostas, camposUnificados]);

  // Paginação: 50 por página
  const POR_PAGINA = 20;
  const totalPaginas = Math.max(1, Math.ceil(propostasFiltradas.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const propostasPagina = propostasFiltradas.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA);
  const btnPag = (off: boolean) => ({
    background: off ? "#f3f4f6" : "#ffffff", color: off ? "#9ca3af" : "#2563eb",
    border: "1px solid " + (off ? "#e5e7eb" : "#bfdbfe"),
    borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 600,
    cursor: off ? "default" : "pointer",
  } as const);

  // Debounce da busca: só filtra 250ms após parar de digitar (evita travar com milhares de linhas)
  useEffect(() => {
    const t = setTimeout(() => setBuscaDebounced(busca), 250);
    return () => clearTimeout(t);
  }, [busca]);

  // Volta pra página 1 quando qualquer filtro muda
  useEffect(() => { setPagina(1); }, [buscaDebounced, filtroStatus, filtrosColuna, filtroDataInicio, filtroDataFim, equipeId]);

  const totalVisivel = propostasFiltradas.length;
  const totalGeral = propostas.length;

  // 📊 KPIs rápidos
  const kpis = useMemo(() => {
    const instaladas = propostasFiltradas.filter(p => p.status_venda === "INSTALADA").length;
    const pendentes = propostasFiltradas.filter(p => p.status_venda === "PENDENTE" || p.status_venda === "AGUARDANDO AUDITORIA").length;
    const canceladas = propostasFiltradas.filter(p => p.status_venda === "CANCELADA" || p.status_venda === "REPROVADA").length;
    const ticketMedio = instaladas > 0
      ? propostasFiltradas.filter(p => p.status_venda === "INSTALADA").reduce((a, p) => a + (Number(p.valor_plano) || 0), 0) / instaladas
      : 0;
    const receita = propostasFiltradas
      .filter(p => p.status_venda === "INSTALADA")
      .reduce((a, p) => a + (Number(p.valor_plano) || 0), 0);
    return { instaladas, pendentes, canceladas, ticketMedio, receita };
  }, [propostasFiltradas]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>

      {/* ═══ MODAL EDITAR ═══ */}
      {showModal && propostaEditando && (
        <div onClick={() => { setShowModal(false); setPropostaEditando(null); }}
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", backdropFilter: "blur(4px)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{
              ...cardStyle,
              width: "100%", maxWidth: 860, maxHeight: "92vh",
              display: "flex", flexDirection: "column", overflow: "hidden",
              boxShadow: "0 20px 50px rgba(0,0,0,0.15), 0 10px 20px rgba(0,0,0,0.08)",
            }}>
            <div style={{ padding: "18px 24px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: "#eff6ff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>✏️</div>
                <h2 style={{ color: "#1f2937", fontSize: 17, fontWeight: 700, margin: 0 }}>Editar Proposta <span style={{ color: "#9ca3af", fontWeight: 500 }}>#{propostaEditando.id}</span></h2>
              </div>
              <button onClick={() => { setShowModal(false); setPropostaEditando(null); }}
                style={{ background: "#f3f4f6", border: "none", color: "#6b7280", fontSize: 16, cursor: "pointer", width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
            </div>

            <div style={{ padding: 24, overflowY: "auto", flex: 1 }}>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 12 }}>
                {camposUnificados.map(c => (
                  <div key={`${c.origem}-${c.slug}`} style={c.larguraTotal || c.tipo === "textarea" ? { gridColumn: "1 / -1" } : undefined}>
                    {renderCampoModal(c)}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", padding: "14px 24px", borderTop: "1px solid #e5e7eb", background: "#f9fafb" }}>
              <button onClick={() => { setShowModal(false); setPropostaEditando(null); }}
                style={{ background: "#ffffff", color: "#6b7280", border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 22px", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>
                Cancelar
              </button>
              <button onClick={salvar} disabled={salvando}
                style={{
                  background: salvando ? "#1e40af" : "linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)",
                  color: "white", border: "none", borderRadius: 10,
                  padding: "10px 28px", fontSize: 13, cursor: salvando ? "not-allowed" : "pointer", fontWeight: 700,
                  boxShadow: "0 4px 12px rgba(37,99,235,0.3)",
                }}>
                {salvando ? "⏳ Salvando..." : "💾 Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}

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
              Mostrando 220 propostas fictícias — crie a tabela <code style={{ background: "#dbeafe", padding: "1px 6px", borderRadius: 4, fontFamily: "monospace", fontSize: 11.5 }}>proposta</code> no Supabase pra começar a usar de verdade. Edição/exclusão estão desabilitadas.
            </p>
          </div>
        </div>
      )}

      {/* ═══ HEADER ═══ */}
      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: isMobile ? "stretch" : "center", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14,
            background: "linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 24, boxShadow: "0 8px 20px rgba(37,99,235,0.25)",
            flexShrink: 0,
          }}>
            <span style={{ filter: "saturate(0) brightness(2)" }}>💰</span>
          </div>
          <div>
            <h1 style={{ color: "#1f2937", fontSize: isMobile ? 20 : 24, fontWeight: 700, margin: 0, letterSpacing: -0.3 }}>Vendas</h1>
            <p style={{ color: "#6b7280", fontSize: 12, margin: "2px 0 0" }}>
              {podeVerTudo
                ? <><b style={{ color: "#2563eb" }}>{totalGeral}</b> proposta(s) cadastrada(s){totalVisivel !== totalGeral && <> · <b>{totalVisivel}</b> filtradas</>}</>
                : <><b style={{ color: "#2563eb" }}>{totalVisivel}</b> proposta(s) suas{totalGeral > totalVisivel ? <> · {totalGeral - totalVisivel} de outros vendedores ocultas</> : ""}</>}
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {podeVerTudo && <EquipeSelector />}

          {podeEditarCamposCustom && (
            <button onClick={() => router.push("/crm/editor-proposta")} title="Configurar campos da proposta"
              style={{
                flex: isMobile ? 1 : "0 0 auto",
                background: "#f3e8ff", color: "#a855f7", border: "1px solid #ddd6fe",
                borderRadius: 10, padding: "10px 18px", fontSize: 13,
                cursor: "pointer", fontWeight: 700, whiteSpace: "nowrap",
              }}>
              🛠️ Editar Campos
            </button>
          )}
          <button onClick={() => router.push("/crm/proposta")}
            style={{
              flex: isMobile ? 1 : "0 0 auto",
              background: "linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)",
              color: "white", border: "none", borderRadius: 10,
              padding: "10px 22px", fontSize: 13, cursor: "pointer", fontWeight: 700,
              whiteSpace: "nowrap", boxShadow: "0 4px 12px rgba(37,99,235,0.3)",
            }}>
            📋 Nova Proposta
          </button>
        </div>
      </div>

      {/* ═══ KPIs QUICK STATS ═══ */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(5, 1fr)", gap: isMobile ? 10 : 12 }}>
        <div style={{ ...cardStyle, padding: 14, borderTop: "3px solid #2563eb" }}>
          <p style={{ color: "#6b7280", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, margin: 0 }}>📊 Visíveis</p>
          <p style={{ color: "#2563eb", fontSize: 22, fontWeight: 800, margin: "4px 0 0", letterSpacing: -0.5 }}>{totalVisivel.toLocaleString("pt-BR")}</p>
        </div>
        <div style={{ ...cardStyle, padding: 14, borderTop: "3px solid #16a34a" }}>
          <p style={{ color: "#6b7280", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, margin: 0 }}>✅ Instaladas</p>
          <p style={{ color: "#16a34a", fontSize: 22, fontWeight: 800, margin: "4px 0 0", letterSpacing: -0.5 }}>{kpis.instaladas.toLocaleString("pt-BR")}</p>
        </div>
        <div style={{ ...cardStyle, padding: 14, borderTop: "3px solid #f59e0b" }}>
          <p style={{ color: "#6b7280", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, margin: 0 }}>⏳ Pendentes</p>
          <p style={{ color: "#f59e0b", fontSize: 22, fontWeight: 800, margin: "4px 0 0", letterSpacing: -0.5 }}>{kpis.pendentes.toLocaleString("pt-BR")}</p>
        </div>
        <div style={{ ...cardStyle, padding: 14, borderTop: "3px solid #dc2626" }}>
          <p style={{ color: "#6b7280", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, margin: 0 }}>❌ Canceladas</p>
          <p style={{ color: "#dc2626", fontSize: 22, fontWeight: 800, margin: "4px 0 0", letterSpacing: -0.5 }}>{kpis.canceladas.toLocaleString("pt-BR")}</p>
        </div>
        <div style={{ ...cardStyle, padding: 14, borderTop: "3px solid #06b6d4", gridColumn: isMobile ? "1 / -1" : undefined }}>
          <p style={{ color: "#6b7280", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, margin: 0 }}>💰 Receita Instaladas</p>
          <p style={{ color: "#16a34a", fontSize: 18, fontWeight: 800, margin: "4px 0 0", letterSpacing: -0.3 }}>
            R$ {kpis.receita.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </p>
          <p style={{ color: "#9ca3af", fontSize: 10, margin: "2px 0 0", fontWeight: 500 }}>
            ticket: R$ {kpis.ticketMedio.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </p>
        </div>
      </div>

      {/* ═══ FILTROS ═══ */}
      <div style={{ ...cardStyle, padding: 14, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <input placeholder="🔍 Buscar por nome, CPF, vendedor..." value={busca} onChange={e => setBusca(e.target.value)}
          style={{ ...inputStyle, maxWidth: 360, flex: "1 1 200px", borderRadius: 20 }} />
        <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} style={{ ...inputStyle, maxWidth: 220 }}>
          <option value="todos">Status: Todos</option>
          {STATUS_OPCOES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10, padding: "5px 12px" }}>
          <span style={{ color: "#6b7280", fontSize: 11, whiteSpace: "nowrap", fontWeight: 600 }}>📅 De:</span>
          <input type="date" value={filtroDataInicio} onChange={e => setFiltroDataInicio(e.target.value)} max={filtroDataFim || undefined}
            style={{ background: "transparent", border: "none", color: "#1f2937", fontSize: 12, padding: "5px 0", outline: "none", fontWeight: 600 }} />
          <span style={{ color: "#6b7280", fontSize: 11, whiteSpace: "nowrap", fontWeight: 600 }}>Até:</span>
          <input type="date" value={filtroDataFim} onChange={e => setFiltroDataFim(e.target.value)} min={filtroDataInicio || undefined}
            style={{ background: "transparent", border: "none", color: "#1f2937", fontSize: 12, padding: "5px 0", outline: "none", fontWeight: 600 }} />
        </div>
        {(busca || filtroStatus !== "todos" || filtroDataInicio || filtroDataFim || Object.keys(filtrosColuna).length > 0) && (
          <button onClick={() => { setBusca(""); setFiltroStatus("todos"); setFiltroDataInicio(""); setFiltroDataFim(""); setFiltrosColuna({}); }}
            style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", borderRadius: 10, padding: "8px 14px", fontSize: 12, cursor: "pointer", fontWeight: 700 }}>
            ✕ Limpar filtros
          </button>
        )}
      </div>

      {/* ═══ TABELA ═══ */}
      <div style={{ ...cardStyle, overflow: "hidden" }}>
        {tabelaTransborda && (
          <div ref={topScrollerRef}
            onScroll={() => {
              if (sincronizando.current) return;
              sincronizando.current = true;
              if (tableContainerRef.current && topScrollerRef.current) {
                tableContainerRef.current.scrollLeft = topScrollerRef.current.scrollLeft;
              }
              sincronizando.current = false;
            }}
            style={{
              overflowX: "auto", overflowY: "hidden",
              height: 14, borderBottom: "1px solid #f3f4f6",
            }}>
            <div style={{ width: topInnerWidth || "100%", height: 1 }} />
          </div>
        )}

        <div ref={tableContainerRef}
          onScroll={() => {
            if (sincronizando.current) return;
            sincronizando.current = true;
            if (tableContainerRef.current && topScrollerRef.current) {
              topScrollerRef.current.scrollLeft = tableContainerRef.current.scrollLeft;
            }
            sincronizando.current = false;
          }}
          style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
          <table ref={tableInnerRef}
            style={{ width: "100%", borderCollapse: "collapse", minWidth: isMobile ? 720 : "auto" }}>
            <thead>
              <tr style={{ background: "#f9fafb" }}>
                {colunasTabela.map(c => (
                  <th key={`th-${c.origem}-${c.slug}`}
                    style={{ padding: "12px 16px", color: "#6b7280", fontSize: 11, textAlign: "left", textTransform: "uppercase", letterSpacing: 0.5, whiteSpace: "nowrap", fontWeight: 700, borderBottom: "1px solid #e5e7eb" }}>
                    {c.label}
                  </th>
                ))}
                <th key="th-acoes"
                  style={{ padding: "12px 16px", color: "#6b7280", fontSize: 11, textAlign: "left", textTransform: "uppercase", letterSpacing: 0.5, whiteSpace: "nowrap", fontWeight: 700, borderBottom: "1px solid #e5e7eb" }}>
                  Ações
                </th>
              </tr>
              <tr style={{ background: "#fbfbfc" }}>
                {colunasTabela.map(c => (
                  <th key={`fil-${c.origem}-${c.slug}`}
                    style={{ padding: "6px 12px", borderBottom: "1px solid #e5e7eb" }}>
                    {renderFiltroColuna(c)}
                  </th>
                ))}
                <th key="fil-acoes" style={{ padding: "6px 12px", borderBottom: "1px solid #e5e7eb" }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={colunasTabela.length + 1} style={{ padding: 32, color: "#6b7280", textAlign: "center", fontSize: 13 }}>⏳ Carregando...</td></tr>
              ) : propostasFiltradas.length === 0 ? (
                <tr><td colSpan={colunasTabela.length + 1} style={{ padding: 48, textAlign: "center" }}>
                  <div style={{
                    width: 72, height: 72, borderRadius: 18,
                    background: "linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 36, margin: "0 auto 14px",
                    boxShadow: "0 12px 24px rgba(37,99,235,0.25)",
                  }}>
                    <span style={{ filter: "saturate(0) brightness(2)" }}>💰</span>
                  </div>
                  <p style={{ color: "#6b7280", fontSize: 13, margin: 0 }}>
                    {busca || filtroStatus !== "todos" ? "Nenhum resultado pros filtros" : podeVerTudo ? "Nenhuma proposta cadastrada ainda" : "Você ainda não cadastrou nenhuma proposta"}
                  </p>
                </td></tr>
              ) : propostasPagina.map((v, i) => {
                return (
                  <tr key={v.id}
                    style={{
                      borderTop: "1px solid #f3f4f6",
                      background: i % 2 === 0 ? "#ffffff" : "#fafbfc",
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "#f3f4f6"}
                    onMouseLeave={(e) => e.currentTarget.style.background = i % 2 === 0 ? "#ffffff" : "#fafbfc"}
                  >
                    {colunasTabela.map(c => (
                      <td key={`td-${c.origem}-${c.slug}`} style={{ padding: "12px 16px" }}>
                        {renderCelulaTabela(c, v)}
                      </td>
                    ))}
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => setPropostaVisualizando(v)} title="Visualizar"
                          style={{ background: "#ecfeff", color: "#0891b2", border: "1px solid #a5f3fc", borderRadius: 8, padding: "5px 11px", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>👁️</button>
                        <button onClick={() => abrirEditar(v)} title="Editar"
                          style={{ background: "#eff6ff", color: "#2563eb", border: "1px solid #bfdbfe", borderRadius: 8, padding: "5px 11px", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>✏️</button>
                        {podeExcluir && (
                          <button onClick={() => excluir(v)} title="Excluir"
                            style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", borderRadius: 8, padding: "5px 11px", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>🗑️</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {propostasFiltradas.length > POR_PAGINA && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 12, flexWrap: "wrap" as const }}>
          <span style={{ color: "#6b7280", fontSize: 12 }}>
            Mostrando {(paginaAtual - 1) * POR_PAGINA + 1}–{Math.min(paginaAtual * POR_PAGINA, propostasFiltradas.length)} de {propostasFiltradas.length.toLocaleString("pt-BR")}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button onClick={() => setPagina(1)} disabled={paginaAtual === 1} style={btnPag(paginaAtual === 1)}>« Primeira</button>
            <button onClick={() => setPagina(p => Math.max(1, p - 1))} disabled={paginaAtual === 1} style={btnPag(paginaAtual === 1)}>‹ Anterior</button>
            <span style={{ color: "#1f2937", fontSize: 12, fontWeight: 700, padding: "0 8px" }}>Página {paginaAtual} de {totalPaginas}</span>
            <button onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))} disabled={paginaAtual === totalPaginas} style={btnPag(paginaAtual === totalPaginas)}>Próxima ›</button>
            <button onClick={() => setPagina(totalPaginas)} disabled={paginaAtual === totalPaginas} style={btnPag(paginaAtual === totalPaginas)}>Última »</button>
          </div>
        </div>
      )}

      {/* Avisos rodapé */}
      {!podeExcluir && propostas.length > 0 && (
        <p style={{ color: "#9ca3af", fontSize: 11, fontStyle: "italic", margin: 0 }}>🔒 Apenas administradores podem excluir propostas.</p>
      )}
      {!podeVerTudo && (
        <p style={{ color: "#9ca3af", fontSize: 11, fontStyle: "italic", margin: 0 }}>👤 Você só vê suas próprias propostas. Pra ver as da equipe, peça ao admin para habilitar <b style={{ color: "#6b7280" }}>"Ver vendas da equipe"</b>.</p>
      )}

      {/* ═══ MODAL DE VISUALIZAÇÃO ═══ */}
      {propostaVisualizando && (
        <div onClick={() => setPropostaVisualizando(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", backdropFilter: "blur(4px)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{
              ...cardStyle,
              width: "100%", maxWidth: 760, maxHeight: "92vh",
              display: "flex", flexDirection: "column", overflow: "hidden",
              boxShadow: "0 20px 50px rgba(0,0,0,0.15), 0 10px 20px rgba(0,0,0,0.08)",
            }}>
            <div style={{ padding: "18px 24px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#ffffff" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: "#ecfeff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>👁️</div>
                <div>
                  <h2 style={{ color: "#1f2937", fontSize: 17, fontWeight: 700, margin: 0 }}>Detalhes da Proposta</h2>
                  <p style={{ color: "#6b7280", fontSize: 12, margin: "2px 0 0" }}>{propostaVisualizando.nome} <span style={{ color: "#d1d5db" }}>·</span> #{propostaVisualizando.id}</p>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => { const p = propostaVisualizando; setPropostaVisualizando(null); abrirEditar(p); }}
                  style={{
                    background: "linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)",
                    color: "white", border: "none", borderRadius: 10,
                    padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer",
                    boxShadow: "0 4px 12px rgba(37,99,235,0.3)",
                  }}>✏️ Editar</button>
                <button onClick={() => setPropostaVisualizando(null)}
                  style={{ background: "#f3f4f6", color: "#6b7280", border: "1px solid #e5e7eb", borderRadius: 10, padding: "8px 14px", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>✕ Fechar</button>
              </div>
            </div>

            <div style={{ padding: 24, overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 20 }}>
              {/* Destaques no topo */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
                <div style={{
                  background: "#f9fafb", borderRadius: 12, padding: 14,
                  border: "1px solid #e5e7eb",
                  borderLeft: `4px solid ${statusColor[propostaVisualizando.status_venda] || "#6b7280"}`,
                }}>
                  <p style={{ color: "#6b7280", fontSize: 10, margin: 0, textTransform: "uppercase", fontWeight: 700, letterSpacing: 0.5 }}>Status</p>
                  <p style={{ color: statusColor[propostaVisualizando.status_venda] || "#1f2937", fontSize: 14, margin: "5px 0 0", fontWeight: 700 }}>{propostaVisualizando.status_venda || "—"}</p>
                </div>
                <div style={{
                  background: "#f0fdf4", borderRadius: 12, padding: 14,
                  border: "1px solid #bbf7d0",
                  borderLeft: "4px solid #16a34a",
                }}>
                  <p style={{ color: "#15803d", fontSize: 10, margin: 0, textTransform: "uppercase", fontWeight: 700, letterSpacing: 0.5 }}>Valor</p>
                  <p style={{ color: "#16a34a", fontSize: 16, margin: "5px 0 0", fontWeight: 800, letterSpacing: -0.3 }}>R$ {Number(propostaVisualizando.valor_plano || 0).toFixed(2).replace(".", ",")}</p>
                </div>
                <div style={{
                  background: "#eff6ff", borderRadius: 12, padding: 14,
                  border: "1px solid #bfdbfe",
                  borderLeft: "4px solid #2563eb",
                }}>
                  <p style={{ color: "#1e40af", fontSize: 10, margin: 0, textTransform: "uppercase", fontWeight: 700, letterSpacing: 0.5 }}>Vendedor</p>
                  <p style={{ color: "#1e40af", fontSize: 14, margin: "5px 0 0", fontWeight: 700 }}>{nomeVendedor(propostaVisualizando.vendedor)}</p>
                </div>
              </div>

              <ViewSection
                titulo="📋 Informações"
                campos={camposUnificados
                  .filter(c => c.slug !== "status_venda" && c.slug !== "valor_plano" && c.slug !== "vendedor" && (c.tipo as string) !== "arquivo")
                  .map(c => {
                    let v = c.origem === "fixo" ? (propostaVisualizando as any)[c.slug] : propostaVisualizando.dados_customizados?.[c.slug];
                    if (c.tipo === "checkbox") v = v === true ? "Sim" : v === false ? "Não" : "";
                    else if (c.tipo === "moeda" && v) v = `R$ ${Number(v).toFixed(2).replace(".", ",")}`;
                    else if (c.tipo === "data" && v) v = new Date(v + "T00:00:00").toLocaleDateString("pt-BR");
                    else if (c.tipo === "vendedor" && v) v = nomeVendedor(v);
                    return [c.label, v] as [string, any];
                  })}
              />

              {camposUnificados.filter(c => (c.tipo as string) === "arquivo").map(c => {
                const arquivos: AnexoMeta[] = Array.isArray(propostaVisualizando.dados_customizados?.[c.slug])
                  ? propostaVisualizando.dados_customizados[c.slug] : [];
                return (
                  <div key={c.slug} style={{ marginTop: 18 }}>
                    <h3 style={{ color: "#6b7280", fontSize: 11, fontWeight: 700, margin: "0 0 10px", textTransform: "uppercase" as const, letterSpacing: 0.5 }}>{c.label}</h3>
                    {arquivos.length === 0 ? (
                      <p style={{ color: "#9ca3af", fontSize: 12, margin: 0, fontStyle: "italic" as const }}>Nenhum arquivo anexado</p>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column" as const, gap: 6 }}>
                        {arquivos.map((a, i) => (
                          <a key={i} href={a.url} target="_blank" rel="noopener noreferrer" download
                            style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8, textDecoration: "none" }}>
                            <span style={{ fontSize: 20 }}>{iconeArquivo(a.tipo)}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ color: "#1f2937", fontSize: 12, margin: 0, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{a.nome}</p>
                              <p style={{ color: "#9ca3af", fontSize: 10, margin: "1px 0 0" }}>{formatarTamanhoArquivo(a.tamanho)}</p>
                            </div>
                            <span style={{ color: "#2563eb", fontSize: 11, fontWeight: 700 }}>Baixar</span>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ═══ BOTÕES FLUTUANTES ↑↓ ═══ */}
      <div style={{
        position: "fixed", right: 16, bottom: 20, zIndex: 1500,
        display: "flex", flexDirection: "column", gap: 6,
      }}>
        {scrollY > 200 && (
          <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            title="Ir para o topo"
            style={{
              width: 42, height: 42, borderRadius: "50%",
              background: "linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)",
              color: "white", border: "none", cursor: "pointer", fontSize: 18,
              boxShadow: "0 6px 16px rgba(37,99,235,0.35)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 700,
            }}>↑</button>
        )}
        <button onClick={() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" })}
          title="Ir para o fim"
          style={{
            width: 42, height: 42, borderRadius: "50%",
            background: "#ffffff",
            color: "#2563eb", border: "1px solid #bfdbfe", cursor: "pointer", fontSize: 18,
            boxShadow: "0 6px 16px rgba(0,0,0,0.10)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 700,
          }}>↓</button>
      </div>
    </div>
  );
}

function ViewSection({ titulo, campos }: { titulo: string; campos: [string, any][] }) {
  const todosVazios = campos.every(([, v]) => !v && v !== false);
  return (
    <div>
      <h3 style={{ color: "#6b7280", fontSize: 11, fontWeight: 700, margin: "0 0 10px", textTransform: "uppercase", letterSpacing: 0.5 }}>{titulo}</h3>
      {todosVazios ? (
        <p style={{ color: "#9ca3af", fontSize: 12, margin: 0, fontStyle: "italic" }}>Nenhuma informação cadastrada</p>
      ) : (
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 14, background: "#f9fafb", padding: 16, borderRadius: 12,
          border: "1px solid #e5e7eb",
        }}>
          {campos.map(([label, valor]) => (
            <div key={label}>
              <p style={{ color: "#9ca3af", fontSize: 10, margin: 0, textTransform: "uppercase", letterSpacing: 0.3, fontWeight: 700 }}>{label}</p>
              <p style={{
                color: valor || valor === false ? "#1f2937" : "#d1d5db",
                fontSize: 13, margin: "3px 0 0", wordBreak: "break-word",
                fontWeight: valor || valor === false ? 600 : 400,
              }}>
                {valor !== "" && valor !== null && valor !== undefined ? String(valor) : "—"}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}