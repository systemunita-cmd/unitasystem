"use client";
import { useState } from "react";

// ═══════════════════════════════════════════════════════════════════════
// 🧑‍💼 RH · Configurações
// ───────────────────────────────────────────────────────────────────────
// Parâmetros gerais do módulo: jornada, folha, férias/avisos e benefícios
// padrão. Estado local (MOCK). Em produção, salvar em 'rh_config'.
// ═══════════════════════════════════════════════════════════════════════

const COR = "#4f46e5";
const COR_TEXTO = "#4338ca";
const card = { background: "#ffffff", borderRadius: 14, border: "1px solid #e5e7eb", boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)" };
const inputStyle = { width: "100%", background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 14px", color: "#1f2937", fontSize: 13, boxSizing: "border-box" as const, outline: "none" };

export function ConfigSection() {
  const [cfg, setCfg] = useState({
    cargaSemanal: 44,
    diasUteis: 22,
    diaPagamento: 5,
    diaAdiantamento: 20,
    avisoFeriasDias: 60,
    avisoDocsDias: 30,
    vtPadrao: true,
    vrPadrao: true,
    planoSaudePadrao: false,
    bancoHoras: true,
  });
  const [salvo, setSalvo] = useState(false);

  const set = (k: keyof typeof cfg, v: any) => { setCfg(c => ({ ...c, [k]: v })); setSalvo(false); };
  const salvar = () => { setSalvo(true); /* 🔌 Supabase: upsert em 'rh_config' */ };

  const Toggle = ({ on, onClick }: { on: boolean; onClick: () => void }) => (
    <button onClick={onClick} style={{ width: 46, height: 26, borderRadius: 13, border: "none", cursor: "pointer", background: on ? COR : "#cbd5e1", position: "relative", transition: "background .2s", flexShrink: 0 }}>
      <span style={{ position: "absolute", top: 3, left: on ? 23 : 3, width: 20, height: 20, borderRadius: "50%", background: "white", transition: "left .2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
    </button>
  );

  const Linha = ({ titulo, desc, children }: { titulo: string; desc: string; children: React.ReactNode }) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "14px 0", borderBottom: "1px solid #f3f4f6" }}>
      <div style={{ minWidth: 0 }}>
        <p style={{ color: "#1f2937", fontSize: 13, fontWeight: 700, margin: 0 }}>{titulo}</p>
        <p style={{ color: "#9ca3af", fontSize: 11, margin: "2px 0 0" }}>{desc}</p>
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );

  const numInput = (k: keyof typeof cfg, suf?: string) => (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <input type="number" value={(cfg[k] as number) || ""} onChange={e => set(k, Number(e.target.value))} style={{ ...inputStyle, width: 80, textAlign: "center", padding: "8px 10px" }} />
      {suf && <span style={{ color: "#9ca3af", fontSize: 12 }}>{suf}</span>}
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 760 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: `linear-gradient(135deg, ${COR} 0%, #6366f1 100%)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, boxShadow: `0 8px 20px ${COR}30` }}><span style={{ filter: "saturate(0) brightness(2)" }}>⚙️</span></div>
          <div>
            <h1 style={{ color: "#1f2937", fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: -0.3 }}>Configurações do RH</h1>
            <p style={{ color: "#6b7280", fontSize: 12, margin: "2px 0 0" }}>Parâmetros gerais do módulo</p>
          </div>
        </div>
        <button onClick={salvar} style={{ background: salvo ? "#16a34a" : `linear-gradient(135deg, ${COR} 0%, #6366f1 100%)`, color: "white", border: "none", borderRadius: 12, padding: "11px 22px", fontSize: 13, cursor: "pointer", fontWeight: 700, boxShadow: `0 4px 12px ${COR}30`, whiteSpace: "nowrap" }}>{salvo ? "✓ Salvo" : "💾 Salvar"}</button>
      </div>

      <div style={{ ...card, padding: "8px 22px 16px" }}>
        <h3 style={{ color: COR_TEXTO, fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, margin: "16px 0 4px" }}>⏰ Jornada</h3>
        <Linha titulo="Carga horária semanal" desc="Horas trabalhadas por semana">{numInput("cargaSemanal", "h")}</Linha>
        <Linha titulo="Dias úteis no mês" desc="Base para cálculo de VT/VR">{numInput("diasUteis", "dias")}</Linha>
        <Linha titulo="Banco de horas" desc="Permite acúmulo e compensação de horas"><Toggle on={cfg.bancoHoras} onClick={() => set("bancoHoras", !cfg.bancoHoras)} /></Linha>
      </div>

      <div style={{ ...card, padding: "8px 22px 16px" }}>
        <h3 style={{ color: COR_TEXTO, fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, margin: "16px 0 4px" }}>💰 Folha</h3>
        <Linha titulo="Dia de pagamento" desc="Dia do mês para o salário">{numInput("diaPagamento")}</Linha>
        <Linha titulo="Dia do adiantamento" desc="Dia do mês para o vale">{numInput("diaAdiantamento")}</Linha>
      </div>

      <div style={{ ...card, padding: "8px 22px 16px" }}>
        <h3 style={{ color: COR_TEXTO, fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, margin: "16px 0 4px" }}>🔔 Avisos</h3>
        <Linha titulo="Aviso de férias a vencer" desc="Dias de antecedência para alertar">{numInput("avisoFeriasDias", "dias")}</Linha>
        <Linha titulo="Aviso de documentos" desc="Alerta de validade próxima">{numInput("avisoDocsDias", "dias")}</Linha>
      </div>

      <div style={{ ...card, padding: "8px 22px 16px" }}>
        <h3 style={{ color: COR_TEXTO, fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, margin: "16px 0 4px" }}>🎁 Benefícios padrão</h3>
        <Linha titulo="Vale Transporte" desc="Oferecer por padrão a novos colaboradores"><Toggle on={cfg.vtPadrao} onClick={() => set("vtPadrao", !cfg.vtPadrao)} /></Linha>
        <Linha titulo="Vale Refeição / Alimentação" desc="Oferecer por padrão"><Toggle on={cfg.vrPadrao} onClick={() => set("vrPadrao", !cfg.vrPadrao)} /></Linha>
        <Linha titulo="Plano de Saúde" desc="Adesão automática na admissão"><Toggle on={cfg.planoSaudePadrao} onClick={() => set("planoSaudePadrao", !cfg.planoSaudePadrao)} /></Linha>
      </div>

      <p style={{ color: "#9ca3af", fontSize: 11, margin: 0, textAlign: "center", fontStyle: "italic" }}>Configuração de exemplo — salve em <b>rh_config</b> no Supabase pra persistir.</p>
    </div>
  );
}