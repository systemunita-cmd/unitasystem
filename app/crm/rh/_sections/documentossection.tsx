"use client";
import { useState, useMemo } from "react";

// ═══════════════════════════════════════════════════════════════════════
// 🧑‍💼 RH · Documentos
// ───────────────────────────────────────────────────────────────────────
// Documentos por colaborador (contrato, ASO, certificados, etc) com data de
// validade e status calculado (válido / vencendo em 30 dias / vencido).
// MOCK + modal de registro. Em produção, tabela 'documentos' + storage.
// ═══════════════════════════════════════════════════════════════════════

const COR = "#4f46e5";
const COR_TEXTO = "#4338ca";
const card = { background: "#ffffff", borderRadius: 14, border: "1px solid #e5e7eb", boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)" };
const inputStyle = { width: "100%", background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 14px", color: "#1f2937", fontSize: 13, boxSizing: "border-box" as const, outline: "none" };
const dataBR = (iso: string) => { if (!iso) return "Sem validade"; try { return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR"); } catch { return iso; } };

const TIPOS = ["Contrato de trabalho", "Carteira de trabalho", "RG / CPF", "Comprovante de residência", "ASO (exame ocupacional)", "Certificado NR", "Ficha de registro"];

type Documento = { id: string; funcionario: string; tipo: string; validade: string };

const MOCK: Documento[] = [
  { id: "1", funcionario: "Ana Beatriz Souza", tipo: "ASO (exame ocupacional)", validade: "2026-06-20" },
  { id: "2", funcionario: "Carlos Mendes", tipo: "Certificado NR", validade: "2026-06-10" },
  { id: "3", funcionario: "Rafael Lima", tipo: "Contrato de trabalho", validade: "" },
  { id: "4", funcionario: "Larissa Nunes", tipo: "ASO (exame ocupacional)", validade: "2026-05-15" },
  { id: "5", funcionario: "Juliana Prado", tipo: "Comprovante de residência", validade: "2026-09-01" },
  { id: "6", funcionario: "Bruno Tavares", tipo: "Certificado NR", validade: "2026-04-30" },
];

// status calculado a partir da validade
function statusDoc(validade: string): { key: "valido" | "vencendo" | "vencido" | "permanente"; label: string; cor: string } {
  if (!validade) return { key: "permanente", label: "Permanente", cor: "#6b7280" };
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const v = new Date(validade + "T00:00:00");
  const dias = Math.round((v.getTime() - hoje.getTime()) / 86400000);
  if (dias < 0) return { key: "vencido", label: "Vencido", cor: "#dc2626" };
  if (dias <= 30) return { key: "vencendo", label: `Vence em ${dias}d`, cor: "#f59e0b" };
  return { key: "valido", label: "Válido", cor: "#16a34a" };
}

const FORM_VAZIO: Documento = { id: "", funcionario: "", tipo: TIPOS[0], validade: "" };

export function DocumentosSection() {
  const [lista, setLista] = useState<Documento[]>(MOCK);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"todos" | "vencendo" | "vencido">("todos");
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState<Documento>(FORM_VAZIO);

  const filtrados = useMemo(() => {
    let l = lista;
    if (busca) { const b = busca.toLowerCase(); l = l.filter(d => d.funcionario.toLowerCase().includes(b) || d.tipo.toLowerCase().includes(b)); }
    if (filtro !== "todos") l = l.filter(d => statusDoc(d.validade).key === filtro);
    return l;
  }, [lista, busca, filtro]);

  const stats = useMemo(() => ({
    total: lista.length,
    vencendo: lista.filter(d => statusDoc(d.validade).key === "vencendo").length,
    vencidos: lista.filter(d => statusDoc(d.validade).key === "vencido").length,
  }), [lista]);

  const salvar = () => {
    if (!form.funcionario.trim()) { alert("Informe o colaborador."); return; }
    setLista(l => [{ ...form, id: Date.now().toString() }, ...l]);
    setModal(false); setForm(FORM_VAZIO);
  };
  const excluir = (d: Documento) => { if (!confirm(`Remover documento de ${d.funcionario}?`)) return; setLista(l => l.filter(x => x.id !== d.id)); };
  const set = (k: keyof Documento, v: any) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: `linear-gradient(135deg, ${COR} 0%, #6366f1 100%)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, boxShadow: `0 8px 20px ${COR}30` }}><span style={{ filter: "saturate(0) brightness(2)" }}>📁</span></div>
          <div>
            <h1 style={{ color: "#1f2937", fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: -0.3 }}>Documentos</h1>
            <p style={{ color: "#6b7280", fontSize: 12, margin: "2px 0 0" }}>Documentação dos colaboradores e validades</p>
          </div>
        </div>
        <button onClick={() => { setForm(FORM_VAZIO); setModal(true); }} style={{ background: `linear-gradient(135deg, ${COR} 0%, #6366f1 100%)`, color: "white", border: "none", borderRadius: 12, padding: "11px 20px", fontSize: 13, cursor: "pointer", fontWeight: 700, boxShadow: `0 4px 12px ${COR}40`, whiteSpace: "nowrap" }}>+ Adicionar Documento</button>
      </div>

      {stats.vencidos + stats.vencendo > 0 && (
        <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderLeft: "4px solid #f59e0b", borderRadius: 12, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18 }}>⚠️</span>
          <p style={{ color: "#92400e", fontSize: 13, margin: 0, fontWeight: 600 }}><b>{stats.vencidos}</b> documento(s) vencido(s) e <b>{stats.vencendo}</b> vencendo nos próximos 30 dias.</p>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 14 }}>
        {[
          { label: "Documentos", value: String(stats.total), cor: "#6366f1", icon: "📁" },
          { label: "Vencendo", value: String(stats.vencendo), cor: "#f59e0b", icon: "⏳" },
          { label: "Vencidos", value: String(stats.vencidos), cor: "#dc2626", icon: "🚨" },
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

      <div style={{ ...card, padding: 14, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <input placeholder="🔍 Buscar por colaborador ou tipo..." value={busca} onChange={e => setBusca(e.target.value)} style={{ ...inputStyle, flex: "1 1 280px", maxWidth: 460, borderRadius: 20 }} />
        <select value={filtro} onChange={e => setFiltro(e.target.value as any)} style={{ ...inputStyle, maxWidth: 200 }}>
          <option value="todos">Status: Todos</option>
          <option value="vencendo">Vencendo</option>
          <option value="vencido">Vencidos</option>
        </select>
      </div>

      <div style={{ ...card, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ background: "#f9fafb" }}>
              {["Colaborador", "Documento", "Validade", "Status", ""].map(h => (
                <th key={h} style={{ padding: "12px 16px", color: "#6b7280", fontSize: 11, textAlign: "left", textTransform: "uppercase", letterSpacing: 0.5, whiteSpace: "nowrap", fontWeight: 700, borderBottom: "1px solid #e5e7eb" }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {filtrados.map((d, i) => {
                const st = statusDoc(d.validade);
                return (
                  <tr key={d.id} style={{ borderTop: "1px solid #f3f4f6", background: i % 2 === 0 ? "#ffffff" : "#fafbfc" }}>
                    <td style={{ padding: "12px 16px", color: "#1f2937", fontSize: 13, fontWeight: 700 }}>{d.funcionario}</td>
                    <td style={{ padding: "12px 16px", color: "#4b5563", fontSize: 12 }}>📄 {d.tipo}</td>
                    <td style={{ padding: "12px 16px", color: "#6b7280", fontSize: 12, whiteSpace: "nowrap" }}>{dataBR(d.validade)}</td>
                    <td style={{ padding: "12px 16px" }}><span style={{ background: `${st.cor}15`, color: st.cor, border: `1px solid ${st.cor}40`, fontSize: 11, padding: "3px 10px", borderRadius: 10, fontWeight: 700, whiteSpace: "nowrap" }}>{st.label}</span></td>
                    <td style={{ padding: "12px 16px" }}><button onClick={() => excluir(d)} style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", borderRadius: 8, padding: "5px 11px", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>🗑️</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <div onClick={() => setModal(false)} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", backdropFilter: "blur(4px)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ ...card, width: "100%", maxWidth: 500, overflow: "hidden" }}>
            <div style={{ padding: "18px 24px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ color: "#1f2937", fontSize: 16, fontWeight: 700, margin: 0 }}>Adicionar Documento</h3>
              <button onClick={() => setModal(false)} style={{ background: "#f3f4f6", border: "none", color: "#6b7280", fontSize: 16, cursor: "pointer", width: 32, height: 32, borderRadius: 8 }}>✕</button>
            </div>
            <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
              <Campo label="Colaborador"><input value={form.funcionario} onChange={e => set("funcionario", e.target.value)} style={inputStyle} placeholder="Nome" /></Campo>
              <Campo label="Tipo de documento"><select value={form.tipo} onChange={e => set("tipo", e.target.value)} style={inputStyle}>{TIPOS.map(t => <option key={t} value={t}>{t}</option>)}</select></Campo>
              <Campo label="Validade (deixe em branco se permanente)"><input type="date" value={form.validade} onChange={e => set("validade", e.target.value)} style={inputStyle} /></Campo>
              <div style={{ border: "2px dashed #e5e7eb", borderRadius: 12, padding: 20, textAlign: "center", background: "#f9fafb" }}>
                <p style={{ fontSize: 28, margin: "0 0 4px" }}>📎</p>
                <p style={{ color: "#6b7280", fontSize: 12, margin: 0 }}>Upload do arquivo entra quando conectarmos o Storage do Supabase</p>
              </div>
            </div>
            <div style={{ padding: "14px 24px", borderTop: "1px solid #e5e7eb", display: "flex", gap: 10, justifyContent: "flex-end", background: "#f9fafb" }}>
              <button onClick={() => setModal(false)} style={{ background: "#ffffff", color: "#374151", border: "1px solid #e5e7eb", borderRadius: 10, padding: "9px 18px", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>Cancelar</button>
              <button onClick={salvar} style={{ background: `linear-gradient(135deg, ${COR} 0%, #6366f1 100%)`, color: "white", border: "none", borderRadius: 10, padding: "9px 22px", fontSize: 13, cursor: "pointer", fontWeight: 700 }}>+ Adicionar</button>
            </div>
          </div>
        </div>
      )}

      <p style={{ color: "#9ca3af", fontSize: 11, margin: 0, textAlign: "center", fontStyle: "italic" }}>Dados de exemplo — status calculado pela validade. Conecte à tabela <b>documentos</b> + Storage do Supabase.</p>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (<div><label style={{ color: "#6b7280", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 6 }}>{label}</label>{children}</div>);
}