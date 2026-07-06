import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

// ═══════════════════════════════════════════════════════════════════════
// 🔐 SISTEMA DE PERMISSÕES — UnitaSystem (single-tenant)
// ═══════════════════════════════════════════════════════════════════════
// HIERARQUIA DE DECISÃO (do mais forte pro mais fraco):
//
//   1. 🛡️ Super Admin (admin@grupounita.net.br)     → sempre tudo liberado
//   2. 🎯 Tem grupo_id atribuído                      → deriva TUDO do grupo
//                                                       (IGNORA o role legado)
//   3. 🟡 Sem grupo, mas tem role na tabela usuarios → usa role (admin/sup/atend)
//   4. ⚪ Sem grupo e sem registro                    → bootstrap (admin total)
//
// Retorna a MESMA interface antiga (isDono, isSuperAdmin, perfil, permissoes)
// mas agora deriva os booleanos do NOVO sistema quando o user tem grupo.
// ═══════════════════════════════════════════════════════════════════════

const SUPER_ADMIN_EMAIL = "admin@grupounita.net.br";

export type Permissoes = {
  chat_proprio: boolean; chat_todos: boolean; chat_interno: boolean;
  respostas_rapidas: boolean; transferir_chat: boolean; finalizar_chat: boolean;
  contatos_ver: boolean; contatos_editar: boolean; etiquetas: boolean;
  dashboard: boolean; vendas_proprio: boolean; vendas_fila: boolean; vendas_equipe: boolean; vendas_todas: boolean;
  funil: boolean; proposta_criar: boolean;
  disparo_enviar: boolean; templates_waba: boolean;
  voip_usar: boolean; voip_conexoes: boolean; voip_campanhas: boolean;
  conexoes: boolean; filas: boolean; usuarios_gerenciar: boolean;
  grupos_permissao: boolean; roleta_gerenciar: boolean;
  configuracoes_workspace: boolean;
  relatorios: boolean; relatorios_voip: boolean;
  config_proprio: boolean; administrador: boolean;
  // 🧩 Módulos do sistema (gate de acesso por usuário)
  crm_acessar: boolean; telefonia_acessar: boolean; chatbot_acessar: boolean;
  cobranca: boolean; rh: boolean; financeiro_acessar: boolean; bater_ponto: boolean;
  suporte: boolean;
};

const PERMISSOES_ADMIN: Permissoes = {
  chat_proprio: true, chat_todos: true, chat_interno: true, respostas_rapidas: true,
  transferir_chat: true, finalizar_chat: true,
  contatos_ver: true, contatos_editar: true, etiquetas: true,
  dashboard: true, vendas_proprio: true, vendas_fila: true, vendas_equipe: true, vendas_todas: true, funil: true, proposta_criar: true,
  disparo_enviar: true, templates_waba: true,
  voip_usar: true, voip_conexoes: true, voip_campanhas: true,
  conexoes: true, filas: true, usuarios_gerenciar: true, grupos_permissao: true,
  roleta_gerenciar: true, configuracoes_workspace: true,
  relatorios: true, relatorios_voip: true,
  config_proprio: true, administrador: true,
  crm_acessar: true, telefonia_acessar: true, chatbot_acessar: true,
  cobranca: true, rh: true, financeiro_acessar: true, bater_ponto: true,
  suporte: true,
};

const PERMISSOES_SUPERVISOR: Permissoes = {
  ...PERMISSOES_ADMIN,
  conexoes: false, usuarios_gerenciar: false, grupos_permissao: false,
  configuracoes_workspace: false, voip_conexoes: false, administrador: false,
  vendas_todas: false, vendas_equipe: false, vendas_fila: true,
};

const PERMISSOES_ATENDENTE: Permissoes = {
  chat_proprio: true, chat_todos: false, chat_interno: true, respostas_rapidas: true,
  transferir_chat: true, finalizar_chat: true,
  contatos_ver: true, contatos_editar: false, etiquetas: false,
  dashboard: true, vendas_proprio: true, vendas_fila: false, vendas_equipe: false, vendas_todas: false, funil: false, proposta_criar: true,
  disparo_enviar: false, templates_waba: false,
  voip_usar: true, voip_conexoes: false, voip_campanhas: false,
  conexoes: false, filas: false, usuarios_gerenciar: false, grupos_permissao: false,
  roleta_gerenciar: false, configuracoes_workspace: false,
  relatorios: false, relatorios_voip: false,
  config_proprio: true, administrador: false,
  crm_acessar: true, telefonia_acessar: true, chatbot_acessar: false,
  cobranca: false, rh: false, financeiro_acessar: false, bater_ponto: true,
  suporte: false,
};

export const PERMISSOES_ZERO: Permissoes = Object.keys(PERMISSOES_ADMIN).reduce((acc, k) => {
  (acc as any)[k] = false;
  return acc;
}, {} as Permissoes);

// ─── 🆕 Deriva o objeto Permissoes antigo a partir do mapa de permissões do grupo ───
function derivarPermissoesDoGrupo(mapa: Record<string, string>): Permissoes {
  const tem = (slug: string) => mapa[slug] === "on";
  const escopoVivo = (slug: string) => !!mapa[slug] && mapa[slug] !== "none" && mapa[slug] !== "off";
  const escopoIs = (slug: string, ...vals: string[]) => vals.includes(mapa[slug]);

  return {
    // 💬 ATENDIMENTO
    chat_proprio: escopoVivo("atendimentos.acessar"),
    chat_todos: escopoIs("atendimentos.acessar", "all"),
    chat_interno: escopoVivo("atendimentos.acessar"),
    respostas_rapidas: escopoVivo("respostas_rapidas.acessar"),
    transferir_chat: tem("atendimentos.transferir"),
    finalizar_chat: tem("atendimentos.finalizar_outros"),

    // 🏷️ CONTATOS & ETIQUETAS
    contatos_ver: escopoVivo("contatos.ver"),
    contatos_editar: escopoVivo("contatos.crud"),
    etiquetas: escopoVivo("etiquetas.acessar"),

    // 💰 VENDAS & CRM
    dashboard: tem("dashboard.ver"),
    vendas_proprio: escopoVivo("vendas.ver"),
    vendas_fila: escopoIs("vendas.ver", "team", "all"),
    vendas_equipe: escopoIs("vendas.ver", "team", "all"),
    vendas_todas: escopoIs("vendas.ver", "all"),
    funil: escopoVivo("vendas.ver"),
    proposta_criar: escopoVivo("propostas.crud"),

    // 📤 MARKETING
    disparo_enviar: escopoVivo("disparos.acessar") || tem("disparos.webjs") || tem("disparos.waba"),
    templates_waba: tem("templates.ver"),

    // 📞 TELEFONIA (sem equivalente no novo, derivar conservador)
    voip_usar: escopoVivo("atendimentos.acessar"),
    voip_conexoes: tem("conexoes.crud"),
    voip_campanhas: tem("disparos.webjs") || tem("disparos.waba"),

    // ⚙️ ADMINISTRAÇÃO
    conexoes: tem("conexoes.ver"),
    filas: escopoVivo("cfg_filas.gerenciar"),
    usuarios_gerenciar: escopoVivo("cfg_usuarios.ver"),
    grupos_permissao: tem("cfg_grupos.ver") || tem("cfg_grupos.crud"),
    roleta_gerenciar: escopoVivo("roleta.acessar"),
    configuracoes_workspace: tem("cfg_geral.acessar"),

    // 📊 RELATÓRIOS
    relatorios: escopoVivo("relatorios_atend.ver"),
    relatorios_voip: escopoVivo("relatorios_atend.ver"),

    // 👤 PESSOAL
    config_proprio: true,

    // 🛡️ Admin geral (só se grupo tem TUDO de configurações)
    administrador: tem("cfg_geral.acessar") && (tem("cfg_grupos.crud") || tem("cfg_grupos.ver")),

    // 🧩 MÓDULOS DO SISTEMA (gate por grupo — padrão fechado)
    crm_acessar: escopoVivo("mod_crm.acessar"),
    telefonia_acessar: escopoVivo("mod_telefonia.acessar"),
    chatbot_acessar: escopoVivo("mod_chatbot.acessar"),
    cobranca: escopoVivo("mod_cobranca.acessar"),
    rh: escopoVivo("mod_rh.acessar"),
    financeiro_acessar: escopoVivo("mod_financeiro.acessar"),
    bater_ponto: escopoVivo("mod_bater_ponto.acessar"),
    suporte: escopoVivo("mod_suporte.acessar"),
  };
}

export function usePermissao() {
  const [permissoes, setPermissoes] = useState<Permissoes>(PERMISSOES_ZERO);
  const [isDono, setIsDono] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [perfil, setPerfil] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const email = (user.email || "").toLowerCase();
      const ehSuperAdmin = email === SUPER_ADMIN_EMAIL;

      try {
        // 🔧 Busca o registro por auth_user_id PRIMEIRO (vínculo forte) e, se não
        //    achar, por email (case-insensitive). Antes buscava só por email com
        //    match exato — se o e-mail de login divergisse do cadastrado (maiúscula,
        //    domínio, etc.) o usuário "sumia" e caía no bootstrap que liberava TUDO.
        let usr: any = null;
        const { data: porAuth, error: errAuth } = await supabase.from("usuarios")
          .select("role, nome, grupo_id, equipe_id")
          .eq("auth_user_id", user.id)
          .maybeSingle();
        if (errAuth) throw errAuth;
        usr = porAuth;

        if (!usr && user.email) {
          const { data: porEmail, error: errEmail } = await supabase.from("usuarios")
            .select("role, nome, grupo_id, equipe_id")
            .ilike("email", user.email)
            .maybeSingle();
          if (errEmail) throw errEmail;
          usr = porEmail;
        }

        // ─── 1. Sem registro ───
        //   ⚠️ NUNCA liberar tudo aqui. Só o super admin (pelo e-mail) entra full.
        //   Qualquer outro usuário sem registro recebe acesso MÍNIMO (atendente),
        //   pra um e-mail desconhecido jamais ver todas as vendas por engano.
        if (!usr) {
          if (ehSuperAdmin) {
            setPerfil("Administrador");
            setIsDono(true);
            setIsSuperAdmin(true);
            setPermissoes(PERMISSOES_ADMIN);
          } else {
            setPerfil("Atendente");
            setIsDono(false);
            setIsSuperAdmin(false);
            setPermissoes(PERMISSOES_ATENDENTE);
          }
          setLoading(false);
          return;
        }

        // ─── 2. Super Admin (email) → sempre tudo, independente de grupo/role ───
        if (ehSuperAdmin) {
          setPerfil("Administrador");
          setIsDono(true);
          setIsSuperAdmin(true);
          setPermissoes(PERMISSOES_ADMIN);
          setLoading(false);
          return;
        }

        // ─── 3. 🆕 TEM GRUPO → deriva DO GRUPO (ignora role legado) ───
        if (usr.grupo_id) {
          // Pega nome do grupo
          const { data: grupo } = await supabase.from("grupos_permissao")
            .select("nome, permissoes").eq("id", usr.grupo_id).maybeSingle();
          const nomeGrupo = grupo?.nome || "";

          // Normaliza pra não falhar por acento/maiúscula/espaço.
          // ("Administração Geral", "Administracao Geral", " administração geral ", etc.)
          const nomeNorm = nomeGrupo
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .trim()
            .toLowerCase();

          // "Administração Geral" (e variações de grafia) = admin total
          if (nomeNorm === "administracao geral" || nomeNorm === "administrador geral") {
            setPerfil("Administrador");
            setIsDono(true);
            setIsSuperAdmin(true);
            setPermissoes(PERMISSOES_ADMIN);
          } else {
            // Outro grupo → vale EXATAMENTE o que está marcado no checkbox
            // (grupos_permissao.permissoes). Sem slug, sem derivação, sem default
            // permissivo: o que não foi marcado fica fechado.
            const boolMap = (grupo?.permissoes || {}) as Record<string, boolean>;
            const final = { ...PERMISSOES_ZERO } as any;
            for (const k of Object.keys(final)) {
              if (boolMap[k] === true) final[k] = true;
            }

            // 🔓 Porta de entrada do MÓDULO a partir de sub-itens:
            //    se o grupo tem QUALQUER sub-item de um módulo marcado (ex:
            //    rh_funcionarios, cobranca_dashboard), liga o booleano-mãe
            //    (rh / cobranca) pra que o gate de ENTRADA do módulo abra —
            //    sem precisar marcar o "Acessar tudo". O recorte fino de quais
            //    telas aparecem continua sendo feito pelo useTemPermissao.
            const ligaSeAlgum = (prefixo: string, chaveMae: string) => {
              if (final[chaveMae]) return;
              for (const k of Object.keys(boolMap)) {
                if (boolMap[k] === true && k.startsWith(prefixo + "_")) { final[chaveMae] = true; return; }
              }
            };
            ligaSeAlgum("rh", "rh");
            ligaSeAlgum("cobranca", "cobranca");

            // Compatibilidade com menus antigos:
            // - Acesso ao Chatbot permite visualizar a área de conexões.
            // - Criar/editar conexões continua dependendo de `conexoes`.
            if (boolMap.chatbot_acessar === true) final.conexoes = true;

            // Se qualquer permissão administrativa de usuário estiver marcada,
            // mantém o booleano legado ativo para telas antigas.
            if (boolMap.usuarios_gerenciar === true) {
              final.usuarios_gerenciar = true;
              final.filas = true;
            }

            setPerfil("Atendente");      // 🔑 força perfil baixo
            setIsDono(false);             // 🔑 desativa checks de "isDono"
            setIsSuperAdmin(false);       // 🔑 desativa checks de "isSuperAdmin"
            setPermissoes(final as Permissoes);
          }
          setLoading(false);
          return;
        }

        // ─── 4. SEM grupo → fallback no role (comportamento antigo) ───
        const role = (usr.role || "atendente").toLowerCase();
        if (role === "admin") {
          setPerfil("Administrador");
          setIsDono(true);
          setIsSuperAdmin(true);
          setPermissoes(PERMISSOES_ADMIN);
        } else if (role === "supervisor") {
          setPerfil("Supervisor");
          setIsDono(false);
          setIsSuperAdmin(false);
          setPermissoes(PERMISSOES_SUPERVISOR);
        } else {
          setPerfil("Atendente");
          setIsDono(false);
          setIsSuperAdmin(false);
          setPermissoes(PERMISSOES_ATENDENTE);
        }
      } catch (e) {
        // 🔧 Em erro, NÃO liberar tudo (a menos que seja o super admin por e-mail).
        //    Erro de rede/consulta não pode virar "vê todas as vendas".
        console.warn("[usePermissao] erro ao resolver permissões:", e);
        if (ehSuperAdmin) {
          setPerfil("Administrador");
          setIsDono(true);
          setIsSuperAdmin(true);
          setPermissoes(PERMISSOES_ADMIN);
        } else {
          setPerfil("Atendente");
          setIsDono(false);
          setIsSuperAdmin(false);
          setPermissoes(PERMISSOES_ATENDENTE);
        }
      }
      setLoading(false);
    };
    init();
  }, []);

  return { permissoes, isDono, isSuperAdmin, perfil, loading };
}
