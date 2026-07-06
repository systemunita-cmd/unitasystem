"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

type Proposta = {
  id: number;
  nome?: string | null;
  cpf?: string | null;
  telefone1?: string | null;
  plano?: string | null;
  valor_plano?: number | null;
  status_venda?: string | null;
  data_instalacao?: string | null;
  dados_customizados?: Record<string, any> | null;
  created_at: string;
};

type Chamado = {
  id: number;
  proposta_id: number;
  observacoes?: string | null;
  solucao?: string | null;
  pendencia?: string | null;
  status: string;
  criado_por?: string | null;
  created_at: string;
};

const STATUS_OPCOES = ["ABERTO", "EM ANDAMENTO", "PENDENTE", "RESOLVIDO"];

const statusMeta: Record<string, { label: string; cor: string; bg: string; border: string }> = {
  ABERTO: { label: "Aberto", cor: "#dc2626", bg: "#fef2f2", border: "#fecaca" },
  "EM ANDAMENTO": { label: "Em andamento", cor: "#d97706", bg: "#fffbeb", border: "#fde68a" },
  PENDENTE: { label: "Pendente", cor: "#7c3aed", bg: "#f5f3ff", border: "#ddd6fe" },
  RESOLVIDO: { label: "Resolvido", cor: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0" },
};

const corStatus = (s?: string | null) => statusMeta[String(s || "").toUpperCase()]?.cor || "#6b7280";

const isoLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const normalizar = (v: string) =>
  v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();

export default function Suporte() {
  const router = useRouter();
  const [propostas, setPropostas] = useState<Proposta[]>([]);
  const [chamados, setChamados] = useState<Chamado[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<number | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [form, setForm] = useState({ observacoes: "", solucao: "", pendencia: "", status: "ABERTO" });
  const [salvando, setSalvando] = useState(false);
  const [tabelaFalta, setTabelaFalta] = useState(false);
  const [range, setRange] = useState<"todos" | "hoje" | "7d" | "30d" | "custom">("todos");
  const [dIni, setDIni] = useState("");
  const [dFim, setDFim] = useState("");
  const [filtroStatusChamado, setFiltroStatusChamado] = useState<"todos" | "sem" | "ABERTO" | "EM ANDAMENTO" | "PENDENTE" | "RESOLVIDO">("todos");
  const [pagina, setPagina] = useState(1);

  const fetchTudo = async (mostraLoading = true) => {
    if (mostraLoading) setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      setUserEmail(user?.email || "");

      let lista: Proposta[] = [];
      let ultimoId: number | null = null;
      for (let i = 0; i < 80; i++) {
        let q = supabase.from("proposta")
          .select("id, nome, cpf, telefone1, plano, valor_plano, status_venda, data_instalacao, dados_customizados, created_at")
          .order("id", { ascending: false })
          .limit(1000);
        if (ultimoId != null) q = q.lt("id", ultimoId);
        const { data, error } = await q;
        if (error) throw error;
        const pg = (data || []) as Proposta[];
        lista = lista.concat(pg);
        if (pg.length < 1000) break;
        ultimoId = pg[pg.length - 1].id;
      }
      setPropostas(lista);

      const { data: ch, error: e2 } = await supabase.from("suporte_chamados")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20000);
      if (e2) {
        setTabelaFalta((e2 as any).code === "PGRST205");
        setChamados([]);
      } else {
        setTabelaFalta(false);
        setChamados((ch || []) as Chamado[]);
      }
    } catch {
      // Mantem a tela viva se alguma tabela ainda nao existir.
    }
    setLoading(false);
  };

  useEffect(() => { fetchTudo(); }, []);

  useEffect(() => {
    const ch = supabase.channel("suporte_rt_unita")
      .on("postgres_changes", { event: "*", schema: "public", table: "proposta" }, () => fetchTudo(false))
      .on("postgres_changes", { event: "*", schema: "public", table: "suporte_chamados" }, () => fetchTudo(false))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const aplicarRange = (r: typeof range) => {
    setRange(r);
    setPagina(1);
    if (r === "todos" || r === "custom") return;
    const hoje = new Date();
    const fim = isoLocal(hoje);
    let ini = fim;
    if (r !== "hoje") {
      const d = new Date(hoje);
      d.setDate(d.getDate() - (r === "7d" ? 6 : 29));
      ini = isoLocal(d);
    }
    setDIni(ini);
    setDFim(fim);
  };

  const chamadosPor = useMemo(() => {
    const m = new Map<number, Chamado[]>();
    for (const c of chamados) {
      const a = m.get(c.proposta_id) || [];
      a.push(c);
      m.set(c.proposta_id, a);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
    }
    return m;
  }, [chamados]);

  const kpis = useMemo(() => {
    const abertos = chamados.filter(c => c.status === "ABERTO").length;
    const andamento = chamados.filter(c => c.status === "EM ANDAMENTO").length;
    const pendentes = chamados.filter(c => c.status === "PENDENTE").length;
    const resolvidos = chamados.filter(c => c.status === "RESOLVIDO").length;
    const clientesComChamado = new Set(chamados.map(c => c.proposta_id)).size;
    const semChamado = Math.max(0, propostas.length - clientesComChamado);
    return { abertos, andamento, pendentes, resolvidos, clientesComChamado, semChamado };
  }, [chamados, propostas]);

  const filtradas = useMemo(() => {
    const t = busca.toLowerCase().trim();
    const dig = busca.replace(/\D/g, "");
    return propostas.filter(p => {
      const meus = chamadosPor.get(p.id) || [];
      const ultimo = meus[0];
      if (filtroStatusChamado === "sem" && ultimo) return false;
      if (filtroStatusChamado !== "todos" && filtroStatusChamado !== "sem" && ultimo?.status !== filtroStatusChamado) return false;

      if (!t) return true;
      const campos = [
        p.nome,
        p.cpf,
        p.telefone1,
        p.plano,
        p.status_venda,
        p.dados_customizados?.os,
        ultimo?.status,
        ultimo?.observacoes,
        ultimo?.pendencia,
        ultimo?.solucao,
      ];
      return campos.some(c => {
        if (!c) return false;
        const s = String(c).toLowerCase();
        if (s.includes(t)) return true;
        if (dig.length >= 3 && String(c).replace(/\D/g, "").includes(dig)) return true;
        return false;
      });
    });
  }, [propostas, busca, chamadosPor, filtroStatusChamado]);

  const filtradasPeriodo = useMemo(() => {
    if (range === "todos") return filtradas;
    return filtradas.filter(p => {
      const d = (p.data_instalacao || p.created_at || "").slice(0, 10);
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
    if (!form.observacoes.trim()) { alert("Preencha as observacoes (o que o cliente quer)."); return; }
    setSalvando(true);
    const { error } = await supabase.from("suporte_chamados").insert([{
      proposta_id: p.id,
      observacoes: normalizar(form.observacoes),
      solucao: normalizar(form.solucao),
      pendencia: normalizar(form.pendencia),
      status: form.status,
      criado_por: userEmail,
    }]);
    setSalvando(false);
    if (error) {
      alert("Erro ao salvar: " + error.message + (tabelaFalta ? "\n\nRode o suporte_supabase.sql no Supabase." : ""));
      return;
    }
    setForm({ observacoes: "", solucao: "", pendencia: "", status: "ABERTO" });
    await fetchTudo(false);
  };

  const mudarStatus = async (c: Chamado, novo: string) => {
    await supabase.from("suporte_chamados").update({ status: novo }).eq("id", c.id);
    setChamados(prev => prev.map(x => x.id === c.id ? { ...x, status: novo } : x));
  };

  const card = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14 } as const;
  const inp = { width: "100%", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "9px 12px", fontSize: 13, color: "#1f2937", boxSizing: "border-box" as const, outline: "none" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 46, height: 46, borderRadius: 13, background: "linear-gradient(135deg, #0d9488 0%, #14b8a6 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, boxShadow: "0 8px 20px rgba(13,148,136,0.25)" }}>
            <span style={{ filter: "saturate(0) brightness(2)" }}>🛠️</span>
          </div>
          <div>
            <h1 style={{ margin: 0, color: "#1f2937", fontSize: 22, fontWeight: 800 }}>Suporte</h1>
            <p style={{ margin: "2px 0 0", color: "#6b7280", fontSize: 12 }}>
              <b style={{ color: "#0d9488" }}>{filtradasPeriodo.length}</b> de <b style={{ color: "#0d9488" }}>{propostas.length}</b> venda(s) do CRM · atualiza automaticamente quando entra proposta nova
            </p>
          </div>
        </div>
        <button onClick={() => router.push("/crm/suporte/dashboard")}
          style={{ background: "#ecfeff", color: "#0891b2", border: "1px solid #a5f3fc", borderRadius: 10, padding: "10px 16px", fontSize: 13, cursor: "pointer", fontWeight: 800 }}>
          Dashboard
        </button>
      </div>

      {tabelaFalta && (
        <div style={{ ...card, padding: "12px 16px", borderLeft: "4px solid #f59e0b", color: "#92400e", fontSize: 13, fontWeight: 700 }}>
          Rode o <code>suporte_supabase.sql</code> no Supabase para criar a tabela de chamados.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
        {[
          ["Abertos", kpis.abertos, "#dc2626"],
          ["Em andamento", kpis.andamento, "#d97706"],
          ["Pendentes", kpis.pendentes, "#7c3aed"],
          ["Resolvidos", kpis.resolvidos, "#16a34a"],
          ["Sem chamado", kpis.semChamado, "#64748b"],
        ].map(([label, valor, cor]) => (
          <div key={String(label)} style={{ ...card, padding: 14, borderTop: `3px solid ${cor}` }}>
            <p style={{ color: "#6b7280", fontSize: 10, fontWeight: 800, textTransform: "uppercase", margin: 0 }}>{label}</p>
            <p style={{ color: String(cor), fontSize: 22, fontWeight: 900, margin: "4px 0 0" }}>{Number(valor).toLocaleString("pt-BR")}</p>
          </div>
        ))}
      </div>

      <div style={{ ...card, padding: 12 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input placeholder="🔍 Nome, CPF, OS, telefone ou suporte..." value={busca} onChange={e => { setBusca(e.target.value); setPagina(1); }} style={{ ...inp, maxWidth: 360, flex: "1 1 220px", borderRadius: 20 }} />
          <select value={filtroStatusChamado} onChange={e => { setFiltroStatusChamado(e.target.value as any); setPagina(1); }} style={{ ...inp, maxWidth: 190 }}>
            <option value="todos">Suporte: Todos</option>
            <option value="sem">Sem chamado</option>
            {STATUS_OPCOES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {([["todos", "Todos"], ["hoje", "Hoje"], ["7d", "7 dias"], ["30d", "30 dias"], ["custom", "Personalizado"]] as [typeof range, string][]).map(([k, l]) => (
            <button key={k} onClick={() => aplicarRange(k)} style={{ background: range === k ? "#0d9488" : "#fff", color: range === k ? "#fff" : "#6b7280", border: `1px solid ${range === k ? "#0d9488" : "#e5e7eb"}`, borderRadius: 20, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>{l}</button>
          ))}
          {range === "custom" && (
            <>
              <input type="date" value={dIni} onChange={e => { setDIni(e.target.value); setPagina(1); }} style={{ ...inp, maxWidth: 150 }} />
              <input type="date" value={dFim} onChange={e => { setDFim(e.target.value); setPagina(1); }} style={{ ...inp, maxWidth: 150 }} />
            </>
          )}
        </div>
      </div>

      {loading ? (
        <div style={{ ...card, padding: 40, textAlign: "center", color: "#6b7280" }}>Carregando clientes...</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {visiveis.map(p => {
            const meus = chamadosPor.get(p.id) || [];
            const ultimo = meus[0];
            const ab = aberto === p.id;
            const meta = statusMeta[ultimo?.status || ""] || { label: "Sem chamado", cor: "#64748b", bg: "#f8fafc", border: "#e2e8f0" };
            return (
              <div key={p.id}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 14px rgba(13,148,136,0.12)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = "none"; }}
                style={{ ...card, borderLeft: `4px solid ${ultimo ? corStatus(ultimo.status) : "#99f6e4"}`, transition: "box-shadow 0.15s" }}>
                <div onClick={() => { setAberto(ab ? null : p.id); if (!ab) setForm({ observacoes: "", solucao: "", pendencia: "", status: "ABERTO" }); }}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", cursor: "pointer", flexWrap: "wrap" }}>
                  <div style={{ flex: "1 1 260px", minWidth: 0 }}>
                    <p style={{ margin: 0, color: "#1f2937", fontSize: 13.5, fontWeight: 800 }}>{p.nome || "SEM NOME"}</p>
                    <p style={{ margin: "2px 0 0", color: "#6b7280", fontSize: 11 }}>
                      {p.cpf || ""} {p.dados_customizados?.os ? `· OS ${p.dados_customizados.os}` : ""} · {p.plano || ""} · {p.status_venda || "SEM STATUS"}
                    </p>
                  </div>
                  <span style={{ color: "#0d9488", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>
                    {p.data_instalacao ? new Date(p.data_instalacao + "T00:00:00").toLocaleDateString("pt-BR") : new Date(p.created_at).toLocaleDateString("pt-BR")}
                  </span>
                  <span style={{ background: meta.bg, color: meta.cor, border: `1px solid ${meta.border}`, padding: "3px 10px", borderRadius: 10, fontSize: 10.5, fontWeight: 800 }}>
                    {ultimo ? `${ultimo.status} · ${meus.length} chamado(s)` : "SEM CHAMADO"}
                  </span>
                  <span style={{ color: "#9ca3af", fontWeight: 700 }}>{ab ? "▾" : "▸"}</span>
                </div>

                {ab && (
                  <div style={{ borderTop: "1px solid #f3f4f6", padding: 16, display: "flex", flexDirection: "column", gap: 12, background: "#f8fafc" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                      <div style={{ gridColumn: "1 / -1" }}>
                        <label style={{ fontSize: 10, fontWeight: 800, color: "#6b7280", textTransform: "uppercase" }}>Observacoes *</label>
                        <textarea rows={2} value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} style={{ ...inp, resize: "vertical", fontFamily: "inherit" }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 10, fontWeight: 800, color: "#6b7280", textTransform: "uppercase" }}>Solucao aplicada</label>
                        <textarea rows={2} value={form.solucao} onChange={e => setForm(f => ({ ...f, solucao: e.target.value }))} style={{ ...inp, resize: "vertical", fontFamily: "inherit" }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 10, fontWeight: 800, color: "#6b7280", textTransform: "uppercase" }}>Pendencia</label>
                        <textarea rows={2} value={form.pendencia} onChange={e => setForm(f => ({ ...f, pendencia: e.target.value }))} style={{ ...inp, resize: "vertical", fontFamily: "inherit" }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 10, fontWeight: 800, color: "#6b7280", textTransform: "uppercase" }}>Status</label>
                        <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} style={inp}>{STATUS_OPCOES.map(s => <option key={s}>{s}</option>)}</select>
                      </div>
                    </div>
                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      <button onClick={() => salvar(p)} disabled={salvando} style={{ background: "linear-gradient(135deg, #0d9488 0%, #14b8a6 100%)", color: "#fff", border: "none", borderRadius: 10, padding: "10px 24px", fontSize: 13, fontWeight: 800, cursor: salvando ? "not-allowed" : "pointer", boxShadow: "0 4px 12px rgba(13,148,136,0.3)" }}>{salvando ? "Salvando..." : "Registrar chamado"}</button>
                    </div>

                    {meus.length > 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <p style={{ margin: 0, fontSize: 10, fontWeight: 800, color: "#6b7280", textTransform: "uppercase" }}>Historico</p>
                        {meus.map(c => (
                          <div key={c.id} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 12px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                              <select value={c.status} onChange={e => mudarStatus(c, e.target.value)} style={{ border: `1px solid ${corStatus(c.status)}`, color: corStatus(c.status), borderRadius: 8, padding: "3px 8px", fontSize: 11, fontWeight: 800, background: "#fff" }}>{STATUS_OPCOES.map(s => <option key={s}>{s}</option>)}</select>
                              <span style={{ color: "#9ca3af", fontSize: 10.5 }}>{new Date(c.created_at).toLocaleString("pt-BR")} · {String(c.criado_por || "").split("@")[0]}</span>
                            </div>
                            <p style={{ margin: 0, fontSize: 12, color: "#1f2937" }}><b>Obs:</b> {c.observacoes || "-"}</p>
                            {c.solucao && <p style={{ margin: "2px 0 0", fontSize: 12, color: "#15803d" }}><b>Solucao:</b> {c.solucao}</p>}
                            {c.pendencia && <p style={{ margin: "2px 0 0", fontSize: 12, color: "#b45309" }}><b>Pendencia:</b> {c.pendencia}</p>}
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
              <span style={{ color: "#6b7280", fontSize: 12 }}>Mostrando {(pagAtual - 1) * POR_PAG + 1}-{Math.min(pagAtual * POR_PAG, filtradasPeriodo.length)} de {filtradasPeriodo.length.toLocaleString("pt-BR")}</span>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => setPagina(x => Math.max(1, x - 1))} disabled={pagAtual === 1} style={{ background: "#fff", color: pagAtual === 1 ? "#9ca3af" : "#0d9488", border: "1px solid #e5e7eb", borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: pagAtual === 1 ? "default" : "pointer" }}>Anterior</button>
                <span style={{ color: "#1f2937", fontSize: 12, fontWeight: 700, padding: "6px 8px" }}>{pagAtual}/{totPag}</span>
                <button onClick={() => setPagina(x => Math.min(totPag, x + 1))} disabled={pagAtual === totPag} style={{ background: "#fff", color: pagAtual === totPag ? "#9ca3af" : "#0d9488", border: "1px solid #e5e7eb", borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: pagAtual === totPag ? "default" : "pointer" }}>Proxima</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
