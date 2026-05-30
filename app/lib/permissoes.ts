// ═══════════════════════════════════════════════════════════════════════
// 🛡️ Sistema de Permissões — Tipos e Helpers
// ═══════════════════════════════════════════════════════════════════════
// Use os tipos pra type-safety e os helpers pra checagens em qualquer lugar.
// O hook useTemPermissao() consome esses tipos.
// ═══════════════════════════════════════════════════════════════════════

import { SUPER_ADMIN_EMAIL, isSuperAdmin } from "./superAdmin";
export { SUPER_ADMIN_EMAIL, isSuperAdmin };

// ─── Slugs do catálogo (atualizar conforme adicionar permissões no SQL) ───
export type PermissaoSlug =
  // Dashboard
  | "dashboard.ver"
  // Atendimentos
  | "atendimentos.acessar"
  | "atendimentos.atender_chats"
  | "atendimentos.transferir"
  | "atendimentos.finalizar_outros"
  | "atendimentos.enviar_audio"
  | "atendimentos.enviar_midia"
  | "atendimentos.bloquear_cliente"
  | "atendimentos.ver_historico"
  // Etiquetas / Respostas rápidas
  | "etiquetas.acessar"
  | "etiquetas.crud"
  | "respostas_rapidas.acessar"
  | "respostas_rapidas.crud"
  // Roleta
  | "roleta.acessar"
  | "roleta.configurar"
  // Relatórios atendimento
  | "relatorios_atend.ver"
  // Conexões
  | "conexoes.ver"
  | "conexoes.crud"
  // Templates
  | "templates.ver"
  | "templates.criar"
  | "templates.sincronizar"
  // Fluxos
  | "fluxos.acessar"
  | "fluxos.crud"
  // Disparos
  | "disparos.acessar"
  | "disparos.criar"
  | "disparos.webjs"
  | "disparos.waba"
  | "disparos.controlar_outros"
  // Contatos
  | "contatos.ver"
  | "contatos.crud"
  | "contatos.excluir"
  | "contatos.importar_exportar"
  // Propostas
  | "propostas.ver"
  | "propostas.crud"
  | "propostas.editar_valores"
  | "propostas.marcar_instalada"
  | "propostas.marcar_cancelada"
  | "propostas.excluir"
  // Vendas
  | "vendas.ver"
  | "vendas.editar_valor"
  | "vendas.excluir"
  // Relatórios CRM
  | "relatorios_crm.ver"
  // Cobrança
  | "cobranca.acessar"
  | "cobranca.mudar_status"
  | "cobranca.disparar"
  | "cobranca.cancelar_fatura"
  | "cobranca.juridico"
  | "cobranca.protestada"
  // Cfg usuários
  | "cfg_usuarios.ver"
  | "cfg_usuarios.criar"
  | "cfg_usuarios.editar"
  | "cfg_usuarios.excluir"
  | "cfg_usuarios.mudar_grupo"
  // Cfg equipes / filas
  | "cfg_equipes.ver"
  | "cfg_equipes.criar"
  | "cfg_equipes.editar"
  | "cfg_equipes.excluir"
  | "cfg_filas.gerenciar"
  // Cfg grupos / gerais
  | "cfg_grupos.ver"
  | "cfg_grupos.crud"
  | "cfg_geral.acessar"
  | "cfg_geral.editar_empresa"
  | "cfg_geral.webhook"
  | "cfg_geral.bloqueio_retorno";

// ─── Valores possíveis pra uma permissão ───
// Toggle:  "on" | "off"
// Escopo:  "none" | "own" | "team" | "all"
export type ValorToggle = "on" | "off";
export type ValorEscopo = "none" | "own" | "team" | "all";
export type ValorPermissao = ValorToggle | ValorEscopo;

// ─── Tipo da permissão ───
export type TipoPermissao = "toggle" | "escopo";

// ─── Linha da tabela `permissoes` ───
export type PermissaoCatalogo = {
  slug: PermissaoSlug;
  area: string;
  area_icone: string;
  nome: string;
  tipo: TipoPermissao;
  ordem: number;
};

// ─── Mapa de permissões do usuário logado: slug → valor ───
export type MapaPermissoes = Record<string, ValorPermissao>;

// ─── Helpers de leitura ───
export function ehToggleLigado(valor: ValorPermissao | undefined): boolean {
  return valor === "on";
}

export function ehEscopoAcessivel(valor: ValorPermissao | undefined): boolean {
  return valor === "own" || valor === "team" || valor === "all";
}

// ─── Verifica permissão TOGGLE ───
export function temPermissaoToggle(
  mapa: MapaPermissoes,
  slug: PermissaoSlug,
  emailUsuario?: string | null
): boolean {
  if (isSuperAdmin(emailUsuario)) return true;
  return ehToggleLigado(mapa[slug]);
}

// ─── Verifica permissão ESCOPO — retorna o nível de acesso ───
export function escopoPermissao(
  mapa: MapaPermissoes,
  slug: PermissaoSlug,
  emailUsuario?: string | null
): ValorEscopo {
  if (isSuperAdmin(emailUsuario)) return "all";
  const v = mapa[slug];
  if (v === "own" || v === "team" || v === "all") return v;
  return "none";
}

// ─── Helper "tem acesso (qualquer nível)" — pra mostrar/esconder menu ───
export function temAcessoEscopo(
  mapa: MapaPermissoes,
  slug: PermissaoSlug,
  emailUsuario?: string | null
): boolean {
  return ehEscopoAcessivel(
    isSuperAdmin(emailUsuario) ? "all" : mapa[slug]
  );
}