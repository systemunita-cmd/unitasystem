"use client";
import { useState, useMemo, useEffect } from "react";
import { supabase } from "../../../lib/supabase";

// ═══════════════════════════════════════════════════════════════════════
// 💵 Financeiro · Receber das Operadoras (CONECTADO — fin_titulos tipo='receber')
// Erros em toast amigável (sem alert cru). Detalhe técnico só no console.
// ═══════════════════════════════════════════════════════════════════════

const COR = "#d97706";
const COR_TEXTO = "#b45309";
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
const real = (v: number) => (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBR = (iso: string) => {
  if (!iso) return "—";
  try {
    return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR");
  } catch {
    return iso;
  }
};
const hoje = () => new Date().toISOString().slice(0, 10);

function msgAmigavel(error: any, padrao: string): string {
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

type Titulo = {
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
const FORM_VAZIO: Titulo = {
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
type Aviso = { tipo: "erro" | "ok"; titulo: string } | null;

export function OperadorasSection() {
  const [lista, setLista] = useState<Titulo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [filtro, setFiltro] = useState<"todos" | "pendente" | "pago" | "vencido">("todos");
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState<Titulo>(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<Aviso>(null);
  const set = (k: keyof Titulo, v: any) => setForm((f) => ({ ...f, [k]: v }));

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
      erro(msgAmigavel(error, "Não consegui carregar as notas."), error);
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

  const venceu = (t: Titulo) => t.status !== "pago" && t.vencimento && t.vencimento < hoje();

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
    setForm(FORM_VAZIO);
    setModal(true);
  };
  const abrirEditar = (t: Titulo) => {
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
      pago_em: form.status === "pago" ? form.pago_em || hoje() : null,
    };
    const { error } = form.id
      ? await supabase.from("fin_titulos").update(payload).eq("id", form.id)
      : await supabase.from("fin_titulos").insert(payload);
    setSalvando(false);
    if (error) {
      erro(msgAmigavel(error, "Não consegui salvar a nota."), error);
      return;
    }
    setModal(false);
    setForm(FORM_VAZIO);
    ok(form.id ? "Nota atualizada." : "Nota criada.");
    carregar();
  };

  const marcarRecebido = async (t: Titulo) => {
    setLista((l) => l.map((x) => (x.id === t.id ? { ...x, status: "pago", pago_em: hoje() } : x)));
    const { error } = await supabase
      .from("fin_titulos")
      .update({ status: "pago", pago_em: hoje() })
      .eq("id", t.id);
    if (error) {
      erro(msgAmigavel(error, "Não consegui marcar como recebido."), error);
      carregar();
    } else {
      ok("Recebimento registrado.");
    }
  };

  const reabrir = async (t: Titulo) => {
    setLista((l) => l.map((x) => (x.id === t.id ? { ...x, status: "pendente", pago_em: "" } : x)));
    const { error } = await supabase
      .from("fin_titulos")
      .update({ status: "pendente", pago_em: null })
      .eq("id", t.id);
    if (error) {
      erro(msgAmigavel(error, "Não consegui reabrir o título."), error);
      carregar();
    }
  };

  const excluir = async (t: Titulo) => {
    if (!confirm(`Excluir a nota "${t.descricao}"?`)) return;
    const { error } = await supabase.from("fin_titulos").delete().eq("id", t.id);
    if (error) {
      erro(msgAmigavel(error, "Não consegui excluir."), error);
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
              background: `linear-gradient(135deg, ${COR} 0%, #f59e0b 100%)`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 24,
              boxShadow: `0 8px 20px ${COR}30`,
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
            background: `linear-gradient(135deg, ${COR} 0%, #f59e0b 100%)`,
            color: "white",
            border: "none",
            borderRadius: 12,
            padding: "11px 18px",
            fontSize: 13,
            cursor: "pointer",
            fontWeight: 700,
            boxShadow: `0 4px 12px ${COR}40`,
          }}
        >
          + Nova nota
        </button>
      </div>

      {/* STATS */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
        {[
          { label: "A receber", value: real(stats.aReceber), cor: COR, icon: "📥" },
          { label: "Recebido", value: real(stats.recebido), cor: "#16a34a", icon: "✅" },
          { label: "Vencido", value: real(stats.vencido), cor: "#dc2626", icon: "⚠️" },
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

      {/* FILTRO */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {FILTROS.map((f) => {
          const ativo = filtro === f.k;
          return (
            <button
              key={f.k}
              onClick={() => setFiltro(f.k)}
              style={{
                background: ativo ? COR : "#ffffff",
                color: ativo ? "#fff" : "#6b7280",
                border: `1px solid ${ativo ? COR : "#e5e7eb"}`,
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
        <div style={{ ...card, padding: 40, textAlign: "center" }}>
          <p style={{ color: "#6b7280", fontSize: 13 }}>Carregando...</p>
        </div>
      ) : filtrados.length === 0 ? (
        <div style={{ ...card, padding: 40, textAlign: "center" }}>
          <p style={{ fontSize: 36, margin: "0 0 8px" }}>📭</p>
          <p style={{ color: "#6b7280", fontSize: 13 }}>
            {lista.length === 0 ? "Nenhuma nota a receber ainda." : "Nada com esse filtro."}
          </p>
        </div>
      ) : (
        <div style={{ ...card, overflow: "hidden" }}>
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
                  const stCor = t.status === "pago" ? "#16a34a" : vencido ? "#dc2626" : COR;
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
                        {dataBR(t.vencimento)}
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
                        {real(t.valor)}
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
                              color: COR_TEXTO,
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
            style={{ ...card, width: "100%", maxWidth: 520, overflow: "hidden" }}
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
              <Campo label="Descrição *">
                <input
                  value={form.descricao}
                  onChange={(e) => set("descricao", e.target.value)}
                  style={inputStyle}
                  placeholder="Ex: NF 12345 — Comissão Maio"
                />
              </Campo>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Campo label="Operadora">
                  <input
                    value={form.parte}
                    onChange={(e) => set("parte", e.target.value)}
                    style={inputStyle}
                    placeholder="Ex: Vivo, Claro, TIM"
                  />
                </Campo>
                <Campo label="Categoria">
                  <input
                    value={form.categoria}
                    onChange={(e) => set("categoria", e.target.value)}
                    style={inputStyle}
                    placeholder="Ex: Serviços"
                  />
                </Campo>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Campo label="Valor (R$)">
                  <input
                    type="number"
                    step="0.01"
                    value={form.valor || ""}
                    onChange={(e) => set("valor", Number(e.target.value))}
                    style={inputStyle}
                  />
                </Campo>
                <Campo label="Vencimento">
                  <input
                    type="date"
                    value={form.vencimento}
                    onChange={(e) => set("vencimento", e.target.value)}
                    style={inputStyle}
                  />
                </Campo>
              </div>
              <Campo label="Status">
                <select
                  value={form.status}
                  onChange={(e) => set("status", e.target.value)}
                  style={inputStyle}
                >
                  <option value="pendente">A receber</option>
                  <option value="pago">Já recebido</option>
                </select>
              </Campo>
              <Campo label="Observação">
                <input
                  value={form.observacao}
                  onChange={(e) => set("observacao", e.target.value)}
                  style={inputStyle}
                  placeholder="Opcional"
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
                  background: `linear-gradient(135deg, ${COR} 0%, #f59e0b 100%)`,
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