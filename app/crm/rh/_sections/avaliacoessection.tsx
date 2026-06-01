"use client";
import { useState, useMemo } from "react";

// ═══════════════════════════════════════════════════════════════════════
// 🧑‍💼 RH · Avaliações de Desempenho
// ───────────────────────────────────────────────────────────────────────
// Avaliações por colaborador (90°/180°/360°), ciclo, nota (0–100) e status.
// MOCK + modal. Em produção, tabela 'avaliacoes'.
// ═══════════════════════════════════════════════════════════════════════

const COR = "#4f46e5";
const COR_TEXTO = "#4338ca";
const card = { background: "#ffffff", borderRadius: 14, border: "1px solid #e5e7eb", boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)" };
const inputStyle = { width: "100%", background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 14px", color: "#1f2937", fontSize: 13, boxSizing: "border-box" as const, outline: "none" };

const TIPOS = ["90°", "180°", "360°"];
type StatusA = "pendente" | "concluida";
type Avaliacao = { id: string; nome: string; cargo: string; tipo: string; ciclo: string; nota: number; status: StatusA };

const MOCK: Avaliacao[] = [
  { id: "1", nome: "Ana Beatriz Souza", cargo: "Analista Comercial", tipo: "180°", ciclo: "1º Sem/2026", nota: 88, status: "concluida" },
  { id: "2", nome: "Carlos Mendes", cargo: "Supervisor", tipo: "360°", ciclo: "1º Sem/2026", nota: 92, status: "concluida" },
  { id: "3", nome: "Larissa Nunes", cargo: "Vendedora", tipo: "90°", ciclo: "1º Sem/2026", nota: 74, status: "concluida" },
  { id: "4", nome: "Rafael Lima", cargo: "Assistente Financeiro", tipo: "180°", ciclo: "1º Sem/2026", nota: 0, status: "pendente" },
  { id: "5", nome: "Juliana Prado", cargo: "Desenvolvedora", tipo: "90°", ciclo: "1º Sem/2026", nota: 0, status: "pendente" },
];

const corNota = (n: number) => n >= 85 ? "#16a34a" : n >= 70 ? "#0ea5e9" : n >= 50 ? "#f59e0b" : "#dc2626";
const FORM_VAZIO: Avaliacao = { id: "", nome: "", cargo: "", tipo: TIPOS[0], ciclo: "", nota: 0, status: "pendente" };

export function AvaliacoesSection() {
  const [lista, setLista] = useState<Avaliacao[]>(MOCK);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState<Avaliacao>(FORM_VAZIO);

  const stats = useMemo(() => {
    const concluidas = lista.filter(a => a.status === "concluida");
    return {
      pendentes: lista.filter(a => a.status === "pendente").length,
      concluidas: concluidas.length,
      media: concluidas.length ? Math.round(concluidas.reduce((s, a) => s + a.nota, 0) / concluidas.length) : 0,
    };
  }, [lista]);

  const salvar = () => {
    if (!form.nome.trim()) { alert("Informe o colaborador."); return; }
    setLista(l => [{ ...form, id: Date.now().toString() }, ...l]);
    setModal(false); setForm(FORM_VAZIO);
  };
  const set = (k: keyof Avaliacao, v: any) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: `linear-gradient(135deg, ${COR} 0%, #6366f1 100%)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, boxShadow: `0 8px 20px ${COR}30` }}><span style={{ filter: "saturate(0) brightness(2)" }}>🎯</span></div>
          <div>
            <h1 style={{ color: "#1f2937", fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: -0.3 }}>Avaliações de Desempenho</h1>
            <p style={{ color: "#6b7280", fontSize: 12, margin: "2px 0 0" }}>Ciclos de avaliação e notas dos colaboradores</p>
          </div>
        </div>
        <button onClick={() => { setForm(FORM_VAZIO); setModal(true); }} style={{ background: `linear-gradient(135deg, ${COR} 0%, #6366f1 100%)`, color: "white", border: "none", borderRadius: 12, padding: "11px 20px", fontSize: 13, cursor: "pointer", fontWeight: 700, boxShadow: `0 4px 12px ${COR}40`, whiteSpace: "nowrap" }}>+ Nova Avaliação</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 14 }}>
        {[
          { label: "Pendentes", value: String(stats.pendentes), cor: "#f59e0b", icon: "⏳" },
          { label: "Concluídas", value: String(stats.concluidas), cor: "#16a34a", icon: "✅" },
          { label: "Nota média", value: String(stats.media), cor: "#6366f1", icon: "🎯" },
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

      <div style={{ ...card, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ background: "#f9fafb" }}>
              {["Colaborador", "Tipo", "Ciclo", "Nota", "Status"].map(h => (
                <th key={h} style={{ padding: "12px 16px", color: "#6b7280", fontSize: 11, textAlign: "left", textTransform: "uppercase", letterSpacing: 0.5, whiteSpace: "nowrap", fontWeight: 700, borderBottom: "1px solid #e5e7eb" }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {lista.map((a, i) => (
                <tr key={a.id} style={{ borderTop: "1px solid #f3f4f6", background: i % 2 === 0 ? "#ffffff" : "#fafbfc" }}>
                  <td style={{ padding: "12px 16px" }}>
                    <p style={{ color: "#1f2937", fontSize: 13, fontWeight: 700, margin: 0 }}>{a.nome}</p>
                    <p style={{ color: "#9ca3af", fontSize: 11, margin: "2px 0 0" }}>{a.cargo}</p>
                  </td>
                  <td style={{ padding: "12px 16px" }}><span style={{ background: "#eef2ff", color: COR_TEXTO, fontSize: 11, padding: "3px 10px", borderRadius: 10, fontWeight: 700 }}>{a.tipo}</span></td>
                  <td style={{ padding: "12px 16px", color: "#6b7280", fontSize: 12 }}>{a.ciclo}</td>
                  <td style={{ padding: "12px 16px", width: 200 }}>
                    {a.status === "pendente" ? <span style={{ color: "#9ca3af", fontSize: 12 }}>—</span> : (
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ flex: 1, height: 7, background: "#f1f5f9", borderRadius: 5, overflow: "hidden", maxWidth: 120 }}>
                          <div style={{ height: "100%", width: `${a.nota}%`, background: corNota(a.nota), borderRadius: 5 }} />
                        </div>
                        <span style={{ color: corNota(a.nota), fontSize: 13, fontWeight: 800 }}>{a.nota}</span>
                      </div>
                    )}
                  </td>
                  <td style={{ padding: "12px 16px" }}><span style={{ background: a.status === "concluida" ? "#f0fdf4" : "#fffbeb", color: a.status === "concluida" ? "#16a34a" : "#f59e0b", border: `1px solid ${a.status === "concluida" ? "#bbf7d0" : "#fde68a"}`, fontSize: 11, padding: "3px 10px", borderRadius: 10, fontWeight: 700, whiteSpace: "nowrap" }}>{a.status === "concluida" ? "Concluída" : "Pendente"}</span></td>
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
              <h3 style={{ color: "#1f2937", fontSize: 16, fontWeight: 700, margin: 0 }}>Nova Avaliação</h3>
              <button onClick={() => setModal(false)} style={{ background: "#f3f4f6", border: "none", color: "#6b7280", fontSize: 16, cursor: "pointer", width: 32, height: 32, borderRadius: 8 }}>✕</button>
            </div>
            <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Campo label="Colaborador"><input value={form.nome} onChange={e => set("nome", e.target.value)} style={inputStyle} placeholder="Nome" /></Campo>
                <Campo label="Cargo"><input value={form.cargo} onChange={e => set("cargo", e.target.value)} style={inputStyle} placeholder="Cargo" /></Campo>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Campo label="Tipo"><select value={form.tipo} onChange={e => set("tipo", e.target.value)} style={inputStyle}>{TIPOS.map(t => <option key={t} value={t}>{t}</option>)}</select></Campo>
                <Campo label="Ciclo"><input value={form.ciclo} onChange={e => set("ciclo", e.target.value)} style={inputStyle} placeholder="Ex: 1º Sem/2026" /></Campo>
              </div>
              <Campo label="Nota (0–100)"><input type="number" value={form.nota || ""} onChange={e => set("nota", Number(e.target.value))} style={inputStyle} placeholder="0 a 100" /></Campo>
            </div>
            <div style={{ padding: "14px 24px", borderTop: "1px solid #e5e7eb", display: "flex", gap: 10, justifyContent: "flex-end", background: "#f9fafb" }}>
              <button onClick={() => setModal(false)} style={{ background: "#ffffff", color: "#374151", border: "1px solid #e5e7eb", borderRadius: 10, padding: "9px 18px", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>Cancelar</button>
              <button onClick={salvar} style={{ background: `linear-gradient(135deg, ${COR} 0%, #6366f1 100%)`, color: "white", border: "none", borderRadius: 10, padding: "9px 22px", fontSize: 13, cursor: "pointer", fontWeight: 700 }}>+ Criar</button>
            </div>
          </div>
        </div>
      )}

      <p style={{ color: "#9ca3af", fontSize: 11, margin: 0, textAlign: "center", fontStyle: "italic" }}>Dados de exemplo — conecte à tabela <b>avaliacoes</b> do Supabase.</p>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (<div><label style={{ color: "#6b7280", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 6 }}>{label}</label>{children}</div>);
}