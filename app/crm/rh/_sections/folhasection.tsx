"use client";
import { useState, useMemo, useEffect } from "react";
import { supabase } from "../../../lib/supabase";

// ═══════════════════════════════════════════════════════════════════════
// 🧑‍💼 RH · Folha de Pagamento  (CONECTADO — 'folha_itens' por competência)
// ───────────────────────────────────────────────────────────────────────
// - "Gerar folha" puxa os funcionários ativos e cria os itens da competência
//   (base = salário, INSS/IRRF calculados automaticamente).
// - Comissão editável por funcionário, mês a mês. Ao editar base/comissão,
//   o INSS e o IRRF recalculam sozinhos. Líquido em tempo real.
// - "Salvar alterações" grava tudo. "Marcar como paga" fecha a competência.
// Requer a coluna: alter table folha_itens add column if not exists comissao numeric default 0;
// ═══════════════════════════════════════════════════════════════════════

const COR = "#4f46e5";
const COR_TEXTO = "#4338ca";
const card = {
  background: "#ffffff",
  borderRadius: 14,
  border: "1px solid #e5e7eb",
  boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
};
const real = (v: number) => (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// ── Tabelas de cálculo (referência 2025 — ajustáveis se mudarem) ──────────
function calcINSS(base: number): number {
  const b = Math.min(base, 8157.41); // teto
  let v: number;
  if (b <= 1518.0) v = b * 0.075;
  else if (b <= 2793.88) v = b * 0.09 - 22.77;
  else if (b <= 4190.83) v = b * 0.12 - 106.59;
  else v = b * 0.14 - 190.4;
  return Math.max(0, Math.round(v * 100) / 100);
}
function calcIRRF(baseCalc: number): number {
  let v: number;
  if (baseCalc <= 2259.2) v = 0;
  else if (baseCalc <= 2826.65) v = baseCalc * 0.075 - 169.44;
  else if (baseCalc <= 3751.05) v = baseCalc * 0.15 - 381.44;
  else if (baseCalc <= 4664.68) v = baseCalc * 0.225 - 662.77;
  else v = baseCalc * 0.275 - 896.0;
  return Math.max(0, Math.round(v * 100) / 100);
}

// competência interna no formato "AAAA-MM"; exibição "Mês/AAAA"
const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];
function fmtComp(c: string) {
  const [ano, mes] = (c || "").split("-");
  const i = Number(mes) - 1;
  if (!ano || isNaN(i) || !MESES[i]) return c;
  return `${MESES[i]}/${ano}`;
}
function compAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

type Item = {
  id: string;
  competencia: string;
  nome: string;
  cargo: string;
  base: number;
  comissao: number;
  inss: number;
  irrf: number;
  outros: number;
  status: string;
};

const bruto = (i: Item) => i.base + i.comissao;
const descontos = (i: Item) => i.inss + i.irrf + i.outros;
const liquido = (i: Item) => bruto(i) - descontos(i);

export function FolhaSection() {
  const [todos, setTodos] = useState<Item[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [comp, setComp] = useState("");
  const [itens, setItens] = useState<Item[]>([]); // cópia editável da competência atual
  const [novaComp, setNovaComp] = useState(compAtual());
  const [gerando, setGerando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [processando, setProcessando] = useState(false);

  const carregar = async (manterComp?: string) => {
    setCarregando(true);
    const { data, error } = await supabase.from("folha_itens").select("*").order("nome", { ascending: true });
    if (error) {
      console.error(error);
      alert("Erro ao carregar folha: " + error.message);
      setCarregando(false);
      return;
    }
    const items = (data || []).map((r: any) => ({
      id: r.id,
      competencia: r.competencia || "",
      nome: r.nome,
      cargo: r.cargo || "",
      base: Number(r.base) || 0,
      comissao: Number(r.comissao) || 0,
      inss: Number(r.inss) || 0,
      irrf: Number(r.irrf) || 0,
      outros: Number(r.outros) || 0,
      status: r.status || "pendente",
    })) as Item[];
    setTodos(items);
    const comps = Array.from(new Set(items.map((i) => i.competencia)))
      .sort()
      .reverse();
    const alvo = manterComp || (comps.length ? comps[0] : "");
    setComp(alvo);
    setItens(items.filter((i) => i.competencia === alvo));
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

  const selecionarComp = (c: string) => {
    setComp(c);
    setItens(todos.filter((i) => i.competencia === c));
  };

  const tot = useMemo(
    () =>
      itens.reduce(
        (a, i) => ({ bruto: a.bruto + bruto(i), desc: a.desc + descontos(i), liq: a.liq + liquido(i) }),
        { bruto: 0, desc: 0, liq: 0 }
      ),
    [itens]
  );
  const todosPagos = itens.length > 0 && itens.every((i) => i.status === "pago");

  // 🔌 gerar folha a partir dos funcionários ativos
  const gerarFolha = async () => {
    if (!novaComp) {
      alert("Escolha o mês da folha.");
      return;
    }
    if (competencias.includes(novaComp)) {
      alert(`A folha de ${fmtComp(novaComp)} já existe. Selecione-a na lista acima para editar.`);
      return;
    }
    setGerando(true);
    const { data, error } = await supabase
      .from("funcionarios")
      .select("nome, cargo, salario, status")
      .neq("status", "desligado");
    if (error) {
      setGerando(false);
      alert("Erro ao buscar funcionários: " + error.message);
      return;
    }
    if (!data || data.length === 0) {
      setGerando(false);
      alert("Nenhum funcionário ativo para gerar a folha. Cadastre funcionários primeiro.");
      return;
    }
    const novos = data.map((f: any) => {
      const base = Number(f.salario) || 0;
      const inss = calcINSS(base);
      const irrf = calcIRRF(base - inss);
      return {
        competencia: novaComp,
        nome: f.nome,
        cargo: f.cargo || "",
        base,
        comissao: 0,
        proventos: 0,
        inss,
        irrf,
        outros: 0,
        status: "pendente",
      };
    });
    const ins = await supabase.from("folha_itens").insert(novos);
    setGerando(false);
    if (ins.error) {
      alert("Erro ao gerar a folha: " + ins.error.message);
      return;
    }
    carregar(novaComp);
  };

  // edição inline — recalcula INSS/IRRF quando muda base ou comissão
  const editar = (id: string, campo: "base" | "comissao" | "inss" | "irrf" | "outros", valor: number) => {
    setItens((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it;
        const novo = { ...it, [campo]: valor };
        if (campo === "base" || campo === "comissao") {
          novo.inss = calcINSS(novo.base + novo.comissao);
          novo.irrf = calcIRRF(novo.base + novo.comissao - novo.inss);
        }
        return novo;
      })
    );
  };

  // 🔌 salvar alterações da competência
  const salvar = async () => {
    setSalvando(true);
    for (const it of itens) {
      const { error } = await supabase
        .from("folha_itens")
        .update({ base: it.base, comissao: it.comissao, inss: it.inss, irrf: it.irrf, outros: it.outros })
        .eq("id", it.id);
      if (error) {
        setSalvando(false);
        alert("Erro ao salvar: " + error.message);
        return;
      }
    }
    setSalvando(false);
    carregar(comp);
  };

  // 🔌 marcar competência como paga
  const marcarPagas = async () => {
    if (!comp || itens.length === 0) return;
    if (!confirm(`Marcar a folha de ${fmtComp(comp)} como paga?`)) return;
    setProcessando(true);
    const { error } = await supabase.from("folha_itens").update({ status: "pago" }).eq("competencia", comp);
    setProcessando(false);
    if (error) {
      alert("Erro: " + error.message);
      return;
    }
    carregar(comp);
  };

  const numStyle = {
    width: 90,
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: 8,
    padding: "6px 8px",
    color: "#1f2937",
    fontSize: 12,
    textAlign: "right" as const,
    outline: "none",
  };

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
            <span style={{ filter: "saturate(0) brightness(2)" }}>💵</span>
          </div>
          <div>
            <h1 style={{ color: "#1f2937", fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: -0.3 }}>
              Folha de Pagamento
            </h1>
            <p style={{ color: "#6b7280", fontSize: 12, margin: "2px 0 0" }}>
              Gere a folha do mês e edite as comissões por colaborador
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {competencias.length > 0 && (
            <select
              value={comp}
              onChange={(e) => selecionarComp(e.target.value)}
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
                  {fmtComp(c)}
                </option>
              ))}
            </select>
          )}
          {itens.length > 0 && (
            <>
              <button
                onClick={salvar}
                disabled={salvando}
                style={{
                  background: "#ffffff",
                  color: COR_TEXTO,
                  border: "1px solid #c7d2fe",
                  borderRadius: 12,
                  padding: "11px 18px",
                  fontSize: 13,
                  cursor: salvando ? "wait" : "pointer",
                  fontWeight: 700,
                  whiteSpace: "nowrap",
                }}
              >
                {salvando ? "Salvando..." : "💾 Salvar alterações"}
              </button>
              <button
                onClick={marcarPagas}
                disabled={processando || todosPagos}
                style={{
                  background: todosPagos ? "#f0fdf4" : `linear-gradient(135deg, ${COR} 0%, #6366f1 100%)`,
                  color: todosPagos ? "#16a34a" : "white",
                  border: todosPagos ? "1px solid #bbf7d0" : "none",
                  borderRadius: 12,
                  padding: "11px 18px",
                  fontSize: 13,
                  cursor: processando || todosPagos ? "default" : "pointer",
                  fontWeight: 700,
                  whiteSpace: "nowrap",
                }}
              >
                {todosPagos ? "✅ Folha paga" : processando ? "..." : "💸 Marcar como paga"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* STATS */}
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
        // SEM FOLHA NA COMPETÊNCIA → gerar
        <div style={{ ...card, padding: 40, textAlign: "center" }}>
          <p style={{ fontSize: 40, margin: "0 0 8px" }}>🗓️</p>
          <p style={{ color: "#1f2937", fontSize: 15, fontWeight: 700, margin: "0 0 6px" }}>
            {competencias.length === 0 ? "Nenhuma folha gerada ainda" : "Gerar uma nova folha"}
          </p>
          <p style={{ color: "#6b7280", fontSize: 13, margin: "0 0 18px" }}>
            Escolha o mês e gere a folha — os funcionários ativos entram automaticamente.
          </p>
          <div
            style={{
              display: "flex",
              gap: 10,
              justifyContent: "center",
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <input
              type="month"
              value={novaComp}
              onChange={(e) => setNovaComp(e.target.value)}
              style={{
                background: "#ffffff",
                border: "1px solid #e5e7eb",
                borderRadius: 10,
                padding: "10px 14px",
                fontSize: 13,
                fontWeight: 600,
                color: "#1f2937",
                outline: "none",
              }}
            />
            <button
              onClick={gerarFolha}
              disabled={gerando}
              style={{
                background: `linear-gradient(135deg, ${COR} 0%, #6366f1 100%)`,
                color: "white",
                border: "none",
                borderRadius: 12,
                padding: "11px 22px",
                fontSize: 13,
                cursor: gerando ? "wait" : "pointer",
                fontWeight: 700,
                boxShadow: `0 4px 12px ${COR}40`,
              }}
            >
              {gerando ? "Gerando..." : "⚙️ Gerar folha"}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div style={{ ...card, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#f9fafb" }}>
                    {[
                      "Colaborador",
                      "Base",
                      "Comissão",
                      "INSS",
                      "IRRF",
                      "Outros desc.",
                      "Líquido",
                      "Status",
                    ].map((h) => (
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
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {itens.map((it, i) => {
                    const editavel = it.status !== "pago";
                    return (
                      <tr
                        key={it.id}
                        style={{
                          borderTop: "1px solid #f3f4f6",
                          background: i % 2 === 0 ? "#ffffff" : "#fafbfc",
                        }}
                      >
                        <td style={{ padding: "12px 16px" }}>
                          <p style={{ color: "#1f2937", fontSize: 13, fontWeight: 700, margin: 0 }}>
                            {it.nome}
                          </p>
                          <p style={{ color: "#9ca3af", fontSize: 11, margin: "2px 0 0" }}>{it.cargo}</p>
                        </td>
                        <td style={{ padding: "10px 16px", textAlign: "right" }}>
                          {editavel ? (
                            <input
                              type="number"
                              value={it.base || ""}
                              onChange={(e) => editar(it.id, "base", Number(e.target.value))}
                              style={numStyle}
                            />
                          ) : (
                            <span style={{ color: "#4b5563", fontSize: 12 }}>{real(it.base)}</span>
                          )}
                        </td>
                        <td style={{ padding: "10px 16px", textAlign: "right" }}>
                          {editavel ? (
                            <input
                              type="number"
                              value={it.comissao || ""}
                              onChange={(e) => editar(it.id, "comissao", Number(e.target.value))}
                              style={{
                                ...numStyle,
                                border: "1px solid #c7d2fe",
                                background: "#f5f3ff",
                                fontWeight: 700,
                                color: COR_TEXTO,
                              }}
                              placeholder="0,00"
                            />
                          ) : (
                            <span style={{ color: COR_TEXTO, fontSize: 12, fontWeight: 700 }}>
                              {real(it.comissao)}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: "10px 16px", textAlign: "right" }}>
                          {editavel ? (
                            <input
                              type="number"
                              value={it.inss || ""}
                              onChange={(e) => editar(it.id, "inss", Number(e.target.value))}
                              style={{ ...numStyle, color: "#dc2626" }}
                            />
                          ) : (
                            <span style={{ color: "#dc2626", fontSize: 12 }}>{real(it.inss)}</span>
                          )}
                        </td>
                        <td style={{ padding: "10px 16px", textAlign: "right" }}>
                          {editavel ? (
                            <input
                              type="number"
                              value={it.irrf || ""}
                              onChange={(e) => editar(it.id, "irrf", Number(e.target.value))}
                              style={{ ...numStyle, color: "#dc2626" }}
                            />
                          ) : (
                            <span style={{ color: "#dc2626", fontSize: 12 }}>{real(it.irrf)}</span>
                          )}
                        </td>
                        <td style={{ padding: "10px 16px", textAlign: "right" }}>
                          {editavel ? (
                            <input
                              type="number"
                              value={it.outros || ""}
                              onChange={(e) => editar(it.id, "outros", Number(e.target.value))}
                              style={{ ...numStyle, color: "#dc2626" }}
                            />
                          ) : (
                            <span style={{ color: "#dc2626", fontSize: 12 }}>{real(it.outros)}</span>
                          )}
                        </td>
                        <td
                          style={{
                            padding: "12px 16px",
                            color: "#1f2937",
                            fontSize: 13,
                            fontWeight: 800,
                            textAlign: "right",
                            whiteSpace: "nowrap",
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
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <p style={{ color: "#9ca3af", fontSize: 11, margin: 0, textAlign: "center" }}>
            Editou os valores? Clique em <b>💾 Salvar alterações</b>. O INSS e o IRRF recalculam sozinhos ao
            mudar a base ou a comissão.
          </p>
        </>
      )}
    </div>
  );
}