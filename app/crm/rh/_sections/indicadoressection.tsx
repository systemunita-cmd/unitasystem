"use client";
import { useState } from "react";

// ═══════════════════════════════════════════════════════════════════════
// 🧑‍💼 RH · Indicadores
// ───────────────────────────────────────────────────────────────────────
// Painel analítico de RH: turnover, absenteísmo, tempo de casa, custo médio,
// evolução de headcount e distribuições. Somente leitura. MOCK.
// ═══════════════════════════════════════════════════════════════════════

const COR = "#4f46e5";
const card = { background: "#ffffff", borderRadius: 14, border: "1px solid #e5e7eb", boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)" };
const real = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const HEADCOUNT = [
  { mes: "Jan", qtd: 82 }, { mes: "Fev", qtd: 84 }, { mes: "Mar", qtd: 86 },
  { mes: "Abr", qtd: 85 }, { mes: "Mai", qtd: 88 }, { mes: "Jun", qtd: 90 },
];
const TEMPO_CASA = [
  { faixa: "< 1 ano", qtd: 31, cor: "#0ea5e9" },
  { faixa: "1 a 3 anos", qtd: 34, cor: "#6366f1" },
  { faixa: "3 a 5 anos", qtd: 16, cor: "#8b5cf6" },
  { faixa: "+ 5 anos", qtd: 9, cor: "#16a34a" },
];
const GENERO = [
  { rotulo: "Feminino", qtd: 48, cor: "#ec4899" },
  { rotulo: "Masculino", qtd: 41, cor: "#0ea5e9" },
  { rotulo: "Outro / N.I.", qtd: 1, cor: "#9ca3af" },
];

export function IndicadoresSection() {
  const [periodo, setPeriodo] = useState<"sem" | "ano">("sem");
  const maxHC = Math.max(...HEADCOUNT.map(h => h.qtd));
  const totalTempo = TEMPO_CASA.reduce((s, t) => s + t.qtd, 0);
  const totalGen = GENERO.reduce((s, g) => s + g.qtd, 0);

  const kpis = [
    { label: "Turnover (mês)", valor: "2,1%", cor: "#0ea5e9", icon: "🔄", delta: "estável" },
    { label: "Absenteísmo", valor: "3,4%", cor: "#f59e0b", icon: "📉", delta: "-0,3 p.p." },
    { label: "Tempo médio de casa", valor: "2,8 anos", cor: "#6366f1", icon: "📆", delta: "+0,2" },
    { label: "Custo médio / func.", valor: real(4587), cor: "#16a34a", icon: "💰", delta: "+1,8%" },
    { label: "Headcount", valor: "90", cor: "#8b5cf6", icon: "👥", delta: "+2" },
    { label: "Idade média", valor: "32 anos", cor: "#ec4899", icon: "🎂", delta: "—" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: `linear-gradient(135deg, ${COR} 0%, #6366f1 100%)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, boxShadow: `0 8px 20px ${COR}30` }}><span style={{ filter: "saturate(0) brightness(2)" }}>📈</span></div>
          <div>
            <h1 style={{ color: "#1f2937", fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: -0.3 }}>Indicadores de RH</h1>
            <p style={{ color: "#6b7280", fontSize: 12, margin: "2px 0 0" }}>Métricas analíticas do quadro de pessoal</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, background: "#f1f5f9", padding: 4, borderRadius: 12 }}>
          {(["sem", "ano"] as const).map(p => (
            <button key={p} onClick={() => setPeriodo(p)} style={{ padding: "7px 16px", borderRadius: 9, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700, background: periodo === p ? "#ffffff" : "transparent", color: periodo === p ? "#4338ca" : "#64748b", boxShadow: periodo === p ? "0 1px 3px rgba(0,0,0,0.1)" : "none" }}>{p === "sem" ? "Semestre" : "Ano"}</button>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
        {kpis.map(k => (
          <div key={k.label} style={{ ...card, padding: 18, borderTop: `3px solid ${k.cor}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <div style={{ width: 30, height: 30, borderRadius: 9, background: `${k.cor}15`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>{k.icon}</div>
              <p style={{ color: "#6b7280", fontSize: 11, margin: 0, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3 }}>{k.label}</p>
            </div>
            <p style={{ color: "#1f2937", fontSize: 22, fontWeight: 800, margin: 0, letterSpacing: -0.5 }}>{k.valor}</p>
            <p style={{ color: "#9ca3af", fontSize: 11, margin: "4px 0 0", fontWeight: 600 }}>{k.delta}</p>
          </div>
        ))}
      </div>

      {/* Evolução de headcount */}
      <div style={{ ...card, padding: 22 }}>
        <h3 style={{ color: "#1f2937", fontSize: 15, fontWeight: 700, margin: "0 0 4px" }}>Evolução do Headcount</h3>
        <p style={{ color: "#9ca3af", fontSize: 12, margin: "0 0 18px" }}>Últimos 6 meses</p>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 18, height: 180 }}>
          {HEADCOUNT.map(h => (
            <div key={h.mes} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, height: "100%", justifyContent: "flex-end" }}>
              <span style={{ color: "#1f2937", fontSize: 13, fontWeight: 800 }}>{h.qtd}</span>
              <div style={{ width: "55%", height: `${(h.qtd / maxHC) * 100}%`, background: `linear-gradient(180deg, ${COR} 0%, #6366f1 100%)`, borderRadius: "6px 6px 0 0", minHeight: 8 }} />
              <span style={{ color: "#9ca3af", fontSize: 11, fontWeight: 600 }}>{h.mes}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Distribuições */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        <div style={{ ...card, padding: 22 }}>
          <h3 style={{ color: "#1f2937", fontSize: 15, fontWeight: 700, margin: "0 0 18px" }}>Por tempo de casa</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {TEMPO_CASA.map(t => {
              const pct = Math.round((t.qtd / totalTempo) * 100);
              return (
                <div key={t.faixa}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                    <span style={{ color: "#374151", fontSize: 12, fontWeight: 600 }}>{t.faixa}</span>
                    <span style={{ color: "#1f2937", fontSize: 12, fontWeight: 700 }}>{t.qtd} ({pct}%)</span>
                  </div>
                  <div style={{ height: 8, background: "#f1f5f9", borderRadius: 6, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: t.cor, borderRadius: 6 }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ ...card, padding: 22 }}>
          <h3 style={{ color: "#1f2937", fontSize: 15, fontWeight: 700, margin: "0 0 18px" }}>Por gênero</h3>
          {/* Barra empilhada */}
          <div style={{ display: "flex", height: 28, borderRadius: 8, overflow: "hidden", marginBottom: 16 }}>
            {GENERO.map(g => <div key={g.rotulo} title={g.rotulo} style={{ width: `${(g.qtd / totalGen) * 100}%`, background: g.cor }} />)}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {GENERO.map(g => (
              <div key={g.rotulo} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 8, color: "#374151", fontSize: 12, fontWeight: 600 }}><span style={{ width: 12, height: 12, borderRadius: 4, background: g.cor }} /> {g.rotulo}</span>
                <span style={{ color: "#1f2937", fontSize: 12, fontWeight: 700 }}>{g.qtd} ({Math.round((g.qtd / totalGen) * 100)}%)</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <p style={{ color: "#9ca3af", fontSize: 11, margin: 0, textAlign: "center", fontStyle: "italic" }}>Dados de exemplo — calcule os indicadores a partir das tabelas reais (funcionarios, ponto, folha).</p>
    </div>
  );
}