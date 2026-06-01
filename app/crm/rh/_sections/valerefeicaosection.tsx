"use client";
import { useState, useMemo } from "react";

// ═══════════════════════════════════════════════════════════════════════
// 🧑‍💼 RH · Vale Refeição / Alimentação
// ───────────────────────────────────────────────────────────────────────
// VR/VA por colaborador: modalidade, valor diário, dias e total mensal,
// por operadora (cartão). MOCK.
// ═══════════════════════════════════════════════════════════════════════

const COR = "#4f46e5";
const COR_TEXTO = "#4338ca";
const card = { background: "#ffffff", borderRadius: 14, border: "1px solid #e5e7eb", boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)" };
const inputStyle = { width: "100%", background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 14px", color: "#1f2937", fontSize: 13, boxSizing: "border-box" as const, outline: "none" };
const real = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const MODALIDADES = ["Refeição", "Alimentação"];
const OPERADORAS = ["Alelo", "Sodexo", "VR", "Ticket", "Flash"];

type VR = { id: string; nome: string; cargo: string; modalidade: string; operadora: string; valorDiario: number; dias: number };

const MOCK: VR[] = [
  { id: "1", nome: "Ana Beatriz Souza", cargo: "Analista", modalidade: "Refeição", operadora: "Alelo", valorDiario: 30, dias: 22 },
  { id: "2", nome: "Carlos Mendes", cargo: "Supervisor", modalidade: "Refeição", operadora: "Alelo", valorDiario: 35, dias: 22 },
  { id: "3", nome: "Larissa Nunes", cargo: "Vendedora", modalidade: "Alimentação", operadora: "Sodexo", valorDiario: 25, dias: 22 },
  { id: "4", nome: "Rafael Lima", cargo: "Assistente", modalidade: "Refeição", operadora: "VR", valorDiario: 28, dias: 20 },
  { id: "5", nome: "Bruno Tavares", cargo: "Atendente", modalidade: "Alimentação", operadora: "Ticket", valorDiario: 22, dias: 22 },
];

const FORM_VAZIO: VR = { id: "", nome: "", cargo: "", modalidade: MODALIDADES[0], operadora: OPERADORAS[0], valorDiario: 0, dias: 22 };

export function ValeRefeicaoSection() {
  const [lista, setLista] = useState<VR[]>(MOCK);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState<VR>(FORM_VAZIO);

  const total = (v: VR) => v.valorDiario * v.dias;
  const totalMensal = useMemo(() => lista.reduce((s, v) => s + total(v), 0), [lista]);
  const mediaDiaria = useMemo(() => lista.length ? lista.reduce((s, v) => s + v.valorDiario, 0) / lista.length : 0, [lista]);

  const salvar = () => {
    if (!form.nome.trim()) { alert("Informe o colaborador."); return; }
    setLista(l => [{ ...form, id: Date.now().toString() }, ...l]);
    setModal(false); setForm(FORM_VAZIO);
  };
  const set = (k: keyof VR, v: any) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: `linear-gradient(135deg, ${COR} 0%, #6366f1 100%)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, boxShadow: `0 8px 20px ${COR}30` }}><span style={{ filter: "saturate(0) brightness(2)" }}>🍽️</span></div>
          <div>
            <h1 style={{ color: "#1f2937", fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: -0.3 }}>Vale Refeição / Alimentação</h1>
            <p style={{ color: "#6b7280", fontSize: 12, margin: "2px 0 0" }}><b style={{ color: COR_TEXTO }}>{lista.length}</b> beneficiário(s)</p>
          </div>
        </div>
        <button onClick={() => { setForm(FORM_VAZIO); setModal(true); }} style={{ background: `linear-gradient(135deg, ${COR} 0%, #6366f1 100%)`, color: "white", border: "none", borderRadius: 12, padding: "11px 20px", fontSize: 13, cursor: "pointer", fontWeight: 700, boxShadow: `0 4px 12px ${COR}40`, whiteSpace: "nowrap" }}>+ Adicionar VR/VA</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
        {[
          { label: "Beneficiários", value: String(lista.length), cor: "#6366f1", icon: "🍽️" },
          { label: "Custo mensal total", value: real(totalMensal), cor: "#f59e0b", icon: "💰" },
          { label: "Média diária", value: real(mediaDiaria), cor: "#16a34a", icon: "📊" },
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
              {["Colaborador", "Modalidade", "Operadora", "Diário", "Dias", "Total mensal"].map(h => (
                <th key={h} style={{ padding: "12px 16px", color: "#6b7280", fontSize: 11, textAlign: h === "Diário" || h === "Dias" || h === "Total mensal" ? "right" : "left", textTransform: "uppercase", letterSpacing: 0.5, whiteSpace: "nowrap", fontWeight: 700, borderBottom: "1px solid #e5e7eb" }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {lista.map((v, i) => (
                <tr key={v.id} style={{ borderTop: "1px solid #f3f4f6", background: i % 2 === 0 ? "#ffffff" : "#fafbfc" }}>
                  <td style={{ padding: "12px 16px" }}>
                    <p style={{ color: "#1f2937", fontSize: 13, fontWeight: 700, margin: 0 }}>{v.nome}</p>
                    <p style={{ color: "#9ca3af", fontSize: 11, margin: "2px 0 0" }}>{v.cargo}</p>
                  </td>
                  <td style={{ padding: "12px 16px" }}><span style={{ background: v.modalidade === "Refeição" ? "#fff7ed" : "#f0fdf4", color: v.modalidade === "Refeição" ? "#c2410c" : "#16a34a", fontSize: 11, padding: "3px 10px", borderRadius: 10, fontWeight: 700 }}>{v.modalidade}</span></td>
                  <td style={{ padding: "12px 16px", color: "#4b5563", fontSize: 12 }}>{v.operadora}</td>
                  <td style={{ padding: "12px 16px", textAlign: "right", color: "#6b7280", fontSize: 12, whiteSpace: "nowrap" }}>{real(v.valorDiario)}</td>
                  <td style={{ padding: "12px 16px", textAlign: "right", color: "#6b7280", fontSize: 12 }}>{v.dias}</td>
                  <td style={{ padding: "12px 16px", textAlign: "right", color: COR_TEXTO, fontSize: 13, fontWeight: 800, whiteSpace: "nowrap" }}>{real(total(v))}</td>
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
              <h3 style={{ color: "#1f2937", fontSize: 16, fontWeight: 700, margin: 0 }}>Adicionar VR/VA</h3>
              <button onClick={() => setModal(false)} style={{ background: "#f3f4f6", border: "none", color: "#6b7280", fontSize: 16, cursor: "pointer", width: 32, height: 32, borderRadius: 8 }}>✕</button>
            </div>
            <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Campo label="Colaborador"><input value={form.nome} onChange={e => set("nome", e.target.value)} style={inputStyle} placeholder="Nome" /></Campo>
                <Campo label="Cargo"><input value={form.cargo} onChange={e => set("cargo", e.target.value)} style={inputStyle} placeholder="Cargo" /></Campo>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Campo label="Modalidade"><select value={form.modalidade} onChange={e => set("modalidade", e.target.value)} style={inputStyle}>{MODALIDADES.map(m => <option key={m} value={m}>{m}</option>)}</select></Campo>
                <Campo label="Operadora"><select value={form.operadora} onChange={e => set("operadora", e.target.value)} style={inputStyle}>{OPERADORAS.map(o => <option key={o} value={o}>{o}</option>)}</select></Campo>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Campo label="Valor diário (R$)"><input type="number" value={form.valorDiario || ""} onChange={e => set("valorDiario", Number(e.target.value))} style={inputStyle} /></Campo>
                <Campo label="Dias"><input type="number" value={form.dias || ""} onChange={e => set("dias", Number(e.target.value))} style={inputStyle} /></Campo>
              </div>
            </div>
            <div style={{ padding: "14px 24px", borderTop: "1px solid #e5e7eb", display: "flex", gap: 10, justifyContent: "flex-end", background: "#f9fafb" }}>
              <button onClick={() => setModal(false)} style={{ background: "#ffffff", color: "#374151", border: "1px solid #e5e7eb", borderRadius: 10, padding: "9px 18px", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>Cancelar</button>
              <button onClick={salvar} style={{ background: `linear-gradient(135deg, ${COR} 0%, #6366f1 100%)`, color: "white", border: "none", borderRadius: 10, padding: "9px 22px", fontSize: 13, cursor: "pointer", fontWeight: 700 }}>+ Adicionar</button>
            </div>
          </div>
        </div>
      )}

      <p style={{ color: "#9ca3af", fontSize: 11, margin: 0, textAlign: "center", fontStyle: "italic" }}>Dados de exemplo — conecte à tabela <b>vale_refeicao</b> do Supabase.</p>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (<div><label style={{ color: "#6b7280", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 6 }}>{label}</label>{children}</div>);
}