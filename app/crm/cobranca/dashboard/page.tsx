"use client";
export const dynamic = "force-dynamic";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { useTemPermissao } from "../../../hooks/useTemPermissao";
import {
  type Proposta, type FaturaStatusDB, type Bucket,
  formatNum, pctOf,
  carregarPropostas, carregarFaturasStatus,
} from "../../../lib/cobranca_lib";

// ═══════════════════════════════════════════════════════════════════════════
// 📊 DASHBOARD DE COBRANÇA — UnitaSystem (reestruturado)
// KPIs grandes + R$ em aberto, ticket médio, fraude/churn + evolução mensal.
// Gráficos em SVG puro (Recharts 3.8 quebra com React 19). Lê de faturas_status.
// ═══════════════════════════════════════════════════════════════════════════

// ─── helpers visuais ─────────────────────────────────────────────────────────
const money = (v: number) =>
  (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const moneyFull = (v: number) =>
  (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

const bucketDoStatus = (s: string): Bucket | null => {
  if (s === "paga" || s === "paga_atraso") return "paga";
  if (s === "pendente") return "pendente";
  if (s === "atrasada") return "inadimplente";
  return null;
};
const simSN = (v: any) => {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "sim" || s === "s" || s === "true" || s === "1";
};

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const mesLabel = (ref: string) => {
  const m = (ref || "").match(/^(\d{4})-(\d{2})/);
  if (!m) return ref;
  return `${MESES[Number(m[2]) - 1]}/${m[1].slice(2)}`;
};

// paleta (identidade UnitaSystem: indigo/azul + semáforo de status)
const C = {
  ink: "#0f172a", sub: "#64748b", line: "#e2e8f0", soft: "#f1f5f9",
  brand: "#4f46e5", brand2: "#6366f1",
  pago: "#16a34a", pend: "#d97706", inad: "#dc2626",
  fraude: "#b91c1c", churn: "#9333ea",
};

const shell: React.CSSProperties = {
  background: "#fff", borderRadius: 16, border: `1px solid ${C.line}`,
  boxShadow: "0 1px 2px rgba(15,23,42,0.04), 0 4px 16px rgba(15,23,42,0.04)",
};
const btnSec: React.CSSProperties = {
  background: "#fff", color: "#334155", border: `1px solid ${C.line}`, borderRadius: 10,
  padding: "10px 16px", fontSize: 13, cursor: "pointer", fontWeight: 600,
};
const num: React.CSSProperties = { fontVariantNumeric: "tabular-nums" };

// ─── gráfico de ÁREA empilhada (SVG, com gradiente) ──────────────────────────
type Serie = { mes: string; ref: string; Pagas: number; Pendentes: number; Inadimplentes: number; total: number; pctPago: number; rAberto: number };

function GraficoArea({ data, mobile }: { data: Serie[]; mobile: boolean }) {
  const H = mobile ? 240 : 300, padL = 38, padB = 28, padT = 14, padR = 14;
  const W = Math.max(data.length * (mobile ? 46 : 68) + padL + padR, 320);
  const maxV = Math.max(1, ...data.map(d => d.total));
  const passos = 4, plotH = H - padT - padB, plotW = W - padL - padR;
  const x = (i: number) => padL + (data.length <= 1 ? plotW / 2 : (plotW * i) / (data.length - 1));
  const y = (v: number) => padT + plotH * (1 - v / maxV);
  const camadas: [keyof Serie, string, string][] = [
    ["Pagas", C.pago, "gPago"], ["Pendentes", C.pend, "gPend"], ["Inadimplentes", C.inad, "gInad"],
  ];
  // empilhamento: acumula de baixo (pagas) pra cima
  const acumulado = data.map(() => 0);
  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <svg width={W} height={H} style={{ minWidth: "100%", display: "block" }}>
        <defs>
          {camadas.map(([, cor, id]) => (
            <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={cor} stopOpacity={0.35} />
              <stop offset="100%" stopColor={cor} stopOpacity={0.04} />
            </linearGradient>
          ))}
        </defs>
        {Array.from({ length: passos + 1 }).map((_, i) => {
          const v = (maxV / passos) * i, yy = y(v);
          return (
            <g key={i}>
              <line x1={padL} y1={yy} x2={W - padR} y2={yy} stroke={C.line} strokeDasharray="2 4" />
              <text x={padL - 8} y={yy + 3} textAnchor="end" fontSize={10} fill={C.sub} style={num}>{Math.round(v)}</text>
            </g>
          );
        })}
        {camadas.map(([k, cor, id]) => {
          const base = data.map((_, i) => acumulado[i]);
          const topo = data.map((d, i) => acumulado[i] + (d[k] as number));
          for (let i = 0; i < data.length; i++) acumulado[i] = topo[i];
          const linhaTopo = topo.map((v, i) => `${x(i)},${y(v)}`).join(" ");
          const linhaBase = base.map((v, i) => `${x(i)},${y(v)}`).reverse().join(" ");
          return (
            <g key={k}>
              <polygon points={`${linhaTopo} ${linhaBase}`} fill={`url(#${id})`} />
              <polyline points={topo.map((v, i) => `${x(i)},${y(v)}`).join(" ")} fill="none" stroke={cor} strokeWidth={2.5} />
              {topo.map((v, i) => (
                <circle key={i} cx={x(i)} cy={y(v)} r={2.5} fill="#fff" stroke={cor} strokeWidth={1.5}>
                  <title>{`${data[i].mes} — ${String(k)}: ${data[i][k]}`}</title>
                </circle>
              ))}
            </g>
          );
        })}
        {data.map((d, i) => (
          <text key={d.ref} x={x(i)} y={H - padB + 16} textAnchor="middle" fontSize={10} fill={C.sub}>{d.mes}</text>
        ))}
      </svg>
    </div>
  );
}

// ─── gráfico de LINHA simples (% pago) ───────────────────────────────────────
function GraficoPct({ data, mobile }: { data: Serie[]; mobile: boolean }) {
  const H = mobile ? 180 : 200, padL = 38, padB = 26, padT = 12, padR = 12;
  const W = Math.max(data.length * (mobile ? 44 : 60) + padL + padR, 320);
  const passos = 5, plotH = H - padT - padB, plotW = W - padL - padR;
  const x = (i: number) => padL + (data.length <= 1 ? plotW / 2 : (plotW * i) / (data.length - 1));
  const y = (v: number) => padT + plotH * (1 - v / 100);
  const pts = data.map((d, i) => `${x(i)},${y(d.pctPago)}`).join(" ");
  const area = `${pts} ${x(data.length - 1)},${y(0)} ${x(0)},${y(0)}`;
  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <svg width={W} height={H} style={{ minWidth: "100%", display: "block" }}>
        <defs>
          <linearGradient id="gPct" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.pago} stopOpacity={0.3} />
            <stop offset="100%" stopColor={C.pago} stopOpacity={0.03} />
          </linearGradient>
        </defs>
        {Array.from({ length: passos + 1 }).map((_, i) => {
          const v = (100 / passos) * i, yy = y(v);
          return (
            <g key={i}>
              <line x1={padL} y1={yy} x2={W - padR} y2={yy} stroke={C.line} strokeDasharray="2 4" />
              <text x={padL - 8} y={yy + 3} textAnchor="end" fontSize={10} fill={C.sub} style={num}>{Math.round(v)}%</text>
            </g>
          );
        })}
        {data.length > 1 && <polygon points={area} fill="url(#gPct)" />}
        <polyline points={pts} fill="none" stroke={C.pago} strokeWidth={2.5} />
        {data.map((d, i) => (
          <circle key={i} cx={x(i)} cy={y(d.pctPago)} r={3.5} fill="#fff" stroke={C.pago} strokeWidth={2}>
            <title>{`${d.mes}: ${d.pctPago}% pago`}</title>
          </circle>
        ))}
        {data.map((d, i) => <text key={d.ref} x={x(i)} y={H - padB + 14} textAnchor="middle" fontSize={10} fill={C.sub}>{d.mes}</text>)}
      </svg>
    </div>
  );
}

// ─── DONUT de proporção ──────────────────────────────────────────────────────
function Donut({ segmentos, centro, sub }: { segmentos: { valor: number; cor: string }[]; centro: string; sub: string }) {
  const R = 56, sw = 18, C2 = 2 * Math.PI * R;
  const total = segmentos.reduce((s, x) => s + x.valor, 0) || 1;
  let off = 0;
  return (
    <div style={{ position: "relative", width: 140, height: 140, flexShrink: 0 }}>
      <svg width={140} height={140} viewBox="0 0 140 140">
        <circle cx={70} cy={70} r={R} fill="none" stroke={C.soft} strokeWidth={sw} />
        {segmentos.map((s, i) => {
          const frac = s.valor / total;
          const dash = frac * C2;
          const el = (
            <circle key={i} cx={70} cy={70} r={R} fill="none" stroke={s.cor} strokeWidth={sw}
              strokeDasharray={`${dash} ${C2 - dash}`} strokeDashoffset={-off}
              transform="rotate(-90 70 70)" strokeLinecap="butt" />
          );
          off += dash;
          return el;
        })}
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: 24, fontWeight: 800, color: C.ink, ...num }}>{centro}</span>
        <span style={{ fontSize: 10.5, color: C.sub, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 }}>{sub}</span>
      </div>
    </div>
  );
}

export default function CobrancaDashboard() {
  const router = useRouter();
  const perm = useTemPermissao();
  const permitido = perm.carregando ? null : (perm.superAdmin || perm.escopo("cobranca.acessar") !== "none");

  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [propostas, setPropostas] = useState<Proposta[]>([]);
  const [faturas, setFaturas] = useState<FaturaStatusDB[]>([]);

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

  // mapa proposta_id -> valor do plano (pra R$ e ticket)
  const valorPorProposta = useMemo(() => {
    const m = new Map<number, number>();
    for (const p of propostas) m.set(p.id, Number(p.valor_plano || 0));
    return m;
  }, [propostas]);

  // ─── KPIs ──────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    let pagas = 0, pendentes = 0, inadimplentes = 0;
    let rAberto = 0, rRecebido = 0, fraude = 0, churn = 0;
    const clientesInad = new Set<number>();
    const clientesTot = new Set<number>();
    for (const f of faturas) {
      const b = bucketDoStatus(f.status);
      const valor = valorPorProposta.get(f.proposta_id) || 0;
      if (simSN((f as any).suspensao_fraude)) fraude++;
      if (simSN((f as any).churn)) churn++;
      if (!b) continue;
      clientesTot.add(f.proposta_id);
      if (b === "paga") { pagas++; rRecebido += valor; }
      else if (b === "pendente") { pendentes++; rAberto += valor; }
      else { inadimplentes++; clientesInad.add(f.proposta_id); rAberto += valor; }
    }
    const total = pagas + pendentes + inadimplentes;
    const ticket = total > 0 ? (rAberto + rRecebido) / total : 0;
    return {
      pagas, pendentes, inadimplentes, total,
      rAberto, rRecebido, ticket, fraude, churn,
      clientesInad: clientesInad.size, clientesTot: clientesTot.size,
      pctInad: pctOf(inadimplentes, total), pctPago: pctOf(pagas, total),
    };
  }, [faturas, valorPorProposta]);

  // ─── série mensal ────────────────────────────────────────────────────────────
  const serieMensal = useMemo<Serie[]>(() => {
    const porMes = new Map<string, { pagas: number; pendentes: number; inadimplentes: number; rAberto: number }>();
    for (const f of faturas) {
      const b = bucketDoStatus(f.status);
      if (!b) continue;
      const ref = (f.numero_referencia || "").slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(ref)) continue;
      let r = porMes.get(ref);
      if (!r) { r = { pagas: 0, pendentes: 0, inadimplentes: 0, rAberto: 0 }; porMes.set(ref, r); }
      const valor = valorPorProposta.get(f.proposta_id) || 0;
      if (b === "paga") r.pagas++;
      else if (b === "pendente") { r.pendentes++; r.rAberto += valor; }
      else { r.inadimplentes++; r.rAberto += valor; }
    }
    return Array.from(porMes.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([ref, v]) => ({
        mes: mesLabel(ref), ref,
        Pagas: v.pagas, Pendentes: v.pendentes, Inadimplentes: v.inadimplentes,
        total: v.pagas + v.pendentes + v.inadimplentes,
        pctPago: pctOf(v.pagas, v.pagas + v.pendentes + v.inadimplentes),
        rAberto: v.rAberto,
      }));
  }, [faturas, valorPorProposta]);

  const destaques = useMemo(() => {
    if (serieMensal.length === 0) return null;
    const piorInad = [...serieMensal].sort((a, b) => b.Inadimplentes - a.Inadimplentes)[0];
    const melhorPago = [...serieMensal].filter(m => m.total >= 5).sort((a, b) => b.pctPago - a.pctPago)[0];
    return { piorInad, melhorPago };
  }, [serieMensal]);

  if (permitido === null || loading) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh", color: C.sub }}>Carregando dashboard...</div>;
  if (!permitido) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh", padding: 32 }}>
      <div style={{ ...shell, padding: 48, textAlign: "center", maxWidth: 460 }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>🔒</div>
        <h1 style={{ color: C.ink, fontSize: 18, fontWeight: 700, margin: "0 0 8px" }}>Acesso restrito</h1>
        <p style={{ color: C.sub, fontSize: 13, margin: 0 }}>Você não tem permissão para ver a Cobrança.</p>
      </div>
    </div>
  );

  const vazio = kpis.total === 0;
  const gap = isMobile ? 14 : 18;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap }}>

      {/* ═══ HEADER ═══ */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 50, height: 50, borderRadius: 14, background: `linear-gradient(135deg, ${C.brand}, ${C.brand2})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, boxShadow: `0 6px 18px ${C.brand}44` }}>
            <span style={{ filter: "saturate(0) brightness(2.5)" }}>📊</span>
          </div>
          <div>
            <h1 style={{ color: C.ink, fontSize: isMobile ? 21 : 26, fontWeight: 800, margin: 0, letterSpacing: -0.5 }}>Cobrança · Visão geral</h1>
            <p style={{ color: C.sub, fontSize: 12.5, margin: "3px 0 0" }}>
              <b style={{ color: C.brand }}>{formatNum(kpis.total)}</b> faturas acompanhadas · atualizado pela planilha de status
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => router.push("/crm/cobranca/negociacoes")} style={btnSec}>🤝 Negociações</button>
          <button onClick={() => router.push("/crm/cobranca/atualizacao")} style={{ ...btnSec, background: C.brand, color: "#fff", border: "none" }}>📤 Atualizar planilha</button>
        </div>
      </div>

      {vazio && (
        <div style={{ background: "linear-gradient(135deg, #eef2ff, #e0e7ff)", border: `1px solid #c7d2fe`, borderLeft: `4px solid ${C.brand}`, borderRadius: 12, padding: "14px 18px" }}>
          <p style={{ color: "#3730a3", fontSize: 13.5, margin: 0, fontWeight: 800 }}>Ainda não há faturas com status</p>
          <p style={{ color: C.brand, fontSize: 12.5, margin: "3px 0 0" }}>Suba a planilha de pagamento em <b>Atualizar planilha</b> — o painel popula sozinho.</p>
        </div>
      )}

      {/* ═══ FAIXA DE DESTAQUE: R$ em aberto + recebido (hero) ═══ */}
      {!vazio && (
        <div style={{ ...shell, padding: 0, overflow: "hidden", display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.4fr 1fr 1fr", gap: 0 }}>
          {/* R$ em aberto — o número que mais importa pra cobrança */}
          <div style={{ padding: isMobile ? 20 : 26, background: `linear-gradient(135deg, ${C.brand}, ${C.brand2})`, color: "#fff", position: "relative" }}>
            <p style={{ fontSize: 11.5, fontWeight: 700, margin: 0, textTransform: "uppercase", letterSpacing: 0.6, opacity: 0.85 }}>Valor em aberto</p>
            <p style={{ fontSize: isMobile ? 34 : 42, fontWeight: 800, margin: "6px 0 0", letterSpacing: -1, ...num }}>{money(kpis.rAberto)}</p>
            <p style={{ fontSize: 12.5, margin: "8px 0 0", opacity: 0.9 }}>
              {formatNum(kpis.pendentes + kpis.inadimplentes)} fatura(s) a receber · {formatNum(kpis.clientesInad)} cliente(s) inadimplente(s)
            </p>
          </div>
          {/* recebido */}
          <div style={{ padding: isMobile ? 20 : 26, borderLeft: isMobile ? "none" : `1px solid ${C.line}`, borderTop: isMobile ? `1px solid ${C.line}` : "none" }}>
            <p style={{ fontSize: 11, fontWeight: 700, margin: 0, color: C.sub, textTransform: "uppercase", letterSpacing: 0.5 }}>Já recebido</p>
            <p style={{ fontSize: isMobile ? 26 : 30, fontWeight: 800, margin: "6px 0 0", color: C.pago, letterSpacing: -0.5, ...num }}>{money(kpis.rRecebido)}</p>
            <p style={{ fontSize: 12, margin: "6px 0 0", color: C.sub }}>{formatNum(kpis.pagas)} fatura(s) paga(s)</p>
          </div>
          {/* ticket médio */}
          <div style={{ padding: isMobile ? 20 : 26, borderLeft: isMobile ? "none" : `1px solid ${C.line}`, borderTop: isMobile ? `1px solid ${C.line}` : "none" }}>
            <p style={{ fontSize: 11, fontWeight: 700, margin: 0, color: C.sub, textTransform: "uppercase", letterSpacing: 0.5 }}>Ticket médio</p>
            <p style={{ fontSize: isMobile ? 26 : 30, fontWeight: 800, margin: "6px 0 0", color: C.ink, letterSpacing: -0.5, ...num }}>{moneyFull(kpis.ticket)}</p>
            <p style={{ fontSize: 12, margin: "6px 0 0", color: C.sub }}>por fatura acompanhada</p>
          </div>
        </div>
      )}

      {/* ═══ KPIs DE CONTAGEM (4 cards) ═══ */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap }}>
        {([
          { label: "Pagas", qtd: kpis.pagas, cor: C.pago, bg: "#f0fdf4", icone: "✓", sub: `${kpis.pctPago}% do total` },
          { label: "Pendentes", qtd: kpis.pendentes, cor: C.pend, bg: "#fffbeb", icone: "◷", sub: `${pctOf(kpis.pendentes, kpis.total)}% do total` },
          { label: "Inadimplentes", qtd: kpis.inadimplentes, cor: C.inad, bg: "#fef2f2", icone: "!", sub: `${formatNum(kpis.clientesInad)} cliente(s)` },
          { label: "Inadimplência", qtd: -1, cor: C.brand, bg: "#eef2ff", icone: "%", sub: "do total de faturas", valorTexto: `${kpis.pctInad}%` },
        ]).map(c => (
          <div key={c.label} style={{ ...shell, padding: isMobile ? 16 : 20, position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 0, left: 0, width: 4, height: "100%", background: c.cor }} />
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10 }}>
              <div style={{ width: 30, height: 30, borderRadius: 9, background: c.bg, color: c.cor, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 800 }}>{c.icone}</div>
              <p style={{ color: C.sub, fontSize: 11, fontWeight: 700, margin: 0, textTransform: "uppercase", letterSpacing: 0.4 }}>{c.label}</p>
            </div>
            <p style={{ color: c.cor, fontSize: isMobile ? 26 : 32, fontWeight: 800, margin: 0, letterSpacing: -0.8, ...num }}>
              {c.valorTexto ?? formatNum(c.qtd)}
            </p>
            <p style={{ color: "#94a3b8", fontSize: 11.5, margin: "4px 0 0", fontWeight: 500 }}>{c.sub}</p>
          </div>
        ))}
      </div>

      {/* ═══ PROPORÇÃO (donut) + FRAUDE/CHURN ═══ */}
      {!vazio && (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap }}>
          {/* donut */}
          <div style={{ ...shell, padding: isMobile ? 18 : 24 }}>
            <p style={{ color: C.sub, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, margin: "0 0 16px" }}>Distribuição das faturas</p>
            <div style={{ display: "flex", alignItems: "center", gap: 22, flexWrap: "wrap", justifyContent: isMobile ? "center" : "flex-start" }}>
              <Donut
                centro={`${kpis.pctPago}%`} sub="pago"
                segmentos={[
                  { valor: kpis.pagas, cor: C.pago },
                  { valor: kpis.pendentes, cor: C.pend },
                  { valor: kpis.inadimplentes, cor: C.inad },
                ]}
              />
              <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: 1, minWidth: 160 }}>
                {([
                  { l: "Pagas", q: kpis.pagas, cor: C.pago },
                  { l: "Pendentes", q: kpis.pendentes, cor: C.pend },
                  { l: "Inadimplentes", q: kpis.inadimplentes, cor: C.inad },
                ]).map(x => (
                  <div key={x.l} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ width: 12, height: 12, borderRadius: 4, background: x.cor, flexShrink: 0 }} />
                    <span style={{ color: "#334155", fontSize: 13, fontWeight: 600, flex: 1 }}>{x.l}</span>
                    <span style={{ color: C.ink, fontSize: 14, fontWeight: 800, ...num }}>{formatNum(x.q)}</span>
                    <span style={{ color: C.sub, fontSize: 12, width: 38, textAlign: "right", ...num }}>{pctOf(x.q, kpis.total)}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* fraude + churn */}
          <div style={{ ...shell, padding: isMobile ? 18 : 24 }}>
            <p style={{ color: C.sub, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, margin: "0 0 16px" }}>Risco da carteira</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div style={{ borderRadius: 12, border: `1px solid #fecaca`, background: "#fef2f2", padding: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 18 }}>🛑</span>
                  <span style={{ color: C.fraude, fontSize: 11.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.4 }}>Suspeita de fraude</span>
                </div>
                <p style={{ color: C.fraude, fontSize: 28, fontWeight: 800, margin: 0, ...num }}>{formatNum(kpis.fraude)}</p>
                <p style={{ color: "#b91c1c99", fontSize: 11.5, margin: "2px 0 0", fontWeight: 600 }}>fatura(s) marcada(s)</p>
              </div>
              <div style={{ borderRadius: 12, border: `1px solid #e9d5ff`, background: "#faf5ff", padding: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 18 }}>📉</span>
                  <span style={{ color: C.churn, fontSize: 11.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.4 }}>Churn</span>
                </div>
                <p style={{ color: C.churn, fontSize: 28, fontWeight: 800, margin: 0, ...num }}>{formatNum(kpis.churn)}</p>
                <p style={{ color: "#9333ea99", fontSize: 11.5, margin: "2px 0 0", fontWeight: 600 }}>fatura(s) marcada(s)</p>
              </div>
            </div>
            <div style={{ marginTop: 14, padding: "12px 14px", borderRadius: 10, background: C.soft, display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 16 }}>👥</span>
              <span style={{ color: "#334155", fontSize: 12.5, fontWeight: 600, flex: 1 }}>Clientes com faturas acompanhadas</span>
              <span style={{ color: C.ink, fontSize: 16, fontWeight: 800, ...num }}>{formatNum(kpis.clientesTot)}</span>
            </div>
          </div>
        </div>
      )}

      {/* ═══ EVOLUÇÃO MENSAL (área empilhada) ═══ */}
      {serieMensal.length > 0 && (
        <div style={{ ...shell, padding: isMobile ? 18 : 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 18, flexWrap: "wrap", gap: 8 }}>
            <div>
              <h3 style={{ color: C.ink, fontSize: 16, fontWeight: 800, margin: 0 }}>Evolução mês a mês</h3>
              <p style={{ color: C.sub, fontSize: 12, margin: "2px 0 0" }}>Faturas por status, empilhadas por mês de referência</p>
            </div>
          </div>
          <GraficoArea data={serieMensal} mobile={isMobile} />
          <div style={{ display: "flex", gap: 16, marginTop: 12, justifyContent: "center", flexWrap: "wrap" }}>
            {([["Pagas", C.pago], ["Pendentes", C.pend], ["Inadimplentes", C.inad]] as [string, string][]).map(([l, cor]) => (
              <span key={l} style={{ display: "inline-flex", alignItems: "center", gap: 6, color: C.sub, fontSize: 11.5, fontWeight: 600 }}>
                <span style={{ width: 12, height: 4, borderRadius: 2, background: cor }} /> {l}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ═══ % PAGO POR MÊS + DESTAQUES ═══ */}
      {serieMensal.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "2fr 1fr", gap }}>
          <div style={{ ...shell, padding: isMobile ? 18 : 24 }}>
            <h3 style={{ color: C.ink, fontSize: 15, fontWeight: 800, margin: "0 0 4px" }}>Taxa de pagamento</h3>
            <p style={{ color: C.sub, fontSize: 12, margin: "0 0 16px" }}>% de faturas pagas por mês</p>
            <GraficoPct data={serieMensal} mobile={isMobile} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap }}>
            {destaques?.melhorPago && (
              <div style={{ ...shell, padding: 16, display: "flex", alignItems: "center", gap: 12, borderLeft: `4px solid ${C.pago}` }}>
                <div style={{ fontSize: 26 }}>🏆</div>
                <div>
                  <p style={{ color: C.pago, fontSize: 16, fontWeight: 800, margin: 0, ...num }}>{destaques.melhorPago.mes} · {destaques.melhorPago.pctPago}%</p>
                  <p style={{ color: C.sub, fontSize: 11.5, margin: 0, fontWeight: 600 }}>melhor mês de pagamento</p>
                </div>
              </div>
            )}
            {destaques?.piorInad && destaques.piorInad.Inadimplentes > 0 && (
              <div style={{ ...shell, padding: 16, display: "flex", alignItems: "center", gap: 12, borderLeft: `4px solid ${C.inad}` }}>
                <div style={{ fontSize: 26 }}>🚨</div>
                <div>
                  <p style={{ color: C.inad, fontSize: 16, fontWeight: 800, margin: 0, ...num }}>{destaques.piorInad.mes} · {formatNum(destaques.piorInad.Inadimplentes)}</p>
                  <p style={{ color: C.sub, fontSize: 11.5, margin: 0, fontWeight: 600 }}>mês com mais inadimplência</p>
                </div>
              </div>
            )}
            <div style={{ ...shell, padding: 16, display: "flex", alignItems: "center", gap: 12, borderLeft: `4px solid ${C.brand}` }}>
              <div style={{ fontSize: 26 }}>📅</div>
              <div>
                <p style={{ color: C.brand, fontSize: 16, fontWeight: 800, margin: 0, ...num }}>{serieMensal.length} {serieMensal.length === 1 ? "mês" : "meses"}</p>
                <p style={{ color: C.sub, fontSize: 11.5, margin: 0, fontWeight: 600 }}>de histórico acompanhado</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}