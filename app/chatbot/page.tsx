"use client";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useWorkspace } from "../hooks/useWorkspace";
import { usePermissao } from "../hooks/usePermissao";
import { useTemPermissao } from "../hooks/useTemPermissao";
import { ChatSection } from "./_sections/ChatSection";
import { DashboardSection } from "./_sections/DashboardSection";
import { ConexoesSection } from "./_sections/ConexoesSection";
import { EtiquetasSection } from "./_sections/EtiquetasSection";
import { RelatoriosSection } from "./_sections/RelatoriosSection";
import { RespostasRapidasSection } from "./_sections/RespostasRapidasSection";
import { RoletaSection } from "./_sections/RoletaSection";

// ═══════════════════════════════════════════════════════════════════════
// 🎯 CHATBOT — UnitaSystem
// ───────────────────────────────────────────────────────────────────────
// Página principal do módulo Chatbot. Sidebar com 6 menus expansíveis,
// conteúdo renderizado em sections baseado em `?aba=xxx`.
// Single-tenant: usa Grupo Unita fixo no header.
// ═══════════════════════════════════════════════════════════════════════

function ChatbotInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const aba = searchParams.get("aba") || "chat";
  const { workspace } = useWorkspace();
  const { permissoes, isDono } = usePermissao();
  // 🛡️ Sistema novo de permissões (combinado com antigo via OR)
  const perm = useTemPermissao();
  const novoVerChat        = perm.temAcesso("atendimentos.acessar");
  const novoVerDashboard   = perm.tem("dashboard.ver");
  const novoVerConexoes    = perm.tem("conexoes.ver");
  const novoVerTemplates   = perm.tem("templates.ver");
  const novoVerDisparos    = perm.temAcesso("disparos.acessar") || perm.tem("disparos.webjs") || perm.tem("disparos.waba");
  const novoVerFluxos      = perm.tem("fluxos.acessar");
  const novoVerRelatorios  = perm.temAcesso("relatorios_atend.ver");
  const novoVerRespRapidas = perm.temAcesso("respostas_rapidas.acessar");
  const novoVerRoleta      = perm.temAcesso("roleta.acessar");
  const novoVerEtiquetas   = perm.temAcesso("etiquetas.acessar");
  const [menuAberto, setMenuAberto] = useState<string | null>("atendimentos");

  const [isMobile, setIsMobile] = useState(false);
  const [menuMobileAberto, setMenuMobileAberto] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const navegarPara = (path: string) => {
    router.push(path);
    if (isMobile) setMenuMobileAberto(false);
  };

  // Atalhos de permissão — `isDono` no Unita = admin
  const podeVerAutomacao = isDono || permissoes.administrador || perm.superAdmin || novoVerFluxos;
  const podeVerMarketing = isDono || permissoes.disparo_enviar || permissoes.templates_waba || novoVerDisparos || novoVerTemplates;
  const podeVerCadastro = isDono || permissoes.etiquetas || novoVerEtiquetas;
  const podeVerRoleta = isDono || permissoes.roleta_gerenciar || novoVerRoleta;

  // Combinação: cada permissão é (antigo OR novo). Super-admin sempre passa.
  const verChat       = perm.superAdmin || permissoes.chat_proprio || permissoes.chat_todos || novoVerChat;
  const verDashboard  = perm.superAdmin || permissoes.dashboard || novoVerDashboard;
  const verConexoes   = perm.superAdmin || permissoes.conexoes || novoVerConexoes;
  const verTemplates  = perm.superAdmin || isDono || permissoes.templates_waba || novoVerTemplates;
  const verDisparos   = perm.superAdmin || isDono || permissoes.disparo_enviar || novoVerDisparos;
  const verRelatorios = perm.superAdmin || permissoes.relatorios || novoVerRelatorios;
  const verRespRap    = perm.superAdmin || permissoes.respostas_rapidas || novoVerRespRapidas;
  const verRoletaFinal = perm.superAdmin || podeVerRoleta;

  const menus = [
    ...((verChat || verDashboard) ? [{
      key: "atendimentos", icon: "💬", label: "Atendimentos", cor: "#2563eb",
      subitens: [
        ...(verChat ? [{ key: "chat", label: "Conversas" }] : []),
        ...(verDashboard ? [{ key: "dashboard_atendimentos", label: "Dashboard" }] : []),
      ]
    }] : []),
    ...(verConexoes ? [{
      key: "conexoes_menu", icon: "📱", label: "Conexões", cor: "#10b981",
      subitens: [{ key: "conexoes", label: "Conexões" }]
    }] : []),
    ...(podeVerAutomacao ? [{
      key: "automacao", icon: "🤖", label: "Automação", cor: "#8b5cf6",
      subitens: [{ key: "fluxos", label: "Chatbot / Fluxos" }]
    }] : []),
    ...(podeVerMarketing ? [{
      key: "marketing", icon: "📢", label: "Marketing", cor: "#f59e0b",
      subitens: [
        ...(verTemplates ? [{ key: "templates", label: "Templates", path: "/chatbot/templates" }] : []),
        ...(verDisparos ? [{ key: "disparos", label: "Disparos em Massa", path: "/chatbot/disparos" }] : []),
      ]
    }] : []),
    ...(podeVerCadastro ? [{
      key: "cadastro", icon: "📋", label: "Cadastro", cor: "#ec4899",
      subitens: [{ key: "etiquetas", label: "Etiquetas" }]
    }] : []),
    ...((verRelatorios || verRespRap || verRoletaFinal) ? [{
      key: "configuracoes", icon: "⚙️", label: "Configurações", cor: "#6b7280",
      subitens: [
        ...(verRelatorios ? [{ key: "relatorios", label: "Relatórios" }] : []),
        ...(verRespRap ? [{ key: "respostas_rapidas", label: "Respostas Rápidas" }] : []),
        ...(verRoletaFinal ? [{ key: "roleta", label: "🎯 Roleta de Distribuição" }] : []),
      ]
    }] : []),
  ];

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "Arial, sans-serif", background: "#f8fafc", position: "relative" }}>

      {/* BOTÃO HAMBÚRGUER (mobile) */}
      {isMobile && !menuMobileAberto && (
        <button
          onClick={() => setMenuMobileAberto(true)}
          title="Abrir menu"
          style={{
            position: "fixed",
            top: 8,
            left: 8,
            zIndex: 999,
            background: "#ffffff",
            border: "1px solid #e5e7eb",
            color: "#1f2937",
            borderRadius: 10,
            padding: "6px 12px",
            fontSize: 18,
            cursor: "pointer",
            lineHeight: 1,
            boxShadow: "0 4px 12px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.04)",
          }}
        >☰</button>
      )}

      {isMobile && menuMobileAberto && (
        <div
          onClick={() => setMenuMobileAberto(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.4)",
            backdropFilter: "blur(2px)",
            zIndex: 999,
          }}
        />
      )}

      {/* SIDEBAR */}
      <div style={{
        width: isMobile ? 280 : 240,
        background: "#ffffff",
        borderRight: "1px solid #e5e7eb",
        display: "flex",
        flexDirection: "column",
        overflowY: "auto",
        position: isMobile ? "fixed" : "relative",
        top: isMobile ? 0 : "auto",
        left: isMobile ? 0 : "auto",
        bottom: isMobile ? 0 : "auto",
        height: isMobile ? "100vh" : "auto",
        zIndex: isMobile ? 1000 : "auto",
        transform: isMobile && !menuMobileAberto ? "translateX(-100%)" : "translateX(0)",
        transition: "transform 0.25s ease",
        boxShadow: isMobile ? "4px 0 16px rgba(0,0,0,0.1)" : "2px 0 8px rgba(0,0,0,0.04)",
      }}>
        <div style={{ padding: 16, borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
            {/* Logo "U" Unita (CSS) */}
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: "linear-gradient(135deg, #2563eb 0%, #3b82f6 50%, #4f46e5 100%)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "white", fontSize: 16, fontWeight: 900,
              boxShadow: "0 4px 10px rgba(37,99,235,0.30)",
              flexShrink: 0, letterSpacing: -0.5,
            }}>U</div>
            <div style={{ minWidth: 0 }}>
              <span style={{ color: "#1f2937", fontWeight: "700", fontSize: 14, display: "block" }}>Unita Chatbot</span>
              <span style={{ color: "#22c55e", fontSize: 10, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 0 2px #22c55e22" }} />
                {workspace?.nome || "Grupo Unita"}
              </span>
            </div>
          </div>
          {isMobile && (
            <button
              onClick={() => setMenuMobileAberto(false)}
              title="Fechar menu"
              style={{
                background: "#f3f4f6",
                border: "none",
                color: "#6b7280",
                fontSize: 18,
                cursor: "pointer",
                padding: "4px 8px",
                borderRadius: 6,
                lineHeight: 1,
                flexShrink: 0,
              }}
            >✕</button>
          )}
        </div>
        <div style={{ padding: 10, flex: 1 }}>
          {menus.map(menu => {
            const ativo = menuAberto === menu.key;
            return (
              <div key={menu.key} style={{ marginBottom: 4 }}>
                <button onClick={() => setMenuAberto(ativo ? null : menu.key)}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    width: "100%", padding: "10px 12px",
                    background: ativo ? `${menu.cor}10` : "transparent",
                    border: "none", borderRadius: 10, cursor: "pointer",
                    color: ativo ? menu.cor : "#374151",
                    fontSize: 13, fontWeight: ativo ? "700" : "600",
                    textAlign: "left",
                    transition: "background .15s ease",
                  }}
                  onMouseEnter={e => { if (!ativo) e.currentTarget.style.background = "#f3f4f6"; }}
                  onMouseLeave={e => { if (!ativo) e.currentTarget.style.background = "transparent"; }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      width: 28, height: 28,
                      background: ativo ? menu.cor : `${menu.cor}15`,
                      borderRadius: 8,
                      fontSize: 14,
                      transition: "background .15s ease",
                      boxShadow: ativo ? `0 2px 6px ${menu.cor}40` : "none",
                      filter: ativo ? "saturate(0) brightness(2)" : "none",
                    }}>{menu.icon}</span>
                    {menu.label}
                  </span>
                  <span style={{ fontSize: 9, color: ativo ? menu.cor : "#9ca3af", transition: "transform .2s", transform: ativo ? "rotate(0deg)" : "rotate(-90deg)" }}>▼</span>
                </button>
                {ativo && (
                  <div style={{ paddingLeft: 10, marginTop: 2, marginBottom: 4, display: "flex", flexDirection: "column", gap: 2 }}>
                    {menu.subitens.map(sub => {
                      const selecionado = aba === sub.key;
                      return (
                        <button key={sub.key} onClick={() => navegarPara((sub as any).path || `/chatbot?aba=${sub.key}`)}
                          style={{
                            display: "block", width: "100%", padding: "8px 12px 8px 36px",
                            background: selecionado ? `${menu.cor}18` : "transparent",
                            border: "none", borderRadius: 8, cursor: "pointer",
                            color: selecionado ? menu.cor : "#6b7280",
                            fontSize: 12, textAlign: "left",
                            fontWeight: selecionado ? "700" : "500",
                            position: "relative",
                            transition: "background .12s ease, color .12s ease",
                          }}
                          onMouseEnter={e => { if (!selecionado) { e.currentTarget.style.background = "#f3f4f6"; e.currentTarget.style.color = "#1f2937"; } }}
                          onMouseLeave={e => { if (!selecionado) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#6b7280"; } }}>
                          {selecionado && <span style={{ position: "absolute", left: 18, top: "50%", transform: "translateY(-50%)", width: 4, height: 4, borderRadius: "50%", background: menu.cor }} />}
                          {sub.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div style={{ padding: 12, borderTop: "1px solid #e5e7eb", background: "#fafbfc" }}>
          <button onClick={() => navegarPara("/crm")} style={{
            display: "flex", alignItems: "center", gap: 8, width: "100%",
            padding: "10px 12px",
            background: "#ffffff",
            border: "1px solid #e5e7eb",
            borderRadius: 10, cursor: "pointer",
            color: "#374151", fontSize: 12, fontWeight: "600",
            boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
            transition: "box-shadow .12s, transform .12s, border-color .12s",
          }}
            onMouseEnter={e => {
              e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.06)";
              e.currentTarget.style.borderColor = "#d1d5db";
              e.currentTarget.style.transform = "translateY(-1px)";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.boxShadow = "0 1px 2px rgba(0,0,0,0.04)";
              e.currentTarget.style.borderColor = "#e5e7eb";
              e.currentTarget.style.transform = "translateY(0)";
            }}>← Voltar ao CRM</button>
        </div>
      </div>

      {/* CONTEÚDO */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", width: isMobile ? "100%" : "auto", minWidth: 0 }}>
        {aba === "chat" && <ChatSection />}
        {aba === "dashboard_atendimentos" && verDashboard && <DashboardSection />}
        {aba === "conexoes" && !verConexoes && (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
            <span style={{ fontSize: 48 }}>🔒</span>
            <h2 style={{ color: "#1f2937", fontSize: 18, fontWeight: "bold", margin: 0 }}>Sem permissão</h2>
            <p style={{ color: "#6b7280", fontSize: 14, margin: 0 }}>Você não tem acesso a esta área</p>
          </div>
        )}
        {aba === "conexoes" && verConexoes && <ConexoesSection />}
        {aba === "fluxos" && podeVerAutomacao && (
          <div style={{ padding: 32, display: "flex", flexDirection: "column", gap: 24, alignItems: "center", justifyContent: "center", flex: 1 }}>
            <div style={{
              width: 96, height: 96, borderRadius: 24,
              background: "linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 48,
              boxShadow: "0 12px 24px rgba(139, 92, 246, 0.25), 0 4px 8px rgba(139, 92, 246, 0.15)"
            }}>🤖</div>
            <h1 style={{ color: "#1f2937", fontSize: 22, fontWeight: "bold", margin: 0 }}>Chatbot / Fluxos</h1>
            <p style={{ color: "#6b7280", fontSize: 14, margin: 0 }}>Crie fluxos de atendimento automático</p>
            <button onClick={() => router.push("/chatbot/fluxos")} style={{
              background: "linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)",
              color: "white", border: "none", borderRadius: 12,
              padding: "14px 32px", fontSize: 15, cursor: "pointer", fontWeight: "700",
              boxShadow: "0 4px 12px rgba(139, 92, 246, 0.35), 0 1px 3px rgba(139, 92, 246, 0.2)",
              transition: "transform .12s, box-shadow .12s",
            }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = "translateY(-1px)";
                e.currentTarget.style.boxShadow = "0 6px 16px rgba(139, 92, 246, 0.45)";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "0 4px 12px rgba(139, 92, 246, 0.35), 0 1px 3px rgba(139, 92, 246, 0.2)";
              }}>🤖 Abrir Editor de Fluxos →</button>
          </div>
        )}
        {aba === "etiquetas" && podeVerCadastro && <EtiquetasSection />}
        {aba === "relatorios" && permissoes.relatorios && <RelatoriosSection />}
        {aba === "respostas_rapidas" && permissoes.respostas_rapidas && <RespostasRapidasSection />}
        {aba === "roleta" && podeVerRoleta && <RoletaSection />}
      </div>
    </div>
  );
}

export default function Chatbot() {
  return (
    <Suspense fallback={<div style={{ background: "#f8fafc", height: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}><p style={{ color: "#6b7280" }}>Carregando...</p></div>}>
      <ChatbotInner />
    </Suspense>
  );
}