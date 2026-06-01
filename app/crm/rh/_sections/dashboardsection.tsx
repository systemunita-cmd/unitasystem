"use client";
import { useState } from "react";

// ═══════════════════════════════════════════════════════════════════════
// 🧑‍💼 RH · Dashboard
// ───────────────────────────────────────────────────────────────────────
// Visão geral de pessoas: headcount, movimentações, custo de folha,
// headcount por departamento, aniversariantes e pendências.
// Dados MOCK (exemplo) só pra dar o visual — trocar pelas queries do
// Supabase (funcionarios, departamentos, folha…) depois.
// ═══════════════════════════════════════════════════════════════════════

const COR = "#4f46e5";
const COR_TEXTO = "#4338ca";

const card = {
  background: "#ffffff", borderRadius: 14, border: "1px solid #e5e7eb",
  boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
};

const real = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// MOCK
const DEPARTAMENTOS = [
  { nome: "Comercial", qtd: 28, cor: "#6366f1" },
  { nome: "Atendimento", qtd: 34, cor: "#0ea5e9" },
  { nome: "Financeiro", qtd: 9, cor: "#f59e0b" },
  { nome: "TI", qtd: 12, cor: "#10b981" },
  { nome: "Administrativo", qtd: 7, cor: "#ec4899" },
];

const ANIVERSARIANTES = [
  { nome: "Ana Beatriz Souza", cargo: "Analista Comercial", dia: "03/06" },
  { nome: "Carlos Mendes", cargo: "Supervisor de Atendimento", dia: "11/06" },
  { nome: "Juliana Prado", cargo: "Desenvolvedora", dia: "19/06" },
  { nome: "Rafael Lima", cargo: "Assistente Financeiro", dia: "27/06" },
];

const PENDENCIAS = [
  { texto: "3 contratos aguardando assinatura", icon: "📄", cor: "#f59e0b" },
  { texto: "5 atestados pendentes de validação", icon: "🏥", cor: "#dc2626" },
  { texto: "2 períodos de férias a aprovar", icon: "🌴", cor: "#0ea5e9" },
  { texto: "8 exames periódicos vencendo este mês", icon: "🩺", cor: "#8b5cf6" },
];

export function DashboardSection() {
  const [periodo, setPeriodo] = useState<"mes" | "trimestre" | "ano">("mes");

  const totalFunc = DEPARTAMENTOS.reduce((s, d) => s + d.qtd, 0);
  const maxDep = Math.max(...DEPARTAMENTOS.map(d => d.qtd));

  const kpis = [
    { label: "Funcionários", valor: String(totalFunc), delta: "+4 no mês", up: true, cor: "#6366f1", icon: "👥" },
    { label: "Admissões (mês)", valor: "6", delta: "+2 vs mês ant.", up: true, cor: "#16a34a", icon: "✅" },
    { label: "Desligamentos", valor: "2", delta: "-1 vs mês ant.", up: true, cor: "#dc2626", icon: "🚪" },
    { label: "Turnover", valor: "2,1%", delta: "estável", up: true, cor: "#0ea5e9", icon: "🔄" },
    { label: "Custo da Folha", valor: real(412800), delta: "+3,2%", up: false, cor: "#f59e0b", icon: "💰" },
    { label: "Aniversariantes", valor: String(ANIVERSARIANTES.length), delta: "este mês", up: true, cor: "#ec4899", icon: "🎂" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>

      {/* HEADER */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: `linear-gradient(135deg, ${COR} 0%, #6366f1 100%)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, boxShadow: `0 8px 20px ${COR}30` }}>
            <span style={{ filter: "saturate(0) brightness(2)" }}>🧑‍💼</span>
          </div>
          <div>
            <h1 style={{ color: "#1f2937", fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: -0.3 }}>Visão Geral de RH</h1>
            <p style={{ color: "#6b7280", fontSize: 12, margin: "2px 0 0" }}>Acompanhe o quadro de pessoal, folha e movimentações</p>
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

      {/* HEADCOUNT + ANIVERSARIANTES */}
      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 18 }}>

        {/* Headcount por departamento */}
        <div style={{ ...card, padding: 22 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
            <div>
              <h3 style={{ color: "#1f2937", fontSize: 15, fontWeight: 700, margin: 0 }}>Headcount por Departamento</h3>
              <p style={{ color: "#9ca3af", fontSize: 12, margin: "2px 0 0" }}>{totalFunc} funcionários no total</p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 18, height: 200, padding: "0 4px" }}>
            {DEPARTAMENTOS.map(d => (
              <div key={d.nome} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, height: "100%", justifyContent: "flex-end" }}>
                <span style={{ color: "#1f2937", fontSize: 13, fontWeight: 800 }}>{d.qtd}</span>
                <div title={`${d.qtd} pessoas`} style={{ width: "60%", height: `${(d.qtd / maxDep) * 100}%`, background: `linear-gradient(180deg, ${d.cor} 0%, ${d.cor}cc 100%)`, borderRadius: "6px 6px 0 0", minHeight: 6 }} />
                <span style={{ color: "#9ca3af", fontSize: 11, fontWeight: 600, textAlign: "center" }}>{d.nome}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Aniversariantes do mês */}
        <div style={{ ...card, padding: 22 }}>
          <h3 style={{ color: "#1f2937", fontSize: 15, fontWeight: 700, margin: "0 0 4px" }}>🎂 Aniversariantes</h3>
          <p style={{ color: "#9ca3af", fontSize: 12, margin: "0 0 16px" }}>Este mês</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {ANIVERSARIANTES.map((a, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 11 }}>
                <div style={{ width: 38, height: 38, borderRadius: "50%", background: `linear-gradient(135deg, ${COR} 0%, #6366f1 100%)`, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 14, fontWeight: 700, flexShrink: 0 }}>
                  {a.nome.charAt(0)}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ color: "#1f2937", fontSize: 13, fontWeight: 700, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.nome}</p>
                  <p style={{ color: "#9ca3af", fontSize: 11, margin: "1px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.cargo}</p>
                </div>
                <span style={{ background: COR_TEXTO + "12", color: COR_TEXTO, fontSize: 11, fontWeight: 700, padding: "4px 9px", borderRadius: 8, flexShrink: 0 }}>{a.dia}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* PENDÊNCIAS */}
      <div style={{ ...card, padding: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ color: "#1f2937", fontSize: 15, fontWeight: 700, margin: 0 }}>Pendências de RH</h3>
          <span style={{ color: COR_TEXTO, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Ver todas →</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
          {PENDENCIAS.map((p, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 14px", background: "#f9fafb", borderRadius: 10, border: "1px solid #f3f4f6" }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: `${p.cor}15`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>{p.icon}</div>
              <p style={{ color: "#374151", fontSize: 13, fontWeight: 600, margin: 0 }}>{p.texto}</p>
            </div>
          ))}
        </div>
      </div>

      <p style={{ color: "#9ca3af", fontSize: 11, margin: 0, textAlign: "center", fontStyle: "italic" }}>
        Dados de exemplo — conecte às tabelas do Supabase pra exibir os números reais.
      </p>
    </div>
  );
}