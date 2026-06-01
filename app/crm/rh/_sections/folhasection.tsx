"use client";
import { useState, useMemo, useEffect } from "react";
import { supabase } from "../../../lib/supabase";
// 🧑‍💼 RH · Folha de Pagamento (CONECTADO — 'folha_itens' por competência; marcar paga = update status)
const COR = "#4f46e5";
const COR_TEXTO = "#4338ca";
const card = {
  background: "#ffffff",
  borderRadius: 14,
  border: "1px solid #e5e7eb",
  boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
};
const real = (v: number) => (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
type Item = {
  id: string;
  competencia: string;
  nome: string;
  cargo: string;
  base: number;
  proventos: number;
  inss: number;
  irrf: number;
  outros: number;
  status: string;
};
const bruto = (i: Item) => i.base + i.proventos;
const descontos = (i: Item) => i.inss + i.irrf + i.outros;
const liquido = (i: Item) => bruto(i) - descontos(i);
export function FolhaSection() {
  const [todos, setTodos] = useState<Item[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [comp, setComp] = useState("");
  const [processando, setProcessando] = useState(false);
  const carregar = async () => {
    setCarregando(true);
    const { data, error } = await supabase.from("folha_itens").select("*").order("nome", { ascending: true });
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
      base: Number(r.base) || 0,
      proventos: Number(r.proventos) || 0,
      inss: Number(r.inss) || 0,
      irrf: Number(r.irrf) || 0,
      outros: Number(r.outros) || 0,
      status: r.status || "pendente",
    })) as Item[];
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
  const itens = useMemo(() => todos.filter((i) => i.competencia === comp), [todos, comp]);
  const tot = useMemo(
    () =>
      itens.reduce(
        (a, i) => ({ bruto: a.bruto + bruto(i), desc: a.desc + descontos(i), liq: a.liq + liquido(i) }),
        { bruto: 0, desc: 0, liq: 0 }
      ),
    [itens]
  );
  const todosPagos = itens.length > 0 && itens.every((i) => i.status === "pago");
  const marcarPagas = async () => {
    if (!comp || itens.length === 0) return;
    if (!confirm(`Marcar a folha de ${comp} como paga?`)) return;
    setProcessando(true);
    const { error } = await supabase.from("folha_itens").update({ status: "pago" }).eq("competencia", comp);
    setProcessando(false);
    if (error) {
      alert("Erro: " + error.message);
      return;
    }
    carregar();
  };
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
            <span style={{ filter: "saturate(0) brightness(2)" }}>💵</span>
          </div>
          <div>
            <h1 style={{ color: "#1f2937", fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: -0.3 }}>
              Folha de Pagamento
            </h1>
            <p style={{ color: "#6b7280", fontSize: 12, margin: "2px 0 0" }}>
              Demonstrativo da folha por competência
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
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
          <button
            onClick={marcarPagas}
            disabled={processando || todosPagos || itens.length === 0}
            style={{
              background: todosPagos ? "#f0fdf4" : `linear-gradient(135deg, ${COR} 0%, #6366f1 100%)`,
              color: todosPagos ? "#16a34a" : "white",
              border: todosPagos ? "1px solid #bbf7d0" : "none",
              borderRadius: 12,
              padding: "11px 20px",
              fontSize: 13,
              cursor: processando || todosPagos || itens.length === 0 ? "default" : "pointer",
              fontWeight: 700,
              whiteSpace: "nowrap",
              opacity: itens.length === 0 ? 0.5 : 1,
            }}
          >
            {todosPagos ? "✅ Folha paga" : processando ? "Processando..." : "💸 Marcar como paga"}
          </button>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 14 }}>
        {[
          { label: "Total bruto", value: real(tot.bruto), cor: "#6366f1", icon: "📊" },
          { label: "Descontos", value: real(tot.desc), cor: "#dc2626", icon: "➖" },
          { label: "Líquido a pagar", value: real(tot.liq), cor: "#16a34a", icon: "💰" },
          { label: "Colaboradores", value: String(itens.length), cor: "#f59e0b", icon: "👥" },
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
      {carregando ? (
        <div style={{ ...card, padding: 40, textAlign: "center" }}>
          <p style={{ color: "#6b7280", fontSize: 13 }}>Carregando folha...</p>
        </div>
      ) : itens.length === 0 ? (
        <div style={{ ...card, padding: 40, textAlign: "center" }}>
          <p style={{ fontSize: 36, margin: "0 0 8px" }}>📭</p>
          <p style={{ color: "#6b7280", fontSize: 13 }}>
            {todos.length === 0 ? "Nenhum item de folha lançado ainda." : "Sem itens nesta competência."}
          </p>
        </div>
      ) : (
        <div style={{ ...card, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f9fafb" }}>
                  {["Colaborador", "Base", "Proventos", "INSS", "IRRF", "Outros", "Líquido", "Status"].map(
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
                {itens.map((it, i) => (
                  <tr
                    key={it.id}
                    style={{
                      borderTop: "1px solid #f3f4f6",
                      background: i % 2 === 0 ? "#ffffff" : "#fafbfc",
                    }}
                  >
                    <td style={{ padding: "12px 16px" }}>
                      <p style={{ color: "#1f2937", fontSize: 13, fontWeight: 700, margin: 0 }}>{it.nome}</p>
                      <p style={{ color: "#9ca3af", fontSize: 11, margin: "2px 0 0" }}>{it.cargo}</p>
                    </td>
                    <td style={{ padding: "12px 16px", color: "#4b5563", fontSize: 12, textAlign: "right" }}>
                      {real(it.base)}
                    </td>
                    <td style={{ padding: "12px 16px", color: "#16a34a", fontSize: 12, textAlign: "right" }}>
                      {real(it.proventos)}
                    </td>
                    <td style={{ padding: "12px 16px", color: "#dc2626", fontSize: 12, textAlign: "right" }}>
                      {real(it.inss)}
                    </td>
                    <td style={{ padding: "12px 16px", color: "#dc2626", fontSize: 12, textAlign: "right" }}>
                      {real(it.irrf)}
                    </td>
                    <td style={{ padding: "12px 16px", color: "#dc2626", fontSize: 12, textAlign: "right" }}>
                      {real(it.outros)}
                    </td>
                    <td
                      style={{
                        padding: "12px 16px",
                        color: "#1f2937",
                        fontSize: 12,
                        fontWeight: 800,
                        textAlign: "right",
                      }}
                    >
                      {real(liquido(it))}
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "right" }}>
                      <span
                        style={{
                          background: it.status === "pago" ? "#f0fdf4" : "#fffbeb",
                          color: it.status === "pago" ? "#16a34a" : "#f59e0b",
                          border: `1px solid ${it.status === "pago" ? "#bbf7d0" : "#fde68a"}`,
                          fontSize: 11,
                          padding: "3px 10px",
                          borderRadius: 10,
                          fontWeight: 700,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {it.status === "pago" ? "Pago" : "Pendente"}
                      </span>
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