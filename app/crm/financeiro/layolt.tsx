"use client";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "../../lib/supabase";

// ═══════════════════════════════════════════════════════════════════════
// 💵 FINANCEIRO — Módulo COMPLETO num único arquivo (UnitaSystem)
// Tudo aqui dentro de propósito: zero imports de _sections => zero risco de
// "module not found". As 4 telas (Resumo, Operadoras, Despesas, Folha) são
// funções neste mesmo arquivo. Basta este arquivo + o page.tsx.
// ═══════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════
// 💵 Financeiro · Resumo (CONECTADO — fin_titulos). Painel do negócio:
// entra das operadoras × sai (despesas, incluindo folha) = resultado.
// ═══════════════════════════════════════════════════════════════════════

const R_COR = "#d97706";
const R_COR_TEXTO = "#b45309";
const R_card = {
  background: "#ffffff",
  borderRadius: 14,
  border: "1px solid #e5e7eb",
  boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
};
const R_real = (v: number) => (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const R_MESES = [
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
const R_fmtComp = (c: string) => {
  const [a, m] = (c || "").split("-");
  const i = Number(m) - 1;
  return a && R_MESES[i] ? `${R_MESES[i]}/${a}` : c;
};
type R_Titulo = { tipo: string; valor: number; status: string; categoria: string };
type R_Aviso = { tipo: "erro" | "ok"; titulo: string } | null;

export function ResumoSection() {
  const [titulos, setTitulos] = useState<R_Titulo[]>([]);
  const [folhaInfo, setFolhaInfo] = useState<{ comp: string; total: number } | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [aviso, setAviso] = useState<R_Aviso>(null);

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

  const R_catCor: Record<string, string> = {
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
            background: `linear-gradient(135deg, ${R_COR} 0%, #f59e0b 100%)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 24,
            boxShadow: `0 8px 20px ${R_COR}30`,
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
        <div style={{ ...R_card, padding: 40, textAlign: "center" }}>
          <p style={{ color: "#6b7280", fontSize: 13 }}>Carregando...</p>
        </div>
      ) : (
        <>
          {/* RESULTADO */}
          <div
            style={{
              ...R_card,
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
              {R_real(m.resultado)}
            </p>
            <p style={{ color: "#9ca3af", fontSize: 12, margin: "6px 0 0" }}>
              Saldo previsto (com o que está em aberto):{" "}
              <b style={{ color: m.previsto >= 0 ? "#16a34a" : "#dc2626" }}>{R_real(m.previsto)}</b>
            </p>
          </div>

          {/* CARDS */}
          <div
            style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}
          >
            {[
              { label: "Recebido", value: R_real(m.recebido), cor: "#16a34a", icon: "✅" },
              { label: "A receber", value: R_real(m.aReceber), cor: R_COR, icon: "📥" },
              { label: "Pago", value: R_real(m.pago), cor: "#6366f1", icon: "💸" },
              { label: "A pagar", value: R_real(m.aPagar), cor: "#dc2626", icon: "📤" },
            ].map((s) => (
              <div key={s.label} style={{ ...R_card, padding: 16, borderTop: `3px solid ${s.cor}` }}>
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
                ...R_card,
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
                  Folha de {R_fmtComp(folhaInfo.comp)} (salários + comissão)
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
                  {R_real(folhaInfo.total)}
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
                    color: R_COR_TEXTO,
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
          <div style={{ ...R_card, padding: 20 }}>
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
                  const cc = R_catCor[d.cat] || "#6b7280";
                  const totalPag = m.pago + m.aPagar || 1;
                  const pct = Math.round((d.valor / totalPag) * 100);
                  return (
                    <div key={d.cat}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ color: "#4b5563", fontSize: 13, fontWeight: 600 }}>{d.cat}</span>
                        <span style={{ color: "#1f2937", fontSize: 13, fontWeight: 700 }}>
                          {R_real(d.valor)}{" "}
                          <span style={{ color: "#9ca3af", fontWeight: 400 }}>({pct}%)</span>
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

// ═══════════════════════════════════════════════════════════════════════
// 💵 Financeiro · Receber das Operadoras (CONECTADO — fin_titulos tipo='receber')
// Erros em toast amigável (sem alert cru). Detalhe técnico só no console.
// ═══════════════════════════════════════════════════════════════════════

const O_COR = "#d97706";
const O_COR_TEXTO = "#b45309";
const O_card = {
  background: "#ffffff",
  borderRadius: 14,
  border: "1px solid #e5e7eb",
  boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
};
const O_inputStyle = {
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
const O_real = (v: number) => (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const O_dataBR = (iso: string) => {
  if (!iso) return "—";
  try {
    return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR");
  } catch {
    return iso;
  }
};
const O_hoje = () => new Date().toISOString().slice(0, 10);

function O_msgAmigavel(error: any, padrao: string): string {
  const code = error?.code;
  const txt = (error?.message || "").toLowerCase();
  if (code === "42703" || txt.includes("does not exist") || txt.includes("fin_titulos")) {
    return "O financeiro precisa de uma atualização no sistema que ainda não foi aplicada.";
  }
  if (code === "23505") return "Esse registro já existe.";
  if (code === "PGRST301" || txt.includes("permission") || txt.includes("rls"))
    return "Você não tem permissão para isso.";
  if (txt.includes("network") || txt.includes("fetch")) return "Falha de conexão. Tente de novo.";
  return padrao;
}

type O_Titulo = {
  id: string;
  descricao: string;
  parte: string;
  valor: number;
  vencimento: string;
  status: string;
  categoria: string;
  observacao: string;
  pago_em: string;
};
const O_FORM_VAZIO: O_Titulo = {
  id: "",
  descricao: "",
  parte: "",
  valor: 0,
  vencimento: "",
  status: "pendente",
  categoria: "",
  observacao: "",
  pago_em: "",
};
type O_Aviso = { tipo: "erro" | "ok"; titulo: string } | null;

export function OperadorasSection() {
  const [lista, setLista] = useState<O_Titulo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [filtro, setFiltro] = useState<"todos" | "pendente" | "pago" | "vencido">("todos");
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState<O_Titulo>(O_FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<O_Aviso>(null);
  const set = (k: keyof O_Titulo, v: any) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 4500);
    return () => clearTimeout(t);
  }, [aviso]);
  const erro = (titulo: string, e?: any) => {
    if (e) console.error("[Operadoras]", e);
    setAviso({ tipo: "erro", titulo });
  };
  const ok = (titulo: string) => setAviso({ tipo: "ok", titulo });

  const carregar = async () => {
    setCarregando(true);
    const { data, error } = await supabase
      .from("fin_titulos")
      .select("*")
      .eq("tipo", "receber")
      .order("vencimento", { ascending: true });
    if (error) {
      erro(O_msgAmigavel(error, "Não consegui carregar as notas."), error);
      setCarregando(false);
      return;
    }
    setLista(
      (data || []).map((r: any) => ({
        id: r.id,
        descricao: r.descricao || "",
        parte: r.parte || "",
        valor: Number(r.valor) || 0,
        vencimento: r.vencimento || "",
        status: r.status || "pendente",
        categoria: r.categoria || "",
        observacao: r.observacao || "",
        pago_em: r.pago_em || "",
      }))
    );
    setCarregando(false);
  };
  useEffect(() => {
    carregar();
  }, []);

  const venceu = (t: O_Titulo) => t.status !== "pago" && t.vencimento && t.vencimento < O_hoje();

  const filtrados = useMemo(() => {
    if (filtro === "todos") return lista;
    if (filtro === "vencido") return lista.filter(venceu);
    if (filtro === "pendente") return lista.filter((t) => t.status !== "pago" && !venceu(t));
    return lista.filter((t) => t.status === "pago");
  }, [lista, filtro]);

  const stats = useMemo(() => {
    const aReceber = lista.filter((t) => t.status !== "pago").reduce((s, t) => s + t.valor, 0);
    const recebido = lista.filter((t) => t.status === "pago").reduce((s, t) => s + t.valor, 0);
    const vencido = lista.filter(venceu).reduce((s, t) => s + t.valor, 0);
    return { aReceber, recebido, vencido };
  }, [lista]);

  const abrirNovo = () => {
    setForm(O_FORM_VAZIO);
    setModal(true);
  };
  const abrirEditar = (t: O_Titulo) => {
    setForm(t);
    setModal(true);
  };

  const salvar = async () => {
    if (!form.descricao.trim()) {
      erro("Informe a descrição da nota.");
      return;
    }
    setSalvando(true);
    const payload = {
      tipo: "receber",
      descricao: form.descricao,
      parte: form.parte || null,
      valor: form.valor || 0,
      vencimento: form.vencimento || null,
      status: form.status || "pendente",
      categoria: form.categoria || null,
      observacao: form.observacao || null,
      pago_em: form.status === "pago" ? form.pago_em || O_hoje() : null,
    };
    const { error } = form.id
      ? await supabase.from("fin_titulos").update(payload).eq("id", form.id)
      : await supabase.from("fin_titulos").insert(payload);
    setSalvando(false);
    if (error) {
      erro(O_msgAmigavel(error, "Não consegui salvar a nota."), error);
      return;
    }
    setModal(false);
    setForm(O_FORM_VAZIO);
    ok(form.id ? "Nota atualizada." : "Nota criada.");
    carregar();
  };

  const marcarRecebido = async (t: O_Titulo) => {
    setLista((l) => l.map((x) => (x.id === t.id ? { ...x, status: "pago", pago_em: O_hoje() } : x)));
    const { error } = await supabase
      .from("fin_titulos")
      .update({ status: "pago", pago_em: O_hoje() })
      .eq("id", t.id);
    if (error) {
      erro(O_msgAmigavel(error, "Não consegui marcar como recebido."), error);
      carregar();
    } else {
      ok("Recebimento registrado.");
    }
  };

  const reabrir = async (t: O_Titulo) => {
    setLista((l) => l.map((x) => (x.id === t.id ? { ...x, status: "pendente", pago_em: "" } : x)));
    const { error } = await supabase
      .from("fin_titulos")
      .update({ status: "pendente", pago_em: null })
      .eq("id", t.id);
    if (error) {
      erro(O_msgAmigavel(error, "Não consegui reabrir o título."), error);
      carregar();
    }
  };

  const excluir = async (t: O_Titulo) => {
    if (!confirm(`Excluir a nota "${t.descricao}"?`)) return;
    const { error } = await supabase.from("fin_titulos").delete().eq("id", t.id);
    if (error) {
      erro(O_msgAmigavel(error, "Não consegui excluir."), error);
      return;
    }
    ok("Nota excluída.");
    carregar();
  };

  const FILTROS: { k: typeof filtro; label: string }[] = [
    { k: "todos", label: "Todos" },
    { k: "pendente", label: "A vencer" },
    { k: "vencido", label: "Vencidos" },
    { k: "pago", label: "Recebidos" },
  ];

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
              background: `linear-gradient(135deg, ${O_COR} 0%, #f59e0b 100%)`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 24,
              boxShadow: `0 8px 20px ${O_COR}30`,
            }}
          >
            <span style={{ filter: "saturate(0) brightness(2)" }}>📥</span>
          </div>
          <div>
            <h1 style={{ color: "#1f2937", fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: -0.3 }}>
              Receber das Operadoras
            </h1>
            <p style={{ color: "#6b7280", fontSize: 12, margin: "2px 0 0" }}>
              Notas e comissões a receber das operadoras
            </p>
          </div>
        </div>
        <button
          onClick={abrirNovo}
          style={{
            background: `linear-gradient(135deg, ${O_COR} 0%, #f59e0b 100%)`,
            color: "white",
            border: "none",
            borderRadius: 12,
            padding: "11px 18px",
            fontSize: 13,
            cursor: "pointer",
            fontWeight: 700,
            boxShadow: `0 4px 12px ${O_COR}40`,
          }}
        >
          + Nova nota
        </button>
      </div>

      {/* STATS */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
        {[
          { label: "A receber", value: O_real(stats.aReceber), cor: O_COR, icon: "📥" },
          { label: "Recebido", value: O_real(stats.recebido), cor: "#16a34a", icon: "✅" },
          { label: "Vencido", value: O_real(stats.vencido), cor: "#dc2626", icon: "⚠️" },
        ].map((s) => (
          <div key={s.label} style={{ ...O_card, padding: 16, borderTop: `3px solid ${s.cor}` }}>
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

      {/* FILTRO */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {FILTROS.map((f) => {
          const ativo = filtro === f.k;
          return (
            <button
              key={f.k}
              onClick={() => setFiltro(f.k)}
              style={{
                background: ativo ? O_COR : "#ffffff",
                color: ativo ? "#fff" : "#6b7280",
                border: `1px solid ${ativo ? O_COR : "#e5e7eb"}`,
                borderRadius: 8,
                padding: "6px 14px",
                fontSize: 12,
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* LISTA */}
      {carregando ? (
        <div style={{ ...O_card, padding: 40, textAlign: "center" }}>
          <p style={{ color: "#6b7280", fontSize: 13 }}>Carregando...</p>
        </div>
      ) : filtrados.length === 0 ? (
        <div style={{ ...O_card, padding: 40, textAlign: "center" }}>
          <p style={{ fontSize: 36, margin: "0 0 8px" }}>📭</p>
          <p style={{ color: "#6b7280", fontSize: 13 }}>
            {lista.length === 0 ? "Nenhuma nota a receber ainda." : "Nada com esse filtro."}
          </p>
        </div>
      ) : (
        <div style={{ ...O_card, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
              <thead>
                <tr style={{ background: "#f9fafb" }}>
                  {["Descrição / NF", "Operadora", "Vencimento", "Valor", "Status", "Ações"].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "12px 16px",
                        color: "#6b7280",
                        fontSize: 11,
                        textAlign: h === "Valor" ? "right" : "left",
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
                {filtrados.map((t, i) => {
                  const vencido = venceu(t);
                  const stCor = t.status === "pago" ? "#16a34a" : vencido ? "#dc2626" : O_COR;
                  const stLabel = t.status === "pago" ? "Recebido" : vencido ? "Vencido" : "A vencer";
                  return (
                    <tr
                      key={t.id}
                      style={{ borderTop: "1px solid #f3f4f6", background: i % 2 === 0 ? "#fff" : "#fafbfc" }}
                    >
                      <td style={{ padding: "12px 16px" }}>
                        <p style={{ color: "#1f2937", fontSize: 13, fontWeight: 700, margin: 0 }}>
                          {t.descricao}
                        </p>
                        {t.categoria && (
                          <p style={{ color: "#9ca3af", fontSize: 11, margin: "2px 0 0" }}>{t.categoria}</p>
                        )}
                      </td>
                      <td style={{ padding: "12px 16px", color: "#4b5563", fontSize: 12 }}>
                        {t.parte || "—"}
                      </td>
                      <td
                        style={{
                          padding: "12px 16px",
                          color: vencido ? "#dc2626" : "#4b5563",
                          fontSize: 12,
                          fontWeight: vencido ? 700 : 400,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {O_dataBR(t.vencimento)}
                      </td>
                      <td
                        style={{
                          padding: "12px 16px",
                          textAlign: "right",
                          color: "#1f2937",
                          fontSize: 13,
                          fontWeight: 700,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {O_real(t.valor)}
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <span
                          style={{
                            background: `${stCor}15`,
                            color: stCor,
                            border: `1px solid ${stCor}40`,
                            padding: "3px 10px",
                            borderRadius: 10,
                            fontSize: 11,
                            fontWeight: 700,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {stLabel}
                        </span>
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ display: "flex", gap: 6 }}>
                          {t.status === "pago" ? (
                            <button
                              onClick={() => reabrir(t)}
                              title="Reabrir"
                              style={{
                                background: "#f9fafb",
                                color: "#6b7280",
                                border: "1px solid #e5e7eb",
                                borderRadius: 8,
                                padding: "5px 10px",
                                fontSize: 11,
                                cursor: "pointer",
                                fontWeight: 600,
                                whiteSpace: "nowrap",
                              }}
                            >
                              ↺
                            </button>
                          ) : (
                            <button
                              onClick={() => marcarRecebido(t)}
                              title="Marcar como recebido"
                              style={{
                                background: "#f0fdf4",
                                color: "#16a34a",
                                border: "1px solid #bbf7d0",
                                borderRadius: 8,
                                padding: "5px 10px",
                                fontSize: 11,
                                cursor: "pointer",
                                fontWeight: 700,
                                whiteSpace: "nowrap",
                              }}
                            >
                              ✓ Recebi
                            </button>
                          )}
                          <button
                            onClick={() => abrirEditar(t)}
                            style={{
                              background: "#fffbeb",
                              color: O_COR_TEXTO,
                              border: "1px solid #fde68a",
                              borderRadius: 8,
                              padding: "5px 10px",
                              fontSize: 11,
                              cursor: "pointer",
                              fontWeight: 600,
                            }}
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => excluir(t)}
                            style={{
                              background: "#fef2f2",
                              color: "#dc2626",
                              border: "1px solid #fecaca",
                              borderRadius: 8,
                              padding: "5px 10px",
                              fontSize: 11,
                              cursor: "pointer",
                              fontWeight: 600,
                            }}
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL */}
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
            style={{ ...O_card, width: "100%", maxWidth: 520, overflow: "hidden" }}
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
              <h3 style={{ color: "#1f2937", fontSize: 16, fontWeight: 700, margin: 0 }}>
                {form.id ? "Editar título" : "Nova nota a receber"}
              </h3>
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
              <O_Campo label="Descrição *">
                <input
                  value={form.descricao}
                  onChange={(e) => set("descricao", e.target.value)}
                  style={O_inputStyle}
                  placeholder="Ex: NF 12345 — Comissão Maio"
                />
              </O_Campo>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <O_Campo label="Operadora">
                  <input
                    value={form.parte}
                    onChange={(e) => set("parte", e.target.value)}
                    style={O_inputStyle}
                    placeholder="Ex: Vivo, Claro, TIM"
                  />
                </O_Campo>
                <O_Campo label="Categoria">
                  <input
                    value={form.categoria}
                    onChange={(e) => set("categoria", e.target.value)}
                    style={O_inputStyle}
                    placeholder="Ex: Serviços"
                  />
                </O_Campo>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <O_Campo label="Valor (R$)">
                  <input
                    type="number"
                    step="0.01"
                    value={form.valor || ""}
                    onChange={(e) => set("valor", Number(e.target.value))}
                    style={O_inputStyle}
                  />
                </O_Campo>
                <O_Campo label="Vencimento">
                  <input
                    type="date"
                    value={form.vencimento}
                    onChange={(e) => set("vencimento", e.target.value)}
                    style={O_inputStyle}
                  />
                </O_Campo>
              </div>
              <O_Campo label="Status">
                <select
                  value={form.status}
                  onChange={(e) => set("status", e.target.value)}
                  style={O_inputStyle}
                >
                  <option value="pendente">A receber</option>
                  <option value="pago">Já recebido</option>
                </select>
              </O_Campo>
              <O_Campo label="Observação">
                <input
                  value={form.observacao}
                  onChange={(e) => set("observacao", e.target.value)}
                  style={O_inputStyle}
                  placeholder="Opcional"
                />
              </O_Campo>
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
                  background: "#fff",
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
                  background: `linear-gradient(135deg, ${O_COR} 0%, #f59e0b 100%)`,
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
                {salvando ? "Salvando..." : "💾 Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TOAST */}
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

function O_Campo({ label, children }: { label: string; children: React.ReactNode }) {
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

// ═══════════════════════════════════════════════════════════════════════
// 💵 Financeiro · Pagar / Despesas (CONECTADO — fin_titulos tipo='pagar')
// Imposto, Custo de Nota, Folha, Outros. Botão "Lançar folha" puxa o total
// de salários+comissão do mês (folha_itens) como uma despesa automática.
// ═══════════════════════════════════════════════════════════════════════

const D_COR = "#d97706";
const D_COR_TEXTO = "#b45309";
const D_card = {
  background: "#ffffff",
  borderRadius: 14,
  border: "1px solid #e5e7eb",
  boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
};
const D_inputStyle = {
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
const D_real = (v: number) => (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const D_dataBR = (iso: string) => {
  if (!iso) return "—";
  try {
    return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR");
  } catch {
    return iso;
  }
};
const D_hoje = () => new Date().toISOString().slice(0, 10);
const D_MESES = [
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
const D_fmtComp = (c: string) => {
  const [a, m] = (c || "").split("-");
  const i = Number(m) - 1;
  return a && D_MESES[i] ? `${D_MESES[i]}/${a}` : c;
};
const D_ultimoDiaDoMes = (comp: string) => {
  const [a, m] = comp.split("-").map(Number);
  return new Date(a, m, 0).toISOString().slice(0, 10);
};

const D_CATEGORIAS = ["Imposto", "Custo de Nota", "Folha", "Aluguel", "Fornecedor", "Outro"];

function D_msgAmigavel(error: any, padrao: string): string {
  const code = error?.code;
  const txt = (error?.message || "").toLowerCase();
  if (code === "42703" || txt.includes("does not exist") || txt.includes("fin_titulos")) {
    return "O financeiro precisa de uma atualização no sistema que ainda não foi aplicada.";
  }
  if (code === "23505") return "Esse registro já existe.";
  if (code === "PGRST301" || txt.includes("permission") || txt.includes("rls"))
    return "Você não tem permissão para isso.";
  if (txt.includes("network") || txt.includes("fetch")) return "Falha de conexão. Tente de novo.";
  return padrao;
}

type D_Despesa = {
  id: string;
  descricao: string;
  categoria: string;
  valor: number;
  vencimento: string;
  status: string;
  observacao: string;
};
const D_FORM_VAZIO: D_Despesa = {
  id: "",
  descricao: "",
  categoria: "Outro",
  valor: 0,
  vencimento: "",
  status: "pendente",
  observacao: "",
};
type D_Aviso = { tipo: "erro" | "ok"; titulo: string } | null;

export function DespesasSection() {
  const [lista, setLista] = useState<D_Despesa[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [filtro, setFiltro] = useState<"todos" | "pendente" | "pago" | "vencido">("todos");
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState<D_Despesa>(D_FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<D_Aviso>(null);
  const [compsFolha, setCompsFolha] = useState<string[]>([]);
  const [compFolha, setCompFolha] = useState("");
  const [puxando, setPuxando] = useState(false);
  const set = (k: keyof D_Despesa, v: any) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 4500);
    return () => clearTimeout(t);
  }, [aviso]);
  const erro = (titulo: string, e?: any) => {
    if (e) console.error("[Despesas]", e);
    setAviso({ tipo: "erro", titulo });
  };
  const ok = (titulo: string) => setAviso({ tipo: "ok", titulo });

  const carregar = async () => {
    setCarregando(true);
    const { data, error } = await supabase
      .from("fin_titulos")
      .select("*")
      .eq("tipo", "pagar")
      .order("vencimento", { ascending: true });
    if (error) {
      erro(D_msgAmigavel(error, "Não consegui carregar as despesas."), error);
      setCarregando(false);
      return;
    }
    setLista(
      (data || []).map((r: any) => ({
        id: r.id,
        descricao: r.descricao || "",
        categoria: r.categoria || "Outro",
        valor: Number(r.valor) || 0,
        vencimento: r.vencimento || "",
        status: r.status || "pendente",
        observacao: r.observacao || "",
      }))
    );
    setCarregando(false);
  };
  useEffect(() => {
    carregar();
  }, []);

  // competências de folha disponíveis (pro botão "lançar folha")
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("folha_itens").select("competencia");
      const cs = Array.from(new Set((data || []).map((r: any) => r.competencia).filter(Boolean)))
        .sort()
        .reverse() as string[];
      setCompsFolha(cs);
      setCompFolha((a) => a || (cs.length ? cs[0] : ""));
    })();
  }, []);

  const venceu = (d: D_Despesa) => d.status !== "pago" && d.vencimento && d.vencimento < D_hoje();

  const filtrados = useMemo(() => {
    if (filtro === "todos") return lista;
    if (filtro === "vencido") return lista.filter(venceu);
    if (filtro === "pendente") return lista.filter((d) => d.status !== "pago" && !venceu(d));
    return lista.filter((d) => d.status === "pago");
  }, [lista, filtro]);

  const stats = useMemo(() => {
    const aPagar = lista.filter((d) => d.status !== "pago").reduce((s, d) => s + d.valor, 0);
    const pago = lista.filter((d) => d.status === "pago").reduce((s, d) => s + d.valor, 0);
    const vencido = lista.filter(venceu).reduce((s, d) => s + d.valor, 0);
    return { aPagar, pago, vencido };
  }, [lista]);

  const abrirNovo = () => {
    setForm(D_FORM_VAZIO);
    setModal(true);
  };
  const abrirEditar = (d: D_Despesa) => {
    setForm(d);
    setModal(true);
  };

  const salvar = async () => {
    if (!form.descricao.trim()) {
      erro("Informe a descrição da despesa.");
      return;
    }
    setSalvando(true);
    const payload = {
      tipo: "pagar",
      descricao: form.descricao,
      categoria: form.categoria || "Outro",
      valor: form.valor || 0,
      vencimento: form.vencimento || null,
      status: form.status || "pendente",
      observacao: form.observacao || null,
      pago_em: form.status === "pago" ? D_hoje() : null,
    };
    const { error } = form.id
      ? await supabase.from("fin_titulos").update(payload).eq("id", form.id)
      : await supabase.from("fin_titulos").insert(payload);
    setSalvando(false);
    if (error) {
      erro(D_msgAmigavel(error, "Não consegui salvar a despesa."), error);
      return;
    }
    setModal(false);
    setForm(D_FORM_VAZIO);
    ok(form.id ? "D_Despesa atualizada." : "D_Despesa criada.");
    carregar();
  };

  const marcarPago = async (d: D_Despesa) => {
    setLista((l) => l.map((x) => (x.id === d.id ? { ...x, status: "pago" } : x)));
    const { error } = await supabase
      .from("fin_titulos")
      .update({ status: "pago", pago_em: D_hoje() })
      .eq("id", d.id);
    if (error) {
      erro(D_msgAmigavel(error, "Não consegui marcar como pago."), error);
      carregar();
    } else ok("Pagamento registrado.");
  };
  const reabrir = async (d: D_Despesa) => {
    setLista((l) => l.map((x) => (x.id === d.id ? { ...x, status: "pendente" } : x)));
    const { error } = await supabase
      .from("fin_titulos")
      .update({ status: "pendente", pago_em: null })
      .eq("id", d.id);
    if (error) {
      erro(D_msgAmigavel(error, "Não consegui reabrir."), error);
      carregar();
    }
  };
  const excluir = async (d: D_Despesa) => {
    if (!confirm(`Excluir a despesa "${d.descricao}"?`)) return;
    const { error } = await supabase.from("fin_titulos").delete().eq("id", d.id);
    if (error) {
      erro(D_msgAmigavel(error, "Não consegui excluir."), error);
      return;
    }
    ok("D_Despesa excluída.");
    carregar();
  };

  // 🔌 Lança a folha do mês como uma despesa (total de salários + comissão)
  const lancarFolha = async () => {
    if (!compFolha) {
      erro("Não há folha gerada pra lançar.");
      return;
    }
    setPuxando(true);
    const { data, error } = await supabase
      .from("folha_itens")
      .select("base, comissao")
      .eq("competencia", compFolha);
    if (error) {
      setPuxando(false);
      erro(D_msgAmigavel(error, "Não consegui ler a folha."), error);
      return;
    }
    const total = (data || []).reduce(
      (s: number, r: any) => s + (Number(r.base) || 0) + (Number(r.comissao) || 0),
      0
    );
    if (total <= 0) {
      setPuxando(false);
      erro("A folha desse mês está zerada.");
      return;
    }
    const descricao = `Folha de ${D_fmtComp(compFolha)}`;
    // evita duplicar: já existe uma despesa de folha com essa descrição?
    const jaExiste = lista.some((d) => d.categoria === "Folha" && d.descricao === descricao);
    if (jaExiste) {
      setPuxando(false);
      erro("A folha desse mês já foi lançada como despesa.");
      return;
    }
    const { error: insErr } = await supabase.from("fin_titulos").insert({
      tipo: "pagar",
      descricao,
      categoria: "Folha",
      valor: total,
      vencimento: D_ultimoDiaDoMes(compFolha),
      status: "pendente",
    });
    setPuxando(false);
    if (insErr) {
      erro(D_msgAmigavel(insErr, "Não consegui lançar a folha."), insErr);
      return;
    }
    ok(`Folha de ${D_fmtComp(compFolha)} lançada: ${D_real(total)}.`);
    carregar();
  };

  const FILTROS: { k: typeof filtro; label: string }[] = [
    { k: "todos", label: "Todas" },
    { k: "pendente", label: "A vencer" },
    { k: "vencido", label: "Vencidas" },
    { k: "pago", label: "Pagas" },
  ];
  const D_catCor: Record<string, string> = {
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
              background: `linear-gradient(135deg, ${D_COR} 0%, #f59e0b 100%)`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 24,
              boxShadow: `0 8px 20px ${D_COR}30`,
            }}
          >
            <span style={{ filter: "saturate(0) brightness(2)" }}>📤</span>
          </div>
          <div>
            <h1 style={{ color: "#1f2937", fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: -0.3 }}>
              Pagar / Despesas
            </h1>
            <p style={{ color: "#6b7280", fontSize: 12, margin: "2px 0 0" }}>
              Impostos, custo de nota, folha e outras saídas
            </p>
          </div>
        </div>
        <button
          onClick={abrirNovo}
          style={{
            background: `linear-gradient(135deg, ${D_COR} 0%, #f59e0b 100%)`,
            color: "white",
            border: "none",
            borderRadius: 12,
            padding: "11px 18px",
            fontSize: 13,
            cursor: "pointer",
            fontWeight: 700,
            boxShadow: `0 4px 12px ${D_COR}40`,
          }}
        >
          + Nova despesa
        </button>
      </div>

      {/* STATS */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
        {[
          { label: "A pagar", value: D_real(stats.aPagar), cor: D_COR, icon: "📤" },
          { label: "Pago", value: D_real(stats.pago), cor: "#16a34a", icon: "✅" },
          { label: "Vencido", value: D_real(stats.vencido), cor: "#dc2626", icon: "⚠️" },
        ].map((s) => (
          <div key={s.label} style={{ ...D_card, padding: 16, borderTop: `3px solid ${s.cor}` }}>
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

      {/* LANÇAR FOLHA */}
      {compsFolha.length > 0 && (
        <div
          style={{
            ...D_card,
            padding: 14,
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
            background: "#fffbeb",
            borderColor: "#fde68a",
          }}
        >
          <span style={{ fontSize: 18 }}>👥</span>
          <span style={{ color: D_COR_TEXTO, fontSize: 13, fontWeight: 700 }}>
            Lançar a folha do mês como despesa:
          </span>
          <select
            value={compFolha}
            onChange={(e) => setCompFolha(e.target.value)}
            style={{
              border: "1px solid #fde68a",
              borderRadius: 8,
              padding: "6px 10px",
              fontSize: 13,
              fontWeight: 600,
              color: "#1f2937",
              outline: "none",
              background: "#fff",
            }}
          >
            {compsFolha.map((c) => (
              <option key={c} value={c}>
                {D_fmtComp(c)}
              </option>
            ))}
          </select>
          <button
            onClick={lancarFolha}
            disabled={puxando}
            style={{
              background: D_COR,
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "7px 14px",
              fontSize: 12,
              cursor: puxando ? "wait" : "pointer",
              fontWeight: 700,
            }}
          >
            {puxando ? "Lançando..." : "Lançar folha"}
          </button>
        </div>
      )}

      {/* FILTRO */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {FILTROS.map((f) => {
          const ativo = filtro === f.k;
          return (
            <button
              key={f.k}
              onClick={() => setFiltro(f.k)}
              style={{
                background: ativo ? D_COR : "#fff",
                color: ativo ? "#fff" : "#6b7280",
                border: `1px solid ${ativo ? D_COR : "#e5e7eb"}`,
                borderRadius: 8,
                padding: "6px 14px",
                fontSize: 12,
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* LISTA */}
      {carregando ? (
        <div style={{ ...D_card, padding: 40, textAlign: "center" }}>
          <p style={{ color: "#6b7280", fontSize: 13 }}>Carregando...</p>
        </div>
      ) : filtrados.length === 0 ? (
        <div style={{ ...D_card, padding: 40, textAlign: "center" }}>
          <p style={{ fontSize: 36, margin: "0 0 8px" }}>📭</p>
          <p style={{ color: "#6b7280", fontSize: 13 }}>
            {lista.length === 0 ? "Nenhuma despesa lançada ainda." : "Nada com esse filtro."}
          </p>
        </div>
      ) : (
        <div style={{ ...D_card, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 660 }}>
              <thead>
                <tr style={{ background: "#f9fafb" }}>
                  {["Descrição", "Tipo", "Vencimento", "Valor", "Status", "Ações"].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "12px 16px",
                        color: "#6b7280",
                        fontSize: 11,
                        textAlign: h === "Valor" ? "right" : "left",
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
                {filtrados.map((d, i) => {
                  const vencida = venceu(d);
                  const stCor = d.status === "pago" ? "#16a34a" : vencida ? "#dc2626" : D_COR;
                  const stLabel = d.status === "pago" ? "Pago" : vencida ? "Vencida" : "A vencer";
                  const cc = D_catCor[d.categoria] || "#6b7280";
                  return (
                    <tr
                      key={d.id}
                      style={{ borderTop: "1px solid #f3f4f6", background: i % 2 === 0 ? "#fff" : "#fafbfc" }}
                    >
                      <td style={{ padding: "12px 16px" }}>
                        <p style={{ color: "#1f2937", fontSize: 13, fontWeight: 700, margin: 0 }}>
                          {d.descricao}
                        </p>
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <span
                          style={{
                            background: `${cc}15`,
                            color: cc,
                            border: `1px solid ${cc}40`,
                            padding: "3px 10px",
                            borderRadius: 10,
                            fontSize: 11,
                            fontWeight: 700,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {d.categoria}
                        </span>
                      </td>
                      <td
                        style={{
                          padding: "12px 16px",
                          color: vencida ? "#dc2626" : "#4b5563",
                          fontSize: 12,
                          fontWeight: vencida ? 700 : 400,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {D_dataBR(d.vencimento)}
                      </td>
                      <td
                        style={{
                          padding: "12px 16px",
                          textAlign: "right",
                          color: "#1f2937",
                          fontSize: 13,
                          fontWeight: 700,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {D_real(d.valor)}
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <span
                          style={{
                            background: `${stCor}15`,
                            color: stCor,
                            border: `1px solid ${stCor}40`,
                            padding: "3px 10px",
                            borderRadius: 10,
                            fontSize: 11,
                            fontWeight: 700,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {stLabel}
                        </span>
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ display: "flex", gap: 6 }}>
                          {d.status === "pago" ? (
                            <button
                              onClick={() => reabrir(d)}
                              title="Reabrir"
                              style={{
                                background: "#f9fafb",
                                color: "#6b7280",
                                border: "1px solid #e5e7eb",
                                borderRadius: 8,
                                padding: "5px 10px",
                                fontSize: 11,
                                cursor: "pointer",
                                fontWeight: 600,
                              }}
                            >
                              ↺
                            </button>
                          ) : (
                            <button
                              onClick={() => marcarPago(d)}
                              title="Marcar como pago"
                              style={{
                                background: "#f0fdf4",
                                color: "#16a34a",
                                border: "1px solid #bbf7d0",
                                borderRadius: 8,
                                padding: "5px 10px",
                                fontSize: 11,
                                cursor: "pointer",
                                fontWeight: 700,
                                whiteSpace: "nowrap",
                              }}
                            >
                              ✓ Paguei
                            </button>
                          )}
                          <button
                            onClick={() => abrirEditar(d)}
                            style={{
                              background: "#fffbeb",
                              color: D_COR_TEXTO,
                              border: "1px solid #fde68a",
                              borderRadius: 8,
                              padding: "5px 10px",
                              fontSize: 11,
                              cursor: "pointer",
                              fontWeight: 600,
                            }}
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => excluir(d)}
                            style={{
                              background: "#fef2f2",
                              color: "#dc2626",
                              border: "1px solid #fecaca",
                              borderRadius: 8,
                              padding: "5px 10px",
                              fontSize: 11,
                              cursor: "pointer",
                              fontWeight: 600,
                            }}
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL */}
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
            style={{ ...D_card, width: "100%", maxWidth: 520, overflow: "hidden" }}
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
              <h3 style={{ color: "#1f2937", fontSize: 16, fontWeight: 700, margin: 0 }}>
                {form.id ? "Editar despesa" : "Nova despesa"}
              </h3>
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
              <D_Campo label="Descrição *">
                <input
                  value={form.descricao}
                  onChange={(e) => set("descricao", e.target.value)}
                  style={D_inputStyle}
                  placeholder="Ex: DAS Simples Nacional"
                />
              </D_Campo>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <D_Campo label="Tipo de despesa">
                  <select
                    value={form.categoria}
                    onChange={(e) => set("categoria", e.target.value)}
                    style={D_inputStyle}
                  >
                    {D_CATEGORIAS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </D_Campo>
                <D_Campo label="Valor (R$)">
                  <input
                    type="number"
                    step="0.01"
                    value={form.valor || ""}
                    onChange={(e) => set("valor", Number(e.target.value))}
                    style={D_inputStyle}
                  />
                </D_Campo>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <D_Campo label="Vencimento">
                  <input
                    type="date"
                    value={form.vencimento}
                    onChange={(e) => set("vencimento", e.target.value)}
                    style={D_inputStyle}
                  />
                </D_Campo>
                <D_Campo label="Status">
                  <select
                    value={form.status}
                    onChange={(e) => set("status", e.target.value)}
                    style={D_inputStyle}
                  >
                    <option value="pendente">A pagar</option>
                    <option value="pago">Já pago</option>
                  </select>
                </D_Campo>
              </div>
              <D_Campo label="Observação">
                <input
                  value={form.observacao}
                  onChange={(e) => set("observacao", e.target.value)}
                  style={D_inputStyle}
                  placeholder="Opcional"
                />
              </D_Campo>
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
                  background: "#fff",
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
                  background: `linear-gradient(135deg, ${D_COR} 0%, #f59e0b 100%)`,
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
                {salvando ? "Salvando..." : "💾 Salvar"}
              </button>
            </div>
          </div>
        </div>
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

function D_Campo({ label, children }: { label: string; children: React.ReactNode }) {
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

// ═══════════════════════════════════════════════════════════════════════
// 💵 Financeiro · Folha do Mês (CONECTADO — lê folha_itens do RH)
// Mostra o custo de salários + comissão de TODAS as formas:
//   • Total geral  • Agrupado por equipe (departamento)  • Por funcionário
// Cruza folha_itens (nome, base, comissao) com funcionarios (departamento).
// ═══════════════════════════════════════════════════════════════════════

const F_COR = "#d97706";
const F_COR_TEXTO = "#b45309";
const F_card = {
  background: "#ffffff",
  borderRadius: 14,
  border: "1px solid #e5e7eb",
  boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
};
const F_real = (v: number) => (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const F_MESES = [
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
function F_fmtComp(c: string) {
  const [ano, mes] = (c || "").split("-");
  const i = Number(mes) - 1;
  if (!ano || isNaN(i) || !F_MESES[i]) return c;
  return `${F_MESES[i]}/${ano}`;
}

type F_Item = {
  nome: string;
  cargo: string;
  base: number;
  comissao: number;
  total: number;
  departamento: string;
};
type F_Aviso = { tipo: "erro" | "ok"; titulo: string } | null;

export function FolhaSection() {
  const [itens, setItens] = useState<F_Item[]>([]);
  const [comps, setComps] = useState<string[]>([]);
  const [comp, setComp] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [modo, setModo] = useState<"equipe" | "funcionario">("equipe");
  const [aviso, setAviso] = useState<F_Aviso>(null);

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
      const lista: F_Item[] = (folhaR.data || []).map((r: any) => {
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
    const m: Record<string, F_Item[]> = {};
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
              background: `linear-gradient(135deg, ${F_COR} 0%, #f59e0b 100%)`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 24,
              boxShadow: `0 8px 20px ${F_COR}30`,
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
                {F_fmtComp(c)}
              </option>
            ))}
          </select>
        )}
      </div>

      {carregando ? (
        <div style={{ ...F_card, padding: 40, textAlign: "center" }}>
          <p style={{ color: "#6b7280", fontSize: 13 }}>Carregando...</p>
        </div>
      ) : comps.length === 0 ? (
        <div style={{ ...F_card, padding: 40, textAlign: "center" }}>
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
              { label: "Total da folha", value: F_real(totalGeral), cor: F_COR, icon: "💰" },
              { label: "Só salários", value: F_real(totalBase), cor: "#6366f1", icon: "🧾" },
              { label: "Só comissão", value: F_real(totalComissao), cor: "#8b5cf6", icon: "📈" },
              { label: "Funcionários", value: String(itens.length), cor: "#16a34a", icon: "👥" },
            ].map((s) => (
              <div key={s.label} style={{ ...F_card, padding: 16, borderTop: `3px solid ${s.cor}` }}>
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
                    background: ativo ? F_COR : "#fff",
                    color: ativo ? "#fff" : "#6b7280",
                    border: `1px solid ${ativo ? F_COR : "#e5e7eb"}`,
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
                <div key={g.dep} style={{ ...F_card, overflow: "hidden" }}>
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
                          background: `${F_COR}15`,
                          color: F_COR_TEXTO,
                          fontSize: 11,
                          padding: "2px 8px",
                          borderRadius: 8,
                          fontWeight: 700,
                        }}
                      >
                        {g.lista.length}
                      </span>
                    </div>
                    <span style={{ color: F_COR_TEXTO, fontSize: 15, fontWeight: 800 }}>
                      {F_real(g.subtotal)}
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
                              {F_real(it.base)}
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
                              {F_real(it.comissao)}
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
                              {F_real(it.total)}
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
            <div style={{ ...F_card, overflow: "hidden" }}>
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
                          {F_real(it.base)}
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
                          {F_real(it.comissao)}
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
                          {F_real(it.total)}
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
                        {F_real(totalBase)}
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
                        {F_real(totalComissao)}
                      </td>
                      <td
                        style={{
                          padding: "12px 16px",
                          textAlign: "right",
                          color: F_COR_TEXTO,
                          fontSize: 14,
                          fontWeight: 800,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {F_real(totalGeral)}
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

// ═══════════════════════════════════════════════════════════════════════
// 💵 FINANCEIRO — Shell do módulo (UnitaSystem)
// ───────────────────────────────────────────────────────────────────────
// Sub-sidebar própria com TODAS as seções de um sistema financeiro completo,
// agrupadas em menus expansíveis. A aba ativa é controlada por estado local
// (useState) — troca de seção sem recarregar a rota.
// Só o Dashboard está implementado; as demais mostram um placeholder
// estilizado "em construção" pronto pra receber cada section depois.
//
// Cor do módulo: ÂMBAR/DOURADO (#f59e0b / #b45309) — alinhado ao atalho.
// ═══════════════════════════════════════════════════════════════════════

const COR = "#d97706"; // âmbar principal
const COR_TEXTO = "#b45309"; // âmbar escuro (texto)
const COR_BG = "#fffbeb"; // âmbar bem claro (fundos)
const COR_BORDA = "#fde68a"; // âmbar borda

type SubItem = { key: string; label: string };
type Grupo = { key: string; icon: string; label: string; itens: SubItem[] };

const GRUPOS: Grupo[] = [
  {
    key: "geral",
    icon: "📊",
    label: "Visão",
    itens: [{ key: "resumo", label: "Resumo" }],
  },
  {
    key: "mov",
    icon: "💸",
    label: "Movimento do Mês",
    itens: [
      { key: "receber", label: "Receber (Operadoras)" },
      { key: "pagar", label: "Pagar (Despesas)" },
      { key: "folha", label: "Folha do Mês" },
    ],
  },
];

const LABELS: Record<string, string> = Object.fromEntries(
  GRUPOS.flatMap((g) => g.itens.map((i) => [i.key, i.label]))
);

export default function FinanceiroLayolt() {
  const [aba, setAba] = useState("resumo");
  const [grupoAberto, setGrupoAberto] = useState<string | null>("mov");
  const [isMobile, setIsMobile] = useState(false);
  const [menuMobileAberto, setMenuMobileAberto] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const selecionar = (key: string) => {
    setAba(key);
    if (isMobile) setMenuMobileAberto(false);
  };

  return (
    <div
      style={{
        display: "flex",
        height: "100%",
        minHeight: 0,
        fontFamily: "Arial, sans-serif",
        background: "#f8fafc",
        position: "relative",
      }}
    >
      {/* HAMBÚRGUER (mobile) */}
      {isMobile && !menuMobileAberto && (
        <button
          onClick={() => setMenuMobileAberto(true)}
          title="Abrir menu do módulo"
          style={{
            position: "fixed",
            top: 8,
            right: 8,
            zIndex: 1095,
            background: "#ffffff",
            border: "1px solid #fde68a",
            color: "#b45309",
            borderRadius: 10,
            padding: "6px 12px",
            fontSize: 14,
            fontWeight: 700,
            cursor: "pointer",
            lineHeight: 1,
            boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
          }}
        >
          ☰ Seções
        </button>
      )}
      {isMobile && menuMobileAberto && (
        <div
          onClick={() => setMenuMobileAberto(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.4)",
            backdropFilter: "blur(2px)",
            zIndex: 1090,
          }}
        />
      )}

      {/* SUB-SIDEBAR DO MÓDULO */}
      <div
        style={{
          width: isMobile ? 260 : 224,
          background: "#ffffff",
          borderRight: "1px solid #e5e7eb",
          display: "flex",
          flexDirection: "column",
          overflowY: "auto",
          flexShrink: 0,
          position: isMobile ? "fixed" : "relative",
          top: isMobile ? 0 : "auto",
          right: isMobile ? 0 : "auto",
          bottom: isMobile ? 0 : "auto",
          height: isMobile ? "100vh" : "auto",
          zIndex: isMobile ? 1100 : "auto",
          transform: isMobile && !menuMobileAberto ? "translateX(100%)" : "translateX(0)",
          transition: "transform 0.25s ease",
          boxShadow: isMobile ? "-4px 0 16px rgba(0,0,0,0.1)" : "none",
        }}
      >
        {/* Header do módulo */}
        <div
          style={{
            padding: 16,
            borderBottom: "1px solid #e5e7eb",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: `linear-gradient(135deg, ${COR} 0%, #f59e0b 100%)`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
              boxShadow: `0 4px 10px ${COR}40`,
              flexShrink: 0,
            }}
          >
            <span style={{ filter: "saturate(0) brightness(2)" }}>💵</span>
          </div>
          <div style={{ minWidth: 0 }}>
            <span
              style={{
                color: "#1f2937",
                fontWeight: 800,
                fontSize: 14,
                display: "block",
                letterSpacing: -0.3,
              }}
            >
              Financeiro
            </span>
            <span
              style={{
                color: COR_TEXTO,
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: 0.5,
                textTransform: "uppercase",
              }}
            >
              Gestão completa
            </span>
          </div>
        </div>

        {/* Menus agrupados */}
        <div style={{ padding: 10, flex: 1 }}>
          {GRUPOS.map((g) => {
            const aberto = grupoAberto === g.key;
            const temAtivo = g.itens.some((i) => i.key === aba);
            return (
              <div key={g.key} style={{ marginBottom: 4 }}>
                <button
                  onClick={() => setGrupoAberto(aberto ? null : g.key)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    width: "100%",
                    padding: "10px 12px",
                    background: aberto || temAtivo ? COR_BG : "transparent",
                    border: "none",
                    borderRadius: 10,
                    cursor: "pointer",
                    color: aberto || temAtivo ? COR_TEXTO : "#374151",
                    fontSize: 13,
                    fontWeight: aberto || temAtivo ? 700 : 600,
                    textAlign: "left",
                    transition: "background .15s",
                  }}
                  onMouseEnter={(e) => {
                    if (!aberto && !temAtivo) e.currentTarget.style.background = "#f3f4f6";
                  }}
                  onMouseLeave={(e) => {
                    if (!aberto && !temAtivo) e.currentTarget.style.background = "transparent";
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 26,
                        height: 26,
                        background: aberto || temAtivo ? COR : COR_BG,
                        borderRadius: 7,
                        fontSize: 13,
                        filter: aberto || temAtivo ? "saturate(0) brightness(2)" : "none",
                        boxShadow: aberto || temAtivo ? `0 2px 6px ${COR}40` : "none",
                      }}
                    >
                      {g.icon}
                    </span>
                    {g.label}
                  </span>
                  <span
                    style={{
                      fontSize: 9,
                      color: aberto || temAtivo ? COR : "#9ca3af",
                      transform: aberto ? "rotate(0)" : "rotate(-90deg)",
                      transition: "transform .2s",
                    }}
                  >
                    ▼
                  </span>
                </button>
                {aberto && (
                  <div
                    style={{
                      paddingLeft: 8,
                      marginTop: 2,
                      marginBottom: 4,
                      display: "flex",
                      flexDirection: "column",
                      gap: 2,
                    }}
                  >
                    {g.itens.map((sub) => {
                      const sel = aba === sub.key;
                      return (
                        <button
                          key={sub.key}
                          onClick={() => selecionar(sub.key)}
                          style={{
                            display: "block",
                            width: "100%",
                            padding: "8px 12px 8px 34px",
                            background: sel ? `${COR}18` : "transparent",
                            border: "none",
                            borderRadius: 8,
                            cursor: "pointer",
                            color: sel ? COR_TEXTO : "#6b7280",
                            fontSize: 12,
                            textAlign: "left",
                            fontWeight: sel ? 700 : 500,
                            position: "relative",
                            transition: "all .12s",
                          }}
                          onMouseEnter={(e) => {
                            if (!sel) {
                              e.currentTarget.style.background = "#f3f4f6";
                              e.currentTarget.style.color = "#1f2937";
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!sel) {
                              e.currentTarget.style.background = "transparent";
                              e.currentTarget.style.color = "#6b7280";
                            }
                          }}
                        >
                          {sel && (
                            <span
                              style={{
                                position: "absolute",
                                left: 16,
                                top: "50%",
                                transform: "translateY(-50%)",
                                width: 4,
                                height: 4,
                                borderRadius: "50%",
                                background: COR,
                              }}
                            />
                          )}
                          {sub.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* CONTEÚDO */}
      <div style={{ flex: 1, overflowY: "auto", minWidth: 0, padding: isMobile ? "56px 12px 16px" : 28 }}>
        {aba === "resumo" ? (
          <ResumoSection />
        ) : aba === "receber" ? (
          <OperadorasSection />
        ) : aba === "pagar" ? (
          <DespesasSection />
        ) : aba === "folha" ? (
          <FolhaSection />
        ) : (
          <EmConstrucao titulo={LABELS[aba] || "Seção"} />
        )}
      </div>
    </div>
  );
}

// Placeholder pras seções ainda não implementadas
function EmConstrucao({ titulo }: { titulo: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        minHeight: 360,
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: 84,
          height: 84,
          borderRadius: 22,
          background: `linear-gradient(135deg, ${COR} 0%, #f59e0b 100%)`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 40,
          boxShadow: `0 12px 24px ${COR}30`,
        }}
      >
        <span style={{ filter: "saturate(0) brightness(2)" }}>🚧</span>
      </div>
      <h2 style={{ color: "#1f2937", fontSize: 20, fontWeight: 800, margin: 0 }}>{titulo}</h2>
      <p style={{ color: "#6b7280", fontSize: 14, margin: 0, maxWidth: 360 }}>
        Esta seção faz parte do módulo Financeiro e será construída em seguida.
      </p>
      <span
        style={{
          background: COR_BG,
          color: COR_TEXTO,
          border: `1px solid ${COR_BORDA}`,
          fontSize: 11,
          fontWeight: 700,
          padding: "5px 12px",
          borderRadius: 20,
        }}
      >
        Em construção
      </span>
    </div>
  );
}