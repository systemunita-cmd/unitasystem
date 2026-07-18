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
    let montado = true;
    let bloqueandoInativo = false;

    const validarSessao = async (session: any) => {
      if (!session) {
        if (!bloqueandoInativo) router.replace("/login");
        return;
      }

      let perfil: { ativo?: boolean } | null = null;
      const porAuth = await supabase
        .from("usuarios")
        .select("ativo")
        .eq("auth_user_id", session.user.id)
        .maybeSingle();
      perfil = porAuth.data;

      // Compatibilidade com cadastros antigos que ainda não têm auth_user_id.
      if (!perfil && session.user.email) {
        const porEmail = await supabase
          .from("usuarios")
          .select("ativo")
          .ilike("email", session.user.email)
          .maybeSingle();
        perfil = porEmail.data;
      }

      if (perfil?.ativo === false) {
        bloqueandoInativo = true;
        if (montado) {
          setAutenticado(false);
          setChecando(true);
        }
        await supabase.auth.signOut();
        router.replace("/login?inativo=1");
        return;
      }

      if (montado) {
        setAutenticado(true);
        setChecando(false);
      }
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      void validarSessao(session);
    });

    // Escuta logout em outras abas, expiração de sessão e revalida o perfil.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      void validarSessao(session);
    });

    // Também derruba sessões que já estavam abertas quando o perfil foi inativado.
    const revalidacao = setInterval(() => {
      supabase.auth.getSession().then(({ data: { session } }) => void validarSessao(session));
    }, 30000);

    return () => {
      montado = false;
      clearInterval(revalidacao);
      sub.subscription.unsubscribe();
    };
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