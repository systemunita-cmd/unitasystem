"use client";
export const dynamic = "force-dynamic";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { useTemPermissao } from "../../../hooks/useTemPermissao";
import { type Proposta, formatNum, formatData, carregarPropostas } from "../../../lib/cobranca_lib";

const card = { background: "#fff", borderRadius: 14, border: "1px solid #e5e7eb", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" };
const input = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "9px 12px", color: "#1f2937", fontSize: 13, outline: "none", boxSizing: "border-box" as const };
const btnSec = { background: "#fff", color: "#374151", border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 16px", fontSize: 13, cursor: "pointer", fontWeight: 600 };

// status de negociação (do enum de 12 status da Cobrança)
const NEG_META: Record<string, { label: string; icone: string; bg: string; border: string; color: string }> = {
  promessa:   { label: "Promessa de pagamento", icone: "🤝", bg: "#eff6ff", border: "#bfdbfe", color: "#2563eb" },
  negociacao: { label: "Em negociação",          icone: "📞", bg: "#f5f3ff", border: "#ddd6fe", color: "#7c3aed" },
  acordo:     { label: "Acordo / Parcelado",     icone: "📋", bg: "#f0f9ff", border: "#bae6fd", color: "#0284c7" },
};
const NEG_STATUS = Object.keys(NEG_META);

type FaturaNeg = {
  proposta_id: number; numero_referencia: string; status: string;
  promessa_data?: string | null; observacoes?: string | null; updated_at?: string | null;
};

const mesExtenso = (ref: string) => {
  const [ano, mes] = (ref || "").split("-");
  const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const mi = parseInt(mes, 10) - 1;
  return mi >= 0 && mi < 12 ? `${meses[mi]}/${(ano || "").slice(2)}` : ref;
};

export default function CobrancaNegociacoes() {
  const router = useRouter();
  const perm = useTemPermissao();
  const permitido = perm.carregando ? null : (perm.superAdmin || perm.escopo("cobranca.acessar") !== "none");

  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [faltaTabela, setFaltaTabela] = useState(false);
  const [propMap, setPropMap] = useState<Map<number, Proposta>>(new Map());
  const [faturas, setFaturas] = useState<FaturaNeg[]>([]);

  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"todos" | "promessa" | "negociacao" | "acordo">("todos");

  useEffect(() => {
    const ck = () => setIsMobile(window.innerWidth < 768);
    ck(); window.addEventListener("resize", ck);
    return () => window.removeEventListener("resize", ck);
  }, []);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      const rp = await carregarPropostas();
      const pm = new Map<number, Proposta>();
      for (const p of rp.propostas) pm.set(p.id, p);
      setPropMap(pm);

      try {
        const { data, error } = await supabase.from("faturas_status").select("proposta_id, numero_referencia, status, promessa_data, observacoes, updated_at").in("status", NEG_STATUS);
        if (error) throw error;
        setFaturas((data || []) as FaturaNeg[]);
      } catch (e: any) {
        if (e?.code === "PGRST205") setFaltaTabela(true);
        setFaturas([]);
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const linhas = useMemo(() => {
    let arr = faturas.map(f => {
      const p = propMap.get(f.proposta_id);
      return {
        ...f,
        nome: p?.nome || `Proposta #${f.proposta_id}`,
        custcode: String(p?.dados_customizados?.custcode || ""),
        ordem: String(p?.dados_customizados?.os || ""),
        telefone: p?.telefone1 || "",
      };
    });
    if (filtro !== "todos") arr = arr.filter(x => x.status === filtro);
    const b = busca.trim().toLowerCase();
    if (b) arr = arr.filter(x => x.nome.toLowerCase().includes(b) || x.custcode.toLowerCase().includes(b) || x.ordem.toLowerCase().includes(b));
    arr.sort((a, b2) => {
      const da = a.promessa_data || "9999"; const db = b2.promessa_data || "9999";
      return da.localeCompare(db);
    });
    return arr;
  }, [faturas, propMap, filtro, busca]);

  const contagem = useMemo(() => {
    const c: Record<string, number> = { promessa: 0, negociacao: 0, acordo: 0 };
    for (const f of faturas) if (c[f.status] != null) c[f.status]++;
    return c;
  }, [faturas]);

  if (permitido === null || loading) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh", color: "#6b7280" }}>Carregando negociações...</div>;
  if (!permitido) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}><div style={{ ...card, padding: 48, textAlign: "center" }}><div style={{ fontSize: 40 }}>🔒</div><h1 style={{ color: "#1f2937", fontSize: 18, fontWeight: 700 }}>Acesso restrito</h1></div></div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 16 : 20 }}>
      {/* header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: "linear-gradient(135deg,#7c3aed,#6d28d9)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}><span style={{ filter: "saturate(0) brightness(2)" }}>🤝</span></div>
          <div>
            <h1 style={{ color: "#1f2937", fontSize: isMobile ? 20 : 24, fontWeight: 700, margin: 0 }}>Negociações</h1>
            <p style={{ color: "#6b7280", fontSize: 12, margin: "2px 0 0" }}>Faturas em promessa, acordo ou em negociação</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => router.push("/crm/cobranca/dashboard")} style={btnSec}>📊 Dashboard</button>
          <button onClick={() => router.push("/crm/cobranca")} style={btnSec}>← Cobrança</button>
        </div>
      </div>

      {faltaTabela && <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderLeft: "4px solid #dc2626", borderRadius: 12, padding: "12px 18px", color: "#991b1b", fontSize: 13, fontWeight: 600 }}>⚠️ A tabela <b>faturas_status</b> não existe. Rode o SQL de setup da Cobrança.</div>}

      {/* contagem por tipo */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: isMobile ? 10 : 14 }}>
        {NEG_STATUS.map(s => {
          const meta = NEG_META[s];
          return (
            <div key={s} style={{ ...card, padding: isMobile ? 14 : 18, borderTop: `4px solid ${meta.color}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <div style={{ width: 32, height: 32, borderRadius: 9, background: meta.bg, border: `1px solid ${meta.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>{meta.icone}</div>
                <p style={{ color: "#6b7280", fontSize: 11, fontWeight: 700, margin: 0, textTransform: "uppercase" }}>{meta.label}</p>
              </div>
              <p style={{ color: meta.color, fontSize: isMobile ? 24 : 30, fontWeight: 800, margin: 0 }}>{formatNum(contagem[s] || 0)}</p>
            </div>
          );
        })}
      </div>

      {/* lista */}
      <div style={{ ...card, overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid #e5e7eb", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <h3 style={{ color: "#1f2937", fontSize: 14, fontWeight: 700, margin: 0 }}>📋 {formatNum(linhas.length)} fatura(s)</h3>
          <input placeholder="🔍 nome, custcode ou ordem..." value={busca} onChange={e => setBusca(e.target.value)} style={{ ...input, marginLeft: "auto", padding: "7px 12px", fontSize: 12, borderRadius: 20, width: isMobile ? "100%" : 260 }} />
        </div>
        <div style={{ padding: "10px 18px", borderBottom: "1px solid #f3f4f6", display: "flex", gap: 6, flexWrap: "wrap" }}>
          {([{ k: "todos", l: "Todos" }, { k: "promessa", l: "🤝 Promessa" }, { k: "negociacao", l: "📞 Em negociação" }, { k: "acordo", l: "📋 Acordo" }] as { k: typeof filtro; l: string }[]).map(f => (
            <button key={f.k} onClick={() => setFiltro(f.k)} style={{ borderRadius: 20, padding: "6px 12px", fontSize: 12, cursor: "pointer", fontWeight: 600, border: `1px solid ${filtro === f.k ? "#7c3aed" : "#e5e7eb"}`, background: filtro === f.k ? "#f5f3ff" : "#fff", color: filtro === f.k ? "#7c3aed" : "#6b7280" }}>{f.l}</button>
          ))}
        </div>
        {linhas.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>🤝</div>
            <h3 style={{ color: "#1f2937", fontSize: 15, fontWeight: 700, margin: "0 0 6px" }}>Nenhuma fatura em negociação</h3>
            <p style={{ color: "#6b7280", fontSize: 13, margin: 0 }}>Faturas marcadas como promessa, acordo ou em negociação aparecem aqui.</p>
          </div>
        ) : (
          <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: isMobile ? 820 : "auto" }}>
              <thead>
                <tr style={{ background: "#f9fafb" }}>
                  {["Cliente", "CUSTCODE", "Situação", "Mês", "Promessa p/", "Observação"].map(h => (
                    <th key={h} style={{ padding: "11px 14px", color: "#6b7280", fontSize: 11, textAlign: "left", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700, borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {linhas.map((f, i) => {
                  const meta = NEG_META[f.status] || NEG_META.negociacao;
                  return (
                    <tr key={`${f.proposta_id}_${f.numero_referencia}`} style={{ borderTop: "1px solid #f3f4f6", background: i % 2 === 0 ? "#fff" : "#fafbfc" }}>
                      <td style={{ padding: "11px 14px", maxWidth: 200 }}>
                        <div style={{ color: "#1f2937", fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.nome}</div>
                        {f.ordem && <div style={{ color: "#9ca3af", fontSize: 10.5, fontFamily: "monospace" }}>{f.ordem}</div>}
                      </td>
                      <td style={{ padding: "11px 14px" }}><span style={{ fontFamily: "monospace", fontSize: 12.5, color: f.custcode ? "#1f2937" : "#9ca3af", fontWeight: 700 }}>{f.custcode || "—"}</span></td>
                      <td style={{ padding: "11px 14px" }}><span style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.border}`, fontSize: 12, padding: "3px 10px", borderRadius: 10, fontWeight: 700, whiteSpace: "nowrap" }}>{meta.icone} {meta.label}</span></td>
                      <td style={{ padding: "11px 14px", color: "#374151", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>{mesExtenso(f.numero_referencia)}</td>
                      <td style={{ padding: "11px 14px", color: f.promessa_data ? "#2563eb" : "#9ca3af", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>{f.promessa_data ? formatData(f.promessa_data) : "—"}</td>
                      <td style={{ padding: "11px 14px", color: "#6b7280", fontSize: 12, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.observacoes || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}