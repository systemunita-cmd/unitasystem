"use client";
import { useState, useMemo } from "react";

// ═══════════════════════════════════════════════════════════════════════
// 🧑‍💼 RH · Plano de Saúde
// ───────────────────────────────────────────────────────────────────────
// Adesões ao plano por colaborador: operadora, plano, dependentes, custo
// mensal e coparticipação. MOCK + modal de adesão.
// ═══════════════════════════════════════════════════════════════════════

const COR = "#4f46e5";
const COR_TEXTO = "#4338ca";
const card = { background: "#ffffff", borderRadius: 14, border: "1px solid #e5e7eb", boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)" };
const inputStyle = { width: "100%", background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 14px", color: "#1f2937", fontSize: 13, boxSizing: "border-box" as const, outline: "none" };
const real = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const OPERADORAS = ["Unimed", "Amil", "Bradesco Saúde", "SulAmérica", "Hapvida"];
const PLANOS = ["Enfermaria", "Apartamento", "Premium"];

type PS = { id: string; nome: string; cargo: string; operadora: string; plano: string; dependentes: number; custoMensal: number; coparticipacao: boolean };

const MOCK: PS[] = [
  { id: "1", nome: "Ana Beatriz Souza", cargo: "Analista", operadora: "Unimed", plano: "Apartamento", dependentes: 2, custoMensal: 540, coparticipacao: true },
  { id: "2", nome: "Carlos Mendes", cargo: "Supervisor", operadora: "Unimed", plano: "Premium", dependentes: 3, custoMensal: 920, coparticipacao: false },
  { id: "3", nome: "Patrícia Gomes", cargo: "Gerente", operadora: "SulAmérica", plano: "Premium", dependentes: 1, custoMensal: 680, coparticipacao: false },
  { id: "4", nome: "Rafael Lima", cargo: "Assistente", operadora: "Amil", plano: "Enfermaria", dependentes: 0, custoMensal: 280, coparticipacao: true },
  { id: "5", nome: "Juliana Prado", cargo: "Desenvolvedora", operadora: "Bradesco Saúde", plano: "Apartamento", dependentes: 1, custoMensal: 430, coparticipacao: true },
];

const FORM_VAZIO: PS = { id: "", nome: "", cargo: "", operadora: OPERADORAS[0], plano: PLANOS[0], dependentes: 0, custoMensal: 0, coparticipacao: false };

export function PlanoSaudeSection() {
  const [lista, setLista] = useState<PS[]>(MOCK);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState<PS>(FORM_VAZIO);

  const vidas = useMemo(() => lista.reduce((s, p) => s + 1 + p.dependentes, 0), [lista]);
  const custoTotal = useMemo(() => lista.reduce((s, p) => s + p.custoMensal, 0), [lista]);
  const comCopart = useMemo(() => lista.filter(p => p.coparticipacao).length, [lista]);

  const salvar = () => {
    if (!form.nome.trim()) { alert("Informe o colaborador."); return; }
    setLista(l => [{ ...form, id: Date.now().toString() }, ...l]);
    setModal(false); setForm(FORM_VAZIO);
  };
  const set = (k: keyof PS, v: any) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: `linear-gradient(135deg, ${COR} 0%, #6366f1 100%)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, boxShadow: `0 8px 20px ${COR}30` }}><span style={{ filter: "saturate(0) brightness(2)" }}>🏥</span></div>
          <div>
            <h1 style={{ color: "#1f2937", fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: -0.3 }}>Plano de Saúde</h1>
            <p style={{ color: "#6b7280", fontSize: 12, margin: "2px 0 0" }}><b style={{ color: COR_TEXTO }}>{lista.length}</b> titular(es) · {vidas} vidas</p>
          </div>
        </div>
        <button onClick={() => { setForm(FORM_VAZIO); setModal(true); }} style={{ background: `linear-gradient(135deg, ${COR} 0%, #6366f1 100%)`, color: "white", border: "none", borderRadius: 12, padding: "11px 20px", fontSize: 13, cursor: "pointer", fontWeight: 700, boxShadow: `0 4px 12px ${COR}40`, whiteSpace: "nowrap" }}>+ Nova Adesão</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
        {[
          { label: "Vidas cobertas", value: String(vidas), cor: "#16a34a", icon: "❤️" },
          { label: "Titulares", value: String(lista.length), cor: "#6366f1", icon: "👤" },
          { label: "Custo mensal", value: real(custoTotal), cor: "#f59e0b", icon: "💰" },
          { label: "Com coparticipação", value: String(comCopart), cor: "#0ea5e9", icon: "🤝" },
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
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ background: "#f9fafb" }}>
              {["Titular", "Operadora", "Plano", "Dependentes", "Coparticipação", "Custo mensal"].map(h => (
                <th key={h} style={{ padding: "12px 16px", color: "#6b7280", fontSize: 11, textAlign: h === "Custo mensal" || h === "Dependentes" ? "right" : "left", textTransform: "uppercase", letterSpacing: 0.5, whiteSpace: "nowrap", fontWeight: 700, borderBottom: "1px solid #e5e7eb" }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {lista.map((p, i) => (
                <tr key={p.id} style={{ borderTop: "1px solid #f3f4f6", background: i % 2 === 0 ? "#ffffff" : "#fafbfc" }}>
                  <td style={{ padding: "12px 16px" }}>
                    <p style={{ color: "#1f2937", fontSize: 13, fontWeight: 700, margin: 0 }}>{p.nome}</p>
                    <p style={{ color: "#9ca3af", fontSize: 11, margin: "2px 0 0" }}>{p.cargo}</p>
                  </td>
                  <td style={{ padding: "12px 16px", color: "#4b5563", fontSize: 12 }}>{p.operadora}</td>
                  <td style={{ padding: "12px 16px" }}><span style={{ background: "#eef2ff", color: COR_TEXTO, fontSize: 11, padding: "3px 10px", borderRadius: 10, fontWeight: 700 }}>{p.plano}</span></td>
                  <td style={{ padding: "12px 16px", textAlign: "right", color: "#6b7280", fontSize: 12 }}>{p.dependentes}</td>
                  <td style={{ padding: "12px 16px" }}><span style={{ color: p.coparticipacao ? "#0ea5e9" : "#9ca3af", fontSize: 12, fontWeight: 600 }}>{p.coparticipacao ? "✓ Sim" : "Não"}</span></td>
                  <td style={{ padding: "12px 16px", textAlign: "right", color: COR_TEXTO, fontSize: 13, fontWeight: 800, whiteSpace: "nowrap" }}>{real(p.custoMensal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <div onClick={() => setModal(false)} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", backdropFilter: "blur(4px)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ ...card, width: "100%", maxWidth: 520, overflow: "hidden" }}>
            <div style={{ padding: "18px 24px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ color: "#1f2937", fontSize: 16, fontWeight: 700, margin: 0 }}>Nova Adesão</h3>
              <button onClick={() => setModal(false)} style={{ background: "#f3f4f6", border: "none", color: "#6b7280", fontSize: 16, cursor: "pointer", width: 32, height: 32, borderRadius: 8 }}>✕</button>
            </div>
            <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Campo label="Titular"><input value={form.nome} onChange={e => set("nome", e.target.value)} style={inputStyle} placeholder="Nome" /></Campo>
                <Campo label="Cargo"><input value={form.cargo} onChange={e => set("cargo", e.target.value)} style={inputStyle} placeholder="Cargo" /></Campo>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Campo label="Operadora"><select value={form.operadora} onChange={e => set("operadora", e.target.value)} style={inputStyle}>{OPERADORAS.map(o => <option key={o} value={o}>{o}</option>)}</select></Campo>
                <Campo label="Plano"><select value={form.plano} onChange={e => set("plano", e.target.value)} style={inputStyle}>{PLANOS.map(p => <option key={p} value={p}>{p}</option>)}</select></Campo>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Campo label="Dependentes"><input type="number" value={form.dependentes || ""} onChange={e => set("dependentes", Number(e.target.value))} style={inputStyle} /></Campo>
                <Campo label="Custo mensal (R$)"><input type="number" value={form.custoMensal || ""} onChange={e => set("custoMensal", Number(e.target.value))} style={inputStyle} /></Campo>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", color: "#374151", fontSize: 13, fontWeight: 600 }}>
                <input type="checkbox" checked={form.coparticipacao} onChange={e => set("coparticipacao", e.target.checked)} style={{ width: 16, height: 16, accentColor: COR }} />
                Plano com coparticipação
              </label>
            </div>
            <div style={{ padding: "14px 24px", borderTop: "1px solid #e5e7eb", display: "flex", gap: 10, justifyContent: "flex-end", background: "#f9fafb" }}>
              <button onClick={() => setModal(false)} style={{ background: "#ffffff", color: "#374151", border: "1px solid #e5e7eb", borderRadius: 10, padding: "9px 18px", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>Cancelar</button>
              <button onClick={salvar} style={{ background: `linear-gradient(135deg, ${COR} 0%, #6366f1 100%)`, color: "white", border: "none", borderRadius: 10, padding: "9px 22px", fontSize: 13, cursor: "pointer", fontWeight: 700 }}>+ Aderir</button>
            </div>
          </div>
        </div>
      )}

      <p style={{ color: "#9ca3af", fontSize: 11, margin: 0, textAlign: "center", fontStyle: "italic" }}>Dados de exemplo — conecte à tabela <b>plano_saude</b> do Supabase.</p>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (<div><label style={{ color: "#6b7280", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 6 }}>{label}</label>{children}</div>);
}