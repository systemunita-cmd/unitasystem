"use client";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "../../lib/supabase";

// ═══ 🛠️ SUPORTE — clientes INSTALADOS do CRM + chamados ═══
type Proposta = { id: number; nome?: string | null; cpf?: string | null; telefone1?: string | null; plano?: string | null; valor_plano?: number | null; status_venda?: string | null; data_instalacao?: string | null; dados_customizados?: Record<string, any> | null; created_at: string };
type Chamado = { id: number; proposta_id: number; observacoes?: string | null; solucao?: string | null; pendencia?: string | null; status: string; criado_por?: string | null; created_at: string };

const STATUS_OPCOES = ["ABERTO", "EM ANDAMENTO", "PENDENTE", "RESOLVIDO"];
const corStatus: Record<string, string> = { ABERTO: "#dc2626", "EM ANDAMENTO": "#d97706", PENDENTE: "#7c3aed", RESOLVIDO: "#16a34a" };

export default function Suporte() {
  const [propostas, setPropostas] = useState<Proposta[]>([]);
  const [chamados, setChamados] = useState<Chamado[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<number | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [form, setForm] = useState({ observacoes: "", solucao: "", pendencia: "", status: "ABERTO" });
  const [salvando, setSalvando] = useState(false);
  const [tabelaFalta, setTabelaFalta] = useState(false);

  const fetchTudo = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      setUserEmail(user?.email || "");
      let lista: Proposta[] = []; let ultimoId: number | null = null;
      for (let i = 0; i < 60; i++) {
        let q = supabase.from("proposta").select("id, nome, cpf, telefone1, plano, valor_plano, status_venda, data_instalacao, dados_customizados, created_at").eq("status_venda", "INSTALADA").order("id", { ascending: false }).limit(1000);
        if (ultimoId != null) q = q.lt("id", ultimoId);
        const { data, error } = await q; if (error) throw error;
        const pg = data || []; lista = lista.concat(pg);
        if (pg.length < 1000) break; ultimoId = pg[pg.length - 1].id;
      }
      setPropostas(lista);
      const { data: ch, error: e2 } = await supabase.from("suporte_chamados").select("*").order("created_at", { ascending: false }).limit(5000);
      if (e2) { if ((e2 as any).code === "PGRST205") setTabelaFalta(true); setChamados([]); }
      else setChamados((ch || []) as Chamado[]);
    } catch { /* segue */ }
    setLoading(false);
  };
  useEffect(() => { fetchTudo(); }, []);
  useEffect(() => {
    const ch = supabase.channel("suporte_rt_unita")
      .on("postgres_changes", { event: "*", schema: "public", table: "proposta" }, () => fetchTudo())
      .on("postgres_changes", { event: "*", schema: "public", table: "suporte_chamados" }, () => fetchTudo())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 📅 filtro de período (pela data de instalação; sem data usa o cadastro)
  const isoL = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const [range, setRange] = useState<"todos" | "hoje" | "7d" | "30d" | "custom">("todos");
  const [dIni, setDIni] = useState(""); const [dFim, setDFim] = useState("");
  const aplicarRange = (r: typeof range) => {
    setRange(r); setPagina(1);
    if (r === "todos" || r === "custom") return;
    const h = new Date(); const fim = isoL(h); let ini = fim;
    if (r !== "hoje") { const d = new Date(h); d.setDate(d.getDate() - (r === "7d" ? 6 : 29)); ini = isoL(d); }
    setDIni(ini); setDFim(fim);
  };
  const [pagina, setPagina] = useState(1);

  const chamadosPor = useMemo(() => {
    const m = new Map<number, Chamado[]>();
    for (const c of chamados) { const a = m.get(c.proposta_id) || []; a.push(c); m.set(c.proposta_id, a); }
    return m;
  }, [chamados]);

  const filtradas = useMemo(() => {
    if (!busca) return propostas;
    const t = busca.toLowerCase(); const dig = busca.replace(/\D/g, "");
    return propostas.filter(p => (p.nome || "").toLowerCase().includes(t)
      || (dig.length > 0 && String(p.cpf || "").replace(/\D/g, "").includes(dig))
      || String(p.cpf || "").includes(busca)
      || String(p.dados_customizados?.os || "").toLowerCase().includes(t)
      || String(p.telefone1 || "").includes(busca));
  }, [propostas, busca]);

  const filtradasPeriodo = useMemo(() => {
    if (range === "todos") return filtradas;
    return filtradas.filter(p => {
      const d = p.data_instalacao || (p.created_at || "").slice(0, 10);
      if (!d) return false;
      if (dIni && d < dIni) return false;
      if (dFim && d > dFim) return false;
      return true;
    });
  }, [filtradas, range, dIni, dFim]);
  const POR_PAG = 30;
  const totPag = Math.max(1, Math.ceil(filtradasPeriodo.length / POR_PAG));
  const pagAtual = Math.min(pagina, totPag);
  const visiveis = filtradasPeriodo.slice((pagAtual - 1) * POR_PAG, pagAtual * POR_PAG);

  const salvar = async (p: Proposta) => {
    if (!form.observacoes.trim()) { alert("Preencha as observações (o que o cliente quer)."); return; }
    setSalvando(true);
    const up = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
    const { error } = await supabase.from("suporte_chamados").insert([{
      proposta_id: p.id, observacoes: up(form.observacoes), solucao: up(form.solucao),
      pendencia: up(form.pendencia), status: form.status, criado_por: userEmail,
    }]);
    setSalvando(false);
    if (error) { alert("Erro ao salvar: " + error.message + (tabelaFalta ? "\n\nRode o suporte_supabase.sql no Supabase." : "")); return; }
    setForm({ observacoes: "", solucao: "", pendencia: "", status: "ABERTO" });
    await fetchTudo();
  };

  const mudarStatus = async (c: Chamado, novo: string) => {
    await supabase.from("suporte_chamados").update({ status: novo }).eq("id", c.id);
    setChamados(prev => prev.map(x => x.id === c.id ? { ...x, status: novo } : x));
  };

  const card = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14 } as const;
  const inp = { width: "100%", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "9px 12px", fontSize: 13, color: "#1f2937", boxSizing: "border-box" as const, outline: "none" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 46, height: 46, borderRadius: 13, background: "linear-gradient(135deg, #0d9488 0%, #14b8a6 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, boxShadow: "0 8px 20px rgba(13,148,136,0.25)" }}><span style={{ filter: "saturate(0) brightness(2)" }}>🛠️</span></div>
        <div><h1 style={{ margin: 0, color: "#1f2937", fontSize: 22, fontWeight: 800 }}>Suporte</h1>
          <p style={{ margin: "2px 0 0", color: "#6b7280", fontSize: 12 }}><b style={{ color: "#0d9488" }}>{filtradasPeriodo.length}</b> de <b style={{ color: "#0d9488" }}>{propostas.length}</b> cliente(s) instalados · registre o que o cliente pediu, a solução e o status</p></div>
      </div>
      {tabelaFalta && <div style={{ ...card, padding: "12px 16px", borderLeft: "4px solid #f59e0b", color: "#92400e", fontSize: 13, fontWeight: 700 }}>⚠️ Rode o <code>suporte_supabase.sql</code> no Supabase pra criar a tabela de chamados.</div>}
      <div style={{ ...card, padding: 12 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input placeholder="🔍 Nome, CPF, OS ou telefone..." value={busca} onChange={e => { setBusca(e.target.value); setPagina(1); }} style={{ ...inp, maxWidth: 360, flex: "1 1 220px", borderRadius: 20 }} />
          {([["todos", "Todos"], ["hoje", "Hoje"], ["7d", "7 dias"], ["30d", "30 dias"], ["custom", "Personalizado"]] as [typeof range, string][]).map(([k, l]) => (
            <button key={k} onClick={() => aplicarRange(k)} style={{ background: range === k ? "#0d9488" : "#fff", color: range === k ? "#fff" : "#6b7280", border: `1px solid ${range === k ? "#0d9488" : "#e5e7eb"}`, borderRadius: 20, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>{l}</button>
          ))}
          {range === "custom" && (<>
            <input type="date" value={dIni} onChange={e => { setDIni(e.target.value); setPagina(1); }} style={{ ...inp, maxWidth: 150 }} />
            <input type="date" value={dFim} onChange={e => { setDFim(e.target.value); setPagina(1); }} style={{ ...inp, maxWidth: 150 }} />
          </>)}
        </div>
      </div>
      {loading ? <div style={{ ...card, padding: 40, textAlign: "center", color: "#6b7280" }}>⏳ Carregando clientes...</div> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {visiveis.map(p => {
            const meus = chamadosPor.get(p.id) || [];
            const ultimo = meus[0];
            const ab = aberto === p.id;
            return (
              <div key={p.id}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 14px rgba(13,148,136,0.12)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = "none"; }}
                style={{ ...card, borderLeft: `4px solid ${ultimo ? (corStatus[ultimo.status] || "#6b7280") : "#99f6e4"}`, transition: "box-shadow 0.15s" }}>
                <div onClick={() => { setAberto(ab ? null : p.id); if (!ab) setForm({ observacoes: "", solucao: "", pendencia: "", status: "ABERTO" }); }}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", cursor: "pointer", flexWrap: "wrap" }}>
                  <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                    <p style={{ margin: 0, color: "#1f2937", fontSize: 13.5, fontWeight: 800 }}>{p.nome}</p>
                    <p style={{ margin: "2px 0 0", color: "#6b7280", fontSize: 11 }}>{p.cpf || ""} {p.dados_customizados?.os ? `· OS ${p.dados_customizados.os}` : ""} · {p.plano || ""}</p>
                  </div>
                  <span style={{ color: "#0d9488", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>📅 {p.data_instalacao ? new Date(p.data_instalacao + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</span>
                  {ultimo && <span style={{ background: `${corStatus[ultimo.status] || "#6b7280"}15`, color: corStatus[ultimo.status] || "#6b7280", border: `1px solid ${corStatus[ultimo.status] || "#6b7280"}40`, padding: "3px 10px", borderRadius: 10, fontSize: 10.5, fontWeight: 800 }}>{ultimo.status} · {meus.length} chamado(s)</span>}
                  <span style={{ color: "#9ca3af", fontWeight: 700 }}>{ab ? "▾" : "▸"}</span>
                </div>
                {ab && (
                  <div style={{ borderTop: "1px solid #f3f4f6", padding: 16, display: "flex", flexDirection: "column", gap: 12, background: "#f8fafc" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <div style={{ gridColumn: "1 / -1" }}><label style={{ fontSize: 10, fontWeight: 800, color: "#6b7280", textTransform: "uppercase" }}>Observações (o que o cliente quer / o que aconteceu) *</label>
                        <textarea rows={2} value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} style={{ ...inp, resize: "vertical", fontFamily: "inherit" }} /></div>
                      <div><label style={{ fontSize: 10, fontWeight: 800, color: "#6b7280", textTransform: "uppercase" }}>Solução aplicada</label>
                        <textarea rows={2} value={form.solucao} onChange={e => setForm(f => ({ ...f, solucao: e.target.value }))} style={{ ...inp, resize: "vertical", fontFamily: "inherit" }} /></div>
                      <div><label style={{ fontSize: 10, fontWeight: 800, color: "#6b7280", textTransform: "uppercase" }}>Pendência</label>
                        <textarea rows={2} value={form.pendencia} onChange={e => setForm(f => ({ ...f, pendencia: e.target.value }))} style={{ ...inp, resize: "vertical", fontFamily: "inherit" }} /></div>
                      <div><label style={{ fontSize: 10, fontWeight: 800, color: "#6b7280", textTransform: "uppercase" }}>Status</label>
                        <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} style={inp}>{STATUS_OPCOES.map(s => <option key={s}>{s}</option>)}</select></div>
                    </div>
                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      <button onClick={() => salvar(p)} disabled={salvando} style={{ background: "linear-gradient(135deg, #0d9488 0%, #14b8a6 100%)", color: "#fff", border: "none", borderRadius: 10, padding: "10px 24px", fontSize: 13, fontWeight: 800, cursor: "pointer", boxShadow: "0 4px 12px rgba(13,148,136,0.3)" }}>{salvando ? "⏳ Salvando..." : "💾 Registrar chamado"}</button>
                    </div>
                    {meus.length > 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <p style={{ margin: 0, fontSize: 10, fontWeight: 800, color: "#6b7280", textTransform: "uppercase" }}>Histórico</p>
                        {meus.map(c => (
                          <div key={c.id} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 12px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                              <select value={c.status} onChange={e => mudarStatus(c, e.target.value)} style={{ border: `1px solid ${corStatus[c.status] || "#e5e7eb"}`, color: corStatus[c.status] || "#374151", borderRadius: 8, padding: "3px 8px", fontSize: 11, fontWeight: 800, background: "#fff" }}>{STATUS_OPCOES.map(s => <option key={s}>{s}</option>)}</select>
                              <span style={{ color: "#9ca3af", fontSize: 10.5 }}>{new Date(c.created_at).toLocaleString("pt-BR")} · {String(c.criado_por || "").split("@")[0]}</span>
                            </div>
                            <p style={{ margin: 0, fontSize: 12, color: "#1f2937" }}><b>Obs:</b> {c.observacoes || "—"}</p>
                            {c.solucao && <p style={{ margin: "2px 0 0", fontSize: 12, color: "#15803d" }}><b>Solução:</b> {c.solucao}</p>}
                            {c.pendencia && <p style={{ margin: "2px 0 0", fontSize: 12, color: "#b45309" }}><b>Pendência:</b> {c.pendencia}</p>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {filtradasPeriodo.length > POR_PAG && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <span style={{ color: "#6b7280", fontSize: 12 }}>Mostrando {(pagAtual - 1) * POR_PAG + 1}–{Math.min(pagAtual * POR_PAG, filtradasPeriodo.length)} de {filtradasPeriodo.length.toLocaleString("pt-BR")}</span>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => setPagina(x => Math.max(1, x - 1))} disabled={pagAtual === 1} style={{ background: "#fff", color: pagAtual === 1 ? "#9ca3af" : "#0d9488", border: "1px solid #e5e7eb", borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: pagAtual === 1 ? "default" : "pointer" }}>‹ Anterior</button>
                <span style={{ color: "#1f2937", fontSize: 12, fontWeight: 700, padding: "6px 8px" }}>{pagAtual}/{totPag}</span>
                <button onClick={() => setPagina(x => Math.min(totPag, x + 1))} disabled={pagAtual === totPag} style={{ background: "#fff", color: pagAtual === totPag ? "#9ca3af" : "#0d9488", border: "1px solid #e5e7eb", borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: pagAtual === totPag ? "default" : "pointer" }}>Próxima ›</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}