"use client";
import { useState, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { isSuperAdmin as ehSuperAdminMaster } from "../../lib/superAdmin";
import GruposPermissaoSection from "../../components/GruposPermissaoSection";
import { usePermissao } from "../../hooks/usePermissao";
import { useTemPermissao } from "../../hooks/useTemPermissao";

// ═══════════════════════════════════════════════════════════════════════
// ⚙️ CONFIGURAÇÕES — UnitaSystem (single-tenant, premium)
// ───────────────────────────────────────────────────────────────────────
// 5 abas em tabs visuais: Usuários · Equipes · Filas · Permissões · Geral
// 🆕 v3: Dropdown de FILA dependente da equipe (fila_id FK)
// Estado da aba persistido em ?tab=... pra navegação direta
// Real-time em tudo, busca por aba, modo demo robusto
// ═══════════════════════════════════════════════════════════════════════

type Usuario = {
  id?: number;
  auth_user_id?: string;
  email: string;
  nome: string;
  role: "admin" | "supervisor" | "atendente";
  equipe_id?: number | null;
  fila_id?: number | null; // 🆕 v3 — fila de atendimento (1 por usuário, depende da equipe)
  ativo?: boolean;
  primeiro_acesso?: boolean;
  ramal?: string | null;
  telefone?: string | null;
  grupo_id?: number | null;
  created_at?: string;
};

type Equipe = {
  id: number;
  nome: string;
  cor: string;
  icone: string;
  descricao: string | null;
  ativo: boolean;
  created_at?: string;
};

type Fila = {
  id: number;
  nome: string;
  cor: string;
  icone: string;
  descricao: string | null;
  equipe_id: number | null;
  ativo: boolean;
  created_at?: string;
};

type GrupoPermissao = {
  id: number;
  nome: string;
  descricao: string;
  permissoes: Record<string, boolean>;
};

type Aba = "usuarios" | "equipes" | "filas" | "permissoes" | "geral";

const CATEGORIAS_PERMISSAO = [
  { nome: "💬 Atendimento", cor: "#3b82f6", permissoes: [
    { key: "chat_proprio", label: "Ver próprios atendimentos" },
    { key: "chat_todos", label: "Ver todos atendimentos" },
    { key: "chat_interno", label: "Chat interno (conversar c/ equipe)" },
    { key: "respostas_rapidas", label: "Usar respostas rápidas" },
    { key: "transferir_chat", label: "Transferir conversas" },
    { key: "finalizar_chat", label: "Finalizar atendimentos" },
  ]},
  { nome: "🏷️ Contatos & Etiquetas", cor: "#06b6d4", permissoes: [
    { key: "contatos_ver", label: "Ver contatos" },
    { key: "contatos_editar", label: "Editar cadastro de contatos" },
    { key: "etiquetas", label: "Gerenciar etiquetas" },
  ]},
  { nome: "💰 Vendas & CRM", cor: "#f59e0b", permissoes: [
    { key: "dashboard", label: "Dashboard de atendimentos" },
    { key: "vendas_proprio", label: "Ver próprias vendas" },
    { key: "vendas_equipe", label: "Ver vendas da equipe" },
    { key: "funil", label: "Ver funil de vendas" },
    { key: "proposta_criar", label: "Criar propostas" },
    { key: "editor_proposta", label: "Editar campos da proposta" },
  ]},
  { nome: "📤 Marketing & Disparos", cor: "#ec4899", permissoes: [
    { key: "disparo_enviar", label: "Enviar disparos em massa" },
    { key: "templates_waba", label: "Gerenciar templates WABA" },
  ]},
  { nome: "📞 Telefonia VOIP", cor: "#16a34a", permissoes: [
    { key: "voip_usar", label: "Usar softphone (fazer ligações)" },
    { key: "voip_conexoes", label: "Gerenciar conexões VOIP" },
    { key: "voip_campanhas", label: "Criar campanhas VOIP" },
  ]},
  { nome: "⚙️ Administração", cor: "#dc2626", permissoes: [
    { key: "conexoes", label: "Gerenciar conexões WhatsApp" },
    { key: "filas", label: "Gerenciar filas" },
    { key: "usuarios_gerenciar", label: "Gerenciar usuários" },
    { key: "grupos_permissao", label: "Gerenciar grupos de permissão" },
    { key: "configuracoes_sistema", label: "Configurações do sistema" },
  ]},
  { nome: "📊 Relatórios", cor: "#8b5cf6", permissoes: [
    { key: "relatorios", label: "Relatórios de atendimento" },
    { key: "relatorios_voip", label: "Relatórios de telefonia" },
  ]},
  { nome: "👤 Pessoal", cor: "#6b7280", permissoes: [
    { key: "config_proprio", label: "Editar próprio perfil" },
  ]},
];

const TODAS_PERMISSOES = CATEGORIAS_PERMISSAO.flatMap(c => c.permissoes);
const PERMISSOES_PADRAO: Record<string, boolean> = TODAS_PERMISSOES.reduce((acc, p) => { acc[p.key] = false; return acc; }, {} as Record<string, boolean>);
const LABELS_MAP: Record<string, string> = TODAS_PERMISSOES.reduce((acc, p) => { acc[p.key] = p.label; return acc; }, {} as Record<string, string>);

const CORES_DISPONIVEIS = ["#2563eb", "#3b82f6", "#8b5cf6", "#a855f7", "#ec4899", "#dc2626", "#f59e0b", "#16a34a", "#06b6d4", "#6366f1", "#0ea5e9", "#14b8a6"];
const ICONES_EQUIPE = ["👥", "🚀", "⚡", "🎯", "💼", "🏢", "🌐", "📞", "💰", "🛠️", "🎨", "📊"];
const ICONES_FILA = ["🎯", "📞", "💬", "🛠️", "💰", "🌐", "📋", "🔔", "🚀", "⚡", "📨", "🎫"];

const initialsFromName = (nome: string) =>
  nome.split(" ").filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase() || "").join("") || "?";

const corHashFromString = (s: string) => {
  const cores = ["#2563eb", "#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#16a34a", "#06b6d4", "#6366f1"];
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return cores[Math.abs(h) % cores.length];
};

export default function Configuracoes() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isDono, isSuperAdmin, perfil, permissoes } = usePermissao();
  // 🛡️ Sistema novo de permissões
  const perm = useTemPermissao();
  const escopoVerUsuarios   = perm.escopo("cfg_usuarios.ver");
  const escopoCriarUsuarios = perm.escopo("cfg_usuarios.criar");
  const escopoEditarUsr     = perm.escopo("cfg_usuarios.editar");
  const escopoExcluirUsr    = perm.escopo("cfg_usuarios.excluir");
  const novoPodeMudarGrupo  = perm.tem("cfg_usuarios.mudar_grupo");
  const escopoVerEquipes    = perm.escopo("cfg_equipes.ver");
  const escopoEditarEquipes = perm.escopo("cfg_equipes.editar");
  const novoPodeCriarEquipe = perm.tem("cfg_equipes.criar");
  const novoPodeExcluirEquipe = perm.tem("cfg_equipes.excluir");
  const escopoFilas         = perm.escopo("cfg_filas.gerenciar");
  const novoPodeVerGrupos   = perm.tem("cfg_grupos.ver");
  const novoPodeCrudGrupos  = perm.tem("cfg_grupos.crud");
  const novoPodeConfigGeral = perm.tem("cfg_geral.acessar");

  // Variáveis combinadas (antigo OR novo)
  const podeGerenciarUsuarios = isDono || isSuperAdmin || perm.superAdmin || perfil === "Administrador"
    || !!permissoes?.usuarios_gerenciar
    || escopoVerUsuarios !== "none";
  const podeGerenciarFilas = isDono || isSuperAdmin || perm.superAdmin || perfil === "Administrador"
    || !!permissoes?.filas
    || escopoFilas !== "none";
  const podeGerenciarGrupos = isDono || isSuperAdmin || perm.superAdmin || perfil === "Administrador"
    || !!permissoes?.grupos_permissao
    || novoPodeVerGrupos || novoPodeCrudGrupos;
  const podeConfigSistema = isDono || isSuperAdmin || perm.superAdmin || perfil === "Administrador"
    || !!permissoes?.configuracoes_sistema
    || novoPodeConfigGeral;
  const algumaPermissao = podeGerenciarUsuarios || podeGerenciarFilas || podeGerenciarGrupos || podeConfigSistema;

  // ═══ Aba atual (persistida em URL) ═══
  const abaUrl = (searchParams.get("tab") as Aba) || "usuarios";
  const [abaAtiva, setAbaAtiva] = useState<Aba>(abaUrl);
  const trocarAba = (a: Aba) => {
    setAbaAtiva(a);
    const sp = new URLSearchParams(searchParams.toString());
    sp.set("tab", a);
    router.replace(`/crm/configuracoes?${sp.toString()}`);
  };

  // ═══ Estados ═══
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [equipes, setEquipes] = useState<Equipe[]>([]);
  const [filas, setFilas] = useState<Fila[]>([]);
  const [gruposPermissao, setGruposPermissao] = useState<GrupoPermissao[]>([]);
  const [loadingInicial, setLoadingInicial] = useState(true);
  const [tabelasFaltando, setTabelasFaltando] = useState<string[]>([]);

  // Mobile
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // ═══ Estilos ═══
  const IS = {
    width: "100%", background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 10,
    padding: "10px 14px", color: "#1f2937", fontSize: 14, boxSizing: "border-box" as const,
    outline: "none", transition: "border-color 0.15s, box-shadow 0.15s",
  };
  const cardStyle = {
    background: "#ffffff", borderRadius: 14, border: "1px solid #e5e7eb",
    boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
  };
  const labelStyle = {
    color: "#6b7280", fontSize: 11, fontWeight: 700,
    textTransform: "uppercase" as const, letterSpacing: 0.5,
    display: "block" as const, marginBottom: 6,
  };

  // ═══ FETCHES ═══
  const fetchUsuarios = async () => {
    const { data, error } = await supabase.from("usuarios").select("*").order("created_at", { ascending: false });
    if (error?.code === "PGRST205") { setTabelasFaltando(p => p.includes("usuarios") ? p : [...p, "usuarios"]); return; }
    if (data) setUsuarios(data);
  };
  const fetchEquipes = async () => {
    const { data, error } = await supabase.from("equipes").select("*").eq("ativo", true).order("nome", { ascending: true });
    if (error?.code === "PGRST205") { setTabelasFaltando(p => p.includes("equipes") ? p : [...p, "equipes"]); return; }
    if (data) setEquipes(data);
  };
  const fetchFilas = async () => {
    const { data, error } = await supabase.from("filas").select("*").eq("ativo", true).order("nome", { ascending: true });
    if (error?.code === "PGRST205") { setTabelasFaltando(p => p.includes("filas") ? p : [...p, "filas"]); return; }
    if (data) setFilas(data);
  };
  const fetchGrupos = async () => {
    const { data, error } = await supabase.from("grupos_permissao").select("*").order("created_at", { ascending: false });
    if (error?.code === "PGRST205") { setTabelasFaltando(p => p.includes("grupos_permissao") ? p : [...p, "grupos_permissao"]); return; }
    if (data) setGruposPermissao(data);
  };

  // Init
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/"); return; }
      await Promise.all([fetchUsuarios(), fetchEquipes(), fetchFilas(), fetchGrupos()]);
      setLoadingInicial(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Real-time
  useEffect(() => {
    const ch = supabase.channel("config_rt_unita")
      .on("postgres_changes", { event: "*", schema: "public", table: "usuarios" }, fetchUsuarios)
      .on("postgres_changes", { event: "*", schema: "public", table: "equipes" }, fetchEquipes)
      .on("postgres_changes", { event: "*", schema: "public", table: "filas" }, fetchFilas)
      .on("postgres_changes", { event: "*", schema: "public", table: "grupos_permissao" }, fetchGrupos)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  // ═══ HELPERS DE LOOKUP ═══
  const equipeById = useMemo(() => {
    const m = new Map<number, Equipe>();
    equipes.forEach(e => m.set(e.id, e));
    return m;
  }, [equipes]);

  const usuariosPorEquipe = useMemo(() => {
    const m = new Map<number, number>();
    usuarios.forEach(u => {
      if (u.equipe_id) m.set(u.equipe_id, (m.get(u.equipe_id) || 0) + 1);
    });
    return m;
  }, [usuarios]);

  const filasPorEquipe = useMemo(() => {
    const m = new Map<number, number>();
    filas.forEach(f => {
      if (f.equipe_id) m.set(f.equipe_id, (m.get(f.equipe_id) || 0) + 1);
    });
    return m;
  }, [filas]);

  // ═══ ABAS DEFINIDAS ═══
  const abas: { id: Aba; nome: string; icone: string; cor: string; count: number; podeVer: boolean }[] = [
    { id: "usuarios",   nome: "Usuários",   icone: "👥", cor: "#2563eb", count: usuarios.length,        podeVer: podeGerenciarUsuarios },
    { id: "equipes",    nome: "Equipes",    icone: "🏢", cor: "#a855f7", count: equipes.length,         podeVer: podeGerenciarUsuarios },
    { id: "filas",      nome: "Filas",      icone: "📋", cor: "#06b6d4", count: filas.length,           podeVer: podeGerenciarFilas },
    { id: "permissoes", nome: "Permissões", icone: "🔐", cor: "#8b5cf6", count: gruposPermissao.length, podeVer: podeGerenciarGrupos },
    { id: "geral",      nome: "Geral",      icone: "⚙️", cor: "#f59e0b", count: 0,                      podeVer: podeConfigSistema },
  ];
  const abasVisiveis = abas.filter(a => a.podeVer);
  if (abaAtiva && !abasVisiveis.some(a => a.id === abaAtiva) && abasVisiveis.length > 0) {
    setTimeout(() => setAbaAtiva(abasVisiveis[0].id), 0);
  }

  // ═══ Sem permissão ═══
  if (!algumaPermissao && !loadingInicial) {
    return (
      <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
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
          <h1 style={{ color: "#1f2937", fontSize: 18, fontWeight: 700, margin: "0 0 8px" }}>Acesso restrito</h1>
          <p style={{ color: "#6b7280", fontSize: 13, margin: "0 0 22px", lineHeight: 1.5 }}>
            Você não tem permissão para acessar as configurações do sistema. Fale com um administrador.
          </p>
          <button onClick={() => router.back()}
            style={{
              background: "linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)",
              color: "white", border: "none", borderRadius: 12,
              padding: "11px 24px", fontSize: 13, fontWeight: 700, cursor: "pointer",
              boxShadow: "0 4px 12px rgba(37,99,235,0.3)",
            }}>← Voltar</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 16 : 22 }}>

      {/* ═══ HEADER ═══ */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div style={{
          width: 52, height: 52, borderRadius: 14,
          background: "linear-gradient(135deg, #2563eb 0%, #3b82f6 50%, #4f46e5 100%)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 26, boxShadow: "0 8px 20px rgba(37,99,235,0.30)",
          flexShrink: 0,
        }}>
          <span style={{ filter: "saturate(0) brightness(2)" }}>⚙️</span>
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h1 style={{ color: "#1f2937", fontSize: isMobile ? 20 : 24, fontWeight: 700, margin: 0, letterSpacing: -0.3 }}>Configurações do Sistema</h1>
          <p style={{ color: "#6b7280", fontSize: 12, margin: "3px 0 0" }}>
            UnitaSystem · <b style={{ color: "#2563eb" }}>Grupo Unita</b> · Gerenciamento completo
          </p>
        </div>
      </div>

      {/* Banner de tabelas faltando */}
      {tabelasFaltando.length > 0 && (
        <div style={{
          background: "linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)",
          border: "1px solid #fcd34d",
          borderLeft: "4px solid #f59e0b",
          borderRadius: 12,
          padding: "12px 18px",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}>
          <span style={{ fontSize: 22 }}>⚠️</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ color: "#92400e", fontSize: 13.5, margin: 0, fontWeight: 700 }}>Tabelas não encontradas no Supabase</p>
            <p style={{ color: "#78350f", fontSize: 12, margin: "2px 0 0", lineHeight: 1.4 }}>
              {tabelasFaltando.map(t => <code key={t} style={{ background: "#fef3c7", padding: "1px 6px", borderRadius: 4, fontFamily: "monospace", fontSize: 11.5, marginRight: 4 }}>{t}</code>)}
              {" "} — rode o SQL de setup ou descomente as tabelas faltantes.
            </p>
          </div>
        </div>
      )}

      {/* ═══ TABS ═══ */}
      <div style={{ ...cardStyle, padding: isMobile ? 6 : 8, overflowX: "auto" }}>
        <div style={{ display: "flex", gap: 4, minWidth: "fit-content" }}>
          {abasVisiveis.map(aba => {
            const ativo = abaAtiva === aba.id;
            return (
              <button key={aba.id} onClick={() => trocarAba(aba.id)}
                style={{
                  background: ativo ? `linear-gradient(135deg, ${aba.cor}15, ${aba.cor}08)` : "transparent",
                  color: ativo ? aba.cor : "#6b7280",
                  border: ativo ? `1px solid ${aba.cor}40` : "1px solid transparent",
                  borderRadius: 10,
                  padding: isMobile ? "9px 12px" : "10px 18px",
                  fontSize: isMobile ? 12 : 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  whiteSpace: "nowrap",
                  transition: "all 0.15s",
                  boxShadow: ativo ? `0 2px 8px ${aba.cor}15` : "none",
                }}>
                <span style={{ fontSize: 16 }}>{aba.icone}</span>
                <span>{aba.nome}</span>
                {aba.count > 0 && (
                  <span style={{
                    background: ativo ? aba.cor : "#e5e7eb",
                    color: ativo ? "white" : "#6b7280",
                    fontSize: 10,
                    padding: "1px 7px",
                    borderRadius: 8,
                    fontWeight: 800,
                    minWidth: 18,
                    textAlign: "center",
                  }}>{aba.count}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ═══ CONTEÚDO DA ABA ═══ */}
      {loadingInicial ? (
        <div style={{ ...cardStyle, padding: 48, textAlign: "center", color: "#6b7280" }}>
          ⏳ Carregando configurações...
        </div>
      ) : (
        <>
          {abaAtiva === "usuarios" && (
            <AbaUsuarios
              usuarios={usuarios}
              equipes={equipes}
              filas={filas}
              gruposPermissao={gruposPermissao}
              equipeById={equipeById}
              isMobile={isMobile}
              IS={IS}
              cardStyle={cardStyle}
              labelStyle={labelStyle}
              podeGerenciar={podeGerenciarUsuarios}
              onRefetch={fetchUsuarios}
            />
          )}
          {abaAtiva === "equipes" && (
            <AbaEquipes
              equipes={equipes}
              usuariosPorEquipe={usuariosPorEquipe}
              filasPorEquipe={filasPorEquipe}
              isMobile={isMobile}
              IS={IS}
              cardStyle={cardStyle}
              labelStyle={labelStyle}
              podeGerenciar={podeGerenciarUsuarios}
              onRefetch={async () => { await fetchEquipes(); await fetchUsuarios(); await fetchFilas(); }}
            />
          )}
          {abaAtiva === "filas" && (
            <AbaFilas
              filas={filas}
              equipes={equipes}
              equipeById={equipeById}
              usuarios={usuarios}
              isMobile={isMobile}
              IS={IS}
              cardStyle={cardStyle}
              labelStyle={labelStyle}
              podeGerenciar={podeGerenciarFilas}
              onRefetch={fetchFilas}
            />
          )}
          {abaAtiva === "permissoes" && (
            <GruposPermissaoSection />
          )}
          {abaAtiva === "geral" && (
            <AbaGeral
              isMobile={isMobile}
              IS={IS}
              cardStyle={cardStyle}
              labelStyle={labelStyle}
              podeGerenciar={podeConfigSistema}
            />
          )}
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// 👥 ABA USUÁRIOS — 🆕 v3 com fila dependente de equipe
// ═══════════════════════════════════════════════════════════════════════
// Mapa: nome do grupo → role legado equivalente
function deriveRoleFromGrupo(nomeGrupo: string): "admin" | "supervisor" | "atendente" {
  if (!nomeGrupo) return "atendente";
  const n = nomeGrupo.toLowerCase();
  if (n.includes("administração") || n.includes("administracao") || n === "administrador") return "admin";
  if (n.includes("diretor") || n.includes("gerente") || n.includes("supervisor")) return "supervisor";
  return "atendente";
}

function AbaUsuarios({ usuarios, equipes, filas, gruposPermissao, equipeById, isMobile, IS, cardStyle, labelStyle, podeGerenciar, onRefetch }: any) {
  const [busca, setBusca] = useState("");
  const [filtroRole, setFiltroRole] = useState<"todos" | "admin" | "supervisor" | "atendente">("todos");
  const [filtroEquipe, setFiltroEquipe] = useState<string>("todas");
  const [showForm, setShowForm] = useState(false);
  const [editandoUsuario, setEditandoUsuario] = useState<Usuario | null>(null);
  // 🆕 v3: fila_id (single) que depende da equipe
  const [formUsuario, setFormUsuario] = useState({
    nome: "", email: "", senha: "",
    role: "atendente" as "admin" | "supervisor" | "atendente",
    equipe_id: "", grupo_id: "", ramal: "", telefone: "",
    fila_id: "",
  });
  const [showSenha, setShowSenha] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const usuariosFiltrados = useMemo(() => {
    let l: Usuario[] = usuarios;
    if (busca) {
      const b = busca.toLowerCase();
      l = l.filter((u: Usuario) =>
        u.nome.toLowerCase().includes(b) ||
        u.email.toLowerCase().includes(b)
      );
    }
    if (filtroRole !== "todos") {
      if (filtroRole.startsWith("grupo:")) {
        const gid = parseInt(filtroRole.split(":")[1]);
        l = l.filter((u: Usuario) => u.grupo_id === gid);
      } else {
        l = l.filter((u: Usuario) => u.role === filtroRole);
      }
    }
    if (filtroEquipe !== "todas") {
      if (filtroEquipe === "sem") l = l.filter((u: Usuario) => !u.equipe_id);
      else l = l.filter((u: Usuario) => String(u.equipe_id) === filtroEquipe);
    }
    return l;
  }, [usuarios, busca, filtroRole, filtroEquipe]);

  // 🆕 v3: filtra filas pela equipe (se sem equipe, retorna vazio pra forçar escolha)
  const filasDisponiveis = useMemo(() => {
    if (!formUsuario.equipe_id) return [];
    const eqId = parseInt(formUsuario.equipe_id);
    return filas.filter((f: Fila) => f.equipe_id === eqId);
  }, [filas, formUsuario.equipe_id]);

  const abrirNovo = () => {
    if (!podeGerenciar) { alert("Você não tem permissão pra gerenciar usuários."); return; }
    setEditandoUsuario(null);
    setFormUsuario({ nome: "", email: "", senha: "", role: "atendente", equipe_id: "", grupo_id: "", ramal: "", telefone: "", fila_id: "" });
    setShowForm(true);
  };

  const abrirEditar = (u: Usuario) => {
    // 🛡️ Defesa extra: bloqueia edição do super admin
    if (ehSuperAdminMaster(u.email)) {
      alert("🛡️ Esse usuário é o Super Admin do sistema e seus dados são protegidos.");
      return;
    }
    if (!podeGerenciar) { alert("Você não tem permissão pra gerenciar usuários."); return; }
    setEditandoUsuario(u);
    setFormUsuario({
      nome: u.nome, email: u.email, senha: "",
      role: u.role, equipe_id: u.equipe_id?.toString() || "",
      grupo_id: u.grupo_id?.toString() || "",
      ramal: u.ramal || "", telefone: u.telefone || "",
      fila_id: u.fila_id?.toString() || "", // 🆕 v3
    });
    setShowForm(true);
  };

  const salvarUsuario = async () => {
    if (!formUsuario.nome.trim() || !formUsuario.email.trim()) {
      alert("Preencha nome e e-mail.");
      return;
    }
    setSalvando(true);

    if (editandoUsuario) {
      // ── EDIT ── atualiza só dados não-auth
      const { error } = await supabase.from("usuarios").update({
        nome: formUsuario.nome.trim(),
        role: formUsuario.role,
        equipe_id: formUsuario.equipe_id ? parseInt(formUsuario.equipe_id) : null,
        grupo_id: formUsuario.grupo_id ? parseInt(formUsuario.grupo_id) : null,
        ramal: formUsuario.ramal.trim() || null,
        telefone: formUsuario.telefone.trim() || null,
        fila_id: formUsuario.fila_id ? parseInt(formUsuario.fila_id) : null, // 🆕 v3
      }).eq("id", editandoUsuario.id);
      setSalvando(false);
      if (error) { alert("Erro: " + error.message); return; }
      await onRefetch();
      setShowForm(false);
      setEditandoUsuario(null);
      alert("✅ Usuário atualizado!");
      return;
    }

    // ── NOVO ── precisa de senha
    if (!formUsuario.senha || formUsuario.senha.length < 6) {
      setSalvando(false);
      alert("Senha obrigatória (mínimo 6 caracteres).");
      return;
    }

    // Tenta chamar API; se não existir, mostra instrução
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const resp = await fetch("/api/criar-usuario", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token || ""}` },
        body: JSON.stringify({
          email: formUsuario.email.trim().toLowerCase(),
          senha: formUsuario.senha,
          nome: formUsuario.nome.trim(),
          role: formUsuario.role,
          equipe_id: formUsuario.equipe_id ? parseInt(formUsuario.equipe_id) : null,
          grupo_id: formUsuario.grupo_id ? parseInt(formUsuario.grupo_id) : null,
          ramal: formUsuario.ramal.trim() || null,
          telefone: formUsuario.telefone.trim() || null,
          fila_id: formUsuario.fila_id ? parseInt(formUsuario.fila_id) : null, // 🆕 v3
        }),
      });
      if (resp.status === 404) {
        setSalvando(false);
        alert(
          "⚠️ A API /api/criar-usuario ainda não foi configurada.\n\n" +
          "Como alternativa, crie o usuário em:\n" +
          "Supabase Dashboard → Authentication → Users → Add user\n\n" +
          "O trigger automático já vai criar a entry em `usuarios` (como atendente). Depois é só voltar aqui, clicar ✏️ e ajustar o role, equipe, fila e grupo."
        );
        return;
      }
      const data = await resp.json();
      setSalvando(false);
      if (!data?.success) {
        alert("Erro: " + (data?.error || "desconhecido"));
        return;
      }
      await onRefetch();
      setShowForm(false);
      alert("✅ Usuário criado!");
    } catch (e: any) {
      setSalvando(false);
      alert(
        "⚠️ Não consegui chamar /api/criar-usuario. Erro: " + e.message + "\n\n" +
        "Crie via Supabase Dashboard → Authentication → Users → Add user.\n" +
        "O trigger automático já cria a entry em `usuarios`."
      );
    }
  };

  const excluirUsuario = async (u: Usuario) => {
    // 🛡️ Defesa extra: bloqueia exclusão do super admin
    if (ehSuperAdminMaster(u.email)) {
      alert("🛡️ Esse usuário é o Super Admin do sistema e não pode ser excluído.");
      return;
    }
    if (!podeGerenciar) { alert("Você não tem permissão."); return; }
    if (!confirm(`Excluir ${u.nome}?\n\nIsso vai remover só a entry em \`usuarios\`. Pra apagar o login completo, vá em Authentication > Users no Supabase.`)) return;
    const { error } = await supabase.from("usuarios").delete().eq("id", u.id);
    if (error) { alert("Erro: " + error.message); return; }
    await onRefetch();
    alert("✅ Usuário removido!");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Toolbar */}
      <div style={{ ...cardStyle, padding: 14, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <input placeholder="🔍 Buscar por nome ou e-mail..." value={busca} onChange={e => setBusca(e.target.value)}
          style={{ ...IS, flex: "1 1 240px", maxWidth: 400, borderRadius: 20 }} />
        <select value={filtroRole} onChange={e => setFiltroRole(e.target.value)}
            style={{ ...IS, maxWidth: 220 }}>
            <option value="todos">Cargo: Todos</option>
            {gruposPermissao.map((g: any) => (
              <option key={g.id} value={`grupo:${g.id}`}>{g.icone || "👥"} {g.nome}</option>
            ))}
          </select>
        <select value={filtroEquipe} onChange={e => setFiltroEquipe(e.target.value)} style={{ ...IS, maxWidth: 200 }}>
          <option value="todas">Equipe: Todas</option>
          <option value="sem">Sem equipe</option>
          {equipes.map((eq: Equipe) => (
            <option key={eq.id} value={eq.id.toString()}>{eq.icone} {eq.nome}</option>
          ))}
        </select>
        <div style={{ flex: 1 }} />
        <button onClick={abrirNovo}
          style={{
            background: "linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)",
            color: "white", border: "none", borderRadius: 10,
            padding: "10px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer",
            boxShadow: "0 4px 12px rgba(37,99,235,0.3)",
            whiteSpace: "nowrap",
          }}>+ Novo Usuário</button>
      </div>

      {/* Form */}
      {showForm && (
        <div style={{ ...cardStyle, padding: 22, borderTop: "3px solid #2563eb" }}>
          <p style={{ color: "#2563eb", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, margin: "0 0 14px" }}>
            {editandoUsuario ? "✏️ Editar Usuário" : "➕ Novo Usuário"}
          </p>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Nome completo *</label>
              <input placeholder="Ex: Ana Silva" value={formUsuario.nome} onChange={e => setFormUsuario({ ...formUsuario, nome: e.target.value })} style={IS} />
            </div>
            <div>
              <label style={labelStyle}>E-mail *</label>
              <input type="email" placeholder="ana@unita.com" value={formUsuario.email}
                onChange={e => setFormUsuario({ ...formUsuario, email: e.target.value })}
                disabled={!!editandoUsuario}
                style={{ ...IS, background: editandoUsuario ? "#f3f4f6" : "#ffffff", opacity: editandoUsuario ? 0.6 : 1 }} />
            </div>
            {/* 🆕 GRUPO DE PERMISSÃO — Campo principal (cargo do usuário) */}
            <div style={{ gridColumn: isMobile ? "1" : "span 2" }}>
              <label style={{ ...labelStyle, color: "#7c3aed", fontSize: 12 }}>
                🛡️ CARGO / GRUPO DE PERMISSÃO *
              </label>
              <select value={formUsuario.grupo_id}
                onChange={e => setFormUsuario({ ...formUsuario, grupo_id: e.target.value })}
                style={{ ...IS, borderColor: formUsuario.grupo_id ? "#a78bfa" : "#e5e7eb", borderWidth: 2, fontWeight: 700 }}>
                <option value="">— Selecione o cargo do usuário —</option>
                {gruposPermissao.map((g: GrupoPermissao) => (
                  <option key={g.id} value={g.id.toString()}>
                    {g.icone || "👥"} {g.nome}{g.descricao ? ` — ${g.descricao}` : ""}
                  </option>
                ))}
              </select>
              <p style={{ color: "#7c3aed", fontSize: 10, margin: "4px 0 0", fontStyle: "italic" }}>
                💡 É o GRUPO que define todas as permissões do usuário (configuráveis em Permissões).
              </p>
            </div>

            <div>
              <label style={labelStyle}>🏢 Equipe</label>
              <select value={formUsuario.equipe_id} onChange={e => setFormUsuario({ ...formUsuario, equipe_id: e.target.value, fila_id: "" })} style={IS}>
                <option value="">Sem equipe</option>
                {equipes.map((eq: Equipe) => (
                  <option key={eq.id} value={eq.id.toString()}>{eq.icone} {eq.nome}</option>
                ))}
              </select>
            </div>


            <div>
              <label style={labelStyle}>📞 Ramal VOIP</label>
              <input placeholder="Ex: 1001" value={formUsuario.ramal} onChange={e => setFormUsuario({ ...formUsuario, ramal: e.target.value })} style={IS} />
            </div>
            <div>
              <label style={labelStyle}>Telefone</label>
              <input placeholder="(62) 99999-9999" value={formUsuario.telefone} onChange={e => setFormUsuario({ ...formUsuario, telefone: e.target.value })} style={IS} />
            </div>
            {!editandoUsuario && (
              <div style={{ position: "relative", gridColumn: isMobile ? "1" : "span 2" }}>
                <label style={labelStyle}>Senha inicial *</label>
                <input type={showSenha ? "text" : "password"} placeholder="Mínimo 6 caracteres" value={formUsuario.senha}
                  onChange={e => setFormUsuario({ ...formUsuario, senha: e.target.value })}
                  style={{ ...IS, paddingRight: 40 }} />
                <button onClick={() => setShowSenha(!showSenha)} type="button"
                  style={{ position: "absolute", right: 8, top: 32, background: "#f3f4f6", border: "none", cursor: "pointer", color: "#6b7280", fontSize: 12, width: 28, height: 28, borderRadius: 6 }}>
                  {showSenha ? "🙈" : "👁️"}
                </button>
                <p style={{ color: "#9ca3af", fontSize: 11, margin: "5px 0 0", lineHeight: 1.4 }}>
                  Será trocada no primeiro acesso (campo <code style={{ background: "#f3f4f6", padding: "1px 5px", borderRadius: 4, fontFamily: "monospace", fontSize: 10.5 }}>primeiro_acesso</code> em <code style={{ background: "#f3f4f6", padding: "1px 5px", borderRadius: 4, fontFamily: "monospace", fontSize: 10.5 }}>usuarios</code>).
                </p>
              </div>
            )}

            {/* 🆕 v3 — DROPDOWN DE FILA (depende da equipe) */}
            <div>
              <label style={labelStyle}>
                📋 Fila de atendimento
                {formUsuario.equipe_id && filasDisponiveis.length > 0 && (
                  <span style={{ color: "#9ca3af", fontWeight: 500, marginLeft: 6, textTransform: "none", letterSpacing: 0, fontSize: 10 }}>
                    · {filasDisponiveis.length} disponível{filasDisponiveis.length > 1 ? "is" : ""}
                  </span>
                )}
              </label>
              <select
                value={formUsuario.fila_id}
                onChange={e => setFormUsuario({ ...formUsuario, fila_id: e.target.value })}
                disabled={!formUsuario.equipe_id || filasDisponiveis.length === 0}
                style={{
                  ...IS,
                  cursor: (!formUsuario.equipe_id || filasDisponiveis.length === 0) ? "not-allowed" : "pointer",
                  background: (!formUsuario.equipe_id || filasDisponiveis.length === 0) ? "#f3f4f6" : "#ffffff",
                  opacity: (!formUsuario.equipe_id || filasDisponiveis.length === 0) ? 0.6 : 1,
                }}>
                {!formUsuario.equipe_id ? (
                  <option value="">⚠️ Selecione uma equipe primeiro</option>
                ) : filasDisponiveis.length === 0 ? (
                  <option value="">⚠️ Esta equipe não tem filas — cadastre na aba Filas</option>
                ) : (
                  <>
                    <option value="">Todas as filas da equipe</option>
                    {filasDisponiveis.map((f: Fila) => (
                      <option key={f.id} value={f.id.toString()}>{f.icone} {f.nome}</option>
                    ))}
                  </>
                )}
              </select>
              <p style={{ color: "#9ca3af", fontSize: 10, margin: "4px 0 0", lineHeight: 1.4 }}>
                {!formUsuario.equipe_id
                  ? "💡 Escolha uma equipe acima pra liberar as filas"
                  : formUsuario.fila_id
                    ? "✅ Usuário verá apenas atendimentos desta fila"
                    : "👀 Usuário verá todas as filas desta equipe"}
              </p>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button onClick={() => { setShowForm(false); setEditandoUsuario(null); }}
              style={{ background: "#ffffff", color: "#6b7280", border: "1px solid #e5e7eb", borderRadius: 10, padding: "9px 18px", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>
              Cancelar
            </button>
            <button onClick={salvarUsuario} disabled={salvando}
              style={{
                background: salvando ? "#1e40af" : "linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)",
                color: "white", border: "none", borderRadius: 10,
                padding: "9px 22px", fontSize: 12, cursor: salvando ? "not-allowed" : "pointer", fontWeight: 700,
                boxShadow: "0 4px 12px rgba(37,99,235,0.3)",
              }}>{salvando ? "Salvando..." : "💾 Salvar"}</button>
          </div>
        </div>
      )}

      {/* Lista */}
      {usuariosFiltrados.length === 0 ? (
        <div style={{ ...cardStyle, padding: 48, textAlign: "center" }}>
          <p style={{ fontSize: 40, margin: "0 0 8px" }}>{busca || filtroRole !== "todos" || filtroEquipe !== "todas" ? "🔍" : "👥"}</p>
          <p style={{ color: "#9ca3af", fontSize: 13 }}>
            {busca || filtroRole !== "todos" || filtroEquipe !== "todas" ? "Nenhum usuário com esses filtros" : "Nenhum usuário cadastrado ainda"}
          </p>
        </div>
      ) : (
        <div style={{ ...cardStyle, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: isMobile ? 900 : "auto" }}>
              <thead>
                <tr style={{ background: "#f9fafb" }}>
                  {/* 🆕 v2: adicionado "Filas" entre Equipe e Grupo */}
                  {["Nome", "Função", "Equipe", "Filas", "Grupo", "Ramal", "Ações"].map(h => (
                    <th key={h} style={{ padding: "12px 16px", color: "#6b7280", fontSize: 11, textAlign: "left", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700, borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {usuariosFiltrados.map((u: Usuario, i: number) => {
                  const equipe = u.equipe_id ? equipeById.get(u.equipe_id) : null;
                  const grupo = u.grupo_id ? gruposPermissao.find((g: GrupoPermissao) => g.id === u.grupo_id) : null;
                  const corAvatar = corHashFromString(u.email || u.nome);
                  return (
                    <tr key={u.id || i}
                      style={{ borderTop: "1px solid #f3f4f6", background: i % 2 === 0 ? "#ffffff" : "#fafbfc", transition: "background 0.1s" }}
                      onMouseEnter={(e) => e.currentTarget.style.background = "#f3f4f6"}
                      onMouseLeave={(e) => e.currentTarget.style.background = i % 2 === 0 ? "#ffffff" : "#fafbfc"}
                    >
                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <div style={{
                            width: 36, height: 36, borderRadius: "50%",
                            background: `linear-gradient(135deg, ${corAvatar} 0%, ${corAvatar}cc 100%)`,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            color: "white", fontSize: 12, fontWeight: 800,
                            flexShrink: 0,
                            boxShadow: `0 2px 6px ${corAvatar}40`,
                          }}>
                            {initialsFromName(u.nome)}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <p style={{ color: "#1f2937", fontSize: 13, fontWeight: 700, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{u.nome}</p>
                            <p style={{ color: "#9ca3af", fontSize: 11, margin: "2px 0 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        {ehSuperAdminMaster(u.email) ? (
                          <span style={{ background: "linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)", color: "#7c2d12", border: "1px solid #f59e0b", padding: "3px 10px", borderRadius: 10, fontSize: 11, fontWeight: 800, boxShadow: "0 1px 3px rgba(245,158,11,0.3)" }}>🛡️ Super Admin</span>
                        ) : (() => {
                          // 🛡️ Mostra o nome do GRUPO (cargo real do usuário)
                          const grupoDoUser = gruposPermissao.find((g: any) => g.id === u.grupo_id);
                          if (grupoDoUser) {
                            const cor = grupoDoUser.cor || "#6b7280";
                            return (
                              <span style={{ background: `${cor}15`, color: cor, border: `1px solid ${cor}40`, padding: "3px 10px", borderRadius: 10, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>
                                {grupoDoUser.icone || "👤"} {grupoDoUser.nome}
                              </span>
                            );
                          }
                          return (
                            <span style={{ background: "#f9fafb", color: "#6b7280", border: "1px dashed #d1d5db", padding: "3px 10px", borderRadius: 10, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>
                              ⚠️ Sem cargo
                            </span>
                          );
                        })()}
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        {equipe ? (
                          <span style={{ background: `${equipe.cor}15`, color: equipe.cor, border: `1px solid ${equipe.cor}40`, padding: "3px 10px", borderRadius: 10, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>
                            {equipe.icone} {equipe.nome}
                          </span>
                        ) : <span style={{ color: "#d1d5db", fontSize: 12 }}>—</span>}
                      </td>
                      {/* 🆕 v3: Coluna FILA (single) */}
                      <td style={{ padding: "12px 16px" }}>
                        {u.fila_id ? (() => {
                          const f = filas.find((x: Fila) => x.id === u.fila_id);
                          if (!f) return <span style={{ color: "#d1d5db", fontSize: 12 }}>—</span>;
                          return (
                            <span style={{
                              background: `${f.cor}15`,
                              color: f.cor,
                              border: `1px solid ${f.cor}40`,
                              padding: "3px 10px",
                              borderRadius: 10,
                              fontSize: 11,
                              fontWeight: 700,
                              whiteSpace: "nowrap",
                            }}>
                              {f.icone} {f.nome}
                            </span>
                          );
                        })() : (
                          <span style={{
                            background: "#ecfdf5",
                            color: "#10b981",
                            border: "1px solid #a7f3d0",
                            padding: "3px 10px",
                            borderRadius: 10,
                            fontSize: 11,
                            fontWeight: 700,
                          }}>Todas da equipe</span>
                        )}
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        {grupo ? (
                          <span style={{ background: "#f3e8ff", color: "#8b5cf6", border: "1px solid #ddd6fe", padding: "3px 10px", borderRadius: 10, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>{grupo.nome}</span>
                        ) : <span style={{ color: "#d1d5db", fontSize: 12 }}>—</span>}
                      </td>
                      <td style={{ padding: "12px 16px", color: "#6b7280", fontSize: 12, fontFamily: "monospace" }}>
                        {u.ramal || <span style={{ color: "#d1d5db" }}>—</span>}
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ display: "flex", gap: 6 }}>
                          {/* 🛡️ Super Admin não pode ser editado nem excluído */}
                          {ehSuperAdminMaster(u.email) ? (
                            <span title="Super Admin protegido" style={{ color: "#9ca3af", fontSize: 11, fontStyle: "italic", padding: "5px 11px" }}>🔒 Protegido</span>
                          ) : (
                            <>
                              <button onClick={() => abrirEditar(u)}
                                style={{ background: "#eff6ff", color: "#2563eb", border: "1px solid #bfdbfe", borderRadius: 8, padding: "5px 11px", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>✏️</button>
                              <button onClick={() => excluirUsuario(u)}
                                style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", borderRadius: 8, padding: "5px 11px", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>🗑️</button>
                            </>
                          )}
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
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// 🏢 ABA EQUIPES
// ═══════════════════════════════════════════════════════════════════════
function AbaEquipes({ equipes, usuariosPorEquipe, filasPorEquipe, isMobile, IS, cardStyle, labelStyle, podeGerenciar, onRefetch }: any) {
  const [busca, setBusca] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editando, setEditando] = useState<Equipe | null>(null);
  const [formEquipe, setFormEquipe] = useState({ nome: "", descricao: "", cor: "#2563eb", icone: "👥" });
  const [salvando, setSalvando] = useState(false);

  const equipesFiltradas = useMemo(() => {
    if (!busca) return equipes;
    const b = busca.toLowerCase();
    return equipes.filter((e: Equipe) => e.nome.toLowerCase().includes(b) || (e.descricao || "").toLowerCase().includes(b));
  }, [equipes, busca]);

  const abrirNova = () => {
    if (!podeGerenciar) return alert("Sem permissão.");
    setEditando(null);
    setFormEquipe({ nome: "", descricao: "", cor: "#2563eb", icone: "👥" });
    setShowForm(true);
  };
  const abrirEditar = (e: Equipe) => {
    if (!podeGerenciar) return alert("Sem permissão.");
    setEditando(e);
    setFormEquipe({ nome: e.nome, descricao: e.descricao || "", cor: e.cor, icone: e.icone });
    setShowForm(true);
  };
  const salvar = async () => {
    if (!formEquipe.nome.trim()) return alert("Nome obrigatório.");
    setSalvando(true);
    const payload = {
      nome: formEquipe.nome.trim(),
      descricao: formEquipe.descricao.trim() || null,
      cor: formEquipe.cor,
      icone: formEquipe.icone,
    };
    const { error } = editando
      ? await supabase.from("equipes").update(payload).eq("id", editando.id)
      : await supabase.from("equipes").insert([{ ...payload, ativo: true }]);
    setSalvando(false);
    if (error) return alert("Erro: " + error.message);
    await onRefetch();
    setShowForm(false);
    setEditando(null);
  };
  const excluir = async (eq: Equipe) => {
    if (!podeGerenciar) return alert("Sem permissão.");
    const qtdU = usuariosPorEquipe.get(eq.id) || 0;
    const qtdF = filasPorEquipe.get(eq.id) || 0;
    const aviso = (qtdU > 0 || qtdF > 0)
      ? `\n\nEla tem ${qtdU} usuário(s) e ${qtdF} fila(s) vinculadas. Eles serão desassociados (ficarão "Sem equipe") mas não serão apagados.`
      : "";
    if (!confirm(`Desativar a equipe "${eq.nome}"?${aviso}`)) return;
    await supabase.from("usuarios").update({ equipe_id: null }).eq("equipe_id", eq.id);
    await supabase.from("filas").update({ equipe_id: null }).eq("equipe_id", eq.id);
    await supabase.from("equipes").update({ ativo: false }).eq("id", eq.id);
    await onRefetch();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Toolbar */}
      <div style={{ ...cardStyle, padding: 14, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <input placeholder="🔍 Buscar equipes..." value={busca} onChange={e => setBusca(e.target.value)}
          style={{ ...IS, flex: "1 1 240px", maxWidth: 400, borderRadius: 20 }} />
        <div style={{ flex: 1 }} />
        <button onClick={abrirNova}
          style={{
            background: "linear-gradient(135deg, #a855f7 0%, #8b5cf6 100%)",
            color: "white", border: "none", borderRadius: 10,
            padding: "10px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer",
            boxShadow: "0 4px 12px rgba(168,85,247,0.3)",
          }}>+ Nova Equipe</button>
      </div>

      {/* Form */}
      {showForm && (
        <div style={{ ...cardStyle, padding: 22, borderTop: "3px solid #a855f7" }}>
          <p style={{ color: "#a855f7", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, margin: "0 0 14px" }}>
            {editando ? "✏️ Editar Equipe" : "➕ Nova Equipe"}
          </p>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 2fr", gap: 12, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Nome *</label>
              <input autoFocus placeholder='Ex: "Vendas Fibra"' value={formEquipe.nome} onChange={e => setFormEquipe({ ...formEquipe, nome: e.target.value })} style={IS} />
            </div>
            <div>
              <label style={labelStyle}>Descrição</label>
              <input placeholder="Quem coordena, onde fica, etc." value={formEquipe.descricao} onChange={e => setFormEquipe({ ...formEquipe, descricao: e.target.value })} style={IS} />
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>🎨 Cor</label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {CORES_DISPONIVEIS.map(c => (
                <button key={c} onClick={() => setFormEquipe({ ...formEquipe, cor: c })}
                  style={{
                    width: 32, height: 32, borderRadius: 8,
                    background: c,
                    border: formEquipe.cor === c ? "3px solid #1f2937" : "1px solid #e5e7eb",
                    cursor: "pointer",
                    boxShadow: formEquipe.cor === c ? "0 2px 8px rgba(0,0,0,0.15)" : "none",
                  }} />
              ))}
            </div>
          </div>
          <div style={{ marginBottom: 18 }}>
            <label style={labelStyle}>🎭 Ícone</label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {ICONES_EQUIPE.map(ic => (
                <button key={ic} onClick={() => setFormEquipe({ ...formEquipe, icone: ic })}
                  style={{
                    width: 36, height: 36, borderRadius: 8,
                    background: formEquipe.icone === ic ? `${formEquipe.cor}15` : "#ffffff",
                    border: formEquipe.icone === ic ? `2px solid ${formEquipe.cor}` : "1px solid #e5e7eb",
                    cursor: "pointer", fontSize: 18,
                  }}>{ic}</button>
              ))}
            </div>
          </div>
          {/* Preview */}
          <div style={{ marginBottom: 14, padding: 14, background: "#f9fafb", borderRadius: 10, border: "1px dashed #e5e7eb" }}>
            <p style={{ color: "#9ca3af", fontSize: 10, margin: "0 0 8px", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>PREVIEW</p>
            <span style={{ background: `${formEquipe.cor}15`, color: formEquipe.cor, border: `1px solid ${formEquipe.cor}40`, padding: "5px 14px", borderRadius: 10, fontSize: 13, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 16 }}>{formEquipe.icone}</span>
              <span>{formEquipe.nome || "Nome da equipe"}</span>
            </span>
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button onClick={() => { setShowForm(false); setEditando(null); }}
              style={{ background: "#ffffff", color: "#6b7280", border: "1px solid #e5e7eb", borderRadius: 10, padding: "9px 18px", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>
              Cancelar
            </button>
            <button onClick={salvar} disabled={salvando}
              style={{
                background: salvando ? "#7e22ce" : "linear-gradient(135deg, #a855f7 0%, #8b5cf6 100%)",
                color: "white", border: "none", borderRadius: 10,
                padding: "9px 22px", fontSize: 12, cursor: salvando ? "not-allowed" : "pointer", fontWeight: 700,
                boxShadow: "0 4px 12px rgba(168,85,247,0.3)",
              }}>{salvando ? "Salvando..." : "💾 Salvar"}</button>
          </div>
        </div>
      )}

      {/* Lista de cards */}
      {equipesFiltradas.length === 0 ? (
        <div style={{ ...cardStyle, padding: 48, textAlign: "center" }}>
          <p style={{ fontSize: 40, margin: "0 0 8px" }}>{busca ? "🔍" : "🏢"}</p>
          <p style={{ color: "#9ca3af", fontSize: 13 }}>
            {busca ? "Nenhuma equipe encontrada" : "Nenhuma equipe cadastrada"}
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
          {equipesFiltradas.map((eq: Equipe) => {
            const qtdU = usuariosPorEquipe.get(eq.id) || 0;
            const qtdF = filasPorEquipe.get(eq.id) || 0;
            return (
              <div key={eq.id} style={{
                ...cardStyle,
                padding: 0,
                overflow: "hidden",
                transition: "all 0.15s",
                borderTop: `4px solid ${eq.cor}`,
              }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = `0 8px 20px ${eq.cor}20`; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)"; }}
              >
                <div style={{ padding: "16px 18px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: 10,
                      background: `linear-gradient(135deg, ${eq.cor} 0%, ${eq.cor}cc 100%)`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 20,
                      boxShadow: `0 4px 10px ${eq.cor}40`,
                      flexShrink: 0,
                    }}><span style={{ filter: "saturate(0) brightness(2)" }}>{eq.icone}</span></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ color: "#1f2937", fontSize: 14, fontWeight: 700, margin: 0, wordBreak: "break-word" }}>{eq.nome}</p>
                      {eq.descricao && <p style={{ color: "#6b7280", fontSize: 11, margin: "3px 0 0", lineHeight: 1.3 }}>{eq.descricao}</p>}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
                    <div style={{ flex: 1, background: `${eq.cor}10`, border: `1px solid ${eq.cor}30`, borderRadius: 8, padding: "8px 10px", textAlign: "center" }}>
                      <p style={{ color: eq.cor, fontSize: 9, margin: 0, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700 }}>Usuários</p>
                      <p style={{ color: eq.cor, fontSize: 18, fontWeight: 800, margin: "2px 0 0", letterSpacing: -0.3 }}>{qtdU}</p>
                    </div>
                    <div style={{ flex: 1, background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "8px 10px", textAlign: "center" }}>
                      <p style={{ color: "#15803d", fontSize: 9, margin: 0, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700 }}>Filas</p>
                      <p style={{ color: "#16a34a", fontSize: 18, fontWeight: 800, margin: "2px 0 0", letterSpacing: -0.3 }}>{qtdF}</p>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, marginTop: 12, justifyContent: "flex-end" }}>
                    <button onClick={() => abrirEditar(eq)}
                      style={{ background: "#eff6ff", color: "#2563eb", border: "1px solid #bfdbfe", borderRadius: 8, padding: "6px 12px", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>✏️ Editar</button>
                    <button onClick={() => excluir(eq)}
                      style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", borderRadius: 8, padding: "6px 12px", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>🗑️</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// 📋 ABA FILAS
// ═══════════════════════════════════════════════════════════════════════
function AbaFilas({ filas, equipes, equipeById, usuarios, isMobile, IS, cardStyle, labelStyle, podeGerenciar, onRefetch }: any) {
  const [busca, setBusca] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editando, setEditando] = useState<Fila | null>(null);
  const [formFila, setFormFila] = useState({ nome: "", descricao: "", cor: "#06b6d4", icone: "🎯", equipe_id: "" });
  const [salvando, setSalvando] = useState(false);

  const filasFiltradas = useMemo(() => {
    if (!busca) return filas;
    const b = busca.toLowerCase();
    return filas.filter((f: Fila) => f.nome.toLowerCase().includes(b) || (f.descricao || "").toLowerCase().includes(b));
  }, [filas, busca]);

  const abrirNova = () => {
    if (!podeGerenciar) return alert("Sem permissão.");
    setEditando(null);
    setFormFila({ nome: "", descricao: "", cor: "#06b6d4", icone: "🎯", equipe_id: "" });
    setShowForm(true);
  };
  const abrirEditar = (f: Fila) => {
    if (!podeGerenciar) return alert("Sem permissão.");
    setEditando(f);
    setFormFila({ nome: f.nome, descricao: f.descricao || "", cor: f.cor, icone: f.icone, equipe_id: f.equipe_id?.toString() || "" });
    setShowForm(true);
  };
  const salvar = async () => {
    if (!formFila.nome.trim()) return alert("Nome obrigatório.");
    setSalvando(true);
    const payload = {
      nome: formFila.nome.trim(),
      descricao: formFila.descricao.trim() || null,
      cor: formFila.cor,
      icone: formFila.icone,
      equipe_id: formFila.equipe_id ? parseInt(formFila.equipe_id) : null,
    };
    const { error } = editando
      ? await supabase.from("filas").update(payload).eq("id", editando.id)
      : await supabase.from("filas").insert([{ ...payload, ativo: true }]);
    setSalvando(false);
    if (error) return alert("Erro: " + error.message);
    await onRefetch();
    setShowForm(false);
    setEditando(null);
  };
  const excluir = async (f: Fila) => {
    if (!podeGerenciar) return alert("Sem permissão.");
    if (!confirm(`Excluir a fila "${f.nome}"?`)) return;
    await supabase.from("filas").update({ ativo: false }).eq("id", f.id);
    await onRefetch();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ ...cardStyle, padding: 14, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <input placeholder="🔍 Buscar filas..." value={busca} onChange={e => setBusca(e.target.value)}
          style={{ ...IS, flex: "1 1 240px", maxWidth: 400, borderRadius: 20 }} />
        <div style={{ flex: 1 }} />
        <button onClick={abrirNova}
          style={{
            background: "linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)",
            color: "white", border: "none", borderRadius: 10,
            padding: "10px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer",
            boxShadow: "0 4px 12px rgba(6,182,212,0.3)",
          }}>+ Nova Fila</button>
      </div>

      {showForm && (
        <div style={{ ...cardStyle, padding: 22, borderTop: "3px solid #06b6d4" }}>
          <p style={{ color: "#06b6d4", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, margin: "0 0 14px" }}>
            {editando ? "✏️ Editar Fila" : "➕ Nova Fila"}
          </p>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Nome *</label>
              <input autoFocus placeholder='Ex: "Vendas Fibra"' value={formFila.nome} onChange={e => setFormFila({ ...formFila, nome: e.target.value })} style={IS} />
            </div>
            <div>
              <label style={labelStyle}>🏢 Equipe responsável</label>
              <select value={formFila.equipe_id} onChange={e => setFormFila({ ...formFila, equipe_id: e.target.value })} style={IS}>
                <option value="">Sem equipe (global)</option>
                {equipes.map((eq: Equipe) => <option key={eq.id} value={eq.id.toString()}>{eq.icone} {eq.nome}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Descrição</label>
              <input placeholder="Tipo de atendimento" value={formFila.descricao} onChange={e => setFormFila({ ...formFila, descricao: e.target.value })} style={IS} />
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>🎨 Cor</label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {CORES_DISPONIVEIS.map(c => (
                <button key={c} onClick={() => setFormFila({ ...formFila, cor: c })}
                  style={{
                    width: 32, height: 32, borderRadius: 8,
                    background: c,
                    border: formFila.cor === c ? "3px solid #1f2937" : "1px solid #e5e7eb",
                    cursor: "pointer",
                  }} />
              ))}
            </div>
          </div>
          <div style={{ marginBottom: 18 }}>
            <label style={labelStyle}>🎭 Ícone</label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {ICONES_FILA.map(ic => (
                <button key={ic} onClick={() => setFormFila({ ...formFila, icone: ic })}
                  style={{
                    width: 36, height: 36, borderRadius: 8,
                    background: formFila.icone === ic ? `${formFila.cor}15` : "#ffffff",
                    border: formFila.icone === ic ? `2px solid ${formFila.cor}` : "1px solid #e5e7eb",
                    cursor: "pointer", fontSize: 18,
                  }}>{ic}</button>
              ))}
            </div>
          </div>
          <div style={{ marginBottom: 14, padding: 14, background: "#f9fafb", borderRadius: 10, border: "1px dashed #e5e7eb" }}>
            <p style={{ color: "#9ca3af", fontSize: 10, margin: "0 0 8px", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>PREVIEW</p>
            <span style={{ background: `${formFila.cor}15`, color: formFila.cor, border: `1px solid ${formFila.cor}40`, padding: "5px 14px", borderRadius: 10, fontSize: 13, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 16 }}>{formFila.icone}</span>
              <span>{formFila.nome || "Nome da fila"}</span>
            </span>
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button onClick={() => { setShowForm(false); setEditando(null); }}
              style={{ background: "#ffffff", color: "#6b7280", border: "1px solid #e5e7eb", borderRadius: 10, padding: "9px 18px", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>
              Cancelar
            </button>
            <button onClick={salvar} disabled={salvando}
              style={{
                background: salvando ? "#0e7490" : "linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)",
                color: "white", border: "none", borderRadius: 10,
                padding: "9px 22px", fontSize: 12, cursor: salvando ? "not-allowed" : "pointer", fontWeight: 700,
                boxShadow: "0 4px 12px rgba(6,182,212,0.3)",
              }}>{salvando ? "Salvando..." : "💾 Salvar"}</button>
          </div>
        </div>
      )}

      {filasFiltradas.length === 0 ? (
        <div style={{ ...cardStyle, padding: 48, textAlign: "center" }}>
          <p style={{ fontSize: 40, margin: "0 0 8px" }}>{busca ? "🔍" : "📋"}</p>
          <p style={{ color: "#9ca3af", fontSize: 13 }}>
            {busca ? "Nenhuma fila encontrada" : "Nenhuma fila cadastrada"}
          </p>
        </div>
      ) : (
        <div style={{ ...cardStyle, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: isMobile ? 600 : "auto" }}>
              <thead>
                <tr style={{ background: "#f9fafb" }}>
                  {["Fila", "Equipe", "Usuários", "Ações"].map(h => (
                    <th key={h} style={{ padding: "12px 16px", color: "#6b7280", fontSize: 11, textAlign: "left", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700, borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filasFiltradas.map((f: Fila, i: number) => {
                  const equipe = f.equipe_id ? equipeById.get(f.equipe_id) : null;
                  // 🆕 v3: conta usuários que têm essa fila (fila_id == f.id) OU que estão na equipe sem fila específica
                  const usuariosDaFila = usuarios.filter((u: Usuario) => {
                    const temEspecifica = u.fila_id === f.id;
                    const semFiltro = !u.fila_id && equipe && u.equipe_id === equipe.id;
                    return temEspecifica || semFiltro;
                  }).length;
                  return (
                    <tr key={f.id}
                      style={{ borderTop: "1px solid #f3f4f6", background: i % 2 === 0 ? "#ffffff" : "#fafbfc" }}
                      onMouseEnter={(e) => e.currentTarget.style.background = "#f3f4f6"}
                      onMouseLeave={(e) => e.currentTarget.style.background = i % 2 === 0 ? "#ffffff" : "#fafbfc"}
                    >
                      <td style={{ padding: "14px 16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{
                            width: 34, height: 34, borderRadius: 8,
                            background: `linear-gradient(135deg, ${f.cor} 0%, ${f.cor}cc 100%)`,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 16, flexShrink: 0,
                            boxShadow: `0 2px 6px ${f.cor}40`,
                          }}><span style={{ filter: "saturate(0) brightness(2)" }}>{f.icone}</span></div>
                          <div>
                            <p style={{ color: "#1f2937", fontSize: 13, fontWeight: 700, margin: 0 }}>{f.nome}</p>
                            {f.descricao && <p style={{ color: "#9ca3af", fontSize: 11, margin: "2px 0 0" }}>{f.descricao}</p>}
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: "14px 16px" }}>
                        {equipe ? (
                          <span style={{ background: `${equipe.cor}15`, color: equipe.cor, border: `1px solid ${equipe.cor}40`, padding: "3px 10px", borderRadius: 10, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>
                            {equipe.icone} {equipe.nome}
                          </span>
                        ) : <span style={{ color: "#d1d5db", fontSize: 12 }}>—</span>}
                      </td>
                      <td style={{ padding: "14px 16px" }}>
                        <span style={{ background: "#f3e8ff", color: "#8b5cf6", border: "1px solid #ddd6fe", padding: "3px 10px", borderRadius: 10, fontSize: 12, fontWeight: 700 }}>{usuariosDaFila}</span>
                      </td>
                      <td style={{ padding: "14px 16px" }}>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button onClick={() => abrirEditar(f)}
                            style={{ background: "#eff6ff", color: "#2563eb", border: "1px solid #bfdbfe", borderRadius: 8, padding: "5px 11px", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>✏️</button>
                          <button onClick={() => excluir(f)}
                            style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", borderRadius: 8, padding: "5px 11px", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>🗑️</button>
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
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// 🔐 ABA PERMISSÕES
// ═══════════════════════════════════════════════════════════════════════
function AbaGeral({ isMobile, IS, cardStyle, labelStyle, podeGerenciar }: any) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ ...cardStyle, padding: 22 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: "#fffbeb", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>⚙️</div>
          <div>
            <h2 style={{ color: "#1f2937", fontSize: 15, fontWeight: 700, margin: 0 }}>Configurações Gerais</h2>
            <p style={{ color: "#6b7280", fontSize: 12, margin: "3px 0 0" }}>Comportamento global do sistema</p>
          </div>
        </div>

        <div style={{
          background: "linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)",
          border: "1px solid #bfdbfe",
          borderLeft: "4px solid #2563eb",
          borderRadius: 12,
          padding: "14px 18px",
          marginBottom: 18,
        }}>
          <p style={{ color: "#1e40af", fontSize: 13, margin: 0, fontWeight: 700 }}>🏢 UnitaSystem · Grupo Unita</p>
          <p style={{ color: "#3b82f6", fontSize: 12, margin: "4px 0 0", lineHeight: 1.5 }}>
            Sistema interno do Grupo Unita, sem multi-tenant. Todas as configurações acima valem pra todos os usuários. Pra mudanças de identidade visual, env vars ou integrações externas, edite o código-fonte.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
          <InfoCard titulo="Banco de dados" valor="Supabase" detalhe="PostgreSQL gerenciado · Realtime ativo" cor="#16a34a" icone="🗄️" />
          <InfoCard titulo="Storage de anexos" valor="20 MB/arquivo" detalhe="Bucket: propostas-anexos" cor="#2563eb" icone="📎" />
          <InfoCard titulo="Auth" valor="Email + Senha" detalhe="Trigger auto-cria entry em usuarios" cor="#8b5cf6" icone="🔐" />
          <InfoCard titulo="Versão" valor="1.0.0" detalhe="UnitaSystem CRM" cor="#f59e0b" icone="🏷️" />
        </div>
      </div>

      {/* Bloqueio pós-finalização */}
      <BloqueioPosFinalizacao podeGerenciar={podeGerenciar} IS={IS} cardStyle={cardStyle} labelStyle={labelStyle} />

      {/* Dica final */}
      <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderLeft: "4px solid #2563eb", borderRadius: 12, padding: "14px 18px" }}>
        <p style={{ color: "#1e40af", fontSize: 13, margin: 0, lineHeight: 1.5 }}>
          💡 <b>Roleta de Distribuição</b> fica em <b>Chatbot → Configurações → Roleta</b> (mais relacionado ao fluxo de atendimento).
        </p>
      </div>
    </div>
  );
}

function InfoCard({ titulo, valor, detalhe, cor, icone }: any) {
  return (
    <div style={{
      background: `linear-gradient(135deg, ${cor}08 0%, ${cor}03 100%)`,
      border: `1px solid ${cor}30`,
      borderRadius: 12,
      padding: "14px 16px",
      display: "flex",
      alignItems: "center",
      gap: 12,
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 10,
        background: `linear-gradient(135deg, ${cor} 0%, ${cor}cc 100%)`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 20, flexShrink: 0,
        boxShadow: `0 4px 10px ${cor}40`,
      }}><span style={{ filter: "saturate(0) brightness(2)" }}>{icone}</span></div>
      <div style={{ minWidth: 0 }}>
        <p style={{ color: "#6b7280", fontSize: 10, margin: 0, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700 }}>{titulo}</p>
        <p style={{ color: "#1f2937", fontSize: 15, margin: "2px 0 0", fontWeight: 800, letterSpacing: -0.3 }}>{valor}</p>
        <p style={{ color: "#9ca3af", fontSize: 11, margin: "2px 0 0" }}>{detalhe}</p>
      </div>
    </div>
  );
}

function BloqueioPosFinalizacao({ podeGerenciar, IS, cardStyle, labelStyle }: any) {
  const [horasBloqueio, setHorasBloqueio] = useState<number>(24);
  const [salvando, setSalvando] = useState(false);
  const [editado, setEditado] = useState(false);
  const [carregou, setCarregou] = useState(false);

  useEffect(() => {
    (async () => {
      // Tenta ler de uma tabela `configuracoes` (key/value) — se não existir, mantém o default
      const { data } = await supabase.from("configuracoes").select("valor").eq("chave", "bloqueio_pos_finalizacao_horas").maybeSingle();
      if (data?.valor !== undefined && data?.valor !== null) {
        const v = typeof data.valor === "number" ? data.valor : parseInt(data.valor as any) || 24;
        setHorasBloqueio(v);
      }
      setCarregou(true);
    })();
  }, []);

  const salvar = async () => {
    setSalvando(true);
    const { error } = await supabase.from("configuracoes").upsert([{ chave: "bloqueio_pos_finalizacao_horas", valor: horasBloqueio }], { onConflict: "chave" });
    if (!error && horasBloqueio === 0) {
      await supabase.from("atendimentos").update({ bloqueado_ate: null, atendente_finalizou: null }).not("bloqueado_ate", "is", null);
    }
    setSalvando(false);
    if (error) {
      alert("⚠️ Não conseguiu salvar (provavelmente a tabela `configuracoes` não existe ainda).\n\nCrie ela ou edite manualmente. Erro: " + error.message);
    } else {
      setEditado(false);
      alert(horasBloqueio === 0 ? "✅ Bloqueio desativado!" : "✅ Configuração salva!");
    }
  };

  return (
    <div style={{ ...cardStyle, padding: 22 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: "#fff7ed", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🔒</div>
        <div>
          <h2 style={{ color: "#1f2937", fontSize: 15, fontWeight: 700, margin: 0 }}>Bloqueio Pós-Finalização</h2>
          <p style={{ color: "#6b7280", fontSize: 12, margin: "3px 0 0" }}>Quanto tempo um cliente fica bloqueado de reabrir após finalização</p>
        </div>
      </div>

      <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 12, padding: 18 }}>
        <p style={{ color: "#6b7280", fontSize: 11, margin: "0 0 14px", lineHeight: 1.5 }}>
          Quando um atendente finaliza um chat, o cliente fica bloqueado de reabrir por essa quantidade de horas.
          Mensagens nesse período são registradas mas o atendimento <b>NÃO</b> volta pra "Aguardando".
          <br /><b>0 = desativa o bloqueio</b>. Recomendado: <b>24h</b>. Aplica só em finalização manual humana.
        </p>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input type="number" min={0} max={720} value={horasBloqueio}
            onChange={e => { setHorasBloqueio(Math.max(0, Math.min(720, parseInt(e.target.value) || 0))); setEditado(true); }}
            disabled={!podeGerenciar}
            style={{ ...IS, width: 110, fontWeight: 700 }} />
          <span style={{ color: "#6b7280", fontSize: 12, fontWeight: 500 }}>
            {horasBloqueio === 0 ? "(desativado)" : horasBloqueio === 24 ? "(1 dia)" : horasBloqueio === 48 ? "(2 dias)" : horasBloqueio === 168 ? "(1 semana)" : `(${horasBloqueio}h)`}
          </span>
          <div style={{ flex: 1 }} />
          {editado && podeGerenciar && (
            <button onClick={salvar} disabled={salvando}
              style={{
                background: salvando ? "#1e40af" : "linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)",
                color: "white", border: "none", borderRadius: 10,
                padding: "10px 18px", fontSize: 13, fontWeight: 700, cursor: salvando ? "wait" : "pointer",
                boxShadow: "0 4px 12px rgba(37,99,235,0.3)",
              }}>{salvando ? "Salvando..." : "💾 Salvar"}</button>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 14, flexWrap: "wrap" }}>
          {[0, 12, 24, 48, 72, 168].map(h => {
            const ativo = horasBloqueio === h;
            return (
              <button key={h} disabled={!podeGerenciar} onClick={() => { setHorasBloqueio(h); setEditado(true); }}
                style={{
                  background: ativo ? "#2563eb" : "#ffffff",
                  color: ativo ? "white" : "#6b7280",
                  border: `1px solid ${ativo ? "#2563eb" : "#e5e7eb"}`,
                  borderRadius: 8, padding: "5px 12px", fontSize: 11, cursor: podeGerenciar ? "pointer" : "not-allowed", fontWeight: 700,
                  boxShadow: ativo ? "0 2px 6px rgba(37,99,235,0.25)" : "none",
                  opacity: podeGerenciar ? 1 : 0.5,
                }}>
                {h === 0 ? "Off" : h < 24 ? `${h}h` : h === 24 ? "1d" : h === 48 ? "2d" : h === 72 ? "3d" : "1sem"}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}