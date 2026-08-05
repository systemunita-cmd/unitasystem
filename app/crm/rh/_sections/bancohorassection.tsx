"use client";
import { useState, useMemo, useEffect } from "react";
import { supabase } from "../../../lib/supabase";

// ═══════════════════════════════════════════════════════════════════════
// 🧑‍💼 RH · Banco de Horas  (CONECTADO — calcula do PONTO + ajustes manuais)
// ───────────────────────────────────────────────────────────────────────
// Saldo automático: pra cada dia que a pessoa bateu ponto, compara as horas
// trabalhadas (pares de batidas) com a jornada diária esperada. Sobra = +,
// falta = −. Soma o mês. Os lançamentos manuais (tabela banco_horas) entram
// como AJUSTE somado ao saldo (abono, extra aprovada à parte, etc.).
// ═══════════════════════════════════════════════════════════════════════

const COR = "#4f46e5";
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

const hh = (h: number) => `${h >= 0 ? "+" : ""}${(h || 0).toFixed(1)}h`;
const dataBR = (iso: string) => {
  if (!iso) return "—";
  try {
    return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR");
  } catch {
    return iso;
  }
};
function mesAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
type Lanc = { id: string; funcionario_id?: string; funcionario: string; data: string; descricao: string; horas: number };
const FORM_VAZIO: Lanc = { id: "", funcionario: "", data: "", descricao: "", horas: 0 };

type FuncSaldo = {
  funcionario: string;
  cargo: string;
  horasTrab: number;
  horasEsper: number;
  saldoPonto: number;
  ajuste: number;
  saldoFinal: number;
  faltas: number;
  incompletas: { dia: string; tipos: string }[];
  dias: { dia: string; trab: number; saldo: number }[];
  manuais: Lanc[];
};

export function BancoHorasSection() {
  const [oficiais, setOficiais] = useState<any[]>([]);
  const [funcionarios, setFuncionarios] = useState<any[]>([]);
  const [manuais, setManuais] = useState<Lanc[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [pendencias, setPendencias] = useState<any[]>([]);
  const [mes, setMes] = useState(mesAtual());
  const [aberto, setAberto] = useState<string | null>(null);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState<Lanc>(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);

  const carregar = async (m: string) => {
    setCarregando(true);
    setErro("");
    const [resOficial, resManual, resFuncionarios, resPendencias] = await Promise.all([
      supabase.rpc("calcular_banco_horas", { p_competencia: m, p_funcionario_id: null, p_ate: new Date().toISOString() }),
      supabase.from("banco_horas").select("*").order("data", { ascending: false }),
      supabase.from("funcionarios").select("id,nome,cargo,status").neq("status", "desligado").order("nome"),
      supabase.rpc("listar_batidas_incompletas", { p_competencia: m }),
    ]);
    if (resOficial.error) setErro(resOficial.error.message);
    setOficiais(resOficial.data || []);
    setFuncionarios(resFuncionarios.data || []);
    setPendencias(resPendencias.data || []);
    const todos = (resManual.data || []).map((r: any) => ({
      id: r.id, funcionario_id: r.funcionario_id || undefined, funcionario: r.funcionario,
      data: r.data || "", descricao: r.descricao || "", horas: Number(r.horas) || 0,
    })) as Lanc[];
    setManuais(todos.filter(l => !l.data || (l.data >= `${m}-01` && l.data < `${m}-32`)));
    setCarregando(false);
  };
  useEffect(() => { carregar(mes); }, [mes]);

  const saldos = useMemo<FuncSaldo[]>(() => oficiais.map((r: any) => {
    const manuaisFunc = manuais.filter(l =>
      (l.funcionario_id && l.funcionario_id === r.funcionario_id) ||
      (!l.funcionario_id && l.funcionario.trim().toLowerCase() === String(r.nome || "").trim().toLowerCase()));
    const ajuste = manuaisFunc.reduce((total,l) => total + Number(l.horas || 0), 0);
    const saldoFinal = Number(r.saldo_min || 0) / 60;
    const f = funcionarios.find(x => x.id === r.funcionario_id);
    return {
      funcionario: r.nome, cargo: f?.cargo || "",
      horasTrab: Number(r.horas_trabalhadas_min || 0) / 60,
      horasEsper: Number(r.horas_previstas_min || 0) / 60,
      saldoPonto: saldoFinal - ajuste, ajuste, saldoFinal,
      faltas: Number(r.dias_falta || 0),
      incompletas: pendencias.filter(p => p.funcionario_id === r.funcionario_id),
      dias: [], manuais: manuaisFunc,
    };
  }).sort((a,b) => b.saldoFinal - a.saldoFinal), [oficiais, manuais, funcionarios, pendencias]);

  const totalPos = useMemo(
    () => saldos.filter((s) => s.saldoFinal > 0).reduce((a, s) => a + s.saldoFinal, 0),
    [saldos]
  );
  const totalNeg = useMemo(
    () => saldos.filter((s) => s.saldoFinal < 0).reduce((a, s) => a + s.saldoFinal, 0),
    [saldos]
  );

  const salvar = async () => {
    if (!form.funcionario.trim()) {
      alert("Informe o colaborador.");
      return;
    }
    setSalvando(true);
    const { error } = await supabase.from("banco_horas").insert({
      funcionario_id: funcionarios.find(f => f.nome === form.funcionario)?.id || null,
      funcionario: form.funcionario,
      data: form.data || null,
      descricao: form.descricao,
      horas: form.horas || 0,
    });
    setSalvando(false);
    if (error) {
      alert("Erro: " + error.message);
      return;
    }
    setModal(false);
    setForm(FORM_VAZIO);
    carregar(mes);
  };

  const excluir = async (l: Lanc) => {
    if (!confirm("Remover este ajuste manual?")) return;
    const { error } = await supabase.from("banco_horas").delete().eq("id", l.id);
    if (error) {
      alert("Erro: " + error.message);
      return;
    }
    carregar(mes);
  };

  const set = (k: keyof Lanc, v: any) => setForm((f) => ({ ...f, [k]: v }));

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
            <span style={{ filter: "saturate(0) brightness(2)" }}>🕐</span>
          </div>
          <div>
            <h1 style={{ color: "#1f2937", fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: -0.3 }}>
              Banco de Horas
            </h1>
            <p style={{ color: "#6b7280", fontSize: 12, margin: "2px 0 0" }}>
              Calculado do ponto eletrônico — trabalhado vs jornada
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ color: "#64748b", fontSize: 11, fontWeight: 700 }}>
            Jornada individual do cadastro do funcionário
          </span>
          <input
            type="month"
            value={mes}
            onChange={(e) => setMes(e.target.value)}
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
          />
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
              padding: "11px 18px",
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
      </div>

      {erro && <div style={{ ...card, padding: 12, color: "#b91c1c", fontSize: 12 }}>Erro no cálculo oficial: {erro}</div>}

      {pendencias.length > 0 && <div style={{ ...card, padding: 12, color: "#b45309", background: "#fffbeb", fontSize: 12 }}><b>{pendencias.length} dia(s) com batida incompleta.</b> Abra o colaborador para conferir e corrija a marcacao na tela Ponto / Frequencia.</div>}

      {/* STATS */}
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
          <p style={{ fontSize: 36, margin: "0 0 8px" }}>🕐</p>
          <p style={{ color: "#6b7280", fontSize: 13, margin: "0 0 4px" }}>
            Nenhuma batida de ponto neste mês ainda.
          </p>
          <p style={{ color: "#9ca3af", fontSize: 12, margin: 0 }}>
            Assim que os funcionários baterem o ponto, o saldo aparece aqui automaticamente.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {saldos.map((s) => {
            const exp = aberto === s.funcionario;
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
                        {s.horasTrab.toFixed(1)}h trabalhadas de {s.horasEsper.toFixed(1)}h - {s.faltas} falta(s) integral(is){s.incompletas.length ? ` - ${s.incompletas.length} batida(s) incompleta(s)` : ""}
                      </p>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span
                      style={{
                        color: s.saldoFinal >= 0 ? "#16a34a" : "#dc2626",
                        fontSize: 18,
                        fontWeight: 800,
                      }}
                    >
                      {hh(s.saldoFinal)}
                    </span>
                    <span style={{ color: "#9ca3af", fontSize: 14 }}>{exp ? "▲" : "▼"}</span>
                  </div>
                </div>

                {exp && (
                  <div
                    style={{ borderTop: "1px solid #f3f4f6", background: "#fafbfc", padding: "12px 16px" }}
                  >
                    {/* resumo do cálculo */}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                      <Pill
                        label="Do ponto"
                        valor={hh(s.saldoPonto)}
                        cor={s.saldoPonto >= 0 ? "#16a34a" : "#dc2626"}
                      />
                      <Pill
                        label="Ajustes manuais"
                        valor={hh(s.ajuste)}
                        cor={s.ajuste >= 0 ? "#16a34a" : "#dc2626"}
                      />
                      <Pill
                        label="Batidas incompletas"
                        valor={String(s.incompletas.length)}
                        cor={s.incompletas.length ? "#b45309" : "#16a34a"}
                      />
                      <Pill
                        label="Saldo final"
                        valor={hh(s.saldoFinal)}
                        cor={s.saldoFinal >= 0 ? "#16a34a" : "#dc2626"}
                        forte
                      />
                    </div>

                    {/* dias do ponto */}
                    {s.dias.length > 0 && (
                      <>
                        <p
                          style={{
                            color: "#9ca3af",
                            fontSize: 10,
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: 0.5,
                            margin: "0 0 6px",
                          }}
                        >
                          Dias (do ponto)
                        </p>
                        {s.dias.map((d) => (
                          <div
                            key={d.dia}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              padding: "6px 0",
                              borderBottom: "1px solid #f3f4f6",
                            }}
                          >
                            <span style={{ color: "#4b5563", fontSize: 12 }}>
                              📅 {d.dia} · {d.trab.toFixed(1)}h
                            </span>
                            <span
                              style={{
                                color: d.saldo >= 0 ? "#16a34a" : "#dc2626",
                                fontSize: 12,
                                fontWeight: 700,
                              }}
                            >
                              {hh(d.saldo)}
                            </span>
                          </div>
                        ))}
                      </>
                    )}

                    {/* lançamentos manuais */}
                    {s.manuais.length > 0 && (
                      <>
                        <p
                          style={{
                            color: "#9ca3af",
                            fontSize: 10,
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: 0.5,
                            margin: "12px 0 6px",
                          }}
                        >
                          Ajustes manuais
                        </p>
                        {s.manuais.map((l) => (
                          <div
                            key={l.id}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              padding: "6px 0",
                              borderBottom: "1px solid #f3f4f6",
                            }}
                          >
                            <span style={{ color: "#4b5563", fontSize: 12 }}>
                              {l.descricao || "Ajuste"}{" "}
                              {l.data && <span style={{ color: "#9ca3af" }}>· {dataBR(l.data)}</span>}
                            </span>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span
                                style={{
                                  color: l.horas >= 0 ? "#16a34a" : "#dc2626",
                                  fontSize: 12,
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
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL lançamento manual */}
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
              <h3 style={{ color: "#1f2937", fontSize: 16, fontWeight: 700, margin: 0 }}>
                Lançar Horas (ajuste manual)
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
              <Campo label="Colaborador">
                <select value={form.funcionario} onChange={(e) => set("funcionario", e.target.value)} style={inputStyle}>
                  <option value="">Selecione o colaborador</option>
                  {funcionarios.map(f => <option key={f.id} value={f.nome}>{f.nome}</option>)}
                </select>
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
                  placeholder="Ex: Abono / Hora extra sábado"
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

function Pill({ label, valor, cor, forte }: { label: string; valor: string; cor: string; forte?: boolean }) {
  return (
    <div
      style={{
        background: forte ? `${cor}15` : "#fff",
        border: `1px solid ${forte ? cor + "40" : "#e5e7eb"}`,
        borderRadius: 10,
        padding: "6px 12px",
      }}
    >
      <p
        style={{
          color: "#9ca3af",
          fontSize: 9,
          margin: 0,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          fontWeight: 700,
        }}
      >
        {label}
      </p>
      <p style={{ color: cor, fontSize: 15, fontWeight: 800, margin: "1px 0 0" }}>{valor}</p>
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