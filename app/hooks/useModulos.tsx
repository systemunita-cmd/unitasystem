"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

// ═══════════════════════════════════════════════════════════════════════
// 🎁 useModulos — UnitaSystem (single-tenant)
// ═══════════════════════════════════════════════════════════════════════
// No Wolf esse hook lê quais módulos foram liberados por plano (cadastros).
// No Unita, é uso INTERNO — TUDO sempre liberado.
//
// Mantido pra compatibilidade com componentes do Wolf que importam isso.
// ═══════════════════════════════════════════════════════════════════════

export type Modulos = {
  roleta: boolean;
  disparos_web: boolean;
  disparos_api: boolean;
  voip: boolean;
  api_integracao: boolean;
  instagram: boolean;
  plano: string;
};

const TUDO_LIBERADO: Modulos = {
  roleta: true,
  disparos_web: true,
  disparos_api: true,
  voip: true,
  api_integracao: true,
  instagram: true,
  plano: "ultra",
};

export function useModulos() {
  const [modulos] = useState<Modulos>(TUDO_LIBERADO);
  const [carregado, setCarregado] = useState(false);

  useEffect(() => {
    // Setamos carregado=true direto, sem fetch (não tem tabela cadastros)
    setCarregado(true);
  }, []);

  return { modulos, carregado };
}

// ═══════════════════════════════════════════════════════════════════════
// 🔒 <ModuloBloqueado /> — mantido pra compat, mas no Unita nunca é usado
// ═══════════════════════════════════════════════════════════════════════

type ModuloKey = "roleta" | "disparos_web" | "disparos_api" | "voip" | "api_integracao" | "instagram";

export function ModuloBloqueado({ modulo }: { modulo: ModuloKey }) {
  const router = useRouter();
  return (
    <div style={{
      minHeight: "calc(100vh - 64px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 32, background: "#f8fafc",
    }}>
      <div style={{
        maxWidth: 480, width: "100%",
        background: "#ffffff",
        border: "1px solid #e5e7eb",
        borderRadius: 16,
        padding: 40,
        textAlign: "center",
        boxShadow: "0 8px 30px rgba(0,0,0,0.05)",
      }}>
        <div style={{
          width: 80, height: 80, margin: "0 auto 24px",
          borderRadius: "50%",
          background: "#eff6ff",
          border: "2px solid #bfdbfe",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 40,
        }}>🔒</div>
        <h1 style={{ color: "#1f2937", fontSize: 22, fontWeight: 700, margin: "0 0 12px" }}>
          Módulo indisponível
        </h1>
        <p style={{ color: "#6b7280", fontSize: 14, lineHeight: 1.6, margin: "0 0 28px" }}>
          O módulo <b>{modulo}</b> não está disponível no momento. Contate o administrador.
        </p>
        <button
          onClick={() => router.push("/crm/dashboard")}
          style={{
            background: "linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)",
            color: "white",
            border: "none",
            borderRadius: 10,
            padding: "12px 24px",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            boxShadow: "0 4px 12px rgba(37, 99, 235, 0.3)",
          }}
        >
          ← Voltar ao Dashboard
        </button>
      </div>
    </div>
  );
}