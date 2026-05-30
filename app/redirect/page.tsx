"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";

// ═══════════════════════════════════════════════════════════════════════
// REDIRECT — Grupo Unita
// ═══════════════════════════════════════════════════════════════════════
// Tela de "boot" que decide pra onde mandar o usuário:
//   - Tem sessão Supabase ativa? → vai pro /crm
//   - Não tem? → vai pro /login
// Aparece em frações de segundo, então design precisa ser leve e elegante.
// ═══════════════════════════════════════════════════════════════════════

export default function RedirectPage() {
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        router.replace("/crm");
      } else {
        router.replace("/login");
      }
    })();
  }, [router]);

  return (
    <div style={{
      minHeight: "100vh",
      width: "100%",
      background: "linear-gradient(135deg, #f0f7ff 0%, #ffffff 50%, #eff6ff 100%)",
      position: "relative",
      overflow: "hidden",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'SF Pro Display', Roboto, sans-serif",
    }}>
      <style>{`
        @keyframes blobBoot1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(30px, -20px) scale(1.05); }
        }
        @keyframes blobBoot2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-30px, 30px) scale(1.05); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes glow {
          0%, 100% { box-shadow: 0 12px 30px rgba(37, 99, 235, 0.4), 0 0 60px rgba(37, 99, 235, 0.25), inset 0 1px 0 rgba(255,255,255,0.25); }
          50% { box-shadow: 0 12px 30px rgba(37, 99, 235, 0.5), 0 0 80px rgba(37, 99, 235, 0.4), inset 0 1px 0 rgba(255,255,255,0.25); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes dotPulse {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }
        .fade-in { animation: fadeIn 0.6s ease-out backwards; }
        .fade-in-d1 { animation: fadeIn 0.6s ease-out 0.15s backwards; }
        .fade-in-d2 { animation: fadeIn 0.6s ease-out 0.3s backwards; }
      `}</style>

      {/* Blobs suaves */}
      <div style={{
        position: "absolute", top: "-15%", right: "-10%",
        width: 600, height: 600,
        background: "radial-gradient(circle at center, rgba(59, 130, 246, 0.5) 0%, transparent 60%)",
        borderRadius: "50%", filter: "blur(70px)",
        animation: "blobBoot1 15s ease-in-out infinite",
        pointerEvents: "none",
      }} />
      <div style={{
        position: "absolute", bottom: "-15%", left: "-10%",
        width: 600, height: 600,
        background: "radial-gradient(circle at center, rgba(37, 99, 235, 0.45) 0%, transparent 60%)",
        borderRadius: "50%", filter: "blur(70px)",
        animation: "blobBoot2 18s ease-in-out infinite",
        pointerEvents: "none",
      }} />

      {/* CONTEÚDO CENTRAL */}
      <div style={{
        position: "relative",
        zIndex: 1,
        textAlign: "center",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}>
        {/* Logo mark gigante com glow */}
        <div className="fade-in" style={{
          width: 64, height: 64, borderRadius: 16,
          background: "linear-gradient(135deg, #1e40af 0%, #2563eb 50%, #3b82f6 100%)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#ffffff", fontWeight: 800, fontSize: 28, letterSpacing: -0.5,
          marginBottom: 28,
          animation: "glow 2s ease-in-out infinite",
        }}>
          U
        </div>

        {/* Nome da empresa */}
        <p className="fade-in-d1" style={{
          fontSize: 12,
          fontWeight: 700,
          color: "#0f172a",
          margin: "0 0 28px",
          letterSpacing: 3,
          textTransform: "uppercase",
        }}>
          Grupo Unita
        </p>

        {/* Spinner azul fino */}
        <div className="fade-in-d2" style={{
          width: 28, height: 28,
          border: "2.5px solid rgba(37, 99, 235, 0.15)",
          borderTopColor: "#2563eb",
          borderRadius: "50%",
          animation: "spin 0.7s linear infinite",
          marginBottom: 18,
        }} />

        {/* Texto de carregamento com bolinhas pulsando */}
        <div className="fade-in-d2" style={{
          display: "flex", alignItems: "center", gap: 4,
          fontSize: 13, color: "#64748b", fontWeight: 500, letterSpacing: 0.3,
        }}>
          <span>Carregando</span>
          <span style={{ display: "inline-flex", gap: 3, marginLeft: 2 }}>
            <span style={{
              width: 3, height: 3, borderRadius: "50%", background: "#64748b",
              animation: "dotPulse 1.4s ease-in-out infinite",
            }} />
            <span style={{
              width: 3, height: 3, borderRadius: "50%", background: "#64748b",
              animation: "dotPulse 1.4s ease-in-out 0.2s infinite",
            }} />
            <span style={{
              width: 3, height: 3, borderRadius: "50%", background: "#64748b",
              animation: "dotPulse 1.4s ease-in-out 0.4s infinite",
            }} />
          </span>
        </div>
      </div>
    </div>
  );
}