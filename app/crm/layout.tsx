"use client";
import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "../lib/supabase";
import AuthGuard from "../components/AuthGuard";
import { useTemPermissao } from "../hooks/useTemPermissao";

// ═══════════════════════════════════════════════════════════════════════
// CRM LAYOUT — Grupo Unita (single-tenant)
// ═══════════════════════════════════════════════════════════════════════
// Sidebar com menu + área de conteúdo.
// 🛡️ Agora respeita o GRUPO de permissão (não só o role legado):
//   - Mostra "Configurações" se o grupo tem QUALQUER permissão de config
//   - Mostra o NOME DO GRUPO abaixo do usuário (ex: "Diretor"), não o role
// ═══════════════════════════════════════════════════════════════════════

type Role = "admin" | "atendente" | "supervisor";

export default function CRMLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const [userEmail, setUserEmail] = useState("");
  const [userNome, setUserNome] = useState("");
  const [role, setRole] = useState<Role>("admin"); // fallback admin se tabela não existir
  const [grupoIcone, setGrupoIcone] = useState<string>("");
  const [grupoId, setGrupoId] = useState<number | null>(null);

  // 🛡️ Sistema novo de permissões
  const perm = useTemPermissao();

  const [isMobile, setIsMobile] = useState(false);
  const [menuMobileAberto, setMenuMobileAberto] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Carrega dados do usuário (com fallback se tabela 'usuarios' não existir)
  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      setUserEmail(user.email || "");

      try {
        const { data: usuario } = await supabase
          .from("usuarios")
          .select("nome, role, grupo_id")
          .eq("email", user.email)
          .maybeSingle();

        if (usuario) {
          if (usuario.nome) setUserNome(usuario.nome);
          if (usuario.role) setRole(usuario.role as Role);
          if (usuario.grupo_id) {
            setGrupoId(usuario.grupo_id);
            // Busca ícone do grupo pra mostrar no card do usuário
            const { data: g } = await supabase
              .from("grupos_permissao")
              .select("icone")
              .eq("id", usuario.grupo_id)
              .maybeSingle();
            if (g?.icone) setGrupoIcone(g.icone);
          }
        }
      } catch (e) {
        console.warn("Tabela 'usuarios' não encontrada — usando role 'admin' como fallback");
      }
    };
    init();
  }, [router]);

  const navegarPara = (path: string) => {
    router.push(path);
    if (isMobile) setMenuMobileAberto(false);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  // 🛡️ Decide se mostra "Configurações" baseado no GRUPO (não só no role).
  // Mostra se: super admin OU grupo tem qualquer permissão de config OU
  //            (fallback) é admin legado sem grupo atribuído.
  const podeVerConfiguracoes =
    perm.superAdmin ||
    perm.escopo("cfg_usuarios.ver") !== "none" ||
    perm.escopo("cfg_equipes.ver") !== "none" ||
    perm.escopo("cfg_filas.gerenciar") !== "none" ||
    perm.tem("cfg_grupos.ver") ||
    perm.tem("cfg_grupos.crud") ||
    perm.tem("cfg_geral.acessar") ||
    (role === "admin" && !grupoId); // admin antigo sem grupo

  // Menu items — Configurações condicional ao grupo
  const menuItems = [
    { path: "/crm/dashboard", icon: "📊", label: "Dashboard" },
    { path: "/crm/funil", icon: "🎯", label: "Funil de Vendas" },
    { path: "/crm/vendas", icon: "💰", label: "Vendas" },
    { path: "/crm/contatos", icon: "👥", label: "Contatos" },
    ...(podeVerConfiguracoes ? [{ path: "/crm/configuracoes", icon: "⚙️", label: "Configurações" }] : []),
  ];

  const isActive = (path: string) => pathname === path || pathname?.startsWith(path + "/");

  // 🛡️ Label/ícone: prioriza o NOME DO GRUPO. Fallback pro role legado.
  const roleLabel =
    perm.grupoNome ||
    (role === "admin" ? "Administrador" :
     role === "supervisor" ? "Supervisor" : "Atendente");

  const roleIcon =
    grupoIcone ||
    (role === "admin" ? "👑" :
     role === "supervisor" ? "🔍" : "👤");

  // Avatar = inicial do email
  const inicial = (userNome || userEmail || "?").charAt(0).toUpperCase();

  return (
    <AuthGuard>
      <div style={{
        display: "flex",
        // 🔧 App-shell travado na viewport: fixed + inset 0 → a JANELA nunca rola.
        // (antes era height: 100vh dentro do body flex-col, o que gerava scroll duplo/gigante.)
        // O scroll fica 100% interno na área de conteúdo (overflowY: auto), como deve ser num dashboard.
        position: "fixed",
        inset: 0,
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        background: "#f8fafc",
      }}>

        {/* Estilos globais para hover/transições */}
        <style>{`
          @keyframes glow {
            0%, 100% { box-shadow: 0 6px 16px rgba(37, 99, 235, 0.35), 0 0 0 1px rgba(37, 99, 235, 0.2), inset 0 1px 0 rgba(255,255,255,0.25); }
            50% { box-shadow: 0 6px 18px rgba(37, 99, 235, 0.45), 0 0 0 1px rgba(37, 99, 235, 0.25), inset 0 1px 0 rgba(255,255,255,0.25); }
          }
          .menu-item {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 10px 14px;
            background: transparent;
            border: none;
            border-left: 3px solid transparent;
            border-radius: 8px;
            cursor: pointer;
            color: #475569;
            font-size: 13.5px;
            font-weight: 500;
            text-align: left;
            transition: all 0.15s ease;
            width: 100%;
            font-family: inherit;
          }
          .menu-item:hover {
            background: #f1f5f9;
            color: #0f172a;
          }
          .menu-item.active {
            background: #eff6ff;
            border-left-color: #2563eb;
            color: #1d4ed8;
            font-weight: 700;
            margin-left: -3px;
            border-radius: 0 8px 8px 0;
          }
          .menu-item.active:hover {
            background: #dbeafe;
          }
          .shortcut-btn {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 11px 14px;
            border-radius: 10px;
            cursor: pointer;
            font-size: 13.5px;
            font-weight: 700;
            text-align: left;
            width: 100%;
            transition: all 0.15s ease;
            font-family: inherit;
          }
          .shortcut-chatbot {
            background: #eff6ff;
            border: 1px solid #bfdbfe;
            color: #1d4ed8;
          }
          .shortcut-chatbot:hover {
            background: #dbeafe;
            border-color: #93c5fd;
            box-shadow: 0 2px 6px rgba(37, 99, 235, 0.15);
          }
          .shortcut-telefonia {
            background: #f5f3ff;
            border: 1px solid #ddd6fe;
            color: #6d28d9;
          }
          .shortcut-telefonia:hover {
            background: #ede9fe;
            border-color: #c4b5fd;
            box-shadow: 0 2px 6px rgba(109, 40, 217, 0.15);
          }
          .shortcut-telefonia.active {
            background: #ede9fe;
            border-color: #8b5cf6;
          }
          .shortcut-cobranca {
            background: #ecfdf5;
            border: 1px solid #a7f3d0;
            color: #047857;
          }
          .shortcut-cobranca:hover {
            background: #d1fae5;
            border-color: #6ee7b7;
            box-shadow: 0 2px 6px rgba(5, 150, 105, 0.15);
          }
          .shortcut-cobranca.active {
            background: #d1fae5;
            border-color: #10b981;
          }
          .shortcut-financeiro {
            background: #fffbeb;
            border: 1px solid #fde68a;
            color: #b45309;
          }
          .shortcut-financeiro:hover {
            background: #fef3c7;
            border-color: #fcd34d;
            box-shadow: 0 2px 6px rgba(180, 83, 9, 0.15);
          }
          .shortcut-financeiro.active {
            background: #fef3c7;
            border-color: #f59e0b;
          }
          .shortcut-rh {
            background: #eef2ff;
            border: 1px solid #c7d2fe;
            color: #4338ca;
          }
          .shortcut-rh:hover {
            background: #e0e7ff;
            border-color: #a5b4fc;
            box-shadow: 0 2px 6px rgba(67, 56, 202, 0.15);
          }
          .shortcut-rh.active {
            background: #e0e7ff;
            border-color: #6366f1;
          }
          .logout-btn {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 11px 14px;
            background: #fef2f2;
            border: 1px solid #fecaca;
            border-radius: 10px;
            cursor: pointer;
            color: #dc2626;
            font-size: 13.5px;
            font-weight: 700;
            text-align: left;
            width: 100%;
            transition: all 0.15s ease;
            font-family: inherit;
          }
          .logout-btn:hover {
            background: #fee2e2;
            border-color: #f87171;
            box-shadow: 0 2px 6px rgba(220, 38, 38, 0.15);
          }
        `}</style>

        {/* ═══ BOTÃO HAMBÚRGUER (mobile) ═══ */}
        {isMobile && !menuMobileAberto && (
          <button
            onClick={() => setMenuMobileAberto(true)}
            title="Abrir menu"
            style={{
              position: "fixed", top: 8, left: 8, zIndex: 999,
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              color: "#0f172a",
              borderRadius: 10, padding: "8px 14px",
              fontSize: 18, cursor: "pointer", lineHeight: 1,
              boxShadow: "0 4px 12px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04)",
              fontWeight: 700,
            }}
          >☰</button>
        )}

        {/* ═══ OVERLAY (mobile) ═══ */}
        {isMobile && menuMobileAberto && (
          <div
            onClick={() => setMenuMobileAberto(false)}
            style={{
              position: "fixed", inset: 0,
              background: "rgba(15,23,42,0.5)",
              backdropFilter: "blur(4px)",
              zIndex: 999,
            }}
          />
        )}

        {/* ═══ SIDEBAR ═══ */}
        <div style={{
          width: isMobile ? 280 : 240,
          background: "#ffffff",
          borderRight: "1px solid #e2e8f0",
          display: "flex",
          flexDirection: "column",
          padding: 16,
          gap: 6,
          flexShrink: 0,
          overflowY: "auto",
          position: isMobile ? "fixed" : "relative",
          top: isMobile ? 0 : "auto",
          left: isMobile ? 0 : "auto",
          bottom: isMobile ? 0 : "auto",
          height: isMobile ? "100vh" : "auto",
          zIndex: isMobile ? 1000 : "auto",
          transform: isMobile && !menuMobileAberto ? "translateX(-100%)" : "translateX(0)",
          transition: "transform 0.25s ease",
          boxShadow: isMobile ? "4px 0 16px rgba(0,0,0,0.08)" : "none",
        }}>

          {/* Logo + nome */}
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            marginBottom: 14,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
              {/* Logo "U" em gradiente azul */}
              <div style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: "linear-gradient(135deg, #1e40af 0%, #2563eb 50%, #3b82f6 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#ffffff",
                fontWeight: 800,
                fontSize: 17,
                letterSpacing: -0.5,
                flexShrink: 0,
                animation: "glow 3s ease-in-out infinite",
              }}>U</div>
              <div style={{ minWidth: 0 }}>
                <span style={{
                  color: "#0f172a",
                  fontWeight: 800,
                  fontSize: 14,
                  display: "block",
                  letterSpacing: -0.3,
                  lineHeight: 1.2,
                }}>Grupo Unita</span>
                <span style={{
                  color: "#64748b",
                  fontSize: 10,
                  display: "block",
                  fontWeight: 600,
                  letterSpacing: 1.5,
                  textTransform: "uppercase",
                  marginTop: 2,
                }}>Sistema Interno</span>
              </div>
            </div>
            {isMobile && (
              <button
                onClick={() => setMenuMobileAberto(false)}
                title="Fechar menu"
                style={{
                  background: "#f1f5f9",
                  border: "none",
                  color: "#64748b",
                  fontSize: 16,
                  cursor: "pointer",
                  width: 30, height: 30,
                  borderRadius: 8,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >✕</button>
            )}
          </div>

          {/* Card de usuário */}
          <div style={{
            background: "linear-gradient(135deg, #f8fafc 0%, #eff6ff 100%)",
            border: "1px solid #e0e7ff",
            borderRadius: 12,
            padding: "10px 12px",
            marginBottom: 14,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}>
            {/* Avatar com inicial */}
            <div style={{
              width: 36, height: 36, borderRadius: "50%",
              background: "linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#ffffff",
              fontWeight: 700,
              fontSize: 15,
              boxShadow: "0 4px 10px rgba(37, 99, 235, 0.3)",
              flexShrink: 0,
            }}>
              {inicial}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <p style={{
                color: "#0f172a",
                fontSize: 12,
                margin: 0,
                fontWeight: 700,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}>{userNome || userEmail.split("@")[0]}</p>
              <p style={{
                color: "#1d4ed8",
                fontSize: 10.5,
                margin: "2px 0 0",
                fontWeight: 600,
                letterSpacing: 0.2,
              }}>{roleIcon} {roleLabel}</p>
            </div>
          </div>

          {/* Label do grupo de menu */}
          <p style={{
            fontSize: 10,
            fontWeight: 700,
            color: "#94a3b8",
            margin: "4px 4px 6px",
            letterSpacing: 1.2,
            textTransform: "uppercase",
          }}>Navegação</p>

          {/* Itens do menu */}
          {menuItems.map(item => (
            <button
              key={item.path}
              onClick={() => navegarPara(item.path)}
              className={`menu-item ${isActive(item.path) ? "active" : ""}`}
            >
              <span style={{ fontSize: 15 }}>{item.icon}</span>
              {item.label}
            </button>
          ))}

          {/* Separador + Atalhos */}
          <p style={{
            fontSize: 10,
            fontWeight: 700,
            color: "#94a3b8",
            margin: "16px 4px 6px",
            letterSpacing: 1.2,
            textTransform: "uppercase",
          }}>Atalhos</p>

          <button
            onClick={() => navegarPara("/chatbot")}
            className="shortcut-btn shortcut-chatbot"
          >
            <span>💬</span> Chatbot
          </button>

          <button
            onClick={() => navegarPara("/crm/telefonia")}
            className={`shortcut-btn shortcut-telefonia ${isActive("/crm/telefonia") ? "active" : ""}`}
          >
            <span>📞</span> Telefonia
          </button>

          <button
            onClick={() => navegarPara("/crm/cobranca")}
            className={`shortcut-btn shortcut-cobranca ${isActive("/crm/cobranca") ? "active" : ""}`}
          >
            <span>🧾</span> Cobrança
          </button>

          <button
            onClick={() => navegarPara("/crm/financeiro")}
            className={`shortcut-btn shortcut-financeiro ${isActive("/crm/financeiro") ? "active" : ""}`}
          >
            <span>💵</span> Financeiro
          </button>

          <button
            onClick={() => navegarPara("/crm/rh")}
            className={`shortcut-btn shortcut-rh ${isActive("/crm/rh") ? "active" : ""}`}
          >
            <span>🧑‍💼</span> RH
          </button>

          {/* Botão Sair (fundo) */}
          <div style={{
            marginTop: "auto",
            borderTop: "1px solid #e2e8f0",
            paddingTop: 12,
          }}>
            <button onClick={signOut} className="logout-btn">
              <span>🚪</span> Sair
            </button>
          </div>
        </div>

        {/* ═══ CONTEÚDO ═══ */}
        <div style={{
          flex: 1,
          overflowY: "auto",
          padding: isMobile ? "56px 12px 16px" : 32,
          width: isMobile ? "100%" : "auto",
          minWidth: 0,
        }}>
          {children}
        </div>
      </div>
    </AuthGuard>
  );
}