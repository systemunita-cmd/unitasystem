"use client";
import { useState, useMemo, useEffect } from "react";

// ═══════════════════════════════════════════════════════════════════════
// 🧑‍💼 RH · Treinamentos
// ───────────────────────────────────────────────────────────────────────
// Capacitações: título, modalidade, instrutor, participantes, carga horária
// e status. MOCK + modal de criação.
// ═══════════════════════════════════════════════════════════════════════

const COR = "#4f46e5";
const COR_TEXTO = "#4338ca";
const card = { background: "#ffffff", borderRadius: 14, border: "1px solid #e5e7eb", boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)" };
const inputStyle = { width: "100%", background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 14px", color: "#1f2937", fontSize: 13, boxSizing: "border-box" as const, outline: "none" };
const dataBR = (iso: string) => { try { return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR"); } catch { return iso; } };

const MODALIDADES = ["Presencial", "Online", "Híbrido"];
type StatusT = "planejado" | "em_andamento" | "concluido";
type Treinamento = { id: string; titulo: string; modalidade: string; instrutor: string; participantes: number; cargaHoraria: number; status: StatusT; data: string };

const STATUS_INFO: Record<StatusT, { label: string; cor: string }> = {
  planejado: { label: "Planejado", cor: "#0ea5e9" },
  em_andamento: { label: "Em andamento", cor: "#f59e0b" },
  concluido: { label: "Concluído", cor: "#16a34a" },
};

const MOCK: Treinamento[] = [
  { id: "1", titulo: "Onboarding — Novos colaboradores", modalidade: "Presencial", instrutor: "RH Interno", participantes: 12, cargaHoraria: 8, status: "concluido", data: "2026-05-15" },
  { id: "2", titulo: "Técnicas de Vendas Consultivas", modalidade: "Online", instrutor: "Consultoria XPTO", participantes: 28, cargaHoraria: 16, status: "em_andamento", data: "2026-06-02" },
  { id: "3", titulo: "Excel Avançado", modalidade: "Online", instrutor: "Plataforma EAD", participantes: 9, cargaHoraria: 20, status: "planejado", data: "2026-06-20" },
  { id: "4", titulo: "NR-35 (Trabalho em Altura)", modalidade: "Presencial", instrutor: "SESI", participantes: 6, cargaHoraria: 8, status: "planejado", data: "2026-07-01" },
];

const FORM_VAZIO: Treinamento = { id: "", titulo: "", modalidade: MODALIDADES[0], instrutor: "", participantes: 0, cargaHoraria: 0, status: "planejado", data: "" };

export function TreinamentosSection() {
  const [lista, setLista] = useState<Treinamento[]>(MOCK);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState<Treinamento>(FORM_VAZIO);

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check(); window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const stats = useMemo(() => ({
    total: lista.length,
    andamento: lista.filter(t => t.status === "em_andamento").length,
    concluidos: lista.filter(t => t.status === "concluido").length,
    horas: lista.reduce((s, t) => s + t.cargaHoraria, 0),
  }), [lista]);

  const salvar = () => {
    if (!form.titulo.trim()) { alert("Informe o título do treinamento."); return; }
    setLista(l => [{ ...form, id: Date.now().toString() }, ...l]);
    setModal(false); setForm(FORM_VAZIO);
  };
  const set = (k: keyof Treinamento, v: any) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: `linear-gradient(135deg, ${COR} 0%, #6366f1 100%)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, boxShadow: `0 8px 20px ${COR}30` }}><span style={{ filter: "saturate(0) brightness(2)" }}>🎓</span></div>
          <div>
            <h1 style={{ color: "#1f2937", fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: -0.3 }}>Treinamentos</h1>
            <p style={{ color: "#6b7280", fontSize: 12, margin: "2px 0 0" }}>Capacitação e desenvolvimento da equipe</p>
          </div>
        </div>
        <button onClick={() => { setForm(FORM_VAZIO); setModal(true); }} style={{ background: `linear-gradient(135deg, ${COR} 0%, #6366f1 100%)`, color: "white", border: "none", borderRadius: 12, padding: "11px 20px", fontSize: 13, cursor: "pointer", fontWeight: 700, boxShadow: `0 4px 12px ${COR}40`, whiteSpace: "nowrap" }}>+ Novo Treinamento</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14 }}>
        {[
          { label: "Treinamentos", value: String(stats.total), cor: "#6366f1", icon: "🎓" },
          { label: "Em andamento", value: String(stats.andamento), cor: "#f59e0b", icon: "🔄" },
          { label: "Concluídos", value: String(stats.concluidos), cor: "#16a34a", icon: "✅" },
          { label: "Horas totais", value: stats.horas + "h", cor: "#0ea5e9", icon: "⏱️" },
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

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(320px, 1fr))", gap: 14 }}>
        {lista.map(t => {
          const st = STATUS_INFO[t.status];
          return (
            <div key={t.id} style={{ ...card, padding: 18, display: "flex", flexDirection: "column", gap: 12, borderLeft: `4px solid ${st.cor}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                <p style={{ color: "#1f2937", fontSize: 15, fontWeight: 800, margin: 0 }}>{t.titulo}</p>
                <span style={{ background: `${st.cor}15`, color: st.cor, border: `1px solid ${st.cor}40`, fontSize: 10, padding: "3px 8px", borderRadius: 8, fontWeight: 700, whiteSpace: "nowrap", flexShrink: 0 }}>{st.label}</span>
              </div>
              <p style={{ color: "#6b7280", fontSize: 12, margin: 0 }}>👨‍🏫 {t.instrutor} · {t.modalidade}</p>
              <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #f3f4f6", paddingTop: 12 }}>
                <span style={{ color: "#6b7280", fontSize: 12 }}>👥 {t.participantes} · ⏱️ {t.cargaHoraria}h</span>
                <span style={{ color: COR_TEXTO, fontSize: 12, fontWeight: 700 }}>{dataBR(t.data)}</span>
              </div>
            </div>
          );
        })}
      </div>

      {modal && (
        <div onClick={() => setModal(false)} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", backdropFilter: "blur(4px)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ ...card, width: "100%", maxWidth: 540, overflow: "hidden" }}>
            <div style={{ padding: "18px 24px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ color: "#1f2937", fontSize: 16, fontWeight: 700, margin: 0 }}>Novo Treinamento</h3>
              <button onClick={() => setModal(false)} style={{ background: "#f3f4f6", border: "none", color: "#6b7280", fontSize: 16, cursor: "pointer", width: 32, height: 32, borderRadius: 8 }}>✕</button>
            </div>
            <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
              <Campo label="Título"><input value={form.titulo} onChange={e => set("titulo", e.target.value)} style={inputStyle} placeholder="Ex: Técnicas de Vendas" /></Campo>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Campo label="Instrutor"><input value={form.instrutor} onChange={e => set("instrutor", e.target.value)} style={inputStyle} placeholder="Nome / empresa" /></Campo>
                <Campo label="Modalidade"><select value={form.modalidade} onChange={e => set("modalidade", e.target.value)} style={inputStyle}>{MODALIDADES.map(m => <option key={m} value={m}>{m}</option>)}</select></Campo>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
                <Campo label="Participantes"><input type="number" value={form.participantes || ""} onChange={e => set("participantes", Number(e.target.value))} style={inputStyle} /></Campo>
                <Campo label="Carga (h)"><input type="number" value={form.cargaHoraria || ""} onChange={e => set("cargaHoraria", Number(e.target.value))} style={inputStyle} /></Campo>
                <Campo label="Data"><input type="date" value={form.data} onChange={e => set("data", e.target.value)} style={inputStyle} /></Campo>
              </div>
            </div>
            <div style={{ padding: "14px 24px", borderTop: "1px solid #e5e7eb", display: "flex", gap: 10, justifyContent: "flex-end", background: "#f9fafb" }}>
              <button onClick={() => setModal(false)} style={{ background: "#ffffff", color: "#374151", border: "1px solid #e5e7eb", borderRadius: 10, padding: "9px 18px", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>Cancelar</button>
              <button onClick={salvar} style={{ background: `linear-gradient(135deg, ${COR} 0%, #6366f1 100%)`, color: "white", border: "none", borderRadius: 10, padding: "9px 22px", fontSize: 13, cursor: "pointer", fontWeight: 700 }}>+ Criar</button>
            </div>
          </div>
        </div>
      )}

      <p style={{ color: "#9ca3af", fontSize: 11, margin: 0, textAlign: "center", fontStyle: "italic" }}>Dados de exemplo — conecte à tabela <b>treinamentos</b> do Supabase.</p>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (<div><label style={{ color: "#6b7280", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 6 }}>{label}</label>{children}</div>);
}