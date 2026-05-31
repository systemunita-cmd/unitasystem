"use client";
import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { useTemPermissao } from "../../hooks/useTemPermissao";

// ═══════════════════════════════════════════════════════════════════════
// ⚡ RESPOSTAS RÁPIDAS — UnitaSystem
// ───────────────────────────────────────────────────────────────────────
// CRUD dos atalhos que o atendente usa digitando "/" no chat
// (ex: /oi → "Olá! Como posso te ajudar?").
//
// 🔒 Usuário restrito (Diretor/escopo team) fica TRAVADO na própria equipe:
//    o dropdown some e a lista mostra só as respostas da equipe dele + as
//    gerais (sem equipe). Admin Geral / Super Admin escolhe qualquer equipe.
//
// Single-tenant: SEM workspace_id em nenhuma query.
// Estrutura esperada da tabela `respostas_rapidas`:
//   id (int4, pk, auto)
//   atalho (text)        ex: "/oi"
//   mensagem (text)
//   equipe_id (int4 FK opcional - NULL = vale pra todas as equipes)
//   created_at (timestamp)
// ═══════════════════════════════════════════════════════════════════════

type RespostaRapida = {
  id?: number;
  atalho: string;
  mensagem: string;
  equipe_id?: number | null;
};
type Equipe = { id: number; nome: string };

export function RespostasRapidasSection() {
  // 🛡️ Sistema novo de permissões
  const perm = useTemPermissao();
  const escopoAcessar = perm.escopo("respostas_rapidas.acessar");
  const novoPodeCrud = perm.tem("respostas_rapidas.crud") || perm.escopo("respostas_rapidas.crud") !== "none";
  const podeAcessar = perm.superAdmin || escopoAcessar !== "none";

  // 🔒 Trava por equipe (Diretor/escopo team)
  const ehAdminGeralRR = perm.superAdmin || perm.grupoNome === "Administração Geral";
  const equipeForcadaRR = (!perm.carregando && !ehAdminGeralRR && perm.equipeId != null) ? String(perm.equipeId) : null;
  const travadoEquipe = equipeForcadaRR !== null;

  const [respostas, setRespostas] = useState<RespostaRapida[]>([]);
  const [equipes, setEquipes] = useState<Equipe[]>([]);
  const [filtroEquipe, setFiltroEquipe] = useState<string>("todas");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ atalho: "", mensagem: "", equipeId: "" });
  const [salvando, setSalvando] = useState(false);
  const [carregando, setCarregando] = useState(false);

  const nomeEquipeForcada = equipes.find(e => String(e.id) === equipeForcadaRR)?.nome || "Minha equipe";

  const IS = {
    width: "100%",
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    padding: "10px 14px",
    color: "#1f2937",
    fontSize: 13,
    boxSizing: "border-box" as const,
    outline: "none",
    transition: "border-color 0.15s, box-shadow 0.15s",
  };

  const cardStyle = {
    background: "#ffffff",
    borderRadius: 14,
    border: "1px solid #e5e7eb",
    boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
  };

  const fetchRespostas = async () => {
    setCarregando(true);
    try {
      const { data, error } = await supabase
        .from("respostas_rapidas")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) {
        console.warn("[RespostasRapidas] erro no fetch:", error.message);
        setRespostas([]);
      } else {
        setRespostas(data || []);
      }
    } catch (e) {
      console.error("[RespostasRapidas] exceção no fetch:", e);
      setRespostas([]);
    }
    setCarregando(false);
  };

  // Carrega equipes ativas
  const fetchEquipes = async () => {
    try {
      const { data } = await supabase.from("equipes").select("id, nome").eq("ativo", true).order("nome", { ascending: true });
      setEquipes((data as Equipe[]) || []);
    } catch (e) {
      console.error("Erro ao buscar equipes:", e);
      setEquipes([]);
    }
  };

  useEffect(() => {
    fetchRespostas();
    fetchEquipes();
  }, []);

  // 🔒 Força o filtro pra equipe do usuário restrito
  useEffect(() => {
    if (travadoEquipe && equipeForcadaRR) setFiltroEquipe(equipeForcadaRR);
  }, [travadoEquipe, equipeForcadaRR]);

  const salvar = async () => {
    if (!form.atalho.trim() || !form.mensagem.trim()) {
      alert("Preencha atalho e mensagem!");
      return;
    }
    if (!form.atalho.startsWith("/")) {
      alert("O atalho deve começar com /");
      return;
    }

    setSalvando(true);
    try {
      // 🔒 Usuário restrito só cria dentro da própria equipe
      const equipeIdFinal = travadoEquipe && equipeForcadaRR
        ? parseInt(equipeForcadaRR)
        : (form.equipeId ? parseInt(form.equipeId) : null);
      const { data, error } = await supabase
        .from("respostas_rapidas")
        .insert([{
          atalho: form.atalho.trim(),
          mensagem: form.mensagem.trim(),
          equipe_id: equipeIdFinal,
        }])
        .select("id")
        .single();
      if (error) {
        alert("Erro ao salvar: " + error.message);
      } else {
        await fetchRespostas();
        setForm({ atalho: "", mensagem: "", equipeId: "" });
        setShowForm(false);
      }
    } catch (e: any) {
      alert("Erro ao salvar: " + (e?.message || "desconhecido"));
    }
    setSalvando(false);
  };

  const remover = async (r: RespostaRapida) => {
    if (!confirm(`Remover atalho ${r.atalho}?`)) return;
    if (!r.id) {
      setRespostas(respostas.filter(x => x.atalho !== r.atalho));
      return;
    }
    const { error } = await supabase.from("respostas_rapidas").delete().eq("id", r.id);
    if (error) {
      alert("Erro ao remover: " + error.message);
      return;
    }
    await fetchRespostas();
  };

  // Nome da equipe a partir do id
  const equipeNomeDe = (equipeId?: number | null): string => {
    if (!equipeId) return "";
    return equipes.find(e => e.id === equipeId)?.nome || "";
  };

  // Respostas filtradas pela equipe escolhida
  const respostasFiltradas = respostas.filter(r => {
    // 🔒 Restrito: vê só as da equipe dele + as gerais (sem equipe)
    if (travadoEquipe) {
      return !r.equipe_id || String(r.equipe_id) === equipeForcadaRR;
    }
    if (filtroEquipe === "todas") return true;
    if (filtroEquipe === "") return !r.equipe_id;
    return String(r.equipe_id || "") === filtroEquipe;
  });


  // 🛡️ Guard visual
  if (perm.carregando) {
    return <div style={{ padding: 24, color: "#6b7280", fontSize: 13 }}>⏳ Verificando permissões...</div>;
  }
  if (!podeAcessar) {
    return (
      <div style={{ padding: 32, textAlign: "center" }}>
        <div style={{ fontSize: 36, marginBottom: 8 }}>🔒</div>
        <p style={{ color: "#1f2937", fontWeight: 700, margin: "0 0 4px" }}>Sem acesso</p>
        <p style={{ color: "#9ca3af", fontSize: 12 }}>Grupo: <b>{perm.grupoNome || "(sem grupo)"}</b></p>
      </div>
    );
  }
  return (
    <div style={{ padding: 32, display: "flex", flexDirection: "column", gap: 24, background: "#f8fafc", minHeight: "100vh" }}>

      {/* ═══ HEADER ═══ */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14,
            background: "linear-gradient(135deg, #f59e0b 0%, #f97316 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 24, boxShadow: "0 8px 20px rgba(245,158,11,0.25)",
          }}>
            <span style={{ filter: "saturate(0) brightness(2)" }}>⚡</span>
          </div>
          <div>
            <h1 style={{ color: "#1f2937", fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: -0.3 }}>Respostas Rápidas</h1>
            <p style={{ color: "#6b7280", fontSize: 13, margin: "2px 0 0" }}>
              Digite <code style={{ background: "#f3f4f6", color: "#2563eb", padding: "1px 6px", borderRadius: 4, fontSize: 12, fontFamily: "monospace", fontWeight: 600 }}>/</code> no chat para usar
            </p>
          </div>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          style={{
            background: "linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)",
            color: "white", border: "none", borderRadius: 12,
            padding: "12px 22px", fontSize: 13, cursor: "pointer", fontWeight: 700,
            boxShadow: "0 4px 12px rgba(37,99,235,0.30)",
          }}>
          + Nova Resposta
        </button>
      </div>

      {/* ═══ FILTRO DE EQUIPE ═══ */}
      {/* Admin: dropdown. Restrito: rótulo fixo da equipe dele */}
      {equipes.length > 0 && !travadoEquipe && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: "#a855f7", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>👥 Equipe</span>
          <select value={filtroEquipe} onChange={e => setFiltroEquipe(e.target.value)} style={{ ...IS, width: "auto", minWidth: 200, cursor: "pointer" }}>
            <option value="todas">Todas as equipes</option>
            <option value="">⚪ Geral (sem equipe)</option>
            {equipes.map(eq => <option key={eq.id} value={String(eq.id)}>{eq.nome}</option>)}
          </select>
        </div>
      )}
      {equipes.length > 0 && travadoEquipe && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#faf5ff", border: "1px solid #e9d5ff", borderRadius: 12, padding: "7px 14px", alignSelf: "flex-start" }}>
          <span style={{ color: "#a855f7", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>👥 Equipe</span>
          <span style={{ color: "#7c3aed", fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" }}>{nomeEquipeForcada}</span>
        </div>
      )}

      {/* ═══ FORM ═══ */}
      {showForm && (
        <div style={{ ...cardStyle, padding: 22, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: "#2563eb15", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>➕</div>
            <p style={{ color: "#2563eb", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, margin: 0 }}>Nova Resposta Rápida</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 12 }}>
            <div>
              <label style={{ color: "#6b7280", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 6 }}>Atalho *</label>
              <input placeholder="/oi" value={form.atalho} onChange={e => setForm({ ...form, atalho: e.target.value })} style={{ ...IS, fontFamily: "monospace", fontWeight: 600 }} />
            </div>
            <div>
              <label style={{ color: "#6b7280", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 6 }}>Mensagem *</label>
              <input placeholder="Olá! Como posso te ajudar?" value={form.mensagem} onChange={e => setForm({ ...form, mensagem: e.target.value })} style={IS} />
            </div>
          </div>
          {/* EQUIPE — admin escolhe; restrito vê fixo */}
          {equipes.length > 0 && !travadoEquipe && (
            <div>
              <label style={{ color: "#6b7280", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 6 }}>👥 Equipe</label>
              <select value={form.equipeId} onChange={e => setForm({ ...form, equipeId: e.target.value })} style={IS}>
                <option value="">⚪ Geral (todas as equipes)</option>
                {equipes.map(eq => <option key={eq.id} value={String(eq.id)}>{eq.nome}</option>)}
              </select>
              <p style={{ color: "#9ca3af", fontSize: 10, margin: "4px 0 0", lineHeight: 1.4 }}>Deixe "Geral" pra valer pra todas as equipes, ou escolha uma equipe específica.</p>
            </div>
          )}
          {equipes.length > 0 && travadoEquipe && (
            <div>
              <label style={{ color: "#6b7280", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 6 }}>👥 Equipe</label>
              <div style={{ ...IS, background: "#faf5ff", border: "1px solid #e9d5ff", color: "#7c3aed", fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
                👥 {nomeEquipeForcada}
              </div>
              <p style={{ color: "#9ca3af", fontSize: 10, margin: "4px 0 0", lineHeight: 1.4 }}>A resposta será criada na sua equipe.</p>
            </div>
          )}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", borderTop: "1px solid #e5e7eb", paddingTop: 14 }}>
            <button onClick={() => { setShowForm(false); setForm({ atalho: "", mensagem: "", equipeId: "" }); }}
              style={{ background: "#ffffff", color: "#6b7280", border: "1px solid #e5e7eb", borderRadius: 10, padding: "9px 18px", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>
              Cancelar
            </button>
            <button onClick={salvar} disabled={salvando}
              style={{
                background: salvando ? "#1e40af" : "linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)",
                color: "white", border: "none", borderRadius: 10,
                padding: "9px 22px", fontSize: 12, cursor: "pointer", fontWeight: 700,
                boxShadow: "0 4px 12px rgba(37,99,235,0.30)",
              }}>
              {salvando ? "⏳ Salvando..." : "💾 Salvar"}
            </button>
          </div>
        </div>
      )}

      {/* ═══ LISTA ═══ */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {carregando ? (
          <div style={{ ...cardStyle, padding: 32, textAlign: "center" }}>
            <p style={{ color: "#6b7280", fontSize: 13 }}>⏳ Carregando...</p>
          </div>
        ) : respostasFiltradas.length === 0 ? (
          <div style={{ ...cardStyle, padding: 48, textAlign: "center" }}>
            <div style={{
              width: 80, height: 80, borderRadius: 20,
              background: "linear-gradient(135deg, #f59e0b 0%, #f97316 100%)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 40, margin: "0 auto 16px",
              boxShadow: "0 12px 24px rgba(245,158,11,0.25)",
            }}>
              <span style={{ filter: "saturate(0) brightness(2)" }}>⚡</span>
            </div>
            <h3 style={{ color: "#1f2937", fontSize: 16, fontWeight: 700, margin: "0 0 8px" }}>
              {(!travadoEquipe && filtroEquipe !== "todas") ? "Nenhuma resposta nessa equipe" : "Nenhuma resposta rápida cadastrada ainda"}
            </h3>
            <p style={{ color: "#6b7280", fontSize: 13, margin: 0 }}>Clique em <b>+ Nova Resposta</b> pra criar a primeira</p>
          </div>
        ) : respostasFiltradas.map((r, i) => (
          <div key={r.id || i}
            style={{
              ...cardStyle,
              padding: "14px 20px",
              display: "flex", alignItems: "center", gap: 16,
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 4px 12px rgba(37,99,235,0.10)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)"; e.currentTarget.style.transform = "translateY(0)"; }}
          >
            <span style={{
              background: "#2563eb15",
              color: "#2563eb",
              border: "1px solid #2563eb30",
              fontSize: 12, padding: "5px 12px",
              borderRadius: 8, fontWeight: 700,
              whiteSpace: "nowrap",
              fontFamily: "monospace",
            }}>
              {r.atalho}
            </span>
            <p style={{ color: "#4b5563", fontSize: 13, margin: 0, flex: 1 }}>{r.mensagem}</p>
            {equipeNomeDe(r.equipe_id) && (
              <span style={{ background: "#a855f715", color: "#a855f7", border: "1px solid #a855f730", fontSize: 11, padding: "4px 10px", borderRadius: 10, fontWeight: 700, whiteSpace: "nowrap" }}>👥 {equipeNomeDe(r.equipe_id)}</span>
            )}
            <button onClick={() => remover(r)}
              style={{
                background: "#fef2f2", color: "#dc2626",
                border: "1px solid #fecaca", borderRadius: 8,
                padding: "7px 14px", fontSize: 12, cursor: "pointer", fontWeight: 600,
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = "#fee2e2"}
              onMouseLeave={(e) => e.currentTarget.style.background = "#fef2f2"}>
              Remover
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}