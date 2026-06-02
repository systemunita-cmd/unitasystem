"use client";
import { useState, useMemo, useEffect } from "react";
import { supabase } from "../../../lib/supabase";
// 🧑‍💼 RH · Holerites (CONECTADO — 'holerites'; proventos/descontos jsonb [{rotulo,valor}])
const COR = "#4f46e5";
const COR_TEXTO = "#4338ca";
const card = {
  background: "#ffffff",
  borderRadius: 14,
  border: "1px solid #e5e7eb",
  boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
};
const real = (v: number) => (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
// competência interna "AAAA-MM" → exibição "Mês/AAAA"
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
type Linha = { rotulo: string; valor: number };
type Holerite = {
  id: string;
  nome: string;
  cargo: string;
  competencia: string;
  emitido: boolean;
  pago: boolean;
  proventos: Linha[];
  descontos: Linha[];
};
const somaL = (l: Linha[]) => (l || []).reduce((s, x) => s + (Number(x.valor) || 0), 0);
export function HoleritesSection() {
  const [todos, setTodos] = useState<Holerite[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [comp, setComp] = useState("");
  const [ver, setVer] = useState<Holerite | null>(null);
  // gerar holerites a partir da folha (folha_itens)
  const [compsFolha, setCompsFolha] = useState<string[]>([]);
  const [compGerar, setCompGerar] = useState("");
  const [gerando, setGerando] = useState(false);
  const carregar = async () => {
    setCarregando(true);
    const { data, error } = await supabase.from("holerites").select("*").order("nome", { ascending: true });
    if (error) {
      console.error(error);
      alert("Erro: " + error.message);
      setCarregando(false);
      return;
    }
    const items = (data || []).map((r: any) => ({
      id: r.id,
      nome: r.nome,
      cargo: r.cargo || "",
      competencia: r.competencia || "",
      emitido: !!r.emitido,
      pago: !!r.pago,
      proventos: Array.isArray(r.proventos) ? r.proventos : [],
      descontos: Array.isArray(r.descontos) ? r.descontos : [],
    })) as Holerite[];
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

  // competências que têm folha gerada (origem dos holerites)
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("folha_itens").select("competencia");
      const comps = Array.from(new Set((data || []).map((r: any) => r.competencia).filter(Boolean)))
        .sort()
        .reverse() as string[];
      setCompsFolha(comps);
      setCompGerar((atual) => atual || (comps.length ? comps[0] : ""));
    })();
  }, []);

  // 🧾 Gera os holerites a partir dos itens da folha da competência escolhida
  const gerarHolerites = async () => {
    if (!compGerar) {
      alert("Selecione a competência da folha.");
      return;
    }
    setGerando(true);
    const { data: folha, error } = await supabase
      .from("folha_itens")
      .select("*")
      .eq("competencia", compGerar);
    if (error) {
      setGerando(false);
      alert("Erro ao ler a folha: " + error.message);
      return;
    }
    if (!folha || folha.length === 0) {
      setGerando(false);
      alert("Não há folha gerada nessa competência.");
      return;
    }
    // não duplica quem já tem holerite nessa competência
    const { data: jaTem } = await supabase.from("holerites").select("nome").eq("competencia", compGerar);
    const existentes = new Set((jaTem || []).map((h: any) => (h.nome || "").toLowerCase()));
    const novos = folha
      .filter((f: any) => !existentes.has((f.nome || "").toLowerCase()))
      .map((f: any) => {
        const base = Number(f.base) || 0;
        const comissao = Number(f.comissao) || 0;
        const inss = Number(f.inss) || 0;
        const irrf = Number(f.irrf) || 0;
        const outros = Number(f.outros) || 0;
        const proventos: Linha[] = [{ rotulo: "Salário base", valor: base }];
        if (comissao > 0) proventos.push({ rotulo: "Comissão", valor: comissao });
        const descontos: Linha[] = [];
        if (inss > 0) descontos.push({ rotulo: "INSS", valor: inss });
        if (irrf > 0) descontos.push({ rotulo: "IRRF", valor: irrf });
        if (outros > 0) descontos.push({ rotulo: "Outros descontos", valor: outros });
        return {
          nome: f.nome,
          cargo: f.cargo || "",
          competencia: compGerar,
          emitido: true,
          pago: f.status === "pago",
          proventos,
          descontos,
        };
      });
    if (novos.length === 0) {
      setGerando(false);
      alert("Todos os holerites dessa competência já foram gerados.");
      return;
    }
    const { error: insErr } = await supabase.from("holerites").insert(novos);
    setGerando(false);
    if (insErr) {
      alert("Erro ao gerar: " + insErr.message);
      return;
    }
    setComp(compGerar);
    await carregar();
    alert(`✅ ${novos.length} holerite(s) gerado(s) para ${fmtComp(compGerar)}!`);
  };
  const competencias = useMemo(
    () =>
      Array.from(new Set(todos.map((i) => i.competencia)))
        .sort()
        .reverse(),
    [todos]
  );
  const itens = useMemo(() => todos.filter((h) => h.competencia === comp), [todos, comp]);
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
            <span style={{ filter: "saturate(0) brightness(2)" }}>🧾</span>
          </div>
          <div>
            <h1 style={{ color: "#1f2937", fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: -0.3 }}>
              Holerites
            </h1>
            <p style={{ color: "#6b7280", fontSize: 12, margin: "2px 0 0" }}>
              Demonstrativos de pagamento dos colaboradores
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
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
                  {fmtComp(c)}
                </option>
              ))}
            </select>
          )}
          {compsFolha.length > 0 && (
            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                background: "#ffffff",
                border: "1px solid #e5e7eb",
                borderRadius: 10,
                padding: "5px 6px 5px 12px",
              }}
            >
              <span style={{ color: "#6b7280", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>
                Gerar da folha:
              </span>
              <select
                value={compGerar}
                onChange={(e) => setCompGerar(e.target.value)}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                  padding: "6px 8px",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#1f2937",
                  outline: "none",
                }}
              >
                {compsFolha.map((c) => (
                  <option key={c} value={c}>
                    {fmtComp(c)}
                  </option>
                ))}
              </select>
              <button
                onClick={gerarHolerites}
                disabled={gerando}
                style={{
                  background: `linear-gradient(135deg, ${COR} 0%, #6366f1 100%)`,
                  color: "white",
                  border: "none",
                  borderRadius: 8,
                  padding: "8px 14px",
                  fontSize: 12,
                  cursor: gerando ? "wait" : "pointer",
                  fontWeight: 700,
                  whiteSpace: "nowrap",
                  opacity: gerando ? 0.7 : 1,
                }}
              >
                {gerando ? "Gerando..." : "⚙️ Gerar"}
              </button>
            </div>
          )}
        </div>
      </div>
      {carregando ? (
        <div style={{ ...card, padding: 40, textAlign: "center" }}>
          <p style={{ color: "#6b7280", fontSize: 13 }}>Carregando...</p>
        </div>
      ) : itens.length === 0 ? (
        <div style={{ ...card, padding: 40, textAlign: "center" }}>
          <p style={{ fontSize: 36, margin: "0 0 8px" }}>📭</p>
          <p style={{ color: "#6b7280", fontSize: 13 }}>
            {todos.length === 0 ? "Nenhum holerite gerado ainda." : "Sem holerites nesta competência."}
          </p>
          {todos.length === 0 && (
            <p style={{ color: "#9ca3af", fontSize: 12, margin: "6px 0 0", lineHeight: 1.5 }}>
              {compsFolha.length > 0
                ? 'Use o botão "⚙️ Gerar" lá em cima pra criar os contracheques a partir da folha do mês.'
                : "Gere uma folha primeiro no módulo Folha de Pagamento — depois volte aqui pra emitir os holerites."}
            </p>
          )}
        </div>
      ) : (
        <div style={{ ...card, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f9fafb" }}>
                  {["Colaborador", "Competência", "Proventos", "Descontos", "Líquido", "Situação", ""].map(
                    (h) => (
                      <th
                        key={h}
                        style={{
                          padding: "12px 16px",
                          color: "#6b7280",
                          fontSize: 11,
                          textAlign: "left",
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
                {itens.map((h, i) => {
                  const p = somaL(h.proventos),
                    d = somaL(h.descontos);
                  return (
                    <tr
                      key={h.id}
                      style={{
                        borderTop: "1px solid #f3f4f6",
                        background: i % 2 === 0 ? "#ffffff" : "#fafbfc",
                      }}
                    >
                      <td style={{ padding: "12px 16px" }}>
                        <p style={{ color: "#1f2937", fontSize: 13, fontWeight: 700, margin: 0 }}>{h.nome}</p>
                        <p style={{ color: "#9ca3af", fontSize: 11, margin: "2px 0 0" }}>{h.cargo}</p>
                      </td>
                      <td style={{ padding: "12px 16px", color: "#6b7280", fontSize: 12 }}>
                        {h.competencia}
                      </td>
                      <td style={{ padding: "12px 16px", color: "#16a34a", fontSize: 12 }}>{real(p)}</td>
                      <td style={{ padding: "12px 16px", color: "#dc2626", fontSize: 12 }}>{real(d)}</td>
                      <td style={{ padding: "12px 16px", color: "#1f2937", fontSize: 12, fontWeight: 800 }}>
                        {real(p - d)}
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <span
                          style={{
                            background: h.pago ? "#f0fdf4" : "#fffbeb",
                            color: h.pago ? "#16a34a" : "#f59e0b",
                            border: `1px solid ${h.pago ? "#bbf7d0" : "#fde68a"}`,
                            fontSize: 11,
                            padding: "3px 10px",
                            borderRadius: 10,
                            fontWeight: 700,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {h.pago ? "Pago" : h.emitido ? "Emitido" : "Pendente"}
                        </span>
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <button
                          onClick={() => setVer(h)}
                          style={{
                            background: "#eef2ff",
                            color: COR_TEXTO,
                            border: "1px solid #c7d2fe",
                            borderRadius: 8,
                            padding: "5px 11px",
                            fontSize: 11,
                            cursor: "pointer",
                            fontWeight: 600,
                          }}
                        >
                          👁️ Ver
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {ver && (
        <div
          onClick={() => setVer(null)}
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
            style={{
              ...card,
              width: "100%",
              maxWidth: 540,
              maxHeight: "90vh",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
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
              <div>
                <h3 style={{ color: "#1f2937", fontSize: 16, fontWeight: 700, margin: 0 }}>
                  Holerite · {ver.competencia}
                </h3>
                <p style={{ color: "#6b7280", fontSize: 12, margin: "2px 0 0" }}>
                  {ver.nome} — {ver.cargo}
                </p>
              </div>
              <button
                onClick={() => setVer(null)}
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
            <div style={{ padding: 24, overflowY: "auto" }}>
              <p
                style={{
                  color: "#16a34a",
                  fontSize: 12,
                  fontWeight: 800,
                  textTransform: "uppercase",
                  margin: "0 0 8px",
                }}
              >
                Proventos
              </p>
              {ver.proventos.map((l, idx) => (
                <div
                  key={idx}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "6px 0",
                    borderBottom: "1px solid #f3f4f6",
                  }}
                >
                  <span style={{ color: "#4b5563", fontSize: 13 }}>{l.rotulo}</span>
                  <span style={{ color: "#16a34a", fontSize: 13, fontWeight: 600 }}>{real(l.valor)}</span>
                </div>
              ))}
              <p
                style={{
                  color: "#dc2626",
                  fontSize: 12,
                  fontWeight: 800,
                  textTransform: "uppercase",
                  margin: "16px 0 8px",
                }}
              >
                Descontos
              </p>
              {ver.descontos.map((l, idx) => (
                <div
                  key={idx}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "6px 0",
                    borderBottom: "1px solid #f3f4f6",
                  }}
                >
                  <span style={{ color: "#4b5563", fontSize: 13 }}>{l.rotulo}</span>
                  <span style={{ color: "#dc2626", fontSize: 13, fontWeight: 600 }}>- {real(l.valor)}</span>
                </div>
              ))}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginTop: 16,
                  padding: "12px 14px",
                  background: "#eef2ff",
                  borderRadius: 10,
                }}
              >
                <span style={{ color: COR_TEXTO, fontSize: 14, fontWeight: 800 }}>Líquido a receber</span>
                <span style={{ color: COR_TEXTO, fontSize: 16, fontWeight: 800 }}>
                  {real(somaL(ver.proventos) - somaL(ver.descontos))}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}