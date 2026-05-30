"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

// ═══════════════════════════════════════════════════════════════════════
// NOVA SENHA — Grupo Unita
// ═══════════════════════════════════════════════════════════════════════
// Página que o usuário cai depois de clicar no link de "Esqueci a senha"
// recebido por e-mail. Mesma identidade visual do /login.
//
// Upgrades de UX em relação ao Wolf System:
// - Mostrar/ocultar senha em ambos os campos
// - Indicadores em tempo real (mín. 8 chars + senhas coincidem)
// - Sem alert() — usa tela de sucesso animada antes do redirect
// - Botão desabilita até tudo estar válido
// ═══════════════════════════════════════════════════════════════════════

export default function NovaSenha() {
  const router = useRouter();
  const [senha, setSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [showSenha, setShowSenha] = useState(false);
  const [showConfirmar, setShowConfirmar] = useState(false);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState(false);

  // Validações em tempo real
  const senhaForte = senha.length >= 8;
  const senhasCoincidem = senha.length > 0 && senha === confirmar;
  const tudoValido = senhaForte && senhasCoincidem;

  const [hora, setHora] = useState<string>("");
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setHora(d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }));
    };
    tick();
    const i = setInterval(tick, 30000);
    return () => clearInterval(i);
  }, []);

  const handleSalvar = async () => {
    setErro("");
    if (!senhaForte) { setErro("A senha precisa ter pelo menos 8 caracteres"); return; }
    if (!senhasCoincidem) { setErro("As senhas não coincidem"); return; }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    setLoading(false);

    if (error) {
      setErro("Erro ao atualizar senha. O link pode ter expirado.");
      return;
    }

    // Tela de sucesso animada → redireciona após 2s
    setSucesso(true);
    setTimeout(() => router.push("/login"), 2200);
  };

  return (
    <div style={{
      minHeight: "100vh",
      width: "100%",
      background: "linear-gradient(135deg, #f0f7ff 0%, #ffffff 50%, #eff6ff 100%)",
      position: "relative",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'SF Pro Display', Roboto, sans-serif",
    }}>
      <style>{`
        @keyframes blob1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(50px, -40px) scale(1.1); }
        }
        @keyframes blob2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-60px, 50px) scale(1.05); }
        }
        @keyframes blob3 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(40px, 60px) scale(0.92); }
        }
        @keyframes pulseDot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.4); }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes glow {
          0%, 100% { box-shadow: 0 12px 30px rgba(37, 99, 235, 0.4), 0 0 60px rgba(37, 99, 235, 0.25), inset 0 1px 0 rgba(255,255,255,0.25); }
          50% { box-shadow: 0 12px 30px rgba(37, 99, 235, 0.5), 0 0 80px rgba(37, 99, 235, 0.35), inset 0 1px 0 rgba(255,255,255,0.25); }
        }
        @keyframes successPop {
          0% { transform: scale(0); opacity: 0; }
          60% { transform: scale(1.15); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes checkDraw {
          to { stroke-dashoffset: 0; }
        }
        .fade-up { animation: fadeUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) backwards; }
        .fade-up-d1 { animation: fadeUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.1s backwards; }
        .fade-up-d2 { animation: fadeUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.2s backwards; }
        .fade-up-d3 { animation: fadeUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.3s backwards; }
        .fade-up-d4 { animation: fadeUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.4s backwards; }

        .blue-input {
          width: 100%;
          box-sizing: border-box;
          background: #ffffff;
          border: 1.5px solid #e2e8f0;
          border-radius: 12px;
          padding: 14px 16px;
          font-size: 15px;
          color: #0f172a;
          outline: none;
          transition: all 0.2s ease;
          font-family: inherit;
          font-weight: 500;
        }
        .blue-input::placeholder { color: #94a3b8; font-weight: 400; }
        .blue-input:hover { border-color: #cbd5e1; }
        .blue-input:focus {
          border-color: #2563eb !important;
          box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.12), 0 4px 12px rgba(37, 99, 235, 0.08) !important;
        }

        .blue-btn {
          position: relative;
          width: 100%;
          background: linear-gradient(135deg, #1e40af 0%, #2563eb 50%, #3b82f6 100%);
          background-size: 200% 100%;
          color: #ffffff;
          border: none;
          border-radius: 12px;
          padding: 16px 20px;
          font-size: 15px;
          font-weight: 700;
          letter-spacing: 0.3px;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          box-shadow:
            0 1px 2px rgba(37, 99, 235, 0.1),
            0 8px 20px rgba(37, 99, 235, 0.3),
            0 0 0 1px rgba(37, 99, 235, 0.2),
            inset 0 1px 0 rgba(255, 255, 255, 0.25);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          font-family: inherit;
          overflow: hidden;
        }
        .blue-btn::after {
          content: "";
          position: absolute;
          top: 0; left: -100%;
          width: 100%; height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent);
          transition: left 0.6s ease;
        }
        .blue-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          background-position: 100% 0;
          box-shadow:
            0 4px 8px rgba(37, 99, 235, 0.15),
            0 16px 36px rgba(37, 99, 235, 0.4),
            0 0 0 1px rgba(37, 99, 235, 0.3),
            inset 0 1px 0 rgba(255, 255, 255, 0.3);
        }
        .blue-btn:hover:not(:disabled)::after { left: 100%; }
        .blue-btn:disabled { opacity: 0.45; cursor: not-allowed; }

        .pass-toggle {
          position: absolute;
          right: 14px; top: 50%;
          transform: translateY(-50%);
          background: none; border: none;
          cursor: pointer; padding: 6px;
          color: #94a3b8;
          transition: color 0.15s;
          display: flex; align-items: center; justify-content: center;
        }
        .pass-toggle:hover { color: #2563eb; }

        @media (max-width: 640px) {
          .editorial-headline { font-size: 38px !important; }
        }
      `}</style>

      {/* Blobs azuis */}
      <div style={{
        position: "absolute", top: "-15%", right: "-10%",
        width: 750, height: 750,
        background: "radial-gradient(circle at center, rgba(59, 130, 246, 0.55) 0%, transparent 60%)",
        borderRadius: "50%", filter: "blur(70px)",
        animation: "blob1 20s ease-in-out infinite",
        pointerEvents: "none",
      }} />
      <div style={{
        position: "absolute", bottom: "-20%", left: "-10%",
        width: 750, height: 750,
        background: "radial-gradient(circle at center, rgba(37, 99, 235, 0.5) 0%, transparent 60%)",
        borderRadius: "50%", filter: "blur(80px)",
        animation: "blob2 24s ease-in-out infinite",
        pointerEvents: "none",
      }} />
      <div style={{
        position: "absolute", top: "30%", left: "55%",
        width: 550, height: 550,
        background: "radial-gradient(circle at center, rgba(99, 102, 241, 0.4) 0%, transparent 60%)",
        borderRadius: "50%", filter: "blur(90px)",
        animation: "blob3 27s ease-in-out infinite",
        pointerEvents: "none",
      }} />

      {/* Grade */}
      <div style={{
        position: "absolute", inset: 0,
        backgroundImage: `
          linear-gradient(rgba(37, 99, 235, 0.04) 1px, transparent 1px),
          linear-gradient(90deg, rgba(37, 99, 235, 0.04) 1px, transparent 1px)
        `,
        backgroundSize: "60px 60px",
        pointerEvents: "none",
      }} />

      {/* TOP BAR */}
      <div className="fade-up" style={{
        position: "relative", zIndex: 2,
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "28px 40px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 42, height: 42, borderRadius: 12,
            background: "linear-gradient(135deg, #1e40af 0%, #2563eb 50%, #3b82f6 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#ffffff", fontWeight: 800, fontSize: 19, letterSpacing: -0.5,
            boxShadow: "0 6px 16px rgba(37, 99, 235, 0.4), 0 0 0 1px rgba(37, 99, 235, 0.2), inset 0 1px 0 rgba(255,255,255,0.25)",
            animation: "glow 3s ease-in-out infinite",
          }}>U</div>
          <span style={{
            fontSize: 13, fontWeight: 700,
            color: "#0f172a", letterSpacing: 3, textTransform: "uppercase",
          }}>Grupo Unita</span>
        </div>

        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          background: "rgba(255, 255, 255, 0.85)",
          backdropFilter: "blur(10px)",
          border: "1px solid rgba(37, 99, 235, 0.15)",
          borderRadius: 100, padding: "7px 14px 7px 12px",
          boxShadow: "0 4px 12px rgba(37, 99, 235, 0.08)",
        }}>
          <span style={{
            width: 7, height: 7, borderRadius: "50%",
            background: "#10b981",
            boxShadow: "0 0 8px rgba(16, 185, 129, 0.7)",
            animation: "pulseDot 2s ease-in-out infinite",
          }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: "#1e40af", letterSpacing: 0.3 }}>
            Sistema online
          </span>
          {hora && (
            <>
              <span style={{ color: "#cbd5e1", fontSize: 10 }}>•</span>
              <span style={{ fontSize: 12, fontWeight: 500, color: "#64748b", fontFamily: "'SF Mono', monospace" }}>
                {hora}
              </span>
            </>
          )}
        </div>
      </div>

      {/* CARD CENTRAL */}
      <div style={{
        flex: 1, position: "relative", zIndex: 1,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "20px 24px 40px",
      }}>
        <div className="fade-up-d1" style={{
          width: "100%", maxWidth: 460,
          background: "rgba(255, 255, 255, 0.75)",
          backdropFilter: "blur(24px) saturate(180%)",
          WebkitBackdropFilter: "blur(24px) saturate(180%)",
          border: "1px solid rgba(255, 255, 255, 0.8)",
          borderRadius: 24,
          padding: "44px 40px 38px",
          boxShadow: `
            0 30px 80px -10px rgba(37, 99, 235, 0.2),
            0 0 60px rgba(37, 99, 235, 0.08),
            0 0 0 1px rgba(37, 99, 235, 0.06),
            inset 0 1px 0 rgba(255, 255, 255, 0.95)
          `,
          position: "relative",
        }}>
          {/* Linha azul no topo */}
          <div style={{
            position: "absolute", top: 0, left: "15%", right: "15%",
            height: 1.5,
            background: "linear-gradient(90deg, transparent, #3b82f6, transparent)",
          }} />

          {sucesso ? (
            // ━━━ TELA DE SUCESSO ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <div style={{
                width: 80, height: 80,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #10b981 0%, #34d399 100%)",
                margin: "0 auto 24px",
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "0 12px 30px rgba(16, 185, 129, 0.4), 0 0 0 8px rgba(16, 185, 129, 0.1)",
                animation: "successPop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)",
              }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline
                    points="20 6 9 17 4 12"
                    style={{
                      strokeDasharray: 30,
                      strokeDashoffset: 30,
                      animation: "checkDraw 0.5s 0.4s ease-out forwards",
                    }}
                  />
                </svg>
              </div>
              <h1 style={{
                fontSize: 28, fontWeight: 800,
                color: "#0f172a", margin: "0 0 10px",
                letterSpacing: -0.8,
              }}>Senha atualizada!</h1>
              <p style={{ fontSize: 14.5, color: "#64748b", margin: 0, lineHeight: 1.5 }}>
                Redirecionando para o login...
              </p>
            </div>
          ) : (
            <>
              {/* HEADLINE */}
              <div style={{ marginBottom: 32 }}>
                <p className="fade-up-d2" style={{
                  fontSize: 11, fontWeight: 700,
                  color: "#2563eb", margin: "0 0 14px",
                  letterSpacing: 2.5, textTransform: "uppercase",
                }}>● Redefinir senha</p>
                <h1 className="fade-up-d2 editorial-headline" style={{
                  fontSize: 44, fontWeight: 800,
                  margin: "0 0 14px",
                  letterSpacing: -1.5, lineHeight: 1.05,
                  background: "linear-gradient(135deg, #1e40af 0%, #2563eb 50%, #3b82f6 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}>Nova senha.</h1>
                <p className="fade-up-d3" style={{
                  fontSize: 15, color: "#64748b",
                  margin: 0, lineHeight: 1.5, fontWeight: 400,
                }}>
                  Escolha uma senha forte. Você usará ela pra entrar de agora em diante.
                </p>
              </div>

              {/* ALERTA DE ERRO */}
              {erro && (
                <div className="fade-up" style={{
                  background: "#fef2f2",
                  border: "1px solid #fecaca",
                  borderRadius: 12,
                  padding: "12px 14px",
                  marginBottom: 20,
                  display: "flex", alignItems: "center", gap: 10,
                }}>
                  <span style={{ fontSize: 14, color: "#dc2626" }}>⚠</span>
                  <p style={{ color: "#991b1b", fontSize: 13.5, margin: 0, fontWeight: 500 }}>{erro}</p>
                </div>
              )}

              {/* FORM */}
              <div className="fade-up-d3" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                {/* Nova senha */}
                <div>
                  <label style={{
                    display: "block", fontSize: 12, fontWeight: 700,
                    color: "#334155", marginBottom: 8, letterSpacing: 0.3,
                  }}>Nova senha</label>
                  <div style={{ position: "relative" }}>
                    <input
                      type={showSenha ? "text" : "password"}
                      placeholder="••••••••"
                      value={senha}
                      onChange={(e) => setSenha(e.target.value)}
                      className="blue-input"
                      style={{ paddingRight: 44, letterSpacing: showSenha ? "normal" : 3 }}
                      autoComplete="new-password"
                    />
                    <button
                      onClick={() => setShowSenha(!showSenha)}
                      type="button" className="pass-toggle"
                      title={showSenha ? "Ocultar" : "Mostrar"}
                    >
                      {showSenha ? (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/>
                          <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/>
                          <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/>
                          <line x1="2" y1="2" x2="22" y2="22"/>
                        </svg>
                      ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/>
                          <circle cx="12" cy="12" r="3"/>
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                {/* Confirmar senha */}
                <div>
                  <label style={{
                    display: "block", fontSize: 12, fontWeight: 700,
                    color: "#334155", marginBottom: 8, letterSpacing: 0.3,
                  }}>Confirmar nova senha</label>
                  <div style={{ position: "relative" }}>
                    <input
                      type={showConfirmar ? "text" : "password"}
                      placeholder="••••••••"
                      value={confirmar}
                      onChange={(e) => setConfirmar(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && tudoValido && handleSalvar()}
                      className="blue-input"
                      style={{ paddingRight: 44, letterSpacing: showConfirmar ? "normal" : 3 }}
                      autoComplete="new-password"
                    />
                    <button
                      onClick={() => setShowConfirmar(!showConfirmar)}
                      type="button" className="pass-toggle"
                      title={showConfirmar ? "Ocultar" : "Mostrar"}
                    >
                      {showConfirmar ? (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/>
                          <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/>
                          <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/>
                          <line x1="2" y1="2" x2="22" y2="22"/>
                        </svg>
                      ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/>
                          <circle cx="12" cy="12" r="3"/>
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                {/* Indicadores em tempo real */}
                <div style={{
                  background: "rgba(241, 245, 249, 0.6)",
                  border: "1px solid rgba(226, 232, 240, 0.8)",
                  borderRadius: 12,
                  padding: "12px 14px",
                  display: "flex", flexDirection: "column", gap: 8,
                }}>
                  <ValidationItem ok={senhaForte} text="Pelo menos 8 caracteres" />
                  <ValidationItem ok={senhasCoincidem} text="As senhas coincidem" />
                </div>
              </div>

              <button
                onClick={handleSalvar}
                disabled={loading || !tudoValido}
                className="blue-btn fade-up-d4"
                style={{ marginTop: 22 }}
              >
                {loading ? (
                  <>
                    <span style={{
                      width: 15, height: 15,
                      border: "2px solid rgba(255,255,255,0.3)",
                      borderTopColor: "#ffffff", borderRadius: "50%",
                      animation: "spin 0.7s linear infinite",
                    }} />
                    Salvando...
                  </>
                ) : (
                  <>Salvar nova senha <span style={{ fontSize: 17, fontWeight: 400 }}>→</span></>
                )}
              </button>

              <p className="fade-up-d4" style={{
                textAlign: "center", fontSize: 12.5,
                color: "#64748b", marginTop: 20, lineHeight: 1.5,
              }}>
                Depois de salvar, você será redirecionado pro login.
              </p>
            </>
          )}
        </div>
      </div>

      {/* FOOTER */}
      <div style={{
        position: "relative", zIndex: 2,
        padding: "24px 40px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        fontSize: 11.5, color: "#64748b", letterSpacing: 0.3,
      }}>
        <span>© {new Date().getFullYear()} <span style={{ color: "#1e40af", fontWeight: 600 }}>Grupo Unita</span></span>
        <span style={{ fontFamily: "'SF Mono', monospace", fontWeight: 500 }}>
          Sistema Interno · v2.0
        </span>
      </div>
    </div>
  );
}

// ─── Componente auxiliar: item de validação com check animado ──────────
function ValidationItem({ ok, text }: { ok: boolean; text: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      transition: "color 0.2s",
    }}>
      <span style={{
        width: 18, height: 18,
        borderRadius: "50%",
        background: ok ? "#10b981" : "#e2e8f0",
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "background 0.3s ease",
        boxShadow: ok ? "0 0 0 4px rgba(16, 185, 129, 0.15)" : "none",
      }}>
        {ok ? (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#94a3b8" }} />
        )}
      </span>
      <span style={{
        fontSize: 13,
        color: ok ? "#065f46" : "#64748b",
        fontWeight: ok ? 600 : 500,
        transition: "color 0.2s",
      }}>{text}</span>
    </div>
  );
}