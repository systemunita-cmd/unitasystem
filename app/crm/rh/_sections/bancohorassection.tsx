"use client";
import { useState, useMemo, useEffect } from "react";
import { supabase } from "../../../lib/supabase";
// 🧑‍💼 RH · Banco de Horas (CONECTADO — 'banco_horas' lançamentos; saldo = soma de horas por funcionário)
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
  padding: "10px 14px",
  color: "#1f2937",
  fontSize: 13,
  boxSizing: "border-box" as const,
  outline: "none",
};
const dataBR = (iso: string) => {
  if (!iso) return "—";
  try {
    return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR");
  } catch {
    return iso;
  }
};
const hh = (h: number) => `${h >= 0 ? "+" : ""}${(h || 0).toFixed(1)}h`;
type Lanc = { id: string; funcionario: string; data: string; descricao: string; horas: number };
const FORM_VAZIO: Lanc = { id: "", funcionario: "", data: "", descricao: "", horas: 0 };
export function BancoHorasSection() {
  const [lancs, setLancs] = useState<Lanc[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [aberto, setAberto] = useState<string | null>(null);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState<Lanc>(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const carregar = async () => {
    setCarregando(true);
    const { data, error } = await supabase
      .from("banco_horas")
      .select("*")
      .order("data", { ascending: false });
    if (error) {
      console.error(error);
      alert("Erro: " + error.message);
    } else
      setLancs(
        (data || []).map((r: any) => ({
          id: r.id,
          funcionario: r.funcionario,
          data: r.data || "",
          descricao: r.descricao || "",
          horas: Number(r.horas) || 0,
        }))
      );
    setCarregando(false);
  };
  useEffect(() => {
    carregar();
  }, []);
  const saldos = useMemo(() => {
    const m: Record<string, number> = {};
    lancs.forEach((l) => {
      m[l.funcionario] = (m[l.funcionario] || 0) + l.horas;
    });
    return Object.entries(m)
      .map(([funcionario, saldo]) => ({ funcionario, saldo }))
      .sort((a, b) => b.saldo - a.saldo);
  }, [lancs]);
  const totalPos = useMemo(
    () => saldos.filter((s) => s.saldo > 0).reduce((a, s) => a + s.saldo, 0),
    [saldos]
  );
  const totalNeg = useMemo(
    () => saldos.filter((s) => s.saldo < 0).reduce((a, s) => a + s.saldo, 0),
    [saldos]
  );
  const salvar = async () => {
    if (!form.funcionario.trim()) {
      alert("Informe o colaborador.");
      return;
    }
    setSalvando(true);
    const payload = {
      funcionario: form.funcionario,
      data: form.data || null,
      descricao: form.descricao,
      horas: form.horas || 0,
    };
    const { error } = await supabase.from("banco_horas").insert(payload);
    setSalvando(false);
    if (error) {
      alert("Erro: " + error.message);
      return;
    }
    setModal(false);
    setForm(FORM_VAZIO);
    carregar();
  };
  const excluir = async (l: Lanc) => {
    if (!confirm("Remover este lançamento?")) return;
    const { error } = await supabase.from("banco_horas").delete().eq("id", l.id);
    if (error) {
      alert("Erro: " + error.message);
      return;
    }
    carregar();
  };
  const set = (k: keyof Lanc, v: any) => setForm((f) => ({ ...f, [k]: v }));
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
            <span style={{ filter: "saturate(0) brightness(2)" }}>🕐</span>
          </div>
          <div>
            <h1 style={{ color: "#1f2937", fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: -0.3 }}>
              Banco de Horas
            </h1>
            <p style={{ color: "#6b7280", fontSize: 12, margin: "2px 0 0" }}>
              Saldos e extrato de horas por colaborador
            </p>
          </div>
        </div>
        <button
          onClick={() => {
            setForm(FORM_VAZIO);
            setModal(true);
          }}
          style={{
            background: `linear-gradient(135deg, ${COR} 0%, #6366f1 100%)`,
            color: "white",
            border: "none",
            borderRadius: 12,
            padding: "11px 20px",
            fontSize: 13,
            cursor: "pointer",
            fontWeight: 700,
            boxShadow: `0 4px 12px ${COR}40`,
            whiteSpace: "nowrap",
          }}
        >
          + Lançar Horas
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
        {[
          { label: "Colaboradores", value: String(saldos.length), cor: "#6366f1", icon: "👥" },
          { label: "Saldo positivo", value: hh(totalPos), cor: "#16a34a", icon: "➕" },
          { label: "Saldo negativo", value: hh(totalNeg), cor: "#dc2626", icon: "➖" },
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
          <p style={{ color: "#6b7280", fontSize: 13 }}>Carregando...</p>
        </div>
      ) : saldos.length === 0 ? (
        <div style={{ ...card, padding: 40, textAlign: "center" }}>
          <p style={{ fontSize: 36, margin: "0 0 8px" }}>📭</p>
          <p style={{ color: "#6b7280", fontSize: 13 }}>Nenhum lançamento de horas ainda.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {saldos.map((s) => {
            const exp = aberto === s.funcionario;
            const extrato = lancs.filter((l) => l.funcionario === s.funcionario);
            return (
              <div key={s.funcionario} style={{ ...card, overflow: "hidden" }}>
                <div
                  onClick={() => setAberto(exp ? null : s.funcionario)}
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
                      {s.funcionario.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p style={{ color: "#1f2937", fontSize: 14, fontWeight: 700, margin: 0 }}>
                        {s.funcionario}
                      </p>
                      <p style={{ color: "#9ca3af", fontSize: 11, margin: "2px 0 0" }}>
                        {extrato.length} lançamento(s)
                      </p>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span
                      style={{ color: s.saldo >= 0 ? "#16a34a" : "#dc2626", fontSize: 18, fontWeight: 800 }}
                    >
                      {hh(s.saldo)}
                    </span>
                    <span style={{ color: "#9ca3af", fontSize: 14 }}>{exp ? "▲" : "▼"}</span>
                  </div>
                </div>
                {exp && (
                  <div style={{ borderTop: "1px solid #f3f4f6", background: "#fafbfc" }}>
                    {extrato.map((l) => (
                      <div
                        key={l.id}
                        style={{
                          padding: "10px 16px",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          borderBottom: "1px solid #f3f4f6",
                        }}
                      >
                        <div>
                          <span style={{ color: "#4b5563", fontSize: 13 }}>{l.descricao}</span>
                          <span style={{ color: "#9ca3af", fontSize: 11, marginLeft: 8 }}>
                            {dataBR(l.data)}
                          </span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span
                            style={{
                              color: l.horas >= 0 ? "#16a34a" : "#dc2626",
                              fontSize: 13,
                              fontWeight: 700,
                            }}
                          >
                            {hh(l.horas)}
                          </span>
                          <button
                            onClick={() => excluir(l)}
                            style={{
                              background: "#fef2f2",
                              color: "#dc2626",
                              border: "1px solid #fecaca",
                              borderRadius: 7,
                              padding: "3px 8px",
                              fontSize: 11,
                              cursor: "pointer",
                            }}
                          >
                            🗑️
                          </button>
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
      {modal && (
        <div
          onClick={() => setModal(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.5)",
            backdropFilter: "blur(4px)",
            zIndex: 2000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ ...card, width: "100%", maxWidth: 480, overflow: "hidden" }}
          >
            <div
              style={{
                padding: "18px 24px",
                borderBottom: "1px solid #e5e7eb",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h3 style={{ color: "#1f2937", fontSize: 16, fontWeight: 700, margin: 0 }}>Lançar Horas</h3>
              <button
                onClick={() => setModal(false)}
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
            <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
              <Campo label="Colaborador">
                <input
                  value={form.funcionario}
                  onChange={(e) => set("funcionario", e.target.value)}
                  style={inputStyle}
                  placeholder="Nome"
                />
              </Campo>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Campo label="Data">
                  <input
                    type="date"
                    value={form.data}
                    onChange={(e) => set("data", e.target.value)}
                    style={inputStyle}
                  />
                </Campo>
                <Campo label="Horas (+ crédito / - débito)">
                  <input
                    type="number"
                    step="0.5"
                    value={form.horas || ""}
                    onChange={(e) => set("horas", Number(e.target.value))}
                    style={inputStyle}
                    placeholder="Ex: 2 ou -1.5"
                  />
                </Campo>
              </div>
              <Campo label="Descrição">
                <input
                  value={form.descricao}
                  onChange={(e) => set("descricao", e.target.value)}
                  style={inputStyle}
                  placeholder="Ex: Hora extra sábado"
                />
              </Campo>
            </div>
            <div
              style={{
                padding: "14px 24px",
                borderTop: "1px solid #e5e7eb",
                display: "flex",
                gap: 10,
                justifyContent: "flex-end",
                background: "#f9fafb",
              }}
            >
              <button
                onClick={() => setModal(false)}
                style={{
                  background: "#ffffff",
                  color: "#374151",
                  border: "1px solid #e5e7eb",
                  borderRadius: 10,
                  padding: "9px 18px",
                  fontSize: 13,
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                Cancelar
              </button>
              <button
                onClick={salvar}
                disabled={salvando}
                style={{
                  background: `linear-gradient(135deg, ${COR} 0%, #6366f1 100%)`,
                  color: "white",
                  border: "none",
                  borderRadius: 10,
                  padding: "9px 22px",
                  fontSize: 13,
                  cursor: salvando ? "wait" : "pointer",
                  fontWeight: 700,
                  opacity: salvando ? 0.7 : 1,
                }}
              >
                {salvando ? "Salvando..." : "+ Lançar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
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
        {label}
      </label>
      {children}
    </div>
  );
}