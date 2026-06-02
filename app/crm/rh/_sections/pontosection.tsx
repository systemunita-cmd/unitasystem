"use client";
import { useState, useMemo, useEffect } from "react";
import { supabase } from "../../../lib/supabase";

// ═══════════════════════════════════════════════════════════════════════
// 🧑‍💼 RH · Ponto / Frequência  (CONECTADO — lê 'ponto_registros')
// ───────────────────────────────────────────────────────────────────────
// Folha de ponto do mês: batidas reais por funcionário e dia, com horário,
// tipo e link 📍 pro mapa de onde a pessoa bateu. Calcula horas por dia.
// ═══════════════════════════════════════════════════════════════════════

const COR = "#4f46e5";
const COR_TEXTO = "#4338ca";
const card = {
  background: "#ffffff",
  borderRadius: 14,
  border: "1px solid #e5e7eb",
  boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
};

const TIPO_COR: Record<string, string> = {
  Entrada: "#16a34a",
  "Saída p/ almoço": "#f59e0b",
  "Retorno do almoço": "#0ea5e9",
  Saída: "#dc2626",
  Marcação: "#6b7280",
};

type Registro = {
  id: string;
  funcionario: string;
  cargo: string;
  tipo: string;
  data_hora: string;
  latitude: number | null;
  longitude: number | null;
  selfie_url: string | null;
};

function mesAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
const horaFmt = (iso: string) => {
  try {
    return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "--:--";
  }
};
const diaChave = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");
const fmtHoras = (h: number) => {
  const horas = Math.floor(h);
  const min = Math.round((h - horas) * 60);
  return `${horas}h${String(min).padStart(2, "0")}`;
};

// soma os intervalos (entrada→saída em pares) de um dia
function horasDoDia(batidas: Registro[]): number {
  const ord = [...batidas].sort((a, b) => a.data_hora.localeCompare(b.data_hora));
  let ms = 0;
  for (let i = 0; i + 1 < ord.length; i += 2) {
    ms += new Date(ord[i + 1].data_hora).getTime() - new Date(ord[i].data_hora).getTime();
  }
  return ms / 3600000;
}

export function PontoSection() {
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [mes, setMes] = useState(mesAtual());
  const [aberto, setAberto] = useState<string | null>(null);
  const [fotoModal, setFotoModal] = useState<{ url: string; mapsUrl: string | null } | null>(null);

  const carregar = async (m: string) => {
    setCarregando(true);
    const [ano, mm] = m.split("-").map(Number);
    const inicio = new Date(ano, mm - 1, 1, 0, 0, 0);
    const fim = new Date(ano, mm, 1, 0, 0, 0); // 1º dia do mês seguinte
    const { data, error } = await supabase
      .from("ponto_registros")
      .select("id, funcionario, cargo, tipo, data_hora, latitude, longitude, selfie_url")
      .gte("data_hora", inicio.toISOString())
      .lt("data_hora", fim.toISOString())
      .order("data_hora", { ascending: true });
    if (error) {
      console.error(error);
      alert("Erro ao carregar o ponto: " + error.message);
    } else {
      setRegistros((data || []) as Registro[]);
    }
    setCarregando(false);
  };
  useEffect(() => {
    carregar(mes);
  }, [mes]);

  // agrupa: funcionário → dia → batidas
  const porFunc = useMemo(() => {
    const m: Record<string, { cargo: string; dias: Record<string, Registro[]> }> = {};
    registros.forEach((r) => {
      if (!m[r.funcionario]) m[r.funcionario] = { cargo: r.cargo, dias: {} };
      const dia = diaChave(r.data_hora);
      if (!m[r.funcionario].dias[dia]) m[r.funcionario].dias[dia] = [];
      m[r.funcionario].dias[dia].push(r);
    });
    return Object.entries(m).map(([funcionario, info]) => {
      const dias = Object.entries(info.dias)
        .map(([dia, batidas]) => ({ dia, batidas, horas: horasDoDia(batidas) }))
        .sort((a, b) => b.dia.localeCompare(a.dia));
      const totalHoras = dias.reduce((s, d) => s + d.horas, 0);
      return { funcionario, cargo: info.cargo, dias, totalHoras };
    });
  }, [registros]);

  const stats = useMemo(
    () => ({
      pessoas: porFunc.length,
      batidas: registros.length,
      horas: porFunc.reduce((s, f) => s + f.totalHoras, 0),
    }),
    [porFunc, registros]
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* HEADER */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 14,
          flexWrap: "wrap",
        }}
      >
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
            <span style={{ filter: "saturate(0) brightness(2)" }}>⏰</span>
          </div>
          <div>
            <h1 style={{ color: "#1f2937", fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: -0.3 }}>
              Ponto / Frequência
            </h1>
            <p style={{ color: "#6b7280", fontSize: 12, margin: "2px 0 0" }}>
              Folha de ponto do mês com horários e localização
            </p>
          </div>
        </div>
        <input
          type="month"
          value={mes}
          onChange={(e) => setMes(e.target.value)}
          style={{
            background: "#ffffff",
            border: "1px solid #e5e7eb",
            borderRadius: 10,
            padding: "9px 14px",
            fontSize: 13,
            fontWeight: 600,
            color: "#1f2937",
            outline: "none",
          }}
        />
      </div>

      {/* STATS */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
        {[
          { label: "Funcionários", value: String(stats.pessoas), cor: "#6366f1", icon: "👥" },
          { label: "Batidas no mês", value: String(stats.batidas), cor: "#0ea5e9", icon: "🕐" },
          { label: "Horas trabalhadas", value: fmtHoras(stats.horas), cor: "#16a34a", icon: "⏱️" },
        ].map((s) => (
          <div key={s.label} style={{ ...card, padding: 16, borderTop: `3px solid ${s.cor}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: `${s.cor}15`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 14,
                }}
              >
                {s.icon}
              </div>
              <p
                style={{
                  color: "#6b7280",
                  fontSize: 11,
                  margin: 0,
                  fontWeight: 700,
                  textTransform: "uppercase",
                }}
              >
                {s.label}
              </p>
            </div>
            <p style={{ color: s.cor, fontSize: 20, fontWeight: 800, margin: 0, letterSpacing: -0.5 }}>
              {s.value}
            </p>
          </div>
        ))}
      </div>

      {carregando ? (
        <div style={{ ...card, padding: 40, textAlign: "center" }}>
          <p style={{ color: "#6b7280", fontSize: 13 }}>Carregando folha de ponto...</p>
        </div>
      ) : porFunc.length === 0 ? (
        <div style={{ ...card, padding: 40, textAlign: "center" }}>
          <p style={{ fontSize: 36, margin: "0 0 8px" }}>🕐</p>
          <p style={{ color: "#6b7280", fontSize: 13 }}>Nenhuma batida de ponto neste mês.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {porFunc.map((f) => {
            const exp = aberto === f.funcionario;
            return (
              <div key={f.funcionario} style={{ ...card, overflow: "hidden" }}>
                {/* cabeçalho do funcionário */}
                <div
                  onClick={() => setAberto(exp ? null : f.funcionario)}
                  style={{
                    padding: 16,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: "50%",
                        background: `linear-gradient(135deg, ${COR} 0%, #6366f1 100%)`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "white",
                        fontSize: 14,
                        fontWeight: 700,
                      }}
                    >
                      {f.funcionario.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p style={{ color: "#1f2937", fontSize: 14, fontWeight: 700, margin: 0 }}>
                        {f.funcionario}
                      </p>
                      <p style={{ color: "#9ca3af", fontSize: 11, margin: "2px 0 0" }}>
                        {f.cargo} · {f.dias.length} dia(s) com registro
                      </p>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ color: "#16a34a", fontSize: 16, fontWeight: 800 }}>
                      {fmtHoras(f.totalHoras)}
                    </span>
                    <span style={{ color: "#9ca3af", fontSize: 14 }}>{exp ? "▲" : "▼"}</span>
                  </div>
                </div>

                {/* dias do funcionário */}
                {exp && (
                  <div style={{ borderTop: "1px solid #f3f4f6", background: "#fafbfc" }}>
                    {f.dias.map((d) => (
                      <div key={d.dia} style={{ padding: "12px 16px", borderBottom: "1px solid #f3f4f6" }}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginBottom: 8,
                          }}
                        >
                          <span style={{ color: "#374151", fontSize: 13, fontWeight: 700 }}>📅 {d.dia}</span>
                          <span style={{ color: "#16a34a", fontSize: 12, fontWeight: 700 }}>
                            {fmtHoras(d.horas)} trabalhadas
                          </span>
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                          {[...d.batidas]
                            .sort((a, b) => a.data_hora.localeCompare(b.data_hora))
                            .map((b) => {
                              const cor = TIPO_COR[b.tipo] || "#6b7280";
                              const temGps = b.latitude != null && b.longitude != null;
                              const mapsUrl = temGps
                                ? `https://www.google.com/maps?q=${b.latitude},${b.longitude}`
                                : null;
                              return (
                                <div
                                  key={b.id}
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                    background: "#ffffff",
                                    border: `1px solid ${cor}30`,
                                    borderRadius: 10,
                                    padding: "6px 10px",
                                  }}
                                >
                                  <span
                                    style={{ width: 8, height: 8, borderRadius: "50%", background: cor }}
                                  />
                                  <div>
                                    <p style={{ color: "#1f2937", fontSize: 13, fontWeight: 700, margin: 0 }}>
                                      {horaFmt(b.data_hora)}
                                    </p>
                                    <p style={{ color: "#9ca3af", fontSize: 10, margin: 0 }}>{b.tipo}</p>
                                  </div>
                                  {mapsUrl ? (
                                    <a
                                      href={mapsUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      title="Ver no mapa onde bateu"
                                      style={{ textDecoration: "none", fontSize: 15, marginLeft: 2 }}
                                    >
                                      📍
                                    </a>
                                  ) : (
                                    <span title="Sem localização" style={{ fontSize: 13, opacity: 0.4 }}>
                                      🚫
                                    </span>
                                  )}
                                  {b.selfie_url ? (
                                    <img
                                      src={b.selfie_url}
                                      alt="selfie"
                                      onClick={() => setFotoModal({ url: b.selfie_url!, mapsUrl })}
                                      title="Ver a selfie da batida"
                                      style={{
                                        width: 30,
                                        height: 30,
                                        borderRadius: 8,
                                        objectFit: "cover",
                                        cursor: "pointer",
                                        border: "2px solid #fff",
                                        boxShadow: "0 1px 4px rgba(0,0,0,0.18)",
                                        marginLeft: 2,
                                      }}
                                    />
                                  ) : (
                                    <span title="Sem selfie" style={{ fontSize: 13, opacity: 0.4 }}>
                                      📷
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* LIGHTBOX DA SELFIE */}
      {fotoModal && (
        <div
          onClick={() => setFotoModal(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.8)",
            backdropFilter: "blur(4px)",
            zIndex: 4000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ ...card, maxWidth: 380, width: "100%", overflow: "hidden" }}
          >
            <img src={fotoModal.url} alt="selfie do ponto" style={{ width: "100%", display: "block" }} />
            <div
              style={{
                padding: 14,
                display: "flex",
                gap: 10,
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              {fotoModal.mapsUrl ? (
                <a
                  href={fotoModal.mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: COR_TEXTO, fontSize: 13, fontWeight: 700, textDecoration: "none" }}
                >
                  📍 Ver no mapa onde bateu
                </a>
              ) : (
                <span style={{ color: "#9ca3af", fontSize: 13 }}>Sem localização</span>
              )}
              <button
                onClick={() => setFotoModal(null)}
                style={{
                  background: "#f3f4f6",
                  border: "none",
                  color: "#374151",
                  borderRadius: 8,
                  padding: "7px 14px",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}