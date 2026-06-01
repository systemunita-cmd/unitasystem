"use client";
import { useState, useMemo, useEffect } from "react";
import { supabase } from "../../../lib/supabase";
// 🧑‍💼 RH · Ponto (CONECTADO — 'ponto' por competência; leitura)
const COR = "#4f46e5";
const card = {
  background: "#ffffff",
  borderRadius: 14,
  border: "1px solid #e5e7eb",
  boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
};
type Ponto = {
  id: string;
  competencia: string;
  nome: string;
  cargo: string;
  previstas: number;
  trabalhadas: number;
  extras: number;
  atrasosMin: number;
  faltas: number;
  saldoBanco: number;
};
const hm = (min: number) => {
  const s = min < 0 ? "-" : "";
  const a = Math.abs(min);
  return `${s}${Math.floor(a / 60)}h${String(a % 60).padStart(2, "0")}`;
};
export function PontoSection() {
  const [todos, setTodos] = useState<Ponto[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [comp, setComp] = useState("");
  const carregar = async () => {
    setCarregando(true);
    const { data, error } = await supabase.from("ponto").select("*").order("nome", { ascending: true });
    if (error) {
      console.error(error);
      alert("Erro: " + error.message);
      setCarregando(false);
      return;
    }
    const items = (data || []).map((r: any) => ({
      id: r.id,
      competencia: r.competencia || "",
      nome: r.nome,
      cargo: r.cargo || "",
      previstas: Number(r.previstas) || 0,
      trabalhadas: Number(r.trabalhadas) || 0,
      extras: Number(r.extras) || 0,
      atrasosMin: Number(r.atrasos_min) || 0,
      faltas: Number(r.faltas) || 0,
      saldoBanco: Number(r.saldo_banco) || 0,
    })) as Ponto[];
    setTodos(items);
    const comps = Array.from(new Set(items.map((i) => i.competencia)))
      .sort()
      .reverse();
    if (comps.length && !comp) setComp(comps[0]);
    setCarregando(false);
  };
  useEffect(() => {
    carregar();
  }, []);
  const competencias = useMemo(
    () =>
      Array.from(new Set(todos.map((i) => i.competencia)))
        .sort()
        .reverse(),
    [todos]
  );
  const itens = useMemo(() => todos.filter((p) => p.competencia === comp), [todos, comp]);
  const tot = useMemo(
    () =>
      itens.reduce(
        (a, p) => ({
          extras: a.extras + p.extras,
          faltas: a.faltas + p.faltas,
          atrasos: a.atrasos + p.atrasosMin,
        }),
        { extras: 0, faltas: 0, atrasos: 0 }
      ),
    [itens]
  );
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
            <span style={{ filter: "saturate(0) brightness(2)" }}>⏰</span>
          </div>
          <div>
            <h1 style={{ color: "#1f2937", fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: -0.3 }}>
              Controle de Ponto
            </h1>
            <p style={{ color: "#6b7280", fontSize: 12, margin: "2px 0 0" }}>
              Espelho de ponto por competência
            </p>
          </div>
        </div>
        {competencias.length > 0 && (
          <select
            value={comp}
            onChange={(e) => setComp(e.target.value)}
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
          >
            {competencias.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
        {[
          { label: "Horas extras", value: hm(tot.extras), cor: "#16a34a", icon: "➕" },
          { label: "Atrasos", value: hm(tot.atrasos), cor: "#f59e0b", icon: "⏳" },
          { label: "Faltas", value: String(tot.faltas), cor: "#dc2626", icon: "🚫" },
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
      ) : itens.length === 0 ? (
        <div style={{ ...card, padding: 40, textAlign: "center" }}>
          <p style={{ fontSize: 36, margin: "0 0 8px" }}>📭</p>
          <p style={{ color: "#6b7280", fontSize: 13 }}>
            {todos.length === 0 ? "Nenhum registro de ponto ainda." : "Sem registros nesta competência."}
          </p>
        </div>
      ) : (
        <div style={{ ...card, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f9fafb" }}>
                  {["Colaborador", "Previstas", "Trabalhadas", "Extras", "Atrasos", "Faltas", "Banco h."].map(
                    (h) => (
                      <th
                        key={h}
                        style={{
                          padding: "12px 16px",
                          color: "#6b7280",
                          fontSize: 11,
                          textAlign: h === "Colaborador" ? "left" : "right",
                          textTransform: "uppercase",
                          letterSpacing: 0.5,
                          whiteSpace: "nowrap",
                          fontWeight: 700,
                          borderBottom: "1px solid #e5e7eb",
                        }}
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {itens.map((p, i) => (
                  <tr
                    key={p.id}
                    style={{
                      borderTop: "1px solid #f3f4f6",
                      background: i % 2 === 0 ? "#ffffff" : "#fafbfc",
                    }}
                  >
                    <td style={{ padding: "12px 16px" }}>
                      <p style={{ color: "#1f2937", fontSize: 13, fontWeight: 700, margin: 0 }}>{p.nome}</p>
                      <p style={{ color: "#9ca3af", fontSize: 11, margin: "2px 0 0" }}>{p.cargo}</p>
                    </td>
                    <td style={{ padding: "12px 16px", color: "#6b7280", fontSize: 12, textAlign: "right" }}>
                      {hm(p.previstas)}
                    </td>
                    <td
                      style={{
                        padding: "12px 16px",
                        color: "#1f2937",
                        fontSize: 12,
                        textAlign: "right",
                        fontWeight: 600,
                      }}
                    >
                      {hm(p.trabalhadas)}
                    </td>
                    <td style={{ padding: "12px 16px", color: "#16a34a", fontSize: 12, textAlign: "right" }}>
                      {hm(p.extras)}
                    </td>
                    <td style={{ padding: "12px 16px", color: "#f59e0b", fontSize: 12, textAlign: "right" }}>
                      {hm(p.atrasosMin)}
                    </td>
                    <td
                      style={{
                        padding: "12px 16px",
                        color: p.faltas > 0 ? "#dc2626" : "#9ca3af",
                        fontSize: 12,
                        textAlign: "right",
                        fontWeight: 600,
                      }}
                    >
                      {p.faltas}
                    </td>
                    <td
                      style={{
                        padding: "12px 16px",
                        textAlign: "right",
                        fontSize: 12,
                        fontWeight: 700,
                        color: p.saldoBanco >= 0 ? "#16a34a" : "#dc2626",
                      }}
                    >
                      {hm(p.saldoBanco)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}