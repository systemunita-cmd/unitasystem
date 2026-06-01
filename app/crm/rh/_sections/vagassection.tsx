"use client";
import { useState, useMemo, useEffect } from "react";

// ═══════════════════════════════════════════════════════════════════════
// 🧑‍💼 RH · Vagas
// ───────────────────────────────────────────────────────────────────────
// Vagas abertas: título, departamento, regime, faixa salarial, nº de
// candidatos e status. MOCK + modal de abertura de vaga.
// ═══════════════════════════════════════════════════════════════════════

const COR = "#4f46e5";
const COR_TEXTO = "#4338ca";
const card = { background: "#ffffff", borderRadius: 14, border: "1px solid #e5e7eb", boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)" };
const inputStyle = { width: "100%", background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 14px", color: "#1f2937", fontSize: 13, boxSizing: "border-box" as const, outline: "none" };
const dataBR = (iso: string) => { try { return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR"); } catch { return iso; } };

const DEPARTAMENTOS = ["Comercial", "Atendimento", "Financeiro", "TI", "Administrativo"];
const REGIMES = ["CLT", "PJ", "Estágio", "Temporário"];

type StatusVaga = "aberta" | "em_analise" | "fechada";
type Vaga = { id: string; titulo: string; departamento: string; regime: string; salario: string; candidatos: number; status: StatusVaga; abertaEm: string };

const STATUS_INFO: Record<StatusVaga, { label: string; cor: string }> = {
  aberta: { label: "Aberta", cor: "#16a34a" },
  em_analise: { label: "Em análise", cor: "#f59e0b" },
  fechada: { label: "Fechada", cor: "#6b7280" },
};

const MOCK: Vaga[] = [
  { id: "1", titulo: "Vendedor Externo", departamento: "Comercial", regime: "CLT", salario: "R$ 2.500 + comissão", candidatos: 14, status: "aberta", abertaEm: "2026-05-20" },
  { id: "2", titulo: "Desenvolvedor Front-end", departamento: "TI", regime: "CLT", salario: "R$ 6.000 - R$ 9.000", candidatos: 23, status: "em_analise", abertaEm: "2026-05-10" },
  { id: "3", titulo: "Atendente de Suporte", departamento: "Atendimento", regime: "CLT", salario: "R$ 1.900", candidatos: 41, status: "aberta", abertaEm: "2026-05-28" },
  { id: "4", titulo: "Estágio em Marketing", departamento: "Comercial", regime: "Estágio", salario: "R$ 1.200 bolsa", candidatos: 9, status: "aberta", abertaEm: "2026-06-01" },
  { id: "5", titulo: "Analista Financeiro Jr", departamento: "Financeiro", regime: "CLT", salario: "R$ 3.200", candidatos: 7, status: "fechada", abertaEm: "2026-04-15" },
];

const FORM_VAZIO: Vaga = { id: "", titulo: "", departamento: DEPARTAMENTOS[0], regime: REGIMES[0], salario: "", candidatos: 0, status: "aberta", abertaEm: "" };

export function VagasSection() {
  const [lista, setLista] = useState<Vaga[]>(MOCK);
  const [filtro, setFiltro] = useState<"todos" | StatusVaga>("todos");
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState<Vaga>(FORM_VAZIO);

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check(); window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const filtrados = useMemo(() => filtro === "todos" ? lista : lista.filter(v => v.status === filtro), [lista, filtro]);
  const stats = useMemo(() => ({
    abertas: lista.filter(v => v.status === "aberta").length,
    candidatos: lista.reduce((s, v) => s + v.candidatos, 0),
    emAnalise: lista.filter(v => v.status === "em_analise").length,
  }), [lista]);

  const salvar = () => {
    if (!form.titulo.trim()) { alert("Informe o título da vaga."); return; }
    setLista(l => [{ ...form, id: Date.now().toString(), abertaEm: form.abertaEm || new Date().toISOString().split("T")[0] }, ...l]);
    setModal(false); setForm(FORM_VAZIO);
  };
  const set = (k: keyof Vaga, v: any) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: `linear-gradient(135deg, ${COR} 0%, #6366f1 100%)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, boxShadow: `0 8px 20px ${COR}30` }}><span style={{ filter: "saturate(0) brightness(2)" }}>📢</span></div>
          <div>
            <h1 style={{ color: "#1f2937", fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: -0.3 }}>Vagas</h1>
            <p style={{ color: "#6b7280", fontSize: 12, margin: "2px 0 0" }}><b style={{ color: COR_TEXTO }}>{stats.abertas}</b> vaga(s) aberta(s)</p>
          </div>
        </div>
        <button onClick={() => { setForm(FORM_VAZIO); setModal(true); }} style={{ background: `linear-gradient(135deg, ${COR} 0%, #6366f1 100%)`, color: "white", border: "none", borderRadius: 12, padding: "11px 20px", fontSize: 13, cursor: "pointer", fontWeight: 700, boxShadow: `0 4px 12px ${COR}40`, whiteSpace: "nowrap" }}>+ Abrir Vaga</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 14 }}>
        {[
          { label: "Vagas abertas", value: String(stats.abertas), cor: "#16a34a", icon: "📢" },
          { label: "Candidatos", value: String(stats.candidatos), cor: "#6366f1", icon: "👥" },
          { label: "Em análise", value: String(stats.emAnalise), cor: "#f59e0b", icon: "🔍" },
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
        {([["todos", "Todas"], ...Object.entries(STATUS_INFO).map(([k, v]) => [k, v.label])] as [string, string][]).map(([k, lbl]) => {
          const ativo = filtro === k;
          const cor = k === "todos" ? COR : STATUS_INFO[k as StatusVaga].cor;
          return <button key={k} onClick={() => setFiltro(k as any)} style={{ background: ativo ? `${cor}15` : "#f9fafb", color: ativo ? cor : "#6b7280", border: `1px solid ${ativo ? cor + "50" : "#e5e7eb"}`, borderRadius: 10, padding: "7px 14px", fontSize: 12, cursor: "pointer", fontWeight: ativo ? 700 : 600 }}>{lbl}</button>;
        })}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
        {filtrados.map(v => {
          const st = STATUS_INFO[v.status];
          return (
            <div key={v.id} style={{ ...card, padding: 18, display: "flex", flexDirection: "column", gap: 12, borderLeft: `4px solid ${st.cor}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ color: "#1f2937", fontSize: 15, fontWeight: 800, margin: 0 }}>{v.titulo}</p>
                  <p style={{ color: "#9ca3af", fontSize: 11, margin: "3px 0 0" }}>{v.departamento} · {v.regime}</p>
                </div>
                <span style={{ background: `${st.cor}15`, color: st.cor, border: `1px solid ${st.cor}40`, fontSize: 10, padding: "3px 8px", borderRadius: 8, fontWeight: 700, whiteSpace: "nowrap", flexShrink: 0 }}>{st.label}</span>
              </div>
              <p style={{ color: "#374151", fontSize: 13, fontWeight: 600, margin: 0 }}>💰 {v.salario}</p>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #f3f4f6", paddingTop: 12 }}>
                <span style={{ color: "#6b7280", fontSize: 11 }}>Aberta em {dataBR(v.abertaEm)}</span>
                <span style={{ background: "#eef2ff", color: COR_TEXTO, fontSize: 11, padding: "4px 10px", borderRadius: 8, fontWeight: 700 }}>👥 {v.candidatos} candidatos</span>
              </div>
            </div>
          );
        })}
      </div>

      {modal && (
        <div onClick={() => setModal(false)} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", backdropFilter: "blur(4px)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ ...card, width: "100%", maxWidth: 520, overflow: "hidden" }}>
            <div style={{ padding: "18px 24px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ color: "#1f2937", fontSize: 16, fontWeight: 700, margin: 0 }}>Abrir Vaga</h3>
              <button onClick={() => setModal(false)} style={{ background: "#f3f4f6", border: "none", color: "#6b7280", fontSize: 16, cursor: "pointer", width: 32, height: 32, borderRadius: 8 }}>✕</button>
            </div>
            <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
              <Campo label="Título da vaga"><input value={form.titulo} onChange={e => set("titulo", e.target.value)} style={inputStyle} placeholder="Ex: Vendedor Externo" /></Campo>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Campo label="Departamento"><select value={form.departamento} onChange={e => set("departamento", e.target.value)} style={inputStyle}>{DEPARTAMENTOS.map(d => <option key={d} value={d}>{d}</option>)}</select></Campo>
                <Campo label="Regime"><select value={form.regime} onChange={e => set("regime", e.target.value)} style={inputStyle}>{REGIMES.map(r => <option key={r} value={r}>{r}</option>)}</select></Campo>
              </div>
              <Campo label="Faixa salarial"><input value={form.salario} onChange={e => set("salario", e.target.value)} style={inputStyle} placeholder="Ex: R$ 2.500 + comissão" /></Campo>
            </div>
            <div style={{ padding: "14px 24px", borderTop: "1px solid #e5e7eb", display: "flex", gap: 10, justifyContent: "flex-end", background: "#f9fafb" }}>
              <button onClick={() => setModal(false)} style={{ background: "#ffffff", color: "#374151", border: "1px solid #e5e7eb", borderRadius: 10, padding: "9px 18px", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>Cancelar</button>
              <button onClick={salvar} style={{ background: `linear-gradient(135deg, ${COR} 0%, #6366f1 100%)`, color: "white", border: "none", borderRadius: 10, padding: "9px 22px", fontSize: 13, cursor: "pointer", fontWeight: 700 }}>+ Abrir</button>
            </div>
          </div>
        </div>
      )}

      <p style={{ color: "#9ca3af", fontSize: 11, margin: 0, textAlign: "center", fontStyle: "italic" }}>Dados de exemplo — conecte à tabela <b>vagas</b> do Supabase.</p>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (<div><label style={{ color: "#6b7280", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 6 }}>{label}</label>{children}</div>);
}