"use client";
import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { usePermissao } from "../../hooks/usePermissao";
import { useTemPermissao } from "../../hooks/useTemPermissao";

// ═══════════════════════════════════════════════════════════════════════
// 🏷️ ETIQUETAS — UnitaSystem (single-tenant)
// ───────────────────────────────────────────────────────────────────────
// CRUD de etiquetas (com cor + ícone) usadas pra categorizar atendimentos.
// Cada etiqueta pode ser geral (vale pra todas as equipes) ou específica
// de uma equipe.
//
// Tabela esperada `etiquetas`: id(int4), nome, cor, icone, equipe_id(int4 FK opcional), created_at
// ═══════════════════════════════════════════════════════════════════════

type Etiqueta = {
  id: number;
  nome: string;
  cor: string;
  icone: string;
  equipe_id?: number | null;
  created_at?: string;
};
type Equipe = { id: number; nome: string };

// Paleta de cores pré-definidas
const CORES_PADRAO = [
  "#dc2626", "#ef4444", "#f97316", "#f59e0b",
  "#eab308", "#84cc16", "#16a34a", "#10b981",
  "#06b6d4", "#2563eb", "#6366f1", "#8b5cf6",
  "#a855f7", "#ec4899", "#f43f5e", "#6b7280",
];

const EMOJIS_COMUNS = [
  "🏷️", "🔥", "⭐", "💰", "🎯", "📞", "✅", "❌",
  "⚠️", "🆕", "🔔", "💎", "🚀", "📌", "🔴", "🟢",
  "🟡", "🔵", "🟣", "⚡", "💼", "🎁", "🏆", "❤️",
];

export function EtiquetasSection() {
  const { isDono, permissoes } = usePermissao();
  // 🛡️ Sistema novo
  const perm = useTemPermissao();
  const escopoEtiq = perm.escopo("etiquetas.acessar");
  const novoPodeCrud = perm.tem("etiquetas.crud");
  const podeAcessar = perm.superAdmin || isDono || !!permissoes.etiquetas || escopoEtiq !== "none";
  const podeMexer = perm.superAdmin || isDono || !!permissoes.etiquetas || novoPodeCrud;
  const [etiquetas, setEtiquetas] = useState<Etiqueta[]>([]);
  const [equipes, setEquipes] = useState<Equipe[]>([]);
  const [filtroEquipe, setFiltroEquipe] = useState<string>("todas");
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editando, setEditando] = useState<Etiqueta | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [busca, setBusca] = useState("");

  const [form, setForm] = useState({ nome: "", cor: "#2563eb", icone: "🏷️", equipeId: "" });

  const IS = { width: "100%", background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 14px", color: "#1f2937", fontSize: 14, boxSizing: "border-box" as const, outline: "none", transition: "border-color 0.15s, box-shadow 0.15s" };

  const cardStyle = {
    background: "#ffffff",
    borderRadius: 14,
    border: "1px solid #e5e7eb",
    boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
  };

  const fetchEtiquetas = async () => {
    setLoading(true);
    const { data } = await supabase.from("etiquetas").select("*").order("created_at", { ascending: true });
    setEtiquetas(data || []);
    setLoading(false);
  };

  const fetchEquipes = async () => {
    try {
      const { data } = await supabase.from("equipes").select("id, nome").eq("ativo", true).order("nome", { ascending: true });
      setEquipes((data as Equipe[]) || []);
    } catch (e) { console.error("Erro ao buscar equipes:", e); setEquipes([]); }
  };

  useEffect(() => {
    fetchEtiquetas();
    fetchEquipes();
    const ch = supabase.channel("etiquetas_rt_unita")
      .on("postgres_changes", { event: "*", schema: "public", table: "etiquetas" }, () => fetchEtiquetas())
      .on("postgres_changes", { event: "*", schema: "public", table: "equipes" }, () => fetchEquipes())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const abrirNovo = () => {
    setEditando(null);
    setForm({ nome: "", cor: "#2563eb", icone: "🏷️", equipeId: filtroEquipe !== "todas" ? filtroEquipe : "" });
    setShowForm(true);
  };

  const abrirEditar = (e: Etiqueta) => {
    setEditando(e);
    setForm({ nome: e.nome, cor: e.cor, icone: e.icone || "🏷️", equipeId: e.equipe_id ? String(e.equipe_id) : "" });
    setShowForm(true);
  };

  const cancelar = () => {
    setShowForm(false);
    setEditando(null);
    setForm({ nome: "", cor: "#2563eb", icone: "🏷️", equipeId: "" });
  };

  const salvar = async () => {
    if (!isDono && !permissoes.etiquetas && !novoPodeCrud && !perm.superAdmin) {
      alert("❌ Você não tem permissão para gerenciar etiquetas.");
      return;
    }
    if (!form.nome.trim()) { alert("Digite o nome da etiqueta!"); return; }
    setSalvando(true);
    try {
      const equipeIdNum = form.equipeId ? parseInt(form.equipeId) : null;
      if (editando) {
        const { error } = await supabase.from("etiquetas")
          .update({ nome: form.nome.trim(), cor: form.cor, icone: form.icone, equipe_id: equipeIdNum })
          .eq("id", editando.id);
        if (error) { alert("Erro ao atualizar: " + error.message); setSalvando(false); return; }
      } else {
        const { error } = await supabase.from("etiquetas").insert([{
          nome: form.nome.trim(),
          cor: form.cor,
          icone: form.icone,
          equipe_id: equipeIdNum,
        }]);
        if (error) { alert("Erro ao criar: " + error.message); setSalvando(false); return; }
      }
      await fetchEtiquetas();
      cancelar();
    } catch (e: any) { alert("Erro: " + e.message); }
    setSalvando(false);
  };

  const excluir = async (e: Etiqueta) => {
    if (!isDono && !permissoes.etiquetas && !novoPodeCrud && !perm.superAdmin) {
      alert("❌ Você não tem permissão para excluir etiquetas.");
      return;
    }
    if (!confirm(`Excluir a etiqueta "${e.nome}"?\n\nEla será removida de todos os atendimentos que a usavam.`)) return;
    try {
      await supabase.from("atendimento_etiquetas").delete().eq("etiqueta_id", e.id);
      const { error } = await supabase.from("etiquetas").delete().eq("id", e.id);
      if (error) { alert("Erro ao excluir: " + error.message); return; }
      await fetchEtiquetas();
    } catch (err: any) { alert("Erro: " + err.message); }
  };

  const equipeNomeDe = (equipeId?: number | null): string => {
    if (!equipeId) return "";
    return equipes.find(e => e.id === equipeId)?.nome || "";
  };

  const etiquetasFiltradas = etiquetas.filter(e =>
    (!busca || e.nome.toLowerCase().includes(busca.toLowerCase())) &&
    (filtroEquipe === "todas" || String(e.equipe_id || "") === filtroEquipe)
  );


  // 🛡️ Guard visual
  if (perm.carregando) {
    return <div style={{ padding: 24, color: "#6b7280", fontSize: 13 }}>⏳ Verificando permissões...</div>;
  }
  if (!podeAcessar) {
    return (
      <div style={{ padding: 32, textAlign: "center" }}>
        <div style={{ fontSize: 36, marginBottom: 8 }}>🔒</div>
        <p style={{ color: "#1f2937", fontWeight: 700, margin: "0 0 4px" }}>Sem acesso a Etiquetas</p>
        <p style={{ color: "#9ca3af", fontSize: 12 }}>Grupo: <b>{perm.grupoNome || "(sem grupo)"}</b></p>
      </div>
    );
  }
  return (
    <div style={{ padding: 32, display: "flex", flexDirection: "column", gap: 24, background: "#f8fafc", minHeight: "100vh" }}>

      {/* HEADER */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14,
            background: "linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 24, boxShadow: "0 8px 20px rgba(37,99,235,0.25)",
          }}>
            <span style={{ filter: "saturate(0) brightness(2)" }}>🏷️</span>
          </div>
          <div>
            <h1 style={{ color: "#1f2937", fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: -0.3 }}>Etiquetas</h1>
            <p style={{ color: "#6b7280", fontSize: 12, margin: "2px 0 0" }}>{etiquetas.length} etiqueta(s) cadastrada(s)</p>
          </div>
        </div>
        <button onClick={abrirNovo}
          style={{
            background: "linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)",
            color: "white", border: "none", borderRadius: 12,
            padding: "12px 22px", fontSize: 13, cursor: "pointer", fontWeight: 700,
            boxShadow: "0 4px 12px rgba(37,99,235,0.3)",
          }}>
          + Nova Etiqueta
        </button>
      </div>

      {/* BUSCA + FILTRO EQUIPE */}
      {(etiquetas.length > 5 || equipes.length > 0) && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          {etiquetas.length > 5 && (
            <input placeholder="🔍 Buscar etiqueta..." value={busca} onChange={e => setBusca(e.target.value)}
              style={{ ...IS, maxWidth: 360, padding: "10px 16px", fontSize: 13, borderRadius: 20 }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "#2563eb80"; e.currentTarget.style.boxShadow = "0 0 0 3px #2563eb20"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "#e5e7eb"; e.currentTarget.style.boxShadow = "none"; }}
            />
          )}
          {equipes.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: "#a855f7", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>👥 Equipe</span>
              <select value={filtroEquipe} onChange={e => setFiltroEquipe(e.target.value)} style={{ ...IS, width: "auto", minWidth: 180, padding: "9px 14px", fontSize: 13, cursor: "pointer" }}>
                <option value="todas">Todas as equipes</option>
                <option value="">⚪ Geral (sem equipe)</option>
                {equipes.map(eq => <option key={eq.id} value={String(eq.id)}>{eq.nome}</option>)}
              </select>
            </div>
          )}
        </div>
      )}

      {/* FORM */}
      {showForm && (
        <div style={{ ...cardStyle, padding: 24, display: "flex", flexDirection: "column", gap: 18, maxWidth: 640 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ color: "#1f2937", fontSize: 16, fontWeight: 700, margin: 0 }}>
              {editando ? "✏️ Editar Etiqueta" : "➕ Nova Etiqueta"}
            </h2>
            <button onClick={cancelar} style={{ background: "#f3f4f6", border: "none", color: "#6b7280", fontSize: 16, cursor: "pointer", width: 30, height: 30, borderRadius: 8 }}>✕</button>
          </div>

          {/* PRÉVIA */}
          <div style={{ background: "#f9fafb", borderRadius: 12, padding: 16, display: "flex", alignItems: "center", justifyContent: "center", border: "1px dashed #d1d5db" }}>
            <div style={{ background: form.cor + "15", border: `2px solid ${form.cor}`, borderRadius: 20, padding: "8px 18px", display: "inline-flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 16 }}>{form.icone}</span>
              <span style={{ color: form.cor, fontSize: 13, fontWeight: 700 }}>{form.nome || "Prévia da etiqueta"}</span>
            </div>
          </div>

          {/* NOME */}
          <div>
            <label style={{ color: "#6b7280", fontSize: 11, fontWeight: 700, textTransform: "uppercase", display: "block", marginBottom: 6 }}>Nome *</label>
            <input placeholder="Ex: Lead Quente" value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} style={IS} maxLength={40} />
          </div>

          {/* EQUIPE */}
          {equipes.length > 0 && (
            <div>
              <label style={{ color: "#6b7280", fontSize: 11, fontWeight: 700, textTransform: "uppercase", display: "block", marginBottom: 6 }}>👥 Equipe</label>
              <select value={form.equipeId} onChange={e => setForm({ ...form, equipeId: e.target.value })} style={IS}>
                <option value="">⚪ Geral (todas as equipes)</option>
                {equipes.map(eq => <option key={eq.id} value={String(eq.id)}>{eq.nome}</option>)}
              </select>
              <p style={{ color: "#9ca3af", fontSize: 10, margin: "4px 0 0", lineHeight: 1.4 }}>Deixe "Geral" pra valer pra todas as equipes, ou escolha uma específica.</p>
            </div>
          )}

          {/* ÍCONE */}
          <div>
            <label style={{ color: "#6b7280", fontSize: 11, fontWeight: 700, textTransform: "uppercase", display: "block", marginBottom: 6 }}>Ícone (emoji)</label>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
              <input value={form.icone} onChange={e => setForm({ ...form, icone: e.target.value })} style={{ ...IS, width: 60, textAlign: "center", fontSize: 20 }} maxLength={2} />
              <span style={{ color: "#9ca3af", fontSize: 11 }}>Digite um emoji ou escolha abaixo</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 4 }}>
              {EMOJIS_COMUNS.map(emoji => (
                <button key={emoji} onClick={() => setForm({ ...form, icone: emoji })}
                  style={{
                    background: form.icone === emoji ? "#2563eb15" : "#f9fafb",
                    border: `1px solid ${form.icone === emoji ? "#2563eb" : "#e5e7eb"}`,
                    borderRadius: 8, padding: "6px 0", fontSize: 16, cursor: "pointer",
                  }}>
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          {/* COR */}
          <div>
            <label style={{ color: "#6b7280", fontSize: 11, fontWeight: 700, textTransform: "uppercase", display: "block", marginBottom: 6 }}>Cor</label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 6, marginBottom: 10 }}>
              {CORES_PADRAO.map(cor => (
                <button key={cor} onClick={() => setForm({ ...form, cor })}
                  style={{
                    background: cor,
                    border: form.cor === cor ? "3px solid #1f2937" : "2px solid #e5e7eb",
                    borderRadius: 8, height: 34, cursor: "pointer",
                    boxShadow: form.cor === cor ? `0 0 0 2px white, 0 0 0 4px ${cor}` : "0 1px 2px rgba(0,0,0,0.1)",
                  }} title={cor} />
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="color" value={form.cor} onChange={e => setForm({ ...form, cor: e.target.value })} style={{ width: 40, height: 34, borderRadius: 8, border: "1px solid #e5e7eb", cursor: "pointer", background: "#ffffff" }} />
              <input value={form.cor} onChange={e => setForm({ ...form, cor: e.target.value })} style={{ ...IS, maxWidth: 120, fontFamily: "monospace", padding: "6px 10px", fontSize: 12 }} maxLength={7} />
              <span style={{ color: "#9ca3af", fontSize: 10 }}>Código hex ou picker</span>
            </div>
          </div>

          {/* BOTÕES */}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", borderTop: "1px solid #e5e7eb", paddingTop: 16 }}>
            <button onClick={cancelar} style={{ background: "#ffffff", color: "#6b7280", border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 20px", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>Cancelar</button>
            <button onClick={salvar} disabled={salvando}
              style={{
                background: salvando ? "#1e40af" : "linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)",
                color: "white", border: "none", borderRadius: 10,
                padding: "10px 24px", fontSize: 13, cursor: "pointer", fontWeight: 700,
                boxShadow: "0 4px 12px rgba(37,99,235,0.3)",
              }}>
              {salvando ? "Salvando..." : editando ? "💾 Atualizar" : "➕ Criar Etiqueta"}
            </button>
          </div>
        </div>
      )}

      {/* LISTA */}
      {loading ? (
        <p style={{ color: "#6b7280", fontSize: 13 }}>Carregando...</p>
      ) : etiquetasFiltradas.length === 0 ? (
        <div style={{ ...cardStyle, padding: 48, textAlign: "center" }}>
          <div style={{
            width: 80, height: 80, borderRadius: 20,
            background: "linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 40, margin: "0 auto 16px",
            boxShadow: "0 12px 24px rgba(37,99,235,0.25)",
          }}>
            <span style={{ filter: "saturate(0) brightness(2)" }}>🏷️</span>
          </div>
          <h3 style={{ color: "#1f2937", fontSize: 16, fontWeight: 700, margin: "0 0 8px" }}>
            {busca || filtroEquipe !== "todas" ? "Nenhuma etiqueta encontrada" : "Nenhuma etiqueta cadastrada ainda"}
          </h3>
          <p style={{ color: "#6b7280", fontSize: 13, margin: "0 0 16px" }}>
            {busca || filtroEquipe !== "todas" ? "Tente outro termo ou equipe" : "Crie etiquetas pra organizar seus atendimentos"}
          </p>
          {!busca && filtroEquipe === "todas" && (
            <button onClick={abrirNovo} style={{
              background: "linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)",
              color: "white", border: "none", borderRadius: 12,
              padding: "12px 24px", fontSize: 13, cursor: "pointer", fontWeight: 700,
              boxShadow: "0 4px 12px rgba(37,99,235,0.25)",
            }}>
              + Nova Etiqueta
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          {etiquetasFiltradas.map(e => (
            <div key={e.id}
              style={{
                ...cardStyle,
                padding: "14px 18px",
                borderLeft: `4px solid ${e.cor}`,
                display: "flex", alignItems: "center", gap: 12, minWidth: 240,
                transition: "all 0.15s",
              }}
              onMouseEnter={(ev) => { ev.currentTarget.style.boxShadow = `0 4px 12px ${e.cor}20`; ev.currentTarget.style.transform = "translateY(-1px)"; }}
              onMouseLeave={(ev) => { ev.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)"; ev.currentTarget.style.transform = "translateY(0)"; }}
            >
              <div style={{
                background: e.cor + "15", borderRadius: 10, width: 36, height: 36,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 18, flexShrink: 0,
              }}>
                {e.icone || "🏷️"}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ color: "#1f2937", fontSize: 13, fontWeight: 700, display: "block" }}>{e.nome}</span>
                {equipeNomeDe(e.equipe_id) && (
                  <span style={{ display: "inline-block", marginTop: 3, background: "#a855f715", color: "#a855f7", fontSize: 10, padding: "1px 7px", borderRadius: 10, fontWeight: 700 }}>👥 {equipeNomeDe(e.equipe_id)}</span>
                )}
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <button onClick={() => abrirEditar(e)} title="Editar"
                  style={{
                    background: "#2563eb10", color: "#2563eb",
                    border: "1px solid #2563eb30", borderRadius: 8,
                    padding: "5px 9px", fontSize: 11, cursor: "pointer",
                  }}
                  onMouseEnter={(ev) => ev.currentTarget.style.background = "#2563eb20"}
                  onMouseLeave={(ev) => ev.currentTarget.style.background = "#2563eb10"}
                >✏️</button>
                {podeMexer && <button onClick={() => excluir(e)} title="Excluir"
                  style={{
                    background: "#fef2f2", color: "#dc2626",
                    border: "1px solid #fecaca", borderRadius: 8,
                    padding: "5px 9px", fontSize: 11, cursor: "pointer",
                  }}
                  onMouseEnter={(ev) => ev.currentTarget.style.background = "#fee2e2"}
                  onMouseLeave={(ev) => ev.currentTarget.style.background = "#fef2f2"}
                >🗑️</button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}