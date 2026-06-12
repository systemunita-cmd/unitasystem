// Arquivo: app/crm/telefonia/page.tsx
// Rota: /crm/telefonia
// O componente ConexoesVoipSection fica em app/components/ConexoesVoipSection.tsx
"use client";
import ConexoesVoipSection from "../../components/ConexoesVoipSection";
import { useModulos, ModuloBloqueado } from "../../hooks/useModulos";
import { usePermissao } from "../../hooks/usePermissao";

export default function TelefoniaPage() {
  const { modulos, carregado } = useModulos();
  const { isDono, isSuperAdmin, permissoes } = usePermissao();

  // Loading enquanto carrega módulos
  if (!carregado) {
    return (
      <div style={{
        padding: 32, fontFamily: "Arial, sans-serif",
        display: "flex", alignItems: "center", justifyContent: "center",
        minHeight: "60vh",
      }}>
        <div style={{
          background: "#ffffff",
          border: "1px solid #e5e7eb",
          borderRadius: 14,
          boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
          padding: "20px 28px",
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <div style={{
            width: 18, height: 18, borderRadius: "50%",
            border: "3px solid #e5e7eb",
            borderTopColor: "#16a34a",
            animation: "wolf-spin 0.8s linear infinite",
          }} />
          <span style={{ color: "#6b7280", fontSize: 13, fontWeight: 600 }}>Carregando módulo de telefonia...</span>
          <style>{`@keyframes wolf-spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  // 🔒 Módulo VOIP bloqueado → tela de upsell
  if (!modulos.voip) return <ModuloBloqueado modulo="voip" />;

  // 🔒 PERMISSÃO voip_conexoes — gerenciar conexões VOIP é restrito
  if (!isDono && !isSuperAdmin && !permissoes.voip_conexoes) {
    return (
      <div style={{
        minHeight: "100vh", padding: 32, fontFamily: "Arial, sans-serif",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <div style={{
          background: "#ffffff",
          border: "1px solid #e5e7eb",
          borderRadius: 14,
          boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
          padding: 48, textAlign: "center", maxWidth: 480,
        }}>
          <div style={{
            width: 80, height: 80, borderRadius: 20,
            background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 40, margin: "0 auto 16px",
            boxShadow: "0 12px 24px rgba(239,68,68,0.25)",
          }}>
            <span style={{ filter: "saturate(0) brightness(2)" }}>🔒</span>
          </div>
          <h1 style={{ color: "#1f2937", fontSize: 18, fontWeight: 700, margin: "0 0 8px" }}>Acesso restrito</h1>
          <p style={{ color: "#6b7280", fontSize: 13, margin: 0, lineHeight: 1.5 }}>
            Você não tem permissão para gerenciar conexões VOIP. Entre em contato com o administrador do workspace.
          </p>
        </div>
      </div>
    );
  }

  return <ConexoesVoipSection />;
}