"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";

// ═══════════════════════════════════════════════════════════════════════
// AuthGuard — Grupo Unita
// ═══════════════════════════════════════════════════════════════════════
// Envolve rotas protegidas. Se não tiver sessão, manda pra /login.
// Versão simplificada (sem checagem de workspace/cadastro).
// ═══════════════════════════════════════════════════════════════════════

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [checando, setChecando] = useState(true);
  const [autenticado, setAutenticado] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace("/login");
        return;
      }
      setAutenticado(true);
      setChecando(false);
    })();

    // Escuta logout em outras abas / expiração de sessão
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) router.replace("/login");
    });
    return () => { sub.subscription.unsubscribe(); };
  }, [router]);

  if (checando) {
    return (
      <div style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #f0f7ff 0%, #ffffff 50%, #eff6ff 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}>
        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
          @keyframes glow {
            0%, 100% { box-shadow: 0 12px 30px rgba(37, 99, 235, 0.4), 0 0 60px rgba(37, 99, 235, 0.25); }
            50% { box-shadow: 0 12px 30px rgba(37, 99, 235, 0.5), 0 0 80px rgba(37, 99, 235, 0.35); }
          }
        `}</style>
        <div style={{ textAlign: "center" }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14,
            background: "linear-gradient(135deg, #1e40af 0%, #2563eb 50%, #3b82f6 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#ffffff", fontWeight: 800, fontSize: 24,
            margin: "0 auto 22px",
            animation: "glow 2s ease-in-out infinite",
          }}>U</div>
          <div style={{
            width: 24, height: 24,
            border: "2.5px solid rgba(37, 99, 235, 0.15)",
            borderTopColor: "#2563eb",
            borderRadius: "50%",
            margin: "0 auto",
            animation: "spin 0.7s linear infinite",
          }} />
        </div>
      </div>
    );
  }

  if (!autenticado) return null;
  return <>{children}</>;
}