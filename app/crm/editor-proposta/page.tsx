"use client";
export const dynamic = "force-dynamic";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import {
  CAMPOS_FIXOS,
  CAMPOS_FIXOS_MAP,
  SECOES_LABEL,
  montarCamposUnificados,
  type CampoUnificado,
  type ConfigCampoPadrao,
  type CampoCustom,
} from "../../lib/campos_proposta_definicao";

// ═══════════════════════════════════════════════════════════════════════
// 🛠️ EDITOR DE CAMPOS DA PROPOSTA — UnitaSystem PREMIUM
// ───────────────────────────────────────────────────────────────────────
// Single-tenant · Cores azul Unita · 12 tipos de campo
// Mover ↑▼ globalmente (sem restrição de seção)
// Campos custom HERDAM a seção do fixo anterior mais próximo
// Reflete EXATAMENTE na Nova Proposta
// ═══════════════════════════════════════════════════════════════════════

type TipoCustom = "texto" | "textarea" | "numero" | "moeda" | "data" | "dropdown" | "checkbox" | "arquivo" | "equipe" | "fila" | "usuario" | "etiqueta";

const TIPOS_CUSTOM: { valor: TipoCustom; label: string; icone: string; categoria: "basico" | "arquivo" | "auto" }[] = [
  { valor: "texto",    label: "Texto curto",    icone: "📝", categoria: "basico" },
  { valor: "textarea", label: "Texto longo",    icone: "📄", categoria: "basico" },
  { valor: "numero",   label: "Número",         icone: "🔢", categoria: "basico" },
  { valor: "moeda",    label: "Valor (R$)",     icone: "💰", categoria: "basico" },
  { valor: "data",     label: "Data",           icone: "📅", categoria: "basico" },
  { valor: "dropdown", label: "Seleção (manual)", icone: "📋", categoria: "basico" },
  { valor: "checkbox", label: "Sim / Não",      icone: "☑️", categoria: "basico" },
  { valor: "arquivo",  label: "Anexar arquivo", icone: "📎", categoria: "arquivo" },
  { valor: "equipe",   label: "Equipe (auto)",  icone: "🏢", categoria: "auto" },
  { valor: "fila",     label: "Fila (auto)",    icone: "🎯", categoria: "auto" },
  { valor: "usuario",  label: "Usuário (auto)", icone: "👤", categoria: "auto" },
  { valor: "etiqueta", label: "Etiqueta (auto)", icone: "🏷️", categoria: "auto" },
];

const TIPO_INFO: Record<string, { icone: string; cor: string; bg: string; descricao: string }> = {
  texto:    { icone: "📝", cor: "#3b82f6", bg: "#eff6ff", descricao: "Linha única de texto livre" },
  textarea: { icone: "📄", cor: "#6366f1", bg: "#eef2ff", descricao: "Múltiplas linhas de texto" },
  numero:   { icone: "🔢", cor: "#06b6d4", bg: "#ecfeff", descricao: "Apenas números" },
  moeda:    { icone: "💰", cor: "#16a34a", bg: "#f0fdf4", descricao: "Valor monetário (R$)" },
  data:     { icone: "📅", cor: "#ec4899", bg: "#fdf2f8", descricao: "Seletor de data" },
  dropdown: { icone: "📋", cor: "#f59e0b", bg: "#fffbeb", descricao: "Seleção entre opções definidas por você" },
  checkbox: { icone: "☑️", cor: "#16a34a", bg: "#f0fdf4", descricao: "Sim ou Não" },
  arquivo:  { icone: "📎", cor: "#8b5cf6", bg: "#f5f3ff", descricao: "Upload de arquivos (máx 20MB cada)" },
  equipe:   { icone: "🏢", cor: "#a855f7", bg: "#faf5ff", descricao: "Lê automaticamente as equipes cadastradas" },
  fila:     { icone: "🎯", cor: "#06b6d4", bg: "#ecfeff", descricao: "Lê automaticamente as filas cadastradas" },
  usuario:  { icone: "👤", cor: "#2563eb", bg: "#eff6ff", descricao: "Lê automaticamente os usuários do sistema" },
  etiqueta: { icone: "🏷️", cor: "#ec4899", bg: "#fdf2f8", descricao: "Lê automaticamente as etiquetas cadastradas" },
};

const labelToSlug = (label: string): string =>
  label.toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/(^_|_$)/g, "")
    .slice(0, 50);

const SECAO_META: Record<string, { icone: string; cor: string; descricao: string; ordem: number }> = {
  pessoal:        { icone: "👤", cor: "#2563eb", descricao: "Identificação do cliente",        ordem: 1 },
  endereco:       { icone: "📍", cor: "#06b6d4", descricao: "Onde será a instalação",           ordem: 2 },
  contato:        { icone: "📱", cor: "#8b5cf6", descricao: "Como falar com o cliente",         ordem: 3 },
  plano:          { icone: "📦", cor: "#f59e0b", descricao: "Serviço contratado",               ordem: 4 },
  agendamento:    { icone: "📅", cor: "#ec4899", descricao: "Quando instalar",                  ordem: 5 },
  vendedor:       { icone: "👨‍💼", cor: "#16a34a", descricao: "Atribuição interna",              ordem: 6 },
  status:         { icone: "🎯", cor: "#dc2626", descricao: "Situação atual da proposta",       ordem: 7 },
  personalizado:  { icone: "⚙️", cor: "#4f46e5", descricao: "Campos customizados",               ordem: 8 },
};

// 🔑 INFERÊNCIA DE SEÇÃO — fixos usam a `secao` do lib, customs herdam do fixo mais próximo
const getSecaoKey = (campos: CampoUnificado[], idx: number): string => {
  const campo = campos[idx];
  if (!campo) return "personalizado";
  if (campo.origem === "fixo") {
    return (campo as any).secao || "personalizado";
  }
  for (let i = idx - 1; i >= 0; i--) {
    if (campos[i].origem === "fixo" && (campos[i] as any).secao) {
      return (campos[i] as any).secao;
    }
  }
  for (let i = idx + 1; i < campos.length; i++) {
    if (campos[i].origem === "fixo" && (campos[i] as any).secao) {
      return (campos[i] as any).secao;
    }
  }
  return "personalizado";
};

export default function EditorProposta() {
  const router = useRouter();
  const [ehAdmin, setEhAdmin] = useState<boolean | null>(null);
  const [campos, setCampos] = useState<CampoUnificado[]>([]);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busca, setBusca] = useState("");
  const [secaoVisivel, setSecaoVisivel] = useState<string>("");
  const [tabelasFaltando, setTabelasFaltando] = useState<string[]>([]);
  const sectionsRef = useRef<Record<string, HTMLDivElement | null>>({});

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const inputStyle = {
    width: "100%",
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    padding: "9px 12px",
    color: "#1f2937",
    fontSize: 13,
    boxSizing: "border-box" as const,
    outline: "none",
    transition: "border-color 0.15s, box-shadow 0.15s",
  };
  const cardStyle = {
    background: "#ffffff",
    borderRadius: 14,
    border: "1px solid #e5e7eb",
    boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
  };

  // 🔐 Verifica admin
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/"); return; }
      const { data: me, error } = await supabase.from("usuarios").select("role").eq("auth_user_id", user.id).maybeSingle();
      if (error?.code === "PGRST205") {
        // Tabela `usuarios` não existe ainda → assume admin (primeira instalação)
        setEhAdmin(true);
        return;
      }
      if (!me) {
        // Fallback: se for o primeiro usuário, vira admin
        const { count } = await supabase.from("usuarios").select("*", { count: "exact", head: true });
        setEhAdmin((count || 0) === 0);
        return;
      }
      setEhAdmin(me.role === "admin");
    })();
  }, [router]);

  const fetchCampos = async () => {
    setLoading(true);
    const faltando: string[] = [];
    try {
      const [respConfig, respCustom] = await Promise.all([
        supabase.from("proposta_campos_padrao_config").select("*"),
        supabase.from("proposta_campos_customizados").select("*").eq("ativo", true).order("ordem", { ascending: true }),
      ]);

      if (respConfig.error?.code === "PGRST205") faltando.push("proposta_campos_padrao_config");
      if (respCustom.error?.code === "PGRST205") faltando.push("proposta_campos_customizados");
      setTabelasFaltando(faltando);

      const configs: ConfigCampoPadrao[] = (respConfig.data || []).map((c: any) => ({
        id: c.id,
        campo_slug: c.campo_slug,
        label_custom: c.label_custom,
        obrigatorio: c.obrigatorio,
        visivel: c.visivel,
        ordem: c.ordem,
        opcoes: Array.isArray(c.opcoes) ? c.opcoes : (typeof c.opcoes === "string" && c.opcoes ? JSON.parse(c.opcoes) : null),
        placeholder_custom: c.placeholder_custom,
      }));

      const customs: CampoCustom[] = (respCustom.data || []).map((c: any) => ({
        id: c.id,
        slug: c.slug,
        label: c.label,
        tipo: c.tipo,
        obrigatorio: c.obrigatorio,
        ordem: c.ordem,
        opcoes: Array.isArray(c.opcoes) ? c.opcoes : (typeof c.opcoes === "string" ? JSON.parse(c.opcoes) : []),
        placeholder: c.placeholder,
        ativo: c.ativo,
      }));

      const lista = montarCamposUnificados(configs, customs);

      const mostrarFixoMap = new Map<string, boolean>();
      for (const c of (respConfig.data || [])) {
        mostrarFixoMap.set(c.campo_slug, !!c.mostrar_na_lista);
      }
      const mostrarCustomMap = new Map<string, boolean>();
      for (const c of (respCustom.data || [])) {
        mostrarCustomMap.set(c.slug, !!c.mostrar_na_lista);
      }
      const enriquecida = lista.map(c => ({
        ...c,
        mostrar_na_lista: c.origem === "fixo"
          ? !!mostrarFixoMap.get(c.slug)
          : !!mostrarCustomMap.get(c.slug),
      }));
      setCampos(enriquecida as any);
      setDirty(false);
    } catch (e) {
      console.error("[EditorProposta] erro fetch:", e);
    }
    setLoading(false);
  };

  useEffect(() => { if (ehAdmin) fetchCampos(); }, [ehAdmin]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) { e.preventDefault(); e.returnValue = ""; return ""; }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        salvar();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campos, dirty, salvando]);

  useEffect(() => {
    if (campos.length === 0) return;
    const observer = new IntersectionObserver((entries) => {
      const visiveis = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visiveis.length > 0) {
        const id = visiveis[0].target.getAttribute("data-secao");
        if (id) setSecaoVisivel(id);
      }
    }, { rootMargin: "-20% 0px -60% 0px", threshold: 0 });
    Object.values(sectionsRef.current).forEach(el => { if (el) observer.observe(el); });
    return () => observer.disconnect();
  }, [campos]);

  const adicionarCustom = () => {
    const maxOrdem = campos.reduce((m, c) => Math.max(m, c.ordem), 0);
    const novo: CampoUnificado = {
      origem: "custom",
      slug: "",
      label: "",
      tipo: "texto",
      obrigatorio: false,
      visivel: true,
      ordem: maxOrdem + 1,
      opcoes: [],
    };
    setCampos([...campos, { ...novo, mostrar_na_lista: true } as any]);
    setDirty(true);
  };

  const atualizar = (idx: number, patch: Partial<CampoUnificado>) => {
    setCampos(campos.map((c, i) => i === idx ? { ...c, ...patch } : c));
    setDirty(true);
  };

  // 🆕 Mover GLOBAL (sem restrição de seção)
  const mover = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= campos.length) return;
    const novo = [...campos];
    [novo[idx], novo[target]] = [novo[target], novo[idx]];
    setCampos(novo.map((c, i) => ({ ...c, ordem: i })));
    setDirty(true);
  };

  const remover = async (idx: number) => {
    const c = campos[idx];
    if (c.origem === "fixo") {
      if (confirm(`Ocultar o campo "${c.label}"?\n\nEle deixa de aparecer no formulário, mas os dados existentes ficam preservados.`)) {
        atualizar(idx, { visivel: false });
      }
      return;
    }
    const msg = c.idCustom
      ? `Remover o campo "${c.label}"?\n\nOs valores já preenchidos nas propostas existentes NÃO serão excluídos.`
      : `Remover o campo "${c.label || "novo"}"?`;
    if (!confirm(msg)) return;

    if (c.idCustom) {
      const { error } = await supabase
        .from("proposta_campos_customizados")
        .update({ ativo: false })
        .eq("id", c.idCustom);
      if (error) { alert("Erro ao remover: " + error.message); return; }
    }
    setCampos(campos.filter((_, i) => i !== idx).map((c, i) => ({ ...c, ordem: i })));
    setDirty(true);
  };

  const adicionarOpcao = (idx: number) => {
    const c = campos[idx];
    atualizar(idx, { opcoes: [...(c.opcoes || []), ""] });
  };
  const atualizarOpcao = (idx: number, opIdx: number, valor: string) => {
    const c = campos[idx];
    const opcoes = [...(c.opcoes || [])];
    opcoes[opIdx] = valor;
    atualizar(idx, { opcoes });
  };
  const removerOpcao = (idx: number, opIdx: number) => {
    const c = campos[idx];
    atualizar(idx, { opcoes: (c.opcoes || []).filter((_, i) => i !== opIdx) });
  };

  const salvar = async () => {
    for (let i = 0; i < campos.length; i++) {
      const c = campos[i];
      if (c.origem === "custom") {
        if (!c.label.trim()) {
          alert(`Campo customizado #${i + 1} não tem nome. Preencha ou remova.`);
          return;
        }
        if (c.tipo === "dropdown") {
          const opcoesValidas = (c.opcoes || []).filter(o => o.trim());
          if (opcoesValidas.length === 0) {
            alert(`Campo "${c.label}" é uma Seleção (dropdown) mas não tem opções cadastradas.`);
            return;
          }
        }
      }
    }
    setSalvando(true);
    try {
      // ─── 1) Fixos ──
      const fixosNaLista = campos.filter(c => c.origem === "fixo");
      for (let i = 0; i < fixosNaLista.length; i++) {
        const c = fixosNaLista[i];
        const def = CAMPOS_FIXOS_MAP[c.slug];
        if (!def) continue;

        const labelMudou = c.label.trim() !== def.labelPadrao;
        const obrigMudou = c.obrigatorio !== def.obrigatorioPadrao;
        const ordemMudou = c.ordem !== def.ordemPadrao;

        let opcoesMudou = false;
        let opcoesFinal: string[] | null = null;
        if (def.tipo === "dropdown") {
          const opcoesAtuais = (c.opcoes || []).filter(o => String(o).trim());
          const opcoesPadrao = def.opcoes || [];
          opcoesMudou = JSON.stringify(opcoesAtuais) !== JSON.stringify(opcoesPadrao);
          if (opcoesMudou) opcoesFinal = opcoesAtuais;
        }

        const placeholderMudou = (c.placeholder || "").trim() !== (def.placeholderPadrao || "");
        const placeholderFinal = placeholderMudou ? (c.placeholder || null) : null;
        const mostrarNaListaAtual = !!(c as any).mostrar_na_lista;
        const mostrarMudou = mostrarNaListaAtual !== false;

        const labelCustomFinal = labelMudou ? c.label.trim() : null;
        const obrigatorioFinal = obrigMudou ? c.obrigatorio : null;
        const ordemFinal = ordemMudou ? c.ordem : null;

        if (!labelMudou && !obrigMudou && !ordemMudou && !opcoesMudou && !placeholderMudou && !mostrarMudou && c.visivel) {
          if (c.idConfig) {
            await supabase.from("proposta_campos_padrao_config")
              .delete()
              .eq("id", c.idConfig);
          }
          continue;
        }

        const payload: any = {
          campo_slug: c.slug,
          label_custom: labelCustomFinal,
          obrigatorio: obrigatorioFinal,
          visivel: c.visivel,
          ordem: ordemFinal,
          opcoes: opcoesFinal,
          placeholder_custom: placeholderFinal,
          mostrar_na_lista: mostrarNaListaAtual,
        };

        if (c.idConfig) {
          await supabase.from("proposta_campos_padrao_config")
            .update(payload)
            .eq("id", c.idConfig);
        } else {
          await supabase.from("proposta_campos_padrao_config")
            .insert([payload]);
        }
      }

      // ─── 2) Customs ──
      const customsNaLista = campos.filter(c => c.origem === "custom");
      const customsComSlug = customsNaLista.map(c => ({
        ...c,
        slug: (c.slug || labelToSlug(c.label)).slice(0, 50),
      }));

      const slugSet = new Set<string>();
      for (const c of customsComSlug) {
        if (!c.slug) {
          alert(`Campo "${c.label}" não conseguiu gerar slug. Renomeie.`);
          setSalvando(false); return;
        }
        if (slugSet.has(c.slug)) {
          alert(`Campos customizados com nome interno duplicado ("${c.slug}"). Renomeie um.`);
          setSalvando(false); return;
        }
        if (CAMPOS_FIXOS_MAP[c.slug]) {
          alert(`O nome "${c.slug}" conflita com um campo padrão. Escolha outro pro campo "${c.label}".`);
          setSalvando(false); return;
        }
        slugSet.add(c.slug);
      }

      const { data: existentes } = await supabase
        .from("proposta_campos_customizados")
        .select("id, slug");
      const slugsExistentes = new Map<string, number>((existentes || []).map(x => [x.slug, x.id]));

      for (const c of customsComSlug) {
        const existeId = slugsExistentes.get(c.slug);
        const mostrarNaLista = !!(c as any).mostrar_na_lista;
        if (existeId) {
          await supabase.from("proposta_campos_customizados").update({
            label: c.label,
            tipo: c.tipo,
            obrigatorio: c.obrigatorio,
            ordem: c.ordem,
            opcoes: c.tipo === "dropdown" ? (c.opcoes || []).filter(o => o.trim()) : null,
            ativo: true,
            placeholder: c.placeholder || null,
            mostrar_na_lista: mostrarNaLista,
          }).eq("id", existeId);
        } else {
          await supabase.from("proposta_campos_customizados").insert([{
            slug: c.slug,
            label: c.label,
            tipo: c.tipo,
            obrigatorio: c.obrigatorio,
            ordem: c.ordem,
            opcoes: c.tipo === "dropdown" ? (c.opcoes || []).filter(o => o.trim()) : null,
            ativo: true,
            placeholder: c.placeholder || null,
            mostrar_na_lista: mostrarNaLista,
          }]);
        }
      }

      alert("✅ Configurações salvas com sucesso!");
      await fetchCampos();
    } catch (e: any) {
      alert("Erro ao salvar: " + e.message);
    }
    setSalvando(false);
  };

  // 📊 Agrupa sequências consecutivas
  const grupos = useMemo(() => {
    const result: any[] = [];
    let grupoAtual: any = null;
    let secaoAtual: string | null = null;
    for (let i = 0; i < campos.length; i++) {
      const sec = getSecaoKey(campos, i);
      if (sec !== secaoAtual) {
        const labelRaw = (SECOES_LABEL as any)?.[sec];
        const label = typeof labelRaw === "string"
          ? labelRaw
          : (labelRaw?.titulo || labelRaw?.label || labelRaw?.nome || SECAO_META[sec]?.descricao || sec);
        const corCustom = (labelRaw && typeof labelRaw === "object" && labelRaw.cor) ? labelRaw.cor : null;
        const metaBase = SECAO_META[sec] || { icone: "📋", cor: "#6b7280", descricao: "", ordem: 99 };
        grupoAtual = {
          key: sec,
          keyUnica: `${sec}-${result.length}`,
          label,
          meta: corCustom ? { ...metaBase, cor: corCustom } : metaBase,
          itens: [] as { campo: CampoUnificado; idx: number }[],
        };
        result.push(grupoAtual);
        secaoAtual = sec;
      }
      grupoAtual.itens.push({ campo: campos[i], idx: i });
    }
    return result;
  }, [campos]);

  const secoesUnicas = useMemo(() => {
    const vistas = new Set<string>();
    const lista: any[] = [];
    for (const g of grupos) {
      if (vistas.has(g.key)) continue;
      vistas.add(g.key);
      lista.push({ key: g.key, meta: g.meta, label: g.label, primeiraKeyUnica: g.keyUnica });
    }
    for (const s of lista) {
      s.total = grupos.filter(g => g.key === s.key).reduce((acc, g) => acc + g.itens.length, 0);
    }
    return lista;
  }, [grupos]);

  const stats = useMemo(() => ({
    total: campos.length,
    fixos: campos.filter(c => c.origem === "fixo").length,
    custom: campos.filter(c => c.origem === "custom").length,
    visiveis: campos.filter(c => c.visivel).length,
    obrigatorios: campos.filter(c => c.obrigatorio).length,
    mostrarLista: campos.filter(c => (c as any).mostrar_na_lista).length,
  }), [campos]);

  const buscaLower = busca.trim().toLowerCase();
  const matchaBusca = (c: CampoUnificado) => {
    if (!buscaLower) return true;
    return c.label.toLowerCase().includes(buscaLower) || c.slug.toLowerCase().includes(buscaLower);
  };

  // Loading admin
  if (ehAdmin === null) {
    return (
      <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "#6b7280", fontSize: 13 }}>⏳ Verificando permissões...</div>
      </div>
    );
  }

  if (!ehAdmin) {
    return (
      <div style={{ minHeight: "70vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
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
            Só administradores podem editar os campos da proposta no UnitaSystem.
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
    <div style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: "Arial, sans-serif" }}>

      {/* HEADER STICKY */}
      <div style={{
        position: "sticky", top: 0, zIndex: 50,
        background: "rgba(248,250,252,0.85)",
        backdropFilter: "blur(12px)",
        borderBottom: "1px solid #e5e7eb",
        padding: isMobile ? "10px 12px" : "12px 28px",
      }}>
        <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "stretch" : "center", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: 1 }}>
            <div style={{
              width: isMobile ? 40 : 46, height: isMobile ? 40 : 46, borderRadius: 12,
              background: "linear-gradient(135deg, #2563eb 0%, #3b82f6 50%, #4f46e5 100%)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 22, boxShadow: "0 8px 20px rgba(37,99,235,0.30)",
              flexShrink: 0,
            }}>
              <span style={{ filter: "saturate(0) brightness(2)" }}>🛠️</span>
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                <h1 style={{ color: "#1f2937", fontSize: isMobile ? 16 : 18, fontWeight: 800, margin: 0, letterSpacing: -0.3 }}>Editor de Proposta</h1>
                <span style={{ color: "#2563eb", fontSize: 13, fontWeight: 600 }}>· {stats.total} campos</span>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 3, flexWrap: "wrap" }}>
                <p style={{ color: "#6b7280", fontSize: 11, margin: 0 }}>
                  UnitaSystem · <b style={{ color: "#2563eb" }}>Grupo Unita</b>
                </p>
                <span style={{ color: "#9ca3af", fontSize: 11 }}>
                  {stats.fixos} fixos · {stats.custom} personalizados · {stats.visiveis} visíveis · {stats.obrigatorios} obrigatórios
                </span>
                {dirty && <span style={{ fontSize: 10, color: "#f59e0b", fontWeight: 700, fontStyle: "italic" }}>● mudanças não salvas</span>}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <button onClick={() => {
              if (dirty && !confirm("Você tem mudanças não salvas. Sair mesmo assim?")) return;
              router.push("/crm/vendas");
            }}
              style={{
                background: "#ffffff", color: "#6b7280", border: "1px solid #e5e7eb",
                borderRadius: 10, padding: "8px 14px", fontSize: 12, cursor: "pointer",
                whiteSpace: "nowrap", fontWeight: 600,
              }}>← Voltar</button>
            <button onClick={salvar} disabled={salvando || loading}
              title="Ctrl+S"
              style={{
                background: salvando ? "#1e40af" : "linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)",
                color: "white", border: "none", borderRadius: 10,
                padding: "8px 18px", fontSize: 12, fontWeight: 700,
                cursor: salvando || loading ? "not-allowed" : "pointer",
                boxShadow: "0 4px 12px rgba(37,99,235,0.3)",
                whiteSpace: "nowrap",
              }}>
              {salvando ? "⏳ Salvando..." : "💾 Salvar Tudo"}
            </button>
          </div>
        </div>
      </div>

      {/* MAIN LAYOUT */}
      <div style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : "260px 1fr",
        gap: isMobile ? 14 : 22,
        padding: isMobile ? 12 : 28,
        maxWidth: 1400,
        margin: "0 auto",
      }}>

        {/* SIDEBAR */}
        {!isMobile && (
          <aside style={{ position: "sticky", top: 100, alignSelf: "start", display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ ...cardStyle, padding: 14 }}>
              <p style={{ color: "#6b7280", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.6, margin: "0 0 10px", fontWeight: 800 }}>
                📑 Seções
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {secoesUnicas.map(s => {
                  const ativa = secaoVisivel === s.primeiraKeyUnica || grupos.some(g => g.key === s.key && g.keyUnica === secaoVisivel);
                  return (
                    <button key={s.key} onClick={() => {
                      sectionsRef.current[s.primeiraKeyUnica]?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                      style={{
                        background: ativa ? `${s.meta.cor}10` : "transparent",
                        border: `1px solid ${ativa ? `${s.meta.cor}30` : "transparent"}`,
                        borderLeft: `3px solid ${ativa ? s.meta.cor : "transparent"}`,
                        borderRadius: 8, padding: "8px 10px",
                        cursor: "pointer", textAlign: "left",
                        transition: "all 0.15s",
                      }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 14 }}>{s.meta.icone}</span>
                        <span style={{ color: ativa ? s.meta.cor : "#374151", fontSize: 12, fontWeight: ativa ? 800 : 600, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {s.label}
                        </span>
                        <span style={{
                          fontSize: 10, fontWeight: 800,
                          color: ativa ? s.meta.cor : "#9ca3af",
                          background: ativa ? `${s.meta.cor}15` : "#f3f4f6",
                          padding: "1px 7px", borderRadius: 6,
                        }}>{s.total}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ ...cardStyle, padding: 14, background: "linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)", border: "1px solid #bfdbfe" }}>
              <p style={{ color: "#1e40af", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.6, margin: "0 0 8px", fontWeight: 800 }}>
                📊 Resumo
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <Stat label="Visíveis" valor={`${stats.visiveis}/${stats.total}`} cor="#2563eb" />
                <Stat label="Obrigatórios" valor={stats.obrigatorios.toString()} cor="#16a34a" />
                <Stat label="Na tela principal" valor={stats.mostrarLista.toString()} cor="#f59e0b" />
                <Stat label="Personalizados" valor={stats.custom.toString()} cor="#4f46e5" />
              </div>
            </div>

            <div style={{ ...cardStyle, padding: 14, background: "linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%)" }}>
              <p style={{ color: "#6b7280", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.6, margin: "0 0 8px", fontWeight: 800 }}>
                ⌨️ Atalho
              </p>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11 }}>
                <span style={{ color: "#6b7280" }}>Salvar</span>
                <kbd style={{ background: "#ffffff", border: "1px solid #d1d5db", padding: "2px 6px", borderRadius: 4, fontSize: 10, fontFamily: "monospace", color: "#374151", fontWeight: 700 }}>Ctrl+S</kbd>
              </div>
            </div>
          </aside>
        )}

        {/* CONTEÚDO */}
        <main style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>

          {/* Banner de tabelas faltando */}
          {tabelasFaltando.length > 0 && (
            <div style={{
              background: "linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)",
              border: "1px solid #fcd34d",
              borderLeft: "4px solid #f59e0b",
              borderRadius: 12,
              padding: "12px 16px",
              display: "flex",
              gap: 12,
              alignItems: "flex-start",
            }}>
              <span style={{ fontSize: 22 }}>⚠️</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ color: "#92400e", fontSize: 13, margin: 0, fontWeight: 700 }}>Tabelas não encontradas no Supabase</p>
                <p style={{ color: "#78350f", fontSize: 12, margin: "2px 0 0", lineHeight: 1.4 }}>
                  {tabelasFaltando.map(t => <code key={t} style={{ background: "#fef3c7", padding: "1px 6px", borderRadius: 4, fontFamily: "monospace", fontSize: 11.5, marginRight: 4 }}>{t}</code>)} — rode o SQL de setup pra criar.
                </p>
              </div>
            </div>
          )}

          <div style={{ ...cardStyle, padding: 12, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <input placeholder="🔍 Buscar campo por nome..." value={busca} onChange={e => setBusca(e.target.value)}
              style={{ ...inputStyle, flex: "1 1 240px", maxWidth: 400, borderRadius: 20 }} />
            <div style={{ flex: 1 }} />
            <button onClick={adicionarCustom}
              style={{
                background: "linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)",
                color: "white", border: "none", borderRadius: 10,
                padding: "9px 18px", fontSize: 12, fontWeight: 700, cursor: "pointer",
                boxShadow: "0 4px 12px rgba(79,70,229,0.3)",
                whiteSpace: "nowrap",
              }}>+ Campo Personalizado</button>
          </div>

          <div style={{ background: "linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)", border: "1px solid #bfdbfe", borderLeft: "4px solid #2563eb", borderRadius: 12, padding: "10px 16px", display: "flex", gap: 12, alignItems: "flex-start" }}>
            <span style={{ fontSize: 20, lineHeight: 1 }}>💡</span>
            <div style={{ flex: 1 }}>
              <p style={{ color: "#1e40af", fontSize: 12, fontWeight: 700, margin: 0 }}>Setas ↑▼ movem livremente</p>
              <p style={{ color: "#2563eb", fontSize: 11, margin: "2px 0 0", lineHeight: 1.5 }}>
                Você pode mover qualquer campo pra qualquer posição. Os campos personalizados <b>herdam automaticamente a seção</b> do campo padrão anterior — então onde você colocar aqui, é exatamente onde vai aparecer na <b>Nova Proposta</b>.
              </p>
            </div>
          </div>

          {loading ? (
            <>
              {[1, 2, 3].map(i => (
                <div key={i} style={{ ...cardStyle, padding: 20 }}>
                  <div style={{ height: 16, background: "#f3f4f6", borderRadius: 4, marginBottom: 14, width: "30%" }} />
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {[1, 2, 3].map(j => (
                      <div key={j} style={{ height: 60, background: "#f9fafb", borderRadius: 8 }} />
                    ))}
                  </div>
                </div>
              ))}
            </>
          ) : campos.length === 0 ? (
            <div style={{ ...cardStyle, padding: 48, textAlign: "center" }}>
              <p style={{ fontSize: 40, margin: "0 0 8px" }}>🛠️</p>
              <p style={{ color: "#6b7280", fontSize: 13 }}>Nenhum campo configurado ainda.</p>
            </div>
          ) : (
            grupos.map(g => {
              const itensFiltrados = g.itens.filter(({ campo }: any) => matchaBusca(campo));
              if (buscaLower && itensFiltrados.length === 0) return null;

              return (
                <div key={g.keyUnica}
                  ref={(el) => { sectionsRef.current[g.keyUnica] = el; }}
                  data-secao={g.keyUnica}
                  style={{ ...cardStyle, overflow: "hidden", scrollMarginTop: 110 }}>

                  <div style={{
                    padding: "14px 20px",
                    borderBottom: "1px solid #f3f4f6",
                    background: `${g.meta.cor}05`,
                    borderLeft: `4px solid ${g.meta.cor}`,
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                  }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 10,
                      background: `linear-gradient(135deg, ${g.meta.cor} 0%, ${g.meta.cor}cc 100%)`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 18, boxShadow: `0 4px 10px ${g.meta.cor}40`,
                      flexShrink: 0,
                    }}><span style={{ filter: "saturate(0) brightness(2)" }}>{g.meta.icone}</span></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h2 style={{ color: "#1f2937", fontSize: 14, fontWeight: 800, margin: 0, letterSpacing: -0.2 }}>{g.label}</h2>
                      {g.meta.descricao && <p style={{ color: "#9ca3af", fontSize: 11, margin: "2px 0 0" }}>{g.meta.descricao}</p>}
                    </div>
                    <span style={{
                      background: `${g.meta.cor}10`,
                      color: g.meta.cor,
                      border: `1px solid ${g.meta.cor}30`,
                      padding: "4px 10px",
                      borderRadius: 10,
                      fontSize: 11,
                      fontWeight: 800,
                      whiteSpace: "nowrap",
                    }}>{g.itens.length} {g.itens.length === 1 ? "campo" : "campos"}</span>
                  </div>

                  <div style={{ padding: isMobile ? 12 : 16, display: "flex", flexDirection: "column", gap: 10 }}>
                    {itensFiltrados.map(({ campo, idx }: any) => (
                      <CampoCard
                        key={`${campo.origem}-${campo.slug}-${idx}`}
                        campo={campo}
                        idx={idx}
                        totalCampos={campos.length}
                        secaoMeta={g.meta}
                        inputStyle={inputStyle}
                        isMobile={isMobile}
                        atualizar={atualizar}
                        mover={mover}
                        remover={remover}
                        adicionarOpcao={adicionarOpcao}
                        atualizarOpcao={atualizarOpcao}
                        removerOpcao={removerOpcao}
                      />
                    ))}
                  </div>
                </div>
              );
            })
          )}

          {!loading && campos.length > 0 && (
            <div style={{ ...cardStyle, padding: isMobile ? 14 : 18, background: "linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: dirty ? "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)" : "linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 20,
                  flexShrink: 0,
                }}><span style={{ filter: "saturate(0) brightness(2)" }}>{dirty ? "📝" : "✅"}</span></div>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <p style={{ color: "#1f2937", fontSize: 14, fontWeight: 800, margin: 0 }}>
                    {dirty ? "Você tem mudanças não salvas" : "Tudo salvo e sincronizado"}
                  </p>
                  <p style={{ color: "#6b7280", fontSize: 12, margin: "2px 0 0" }}>
                    {stats.total} campos configurados · {stats.visiveis} visíveis · {stats.obrigatorios} obrigatórios
                  </p>
                </div>
                <button onClick={salvar} disabled={salvando || loading}
                  style={{
                    background: salvando ? "#1e40af" : "linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)",
                    color: "white", border: "none", borderRadius: 10,
                    padding: "11px 28px", fontSize: 13, fontWeight: 700,
                    cursor: salvando || loading ? "not-allowed" : "pointer",
                    boxShadow: "0 4px 12px rgba(37,99,235,0.3)",
                    whiteSpace: "nowrap",
                  }}>{salvando ? "⏳ Salvando..." : "💾 Salvar Tudo"}</button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function Stat({ label, valor, cor }: { label: string; valor: string; cor: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11 }}>
      <span style={{ color: "#6b7280" }}>{label}</span>
      <span style={{ color: cor, fontWeight: 800 }}>{valor}</span>
    </div>
  );
}

function CampoCard({ campo, idx, totalCampos, secaoMeta, inputStyle, isMobile, atualizar, mover, remover, adicionarOpcao, atualizarOpcao, removerOpcao }: any) {
  const ehFixo = campo.origem === "fixo";
  const corBadge = ehFixo ? "#2563eb" : "#4f46e5";
  const bgBadge = ehFixo ? "#eff6ff" : "#eef2ff";
  const borderBadge = ehFixo ? "#bfdbfe" : "#c7d2fe";
  const labelBadge = ehFixo ? "🔒 Padrão" : "✨ Personalizado";
  const opacidade = !campo.visivel ? 0.55 : 1;

  const ehPrimeiroGlobal = idx === 0;
  const ehUltimoGlobal = idx === totalCampos - 1;

  // Pega info do tipo
  const tipoInfo = TIPO_INFO[campo.tipo] || { icone: "📝", cor: "#6b7280", bg: "#f3f4f6", descricao: "" };

  return (
    <div style={{
      background: "#fafbfc",
      borderRadius: 10,
      border: "1px solid #e5e7eb",
      borderLeft: `3px solid ${secaoMeta.cor}`,
      padding: 14,
      opacity: opacidade,
      transition: "opacity 0.15s",
    }}>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "auto 1fr auto" : "auto auto 1fr auto auto", gap: 10, alignItems: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <button onClick={() => mover(idx, -1)} disabled={ehPrimeiroGlobal} title={ehPrimeiroGlobal ? "Já é o primeiro" : "Mover pra cima"}
            style={{
              background: "#ffffff",
              color: ehPrimeiroGlobal ? "#d1d5db" : "#6b7280",
              border: "1px solid #e5e7eb",
              borderRadius: 6, width: 26, height: 20, fontSize: 9,
              cursor: ehPrimeiroGlobal ? "not-allowed" : "pointer", lineHeight: 1, fontWeight: 700,
            }}>▲</button>
          <button onClick={() => mover(idx, 1)} disabled={ehUltimoGlobal} title={ehUltimoGlobal ? "Já é o último" : "Mover pra baixo"}
            style={{
              background: "#ffffff",
              color: ehUltimoGlobal ? "#d1d5db" : "#6b7280",
              border: "1px solid #e5e7eb",
              borderRadius: 6, width: 26, height: 20, fontSize: 9,
              cursor: ehUltimoGlobal ? "not-allowed" : "pointer", lineHeight: 1, fontWeight: 700,
            }}>▼</button>
        </div>

        {!isMobile && (
          <span style={{
            background: bgBadge, color: corBadge,
            border: `1px solid ${borderBadge}`,
            padding: "4px 10px", borderRadius: 10, fontSize: 10,
            fontWeight: 700, whiteSpace: "nowrap",
          }}>{labelBadge}</span>
        )}

        <div>
          <input
            value={campo.label}
            onChange={(e) => atualizar(idx, { label: e.target.value })}
            placeholder={ehFixo ? campo.labelPadrao : 'Ex: "Operadora atual", "Documento RG"'}
            style={{ ...inputStyle, fontSize: 13, fontWeight: 600 }}
          />
          {ehFixo && campo.label !== campo.labelPadrao && (
            <p style={{ color: "#9ca3af", fontSize: 10, margin: "4px 0 0", fontStyle: "italic" }}>
              Padrão: {campo.labelPadrao} · slug: <code style={{ color: "#6b7280", background: "#f3f4f6", padding: "1px 5px", borderRadius: 4, border: "1px solid #e5e7eb" }}>{campo.slug}</code>
            </p>
          )}
        </div>

        {!isMobile && (ehFixo ? (
          <div style={{ minWidth: 160 }}>
            <span style={{ background: tipoInfo.bg, color: tipoInfo.cor, border: `1px solid ${tipoInfo.cor}40`, padding: "9px 14px", borderRadius: 10, fontSize: 12, display: "block", textAlign: "center", fontWeight: 600 }}>
              {tipoInfo.icone} {campo.tipo === "vendedor" ? "Vendedor" : campo.tipo === "telefone" ? "Telefone" : campo.tipo === "email" ? "E-mail" : campo.tipo === "data" ? "Data" : campo.tipo === "moeda" ? "Valor (R$)" : campo.tipo === "dropdown" ? "Seleção" : "Texto"}
            </span>
          </div>
        ) : (
          <select
            value={campo.tipo}
            onChange={(e) => {
              const novoTipo = e.target.value as TipoCustom;
              atualizar(idx, {
                tipo: novoTipo,
                opcoes: novoTipo === "dropdown" ? (campo.opcoes || [""]) : []
              });
            }}
            style={{ ...inputStyle, minWidth: 200 }}
          >
            <optgroup label="🔵 Básicos">
              {TIPOS_CUSTOM.filter(t => t.categoria === "basico").map(t => (
                <option key={t.valor} value={t.valor}>{t.icone} {t.label}</option>
              ))}
            </optgroup>
            <optgroup label="📎 Arquivo">
              {TIPOS_CUSTOM.filter(t => t.categoria === "arquivo").map(t => (
                <option key={t.valor} value={t.valor}>{t.icone} {t.label}</option>
              ))}
            </optgroup>
            <optgroup label="🔮 Auto-populados">
              {TIPOS_CUSTOM.filter(t => t.categoria === "auto").map(t => (
                <option key={t.valor} value={t.valor}>{t.icone} {t.label}</option>
              ))}
            </optgroup>
          </select>
        ))}

        <button onClick={() => remover(idx)}
          title={ehFixo ? "Ocultar campo (não pode ser deletado)" : "Remover campo"}
          style={{
            background: ehFixo ? "#fffbeb" : "#fef2f2",
            color: ehFixo ? "#f59e0b" : "#dc2626",
            border: `1px solid ${ehFixo ? "#fde68a" : "#fecaca"}`,
            borderRadius: 10, padding: "9px 12px", fontSize: 14,
            cursor: "pointer", height: 38, whiteSpace: "nowrap", fontWeight: 600,
          }}>{ehFixo ? "👁️‍🗨️" : "🗑️"}</button>
      </div>

      {isMobile && (
        <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{
            background: bgBadge, color: corBadge,
            border: `1px solid ${borderBadge}`,
            padding: "3px 10px", borderRadius: 10, fontSize: 10,
            fontWeight: 700, whiteSpace: "nowrap",
          }}>{labelBadge}</span>
          {ehFixo ? (
            <span style={{ background: tipoInfo.bg, color: tipoInfo.cor, border: `1px solid ${tipoInfo.cor}40`, padding: "5px 10px", borderRadius: 10, fontSize: 11, fontWeight: 600 }}>
              {tipoInfo.icone} {campo.tipo}
            </span>
          ) : (
            <select value={campo.tipo}
              onChange={(e) => {
                const novoTipo = e.target.value as TipoCustom;
                atualizar(idx, { tipo: novoTipo, opcoes: novoTipo === "dropdown" ? (campo.opcoes || [""]) : [] });
              }}
              style={{ ...inputStyle, flex: 1, padding: "5px 10px", fontSize: 12 }}>
              <optgroup label="Básicos">
                {TIPOS_CUSTOM.filter(t => t.categoria === "basico").map(t => (
                  <option key={t.valor} value={t.valor}>{t.icone} {t.label}</option>
                ))}
              </optgroup>
              <optgroup label="Arquivo">
                {TIPOS_CUSTOM.filter(t => t.categoria === "arquivo").map(t => (
                  <option key={t.valor} value={t.valor}>{t.icone} {t.label}</option>
                ))}
              </optgroup>
              <optgroup label="Auto-populados">
                {TIPOS_CUSTOM.filter(t => t.categoria === "auto").map(t => (
                  <option key={t.valor} value={t.valor}>{t.icone} {t.label}</option>
                ))}
              </optgroup>
            </select>
          )}
        </div>
      )}

      {/* Box informativo do tipo (apenas pra customs) */}
      {!ehFixo && tipoInfo.descricao && (
        <div style={{
          marginTop: 10,
          padding: "8px 12px",
          background: tipoInfo.bg,
          border: `1px solid ${tipoInfo.cor}30`,
          borderRadius: 8,
          fontSize: 11,
          color: tipoInfo.cor,
          display: "flex",
          gap: 8,
          alignItems: "flex-start",
        }}>
          <span style={{ fontSize: 14 }}>{tipoInfo.icone}</span>
          <span style={{ flex: 1, lineHeight: 1.4 }}>{tipoInfo.descricao}</span>
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{
          display: "flex", alignItems: "center", gap: 6, cursor: "pointer",
          background: campo.obrigatorio ? "#f0fdf4" : "#ffffff",
          border: `1px solid ${campo.obrigatorio ? "#bbf7d0" : "#e5e7eb"}`,
          padding: "5px 11px", borderRadius: 8,
        }}>
          <input type="checkbox" checked={campo.obrigatorio}
            onChange={(e) => atualizar(idx, { obrigatorio: e.target.checked })}
            style={{ accentColor: "#16a34a", width: 14, height: 14, cursor: "pointer" }} />
          <span style={{ color: campo.obrigatorio ? "#16a34a" : "#6b7280", fontSize: 11, fontWeight: 600 }}>⭐ Obrigatório</span>
        </label>

        <label style={{
          display: "flex", alignItems: "center", gap: 6, cursor: "pointer",
          background: campo.visivel ? "#eff6ff" : "#f3f4f6",
          border: `1px solid ${campo.visivel ? "#bfdbfe" : "#e5e7eb"}`,
          padding: "5px 11px", borderRadius: 8,
        }}>
          <input type="checkbox" checked={campo.visivel}
            onChange={(e) => atualizar(idx, { visivel: e.target.checked })}
            style={{ accentColor: campo.visivel ? "#2563eb" : "#9ca3af", width: 14, height: 14, cursor: "pointer" }} />
          <span style={{ color: campo.visivel ? "#2563eb" : "#6b7280", fontSize: 11, fontWeight: 600 }}>
            {campo.visivel ? "👁️ Visível" : "🙈 Oculto"}
          </span>
        </label>

        <label style={{
          display: "flex", alignItems: "center", gap: 6, cursor: "pointer",
          background: (campo as any).mostrar_na_lista ? "#fffbeb" : "#ffffff",
          border: `1px solid ${(campo as any).mostrar_na_lista ? "#fde68a" : "#e5e7eb"}`,
          padding: "5px 11px", borderRadius: 8,
        }}>
          <input type="checkbox" checked={!!(campo as any).mostrar_na_lista}
            onChange={(e) => atualizar(idx, { mostrar_na_lista: e.target.checked } as any)}
            style={{ accentColor: "#f59e0b", width: 14, height: 14, cursor: "pointer" }} />
          <span style={{ color: (campo as any).mostrar_na_lista ? "#d97706" : "#6b7280", fontSize: 11, fontWeight: 600 }}>
            📊 Tela principal
          </span>
        </label>

        {(campo.tipo === "texto" || campo.tipo === "textarea" || campo.tipo === "numero" || campo.tipo === "moeda" || campo.tipo === "telefone" || campo.tipo === "email") && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 200 }}>
            <span style={{ color: "#6b7280", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>Placeholder:</span>
            <input placeholder="Texto de exemplo (opcional)"
              value={campo.placeholder || ""}
              onChange={(e) => atualizar(idx, { placeholder: e.target.value })}
              style={{ ...inputStyle, padding: "5px 10px", fontSize: 11, flex: 1 }} />
          </div>
        )}
      </div>

      {campo.tipo === "dropdown" && (
        <div style={{ marginTop: 12, padding: 12, background: "#ffffff", borderRadius: 10, border: "1px solid #e5e7eb" }}>
          <p style={{ color: "#6b7280", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, margin: "0 0 8px", fontWeight: 700 }}>
            📋 Opções do dropdown
            {ehFixo && (
              <span style={{ color: "#9ca3af", fontSize: 10, marginLeft: 8, textTransform: "none", fontWeight: 500, fontStyle: "italic" }}>
                (você pode editar — vai sobrescrever a do sistema)
              </span>
            )}
          </p>
          {(campo.opcoes || []).map((op: string, opIdx: number) => (
            <div key={opIdx} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
              <input placeholder={`Opção ${opIdx + 1}`} value={op}
                onChange={(e) => atualizarOpcao(idx, opIdx, e.target.value)}
                style={{ ...inputStyle, padding: "6px 12px", fontSize: 12 }} />
              <button onClick={() => removerOpcao(idx, opIdx)}
                style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", borderRadius: 8, padding: "6px 12px", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>✕</button>
            </div>
          ))}
          <button onClick={() => adicionarOpcao(idx)}
            style={{ background: "#eff6ff", color: "#2563eb", border: "1px solid #bfdbfe", borderRadius: 8, padding: "6px 14px", fontSize: 12, cursor: "pointer", fontWeight: 700, marginTop: 4 }}>
            ➕ Adicionar opção
          </button>
        </div>
      )}
    </div>
  );
}