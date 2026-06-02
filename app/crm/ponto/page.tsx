"use client";
import { useState, useEffect } from "react";
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
  const [registrando, setRegistrando] = useState(false);
  const [ultima, setUltima] = useState<{ tipo: string; hora: string; comGps: boolean } | null>(null);
  const [emailLogado, setEmailLogado] = useState("");

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

  const bater = async () => {
    if (!func) return;
    setRegistrando(true);
    const loc = await pegarLocalizacao();
    if (!loc) {
      const seguir = confirm(
        "Não consegui obter a sua localização (a permissão de GPS pode ter sido negada).\n\nRegistrar o ponto mesmo assim, SEM localização?"
      );
      if (!seguir) {
        setRegistrando(false);
        return;
      }
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
    });
    setRegistrando(false);
    if (error) {
      alert("Erro ao registrar o ponto: " + error.message);
      return;
    }
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
                onClick={bater}
                disabled={registrando}
                style={{
                  width: "100%",
                  background: `linear-gradient(135deg, ${COR} 0%, #3b82f6 100%)`,
                  color: "white",
                  border: "none",
                  borderRadius: 16,
                  padding: "18px 24px",
                  fontSize: 18,
                  cursor: registrando ? "wait" : "pointer",
                  fontWeight: 800,
                  boxShadow: `0 8px 24px ${COR}50`,
                }}
              >
                {registrando ? "📍 Registrando..." : "🕐 Bater Ponto"}
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
    </div>
  );
}