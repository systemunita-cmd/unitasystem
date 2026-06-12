"use client";
export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { useTemPermissao } from "../../hooks/useTemPermissao";
import { formatNum, carregarFaturasStatus } from "../../lib/cobranca_lib";

// ═══════════════════════════════════════════════════════════════════════════
// 💰 COBRANÇA (hub) — UnitaSystem
// Porta de entrada: Dashboard · Negociações · Atualizar planilha
// ═══════════════════════════════════════════════════════════════════════════

const card = { background: "#fff", borderRadius: 14, border: "1px solid #e5e7eb", boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)" };

export default function CobrancaHub() {
  const router = useRouter();
  const perm = useTemPermissao();
  const permitido = perm.carregando ? null : (perm.superAdmin || perm.escopo("cobranca.acessar") !== "none");

  const [isMobile, setIsMobile] = useState(false);
  const [contagem, setContagem] = useState<{ pagas: number; pendentes: number; inadimplentes: number } | null>(null);

  useEffect(() => {
    const ck = () => setIsMobile(window.innerWidth < 768);
    ck(); window.addEventListener("resize", ck);
    return () => window.removeEventListener("resize", ck);
  }, []);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      const rf = await carregarFaturasStatus();
      let pg = 0, pe = 0, ina = 0;
      for (const f of rf.statusMap.values()) {
        if (f.status === "paga" || f.status === "paga_atraso") pg++;
        else if (f.status === "pendente") pe++;
        else if (f.status === "atrasada") ina++;
      }
      setContagem({ pagas: pg, pendentes: pe, inadimplentes: ina });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (permitido === null) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh", color: "#6b7280" }}>Carregando...</div>;
  if (!permitido) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh", padding: 32 }}>
      <div style={{ ...card, padding: 48, textAlign: "center", maxWidth: 460 }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>🔒</div>
        <h1 style={{ color: "#1f2937", fontSize: 18, fontWeight: 700, margin: "0 0 8px" }}>Acesso restrito</h1>
        <p style={{ color: "#6b7280", fontSize: 13, margin: 0 }}>Você não tem permissão para ver a Cobrança.</p>
      </div>
    </div>
  );

  const PAGINAS = [
    {
      rota: "/crm/cobranca/dashboard", icone: "📊", titulo: "Dashboard",
      desc: "Quantas faturas estão pagas, pendentes e inadimplentes, com a evolução dos pagamentos mês a mês.",
      cor: "#2563eb", bg: "#eff6ff", bd: "#bfdbfe",
    },
    {
      rota: "/crm/cobranca/negociacoes", icone: "🤝", titulo: "Negociações",
      desc: "A operação de cobrança: faturas do CRM, status, disparos de WhatsApp, campanhas e atendimentos.",
      cor: "#7c3aed", bg: "#f5f3ff", bd: "#ddd6fe",
    },
    {
      rota: "/crm/cobranca/atualizacao", icone: "📤", titulo: "Atualizar planilha",
      desc: "Suba a planilha de status de pagamento — acha o cliente pela ordem de serviço e puxa o custcode sozinho.",
      cor: "#16a34a", bg: "#f0fdf4", bd: "#bbf7d0",
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 16 : 22 }}>

      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 48, height: 48, borderRadius: 14, background: "linear-gradient(135deg, #2563eb 0%, #3b82f6 50%, #4f46e5 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, boxShadow: "0 4px 12px rgba(37,99,235,0.3)" }}>💰</div>
        <div>
          <h1 style={{ color: "#1f2937", fontSize: isMobile ? 20 : 24, fontWeight: 800, margin: 0, letterSpacing: -0.3 }}>Cobrança</h1>
          <p style={{ color: "#6b7280", fontSize: 12, margin: "2px 0 0" }}>UnitaSystem · <b style={{ color: "#2563eb" }}>Grupo Unita</b></p>
        </div>
      </div>

      {/* contagem rápida */}
      {contagem && (contagem.pagas + contagem.pendentes + contagem.inadimplentes) > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: isMobile ? 10 : 14 }}>
          {([
            { l: "✅ Pagas", v: contagem.pagas, cor: "#16a34a" },
            { l: "⏳ Pendentes", v: contagem.pendentes, cor: "#d97706" },
            { l: "🔴 Inadimplentes", v: contagem.inadimplentes, cor: "#dc2626" },
          ]).map(c => (
            <div key={c.l} style={{ ...card, padding: isMobile ? 12 : 16, textAlign: "center" }}>
              <p style={{ color: c.cor, fontSize: isMobile ? 20 : 26, fontWeight: 800, margin: 0 }}>{formatNum(c.v)}</p>
              <p style={{ color: "#6b7280", fontSize: 11, margin: "2px 0 0", fontWeight: 600 }}>{c.l}</p>
            </div>
          ))}
        </div>
      )}

      {/* cards de navegação */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: isMobile ? 12 : 16 }}>
        {PAGINAS.map(p => (
          <button key={p.rota} onClick={() => router.push(p.rota)}
            style={{ ...card, padding: isMobile ? 18 : 24, cursor: "pointer", textAlign: "left", borderTop: `4px solid ${p.cor}`, display: "flex", flexDirection: "column", gap: 12, transition: "transform 0.12s, box-shadow 0.12s" }}
            onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 20px rgba(0,0,0,0.08)"; }}
            onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)"; }}>
            <div style={{ width: 52, height: 52, borderRadius: 14, background: p.bg, border: `1px solid ${p.bd}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26 }}>{p.icone}</div>
            <div>
              <h2 style={{ color: "#1f2937", fontSize: 16, fontWeight: 800, margin: "0 0 4px" }}>{p.titulo} <span style={{ color: p.cor }}>→</span></h2>
              <p style={{ color: "#6b7280", fontSize: 12.5, margin: 0, lineHeight: 1.5 }}>{p.desc}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}