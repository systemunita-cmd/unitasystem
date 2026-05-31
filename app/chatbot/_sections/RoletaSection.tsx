"use client";
import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { usePermissao } from "../../hooks/usePermissao";
import { useTemPermissao } from "../../hooks/useTemPermissao";

// ═══════════════════════════════════════════════════════════════════════
// 🎯 ROLETA DE DISTRIBUIÇÃO — UnitaSystem (single-tenant)
// ───────────────────────────────────────────────────────────────────────
// Distribui novos leads automaticamente entre atendentes selecionados.
// Single-tenant: única configuração com id=1 (singleton).
//
// 🔒 Usuário restrito (Diretor/escopo team) fica TRAVADO na própria equipe:
//    o dropdown de equipe some e só lista atendentes da equipe dele.
//    Admin Geral / Super Admin escolhe qualquer equipe.
//
// Tabelas esperadas:
//   `usuarios` (id, nome, email, role, fila, equipe_id, ativo)
//   `roleta_config` (id PK, ativa, tipo, usuarios JSON, proximo_index,
//                    respeitar_fila, apenas_horario_comercial,
//                    horario_inicio, horario_fim)
//   `equipes` (id, nome, ativo)
// ═══════════════════════════════════════════════════════════════════════

type Usuario = { nome: string; email: string; role: string; fila?: string; equipe_id?: number | null };
type Equipe = { id: number; nome: string };

type RoletaConfig = {
  id?: number;
  ativa: boolean;
  tipo: "balanceada" | "ranqueada" | "aleatoria";
  usuarios: string[];
  proximo_index: number;
  respeitar_fila: boolean;
  apenas_horario_comercial: boolean;
  horario_inicio: string;
  horario_fim: string;
};

const CONFIG_PADRAO: RoletaConfig = {
  id: 1,
  ativa: false,
  tipo: "balanceada",
  usuarios: [],
  proximo_index: 0,
  respeitar_fila: false,
  apenas_horario_comercial: false,
  horario_inicio: "09:00",
  horario_fim: "18:00",
};

export function RoletaSection() {
  // 🛡️ Sistema novo de permissões
  const perm = useTemPermissao();
  const escopoAcessar = perm.escopo("roleta.acessar");
  const novoPodeCrud = perm.tem("roleta.configurar") || perm.escopo("roleta.configurar") !== "none";
  const podeAcessar = perm.superAdmin || escopoAcessar !== "none";

  // 🔒 Trava por equipe (Diretor/escopo team)
  const ehAdminGeralRol = perm.superAdmin || perm.grupoNome === "Administração Geral";
  const equipeForcadaRol = (!perm.carregando && !ehAdminGeralRol && perm.equipeId != null) ? String(perm.equipeId) : null;
  const travadoEquipe = equipeForcadaRol !== null;

  const { isDono, permissoes } = usePermissao();
  const [config, setConfig] = useState<RoletaConfig>(CONFIG_PADRAO);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [equipes, setEquipes] = useState<Equipe[]>([]);
  const [filtroEquipeUsuarios, setFiltroEquipeUsuarios] = useState<string>("todas");
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  const podeGerenciar = isDono || permissoes.roleta_gerenciar;

  const nomeEquipeForcada = equipes.find(e => String(e.id) === equipeForcadaRol)?.nome || "Minha equipe";

  const cardStyle = {
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

  const fetchTudo = async () => {
    setLoading(true);

    const { data: users } = await supabase.from("usuarios").select("nome, email, role, fila, equipe_id").eq("ativo", true);
    setUsuarios(users || []);

    const { data: eqs } = await supabase.from("equipes").select("id, nome").eq("ativo", true).order("nome", { ascending: true });
    setEquipes((eqs as Equipe[]) || []);

    const { data: cfg } = await supabase.from("roleta_config").select("*").eq("id", 1).maybeSingle();
    if (cfg) {
      setConfig({
        ...CONFIG_PADRAO,
        ...cfg,
        usuarios: Array.isArray(cfg.usuarios) ? cfg.usuarios : [],
      });
    } else {
      setConfig({ ...CONFIG_PADRAO });
    }
    setLoading(false);
  };

  useEffect(() => { fetchTudo(); }, []);

  // 🔒 Força o filtro de atendentes pra equipe do usuário restrito
  useEffect(() => {
    if (travadoEquipe && equipeForcadaRol) setFiltroEquipeUsuarios(equipeForcadaRol);
  }, [travadoEquipe, equipeForcadaRol]);

  const salvar = async () => {
    setSalvando(true);
    try {
      const { error } = await supabase.from("roleta_config").upsert(
        {
          id: 1,
          ativa: config.ativa,
          tipo: config.tipo,
          usuarios: config.usuarios,
          respeitar_fila: config.respeitar_fila,
          apenas_horario_comercial: config.apenas_horario_comercial,
          horario_inicio: config.horario_inicio,
          horario_fim: config.horario_fim,
        },
        { onConflict: "id" }
      );
      if (error) throw error;
      alert("✅ Configuração da roleta salva!");
    } catch (e: any) {
      alert("❌ Erro: " + e.message);
    }
    setSalvando(false);
  };

  const toggleUsuario = (email: string) => {
    setConfig(c => ({
      ...c,
      usuarios: c.usuarios.includes(email) ? c.usuarios.filter(e => e !== email) : [...c.usuarios, email],
    }));
  };

  const resetarContador = async () => {
    if (!confirm("Resetar o contador da roleta? O próximo lead irá pro primeiro atendente da lista.")) return;
    await supabase.from("roleta_config").update({ proximo_index: 0 }).eq("id", 1);
    alert("✅ Contador resetado!");
    fetchTudo();
  };

  const equipeNomeDe = (equipeId?: number | null): string => {
    if (!equipeId) return "";
    return equipes.find(e => e.id === equipeId)?.nome || "";
  };

  // 🔒 Restrito: só enxerga atendentes da própria equipe
  const usuariosVisiveis = usuarios.filter(u => {
    if (travadoEquipe) return String(u.equipe_id || "") === equipeForcadaRol;
    return filtroEquipeUsuarios === "todas" || String(u.equipe_id || "") === filtroEquipeUsuarios;
  });

  if (!podeGerenciar) {
    return (
      <div style={{ padding: 32, background: "#f8fafc", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ ...cardStyle, padding: 48, textAlign: "center", maxWidth: 480 }}>
          <div style={{
            width: 80, height: 80, borderRadius: 20,
            background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 40, margin: "0 auto 16px",
            boxShadow: "0 12px 24px rgba(239,68,68,0.25)",
          }}>
            <span style={{ filter: "saturate(0) brightness(2)" }}>🔒</span>
          </div>
          <h2 style={{ color: "#1f2937", fontSize: 18, fontWeight: 700, margin: "0 0 8px" }}>Sem permissão</h2>
          <p style={{ color: "#6b7280", fontSize: 13, margin: 0, lineHeight: 1.5 }}>Apenas administradores ou usuários com permissão "Gerenciar roleta" podem acessar.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: "center", background: "#f8fafc", minHeight: "100vh" }}>
        <p style={{ color: "#6b7280" }}>Carregando...</p>
      </div>
    );
  }

  const usuariosSelecionados = usuarios.filter(u => config.usuarios.includes(u.email));


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
    <div style={{ padding: 32, display: "flex", flexDirection: "column", gap: 24, height: "100vh", overflowY: "auto", boxSizing: "border-box", background: "#f8fafc" }}>

      {/* HEADER */}
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{
          width: 48, height: 48, borderRadius: 14,
          background: "linear-gradient(135deg, #ec4899 0%, #f43f5e 100%)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 24, boxShadow: "0 8px 20px rgba(236,72,153,0.25)",
        }}>
          <span style={{ filter: "saturate(0) brightness(2)" }}>🎯</span>
        </div>
        <div>
          <h1 style={{ color: "#1f2937", fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: -0.3 }}>Roleta de Distribuição</h1>
          <p style={{ color: "#6b7280", fontSize: 13, margin: "2px 0 0", maxWidth: 720, lineHeight: 1.5 }}>
            Distribui novos leads automaticamente entre os atendentes. O supervisor não precisa ficar dizendo "fulano pega esse lead aí".
            {travadoEquipe && <> · <b style={{ color: "#7c3aed" }}>👥 {nomeEquipeForcada}</b></>}
          </p>
        </div>
      </div>

      {/* CARD ATIVAÇÃO */}
      <div style={{
        ...cardStyle,
        background: config.ativa ? "#f0fdf4" : "#ffffff",
        border: `1px solid ${config.ativa ? "#bbf7d0" : "#e5e7eb"}`,
        borderLeft: `4px solid ${config.ativa ? "#16a34a" : "#d1d5db"}`,
        padding: 22, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: config.ativa ? "#16a34a15" : "#f3f4f6",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20,
            border: `1px solid ${config.ativa ? "#16a34a40" : "#e5e7eb"}`,
          }}>
            {config.ativa ? "🟢" : "⚫"}
          </div>
          <div>
            <p style={{ color: "#1f2937", fontSize: 16, fontWeight: 700, margin: 0 }}>
              {config.ativa ? "Roleta ATIVA" : "Roleta desativada"}
            </p>
            <p style={{ color: "#6b7280", fontSize: 12, margin: "3px 0 0" }}>
              {config.ativa
                ? `Cada novo lead será atribuído automaticamente a um dos ${config.usuarios.length} atendente(s) selecionado(s)`
                : "Leads entrantes ficam pendentes até que alguém os pegue manualmente"}
            </p>
          </div>
        </div>
        <button onClick={() => setConfig(c => ({ ...c, ativa: !c.ativa }))}
          style={{ width: 56, height: 30, background: config.ativa ? "#16a34a" : "#d1d5db", borderRadius: 15, cursor: "pointer", border: "none", position: "relative", flexShrink: 0, transition: "background 0.2s", boxShadow: "inset 0 1px 3px rgba(0,0,0,0.1)" }}>
          <div style={{ width: 24, height: 24, background: "white", borderRadius: "50%", position: "absolute", top: 3, left: config.ativa ? 29 : 3, transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
        </button>
      </div>

      {/* TIPO DE DISTRIBUIÇÃO */}
      <div style={{ ...cardStyle, padding: 22 }}>
        <h3 style={{ color: "#1f2937", fontSize: 14, fontWeight: 700, margin: "0 0 14px", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 32, height: 32, borderRadius: 8, background: "#8b5cf615", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>🎲</span>
          Lógica de distribuição
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
          {[
            { key: "balanceada", titulo: "⚖️ Balanceada", desc: "Vai na ordem da lista, um por um (round-robin). Ex: Ana, João, Maria, Ana, João, Maria...", cor: "#2563eb" },
            { key: "ranqueada", titulo: "📊 Ranqueada", desc: "Manda pro atendente com MENOS conversas ativas. Quem tá mais livre recebe.", cor: "#16a34a" },
            { key: "aleatoria", titulo: "🎲 Aleatória", desc: "Sorteia um atendente aleatório a cada novo lead.", cor: "#f59e0b" },
          ].map(opt => {
            const ativo = config.tipo === opt.key;
            return (
              <button key={opt.key} onClick={() => setConfig(c => ({ ...c, tipo: opt.key as any }))}
                style={{
                  background: ativo ? `${opt.cor}10` : "#f9fafb",
                  border: `2px solid ${ativo ? opt.cor : "#e5e7eb"}`,
                  borderRadius: 12, padding: 16, cursor: "pointer", textAlign: "left",
                  transition: "all 0.15s",
                  boxShadow: ativo ? `0 4px 12px ${opt.cor}20` : "none",
                }}>
                <p style={{ color: ativo ? opt.cor : "#1f2937", fontSize: 13, fontWeight: 700, margin: "0 0 6px" }}>{opt.titulo}</p>
                <p style={{ color: "#6b7280", fontSize: 11, margin: 0, lineHeight: 1.5 }}>{opt.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* SELEÇÃO DE USUÁRIOS */}
      <div style={{ ...cardStyle, padding: 22 }}>
        <h3 style={{ color: "#1f2937", fontSize: 14, fontWeight: 700, margin: "0 0 6px", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 32, height: 32, borderRadius: 8, background: "#2563eb15", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>👥</span>
          Atendentes na roleta
        </h3>
        <p style={{ color: "#6b7280", fontSize: 12, margin: "0 0 14px", paddingLeft: 40 }}>
          Selecione quem participa da distribuição automática. Usuários offline ainda recebem leads — cabe ao gestor ajustar a lista conforme a escala.
        </p>

        {usuarios.length === 0 ? (
          <div style={{ padding: 20, textAlign: "center", background: "#f9fafb", borderRadius: 10, border: "1px dashed #d1d5db" }}>
            <p style={{ color: "#6b7280", fontSize: 13, margin: 0, fontWeight: 600 }}>Nenhum atendente cadastrado ainda.</p>
            <p style={{ color: "#9ca3af", fontSize: 11, margin: "4px 0 0" }}>Vá em CRM → Configurações → Usuários e adicione os atendentes primeiro.</p>
          </div>
        ) : (
          <div style={{ position: "relative" }}>
            <button onClick={() => setShowDropdown(!showDropdown)}
              style={{ ...inputStyle, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", textAlign: "left", background: "#f9fafb" }}>
              <span style={{ color: config.usuarios.length > 0 ? "#1f2937" : "#9ca3af", fontWeight: config.usuarios.length > 0 ? 600 : 400 }}>
                {config.usuarios.length > 0 ? `✓ ${config.usuarios.length} atendente(s) na roleta` : "Clique pra selecionar atendentes..."}
              </span>
              <span style={{ color: "#9ca3af" }}>{showDropdown ? "▲" : "▼"}</span>
            </button>
            {showDropdown && (
              <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 12, zIndex: 100, marginTop: 6, overflow: "hidden", maxHeight: 380, overflowY: "auto", boxShadow: "0 10px 25px rgba(0,0,0,0.10), 0 4px 10px rgba(0,0,0,0.04)" }}>
                {/* Admin: dropdown de equipe. Restrito: rótulo fixo */}
                {equipes.length > 0 && !travadoEquipe && (
                  <div style={{ padding: "10px 14px", borderBottom: "1px solid #f3f4f6", background: "#fafbfc", display: "flex", alignItems: "center", gap: 8, position: "sticky", top: 0, zIndex: 1 }}>
                    <span style={{ color: "#a855f7", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>👥 Equipe</span>
                    <select value={filtroEquipeUsuarios} onChange={e => setFiltroEquipeUsuarios(e.target.value)}
                      style={{ ...inputStyle, padding: "6px 10px", fontSize: 12, flex: 1, cursor: "pointer" }}>
                      <option value="todas">Todas as equipes</option>
                      {equipes.map(eq => <option key={eq.id} value={String(eq.id)}>{eq.nome}</option>)}
                    </select>
                  </div>
                )}
                {equipes.length > 0 && travadoEquipe && (
                  <div style={{ padding: "10px 14px", borderBottom: "1px solid #f3f4f6", background: "#faf5ff", display: "flex", alignItems: "center", gap: 8, position: "sticky", top: 0, zIndex: 1 }}>
                    <span style={{ color: "#a855f7", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>👥 Equipe</span>
                    <span style={{ color: "#7c3aed", fontSize: 12, fontWeight: 700 }}>{nomeEquipeForcada}</span>
                  </div>
                )}
                {usuariosVisiveis.length === 0 ? (
                  <div style={{ padding: 16, textAlign: "center" }}>
                    <p style={{ color: "#9ca3af", fontSize: 12, margin: 0 }}>Nenhum atendente nessa equipe.</p>
                  </div>
                ) : usuariosVisiveis.map(u => (
                  <label key={u.email}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "11px 14px",
                      cursor: "pointer", borderBottom: "1px solid #f3f4f6",
                      background: config.usuarios.includes(u.email) ? "#f0fdf4" : "transparent",
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={(e) => { if (!config.usuarios.includes(u.email)) e.currentTarget.style.background = "#f9fafb"; }}
                    onMouseLeave={(e) => { if (!config.usuarios.includes(u.email)) e.currentTarget.style.background = "transparent"; }}
                  >
                    <input type="checkbox" checked={config.usuarios.includes(u.email)} onChange={() => toggleUsuario(u.email)} style={{ accentColor: "#16a34a", width: 16, height: 16 }} />
                    <div style={{ flex: 1 }}>
                      <p style={{ color: "#1f2937", fontSize: 13, margin: 0, fontWeight: 600 }}>
                        {u.nome}
                        {equipeNomeDe(u.equipe_id) && <span style={{ marginLeft: 8, background: "#a855f715", color: "#a855f7", fontSize: 10, padding: "1px 7px", borderRadius: 10, fontWeight: 700 }}>👥 {equipeNomeDe(u.equipe_id)}</span>}
                      </p>
                      <p style={{ color: "#9ca3af", fontSize: 11, margin: "2px 0 0" }}>
                        {u.email} · {u.role}{u.fila ? ` · Fila${u.fila.includes(",") ? "s" : ""}: ${u.fila.split(",").map(s => s.trim()).filter(Boolean).join(", ")}` : ""}
                      </p>
                    </div>
                  </label>
                ))}
                <div style={{ padding: 10, display: "flex", gap: 6, background: "#f9fafb", borderTop: "1px solid #e5e7eb" }}>
                  <button onClick={() => setConfig(c => ({ ...c, usuarios: [...new Set([...c.usuarios, ...usuariosVisiveis.map(u => u.email)])] }))}
                    style={{ flex: 1, background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0", borderRadius: 8, padding: "7px 12px", fontSize: 11, cursor: "pointer", fontWeight: 700 }}>
                    {(!travadoEquipe && filtroEquipeUsuarios === "todas") ? "Selecionar todos" : "Selecionar a equipe"}
                  </button>
                  <button onClick={() => { const vis = new Set(usuariosVisiveis.map(u => u.email)); setConfig(c => ({ ...c, usuarios: c.usuarios.filter(e => !vis.has(e)) })); }}
                    style={{ flex: 1, background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", borderRadius: 8, padding: "7px 12px", fontSize: 11, cursor: "pointer", fontWeight: 700 }}>
                    {(!travadoEquipe && filtroEquipeUsuarios === "todas") ? "Desmarcar todos" : "Desmarcar a equipe"}
                  </button>
                  <button onClick={() => setShowDropdown(false)}
                    style={{ flex: 1, background: "#ffffff", color: "#6b7280", border: "1px solid #e5e7eb", borderRadius: 8, padding: "7px 12px", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>
                    Fechar
                  </button>
                </div>
              </div>
            )}
            {usuariosSelecionados.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
                {usuariosSelecionados.map(u => (
                  <span key={u.email}
                    style={{
                      background: "#f0fdf4", color: "#16a34a",
                      fontSize: 11, padding: "5px 12px", borderRadius: 20,
                      border: "1px solid #bbf7d0",
                      display: "flex", alignItems: "center", gap: 6, fontWeight: 600,
                    }}>
                    ✓ {u.nome}
                    <button onClick={() => toggleUsuario(u.email)}
                      style={{ background: "none", border: "none", color: "#16a34a", cursor: "pointer", padding: 0, fontSize: 14, fontWeight: 700, lineHeight: 1 }}>×</button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* FILTROS AVANÇADOS */}
      <div style={{ ...cardStyle, padding: 22 }}>
        <h3 style={{ color: "#1f2937", fontSize: 14, fontWeight: 700, margin: "0 0 16px", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 32, height: 32, borderRadius: 8, background: "#f59e0b15", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>⚙️</span>
          Filtros avançados
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{
            display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
            background: config.respeitar_fila ? "#f0fdf4" : "#f9fafb",
            borderRadius: 12, cursor: "pointer",
            border: `1px solid ${config.respeitar_fila ? "#bbf7d0" : "#e5e7eb"}`,
          }}>
            <input type="checkbox" checked={config.respeitar_fila} onChange={e => setConfig(c => ({ ...c, respeitar_fila: e.target.checked }))} style={{ accentColor: "#16a34a", width: 16, height: 16 }} />
            <div style={{ flex: 1 }}>
              <p style={{ color: "#1f2937", fontSize: 13, fontWeight: 700, margin: 0 }}>Respeitar fila do lead</p>
              <p style={{ color: "#6b7280", fontSize: 11, margin: "3px 0 0" }}>
                Se ativado, só distribui o lead pros atendentes que estão na MESMA fila dele (ex: lead de Vendas só vai pra atendente de Vendas).
              </p>
            </div>
          </label>

          <label style={{
            display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
            background: config.apenas_horario_comercial ? "#f0fdf4" : "#f9fafb",
            borderRadius: 12, cursor: "pointer",
            border: `1px solid ${config.apenas_horario_comercial ? "#bbf7d0" : "#e5e7eb"}`,
          }}>
            <input type="checkbox" checked={config.apenas_horario_comercial} onChange={e => setConfig(c => ({ ...c, apenas_horario_comercial: e.target.checked }))} style={{ accentColor: "#16a34a", width: 16, height: 16 }} />
            <div style={{ flex: 1 }}>
              <p style={{ color: "#1f2937", fontSize: 13, fontWeight: 700, margin: 0 }}>Distribuir apenas em horário comercial</p>
              <p style={{ color: "#6b7280", fontSize: 11, margin: "3px 0 0" }}>
                Fora do horário, leads ficam pendentes pra serem pegos manualmente depois.
              </p>
            </div>
          </label>

          {config.apenas_horario_comercial && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginLeft: 28, padding: 14, background: "#f9fafb", borderRadius: 12, border: "1px solid #e5e7eb" }}>
              <div>
                <label style={{ color: "#6b7280", fontSize: 11, display: "block", marginBottom: 6, textTransform: "uppercase", fontWeight: 700, letterSpacing: 0.5 }}>Início</label>
                <input type="time" value={config.horario_inicio} onChange={e => setConfig(c => ({ ...c, horario_inicio: e.target.value }))} style={{ ...inputStyle, colorScheme: "light" }} />
              </div>
              <div>
                <label style={{ color: "#6b7280", fontSize: 11, display: "block", marginBottom: 6, textTransform: "uppercase", fontWeight: 700, letterSpacing: 0.5 }}>Fim</label>
                <input type="time" value={config.horario_fim} onChange={e => setConfig(c => ({ ...c, horario_fim: e.target.value }))} style={{ ...inputStyle, colorScheme: "light" }} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* STATUS E CONTADOR */}
      {config.tipo === "balanceada" && config.usuarios.length > 0 && (
        <div style={{
          background: "#eff6ff",
          border: "1px solid #bfdbfe",
          borderLeft: "4px solid #2563eb",
          borderRadius: 12,
          padding: 16,
          display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: "#2563eb15", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>📍</div>
            <div>
              <p style={{ color: "#1e40af", fontSize: 13, margin: 0, fontWeight: 700 }}>
                Próximo atendente: {usuarios.find(u => u.email === config.usuarios[config.proximo_index % config.usuarios.length])?.nome || "—"}
              </p>
              <p style={{ color: "#2563eb", fontSize: 11, margin: "3px 0 0" }}>
                Índice atual: {config.proximo_index} (posição {config.proximo_index % config.usuarios.length + 1} de {config.usuarios.length})
              </p>
            </div>
          </div>
          <button onClick={resetarContador}
            style={{
              background: "#fffbeb", color: "#f59e0b",
              border: "1px solid #fde68a", borderRadius: 10,
              padding: "7px 14px", fontSize: 12, cursor: "pointer", fontWeight: 700,
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = "#fef3c7"}
            onMouseLeave={(e) => e.currentTarget.style.background = "#fffbeb"}>
            🔄 Resetar
          </button>
        </div>
      )}

      {/* BOTÃO SALVAR */}
      <button onClick={salvar} disabled={salvando}
        style={{
          background: salvando ? "#15803d" : "linear-gradient(135deg, #16a34a 0%, #22c55e 100%)",
          color: "white", border: "none", borderRadius: 12,
          padding: "14px", fontSize: 14,
          cursor: salvando ? "not-allowed" : "pointer", fontWeight: 700,
          alignSelf: "flex-end", minWidth: 240,
          boxShadow: "0 4px 12px rgba(22,163,74,0.3)",
        }}>
        {salvando ? "⏳ Salvando..." : "💾 Salvar configurações"}
      </button>
    </div>
  );
}