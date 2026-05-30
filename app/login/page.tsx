"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";

// ═══════════════════════════════════════════════════════════════════════
// LOGIN — Grupo Unita — "Blue Premium Light"
// ═══════════════════════════════════════════════════════════════════════
// - Fundo claro com mesh gradient AZUL vibrante por toda a tela
// - Card branco translúcido (glassmorphism light) com sombra azul
// - Headline com texto em gradiente azul
// - Botão azul sólido com glow
// - Logo mark com gradiente azul + brilho
// - Badges e detalhes em azul
// ═══════════════════════════════════════════════════════════════════════

type Step = "credenciais" | "otp";

export default function Login() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("credenciais");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [otpDigits, setOtpDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const otpRefs = useRef<Array<HTMLInputElement | null>>([]);

  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  const [info, setInfo] = useState("");

  const [reenvioCooldown, setReenvioCooldown] = useState(0);
  useEffect(() => {
    if (reenvioCooldown <= 0) return;
    const t = setTimeout(() => setReenvioCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [reenvioCooldown]);

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

  // ─── HANDLERS (lógica idêntica) ────────────────────────────────────────

  const handleLogin = async () => {
    if (!email || !password) { setErro("Preencha e-mail e senha!"); return; }
    setLoading(true); setErro(""); setInfo("");
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      const msg = error.message?.toLowerCase() || "";
      const code = (error as any).code || "";
      if (msg.includes("not confirmed") || msg.includes("confirm") || code === "email_not_confirmed") {
        await enviarOtp();
        return;
      }
      setLoading(false);
      setErro("E-mail ou senha incorretos");
      return;
    }
    setLoading(false);
    if (data.user) router.push("/crm");
  };

  const enviarOtp = async () => {
    setLoading(true); setErro("");
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
    setLoading(false);
    if (error) { setErro("Erro ao enviar código. Confirme se o e-mail está cadastrado."); return; }
    setStep("otp");
    setInfo("Enviamos um código de 6 dígitos. Confira também o spam.");
    setReenvioCooldown(60);
    setTimeout(() => otpRefs.current[0]?.focus(), 250);
  };

  const verificarCodigo = async (codigo: string) => {
    setLoading(true); setErro("");
    const { data, error } = await supabase.auth.verifyOtp({ email, token: codigo, type: "email" });
    setLoading(false);
    if (error) {
      setErro("Código inválido ou expirado");
      setOtpDigits(["", "", "", "", "", ""]);
      otpRefs.current[0]?.focus();
      return;
    }
    if (data.session) router.push("/crm");
  };

  const handleVerifyOtp = () => {
    const c = otpDigits.join("");
    if (c.length !== 6) { setErro("Digite o código completo"); return; }
    verificarCodigo(c);
  };

  const handleReenviar = async () => {
    if (reenvioCooldown > 0) return;
    setOtpDigits(["", "", "", "", "", ""]);
    await enviarOtp();
  };

  const handleVoltar = () => {
    setStep("credenciais");
    setOtpDigits(["", "", "", "", "", ""]);
    setErro(""); setInfo("");
  };

  const handleEsqueciSenha = async () => {
    if (!email) { setErro("Digite seu e-mail primeiro"); return; }
    setErro("");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login/nova-senha`,
    });
    if (error) setErro("Erro ao enviar e-mail");
    else setInfo("✓ E-mail de redefinição enviado");
  };

  const handleOtpChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    const novos = [...otpDigits];
    novos[index] = digit;
    setOtpDigits(novos);
    if (digit && index < 5) otpRefs.current[index + 1]?.focus();
    if (digit && index === 5 && novos.every(d => d.length === 1)) {
      setTimeout(() => verificarCodigo(novos.join("")), 150);
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !otpDigits[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const colado = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (colado.length === 6) {
      setOtpDigits(colado.split(""));
      otpRefs.current[5]?.focus();
      setTimeout(() => verificarCodigo(colado), 150);
    }
  };

  // ─── RENDER ────────────────────────────────────────────────────────────

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

        .otp-cell {
          width: 56px;
          height: 64px;
          text-align: center;
          font-size: 28px;
          font-weight: 700;
          color: #0f172a;
          background: #ffffff;
          border: 1.5px solid #e2e8f0;
          border-radius: 14px;
          outline: none;
          transition: all 0.2s ease;
          font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
        }
        .otp-cell:hover { border-color: #cbd5e1; }
        .otp-cell:focus {
          border-color: #2563eb !important;
          box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.15), 0 10px 25px rgba(37, 99, 235, 0.18) !important;
          transform: translateY(-3px);
        }
        .otp-cell.filled {
          border-color: #2563eb;
          background: #eff6ff;
          color: #1e40af;
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
        .blue-btn:active:not(:disabled) { transform: translateY(-1px); }
        .blue-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        .ghost-link {
          background: none;
          border: none;
          color: #2563eb;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          padding: 0;
          transition: color 0.15s;
          font-family: inherit;
        }
        .ghost-link:hover { color: #1d4ed8; }
        .ghost-link:disabled { color: #cbd5e1; cursor: not-allowed; }

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

      {/* ═════════════════════════════════════════════════════════════════
          BACKGROUND — Blue mesh gradients (vibrantes!)
          ═════════════════════════════════════════════════════════════════ */}
      <div style={{
        position: "absolute",
        top: "-15%", right: "-10%",
        width: 750, height: 750,
        background: "radial-gradient(circle at center, rgba(59, 130, 246, 0.55) 0%, transparent 60%)",
        borderRadius: "50%",
        filter: "blur(70px)",
        animation: "blob1 20s ease-in-out infinite",
        pointerEvents: "none",
      }} />
      <div style={{
        position: "absolute",
        bottom: "-20%", left: "-10%",
        width: 750, height: 750,
        background: "radial-gradient(circle at center, rgba(37, 99, 235, 0.5) 0%, transparent 60%)",
        borderRadius: "50%",
        filter: "blur(80px)",
        animation: "blob2 24s ease-in-out infinite",
        pointerEvents: "none",
      }} />
      <div style={{
        position: "absolute",
        top: "30%", left: "55%",
        width: 550, height: 550,
        background: "radial-gradient(circle at center, rgba(99, 102, 241, 0.4) 0%, transparent 60%)",
        borderRadius: "50%",
        filter: "blur(90px)",
        animation: "blob3 27s ease-in-out infinite",
        pointerEvents: "none",
      }} />

      {/* Grade fininha em azul claro */}
      <div style={{
        position: "absolute",
        inset: 0,
        backgroundImage: `
          linear-gradient(rgba(37, 99, 235, 0.04) 1px, transparent 1px),
          linear-gradient(90deg, rgba(37, 99, 235, 0.04) 1px, transparent 1px)
        `,
        backgroundSize: "60px 60px",
        pointerEvents: "none",
      }} />

      {/* ═════════════════════════════════════════════════════════════════
          TOP BAR
          ═════════════════════════════════════════════════════════════════ */}
      <div className="fade-up" style={{
        position: "relative", zIndex: 2,
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "28px 40px",
      }}>
        {/* Logo mark + wordmark */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 42,
            height: 42,
            borderRadius: 12,
            background: "linear-gradient(135deg, #1e40af 0%, #2563eb 50%, #3b82f6 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#ffffff",
            fontWeight: 800,
            fontSize: 19,
            letterSpacing: -0.5,
            boxShadow: "0 6px 16px rgba(37, 99, 235, 0.4), 0 0 0 1px rgba(37, 99, 235, 0.2), inset 0 1px 0 rgba(255,255,255,0.25)",
            animation: "glow 3s ease-in-out infinite",
          }}>
            U
          </div>
          <span style={{
            fontSize: 13,
            fontWeight: 700,
            color: "#0f172a",
            letterSpacing: 3,
            textTransform: "uppercase",
          }}>
            Grupo Unita
          </span>
        </div>

        {/* Badge "Sistema online" */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          background: "rgba(255, 255, 255, 0.85)",
          backdropFilter: "blur(10px)",
          border: "1px solid rgba(37, 99, 235, 0.15)",
          borderRadius: 100,
          padding: "7px 14px 7px 12px",
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

      {/* ═════════════════════════════════════════════════════════════════
          CONTEÚDO CENTRAL — Card glass branco com sombra azul
          ═════════════════════════════════════════════════════════════════ */}
      <div style={{
        flex: 1,
        position: "relative",
        zIndex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px 24px 40px",
      }}>
        <div className="fade-up-d1" style={{
          width: "100%",
          maxWidth: 460,
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
          {/* Linha azul no topo do card */}
          <div style={{
            position: "absolute",
            top: 0, left: "15%", right: "15%",
            height: 1.5,
            background: "linear-gradient(90deg, transparent, #3b82f6, transparent)",
          }} />

          {/* HEADLINE editorial */}
          <div style={{ marginBottom: 32 }}>
            <p className="fade-up-d2" style={{
              fontSize: 11,
              fontWeight: 700,
              color: "#2563eb",
              margin: "0 0 14px",
              letterSpacing: 2.5,
              textTransform: "uppercase",
            }}>
              {step === "credenciais" ? "● Acesso ao sistema" : "● Verificação"}
            </p>
            <h1 className="fade-up-d2 editorial-headline" style={{
              fontSize: 44,
              fontWeight: 800,
              margin: "0 0 14px",
              letterSpacing: -1.5,
              lineHeight: 1.05,
              background: "linear-gradient(135deg, #1e40af 0%, #2563eb 50%, #3b82f6 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}>
              {step === "credenciais" ? (
                <>Bem-vindo<br />de volta.</>
              ) : (
                <>Verifique<br />seu e-mail.</>
              )}
            </h1>
            <p className="fade-up-d3" style={{
              fontSize: 15,
              color: "#64748b",
              margin: 0,
              lineHeight: 1.5,
              fontWeight: 400,
            }}>
              {step === "credenciais"
                ? "Entre para acessar o sistema de atendimento do Grupo Unita."
                : <>Enviamos um código para <span style={{ color: "#1e40af", fontWeight: 600 }}>{email}</span>.</>
              }
            </p>
          </div>

          {/* ALERTAS */}
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
          {info && !erro && (
            <div className="fade-up" style={{
              background: "#eff6ff",
              border: "1px solid #bfdbfe",
              borderRadius: 12,
              padding: "12px 14px",
              marginBottom: 20,
            }}>
              <p style={{ color: "#1e40af", fontSize: 13.5, margin: 0, fontWeight: 500 }}>{info}</p>
            </div>
          )}

          {/* ━━━ STEP 1 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
          {step === "credenciais" && (
            <>
              <div className="fade-up-d3" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                <div>
                  <label style={{
                    display: "block",
                    fontSize: 12,
                    fontWeight: 700,
                    color: "#334155",
                    marginBottom: 8,
                    letterSpacing: 0.3,
                  }}>
                    E-mail
                  </label>
                  <input
                    type="email"
                    placeholder="você@grupounita.com.br"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                    className="blue-input"
                    autoComplete="email"
                  />
                </div>

                <div>
                  <div style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    marginBottom: 8,
                  }}>
                    <label style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: "#334155",
                      letterSpacing: 0.3,
                    }}>
                      Senha
                    </label>
                    <button onClick={handleEsqueciSenha} className="ghost-link">
                      Esqueceu?
                    </button>
                  </div>
                  <div style={{ position: "relative" }}>
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                      className="blue-input"
                      style={{ paddingRight: 44, letterSpacing: showPassword ? "normal" : 3 }}
                      autoComplete="current-password"
                    />
                    <button
                      onClick={() => setShowPassword(!showPassword)}
                      type="button"
                      className="pass-toggle"
                      title={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    >
                      {showPassword ? (
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
              </div>

              <button
                onClick={handleLogin}
                disabled={loading}
                className="blue-btn fade-up-d4"
                style={{ marginTop: 24 }}
              >
                {loading ? (
                  <>
                    <span style={{
                      width: 15, height: 15,
                      border: "2px solid rgba(255,255,255,0.3)",
                      borderTopColor: "#ffffff",
                      borderRadius: "50%",
                      animation: "spin 0.7s linear infinite",
                    }} />
                    Autenticando...
                  </>
                ) : (
                  <>Acessar sistema <span style={{ fontSize: 17, fontWeight: 400 }}>→</span></>
                )}
              </button>

              {/* Linha divisória + nota */}
              <div className="fade-up-d4" style={{
                marginTop: 28,
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}>
                <div style={{ flex: 1, height: 1, background: "linear-gradient(90deg, transparent, #e2e8f0)" }} />
                <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 500, letterSpacing: 0.3 }}>
                  Acesso restrito
                </span>
                <div style={{ flex: 1, height: 1, background: "linear-gradient(90deg, #e2e8f0, transparent)" }} />
              </div>
              <p className="fade-up-d4" style={{
                textAlign: "center",
                fontSize: 12.5,
                color: "#64748b",
                marginTop: 14,
                lineHeight: 1.6,
              }}>
                Sistema interno — contate o administrador para criar acesso.
              </p>
            </>
          )}

          {/* ━━━ STEP 2 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
          {step === "otp" && (
            <>
              <div className="fade-up-d3" style={{
                display: "flex", justifyContent: "space-between",
                gap: 8, marginBottom: 28,
              }}>
                {otpDigits.map((d, i) => (
                  <input
                    key={i}
                    ref={el => { otpRefs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={1}
                    value={d}
                    onChange={(e) => handleOtpChange(i, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(i, e)}
                    onPaste={i === 0 ? handleOtpPaste : undefined}
                    className={`otp-cell ${d ? "filled" : ""}`}
                  />
                ))}
              </div>

              <button
                onClick={handleVerifyOtp}
                disabled={loading || otpDigits.join("").length !== 6}
                className="blue-btn fade-up-d4"
              >
                {loading ? (
                  <>
                    <span style={{
                      width: 15, height: 15,
                      border: "2px solid rgba(255,255,255,0.3)",
                      borderTopColor: "#ffffff",
                      borderRadius: "50%",
                      animation: "spin 0.7s linear infinite",
                    }} />
                    Verificando...
                  </>
                ) : (
                  <>Confirmar código <span style={{ fontSize: 17, fontWeight: 400 }}>→</span></>
                )}
              </button>

              <div className="fade-up-d4" style={{
                marginTop: 24,
                display: "flex", flexDirection: "column",
                gap: 12, alignItems: "center",
              }}>
                <button
                  onClick={handleReenviar}
                  disabled={reenvioCooldown > 0 || loading}
                  className="ghost-link"
                  style={{ fontSize: 13.5 }}
                >
                  {reenvioCooldown > 0
                    ? `Reenviar em ${reenvioCooldown}s`
                    : "Não recebeu? Reenviar código"}
                </button>
                <button
                  onClick={handleVoltar}
                  style={{
                    background: "none", border: "none",
                    color: "#94a3b8",
                    fontSize: 12.5, fontWeight: 500,
                    cursor: "pointer", padding: 4,
                  }}
                >
                  ← Voltar ao login
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ═════════════════════════════════════════════════════════════════
          FOOTER
          ═════════════════════════════════════════════════════════════════ */}
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