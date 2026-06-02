"use client";
import { useState, useMemo, useEffect } from "react";
import { supabase } from "../../../lib/supabase";

// ═══════════════════════════════════════════════════════════════════════
// 🧑‍💼 RH · Processo Seletivo (CONECTADO — 'candidatos'). Kanban + triagem.
// ───────────────────────────────────────────────────────────────────────
// Move o candidato pelas fases com ‹ ›. Pode REPROVAR em qualquer fase
// (✕) — vai pra "Reprovados" guardando a fase. Erros aparecem em toast
// amigável (nunca alert cru): mensagem limpa pro usuário, detalhe técnico
// só no console (F12) pra quem administra.
// ═══════════════════════════════════════════════════════════════════════

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
type Candidato = { id: string; nome: string; vaga: string; etapa: string; reprovado: boolean };

// converte erro técnico do banco numa frase amigável (sem expor código pro cliente)
function msgAmigavel(error: any, padrao: string): string {
  const code = error?.code;
  const txt = (error?.message || "").toLowerCase();
  if (code === "42703" || txt.includes("does not exist")) {
    return "Esse recurso precisa de uma atualização no sistema que ainda não foi aplicada.";
  }
  if (code === "23505") return "Esse registro já existe.";
  if (code === "PGRST301" || txt.includes("permission") || txt.includes("rls")) {
    return "Você não tem permissão para fazer isso.";
  }
  if (txt.includes("network") || txt.includes("fetch")) {
    return "Falha de conexão. Verifique a internet e tente de novo.";
  }
  return padrao;
}

type Aviso = { tipo: "erro" | "ok"; titulo: string } | null;

export function SelecaoSection() {
  const [lista, setLista] = useState<Candidato[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [aviso, setAviso] = useState<Aviso>(null);

  // toast some sozinho
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 4500);
    return () => clearTimeout(t);
  }, [aviso]);

  const erro = (titulo: string, e?: any) => {
    if (e) console.error("[ProcessoSeletivo]", e);
    setAviso({ tipo: "erro", titulo });
  };
  const ok = (titulo: string) => setAviso({ tipo: "ok", titulo });

  const carregar = async () => {
    setCarregando(true);
    // tenta com a coluna 'reprovado'; se ela ainda não existe no banco, faz fallback
    let { data, error } = await supabase
      .from("candidatos")
      .select("id, nome, vaga, etapa, reprovado")
      .order("created_at", { ascending: false });
    if (error && (error.code === "42703" || (error.message || "").toLowerCase().includes("reprovado"))) {
      const r = await supabase
        .from("candidatos")
        .select("id, nome, vaga, etapa")
        .order("created_at", { ascending: false });
      data = r.data as any;
      error = r.error;
    }
    if (error) {
      erro("Não consegui carregar os candidatos.", error);
      setCarregando(false);
      return;
    }
    setLista(
      (data || []).map((c: any) => ({
        id: c.id,
        nome: c.nome,
        vaga: c.vaga || "",
        etapa: c.etapa || COLUNAS[0],
        reprovado: !!c.reprovado,
      }))
    );
    setCarregando(false);
  };
  useEffect(() => {
    carregar();
  }, []);

  const ativos = useMemo(() => lista.filter((c) => !c.reprovado), [lista]);
  const reprovados = useMemo(() => lista.filter((c) => c.reprovado), [lista]);

  const porColuna = useMemo(() => {
    const m: Record<string, Candidato[]> = {};
    COLUNAS.forEach((c) => (m[c] = []));
    ativos.forEach((c) => {
      if (m[c.etapa]) m[c.etapa].push(c);
    });
    return m;
  }, [ativos]);

  const mover = async (c: Candidato, dir: 1 | -1) => {
    const idx = COLUNAS.indexOf(c.etapa);
    const novo = COLUNAS[idx + dir];
    if (!novo) return;
    setLista((l) => l.map((x) => (x.id === c.id ? { ...x, etapa: novo } : x)));
    const { error } = await supabase.from("candidatos").update({ etapa: novo }).eq("id", c.id);
    if (error) {
      erro(msgAmigavel(error, "Não consegui mover o candidato."), error);
      carregar();
    }
  };

  const reprovar = async (c: Candidato) => {
    if (!confirm(`Reprovar ${c.nome} na fase "${c.etapa}"?`)) return;
    setLista((l) => l.map((x) => (x.id === c.id ? { ...x, reprovado: true } : x)));
    const { error } = await supabase.from("candidatos").update({ reprovado: true }).eq("id", c.id);
    if (error) {
      erro(msgAmigavel(error, "Não consegui reprovar o candidato."), error);
      carregar();
    } else {
      ok(`${c.nome} movido para Reprovados.`);
    }
  };

  const reativar = async (c: Candidato) => {
    setLista((l) => l.map((x) => (x.id === c.id ? { ...x, reprovado: false } : x)));
    const { error } = await supabase.from("candidatos").update({ reprovado: false }).eq("id", c.id);
    if (error) {
      erro(msgAmigavel(error, "Não consegui reativar o candidato."), error);
      carregar();
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <style>{`
        @keyframes aviso-in { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

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
            Mova com ‹ › entre as fases · ✕ reprova na fase atual
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
        <>
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
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "flex-start",
                              gap: 6,
                            }}
                          >
                            <div style={{ minWidth: 0 }}>
                              <p style={{ color: "#1f2937", fontSize: 13, fontWeight: 700, margin: 0 }}>
                                {c.nome}
                              </p>
                              <p style={{ color: "#9ca3af", fontSize: 11, margin: "2px 0 8px" }}>
                                {c.vaga || "—"}
                              </p>
                            </div>
                            <button
                              onClick={() => reprovar(c)}
                              title="Reprovar nesta fase"
                              style={{
                                background: "#fef2f2",
                                color: "#dc2626",
                                border: "1px solid #fecaca",
                                borderRadius: 7,
                                padding: "2px 8px",
                                fontSize: 12,
                                cursor: "pointer",
                                fontWeight: 700,
                                flexShrink: 0,
                              }}
                            >
                              ✕
                            </button>
                          </div>
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
                        style={{
                          color: "#cbd5e1",
                          fontSize: 11,
                          textAlign: "center",
                          padding: 12,
                          margin: 0,
                        }}
                      >
                        Vazio
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* REPROVADOS */}
          {reprovados.length > 0 && (
            <div style={{ ...card, padding: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 16 }}>🚫</span>
                <h3 style={{ color: "#1f2937", fontSize: 14, fontWeight: 800, margin: 0 }}>Reprovados</h3>
                <span
                  style={{
                    background: "#fef2f2",
                    color: "#dc2626",
                    fontSize: 11,
                    padding: "2px 8px",
                    borderRadius: 8,
                    fontWeight: 700,
                  }}
                >
                  {reprovados.length}
                </span>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
                  gap: 10,
                }}
              >
                {reprovados.map((c) => (
                  <div
                    key={c.id}
                    style={{
                      border: "1px solid #fecaca",
                      background: "#fff7f7",
                      borderRadius: 10,
                      padding: 12,
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <p style={{ color: "#1f2937", fontSize: 13, fontWeight: 700, margin: 0 }}>{c.nome}</p>
                      <p style={{ color: "#9ca3af", fontSize: 11, margin: "2px 0 0" }}>{c.vaga || "—"}</p>
                      <p style={{ color: "#dc2626", fontSize: 11, margin: "4px 0 0", fontWeight: 700 }}>
                        Parou em: {c.etapa}
                      </p>
                    </div>
                    <button
                      onClick={() => reativar(c)}
                      title="Voltar ao funil"
                      style={{
                        background: "#eef2ff",
                        color: "#4338ca",
                        border: "1px solid #c7d2fe",
                        borderRadius: 8,
                        padding: "5px 10px",
                        fontSize: 11,
                        cursor: "pointer",
                        fontWeight: 700,
                        whiteSpace: "nowrap",
                        flexShrink: 0,
                      }}
                    >
                      ↺ Reativar
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* TOAST de aviso — bonito, sem código cru. Some sozinho. */}
      {aviso && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            zIndex: 3000,
            maxWidth: 360,
            background: "#ffffff",
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