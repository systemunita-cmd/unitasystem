"use client";
import { useState, useMemo } from "react";

// ═══════════════════════════════════════════════════════════════════════
// 🧑‍💼 RH · Contratos
// ───────────────────────────────────────────────────────────────────────
// Contratos de trabalho: tipo, vigência, status (vigente / experiência /
// a renovar / encerrado). MOCK + modal. Em produção, tabela 'contratos'.
// ═══════════════════════════════════════════════════════════════════════

const COR = "#4f46e5";
const COR_TEXTO = "#4338ca";
const card = { background: "#ffffff", borderRadius: 14, border: "1px solid #e5e7eb", boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)" };
const inputStyle = { width: "100%", background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 14px", color: "#1f2937", fontSize: 13, boxSizing: "border-box" as const, outline: "none" };
const dataBR = (iso: string) => { if (!iso) return "Indeterminado"; try { return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR"); } catch { return iso; } };

const TIPOS = ["CLT", "PJ", "Temporário", "Estágio", "Aprendiz"];
type StatusC = "vigente" | "experiencia" | "renovar" | "encerrado";
type Contrato = { id: string; funcionario: string; tipo: string; inicio: string; fim: string; status: StatusC };

const STATUS_INFO: Record<StatusC, { label: string; cor: string }> = {
  vigente: { label: "Vigente", cor: "#16a34a" },
  experiencia: { label: "Experiência", cor: "#0ea5e9" },
  renovar: { label: "A renovar", cor: "#f59e0b" },
  encerrado: { label: "Encerrado", cor: "#6b7280" },
};

const MOCK: Contrato[] = [
  { id: "1", funcionario: "Ana Beatriz Souza", tipo: "CLT", inicio: "2023-03-12", fim: "", status: "vigente" },
  { id: "2", funcionario: "Larissa Nunes", tipo: "CLT", inicio: "2024-05-02", fim: "2026-07-02", status: "experiencia" },
  { id: "3", funcionario: "Pedro Alves", tipo: "Temporário", inicio: "2026-02-01", fim: "2026-06-30", status: "renovar" },
  { id: "4", funcionario: "Beatriz Antunes", tipo: "Estágio", inicio: "2025-08-01", fim: "2026-08-01", status: "vigente" },
  { id: "5", funcionario: "João Ribeiro", tipo: "CLT", inicio: "2019-01-10", fim: "2026-03-15", status: "encerrado" },
];

const FORM_VAZIO: Contrato = { id: "", funcionario: "", tipo: TIPOS[0], inicio: "", fim: "", status: "vigente" };

export function ContratosSection() {
  const [lista, setLista] = useState<Contrato[]>(MOCK);
  const [filtro, setFiltro] = useState<"todos" | StatusC>("todos");
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState<Contrato>(FORM_VAZIO);

  const filtrados = useMemo(() => filtro === "todos" ? lista : lista.filter(c => c.status === filtro), [lista, filtro]);
  const stats = useMemo(() => ({
    vigentes: lista.filter(c => c.status === "vigente").length,
    experiencia: lista.filter(c => c.status === "experiencia").length,
    renovar: lista.filter(c => c.status === "renovar").length,
  }), [lista]);

  const salvar = () => {
    if (!form.funcionario.trim()) { alert("Informe o colaborador."); return; }
    setLista(l => [{ ...form, id: Date.now().toString() }, ...l]);
    setModal(false); setForm(FORM_VAZIO);
  };
  const set = (k: keyof Contrato, v: any) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: `linear-gradient(135deg, ${COR} 0%, #6366f1 100%)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, boxShadow: `0 8px 20px ${COR}30` }}><span style={{ filter: "saturate(0) brightness(2)" }}>📄</span></div>
          <div>
            <h1 style={{ color: "#1f2937", fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: -0.3 }}>Contratos</h1>
            <p style={{ color: "#6b7280", fontSize: 12, margin: "2px 0 0" }}>Contratos de trabalho e vigências</p>
          </div>
        </div>
        <button onClick={() => { setForm(FORM_VAZIO); setModal(true); }} style={{ background: `linear-gradient(135deg, ${COR} 0%, #6366f1 100%)`, color: "white", border: "none", borderRadius: 12, padding: "11px 20px", fontSize: 13, cursor: "pointer", fontWeight: 700, boxShadow: `0 4px 12px ${COR}40`, whiteSpace: "nowrap" }}>+ Novo Contrato</button>
      </div>

      {stats.renovar > 0 && (
        <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderLeft: "4px solid #f59e0b", borderRadius: 12, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18 }}>⚠️</span>
          <p style={{ color: "#92400e", fontSize: 13, margin: 0, fontWeight: 600 }}><b>{stats.renovar}</b> contrato(s) a renovar — verifique as datas de término.</p>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 14 }}>
        {[
          { label: "Vigentes", value: String(stats.vigentes), cor: "#16a34a", icon: "✅" },
          { label: "Em experiência", value: String(stats.experiencia), cor: "#0ea5e9", icon: "🔍" },
          { label: "A renovar", value: String(stats.renovar), cor: "#f59e0b", icon: "🔁" },
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

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {([["todos", "Todos"], ...Object.entries(STATUS_INFO).map(([k, v]) => [k, v.label])] as [string, string][]).map(([k, lbl]) => {
          const ativo = filtro === k;
          const cor = k === "todos" ? COR : STATUS_INFO[k as StatusC].cor;
          return <button key={k} onClick={() => setFiltro(k as any)} style={{ background: ativo ? `${cor}15` : "#f9fafb", color: ativo ? cor : "#6b7280", border: `1px solid ${ativo ? cor + "50" : "#e5e7eb"}`, borderRadius: 10, padding: "7px 14px", fontSize: 12, cursor: "pointer", fontWeight: ativo ? 700 : 600 }}>{lbl}</button>;
        })}
      </div>

      <div style={{ ...card, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ background: "#f9fafb" }}>
              {["Colaborador", "Tipo", "Início", "Término", "Status"].map(h => (
                <th key={h} style={{ padding: "12px 16px", color: "#6b7280", fontSize: 11, textAlign: "left", textTransform: "uppercase", letterSpacing: 0.5, whiteSpace: "nowrap", fontWeight: 700, borderBottom: "1px solid #e5e7eb" }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {filtrados.map((c, i) => {
                const st = STATUS_INFO[c.status];
                return (
                  <tr key={c.id} style={{ borderTop: "1px solid #f3f4f6", background: i % 2 === 0 ? "#ffffff" : "#fafbfc" }}>
                    <td style={{ padding: "12px 16px", color: "#1f2937", fontSize: 13, fontWeight: 700 }}>{c.funcionario}</td>
                    <td style={{ padding: "12px 16px" }}><span style={{ background: "#eef2ff", color: COR_TEXTO, fontSize: 11, padding: "3px 10px", borderRadius: 10, fontWeight: 700 }}>{c.tipo}</span></td>
                    <td style={{ padding: "12px 16px", color: "#6b7280", fontSize: 12, whiteSpace: "nowrap" }}>{dataBR(c.inicio)}</td>
                    <td style={{ padding: "12px 16px", color: "#6b7280", fontSize: 12, whiteSpace: "nowrap" }}>{dataBR(c.fim)}</td>
                    <td style={{ padding: "12px 16px" }}><span style={{ background: `${st.cor}15`, color: st.cor, border: `1px solid ${st.cor}40`, fontSize: 11, padding: "3px 10px", borderRadius: 10, fontWeight: 700, whiteSpace: "nowrap" }}>{st.label}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <div onClick={() => setModal(false)} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", backdropFilter: "blur(4px)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ ...card, width: "100%", maxWidth: 520, overflow: "hidden" }}>
            <div style={{ padding: "18px 24px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ color: "#1f2937", fontSize: 16, fontWeight: 700, margin: 0 }}>Novo Contrato</h3>
              <button onClick={() => setModal(false)} style={{ background: "#f3f4f6", border: "none", color: "#6b7280", fontSize: 16, cursor: "pointer", width: 32, height: 32, borderRadius: 8 }}>✕</button>
            </div>
            <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
              <Campo label="Colaborador"><input value={form.funcionario} onChange={e => set("funcionario", e.target.value)} style={inputStyle} placeholder="Nome" /></Campo>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Campo label="Tipo"><select value={form.tipo} onChange={e => set("tipo", e.target.value)} style={inputStyle}>{TIPOS.map(t => <option key={t} value={t}>{t}</option>)}</select></Campo>
                <Campo label="Status"><select value={form.status} onChange={e => set("status", e.target.value as StatusC)} style={inputStyle}>{Object.entries(STATUS_INFO).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></Campo>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Campo label="Início"><input type="date" value={form.inicio} onChange={e => set("inicio", e.target.value)} style={inputStyle} /></Campo>
                <Campo label="Término (se houver)"><input type="date" value={form.fim} onChange={e => set("fim", e.target.value)} style={inputStyle} /></Campo>
              </div>
            </div>
            <div style={{ padding: "14px 24px", borderTop: "1px solid #e5e7eb", display: "flex", gap: 10, justifyContent: "flex-end", background: "#f9fafb" }}>
              <button onClick={() => setModal(false)} style={{ background: "#ffffff", color: "#374151", border: "1px solid #e5e7eb", borderRadius: 10, padding: "9px 18px", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>Cancelar</button>
              <button onClick={salvar} style={{ background: `linear-gradient(135deg, ${COR} 0%, #6366f1 100%)`, color: "white", border: "none", borderRadius: 10, padding: "9px 22px", fontSize: 13, cursor: "pointer", fontWeight: 700 }}>+ Criar</button>
            </div>
          </div>
        </div>
      )}

      <p style={{ color: "#9ca3af", fontSize: 11, margin: 0, textAlign: "center", fontStyle: "italic" }}>Dados de exemplo — conecte à tabela <b>contratos</b> do Supabase.</p>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (<div><label style={{ color: "#6b7280", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 6 }}>{label}</label>{children}</div>);
}