"use client";
export const dynamic = "force-dynamic";

import { useState, useEffect, useMemo, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { useTemPermissao } from "../../hooks/useTemPermissao";
import { usePermissao } from "../../hooks/usePermissao";
import {
  SECOES_LABEL,
  montarCamposUnificados,
  type CampoUnificado,
  type ConfigCampoPadrao,
  type CampoCustom,
} from "../../lib/campos_proposta_definicao";

// ═══════════════════════════════════════════════════════════════════════
// 🎯 NOVA PROPOSTA — UnitaSystem PREMIUM
// ───────────────────────────────────────────────────────────────────────
// Single-tenant · Cores azul Unita
// Sidebar + scroll spy + progresso · Auto-save · Máscaras · ViaCEP
// Inferência de seção (custom herda do fixo) · Agrupamento consecutivo
// Upload de anexos · Tipos auto-populados (equipe/fila/usuário/etiqueta)
// 🔍 Toda proposta nasce com status AGUARDANDO AUDITORIA por padrão
// ═══════════════════════════════════════════════════════════════════════

type UsuarioOpt = { id: string | number; email: string; nome: string; role?: string; equipe_id?: number | string | null; fila_id?: number | string | null };
type EquipeOpt = { id: string | number; nome: string; cor?: string; icone?: string };
type FilaOpt = { id: string | number; nome: string; cor?: string; icone?: string; equipe_id?: number | null };
type EtiquetaOpt = { id: string | number; nome: string; cor?: string; icone?: string };
type AnexoMeta = { url: string; nome: string; tipo: string; tamanho: number; enviado_em: string };

// 🔍 Status padrão de toda proposta nova
const STATUS_PADRAO = "AGUARDANDO AUDITORIA";

// ═══ MÁSCARAS ═══
const mascaraCPF = (v: string) =>
  v.replace(/\D/g, "").slice(0, 11)
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3}\.\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");

const mascaraCNPJ = (v: string) =>
  v.replace(/\D/g, "").slice(0, 14)
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2}\.\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{2}\.\d{3}\.\d{3})(\d)/, "$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");

const mascaraCEP = (v: string) =>
  v.replace(/\D/g, "").slice(0, 8)
    .replace(/^(\d{5})(\d)/, "$1-$2");

const mascaraTelefone = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 10) {
    return d.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d{1,4})$/, "$1-$2");
  }
  return d.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d{1,4})$/, "$1-$2");
};

const mascaraMoeda = (v: string | number) => {
  if (typeof v === "number") v = v.toString();
  const n = parseFloat(String(v).replace(/[^\d,]/g, "").replace(",", ".")) || 0;
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatarTamanhoArquivo = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

const iconeArquivo = (tipo: string): string => {
  if (tipo.startsWith("image/")) return "🖼️";
  if (tipo.includes("pdf")) return "📄";
  if (tipo.includes("word") || tipo.includes("document")) return "📝";
  if (tipo.includes("sheet") || tipo.includes("excel")) return "📊";
  if (tipo.includes("video")) return "🎬";
  if (tipo.includes("audio")) return "🎵";
  if (tipo.includes("zip") || tipo.includes("rar")) return "🗜️";
  return "📎";
};

// 🔤 Texto padrão do sistema: MAIÚSCULO, sem acento e sem ç ("José Gonçalves" → "JOSE GONCALVES")
const textoLimpo = (v: string): string =>
  v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();

// 🎨 Emoji de cada status (mesma lógica da tela de Vendas) — pro dropdown
const statusEmoji = (s: string): string => {
  const t = String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
  if (/CANCELAD|CHURN|FRAUDE|FR PREV/.test(t)) return "❌";
  if (/REPROVAD/.test(t)) return "⛔";
  if (/INSTALADA/.test(t)) return "✅";
  if (/BIOMETRIA/.test(t)) return "🪪";
  if (/AGUARDANDO AUDITORIA/.test(t)) return "🔍";
  if (/AUDIT/.test(t)) return "📋";
  if (/AGUARDANDO/.test(t)) return "🔧";
  if (/PENDENTE/.test(t)) return "⏳";
  if (/GERADA/.test(t)) return "📄";
  return "🔘";
};


// ═══ SEÇÃO META — mesmas cores do Editor Unita ═══
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

function PropostaForm() {
  // 🛡️ Permissões
  const perm = useTemPermissao();
  const { isDono: ehDono, perfil: perfilUsuario, permissoes: mapaPermissoes } = usePermissao();
  const escopoCrud = perm.escopo("propostas.crud");
  const podeAcessar = escopoCrud !== "none" || perm.superAdmin;
  const podeEditarValores = perm.tem("propostas.editar_valores");
  const podeMarcarInstalada = perm.tem("propostas.marcar_instalada");
  const podeMarcarCancelada = perm.tem("propostas.marcar_cancelada");

  // 🔒 Trava por equipe (Diretor/escopo team) — o conjunto de equipes permitidas
  // é derivado mais abaixo (idsEquipesPermitidas), honrando equipes_acesso do BKO/gerente.
  const ehAdminGeralProp = perm.superAdmin || perm.grupoNome === "Administração Geral";

  // 🔒 Vendedor (atendente) NÃO escolhe o status ao criar: fica travado em
  //    "AGUARDANDO AUDITORIA". Supervisor/admin/super/dono escolhem normal.
  //    ehAdmin (state) = role admin OU supervisor; resolve no carregamento.
  const vendedorTravaStatus = !ehAdmin && !ehAdminGeralProp && !ehDono && !perm.superAdmin;

  const router = useRouter();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(false);
  const [salvandoRascunho, setSalvandoRascunho] = useState(false);
  const [carregandoUsuarios, setCarregandoUsuarios] = useState(true);
  const [carregandoCampos, setCarregandoCampos] = useState(true);

  const [usuarios, setUsuarios] = useState<UsuarioOpt[]>([]);
  const [userEmail, setUserEmail] = useState<string>("");
  const [userId, setUserId] = useState<string>("");
  const [ehAdmin, setEhAdmin] = useState<boolean>(false);
  const [minhaFilaId, setMinhaFilaId] = useState<number | string | null>(null);
  const [minhasEquipesAcesso, setMinhasEquipesAcesso] = useState<number[]>([]);
  const [minhasFilasAcesso, setMinhasFilasAcesso] = useState<number[]>([]);

  const [equipesAuto, setEquipesAuto] = useState<EquipeOpt[]>([]);
  const [filasAuto, setFilasAuto] = useState<FilaOpt[]>([]);
  const [etiquetasAuto, setEtiquetasAuto] = useState<EtiquetaOpt[]>([]);

  const [camposUnificados, setCamposUnificados] = useState<CampoUnificado[]>([]);
  const [tabelasFaltando, setTabelasFaltando] = useState<string[]>([]);

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const [form, setForm] = useState<Record<string, any>>({
    // ⚠️ data LOCAL — toISOString() é UTC e depois das ~21h jogava a venda pro dia seguinte
    data_proposta: (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })(),
    nome: searchParams.get("nome") || "",
    telefone1: searchParams.get("numero") || "",
    // 🔍 Padrão: toda proposta nova nasce AGUARDANDO AUDITORIA
    status_venda: STATUS_PADRAO,
  });
  const [dadosCustomizados, setDadosCustomizados] = useState<Record<string, any>>({});
  const [dirty, setDirty] = useState(false);

  // Rascunho
  const [rascunhoDisponivel, setRascunhoDisponivel] = useState<{ form: any; dadosCustomizados: any; salvoEm: number } | null>(null);
  const [rascunhoLido, setRascunhoLido] = useState(false);

  // Scroll spy
  const [secaoVisivel, setSecaoVisivel] = useState<string>("");
  const sectionsRef = useRef<Record<string, HTMLDivElement | null>>({});

  // CEP loading
  const [buscandoCep, setBuscandoCep] = useState(false);

  // Busca de cliente por CPF (cadastro interno)
  const [buscandoCpf, setBuscandoCpf] = useState(false);
  const [cpfEncontrado, setCpfEncontrado] = useState(false);

  // Upload loading
  const [uploadando, setUploadando] = useState<Record<string, boolean>>({});

  // 🔑 Chave fixa do rascunho pro Unita
  const rascunhoKey = "rascunho_proposta_unita";

  // ═══════════════════════════════════════════════════════════════════
  // 📜 INIT
  // ═══════════════════════════════════════════════════════════════════
  useEffect(() => {
    const carregar = async () => {
      setCarregandoUsuarios(true);
      setCarregandoCampos(true);
      const faltando: string[] = [];
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { router.push("/"); return; }
        setUserEmail(user.email || "");
        setUserId(user.id);

        // ── Carrega lista de usuários (e detecta admin) ──
        const respUsuarios = await supabase.from("usuarios")
          .select("id, email, nome, role, fila_id, equipe_id, equipes_acesso, filas_acesso")
          .order("nome");

        if (respUsuarios.error?.code === "PGRST205") faltando.push("usuarios");

        const lista: UsuarioOpt[] = (respUsuarios.data || []).map((u: any) => ({
          id: u.id, email: u.email, nome: u.nome || u.email, role: u.role, equipe_id: u.equipe_id, fila_id: u.fila_id,
        }));
        if (lista.length === 0 && user.email) {
          // Fallback: primeiro user vira admin
          lista.push({ id: user.id, email: user.email, nome: user.email });
          setEhAdmin(true);
        } else {
          const me = lista.find(u => u.email?.toLowerCase() === user.email?.toLowerCase());
          setEhAdmin(me?.role === "admin" || me?.role === "supervisor");
        }
        setUsuarios(lista);
        const meuRaw = (respUsuarios.data || []).find((u: any) => u.email?.toLowerCase() === user.email?.toLowerCase());
        setMinhaFilaId(meuRaw?.fila_id ?? null);
        setMinhasEquipesAcesso(Array.isArray(meuRaw?.equipes_acesso) ? meuRaw.equipes_acesso : []);
        setMinhasFilasAcesso(Array.isArray(meuRaw?.filas_acesso) ? meuRaw.filas_acesso : []);

        setForm(p => ({ ...p, vendedor: user.email || "" }));
        setCarregandoUsuarios(false);

        // ── Campos da proposta ──
        const [respConfig, respCustom] = await Promise.all([
          supabase.from("proposta_campos_padrao_config").select("*"),
          supabase.from("proposta_campos_customizados").select("*").eq("ativo", true).order("ordem", { ascending: true }),
        ]);

        if (respConfig.error?.code === "PGRST205") faltando.push("proposta_campos_padrao_config");
        if (respCustom.error?.code === "PGRST205") faltando.push("proposta_campos_customizados");

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

        const lista2 = montarCamposUnificados(configs, customs).filter(c => c.visivel);
        setCamposUnificados(lista2);

        const initDados: Record<string, any> = {};
        for (const c of lista2) {
          if (c.origem === "custom") {
            const t = c.tipo as string;
            initDados[c.slug] = t === "checkbox" ? false : t === "arquivo" ? [] : "";
          }
        }
        setDadosCustomizados(initDados);

        // ── Listas auto-populadas ──
        const tiposPresentes = new Set(lista2.map(c => c.tipo as string));
        const promises: Promise<any>[] = [];
        if (tiposPresentes.has("equipe")) {
          promises.push(
            supabase.from("equipes").select("id, nome, cor, icone").eq("ativo", true).order("nome")
              .then(r => { if (r.error?.code === "PGRST205") faltando.push("equipes"); setEquipesAuto(r.data || []); })
          );
        }
        if (tiposPresentes.has("fila")) {
          promises.push(
            supabase.from("filas").select("id, nome, cor, icone, equipe_id").order("nome")
              .then(r => { if (r.error?.code === "PGRST205") faltando.push("filas"); setFilasAuto(r.data || []); })
          );
        }
        if (tiposPresentes.has("etiqueta")) {
          promises.push(
            supabase.from("etiquetas").select("id, nome, cor, icone").order("nome")
              .then(r => { if (r.error?.code === "PGRST205") faltando.push("etiquetas"); setEtiquetasAuto(r.data || []); })
          );
        }
        await Promise.all(promises);
        setTabelasFaltando(faltando);
      } catch (e) { console.error("Erro ao carregar:", e); }
      setCarregandoCampos(false);
    };
    carregar();
  }, [router]);

  // ═══ RASCUNHO ═══
  useEffect(() => {
    if (rascunhoLido) return;
    try {
      const raw = localStorage.getItem(rascunhoKey);
      if (raw) {
        const obj = JSON.parse(raw);
        if (obj?.form?.nome || obj?.form?.telefone1 || (obj?.dadosCustomizados && Object.keys(obj.dadosCustomizados).length > 0)) {
          setRascunhoDisponivel(obj);
        }
      }
    } catch (e) { /* ignore */ }
    setRascunhoLido(true);
  }, [rascunhoLido]);

  const recuperarRascunho = () => {
    if (!rascunhoDisponivel) return;
    setForm(rascunhoDisponivel.form);
    setDadosCustomizados(rascunhoDisponivel.dadosCustomizados);
    setRascunhoDisponivel(null);
    setDirty(true);
  };
  const descartarRascunho = () => {
    localStorage.removeItem(rascunhoKey);
    setRascunhoDisponivel(null);
  };

  // ═══ AUTO-SAVE ═══
  useEffect(() => {
    if (!dirty) return;
    setSalvandoRascunho(true);
    const t = setTimeout(() => {
      try {
        localStorage.setItem(rascunhoKey, JSON.stringify({
          form, dadosCustomizados, salvoEm: Date.now(),
        }));
        setSalvandoRascunho(false);
      } catch (e) { setSalvandoRascunho(false); }
    }, 1000);
    return () => clearTimeout(t);
  }, [form, dadosCustomizados, dirty]);

  // ═══ BEFORE UNLOAD ═══
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) { e.preventDefault(); e.returnValue = ""; return ""; }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  // ═══ ATALHOS ═══
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSubmit();
      } else if (e.key === "Escape") {
        handleCancelar();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, dadosCustomizados, dirty]);

  // ═══ SCROLL SPY ═══
  useEffect(() => {
    if (camposUnificados.length === 0) return;
    const observer = new IntersectionObserver((entries) => {
      const visiveis = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visiveis.length > 0) {
        const id = visiveis[0].target.getAttribute("data-secao");
        if (id) setSecaoVisivel(id);
      }
    }, { rootMargin: "-20% 0px -60% 0px", threshold: 0 });
    Object.values(sectionsRef.current).forEach(el => { if (el) observer.observe(el); });
    return () => observer.disconnect();
  }, [camposUnificados]);

  // ═══ ViaCEP ═══
  const buscarCep = async (cep: string) => {
    const limpo = cep.replace(/\D/g, "");
    if (limpo.length !== 8) return;
    setBuscandoCep(true);
    try {
      const r = await fetch(`https://viacep.com.br/ws/${limpo}/json/`);
      const data = await r.json();
      if (!data.erro) {
        setForm(prev => ({
          ...prev,
          cep: mascaraCEP(limpo),
          endereco: data.logradouro ? `${data.logradouro}${data.bairro ? `, ${data.bairro}` : ""}` : prev.endereco,
          cidade: data.localidade || prev.cidade,
          estado: data.uf || prev.estado,
        }));
        setDirty(true);
      }
    } catch (e) { /* ignore */ }
    setBuscandoCep(false);
  };

  // ═══ Busca de cliente pelo CPF no cadastro interno (tabela proposta) ═══
  // Ao digitar um CPF completo (11 dígitos), procura a proposta mais recente
  // com esse documento e preenche os dados pessoais que ainda estiverem vazios.
  const buscarClientePorCpf = async (cpf: string) => {
    const digitos = cpf.replace(/\D/g, "");
    if (digitos.length !== 11) return; // só pessoa física
    setBuscandoCpf(true);
    setCpfEncontrado(false);
    try {
      const mascarado = mascaraCPF(digitos);
      const { data } = await supabase
        .from("proposta")
        .select("nome, data_nascimento, nome_mae, rg, email, endereco, cep, cidade, estado, telefone1, telefone2, telefone3, dados_customizados, created_at")
        .or(`cpf.eq.${mascarado},cpf.eq.${digitos}`)
        .order("created_at", { ascending: false })
        .limit(1);
      const cli: any = data && data[0];
      if (cli) {
        setForm(prev => {
          const next: Record<string, any> = { ...prev };
          const campos = ["nome", "data_nascimento", "nome_mae", "rg", "email", "endereco", "cep", "cidade", "estado", "telefone1", "telefone2", "telefone3"];
          campos.forEach(k => {
            const v = cli[k];
            const vazio = next[k] == null || String(next[k]).trim() === "";
            if (v != null && String(v).trim() !== "" && vazio) next[k] = v;
          });
          return next;
        });
        const dcAnt = cli.dados_customizados || {};
        if (dcAnt.numero_ou_complemento) {
          setDadosCustomizados(prev =>
            (prev.numero_ou_complemento == null || String(prev.numero_ou_complemento).trim() === "")
              ? { ...prev, numero_ou_complemento: dcAnt.numero_ou_complemento }
              : prev
          );
        }
        setDirty(true);
        setCpfEncontrado(true);
      }
    } catch (e) { /* ignore */ }
    setBuscandoCpf(false);
  };

  // ═══ UPLOAD ═══
  const uploadArquivo = async (slug: string, files: FileList) => {
    if (!userId) { alert("Sessão expirou."); return; }
    setUploadando(prev => ({ ...prev, [slug]: true }));
    const novosAnexos: AnexoMeta[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > 20 * 1024 * 1024) {
        alert(`"${file.name}" excede 20 MB e foi pulado.`);
        continue;
      }
      try {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${userId}/${Date.now()}-${safeName}`;
        const { error } = await supabase.storage.from("propostas-anexos").upload(path, file, {
          cacheControl: "3600", upsert: false,
        });
        if (error) { alert(`Erro ao enviar "${file.name}": ${error.message}`); continue; }
        const { data: urlData } = supabase.storage.from("propostas-anexos").getPublicUrl(path);
        novosAnexos.push({
          url: urlData.publicUrl,
          nome: file.name,
          tipo: file.type || "application/octet-stream",
          tamanho: file.size,
          enviado_em: new Date().toISOString(),
        });
      } catch (e: any) {
        alert(`Erro inesperado em "${file.name}": ${e.message}`);
      }
    }

    if (novosAnexos.length > 0) {
      setDadosCustomizados(prev => {
        const atuais = Array.isArray(prev[slug]) ? prev[slug] : [];
        return { ...prev, [slug]: [...atuais, ...novosAnexos] };
      });
      setDirty(true);
    }
    setUploadando(prev => ({ ...prev, [slug]: false }));
  };

  const removerAnexo = (slug: string, idx: number) => {
    setDadosCustomizados(prev => {
      const atuais = Array.isArray(prev[slug]) ? prev[slug] : [];
      return { ...prev, [slug]: atuais.filter((_: any, i: number) => i !== idx) };
    });
    setDirty(true);
  };

  // ═══ SUBMIT ═══
  const handleSubmit = async () => {
    // Validação de obrigatórios
    for (let idx = 0; idx < camposUnificados.length; idx++) {
      const c = camposUnificados[idx];
      if (!c.obrigatorio) continue;
      const valor = c.origem === "fixo" ? form[c.slug] : dadosCustomizados[c.slug];
      let vazio = false;
      if (c.tipo === "checkbox") vazio = valor !== true;
      else if ((c.tipo as string) === "arquivo") vazio = !Array.isArray(valor) || valor.length === 0;
      else vazio = (valor === undefined || valor === null || String(valor).trim() === "");
      if (vazio) {
        alert(`O campo "${c.label}" é obrigatório.`);
        const secao = getSecaoKey(camposUnificados, idx);
        const grupo = secoesAgrupadas.find((g: any) => g.key === secao);
        if (grupo) {
          const el = sectionsRef.current[grupo.keyUnica];
          if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        return;
      }
    }

    setLoading(true);

    const up = (v: any) => (typeof v === "string" ? textoLimpo(v) : v);
    // 🏢 Garante que o tipo de pessoa e os campos de CNPJ/sócio SEMPRE vão pro banco
    //    (antes só gravava se o usuário tivesse clicado no botão CNPJ — quem digitava
    //     14 dígitos direto perdia tudo). tipoPessoa já considera o documento.
    const dadosCustomFinal: Record<string, any> = { ...dadosCustomizados, tipo_pessoa: tipoPessoa };
    if (tipoPessoa === "cpf") {
      // pessoa física não tem dados de CNPJ/sócio — limpa pra não sujar
      for (const s of ["cnpj_nome_fantasia", "cnpj_inscricao_estadual", "socio_nome", "socio_cpf", "socio_rg", "socio_nascimento", "socio_nome_mae"]) {
        delete dadosCustomFinal[s];
      }
    }
    const payload: any = {
      criado_por: perm.userEmail || null,
      equipe_id_criador: perm.equipeId || null,
      data_proposta: form.data_proposta || null,
      nome: up(form.nome || ""),
      cpf: form.cpf || "",
      data_nascimento: form.data_nascimento || null,
      nome_mae: up(form.nome_mae || ""),
      rg: up(form.rg || ""),
      email: form.email || "",
      endereco: up(form.endereco || ""),
      cep: form.cep || "",
      cidade: up(form.cidade || ""),
      estado: up(form.estado || ""),
      telefone1: form.telefone1 || "",
      telefone2: form.telefone2 || "",
      telefone3: form.telefone3 || "",
      vencimento: form.vencimento || "",
      forma_pagamento: form.forma_pagamento || "",
      plano: form.plano || "",
      valor_plano: form.valor_plano ? Number(String(form.valor_plano).replace(/\./g, "").replace(",", ".")) : null,
      data_agendamento: form.data_agendamento || null,
      periodo_instalacao: form.periodo_instalacao || "",
      vendedor: form.vendedor || "",
      // 🔒 Vendedor sempre grava AGUARDANDO AUDITORIA, ignorando qualquer valor no form.
      status_venda: vendedorTravaStatus ? STATUS_PADRAO : (form.status_venda || STATUS_PADRAO),
      data_instalacao: form.data_instalacao || null,
      data_cancelamento: form.data_cancelamento || null,
      operadora: form.operadora || "",
      dados_customizados: dadosCustomFinal,
    };

    const { error } = await supabase.from("proposta").insert([payload]);
    setLoading(false);

    if (error) {
      alert("Erro ao salvar proposta: " + error.message);
      return;
    }
    localStorage.removeItem(rascunhoKey);
    setDirty(false);
    alert("✅ Proposta cadastrada com sucesso!");
    router.push("/crm/vendas");
  };

  const handleCancelar = () => {
    if (dirty && !confirm("Você tem mudanças não salvas. Sair mesmo assim?\n\n(O rascunho fica salvo pra você continuar depois)")) return;
    router.push("/crm/vendas");
  };

  // ═══ PROGRESSO ═══
  const camposObrig = useMemo(() => camposUnificados.filter(c => c.obrigatorio), [camposUnificados]);
  const isCampoPreenchido = (c: CampoUnificado): boolean => {
    const v = c.origem === "fixo" ? form[c.slug] : dadosCustomizados[c.slug];
    if (c.tipo === "checkbox") return v === true;
    if ((c.tipo as string) === "arquivo") return Array.isArray(v) && v.length > 0;
    return v !== undefined && v !== null && String(v).trim() !== "";
  };
  const camposObrigPreenchidos = useMemo(() => camposObrig.filter(isCampoPreenchido).length, [camposObrig, form, dadosCustomizados]);
  const pctTotal = camposObrig.length === 0 ? 100 : Math.round((camposObrigPreenchidos / camposObrig.length) * 100);

  // 📊 Agrupa SEQUÊNCIAS consecutivas
  const secoesAgrupadas = useMemo(() => {
    const result: any[] = [];
    let grupoAtual: any = null;
    let secaoAtual: string | null = null;
    for (let i = 0; i < camposUnificados.length; i++) {
      const sec = getSecaoKey(camposUnificados, i);
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
          campos: [] as CampoUnificado[],
        };
        result.push(grupoAtual);
        secaoAtual = sec;
      }
      grupoAtual.campos.push(camposUnificados[i]);
    }
    return result;
  }, [camposUnificados]);

  const progressoSecao = (campos: CampoUnificado[]) => {
    const obrig = campos.filter(c => c.obrigatorio);
    if (obrig.length === 0) {
      const preench = campos.filter(isCampoPreenchido).length;
      return { obrig: 0, total: campos.length, preench, pct: campos.length === 0 ? 0 : Math.round((preench / campos.length) * 100) };
    }
    const preench = obrig.filter(isCampoPreenchido).length;
    return { obrig: obrig.length, total: campos.length, preench, pct: Math.round((preench / obrig.length) * 100) };
  };

  // ═══ ESTILOS ═══
  const inputStyleBase = {
    width: "100%",
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    padding: "10px 14px",
    color: "#1f2937",
    fontSize: 14,
    boxSizing: "border-box" as const,
    outline: "none",
    transition: "border-color 0.15s, box-shadow 0.15s",
  };
  const labelStyle = {
    color: "#6b7280",
    fontSize: 11,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
    marginBottom: 6,
    display: "flex" as const,
    alignItems: "center" as const,
    gap: 6,
    fontWeight: 700,
  };
  const cardStyle = {
    background: "#ffffff",
    borderRadius: 14,
    border: "1px solid #e5e7eb",
    boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
  };

  const inputStyleParaCampo = (c: CampoUnificado): React.CSSProperties => {
    const ok = isCampoPreenchido(c);
    if (c.obrigatorio && ok) {
      return { ...inputStyleBase, borderColor: "#bbf7d0", background: "linear-gradient(135deg, #ffffff 0%, #f0fdf4 100%)" };
    }
    return inputStyleBase;
  };

  const setCampoFixo = (slug: string, valor: any) => {
    setForm(p => ({ ...p, [slug]: valor }));
    setDirty(true);
  };
  const setCampoCustom = (slug: string, valor: any) => {
    setDadosCustomizados(p => ({ ...p, [slug]: valor }));
    setDirty(true);
  };

  // 🔄 Troca CPF <-> CNPJ. Ao virar CNPJ limpa campos só de pessoa física;
  //    ao voltar pra CPF limpa os extras de CNPJ e do sócio. Documento (cpf) e nome ficam.
  const trocarTipoPessoa = (t: "cpf" | "cnpj") => {
    setCampoCustom("tipo_pessoa", t);
    if (t === "cnpj") {
      ["rg", "data_nascimento", "nome_mae"].forEach(s => setCampoFixo(s, ""));
    } else {
      ["cnpj_nome_fantasia", "cnpj_inscricao_estadual",
       "socio_nome", "socio_cpf", "socio_rg", "socio_nascimento", "socio_nome_mae"]
        .forEach(s => setCampoCustom(s, ""));
    }
  };

  // 🏢 Bloco "Dados do Sócio" — aparece só no modo CNPJ. Tudo em dados_customizados.
  const renderInputSocio = (slug: string, label: string, opts?: { tipo?: "data"; cpf?: boolean; ph?: string }) => {
    const v = dadosCustomizados[slug] || "";
    const onCh = (val: string) => setCampoCustom(slug, val);
    let input;
    if (opts?.tipo === "data") {
      input = <input type="date" value={v} onChange={e => onCh(e.target.value)} style={inputStyleBase} />;
    } else if (opts?.cpf) {
      input = <input value={v} placeholder="000.000.000-00" onChange={e => onCh(mascaraCPF(e.target.value))} style={inputStyleBase} />;
    } else {
      input = <input value={v} placeholder={opts?.ph || ""} onChange={e => onCh(textoLimpo(e.target.value))} style={inputStyleBase} />;
    }
    return (
      <div style={{ display: "flex", flexDirection: "column" as const }}>
        <label style={labelStyle}>{label}</label>
        {input}
      </div>
    );
  };
  const renderBlocoSocio = () => (
    <div style={{ gridColumn: "1 / -1", border: "1px dashed #bfdbfe", borderRadius: 12, padding: 14, background: "#f8faff", marginTop: 4 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: "#2563eb", letterSpacing: 0.3, marginBottom: 10 }}>👤 DADOS DO SÓCIO</div>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: isMobile ? 12 : 16 }}>
        {renderInputSocio("socio_nome", "Nome do Sócio", { ph: "Nome completo do sócio" })}
        {renderInputSocio("socio_cpf", "CPF do Sócio", { cpf: true })}
        {renderInputSocio("socio_rg", "RG do Sócio", { ph: "00.000.000-0" })}
        {renderInputSocio("socio_nascimento", "Data de Nascimento", { tipo: "data" })}
        {renderInputSocio("socio_nome_mae", "Nome da Mãe", { ph: "Nome completo da mãe" })}
      </div>
    </div>
  );

  // 🔓 Conjunto de equipes que o usuário pode escolher no PDV/EQUIPE e cujas filas aparecem.
  //    null = sem restrição (vê todas). Ordem: admin geral → equipes_acesso (BKO/gerente) →
  //    própria equipe (atendente travado) → sem restrição.
  const idsEquipesPermitidas = useMemo<string[] | null>(() => {
    if (ehAdminGeralProp) return null;
    if (minhasEquipesAcesso.length > 0) return minhasEquipesAcesso.map(String);
    if (perm.equipeId != null) return [String(perm.equipeId)];
    return null;
  }, [ehAdminGeralProp, minhasEquipesAcesso, perm.equipeId]);

  // Quando só há UMA equipe permitida, pré-seleciona ela (Diretor/atendente travado).
  // Com várias (BKO/gerente), deixa o usuário escolher.
  const equipeUnicaForcada = (idsEquipesPermitidas && idsEquipesPermitidas.length === 1) ? idsEquipesPermitidas[0] : null;

  // 🔒 Listas filtradas pras equipes permitidas do usuário
  const equipesVisiveis = idsEquipesPermitidas
    ? equipesAuto.filter(e => idsEquipesPermitidas.includes(String(e.id)))
    : equipesAuto;
  const filasVisiveis = idsEquipesPermitidas
    ? filasAuto.filter(f => idsEquipesPermitidas.includes(String(f.equipe_id ?? "")))
    : filasAuto;

  // 🔗 PDV → filas: o campo "fila" (EQUIPE) mostra só as filas da equipe escolhida
  //    no campo "equipe" (PDV). Sem PDV escolhido, cai nas filas permitidas do usuário.
  const pdvEquipeSelecionada = (() => {
    for (const c of camposUnificados) {
      if (c.origem === "custom" && (c.tipo as string) === "equipe") {
        const v = dadosCustomizados[c.slug];
        if (v) return String(v);
      }
    }
    return null;
  })();
  // 🔒 Filas próprias do usuário: usa filas_acesso (várias); cai no fila_id legado se vazio.
  const minhasFilasIds: string[] = (() => {
    const arr = minhasFilasAcesso.length ? minhasFilasAcesso : (minhaFilaId != null ? [minhaFilaId] : []);
    return arr.map(x => String(x));
  })();
  // Se o usuário (não admin geral) tem filas específicas, o campo EQUIPE só mostra as dele;
  // senão mostra todas as filas visíveis. Depois filtra pela equipe (PDV) escolhida.
  const filasBasePermitidas = (!ehAdminGeralProp && minhasFilasIds.length > 0)
    ? filasVisiveis.filter(f => minhasFilasIds.includes(String(f.id)))
    : filasVisiveis;
  const filasParaFila = pdvEquipeSelecionada
    ? filasBasePermitidas.filter(f => String(f.equipe_id ?? "") === pdvEquipeSelecionada)
    : filasBasePermitidas;

  // 🔗 EQUIPE selecionada (campo do tipo "fila") — usada junto com o PDV pra filtrar.
  const filaSelecionada = (() => {
    for (const c of camposUnificados) {
      if (c.origem === "custom" && (c.tipo as string) === "fila") {
        const v = dadosCustomizados[c.slug];
        if (v) return String(v);
      }
    }
    return null;
  })();

  // 🔖 A EQUIPE (fila) escolhida é a de "indicador"? (detecta pelo nome da fila conter "indicador")
  const ehFilaIndicador = (() => {
    if (!filaSelecionada) return false;
    const f = filasAuto.find(x => String(x.id) === String(filaSelecionada));
    return !!f && /indicador/i.test(f.nome || "");
  })();

  // 🔗 PDV + EQUIPE → vendedores: a lista mostra só os vendedores cadastrados na
  //    equipe (PDV) e na equipe/fila escolhida. Sem nada escolhido, mostra todos.
  const vendedoresParaEscolher = usuarios.filter(u => {
    if (pdvEquipeSelecionada && String(u.equipe_id ?? "") !== pdvEquipeSelecionada) return false;
    if (filaSelecionada && String(u.fila_id ?? "") !== filaSelecionada) return false;
    return true;
  });

  // 🧑‍💼/🏢 Tipo de cliente: "cpf" (pessoa física) ou "cnpj" (pessoa jurídica).
  //    Guardado em dados_customizados.tipo_pessoa. O documento vai sempre na coluna
  //    `cpf` e o nome/razão social na coluna `nome` (reaproveitadas), os extras de
  //    CNPJ (nome fantasia, inscrição estadual) ficam em dados_customizados.
  const tipoPessoa: "cpf" | "cnpj" =
    dadosCustomizados.tipo_pessoa === "cnpj" ? "cnpj"
    : dadosCustomizados.tipo_pessoa === "cpf" ? "cpf"
    : (String(form.cpf || "").replace(/\D/g, "").length > 11 ? "cnpj" : "cpf");

  // 🔒 Fila do próprio usuário (puxada do cadastro). Quem tem fila e NÃO cobre várias equipes
  //    não escolhe — fica fixa. BKO/gerente com várias equipes escolhe a fila normalmente.
  const filaForcada = (!ehAdminGeralProp && minhasFilasIds.length === 1 && minhasEquipesAcesso.length <= 1) ? minhasFilasIds[0] : null;
  const travadoFila = filaForcada !== null;

  // 👨‍💼 Quem pode ESCOLHER o vendedor (não trava no próprio usuário):
  //   super admin / admin geral / dono / Administrador, ou quem tem permissão de
  //   ver vendas da equipe/todas ou de gerenciar usuários, ou escopo team/all em propostas,
  //   ou o role legado admin/supervisor. Cobre BKO, gerente, supervisor e administrador
  //   independentemente do campo `role` antigo.
  const podeEscolherVendedor =
    perm.superAdmin
    || ehAdminGeralProp
    || ehDono
    || perfilUsuario === "Administrador"
    || !!mapaPermissoes?.vendas_equipe
    || !!mapaPermissoes?.vendas_todas
    || !!mapaPermissoes?.usuarios_gerenciar
    || escopoCrud === "team"
    || escopoCrud === "all"
    || ehAdmin;

  // 🔒 Pré-seleciona a equipe nos campos do tipo "equipe" SÓ quando há uma única permitida
  useEffect(() => {
    if (!equipeUnicaForcada || camposUnificados.length === 0) return;
    setDadosCustomizados(prev => {
      const novo = { ...prev };
      let mudou = false;
      for (const c of camposUnificados) {
        if (c.origem === "custom" && (c.tipo as string) === "equipe" && !novo[c.slug]) {
          novo[c.slug] = equipeUnicaForcada;
          mudou = true;
        }
      }
      return mudou ? novo : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipeUnicaForcada, camposUnificados]);

  // 🔒 Pré-preenche a FILA do usuário nos campos do tipo "fila"
  useEffect(() => {
    if (!travadoFila || !filaForcada || camposUnificados.length === 0) return;
    setDadosCustomizados(prev => {
      const novo = { ...prev };
      let mudou = false;
      for (const c of camposUnificados) {
        if (c.origem === "custom" && (c.tipo as string) === "fila" && novo[c.slug] !== filaForcada) {
          novo[c.slug] = filaForcada;
          mudou = true;
        }
      }
      return mudou ? novo : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [travadoFila, filaForcada, camposUnificados]);

  // 🔗 Ao trocar o PDV (equipe), limpa a fila selecionada que não pertence mais a ele.
  //    Não mexe quando a fila é travada pelo cadastro do usuário.
  useEffect(() => {
    if (travadoFila || camposUnificados.length === 0) return;
    setDadosCustomizados(prev => {
      const novo = { ...prev };
      let mudou = false;
      for (const c of camposUnificados) {
        if (c.origem === "custom" && (c.tipo as string) === "fila" && novo[c.slug]) {
          const f = filasAuto.find(x => String(x.id) === String(novo[c.slug]));
          const pertence = !!f && (!pdvEquipeSelecionada || String(f.equipe_id ?? "") === pdvEquipeSelecionada);
          if (!pertence) { novo[c.slug] = ""; mudou = true; }
        }
      }
      return mudou ? novo : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdvEquipeSelecionada, travadoFila, camposUnificados, filasAuto]);

  // 🔗 Ao trocar o PDV ou a EQUIPE, limpa o vendedor que não pertence mais à equipe
  //    (PDV) e/ou à equipe/fila escolhida. Só pra quem escolhe vendedor.
  useEffect(() => {
    if (ehFilaIndicador) return; // fila de indicador → vendedor é texto livre, não limpa
    if (!podeEscolherVendedor || (!pdvEquipeSelecionada && !filaSelecionada)) return;
    setForm(prev => {
      if (!prev.vendedor) return prev;
      const v = usuarios.find(u => u.email?.toLowerCase() === String(prev.vendedor).toLowerCase());
      const okEquipe = !pdvEquipeSelecionada || (!!v && String(v.equipe_id ?? "") === pdvEquipeSelecionada);
      const okFila = !filaSelecionada || (!!v && String(v.fila_id ?? "") === filaSelecionada);
      return (v && okEquipe && okFila) ? prev : { ...prev, vendedor: "" };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ehFilaIndicador, pdvEquipeSelecionada, filaSelecionada, podeEscolherVendedor, usuarios]);

  // 🔗 Vendedor → PDV + fila: ao escolher o vendedor, puxa a equipe dele pro PDV
  //    e a fila dele pro campo de fila. As listas (filas/vendedores) se ajustam sozinhas.
  useEffect(() => {
    if (!form.vendedor || camposUnificados.length === 0) return;
    const v = usuarios.find(u => u.email?.toLowerCase() === String(form.vendedor).toLowerCase());
    if (!v) return;
    const eqId = v.equipe_id != null ? String(v.equipe_id) : "";
    const flId = v.fila_id != null ? String(v.fila_id) : "";
    setDadosCustomizados(prev => {
      const novo = { ...prev };
      let mudou = false;
      for (const c of camposUnificados) {
        if (c.origem !== "custom") continue;
        const t = c.tipo as string;
        if (t === "equipe" && eqId && novo[c.slug] !== eqId) { novo[c.slug] = eqId; mudou = true; }
        if (t === "fila" && flId && novo[c.slug] !== flId) { novo[c.slug] = flId; mudou = true; }
      }
      return mudou ? novo : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.vendedor, usuarios, camposUnificados]);

  // ═══ RENDER CAMPOS ═══
  const renderCampoVendedor = () => {
    if (carregandoUsuarios) {
      return <input value="⏳ Carregando vendedores..." disabled style={{ ...inputStyleBase, background: "#f3f4f6", color: "#9ca3af", opacity: 0.7 }} />;
    }
    // 🔖 Fila de indicador: o vendedor vira texto livre (digita o nome do indicador).
    if (ehFilaIndicador) {
      return (
        <input
          value={form.vendedor || ""}
          onChange={(e) => setCampoFixo("vendedor", e.target.value)}
          placeholder="Digite o nome do indicador..."
          style={inputStyleBase}
        />
      );
    }
    if (podeEscolherVendedor) {
      return (
        <select value={form.vendedor || ""} onChange={(e) => setCampoFixo("vendedor", e.target.value)} style={inputStyleBase}>
          <option value="">Selecione o vendedor...</option>
          {vendedoresParaEscolher.map(u => (
            <option key={u.email} value={u.email}>
              {u.nome} {u.email === userEmail ? "(você)" : ""}
            </option>
          ))}
        </select>
      );
    }
    const meuNome = usuarios.find(u => u.email?.toLowerCase() === userEmail.toLowerCase())?.nome || userEmail;
    return (
      <input value={`${meuNome} (você)`} disabled
        style={{ ...inputStyleBase, background: "#f3f4f6", color: "#6b7280", cursor: "not-allowed" }}
        title="Você só pode cadastrar propostas em seu próprio nome" />
    );
  };

  const renderCampoAuto = (c: CampoUnificado, options: Array<{id: string|number; nome: string; cor?: string; icone?: string}>) => {
    const val = dadosCustomizados[c.slug] || "";
    return (
      <select value={val} onChange={e => setCampoCustom(c.slug, e.target.value)} style={inputStyleParaCampo(c)}>
        <option value="">Selecione...</option>
        {options.length === 0 ? (
          <option value="" disabled>(nenhuma opção cadastrada)</option>
        ) : options.map(o => (
          <option key={o.id} value={String(o.id)}>
            {o.icone ? `${o.icone} ` : ""}{o.nome}
          </option>
        ))}
      </select>
    );
  };

  const renderCampoArquivo = (c: CampoUnificado) => {
    const arquivos: AnexoMeta[] = Array.isArray(dadosCustomizados[c.slug]) ? dadosCustomizados[c.slug] : [];
    const isLoading = uploadando[c.slug];
    return (
      <div>
        <label style={{
          display: "block",
          padding: "12px 14px",
          background: isLoading ? "#f9fafb" : "#fafbfc",
          border: "2px dashed #93c5fd",
          borderRadius: 10,
          cursor: isLoading ? "wait" : "pointer",
          textAlign: "center",
          transition: "all 0.15s",
        }}
          onMouseEnter={(e) => { if (!isLoading) e.currentTarget.style.borderColor = "#2563eb"; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#93c5fd"; }}
        >
          <input type="file" multiple
            onChange={(e) => { if (e.target.files && e.target.files.length > 0) { uploadArquivo(c.slug, e.target.files); e.target.value = ""; } }}
            disabled={isLoading}
            style={{ display: "none" }} />
          <p style={{ color: isLoading ? "#9ca3af" : "#2563eb", fontSize: 13, margin: 0, fontWeight: 700 }}>
            {isLoading ? "⏳ Enviando arquivos..." : "📎 Clique pra anexar arquivos"}
          </p>
          <p style={{ color: "#9ca3af", fontSize: 11, margin: "4px 0 0" }}>
            Múltiplos arquivos · Máx 20 MB cada
          </p>
        </label>
        {arquivos.length > 0 && (
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
            {arquivos.map((a, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "8px 12px", background: "#ffffff", border: "1px solid #e5e7eb",
                borderRadius: 8, fontSize: 12,
              }}>
                <span style={{ fontSize: 20 }}>{iconeArquivo(a.tipo)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ color: "#1f2937", fontSize: 12, margin: 0, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.nome}</p>
                  <p style={{ color: "#9ca3af", fontSize: 10, margin: "1px 0 0" }}>{formatarTamanhoArquivo(a.tamanho)}</p>
                </div>
                <a href={a.url} target="_blank" rel="noopener noreferrer"
                  style={{ color: "#2563eb", fontSize: 11, fontWeight: 600, textDecoration: "none", padding: "4px 10px", border: "1px solid #bfdbfe", borderRadius: 6 }}>
                  👁️
                </a>
                <button type="button" onClick={() => removerAnexo(c.slug, i)}
                  style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", borderRadius: 6, padding: "4px 10px", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderCampo = (c: CampoUnificado) => {
    const ok = c.obrigatorio && isCampoPreenchido(c);
    // 🏢 Quando o cliente é CNPJ, o campo "cpf" vira "CNPJ" e "nome" vira "Razão Social"
    let labelTxt = c.label;
    if (c.origem === "fixo" && tipoPessoa === "cnpj") {
      if (c.slug === "cpf") labelTxt = "CNPJ";
      else if (c.slug === "nome") labelTxt = "Razão Social";
    }
    const labelComObr = (
      <>
        {ok && <span style={{ color: "#16a34a", fontSize: 12 }}>✓</span>}
        <span>{labelTxt}</span>
        {c.obrigatorio && <span style={{ color: "#dc2626", marginLeft: 2 }}>*</span>}
      </>
    );

    if (c.origem === "fixo") {
      const val = form[c.slug];
      const set = (v: any) => setCampoFixo(c.slug, v);
      if (c.tipo === "vendedor") {
        return (
          <div style={{ display: "flex", flexDirection: "column" as const }}>
            <label style={labelStyle}>{labelComObr}</label>
            {renderCampoVendedor()}
          </div>
        );
      }
      // 🔍 Status: padrão AGUARDANDO AUDITORIA quando vazio
      const valorEfetivo = c.slug === "status_venda" ? (val || STATUS_PADRAO) : (val ?? "");
      let input;
      if (c.tipo === "data") {
        input = <input type="date" value={valorEfetivo} onChange={e => set(e.target.value)} style={inputStyleParaCampo(c)} />;
      } else if (c.tipo === "email") {
        input = <input type="email" placeholder={c.placeholder || ""} value={valorEfetivo} onChange={e => set(e.target.value)} style={inputStyleParaCampo(c)} />;
      } else if (c.tipo === "numero") {
        input = <input type="number" placeholder={c.placeholder || ""} value={valorEfetivo} onChange={e => set(e.target.value)} style={inputStyleParaCampo(c)} />;
      } else if (c.tipo === "moeda") {
        input = <input type="text" inputMode="decimal" placeholder={c.placeholder || "0,00"} value={valorEfetivo}
          onChange={e => set(e.target.value)}
          onBlur={e => set(mascaraMoeda(e.target.value))}
          style={inputStyleParaCampo(c)} />;
      } else if (c.tipo === "telefone") {
        input = <input type="tel" placeholder={c.placeholder || "(00) 00000-0000"} value={valorEfetivo}
          onChange={e => set(mascaraTelefone(e.target.value))}
          style={inputStyleParaCampo(c)} />;
      } else if (c.tipo === "dropdown") {
        const placeholderLabel = c.slug === "vencimento" ? "Selecione..." : c.slug === "periodo_instalacao" ? "Selecione..." : c.slug === "forma_pagamento" ? "Selecione..." : null;
        const prefixoVenc = c.slug === "vencimento";
        const ehStatus = c.slug === "status_venda";
        // 🔒 Vendedor criando: status travado em AGUARDANDO AUDITORIA (sem escolher).
        if (ehStatus && vendedorTravaStatus) {
          input = (
            <div
              title="O status é definido pela auditoria. Sua proposta entra como Aguardando Auditoria."
              style={{ ...inputStyleParaCampo(c), display: "flex", alignItems: "center", gap: 8, background: "#f9fafb", color: "#374151", fontWeight: 700, cursor: "not-allowed" }}
            >
              <span>{statusEmoji(STATUS_PADRAO)}</span>
              <span>{STATUS_PADRAO}</span>
              <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 500, color: "#9ca3af" }}>🔒 definido pela auditoria</span>
            </div>
          );
        } else {
          input = (
            <select value={valorEfetivo} onChange={e => set(e.target.value)} style={inputStyleParaCampo(c)}>
              {placeholderLabel && <option value="">{placeholderLabel}</option>}
              {(c.opcoes || []).map(op => (
                <option key={op} value={op}>{prefixoVenc ? `Dia ${op}` : ehStatus ? `${statusEmoji(op)} ${op}` : op}</option>
              ))}
            </select>
          );
        }
      } else if (c.slug === "cpf") {
        input = tipoPessoa === "cnpj"
          ? <input placeholder="00.000.000/0000-00" value={valorEfetivo}
              onChange={e => set(mascaraCNPJ(e.target.value))} style={inputStyleParaCampo(c)} />
          : (
            <div style={{ position: "relative" }}>
              <input placeholder={c.placeholder || "000.000.000-00"} value={valorEfetivo}
                onChange={e => {
                  const v = mascaraCPF(e.target.value);
                  set(v);
                  setCpfEncontrado(false);
                  if (v.replace(/\D/g, "").length === 11) buscarClientePorCpf(v);
                }}
                style={inputStyleParaCampo(c)} />
              {buscandoCpf && (
                <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: "#2563eb", fontSize: 11, fontWeight: 700 }}>🔍 Buscando...</span>
              )}
              {!buscandoCpf && cpfEncontrado && (
                <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: "#16a34a", fontSize: 11, fontWeight: 700 }}>✓ Cliente encontrado</span>
              )}
            </div>
          );
      } else if (c.slug === "cep") {
        input = (
          <div style={{ position: "relative" }}>
            <input placeholder={c.placeholder || "00000-000"} value={valorEfetivo}
              onChange={e => { const v = mascaraCEP(e.target.value); set(v); if (v.replace(/\D/g, "").length === 8) buscarCep(v); }}
              style={inputStyleParaCampo(c)} />
            {buscandoCep && (
              <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: "#2563eb", fontSize: 11, fontWeight: 700 }}>🔍 Buscando...</span>
            )}
          </div>
        );
      } else {
        input = <input placeholder={c.placeholder || ""} value={valorEfetivo} onChange={e => set(textoLimpo(e.target.value))} style={inputStyleParaCampo(c)} />;
      }
      return (
        <div style={{ display: "flex", flexDirection: "column" as const }}>
          <label style={labelStyle}>{labelComObr}</label>
          {input}
        </div>
      );
    }

    // ── CUSTOM ──
    const val = dadosCustomizados[c.slug];
    const set = (v: any) => setCampoCustom(c.slug, v);
    const tipo = c.tipo as string;
    let input;

    if (tipo === "arquivo") {
      return (
        <div style={{ display: "flex", flexDirection: "column" as const }}>
          <label style={labelStyle}>{labelComObr}</label>
          {renderCampoArquivo(c)}
        </div>
      );
    }
    if (tipo === "equipe") {
      return (
        <div style={{ display: "flex", flexDirection: "column" as const }}>
          <label style={labelStyle}>{labelComObr}</label>
          {renderCampoAuto(c, equipesVisiveis)}
        </div>
      );
    }
    if (tipo === "fila") {
      // Usuário com fila no cadastro: mostra fixa (read-only), sem caixa de seleção.
      if (travadoFila) {
        const fSel = filasAuto.find(f => String(f.id) === filaForcada);
        return (
          <div style={{ display: "flex", flexDirection: "column" as const }}>
            <label style={labelStyle}>{labelComObr}</label>
            <div style={{ ...inputStyleBase, background: "#f3f4f6", color: "#1f2937", cursor: "not-allowed", display: "flex", alignItems: "center", gap: 8 }}
              title="Sua fila é definida pelo seu cadastro">
              <span>{fSel?.icone || "\uD83C\uDFAF"}</span>
              <span style={{ fontWeight: 600 }}>{fSel?.nome || "Minha fila"}</span>
            </div>
          </div>
        );
      }
      return (
        <div style={{ display: "flex", flexDirection: "column" as const }}>
          <label style={labelStyle}>{labelComObr}</label>
          {renderCampoAuto(c, filasParaFila)}
        </div>
      );
    }
    if (tipo === "usuario") {
      return (
        <div style={{ display: "flex", flexDirection: "column" as const }}>
          <label style={labelStyle}>{labelComObr}</label>
          <select value={val || ""} onChange={e => set(e.target.value)} style={inputStyleParaCampo(c)}>
            <option value="">Selecione...</option>
            {usuarios.map(u => <option key={u.email} value={u.email}>{u.nome}</option>)}
          </select>
        </div>
      );
    }
    if (tipo === "etiqueta") {
      return (
        <div style={{ display: "flex", flexDirection: "column" as const }}>
          <label style={labelStyle}>{labelComObr}</label>
          {renderCampoAuto(c, etiquetasAuto)}
        </div>
      );
    }

    if (tipo === "textarea") {
      input = <textarea placeholder={c.placeholder || ""} value={val || ""} onChange={e => set(textoLimpo(e.target.value))} rows={3}
        style={{ ...inputStyleParaCampo(c), resize: "vertical" as const, fontFamily: "inherit" }} />;
    } else if (tipo === "numero") {
      input = <input type="number" placeholder={c.placeholder || "0"} value={val || ""} onChange={e => set(e.target.value)} style={inputStyleParaCampo(c)} />;
    } else if (tipo === "moeda") {
      input = <input type="text" inputMode="decimal" placeholder={c.placeholder || "0,00"} value={val || ""}
        onChange={e => set(e.target.value)}
        onBlur={e => set(mascaraMoeda(e.target.value))}
        style={inputStyleParaCampo(c)} />;
    } else if (tipo === "data") {
      input = <input type="date" value={val || ""} onChange={e => set(e.target.value)} style={inputStyleParaCampo(c)} />;
    } else if (tipo === "dropdown") {
      input = (
        <select value={val || ""} onChange={e => set(e.target.value)} style={inputStyleParaCampo(c)}>
          <option value="">Selecione...</option>
          {(c.opcoes || []).map((op, i) => <option key={i} value={op}>{op}</option>)}
        </select>
      );
    } else if (tipo === "checkbox") {
      const marcado = val === true;
      return (
        <div style={{ display: "flex", flexDirection: "column" as const }}>
          <label style={labelStyle}>{labelComObr}</label>
          <label style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "10px 14px",
            background: marcado ? "#f0fdf4" : "#ffffff",
            borderRadius: 10,
            border: `1px solid ${marcado ? "#bbf7d0" : "#e5e7eb"}`,
            cursor: "pointer",
            transition: "all 0.15s",
          }}>
            <input type="checkbox" checked={marcado} onChange={e => set(e.target.checked)} style={{ accentColor: "#16a34a", width: 17, height: 17, cursor: "pointer" }} />
            <span style={{ color: marcado ? "#16a34a" : "#6b7280", fontSize: 13, fontWeight: 600 }}>{marcado ? "Sim" : "Não"}</span>
          </label>
        </div>
      );
    } else {
      input = <input placeholder={c.placeholder || ""} value={val || ""} onChange={e => set(textoLimpo(e.target.value))} style={inputStyleParaCampo(c)} />;
    }
    return (
      <div style={{ display: "flex", flexDirection: "column" as const }}>
        <label style={labelStyle}>{labelComObr}</label>
        {input}
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════════════
  // 📐 LAYOUT
  // ═══════════════════════════════════════════════════════════════════

  // 🛡️ Guards visuais
  if (perm.carregando) {
    return (
      <div style={{ background: "#f8fafc", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "#6b7280", fontSize: 13 }}>⏳ Verificando permissões...</p>
      </div>
    );
  }
  if (!podeAcessar) {
    return (
      <div style={{ background: "#f8fafc", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 32 }}>
        <div style={{ background: "white", borderRadius: 14, padding: 48, textAlign: "center", maxWidth: 480, border: "1px solid #e5e7eb" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🔒</div>
          <h1 style={{ color: "#1f2937", fontSize: 18, fontWeight: 700, margin: "0 0 6px" }}>Sem permissão pra criar propostas</h1>
          <p style={{ color: "#6b7280", fontSize: 13, margin: "0 0 8px" }}>
            Teu grupo <b style={{ color: "#374151" }}>{perm.grupoNome || "(sem grupo)"}</b> não tem essa permissão.
          </p>
          <p style={{ color: "#9ca3af", fontSize: 11, margin: 0 }}>
            Peça ao admin pra ativar <code style={{ background: "#f3f4f6", padding: "1px 6px", borderRadius: 4, fontFamily: "monospace" }}>propostas.crud</code> no teu grupo.
          </p>
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
            {/* Logo "U" Unita */}
            <div style={{
              width: isMobile ? 40 : 46, height: isMobile ? 40 : 46, borderRadius: 12,
              background: "linear-gradient(135deg, #2563eb 0%, #3b82f6 50%, #4f46e5 100%)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "white", fontSize: isMobile ? 20 : 24, fontWeight: 900,
              boxShadow: "0 8px 20px rgba(37,99,235,0.30)",
              flexShrink: 0, letterSpacing: -1,
            }}>U</div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                <h1 style={{ color: "#1f2937", fontSize: isMobile ? 16 : 18, fontWeight: 800, margin: 0, letterSpacing: -0.3 }}>Nova Proposta</h1>
                {form.nome && <span style={{ color: "#2563eb", fontSize: isMobile ? 13 : 14, fontWeight: 600 }}>· {form.nome}</span>}
                {form.valor_plano && <span style={{ color: "#16a34a", fontSize: isMobile ? 13 : 14, fontWeight: 800 }}>· R$ {form.valor_plano}</span>}
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 3, flexWrap: "wrap" }}>
                <p style={{ color: "#6b7280", fontSize: 11, margin: 0, whiteSpace: "nowrap" }}>
                  UnitaSystem · <b style={{ color: "#2563eb" }}>Grupo Unita</b>
                </p>
                {camposObrig.length > 0 && (
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    fontSize: 11, fontWeight: 700,
                    color: pctTotal === 100 ? "#16a34a" : pctTotal >= 50 ? "#f59e0b" : "#dc2626",
                  }}>
                    {pctTotal === 100 ? "✓" : "●"} {camposObrigPreenchidos}/{camposObrig.length} obrigatórios ({pctTotal}%)
                  </span>
                )}
                {salvandoRascunho ? (
                  <span style={{ fontSize: 10, color: "#9ca3af", fontStyle: "italic" }}>💾 salvando rascunho...</span>
                ) : dirty ? (
                  <span style={{ fontSize: 10, color: "#9ca3af", fontStyle: "italic" }}>📝 rascunho salvo</span>
                ) : null}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <button onClick={handleCancelar}
              style={{
                background: "#ffffff", color: "#6b7280", border: "1px solid #e5e7eb",
                borderRadius: 10, padding: "8px 14px", fontSize: 12, cursor: "pointer",
                whiteSpace: "nowrap", fontWeight: 600,
              }}>← Voltar</button>
            <button onClick={handleSubmit} disabled={loading}
              title="Ctrl+S"
              style={{
                background: loading ? "#1e40af" : "linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)",
                color: "white", border: "none", borderRadius: 10,
                padding: "8px 18px", fontSize: 12, fontWeight: 700,
                cursor: loading ? "not-allowed" : "pointer",
                boxShadow: "0 4px 12px rgba(37,99,235,0.3)",
                whiteSpace: "nowrap",
              }}>
              {loading ? "⏳ Salvando..." : "💾 Salvar Proposta"}
            </button>
          </div>
        </div>
        {camposObrig.length > 0 && (
          <div style={{ marginTop: 10, background: "#e5e7eb", borderRadius: 4, height: 4, overflow: "hidden" }}>
            <div style={{
              background: pctTotal === 100 ? "linear-gradient(90deg, #16a34a, #22c55e)" : "linear-gradient(90deg, #2563eb, #4f46e5)",
              height: "100%", width: `${pctTotal}%`,
              transition: "width 0.3s, background 0.3s",
            }} />
          </div>
        )}
      </div>

      {/* RASCUNHO BANNER */}
      {rascunhoDisponivel && (
        <div style={{ padding: isMobile ? "12px 12px 0" : "16px 28px 0" }}>
          <div style={{
            background: "linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)",
            border: "1px solid #fde68a",
            borderLeft: "4px solid #f59e0b",
            borderRadius: 12,
            padding: "12px 18px",
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}>
            <span style={{ fontSize: 24 }}>💾</span>
            <div style={{ flex: 1, minWidth: 200 }}>
              <p style={{ color: "#92400e", fontSize: 13.5, margin: 0, fontWeight: 700 }}>
                Rascunho encontrado · {new Date(rascunhoDisponivel.salvoEm).toLocaleString("pt-BR")}
              </p>
              <p style={{ color: "#b45309", fontSize: 12, margin: "2px 0 0" }}>
                Você tinha começado a preencher: <b>{rascunhoDisponivel.form?.nome || "(sem nome)"}</b>
              </p>
            </div>
            <button onClick={recuperarRascunho}
              style={{ background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)", color: "white", border: "none", borderRadius: 10, padding: "8px 16px", fontSize: 12, cursor: "pointer", fontWeight: 700, boxShadow: "0 4px 12px rgba(245,158,11,0.3)" }}>
              ↩️ Recuperar
            </button>
            <button onClick={descartarRascunho}
              style={{ background: "#ffffff", color: "#92400e", border: "1px solid #fde68a", borderRadius: 10, padding: "8px 14px", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>
              Descartar
            </button>
          </div>
        </div>
      )}

      {/* BANNER TABELAS FALTANDO */}
      {tabelasFaltando.length > 0 && (
        <div style={{ padding: isMobile ? "12px 12px 0" : "16px 28px 0" }}>
          <div style={{
            background: "linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)",
            border: "1px solid #fcd34d",
            borderLeft: "4px solid #f59e0b",
            borderRadius: 12,
            padding: "12px 18px",
            display: "flex", gap: 12, alignItems: "flex-start",
          }}>
            <span style={{ fontSize: 22 }}>⚠️</span>
            <div style={{ flex: 1 }}>
              <p style={{ color: "#92400e", fontSize: 13, margin: 0, fontWeight: 700 }}>Tabelas faltando no Supabase</p>
              <p style={{ color: "#78350f", fontSize: 12, margin: "2px 0 0", lineHeight: 1.4 }}>
                {tabelasFaltando.map(t => <code key={t} style={{ background: "#fef3c7", padding: "1px 6px", borderRadius: 4, fontFamily: "monospace", fontSize: 11.5, marginRight: 4 }}>{t}</code>)} — rode o SQL de setup.
              </p>
            </div>
          </div>
        </div>
      )}

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
                📑 Seções do formulário
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {(() => {
                  // Consolida seções únicas
                  const vistas = new Set<string>();
                  const unicas: any[] = [];
                  for (const g of secoesAgrupadas) {
                    if (vistas.has(g.key)) continue;
                    vistas.add(g.key);
                    const todosCampos = secoesAgrupadas.filter((x: any) => x.key === g.key).flatMap((x: any) => x.campos);
                    unicas.push({ ...g, todosCampos });
                  }
                  return unicas.map(s => {
                    const ativa = secaoVisivel === s.keyUnica || secoesAgrupadas.some((g: any) => g.key === s.key && g.keyUnica === secaoVisivel);
                    const prog = progressoSecao(s.todosCampos);
                    return (
                      <button key={s.key} onClick={() => {
                        const primeira = secoesAgrupadas.find((g: any) => g.key === s.key);
                        if (primeira) sectionsRef.current[primeira.keyUnica]?.scrollIntoView({ behavior: "smooth", block: "start" });
                      }}
                        style={{
                          background: ativa ? `${s.meta.cor}10` : "transparent",
                          border: `1px solid ${ativa ? `${s.meta.cor}30` : "transparent"}`,
                          borderLeft: `3px solid ${ativa ? s.meta.cor : "transparent"}`,
                          borderRadius: 8, padding: "8px 10px",
                          cursor: "pointer", textAlign: "left",
                          transition: "all 0.15s",
                        }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                          <span style={{ fontSize: 14 }}>{s.meta.icone}</span>
                          <span style={{ color: ativa ? s.meta.cor : "#374151", fontSize: 12, fontWeight: ativa ? 800 : 600, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {s.label}
                          </span>
                          {prog.obrig > 0 && (
                            <span style={{
                              fontSize: 9, fontWeight: 800,
                              color: prog.pct === 100 ? "#16a34a" : prog.pct === 0 ? "#9ca3af" : s.meta.cor,
                            }}>
                              {prog.preench}/{prog.obrig}
                            </span>
                          )}
                        </div>
                        <div style={{ background: "#e5e7eb", borderRadius: 2, height: 3, overflow: "hidden" }}>
                          <div style={{
                            background: prog.pct === 100 ? "#16a34a" : s.meta.cor,
                            height: "100%", width: `${prog.obrig > 0 ? prog.pct : (prog.preench / Math.max(prog.total, 1)) * 100}%`,
                            transition: "width 0.3s",
                          }} />
                        </div>
                      </button>
                    );
                  });
                })()}
              </div>
            </div>

            <div style={{ ...cardStyle, padding: 14, background: "linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%)" }}>
              <p style={{ color: "#6b7280", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.6, margin: "0 0 8px", fontWeight: 800 }}>
                ⌨️ Atalhos
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11 }}>
                  <span style={{ color: "#6b7280" }}>Salvar</span>
                  <kbd style={{ background: "#ffffff", border: "1px solid #d1d5db", padding: "2px 6px", borderRadius: 4, fontSize: 10, fontFamily: "monospace", color: "#374151", fontWeight: 700 }}>Ctrl+S</kbd>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11 }}>
                  <span style={{ color: "#6b7280" }}>Voltar</span>
                  <kbd style={{ background: "#ffffff", border: "1px solid #d1d5db", padding: "2px 6px", borderRadius: 4, fontSize: 10, fontFamily: "monospace", color: "#374151", fontWeight: 700 }}>Esc</kbd>
                </div>
              </div>
            </div>
          </aside>
        )}

        {/* CONTEÚDO */}
        <main style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
          {carregandoCampos ? (
            <>
              {[1, 2, 3].map(i => (
                <div key={i} style={{ ...cardStyle, padding: 20 }}>
                  <div style={{ height: 16, background: "#f3f4f6", borderRadius: 4, marginBottom: 14, width: "30%" }} />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
                    {[1, 2, 3, 4, 5, 6].map(j => (
                      <div key={j}>
                        <div style={{ height: 8, background: "#f3f4f6", borderRadius: 4, marginBottom: 6, width: "60%" }} />
                        <div style={{ height: 36, background: "#f9fafb", borderRadius: 8 }} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </>
          ) : camposUnificados.length === 0 ? (
            <div style={{ ...cardStyle, padding: 40, textAlign: "center" }}>
              <p style={{ fontSize: 36, margin: "0 0 8px" }}>📋</p>
              <p style={{ color: "#6b7280", fontSize: 13 }}>
                Nenhum campo configurado pra proposta.
                <br /><a href="/crm/editor-proposta" style={{ color: "#2563eb", fontWeight: 600 }}>Ir para o Editor de Proposta →</a>
              </p>
            </div>
          ) : (
            secoesAgrupadas.map((s: any) => {
              const prog = progressoSecao(s.campos);
              // 🏢 Seção de dados pessoais: é a que tem o campo cpf/nome.
              const ehPessoal = s.campos.some((c: CampoUnificado) =>
                c.origem === "fixo" && (c.slug === "cpf" || c.slug === "nome"));
              let camposRender: CampoUnificado[] = s.campos;
              if (ehPessoal && tipoPessoa === "cnpj") {
                const base: any = s.campos.find((c: CampoUnificado) => c.slug === "cpf") || s.campos[0];
                const mk = (slug: string, label: string): CampoUnificado =>
                  ({ ...base, origem: "custom", slug, label, tipo: "texto", obrigatorio: false, placeholder: "" } as CampoUnificado);
                const ocultar = ["rg", "data_nascimento", "nome_mae"];
                const filtrados = s.campos.filter((c: CampoUnificado) =>
                  !(c.origem === "fixo" && ocultar.includes(c.slug)));
                const out: CampoUnificado[] = [];
                for (const c of filtrados) {
                  out.push(c);
                  if (c.origem === "fixo" && c.slug === "cpf") {
                    out.push(mk("cnpj_nome_fantasia", "Nome Fantasia"));
                    out.push(mk("cnpj_inscricao_estadual", "Inscrição Estadual"));
                  }
                }
                camposRender = out;
              }
              // 🔗 A caixa de EQUIPE (campo do tipo "fila") aparece logo ANTES do Vendedor.
              camposRender = (() => {
                const arr = [...camposRender];
                const idxFila = arr.findIndex((c: CampoUnificado) => c.origem === "custom" && (c.tipo as string) === "fila");
                const temVend = arr.some((c: CampoUnificado) => (c.tipo as string) === "vendedor");
                if (idxFila === -1 || !temVend) return arr;
                const [campoFila] = arr.splice(idxFila, 1);
                const idxVend = arr.findIndex((c: CampoUnificado) => (c.tipo as string) === "vendedor");
                arr.splice(idxVend, 0, campoFila);
                return arr;
              })();
              return (
                <div key={s.keyUnica}
                  ref={(el) => { sectionsRef.current[s.keyUnica] = el; }}
                  data-secao={s.keyUnica}
                  style={{ ...cardStyle, overflow: "hidden", scrollMarginTop: 120 }}>

                  <div style={{
                    padding: "14px 20px",
                    borderBottom: "1px solid #f3f4f6",
                    background: `${s.meta.cor}05`,
                    borderLeft: `4px solid ${s.meta.cor}`,
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                  }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 10,
                      background: `linear-gradient(135deg, ${s.meta.cor} 0%, ${s.meta.cor}cc 100%)`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 18, boxShadow: `0 4px 10px ${s.meta.cor}40`,
                      flexShrink: 0,
                    }}><span style={{ filter: "saturate(0) brightness(2)" }}>{s.meta.icone}</span></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h2 style={{ color: "#1f2937", fontSize: 14, fontWeight: 800, margin: 0, letterSpacing: -0.2 }}>{s.label}</h2>
                      {s.meta.descricao && <p style={{ color: "#9ca3af", fontSize: 11, margin: "2px 0 0" }}>{s.meta.descricao}</p>}
                    </div>
                    {prog.obrig > 0 && (
                      <span style={{
                        background: prog.pct === 100 ? "#f0fdf4" : `${s.meta.cor}10`,
                        color: prog.pct === 100 ? "#16a34a" : s.meta.cor,
                        border: `1px solid ${prog.pct === 100 ? "#bbf7d0" : `${s.meta.cor}30`}`,
                        padding: "4px 10px",
                        borderRadius: 10,
                        fontSize: 11,
                        fontWeight: 800,
                        whiteSpace: "nowrap",
                      }}>
                        {prog.pct === 100 ? "✓ Completo" : `${prog.preench}/${prog.obrig}`}
                      </span>
                    )}
                  </div>

                  <div style={{
                    padding: isMobile ? 14 : 20,
                    display: "grid",
                    gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr",
                    gap: isMobile ? 12 : 16,
                  }}>
                    {ehPessoal && (
                      <div style={{ gridColumn: "1 / -1", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" as const, marginBottom: 4 }}>
                        <span style={{ fontSize: 11, fontWeight: 800, color: "#9ca3af", letterSpacing: 0.3 }}>TIPO DE CLIENTE</span>
                        {(["cpf", "cnpj"] as const).map(t => {
                          const ativo = tipoPessoa === t;
                          return (
                            <button key={t} type="button" onClick={() => trocarTipoPessoa(t)}
                              style={{
                                padding: "8px 16px", borderRadius: 10, cursor: "pointer",
                                fontSize: 13, fontWeight: 700,
                                border: ativo ? "2px solid #2563eb" : "1px solid #e5e7eb",
                                background: ativo ? "#eff6ff" : "#fff",
                                color: ativo ? "#1d4ed8" : "#6b7280",
                              }}>
                              {t === "cpf" ? "👤 CPF (Pessoa Física)" : "🏢 CNPJ (Pessoa Jurídica)"}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {camposRender.map((c: CampoUnificado) => (
                      <div key={`${c.origem}-${c.slug}`}
                        style={c.larguraTotal || c.tipo === "textarea" || (c.tipo as string) === "arquivo" ? { gridColumn: "1 / -1" } : undefined}>
                        {renderCampo(c)}
                      </div>
                    ))}
                    {ehPessoal && tipoPessoa === "cnpj" && renderBlocoSocio()}
                  </div>
                </div>
              );
            })
          )}

          {/* Footer com botões */}
          {!carregandoCampos && camposUnificados.length > 0 && (
            <div style={{ ...cardStyle, padding: isMobile ? 16 : 22, background: "linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: pctTotal === 100 ? "linear-gradient(135deg, #16a34a 0%, #22c55e 100%)" : "linear-gradient(135deg, #2563eb 0%, #4f46e5 100%)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 20,
                  boxShadow: pctTotal === 100 ? "0 4px 10px rgba(22,163,74,0.3)" : "0 4px 10px rgba(37,99,235,0.3)",
                }}><span style={{ filter: "saturate(0) brightness(2)" }}>{pctTotal === 100 ? "✅" : "📋"}</span></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ color: "#1f2937", fontSize: 14, fontWeight: 800, margin: 0 }}>
                    {pctTotal === 100 ? "Tudo pronto pra salvar!" : `Faltam ${camposObrig.length - camposObrigPreenchidos} campo(s) obrigatório(s)`}
                  </p>
                  <p style={{ color: "#6b7280", fontSize: 12, margin: "2px 0 0" }}>
                    {pctTotal}% completo · {form.nome || "(sem nome)"}{form.valor_plano ? ` · R$ ${form.valor_plano}` : ""}
                  </p>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: isMobile ? "column-reverse" : "row", gap: 10, justifyContent: "flex-end" }}>
                <button onClick={handleCancelar}
                  style={{
                    background: "#ffffff", color: "#6b7280", border: "1px solid #e5e7eb",
                    borderRadius: 10, padding: "11px 24px", fontSize: 13, cursor: "pointer", fontWeight: 600,
                  }}>
                  Cancelar
                </button>
                <button onClick={handleSubmit} disabled={loading}
                  style={{
                    background: loading ? "#1e40af" : "linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)",
                    color: "white", border: "none", borderRadius: 10,
                    padding: "11px 32px", fontSize: 14, fontWeight: 700,
                    cursor: loading ? "not-allowed" : "pointer",
                    boxShadow: "0 4px 12px rgba(37,99,235,0.3)",
                  }}>
                  {loading ? "⏳ Salvando..." : "💾 Salvar Proposta"}
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default function NovaProposta() {
  return (
    <Suspense fallback={
      <div style={{ background: "#f8fafc", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "#6b7280" }}>Carregando...</p>
      </div>
    }>
      <PropostaForm />
    </Suspense>
  );
}