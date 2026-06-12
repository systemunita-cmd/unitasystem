"use client";
import { useState, useEffect } from "react";
import { useSoftphone } from "../hooks/useSoftphone";

// ═══════════════════════════════════════════════════════════════════════
// 🎧 SOFTPHONE — UI flutuante no canto inferior direito
// ═══════════════════════════════════════════════════════════════════════
// 2 modos:
// - Minimizado (bolha redonda): clica pra abrir
// - Expandido (card): mostra chamada ativa OU teclado discador
// ═══════════════════════════════════════════════════════════════════════

// 🆕 FASE 1.6 MOBILE — bolha menor e mais alta no celular (sai de cima do input),
// card expandido com largura responsiva (não estoura a tela).
// Desktop continua igual: bolha 56px com bottom 100, card 320px.
const SOFTPHONE_BOTTOM_DESKTOP = 100;
const SOFTPHONE_BOTTOM_MOBILE = 180;
const SOFTPHONE_RIGHT_DESKTOP = 24;
const SOFTPHONE_RIGHT_MOBILE = 12;

export function Softphone() {
  const { chamada, aberto, setAberto, iniciarChamada, encerrarChamada, toggleMudo, enviarDTMF, segundosConectado } = useSoftphone();
  // 📞 Bolha só aparece DENTRO da Telefonia — exceto se houver chamada ativa
  // (aí segue visível em qualquer rota, senão você perderia o controle da ligação).
  const [rota, setRota] = useState<string>("");
  useEffect(() => {
    const atualizar = () => setRota(window.location.pathname || "");
    atualizar();
    const t = setInterval(atualizar, 800); // cobre navegação client-side do App Router
    return () => clearInterval(t);
  }, []);
  const chamadaAtiva = chamada && chamada.status !== "ocioso";
  const [numeroDigitado, setNumeroDigitado] = useState("");
  const [modoTeclado, setModoTeclado] = useState(true);

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // 📞 Bolha só aparece dentro da Telefonia (ou com chamada ativa em qualquer
  //    rota). ⚠️ Este return PRECISA vir depois de TODOS os hooks acima —
  //    return condicional antes de hook quebra a regra do React e derrubava
  //    a página /crm/telefonia inteira (React error #310).
  if (!rota.startsWith("/crm/telefonia") && !chamadaAtiva) return null;

  const temChamada = chamada && chamada.status !== "ocioso";

  const bottomFinal = isMobile ? SOFTPHONE_BOTTOM_MOBILE : SOFTPHONE_BOTTOM_DESKTOP;
  const rightFinal = isMobile ? SOFTPHONE_RIGHT_MOBILE : SOFTPHONE_RIGHT_DESKTOP;

  const labelStatus = (s: string) => ({
    iniciando: "Iniciando...",
    chamando: "Chamando...",
    conectado: "Conectado",
    encerrando: "Encerrando...",
    sem_resposta: "Não atendeu",
    ocupado: "Ocupado",
    falha: "Falha na chamada",
    caixa_postal: "Caixa postal",
  }[s] || s);

  // NOTA: "conectado" mantém verde porque é convenção universal (ligação ativa = verde),
  // independente da cor da marca. Os outros status (warning/erro) também ficam padrão.
  const corStatus = (s: string) => ({
    iniciando: "#f59e0b",
    chamando: "#f59e0b",
    conectado: "#16a34a",
    encerrando: "#dc2626",
    sem_resposta: "#6b7280",
    ocupado: "#dc2626",
    falha: "#dc2626",
    caixa_postal: "#6b7280",
  }[s] || "#6b7280");

  const formatTempo = (seg: number) => {
    const m = Math.floor(seg / 60);
    const s = seg % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const formatarNumeroExibicao = (n: string) => {
    if (!n) return "";
    const limpo = n.replace(/\D/g, "");
    if (limpo.length === 13 && limpo.startsWith("55")) {
      return `+55 ${limpo.slice(2, 4)} ${limpo.slice(4, 5)} ${limpo.slice(5, 9)}-${limpo.slice(9, 13)}`;
    }
    if (limpo.length === 12 && limpo.startsWith("55")) {
      return `+55 ${limpo.slice(2, 4)} ${limpo.slice(4, 8)}-${limpo.slice(8, 12)}`;
    }
    return n;
  };

  const adicionarDigito = (d: string) => {
    if (temChamada && chamada?.status === "conectado") {
      enviarDTMF(d);
    } else {
      setNumeroDigitado(n => n + d);
    }
  };

  const apagarUltimo = () => setNumeroDigitado(n => n.slice(0, -1));

  const chamarManual = () => {
    const n = numeroDigitado.replace(/\D/g, "");
    if (n.length < 8) { alert("Digite um número válido (mínimo 8 dígitos)"); return; }
    iniciarChamada(n);
    setNumeroDigitado("");
  };

  // ═══════ MODO MINIMIZADO ═══════
  if (!aberto) {
    const tamanho = isMobile ? (temChamada ? 50 : 44) : 56;
    const opacity = isMobile && !temChamada ? 0.75 : 1;
    return (
      <button
        onClick={() => setAberto(true)}
        title="Abrir discador"
        style={{
          position: "fixed",
          bottom: bottomFinal,
          right: rightFinal,
          width: tamanho,
          height: tamanho,
          borderRadius: "50%",
          background: temChamada
            ? "linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)"
            : "#ffffff",
          border: temChamada ? "none" : "1px solid #e5e7eb",
          cursor: "pointer",
          boxShadow: temChamada
            ? "0 8px 24px rgba(37,99,235,0.45), 0 0 0 4px rgba(37,99,235,0.15)"
            : "0 4px 16px rgba(0,0,0,0.10), 0 1px 3px rgba(0,0,0,0.06)",
          zIndex: 9000,
          fontSize: isMobile ? 18 : 24,
          color: temChamada ? "white" : "#2563eb",
          opacity,
          animation: temChamada ? "pulse 1.5s infinite" : "none",
          transition: "opacity 0.2s, transform 0.15s",
        }}
        onMouseEnter={e => { if (!temChamada) e.currentTarget.style.transform = "scale(1.08)"; }}
        onMouseLeave={e => { if (!temChamada) e.currentTarget.style.transform = "scale(1)"; }}
      >
        📞
        {temChamada && (
          <span style={{
            position: "absolute", top: -3, right: -3,
            background: "#dc2626", color: "white", fontSize: 10,
            padding: "2px 6px", borderRadius: 10, fontWeight: 700,
            border: "2px solid #ffffff",
            boxShadow: "0 2px 6px rgba(220,38,38,0.4)",
          }}>
            •
          </span>
        )}
      </button>
    );
  }

  // ═══════ MODO EXPANDIDO ═══════
  return (
    <>
      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
        @keyframes ring {
          0%, 100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.45); }
          50% { box-shadow: 0 0 0 14px rgba(245, 158, 11, 0); }
        }
      `}</style>
      <div style={{
        position: "fixed",
        bottom: bottomFinal,
        right: rightFinal,
        width: isMobile ? "min(320px, calc(100vw - 24px))" : 320,
        background: "#ffffff",
        border: "1px solid #e5e7eb",
        borderRadius: 18,
        boxShadow: "0 20px 50px rgba(0,0,0,0.15), 0 4px 12px rgba(0,0,0,0.06)",
        zIndex: 9000,
        overflow: "hidden",
        fontFamily: "Arial, sans-serif",
      }}>
        {/* HEADER */}
        <div style={{
          background: "linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)",
          padding: "12px 16px",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 18 }}>📞</span>
            <span style={{ color: "white", fontSize: 13, fontWeight: 700, letterSpacing: -0.2 }}>Discador</span>
            <span style={{
              background: "rgba(255,255,255,0.25)", color: "white",
              fontSize: 9, padding: "2px 7px", borderRadius: 6, fontWeight: 700,
              backdropFilter: "blur(4px)",
            }}>MOCK</span>
          </div>
          <button onClick={() => setAberto(false)} title="Minimizar"
            style={{
              background: "rgba(255,255,255,0.2)", border: "none",
              color: "white", fontSize: 18, cursor: "pointer",
              padding: 0, lineHeight: 1,
              width: 24, height: 24, borderRadius: 6,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 700,
            }}>
            −
          </button>
        </div>

        {/* ÁREA DE CHAMADA ATIVA ou TECLADO */}
        {temChamada ? (
          <ChamadaAtivaView
            chamada={chamada!}
            segundosConectado={segundosConectado}
            labelStatus={labelStatus}
            corStatus={corStatus}
            formatTempo={formatTempo}
            formatarNumero={formatarNumeroExibicao}
            toggleMudo={toggleMudo}
            encerrar={encerrarChamada}
            enviarDTMF={enviarDTMF}
            adicionarDigito={adicionarDigito}
          />
        ) : (
          <TecladoView
            numero={numeroDigitado}
            setNumero={setNumeroDigitado}
            adicionar={adicionarDigito}
            apagar={apagarUltimo}
            chamar={chamarManual}
            formatarNumero={formatarNumeroExibicao}
          />
        )}
      </div>
    </>
  );
}

// ─── Vista de chamada ativa ───────────────────────────────────────────
function ChamadaAtivaView({ chamada, segundosConectado, labelStatus, corStatus, formatTempo, formatarNumero, toggleMudo, encerrar, enviarDTMF, adicionarDigito }: any) {
  const [mostrarTeclado, setMostrarTeclado] = useState(false);
  const tocando = chamada.status === "chamando" || chamada.status === "iniciando";
  const cor = corStatus(chamada.status);

  return (
    <div style={{ padding: 24, textAlign: "center", background: "#ffffff" }}>
      {/* Avatar / Nome / Número */}
      <div style={{
        width: 84, height: 84, borderRadius: "50%",
        background: `linear-gradient(135deg, ${cor} 0%, ${cor}dd 100%)`,
        margin: "0 auto 14px",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 34, fontWeight: 700, color: "white",
        boxShadow: `0 8px 24px ${cor}40`,
        animation: tocando ? "ring 1.4s infinite" : "none",
        border: "3px solid #ffffff",
      }}>
        {chamada.nome?.charAt(0).toUpperCase() || "?"}
      </div>

      <p style={{ color: "#1f2937", fontSize: 16, fontWeight: 700, margin: "0 0 4px" }}>
        {chamada.nome || "Sem nome"}
      </p>
      <p style={{ color: "#6b7280", fontSize: 12, margin: "0 0 14px", fontFamily: "monospace" }}>
        {formatarNumero(chamada.numero)}
      </p>

      {/* Status + Timer */}
      <div style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
        marginBottom: 22, padding: "5px 12px",
        background: `${cor}10`, border: `1px solid ${cor}30`, borderRadius: 20,
      }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: cor, animation: tocando ? "pulse 1s infinite" : "none" }} />
        <span style={{ color: cor, fontSize: 12, fontWeight: 700 }}>{labelStatus(chamada.status)}</span>
        {chamada.status === "conectado" && (
          <span style={{ color: cor, fontSize: 12, fontFamily: "monospace", marginLeft: 2, fontWeight: 700 }}>
            · {formatTempo(segundosConectado)}
          </span>
        )}
      </div>

      {/* Teclado DTMF (só mostra quando conectado E clicou em mostrar) */}
      {chamada.status === "conectado" && mostrarTeclado && (
        <div style={{ marginBottom: 16 }}>
          <TecladoNumerico adicionar={(d: string) => enviarDTMF(d)} compacto />
        </div>
      )}

      {/* Controles */}
      <div style={{ display: "flex", justifyContent: "center", gap: 12 }}>
        {chamada.status === "conectado" && (
          <>
            <button onClick={toggleMudo} title={chamada.mudo ? "Ativar microfone" : "Mutar"}
              style={{
                width: 50, height: 50, borderRadius: "50%",
                background: chamada.mudo
                  ? "linear-gradient(135deg, #dc2626 0%, #ef4444 100%)"
                  : "#f3f4f6",
                border: chamada.mudo ? "none" : "1px solid #e5e7eb",
                color: chamada.mudo ? "white" : "#1f2937",
                fontSize: 18, cursor: "pointer",
                boxShadow: chamada.mudo ? "0 4px 12px rgba(220,38,38,0.3)" : "0 1px 3px rgba(0,0,0,0.08)",
                transition: "all 0.15s",
              }}>
              {chamada.mudo ? "🔇" : "🎤"}
            </button>
            <button onClick={() => setMostrarTeclado(!mostrarTeclado)} title="Teclado"
              style={{
                width: 50, height: 50, borderRadius: "50%",
                background: mostrarTeclado
                  ? "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)"
                  : "#f3f4f6",
                border: mostrarTeclado ? "none" : "1px solid #e5e7eb",
                color: mostrarTeclado ? "white" : "#1f2937",
                fontSize: 18, cursor: "pointer",
                boxShadow: mostrarTeclado ? "0 4px 12px rgba(99,102,241,0.3)" : "0 1px 3px rgba(0,0,0,0.08)",
                transition: "all 0.15s",
              }}>
              🔢
            </button>
          </>
        )}
        <button onClick={encerrar} title="Desligar"
          style={{
            width: 60, height: 60, borderRadius: "50%",
            background: "linear-gradient(135deg, #dc2626 0%, #ef4444 100%)",
            border: "none", color: "white", fontSize: 26, cursor: "pointer",
            boxShadow: "0 8px 20px rgba(220,38,38,0.4)",
            transform: "rotate(135deg)",
            transition: "transform 0.15s",
          }}
          onMouseEnter={e => e.currentTarget.style.transform = "rotate(135deg) scale(1.05)"}
          onMouseLeave={e => e.currentTarget.style.transform = "rotate(135deg) scale(1)"}>
          📞
        </button>
      </div>
    </div>
  );
}

// ─── Vista do teclado (pra digitar manual e ligar) ─────────────────────
function TecladoView({ numero, setNumero, adicionar, apagar, chamar, formatarNumero }: any) {
  return (
    <div style={{ padding: 18, background: "#ffffff" }}>
      {/* Display do número */}
      <div style={{
        background: "#f9fafb",
        borderRadius: 12, padding: "16px 14px",
        marginBottom: 14, textAlign: "center",
        minHeight: 56,
        display: "flex", alignItems: "center", justifyContent: "center",
        border: "1px solid #e5e7eb",
      }}>
        <span style={{
          color: numero ? "#1f2937" : "#9ca3af",
          fontSize: numero ? 21 : 13,
          fontFamily: "monospace",
          letterSpacing: numero ? 1 : 0,
          fontWeight: numero ? 700 : 400,
        }}>
          {numero ? formatarNumero(numero) : "Digite o número..."}
        </span>
      </div>

      <TecladoNumerico adicionar={adicionar} />

      {/* Botões inferiores */}
      <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
        <button onClick={apagar} disabled={!numero}
          style={{
            flex: 1, padding: 13,
            background: numero ? "#f3f4f6" : "#f9fafb",
            border: `1px solid ${numero ? "#e5e7eb" : "#f3f4f6"}`,
            borderRadius: 12,
            cursor: numero ? "pointer" : "not-allowed",
            color: numero ? "#374151" : "#9ca3af",
            fontSize: 14, fontWeight: 600,
            opacity: numero ? 1 : 0.5,
            transition: "all 0.15s",
          }}>
          ⌫ Apagar
        </button>
        <button onClick={chamar} disabled={!numero}
          style={{
            flex: 2, padding: 13,
            background: numero
              ? "linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)"
              : "#f3f4f6",
            border: "none", borderRadius: 12,
            cursor: numero ? "pointer" : "not-allowed",
            color: numero ? "white" : "#9ca3af",
            fontSize: 14, fontWeight: 700,
            opacity: numero ? 1 : 0.5,
            boxShadow: numero ? "0 4px 12px rgba(37,99,235,0.3)" : "none",
            transition: "all 0.15s",
          }}>
          📞 Ligar
        </button>
      </div>
    </div>
  );
}

// ─── Teclado numérico (usado em 2 lugares) ─────────────────────────────
function TecladoNumerico({ adicionar, compacto = false }: { adicionar: (d: string) => void; compacto?: boolean }) {
  const teclas: Array<[string, string]> = [
    ["1", ""], ["2", "ABC"], ["3", "DEF"],
    ["4", "GHI"], ["5", "JKL"], ["6", "MNO"],
    ["7", "PQRS"], ["8", "TUV"], ["9", "WXYZ"],
    ["*", ""], ["0", "+"], ["#", ""],
  ];

  const tamanho = compacto ? 42 : 58;
  const fontePrimaria = compacto ? 16 : 21;
  const fonteSecundaria = compacto ? 8 : 9;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
      {teclas.map(([num, letras]) => (
        <button key={num} onClick={() => adicionar(num)}
          style={{
            height: tamanho,
            background: "#ffffff",
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            color: "#1f2937",
            cursor: "pointer",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            transition: "all 0.1s",
            boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
          }}
          onMouseDown={e => {
            e.currentTarget.style.background = "#eff6ff";
            e.currentTarget.style.borderColor = "#2563eb";
            e.currentTarget.style.transform = "scale(0.96)";
          }}
          onMouseUp={e => {
            e.currentTarget.style.background = "#ffffff";
            e.currentTarget.style.borderColor = "#e5e7eb";
            e.currentTarget.style.transform = "scale(1)";
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = "#ffffff";
            e.currentTarget.style.borderColor = "#e5e7eb";
            e.currentTarget.style.transform = "scale(1)";
          }}
        >
          <span style={{ fontSize: fontePrimaria, fontWeight: 700, color: "#1f2937" }}>{num}</span>
          {letras && <span style={{ fontSize: fonteSecundaria, color: "#9ca3af", marginTop: -2, fontWeight: 600, letterSpacing: 0.5 }}>{letras}</span>}
        </button>
      ))}
    </div>
  );
}