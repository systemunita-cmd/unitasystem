"use client";
import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { PermissaoCatalogo, ValorPermissao, isSuperAdmin } from "../lib/permissoes";

// ═══════════════════════════════════════════════════════════════════════
// 🛡️ GruposPermissaoSection — UI funcional dos Grupos de Permissão
// ─────────────────────────────────────────────────────────────────────
// Permite:
//   • Criar/renomear/excluir grupos (grupos com protegido=true não podem ser excluídos)
//   • Editar metadados (nome, descrição, cor, ícone)
//   • Marcar/desmarcar cada uma das 64 permissões com:
//       - TOGGLE: ✅/❌
//       - ESCOPO: ❌ / 👤 Próprios / 👥 Equipe / 🌐 Todos
//   • Busca por permissão
//   • Marcar tudo / Limpar tudo (na área filtrada)
//   • Detecta mudanças (botão Salvar só ativo se dirty)
//   • Real-time: atualiza se outro admin alterar
// ═══════════════════════════════════════════════════════════════════════

type Grupo = {
  id: number;
  nome: string;
  descricao: string | null;
  cor: string | null;
  icone: string | null;
  protegido: boolean;
};

const CORES_DISPONIVEIS = [
  "#dc2626", "#ea580c", "#f59e0b", "#16a34a",
  "#0891b2", "#2563eb", "#7c3aed", "#ec4899",
  "#64748b", "#0f766e",
];

const ICONES_SUGERIDOS = ["🛡️", "🎖️", "📊", "👁️", "💼", "📋", "🎧", "📣", "👑", "⭐", "🔧", "🚀"];

// ─── Estilos compartilhados ───
const cardStyle = {
  background: "#ffffff",
  borderRadius: 14,
  border: "1px solid #e5e7eb",
  boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
};
const inputStyle = {
  background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 10,
  padding: "9px 12px", color: "#1f2937", fontSize: 13, outline: "none",
  width: "100%", boxSizing: "border-box" as const,
};
const labelStyle = {
  color: "#6b7280", fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const,
  letterSpacing: 0.5, display: "block", marginBottom: 6,
};

export default function GruposPermissaoSection() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const c = () => setIsMobile(window.innerWidth < 768);
    c(); window.addEventListener("resize", c);
    return () => window.removeEventListener("resize", c);
  }, []);

  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);

  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [permissoes, setPermissoes] = useState<PermissaoCatalogo[]>([]);
  const [carregando, setCarregando] = useState(true);

  const [grupoSelId, setGrupoSelId] = useState<number | null>(null);
  const [editGrupo, setEditGrupo] = useState<{ nome: string; descricao: string; cor: string; icone: string }>({
    nome: "", descricao: "", cor: "#3b82f6", icone: "👥",
  });
  const [editGrupoOriginal, setEditGrupoOriginal] = useState<{ nome: string; descricao: string; cor: string; icone: string }>({
    nome: "", descricao: "", cor: "#3b82f6", icone: "👥",
  });

  // Maps de valores: original (banco) vs editado (UI)
  const [valoresOriginais, setValoresOriginais] = useState<Record<string, ValorPermissao>>({});
  const [valoresEditados, setValoresEditados] = useState<Record<string, ValorPermissao>>({});

  const [busca, setBusca] = useState("");
  const [areasFechadas, setAreasFechadas] = useState<Set<string>>(new Set());

  const [showCriar, setShowCriar] = useState(false);
  const [formCriar, setFormCriar] = useState({ nome: "", descricao: "", cor: "#3b82f6", icone: "👥" });

  const [salvando, setSalvando] = useState(false);
  const [feedback, setFeedback] = useState<{ tipo: "ok" | "erro" | "aviso"; msg: string } | null>(null);

  const podeEditar = useMemo(() => {
    return isSuperAdmin(userEmail) || userRole === "admin";
  }, [userEmail, userRole]);

  // ─── Carrega usuário logado ───
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserEmail(user.email || null);
      const { data: u } = await supabase.from("usuarios").select("role").eq("auth_user_id", user.id).maybeSingle();
      setUserRole(u?.role || null);
    })();
  }, []);

  // ─── Carrega grupos + catálogo ───
  const carregarTudo = useCallback(async () => {
    setCarregando(true);
    const [resG, resP] = await Promise.all([
      supabase.from("grupos_permissao").select("id, nome, descricao, cor, icone, protegido").order("nome"),
      supabase.from("permissoes").select("slug, area, area_icone, nome, tipo, ordem").order("ordem"),
    ]);
    setGrupos((resG.data || []) as Grupo[]);
    setPermissoes((resP.data || []) as PermissaoCatalogo[]);
    setCarregando(false);
  }, []);

  useEffect(() => {
    carregarTudo();
    const ch = supabase.channel("grupos_perm_rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "grupos_permissao" }, () => carregarTudo())
      .on("postgres_changes", { event: "*", schema: "public", table: "grupo_permissoes" }, (p: any) => {
        // Se for o grupo atualmente selecionado, recarrega permissões
        if (grupoSelId && (p.new?.grupo_id === grupoSelId || p.old?.grupo_id === grupoSelId)) {
          carregarPermissoesDoGrupo(grupoSelId);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carregarTudo, grupoSelId]);

  // ─── Carrega permissões de um grupo ───
  const carregarPermissoesDoGrupo = useCallback(async (id: number) => {
    const { data } = await supabase.from("grupo_permissoes").select("permissao_slug, valor").eq("grupo_id", id);
    const mapa: Record<string, ValorPermissao> = {};
    for (const r of (data || [])) mapa[r.permissao_slug] = r.valor as ValorPermissao;
    setValoresOriginais(mapa);
    setValoresEditados({ ...mapa });
  }, []);

  // ─── Seleciona grupo ───
  const selecionarGrupo = async (g: Grupo) => {
    if (dirty) {
      if (!confirm("Você tem alterações não salvas. Descartar e mudar de grupo?")) return;
    }
    setGrupoSelId(g.id);
    setEditGrupo({
      nome: g.nome,
      descricao: g.descricao || "",
      cor: g.cor || "#3b82f6",
      icone: g.icone || "👥",
    });
    setEditGrupoOriginal({
      nome: g.nome,
      descricao: g.descricao || "",
      cor: g.cor || "#3b82f6",
      icone: g.icone || "👥",
    });
    await carregarPermissoesDoGrupo(g.id);
  };

  // ─── Detecção de mudanças ───
  const dirty = useMemo(() => {
    // Compara metadados
    if (editGrupo.nome !== editGrupoOriginal.nome) return true;
    if (editGrupo.descricao !== editGrupoOriginal.descricao) return true;
    if (editGrupo.cor !== editGrupoOriginal.cor) return true;
    if (editGrupo.icone !== editGrupoOriginal.icone) return true;
    // Compara permissões
    const todasChaves = new Set([...Object.keys(valoresOriginais), ...Object.keys(valoresEditados)]);
    for (const k of todasChaves) {
      if (valoresOriginais[k] !== valoresEditados[k]) return true;
    }
    return false;
  }, [editGrupo, editGrupoOriginal, valoresOriginais, valoresEditados]);

  // ─── Filtro e agrupamento por área ───
  const grupoAtual = grupos.find(g => g.id === grupoSelId) || null;

  const permissoesFiltradas = useMemo(() => {
    const b = busca.toLowerCase().trim();
    if (!b) return permissoes;
    return permissoes.filter(p =>
      p.nome.toLowerCase().includes(b) ||
      p.area.toLowerCase().includes(b) ||
      p.slug.toLowerCase().includes(b)
    );
  }, [permissoes, busca]);

  const porArea = useMemo(() => {
    const map: Map<string, { icone: string; lista: PermissaoCatalogo[] }> = new Map();
    for (const p of permissoesFiltradas) {
      if (!map.has(p.area)) map.set(p.area, { icone: p.area_icone || "📁", lista: [] });
      map.get(p.area)!.lista.push(p);
    }
    return Array.from(map.entries());
  }, [permissoesFiltradas]);

  // ─── Handlers ───
  const alterarValor = (slug: string, novo: ValorPermissao) => {
    if (!podeEditar) return;
    setValoresEditados(prev => ({ ...prev, [slug]: novo }));
  };

  const toggleArea = (area: string) => {
    setAreasFechadas(prev => {
      const n = new Set(prev);
      if (n.has(area)) n.delete(area); else n.add(area);
      return n;
    });
  };

  const marcarTudoFiltrado = () => {
    if (!podeEditar) return;
    const novos = { ...valoresEditados };
    for (const p of permissoesFiltradas) {
      novos[p.slug] = p.tipo === "toggle" ? "on" : "all";
    }
    setValoresEditados(novos);
  };

  const limparTudoFiltrado = () => {
    if (!podeEditar) return;
    const novos = { ...valoresEditados };
    for (const p of permissoesFiltradas) {
      novos[p.slug] = p.tipo === "toggle" ? "off" : "none";
    }
    setValoresEditados(novos);
  };

  const descartar = () => {
    if (!grupoAtual) return;
    setEditGrupo({ ...editGrupoOriginal });
    setValoresEditados({ ...valoresOriginais });
    setFeedback({ tipo: "aviso", msg: "Alterações descartadas." });
    setTimeout(() => setFeedback(null), 2500);
  };

  const salvar = async () => {
    if (!grupoAtual || !podeEditar) return;
    setSalvando(true);
    try {
      // 1. Atualiza metadados se mudaram
      const metaMudou = (
        editGrupo.nome !== editGrupoOriginal.nome ||
        editGrupo.descricao !== editGrupoOriginal.descricao ||
        editGrupo.cor !== editGrupoOriginal.cor ||
        editGrupo.icone !== editGrupoOriginal.icone
      );
      if (metaMudou) {
        if (!editGrupo.nome.trim()) {
          setFeedback({ tipo: "erro", msg: "Nome do grupo não pode ficar vazio." });
          setSalvando(false);
          return;
        }
        const { error } = await supabase.from("grupos_permissao").update({
          nome: editGrupo.nome.trim(),
          descricao: editGrupo.descricao.trim() || null,
          cor: editGrupo.cor,
          icone: editGrupo.icone,
        }).eq("id", grupoAtual.id);
        if (error) {
          setFeedback({ tipo: "erro", msg: "Erro ao salvar metadados: " + error.message });
          setSalvando(false);
          return;
        }
      }

      // 2. Calcula vínculos que mudaram
      const mudancas: { grupo_id: number; permissao_slug: string; valor: ValorPermissao }[] = [];
      const todas = new Set([...Object.keys(valoresOriginais), ...Object.keys(valoresEditados)]);
      for (const slug of todas) {
        if (valoresOriginais[slug] !== valoresEditados[slug] && valoresEditados[slug]) {
          mudancas.push({ grupo_id: grupoAtual.id, permissao_slug: slug, valor: valoresEditados[slug] });
        }
      }

      if (mudancas.length > 0) {
        const { error } = await supabase.from("grupo_permissoes").upsert(mudancas, {
          onConflict: "grupo_id,permissao_slug",
        });
        if (error) {
          setFeedback({ tipo: "erro", msg: "Erro ao salvar permissões: " + error.message });
          setSalvando(false);
          return;
        }
      }

      // 3. Reload
      await carregarTudo();
      await carregarPermissoesDoGrupo(grupoAtual.id);
      setEditGrupoOriginal({ ...editGrupo });
      setFeedback({ tipo: "ok", msg: `✅ Grupo "${editGrupo.nome}" atualizado! ${mudancas.length} permissão(ões) alterada(s).` });
      setTimeout(() => setFeedback(null), 4000);
    } catch (e: any) {
      setFeedback({ tipo: "erro", msg: "Erro: " + (e?.message || "desconhecido") });
    }
    setSalvando(false);
  };

  const criarGrupo = async () => {
    if (!podeEditar) return;
    if (!formCriar.nome.trim()) { setFeedback({ tipo: "erro", msg: "Informe um nome." }); return; }
    const { data, error } = await supabase.from("grupos_permissao").insert({
      nome: formCriar.nome.trim(),
      descricao: formCriar.descricao.trim() || null,
      cor: formCriar.cor,
      icone: formCriar.icone,
      protegido: false,
    }).select().maybeSingle();
    if (error) { setFeedback({ tipo: "erro", msg: error.message }); return; }
    // Cria vínculos vazios (off/none) pra todas as permissões
    if (data) {
      const novos = permissoes.map(p => ({
        grupo_id: data.id,
        permissao_slug: p.slug,
        valor: (p.tipo === "toggle" ? "off" : "none") as ValorPermissao,
      }));
      await supabase.from("grupo_permissoes").upsert(novos, { onConflict: "grupo_id,permissao_slug" });
    }
    setShowCriar(false);
    setFormCriar({ nome: "", descricao: "", cor: "#3b82f6", icone: "👥" });
    await carregarTudo();
    if (data) selecionarGrupo(data as Grupo);
    setFeedback({ tipo: "ok", msg: `✅ Grupo "${data?.nome}" criado!` });
    setTimeout(() => setFeedback(null), 3000);
  };

  const excluirGrupo = async (g: Grupo) => {
    if (!podeEditar) return;
    if (g.protegido) {
      setFeedback({ tipo: "aviso", msg: `🛡️ "${g.nome}" é um grupo padrão protegido e não pode ser excluído.` });
      setTimeout(() => setFeedback(null), 4000);
      return;
    }
    if (!confirm(`Excluir o grupo "${g.nome}"?\n\nTodos os usuários que estavam neste grupo ficarão SEM grupo (acesso bloqueado até atribuir outro).`)) return;

    const { error } = await supabase.from("grupos_permissao").delete().eq("id", g.id);
    if (error) { setFeedback({ tipo: "erro", msg: error.message }); return; }

    if (grupoSelId === g.id) {
      setGrupoSelId(null);
      setValoresOriginais({});
      setValoresEditados({});
    }
    await carregarTudo();
    setFeedback({ tipo: "ok", msg: `✅ Grupo "${g.nome}" excluído.` });
    setTimeout(() => setFeedback(null), 3000);
  };

  // ─── RENDER ───

  if (carregando) {
    return <div style={{ padding: 32, textAlign: "center", color: "#6b7280" }}>⏳ Carregando grupos e permissões...</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* HEADER */}
      <div style={{ ...cardStyle, padding: isMobile ? 14 : 18, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={{ color: "#1f2937", fontSize: isMobile ? 16 : 18, fontWeight: 800, margin: 0 }}>🛡️ Grupos de Permissão</h2>
          <p style={{ color: "#6b7280", fontSize: 11, margin: "3px 0 0" }}>
            {grupos.length} grupo(s) · {permissoes.length} permissões disponíveis
            {!podeEditar && <span style={{ color: "#dc2626", marginLeft: 8 }}>· Somente leitura (acesso restrito a admins)</span>}
          </p>
        </div>
        {podeEditar && (
          <button onClick={() => setShowCriar(true)}
            style={{ background: "linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)", color: "white", border: "none", borderRadius: 10, padding: "9px 18px", fontSize: 12, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 12px rgba(37,99,235,0.3)" }}>
            + Novo Grupo
          </button>
        )}
      </div>

      {/* FEEDBACK */}
      {feedback && (
        <div style={{
          padding: "10px 14px", borderRadius: 10, fontSize: 12, fontWeight: 600,
          background: feedback.tipo === "ok" ? "#f0fdf4" : feedback.tipo === "erro" ? "#fef2f2" : "#fffbeb",
          color:      feedback.tipo === "ok" ? "#15803d" : feedback.tipo === "erro" ? "#dc2626" : "#92400e",
          border:     `1px solid ${feedback.tipo === "ok" ? "#bbf7d0" : feedback.tipo === "erro" ? "#fecaca" : "#fde68a"}`,
        }}>{feedback.msg}</div>
      )}

      {/* LISTA DE GRUPOS */}
      <div style={{ ...cardStyle, padding: isMobile ? 12 : 14 }}>
        <p style={labelStyle}>📋 Selecione um grupo pra editar</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {grupos.map(g => {
            const ativo = grupoSelId === g.id;
            const cor = g.cor || "#3b82f6";
            return (
              <button key={g.id} onClick={() => selecionarGrupo(g)}
                style={{
                  background: ativo ? cor : "#ffffff",
                  color: ativo ? "white" : "#1f2937",
                  border: `2px solid ${ativo ? cor : "#e5e7eb"}`,
                  borderRadius: 12, padding: "8px 14px",
                  cursor: "pointer", fontWeight: 700, fontSize: 12,
                  display: "flex", alignItems: "center", gap: 6,
                  boxShadow: ativo ? `0 4px 14px ${cor}40` : "none",
                  transition: "all 0.15s",
                }}>
                <span style={{ fontSize: 14 }}>{g.icone || "👥"}</span>
                <span>{g.nome}</span>
                {g.protegido && <span style={{ fontSize: 10, opacity: 0.7 }}>🛡️</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* EDITOR DO GRUPO SELECIONADO */}
      {grupoAtual ? (
        <div style={{ ...cardStyle, padding: isMobile ? 14 : 22 }}>
          {/* Metadados */}
          <div style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 18, marginBottom: 18 }}>
            <p style={{ color: editGrupo.cor, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, margin: "0 0 12px" }}>
              📝 Editando: <span style={{ fontSize: 14 }}>{editGrupo.icone}</span> {grupoAtual.nome}
              {grupoAtual.protegido && <span style={{ marginLeft: 8, color: "#f59e0b", fontSize: 10 }}>🛡️ PROTEGIDO</span>}
            </p>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>Nome do grupo</label>
                <input value={editGrupo.nome} onChange={e => setEditGrupo({ ...editGrupo, nome: e.target.value })}
                  disabled={!podeEditar} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Descrição</label>
                <input value={editGrupo.descricao} onChange={e => setEditGrupo({ ...editGrupo, descricao: e.target.value })}
                  disabled={!podeEditar} style={inputStyle} placeholder="Pra que serve esse grupo" />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
              <div>
                <label style={labelStyle}>🎨 Cor</label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {CORES_DISPONIVEIS.map(c => (
                    <button key={c} onClick={() => podeEditar && setEditGrupo({ ...editGrupo, cor: c })}
                      style={{
                        width: 28, height: 28, borderRadius: 8, background: c,
                        border: editGrupo.cor === c ? "3px solid #1f2937" : "1px solid #e5e7eb",
                        cursor: podeEditar ? "pointer" : "not-allowed", opacity: podeEditar ? 1 : 0.5,
                      }} />
                  ))}
                </div>
              </div>
              <div>
                <label style={labelStyle}>🎭 Ícone (cole emoji ou escolha)</label>
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  <input value={editGrupo.icone} onChange={e => setEditGrupo({ ...editGrupo, icone: e.target.value })}
                    disabled={!podeEditar} style={{ ...inputStyle, width: 70, textAlign: "center", fontSize: 18 }} maxLength={2} />
                  {ICONES_SUGERIDOS.map(i => (
                    <button key={i} onClick={() => podeEditar && setEditGrupo({ ...editGrupo, icone: i })}
                      style={{
                        width: 30, height: 30, borderRadius: 8, fontSize: 16,
                        border: editGrupo.icone === i ? `2px solid ${editGrupo.cor}` : "1px solid #e5e7eb",
                        background: editGrupo.icone === i ? `${editGrupo.cor}15` : "#ffffff",
                        cursor: podeEditar ? "pointer" : "not-allowed", opacity: podeEditar ? 1 : 0.5,
                      }}>{i}</button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Filtros + ações em massa */}
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
            <input value={busca} onChange={e => setBusca(e.target.value)}
              placeholder="🔍 Buscar permissão..."
              style={{ ...inputStyle, flex: 1, minWidth: 180, padding: "8px 14px" }} />
            {podeEditar && (
              <>
                <button onClick={marcarTudoFiltrado}
                  style={{ background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0", borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  ✓ Marcar tudo
                </button>
                <button onClick={limparTudoFiltrado}
                  style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  ✗ Limpar
                </button>
              </>
            )}
          </div>

          {/* Lista de permissões agrupadas por área */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {porArea.map(([area, info]) => {
              const fechada = areasFechadas.has(area);
              return (
                <div key={area} style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
                  <button onClick={() => toggleArea(area)}
                    style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "transparent", border: "none", cursor: "pointer" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 8, color: "#1f2937", fontSize: 13, fontWeight: 800 }}>
                      <span style={{ fontSize: 16 }}>{info.icone}</span>
                      {area}
                      <span style={{ background: "white", color: "#6b7280", fontSize: 10, padding: "2px 8px", borderRadius: 8, fontWeight: 700 }}>
                        {info.lista.length}
                      </span>
                    </span>
                    <span style={{ color: "#9ca3af", fontSize: 12 }}>{fechada ? "▶" : "▼"}</span>
                  </button>
                  {!fechada && (
                    <div style={{ background: "#ffffff", borderTop: "1px solid #e5e7eb" }}>
                      {info.lista.map((p, idx) => {
                        const valor = valoresEditados[p.slug] || (p.tipo === "toggle" ? "off" : "none");
                        const mudou = valoresOriginais[p.slug] !== valor;
                        return (
                          <div key={p.slug}
                            style={{
                              display: "flex", alignItems: "center", justifyContent: "space-between",
                              padding: "10px 14px",
                              borderTop: idx === 0 ? "none" : "1px solid #f3f4f6",
                              background: mudou ? "#fffbeb" : "transparent",
                              gap: 12,
                            }}>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <p style={{ color: "#1f2937", fontSize: 12.5, fontWeight: 600, margin: 0 }}>
                                {p.nome}
                                {mudou && <span style={{ marginLeft: 6, color: "#f59e0b", fontSize: 10, fontWeight: 700 }}>● alterado</span>}
                              </p>
                            </div>
                            {p.tipo === "toggle" ? (
                              <ToggleBotoes valor={valor as any} onChange={v => alterarValor(p.slug, v)} disabled={!podeEditar} />
                            ) : (
                              <EscopoBotoes valor={valor as any} onChange={v => alterarValor(p.slug, v)} disabled={!podeEditar} />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
            {porArea.length === 0 && (
              <p style={{ textAlign: "center", color: "#9ca3af", fontSize: 12, padding: 24, fontStyle: "italic" }}>
                Nenhuma permissão encontrada com "{busca}"
              </p>
            )}
          </div>

          {/* AÇÕES */}
          {podeEditar && (
            <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid #e5e7eb", display: "flex", gap: 8, justifyContent: "space-between", flexWrap: "wrap" }}>
              <div style={{ display: "flex", gap: 8 }}>
                {!grupoAtual.protegido && (
                  <button onClick={() => excluirGrupo(grupoAtual)}
                    style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", borderRadius: 10, padding: "9px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                    🗑️ Excluir Grupo
                  </button>
                )}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={descartar} disabled={!dirty || salvando}
                  style={{
                    background: !dirty ? "#f3f4f6" : "#ffffff", color: !dirty ? "#9ca3af" : "#6b7280",
                    border: "1px solid #e5e7eb", borderRadius: 10, padding: "9px 16px",
                    fontSize: 12, fontWeight: 600, cursor: !dirty ? "not-allowed" : "pointer",
                  }}>↩️ Descartar</button>
                <button onClick={salvar} disabled={!dirty || salvando}
                  style={{
                    background: (!dirty || salvando) ? "#a5b4fc" : "linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)",
                    color: "white", border: "none", borderRadius: 10, padding: "9px 22px",
                    fontSize: 12, fontWeight: 700, cursor: (!dirty || salvando) ? "not-allowed" : "pointer",
                    boxShadow: (!dirty || salvando) ? "none" : "0 4px 12px rgba(37,99,235,0.3)",
                  }}>{salvando ? "⏳ Salvando..." : "💾 Salvar Alterações"}</button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div style={{ ...cardStyle, padding: 48, textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 10 }}>🛡️</div>
          <p style={{ color: "#1f2937", fontSize: 14, fontWeight: 700, margin: "0 0 6px" }}>Selecione um grupo acima</p>
          <p style={{ color: "#9ca3af", fontSize: 12, margin: 0 }}>Você verá todas as 64 permissões pra marcar/desmarcar conforme o cargo.</p>
        </div>
      )}

      {/* MODAL CRIAR */}
      {showCriar && (
        <div onClick={() => setShowCriar(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: "#ffffff", borderRadius: 16, maxWidth: 480, width: "100%", padding: 24, display: "flex", flexDirection: "column", gap: 14, boxShadow: "0 20px 50px rgba(0,0,0,0.3)" }}>
            <h3 style={{ color: "#1f2937", fontSize: 16, fontWeight: 800, margin: 0 }}>➕ Criar novo grupo</h3>
            <p style={{ color: "#6b7280", fontSize: 12, margin: "-8px 0 4px" }}>O grupo vai começar com TODAS as permissões bloqueadas. Você ativa o que quiser depois de criar.</p>
            <div>
              <label style={labelStyle}>Nome *</label>
              <input value={formCriar.nome} onChange={e => setFormCriar({ ...formCriar, nome: e.target.value })}
                placeholder="Ex: Coordenador, Estagiário, Junior..." style={inputStyle} autoFocus />
            </div>
            <div>
              <label style={labelStyle}>Descrição</label>
              <input value={formCriar.descricao} onChange={e => setFormCriar({ ...formCriar, descricao: e.target.value })}
                placeholder="Pra que serve esse cargo no sistema" style={inputStyle} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label style={labelStyle}>Cor</label>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {CORES_DISPONIVEIS.map(c => (
                    <button key={c} onClick={() => setFormCriar({ ...formCriar, cor: c })}
                      style={{ width: 26, height: 26, borderRadius: 8, background: c, border: formCriar.cor === c ? "3px solid #1f2937" : "1px solid #e5e7eb", cursor: "pointer" }} />
                  ))}
                </div>
              </div>
              <div>
                <label style={labelStyle}>Ícone</label>
                <input value={formCriar.icone} onChange={e => setFormCriar({ ...formCriar, icone: e.target.value })}
                  style={{ ...inputStyle, textAlign: "center", fontSize: 18 }} maxLength={2} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 6 }}>
              <button onClick={() => setShowCriar(false)}
                style={{ background: "#ffffff", color: "#6b7280", border: "1px solid #e5e7eb", borderRadius: 10, padding: "9px 18px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Cancelar</button>
              <button onClick={criarGrupo}
                style={{ background: "linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)", color: "white", border: "none", borderRadius: 10, padding: "9px 22px", fontSize: 12, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 12px rgba(37,99,235,0.3)" }}>
                ➕ Criar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Botões toggle (✅/❌) ───
function ToggleBotoes({ valor, onChange, disabled }: { valor: "on" | "off"; onChange: (v: "on" | "off") => void; disabled?: boolean }) {
  return (
    <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
      <button onClick={() => !disabled && onChange("off")} disabled={disabled}
        title="Sem acesso"
        style={{
          padding: "5px 11px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer",
          background: valor === "off" ? "#fef2f2" : "#ffffff",
          color: valor === "off" ? "#dc2626" : "#9ca3af",
          border: `2px solid ${valor === "off" ? "#dc2626" : "#e5e7eb"}`,
          opacity: disabled ? 0.5 : 1,
        }}>❌</button>
      <button onClick={() => !disabled && onChange("on")} disabled={disabled}
        title="Liberado"
        style={{
          padding: "5px 11px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer",
          background: valor === "on" ? "#f0fdf4" : "#ffffff",
          color: valor === "on" ? "#16a34a" : "#9ca3af",
          border: `2px solid ${valor === "on" ? "#16a34a" : "#e5e7eb"}`,
          opacity: disabled ? 0.5 : 1,
        }}>✅</button>
    </div>
  );
}

// ─── Botões escopo (❌/👤/👥/🌐) ───
function EscopoBotoes({ valor, onChange, disabled }: { valor: "none" | "own" | "team" | "all"; onChange: (v: "none" | "own" | "team" | "all") => void; disabled?: boolean }) {
  const opts: { v: "none" | "own" | "team" | "all"; icone: string; label: string; cor: string; bg: string }[] = [
    { v: "none", icone: "❌", label: "Sem acesso",  cor: "#dc2626", bg: "#fef2f2" },
    { v: "own",  icone: "👤", label: "Próprios",    cor: "#2563eb", bg: "#eff6ff" },
    { v: "team", icone: "👥", label: "Da equipe",   cor: "#7c3aed", bg: "#f5f3ff" },
    { v: "all",  icone: "🌐", label: "Sistema todo", cor: "#16a34a", bg: "#f0fdf4" },
  ];
  return (
    <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
      {opts.map(o => {
        const at = valor === o.v;
        return (
          <button key={o.v} onClick={() => !disabled && onChange(o.v)} disabled={disabled}
            title={o.label}
            style={{
              padding: "5px 8px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer",
              background: at ? o.bg : "#ffffff",
              color: at ? o.cor : "#9ca3af",
              border: `2px solid ${at ? o.cor : "#e5e7eb"}`,
              opacity: disabled ? 0.5 : 1,
            }}>{o.icone}</button>
        );
      })}
    </div>
  );
}