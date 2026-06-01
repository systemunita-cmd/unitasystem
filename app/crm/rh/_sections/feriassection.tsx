"use client";
import { useState, useMemo, useEffect } from "react";

// ═══════════════════════════════════════════════════════════════════════
// 🧑‍💼 RH · Férias
// ───────────────────────────────────────────────────────────────────────
// Controle de férias por colaborador: período aquisitivo, dias de direito,
// gozados, saldo, status e vencimento do período. Alerta de férias a vencer.
// MOCK + modal de agendamento. Em produção, tabela 'ferias'.
// ═══════════════════════════════════════════════════════════════════════

const COR = "#4f46e5";
const COR_TEXTO = "#4338ca";
const card = { background: "#ffffff", borderRadius: 14, border: "1px solid #e5e7eb", boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)" };
const inputStyle = { width: "100%", background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 14px", color: "#1f2937", fontSize: 13, boxSizing: "border-box" as const, outline: "none" };

type StatusFerias = "em_gozo" | "agendada" | "disponivel" | "vencendo";
type Ferias = { id: string; nome: string; cargo: string; aquisitivo: string; diasDireito: number; diasGozados: number; venceEm: string; status: StatusFerias; inicioAgendado?: string };

const STATUS_INFO: Record<StatusFerias, { label: string; cor: string }> = {
  em_gozo: { label: "Em gozo", cor: "#0ea5e9" },
  agendada: { label: "Agendada", cor: "#8b5cf6" },
  disponivel: { label: "Disponível", cor: "#16a34a" },
  vencendo: { label: "Vencendo", cor: "#dc2626" },
};

const MOCK: Ferias[] = [
  { id: "1", nome: "Juliana Prado", cargo: "Desenvolvedora", aquisitivo: "2024/2025", diasDireito: 30, diasGozados: 0, venceEm: "12/2026", status: "em_gozo", inicioAgendado: "02/06/2026" },
  { id: "2", nome: "Carlos Mendes", cargo: "Supervisor", aquisitivo: "2024/2025", diasDireito: 30, diasGozados: 10, venceEm: "07/2026", status: "vencendo" },
  { id: "3", nome: "Ana Beatriz Souza", cargo: "Analista Comercial", aquisitivo: "2024/2025", diasDireito: 30, diasGozados: 0, venceEm: "03/2027", status: "agendada", inicioAgendado: "15/07/2026" },
  { id: "4", nome: "Rafael Lima", cargo: "Assistente Financeiro", aquisitivo: "2024/2025", diasDireito: 30, diasGozados: 0, venceEm: "01/2027", status: "disponivel" },
  { id: "5", nome: "Patrícia Gomes", cargo: "Gerente", aquisitivo: "2023/2024", diasDireito: 30, diasGozados: 20, venceEm: "06/2026", status: "vencendo" },
];

export function FeriasSection() {
  const [lista, setLista] = useState<Ferias[]>(MOCK);
  const [filtro, setFiltro] = useState<"todos" | StatusFerias>("todos");
  const [agendar, setAgendar] = useState<Ferias | null>(null);
  const [inicio, setInicio] = useState("");
  const [dias, setDias] = useState(30);

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check(); window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const filtrados = useMemo(() => filtro === "todos" ? lista : lista.filter(f => f.status === filtro), [lista, filtro]);

  const stats = useMemo(() => ({
    emGozo: lista.filter(f => f.status === "em_gozo").length,
    agendadas: lista.filter(f => f.status === "agendada").length,
    vencendo: lista.filter(f => f.status === "vencendo").length,
    disponiveis: lista.filter(f => f.status === "disponivel").length,
  }), [lista]);

  const confirmarAgendamento = () => {
    if (!agendar || !inicio) { alert("Informe a data de início."); return; }
    setLista(l => l.map(f => f.id === agendar.id ? { ...f, status: "agendada", inicioAgendado: new Date(inicio + "T00:00:00").toLocaleDateString("pt-BR") } : f));
    // 🔌 Supabase: insert/update em 'ferias'
    setAgendar(null); setInicio(""); setDias(30);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: `linear-gradient(135deg, ${COR} 0%, #6366f1 100%)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, boxShadow: `0 8px 20px ${COR}30` }}><span style={{ filter: "saturate(0) brightness(2)" }}>🌴</span></div>
          <div>
            <h1 style={{ color: "#1f2937", fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: -0.3 }}>Férias</h1>
            <p style={{ color: "#6b7280", fontSize: 12, margin: "2px 0 0" }}>Controle de períodos aquisitivos e agendamentos</p>
          </div>
        </div>
      </div>

      {/* Alerta de vencendo */}
      {stats.vencendo > 0 && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderLeft: "4px solid #dc2626", borderRadius: 12, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18 }}>⚠️</span>
          <p style={{ color: "#991b1b", fontSize: 13, margin: 0, fontWeight: 600 }}><b>{stats.vencendo}</b> colaborador(es) com período de férias vencendo — agende para evitar pagamento em dobro.</p>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14 }}>
        {[
          { label: "Em gozo", value: String(stats.emGozo), cor: "#0ea5e9", icon: "🏖️" },
          { label: "Agendadas", value: String(stats.agendadas), cor: "#8b5cf6", icon: "📅" },
          { label: "Vencendo", value: String(stats.vencendo), cor: "#dc2626", icon: "⚠️" },
          { label: "Disponíveis", value: String(stats.disponiveis), cor: "#16a34a", icon: "✅" },
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

      {/* Filtro por status */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {([["todos", "Todos"], ...Object.entries(STATUS_INFO).map(([k, v]) => [k, v.label])] as [string, string][]).map(([k, lbl]) => {
          const ativo = filtro === k;
          const cor = k === "todos" ? COR : STATUS_INFO[k as StatusFerias].cor;
          return (
            <button key={k} onClick={() => setFiltro(k as any)}
              style={{ background: ativo ? `${cor}15` : "#f9fafb", color: ativo ? cor : "#6b7280", border: `1px solid ${ativo ? cor + "50" : "#e5e7eb"}`, borderRadius: 10, padding: "7px 14px", fontSize: 12, cursor: "pointer", fontWeight: ativo ? 700 : 600 }}>
              {lbl}
            </button>
          );
        })}
      </div>

      {/* LISTA */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(320px, 1fr))", gap: 14 }}>
        {filtrados.map(f => {
          const st = STATUS_INFO[f.status];
          const saldo = f.diasDireito - f.diasGozados;
          return (
            <div key={f.id} style={{ ...card, padding: 18, display: "flex", flexDirection: "column", gap: 12, borderLeft: `4px solid ${st.cor}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 40, height: 40, borderRadius: "50%", background: `linear-gradient(135deg, ${COR} 0%, #6366f1 100%)`, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 15, fontWeight: 700, flexShrink: 0 }}>{f.nome.charAt(0)}</div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ color: "#1f2937", fontSize: 14, fontWeight: 700, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.nome}</p>
                  <p style={{ color: "#9ca3af", fontSize: 11, margin: "2px 0 0" }}>{f.cargo}</p>
                </div>
                <span style={{ background: `${st.cor}15`, color: st.cor, border: `1px solid ${st.cor}40`, fontSize: 10, padding: "3px 8px", borderRadius: 8, fontWeight: 700, whiteSpace: "nowrap" }}>{st.label}</span>
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                {[["Aquisitivo", f.aquisitivo], ["Saldo", `${saldo} dias`], ["Vence", f.venceEm]].map(([l, v]) => (
                  <div key={l} style={{ flex: 1, background: "#f9fafb", borderRadius: 9, padding: "8px 10px", textAlign: "center" }}>
                    <p style={{ color: "#9ca3af", fontSize: 9, margin: 0, fontWeight: 700, textTransform: "uppercase" }}>{l}</p>
                    <p style={{ color: "#1f2937", fontSize: 12, fontWeight: 700, margin: "2px 0 0" }}>{v}</p>
                  </div>
                ))}
              </div>

              {f.inicioAgendado && <p style={{ color: st.cor, fontSize: 11, margin: 0, fontWeight: 600 }}>📅 Início: {f.inicioAgendado}</p>}

              {(f.status === "disponivel" || f.status === "vencendo") && (
                <button onClick={() => { setAgendar(f); setInicio(""); setDias(saldo); }}
                  style={{ background: "#eef2ff", color: COR_TEXTO, border: "1px solid #c7d2fe", borderRadius: 10, padding: "9px 14px", fontSize: 12, cursor: "pointer", fontWeight: 700 }}>
                  📅 Agendar férias
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* MODAL AGENDAR */}
      {agendar && (
        <div onClick={() => setAgendar(null)} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", backdropFilter: "blur(4px)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ ...card, width: "100%", maxWidth: 440, overflow: "hidden" }}>
            <div style={{ padding: "18px 24px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ color: "#1f2937", fontSize: 16, fontWeight: 700, margin: 0 }}>Agendar férias</h3>
              <button onClick={() => setAgendar(null)} style={{ background: "#f3f4f6", border: "none", color: "#6b7280", fontSize: 16, cursor: "pointer", width: 32, height: 32, borderRadius: 8 }}>✕</button>
            </div>
            <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
              <p style={{ color: "#374151", fontSize: 13, margin: 0 }}>Colaborador: <b>{agendar.nome}</b></p>
              <div>
                <label style={{ color: "#6b7280", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 6 }}>Data de início</label>
                <input type="date" value={inicio} onChange={e => setInicio(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={{ color: "#6b7280", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 6 }}>Dias</label>
                <input type="number" value={dias || ""} onChange={e => setDias(Number(e.target.value))} style={inputStyle} />
              </div>
            </div>
            <div style={{ padding: "14px 24px", borderTop: "1px solid #e5e7eb", display: "flex", gap: 10, justifyContent: "flex-end", background: "#f9fafb" }}>
              <button onClick={() => setAgendar(null)} style={{ background: "#ffffff", color: "#374151", border: "1px solid #e5e7eb", borderRadius: 10, padding: "9px 18px", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>Cancelar</button>
              <button onClick={confirmarAgendamento} style={{ background: `linear-gradient(135deg, ${COR} 0%, #6366f1 100%)`, color: "white", border: "none", borderRadius: 10, padding: "9px 22px", fontSize: 13, cursor: "pointer", fontWeight: 700 }}>📅 Agendar</button>
            </div>
          </div>
        </div>
      )}

      <p style={{ color: "#9ca3af", fontSize: 11, margin: 0, textAlign: "center", fontStyle: "italic" }}>Dados de exemplo — conecte à tabela <b>ferias</b> do Supabase.</p>
    </div>
  );
}