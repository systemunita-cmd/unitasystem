"use client";
import { useState, useEffect } from "react";
import { supabase } from "../../../lib/supabase";

// ═══════════════════════════════════════════════════════════════════════
// 🕐 RH · Bater Ponto  (CONECTADO — tabela 'ponto_registros')
// ───────────────────────────────────────────────────────────────────────
// O funcionário seleciona o nome, aperta "Bater Ponto" e o sistema grava
// hora + geolocalização (GPS via navegador). O tipo (Entrada/Saída...) é
// detectado pela contagem de batidas do dia.
// ═══════════════════════════════════════════════════════════════════════

const COR = "#4f46e5";
const COR_TEXTO = "#4338ca";
const card = {
  background: "#ffffff",
  borderRadius: 14,
  border: "1px solid #e5e7eb",
  boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
};
const inputStyle = {
  width: "100%",
  background: "#ffffff",
  border: "1px solid #e5e7eb",
  borderRadius: 10,
  padding: "12px 14px",
  color: "#1f2937",
  fontSize: 14,
  boxSizing: "border-box" as const,
  outline: "none",
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

// captura GPS do navegador (resolve null se negar/falhar)
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

export function BaterPontoSection() {
  const [funcs, setFuncs] = useState<Func[]>([]);
  const [nome, setNome] = useState("");
  const [batidasHoje, setBatidasHoje] = useState<Batida[]>([]);
  const [relogio, setRelogio] = useState(new Date());
  const [registrando, setRegistrando] = useState(false);
  const [ultima, setUltima] = useState<{ tipo: string; hora: string; comGps: boolean } | null>(null);

  // relógio ao vivo
  useEffect(() => {
    const t = setInterval(() => setRelogio(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // carrega funcionários ativos pro seletor
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("funcionarios")
        .select("nome, cargo, status")
        .neq("status", "desligado")
        .order("nome", { ascending: true });
      if (error) {
        console.error(error);
        return;
      }
      setFuncs((data || []).map((r: any) => ({ nome: r.nome, cargo: r.cargo || "" })));
    })();
  }, []);

  const carregarBatidasHoje = async (n: string) => {
    if (!n) {
      setBatidasHoje([]);
      return;
    }
    const inicioDia = new Date();
    inicioDia.setHours(0, 0, 0, 0);
    const { data, error } = await supabase
      .from("ponto_registros")
      .select("id, tipo, data_hora, latitude, longitude")
      .eq("funcionario", n)
      .gte("data_hora", inicioDia.toISOString())
      .order("data_hora", { ascending: true });
    if (error) {
      console.error(error);
      return;
    }
    setBatidasHoje((data || []) as Batida[]);
  };

  const selecionar = (n: string) => {
    setNome(n);
    setUltima(null);
    carregarBatidasHoje(n);
  };

  const bater = async () => {
    if (!nome) {
      alert("Selecione o seu nome primeiro.");
      return;
    }
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
    const func = funcs.find((f) => f.nome === nome);
    const tipo = TIPOS[batidasHoje.length] || "Marcação";
    const agora = new Date();
    const payload = {
      funcionario: nome,
      cargo: func?.cargo || "",
      tipo,
      data_hora: agora.toISOString(),
      latitude: loc?.lat ?? null,
      longitude: loc?.lng ?? null,
      precisao: loc?.acc ?? null,
    };
    const { error } = await supabase.from("ponto_registros").insert(payload);
    setRegistrando(false);
    if (error) {
      alert("Erro ao registrar o ponto: " + error.message);
      return;
    }
    setUltima({ tipo, hora: hora(agora.toISOString()), comGps: !!loc });
    carregarBatidasHoje(nome);
  };

  const proximoTipo = TIPOS[batidasHoje.length] || "Marcação";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 20,
        maxWidth: 760,
        margin: "0 auto",
        width: "100%",
      }}
    >
      {/* HEADER */}
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 14,
            background: `linear-gradient(135deg, ${COR} 0%, #6366f1 100%)`,
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
          <h1 style={{ color: "#1f2937", fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: -0.3 }}>
            Bater Ponto
          </h1>
          <p style={{ color: "#6b7280", fontSize: 12, margin: "2px 0 0" }}>
            Registre sua entrada e saída — a localização é capturada automaticamente
          </p>
        </div>
      </div>

      {/* RELÓGIO + BOTÃO */}
      <div
        style={{
          ...card,
          padding: 32,
          textAlign: "center",
          background: "linear-gradient(180deg, #ffffff 0%, #f5f3ff 100%)",
        }}
      >
        <p style={{ color: "#6b7280", fontSize: 13, margin: "0 0 4px", textTransform: "capitalize" }}>
          {relogio.toLocaleDateString("pt-BR", {
            weekday: "long",
            day: "2-digit",
            month: "long",
            year: "numeric",
          })}
        </p>
        <p
          style={{
            color: "#1f2937",
            fontSize: 56,
            fontWeight: 800,
            margin: "0 0 20px",
            letterSpacing: -2,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {relogio.toLocaleTimeString("pt-BR")}
        </p>

        <div style={{ maxWidth: 380, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}>
          <select value={nome} onChange={(e) => selecionar(e.target.value)} style={inputStyle}>
            <option value="">— Selecione seu nome —</option>
            {funcs.map((f) => (
              <option key={f.nome} value={f.nome}>
                {f.nome}
              </option>
            ))}
          </select>

          {nome && (
            <p style={{ color: "#6b7280", fontSize: 13, margin: 0 }}>
              Próxima batida: <b style={{ color: TIPO_COR[proximoTipo] || COR_TEXTO }}>{proximoTipo}</b>
            </p>
          )}

          <button
            onClick={bater}
            disabled={!nome || registrando}
            style={{
              background: !nome ? "#e5e7eb" : `linear-gradient(135deg, ${COR} 0%, #6366f1 100%)`,
              color: !nome ? "#9ca3af" : "white",
              border: "none",
              borderRadius: 16,
              padding: "18px 24px",
              fontSize: 18,
              cursor: !nome || registrando ? "default" : "pointer",
              fontWeight: 800,
              boxShadow: !nome ? "none" : `0 8px 24px ${COR}50`,
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
              <p style={{ color: "#6b7280", fontSize: 11, margin: "2px 0 0" }}>
                {ultima.comGps ? "📍 Localização capturada" : "⚠️ Registrado sem localização"}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* BATIDAS DE HOJE */}
      {nome && (
        <div style={{ ...card, padding: 22 }}>
          <h3 style={{ color: "#1f2937", fontSize: 15, fontWeight: 700, margin: "0 0 16px" }}>
            Suas batidas de hoje
          </h3>
          {batidasHoje.length === 0 ? (
            <p style={{ color: "#9ca3af", fontSize: 13, textAlign: "center", padding: "12px 0" }}>
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
                      background: "#f9fafb",
                      borderRadius: 10,
                      border: "1px solid #f3f4f6",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div
                        style={{ width: 10, height: 10, borderRadius: "50%", background: cor, flexShrink: 0 }}
                      />
                      <div>
                        <p style={{ color: "#1f2937", fontSize: 14, fontWeight: 700, margin: 0 }}>{b.tipo}</p>
                        <p style={{ color: "#9ca3af", fontSize: 11, margin: "1px 0 0" }}>
                          {temGps ? "📍 com localização" : "sem localização"}
                        </p>
                      </div>
                    </div>
                    <span
                      style={{
                        color: "#1f2937",
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
      )}
    </div>
  );
}