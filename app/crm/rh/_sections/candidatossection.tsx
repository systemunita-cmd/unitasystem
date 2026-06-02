"use client";
import { useState, useMemo, useEffect } from "react";
import { supabase } from "../../../lib/supabase";
// 🧑‍💼 RH · Candidatos (CONECTADO — 'candidatos'; etapa atualizável)
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
const ETAPAS = ["Triagem", "Entrevista", "Teste", "Proposta", "Contratado", "Reprovado"];
const ET_COR: Record<string, string> = {
  Triagem: "#0ea5e9",
  Entrevista: "#6366f1",
  Teste: "#8b5cf6",
  Proposta: "#f59e0b",
  Contratado: "#16a34a",
  Reprovado: "#dc2626",
};
type Candidato = {
  id: string;
  nome: string;
  vaga: string;
  etapa: string;
  origem: string;
  email: string;
  telefone: string;
};
const FORM_VAZIO: Candidato = {
  id: "",
  nome: "",
  vaga: "",
  etapa: ETAPAS[0],
  origem: "",
  email: "",
  telefone: "",
};
export function CandidatosSection() {
  const [lista, setLista] = useState<Candidato[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtroEtapa, setFiltroEtapa] = useState("todos");
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState<Candidato>(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [vagas, setVagas] = useState<{ titulo: string; status: string }[]>([]);
  const carregar = async () => {
    setCarregando(true);
    const { data, error } = await supabase
      .from("candidatos")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      console.error(error);
      alert("Erro: " + error.message);
    } else
      setLista(
        (data || []).map((r: any) => ({
          id: r.id,
          nome: r.nome,
          vaga: r.vaga || "",
          etapa: r.etapa || ETAPAS[0],
          origem: r.origem || "",
          email: r.email || "",
          telefone: r.telefone || "",
        }))
      );
    setCarregando(false);
  };
  useEffect(() => {
    carregar();
  }, []);

  // carrega as vagas cadastradas pro select (abertas primeiro)
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("vagas")
        .select("titulo, status")
        .order("created_at", { ascending: false });
      if (data) setVagas(data as { titulo: string; status: string }[]);
    })();
  }, []);
  const filtrados = useMemo(() => {
    let l = lista;
    if (busca) {
      const b = busca.toLowerCase();
      l = l.filter((c) => c.nome.toLowerCase().includes(b) || c.vaga.toLowerCase().includes(b));
    }
    if (filtroEtapa !== "todos") l = l.filter((c) => c.etapa === filtroEtapa);
    return l;
  }, [lista, busca, filtroEtapa]);
  const salvar = async () => {
    if (!form.nome.trim()) {
      alert("Informe o candidato.");
      return;
    }
    setSalvando(true);
    const payload = {
      nome: form.nome,
      vaga: form.vaga,
      etapa: form.etapa,
      origem: form.origem,
      email: form.email,
      telefone: form.telefone,
    };
    const { error } = await supabase.from("candidatos").insert(payload);
    setSalvando(false);
    if (error) {
      alert("Erro: " + error.message);
      return;
    }
    setModal(false);
    setForm(FORM_VAZIO);
    carregar();
  };
  const mudarEtapa = async (c: Candidato, etapa: string) => {
    const { error } = await supabase.from("candidatos").update({ etapa }).eq("id", c.id);
    if (error) {
      alert("Erro: " + error.message);
      return;
    }
    setLista((l) => l.map((x) => (x.id === c.id ? { ...x, etapa } : x)));
  };
  const excluir = async (c: Candidato) => {
    if (!confirm(`Remover ${c.nome}?`)) return;
    const { error } = await supabase.from("candidatos").delete().eq("id", c.id);
    if (error) {
      alert("Erro: " + error.message);
      return;
    }
    carregar();
  };
  const set = (k: keyof Candidato, v: any) => setForm((f) => ({ ...f, [k]: v }));
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
            <span style={{ filter: "saturate(0) brightness(2)" }}>🧑‍💻</span>
          </div>
          <div>
            <h1 style={{ color: "#1f2937", fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: -0.3 }}>
              Candidatos
            </h1>
            <p style={{ color: "#6b7280", fontSize: 12, margin: "2px 0 0" }}>
              <b style={{ color: COR_TEXTO }}>{lista.length}</b> candidato(s) no banco
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
          + Novo Candidato
        </button>
      </div>
      <div style={{ ...card, padding: 14, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <input
          placeholder="🔍 Buscar por nome ou vaga..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          style={{ ...inputStyle, flex: "1 1 280px", maxWidth: 460, borderRadius: 20 }}
        />
        <select
          value={filtroEtapa}
          onChange={(e) => setFiltroEtapa(e.target.value)}
          style={{ ...inputStyle, maxWidth: 200 }}
        >
          <option value="todos">Etapa: Todas</option>
          {ETAPAS.map((et) => (
            <option key={et} value={et}>
              {et}
            </option>
          ))}
        </select>
      </div>
      {carregando ? (
        <div style={{ ...card, padding: 40, textAlign: "center" }}>
          <p style={{ color: "#6b7280", fontSize: 13 }}>Carregando...</p>
        </div>
      ) : filtrados.length === 0 ? (
        <div style={{ ...card, padding: 40, textAlign: "center" }}>
          <p style={{ fontSize: 36, margin: "0 0 8px" }}>{lista.length === 0 ? "📭" : "🔍"}</p>
          <p style={{ color: "#6b7280", fontSize: 13 }}>
            {lista.length === 0 ? "Nenhum candidato cadastrado." : "Nada encontrado"}
          </p>
        </div>
      ) : (
        <div style={{ ...card, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f9fafb" }}>
                  {["Candidato", "Vaga", "Origem", "Etapa", ""].map((h) => (
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
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtrados.map((c, i) => (
                  <tr
                    key={c.id}
                    style={{
                      borderTop: "1px solid #f3f4f6",
                      background: i % 2 === 0 ? "#ffffff" : "#fafbfc",
                    }}
                  >
                    <td style={{ padding: "12px 16px" }}>
                      <p style={{ color: "#1f2937", fontSize: 13, fontWeight: 700, margin: 0 }}>{c.nome}</p>
                      <p style={{ color: "#9ca3af", fontSize: 11, margin: "2px 0 0" }}>{c.email}</p>
                    </td>
                    <td style={{ padding: "12px 16px", color: "#4b5563", fontSize: 12 }}>{c.vaga}</td>
                    <td style={{ padding: "12px 16px", color: "#6b7280", fontSize: 12 }}>{c.origem}</td>
                    <td style={{ padding: "12px 16px" }}>
                      <select
                        value={c.etapa}
                        onChange={(e) => mudarEtapa(c, e.target.value)}
                        style={{
                          background: `${ET_COR[c.etapa] || COR}15`,
                          color: ET_COR[c.etapa] || COR,
                          border: `1px solid ${ET_COR[c.etapa] || COR}40`,
                          fontSize: 11,
                          padding: "4px 8px",
                          borderRadius: 8,
                          fontWeight: 700,
                          cursor: "pointer",
                          outline: "none",
                        }}
                      >
                        {ETAPAS.map((et) => (
                          <option key={et} value={et}>
                            {et}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <button
                        onClick={() => excluir(c)}
                        style={{
                          background: "#fef2f2",
                          color: "#dc2626",
                          border: "1px solid #fecaca",
                          borderRadius: 8,
                          padding: "5px 11px",
                          fontSize: 11,
                          cursor: "pointer",
                          fontWeight: 600,
                        }}
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
              <h3 style={{ color: "#1f2937", fontSize: 16, fontWeight: 700, margin: 0 }}>Novo Candidato</h3>
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
              <Campo label="Nome">
                <input value={form.nome} onChange={(e) => set("nome", e.target.value)} style={inputStyle} />
              </Campo>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Campo label="Vaga">
                  <select value={form.vaga} onChange={(e) => set("vaga", e.target.value)} style={inputStyle}>
                    <option value="">— Selecione a vaga —</option>
                    {vagas.map((v) => (
                      <option key={v.titulo} value={v.titulo}>
                        {v.titulo}
                        {v.status && v.status !== "aberta" ? ` (${v.status})` : ""}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo label="Origem">
                  <input
                    value={form.origem}
                    onChange={(e) => set("origem", e.target.value)}
                    style={inputStyle}
                    placeholder="LinkedIn, indicação..."
                  />
                </Campo>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Campo label="E-mail">
                  <input
                    value={form.email}
                    onChange={(e) => set("email", e.target.value)}
                    style={inputStyle}
                  />
                </Campo>
                <Campo label="Telefone">
                  <input
                    value={form.telefone}
                    onChange={(e) => set("telefone", e.target.value)}
                    style={inputStyle}
                  />
                </Campo>
              </div>
              <Campo label="Etapa">
                <select value={form.etapa} onChange={(e) => set("etapa", e.target.value)} style={inputStyle}>
                  {ETAPAS.map((et) => (
                    <option key={et} value={et}>
                      {et}
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