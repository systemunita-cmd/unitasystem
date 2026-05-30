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
// 🛡️ useTemPermissao — Hook React
// ─────────────────────────────────────────────────────────────────────
// Carrega o grupo do usuário logado e suas permissões. Expõe:
//
//   tem(slug)          → boolean (pra TOGGLE)
//   escopo(slug)       → 'none' | 'own' | 'team' | 'all'  (pra ESCOPO)
//   temAcesso(slug)    → boolean (escopo != 'none')
//   filtroEscopo(slug) → { tipo, userId, equipeId } pra filtrar queries
//
// Estados:
//   carregando         → true enquanto busca dados
//   superAdmin         → true se é o admin@grupounita
//   userId, userEmail  → dados do user logado
//   equipeId           → equipe atribuída ao usuário
//   grupoNome          → nome do grupo (pra mostrar como "cargo")
//
// Reage em tempo real a mudanças no grupo do user ou nas permissões do grupo.
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

export function useTemPermissao(): RetornoUseTemPermissao {
  const [carregando, setCarregando] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [usuarioIdInterno, setUsuarioIdInterno] = useState<number | null>(null);
  const [equipeId, setEquipeId] = useState<number | null>(null);
  const [grupoId, setGrupoId] = useState<number | null>(null);
  const [grupoNome, setGrupoNome] = useState<string | null>(null);
  const [mapa, setMapa] = useState<MapaPermissoes>({});

  const superAdmin = useMemo(() => isSuperAdmin(userEmail), [userEmail]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setUserId(null);
        setUserEmail(null);
        setUsuarioIdInterno(null);
        setEquipeId(null);
        setGrupoId(null);
        setGrupoNome(null);
        setMapa({});
        setCarregando(false);
        return;
      }

      setUserId(user.id);
      setUserEmail(user.email || null);

      // Busca registro na tabela usuarios
      const { data: usu } = await supabase
        .from("usuarios")
        .select("id, equipe_id, grupo_id, ativo")
        .eq("auth_user_id", user.id)
        .maybeSingle();

      if (!usu) {
        // Usuário ainda não cadastrado na tabela `usuarios` (super-admin pode bypass)
        setUsuarioIdInterno(null);
        setEquipeId(null);
        setGrupoId(null);
        setGrupoNome(null);
        setMapa({});
        setCarregando(false);
        return;
      }

      setUsuarioIdInterno(usu.id);
      setEquipeId(usu.equipe_id ?? null);
      setGrupoId(usu.grupo_id ?? null);

      // Sem grupo atribuído → mapa vazio (super-admin bypassa por código)
      if (!usu.grupo_id) {
        setGrupoNome(null);
        setMapa({});
        setCarregando(false);
        return;
      }

      // Busca nome do grupo + todas as permissões dele
      const [resGrupo, resPerm] = await Promise.all([
        supabase.from("grupos_permissao").select("nome").eq("id", usu.grupo_id).maybeSingle(),
        supabase.from("grupo_permissoes").select("permissao_slug, valor").eq("grupo_id", usu.grupo_id),
      ]);

      setGrupoNome(resGrupo.data?.nome ?? null);

      const novoMapa: MapaPermissoes = {};
      for (const row of (resPerm.data || [])) {
        novoMapa[row.permissao_slug] = row.valor as any;
      }
      setMapa(novoMapa);
    } catch (e) {
      console.error("[useTemPermissao] erro:", e);
    }
    setCarregando(false);
  }, []);

  useEffect(() => {
    carregar();

    // Real-time: se grupo mudar OU permissões do grupo mudarem, recarrega
    const ch = supabase.channel("permissoes_user_rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "usuarios" }, (payload: any) => {
        if (payload.new?.auth_user_id && payload.new.auth_user_id === userId) {
          carregar();
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "grupo_permissoes" }, (payload: any) => {
        if (payload.new?.grupo_id === grupoId || payload.old?.grupo_id === grupoId) {
          carregar();
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, grupoId]);

  // Funções de check (memorizadas)
  const tem = useCallback(
    (slug: PermissaoSlug) => temPermissaoToggle(mapa, slug, userEmail),
    [mapa, userEmail]
  );

  const escopo = useCallback(
    (slug: PermissaoSlug): ValorEscopo => escopoPermissao(mapa, slug, userEmail),
    [mapa, userEmail]
  );

  const temAcesso = useCallback(
    (slug: PermissaoSlug) => temAcessoEscopo(mapa, slug, userEmail),
    [mapa, userEmail]
  );

  // 🆕 Helper poderoso: monta o objeto pra aplicar em queries
  // Ex de uso:
  //   const f = filtroEscopo("contatos.ver");
  //   let q = supabase.from("contatos").select("*");
  //   if (f.tipo === "none") return [];
  //   if (f.tipo === "own") q = q.eq("atendente_id", f.usuarioIdInterno);
  //   if (f.tipo === "team") q = q.eq("equipe_id", f.equipeId);
  //   // tipo "all" => sem filtro
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