"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "../lib/supabase";
import {
  MapaPermissoes,
  PermissaoSlug,
  ValorEscopo,
  isSuperAdmin,
  temPermissaoToggle,
  escopoPermissao,
  temAcessoEscopo,
} from "../lib/permissoes";

// ═══════════════════════════════════════════════════════════════════════
// 🛡️ useTemPermissao — Hook React (v2 — UNIFICADO com a tela de Configurações)
// ─────────────────────────────────────────────────────────────────────
// ⚠️ O QUE MUDOU (correção do bug "dei acesso e a pessoa não entra"):
//
//   A tela Configurações → Permissões salva os checkboxes num MAPA BOOLEANO
//   em `grupos_permissao.permissoes` (ex: { cobranca: true, rh: false, ... }).
//   Este hook, porém, só lia a tabela `grupo_permissoes` (slugs tipo
//   "cobranca.acessar"), que a tela de config NÃO grava. Resultado: o menu
//   aparecia (usePermissao lê o mapa booleano) mas a PÁGINA bloqueava
//   (useTemPermissao via slug devolvia "none").
//
//   Agora este hook:
//   1. Lê o mapa booleano do grupo e TRADUZ pros slugs equivalentes
//      (cobranca:true → cobranca.acessar/mudar_status/disparar/... liberados)
//   2. Mantém a tabela `grupo_permissoes` funcionando: se existir linha
//      explícita pro slug, ELA GANHA da tradução do booleano.
//   3. Fallback por PREFIXO: qualquer slug "cobranca.*" / "mod_cobranca.*"
//      novo que surgir já funciona se o checkbox "cobranca" estiver marcado
//      (idem rh, financeiro, telefonia, chatbot, crm, ponto).
//   4. Busca o usuário por auth_user_id E, se não achar, por EMAIL
//      (cadastros antigos sem auth_user_id vinculado não bloqueiam mais).
//   5. Grupo "Administração Geral" = acesso total (igual ao usePermissao).
//
// Interface intacta: tem(), escopo(), temAcesso(), filtroEscopo(), etc.
// ═══════════════════════════════════════════════════════════════════════

export type FiltroEscopo = {
  tipo: ValorEscopo;
  userId: string | null;        // pra escopo "own"
  usuarioIdInterno: number | null; // pra usar em FKs (usuarios.id)
  equipeId: number | null;      // pra escopo "team"
};

export type RetornoUseTemPermissao = {
  carregando: boolean;
  superAdmin: boolean;
  userId: string | null;
  userEmail: string | null;
  usuarioIdInterno: number | null;
  equipeId: number | null;
  grupoId: number | null;
  grupoNome: string | null;
  mapa: MapaPermissoes;
  tem: (slug: PermissaoSlug) => boolean;
  escopo: (slug: PermissaoSlug) => ValorEscopo;
  temAcesso: (slug: PermissaoSlug) => boolean;
  filtroEscopo: (slug: PermissaoSlug) => FiltroEscopo;
  recarregar: () => Promise<void>;
};

// ─── 🔁 Tradução: mapa booleano da Configurações → slugs do sistema novo ───
// Cada checkbox marcado vira o(s) slug(s) correspondente(s). Escopos viram
// "all" (o recorte fino de vendas continua no usePermissao/página de Vendas).
function sintetizarSlugsDoBooleano(b: Record<string, boolean>): MapaPermissoes {
  const m: Record<string, string> = {};
  const on = (slug: string, v: string = "on") => { m[slug] = v; };

  // 💰 VENDAS / CRM
  const vendasEscopo = b.vendas_todas ? "all"
    : (b.vendas_equipe || b.vendas_fila) ? "team"
    : b.vendas_proprio ? "own" : null;
  if (vendasEscopo) on("vendas.ver", vendasEscopo);
  if (b.dashboard) on("dashboard.ver");
  if (b.proposta_criar) on("propostas.crud", "all");
  if (b.contatos_ver) on("contatos.ver", "all");
  if (b.contatos_editar) on("contatos.crud", "all");
  if (b.etiquetas) on("etiquetas.acessar", "all");

  // 💬 ATENDIMENTO / CHATBOT
  const chatEscopo = b.chat_todos ? "all" : b.chat_proprio ? "own" : null;
  if (chatEscopo) on("atendimentos.acessar", chatEscopo);
  if (b.transferir_chat) on("atendimentos.transferir");
  if (b.finalizar_chat) on("atendimentos.finalizar_outros");
  if (b.respostas_rapidas) on("respostas_rapidas.acessar", "all");
  if (b.disparo_enviar) { on("disparos.acessar", "all"); on("disparos.webjs"); on("disparos.waba"); }
  if (b.templates_waba) on("templates.ver");

  // ⚙️ ADMINISTRAÇÃO
  if (b.conexoes) { on("conexoes.ver"); on("conexoes.crud"); }
  if (b.filas) on("cfg_filas.gerenciar", "all");
  if (b.usuarios_gerenciar) {
    on("cfg_usuarios.ver", "all"); on("cfg_usuarios.crud", "all");
    on("cfg_equipes.ver", "all"); on("cfg_equipes.crud", "all");
  }
  if (b.grupos_permissao) { on("cfg_grupos.ver"); on("cfg_grupos.crud"); }
  if (b.configuracoes_workspace) on("cfg_geral.acessar");
  if (b.relatorios) on("relatorios_atend.ver", "all");
  if (b.roleta_gerenciar) on("roleta.acessar", "all");

  // 🧩 MÓDULOS (checkbox de "Acessar o X" libera o módulo inteiro)
  if (b.crm_acessar) on("mod_crm.acessar", "all");
  if (b.telefonia_acessar) on("mod_telefonia.acessar", "all");
  if (b.chatbot_acessar) on("mod_chatbot.acessar", "all");
  // 💰 COBRANÇA — geral libera tudo; individuais liberam cada card.
  //    Cards: dashboard, negociacoes, planilha.
  const COBRANCA_ITENS = ["dashboard", "negociacoes", "planilha"];
  if (b.cobranca) {
    on("mod_cobranca.acessar", "all");
    on("cobranca.acessar", "all");
    on("cobranca.mudar_status", "all");
    on("cobranca.disparar");
    on("cobranca.cancelar_fatura");
    on("cobranca.juridico");
    on("cobranca.protestada");
    COBRANCA_ITENS.forEach(k => on(`cobranca_${k}.acessar`, "all"));
  }
  // individuais (liberam o módulo + o card específico, sem precisar do geral)
  COBRANCA_ITENS.forEach(k => {
    if ((b as any)[`cobranca_${k}`]) {
      on("mod_cobranca.acessar", "all");
      on("cobranca.acessar", "all");
      on(`cobranca_${k}.acessar`, "all");
    }
  });

  // 🧑‍💼 RH — geral libera tudo; individuais liberam cada subtela.
  //    24 itens (mesmas chaves que o layout do RH checa em rh_<key>.acessar).
  const RH_ITENS = [
    "dashboard", "indicadores",
    "funcionarios", "departamentos", "cargos",
    "folha", "holerites", "encargos",
    "ponto", "ferias", "afastamentos", "banco_horas",
    "beneficios", "vale_transporte", "vale_refeicao", "plano_saude",
    "vagas", "candidatos", "selecao",
    "treinamentos", "avaliacoes",
    "documentos", "contratos",
    "config",
  ];
  if (b.rh) {
    on("mod_rh.acessar", "all");
    on("rh.acessar", "all");
    RH_ITENS.forEach(k => on(`rh_${k}.acessar`, "all"));
  }
  // individuais (liberam o módulo + a subtela específica, sem precisar do geral)
  RH_ITENS.forEach(k => {
    if ((b as any)[`rh_${k}`]) {
      on("mod_rh.acessar", "all");
      on("rh.acessar", "all");
      on(`rh_${k}.acessar`, "all");
    }
  });
  if (b.financeiro_acessar) { on("mod_financeiro.acessar", "all"); on("financeiro.acessar", "all"); }
  if (b.bater_ponto) { on("mod_bater_ponto.acessar", "all"); on("ponto.bater"); }
  if (b.suporte) { on("mod_suporte.acessar", "all"); on("suporte.acessar", "all"); }
  if (b.voip_usar) on("voip.usar");

  return m as MapaPermissoes;
}

// ─── 🧷 Fallback por PREFIXO: cobre slugs que ainda não mapeamos acima ────
// Se a página checar um slug novo (ex: "cobranca.exportar"), basta o checkbox
// do módulo estar marcado pra liberar. Mantém o sistema "à prova de futuro".
const PREFIXO_PARA_BOOLEANO: Record<string, string> = {
  cobranca: "cobranca", mod_cobranca: "cobranca",
  rh: "rh", mod_rh: "rh",
  financeiro: "financeiro_acessar", mod_financeiro: "financeiro_acessar",
  mod_crm: "crm_acessar",
  telefonia: "telefonia_acessar", mod_telefonia: "telefonia_acessar",
  chatbot: "chatbot_acessar", mod_chatbot: "chatbot_acessar",
  ponto: "bater_ponto", mod_bater_ponto: "bater_ponto",
  suporte: "suporte", mod_suporte: "suporte",
};

function escopoPorPrefixo(slug: string, boolMap: Record<string, boolean>): ValorEscopo | null {
  const prefixo = String(slug).split(".")[0];
  const chave = PREFIXO_PARA_BOOLEANO[prefixo];
  if (chave && boolMap[chave] === true) return "all" as ValorEscopo;
  return null;
}

function normalizarNome(nome: string): string {
  return (nome || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export function useTemPermissao(): RetornoUseTemPermissao {
  const [carregando, setCarregando] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [usuarioIdInterno, setUsuarioIdInterno] = useState<number | null>(null);
  const [equipeId, setEquipeId] = useState<number | null>(null);
  const [grupoId, setGrupoId] = useState<number | null>(null);
  const [grupoNome, setGrupoNome] = useState<string | null>(null);
  const [adminGeral, setAdminGeral] = useState(false);
  const [mapa, setMapa] = useState<MapaPermissoes>({});
  const [boolMap, setBoolMap] = useState<Record<string, boolean>>({});

  const superAdminEmail = useMemo(() => isSuperAdmin(userEmail), [userEmail]);
  // 🛡️ Grupo "Administração Geral" conta como super (igual usePermissao)
  const superAdmin = superAdminEmail || adminGeral;

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setUserId(null); setUserEmail(null); setUsuarioIdInterno(null);
        setEquipeId(null); setGrupoId(null); setGrupoNome(null);
        setAdminGeral(false); setMapa({}); setBoolMap({});
        setCarregando(false);
        return;
      }

      setUserId(user.id);
      setUserEmail(user.email || null);

      // 1️⃣ Busca o registro na tabela usuarios por auth_user_id…
      let usu: any = null;
      const { data: porAuthId } = await supabase
        .from("usuarios")
        .select("id, equipe_id, grupo_id, ativo")
        .eq("auth_user_id", user.id)
        .maybeSingle();
      usu = porAuthId;

      // …e se não achou, por EMAIL (cadastros antigos sem auth_user_id vinculado)
      if (!usu && user.email) {
        const { data: porEmail } = await supabase
          .from("usuarios")
          .select("id, equipe_id, grupo_id, ativo")
          .ilike("email", user.email)
          .maybeSingle();
        usu = porEmail;
      }

      if (!usu) {
        // Usuário ainda não cadastrado na tabela `usuarios` (super-admin bypassa por código)
        setUsuarioIdInterno(null); setEquipeId(null); setGrupoId(null);
        setGrupoNome(null); setAdminGeral(false); setMapa({}); setBoolMap({});
        setCarregando(false);
        return;
      }

      setUsuarioIdInterno(usu.id);
      setEquipeId(usu.equipe_id ?? null);
      setGrupoId(usu.grupo_id ?? null);

      // Sem grupo atribuído → mapa vazio (super-admin bypassa por código)
      if (!usu.grupo_id) {
        setGrupoNome(null); setAdminGeral(false); setMapa({}); setBoolMap({});
        setCarregando(false);
        return;
      }

      // 2️⃣ Busca o grupo (nome + MAPA BOOLEANO da tela de Configurações)
      //    e as linhas explícitas de slug (sistema novo), em paralelo
      const [resGrupo, resPerm] = await Promise.all([
        supabase.from("grupos_permissao").select("nome, permissoes").eq("id", usu.grupo_id).maybeSingle(),
        supabase.from("grupo_permissoes").select("permissao_slug, valor").eq("grupo_id", usu.grupo_id),
      ]);

      const nome = resGrupo.data?.nome ?? null;
      setGrupoNome(nome);

      // "Administração Geral" (e variações) = acesso total
      const nomeNorm = normalizarNome(nome || "");
      const ehAdminGeral = nomeNorm === "administracao geral" || nomeNorm === "administrador geral";
      setAdminGeral(ehAdminGeral);

      // 3️⃣ Monta o mapa: tradução do booleano + linhas explícitas POR CIMA
      const booleano = (resGrupo.data?.permissoes || {}) as Record<string, boolean>;
      setBoolMap(booleano);

      const sintetizado = sintetizarSlugsDoBooleano(booleano);
      const novoMapa: MapaPermissoes = { ...sintetizado };
      for (const row of (resPerm.data || [])) {
        (novoMapa as any)[row.permissao_slug] = row.valor as any; // explícito ganha
      }
      setMapa(novoMapa);
    } catch (e) {
      console.error("[useTemPermissao] erro:", e);
    }
    setCarregando(false);
  }, []);

  useEffect(() => {
    carregar();

    // Real-time: grupo do user, permissões explícitas OU o mapa booleano mudou
    if (!userId || !grupoId) return;

    const nomeCanal = `permissoes_user_${userId.substring(0, 8)}_${Date.now()}`;
    const ch = supabase.channel(nomeCanal);

    ch.on("postgres_changes" as any, { event: "*", schema: "public", table: "usuarios" }, (payload: any) => {
      if (payload.new?.auth_user_id && payload.new.auth_user_id === userId) carregar();
      else if (payload.new?.email && userEmail && String(payload.new.email).toLowerCase() === userEmail.toLowerCase()) carregar();
    });
    ch.on("postgres_changes" as any, { event: "*", schema: "public", table: "grupo_permissoes" }, (payload: any) => {
      if (payload.new?.grupo_id === grupoId || payload.old?.grupo_id === grupoId) carregar();
    });
    // 🆕 a tela de Configurações grava AQUI (mapa booleano) — recarrega na hora
    ch.on("postgres_changes" as any, { event: "*", schema: "public", table: "grupos_permissao" }, (payload: any) => {
      if (payload.new?.id === grupoId || payload.old?.id === grupoId) carregar();
    });

    ch.subscribe();

    return () => {
      try { supabase.removeChannel(ch); } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, grupoId]);

  // ─── Checks (com super/admin geral e fallback por prefixo) ─────────────
  const tem = useCallback(
    (slug: PermissaoSlug) => {
      if (superAdmin) return true;
      if (temPermissaoToggle(mapa, slug, userEmail)) return true;
      return escopoPorPrefixo(slug as string, boolMap) !== null;
    },
    [mapa, boolMap, userEmail, superAdmin]
  );

  const escopo = useCallback(
    (slug: PermissaoSlug): ValorEscopo => {
      if (superAdmin) return "all" as ValorEscopo;
      const v = escopoPermissao(mapa, slug, userEmail);
      if (v && v !== ("none" as ValorEscopo)) return v;
      return escopoPorPrefixo(slug as string, boolMap) ?? v;
    },
    [mapa, boolMap, userEmail, superAdmin]
  );

  const temAcesso = useCallback(
    (slug: PermissaoSlug) => {
      if (superAdmin) return true;
      if (temAcessoEscopo(mapa, slug, userEmail)) return true;
      return escopoPorPrefixo(slug as string, boolMap) !== null;
    },
    [mapa, boolMap, userEmail, superAdmin]
  );

  const filtroEscopo = useCallback(
    (slug: PermissaoSlug): FiltroEscopo => ({
      tipo: escopo(slug),
      userId,
      usuarioIdInterno,
      equipeId,
    }),
    [escopo, userId, usuarioIdInterno, equipeId]
  );

  return {
    carregando,
    superAdmin,
    userId,
    userEmail,
    usuarioIdInterno,
    equipeId,
    grupoId,
    grupoNome,
    mapa,
    tem,
    escopo,
    temAcesso,
    filtroEscopo,
    recarregar: carregar,
  };
}