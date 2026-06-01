"use client";
import { useState, useMemo, useEffect } from "react";
import { supabase } from "../../../lib/supabase";
// 🧑‍💼 RH · Seleção (CONECTADO — lê 'candidatos'; mover = update etapa). Kanban.
const COR = "#4f46e5";
const card = {
  background: "#ffffff",
  borderRadius: 14,
  border: "1px solid #e5e7eb",
  boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
};
const COLUNAS = ["Triagem", "Entrevista", "Teste", "Proposta", "Contratado"];
const COL_COR: Record<string, string> = {
  Triagem: "#0ea5e9",
  Entrevista: "#6366f1",
  Teste: "#8b5cf6",
  Proposta: "#f59e0b",
  Contratado: "#16a34a",
};
type Candidato = { id: string; nome: string; vaga: string; etapa: string };
export function SelecaoSection() {
  const [lista, setLista] = useState<Candidato[]>([]);
  const [carregando, setCarregando] = useState(true);
  const carregar = async () => {
    setCarregando(true);
    const { data, error } = await supabase
      .from("candidatos")
      .select("id, nome, vaga, etapa")
      .order("created_at", { ascending: false });
    if (error) {
      console.error(error);
      alert("Erro: " + error.message);
    } else setLista((data || []) as Candidato[]);
    setCarregando(false);
  };
  useEffect(() => {
    carregar();
  }, []);
  const porColuna = useMemo(() => {
    const m: Record<string, Candidato[]> = {};
    COLUNAS.forEach((c) => (m[c] = []));
    lista.forEach((c) => {
      if (m[c.etapa]) m[c.etapa].push(c);
    });
    return m;
  }, [lista]);
  const mover = async (c: Candidato, dir: 1 | -1) => {
    const idx = COLUNAS.indexOf(c.etapa);
    const novo = COLUNAS[idx + dir];
    if (!novo) return;
    setLista((l) => l.map((x) => (x.id === c.id ? { ...x, etapa: novo } : x)));
    const { error } = await supabase.from("candidatos").update({ etapa: novo }).eq("id", c.id);
    if (error) {
      alert("Erro: " + error.message);
      carregar();
    }
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
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
          <span style={{ filter: "saturate(0) brightness(2)" }}>🎯</span>
        </div>
        <div>
          <h1 style={{ color: "#1f2937", fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: -0.3 }}>
            Processo Seletivo
          </h1>
          <p style={{ color: "#6b7280", fontSize: 12, margin: "2px 0 0" }}>
            Pipeline dos candidatos por etapa — use ‹ › para mover
          </p>
        </div>
      </div>
      {carregando ? (
        <div style={{ ...card, padding: 40, textAlign: "center" }}>
          <p style={{ color: "#6b7280", fontSize: 13 }}>Carregando pipeline...</p>
        </div>
      ) : lista.length === 0 ? (
        <div style={{ ...card, padding: 40, textAlign: "center" }}>
          <p style={{ fontSize: 36, margin: "0 0 8px" }}>📭</p>
          <p style={{ color: "#6b7280", fontSize: 13 }}>
            Nenhum candidato no pipeline. Cadastre em “Candidatos”.
          </p>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${COLUNAS.length}, minmax(200px, 1fr))`,
            gap: 12,
            overflowX: "auto",
          }}
        >
          {COLUNAS.map((col) => {
            const cor = COL_COR[col];
            const itens = porColuna[col];
            return (
              <div
                key={col}
                style={{
                  background: "#f9fafb",
                  borderRadius: 12,
                  border: "1px solid #e5e7eb",
                  display: "flex",
                  flexDirection: "column",
                  minHeight: 200,
                }}
              >
                <div
                  style={{
                    padding: "12px 14px",
                    borderBottom: `2px solid ${cor}`,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span style={{ color: "#1f2937", fontSize: 13, fontWeight: 800 }}>{col}</span>
                  <span
                    style={{
                      background: `${cor}15`,
                      color: cor,
                      fontSize: 11,
                      padding: "2px 8px",
                      borderRadius: 8,
                      fontWeight: 700,
                    }}
                  >
                    {itens.length}
                  </span>
                </div>
                <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                  {itens.map((c) => {
                    const idx = COLUNAS.indexOf(c.etapa);
                    return (
                      <div key={c.id} style={{ ...card, padding: 12 }}>
                        <p style={{ color: "#1f2937", fontSize: 13, fontWeight: 700, margin: 0 }}>{c.nome}</p>
                        <p style={{ color: "#9ca3af", fontSize: 11, margin: "2px 0 8px" }}>{c.vaga}</p>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <button
                            onClick={() => mover(c, -1)}
                            disabled={idx === 0}
                            style={{
                              background: idx === 0 ? "#f3f4f6" : "#eef2ff",
                              color: idx === 0 ? "#cbd5e1" : "#4338ca",
                              border: "none",
                              borderRadius: 7,
                              padding: "3px 10px",
                              fontSize: 13,
                              cursor: idx === 0 ? "default" : "pointer",
                              fontWeight: 700,
                            }}
                          >
                            ‹
                          </button>
                          <button
                            onClick={() => mover(c, 1)}
                            disabled={idx === COLUNAS.length - 1}
                            style={{
                              background: idx === COLUNAS.length - 1 ? "#f3f4f6" : "#eef2ff",
                              color: idx === COLUNAS.length - 1 ? "#cbd5e1" : "#4338ca",
                              border: "none",
                              borderRadius: 7,
                              padding: "3px 10px",
                              fontSize: 13,
                              cursor: idx === COLUNAS.length - 1 ? "default" : "pointer",
                              fontWeight: 700,
                            }}
                          >
                            ›
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {itens.length === 0 && (
                    <p
                      style={{ color: "#cbd5e1", fontSize: 11, textAlign: "center", padding: 12, margin: 0 }}
                    >
                      Vazio
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}