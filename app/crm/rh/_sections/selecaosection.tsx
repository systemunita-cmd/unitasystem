"use client";
import { useState, useMemo } from "react";

// ═══════════════════════════════════════════════════════════════════════
// 🧑‍💼 RH · Processos Seletivos
// ───────────────────────────────────────────────────────────────────────
// Pipeline (kanban) do recrutamento por etapa. Filtra por vaga. Cada card
// é um candidato; setas movem entre etapas. MOCK.
// ═══════════════════════════════════════════════════════════════════════

const COR = "#4f46e5";
const COR_TEXTO = "#4338ca";

const ETAPAS = [
  { key: "triagem", label: "Triagem", cor: "#0ea5e9" },
  { key: "entrevista", label: "Entrevista", cor: "#6366f1" },
  { key: "teste", label: "Teste técnico", cor: "#8b5cf6" },
  { key: "proposta", label: "Proposta", cor: "#f59e0b" },
  { key: "contratado", label: "Contratado", cor: "#16a34a" },
];

type Cand = { id: string; nome: string; vaga: string; etapa: string };

const VAGAS = ["Todas", "Desenvolvedor Front-end", "Vendedor Externo", "Atendente de Suporte"];

const MOCK: Cand[] = [
  { id: "1", nome: "Felipe Ramos", vaga: "Desenvolvedor Front-end", etapa: "entrevista" },
  { id: "2", nome: "Camila Duarte", vaga: "Desenvolvedor Front-end", etapa: "teste" },
  { id: "3", nome: "Marcos Vieira", vaga: "Desenvolvedor Front-end", etapa: "triagem" },
  { id: "4", nome: "Thiago Barros", vaga: "Vendedor Externo", etapa: "triagem" },
  { id: "5", nome: "Aline Fernandes", vaga: "Vendedor Externo", etapa: "proposta" },
  { id: "6", nome: "Renata Lopes", vaga: "Atendente de Suporte", etapa: "proposta" },
  { id: "7", nome: "Gustavo Pinto", vaga: "Atendente de Suporte", etapa: "contratado" },
  { id: "8", nome: "Sofia Carvalho", vaga: "Atendente de Suporte", etapa: "entrevista" },
];

export function SelecaoSection() {
  const [lista, setLista] = useState<Cand[]>(MOCK);
  const [vaga, setVaga] = useState("Todas");

  const filtrados = useMemo(() => vaga === "Todas" ? lista : lista.filter(c => c.vaga === vaga), [lista, vaga]);

  const mover = (id: string, dir: 1 | -1) => {
    setLista(l => l.map(c => {
      if (c.id !== id) return c;
      const idx = ETAPAS.findIndex(e => e.key === c.etapa);
      const novo = Math.min(ETAPAS.length - 1, Math.max(0, idx + dir));
      return { ...c, etapa: ETAPAS[novo].key };
    }));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: `linear-gradient(135deg, ${COR} 0%, #6366f1 100%)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, boxShadow: `0 8px 20px ${COR}30` }}><span style={{ filter: "saturate(0) brightness(2)" }}>✅</span></div>
          <div>
            <h1 style={{ color: "#1f2937", fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: -0.3 }}>Processos Seletivos</h1>
            <p style={{ color: "#6b7280", fontSize: 12, margin: "2px 0 0" }}>Pipeline de recrutamento por etapa</p>
          </div>
        </div>
        <select value={vaga} onChange={e => setVaga(e.target.value)} style={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#1f2937", outline: "none", fontWeight: 600 }}>
          {VAGAS.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
      </div>

      {/* KANBAN */}
      <div style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 8 }}>
        {ETAPAS.map(et => {
          const cards = filtrados.filter(c => c.etapa === et.key);
          return (
            <div key={et.key} style={{ minWidth: 240, flex: "1 1 240px", background: "#f9fafb", borderRadius: 14, border: "1px solid #e5e7eb", display: "flex", flexDirection: "column" }}>
              <div style={{ padding: "12px 14px", borderBottom: `2px solid ${et.cor}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ color: et.cor, fontSize: 13, fontWeight: 800 }}>{et.label}</span>
                <span style={{ background: `${et.cor}15`, color: et.cor, fontSize: 11, padding: "2px 9px", borderRadius: 10, fontWeight: 700 }}>{cards.length}</span>
              </div>
              <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 8, minHeight: 80 }}>
                {cards.length === 0 ? (
                  <p style={{ color: "#cbd5e1", fontSize: 12, textAlign: "center", padding: "16px 0", margin: 0 }}>—</p>
                ) : cards.map(c => {
                  const idx = ETAPAS.findIndex(e => e.key === c.etapa);
                  return (
                    <div key={c.id} style={{ background: "#ffffff", borderRadius: 10, border: "1px solid #e5e7eb", padding: 12, boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                        <div style={{ width: 28, height: 28, borderRadius: "50%", background: `linear-gradient(135deg, ${COR} 0%, #6366f1 100%)`, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{c.nome.charAt(0)}</div>
                        <div style={{ minWidth: 0 }}>
                          <p style={{ color: "#1f2937", fontSize: 12, fontWeight: 700, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.nome}</p>
                          <p style={{ color: "#9ca3af", fontSize: 10, margin: "1px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.vaga}</p>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => mover(c.id, -1)} disabled={idx === 0}
                          style={{ flex: 1, background: idx === 0 ? "#f3f4f6" : "#ffffff", border: "1px solid #e5e7eb", borderRadius: 7, padding: "5px 0", fontSize: 11, cursor: idx === 0 ? "not-allowed" : "pointer", color: idx === 0 ? "#cbd5e1" : "#6b7280", fontWeight: 700 }}>←</button>
                        <button onClick={() => mover(c.id, 1)} disabled={idx === ETAPAS.length - 1}
                          style={{ flex: 1, background: idx === ETAPAS.length - 1 ? "#f3f4f6" : "#eef2ff", border: `1px solid ${idx === ETAPAS.length - 1 ? "#e5e7eb" : "#c7d2fe"}`, borderRadius: 7, padding: "5px 0", fontSize: 11, cursor: idx === ETAPAS.length - 1 ? "not-allowed" : "pointer", color: idx === ETAPAS.length - 1 ? "#cbd5e1" : COR_TEXTO, fontWeight: 700 }}>→</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <p style={{ color: "#9ca3af", fontSize: 11, margin: 0, textAlign: "center", fontStyle: "italic" }}>Dados de exemplo — use as setas pra mover candidatos entre etapas. Conecte ao Supabase pra persistir.</p>
    </div>
  );
}