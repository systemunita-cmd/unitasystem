"use client";
import { useState, useMemo } from "react";

// ═══════════════════════════════════════════════════════════════════════
// 🧑‍💼 RH · Encargos & Impostos
// ───────────────────────────────────────────────────────────────────────
// Encargos da empresa sobre a folha (INSS patronal, RAT, Sistema S, FGTS)
// e provisões (13º, férias + 1/3), por competência. MOCK — alíquotas
// ilustrativas; em produção calcular sobre a folha real do mês.
// ═══════════════════════════════════════════════════════════════════════

const COR = "#4f46e5";
const COR_TEXTO = "#4338ca";
const card = { background: "#ffffff", borderRadius: 14, border: "1px solid #e5e7eb", boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)" };
const real = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const COMPETENCIAS = ["06/2026", "05/2026", "04/2026"];
const FOLHA_BRUTA = 412800; // base exemplo

type Encargo = { rotulo: string; aliquota: number; tipo: "encargo" | "provisao"; descricao: string };
const ENCARGOS: Encargo[] = [
  { rotulo: "INSS Patronal", aliquota: 20, tipo: "encargo", descricao: "Contribuição previdenciária da empresa" },
  { rotulo: "RAT / SAT", aliquota: 2, tipo: "encargo", descricao: "Risco ambiental do trabalho" },
  { rotulo: "Terceiros (Sistema S)", aliquota: 5.8, tipo: "encargo", descricao: "SENAI, SESI, SEBRAE, INCRA, Salário-educação" },
  { rotulo: "FGTS", aliquota: 8, tipo: "encargo", descricao: "Fundo de Garantia (8% sobre a remuneração)" },
  { rotulo: "Provisão 13º salário", aliquota: 8.33, tipo: "provisao", descricao: "1/12 ao mês" },
  { rotulo: "Provisão Férias + 1/3", aliquota: 11.11, tipo: "provisao", descricao: "1/12 + adicional de 1/3" },
];

export function EncargosSection() {
  const [competencia, setCompetencia] = useState(COMPETENCIAS[0]);

  const linhas = useMemo(() => ENCARGOS.map(e => ({ ...e, valor: Math.round(FOLHA_BRUTA * e.aliquota / 100) })), []);
  const totalEncargos = useMemo(() => linhas.filter(l => l.tipo === "encargo").reduce((s, l) => s + l.valor, 0), [linhas]);
  const totalProvisoes = useMemo(() => linhas.filter(l => l.tipo === "provisao").reduce((s, l) => s + l.valor, 0), [linhas]);
  const total = totalEncargos + totalProvisoes;
  const pctSobreFolha = ((total / FOLHA_BRUTA) * 100).toFixed(1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: `linear-gradient(135deg, ${COR} 0%, #6366f1 100%)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, boxShadow: `0 8px 20px ${COR}30` }}><span style={{ filter: "saturate(0) brightness(2)" }}>🏛️</span></div>
          <div>
            <h1 style={{ color: "#1f2937", fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: -0.3 }}>Encargos & Impostos</h1>
            <p style={{ color: "#6b7280", fontSize: 12, margin: "2px 0 0" }}>Sobre a folha de <b style={{ color: COR_TEXTO }}>{real(FOLHA_BRUTA)}</b> · {competencia}</p>
          </div>
        </div>
        <select value={competencia} onChange={e => setCompetencia(e.target.value)} style={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#1f2937", outline: "none", fontWeight: 600 }}>
          {COMPETENCIAS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
        {[
          { label: "Encargos", value: real(totalEncargos), cor: "#6366f1", icon: "🏛️" },
          { label: "Provisões", value: real(totalProvisoes), cor: "#0ea5e9", icon: "📦" },
          { label: "Custo total", value: real(total), cor: "#f59e0b", icon: "💰" },
          { label: "% sobre a folha", value: pctSobreFolha + "%", cor: "#dc2626", icon: "📊" },
        ].map(s => (
          <div key={s.label} style={{ ...card, padding: 16, borderTop: `3px solid ${s.cor}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: `${s.cor}15`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>{s.icon}</div>
              <p style={{ color: "#6b7280", fontSize: 11, margin: 0, fontWeight: 700, textTransform: "uppercase" }}>{s.label}</p>
            </div>
            <p style={{ color: s.cor, fontSize: 19, fontWeight: 800, margin: 0, letterSpacing: -0.5 }}>{s.value}</p>
          </div>
        ))}
      </div>

      <div style={{ ...card, overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid #e5e7eb" }}>
          <h3 style={{ color: "#1f2937", fontSize: 15, fontWeight: 700, margin: 0 }}>Composição dos encargos</h3>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ background: "#f9fafb" }}>
              {["Encargo", "Tipo", "Base de cálculo", "Alíquota", "Valor"].map(h => (
                <th key={h} style={{ padding: "12px 16px", color: "#6b7280", fontSize: 11, textAlign: h === "Valor" || h === "Alíquota" ? "right" : "left", textTransform: "uppercase", letterSpacing: 0.5, whiteSpace: "nowrap", fontWeight: 700, borderBottom: "1px solid #e5e7eb" }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {linhas.map((l, i) => (
                <tr key={l.rotulo} style={{ borderTop: "1px solid #f3f4f6", background: i % 2 === 0 ? "#ffffff" : "#fafbfc" }}>
                  <td style={{ padding: "12px 16px" }}>
                    <p style={{ color: "#1f2937", fontSize: 13, fontWeight: 700, margin: 0 }}>{l.rotulo}</p>
                    <p style={{ color: "#9ca3af", fontSize: 11, margin: "2px 0 0" }}>{l.descricao}</p>
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <span style={{ background: l.tipo === "encargo" ? "#eef2ff" : "#e0f2fe", color: l.tipo === "encargo" ? COR_TEXTO : "#0369a1", fontSize: 11, padding: "3px 10px", borderRadius: 10, fontWeight: 700 }}>{l.tipo === "encargo" ? "Encargo" : "Provisão"}</span>
                  </td>
                  <td style={{ padding: "12px 16px", color: "#6b7280", fontSize: 12, whiteSpace: "nowrap" }}>{real(FOLHA_BRUTA)}</td>
                  <td style={{ padding: "12px 16px", textAlign: "right", color: "#4b5563", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>{l.aliquota}%</td>
                  <td style={{ padding: "12px 16px", textAlign: "right", color: "#1f2937", fontSize: 13, fontWeight: 800, whiteSpace: "nowrap" }}>{real(l.valor)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: "#f9fafb", borderTop: "2px solid #e5e7eb" }}>
                <td colSpan={4} style={{ padding: "12px 16px", color: "#1f2937", fontSize: 12, fontWeight: 800 }}>CUSTO TOTAL DE ENCARGOS</td>
                <td style={{ padding: "12px 16px", textAlign: "right", color: COR_TEXTO, fontSize: 14, fontWeight: 800, whiteSpace: "nowrap" }}>{real(total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <p style={{ color: "#9ca3af", fontSize: 11, margin: 0, textAlign: "center", fontStyle: "italic" }}>Dados de exemplo — alíquotas ilustrativas. Ajuste conforme o enquadramento da empresa (Simples, Lucro Presumido/Real).</p>
    </div>
  );
}