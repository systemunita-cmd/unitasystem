"use client";
import { useState, useEffect, useRef } from "react";
import { supabase } from "../../lib/supabase";

// ═══════════════════════════════════════════════════════════════════════
// 🕐 Bater Ponto — página lateral do CRM (por login)
// ───────────────────────────────────────────────────────────────────────
// Identifica o funcionário pelo USUÁRIO LOGADO (não tem dropdown):
//   login (auth) → email → funcionarios.user_email → funcionário
// Cada um bate e vê só o próprio ponto. Grava hora + GPS em ponto_registros.
// ═══════════════════════════════════════════════════════════════════════

const COR = "#2563eb";
const card = {
  background: "#ffffff",
  borderRadius: 14,
  border: "1px solid #e5e7eb",
  boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
};

const TIPOS = ["Entrada", "Saída p/ almoço", "Retorno do almoço", "Saída"];
const TIPO_COR: Record<string, string> = {
  Entrada: "#16a34a",
  "Saída p/ almoço": "#f59e0b",
  "Retorno do almoço": "#0ea5e9",
  Saída: "#dc2626",
  Marcação: "#6b7280",
};

type Func = { nome: string; cargo: string };
type Batida = {
  id: string;
  tipo: string;
  data_hora: string;
  latitude: number | null;
  longitude: number | null;
};

const hora = (iso: string) => {
  try {
    return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "--:--";
  }
};

function pegarLocalizacao(): Promise<{ lat: number; lng: number; acc: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });
}

export default function BaterPontoPage() {
  const [func, setFunc] = useState<Func | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [semVinculo, setSemVinculo] = useState(false);
  const [batidasHoje, setBatidasHoje] = useState<Batida[]>([]);
  const [relogio, setRelogio] = useState(new Date());
  const [ultima, setUltima] = useState<{ tipo: string; hora: string; comGps: boolean } | null>(null);
  const [emailLogado, setEmailLogado] = useState("");
  const [modalSelfie, setModalSelfie] = useState(false);
  const [foto, setFoto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erroCam, setErroCam] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // relógio ao vivo
  useEffect(() => {
    const t = setInterval(() => setRelogio(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // identifica o funcionário pelo login
  useEffect(() => {
    (async () => {
      setCarregando(true);
      const { data: auth } = await supabase.auth.getUser();
      const email = auth?.user?.email || "";
      setEmailLogado(email);
      if (!email) {
        setCarregando(false);
        setSemVinculo(true);
        return;
      }
      const alvo = email.toLowerCase().trim();
      // Busca todos e casa no navegador, normalizando maiúsculas/espaços —
      // à prova de qualquer diferença. Casa por user_email OU pelo e-mail do cadastro.
      const { data: todos, error } = await supabase
        .from("funcionarios")
        .select("nome, cargo, email, user_email");
      if (error) console.error("[ponto] erro ao buscar funcionários:", error);
      const f = (todos || []).find(
        (x: any) =>
          (x.user_email || "").toLowerCase().trim() === alvo || (x.email || "").toLowerCase().trim() === alvo
      );
      if (!f) {
        setSemVinculo(true);
        setCarregando(false);
        return;
      }
      setFunc({ nome: f.nome, cargo: f.cargo || "" });
      await carregarBatidasHoje(f.nome);
      setCarregando(false);
    })();
  }, []);

  const carregarBatidasHoje = async (nome: string) => {
    const inicioDia = new Date();
    inicioDia.setHours(0, 0, 0, 0);
    const { data } = await supabase
      .from("ponto_registros")
      .select("id, tipo, data_hora, latitude, longitude")
      .eq("funcionario", nome)
      .gte("data_hora", inicioDia.toISOString())
      .order("data_hora", { ascending: true });
    setBatidasHoje((data || []) as Batida[]);
  };

  // ── Câmera (selfie obrigatória pra bater o ponto) ──
  const pararStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  useEffect(() => {
    if (!modalSelfie) return;
    let cancelado = false;
    (async () => {
      try {
        if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
          setErroCam("Este aparelho/navegador não permite usar a câmera.");
          return;
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
          audio: false,
        });
        if (cancelado) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      } catch {
        setErroCam("Não consegui acessar a câmera. Toque em permitir o acesso à câmera para bater o ponto.");
      }
    })();
    return () => {
      cancelado = true;
      pararStream();
    };
  }, [modalSelfie]);

  const abrirCamera = () => {
    if (!func) return;
    setFoto("");
    setErroCam("");
    setModalSelfie(true);
  };

  const fecharCamera = () => {
    pararStream();
    setModalSelfie(false);
    setFoto("");
    setErroCam("");
  };

  const capturarFoto = () => {
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!v || !c) return;
    const w = v.videoWidth || 480;
    const h = v.videoHeight || 640;
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, w, h);
    setFoto(c.toDataURL("image/jpeg", 0.8));
  };

  // Confirma: faz upload da selfie e registra o ponto (com GPS se disponível)
  const confirmar = async () => {
    if (!func || !foto) return;
    setEnviando(true);
    const loc = await pegarLocalizacao();
    let selfieUrl = "";
    try {
      const blob = await (await fetch(foto)).blob();
      const path = `${func.nome.replace(/[^a-zA-Z0-9]/g, "_")}/${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from("ponto-selfies")
        .upload(path, blob, { contentType: "image/jpeg", upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("ponto-selfies").getPublicUrl(path);
      selfieUrl = pub?.publicUrl || "";
    } catch (e) {
      console.error("[ponto] upload selfie", e);
      setEnviando(false);
      setErroCam("Não consegui salvar a selfie. Verifique a conexão e tente de novo.");
      return;
    }
    const tipo = TIPOS[batidasHoje.length] || "Marcação";
    const agora = new Date();
    const { error } = await supabase.from("ponto_registros").insert({
      funcionario: func.nome,
      cargo: func.cargo,
      tipo,
      data_hora: agora.toISOString(),
      latitude: loc?.lat ?? null,
      longitude: loc?.lng ?? null,
      precisao: loc?.acc ?? null,
      selfie_url: selfieUrl || null,
    });
    setEnviando(false);
    if (error) {
      console.error("[ponto] insert", error);
      setErroCam("Erro ao registrar o ponto. Tente de novo.");
      return;
    }
    pararStream();
    setModalSelfie(false);
    setFoto("");
    setUltima({ tipo, hora: hora(agora.toISOString()), comGps: !!loc });
    carregarBatidasHoje(func.nome);
  };

  const proximoTipo = TIPOS[batidasHoje.length] || "Marcação";

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", width: "100%" }}>
      {/* HEADER */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 14,
            background: `linear-gradient(135deg, ${COR} 0%, #3b82f6 100%)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 24,
            boxShadow: `0 8px 20px ${COR}30`,
          }}
        >
          <span style={{ filter: "saturate(0) brightness(2)" }}>🕐</span>
        </div>
        <div>
          <h1 style={{ color: "#0f172a", fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: -0.3 }}>
            Bater Ponto
          </h1>
          <p style={{ color: "#64748b", fontSize: 12, margin: "2px 0 0" }}>
            Registre sua entrada e saída — a localização é capturada automaticamente
          </p>
        </div>
      </div>

      {carregando ? (
        <div style={{ ...card, padding: 40, textAlign: "center" }}>
          <p style={{ color: "#64748b", fontSize: 13 }}>Carregando...</p>
        </div>
      ) : semVinculo ? (
        // login não vinculado a um funcionário
        <div style={{ ...card, padding: 36, textAlign: "center" }}>
          <p style={{ fontSize: 38, margin: "0 0 10px" }}>🔗</p>
          <p style={{ color: "#0f172a", fontSize: 16, fontWeight: 700, margin: "0 0 6px" }}>
            Seu login ainda não está vinculado a um funcionário
          </p>
          <p style={{ color: "#64748b", fontSize: 13, margin: 0, lineHeight: 1.5 }}>
            Peça ao RH para abrir o seu cadastro de funcionário e selecionar o seu usuário no campo
            <b> "Usuário do sistema"</b>. Depois disso, o ponto fica liberado aqui.
          </p>
          <div
            style={{
              marginTop: 18,
              padding: "10px 14px",
              background: "#f8fafc",
              border: "1px dashed #cbd5e1",
              borderRadius: 10,
              display: "inline-block",
            }}
          >
            <p style={{ color: "#94a3b8", fontSize: 11, margin: 0, letterSpacing: 0.3 }}>
              Login detectado: <b style={{ color: "#475569" }}>{emailLogado || "(não identificado)"}</b>
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* RELÓGIO + BOTÃO */}
          <div
            style={{
              ...card,
              padding: 32,
              textAlign: "center",
              background: "linear-gradient(180deg, #ffffff 0%, #eff6ff 100%)",
            }}
          >
            <p style={{ color: "#0f172a", fontSize: 15, fontWeight: 700, margin: "0 0 2px" }}>
              Olá, {func?.nome?.split(" ")[0]} 👋
            </p>
            <p style={{ color: "#64748b", fontSize: 12, margin: "0 0 4px", textTransform: "capitalize" }}>
              {relogio.toLocaleDateString("pt-BR", {
                weekday: "long",
                day: "2-digit",
                month: "long",
                year: "numeric",
              })}
            </p>
            <p
              style={{
                color: "#0f172a",
                fontSize: 56,
                fontWeight: 800,
                margin: "0 0 20px",
                letterSpacing: -2,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {relogio.toLocaleTimeString("pt-BR")}
            </p>

            <div style={{ maxWidth: 380, margin: "0 auto" }}>
              <p style={{ color: "#64748b", fontSize: 13, margin: "0 0 14px" }}>
                Próxima batida: <b style={{ color: TIPO_COR[proximoTipo] || COR }}>{proximoTipo}</b>
              </p>
              <button
                onClick={abrirCamera}
                style={{
                  width: "100%",
                  background: `linear-gradient(135deg, ${COR} 0%, #3b82f6 100%)`,
                  color: "white",
                  border: "none",
                  borderRadius: 16,
                  padding: "18px 24px",
                  fontSize: 18,
                  cursor: "pointer",
                  fontWeight: 800,
                  boxShadow: `0 8px 24px ${COR}50`,
                }}
              >
                📸 Bater Ponto com selfie
              </button>
            </div>

            {ultima && (
              <div
                style={{
                  marginTop: 20,
                  padding: "14px 18px",
                  background: "#f0fdf4",
                  border: "1px solid #bbf7d0",
                  borderRadius: 12,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <span style={{ fontSize: 22 }}>✅</span>
                <div style={{ textAlign: "left" }}>
                  <p style={{ color: "#16a34a", fontSize: 14, fontWeight: 800, margin: 0 }}>
                    {ultima.tipo} registrada às {ultima.hora}
                  </p>
                  <p style={{ color: "#64748b", fontSize: 11, margin: "2px 0 0" }}>
                    {ultima.comGps ? "📍 Localização capturada" : "⚠️ Registrado sem localização"}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* BATIDAS DE HOJE */}
          <div style={{ ...card, padding: 22, marginTop: 16 }}>
            <h3 style={{ color: "#0f172a", fontSize: 15, fontWeight: 700, margin: "0 0 16px" }}>
              Suas batidas de hoje
            </h3>
            {batidasHoje.length === 0 ? (
              <p style={{ color: "#94a3b8", fontSize: 13, textAlign: "center", padding: "12px 0" }}>
                Nenhuma batida registrada hoje ainda.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {batidasHoje.map((b) => {
                  const cor = TIPO_COR[b.tipo] || "#6b7280";
                  const temGps = b.latitude != null && b.longitude != null;
                  return (
                    <div
                      key={b.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                        padding: "12px 14px",
                        background: "#f8fafc",
                        borderRadius: 10,
                        border: "1px solid #f1f5f9",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: "50%",
                            background: cor,
                            flexShrink: 0,
                          }}
                        />
                        <div>
                          <p style={{ color: "#0f172a", fontSize: 14, fontWeight: 700, margin: 0 }}>
                            {b.tipo}
                          </p>
                          <p style={{ color: "#94a3b8", fontSize: 11, margin: "1px 0 0" }}>
                            {temGps ? "📍 com localização" : "sem localização"}
                          </p>
                        </div>
                      </div>
                      <span
                        style={{
                          color: "#0f172a",
                          fontSize: 18,
                          fontWeight: 800,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {hora(b.data_hora)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* MODAL DA SELFIE */}
      {modalSelfie && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.75)",
            backdropFilter: "blur(4px)",
            zIndex: 4000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div style={{ ...card, width: "100%", maxWidth: 420, overflow: "hidden" }}>
            <div
              style={{
                padding: "16px 20px",
                borderBottom: "1px solid #e5e7eb",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#0f172a" }}>
                📸 Selfie para o ponto
              </h3>
              <button
                onClick={fecharCamera}
                style={{
                  background: "#f3f4f6",
                  border: "none",
                  color: "#6b7280",
                  fontSize: 16,
                  cursor: "pointer",
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                }}
              >
                ✕
              </button>
            </div>
            <div style={{ padding: 20 }}>
              <p style={{ color: "#64748b", fontSize: 13, margin: "0 0 14px", textAlign: "center" }}>
                {func?.nome}, centralize o seu rosto e tire a selfie para registrar o ponto.
              </p>
              <div
                style={{
                  position: "relative",
                  width: "100%",
                  aspectRatio: "3 / 4",
                  background: "#000",
                  borderRadius: 14,
                  overflow: "hidden",
                  marginBottom: 16,
                }}
              >
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    display: foto ? "none" : "block",
                    transform: "scaleX(-1)",
                  }}
                />
                {foto && (
                  <img
                    src={foto}
                    alt="selfie"
                    style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" }}
                  />
                )}
              </div>
              <canvas ref={canvasRef} style={{ display: "none" }} />

              {erroCam ? (
                <div
                  style={{
                    background: "#fef2f2",
                    border: "1px solid #fecaca",
                    borderRadius: 10,
                    padding: "10px 14px",
                    marginBottom: 14,
                  }}
                >
                  <p style={{ color: "#dc2626", fontSize: 12, margin: 0, fontWeight: 600 }}>{erroCam}</p>
                </div>
              ) : null}

              {!foto ? (
                <button
                  onClick={capturarFoto}
                  disabled={!!erroCam}
                  style={{
                    width: "100%",
                    background: erroCam ? "#cbd5e1" : `linear-gradient(135deg, ${COR} 0%, #3b82f6 100%)`,
                    color: "#fff",
                    border: "none",
                    borderRadius: 14,
                    padding: "15px",
                    fontSize: 16,
                    fontWeight: 800,
                    cursor: erroCam ? "not-allowed" : "pointer",
                  }}
                >
                  📸 Tirar selfie
                </button>
              ) : (
                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    onClick={() => setFoto("")}
                    disabled={enviando}
                    style={{
                      flex: 1,
                      background: "#fff",
                      color: "#374151",
                      border: "1px solid #e5e7eb",
                      borderRadius: 14,
                      padding: "15px",
                      fontSize: 14,
                      fontWeight: 700,
                      cursor: enviando ? "not-allowed" : "pointer",
                    }}
                  >
                    🔄 De novo
                  </button>
                  <button
                    onClick={confirmar}
                    disabled={enviando}
                    style={{
                      flex: 2,
                      background: enviando ? "#86efac" : "linear-gradient(135deg, #16a34a 0%, #22c55e 100%)",
                      color: "#fff",
                      border: "none",
                      borderRadius: 14,
                      padding: "15px",
                      fontSize: 15,
                      fontWeight: 800,
                      cursor: enviando ? "wait" : "pointer",
                    }}
                  >
                    {enviando ? "Registrando..." : "✅ Confirmar e bater"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}