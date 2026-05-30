import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

// ═══════════════════════════════════════════════════════════════════════
// 🔐 SISTEMA DE PERMISSÕES — UnitaSystem (single-tenant)
// ═══════════════════════════════════════════════════════════════════════
// Simplificado pra uso interno do Grupo Unita.
// Lê role da tabela `usuarios` (single-tenant) — sem workspaces.
//
// Roles:
//   👑 admin       → tudo liberado
//   🔍 supervisor  → quase tudo, sem configurações sensíveis
//   👤 atendente   → padrão restrito
//
// Fallback: se a tabela `usuarios` não existir OU usuário não estiver lá,
// vira admin (modo bootstrap até o sistema estar populado).
//
// INTERFACE IDÊNTICA ao Wolf — pra ter compatibilidade com componentes
// que esperam `isDono`, `isSuperAdmin`, `permissoes`, `perfil`, `loading`.
// ═══════════════════════════════════════════════════════════════════════

export type Permissoes = {
  // 💬 ATENDIMENTO
  chat_proprio: boolean;
  chat_todos: boolean;
  chat_interno: boolean;
  respostas_rapidas: boolean;
  transferir_chat: boolean;
  finalizar_chat: boolean;

  // 🏷️ CONTATOS & ETIQUETAS
  contatos_ver: boolean;
  contatos_editar: boolean;
  etiquetas: boolean;

  // 💰 VENDAS & CRM
  dashboard: boolean;
  vendas_proprio: boolean;
  vendas_equipe: boolean;
  funil: boolean;
  proposta_criar: boolean;

  // 📤 MARKETING & DISPAROS
  disparo_enviar: boolean;
  templates_waba: boolean;

  // 📞 TELEFONIA VOIP
  voip_usar: boolean;
  voip_conexoes: boolean;
  voip_campanhas: boolean;

  // ⚙️ ADMINISTRAÇÃO
  conexoes: boolean;
  filas: boolean;
  usuarios_gerenciar: boolean;
  grupos_permissao: boolean;
  roleta_gerenciar: boolean;
  configuracoes_workspace: boolean;

  // 📊 RELATÓRIOS
  relatorios: boolean;
  relatorios_voip: boolean;

  // 👤 PESSOAL
  config_proprio: boolean;

  // ⚠️ ADMIN
  administrador: boolean;
};

// Admin: tudo liberado
const PERMISSOES_ADMIN: Permissoes = {
  chat_proprio: true, chat_todos: true, chat_interno: true, respostas_rapidas: true,
  transferir_chat: true, finalizar_chat: true,
  contatos_ver: true, contatos_editar: true, etiquetas: true,
  dashboard: true, vendas_proprio: true, vendas_equipe: true, funil: true, proposta_criar: true,
  disparo_enviar: true, templates_waba: true,
  voip_usar: true, voip_conexoes: true, voip_campanhas: true,
  conexoes: true, filas: true, usuarios_gerenciar: true, grupos_permissao: true,
  roleta_gerenciar: true, configuracoes_workspace: true,
  relatorios: true, relatorios_voip: true,
  config_proprio: true,
  administrador: true,
};

// Supervisor: quase tudo, sem configs sensíveis
const PERMISSOES_SUPERVISOR: Permissoes = {
  ...PERMISSOES_ADMIN,
  conexoes: false,
  usuarios_gerenciar: false,
  grupos_permissao: false,
  configuracoes_workspace: false,
  voip_conexoes: false,
  administrador: false,
};

// Atendente: padrão restrito
const PERMISSOES_ATENDENTE: Permissoes = {
  chat_proprio: true, chat_todos: false, chat_interno: true, respostas_rapidas: true,
  transferir_chat: true, finalizar_chat: true,
  contatos_ver: true, contatos_editar: false, etiquetas: false,
  dashboard: true, vendas_proprio: true, vendas_equipe: false, funil: false, proposta_criar: true,
  disparo_enviar: false, templates_waba: false,
  voip_usar: true, voip_conexoes: false, voip_campanhas: false,
  conexoes: false, filas: false, usuarios_gerenciar: false, grupos_permissao: false,
  roleta_gerenciar: false, configuracoes_workspace: false,
  relatorios: false, relatorios_voip: false,
  config_proprio: true,
  administrador: false,
};

export const PERMISSOES_ZERO: Permissoes = Object.keys(PERMISSOES_ADMIN).reduce((acc, k) => {
  (acc as any)[k] = false;
  return acc;
}, {} as Permissoes);

export function usePermissao() {
  const [permissoes, setPermissoes] = useState<Permissoes>(PERMISSOES_ZERO);
  const [isDono, setIsDono] = useState(false);          // mantido pra compat: true se admin
  const [isSuperAdmin, setIsSuperAdmin] = useState(false); // mantido pra compat: true se admin
  const [perfil, setPerfil] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      // Single-tenant: tenta ler role da tabela usuarios
      try {
        const { data: usr, error } = await supabase.from("usuarios")
          .select("role, nome")
          .eq("email", user.email)
          .maybeSingle();

        if (error) throw error;

        if (!usr) {
          // Usuário não cadastrado na tabela → vira admin (bootstrap)
          setPerfil("admin");
          setIsDono(true);
          setIsSuperAdmin(true);
          setPermissoes(PERMISSOES_ADMIN);
          setLoading(false);
          return;
        }

        const role = (usr.role || "atendente").toLowerCase();
        setPerfil(role);

        if (role === "admin") {
          setIsDono(true);
          setIsSuperAdmin(true);
          setPermissoes(PERMISSOES_ADMIN);
        } else if (role === "supervisor") {
          setIsDono(false);
          setIsSuperAdmin(false);
          setPermissoes(PERMISSOES_SUPERVISOR);
        } else {
          setIsDono(false);
          setIsSuperAdmin(false);
          setPermissoes(PERMISSOES_ATENDENTE);
        }
      } catch (e) {
        // Tabela não existe ou erro → fallback admin
        console.warn("[usePermissao] tabela usuarios não acessível, usando fallback admin", e);
        setPerfil("admin");
        setIsDono(true);
        setIsSuperAdmin(true);
        setPermissoes(PERMISSOES_ADMIN);
      }

      setLoading(false);
    };
    init();
  }, []);

  return { permissoes, isDono, isSuperAdmin, perfil, loading };
}