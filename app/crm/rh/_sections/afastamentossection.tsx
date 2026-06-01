"use client";
import { useState, useMemo, useEffect } from "react";

// ═══════════════════════════════════════════════════════════════════════
// 🧑‍💼 RH · Afastamentos
// ───────────────────────────────────────────────────────────────────────
// Atestados, licenças (INSS, maternidade/paternidade), acidente de trabalho.
// Por colaborador: tipo, período, dias, status e CID (opcional). MOCK +
// modal de registro. Em produção, tabela 'afastamentos'.
// ═══════════════════════════════════════════════════════════════════════

const COR = "#4f46e5";
const COR_TEXTO = "#4338ca";
const card = { background: "#ffffff", borderRadius: 14, border: "1px solid #e5e7eb", boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)" };
const inputStyle = { width: "100%", background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 14px", color: "#1f2937", fontSize: 13, boxSizing: "border-box" as const, outline: "none" };

const TIPOS = ["Atestado médico", "Licença INSS", "Acidente de trabalho", "Licença maternidade", "Licença paternidade", "Outros"];
const dataBR = (iso: string) => { try { return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR"); } catch { return iso; } };

type Afastamento = { id: string; nome: string; cargo: string; tipo: string; inicio: string; fim: string; cid: string; status: "em_andamento" | "encerrado" };

const MOCK: Afastamento[] = [
  { id: "1", nome: "Bruno Tavares", cargo: "Atendente", tipo: "Atestado médico", inicio: "2026-05-28", fim: "2026-06-04", cid: "J11", status: "em_andamento" },
  { id: "2", nome: "Marina Costa", cargo: "Analista", tipo: "Licença maternidade", inicio: "2026-04-10", fim: "2026-08-10", cid: "—", status: "em_andamento" },
  { id: "3", nome: "Pedro Alves", cargo: "Vendedor", tipo: "Acidente de trabalho", inicio: "2026-03-15", fim: "2026-04-15", cid: "S62", status: "encerrado" },
  { id: "4", nome: "Larissa Nunes", cargo: "Vendedora", tipo: "Atestado médico", inicio: "2026-05-20", fim: "2026-05-21", cid: "A09", status: "encerrado" },
];

const FORM_VAZIO: Afastamento = { id: "", nome: "", cargo: "", tipo: TIPOS[0], inicio: "", fim: "", cid: "", status: "em_andamento" };

function diasEntre(a: string, b: string) {
  if (!a || !b) return 0;
  const d = (new Date(b + "T00:00:00").getTime() - new Date(a + "T00:00:00").getTime()) / 86400000;
  return Math.max(0, Math.round(d) + 1);
}

export function AfastamentosSection() {
  const [lista, setLista] = useState<Afastamento[]>(MOCK);
  const [filtro, setFiltro] = useState<"todos" | "em_andamento" | "encerrado">("todos");
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState<Afastamento>(FORM_VAZIO);

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check(); window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const filtrados = useMemo(() => filtro === "todos" ? lista : lista.filter(a => a.status === filtro), [lista, filtro]);
  const stats = useMemo(() => ({
    ativos: lista.filter(a => a.status === "em_andamento").length,
    mes: lista.length,
    dias: lista.reduce((s, a) => s + diasEntre(a.inicio, a.fim), 0),
  }), [lista]);

  const salvar = () => {
    if (!form.nome.trim()) { alert("Informe o colaborador."); return; }
    setLista(l => [{ ...form, id: Date.now().toString() }, ...l]);
    setModal(false); setForm(FORM_VAZIO); // 🔌 Supabase: insert em 'afastamentos'
  };
  const set = (k: keyof Afastamento, v: any) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: `linear-gradient(135deg, ${COR} 0%, #6366f1 100%)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, boxShadow: `0 8px 20px ${COR}30` }}><span style={{ filter: "saturate(0) brightness(2)" }}>🏥</span></div>
          <div>
            <h1 style={{ color: "#1f2937", fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: -0.3 }}>Afastamentos</h1>
            <p style={{ color: "#6b7280", fontSize: 12, margin: "2px 0 0" }}>Atestados, licenças e afastamentos médicos</p>
          </div>
        </div>
        <button onClick={() => { setForm(FORM_VAZIO); setModal(true); }} style={{ background: `linear-gradient(135deg, ${COR} 0%, #6366f1 100%)`, color: "white", border: "none", borderRadius: 12, padding: "11px 20px", fontSize: 13, cursor: "pointer", fontWeight: 700, boxShadow: `0 4px 12px ${COR}40`, whiteSpace: "nowrap" }}>+ Registrar Afastamento</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 14 }}>
        {[
          { label: "Afastados agora", value: String(stats.ativos), cor: "#dc2626", icon: "🏥" },
          { label: "Registros no mês", value: String(stats.mes), cor: "#6366f1", icon: "📋" },
          { label: "Dias acumulados", value: String(stats.dias), cor: "#f59e0b", icon: "📅" },
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
        {([["todos", "Todos"], ["em_andamento", "Em andamento"], ["encerrado", "Encerrados"]] as [string, string][]).map(([k, lbl]) => {
          const ativo = filtro === k;
          return <button key={k} onClick={() => setFiltro(k as any)} style={{ background: ativo ? `${COR}15` : "#f9fafb", color: ativo ? COR_TEXTO : "#6b7280", border: `1px solid ${ativo ? COR + "50" : "#e5e7eb"}`, borderRadius: 10, padding: "7px 14px", fontSize: 12, cursor: "pointer", fontWeight: ativo ? 700 : 600 }}>{lbl}</button>;
        })}
      </div>

      <div style={{ ...card, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ background: "#f9fafb" }}>
              {["Colaborador", "Tipo", "Início", "Fim", "Dias", "CID", "Status"].map(h => (
                <th key={h} style={{ padding: "12px 16px", color: "#6b7280", fontSize: 11, textAlign: "left", textTransform: "uppercase", letterSpacing: 0.5, whiteSpace: "nowrap", fontWeight: 700, borderBottom: "1px solid #e5e7eb" }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {filtrados.map((a, i) => {
                const ativo = a.status === "em_andamento";
                return (
                  <tr key={a.id} style={{ borderTop: "1px solid #f3f4f6", background: i % 2 === 0 ? "#ffffff" : "#fafbfc" }}>
                    <td style={{ padding: "12px 16px" }}>
                      <p style={{ color: "#1f2937", fontSize: 13, fontWeight: 700, margin: 0 }}>{a.nome}</p>
                      <p style={{ color: "#9ca3af", fontSize: 11, margin: "2px 0 0" }}>{a.cargo}</p>
                    </td>
                    <td style={{ padding: "12px 16px", color: "#4b5563", fontSize: 12 }}>{a.tipo}</td>
                    <td style={{ padding: "12px 16px", color: "#6b7280", fontSize: 12, whiteSpace: "nowrap" }}>{dataBR(a.inicio)}</td>
                    <td style={{ padding: "12px 16px", color: "#6b7280", fontSize: 12, whiteSpace: "nowrap" }}>{dataBR(a.fim)}</td>
                    <td style={{ padding: "12px 16px", color: "#1f2937", fontSize: 12, fontWeight: 700 }}>{diasEntre(a.inicio, a.fim)}</td>
                    <td style={{ padding: "12px 16px", color: "#6b7280", fontSize: 12, fontFamily: "monospace" }}>{a.cid}</td>
                    <td style={{ padding: "12px 16px" }}><span style={{ background: ativo ? "#fef2f2" : "#f0fdf4", color: ativo ? "#dc2626" : "#16a34a", border: `1px solid ${ativo ? "#fecaca" : "#bbf7d0"}`, fontSize: 11, padding: "3px 10px", borderRadius: 10, fontWeight: 700, whiteSpace: "nowrap" }}>{ativo ? "Em andamento" : "Encerrado"}</span></td>
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
              <h3 style={{ color: "#1f2937", fontSize: 16, fontWeight: 700, margin: 0 }}>Registrar Afastamento</h3>
              <button onClick={() => setModal(false)} style={{ background: "#f3f4f6", border: "none", color: "#6b7280", fontSize: 16, cursor: "pointer", width: 32, height: 32, borderRadius: 8 }}>✕</button>
            </div>
            <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Campo label="Colaborador"><input value={form.nome} onChange={e => set("nome", e.target.value)} style={inputStyle} placeholder="Nome" /></Campo>
                <Campo label="Cargo"><input value={form.cargo} onChange={e => set("cargo", e.target.value)} style={inputStyle} placeholder="Cargo" /></Campo>
              </div>
              <Campo label="Tipo"><select value={form.tipo} onChange={e => set("tipo", e.target.value)} style={inputStyle}>{TIPOS.map(t => <option key={t} value={t}>{t}</option>)}</select></Campo>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
                <Campo label="Início"><input type="date" value={form.inicio} onChange={e => set("inicio", e.target.value)} style={inputStyle} /></Campo>
                <Campo label="Fim"><input type="date" value={form.fim} onChange={e => set("fim", e.target.value)} style={inputStyle} /></Campo>
                <Campo label="CID (opcional)"><input value={form.cid} onChange={e => set("cid", e.target.value)} style={inputStyle} placeholder="Ex: J11" /></Campo>
              </div>
            </div>
            <div style={{ padding: "14px 24px", borderTop: "1px solid #e5e7eb", display: "flex", gap: 10, justifyContent: "flex-end", background: "#f9fafb" }}>
              <button onClick={() => setModal(false)} style={{ background: "#ffffff", color: "#374151", border: "1px solid #e5e7eb", borderRadius: 10, padding: "9px 18px", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>Cancelar</button>
              <button onClick={salvar} style={{ background: `linear-gradient(135deg, ${COR} 0%, #6366f1 100%)`, color: "white", border: "none", borderRadius: 10, padding: "9px 22px", fontSize: 13, cursor: "pointer", fontWeight: 700 }}>+ Registrar</button>
            </div>
          </div>
        </div>
      )}

      <p style={{ color: "#9ca3af", fontSize: 11, margin: 0, textAlign: "center", fontStyle: "italic" }}>Dados de exemplo — conecte à tabela <b>afastamentos</b> do Supabase.</p>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (<div><label style={{ color: "#6b7280", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 6 }}>{label}</label>{children}</div>);
}