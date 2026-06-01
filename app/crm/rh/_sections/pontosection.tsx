"use client";
import { useState, useMemo } from "react";

// ═══════════════════════════════════════════════════════════════════════
// 🧑‍💼 RH · Ponto / Frequência
// ───────────────────────────────────────────────────────────────────────
// Espelho de ponto por competência: horas previstas × trabalhadas, extras,
// atrasos, faltas e saldo de banco de horas por colaborador. MOCK.
// Em produção, agregar marcações da tabela 'ponto_marcacoes'.
// ═══════════════════════════════════════════════════════════════════════

const COR = "#4f46e5";
const COR_TEXTO = "#4338ca";
const card = { background: "#ffffff", borderRadius: 14, border: "1px solid #e5e7eb", boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)" };
const inputStyle = { width: "100%", background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 14px", color: "#1f2937", fontSize: 13, boxSizing: "border-box" as const, outline: "none" };

const COMPETENCIAS = ["06/2026", "05/2026", "04/2026"];

type Ponto = { id: string; nome: string; cargo: string; previstas: number; trabalhadas: number; extras: number; atrasosMin: number; faltas: number; saldoBanco: number };

const MOCK: Ponto[] = [
  { id: "1", nome: "Ana Beatriz Souza", cargo: "Analista Comercial", previstas: 176, trabalhadas: 180, extras: 8, atrasosMin: 25, faltas: 0, saldoBanco: 4 },
  { id: "2", nome: "Carlos Mendes", cargo: "Supervisor", previstas: 176, trabalhadas: 176, extras: 0, atrasosMin: 0, faltas: 0, saldoBanco: 0 },
  { id: "3", nome: "Larissa Nunes", cargo: "Vendedora", previstas: 176, trabalhadas: 168, extras: 0, atrasosMin: 90, faltas: 1, saldoBanco: -8 },
  { id: "4", nome: "Rafael Lima", cargo: "Assistente Financeiro", previstas: 176, trabalhadas: 184, extras: 12, atrasosMin: 0, faltas: 0, saldoBanco: 8 },
  { id: "5", nome: "Bruno Tavares", cargo: "Atendente", previstas: 176, trabalhadas: 150, extras: 0, atrasosMin: 45, faltas: 3, saldoBanco: -26 },
  { id: "6", nome: "Patrícia Gomes", cargo: "Gerente", previstas: 176, trabalhadas: 178, extras: 4, atrasosMin: 0, faltas: 0, saldoBanco: 2 },
];

const horas = (h: number) => `${h}h`;
const minToH = (m: number) => `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`;

export function PontoSection() {
  const [competencia, setCompetencia] = useState(COMPETENCIAS[0]);
  const [busca, setBusca] = useState("");

  const lista = useMemo(() => {
    if (!busca) return MOCK;
    const b = busca.toLowerCase();
    return MOCK.filter(p => p.nome.toLowerCase().includes(b) || p.cargo.toLowerCase().includes(b));
  }, [busca]);

  const stats = useMemo(() => {
    const presenca = MOCK.length ? Math.round(MOCK.reduce((s, p) => s + (p.trabalhadas / p.previstas) * 100, 0) / MOCK.length) : 0;
    return {
      presenca,
      extras: MOCK.reduce((s, p) => s + p.extras, 0),
      faltas: MOCK.reduce((s, p) => s + p.faltas, 0),
      atrasos: MOCK.reduce((s, p) => s + p.atrasosMin, 0),
    };
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: `linear-gradient(135deg, ${COR} 0%, #6366f1 100%)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, boxShadow: `0 8px 20px ${COR}30` }}><span style={{ filter: "saturate(0) brightness(2)" }}>⏰</span></div>
          <div>
            <h1 style={{ color: "#1f2937", fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: -0.3 }}>Ponto / Frequência</h1>
            <p style={{ color: "#6b7280", fontSize: 12, margin: "2px 0 0" }}>Espelho de ponto · competência <b style={{ color: COR_TEXTO }}>{competencia}</b></p>
          </div>
        </div>
        <select value={competencia} onChange={e => setCompetencia(e.target.value)} style={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#1f2937", outline: "none", fontWeight: 600 }}>
          {COMPETENCIAS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 14 }}>
        {[
          { label: "Presença média", value: stats.presenca + "%", cor: "#16a34a", icon: "✅" },
          { label: "Horas extras", value: horas(stats.extras), cor: "#6366f1", icon: "⏱️" },
          { label: "Atrasos", value: minToH(stats.atrasos), cor: "#f59e0b", icon: "🐌" },
          { label: "Faltas", value: String(stats.faltas), cor: "#dc2626", icon: "🚫" },
        ].map(s => (
          <div key={s.label} style={{ ...card, padding: 16, borderTop: `3px solid ${s.cor}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: `${s.cor}15`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>{s.icon}</div>
              <p style={{ color: "#6b7280", fontSize: 11, margin: 0, fontWeight: 700, textTransform: "uppercase" }}>{s.label}</p>
            </div>
            <p style={{ color: s.cor, fontSize: 20, fontWeight: 800, margin: 0, letterSpacing: -0.5 }}>{s.value}</p>
          </div>
        ))}
      </div>

      <div style={{ ...card, padding: 14 }}>
        <input placeholder="🔍 Buscar colaborador..." value={busca} onChange={e => setBusca(e.target.value)} style={{ ...inputStyle, borderRadius: 20 }} />
      </div>

      <div style={{ ...card, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ background: "#f9fafb" }}>
              {["Colaborador", "Previstas", "Trabalhadas", "Extras", "Atrasos", "Faltas", "Banco de horas"].map(h => (
                <th key={h} style={{ padding: "12px 16px", color: "#6b7280", fontSize: 11, textAlign: h === "Colaborador" ? "left" : "right", textTransform: "uppercase", letterSpacing: 0.5, whiteSpace: "nowrap", fontWeight: 700, borderBottom: "1px solid #e5e7eb" }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {lista.map((p, i) => {
                const corSaldo = p.saldoBanco > 0 ? "#16a34a" : p.saldoBanco < 0 ? "#dc2626" : "#6b7280";
                return (
                  <tr key={p.id} style={{ borderTop: "1px solid #f3f4f6", background: i % 2 === 0 ? "#ffffff" : "#fafbfc" }}>
                    <td style={{ padding: "12px 16px" }}>
                      <p style={{ color: "#1f2937", fontSize: 13, fontWeight: 700, margin: 0 }}>{p.nome}</p>
                      <p style={{ color: "#9ca3af", fontSize: 11, margin: "2px 0 0" }}>{p.cargo}</p>
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "right", color: "#6b7280", fontSize: 12 }}>{horas(p.previstas)}</td>
                    <td style={{ padding: "12px 16px", textAlign: "right", color: "#1f2937", fontSize: 12, fontWeight: 700 }}>{horas(p.trabalhadas)}</td>
                    <td style={{ padding: "12px 16px", textAlign: "right", color: p.extras ? "#16a34a" : "#9ca3af", fontSize: 12 }}>{p.extras ? "+" + horas(p.extras) : "—"}</td>
                    <td style={{ padding: "12px 16px", textAlign: "right", color: p.atrasosMin ? "#f59e0b" : "#9ca3af", fontSize: 12 }}>{p.atrasosMin ? minToH(p.atrasosMin) : "—"}</td>
                    <td style={{ padding: "12px 16px", textAlign: "right" }}>{p.faltas ? <span style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", fontSize: 11, padding: "2px 8px", borderRadius: 8, fontWeight: 700 }}>{p.faltas}</span> : <span style={{ color: "#9ca3af", fontSize: 12 }}>0</span>}</td>
                    <td style={{ padding: "12px 16px", textAlign: "right", color: corSaldo, fontSize: 13, fontWeight: 800, whiteSpace: "nowrap" }}>{p.saldoBanco > 0 ? "+" : ""}{horas(p.saldoBanco)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p style={{ color: "#9ca3af", fontSize: 11, margin: 0, textAlign: "center", fontStyle: "italic" }}>Dados de exemplo — conecte às marcações de ponto reais (tabela <b>ponto_marcacoes</b>).</p>
    </div>
  );
}