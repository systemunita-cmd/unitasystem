"use client";
import { useState, useMemo } from "react";

// ═══════════════════════════════════════════════════════════════════════
// 🧑‍💼 RH · Banco de Horas
// ───────────────────────────────────────────────────────────────────────
// Saldo de horas por colaborador (positivo/negativo) + extrato de
// créditos e débitos. MOCK. Em produção, somar lançamentos de 'banco_horas'.
// ═══════════════════════════════════════════════════════════════════════

const COR = "#4f46e5";
const COR_TEXTO = "#4338ca";
const card = { background: "#ffffff", borderRadius: 14, border: "1px solid #e5e7eb", boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)" };

type Lancamento = { data: string; descricao: string; horas: number };
type Saldo = { id: string; nome: string; cargo: string; saldo: number; extrato: Lancamento[] };

const MOCK: Saldo[] = [
  { id: "1", nome: "Ana Beatriz Souza", cargo: "Analista Comercial", saldo: 6, extrato: [
    { data: "03/06", descricao: "Hora extra — fechamento", horas: 4 }, { data: "10/06", descricao: "Hora extra — evento", horas: 4 }, { data: "18/06", descricao: "Compensação (saída antecipada)", horas: -2 } ] },
  { id: "2", nome: "Rafael Lima", cargo: "Assistente Financeiro", saldo: 12, extrato: [
    { data: "05/06", descricao: "Hora extra — folha", horas: 8 }, { data: "12/06", descricao: "Hora extra — conciliação", horas: 4 } ] },
  { id: "3", nome: "Larissa Nunes", cargo: "Vendedora", saldo: -8, extrato: [
    { data: "07/06", descricao: "Falta justificada (1/2 dia)", horas: -4 }, { data: "14/06", descricao: "Saída antecipada", horas: -4 } ] },
  { id: "4", nome: "Bruno Tavares", cargo: "Atendente", saldo: -26, extrato: [
    { data: "02/06", descricao: "Faltas (3 dias)", horas: -24 }, { data: "20/06", descricao: "Atraso acumulado", horas: -2 } ] },
  { id: "5", nome: "Patrícia Gomes", cargo: "Gerente", saldo: 2, extrato: [
    { data: "09/06", descricao: "Hora extra — reunião", horas: 2 } ] },
];

const fmt = (h: number) => `${h > 0 ? "+" : ""}${h}h`;

export function BancoHorasSection() {
  const [extrato, setExtrato] = useState<Saldo | null>(null);

  const stats = useMemo(() => ({
    positivo: MOCK.filter(s => s.saldo > 0).reduce((s, x) => s + x.saldo, 0),
    negativo: MOCK.filter(s => s.saldo < 0).reduce((s, x) => s + x.saldo, 0),
    liquido: MOCK.reduce((s, x) => s + x.saldo, 0),
  }), []);
  const maxAbs = Math.max(...MOCK.map(s => Math.abs(s.saldo)), 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 48, height: 48, borderRadius: 14, background: `linear-gradient(135deg, ${COR} 0%, #6366f1 100%)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, boxShadow: `0 8px 20px ${COR}30` }}><span style={{ filter: "saturate(0) brightness(2)" }}>⏳</span></div>
        <div>
          <h1 style={{ color: "#1f2937", fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: -0.3 }}>Banco de Horas</h1>
          <p style={{ color: "#6b7280", fontSize: 12, margin: "2px 0 0" }}>Saldos e compensações por colaborador</p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 14 }}>
        {[
          { label: "Saldo positivo", value: fmt(stats.positivo), cor: "#16a34a", icon: "📈" },
          { label: "Saldo negativo", value: fmt(stats.negativo), cor: "#dc2626", icon: "📉" },
          { label: "Líquido geral", value: fmt(stats.liquido), cor: stats.liquido >= 0 ? "#16a34a" : "#dc2626", icon: "⚖️" },
        ].map(s => (
          <div key={s.label} style={{ ...card, padding: 16, borderTop: `3px solid ${s.cor}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: `${s.cor}15`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>{s.icon}</div>
              <p style={{ color: "#6b7280", fontSize: 11, margin: 0, fontWeight: 700, textTransform: "uppercase" }}>{s.label}</p>
            </div>
            <p style={{ color: s.cor, fontSize: 22, fontWeight: 800, margin: 0, letterSpacing: -0.5 }}>{s.value}</p>
          </div>
        ))}
      </div>

      <div style={{ ...card, padding: 8 }}>
        {MOCK.map((s, i) => {
          const pos = s.saldo >= 0;
          const cor = pos ? "#16a34a" : "#dc2626";
          const larg = (Math.abs(s.saldo) / maxAbs) * 50; // % de cada lado a partir do centro
          return (
            <div key={s.id} onClick={() => setExtrato(s)}
              style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 14px", borderTop: i === 0 ? "none" : "1px solid #f3f4f6", cursor: "pointer", borderRadius: 8 }}
              onMouseEnter={e => e.currentTarget.style.background = "#f9fafb"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: `linear-gradient(135deg, ${COR} 0%, #6366f1 100%)`, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 14, fontWeight: 700, flexShrink: 0 }}>{s.nome.charAt(0)}</div>
              <div style={{ width: 180, minWidth: 0 }}>
                <p style={{ color: "#1f2937", fontSize: 13, fontWeight: 700, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.nome}</p>
                <p style={{ color: "#9ca3af", fontSize: 11, margin: "2px 0 0" }}>{s.cargo}</p>
              </div>
              {/* Barra divergente */}
              <div style={{ flex: 1, display: "flex", alignItems: "center", height: 12, minWidth: 80 }}>
                <div style={{ width: "50%", display: "flex", justifyContent: "flex-end" }}>
                  {!pos && <div style={{ height: 10, width: `${larg * 2}%`, background: "#dc2626", borderRadius: "5px 0 0 5px" }} />}
                </div>
                <div style={{ width: 1, height: 14, background: "#e5e7eb" }} />
                <div style={{ width: "50%" }}>
                  {pos && <div style={{ height: 10, width: `${larg * 2}%`, background: "#16a34a", borderRadius: "0 5px 5px 0" }} />}
                </div>
              </div>
              <span style={{ color: cor, fontSize: 15, fontWeight: 800, width: 56, textAlign: "right", flexShrink: 0 }}>{fmt(s.saldo)}</span>
            </div>
          );
        })}
      </div>

      {extrato && (
        <div onClick={() => setExtrato(null)} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", backdropFilter: "blur(4px)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ ...card, width: "100%", maxWidth: 460, maxHeight: "92vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "18px 24px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h3 style={{ color: "#1f2937", fontSize: 16, fontWeight: 700, margin: 0 }}>Extrato — {extrato.nome}</h3>
                <p style={{ color: "#9ca3af", fontSize: 12, margin: "2px 0 0" }}>Saldo atual: <b style={{ color: extrato.saldo >= 0 ? "#16a34a" : "#dc2626" }}>{fmt(extrato.saldo)}</b></p>
              </div>
              <button onClick={() => setExtrato(null)} style={{ background: "#f3f4f6", border: "none", color: "#6b7280", fontSize: 16, cursor: "pointer", width: 32, height: 32, borderRadius: 8 }}>✕</button>
            </div>
            <div style={{ padding: 24, overflowY: "auto" }}>
              {extrato.extrato.map((l, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #f3f4f6" }}>
                  <div>
                    <p style={{ color: "#374151", fontSize: 13, margin: 0 }}>{l.descricao}</p>
                    <p style={{ color: "#9ca3af", fontSize: 11, margin: "2px 0 0" }}>{l.data}</p>
                  </div>
                  <span style={{ color: l.horas >= 0 ? "#16a34a" : "#dc2626", fontSize: 14, fontWeight: 800 }}>{fmt(l.horas)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <p style={{ color: "#9ca3af", fontSize: 11, margin: 0, textAlign: "center", fontStyle: "italic" }}>Dados de exemplo — conecte à tabela <b>banco_horas</b> do Supabase.</p>
    </div>
  );
}