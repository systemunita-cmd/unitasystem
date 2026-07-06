"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";

type Proposta = {
  id: number;
  nome?: string | null;
  cpf?: string | null;
  plano?: string | null;
  status_venda?: string | null;
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

const STATUS_META: Record<string, { label: string; cor: string; bg: string; border: string }> = {
  ABERTO: { label: "Abertos", cor: "#dc2626", bg: "#fef2f2", border: "#fecaca" },
  "EM ANDAMENTO": { label: "Em andamento", cor: "#d97706", bg: "#fffbeb", border: "#fde68a" },
  PENDENTE: { label: "Pendentes", cor: "#7c3aed", bg: "#f5f3ff", border: "#ddd6fe" },
  RESOLVIDO: { label: "Concluidos", cor: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0" },
};

const isoLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const fmtData = (v?: string | null) => {
  if (!v) return "-";
  try { return new Date(v).toLocaleString("pt-BR"); } catch { return String(v); }
};

export default function SuporteDashboard() {
  const router = useRouter();
  const [propostas, setPropostas] = useState<Proposta[]>([]);
  const [chamados, setChamados] = useState<Chamado[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<"todos" | "hoje" | "7d" | "30d" | "custom">("30d");
  const [dIni, setDIni] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 29);
    return isoLocal(d);
  });
  const [dFim, setDFim] = useState(() => isoLocal(new Date()));

  const fetchTudo = async (mostraLoading = true) => {
    if (mostraLoading) setLoading(true);
    try {
      let lista: Proposta[] = [];
      let ultimoId: number | null = null;
      for (let i = 0; i < 80; i++) {
        let q = supabase.from("proposta")
          .select("id, nome, cpf, plano, status_venda, created_at")
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
      if (e2) setChamados([]);
      else setChamados((ch || []) as Chamado[]);
    } catch {
      setPropostas([]);
      setChamados([]);
    }
    setLoading(false);
  };

  useEffect(() => { fetchTudo(); }, []);

  useEffect(() => {
    const ch = supabase.channel("suporte_dashboard_rt_unita")
      .on("postgres_changes", { event: "*", schema: "public", table: "proposta" }, () => fetchTudo(false))
      .on("postgres_changes", { event: "*", schema: "public", table: "suporte_chamados" }, () => fetchTudo(false))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const aplicarRange = (r: typeof range) => {
    setRange(r);
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

  const propostasMap = useMemo(() => {
    const m = new Map<number, Proposta>();
    for (const p of propostas) m.set(p.id, p);
    return m;
  }, [propostas]);

  const chamadosPeriodo = useMemo(() => {
    if (range === "todos") return chamados;
    return chamados.filter(c => {
      const d = (c.created_at || "").slice(0, 10);
      if (!d) return false;
      if (dIni && d < dIni) return false;
      if (dFim && d > dFim) return false;
      return true;
    });
  }, [chamados, range, dIni, dFim]);

  const metricas = useMemo(() => {
    const abertos = chamadosPeriodo.filter(c => c.status === "ABERTO").length;
    const andamento = chamadosPeriodo.filter(c => c.status === "EM ANDAMENTO").length;
    const pendentes = chamadosPeriodo.filter(c => c.status === "PENDENTE").length;
    const concluidos = chamadosPeriodo.filter(c => c.status === "RESOLVIDO").length;
    const total = chamadosPeriodo.length;
    const clientes = new Set(chamadosPeriodo.map(c => c.proposta_id)).size;
    const ativos = abertos + andamento + pendentes;
    const taxaConclusao = total > 0 ? Math.round((concluidos / total) * 100) : 0;
    return { total, abertos, andamento, pendentes, concluidos, clientes, ativos, taxaConclusao };
  }, [chamadosPeriodo]);

  const ultimos = chamadosPeriodo.slice(0, 15);

  const porStatusVenda = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of chamadosPeriodo) {
      const p = propostasMap.get(c.proposta_id);
      const st = p?.status_venda || "SEM STATUS";
      m.set(st, (m.get(st) || 0) + 1);
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [chamadosPeriodo, propostasMap]);

  const card = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14 } as const;
  const inp = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "9px 12px", fontSize: 13, color: "#1f2937", boxSizing: "border-box" as const, outline: "none" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 46, height: 46, borderRadius: 13, background: "linear-gradient(135deg, #0891b2 0%, #06b6d4 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, boxShadow: "0 8px 20px rgba(8,145,178,0.25)" }}>
            <span style={{ filter: "saturate(0) brightness(2)" }}>📊</span>
          </div>
          <div>
            <h1 style={{ margin: 0, color: "#1f2937", fontSize: 22, fontWeight: 900 }}>Dashboard de Suporte</h1>
            <p style={{ margin: "2px 0 0", color: "#6b7280", fontSize: 12 }}>
              {metricas.total.toLocaleString("pt-BR")} chamado(s) no periodo · atualizacao em tempo real
            </p>
          </div>
        </div>
        <button onClick={() => router.push("/crm/suporte")}
          style={{ background: "#f0fdfa", color: "#0d9488", border: "1px solid #99f6e4", borderRadius: 10, padding: "10px 16px", fontSize: 13, cursor: "pointer", fontWeight: 800 }}>
          Voltar ao Suporte
        </button>
      </div>

      <div style={{ ...card, padding: 12 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {([["todos", "Todos"], ["hoje", "Hoje"], ["7d", "7 dias"], ["30d", "30 dias"], ["custom", "Personalizado"]] as [typeof range, string][]).map(([k, l]) => (
            <button key={k} onClick={() => aplicarRange(k)}
              style={{ background: range === k ? "#0891b2" : "#fff", color: range === k ? "#fff" : "#6b7280", border: `1px solid ${range === k ? "#0891b2" : "#e5e7eb"}`, borderRadius: 20, padding: "7px 14px", fontSize: 12, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" }}>
              {l}
            </button>
          ))}
          {range === "custom" && (
            <>
              <input type="date" value={dIni} onChange={e => setDIni(e.target.value)} style={{ ...inp, maxWidth: 150 }} />
              <input type="date" value={dFim} onChange={e => setDFim(e.target.value)} style={{ ...inp, maxWidth: 150 }} />
            </>
          )}
        </div>
      </div>

      {loading ? (
        <div style={{ ...card, padding: 40, textAlign: "center", color: "#6b7280" }}>Carregando dashboard...</div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
            {[
              ["Total abertos", metricas.total, "#0891b2", "#ecfeff"],
              ["Suportes ativos", metricas.ativos, "#d97706", "#fffbeb"],
              ["Abertos", metricas.abertos, "#dc2626", "#fef2f2"],
              ["Pendentes", metricas.pendentes, "#7c3aed", "#f5f3ff"],
              ["Concluidos", metricas.concluidos, "#16a34a", "#f0fdf4"],
              ["Taxa conclusao", `${metricas.taxaConclusao}%`, "#2563eb", "#eff6ff"],
            ].map(([label, valor, cor, bg]) => (
              <div key={String(label)} style={{ ...card, padding: 14, background: String(bg), borderTop: `3px solid ${cor}` }}>
                <p style={{ color: "#64748b", fontSize: 10, fontWeight: 900, textTransform: "uppercase", margin: 0 }}>{label}</p>
                <p style={{ color: String(cor), fontSize: 24, fontWeight: 950, margin: "5px 0 0" }}>
                  {typeof valor === "number" ? valor.toLocaleString("pt-BR") : valor}
                </p>
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) minmax(280px, 0.8fr)", gap: 12 }}>
            <div style={{ ...card, overflow: "hidden" }}>
              <div style={{ padding: "14px 16px", borderBottom: "1px solid #e5e7eb" }}>
                <h2 style={{ margin: 0, color: "#1f2937", fontSize: 15, fontWeight: 900 }}>Ultimos chamados</h2>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
                  <thead>
                    <tr style={{ background: "#f8fafc" }}>
                      {["Cliente", "Status", "Observacao", "Criado por", "Data"].map(h => (
                        <th key={h} style={{ textAlign: "left", padding: "10px 12px", color: "#64748b", fontSize: 11, textTransform: "uppercase", borderBottom: "1px solid #e5e7eb" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ultimos.length === 0 ? (
                      <tr><td colSpan={5} style={{ padding: 28, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>Nenhum chamado no periodo.</td></tr>
                    ) : ultimos.map(c => {
                      const p = propostasMap.get(c.proposta_id);
                      const meta = STATUS_META[c.status] || { cor: "#64748b", bg: "#f8fafc", border: "#e2e8f0" };
                      return (
                        <tr key={c.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                          <td style={{ padding: "10px 12px" }}>
                            <p style={{ margin: 0, color: "#0f172a", fontSize: 12.5, fontWeight: 900 }}>{p?.nome || `Venda #${c.proposta_id}`}</p>
                            <p style={{ margin: "2px 0 0", color: "#64748b", fontSize: 11 }}>{p?.cpf || ""} {p?.plano ? `· ${p.plano}` : ""}</p>
                          </td>
                          <td style={{ padding: "10px 12px" }}>
                            <span style={{ background: meta.bg, color: meta.cor, border: `1px solid ${meta.border}`, borderRadius: 10, padding: "3px 9px", fontSize: 10.5, fontWeight: 900, whiteSpace: "nowrap" }}>{c.status}</span>
                          </td>
                          <td style={{ padding: "10px 12px", color: "#334155", fontSize: 12, maxWidth: 280 }}>{c.observacoes || "-"}</td>
                          <td style={{ padding: "10px 12px", color: "#64748b", fontSize: 12 }}>{String(c.criado_por || "").split("@")[0] || "-"}</td>
                          <td style={{ padding: "10px 12px", color: "#64748b", fontSize: 12, whiteSpace: "nowrap" }}>{fmtData(c.created_at)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ ...card, padding: 16 }}>
              <h2 style={{ margin: 0, color: "#1f2937", fontSize: 15, fontWeight: 900 }}>Chamados por status da venda</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
                {porStatusVenda.length === 0 ? (
                  <p style={{ color: "#94a3b8", fontSize: 13, margin: 0 }}>Sem dados no periodo.</p>
                ) : porStatusVenda.map(([status, total]) => {
                  const pct = metricas.total > 0 ? Math.round((total / metricas.total) * 100) : 0;
                  return (
                    <div key={status}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
                        <span style={{ color: "#334155", fontSize: 12, fontWeight: 800 }}>{status}</span>
                        <span style={{ color: "#0891b2", fontSize: 12, fontWeight: 900 }}>{total}</span>
                      </div>
                      <div style={{ height: 8, background: "#f1f5f9", borderRadius: 999, overflow: "hidden" }}>
                        <div style={{ width: `${pct}%`, height: "100%", background: "#06b6d4", borderRadius: 999 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
