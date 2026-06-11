"use client";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useTemPermissao } from "./useTemPermissao";
import { usePermissao } from "./usePermissao";

// ═══════════════════════════════════════════════════════════════════════
// 👥 useEquipeFiltro + <EquipeSelector /> — UnitaSystem (single-tenant)
// ═══════════════════════════════════════════════════════════════════════
// Adaptado pra single-tenant: NÃO precisa de workspaceId.
// Lê equipes globais da tabela `equipes` (sem filtro de workspace).
//
// 🔒 NOVO (v2): TRAVA por equipe pro usuário restrito (escopo "team").
//   - Super Admin OU grupo "Administração Geral" → escolhe qualquer equipe
//     (inclusive "Todas as equipes"), igual antes.
//   - Qualquer outro usuário COM equipe_id (ex: Diretor, Gerente, Supervisor)
//     → fica TRAVADO na própria equipe. O dropdown some e vira um rótulo
//     read-only. O filtro de dados passa a usar SEMPRE a equipe dele.
//
// USO:
//   const { equipes, equipeId, setEquipeId, EquipeSelector } = useEquipeFiltro();
//   <EquipeSelector />
//   const propsDaEquipe = propostas.filter(p => !equipeId || String(p.equipe_id) === equipeId);
// ═══════════════════════════════════════════════════════════════════════

export type Equipe = {
  id: string;
  nome: string;
  descricao?: string | null;
  ativo: boolean;
  created_at: string;
};

const LS_KEY = "equipe_filtro_v1__unita";

export function useEquipeFiltro(_workspaceId?: string) {
  const [equipes, setEquipes] = useState<Equipe[]>([]);
  const [equipeIdManual, setEquipeIdState] = useState<string>("");
  const [carregando, setCarregando] = useState(false);

  // ─── 🛡️ Permissões: define se o usuário é restrito a 1 equipe ──────────
  const perm = useTemPermissao();
  const { permissoes, isDono, isSuperAdmin, perfil, loading: loadingPerm } = usePermissao();
  const ehAdminGeral =
    perm.superAdmin || perm.grupoNome === "Administração Geral";
  // 🔓 Quem pode ver TODAS as vendas (admin geral / dono / super / "Ver todas as
  //    vendas" marcado no grupo) escolhe QUALQUER equipe — inclusive "Todas".
  const podeVerTudo =
    ehAdminGeral || isDono || isSuperAdmin || perfil === "Administrador"
    || !!(permissoes as any)?.vendas_todas;
  // 🔒 Usuário restrito (Diretor / Gerente sem acesso / Supervisor): tem equipe
  //    definida e NÃO pode ver tudo → fica travado na própria equipe.
  const equipeForcada =
    (!perm.carregando && !loadingPerm && !podeVerTudo && perm.equipeId != null)
      ? String(perm.equipeId)
      : null;
  const travado = equipeForcada !== null;

  // equipeId efetivo: se travado, usa SEMPRE a equipe dele; senão, a manual
  const equipeId = travado ? (equipeForcada as string) : equipeIdManual;

  // Carrega da localStorage uma vez (só relevante se não travado)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem(LS_KEY);
    if (stored) setEquipeIdState(stored);
  }, []);

  // Setter que persiste — IGNORA mudanças se o usuário está travado
  const setEquipeId = useCallback(
    (id: string) => {
      if (travado) return; // usuário restrito não troca de equipe
      setEquipeIdState(id);
      if (typeof window !== "undefined") {
        if (id) localStorage.setItem(LS_KEY, id);
        else localStorage.removeItem(LS_KEY);
      }
    },
    [travado]
  );

  // Fetch das equipes (todas, sem filtro de workspace)
  const fetchEquipes = useCallback(async () => {
    setCarregando(true);
    try {
      const { data, error } = await supabase
        .from("equipes")
        .select("*")
        .eq("ativo", true)
        .order("nome", { ascending: true });
      if (!error && data) setEquipes(data as Equipe[]);
    } catch {
      // Tabela não existe ainda → simplesmente sem equipes
    }
    setCarregando(false);
  }, []);

  useEffect(() => {
    fetchEquipes();
  }, [fetchEquipes]);

  // Realtime — atualiza quando equipe é criada/editada
  useEffect(() => {
    const ch = supabase
      .channel("equipes_rt_unita")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "equipes" },
        () => fetchEquipes()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [fetchEquipes]);

  // Se a equipe MANUAL selecionada foi removida, volta pra "todas"
  // (não mexe quando travado — a equipe forçada manda)
  useEffect(() => {
    if (travado) return;
    if (!equipeIdManual) return;
    if (
      equipes.length > 0 &&
      !equipes.find((e) => String(e.id) === equipeIdManual)
    ) {
      setEquipeId("");
    }
  }, [equipes, equipeIdManual, travado, setEquipeId]);

  const equipeSelecionada =
    equipes.find((e) => String(e.id) === equipeId) || null;

  // ─── Componente <EquipeSelector /> — cores azuis Unita 🔵 ───────────
  const EquipeSelector = ({
    mostrarSeVazio = false,
    estilo,
  }: {
    mostrarSeVazio?: boolean;
    estilo?: React.CSSProperties;
  }) => {
    // 🔒 TRAVADO: mostra a equipe fixa, sem dropdown (read-only)
    if (travado) {
      const nomeEquipe = equipeSelecionada?.nome || "Minha equipe";
      return (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "#eff6ff",
            border: "1px solid #bfdbfe",
            borderRadius: 12,
            padding: "6px 14px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
            ...estilo,
          }}
        >
          <span style={{ fontSize: 14, lineHeight: 1 }}>👥</span>
          <span
            style={{
              color: "#6b7280",
              fontSize: 10,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: 0.5,
              whiteSpace: "nowrap",
            }}
          >
            Equipe
          </span>
          <span
            style={{
              color: "#2563eb",
              fontSize: 13,
              fontWeight: 700,
              whiteSpace: "nowrap",
            }}
          >
            {nomeEquipe}
          </span>
        </div>
      );
    }

    if (!mostrarSeVazio && equipes.length === 0) return null;

    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: equipeId ? "#eff6ff" : "#ffffff",
          border: `1px solid ${equipeId ? "#bfdbfe" : "#e5e7eb"}`,
          borderRadius: 12,
          padding: "6px 12px 6px 14px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
          transition: "all 0.15s",
          ...estilo,
        }}
      >
        <span style={{ fontSize: 14, lineHeight: 1 }}>👥</span>
        <span
          style={{
            color: "#6b7280",
            fontSize: 10,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: 0.5,
            whiteSpace: "nowrap",
          }}
        >
          Equipe
        </span>
        <select
          value={equipeId}
          onChange={(e) => setEquipeId(e.target.value)}
          style={{
            background: "transparent",
            border: "none",
            outline: "none",
            color: equipeId ? "#2563eb" : "#1f2937",
            fontSize: 13,
            fontWeight: 700,
            cursor: equipes.length === 0 ? "not-allowed" : "pointer",
            padding: "4px 0",
            minWidth: 140,
          }}
          disabled={equipes.length === 0}
        >
          <option value="">🌐 Todas as equipes</option>
          {equipes.map((eq) => (
            <option key={eq.id} value={eq.id}>
              {eq.nome}
            </option>
          ))}
        </select>
      </div>
    );
  };

  return {
    equipes,
    equipeId,
    equipeSelecionada,
    setEquipeId,
    carregando,
    travado,
    EquipeSelector,
    refetch: fetchEquipes,
  };
}