"use client";
import { useState, useMemo, useEffect } from "react";
import { supabase } from "../../../lib/supabase";

// ═══════════════════════════════════════════════════════════════════════
// 💵 Financeiro · Folha do Mês (CONECTADO — lê folha_itens do RH)
// Mostra o custo de salários + comissão de TODAS as formas:
//   • Total geral  • Agrupado por equipe (departamento)  • Por funcionário
// Cruza folha_itens (nome, base, comissao) com funcionarios (departamento).
// ═══════════════════════════════════════════════════════════════════════

const COR = "#d97706";
const COR_TEXTO = "#b45309";
const card = {
  background: "#ffffff",
  borderRadius: 14,
  border: "1px solid #e5e7eb",
  boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
};
const real = (v: number) => (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
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

type Item = {
  nome: string;
  cargo: string;
  base: number;
  comissao: number;
  total: number;
  departamento: string;
};
type Aviso = { tipo: "erro" | "ok"; titulo: string } | null;

export function FolhaSection() {
  const [itens, setItens] = useState<Item[]>([]);
  const [comps, setComps] = useState<string[]>([]);
  const [comp, setComp] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [modo, setModo] = useState<"equipe" | "funcionario">("equipe");
  const [aviso, setAviso] = useState<Aviso>(null);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 4500);
    return () => clearTimeout(t);
  }, [aviso]);
  const erro = (titulo: string, e?: any) => {
    if (e) console.error("[Folha financeiro]", e);
    setAviso({ tipo: "erro", titulo });
  };

  // competências disponíveis
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("folha_itens").select("competencia");
      if (error) {
        erro("Não consegui carregar as competências.", error);
        setCarregando(false);
        return;
      }
      const cs = Array.from(new Set((data || []).map((r: any) => r.competencia).filter(Boolean)))
        .sort()
        .reverse() as string[];
      setComps(cs);
      setComp((a) => a || (cs.length ? cs[0] : ""));
      if (cs.length === 0) setCarregando(false);
    })();
  }, []);

  // carrega a folha do mês + cruza com departamento dos funcionários
  useEffect(() => {
    if (!comp) return;
    (async () => {
      setCarregando(true);
      const [folhaR, funcR] = await Promise.all([
        supabase.from("folha_itens").select("nome, cargo, base, comissao").eq("competencia", comp),
        supabase.from("funcionarios").select("nome, departamento"),
      ]);
      if (folhaR.error) {
        erro("Não consegui carregar a folha do mês.", folhaR.error);
        setCarregando(false);
        return;
      }
      const dep: Record<string, string> = {};
      (funcR.data || []).forEach((f: any) => {
        dep[(f.nome || "").toLowerCase().trim()] = f.departamento || "Sem equipe";
      });
      const lista: Item[] = (folhaR.data || []).map((r: any) => {
        const base = Number(r.base) || 0;
        const comissao = Number(r.comissao) || 0;
        return {
          nome: r.nome || "",
          cargo: r.cargo || "",
          base,
          comissao,
          total: base + comissao,
          departamento: dep[(r.nome || "").toLowerCase().trim()] || "Sem equipe",
        };
      });
      lista.sort((a, b) => a.nome.localeCompare(b.nome));
      setItens(lista);
      setCarregando(false);
    })();
  }, [comp]);

  const totalGeral = useMemo(() => itens.reduce((s, i) => s + i.total, 0), [itens]);
  const totalBase = useMemo(() => itens.reduce((s, i) => s + i.base, 0), [itens]);
  const totalComissao = useMemo(() => itens.reduce((s, i) => s + i.comissao, 0), [itens]);

  const porEquipe = useMemo(() => {
    const m: Record<string, Item[]> = {};
    itens.forEach((i) => {
      if (!m[i.departamento]) m[i.departamento] = [];
      m[i.departamento].push(i);
    });
    return Object.entries(m)
      .map(([dep, lista]) => ({
        dep,
        lista,
        subtotal: lista.reduce((s, x) => s + x.total, 0),
      }))
      .sort((a, b) => b.subtotal - a.subtotal);
  }, [itens]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <style>{`@keyframes aviso-in { from { opacity:0; transform:translateY(12px);} to {opacity:1; transform:translateY(0);} }`}</style>

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
              background: `linear-gradient(135deg, ${COR} 0%, #f59e0b 100%)`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 24,
              boxShadow: `0 8px 20px ${COR}30`,
            }}
          >
            <span style={{ filter: "saturate(0) brightness(2)" }}>👥</span>
          </div>
          <div>
            <h1 style={{ color: "#1f2937", fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: -0.3 }}>
              Folha do Mês
            </h1>
            <p style={{ color: "#6b7280", fontSize: 12, margin: "2px 0 0" }}>
              Salários + comissão · vem direto da Folha do RH
            </p>
          </div>
        </div>
        {comps.length > 0 && (
          <select
            value={comp}
            onChange={(e) => setComp(e.target.value)}
            style={{
              background: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: 10,
              padding: "9px 14px",
              fontSize: 13,
              fontWeight: 600,
              color: "#1f2937",
              outline: "none",
            }}
          >
            {comps.map((c) => (
              <option key={c} value={c}>
                {fmtComp(c)}
              </option>
            ))}
          </select>
        )}
      </div>

      {carregando ? (
        <div style={{ ...card, padding: 40, textAlign: "center" }}>
          <p style={{ color: "#6b7280", fontSize: 13 }}>Carregando...</p>
        </div>
      ) : comps.length === 0 ? (
        <div style={{ ...card, padding: 40, textAlign: "center" }}>
          <p style={{ fontSize: 36, margin: "0 0 8px" }}>📭</p>
          <p style={{ color: "#6b7280", fontSize: 13, margin: "0 0 4px" }}>Nenhuma folha gerada ainda.</p>
          <p style={{ color: "#9ca3af", fontSize: 12, margin: 0 }}>
            Gere a folha no RH → Folha de Pagamento. Ela aparece aqui automaticamente.
          </p>
        </div>
      ) : (
        <>
          {/* STATS */}
          <div
            style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14 }}
          >
            {[
              { label: "Total da folha", value: real(totalGeral), cor: COR, icon: "💰" },
              { label: "Só salários", value: real(totalBase), cor: "#6366f1", icon: "🧾" },
              { label: "Só comissão", value: real(totalComissao), cor: "#8b5cf6", icon: "📈" },
              { label: "Funcionários", value: String(itens.length), cor: "#16a34a", icon: "👥" },
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
                <p style={{ color: s.cor, fontSize: 19, fontWeight: 800, margin: 0, letterSpacing: -0.5 }}>
                  {s.value}
                </p>
              </div>
            ))}
          </div>

          {/* TOGGLE de visão */}
          <div style={{ display: "flex", gap: 6 }}>
            {(["equipe", "funcionario"] as const).map((m) => {
              const ativo = modo === m;
              return (
                <button
                  key={m}
                  onClick={() => setModo(m)}
                  style={{
                    background: ativo ? COR : "#fff",
                    color: ativo ? "#fff" : "#6b7280",
                    border: `1px solid ${ativo ? COR : "#e5e7eb"}`,
                    borderRadius: 8,
                    padding: "7px 16px",
                    fontSize: 12,
                    cursor: "pointer",
                    fontWeight: 700,
                  }}
                >
                  {m === "equipe" ? "Por equipe" : "Por funcionário"}
                </button>
              );
            })}
          </div>

          {/* VISÃO POR EQUIPE */}
          {modo === "equipe" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {porEquipe.map((g) => (
                <div key={g.dep} style={{ ...card, overflow: "hidden" }}>
                  <div
                    style={{
                      padding: "14px 18px",
                      background: "#fffbeb",
                      borderBottom: "1px solid #fde68a",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 15 }}>🏢</span>
                      <span style={{ color: "#1f2937", fontSize: 14, fontWeight: 800 }}>{g.dep}</span>
                      <span
                        style={{
                          background: `${COR}15`,
                          color: COR_TEXTO,
                          fontSize: 11,
                          padding: "2px 8px",
                          borderRadius: 8,
                          fontWeight: 700,
                        }}
                      >
                        {g.lista.length}
                      </span>
                    </div>
                    <span style={{ color: COR_TEXTO, fontSize: 15, fontWeight: 800 }}>
                      {real(g.subtotal)}
                    </span>
                  </div>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
                      <thead>
                        <tr style={{ background: "#f9fafb" }}>
                          {["Funcionário", "Salário", "Comissão", "Total"].map((h) => (
                            <th
                              key={h}
                              style={{
                                padding: "10px 16px",
                                color: "#6b7280",
                                fontSize: 11,
                                textAlign: h === "Funcionário" ? "left" : "right",
                                textTransform: "uppercase",
                                letterSpacing: 0.5,
                                fontWeight: 700,
                                borderBottom: "1px solid #e5e7eb",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {g.lista.map((it, i) => (
                          <tr
                            key={it.nome + i}
                            style={{
                              borderTop: "1px solid #f3f4f6",
                              background: i % 2 === 0 ? "#fff" : "#fafbfc",
                            }}
                          >
                            <td style={{ padding: "10px 16px" }}>
                              <p style={{ color: "#1f2937", fontSize: 13, fontWeight: 700, margin: 0 }}>
                                {it.nome}
                              </p>
                              {it.cargo && (
                                <p style={{ color: "#9ca3af", fontSize: 11, margin: "1px 0 0" }}>
                                  {it.cargo}
                                </p>
                              )}
                            </td>
                            <td
                              style={{
                                padding: "10px 16px",
                                textAlign: "right",
                                color: "#4b5563",
                                fontSize: 13,
                                whiteSpace: "nowrap",
                              }}
                            >
                              {real(it.base)}
                            </td>
                            <td
                              style={{
                                padding: "10px 16px",
                                textAlign: "right",
                                color: "#8b5cf6",
                                fontSize: 13,
                                fontWeight: 600,
                                whiteSpace: "nowrap",
                              }}
                            >
                              {real(it.comissao)}
                            </td>
                            <td
                              style={{
                                padding: "10px 16px",
                                textAlign: "right",
                                color: "#1f2937",
                                fontSize: 13,
                                fontWeight: 800,
                                whiteSpace: "nowrap",
                              }}
                            >
                              {real(it.total)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* VISÃO POR FUNCIONÁRIO (tabela plana) */
            <div style={{ ...card, overflow: "hidden" }}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
                  <thead>
                    <tr style={{ background: "#f9fafb" }}>
                      {["Funcionário", "Equipe", "Salário", "Comissão", "Total"].map((h) => (
                        <th
                          key={h}
                          style={{
                            padding: "12px 16px",
                            color: "#6b7280",
                            fontSize: 11,
                            textAlign: h === "Funcionário" || h === "Equipe" ? "left" : "right",
                            textTransform: "uppercase",
                            letterSpacing: 0.5,
                            fontWeight: 700,
                            borderBottom: "1px solid #e5e7eb",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {itens.map((it, i) => (
                      <tr
                        key={it.nome + i}
                        style={{
                          borderTop: "1px solid #f3f4f6",
                          background: i % 2 === 0 ? "#fff" : "#fafbfc",
                        }}
                      >
                        <td style={{ padding: "12px 16px" }}>
                          <p style={{ color: "#1f2937", fontSize: 13, fontWeight: 700, margin: 0 }}>
                            {it.nome}
                          </p>
                          {it.cargo && (
                            <p style={{ color: "#9ca3af", fontSize: 11, margin: "1px 0 0" }}>{it.cargo}</p>
                          )}
                        </td>
                        <td style={{ padding: "12px 16px", color: "#4b5563", fontSize: 12 }}>
                          {it.departamento}
                        </td>
                        <td
                          style={{
                            padding: "12px 16px",
                            textAlign: "right",
                            color: "#4b5563",
                            fontSize: 13,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {real(it.base)}
                        </td>
                        <td
                          style={{
                            padding: "12px 16px",
                            textAlign: "right",
                            color: "#8b5cf6",
                            fontSize: 13,
                            fontWeight: 600,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {real(it.comissao)}
                        </td>
                        <td
                          style={{
                            padding: "12px 16px",
                            textAlign: "right",
                            color: "#1f2937",
                            fontSize: 13,
                            fontWeight: 800,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {real(it.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: "#fffbeb", borderTop: "2px solid #fde68a" }}>
                      <td
                        style={{ padding: "12px 16px", color: "#1f2937", fontSize: 13, fontWeight: 800 }}
                        colSpan={2}
                      >
                        TOTAL GERAL
                      </td>
                      <td
                        style={{
                          padding: "12px 16px",
                          textAlign: "right",
                          color: "#4b5563",
                          fontSize: 13,
                          fontWeight: 700,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {real(totalBase)}
                      </td>
                      <td
                        style={{
                          padding: "12px 16px",
                          textAlign: "right",
                          color: "#8b5cf6",
                          fontSize: 13,
                          fontWeight: 700,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {real(totalComissao)}
                      </td>
                      <td
                        style={{
                          padding: "12px 16px",
                          textAlign: "right",
                          color: COR_TEXTO,
                          fontSize: 14,
                          fontWeight: 800,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {real(totalGeral)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {aviso && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            zIndex: 3000,
            maxWidth: 360,
            background: "#fff",
            borderRadius: 12,
            borderLeft: `4px solid ${aviso.tipo === "erro" ? "#dc2626" : "#16a34a"}`,
            boxShadow: "0 12px 28px rgba(0,0,0,0.16)",
            padding: "14px 16px",
            display: "flex",
            alignItems: "center",
            gap: 12,
            animation: "aviso-in 0.2s ease",
          }}
        >
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 9,
              flexShrink: 0,
              background: aviso.tipo === "erro" ? "#fef2f2" : "#f0fdf4",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
            }}
          >
            {aviso.tipo === "erro" ? "⚠️" : "✅"}
          </div>
          <p style={{ color: "#1f2937", fontSize: 13, fontWeight: 600, margin: 0, flex: 1, lineHeight: 1.4 }}>
            {aviso.titulo}
          </p>
          <button
            onClick={() => setAviso(null)}
            style={{
              background: "transparent",
              border: "none",
              color: "#9ca3af",
              fontSize: 16,
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}