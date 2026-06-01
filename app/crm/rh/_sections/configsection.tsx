"use client";
import { useState, useEffect } from "react";
import { supabase } from "../../../lib/supabase";
// 🧑‍💼 RH · Configurações (CONECTADO — 'rh_config' id=1, coluna jsonb 'config')
const COR = "#4f46e5";
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
  padding: "10px 14px",
  color: "#1f2937",
  fontSize: 13,
  boxSizing: "border-box" as const,
  outline: "none",
};
type Cfg = {
  jornadaSemanal: number;
  diaPagamento: number;
  toleranciaPonto: number;
  inssPatronal: number;
  fgts: number;
  rat: number;
  terceiros: number;
  avisoFeriasDias: number;
};
const PADRAO: Cfg = {
  jornadaSemanal: 44,
  diaPagamento: 5,
  toleranciaPonto: 10,
  inssPatronal: 20,
  fgts: 8,
  rat: 2,
  terceiros: 5.8,
  avisoFeriasDias: 60,
};
export function ConfigSection() {
  const [cfg, setCfg] = useState<Cfg>(PADRAO);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [ok, setOk] = useState(false);
  const carregar = async () => {
    setCarregando(true);
    const { data, error } = await supabase.from("rh_config").select("config").eq("id", 1).maybeSingle();
    if (error) {
      console.error(error);
    } else if (data && data.config) setCfg({ ...PADRAO, ...data.config });
    setCarregando(false);
  };
  useEffect(() => {
    carregar();
  }, []);
  const salvar = async () => {
    setSalvando(true);
    setOk(false);
    const { error } = await supabase
      .from("rh_config")
      .upsert({ id: 1, config: cfg, updated_at: new Date().toISOString() });
    setSalvando(false);
    if (error) {
      alert("Erro ao salvar: " + error.message);
      return;
    }
    setOk(true);
    setTimeout(() => setOk(false), 2500);
  };
  const set = (k: keyof Cfg, v: number) => setCfg((c) => ({ ...c, [k]: v }));
  const GRUPOS: {
    titulo: string;
    icon: string;
    campos: { k: keyof Cfg; label: string; sufixo?: string }[];
  }[] = [
    {
      titulo: "Jornada & Ponto",
      icon: "⏰",
      campos: [
        { k: "jornadaSemanal", label: "Jornada semanal", sufixo: "h" },
        { k: "toleranciaPonto", label: "Tolerância de ponto", sufixo: "min" },
      ],
    },
    {
      titulo: "Pagamento",
      icon: "💵",
      campos: [
        { k: "diaPagamento", label: "Dia do pagamento" },
        { k: "avisoFeriasDias", label: "Aviso de férias", sufixo: "dias" },
      ],
    },
    {
      titulo: "Encargos (%)",
      icon: "📑",
      campos: [
        { k: "inssPatronal", label: "INSS Patronal", sufixo: "%" },
        { k: "fgts", label: "FGTS", sufixo: "%" },
        { k: "rat", label: "RAT", sufixo: "%" },
        { k: "terceiros", label: "Terceiros", sufixo: "%" },
      ],
    },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
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
            <span style={{ filter: "saturate(0) brightness(2)" }}>⚙️</span>
          </div>
          <div>
            <h1 style={{ color: "#1f2937", fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: -0.3 }}>
              Configurações do RH
            </h1>
            <p style={{ color: "#6b7280", fontSize: 12, margin: "2px 0 0" }}>
              Parâmetros usados nos cálculos do módulo
            </p>
          </div>
        </div>
        <button
          onClick={salvar}
          disabled={salvando || carregando}
          style={{
            background: ok ? "#f0fdf4" : `linear-gradient(135deg, ${COR} 0%, #6366f1 100%)`,
            color: ok ? "#16a34a" : "white",
            border: ok ? "1px solid #bbf7d0" : "none",
            borderRadius: 12,
            padding: "11px 20px",
            fontSize: 13,
            cursor: salvando ? "wait" : "pointer",
            fontWeight: 700,
            whiteSpace: "nowrap",
          }}
        >
          {ok ? "✅ Salvo!" : salvando ? "Salvando..." : "💾 Salvar"}
        </button>
      </div>
      {carregando ? (
        <div style={{ ...card, padding: 40, textAlign: "center" }}>
          <p style={{ color: "#6b7280", fontSize: 13 }}>Carregando configurações...</p>
        </div>
      ) : (
        <div
          style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14 }}
        >
          {GRUPOS.map((g) => (
            <div key={g.titulo} style={{ ...card, padding: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: "#eef2ff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 18,
                  }}
                >
                  {g.icon}
                </div>
                <h3 style={{ color: "#1f2937", fontSize: 15, fontWeight: 800, margin: 0 }}>{g.titulo}</h3>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {g.campos.map((c) => (
                  <div key={c.k}>
                    <label
                      style={{
                        color: "#6b7280",
                        fontSize: 11,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: 0.5,
                        display: "block",
                        marginBottom: 6,
                      }}
                    >
                      {c.label}
                    </label>
                    <div style={{ position: "relative" }}>
                      <input
                        type="number"
                        step="0.01"
                        value={cfg[c.k]}
                        onChange={(e) => set(c.k, Number(e.target.value))}
                        style={inputStyle}
                      />
                      {c.sufixo && (
                        <span
                          style={{
                            position: "absolute",
                            right: 14,
                            top: "50%",
                            transform: "translateY(-50%)",
                            color: "#9ca3af",
                            fontSize: 12,
                            fontWeight: 600,
                            pointerEvents: "none",
                          }}
                        >
                          {c.sufixo}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}