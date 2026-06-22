"use client";
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";
import { supabase } from "../../lib/supabase";
import { useEquipeFiltro } from "../../hooks/useEquipeFiltro";
import { usePermissao } from "../../hooks/usePermissao";

// ═══════════════════════════════════════════════════════════════════════
// DASHBOARD DE VENDAS — Grupo Unita (single-tenant)
// Foco em QUANTIDADE de vendas por status. Herói: anel de meta (350 instaladas).
// ═══════════════════════════════════════════════════════════════════════

type Proposta = {
  id: number; created_at: string; data_proposta?: string; nome: string;
  vendedor: string; valor_plano: number; status_venda: string;
  operadora: string; plano: string; equipe_id_criador?: number | null;
};
type Usuario = { email: string; nome: string };
type Periodo = "hoje" | "semana" | "mes" | "trimestre";
type Grupo =
  | "INSTALADA" | "AGUARDANDO_INST" | "BIOMETRIA" | "CANCELADA"
  | "CHURN" | "EXCLUIDA" | "A_CANCELAR" | "AUDITORIA" | "PENDENTE";

const META_INSTALADAS = 350; // meta mensal de instaladas

const normStatus = (s: any): string => String(s ?? "").trim().toUpperCase();

// Classificação confirmada pelo Robert
const STATUS_GRUPO: Record<string, Grupo> = {
  "INSTALADA": "INSTALADA",
  "AGUARDANDO INSTALAÇÃO": "AGUARDANDO_INST",
  "AGUARDANDO BIOMETRIA": "BIOMETRIA",
  "CANCELADA": "CANCELADA", "CANCELADA INTERNAMENTE": "CANCELADA",
  "CANCELADA EXTERNAMENTE": "CANCELADA", "REPROVADA": "CANCELADA",
  "CHURN": "CHURN",
  "EXCLUÍDA": "EXCLUIDA", "EXCLUIDA": "EXCLUIDA",
  "GROSS A CANCELAR": "A_CANCELAR",
  "AUDITADA": "AUDITORIA", "AGUARDANDO AUDITORIA": "AUDITORIA",
};
const grupoDe = (s: any): Grupo => STATUS_GRUPO[normStatus(s)] || "PENDENTE";

const GRUPO_META: Record<Grupo, { label: string; cor: string; bg: string; icone: string }> = {
  INSTALADA:       { label: "Instaladas (Gross)",    cor: "#059669", bg: "#ecfdf5", icone: "✅" },
  AGUARDANDO_INST: { label: "Aguardando instalação", cor: "#0284c7", bg: "#f0f9ff", icone: "🔧" },
  BIOMETRIA:       { label: "Aguardando biometria",  cor: "#6366f1", bg: "#eef2ff", icone: "🪪" },
  PENDENTE:        { label: "Pendentes",             cor: "#d97706", bg: "#fffbeb", icone: "⏳" },
  AUDITORIA:       { label: "Auditoria",             cor: "#0891b2", bg: "#ecfeff", icone: "🔍" },
  CANCELADA:       { label: "Canceladas",            cor: "#dc2626", bg: "#fef2f2", icone: "❌" },
  CHURN:           { label: "Churn",                 cor: "#9333ea", bg: "#faf5ff", icone: "📉" },
  EXCLUIDA:        { label: "Excluídas",             cor: "#78716c", bg: "#fafaf9", icone: "🗑️" },
  A_CANCELAR:      { label: "A cancelar",            cor: "#ea580c", bg: "#fff7ed", icone: "⚠️" },
};

// paleta
const T = {
  bg: "#f1f5f9", surface: "#ffffff", ink: "#0f172a", sub: "#64748b", faint: "#94a3b8",
  line: "#e2e8f0", soft: "#f8fafc",
  green: "#059669", greenLt: "#10b981", brand: "#4338ca", brand2: "#6366f1",
};

// ───── MOCK ────────────────────────────────────────────────────────────
const VENDEDORES_MOCK: Usuario[] = [
  { email: "ana.silva@grupounita.com.br", nome: "Ana Silva" },
  { email: "roberto.almeida@grupounita.com.br", nome: "Roberto Almeida" },
  { email: "carla.santos@grupounita.com.br", nome: "Carla Santos" },
  { email: "joao.pereira@grupounita.com.br", nome: "João Pereira" },
  { email: "mariana.costa@grupounita.com.br", nome: "Mariana Costa" },
];
const OPERADORAS_MOCK = ["Vivo", "Claro", "Tim", "Oi", "Sercomtel"];
const STATUS_MOCK = ["INSTALADA", "INSTALADA", "INSTALADA", "INSTALADA", "AGUARDANDO INSTALAÇÃO", "AGUARDANDO BIOMETRIA", "EM TRATATIVA", "CANCELADA EXTERNAMENTE", "CHURN", "AGUARDANDO AUDITORIA"];
function gerarMockData(): Proposta[] {
  const arr: Proposta[] = [];
  const agora = new Date();
  for (let i = 0; i < 200; i++) {
    const d = new Date(agora); d.setDate(d.getDate() - Math.floor(Math.random() * 90));
    d.setHours(Math.floor(Math.random() * 24), Math.floor(Math.random() * 60));
    arr.push({
      id: i + 1, created_at: d.toISOString(), data_proposta: d.toISOString(),
      nome: `Cliente ${String(i + 1).padStart(3, "0")}`,
      vendedor: VENDEDORES_MOCK[Math.floor(Math.random() * VENDEDORES_MOCK.length)].email,
      valor_plano: 80 + Math.floor(Math.random() * 320),
      status_venda: STATUS_MOCK[Math.floor(Math.random() * STATUS_MOCK.length)],
      operadora: OPERADORAS_MOCK[Math.floor(Math.random() * OPERADORAS_MOCK.length)],
      plano: "Fibra",
    });
  }
  return arr.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

// ───── ANEL DE META (SVG animado) ──────────────────────────────────────
function AnelMeta({ valor, meta, mobile }: { valor: number; meta: number; mobile: boolean }) {
  const size = mobile ? 170 : 210;
  const sw = mobile ? 16 : 20;
  const R = (size - sw) / 2 - 2;
  const C = 2 * Math.PI * R;
  const pct = Math.min(100, meta > 0 ? (valor / meta) * 100 : 0);
  const [anim, setAnim] = useState(0);
  useEffect(() => {
    const prefersReduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) { setAnim(pct); return; }
    let raf = 0; const t0 = performance.now(); const dur = 1100;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - k, 3);
      setAnim(pct * eased);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [pct]);
  const dash = (anim / 100) * C;
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <defs>
          <linearGradient id="anelGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#34d399" />
            <stop offset="100%" stopColor="#059669" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={R} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth={sw} />
        <circle cx={size / 2} cy={size / 2} r={R} fill="none" stroke="url(#anelGrad)" strokeWidth={sw}
          strokeLinecap="round" strokeDasharray={`${dash} ${C - dash}`} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: mobile ? 38 : 50, fontWeight: 800, color: "#fff", lineHeight: 1, letterSpacing: -1.5, fontVariantNumeric: "tabular-nums" }}>{valor}</span>
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", fontWeight: 600, marginTop: 4 }}>de {meta} instaladas</span>
        <span style={{ marginTop: 8, fontSize: 12.5, fontWeight: 800, color: "#fff", background: "rgba(255,255,255,0.16)", padding: "3px 12px", borderRadius: 999, fontVariantNumeric: "tabular-nums" }}>{pct.toFixed(0)}% da meta</span>
      </div>
    </div>
  );
}

// barra de progresso animada
function BarraProg({ pct, cor }: { pct: number; cor: string }) {
  const [w, setW] = useState(0);
  useEffect(() => {
    const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) { setW(pct); return; }
    const id = setTimeout(() => setW(pct), 80);
    return () => clearTimeout(id);
  }, [pct]);
  return (
    <div style={{ width: "100%", height: 10, background: "#e2e8f0", borderRadius: 6, overflow: "hidden" }}>
      <div style={{ width: `${w}%`, height: "100%", background: cor, borderRadius: 6, transition: "width 1s cubic-bezier(0.16,1,0.3,1)" }} />
    </div>
  );
}

export default function Dashboard() {
  const router = useRouter();
  const { equipeId, EquipeSelector } = useEquipeFiltro();
  const { isDono, isSuperAdmin, perfil } = usePermissao();
  const veTudo = isDono || isSuperAdmin || perfil === "Administrador";

  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [propostas, setPropostas] = useState<Proposta[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [userNome, setUserNome] = useState("");
  const [modoDemo, setModoDemo] = useState(false);
  const [rankingFlags, setRankingFlags] = useState<Record<string, boolean>>({});
  const [filtroRanking, setFiltroRanking] = useState("");
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const ck = () => setIsMobile(window.innerWidth < 768);
    ck(); window.addEventListener("resize", ck);
    return () => window.removeEventListener("resize", ck);
  }, []);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      let pr: Proposta[] = [], us2: Usuario[] = [], mock = false;
      try {
        const { data: us, error } = await supabase.from("usuarios").select("email, nome");
        if (error) throw error;
        if (us) { us2 = us; const meu = us.find(u => u.email === user.email); setUserNome(meu?.nome || user.email?.split("@")[0] || ""); }
      } catch { setUserNome(user.email?.split("@")[0] || ""); }
      try {
        const PAGE = 1000; let acc: any[] = [], off = 0;
        while (off < 600000) {
          const { data: pag, error } = await supabase.from("proposta").select("*").order("created_at", { ascending: false }).range(off, off + PAGE - 1);
          if (error) throw error;
          if (!pag || pag.length === 0) break;
          acc = acc.concat(pag);
          if (pag.length < PAGE) break;
          off += PAGE;
        }
        pr = acc;
      } catch { mock = true; }
      if (pr.length === 0) { mock = true; pr = gerarMockData(); us2 = VENDEDORES_MOCK; }
      try {
        const { data: rp } = await supabase.from("ranking_publico").select("vendedor, mostrar");
        if (rp) { const m: Record<string, boolean> = {}; for (const r of rp) m[r.vendedor] = !!r.mostrar; setRankingFlags(m); }
      } catch { /* tabela ainda não existe */ }
      setPropostas(pr); setUsuarios(us2); setModoDemo(mock); setLoading(false);
    };
    init();
  }, [router]);

  const chavesPublicas = useMemo(() => new Set(Object.keys(rankingFlags).filter(k => rankingFlags[k])), [rankingFlags]);

  const propostasVisiveis = useMemo(() => {
    let base = propostas;
    if (!modoDemo) {
      if (!veTudo) base = base.filter(p => p.vendedor && chavesPublicas.has(p.vendedor));
      if (equipeId) base = base.filter(p => String(p.equipe_id_criador ?? "") === String(equipeId));
    }
    return base;
  }, [propostas, veTudo, chavesPublicas, equipeId, modoDemo]);

  const nomeVendedor = (email: string): string => {
    if (!email) return "—";
    const u = usuarios.find(x => x.email?.toLowerCase() === email?.toLowerCase());
    return u?.nome || email.split("@")[0];
  };

  const todosVendedores = useMemo(() => {
    const nomeDe = (v: string) => { const u = usuarios.find(x => x.email?.toLowerCase() === v?.toLowerCase()); return u?.nome || (v.includes("@") ? v.split("@")[0] : v); };
    const map = new Map<string, string>();
    for (const p of propostas) if (p.vendedor && !map.has(p.vendedor)) map.set(p.vendedor, nomeDe(p.vendedor));
    for (const u of usuarios) if (u.email && !map.has(u.email)) map.set(u.email, u.nome || u.email);
    return [...map.entries()].map(([key, nome]) => ({ key, nome })).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [propostas, usuarios]);

  const toggleRanking = async (vendedor: string, atual: boolean) => {
    setRankingFlags(prev => ({ ...prev, [vendedor]: !atual }));
    try { const { error } = await supabase.from("ranking_publico").upsert({ vendedor, mostrar: !atual }, { onConflict: "vendedor" }); if (error) throw error; }
    catch (e) { setRankingFlags(prev => ({ ...prev, [vendedor]: atual })); console.error(e); }
  };
  const marcarTodos = async (valor: boolean) => {
    const rows = todosVendedores.map(v => ({ vendedor: v.key, mostrar: valor }));
    setRankingFlags(Object.fromEntries(rows.map(r => [r.vendedor, valor])));
    try { const { error } = await supabase.from("ranking_publico").upsert(rows, { onConflict: "vendedor" }); if (error) throw error; }
    catch (e) { console.error(e); }
  };

  const saudacao = useMemo(() => { const h = new Date().getHours(); return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite"; }, []);

  const filtrarPorPeriodo = (lista: Proposta[], p: Periodo): Proposta[] => {
    const agora = new Date();
    return lista.filter(prop => {
      const data = new Date(prop.created_at);
      if (p === "hoje") return data.toDateString() === agora.toDateString();
      if (p === "semana") { const diff = (agora.getTime() - data.getTime()) / 86400000; return diff <= 7 && diff >= 0; }
      if (p === "mes") return data.getMonth() === agora.getMonth() && data.getFullYear() === agora.getFullYear();
      return Math.floor(agora.getMonth() / 3) === Math.floor(data.getMonth() / 3) && data.getFullYear() === agora.getFullYear();
    });
  };
  const periodoAnterior = (lista: Proposta[], p: Periodo): Proposta[] => {
    const agora = new Date();
    return lista.filter(prop => {
      const data = new Date(prop.created_at);
      if (p === "hoje") { const o = new Date(agora); o.setDate(o.getDate() - 1); return data.toDateString() === o.toDateString(); }
      if (p === "semana") { const diff = (agora.getTime() - data.getTime()) / 86400000; return diff > 7 && diff <= 14; }
      if (p === "mes") { const m = agora.getMonth() === 0 ? 11 : agora.getMonth() - 1; const a = agora.getMonth() === 0 ? agora.getFullYear() - 1 : agora.getFullYear(); return data.getMonth() === m && data.getFullYear() === a; }
      return false;
    });
  };

  const pf = useMemo(() => filtrarPorPeriodo(propostasVisiveis, periodo), [propostasVisiveis, periodo]);
  const pAnt = useMemo(() => periodoAnterior(propostasVisiveis, periodo), [propostasVisiveis, periodo]);

  const contaGrupos = (lista: Proposta[]): Record<Grupo, number> => {
    const c: Record<Grupo, number> = { INSTALADA: 0, AGUARDANDO_INST: 0, BIOMETRIA: 0, CANCELADA: 0, CHURN: 0, EXCLUIDA: 0, A_CANCELAR: 0, AUDITORIA: 0, PENDENTE: 0 };
    for (const p of lista) c[grupoDe(p.status_venda)]++;
    return c;
  };
  const contaStatus = (lista: Proposta[]): Record<string, number> => {
    const c: Record<string, number> = {};
    for (const p of lista) { const s = normStatus(p.status_venda); c[s] = (c[s] || 0) + 1; }
    return c;
  };

  const stats = useMemo(() => {
    const g = contaGrupos(pf), s = contaStatus(pf), total = pf.length;
    const vendedoresAtivos = new Set(pf.filter(p => p.vendedor).map(p => p.vendedor)).size;
    const taxaInstalacao = total > 0 ? (g.INSTALADA / total) * 100 : 0;
    return { g, s, total, vendedoresAtivos, taxaInstalacao };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pf]);
  const statsAnt = useMemo(() => {
    const g = contaGrupos(pAnt), s = contaStatus(pAnt);
    return { g, s, total: pAnt.length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pAnt]);

  const trend = (atual: number, anterior: number) => {
    if (anterior === 0) return { val: atual > 0 ? 100 : 0, up: atual > 0 };
    const diff = ((atual - anterior) / anterior) * 100;
    return { val: Math.abs(diff), up: diff >= 0 };
  };

  const rankingVendedores = useMemo(() => {
    const acc: Record<string, { inst: number; aguard: number }> = {};
    for (const p of pf) {
      if (!p.vendedor) continue;
      const g = grupoDe(p.status_venda);
      if (g !== "INSTALADA" && g !== "AGUARDANDO_INST") continue;
      if (!acc[p.vendedor]) acc[p.vendedor] = { inst: 0, aguard: 0 };
      if (g === "INSTALADA") acc[p.vendedor].inst++; else acc[p.vendedor].aguard++;
    }
    return Object.entries(acc).map(([k, v]) => {
      const nome = nomeVendedor(k); const partes = nome.trim().split(/\s+/);
      const nomeCurto = partes.length > 1 ? `${partes[0]} ${partes[1].charAt(0)}.` : partes[0];
      return { nome, nomeCurto, instaladas: v.inst, aguardando: v.aguard, key: k };
    }).sort((a, b) => b.instaladas - a.instaladas || b.aguardando - a.aguardando);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pf, usuarios]);

  const funilVendedores = useMemo(() => {
    const acc: Record<string, Record<Grupo, number>> = {};
    for (const p of pf) {
      if (!p.vendedor) continue;
      if (!acc[p.vendedor]) acc[p.vendedor] = { INSTALADA: 0, AGUARDANDO_INST: 0, BIOMETRIA: 0, CANCELADA: 0, CHURN: 0, EXCLUIDA: 0, A_CANCELAR: 0, AUDITORIA: 0, PENDENTE: 0 };
      acc[p.vendedor][grupoDe(p.status_venda)]++;
    }
    return Object.entries(acc).map(([k, v]) => ({ vendedor: nomeVendedor(k), ...v })).sort((a, b) => b.INSTALADA - a.INSTALADA);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pf, usuarios]);

  const distData = useMemo(() => (Object.keys(stats.g) as Grupo[])
    .map(g => ({ name: GRUPO_META[g].label, value: stats.g[g], color: GRUPO_META[g].cor }))
    .filter(x => x.value > 0).sort((a, b) => b.value - a.value), [stats]);

  const operadorasData = useMemo(() => {
    const counts: Record<string, number> = {};
    pf.forEach(p => { if (p.operadora) counts[p.operadora] = (counts[p.operadora] || 0) + 1; });
    const cores = ["#4338ca", "#6366f1", "#818cf8", "#a5b4fc", "#c7d2fe"];
    return Object.entries(counts).map(([nome, value], i) => ({ name: nome, value, color: cores[i % cores.length] })).sort((a, b) => b.value - a.value);
  }, [pf]);

  const vendasPorDia = useMemo(() => {
    const dias: Record<string, number> = {}, aguard: Record<string, number> = {};
    const agora = new Date();
    for (let i = 29; i >= 0; i--) { const d = new Date(agora); d.setDate(d.getDate() - i); const k = d.toISOString().slice(0, 10); dias[k] = 0; aguard[k] = 0; }
    propostasVisiveis.forEach(p => {
      const g = grupoDe(p.status_venda);
      if (g !== "INSTALADA" && g !== "AGUARDANDO_INST") return;
      const k = (p.created_at || "").slice(0, 10);
      if (dias[k] === undefined) return;
      if (g === "INSTALADA") dias[k]++; else aguard[k]++;
    });
    return Object.entries(dias).map(([data, instaladas]) => {
      const d = new Date(data + "T12:00:00");
      return { data: `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}`, instaladas, aguardando: aguard[data] || 0 };
    });
  }, [propostasVisiveis]);

  const atividadeRecente = propostasVisiveis.slice(0, 6);

  const periodoLabel: Record<Periodo, string> = { hoje: "Hoje", semana: "Esta Semana", mes: "Este Mês", trimestre: "Este Trimestre" };

  const surface = { background: T.surface, borderRadius: 18, border: `1px solid ${T.line}`, boxShadow: "0 1px 2px rgba(15,23,42,0.03), 0 6px 20px rgba(15,23,42,0.05)" };
  const eyebrow = { color: T.faint, fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: 0.6, margin: 0 };
  const numStyle = { fontVariantNumeric: "tabular-nums" as const };

  if (loading) {
    return (
      <div style={{ minHeight: "70vh", display: "flex", alignItems: "center", justifyContent: "center", background: T.bg }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 36, height: 36, border: "3px solid #e2e8f0", borderTopColor: T.green, borderRadius: "50%", margin: "0 auto 14px", animation: "spin 0.7s linear infinite" }} />
          <p style={{ color: T.sub, fontSize: 14, margin: 0 }}>Carregando dashboard...</p>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      </div>
    );
  }

  const instaladas = stats.g.INSTALADA;
  const aguardInst = stats.g.AGUARDANDO_INST;
  const pctMeta = Math.min(100, (instaladas / META_INSTALADAS) * 100);
  const faltam = Math.max(0, META_INSTALADAS - instaladas);
  const tInst = trend(instaladas, statsAnt.g.INSTALADA);

  // KPIs secundários (faixa ao lado do anel)
  const kpisHero = [
    { label: "Aguardando instalação", value: aguardInst, cor: GRUPO_META.AGUARDANDO_INST.cor, icone: "🔧", hint: "podem virar instaladas" },
    { label: "Aguardando biometria", value: stats.g.BIOMETRIA, cor: GRUPO_META.BIOMETRIA.cor, icone: "🪪", hint: "" },
    { label: "Pendentes", value: stats.g.PENDENTE, cor: GRUPO_META.PENDENTE.cor, icone: "⏳", hint: "em tratativa" },
    { label: "Vendedores ativos", value: stats.vendedoresAtivos, cor: T.brand, icone: "👥", hint: "no período" },
  ];

  return (
    <div style={{ background: T.bg, margin: isMobile ? -14 : -20, padding: isMobile ? 14 : 22, minHeight: "100vh" }}>
      <style>{`
        @keyframes fadeUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes spin { to { transform: rotate(360deg); } }
        .fu { animation: fadeUp 0.55s cubic-bezier(0.16,1,0.3,1) backwards; }
        .pbtn { padding: 9px 15px; border-radius: 11px; border: 1px solid ${T.line}; background: #fff; color: ${T.sub}; font-size: 12.5px; font-weight: 600; cursor: pointer; transition: all .15s; }
        .pbtn:hover { border-color: #cbd5e1; color: ${T.ink}; }
        .pbtn.on { background: ${T.ink}; color: #fff; border-color: ${T.ink}; }
        .lift { transition: transform .18s ease, box-shadow .18s ease; }
        .lift:hover { transform: translateY(-3px); box-shadow: 0 12px 28px rgba(15,23,42,0.10) !important; }
      `}</style>

      <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 14 : 18, maxWidth: 1400, margin: "0 auto" }}>

        {/* DEMO */}
        {modoDemo && (
          <div className="fu" style={{ background: "#fff", border: `1px solid ${T.line}`, borderLeft: `4px solid ${T.brand}`, borderRadius: 12, padding: "12px 18px", display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 20 }}>💡</span>
            <p style={{ color: T.sub, fontSize: 12.5, margin: 0 }}>Modo demonstração — mostrando dados fictícios (a tabela <code style={{ background: T.soft, padding: "1px 6px", borderRadius: 4 }}>proposta</code> está vazia).</p>
          </div>
        )}

        {/* HEADER */}
        <div className="fu" style={{ display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: isMobile ? "stretch" : "flex-end", gap: 14 }}>
          <div>
            <p style={{ ...eyebrow, color: T.green }}>{saudacao}, {userNome || "atendente"}</p>
            <h1 style={{ color: T.ink, fontSize: isMobile ? 24 : 32, fontWeight: 800, margin: "4px 0 0", letterSpacing: -1 }}>Painel de Vendas</h1>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <EquipeSelector />
            {([{ key: "hoje", label: "Hoje" }, { key: "semana", label: "Semana" }, { key: "mes", label: "Mês" }, { key: "trimestre", label: "Trimestre" }] as { key: Periodo; label: string }[]).map(f => (
              <button key={f.key} onClick={() => setPeriodo(f.key)} className={`pbtn ${periodo === f.key ? "on" : ""}`}>{f.label}</button>
            ))}
          </div>
        </div>

        {/* ═══ HERÓI: META (anel) + KPIs secundários ═══ */}
        <div className="fu" style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(340px, 1fr) 1.3fr", gap: isMobile ? 14 : 18 }}>
          {/* Anel de meta sobre fundo escuro esmeralda */}
          <div style={{ borderRadius: 20, padding: isMobile ? 22 : 28, background: "linear-gradient(140deg, #064e3b 0%, #065f46 55%, #047857 100%)", boxShadow: "0 10px 30px rgba(6,78,59,0.35)", display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: "center", gap: isMobile ? 18 : 24, position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: -40, right: -40, width: 160, height: 160, borderRadius: "50%", background: "rgba(52,211,153,0.15)" }} />
            <AnelMeta valor={instaladas} meta={META_INSTALADAS} mobile={isMobile} />
            <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
              <p style={{ ...eyebrow, color: "rgba(255,255,255,0.65)" }}>Meta do mês · instaladas</p>
              <p style={{ color: "#fff", fontSize: isMobile ? 15 : 17, fontWeight: 600, margin: "8px 0 0", lineHeight: 1.4 }}>
                {faltam === 0 ? "🎉 Meta batida! Parabéns à equipe." : <>Faltam <b style={{ fontWeight: 800 }}>{faltam}</b> instalada(s) para bater <b style={{ fontWeight: 800 }}>{META_INSTALADAS}</b>.</>}
              </p>
              <div style={{ display: "flex", gap: 18, marginTop: 18, flexWrap: "wrap" }}>
                <div>
                  <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 11, margin: 0, fontWeight: 600 }}>vs período anterior</p>
                  <p style={{ color: "#fff", fontSize: 18, fontWeight: 800, margin: "2px 0 0", ...numStyle }}>{tInst.up ? "▲" : "▼"} {tInst.val.toFixed(0)}%</p>
                </div>
                <div>
                  <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 11, margin: 0, fontWeight: 600 }}>aguardando virar inst.</p>
                  <p style={{ color: "#fff", fontSize: 18, fontWeight: 800, margin: "2px 0 0", ...numStyle }}>+{aguardInst}</p>
                </div>
                <div>
                  <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 11, margin: 0, fontWeight: 600 }}>taxa de instalação</p>
                  <p style={{ color: "#fff", fontSize: 18, fontWeight: 800, margin: "2px 0 0", ...numStyle }}>{stats.taxaInstalacao.toFixed(0)}%</p>
                </div>
              </div>
            </div>
          </div>

          {/* 4 KPIs secundários */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: isMobile ? 12 : 14 }}>
            {kpisHero.map(k => (
              <div key={k.label} className="lift" style={{ ...surface, padding: isMobile ? 16 : 20, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <span style={{ width: 30, height: 30, borderRadius: 9, background: `${k.cor}15`, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>{k.icone}</span>
                  <p style={{ ...eyebrow, fontSize: 10.5 }}>{k.label}</p>
                </div>
                <p style={{ color: T.ink, fontSize: isMobile ? 28 : 34, fontWeight: 800, margin: 0, letterSpacing: -1, ...numStyle }}>{k.value.toLocaleString("pt-BR")}</p>
                {k.hint && <p style={{ color: T.faint, fontSize: 11, margin: "3px 0 0", fontWeight: 500 }}>{k.hint}</p>}
              </div>
            ))}
          </div>
        </div>

        {/* ═══ PAINEL ADMIN ranking ═══ */}
        {veTudo && !modoDemo && (
          <details className="fu" style={{ ...surface, padding: isMobile ? 14 : 18 }}>
            <summary style={{ cursor: "pointer", fontWeight: 800, color: T.ink, fontSize: 15, display: "flex", alignItems: "center", gap: 8, listStyle: "none" }}>
              <span>👁️</span> Quem aparece no ranking público
              <span style={{ fontWeight: 500, color: T.faint, fontSize: 12 }}>({todosVendedores.filter(v => rankingFlags[v.key]).length} de {todosVendedores.length})</span>
            </summary>
            <p style={{ color: T.sub, fontSize: 12.5, margin: "8px 0 12px" }}>Você (admin) vê tudo. Os demais veem só as pessoas marcadas abaixo.</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const, marginBottom: 12 }}>
              <input value={filtroRanking} onChange={e => setFiltroRanking(e.target.value)} placeholder="🔎 Buscar nome..." style={{ flex: 1, minWidth: 160, padding: "8px 12px", borderRadius: 10, border: `1px solid ${T.line}`, fontSize: 13, outline: "none" }} />
              <button onClick={() => marcarTodos(true)} style={{ padding: "8px 14px", borderRadius: 10, border: `1px solid #a7f3d0`, background: "#ecfdf5", color: T.green, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>Mostrar todos</button>
              <button onClick={() => marcarTodos(false)} style={{ padding: "8px 14px", borderRadius: 10, border: `1px solid ${T.line}`, background: T.soft, color: T.sub, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>Ocultar todos</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)", gap: 8, maxHeight: 420, overflowY: "auto" as const }}>
              {todosVendedores.filter(v => !filtroRanking || v.nome.toLowerCase().includes(filtroRanking.toLowerCase()) || v.key.toLowerCase().includes(filtroRanking.toLowerCase())).map(v => {
                const on = !!rankingFlags[v.key];
                return (
                  <button key={v.key} onClick={() => toggleRanking(v.key, on)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 14px", borderRadius: 10, border: `1px solid ${on ? "#a7f3d0" : T.line}`, background: on ? "#ecfdf5" : T.soft, cursor: "pointer", textAlign: "left" }}>
                    <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: T.ink, fontSize: 13, fontWeight: 600 }}>{v.nome}</span>
                    <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 800, color: on ? T.green : T.faint, display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 34, height: 18, borderRadius: 999, background: on ? T.green : "#cbd5e1", position: "relative", display: "inline-block" }}>
                        <span style={{ position: "absolute", top: 2, left: on ? 18 : 2, width: 14, height: 14, borderRadius: "50%", background: "#fff", transition: "left .15s" }} />
                      </span>
                      {on ? "Aparece" : "Oculto"}
                    </span>
                  </button>
                );
              })}
            </div>
          </details>
        )}

        {/* ═══ METAS (progresso) ═══ */}
        <div className="fu" style={{ ...surface, padding: isMobile ? 18 : 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 18, flexWrap: "wrap", gap: 6 }}>
            <h3 style={{ color: T.ink, fontSize: 16, fontWeight: 800, margin: 0 }}>Metas do mês</h3>
            <span style={{ ...eyebrow }}>acompanhamento em tempo real</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: isMobile ? 18 : 28 }}>
            {/* meta instaladas */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                <p style={{ color: "#334155", fontSize: 13, margin: 0, fontWeight: 700 }}>✅ Instaladas</p>
                <p style={{ color: T.ink, fontSize: 14, margin: 0, fontWeight: 800, ...numStyle }}>{instaladas} <span style={{ color: T.faint, fontWeight: 500 }}>/ {META_INSTALADAS}</span></p>
              </div>
              <BarraProg pct={pctMeta} cor={`linear-gradient(90deg, #34d399, ${T.green})`} />
              <p style={{ color: pctMeta >= 100 ? T.green : T.sub, fontSize: 11.5, margin: "6px 0 0", fontWeight: 600 }}>{pctMeta >= 100 ? "🎉 Meta batida!" : `${pctMeta.toFixed(1)}% — faltam ${faltam}`}</p>
            </div>
            {/* meta aguardando virar instalada */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                <p style={{ color: "#334155", fontSize: 13, margin: 0, fontWeight: 700 }}>🔧 Aguardando → instalada</p>
                <p style={{ color: T.ink, fontSize: 14, margin: 0, fontWeight: 800, ...numStyle }}>{aguardInst} <span style={{ color: T.faint, fontWeight: 500 }}>na fila</span></p>
              </div>
              <BarraProg pct={Math.min(100, (aguardInst / Math.max(1, faltam)) * 100)} cor={`linear-gradient(90deg, #38bdf8, ${GRUPO_META.AGUARDANDO_INST.cor})`} />
              <p style={{ color: T.sub, fontSize: 11.5, margin: "6px 0 0", fontWeight: 600 }}>
                {faltam === 0 ? "Meta já batida" : aguardInst >= faltam ? `✅ Dá pra bater a meta só com a fila atual!` : `Cobre ${Math.round((aguardInst / faltam) * 100)}% do que falta`}
              </p>
            </div>
          </div>
        </div>

        {/* ═══ GRID: Vendas 30d + Distribuição ═══ */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "2fr 1fr", gap: isMobile ? 14 : 18 }}>
          <div className="fu" style={{ ...surface, padding: isMobile ? 16 : 22 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
              <div>
                <h3 style={{ color: T.ink, fontSize: 15, fontWeight: 800, margin: 0 }}>Vendas — últimos 30 dias</h3>
                <p style={{ color: T.sub, fontSize: 12, margin: "3px 0 0" }}>Instaladas e aguardando instalação por dia</p>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <span style={{ background: "#ecfdf5", color: T.green, fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 8 }}>{vendasPorDia.reduce((a, d) => a + d.instaladas, 0)} inst.</span>
                <span style={{ background: "#f0f9ff", color: GRUPO_META.AGUARDANDO_INST.cor, fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 8 }}>{vendasPorDia.reduce((a, d) => a + d.aguardando, 0)} aguard.</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={isMobile ? 200 : 250}>
              <AreaChart data={vendasPorDia} margin={{ top: 5, right: 8, left: -25, bottom: 0 }}>
                <defs>
                  <linearGradient id="gI" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={T.green} stopOpacity={0.35} /><stop offset="95%" stopColor={T.green} stopOpacity={0} /></linearGradient>
                  <linearGradient id="gA" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={GRUPO_META.AGUARDANDO_INST.cor} stopOpacity={0.3} /><stop offset="95%" stopColor={GRUPO_META.AGUARDANDO_INST.cor} stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="data" stroke={T.faint} fontSize={10} tickLine={false} axisLine={false} interval={isMobile ? 6 : 3} />
                <YAxis stroke={T.faint} fontSize={10} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "#fff", border: `1px solid ${T.line}`, borderRadius: 10, fontSize: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }} />
                <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
                <Area type="monotone" dataKey="instaladas" name="Instaladas" stroke={T.green} strokeWidth={2.5} fill="url(#gI)" />
                <Area type="monotone" dataKey="aguardando" name="Aguardando inst." stroke={GRUPO_META.AGUARDANDO_INST.cor} strokeWidth={2} fill="url(#gA)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="fu" style={{ ...surface, padding: isMobile ? 16 : 22 }}>
            <h3 style={{ color: T.ink, fontSize: 15, fontWeight: 800, margin: "0 0 3px" }}>Distribuição</h3>
            <p style={{ color: T.sub, fontSize: 12, margin: "0 0 14px" }}>{periodoLabel[periodo]} · {stats.total} propostas</p>
            {distData.length === 0 ? <p style={{ color: T.faint, fontSize: 13, fontStyle: "italic", textAlign: "center", padding: "40px 0" }}>Sem dados no período.</p> : (
              <>
                <ResponsiveContainer width="100%" height={170}>
                  <PieChart>
                    <Pie data={distData} innerRadius={48} outerRadius={72} paddingAngle={3} dataKey="value">
                      {distData.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: "#fff", border: `1px solid ${T.line}`, borderRadius: 10, fontSize: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 10 }}>
                  {distData.slice(0, 6).map(s => (
                    <div key={s.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                        <span style={{ width: 9, height: 9, borderRadius: 3, background: s.color, flexShrink: 0 }} />
                        <span style={{ color: "#475569", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                      </div>
                      <span style={{ color: T.ink, fontWeight: 800, ...numStyle }}>{s.value}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* ═══ GRID: Ranking + Operadoras ═══ */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "2fr 1fr", gap: isMobile ? 14 : 18 }}>
          <div className="fu" style={{ ...surface, padding: isMobile ? 16 : 22 }}>
            <h3 style={{ color: T.ink, fontSize: 15, fontWeight: 800, margin: "0 0 3px", display: "flex", alignItems: "center", gap: 8 }}><span>🏆</span> Ranking de vendedores</h3>
            <p style={{ color: T.sub, fontSize: 12, margin: "0 0 16px" }}>Por instaladas · {periodoLabel[periodo]}</p>
            {rankingVendedores.length === 0 ? <p style={{ color: T.faint, fontSize: 13, fontStyle: "italic" }}>Sem vendas no período.</p> : (
              <>
                <ResponsiveContainer width="100%" height={isMobile ? 180 : 210}>
                  <BarChart data={rankingVendedores.slice(0, 10)} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                    <defs><linearGradient id="cb" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#34d399" /><stop offset="100%" stopColor={T.green} /></linearGradient></defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="nomeCurto" stroke={T.faint} fontSize={10} tickLine={false} axisLine={false} interval={0} angle={-30} textAnchor="end" height={isMobile ? 60 : 55} />
                    <YAxis stroke={T.faint} fontSize={10} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: "#fff", border: `1px solid ${T.line}`, borderRadius: 10, fontSize: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }} cursor={{ fill: "#ecfdf5" }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
                    <Bar dataKey="instaladas" name="Instaladas" stackId="r" fill="url(#cb)" />
                    <Bar dataKey="aguardando" name="Aguardando inst." stackId="r" fill={GRUPO_META.AGUARDANDO_INST.cor} radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 14 }}>
                  {rankingVendedores.slice(0, 5).map((v, i) => {
                    const med = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : null;
                    return (
                      <div key={v.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: i === 0 ? "linear-gradient(135deg,#ecfdf5,#d1fae5)" : T.soft, border: `1px solid ${i === 0 ? "#a7f3d0" : T.line}`, borderRadius: 11, padding: "10px 14px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
                          {med ? <span style={{ fontSize: 18, flexShrink: 0 }}>{med}</span> : <span style={{ background: "#e2e8f0", color: T.sub, fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 6, flexShrink: 0, minWidth: 28, textAlign: "center" }}>#{i + 1}</span>}
                          <span style={{ color: T.ink, fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.nome}</span>
                        </div>
                        <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                          <span style={{ color: i === 0 ? "#065f46" : T.green, fontSize: 14, fontWeight: 800, ...numStyle }}>{v.instaladas} inst.</span>
                          {v.aguardando > 0 && <span style={{ color: GRUPO_META.AGUARDANDO_INST.cor, fontSize: 10.5, fontWeight: 700 }}>+{v.aguardando} aguard.</span>}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          <div className="fu" style={{ ...surface, padding: isMobile ? 16 : 22 }}>
            <h3 style={{ color: T.ink, fontSize: 15, fontWeight: 800, margin: "0 0 3px", display: "flex", alignItems: "center", gap: 8 }}><span>📡</span> Operadoras</h3>
            <p style={{ color: T.sub, fontSize: 12, margin: "0 0 16px" }}>{periodoLabel[periodo]}</p>
            {operadorasData.length === 0 ? <p style={{ color: T.faint, fontSize: 13, fontStyle: "italic", textAlign: "center", padding: "40px 0" }}>Sem dados no período.</p> : (
              <>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={operadorasData} innerRadius={42} outerRadius={66} paddingAngle={2} dataKey="value">
                      {operadorasData.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: "#fff", border: `1px solid ${T.line}`, borderRadius: 10, fontSize: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
                  {operadorasData.slice(0, 5).map(o => (
                    <div key={o.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ width: 9, height: 9, borderRadius: 3, background: o.color }} /><span style={{ color: "#475569", fontWeight: 500 }}>{o.name}</span></div>
                      <span style={{ color: T.ink, fontWeight: 800, ...numStyle }}>{o.value}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* ═══ FUNIL POR VENDEDOR ═══ */}
        <div className="fu" style={{ ...surface, padding: isMobile ? 16 : 22 }}>
          <h3 style={{ color: T.ink, fontSize: 15, fontWeight: 800, margin: "0 0 3px", display: "flex", alignItems: "center", gap: 8 }}><span>🎯</span> Funil por vendedor</h3>
          <p style={{ color: T.sub, fontSize: 12, margin: "0 0 16px" }}>Quantidade por status · {periodoLabel[periodo]}</p>
          {funilVendedores.length === 0 ? <p style={{ color: T.faint, fontSize: 13, fontStyle: "italic" }}>Sem propostas no período.</p> : isMobile ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {funilVendedores.map((v, i) => (
                <div key={v.vendedor + i} style={{ background: T.soft, border: `1px solid ${T.line}`, borderRadius: 12, padding: 14 }}>
                  <p style={{ color: T.ink, fontSize: 13, fontWeight: 700, margin: "0 0 10px" }}>{v.vendedor}</p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {(["INSTALADA", "AGUARDANDO_INST", "BIOMETRIA", "PENDENTE", "CANCELADA", "CHURN"] as Grupo[]).map(g => (
                      <div key={g} style={{ background: GRUPO_META[g].bg, border: `1px solid ${GRUPO_META[g].cor}25`, borderRadius: 8, padding: "8px 12px" }}>
                        <p style={{ color: T.sub, fontSize: 10, margin: 0, fontWeight: 600 }}>{GRUPO_META[g].label}</p>
                        <p style={{ color: GRUPO_META[g].cor, fontSize: 18, fontWeight: 800, margin: "2px 0 0", ...numStyle }}>{(v as any)[g] || 0}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ overflow: "auto", border: `1px solid ${T.line}`, borderRadius: 12 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: T.soft }}>
                    {["Vendedor", "✅ Inst.", "🔧 Aguard.", "🪪 Biometria", "⏳ Pendentes", "🔍 Auditoria", "❌ Cancel.", "📉 Churn"].map(h => (
                      <th key={h} style={{ padding: "12px 14px", color: T.sub, fontSize: 11, textAlign: "left", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700, borderBottom: `1px solid ${T.line}`, whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {funilVendedores.map((v, i) => (
                    <tr key={v.vendedor + i} style={{ borderTop: `1px solid #f1f5f9`, background: i % 2 === 0 ? "#fff" : "#fafbfc" }}>
                      <td style={{ padding: "12px 14px", color: T.ink, fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" }}>{v.vendedor}</td>
                      {(["INSTALADA", "AGUARDANDO_INST", "BIOMETRIA", "PENDENTE", "AUDITORIA", "CANCELADA", "CHURN"] as Grupo[]).map(g => (
                        <td key={g} style={{ padding: "12px 14px" }}>
                          <span style={{ background: GRUPO_META[g].bg, color: GRUPO_META[g].cor, border: `1px solid ${GRUPO_META[g].cor}35`, fontSize: 13, padding: "4px 12px", borderRadius: 8, fontWeight: 700, display: "inline-block", minWidth: 32, textAlign: "center", ...numStyle }}>{(v as any)[g] || 0}</span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ═══ TODOS OS STATUS ═══ */}
        <div className="fu" style={{ ...surface, padding: isMobile ? 16 : 22 }}>
          <h3 style={{ color: T.ink, fontSize: 15, fontWeight: 800, margin: "0 0 3px", display: "flex", alignItems: "center", gap: 8 }}><span>📋</span> Todos os status</h3>
          <p style={{ color: T.sub, fontSize: 12, margin: "0 0 16px" }}>Contagem completa · {periodoLabel[periodo]}</p>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(3, 1fr)", gap: 10 }}>
            {(Object.keys(GRUPO_META) as Grupo[]).map(g => (
              <div key={g} className="lift" style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 12, background: GRUPO_META[g].bg, border: `1px solid ${GRUPO_META[g].cor}25` }}>
                <span style={{ fontSize: 20 }}>{GRUPO_META[g].icone}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ color: "#475569", fontSize: 11.5, margin: 0, fontWeight: 600 }}>{GRUPO_META[g].label}</p>
                  <p style={{ color: GRUPO_META[g].cor, fontSize: 22, fontWeight: 800, margin: "1px 0 0", ...numStyle }}>{(stats.g[g] || 0).toLocaleString("pt-BR")}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ═══ ATIVIDADE RECENTE ═══ */}
        <div className="fu" style={{ ...surface, padding: isMobile ? 16 : 22 }}>
          <h3 style={{ color: T.ink, fontSize: 15, fontWeight: 800, margin: "0 0 3px", display: "flex", alignItems: "center", gap: 8 }}><span>⚡</span> Atividade recente</h3>
          <p style={{ color: T.sub, fontSize: 12, margin: "0 0 14px" }}>Últimas propostas registradas</p>
          {atividadeRecente.length === 0 ? <p style={{ color: T.faint, fontSize: 13, fontStyle: "italic" }}>Sem atividade recente.</p> : (
            atividadeRecente.map((p, i) => {
              const g = grupoDe(p.status_venda); const cor = GRUPO_META[g].cor;
              const rel = (Date.now() - new Date(p.created_at).getTime()) / 3600000;
              const lbl = rel < 1 ? `${Math.floor(rel * 60)} min atrás` : rel < 24 ? `${Math.floor(rel)}h atrás` : `${Math.floor(rel / 24)}d atrás`;
              return (
                <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: i < atividadeRecente.length - 1 ? `1px solid #f1f5f9` : "none" }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: `${cor}15`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: cor }} /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ color: T.ink, fontSize: 12.5, margin: 0, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.nome}</p>
                    <p style={{ color: T.faint, fontSize: 11, margin: "2px 0 0" }}>{nomeVendedor(p.vendedor)} · {p.operadora}</p>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <p style={{ color: cor, fontSize: 11, margin: 0, fontWeight: 700 }}>{GRUPO_META[g].label}</p>
                    <p style={{ color: T.faint, fontSize: 10, margin: "1px 0 0" }}>{lbl}</p>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div style={{ textAlign: "center", padding: "4px 0 12px", fontSize: 11, color: T.faint, letterSpacing: 0.3 }}>
          Atualizado em {new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} · Grupo Unita
        </div>
      </div>
    </div>
  );
}