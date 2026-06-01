"use client";
import { useState, useMemo, useEffect } from "react";
import { supabase } from "../../../lib/supabase";
// 🧑‍💼 RH · Encargos (CONECTADO — lê 'folha_itens' p/ base bruta real; calcula com % fixos; sem tabela própria)
const COR = "#4f46e5";
const card = {
  background: "#ffffff",
  borderRadius: 14,
  border: "1px solid #e5e7eb",
  boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
};
const real = (v: number) => (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const ENCARGOS = [
  { nome: "INSS Patronal", pct: 20, cor: "#6366f1" },
  { nome: "FGTS", pct: 8, cor: "#0ea5e9" },
  { nome: "RAT (risco)", pct: 2, cor: "#f59e0b" },
  { nome: "Terceiros (Sistema S)", pct: 5.8, cor: "#8b5cf6" },
  { nome: "Provisão 13º", pct: 8.33, cor: "#ec4899" },
  { nome: "Provisão Férias + 1/3", pct: 11.11, cor: "#14b8a6" },
];
export function EncargosSection() {
  const [todos, setTodos] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [comp, setComp] = useState("");
  const carregar = async () => {
    setCarregando(true);
    const { data, error } = await supabase.from("folha_itens").select("competencia, base, proventos");
    if (error) {
      console.error(error);
      alert("Erro: " + error.message);
      setCarregando(false);
      return;
    }
    setTodos(data || []);
    const comps = Array.from(new Set((data || []).map((r: any) => r.competencia).filter(Boolean)))
      .sort()
      .reverse();
    if (comps.length && !comp) setComp(comps[0] as string);
    setCarregando(false);
  };
  useEffect(() => {
    carregar();
  }, []);
  const competencias = useMemo(
    () =>
      Array.from(new Set(todos.map((r) => r.competencia).filter(Boolean)))
        .sort()
        .reverse(),
    [todos]
  );
  const baseBruta = useMemo(
    () =>
      todos
        .filter((r) => r.competencia === comp)
        .reduce((s, r) => s + (Number(r.base) || 0) + (Number(r.proventos) || 0), 0),
    [todos, comp]
  );
  const linhas = useMemo(
    () => ENCARGOS.map((e) => ({ ...e, valor: baseBruta * (e.pct / 100) })),
    [baseBruta]
  );
  const totalEncargos = useMemo(() => linhas.reduce((s, l) => s + l.valor, 0), [linhas]);
  const custoTotal = baseBruta + totalEncargos;
  const pctSobreFolha = baseBruta ? (totalEncargos / baseBruta) * 100 : 0;
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
            <span style={{ filter: "saturate(0) brightness(2)" }}>📑</span>
          </div>
          <div>
            <h1 style={{ color: "#1f2937", fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: -0.3 }}>
              Encargos Trabalhistas
            </h1>
            <p style={{ color: "#6b7280", fontSize: 12, margin: "2px 0 0" }}>
              Calculados sobre a folha bruta da competência
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
      {carregando ? (
        <div style={{ ...card, padding: 40, textAlign: "center" }}>
          <p style={{ color: "#6b7280", fontSize: 13 }}>Carregando...</p>
        </div>
      ) : baseBruta === 0 ? (
        <div style={{ ...card, padding: 40, textAlign: "center" }}>
          <p style={{ fontSize: 36, margin: "0 0 8px" }}>📭</p>
          <p style={{ color: "#6b7280", fontSize: 13 }}>
            Sem folha lançada para calcular encargos. Lance itens na tela <b>Folha</b>.
          </p>
        </div>
      ) : (
        <>
          <div
            style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}
          >
            {[
              { label: "Folha bruta", value: real(baseBruta), cor: "#6366f1", icon: "💼" },
              { label: "Total de encargos", value: real(totalEncargos), cor: "#dc2626", icon: "📑" },
              { label: "Custo total", value: real(custoTotal), cor: "#16a34a", icon: "💰" },
              { label: "% sobre a folha", value: pctSobreFolha.toFixed(1) + "%", cor: "#f59e0b", icon: "📈" },
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
                <p style={{ color: s.cor, fontSize: 18, fontWeight: 800, margin: 0, letterSpacing: -0.5 }}>
                  {s.value}
                </p>
              </div>
            ))}
          </div>
          <div style={{ ...card, padding: 20 }}>
            <p style={{ color: "#1f2937", fontSize: 14, fontWeight: 800, margin: "0 0 16px" }}>
              Composição dos encargos
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {linhas.map((l) => {
                const pctBar = totalEncargos ? (l.valor / totalEncargos) * 100 : 0;
                return (
                  <div key={l.nome}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                      <span style={{ color: "#4b5563", fontSize: 13, fontWeight: 600 }}>
                        {l.nome} <span style={{ color: "#9ca3af", fontWeight: 400 }}>({l.pct}%)</span>
                      </span>
                      <span style={{ color: "#1f2937", fontSize: 13, fontWeight: 700 }}>{real(l.valor)}</span>
                    </div>
                    <div style={{ height: 8, background: "#f1f5f9", borderRadius: 5, overflow: "hidden" }}>
                      <div
                        style={{ height: "100%", width: `${pctBar}%`, background: l.cor, borderRadius: 5 }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}