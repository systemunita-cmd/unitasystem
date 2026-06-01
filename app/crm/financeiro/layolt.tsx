"use client";
import { useState, useEffect } from "react";
import { DashboardSection } from "./_sections/dashboardsection";

// ═══════════════════════════════════════════════════════════════════════
// 💵 FINANCEIRO — Shell do módulo (UnitaSystem)
// ───────────────────────────────────────────────────────────────────────
// Sub-sidebar própria com TODAS as seções de um sistema financeiro completo,
// agrupadas em menus expansíveis. A aba ativa é controlada por estado local
// (useState) — troca de seção sem recarregar a rota.
// Só o Dashboard está implementado; as demais mostram um placeholder
// estilizado "em construção" pronto pra receber cada section depois.
//
// Cor do módulo: ÂMBAR/DOURADO (#f59e0b / #b45309) — alinhado ao atalho.
// ═══════════════════════════════════════════════════════════════════════

const COR = "#d97706";        // âmbar principal
const COR_TEXTO = "#b45309";  // âmbar escuro (texto)
const COR_BG = "#fffbeb";     // âmbar bem claro (fundos)
const COR_BORDA = "#fde68a";  // âmbar borda

type SubItem = { key: string; label: string };
type Grupo = { key: string; icon: string; label: string; itens: SubItem[] };

const GRUPOS: Grupo[] = [
  { key: "visao", icon: "📊", label: "Visão Geral", itens: [
    { key: "dashboard", label: "Dashboard" },
    { key: "indicadores", label: "Indicadores" },
  ]},
  { key: "receber", icon: "📥", label: "Contas a Receber", itens: [
    { key: "receber", label: "Títulos a Receber" },
    { key: "recebimentos", label: "Recebimentos" },
    { key: "clientes", label: "Clientes" },
  ]},
  { key: "pagar", icon: "📤", label: "Contas a Pagar", itens: [
    { key: "pagar", label: "Títulos a Pagar" },
    { key: "pagamentos", label: "Pagamentos" },
    { key: "fornecedores", label: "Fornecedores" },
  ]},
  { key: "caixa", icon: "💵", label: "Caixa & Bancos", itens: [
    { key: "fluxo", label: "Fluxo de Caixa" },
    { key: "contas_bancarias", label: "Contas Bancárias" },
    { key: "conciliacao", label: "Conciliação Bancária" },
  ]},
  { key: "relatorios", icon: "📈", label: "Relatórios", itens: [
    { key: "dre", label: "DRE" },
    { key: "fluxo_projetado", label: "Fluxo Projetado" },
    { key: "relatorios", label: "Relatórios Gerais" },
  ]},
  { key: "cadastros", icon: "🏷️", label: "Cadastros", itens: [
    { key: "categorias", label: "Categorias" },
    { key: "centros_custo", label: "Centros de Custo" },
  ]},
  { key: "config", icon: "⚙️", label: "Configurações", itens: [
    { key: "config", label: "Geral" },
  ]},
];

const LABELS: Record<string, string> = Object.fromEntries(
  GRUPOS.flatMap(g => g.itens.map(i => [i.key, i.label]))
);

export default function FinanceiroLayolt() {
  const [aba, setAba] = useState("dashboard");
  const [grupoAberto, setGrupoAberto] = useState<string | null>("visao");
  const [isMobile, setIsMobile] = useState(false);
  const [menuMobileAberto, setMenuMobileAberto] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const selecionar = (key: string) => {
    setAba(key);
    if (isMobile) setMenuMobileAberto(false);
  };

  return (
    <div style={{ display: "flex", height: "100%", minHeight: 0, fontFamily: "Arial, sans-serif", background: "#f8fafc", position: "relative" }}>

      {/* HAMBÚRGUER (mobile) */}
      {isMobile && !menuMobileAberto && (
        <button onClick={() => setMenuMobileAberto(true)} title="Abrir menu do módulo"
          style={{ position: "fixed", top: 8, left: 8, zIndex: 50, background: "#ffffff", border: "1px solid #e5e7eb", color: "#1f2937", borderRadius: 10, padding: "6px 12px", fontSize: 18, cursor: "pointer", lineHeight: 1, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}>☰</button>
      )}
      {isMobile && menuMobileAberto && (
        <div onClick={() => setMenuMobileAberto(false)} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.4)", backdropFilter: "blur(2px)", zIndex: 50 }} />
      )}

      {/* SUB-SIDEBAR DO MÓDULO */}
      <div style={{
        width: isMobile ? 260 : 224,
        background: "#ffffff",
        borderRight: "1px solid #e5e7eb",
        display: "flex", flexDirection: "column",
        overflowY: "auto", flexShrink: 0,
        position: isMobile ? "fixed" : "relative",
        top: isMobile ? 0 : "auto", left: isMobile ? 0 : "auto", bottom: isMobile ? 0 : "auto",
        height: isMobile ? "100vh" : "auto",
        zIndex: isMobile ? 60 : "auto",
        transform: isMobile && !menuMobileAberto ? "translateX(-100%)" : "translateX(0)",
        transition: "transform 0.25s ease",
        boxShadow: isMobile ? "4px 0 16px rgba(0,0,0,0.1)" : "none",
      }}>
        {/* Header do módulo */}
        <div style={{ padding: 16, borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: `linear-gradient(135deg, ${COR} 0%, #f59e0b 100%)`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, boxShadow: `0 4px 10px ${COR}40`, flexShrink: 0,
          }}><span style={{ filter: "saturate(0) brightness(2)" }}>💵</span></div>
          <div style={{ minWidth: 0 }}>
            <span style={{ color: "#1f2937", fontWeight: 800, fontSize: 14, display: "block", letterSpacing: -0.3 }}>Financeiro</span>
            <span style={{ color: COR_TEXTO, fontSize: 10, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase" }}>Gestão completa</span>
          </div>
        </div>

        {/* Menus agrupados */}
        <div style={{ padding: 10, flex: 1 }}>
          {GRUPOS.map(g => {
            const aberto = grupoAberto === g.key;
            const temAtivo = g.itens.some(i => i.key === aba);
            return (
              <div key={g.key} style={{ marginBottom: 4 }}>
                <button onClick={() => setGrupoAberto(aberto ? null : g.key)}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%",
                    padding: "10px 12px", background: (aberto || temAtivo) ? COR_BG : "transparent",
                    border: "none", borderRadius: 10, cursor: "pointer",
                    color: (aberto || temAtivo) ? COR_TEXTO : "#374151",
                    fontSize: 13, fontWeight: (aberto || temAtivo) ? 700 : 600, textAlign: "left",
                    transition: "background .15s",
                  }}
                  onMouseEnter={e => { if (!aberto && !temAtivo) e.currentTarget.style.background = "#f3f4f6"; }}
                  onMouseLeave={e => { if (!aberto && !temAtivo) e.currentTarget.style.background = "transparent"; }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{
                      display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 26,
                      background: (aberto || temAtivo) ? COR : COR_BG, borderRadius: 7, fontSize: 13,
                      filter: (aberto || temAtivo) ? "saturate(0) brightness(2)" : "none",
                      boxShadow: (aberto || temAtivo) ? `0 2px 6px ${COR}40` : "none",
                    }}>{g.icon}</span>
                    {g.label}
                  </span>
                  <span style={{ fontSize: 9, color: (aberto || temAtivo) ? COR : "#9ca3af", transform: aberto ? "rotate(0)" : "rotate(-90deg)", transition: "transform .2s" }}>▼</span>
                </button>
                {aberto && (
                  <div style={{ paddingLeft: 8, marginTop: 2, marginBottom: 4, display: "flex", flexDirection: "column", gap: 2 }}>
                    {g.itens.map(sub => {
                      const sel = aba === sub.key;
                      return (
                        <button key={sub.key} onClick={() => selecionar(sub.key)}
                          style={{
                            display: "block", width: "100%", padding: "8px 12px 8px 34px",
                            background: sel ? `${COR}18` : "transparent", border: "none", borderRadius: 8, cursor: "pointer",
                            color: sel ? COR_TEXTO : "#6b7280", fontSize: 12, textAlign: "left",
                            fontWeight: sel ? 700 : 500, position: "relative", transition: "all .12s",
                          }}
                          onMouseEnter={e => { if (!sel) { e.currentTarget.style.background = "#f3f4f6"; e.currentTarget.style.color = "#1f2937"; } }}
                          onMouseLeave={e => { if (!sel) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#6b7280"; } }}>
                          {sel && <span style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", width: 4, height: 4, borderRadius: "50%", background: COR }} />}
                          {sub.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* CONTEÚDO */}
      <div style={{ flex: 1, overflowY: "auto", minWidth: 0, padding: isMobile ? "56px 12px 16px" : 28 }}>
        {aba === "dashboard"
          ? <DashboardSection />
          : <EmConstrucao titulo={LABELS[aba] || "Seção"} />}
      </div>
    </div>
  );
}

// Placeholder pras seções ainda não implementadas
function EmConstrucao({ titulo }: { titulo: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, minHeight: 360, textAlign: "center" }}>
      <div style={{
        width: 84, height: 84, borderRadius: 22,
        background: `linear-gradient(135deg, ${COR} 0%, #f59e0b 100%)`,
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40,
        boxShadow: `0 12px 24px ${COR}30`,
      }}><span style={{ filter: "saturate(0) brightness(2)" }}>🚧</span></div>
      <h2 style={{ color: "#1f2937", fontSize: 20, fontWeight: 800, margin: 0 }}>{titulo}</h2>
      <p style={{ color: "#6b7280", fontSize: 14, margin: 0, maxWidth: 360 }}>
        Esta seção faz parte do módulo Financeiro e será construída em seguida.
      </p>
      <span style={{ background: COR_BG, color: COR_TEXTO, border: `1px solid ${COR_BORDA}`, fontSize: 11, fontWeight: 700, padding: "5px 12px", borderRadius: 20 }}>Em construção</span>
    </div>
  );
}