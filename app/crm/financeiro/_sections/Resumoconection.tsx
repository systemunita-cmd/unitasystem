"use client";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "../../../lib/supabase";

// ═══════════════════════════════════════════════════════════════════════
// 💵 Financeiro · Resumo (CONECTADO — fin_titulos). Painel do negócio:
// entra das operadoras × sai (despesas, incluindo folha) = resultado.
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
const fmtComp = (c: string) => {
  const [a, m] = (c || "").split("-");
  const i = Number(m) - 1;
  return a && MESES[i] ? `${MESES[i]}/${a}` : c;
};
type Titulo = { tipo: string; valor: number; status: string; categoria: string };
type Aviso = { tipo: "erro" | "ok"; titulo: string } | null;

export function ResumoSection() {
  const [titulos, setTitulos] = useState<Titulo[]>([]);
  const [folhaInfo, setFolhaInfo] = useState<{ comp: string; total: number } | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [aviso, setAviso] = useState<Aviso>(null);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 4500);
    return () => clearTimeout(t);
  }, [aviso]);

  useEffect(() => {
    (async () => {
      setCarregando(true);
      const { data, error } = await supabase.from("fin_titulos").select("tipo, valor, status, categoria");
      if (error) {
        console.error("[Resumo]", error);
        setAviso({ tipo: "erro", titulo: "Não consegui carregar o resumo." });
        setCarregando(false);
        return;
      }
      setTitulos(
        (data || []).map((r: any) => ({
          tipo: r.tipo || "receber",
          valor: Number(r.valor) || 0,
          status: r.status || "pendente",
          categoria: r.categoria || "Outro",
        }))
      );
      // folha do mês mais recente (do RH) — pro dashboard mostrar o maior custo sempre
      const { data: fdata } = await supabase.from("folha_itens").select("competencia, base, comissao");
      if (fdata && fdata.length) {
        const comps = Array.from(new Set(fdata.map((r: any) => r.competencia).filter(Boolean)))
          .sort()
          .reverse() as string[];
        const comp = comps[0];
        const total = fdata
          .filter((r: any) => r.competencia === comp)
          .reduce((s: number, r: any) => s + (Number(r.base) || 0) + (Number(r.comissao) || 0), 0);
        setFolhaInfo({ comp, total });
      }
      setCarregando(false);
    })();
  }, []);

  const m = useMemo(() => {
    const rec = titulos.filter((t) => t.tipo === "receber");
    const pag = titulos.filter((t) => t.tipo === "pagar");
    const recebido = rec.filter((t) => t.status === "pago").reduce((s, t) => s + t.valor, 0);
    const aReceber = rec.filter((t) => t.status !== "pago").reduce((s, t) => s + t.valor, 0);
    const pago = pag.filter((t) => t.status === "pago").reduce((s, t) => s + t.valor, 0);
    const aPagar = pag.filter((t) => t.status !== "pago").reduce((s, t) => s + t.valor, 0);
    const porCategoria: Record<string, number> = {};
    pag.forEach((t) => (porCategoria[t.categoria] = (porCategoria[t.categoria] || 0) + t.valor));
    const despesasCat = Object.entries(porCategoria)
      .map(([cat, valor]) => ({ cat, valor }))
      .sort((a, b) => b.valor - a.valor);
    return {
      recebido,
      aReceber,
      pago,
      aPagar,
      resultado: recebido - pago,
      previsto: recebido + aReceber - (pago + aPagar),
      despesasCat,
      folhaLancada: pag.some((t) => t.categoria === "Folha"),
    };
  }, [titulos]);

  const catCor: Record<string, string> = {
    Folha: "#6366f1",
    Imposto: "#dc2626",
    "Custo de Nota": "#0ea5e9",
    Aluguel: "#8b5cf6",
    Fornecedor: "#16a34a",
    Outro: "#6b7280",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <style>{`@keyframes aviso-in { from { opacity:0; transform:translateY(12px);} to {opacity:1; transform:translateY(0);} }`}</style>

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
          <span style={{ filter: "saturate(0) brightness(2)" }}>📊</span>
        </div>
        <div>
          <h1 style={{ color: "#1f2937", fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: -0.3 }}>
            Resumo Financeiro
          </h1>
          <p style={{ color: "#6b7280", fontSize: 12, margin: "2px 0 0" }}>
            Entradas das operadoras × saídas (despesas + folha)
          </p>
        </div>
      </div>

      {carregando ? (
        <div style={{ ...card, padding: 40, textAlign: "center" }}>
          <p style={{ color: "#6b7280", fontSize: 13 }}>Carregando...</p>
        </div>
      ) : (
        <>
          {/* RESULTADO */}
          <div
            style={{
              ...card,
              padding: 24,
              borderTop: `4px solid ${m.resultado >= 0 ? "#16a34a" : "#dc2626"}`,
            }}
          >
            <p
              style={{
                color: "#6b7280",
                fontSize: 12,
                margin: 0,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              Resultado realizado (recebido − pago)
            </p>
            <p
              style={{
                color: m.resultado >= 0 ? "#16a34a" : "#dc2626",
                fontSize: 34,
                fontWeight: 800,
                margin: "6px 0 0",
                letterSpacing: -1,
              }}
            >
              {real(m.resultado)}
            </p>
            <p style={{ color: "#9ca3af", fontSize: 12, margin: "6px 0 0" }}>
              Saldo previsto (com o que está em aberto):{" "}
              <b style={{ color: m.previsto >= 0 ? "#16a34a" : "#dc2626" }}>{real(m.previsto)}</b>
            </p>
          </div>

          {/* CARDS */}
          <div
            style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}
          >
            {[
              { label: "Recebido", value: real(m.recebido), cor: "#16a34a", icon: "✅" },
              { label: "A receber", value: real(m.aReceber), cor: COR, icon: "📥" },
              { label: "Pago", value: real(m.pago), cor: "#6366f1", icon: "💸" },
              { label: "A pagar", value: real(m.aPagar), cor: "#dc2626", icon: "📤" },
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

          {/* FOLHA DO MÊS (do RH) */}
          {folhaInfo && (
            <div
              style={{
                ...card,
                padding: 18,
                display: "flex",
                alignItems: "center",
                gap: 14,
                flexWrap: "wrap",
                borderLeft: "4px solid #6366f1",
              }}
            >
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 11,
                  background: "#eef2ff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 20,
                  flexShrink: 0,
                }}
              >
                👥
              </div>
              <div style={{ flex: 1, minWidth: 160 }}>
                <p
                  style={{
                    color: "#6b7280",
                    fontSize: 11,
                    margin: 0,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  Folha de {fmtComp(folhaInfo.comp)} (salários + comissão)
                </p>
                <p
                  style={{
                    color: "#4338ca",
                    fontSize: 22,
                    fontWeight: 800,
                    margin: "2px 0 0",
                    letterSpacing: -0.5,
                  }}
                >
                  {real(folhaInfo.total)}
                </p>
              </div>
              {m.folhaLancada ? (
                <span
                  style={{
                    background: "#f0fdf4",
                    color: "#16a34a",
                    border: "1px solid #bbf7d0",
                    padding: "5px 12px",
                    borderRadius: 10,
                    fontSize: 11,
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                  }}
                >
                  ✓ Já está nas despesas
                </span>
              ) : (
                <span
                  style={{
                    background: "#fffbeb",
                    color: COR_TEXTO,
                    border: "1px solid #fde68a",
                    padding: "5px 12px",
                    borderRadius: 10,
                    fontSize: 11,
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                  }}
                >
                  ⚠️ Ainda não lançada — vá em Pagar → Lançar folha
                </span>
              )}
            </div>
          )}

          {/* DESPESAS POR TIPO */}
          <div style={{ ...card, padding: 20 }}>
            <h3 style={{ color: "#1f2937", fontSize: 15, fontWeight: 700, margin: "0 0 14px" }}>
              Saídas por tipo
            </h3>
            {m.despesasCat.length === 0 ? (
              <p style={{ color: "#9ca3af", fontSize: 13, textAlign: "center", padding: "12px 0" }}>
                Nenhuma despesa lançada ainda.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {m.despesasCat.map((d) => {
                  const cc = catCor[d.cat] || "#6b7280";
                  const totalPag = m.pago + m.aPagar || 1;
                  const pct = Math.round((d.valor / totalPag) * 100);
                  return (
                    <div key={d.cat}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ color: "#4b5563", fontSize: 13, fontWeight: 600 }}>{d.cat}</span>
                        <span style={{ color: "#1f2937", fontSize: 13, fontWeight: 700 }}>
                          {real(d.valor)} <span style={{ color: "#9ca3af", fontWeight: 400 }}>({pct}%)</span>
                        </span>
                      </div>
                      <div style={{ height: 8, background: "#f1f5f9", borderRadius: 6, overflow: "hidden" }}>
                        <div style={{ width: `${pct}%`, height: "100%", background: cc, borderRadius: 6 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
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