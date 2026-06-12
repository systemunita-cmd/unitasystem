"use client";
export const dynamic = "force-dynamic";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { supabase } from "../../../lib/supabase";
import { useTemPermissao } from "../../../hooks/useTemPermissao";
import {
  type Proposta, type FaturaStatusDB, type Bucket,
  BUCKET_META, formatNum, pctOf,
  carregarPropostas, carregarFaturasStatus,
} from "../../../lib/cobranca_lib";

// ═══════════════════════════════════════════════════════════════════════════
// 📊 DASHBOARD DE COBRANÇA — UnitaSystem
// Contagem de pagas / pendentes / inadimplentes + evolução mês a mês.
// Lê de faturas_status (populada pela página de Atualização).
// ═══════════════════════════════════════════════════════════════════════════

const card = { background: "#fff", borderRadius: 14, border: "1px solid #e5e7eb", boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)" };
const btnSec = { background: "#fff", color: "#374151", border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 16px", fontSize: 13, cursor: "pointer", fontWeight: 600 };
const sectionTitle = { color: "#1f2937", fontSize: 15, fontWeight: 700, margin: "0 0 18px 0", display: "flex", alignItems: "center", gap: 8 };

const bucketDoStatus = (s: string): Bucket | null => {
  if (s === "paga" || s === "paga_atraso") return "paga";
  if (s === "pendente") return "pendente";
  if (s === "atrasada") return "inadimplente";
  return null; // promessa/acordo/negociação/cancelada ficam fora da contagem
};

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const mesLabel = (ref: string) => {
  const m = (ref || "").match(/^(\d{4})-(\d{2})/);
  if (!m) return ref;
  return `${MESES[Number(m[2]) - 1]}/${m[1].slice(2)}`;
};

export default function CobrancaDashboard() {
  const router = useRouter();
  const perm = useTemPermissao();
  const permitido = perm.carregando ? null : (perm.superAdmin || perm.escopo("cobranca.acessar") !== "none");

  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [propostas, setPropostas] = useState<Proposta[]>([]);
  const [faturas, setFaturas] = useState<FaturaStatusDB[]>([]);
  const [tipoGrafico, setTipoGrafico] = useState<"barras" | "linha">("barras");

  useEffect(() => {
    const ck = () => setIsMobile(window.innerWidth < 768);
    ck(); window.addEventListener("resize", ck);
    return () => window.removeEventListener("resize", ck);
  }, []);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      const [rp, rf] = await Promise.all([carregarPropostas(), carregarFaturasStatus()]);
      setPropostas(rp.propostas);
      setFaturas(Array.from(rf.statusMap.values()));
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── KPIs (contagem) ────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    let pagas = 0, pendentes = 0, inadimplentes = 0;
    const clientesInad = new Set<number>();
    const clientesTot = new Set<number>();
    for (const f of faturas) {
      const b = bucketDoStatus(f.status);
      if (!b) continue;
      clientesTot.add(f.proposta_id);
      if (b === "paga") pagas++;
      else if (b === "pendente") pendentes++;
      else { inadimplentes++; clientesInad.add(f.proposta_id); }
    }
    const total = pagas + pendentes + inadimplentes;
    return { pagas, pendentes, inadimplentes, total, clientesInad: clientesInad.size, clientesTot: clientesTot.size, pctInad: pctOf(inadimplentes, total) };
  }, [faturas]);

  // ─── EVOLUÇÃO MÊS A MÊS ─────────────────────────────────────────────────────
  const serieMensal = useMemo(() => {
    const porMes = new Map<string, { pagas: number; pendentes: number; inadimplentes: number }>();
    for (const f of faturas) {
      const b = bucketDoStatus(f.status);
      if (!b) continue;
      const ref = (f.numero_referencia || "").slice(0, 7); // "YYYY-MM"
      if (!/^\d{4}-\d{2}$/.test(ref)) continue;
      let r = porMes.get(ref);
      if (!r) { r = { pagas: 0, pendentes: 0, inadimplentes: 0 }; porMes.set(ref, r); }
      if (b === "paga") r.pagas++;
      else if (b === "pendente") r.pendentes++;
      else r.inadimplentes++;
    }
    return Array.from(porMes.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([ref, v]) => ({
        mes: mesLabel(ref), ref,
        Pagas: v.pagas, Pendentes: v.pendentes, Inadimplentes: v.inadimplentes,
        total: v.pagas + v.pendentes + v.inadimplentes,
        pctPago: pctOf(v.pagas, v.pagas + v.pendentes + v.inadimplentes),
      }));
  }, [faturas]);

  // top meses com mais inadimplência + melhor mês de pagamento
  const destaques = useMemo(() => {
    if (serieMensal.length === 0) return null;
    const piorInad = [...serieMensal].sort((a, b) => b.Inadimplentes - a.Inadimplentes)[0];
    const melhorPago = [...serieMensal].filter(m => m.total >= 5).sort((a, b) => b.pctPago - a.pctPago)[0];
    return { piorInad, melhorPago };
  }, [serieMensal]);

  if (permitido === null || loading) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh", color: "#6b7280" }}>Carregando dashboard...</div>;
  if (!permitido) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh", padding: 32 }}>
      <div style={{ ...card, padding: 48, textAlign: "center", maxWidth: 460 }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>🔒</div>
        <h1 style={{ color: "#1f2937", fontSize: 18, fontWeight: 700, margin: "0 0 8px" }}>Acesso restrito</h1>
        <p style={{ color: "#6b7280", fontSize: 13, margin: 0 }}>Você não tem permissão para ver a Cobrança.</p>
      </div>
    </div>
  );

  const vazio = kpis.total === 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 16 : 20 }}>

      {/* ═══ HEADER ═══ */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, boxShadow: "0 4px 12px rgba(37,99,235,0.3)" }}>
            <span style={{ filter: "saturate(0) brightness(2)" }}>📊</span>
          </div>
          <div>
            <h1 style={{ color: "#1f2937", fontSize: isMobile ? 20 : 24, fontWeight: 700, margin: 0, letterSpacing: -0.3 }}>Dashboard de Cobrança</h1>
            <p style={{ color: "#6b7280", fontSize: 12, margin: "2px 0 0" }}>
              <b style={{ color: "#2563eb" }}>{formatNum(kpis.total)}</b> faturas · <b style={{ color: "#16a34a" }}>{formatNum(kpis.pagas)}</b> pagas · <b style={{ color: "#dc2626" }}>{formatNum(kpis.inadimplentes)}</b> inadimplentes
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => router.push("/crm/cobranca/negociacoes")} style={btnSec}>🤝 Negociações</button>
          <button onClick={() => router.push("/crm/cobranca/atualizacao")} style={btnSec}>📤 Atualizar planilha</button>
        </div>
      </div>

      {vazio && (
        <div style={{ background: "linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)", border: "1px solid #bfdbfe", borderLeft: "4px solid #2563eb", borderRadius: 12, padding: "12px 18px" }}>
          <p style={{ color: "#1e40af", fontSize: 13, margin: 0, fontWeight: 700 }}>💡 Ainda não há faturas com status gravado</p>
          <p style={{ color: "#3b82f6", fontSize: 12, margin: "2px 0 0" }}>Suba a planilha de pagamento em <b>📤 Atualizar planilha</b> — o dashboard popula sozinho.</p>
        </div>
      )}

      {/* ═══ CARDS DE CONTAGEM ═══ */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: isMobile ? 10 : 14 }}>
        {([
          { k: "pendente" as const, qtd: kpis.pendentes, sub: `${pctOf(kpis.pendentes, kpis.total)}% das faturas` },
          { k: "inadimplente" as const, qtd: kpis.inadimplentes, sub: `${formatNum(kpis.clientesInad)} cliente(s) inadimplente(s)` },
          { k: "paga" as const, qtd: kpis.pagas, sub: `${pctOf(kpis.pagas, kpis.total)}% das faturas` },
        ]).map(c => {
          const meta = BUCKET_META[c.k];
          return (
            <div key={c.k} style={{ ...card, padding: isMobile ? 14 : 18, borderTop: `4px solid ${meta.cor}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: meta.bg, border: `1px solid ${meta.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17 }}>{meta.icone}</div>
                <p style={{ color: "#6b7280", fontSize: 10.5, fontWeight: 700, margin: 0, textTransform: "uppercase", letterSpacing: 0.4 }}>{c.k === "pendente" ? "Pendentes de pagamento" : meta.label}</p>
              </div>
              <p style={{ color: meta.cor, fontSize: isMobile ? 24 : 30, fontWeight: 800, margin: 0, letterSpacing: -0.5 }}>{formatNum(c.qtd)}</p>
              <p style={{ color: "#9ca3af", fontSize: 11.5, margin: "3px 0 0", fontWeight: 500 }}>{c.sub}</p>
            </div>
          );
        })}
        <div style={{ ...card, padding: isMobile ? 14 : 18, borderTop: "4px solid #4f46e5" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: "#eef2ff", border: "1px solid #c7d2fe", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17 }}>📉</div>
            <p style={{ color: "#6b7280", fontSize: 10.5, fontWeight: 700, margin: 0, textTransform: "uppercase", letterSpacing: 0.4 }}>Inadimplência</p>
          </div>
          <p style={{ color: "#4f46e5", fontSize: isMobile ? 24 : 30, fontWeight: 800, margin: 0, letterSpacing: -0.5 }}>{kpis.pctInad}%</p>
          <p style={{ color: "#9ca3af", fontSize: 11.5, margin: "3px 0 0", fontWeight: 500 }}>inadimplentes / total de faturas</p>
        </div>
      </div>

      {/* ═══ BARRA DE PROPORÇÃO ═══ */}
      {!vazio && (
        <div style={{ ...card, padding: isMobile ? 16 : 20 }}>
          <p style={{ color: "#6b7280", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, margin: "0 0 10px" }}>📊 Proporção das faturas</p>
          <div style={{ display: "flex", height: 28, borderRadius: 8, overflow: "hidden", border: "1px solid #e5e7eb" }}>
            {([{ q: kpis.pagas, cor: "#16a34a" }, { q: kpis.pendentes, cor: "#d97706" }, { q: kpis.inadimplentes, cor: "#dc2626" }]).map((s, i) => {
              const p = pctOf(s.q, kpis.total);
              return s.q > 0 ? <div key={i} style={{ width: `${p}%`, background: s.cor, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11, fontWeight: 700 }}>{p >= 8 ? `${p}%` : ""}</div> : null;
            })}
          </div>
          <div style={{ display: "flex", gap: 16, marginTop: 8, flexWrap: "wrap" }}>
            {([{ l: "Pagas", cor: "#16a34a" }, { l: "Pendentes", cor: "#d97706" }, { l: "Inadimplentes", cor: "#dc2626" }]).map(x => (
              <span key={x.l} style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#6b7280", fontSize: 11.5, fontWeight: 600 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: x.cor }} /> {x.l}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ═══ GRÁFICO: EVOLUÇÃO DOS PAGAMENTOS MÊS A MÊS ═══ */}
      {serieMensal.length > 0 && (
        <div style={{ ...card, padding: isMobile ? 16 : 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
            <h3 style={{ ...sectionTitle, margin: 0 }}>
              <span style={{ width: 32, height: 32, borderRadius: 8, background: "#eff6ff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>📈</span>
              Evolução dos pagamentos mês a mês
            </h3>
            <div style={{ display: "flex", gap: 4 }}>
              {(["barras", "linha"] as const).map(t => (
                <button key={t} onClick={() => setTipoGrafico(t)} style={{ borderRadius: 20, padding: "6px 13px", fontSize: 12, cursor: "pointer", fontWeight: tipoGrafico === t ? 700 : 600, border: `1px solid ${tipoGrafico === t ? "#2563eb" : "#e5e7eb"}`, background: tipoGrafico === t ? "#eff6ff" : "#fff", color: tipoGrafico === t ? "#2563eb" : "#6b7280" }}>{t === "barras" ? "📊 Barras" : "📈 Linha"}</button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={isMobile ? 260 : 330}>
            {tipoGrafico === "barras" ? (
              <BarChart data={serieMensal} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="mes" stroke="#6b7280" fontSize={11} />
                <YAxis stroke="#6b7280" fontSize={11} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, fontSize: 12 }} cursor={{ fill: "#f3f4f6" }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Pagas" stackId="a" fill="#16a34a" />
                <Bar dataKey="Pendentes" stackId="a" fill="#d97706" />
                <Bar dataKey="Inadimplentes" stackId="a" fill="#dc2626" radius={[6, 6, 0, 0]} />
              </BarChart>
            ) : (
              <LineChart data={serieMensal} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="mes" stroke="#6b7280" fontSize={11} />
                <YAxis stroke="#6b7280" fontSize={11} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
                <Line type="monotone" dataKey="Pagas" stroke="#16a34a" strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="Pendentes" stroke="#d97706" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Inadimplentes" stroke="#dc2626" strokeWidth={2} dot={false} />
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>
      )}

      {/* ═══ % PAGO POR MÊS + DESTAQUES ═══ */}
      {serieMensal.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "2fr 1fr", gap: 14 }}>
          <div style={{ ...card, padding: isMobile ? 16 : 24 }}>
            <h3 style={{ ...sectionTitle, fontSize: 14 }}>
              <span style={{ width: 28, height: 28, borderRadius: 8, background: "#f0fdf4", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>✅</span>
              % de faturas pagas por mês
            </h3>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={serieMensal} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="mes" stroke="#6b7280" fontSize={10} />
                <YAxis stroke="#6b7280" fontSize={10} domain={[0, 100]} tickFormatter={(v: any) => `${v}%`} />
                <Tooltip contentStyle={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, fontSize: 12 }} formatter={(v: any) => [`${v}%`, "Pagas"]} />
                <Line type="monotone" dataKey="pctPago" stroke="#16a34a" strokeWidth={2.5} dot={{ r: 3 }} name="pctPago" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {destaques?.melhorPago && (
              <div style={{ ...card, padding: 16, display: "flex", alignItems: "center", gap: 12, borderLeft: "4px solid #16a34a" }}>
                <div style={{ fontSize: 26 }}>🏆</div>
                <div>
                  <p style={{ color: "#16a34a", fontSize: 16, fontWeight: 800, margin: 0 }}>{destaques.melhorPago.mes} · {destaques.melhorPago.pctPago}% pago</p>
                  <p style={{ color: "#6b7280", fontSize: 11.5, margin: 0, fontWeight: 600 }}>melhor mês de pagamento</p>
                </div>
              </div>
            )}
            {destaques?.piorInad && destaques.piorInad.Inadimplentes > 0 && (
              <div style={{ ...card, padding: 16, display: "flex", alignItems: "center", gap: 12, borderLeft: "4px solid #dc2626" }}>
                <div style={{ fontSize: 26 }}>🚨</div>
                <div>
                  <p style={{ color: "#dc2626", fontSize: 16, fontWeight: 800, margin: 0 }}>{destaques.piorInad.mes} · {formatNum(destaques.piorInad.Inadimplentes)} inadimplentes</p>
                  <p style={{ color: "#6b7280", fontSize: 11.5, margin: 0, fontWeight: 600 }}>mês com mais inadimplência</p>
                </div>
              </div>
            )}
            <div style={{ ...card, padding: 16, display: "flex", alignItems: "center", gap: 12, borderLeft: "4px solid #2563eb" }}>
              <div style={{ fontSize: 26 }}>👥</div>
              <div>
                <p style={{ color: "#2563eb", fontSize: 16, fontWeight: 800, margin: 0 }}>{formatNum(kpis.clientesTot)} cliente(s)</p>
                <p style={{ color: "#6b7280", fontSize: 11.5, margin: 0, fontWeight: 600 }}>com faturas acompanhadas</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}