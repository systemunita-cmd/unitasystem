"use client";
import { useState, useMemo } from "react";

// ═══════════════════════════════════════════════════════════════════════
// 🧑‍💼 RH · Candidatos
// ───────────────────────────────────────────────────────────────────────
// Banco de candidatos: vaga, etapa atual, origem e contato. Busca e filtros.
// MOCK. Em produção, tabela 'candidatos'.
// ═══════════════════════════════════════════════════════════════════════

const COR = "#4f46e5";
const COR_TEXTO = "#4338ca";
const card = { background: "#ffffff", borderRadius: 14, border: "1px solid #e5e7eb", boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)" };
const inputStyle = { width: "100%", background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 14px", color: "#1f2937", fontSize: 13, boxSizing: "border-box" as const, outline: "none" };

const ETAPAS = ["Triagem", "Entrevista", "Teste", "Proposta", "Contratado", "Reprovado"];
const ETAPA_COR: Record<string, string> = { "Triagem": "#0ea5e9", "Entrevista": "#6366f1", "Teste": "#8b5cf6", "Proposta": "#f59e0b", "Contratado": "#16a34a", "Reprovado": "#dc2626" };
const ORIGENS = ["LinkedIn", "Indicação", "Site", "Gupy", "Instagram", "Banco de talentos"];

type Candidato = { id: string; nome: string; vaga: string; etapa: string; origem: string; email: string; telefone: string };

const MOCK: Candidato[] = [
  { id: "1", nome: "Felipe Ramos", vaga: "Desenvolvedor Front-end", etapa: "Entrevista", origem: "LinkedIn", email: "felipe.ramos@email.com", telefone: "(62) 99812-1100" },
  { id: "2", nome: "Camila Duarte", vaga: "Desenvolvedor Front-end", etapa: "Teste", origem: "Gupy", email: "camila.d@email.com", telefone: "(62) 99713-2200" },
  { id: "3", nome: "Thiago Barros", vaga: "Vendedor Externo", etapa: "Triagem", origem: "Indicação", email: "thiago.b@email.com", telefone: "(62) 99614-3300" },
  { id: "4", nome: "Renata Lopes", vaga: "Atendente de Suporte", etapa: "Proposta", origem: "Site", email: "renata.l@email.com", telefone: "(62) 99515-4400" },
  { id: "5", nome: "Gustavo Pinto", vaga: "Atendente de Suporte", etapa: "Contratado", origem: "Instagram", email: "gustavo.p@email.com", telefone: "(62) 99416-5500" },
  { id: "6", nome: "Beatriz Antunes", vaga: "Estágio em Marketing", etapa: "Reprovado", origem: "LinkedIn", email: "bia.a@email.com", telefone: "(62) 99317-6600" },
];

const FORM_VAZIO: Candidato = { id: "", nome: "", vaga: "", etapa: ETAPAS[0], origem: ORIGENS[0], email: "", telefone: "" };

export function CandidatosSection() {
  const [lista, setLista] = useState<Candidato[]>(MOCK);
  const [busca, setBusca] = useState("");
  const [filtroEtapa, setFiltroEtapa] = useState("todos");
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState<Candidato>(FORM_VAZIO);

  const filtrados = useMemo(() => {
    let l = lista;
    if (busca) { const b = busca.toLowerCase(); l = l.filter(c => c.nome.toLowerCase().includes(b) || c.vaga.toLowerCase().includes(b)); }
    if (filtroEtapa !== "todos") l = l.filter(c => c.etapa === filtroEtapa);
    return l;
  }, [lista, busca, filtroEtapa]);

  const stats = useMemo(() => ({
    total: lista.length,
    emProcesso: lista.filter(c => !["Contratado", "Reprovado"].includes(c.etapa)).length,
    contratados: lista.filter(c => c.etapa === "Contratado").length,
  }), [lista]);

  const salvar = () => {
    if (!form.nome.trim()) { alert("Informe o nome do candidato."); return; }
    setLista(l => [{ ...form, id: Date.now().toString() }, ...l]);
    setModal(false); setForm(FORM_VAZIO);
  };
  const mudarEtapa = (id: string, etapa: string) => setLista(l => l.map(c => c.id === id ? { ...c, etapa } : c));
  const set = (k: keyof Candidato, v: any) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: `linear-gradient(135deg, ${COR} 0%, #6366f1 100%)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, boxShadow: `0 8px 20px ${COR}30` }}><span style={{ filter: "saturate(0) brightness(2)" }}>📋</span></div>
          <div>
            <h1 style={{ color: "#1f2937", fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: -0.3 }}>Candidatos</h1>
            <p style={{ color: "#6b7280", fontSize: 12, margin: "2px 0 0" }}><b style={{ color: COR_TEXTO }}>{stats.total}</b> candidato(s) no banco</p>
          </div>
        </div>
        <button onClick={() => { setForm(FORM_VAZIO); setModal(true); }} style={{ background: `linear-gradient(135deg, ${COR} 0%, #6366f1 100%)`, color: "white", border: "none", borderRadius: 12, padding: "11px 20px", fontSize: 13, cursor: "pointer", fontWeight: 700, boxShadow: `0 4px 12px ${COR}40`, whiteSpace: "nowrap" }}>+ Novo Candidato</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 14 }}>
        {[
          { label: "No banco", value: String(stats.total), cor: "#6366f1", icon: "📋" },
          { label: "Em processo", value: String(stats.emProcesso), cor: "#f59e0b", icon: "🔄" },
          { label: "Contratados", value: String(stats.contratados), cor: "#16a34a", icon: "✅" },
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
        <input placeholder="🔍 Buscar por candidato ou vaga..." value={busca} onChange={e => setBusca(e.target.value)} style={{ ...inputStyle, flex: "1 1 280px", maxWidth: 460, borderRadius: 20 }} />
        <select value={filtroEtapa} onChange={e => setFiltroEtapa(e.target.value)} style={{ ...inputStyle, maxWidth: 200 }}>
          <option value="todos">Etapa: Todas</option>
          {ETAPAS.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
      </div>

      <div style={{ ...card, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ background: "#f9fafb" }}>
              {["Candidato", "Vaga", "Origem", "Etapa"].map(h => (
                <th key={h} style={{ padding: "12px 16px", color: "#6b7280", fontSize: 11, textAlign: "left", textTransform: "uppercase", letterSpacing: 0.5, whiteSpace: "nowrap", fontWeight: 700, borderBottom: "1px solid #e5e7eb" }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {filtrados.map((c, i) => {
                const cor = ETAPA_COR[c.etapa] || COR;
                return (
                  <tr key={c.id} style={{ borderTop: "1px solid #f3f4f6", background: i % 2 === 0 ? "#ffffff" : "#fafbfc" }}>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 34, height: 34, borderRadius: "50%", background: `linear-gradient(135deg, ${COR} 0%, #6366f1 100%)`, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{c.nome.charAt(0)}</div>
                        <div style={{ minWidth: 0 }}>
                          <p style={{ color: "#1f2937", fontSize: 13, fontWeight: 700, margin: 0 }}>{c.nome}</p>
                          <p style={{ color: "#9ca3af", fontSize: 11, margin: "2px 0 0" }}>{c.email}</p>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: "12px 16px", color: "#4b5563", fontSize: 12 }}>{c.vaga}</td>
                    <td style={{ padding: "12px 16px", color: "#6b7280", fontSize: 12 }}>{c.origem}</td>
                    <td style={{ padding: "12px 16px" }}>
                      <select value={c.etapa} onChange={e => mudarEtapa(c.id, e.target.value)}
                        style={{ background: `${cor}15`, color: cor, border: `1px solid ${cor}40`, fontSize: 11, padding: "5px 10px", borderRadius: 10, fontWeight: 700, cursor: "pointer", outline: "none" }}>
                        {ETAPAS.map(e => <option key={e} value={e} style={{ color: "#1f2937" }}>{e}</option>)}
                      </select>
                    </td>
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
              <h3 style={{ color: "#1f2937", fontSize: 16, fontWeight: 700, margin: 0 }}>Novo Candidato</h3>
              <button onClick={() => setModal(false)} style={{ background: "#f3f4f6", border: "none", color: "#6b7280", fontSize: 16, cursor: "pointer", width: 32, height: 32, borderRadius: 8 }}>✕</button>
            </div>
            <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
              <Campo label="Nome"><input value={form.nome} onChange={e => set("nome", e.target.value)} style={inputStyle} placeholder="Nome do candidato" /></Campo>
              <Campo label="Vaga"><input value={form.vaga} onChange={e => set("vaga", e.target.value)} style={inputStyle} placeholder="Vaga pretendida" /></Campo>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Campo label="E-mail"><input value={form.email} onChange={e => set("email", e.target.value)} style={inputStyle} placeholder="email@..." /></Campo>
                <Campo label="Telefone"><input value={form.telefone} onChange={e => set("telefone", e.target.value)} style={inputStyle} placeholder="(00) 00000-0000" /></Campo>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Campo label="Etapa"><select value={form.etapa} onChange={e => set("etapa", e.target.value)} style={inputStyle}>{ETAPAS.map(e => <option key={e} value={e}>{e}</option>)}</select></Campo>
                <Campo label="Origem"><select value={form.origem} onChange={e => set("origem", e.target.value)} style={inputStyle}>{ORIGENS.map(o => <option key={o} value={o}>{o}</option>)}</select></Campo>
              </div>
            </div>
            <div style={{ padding: "14px 24px", borderTop: "1px solid #e5e7eb", display: "flex", gap: 10, justifyContent: "flex-end", background: "#f9fafb" }}>
              <button onClick={() => setModal(false)} style={{ background: "#ffffff", color: "#374151", border: "1px solid #e5e7eb", borderRadius: 10, padding: "9px 18px", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>Cancelar</button>
              <button onClick={salvar} style={{ background: `linear-gradient(135deg, ${COR} 0%, #6366f1 100%)`, color: "white", border: "none", borderRadius: 10, padding: "9px 22px", fontSize: 13, cursor: "pointer", fontWeight: 700 }}>+ Adicionar</button>
            </div>
          </div>
        </div>
      )}

      <p style={{ color: "#9ca3af", fontSize: 11, margin: 0, textAlign: "center", fontStyle: "italic" }}>Dados de exemplo — conecte à tabela <b>candidatos</b> do Supabase.</p>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (<div><label style={{ color: "#6b7280", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 6 }}>{label}</label>{children}</div>);
}