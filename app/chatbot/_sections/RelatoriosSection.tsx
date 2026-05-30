"use client";
import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { useTemPermissao } from "../../hooks/useTemPermissao";
import * as XLSX from "xlsx";

// ═══════════════════════════════════════════════════════════════════════
// 📈 RELATÓRIOS — UnitaSystem (single-tenant)
// ───────────────────────────────────────────────────────────────────────
// Filtra atendimentos por período/status/equipe/fila/atendente/etiqueta
// e exporta tudo pra Excel (.xlsx). Paginação até 20k registros.
//
// Tabelas: atendimentos, etiquetas, atendimento_etiquetas, equipes, filas
// ═══════════════════════════════════════════════════════════════════════

type Atendimento = {
  id: number;
  created_at: string;
  numero: string;
  nome: string;
  mensagem: string;
  status: string;
  fila: string;
  atendente: string;
};

type Etiqueta = { id: number; nome: string; cor: string; icone: string };
type Equipe = { id: number; nome: string };

export function RelatoriosSection() {
  // 🛡️ Sistema novo de permissões
  const perm = useTemPermissao();
  const escopoAcessar = perm.escopo("relatorios_atend.ver");
  const podeAcessar = perm.superAdmin || escopoAcessar !== "none";

  const [atendimentos, setAtendimentos] = useState<Atendimento[]>([]);
  const [resultado, setResultado] = useState<Atendimento[]>([]);
  const [etiquetas, setEtiquetas] = useState<Etiqueta[]>([]);
  const [etiquetasPorAtend, setEtiquetasPorAtend] = useState<Record<number, number[]>>({});
  const [equipes, setEquipes] = useState<Equipe[]>([]);
  const [filaEquipeMap, setFilaEquipeMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [gerado, setGerado] = useState(false);

  const [periodo, setPeriodo] = useState<"hoje" | "semana" | "mes" | "customizado" | "todas">("todas");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [filtroEquipe, setFiltroEquipe] = useState("todas");
  const [filtroFila, setFiltroFila] = useState("todas");
  const [filtroAtendente, setFiltroAtendente] = useState("todos");
  const [filtroEtiqueta, setFiltroEtiqueta] = useState("todas");
  const [truncado, setTruncado] = useState(false);

  const IS = { background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 14px", color: "#1f2937", fontSize: 13, width: "100%", boxSizing: "border-box" as const, outline: "none", transition: "border-color 0.15s, box-shadow 0.15s" };

  const cardStyle = {
    background: "#ffffff",
    borderRadius: 14,
    border: "1px solid #e5e7eb",
    boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
  };

  useEffect(() => {
    const fetchTudo = async () => {
      const PAGE_SIZE = 1000;
      const TOTAL_LIMITE = 20000;
      const fetchAtendimentosPaginado = async (): Promise<Atendimento[]> => {
        let lista: Atendimento[] = [];
        let offset = 0;
        while (offset < TOTAL_LIMITE) {
          const { data: pagina, error } = await supabase.from("atendimentos")
            .select("*")
            .order("created_at", { ascending: false })
            .range(offset, offset + PAGE_SIZE - 1);
          if (error) { console.error("Erro fetchAtendimentos paginado:", error); break; }
          if (!pagina || pagina.length === 0) break;
          lista = lista.concat(pagina as Atendimento[]);
          if (pagina.length < PAGE_SIZE) break;
          offset += PAGE_SIZE;
        }
        return lista;
      };

      const [atends, resEtiq, resEquipes, resFilas] = await Promise.all([
        fetchAtendimentosPaginado(),
        supabase.from("etiquetas").select("*"),
        supabase.from("equipes").select("id, nome").eq("ativo", true).order("nome", { ascending: true }),
        supabase.from("filas").select("nome, equipe_id"),
      ]);
      setAtendimentos(atends);
      setEtiquetas(resEtiq.data || []);
      setEquipes((resEquipes.data as Equipe[]) || []);

      const mapaFE: Record<string, number> = {};
      (resFilas.data || []).forEach((f: any) => { if (f.nome && f.equipe_id) mapaFE[f.nome] = f.equipe_id; });
      setFilaEquipeMap(mapaFE);
      setTruncado(atends.length >= TOTAL_LIMITE);

      if (atends.length > 0) {
        const ids = atends.map(a => a.id);
        const LOTE_IN = 500;
        const mapa: Record<number, number[]> = {};
        for (let i = 0; i < ids.length; i += LOTE_IN) {
          const lote = ids.slice(i, i + LOTE_IN);
          const { data: relacoes } = await supabase.from("atendimento_etiquetas")
            .select("atendimento_id, etiqueta_id")
            .in("atendimento_id", lote);
          (relacoes || []).forEach(r => {
            if (!mapa[r.atendimento_id]) mapa[r.atendimento_id] = [];
            mapa[r.atendimento_id].push(r.etiqueta_id);
          });
        }
        setEtiquetasPorAtend(mapa);
      }
    };
    fetchTudo();
  }, []);

  const filas = [...new Set(atendimentos.map(a => a.fila))].filter(Boolean);
  const atendentes = [...new Set(atendimentos.map(a => a.atendente))].filter(Boolean);

  const filasFiltradas = filas.filter(f => filtroEquipe === "todas" || String(filaEquipeMap[f] || "") === filtroEquipe);

  const equipeNome = (a: Atendimento): string => {
    const eqId = filaEquipeMap[a.fila || ""] || 0;
    if (!eqId) return "";
    return equipes.find(e => e.id === eqId)?.nome || "";
  };

  const etiquetasNomes = (atendId: number): string => {
    const ids = etiquetasPorAtend[atendId] || [];
    return ids.map(id => {
      const e = etiquetas.find(et => et.id === id);
      return e ? `${e.icone} ${e.nome}` : "";
    }).filter(Boolean).join(", ");
  };

  const filtrarPorPeriodo = (items: Atendimento[]): Atendimento[] => {
    if (periodo === "todas") return items;
    const agora = new Date();
    let dtInicio: Date | null = null;
    let dtFim: Date | null = null;
    if (periodo === "hoje") {
      dtInicio = new Date(agora); dtInicio.setHours(0, 0, 0, 0);
      dtFim = new Date(agora); dtFim.setHours(23, 59, 59, 999);
    } else if (periodo === "semana") {
      dtInicio = new Date(agora); dtInicio.setDate(dtInicio.getDate() - 7); dtInicio.setHours(0, 0, 0, 0);
      dtFim = new Date(agora);
    } else if (periodo === "mes") {
      dtInicio = new Date(agora); dtInicio.setDate(dtInicio.getDate() - 30); dtInicio.setHours(0, 0, 0, 0);
      dtFim = new Date(agora);
    } else if (periodo === "customizado") {
      if (dataInicio) dtInicio = new Date(dataInicio + "T00:00:00");
      if (dataFim) dtFim = new Date(dataFim + "T23:59:59");
    }
    return items.filter(a => {
      const dt = new Date(a.created_at);
      if (dtInicio && dt < dtInicio) return false;
      if (dtFim && dt > dtFim) return false;
      return true;
    });
  };

  const gerarRelatorio = () => {
    setLoading(true);
    let filtrados = filtrarPorPeriodo(atendimentos);
    if (filtroStatus !== "todos") filtrados = filtrados.filter(a => a.status === filtroStatus);
    if (filtroEquipe !== "todas") filtrados = filtrados.filter(a => String(filaEquipeMap[a.fila || ""] || "") === filtroEquipe);
    if (filtroFila !== "todas") filtrados = filtrados.filter(a => a.fila === filtroFila);
    if (filtroAtendente !== "todos") filtrados = filtrados.filter(a => a.atendente === filtroAtendente);
    if (filtroEtiqueta !== "todas") {
      const etId = parseInt(filtroEtiqueta);
      filtrados = filtrados.filter(a => (etiquetasPorAtend[a.id] || []).includes(etId));
    }
    setResultado(filtrados);
    setGerado(true);
    setLoading(false);
  };

  const exportarExcel = () => {
    if (resultado.length === 0) { alert("Nenhum atendimento para exportar!"); return; }
    setExportando(true);
    try {
      const dados = resultado.map(a => ({
        "Nome": a.nome || "",
        "Telefone": (a.numero || "").replace(/\D/g, ""),
        "Etiqueta": etiquetasNomes(a.id),
        "Equipe": equipeNome(a),
        "Fila": a.fila || "",
        "Atendente": a.atendente || "",
        "Status": a.status === "resolvido" ? "Resolvido" : a.status === "aberto" ? "Aberto" : a.status === "pendente" ? "Pendente" : a.status,
        "Data": new Date(a.created_at).toLocaleString("pt-BR"),
      }));
      const ws = XLSX.utils.json_to_sheet(dados);
      ws["!cols"] = [
        { wch: 28 }, { wch: 18 }, { wch: 30 }, { wch: 20 }, { wch: 18 }, { wch: 25 }, { wch: 12 }, { wch: 20 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Atendimentos");
      const hoje = new Date().toISOString().split("T")[0];
      XLSX.writeFile(wb, `relatorio_unita_${hoje}.xlsx`);
    } catch (e: any) { alert("Erro ao exportar: " + e.message); }
    setExportando(false);
  };

  const limparFiltros = () => {
    setPeriodo("todas");
    setDataInicio("");
    setDataFim("");
    setFiltroStatus("todos");
    setFiltroEquipe("todas");
    setFiltroFila("todas");
    setFiltroAtendente("todos");
    setFiltroEtiqueta("todas");
    setGerado(false);
  };


  // 🛡️ Guard visual
  if (perm.carregando) {
    return <div style={{ padding: 24, color: "#6b7280", fontSize: 13 }}>⏳ Verificando permissões...</div>;
  }
  if (!podeAcessar) {
    return (
      <div style={{ padding: 32, textAlign: "center" }}>
        <div style={{ fontSize: 36, marginBottom: 8 }}>🔒</div>
        <p style={{ color: "#1f2937", fontWeight: 700, margin: "0 0 4px" }}>Sem acesso</p>
        <p style={{ color: "#9ca3af", fontSize: 12 }}>Grupo: <b>{perm.grupoNome || "(sem grupo)"}</b></p>
      </div>
    );
  }
  return (
    <div style={{ padding: 32, display: "flex", flexDirection: "column", gap: 24, overflowY: "auto", height: "100vh", background: "#f8fafc" }}>

      {/* HEADER */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14,
            background: "linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 24, boxShadow: "0 8px 20px rgba(139,92,246,0.25)",
          }}>
            <span style={{ filter: "saturate(0) brightness(2)" }}>📈</span>
          </div>
          <div>
            <h1 style={{ color: "#1f2937", fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: -0.3 }}>Relatórios</h1>
            <p style={{ color: "#6b7280", fontSize: 13, margin: "2px 0 0" }}>Filtre e exporte seus atendimentos em Excel</p>
          </div>
        </div>

        {truncado && (
          <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 12, padding: "12px 16px", marginTop: 14, display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 22 }}>⚠️</span>
            <div style={{ flex: 1 }}>
              <p style={{ color: "#92400e", fontSize: 13, fontWeight: 700, margin: 0 }}>Mostrando os 20.000 atendimentos mais recentes</p>
              <p style={{ color: "#78350f", fontSize: 11, margin: "2px 0 0", lineHeight: 1.4 }}>
                Pra análise de períodos antigos, use o filtro <b>Personalizado</b> com data específica e exporte em fatias.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* FILTROS */}
      <div style={{ ...cardStyle, padding: 24, display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <p style={{ color: "#6b7280", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, margin: 0 }}>🔍 Filtros</p>
          <button onClick={limparFiltros} style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", fontSize: 11, fontWeight: 700, cursor: "pointer", padding: "6px 12px", borderRadius: 8 }}>✕ Limpar tudo</button>
        </div>

        {/* PERÍODO */}
        <div>
          <label style={{ color: "#6b7280", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 10 }}>📅 Período</label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[
              { key: "todas", label: "🌐 Todas", color: "#8b5cf6" },
              { key: "hoje", label: "📆 Hoje", color: "#16a34a" },
              { key: "semana", label: "🗓️ Últimos 7 dias", color: "#2563eb" },
              { key: "mes", label: "📊 Últimos 30 dias", color: "#f59e0b" },
              { key: "customizado", label: "🎯 Personalizado", color: "#ec4899" },
            ].map(p => {
              const ativo = periodo === p.key;
              return (
                <button key={p.key} onClick={() => setPeriodo(p.key as any)}
                  style={{
                    background: ativo ? `${p.color}15` : "#f9fafb",
                    color: ativo ? p.color : "#6b7280",
                    border: `1px solid ${ativo ? `${p.color}50` : "#e5e7eb"}`,
                    borderRadius: 10, padding: "8px 16px", fontSize: 12,
                    cursor: "pointer", fontWeight: ativo ? 700 : 600,
                    boxShadow: ativo ? `0 2px 8px ${p.color}25` : "none",
                  }}>
                  {p.label}
                </button>
              );
            })}
          </div>

          {periodo === "customizado" && (
            <div style={{ display: "flex", gap: 12, marginTop: 14 }}>
              <div style={{ flex: 1 }}>
                <label style={{ color: "#6b7280", fontSize: 10, fontWeight: 700, display: "block", marginBottom: 4, textTransform: "uppercase" }}>De:</label>
                <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} style={{ ...IS, colorScheme: "light" }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ color: "#6b7280", fontSize: 10, fontWeight: 700, display: "block", marginBottom: 4, textTransform: "uppercase" }}>Até:</label>
                <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} style={{ ...IS, colorScheme: "light" }} />
              </div>
            </div>
          )}
        </div>

        {/* OUTROS FILTROS */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          <div>
            <label style={{ color: "#6b7280", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 6 }}>Status</label>
            <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} style={IS}>
              <option value="todos">Todos</option>
              <option value="aberto">💬 Aberto</option>
              <option value="pendente">⏳ Pendente</option>
              <option value="resolvido">✅ Resolvido</option>
            </select>
          </div>
          {equipes.length > 0 && (
            <div>
              <label style={{ color: "#6b7280", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 6 }}>👥 Equipe</label>
              <select value={filtroEquipe}
                onChange={e => {
                  const nova = e.target.value;
                  setFiltroEquipe(nova);
                  if (nova !== "todas" && filtroFila !== "todas" && String(filaEquipeMap[filtroFila] || "") !== nova) setFiltroFila("todas");
                }} style={IS}>
                <option value="todas">Todas</option>
                {equipes.map(eq => <option key={eq.id} value={String(eq.id)}>👥 {eq.nome}</option>)}
              </select>
            </div>
          )}
          <div>
            <label style={{ color: "#6b7280", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 6 }}>Fila</label>
            <select value={filtroFila} onChange={e => setFiltroFila(e.target.value)} style={IS}>
              <option value="todas">Todas</option>
              {filasFiltradas.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div>
            <label style={{ color: "#6b7280", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 6 }}>Atendente</label>
            <select value={filtroAtendente} onChange={e => setFiltroAtendente(e.target.value)} style={IS}>
              <option value="todos">Todos</option>
              {atendentes.map(a => <option key={a} value={a}>{a === "BOT" ? "🤖 BOT" : a}</option>)}
            </select>
          </div>
          <div>
            <label style={{ color: "#6b7280", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 6 }}>Etiqueta</label>
            <select value={filtroEtiqueta} onChange={e => setFiltroEtiqueta(e.target.value)} style={IS}>
              <option value="todas">Todas</option>
              {etiquetas.map(e => <option key={e.id} value={e.id.toString()}>{e.icone} {e.nome}</option>)}
            </select>
          </div>
        </div>

        <button onClick={gerarRelatorio} disabled={loading}
          style={{
            background: loading ? "#1e40af" : "linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)",
            color: "white", border: "none", borderRadius: 12,
            padding: "14px", fontSize: 14, cursor: "pointer", fontWeight: 700,
            boxShadow: "0 4px 12px rgba(37,99,235,0.3)",
          }}>
          {loading ? "⏳ Gerando..." : "🔍 Gerar Relatório"}
        </button>
      </div>

      {/* RESULTADO */}
      {gerado && (
        <>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            {[
              { label: "Total", value: resultado.length, color: "#8b5cf6", icon: "📊" },
              { label: "Abertos", value: resultado.filter(a => a.status === "aberto").length, color: "#2563eb", icon: "💬" },
              { label: "Pendentes", value: resultado.filter(a => a.status === "pendente").length, color: "#f59e0b", icon: "⏳" },
              { label: "Resolvidos", value: resultado.filter(a => a.status === "resolvido").length, color: "#16a34a", icon: "✅" },
            ].map(card => (
              <div key={card.label}
                style={{ flex: "1 1 180px", ...cardStyle, padding: 22, borderTop: `3px solid ${card.color}`, transition: "all 0.15s" }}
                onMouseEnter={(e) => { e.currentTarget.style.boxShadow = `0 8px 20px ${card.color}20`; e.currentTarget.style.transform = "translateY(-2px)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)"; e.currentTarget.style.transform = "translateY(0)"; }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: `${card.color}15`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>{card.icon}</div>
                  <p style={{ color: "#6b7280", fontSize: 12, margin: 0, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.3 }}>{card.label}</p>
                </div>
                <p style={{ color: card.color, fontSize: 34, fontWeight: 800, margin: 0, letterSpacing: -1 }}>{card.value}</p>
              </div>
            ))}
          </div>

          <div style={{ ...cardStyle, overflow: "hidden" }}>
            <div style={{ padding: "16px 22px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
              <h2 style={{ color: "#1f2937", fontSize: 14, fontWeight: 700, margin: 0 }}>
                Atendimentos — <span style={{ color: "#2563eb" }}>{resultado.length}</span> resultado(s)
              </h2>
              <button onClick={exportarExcel} disabled={exportando || resultado.length === 0}
                style={{
                  background: exportando ? "#15803d" : "linear-gradient(135deg, #16a34a 0%, #22c55e 100%)",
                  color: "white", border: "none", borderRadius: 10,
                  padding: "10px 22px", fontSize: 13, cursor: "pointer", fontWeight: 700,
                  boxShadow: "0 4px 12px rgba(22,163,74,0.3)",
                }}>
                {exportando ? "⏳ Exportando..." : "📥 Exportar Excel (.xlsx)"}
              </button>
            </div>
            {resultado.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center" }}>
                <p style={{ fontSize: 40, margin: "0 0 10px" }}>📭</p>
                <p style={{ color: "#6b7280", fontSize: 13 }}>Nenhum atendimento encontrado com esses filtros</p>
              </div>
            ) : (
              <div style={{ overflowX: "auto", maxHeight: 560, overflowY: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead style={{ position: "sticky", top: 0, zIndex: 1 }}>
                    <tr style={{ background: "#f9fafb" }}>
                      {["Nome", "Telefone", "Etiquetas", "Equipe", "Fila", "Atendente", "Status", "Data"].map(h => (
                        <th key={h} style={{ padding: "12px 18px", color: "#6b7280", fontSize: 11, textAlign: "left", textTransform: "uppercase", letterSpacing: 0.5, whiteSpace: "nowrap", fontWeight: 700, borderBottom: "1px solid #e5e7eb" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {resultado.map((a, i) => {
                      const ids = etiquetasPorAtend[a.id] || [];
                      const etiqs = ids.map(id => etiquetas.find(e => e.id === id)).filter(Boolean) as Etiqueta[];
                      const eqNome = equipeNome(a);
                      return (
                        <tr key={a.id}
                          style={{ borderTop: "1px solid #f3f4f6", background: i % 2 === 0 ? "#ffffff" : "#fafbfc" }}
                          onMouseEnter={(e) => e.currentTarget.style.background = "#f3f4f6"}
                          onMouseLeave={(e) => e.currentTarget.style.background = i % 2 === 0 ? "#ffffff" : "#fafbfc"}>
                          <td style={{ padding: "14px 18px", color: "#1f2937", fontSize: 13, fontWeight: 600 }}>{a.nome}</td>
                          <td style={{ padding: "14px 18px", color: "#6b7280", fontSize: 12, fontFamily: "monospace" }}>{(a.numero || "").replace(/\D/g, "")}</td>
                          <td style={{ padding: "14px 18px" }}>
                            {etiqs.length === 0 ? (
                              <span style={{ color: "#d1d5db", fontSize: 11 }}>—</span>
                            ) : (
                              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                                {etiqs.map(e => (
                                  <span key={e.id} style={{ background: e.cor + "15", border: `1px solid ${e.cor}`, color: e.cor, fontSize: 10, padding: "3px 8px", borderRadius: 10, display: "inline-flex", alignItems: "center", gap: 3, fontWeight: 600 }}>
                                    <span>{e.icone}</span>{e.nome}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: "14px 18px" }}>
                            {eqNome ? (
                              <span style={{ background: "#a855f715", color: "#a855f7", fontSize: 11, padding: "4px 10px", borderRadius: 10, fontWeight: 600, border: "1px solid #a855f730", whiteSpace: "nowrap" }}>👥 {eqNome}</span>
                            ) : (
                              <span style={{ color: "#d1d5db", fontSize: 11 }}>—</span>
                            )}
                          </td>
                          <td style={{ padding: "14px 18px" }}>
                            {a.fila ? (
                              <span style={{ background: "#2563eb15", color: "#2563eb", fontSize: 11, padding: "4px 10px", borderRadius: 10, fontWeight: 600, border: "1px solid #2563eb30" }}>{a.fila}</span>
                            ) : (
                              <span style={{ color: "#d1d5db", fontSize: 11 }}>—</span>
                            )}
                          </td>
                          <td style={{ padding: "14px 18px", color: "#4b5563", fontSize: 12, fontWeight: 500 }}>{a.atendente === "BOT" ? "🤖 BOT" : a.atendente || <span style={{ color: "#d1d5db" }}>—</span>}</td>
                          <td style={{ padding: "14px 18px" }}>
                            <span style={{
                              background: a.status === "resolvido" ? "#f0fdf4" : a.status === "aberto" ? "#eff6ff" : "#fffbeb",
                              color: a.status === "resolvido" ? "#16a34a" : a.status === "aberto" ? "#2563eb" : "#f59e0b",
                              border: `1px solid ${a.status === "resolvido" ? "#bbf7d0" : a.status === "aberto" ? "#bfdbfe" : "#fde68a"}`,
                              fontSize: 11, padding: "4px 10px", borderRadius: 10, fontWeight: 700, whiteSpace: "nowrap",
                            }}>
                              {a.status === "resolvido" ? "✅ Resolvido" : a.status === "aberto" ? "💬 Aberto" : "⏳ Pendente"}
                            </span>
                          </td>
                          <td style={{ padding: "14px 18px", color: "#6b7280", fontSize: 12, whiteSpace: "nowrap" }}>
                            {new Date(a.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}