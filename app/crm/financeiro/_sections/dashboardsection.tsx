"use client";
import { useState } from "react";

// ═══════════════════════════════════════════════════════════════════════
// 💵 FINANCEIRO · Dashboard
// ───────────────────────────────────────────────────────────────────────
// Visão geral financeira: KPIs, fluxo receita x despesa, vencimentos
// próximos e despesas por categoria. Os dados abaixo são MOCK (exemplo)
// só pra dar o visual — trocar pelas queries do Supabase quando as tabelas
// (lancamentos, titulos, categorias…) estiverem prontas.
// ═══════════════════════════════════════════════════════════════════════

const COR = "#d97706";
const COR_TEXTO = "#b45309";

const card = {
  background: "#ffffff", borderRadius: 14, border: "1px solid #e5e7eb",
  boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
};

const real = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// MOCK — fluxo por mês (receita x despesa)
const FLUXO = [
  { mes: "Jan", receita: 42000, despesa: 31000 },
  { mes: "Fev", receita: 38000, despesa: 29500 },
  { mes: "Mar", receita: 51000, despesa: 34000 },
  { mes: "Abr", receita: 47000, despesa: 36500 },
  { mes: "Mai", receita: 56000, despesa: 38000 },
  { mes: "Jun", receita: 49000, despesa: 33000 },
];

const VENCIMENTOS = [
  { nome: "Aluguel — Sede", valor: 8500, venc: "05/06", tipo: "pagar" },
  { nome: "Energia (CELG)", valor: 3200, venc: "08/06", tipo: "pagar" },
  { nome: "Cliente ACME Ltda", valor: 12400, venc: "10/06", tipo: "receber" },
  { nome: "Folha — adiantamento", valor: 18900, venc: "15/06", tipo: "pagar" },
  { nome: "Cliente Beta S/A", valor: 7300, venc: "18/06", tipo: "receber" },
];

const CATEGORIAS = [
  { nome: "Folha de Pagamento", valor: 38900, cor: "#6366f1" },
  { nome: "Infraestrutura", valor: 14200, cor: "#0ea5e9" },
  { nome: "Marketing", valor: 9800, cor: "#ec4899" },
  { nome: "Operacional", valor: 7600, cor: "#10b981" },
  { nome: "Impostos", valor: 11500, cor: "#f59e0b" },
];

export function DashboardSection() {
  const [periodo, setPeriodo] = useState<"mes" | "trimestre" | "ano">("mes");

  const totalReceita = FLUXO.reduce((s, f) => s + f.receita, 0);
  const totalDespesa = FLUXO.reduce((s, f) => s + f.despesa, 0);
  const maxFluxo = Math.max(...FLUXO.flatMap(f => [f.receita, f.despesa]));
  const totalCategorias = CATEGORIAS.reduce((s, c) => s + c.valor, 0);

  const kpis = [
    { label: "Saldo em Caixa", valor: real(184300), delta: "+12,4%", up: true, cor: "#16a34a", icon: "🏦" },
    { label: "A Receber (mês)", valor: real(67200), delta: "23 títulos", up: true, cor: "#0ea5e9", icon: "📥" },
    { label: "A Pagar (mês)", valor: real(48600), delta: "17 títulos", up: false, cor: "#f59e0b", icon: "📤" },
    { label: "Resultado do Mês", valor: real(totalReceita - totalDespesa), delta: "+8,1%", up: true, cor: "#8b5cf6", icon: "📊" },
    { label: "Inadimplência", valor: "3,2%", delta: "-0,4 p.p.", up: true, cor: "#dc2626", icon: "⚠️" },
    { label: "Vencidas", valor: real(9800), delta: "5 títulos", up: false, cor: "#6b7280", icon: "⏰" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>

      {/* HEADER */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: `linear-gradient(135deg, ${COR} 0%, #f59e0b 100%)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, boxShadow: `0 8px 20px ${COR}30` }}>
            <span style={{ filter: "saturate(0) brightness(2)" }}>💵</span>
          </div>
          <div>
            <h1 style={{ color: "#1f2937", fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: -0.3 }}>Visão Geral Financeira</h1>
            <p style={{ color: "#6b7280", fontSize: 12, margin: "2px 0 0" }}>Acompanhe o caixa, recebimentos e despesas do período</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, background: "#f1f5f9", padding: 4, borderRadius: 12 }}>
          {(["mes", "trimestre", "ano"] as const).map(p => (
            <button key={p} onClick={() => setPeriodo(p)}
              style={{
                padding: "7px 16px", borderRadius: 9, border: "none", cursor: "pointer",
                fontSize: 12, fontWeight: 700, textTransform: "capitalize",
                background: periodo === p ? "#ffffff" : "transparent",
                color: periodo === p ? COR_TEXTO : "#64748b",
                boxShadow: periodo === p ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
              }}>{p === "mes" ? "Mês" : p}</button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
        {kpis.map(k => (
          <div key={k.label} style={{ ...card, padding: 18, borderTop: `3px solid ${k.cor}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <div style={{ width: 30, height: 30, borderRadius: 9, background: `${k.cor}15`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>{k.icon}</div>
              <p style={{ color: "#6b7280", fontSize: 11, margin: 0, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3 }}>{k.label}</p>
            </div>
            <p style={{ color: "#1f2937", fontSize: 22, fontWeight: 800, margin: 0, letterSpacing: -0.5 }}>{k.valor}</p>
            <p style={{ color: k.up ? "#16a34a" : "#dc2626", fontSize: 11, margin: "4px 0 0", fontWeight: 700 }}>
              {k.up ? "▲" : "▼"} {k.delta}
            </p>
          </div>
        ))}
      </div>

      {/* FLUXO + CATEGORIAS */}
      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 18 }}>

        {/* Gráfico Receita x Despesa */}
        <div style={{ ...card, padding: 22 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
            <div>
              <h3 style={{ color: "#1f2937", fontSize: 15, fontWeight: 700, margin: 0 }}>Receita × Despesa</h3>
              <p style={{ color: "#9ca3af", fontSize: 12, margin: "2px 0 0" }}>Últimos 6 meses</p>
            </div>
            <div style={{ display: "flex", gap: 14 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#6b7280", fontWeight: 600 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: "#16a34a" }} /> Receita</span>
              <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#6b7280", fontWeight: 600 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: COR }} /> Despesa</span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 14, height: 200, padding: "0 4px" }}>
            {FLUXO.map(f => (
              <div key={f.mes} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, height: "100%", justifyContent: "flex-end" }}>
                <div style={{ display: "flex", gap: 4, alignItems: "flex-end", height: "100%", width: "100%", justifyContent: "center" }}>
                  <div title={real(f.receita)} style={{ width: "42%", height: `${(f.receita / maxFluxo) * 100}%`, background: "linear-gradient(180deg, #22c55e 0%, #16a34a 100%)", borderRadius: "5px 5px 0 0", minHeight: 4 }} />
                  <div title={real(f.despesa)} style={{ width: "42%", height: `${(f.despesa / maxFluxo) * 100}%`, background: `linear-gradient(180deg, #f59e0b 0%, ${COR} 100%)`, borderRadius: "5px 5px 0 0", minHeight: 4 }} />
                </div>
                <span style={{ color: "#9ca3af", fontSize: 11, fontWeight: 600 }}>{f.mes}</span>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-around", marginTop: 16, paddingTop: 16, borderTop: "1px solid #f3f4f6" }}>
            <div style={{ textAlign: "center" }}>
              <p style={{ color: "#9ca3af", fontSize: 10, margin: 0, fontWeight: 700, textTransform: "uppercase" }}>Receita total</p>
              <p style={{ color: "#16a34a", fontSize: 18, fontWeight: 800, margin: "2px 0 0" }}>{real(totalReceita)}</p>
            </div>
            <div style={{ textAlign: "center" }}>
              <p style={{ color: "#9ca3af", fontSize: 10, margin: 0, fontWeight: 700, textTransform: "uppercase" }}>Despesa total</p>
              <p style={{ color: COR_TEXTO, fontSize: 18, fontWeight: 800, margin: "2px 0 0" }}>{real(totalDespesa)}</p>
            </div>
            <div style={{ textAlign: "center" }}>
              <p style={{ color: "#9ca3af", fontSize: 10, margin: 0, fontWeight: 700, textTransform: "uppercase" }}>Resultado</p>
              <p style={{ color: "#8b5cf6", fontSize: 18, fontWeight: 800, margin: "2px 0 0" }}>{real(totalReceita - totalDespesa)}</p>
            </div>
          </div>
        </div>

        {/* Despesas por categoria */}
        <div style={{ ...card, padding: 22 }}>
          <h3 style={{ color: "#1f2937", fontSize: 15, fontWeight: 700, margin: "0 0 4px" }}>Despesas por Categoria</h3>
          <p style={{ color: "#9ca3af", fontSize: 12, margin: "0 0 18px" }}>Este mês</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {CATEGORIAS.map(c => {
              const pct = Math.round((c.valor / totalCategorias) * 100);
              return (
                <div key={c.nome}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                    <span style={{ color: "#374151", fontSize: 12, fontWeight: 600 }}>{c.nome}</span>
                    <span style={{ color: "#1f2937", fontSize: 12, fontWeight: 700 }}>{real(c.valor)}</span>
                  </div>
                  <div style={{ height: 8, background: "#f1f5f9", borderRadius: 6, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: c.cor, borderRadius: 6 }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* PRÓXIMOS VENCIMENTOS */}
      <div style={{ ...card, padding: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ color: "#1f2937", fontSize: 15, fontWeight: 700, margin: 0 }}>Próximos Vencimentos</h3>
          <span style={{ color: COR_TEXTO, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Ver todos →</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {VENCIMENTOS.map((v, i) => {
            const ehReceber = v.tipo === "receber";
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 14px", background: "#f9fafb", borderRadius: 10, border: "1px solid #f3f4f6" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 9, background: ehReceber ? "#dcfce7" : "#fef3c7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>{ehReceber ? "📥" : "📤"}</div>
                  <div>
                    <p style={{ color: "#1f2937", fontSize: 13, fontWeight: 700, margin: 0 }}>{v.nome}</p>
                    <p style={{ color: "#9ca3af", fontSize: 11, margin: "2px 0 0" }}>Vence em {v.venc} · {ehReceber ? "A receber" : "A pagar"}</p>
                  </div>
                </div>
                <span style={{ color: ehReceber ? "#16a34a" : COR_TEXTO, fontSize: 14, fontWeight: 800 }}>{ehReceber ? "+" : "-"} {real(v.valor)}</span>
              </div>
            );
          })}
        </div>
      </div>

      <p style={{ color: "#9ca3af", fontSize: 11, margin: 0, textAlign: "center", fontStyle: "italic" }}>
        Dados de exemplo — conecte às tabelas do Supabase pra exibir os números reais.
      </p>
    </div>
  );
}