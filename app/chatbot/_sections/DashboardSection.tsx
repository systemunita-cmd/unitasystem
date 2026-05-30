"use client";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "../../lib/supabase";

// ═══════════════════════════════════════════════════════════════════════
// 📊 DASHBOARD DE ATENDIMENTOS — UnitaSystem (single-tenant)
// ───────────────────────────────────────────────────────────────────────
// Dashboard completo com KPIs, gráficos SVG nativos, filtros multi-camada
// (período, canal, equipe, fila, atendente), evolução temporal e ranking
// de atendentes. Paginação até 5k atendimentos por carga.
//
// Tabelas: atendimentos, conexoes, filas, equipes, usuarios
// ═══════════════════════════════════════════════════════════════════════

type Atendimento = {
  id: number;
  status: string;
  created_at: string;
  updated_at?: string;
  fila?: string;
  canal_id?: number;
  atendente?: string;
};
type Canal = { id: number; nome: string; tipo: string };
type Fila = { id: number; nome: string; equipe_id?: number | null };
type Equipe = { id: number; nome: string };
type UsuarioUni = { email: string; nome: string };

type Periodo = "hoje" | "semana" | "mes" | "ano" | "todos" | "personalizado";

export function DashboardSection() {
  const [atendimentos, setAtendimentos] = useState<Atendimento[]>([]);
  const [canais, setCanais] = useState<Canal[]>([]);
  const [filas, setFilas] = useState<Fila[]>([]);
  const [equipes, setEquipes] = useState<Equipe[]>([]);
  const [usuariosLista, setUsuariosLista] = useState<UsuarioUni[]>([]);
  const [carregando, setCarregando] = useState(true);

  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [canalFiltro, setCanalFiltro] = useState<string>("todos");
  const [equipeFiltro, setEquipeFiltro] = useState<string>("todas");
  const [filaFiltro, setFilaFiltro] = useState<string>("todas");
  const [atendenteFiltro, setAtendenteFiltro] = useState<string>("todos");

  const hojeStr = new Date().toISOString().slice(0, 10);
  const trintaDiasAtrasStr = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [dataCustomInicio, setDataCustomInicio] = useState<string>(trintaDiasAtrasStr);
  const [dataCustomFim, setDataCustomFim] = useState<string>(hojeStr);

  const [atualizando, setAtualizando] = useState(false);

  const fetchTudo = async (silencioso = false) => {
    if (!silencioso) setCarregando(true);
    try {
      const fetchAtendimentosPaginado = async (): Promise<Atendimento[]> => {
        const PAGE_SIZE = 1000;
        const TOTAL_LIMITE = 5000;
        let lista: Atendimento[] = [];
        let offset = 0;
        while (offset < TOTAL_LIMITE) {
          const { data: pagina, error } = await supabase
            .from("atendimentos")
            .select("id, status, created_at, updated_at, fila, canal_id, atendente")
            .order("created_at", { ascending: false })
            .range(offset, offset + PAGE_SIZE - 1);
          if (error) { console.error("Erro fetchAtendimentos (Dashboard):", error); break; }
          if (!pagina || pagina.length === 0) break;
          lista = lista.concat(pagina as Atendimento[]);
          if (pagina.length < PAGE_SIZE) break;
          offset += PAGE_SIZE;
        }
        return lista;
      };

      const [listaAtendimentos, resCx, resFi, resEq, resUs] = await Promise.all([
        fetchAtendimentosPaginado(),
        supabase.from("conexoes").select("id, nome, tipo"),
        supabase.from("filas").select("id, nome, equipe_id").order("nome", { ascending: true }),
        supabase.from("equipes").select("id, nome").eq("ativo", true).order("nome", { ascending: true }),
        supabase.from("usuarios").select("email, nome").eq("ativo", true),
      ]);
      setAtendimentos(listaAtendimentos);
      setCanais((resCx.data as Canal[]) || []);
      setFilas((resFi.data as Fila[]) || []);
      setEquipes((resEq.data as Equipe[]) || []);
      setUsuariosLista((resUs.data as UsuarioUni[]) || []);
    } finally {
      if (!silencioso) setCarregando(false);
    }
  };

  const atualizarManual = async () => {
    if (atualizando) return;
    setAtualizando(true);
    const t0 = Date.now();
    try { await fetchTudo(true); } catch (e) { console.error("Erro ao atualizar dashboard:", e); }
    const passou = Date.now() - t0;
    if (passou < 600) await new Promise(r => setTimeout(r, 600 - passou));
    setAtualizando(false);
  };

  useEffect(() => {
    fetchTudo();
    const ch = supabase
      .channel("dash_unita")
      .on("postgres_changes", { event: "*", schema: "public", table: "atendimentos" }, () => fetchTudo())
      .on("postgres_changes", { event: "*", schema: "public", table: "conexoes" }, () => fetchTudo())
      .on("postgres_changes", { event: "*", schema: "public", table: "filas" }, () => fetchTudo())
      .on("postgres_changes", { event: "*", schema: "public", table: "equipes" }, () => fetchTudo())
      .on("postgres_changes", { event: "*", schema: "public", table: "usuarios" }, () => fetchTudo())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const dataInicio = useMemo(() => {
    const agora = new Date();
    if (periodo === "hoje") { const d = new Date(agora); d.setHours(0, 0, 0, 0); return d; }
    if (periodo === "semana") { const d = new Date(agora); d.setDate(d.getDate() - 7); return d; }
    if (periodo === "mes") { const d = new Date(agora); d.setDate(d.getDate() - 30); return d; }
    if (periodo === "ano") { const d = new Date(agora); d.setDate(d.getDate() - 365); return d; }
    if (periodo === "personalizado") { const d = new Date(dataCustomInicio + "T00:00:00"); return isNaN(d.getTime()) ? null : d; }
    return null;
  }, [periodo, dataCustomInicio]);

  const dataFim = useMemo(() => {
    if (periodo !== "personalizado") return null;
    const d = new Date(dataCustomFim + "T23:59:59.999");
    return isNaN(d.getTime()) ? null : d;
  }, [periodo, dataCustomFim]);

  // Mapa fila(nome) → equipe_id
  const filaParaEquipe = useMemo(() => {
    const map: Record<string, string> = {};
    filas.forEach(f => { if (f.nome) map[f.nome] = String(f.equipe_id || ""); });
    return map;
  }, [filas]);

  const filasFiltradas = useMemo(() => {
    return filas.filter(f => equipeFiltro === "todas" || String(f.equipe_id || "") === equipeFiltro);
  }, [filas, equipeFiltro]);

  const atendimentosFiltrados = useMemo(() => {
    return atendimentos.filter(a => {
      const dt = new Date(a.created_at);
      if (dataInicio && dt < dataInicio) return false;
      if (dataFim && dt > dataFim) return false;
      if (canalFiltro !== "todos" && String(a.canal_id || "") !== canalFiltro) return false;
      if (equipeFiltro !== "todas" && (filaParaEquipe[a.fila || ""] || "") !== equipeFiltro) return false;
      if (filaFiltro !== "todas" && (a.fila || "") !== filaFiltro) return false;
      if (atendenteFiltro !== "todos" && (a.atendente || "") !== atendenteFiltro) return false;
      return true;
    });
  }, [atendimentos, dataInicio, dataFim, canalFiltro, equipeFiltro, filaParaEquipe, filaFiltro, atendenteFiltro]);

  type AbaCalc = "automatico" | "aguardando" | "abertos" | "finalizados";
  const classificarAtendimento = (a: Atendimento): AbaCalc => {
    if (a.status === "resolvido") return "finalizados";
    if (a.atendente === "BOT") return "automatico";
    const atendenteEhReal = !!a.atendente && !["BOT", "Humano"].includes(a.atendente);
    if (atendenteEhReal) return "abertos";
    if (a.status === "pendente") return "aguardando";
    return "abertos";
  };

  const cards = [
    { label: "Aguardando", value: atendimentosFiltrados.filter(a => classificarAtendimento(a) === "aguardando").length, color: "#f59e0b", icon: "⏳", bgLight: "#fffbeb" },
    { label: "Em Atendimento", value: atendimentosFiltrados.filter(a => classificarAtendimento(a) === "abertos").length, color: "#2563eb", icon: "👤", bgLight: "#eff6ff" },
    { label: "Resolvidos", value: atendimentosFiltrados.filter(a => classificarAtendimento(a) === "finalizados").length, color: "#16a34a", icon: "✅", bgLight: "#f0fdf4" },
    { label: "Total", value: atendimentosFiltrados.length, color: "#8b5cf6", icon: "📊", bgLight: "#f5f3ff" },
  ];

  const porCanal = useMemo(() => {
    const map: Record<string, number> = {};
    atendimentosFiltrados.forEach(a => { const id = String(a.canal_id || "sem-canal"); map[id] = (map[id] || 0) + 1; });
    return Object.entries(map)
      .map(([id, count]) => {
        const canal = canais.find(c => String(c.id) === id);
        return { id, nome: canal ? canal.nome : id === "sem-canal" ? "— Sem canal —" : `Canal ${id}`, tipo: canal?.tipo || "", count, cor: canal?.tipo === "waba" ? "#2563eb" : "#16a34a" };
      })
      .sort((a, b) => b.count - a.count);
  }, [atendimentosFiltrados, canais]);

  const porFila = useMemo(() => {
    const map: Record<string, number> = {};
    atendimentosFiltrados.forEach(a => { const fila = a.fila || "— Sem fila —"; map[fila] = (map[fila] || 0) + 1; });
    return Object.entries(map).map(([nome, count]) => ({ nome, count })).sort((a, b) => b.count - a.count);
  }, [atendimentosFiltrados]);

  const porTipoCanal = useMemo(() => {
    const map: Record<string, number> = { webjs: 0, waba: 0, outros: 0 };
    atendimentosFiltrados.forEach(a => {
      const canal = canais.find(c => String(c.id) === String(a.canal_id));
      const tipo = canal?.tipo || "outros";
      if (tipo === "webjs") map.webjs++; else if (tipo === "waba") map.waba++; else map.outros++;
    });
    return map;
  }, [atendimentosFiltrados, canais]);

  const statusAtendentes = useMemo(() => {
    const agoraTs = Date.now();
    const QUATRO_HORAS = 4 * 60 * 60 * 1000;
    const atendimentosRecentes = atendimentos.filter(a => {
      const ts = new Date(a.updated_at || a.created_at).getTime();
      return (agoraTs - ts) <= QUATRO_HORAS && a.atendente && !["BOT", "Humano"].includes(a.atendente);
    });
    const ativosEmail = new Set(atendimentosRecentes.map(a => a.atendente));
    return usuariosLista.map(u => ({
      email: u.email,
      nome: u.nome || u.email.split("@")[0],
      online: ativosEmail.has(u.email),
      atendendoAgora: atendimentosFiltrados.filter(a => a.atendente === u.email && a.status !== "resolvido").length,
    })).sort((a, b) => { if (a.online !== b.online) return a.online ? -1 : 1; return a.nome.localeCompare(b.nome); });
  }, [atendimentos, atendimentosFiltrados, usuariosLista]);

  const evolucaoPorHora = useMemo(() => {
    const buckets: { hora: string; count: number }[] = [];
    for (let h = 0; h < 24; h++) { buckets.push({ hora: `${String(h).padStart(2, "0")}:00`, count: 0 }); }
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    atendimentosFiltrados.forEach(a => { const dt = new Date(a.created_at); if (dt < hoje) return; buckets[dt.getHours()].count++; });
    return buckets;
  }, [atendimentosFiltrados]);

  const serieGrafico = useMemo(() => {
    if (atendimentosFiltrados.length === 0) return { buckets: [], granularidade: "dia" as "hora" | "dia" | "mes" };
    let granularidade: "hora" | "dia" | "mes" = "dia";
    if (periodo === "hoje") granularidade = "hora";
    else if (periodo === "ano" || periodo === "todos") granularidade = "mes";
    else if (periodo === "personalizado") {
      const inicio = dataInicio?.getTime() || 0;
      const fim = dataFim?.getTime() || Date.now();
      const dias = (fim - inicio) / (1000 * 60 * 60 * 24);
      if (dias <= 2) granularidade = "hora"; else if (dias > 90) granularidade = "mes"; else granularidade = "dia";
    }
    const map: Record<string, { aguardando: number; em_atendimento: number; resolvidos: number; total: number; ts: number }> = {};
    atendimentosFiltrados.forEach(a => {
      const dt = new Date(a.created_at);
      let chave: string; let ts: number;
      if (granularidade === "hora") { chave = `${String(dt.getHours()).padStart(2, "0")}h`; ts = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate(), dt.getHours()).getTime(); }
      else if (granularidade === "dia") { chave = `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}`; ts = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime(); }
      else { const mesNome = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"][dt.getMonth()]; chave = `${mesNome}/${String(dt.getFullYear()).slice(2)}`; ts = new Date(dt.getFullYear(), dt.getMonth(), 1).getTime(); }
      if (!map[chave]) map[chave] = { aguardando: 0, em_atendimento: 0, resolvidos: 0, total: 0, ts };
      map[chave].total++;
      const cat = classificarAtendimento(a);
      if (cat === "finalizados") map[chave].resolvidos++;
      else if (cat === "abertos") map[chave].em_atendimento++;
      else map[chave].aguardando++;
    });
    const buckets = Object.entries(map).map(([rotulo, v]) => ({ rotulo, ...v })).sort((a, b) => a.ts - b.ts);
    return { buckets, granularidade };
  }, [atendimentosFiltrados, periodo, dataInicio, dataFim]);

  const porAtendente = useMemo(() => {
    type Bucket = { chave: string; emAtendimento: number; resolvidos: number; total: number };
    const map: Record<string, Bucket> = {};
    atendimentosFiltrados.forEach(a => {
      const chave = a.atendente || "sem-atendente";
      if (!map[chave]) map[chave] = { chave, emAtendimento: 0, resolvidos: 0, total: 0 };
      map[chave].total++;
      if (a.status === "resolvido") map[chave].resolvidos++; else map[chave].emAtendimento++;
    });
    const nomeDe = (chave: string): string => {
      if (chave === "sem-atendente") return "— Sem atendente —";
      if (chave === "BOT") return "🤖 BOT (automático)";
      if (chave === "Humano") return "👤 Humano (legado)";
      const u = usuariosLista.find(us => us.email?.toLowerCase() === chave.toLowerCase());
      if (u?.nome) return u.nome;
      return chave.includes("@") ? chave.split("@")[0] : chave;
    };
    const corDe = (chave: string): string => {
      if (chave === "BOT") return "#8b5cf6";
      if (chave === "sem-atendente") return "#6b7280";
      if (chave === "Humano") return "#64748b";
      return "#2563eb";
    };
    return Object.values(map)
      .map(b => ({ ...b, nome: nomeDe(b.chave), cor: corDe(b.chave), inicial: (nomeDe(b.chave).replace(/[^a-zA-Z0-9À-ÿ]/g, "").charAt(0) || "?").toUpperCase() }))
      .sort((a, b) => b.total - a.total);
  }, [atendimentosFiltrados, usuariosLista]);

  const temFiltroAtivo = periodo !== "todos" || canalFiltro !== "todos" || equipeFiltro !== "todas" || filaFiltro !== "todas" || atendenteFiltro !== "todos";

  const labelPeriodo = (() => {
    const map: Record<Periodo, string> = {
      hoje: "hoje", semana: "últimos 7 dias", mes: "últimos 30 dias", ano: "últimos 365 dias", todos: "período total",
      personalizado: `${dataCustomInicio.split("-").reverse().join("/")} → ${dataCustomFim.split("-").reverse().join("/")}`,
    };
    return map[periodo];
  })();

  const cardStyle = {
    background: "#ffffff",
    borderRadius: 14,
    border: "1px solid #e5e7eb",
    boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
    transition: "all 0.15s",
  };

  const selectStyle = {
    width: "100%",
    background: "#ffffff",
    color: "#1f2937",
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    padding: "10px 14px",
    fontSize: 13,
    cursor: "pointer" as const,
    outline: "none",
    transition: "border-color 0.15s, box-shadow 0.15s",
  };

  return (
    <div style={{ padding: 32, height: "100vh", overflowY: "auto", boxSizing: "border-box", background: "#f8fafc" }}>
      <style>{`
        @keyframes spin-icon { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 1400, margin: "0 auto" }}>

        {/* HEADER */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{
              width: 48, height: 48, borderRadius: 14,
              background: "linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 24,
              boxShadow: "0 8px 20px rgba(37, 99, 235, 0.25)",
            }}>
              <span style={{ filter: "saturate(0) brightness(2)" }}>📊</span>
            </div>
            <div>
              <h1 style={{ color: "#1f2937", fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: -0.3 }}>Dashboard</h1>
              <p style={{ color: "#6b7280", fontSize: 12, margin: "2px 0 0" }}>
                {carregando ? "Carregando dados..." : `Mostrando: ${labelPeriodo}`}
              </p>
            </div>
          </div>
          <button onClick={atualizarManual} disabled={atualizando || carregando} title="Atualizar dados"
            style={{
              background: atualizando ? "#10b98115" : "#ffffff",
              border: atualizando ? "1px solid #10b98140" : "1px solid #e5e7eb",
              color: atualizando ? "#10b981" : "#4b5563",
              borderRadius: 12, padding: "10px 18px", fontSize: 13, fontWeight: 600,
              cursor: atualizando ? "wait" : "pointer",
              display: "flex", alignItems: "center", gap: 8,
              boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
            }}>
            <span style={{ display: "inline-block", animation: atualizando ? "spin-icon 0.6s linear infinite" : "none", fontSize: 15 }}>🔄</span>
            {atualizando ? "Atualizando..." : "Atualizar"}
          </button>
        </div>

        {/* FILTROS */}
        <div style={{ ...cardStyle, padding: 22 }}>
          <div style={{ marginBottom: 16 }}>
            <p style={{ color: "#6b7280", fontSize: 11, fontWeight: 700, textTransform: "uppercase", margin: "0 0 10px", letterSpacing: 0.5 }}>Período</p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {([
                { p: "hoje" as Periodo, label: "Hoje", icon: "📅", cor: "#2563eb" },
                { p: "semana" as Periodo, label: "7 dias", icon: "🗓️", cor: "#8b5cf6" },
                { p: "mes" as Periodo, label: "30 dias", icon: "📆", cor: "#6366f1" },
                { p: "ano" as Periodo, label: "365 dias", icon: "🗃️", cor: "#ec4899" },
                { p: "todos" as Periodo, label: "Todos", icon: "∞", cor: "#14b8a6" },
                { p: "personalizado" as Periodo, label: "Personalizado", icon: "🎯", cor: "#f59e0b" },
              ]).map(item => {
                const ativo = periodo === item.p;
                return (
                  <button key={item.p} onClick={() => setPeriodo(item.p)}
                    style={{
                      background: ativo ? `${item.cor}15` : "#f9fafb",
                      color: ativo ? item.cor : "#6b7280",
                      border: `1px solid ${ativo ? `${item.cor}50` : "#e5e7eb"}`,
                      borderRadius: 10, padding: "8px 16px", fontSize: 12,
                      fontWeight: ativo ? 700 : 600, cursor: "pointer",
                      display: "flex", alignItems: "center", gap: 6,
                      whiteSpace: "nowrap", transition: "all 0.15s",
                      boxShadow: ativo ? `0 2px 8px ${item.cor}25` : "none",
                    }}>
                    <span>{item.icon}</span> {item.label}
                  </button>
                );
              })}
            </div>

            {periodo === "personalizado" && (
              <div style={{ display: "flex", gap: 12, marginTop: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
                <div style={{ flex: "1 1 180px", minWidth: 160 }}>
                  <p style={{ color: "#6b7280", fontSize: 11, fontWeight: 700, textTransform: "uppercase", margin: "0 0 6px" }}>De</p>
                  <input type="date" value={dataCustomInicio} max={dataCustomFim} onChange={e => setDataCustomInicio(e.target.value)} style={{ ...selectStyle, colorScheme: "light" }} />
                </div>
                <div style={{ flex: "1 1 180px", minWidth: 160 }}>
                  <p style={{ color: "#6b7280", fontSize: 11, fontWeight: 700, textTransform: "uppercase", margin: "0 0 6px" }}>Até</p>
                  <input type="date" value={dataCustomFim} min={dataCustomInicio} max={hojeStr} onChange={e => setDataCustomFim(e.target.value)} style={{ ...selectStyle, colorScheme: "light" }} />
                </div>
                <p style={{ color: "#9ca3af", fontSize: 11, margin: 0, paddingBottom: 12 }}>Escolha o intervalo que quer analisar</p>
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ flex: "1 1 200px", minWidth: 180 }}>
              <p style={{ color: "#6b7280", fontSize: 11, fontWeight: 700, textTransform: "uppercase", margin: "0 0 6px" }}>Canal / Conexão</p>
              <select value={canalFiltro} onChange={e => setCanalFiltro(e.target.value)} style={selectStyle}>
                <option value="todos">📡 Todos os canais</option>
                {canais.map(c => <option key={c.id} value={String(c.id)}>{c.tipo === "waba" ? "🔗" : "📱"} {c.nome}</option>)}
              </select>
            </div>
            {equipes.length > 0 && (
              <div style={{ flex: "1 1 200px", minWidth: 180 }}>
                <p style={{ color: "#6b7280", fontSize: 11, fontWeight: 700, textTransform: "uppercase", margin: "0 0 6px" }}>Equipe</p>
                <select value={equipeFiltro}
                  onChange={e => {
                    const novaEquipe = e.target.value;
                    setEquipeFiltro(novaEquipe);
                    if (novaEquipe !== "todas" && filaFiltro !== "todas" && (filaParaEquipe[filaFiltro] || "") !== novaEquipe) {
                      setFilaFiltro("todas");
                    }
                  }} style={selectStyle}>
                  <option value="todas">👥 Todas as equipes</option>
                  {equipes.map(eq => <option key={eq.id} value={String(eq.id)}>👥 {eq.nome}</option>)}
                </select>
              </div>
            )}
            <div style={{ flex: "1 1 200px", minWidth: 180 }}>
              <p style={{ color: "#6b7280", fontSize: 11, fontWeight: 700, textTransform: "uppercase", margin: "0 0 6px" }}>Fila</p>
              <select value={filaFiltro} onChange={e => setFilaFiltro(e.target.value)} style={selectStyle}>
                <option value="todas">📋 Todas as filas</option>
                {filasFiltradas.map(f => <option key={f.id} value={f.nome}>{f.nome}</option>)}
              </select>
            </div>
            <div style={{ flex: "1 1 200px", minWidth: 180 }}>
              <p style={{ color: "#6b7280", fontSize: 11, fontWeight: 700, textTransform: "uppercase", margin: "0 0 6px" }}>Atendente</p>
              <select value={atendenteFiltro} onChange={e => setAtendenteFiltro(e.target.value)} style={selectStyle}>
                <option value="todos">👥 Todos os atendentes</option>
                <option value="BOT">🤖 BOT (automático)</option>
                {usuariosLista.map((u, i) => <option key={u.email + i} value={u.email}>👤 {u.nome || u.email.split("@")[0]}</option>)}
              </select>
            </div>
            {temFiltroAtivo && (
              <button onClick={() => { setPeriodo("todos"); setCanalFiltro("todos"); setEquipeFiltro("todas"); setFilaFiltro("todas"); setAtendenteFiltro("todos"); }}
                style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", borderRadius: 10, padding: "10px 18px", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                ✕ Limpar filtros
              </button>
            )}
          </div>
        </div>

        {/* CARDS PRINCIPAIS */}
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          {cards.map((card, idx) => (
            <div key={card.label}
              style={{ flex: "1 1 200px", ...cardStyle, padding: 22, borderTop: `3px solid ${card.color}`, animation: `fadeInUp 0.3s ease-out ${idx * 0.05}s both` }}
              onMouseEnter={(e) => { e.currentTarget.style.boxShadow = `0 8px 20px ${card.color}20`; e.currentTarget.style.transform = "translateY(-2px)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)"; e.currentTarget.style.transform = "translateY(0)"; }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: `${card.color}15`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>{card.icon}</div>
                <p style={{ color: "#6b7280", fontSize: 12, margin: 0, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.3 }}>{card.label}</p>
              </div>
              <p style={{ color: card.color, fontSize: 34, fontWeight: 800, margin: 0, letterSpacing: -1 }}>{card.value}</p>
            </div>
          ))}
        </div>

        {/* GRÁFICO DE DESEMPENHO */}
        <div style={{ ...cardStyle, padding: 22 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
            <p style={{ color: "#1f2937", fontSize: 14, margin: 0, fontWeight: 700 }}>
              📈 Desempenho ({serieGrafico.granularidade === "hora" ? "por hora" : serieGrafico.granularidade === "mes" ? "por mês" : "por dia"})
            </p>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              {[{ cor: "#f59e0b", label: "Aguardando" }, { cor: "#2563eb", label: "Em atendimento" }, { cor: "#16a34a", label: "Resolvidos" }].map(l => (
                <span key={l.label} style={{ display: "flex", alignItems: "center", gap: 6, color: "#4b5563", fontSize: 12, fontWeight: 500 }}>
                  <span style={{ width: 10, height: 10, background: l.cor, borderRadius: 3 }} /> {l.label}
                </span>
              ))}
            </div>
          </div>

          {serieGrafico.buckets.length === 0 ? (
            <p style={{ color: "#9ca3af", fontSize: 13, margin: "30px 0", textAlign: "center" }}>Nenhum atendimento no período selecionado.</p>
          ) : (() => {
            const buckets = serieGrafico.buckets;
            const maxTotal = Math.max(...buckets.map(b => b.total), 1);
            const w = 1000, h = 280;
            const padL = 40, padR = 12, padT = 16, padB = 36;
            const innerW = w - padL - padR;
            const innerH = h - padT - padB;
            const slotW = innerW / buckets.length;
            const barW = slotW * 0.7;
            const gridLines = [0.25, 0.5, 0.75, 1].map(p => ({ y: padT + innerH - innerH * p, valor: Math.round(maxTotal * p) }));
            const passoRotulo = Math.max(1, Math.ceil(buckets.length / 12));
            return (
              <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: "auto", display: "block" }}>
                {gridLines.map((g, i) => (
                  <g key={i}>
                    <line x1={padL} y1={g.y} x2={w - padR} y2={g.y} stroke="#e5e7eb" strokeWidth="1" strokeDasharray="4 4" />
                    <text x={padL - 6} y={g.y + 4} fontSize="10" fill="#9ca3af" textAnchor="end">{g.valor}</text>
                  </g>
                ))}
                {buckets.map((b, i) => {
                  const x = padL + slotW * i + (slotW - barW) / 2;
                  const totalH = (b.total / maxTotal) * innerH;
                  const hAguardando = (b.aguardando / maxTotal) * innerH;
                  const hAtend = (b.em_atendimento / maxTotal) * innerH;
                  const hResolv = (b.resolvidos / maxTotal) * innerH;
                  const yCursor = padT + innerH - totalH;
                  return (
                    <g key={b.rotulo + i}>
                      <title>{b.rotulo}: {b.total} total ({b.aguardando} aguardando, {b.em_atendimento} em atendimento, {b.resolvidos} resolvidos)</title>
                      {hAguardando > 0 && <rect x={x} y={yCursor} width={barW} height={hAguardando} fill="#f59e0b" rx="3" />}
                      {hAtend > 0 && <rect x={x} y={yCursor + hAguardando} width={barW} height={hAtend} fill="#2563eb" rx={hResolv > 0 ? 0 : 3} />}
                      {hResolv > 0 && <rect x={x} y={yCursor + hAguardando + hAtend} width={barW} height={hResolv} fill="#16a34a" rx="3" />}
                      {i % passoRotulo === 0 && <text x={x + barW / 2} y={h - padB + 16} fontSize="10" fill="#9ca3af" textAnchor="middle">{b.rotulo}</text>}
                      {totalH > 18 && <text x={x + barW / 2} y={yCursor - 4} fontSize="9" fill="#4b5563" textAnchor="middle" fontWeight="bold">{b.total}</text>}
                    </g>
                  );
                })}
                <line x1={padL} y1={padT + innerH} x2={w - padR} y2={padT + innerH} stroke="#d1d5db" strokeWidth="1" />
              </svg>
            );
          })()}
          <p style={{ color: "#9ca3af", fontSize: 11, margin: "8px 0 0", textAlign: "center" }}>Passe o mouse sobre as barras pra ver detalhes</p>
        </div>

        {/* BREAKDOWNS — Canal e Fila */}
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 320px", ...cardStyle, padding: 22, minHeight: 140 }}>
            <p style={{ color: "#1f2937", fontSize: 13, margin: "0 0 16px", fontWeight: 700 }}>📡 Por Canal / Conexão</p>
            {porCanal.length === 0 ? (
              <p style={{ color: "#9ca3af", fontSize: 12, margin: 0 }}>Nenhum atendimento no período.</p>
            ) : porCanal.map((c, i) => {
              const max = porCanal[0]?.count || 1;
              const pct = (c.count / max) * 100;
              return (
                <div key={c.id + i} style={{ marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, gap: 8 }}>
                    <span style={{ color: "#374151", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 500 }}>
                      {c.tipo === "waba" ? "🔗" : c.tipo === "webjs" ? "📱" : "📡"} {c.nome}
                    </span>
                    <span style={{ color: c.cor, fontSize: 14, fontWeight: 700, flexShrink: 0 }}>{c.count}</span>
                  </div>
                  <div style={{ height: 8, background: "#f3f4f6", borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: `linear-gradient(90deg, ${c.cor}, ${c.cor}cc)`, transition: "width 0.3s", borderRadius: 4 }} />
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ flex: "1 1 320px", ...cardStyle, padding: 22, minHeight: 140 }}>
            <p style={{ color: "#1f2937", fontSize: 13, margin: "0 0 16px", fontWeight: 700 }}>📋 Por Fila</p>
            {porFila.length === 0 ? (
              <p style={{ color: "#9ca3af", fontSize: 12, margin: 0 }}>Nenhum atendimento no período.</p>
            ) : porFila.map((f, i) => {
              const max = porFila[0]?.count || 1;
              const pct = (f.count / max) * 100;
              return (
                <div key={f.nome + i} style={{ marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, gap: 8 }}>
                    <span style={{ color: "#374151", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 500 }}>{f.nome}</span>
                    <span style={{ color: "#16a34a", fontSize: 14, fontWeight: 700, flexShrink: 0 }}>{f.count}</span>
                  </div>
                  <div style={{ height: 8, background: "#f3f4f6", borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: "linear-gradient(90deg, #16a34a, #22c55e)", transition: "width 0.3s", borderRadius: 4 }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* POR ATENDENTE */}
        <div style={{ ...cardStyle, padding: 22, overflow: "hidden", flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
            <p style={{ color: "#1f2937", fontSize: 14, margin: 0, fontWeight: 700 }}>👥 Por Atendente</p>
            <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
              {[{ cor: "#f59e0b", label: "Em atendimento" }, { cor: "#16a34a", label: "Resolvidos" }].map(l => (
                <span key={l.label} style={{ display: "flex", alignItems: "center", gap: 6, color: "#4b5563", fontSize: 11, fontWeight: 600 }}>
                  <span style={{ width: 10, height: 10, background: l.cor, borderRadius: 3, display: "inline-block" }} /> {l.label}
                </span>
              ))}
            </div>
          </div>
          {porAtendente.length === 0 ? (
            <p style={{ color: "#9ca3af", fontSize: 12, margin: 0 }}>Nenhum atendimento no período.</p>
          ) : porAtendente.map((a, i) => {
            const maxTotal = porAtendente[0]?.total || 1;
            const pctBarra = (a.total / maxTotal) * 100;
            const pctAtendendo = a.total > 0 ? (a.emAtendimento / a.total) * 100 : 0;
            return (
              <div key={a.chave + i} style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: "50%",
                    background: `${a.cor}18`, color: a.cor,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontWeight: 700, fontSize: 13, flexShrink: 0,
                    border: `1px solid ${a.cor}30`,
                  }}>{a.inicial}</div>
                  <span style={{ color: "#1f2937", fontSize: 13, fontWeight: 600, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.nome}</span>
                  <span style={{ color: "#6b7280", fontSize: 12, flexShrink: 0, display: "flex", gap: 6 }}>
                    <span style={{ color: "#f59e0b", fontWeight: 700 }}>{a.emAtendimento}</span>
                    <span style={{ opacity: 0.3 }}>·</span>
                    <span style={{ color: "#16a34a", fontWeight: 700 }}>{a.resolvidos}</span>
                    <span style={{ opacity: 0.3 }}>·</span>
                    <span style={{ color: "#1f2937", fontWeight: 700 }}>{a.total}</span>
                  </span>
                </div>
                <div style={{ height: 8, background: "#f3f4f6", borderRadius: 4, overflow: "hidden", width: `${pctBarra}%`, minWidth: 40, transition: "width 0.3s", display: "flex" }}>
                  <div style={{ width: `${pctAtendendo}%`, height: "100%", background: "#f59e0b", borderRadius: "4px 0 0 4px" }} />
                  <div style={{ flex: 1, height: "100%", background: "#16a34a", borderRadius: "0 4px 4px 0" }} />
                </div>
              </div>
            );
          })}
        </div>

        {/* DESEMPENHO POR CANAL */}
        <div>
          <h2 style={{ color: "#1f2937", fontSize: 16, fontWeight: 700, margin: "0 0 16px" }}>Desempenho por Canal</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
            <div style={{ ...cardStyle, borderTop: "3px solid #16a34a", padding: 22 }}
              onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 8px 20px rgba(22,163,74,0.15)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)"; e.currentTarget.style.transform = "translateY(0)"; }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: "#16a34a15", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>📱</div>
                <p style={{ color: "#6b7280", fontSize: 12, margin: 0, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>WhatsApp</p>
              </div>
              <p style={{ color: "#16a34a", fontSize: 36, fontWeight: 800, margin: 0, letterSpacing: -1 }}>{porTipoCanal.webjs}</p>
              <p style={{ color: "#9ca3af", fontSize: 12, margin: "4px 0 0" }}>tickets {labelPeriodo}</p>
            </div>
            <div style={{ ...cardStyle, borderTop: "3px solid #8b5cf6", padding: 22 }}
              onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 8px 20px rgba(139,92,246,0.15)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)"; e.currentTarget.style.transform = "translateY(0)"; }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: "#8b5cf615", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🔗</div>
                <p style={{ color: "#6b7280", fontSize: 12, margin: 0, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>API Oficial</p>
              </div>
              <p style={{ color: "#8b5cf6", fontSize: 36, fontWeight: 800, margin: 0, letterSpacing: -1 }}>{porTipoCanal.waba}</p>
              <p style={{ color: "#9ca3af", fontSize: 12, margin: "4px 0 0" }}>tickets {labelPeriodo}</p>
            </div>
          </div>
        </div>

        {/* ANÁLISES — Pizza + Barras */}
        <div>
          <h2 style={{ color: "#1f2937", fontSize: 16, fontWeight: 700, margin: "0 0 16px" }}>📊 Análises</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 16 }}>
            <div style={{ ...cardStyle, padding: 22 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <p style={{ color: "#1f2937", fontSize: 14, margin: 0, fontWeight: 700 }}>🥧 Distribuição de Status</p>
                <span style={{ background: "#2563eb15", color: "#2563eb", fontSize: 12, padding: "4px 12px", borderRadius: 12, fontWeight: 700, border: "1px solid #2563eb30" }}>Total: {atendimentosFiltrados.length}</span>
              </div>
              {(() => {
                const aguardando = cards[0].value;
                const emAtend = cards[1].value;
                const resolvidos = cards[2].value;
                const total = aguardando + emAtend + resolvidos;
                if (total === 0) return <p style={{ color: "#9ca3af", fontSize: 13, textAlign: "center", padding: "40px 0" }}>Sem dados no período</p>;
                const r = 80;
                const cx = 110, cy = 110;
                let anguloAcumulado = -Math.PI / 2;
                const fatias = [
                  { valor: aguardando, cor: "#f59e0b", label: "Aguardando" },
                  { valor: emAtend, cor: "#2563eb", label: "Em Atendimento" },
                  { valor: resolvidos, cor: "#16a34a", label: "Resolvidos" },
                ].filter(f => f.valor > 0);
                return (
                  <div style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap", justifyContent: "center" }}>
                    <svg viewBox="0 0 220 220" style={{ width: 200, height: 200 }}>
                      {fatias.map((f) => {
                        const fracao = f.valor / total;
                        const anguloFim = anguloAcumulado + fracao * 2 * Math.PI;
                        const x1 = cx + r * Math.cos(anguloAcumulado);
                        const y1 = cy + r * Math.sin(anguloAcumulado);
                        const x2 = cx + r * Math.cos(anguloFim);
                        const y2 = cy + r * Math.sin(anguloFim);
                        const largeArc = fracao > 0.5 ? 1 : 0;
                        const path = fracao >= 0.999
                          ? `M ${cx - r} ${cy} a ${r} ${r} 0 1 0 ${r * 2} 0 a ${r} ${r} 0 1 0 ${-r * 2} 0`
                          : `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
                        const anguloMeio = (anguloAcumulado + anguloFim) / 2;
                        const tx = cx + (r * 0.65) * Math.cos(anguloMeio);
                        const ty = cy + (r * 0.65) * Math.sin(anguloMeio);
                        const jsx = (
                          <g key={f.label}>
                            <path d={path} fill={f.cor}><title>{f.label}: {f.valor} ({(fracao * 100).toFixed(1)}%)</title></path>
                            {fracao > 0.05 && <text x={tx} y={ty + 4} fontSize="13" fill="white" textAnchor="middle" fontWeight="bold">{f.valor}</text>}
                          </g>
                        );
                        anguloAcumulado = anguloFim;
                        return jsx;
                      })}
                      <circle cx={cx} cy={cy} r={r * 0.55} fill="#ffffff" />
                      <text x={cx} y={cy - 4} fontSize="11" fill="#9ca3af" textAnchor="middle">Total</text>
                      <text x={cx} y={cy + 14} fontSize="18" fill="#1f2937" textAnchor="middle" fontWeight="bold">{total}</text>
                    </svg>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {fatias.map(f => (
                        <div key={f.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ width: 12, height: 12, background: f.cor, borderRadius: 3 }} />
                          <span style={{ color: "#4b5563", fontSize: 13 }}>{f.label}: <b style={{ color: f.cor }}>{f.valor}</b></span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>

            <div style={{ ...cardStyle, padding: 22 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <p style={{ color: "#1f2937", fontSize: 14, margin: 0, fontWeight: 700 }}>📊 Tickets por Status</p>
                <span style={{ background: "#2563eb15", color: "#2563eb", fontSize: 12, padding: "4px 12px", borderRadius: 12, fontWeight: 700, border: "1px solid #2563eb30" }}>Total: {atendimentosFiltrados.length}</span>
              </div>
              {(() => {
                const dados = [
                  { label: "Aguardando", valor: cards[0].value, cor: "#f59e0b" },
                  { label: "Em Atendimento", valor: cards[1].value, cor: "#2563eb" },
                  { label: "Resolvidos", valor: cards[2].value, cor: "#16a34a" },
                ];
                const max = Math.max(...dados.map(d => d.valor), 1);
                const w = 400, h = 220;
                const padL = 36, padR = 12, padT = 16, padB = 36;
                const innerW = w - padL - padR;
                const innerH = h - padT - padB;
                const slotW = innerW / dados.length;
                const barW = slotW * 0.55;
                return (
                  <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: "auto", display: "block" }}>
                    {[0.25, 0.5, 0.75, 1].map((p, i) => (
                      <g key={i}>
                        <line x1={padL} y1={padT + innerH - innerH * p} x2={w - padR} y2={padT + innerH - innerH * p} stroke="#e5e7eb" strokeDasharray="4 4" />
                        <text x={padL - 5} y={padT + innerH - innerH * p + 4} fontSize="9" fill="#9ca3af" textAnchor="end">{Math.round(max * p)}</text>
                      </g>
                    ))}
                    {dados.map((d, i) => {
                      const x = padL + slotW * i + (slotW - barW) / 2;
                      const altura = (d.valor / max) * innerH;
                      const y = padT + innerH - altura;
                      return (
                        <g key={d.label}>
                          <rect x={x} y={y} width={barW} height={altura} fill={d.cor} rx="4"><title>{d.label}: {d.valor}</title></rect>
                          {altura > 18 && <text x={x + barW / 2} y={y + altura / 2 + 4} fontSize="13" fill="white" textAnchor="middle" fontWeight="bold">{d.valor}</text>}
                          <text x={x + barW / 2} y={h - padB + 16} fontSize="10" fill="#6b7280" textAnchor="middle">{d.label}</text>
                        </g>
                      );
                    })}
                    <line x1={padL} y1={padT + innerH} x2={w - padR} y2={padT + innerH} stroke="#d1d5db" />
                  </svg>
                );
              })()}
            </div>
          </div>
        </div>

        {/* EVOLUÇÃO DOS TICKETS (linha suave) */}
        <div style={{ ...cardStyle, padding: 22 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <p style={{ color: "#1f2937", fontSize: 14, margin: 0, fontWeight: 700 }}>📈 Evolução dos Tickets</p>
            <span style={{ background: "#2563eb15", color: "#2563eb", fontSize: 12, padding: "4px 12px", borderRadius: 12, fontWeight: 700, border: "1px solid #2563eb30" }}>Total: {atendimentosFiltrados.length}</span>
          </div>
          {(() => {
            const pontos = [
              { x: "Aguardando", valor: cards[0].value },
              { x: "Em Atendimento", valor: cards[1].value },
              { x: "Finalizado", valor: cards[2].value },
            ];
            const max = Math.max(...pontos.map(p => p.valor), 1);
            const w = 1000, h = 240;
            const padL = 40, padR = 24, padT = 20, padB = 36;
            const innerW = w - padL - padR;
            const innerH = h - padT - padB;
            const stepX = innerW / (pontos.length - 1);
            const coords = pontos.map((p, i) => ({ x: padL + stepX * i, y: padT + innerH - (p.valor / max) * innerH, valor: p.valor, label: p.x }));
            let path = `M ${coords[0].x} ${coords[0].y}`;
            for (let i = 0; i < coords.length - 1; i++) {
              const cur = coords[i]; const next = coords[i + 1];
              path += ` C ${cur.x + (next.x - cur.x) / 2} ${cur.y}, ${cur.x + (next.x - cur.x) / 2} ${next.y}, ${next.x} ${next.y}`;
            }
            const pathArea = path + ` L ${coords[coords.length - 1].x} ${padT + innerH} L ${coords[0].x} ${padT + innerH} Z`;
            return (
              <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: "auto", display: "block" }}>
                <defs>
                  <linearGradient id="gradEvolucao" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#2563eb" stopOpacity="0.2" />
                    <stop offset="100%" stopColor="#2563eb" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {[0.25, 0.5, 0.75, 1].map((p, i) => (
                  <g key={i}>
                    <line x1={padL} y1={padT + innerH - innerH * p} x2={w - padR} y2={padT + innerH - innerH * p} stroke="#e5e7eb" strokeDasharray="4 4" />
                    <text x={padL - 5} y={padT + innerH - innerH * p + 4} fontSize="10" fill="#9ca3af" textAnchor="end">{Math.round(max * p)}</text>
                  </g>
                ))}
                <path d={pathArea} fill="url(#gradEvolucao)" />
                <path d={path} fill="none" stroke="#2563eb" strokeWidth="2.5" />
                {coords.map((c, i) => (
                  <g key={i}>
                    <circle cx={c.x} cy={c.y} r="7" fill="#2563eb" stroke="#ffffff" strokeWidth="2"><title>{c.label}: {c.valor}</title></circle>
                    <circle cx={c.x} cy={c.y} r="3" fill="white" />
                    <text x={c.x} y={c.y - 14} fontSize="12" fill="#1f2937" textAnchor="middle" fontWeight="bold">{c.valor}</text>
                    <text x={c.x} y={h - padB + 18} fontSize="11" fill="#6b7280" textAnchor="middle">{c.label}</text>
                  </g>
                ))}
                <line x1={padL} y1={padT + innerH} x2={w - padR} y2={padT + innerH} stroke="#d1d5db" />
              </svg>
            );
          })()}
        </div>

        {/* STATUS ATENDENTES + EVOLUÇÃO POR HORA */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 16 }}>
          <div style={{ ...cardStyle, padding: 22 }}>
            <p style={{ color: "#1f2937", fontSize: 14, margin: "0 0 16px", fontWeight: 700 }}>🟢 Status dos Atendentes</p>
            {statusAtendentes.length === 0 ? (
              <p style={{ color: "#9ca3af", fontSize: 13, textAlign: "center", padding: "20px 0" }}>Nenhum atendente cadastrado</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 320, overflowY: "auto" }}>
                {statusAtendentes.map(a => (
                  <div key={a.email} style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "10px 14px", background: a.online ? "#f0fdf4" : "#f9fafb", borderRadius: 10,
                    border: `1px solid ${a.online ? "#bbf7d0" : "#e5e7eb"}`,
                  }}>
                    <div style={{ position: "relative" }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: "50%",
                        background: a.online ? "#16a34a20" : "#f3f4f6",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: a.online ? "#16a34a" : "#6b7280", fontWeight: 700, fontSize: 14,
                        border: `1px solid ${a.online ? "#16a34a40" : "#e5e7eb"}`,
                      }}>{a.nome.charAt(0).toUpperCase()}</div>
                      <span style={{
                        position: "absolute", bottom: -1, right: -1,
                        width: 12, height: 12, borderRadius: "50%",
                        background: a.online ? "#16a34a" : "#d1d5db",
                        border: "2px solid #ffffff",
                        boxShadow: a.online ? "0 0 0 3px #16a34a25" : "none",
                      }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ color: "#1f2937", fontSize: 13, margin: 0, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.nome}</p>
                      <p style={{ color: a.online ? "#16a34a" : "#9ca3af", fontSize: 11, margin: "2px 0 0", fontWeight: 500 }}>{a.online ? "🟢 Ativo agora" : "⚫ Inativo"}</p>
                    </div>
                    {a.atendendoAgora > 0 && (
                      <span style={{ background: "#2563eb15", color: "#2563eb", fontSize: 11, padding: "4px 12px", borderRadius: 12, fontWeight: 700, whiteSpace: "nowrap", border: "1px solid #2563eb30" }}>
                        {a.atendendoAgora} ativo{a.atendendoAgora > 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
            <p style={{ color: "#9ca3af", fontSize: 10, margin: "12px 0 0", lineHeight: 1.4 }}>"Ativo" = atendente que tratou pelo menos 1 chat nas últimas 4h</p>
          </div>

          <div style={{ ...cardStyle, padding: 22 }}>
            <p style={{ color: "#1f2937", fontSize: 14, margin: "0 0 16px", fontWeight: 700 }}>📈 Evolução de Tickets por Hora</p>
            {(() => {
              const total = evolucaoPorHora.reduce((s, b) => s + b.count, 0);
              const max = Math.max(...evolucaoPorHora.map(b => b.count), 1);
              const w = 600, h = 240;
              const padL = 30, padR = 12, padT = 30, padB = 30;
              const innerW = w - padL - padR;
              const innerH = h - padT - padB;
              const stepX = innerW / 23;
              const coords = evolucaoPorHora.map((b, i) => ({ x: padL + stepX * i, y: padT + innerH - (b.count / max) * innerH, count: b.count, hora: b.hora }));
              return (
                <>
                  <p style={{ color: "#6b7280", fontSize: 12, margin: "0 0 10px", textAlign: "center", fontWeight: 500 }}>
                    Atendimentos hoje: <b style={{ color: "#8b5cf6" }}>{total}</b>
                  </p>
                  <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: "auto", display: "block" }}>
                    <defs>
                      <linearGradient id="gradHora" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.2" />
                        <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    {[0.5, 1].map((p, i) => (
                      <line key={i} x1={padL} y1={padT + innerH - innerH * p} x2={w - padR} y2={padT + innerH - innerH * p} stroke="#e5e7eb" strokeDasharray="4 4" />
                    ))}
                    {(() => {
                      const path = coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x} ${c.y}`).join(" ");
                      const pathArea = path + ` L ${coords[coords.length - 1].x} ${padT + innerH} L ${coords[0].x} ${padT + innerH} Z`;
                      return (
                        <>
                          <path d={pathArea} fill="url(#gradHora)" />
                          <path d={path} fill="none" stroke="#8b5cf6" strokeWidth="2" />
                        </>
                      );
                    })()}
                    {coords.map((c, i) => (
                      <g key={i}>
                        <circle cx={c.x} cy={c.y} r="3" fill="#8b5cf6" stroke="#ffffff" strokeWidth="1.5"><title>{c.hora}: {c.count} atendimentos</title></circle>
                        {i % 3 === 0 && <text x={c.x} y={h - padB + 14} fontSize="9" fill="#9ca3af" textAnchor="middle">{c.hora}</text>}
                      </g>
                    ))}
                    <line x1={padL} y1={padT + innerH} x2={w - padR} y2={padT + innerH} stroke="#d1d5db" />
                  </svg>
                </>
              );
            })()}
          </div>
        </div>

      </div>
    </div>
  );
}