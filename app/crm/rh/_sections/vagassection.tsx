"use client";
import { useState, useMemo, useEffect } from "react";
import { supabase } from "../../../lib/supabase";
// 🧑‍💼 RH · Vagas (CONECTADO — 'vagas'; abertaEm↔aberta_em; candidatos = contagem em 'candidatos' por vaga)
const COR = "#4f46e5";
const COR_TEXTO = "#4338ca";
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
const REGIMES = ["CLT", "PJ", "Estágio", "Temporário"];
const dataBR = (iso: string) => {
  if (!iso) return "—";
  try {
    return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR");
  } catch {
    return iso;
  }
};
type StatusV = "aberta" | "em_analise" | "fechada";
type Vaga = {
  id: string;
  titulo: string;
  departamento: string;
  regime: string;
  salario: string;
  status: StatusV;
  abertaEm: string;
  candidatos: number;
};
const ST: Record<StatusV, { label: string; cor: string }> = {
  aberta: { label: "Aberta", cor: "#16a34a" },
  em_analise: { label: "Em análise", cor: "#f59e0b" },
  fechada: { label: "Fechada", cor: "#6b7280" },
};
const FORM_VAZIO: Vaga = {
  id: "",
  titulo: "",
  departamento: "",
  regime: REGIMES[0],
  salario: "",
  status: "aberta",
  abertaEm: "",
  candidatos: 0,
};
export function VagasSection() {
  const [lista, setLista] = useState<Vaga[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [filtro, setFiltro] = useState<"todos" | StatusV>("todos");
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState<Vaga>(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const c = () => setIsMobile(window.innerWidth < 768);
    c();
    window.addEventListener("resize", c);
    return () => window.removeEventListener("resize", c);
  }, []);
  const carregar = async () => {
    setCarregando(true);
    const [vagasR, candR] = await Promise.all([
      supabase.from("vagas").select("*").order("created_at", { ascending: false }),
      supabase.from("candidatos").select("vaga"),
    ]);
    if (vagasR.error) {
      console.error(vagasR.error);
      alert("Erro: " + vagasR.error.message);
      setCarregando(false);
      return;
    }
    const cont: Record<string, number> = {};
    (candR.data || []).forEach((c: any) => {
      if (c.vaga) cont[c.vaga] = (cont[c.vaga] || 0) + 1;
    });
    setLista(
      (vagasR.data || []).map((v: any) => ({
        id: v.id,
        titulo: v.titulo,
        departamento: v.departamento || "",
        regime: v.regime || REGIMES[0],
        salario: v.salario || "",
        status: (v.status || "aberta") as StatusV,
        abertaEm: v.aberta_em || "",
        candidatos: cont[v.titulo] || 0,
      }))
    );
    setCarregando(false);
  };
  useEffect(() => {
    carregar();
  }, []);
  const filtrados = useMemo(
    () => (filtro === "todos" ? lista : lista.filter((v) => v.status === filtro)),
    [lista, filtro]
  );
  const stats = useMemo(
    () => ({
      abertas: lista.filter((v) => v.status === "aberta").length,
      candidatos: lista.reduce((s, v) => s + v.candidatos, 0),
      total: lista.length,
    }),
    [lista]
  );
  const salvar = async () => {
    if (!form.titulo.trim()) {
      alert("Informe o título da vaga.");
      return;
    }
    setSalvando(true);
    const payload = {
      titulo: form.titulo,
      departamento: form.departamento,
      regime: form.regime,
      salario: form.salario,
      status: form.status,
      aberta_em: form.abertaEm || null,
    };
    const { error } = form.id
      ? await supabase.from("vagas").update(payload).eq("id", form.id)
      : await supabase.from("vagas").insert(payload);
    setSalvando(false);
    if (error) {
      alert("Erro: " + error.message);
      return;
    }
    setModal(false);
    setForm(FORM_VAZIO);
    carregar();
  };
  const abrirEditar = (v: Vaga) => {
    setForm(v);
    setModal(true);
  };
  const excluir = async (v: Vaga) => {
    if (!confirm(`Remover a vaga "${v.titulo}"?`)) return;
    const { error } = await supabase.from("vagas").delete().eq("id", v.id);
    if (error) {
      alert("Erro: " + error.message);
      return;
    }
    carregar();
  };
  const set = (k: keyof Vaga, val: any) => setForm((f) => ({ ...f, [k]: val }));
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
            <span style={{ filter: "saturate(0) brightness(2)" }}>📢</span>
          </div>
          <div>
            <h1 style={{ color: "#1f2937", fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: -0.3 }}>
              Vagas
            </h1>
            <p style={{ color: "#6b7280", fontSize: 12, margin: "2px 0 0" }}>
              Posições abertas e recrutamento
            </p>
          </div>
        </div>
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
            padding: "11px 20px",
            fontSize: 13,
            cursor: "pointer",
            fontWeight: 700,
            boxShadow: `0 4px 12px ${COR}40`,
            whiteSpace: "nowrap",
          }}
        >
          + Nova Vaga
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 14 }}>
        {[
          { label: "Vagas abertas", value: String(stats.abertas), cor: "#16a34a", icon: "📢" },
          { label: "Candidatos", value: String(stats.candidatos), cor: "#6366f1", icon: "👥" },
          { label: "Total de vagas", value: String(stats.total), cor: "#0ea5e9", icon: "📋" },
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
            <p style={{ color: s.cor, fontSize: 22, fontWeight: 800, margin: 0, letterSpacing: -0.5 }}>
              {s.value}
            </p>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {(
          [["todos", "Todas"], ...Object.entries(ST).map(([k, v]) => [k, v.label])] as [string, string][]
        ).map(([k, lbl]) => {
          const a = filtro === k;
          const cor = k === "todos" ? COR : ST[k as StatusV].cor;
          return (
            <button
              key={k}
              onClick={() => setFiltro(k as any)}
              style={{
                background: a ? `${cor}15` : "#f9fafb",
                color: a ? cor : "#6b7280",
                border: `1px solid ${a ? cor + "50" : "#e5e7eb"}`,
                borderRadius: 10,
                padding: "7px 14px",
                fontSize: 12,
                cursor: "pointer",
                fontWeight: a ? 700 : 600,
              }}
            >
              {lbl}
            </button>
          );
        })}
      </div>
      {carregando ? (
        <div style={{ ...card, padding: 40, textAlign: "center" }}>
          <p style={{ color: "#6b7280", fontSize: 13 }}>Carregando...</p>
        </div>
      ) : filtrados.length === 0 ? (
        <div style={{ ...card, padding: 40, textAlign: "center" }}>
          <p style={{ fontSize: 36, margin: "0 0 8px" }}>{lista.length === 0 ? "📭" : "🔍"}</p>
          <p style={{ color: "#6b7280", fontSize: 13 }}>
            {lista.length === 0 ? "Nenhuma vaga cadastrada." : "Nada com esse filtro"}
          </p>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(300px, 1fr))",
            gap: 14,
          }}
        >
          {filtrados.map((v) => {
            const st = ST[v.status];
            return (
              <div
                key={v.id}
                style={{
                  ...card,
                  padding: 18,
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                  borderLeft: `4px solid ${st.cor}`,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 10,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <p style={{ color: "#1f2937", fontSize: 15, fontWeight: 800, margin: 0 }}>{v.titulo}</p>
                    <p style={{ color: "#6b7280", fontSize: 12, margin: "2px 0 0" }}>
                      {v.departamento} · {v.regime}
                    </p>
                  </div>
                  <span
                    style={{
                      background: `${st.cor}15`,
                      color: st.cor,
                      border: `1px solid ${st.cor}40`,
                      fontSize: 10,
                      padding: "3px 8px",
                      borderRadius: 8,
                      fontWeight: 700,
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                    }}
                  >
                    {st.label}
                  </span>
                </div>
                <p style={{ color: COR_TEXTO, fontSize: 13, fontWeight: 700, margin: 0 }}>
                  {v.salario || "A combinar"}
                </p>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    borderTop: "1px solid #f3f4f6",
                    paddingTop: 12,
                  }}
                >
                  <span style={{ color: "#6b7280", fontSize: 12 }}>👥 {v.candidatos} candidato(s)</span>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ color: "#9ca3af", fontSize: 11 }}>{dataBR(v.abertaEm)}</span>
                    <button
                      onClick={() => abrirEditar(v)}
                      style={{
                        background: "#eef2ff",
                        color: "#4338ca",
                        border: "1px solid #c7d2fe",
                        borderRadius: 8,
                        padding: "3px 8px",
                        fontSize: 11,
                        cursor: "pointer",
                        fontWeight: 600,
                      }}
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => excluir(v)}
                      style={{
                        background: "#fef2f2",
                        color: "#dc2626",
                        border: "1px solid #fecaca",
                        borderRadius: 8,
                        padding: "3px 8px",
                        fontSize: 11,
                        cursor: "pointer",
                        fontWeight: 600,
                      }}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
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
                {form.id ? "Editar Vaga" : "Nova Vaga"}
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
              <Campo label="Título da vaga">
                <input
                  value={form.titulo}
                  onChange={(e) => set("titulo", e.target.value)}
                  style={inputStyle}
                  placeholder="Ex: Analista Comercial"
                />
              </Campo>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Campo label="Departamento">
                  <input
                    value={form.departamento}
                    onChange={(e) => set("departamento", e.target.value)}
                    style={inputStyle}
                  />
                </Campo>
                <Campo label="Regime">
                  <select
                    value={form.regime}
                    onChange={(e) => set("regime", e.target.value)}
                    style={inputStyle}
                  >
                    {REGIMES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </Campo>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Campo label="Faixa salarial">
                  <input
                    value={form.salario}
                    onChange={(e) => set("salario", e.target.value)}
                    style={inputStyle}
                    placeholder="Ex: R$ 3.000 - 4.000"
                  />
                </Campo>
                <Campo label="Aberta em">
                  <input
                    type="date"
                    value={form.abertaEm}
                    onChange={(e) => set("abertaEm", e.target.value)}
                    style={inputStyle}
                  />
                </Campo>
              </div>
              <Campo label="Status">
                <select
                  value={form.status}
                  onChange={(e) => set("status", e.target.value as StatusV)}
                  style={inputStyle}
                >
                  {Object.entries(ST).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                    </option>
                  ))}
                </select>
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
                {salvando ? "Salvando..." : "+ Criar"}
              </button>
            </div>
          </div>
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