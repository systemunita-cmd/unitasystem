"use client";
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { useEquipeFiltro } from "../../hooks/useEquipeFiltro";
import * as XLSX from "xlsx";

// ═══════════════════════════════════════════════════════════════════════
// 👥 CONTATOS — UnitaSystem (single-tenant)
// ───────────────────────────────────────────────────────────────────────
// Agrega `atendimentos` por número = contatos únicos (do chatbot/WhatsApp).
// Modo demo: se tabela `atendimentos` vazia/inexistente, gera mock realista.
// ═══════════════════════════════════════════════════════════════════════

type Atendimento = {
  id: number; created_at: string; numero: string; nome: string;
  mensagem: string; status: string; fila: string; atendente: string;
  equipe_id?: string | number | null;
};

type Etiqueta = { id: number; nome: string; cor: string; icone: string; };

type Contato = {
  numero: string;
  nome: string;
  ultimaMensagem: string;
  ultimaData: string;
  ultimoStatus: string;
  ultimaFila: string;
  ultimoAtendente: string;
  totalAtendimentos: number;
  etiquetasIds: number[];
  atendimentos: Atendimento[];
};

// ═══ MOCK DATA pra modo demo ═══
function gerarMockContatos(): { atendimentos: Atendimento[]; etiquetas: Etiqueta[]; relacoes: Array<{atendimento_id: number; etiqueta_id: number}>; } {
  const nomes = [
    "Ana Carolina Silva", "Bruno Henrique Costa", "Carla Mendes Souza", "Daniel Oliveira",
    "Eduarda Pereira", "Fábio Rodrigues", "Gabriela Almeida", "Henrique Santos",
    "Isabela Carvalho", "João Pedro Lima", "Karina Ferreira", "Lucas Martins",
    "Mariana Ribeiro", "Nathan Souza", "Olívia Cardoso", "Pedro Henrique Dias",
    "Renata Vieira", "Sérgio Barbosa", "Tatiana Moura", "Vinícius Araújo",
    "Beatriz Nogueira", "Caio Fernandes",
  ];
  const mensagens = [
    "Oi, quero contratar a fibra 500MB", "Boa tarde, qual o valor do plano empresarial?",
    "Tô com problema na internet, alguém me ajuda?", "Quero saber sobre upgrade de plano",
    "Cancelar contrato como faço?", "Quando vão instalar o meu plano?",
    "Bom dia! Vocês têm cobertura no meu bairro?", "Tô sem sinal aqui",
    "Já paguei o boleto, quando volta o sinal?", "Preciso de uma segunda via",
    "Quero a fibra mais rápida que vocês tem", "Esqueci minha senha do roteador",
    "Posso parcelar a instalação?", "Indicaram vocês pra mim, queria saber dos preços",
    "Estou interessado no plano de 1GB", "Vocês fazem desconto pra renovação?",
    "Internet cai direto, tô louco aqui",
  ];
  const filas = ["Vendas Fibra", "Suporte Técnico", "Financeiro", "Retenção"];
  const atendentes = ["BOT", "robert@unita.com", "ana.vendas@unita.com", "carlos.tec@unita.com", "BOT", "BOT"];
  const statusList = ["aberto", "em_atendimento", "resolvido", "pendente", "resolvido", "aberto"];

  const etiquetas: Etiqueta[] = [
    { id: 1, nome: "Lead Quente",     cor: "#ef4444", icone: "🔥" },
    { id: 2, nome: "Cliente VIP",     cor: "#8b5cf6", icone: "⭐" },
    { id: 3, nome: "Indicação",       cor: "#06b6d4", icone: "🤝" },
    { id: 4, nome: "Inadimplente",    cor: "#dc2626", icone: "💸" },
    { id: 5, nome: "Aguardando",      cor: "#f59e0b", icone: "⏳" },
    { id: 6, nome: "Resolvido",       cor: "#16a34a", icone: "✅" },
  ];

  const atendimentos: Atendimento[] = [];
  const relacoes: Array<{atendimento_id: number; etiqueta_id: number}> = [];
  let id = 1;
  const agora = Date.now();
  const seed = (i: number) => Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1;

  // 20 contatos únicos, alguns com vários atendimentos
  for (let i = 0; i < nomes.length; i++) {
    const numero = `5562${(99000000 + Math.floor(seed(i) * 999999)).toString().padStart(8, "0")}`;
    const nome = nomes[i];
    const totalAtends = Math.floor(seed(i * 3) * 5) + 1; // 1 a 5 atendimentos por contato

    for (let j = 0; j < totalAtends; j++) {
      const diasAtras = Math.floor(seed(i + j * 7) * 35); // últimos 35 dias
      const data = new Date(agora - diasAtras * 24 * 60 * 60 * 1000);
      const meuId = id++;
      atendimentos.push({
        id: meuId,
        created_at: data.toISOString(),
        numero,
        nome,
        mensagem: mensagens[Math.floor(seed(meuId * 2) * mensagens.length)],
        status: statusList[Math.floor(seed(meuId * 5) * statusList.length)],
        fila: filas[Math.floor(seed(meuId * 11) * filas.length)],
        atendente: atendentes[Math.floor(seed(meuId * 13) * atendentes.length)],
      });

      // Cada atendimento tem 0-2 etiquetas aleatórias
      const numEtiqs = Math.floor(seed(meuId * 17) * 3);
      const usadas = new Set<number>();
      for (let k = 0; k < numEtiqs; k++) {
        const eid = Math.floor(seed(meuId * (k + 19)) * etiquetas.length) + 1;
        if (!usadas.has(eid)) {
          usadas.add(eid);
          relacoes.push({ atendimento_id: meuId, etiqueta_id: eid });
        }
      }
    }
  }

  return { atendimentos, etiquetas, relacoes };
}

export default function Contatos() {
  const router = useRouter();
  const [atendimentos, setAtendimentos] = useState<Atendimento[]>([]);
  const [etiquetas, setEtiquetas] = useState<Etiqueta[]>([]);
  const [etiquetasPorAtend, setEtiquetasPorAtend] = useState<Record<number, number[]>>({});
  const [loading, setLoading] = useState(true);
  const [truncado, setTruncado] = useState(false);
  const [modoDemo, setModoDemo] = useState(false);

  // 👥 Filtro por equipe (sem workspaceId no Unita)
  const { equipeId, EquipeSelector } = useEquipeFiltro();

  // Busca e filtros
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [filtroEtiqueta, setFiltroEtiqueta] = useState<string>("todas");
  const [filtroAtendente, setFiltroAtendente] = useState("todos");
  const [filtroPeriodo, setFiltroPeriodo] = useState<"todos" | "hoje" | "semana" | "mes">("todos");

  // Paginação
  const [paginaAtual, setPaginaAtual] = useState(1);
  const PAGINA_SIZE = 20;

  // Modal de edição
  const [contatoEditando, setContatoEditando] = useState<Contato | null>(null);
  const [nomeEditado, setNomeEditado] = useState("");
  const [etiquetasSelecionadas, setEtiquetasSelecionadas] = useState<Set<number>>(new Set());
  const [salvandoContato, setSalvandoContato] = useState(false);

  const [exportando, setExportando] = useState(false);

  // Mobile
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // 🎨 ESTILOS
  const inputStyle = {
    width: "100%", background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 10,
    padding: "10px 14px", color: "#1f2937", fontSize: 13, boxSizing: "border-box" as const,
    outline: "none", transition: "border-color 0.15s, box-shadow 0.15s",
  };
  const cardStyle = {
    background: "#ffffff", borderRadius: 14, border: "1px solid #e5e7eb",
    boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
  };

  // ═══ CARREGA atendimentos + etiquetas (single-tenant) ═══
  const carregarDados = async () => {
    setLoading(true);
    const PAGE_SIZE = 1000;
    const LIMITE = 10000;
    let lista: Atendimento[] = [];
    let offset = 0;
    let tabelaInexistente = false;

    try {
      while (offset < LIMITE) {
        const { data: pagina, error } = await supabase.from("atendimentos")
          .select("*")
          .order("created_at", { ascending: false })
          .range(offset, offset + PAGE_SIZE - 1);
        if (error) {
          if (error.code === "PGRST205") tabelaInexistente = true;
          break;
        }
        if (!pagina || pagina.length === 0) break;
        lista = lista.concat(pagina as Atendimento[]);
        if (pagina.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
      }
    } catch (e) {
      console.error("[Contatos] erro fetch:", e);
      tabelaInexistente = true;
    }

    // ─── Se não há atendimentos reais, usa mock ───
    if (lista.length === 0 || tabelaInexistente) {
      const mock = gerarMockContatos();
      setAtendimentos(mock.atendimentos);
      setEtiquetas(mock.etiquetas);
      const mapa: Record<number, number[]> = {};
      for (const r of mock.relacoes) {
        if (!mapa[r.atendimento_id]) mapa[r.atendimento_id] = [];
        mapa[r.atendimento_id].push(r.etiqueta_id);
      }
      setEtiquetasPorAtend(mapa);
      setModoDemo(true);
      setTruncado(false);
      setLoading(false);
      return;
    }

    setModoDemo(false);
    setAtendimentos(lista);
    setTruncado(lista.length >= LIMITE);

    // Etiquetas (single-tenant)
    const { data: etiqs } = await supabase.from("etiquetas").select("*");
    setEtiquetas(etiqs || []);

    // Relações atendimento_etiquetas
    if (lista.length > 0) {
      const ids = lista.map(a => a.id);
      const LOTE = 500;
      const mapa: Record<number, number[]> = {};
      for (let i = 0; i < ids.length; i += LOTE) {
        const lote = ids.slice(i, i + LOTE);
        const { data: rels } = await supabase.from("atendimento_etiquetas")
          .select("atendimento_id, etiqueta_id")
          .in("atendimento_id", lote);
        (rels || []).forEach((r: any) => {
          if (!mapa[r.atendimento_id]) mapa[r.atendimento_id] = [];
          mapa[r.atendimento_id].push(r.etiqueta_id);
        });
      }
      setEtiquetasPorAtend(mapa);
    }
    setLoading(false);
  };

  useEffect(() => {
    carregarDados();
    const ch = supabase.channel("contatos_rt_unita")
      .on("postgres_changes", { event: "*", schema: "public", table: "atendimentos" }, () => carregarDados())
      .on("postgres_changes", { event: "*", schema: "public", table: "etiquetas" }, () => carregarDados())
      .on("postgres_changes", { event: "*", schema: "public", table: "atendimento_etiquetas" }, () => carregarDados())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ═══ AGREGA atendimentos por número = contatos únicos ═══
  const contatos: Contato[] = useMemo(() => {
    const fonte = equipeId
      ? atendimentos.filter(a => String(a.equipe_id || "") === String(equipeId))
      : atendimentos;
    const mapa = new Map<string, Contato>();
    for (const a of fonte) {
      if (!a.numero) continue;
      const existente = mapa.get(a.numero);
      if (!existente) {
        mapa.set(a.numero, {
          numero: a.numero,
          nome: a.nome || a.numero,
          ultimaMensagem: a.mensagem || "",
          ultimaData: a.created_at,
          ultimoStatus: a.status,
          ultimaFila: a.fila || "",
          ultimoAtendente: a.atendente || "",
          totalAtendimentos: 1,
          etiquetasIds: etiquetasPorAtend[a.id] || [],
          atendimentos: [a],
        });
      } else {
        existente.totalAtendimentos++;
        existente.atendimentos.push(a);
        if (new Date(a.created_at) > new Date(existente.ultimaData)) {
          existente.ultimaMensagem = a.mensagem || existente.ultimaMensagem;
          existente.ultimaData = a.created_at;
          existente.ultimoStatus = a.status;
          existente.ultimaFila = a.fila || existente.ultimaFila;
          existente.ultimoAtendente = a.atendente || existente.ultimoAtendente;
          if (a.nome && a.nome !== a.numero) existente.nome = a.nome;
        }
        const etiqs = etiquetasPorAtend[a.id] || [];
        for (const eid of etiqs) {
          if (!existente.etiquetasIds.includes(eid)) existente.etiquetasIds.push(eid);
        }
      }
    }
    return Array.from(mapa.values()).sort((a, b) => new Date(b.ultimaData).getTime() - new Date(a.ultimaData).getTime());
  }, [atendimentos, etiquetasPorAtend, equipeId]);

  // ═══ FILTROS ═══
  const contatosFiltrados = useMemo(() => {
    let lista = contatos;
    if (busca) {
      const b = busca.toLowerCase();
      lista = lista.filter(c =>
        c.nome.toLowerCase().includes(b) ||
        c.numero.includes(busca.replace(/\D/g, "")) ||
        c.ultimaMensagem.toLowerCase().includes(b)
      );
    }
    if (filtroStatus !== "todos") lista = lista.filter(c => c.ultimoStatus === filtroStatus);
    if (filtroEtiqueta !== "todas") {
      const eid = parseInt(filtroEtiqueta);
      lista = lista.filter(c => c.etiquetasIds.includes(eid));
    }
    if (filtroAtendente !== "todos") lista = lista.filter(c => c.ultimoAtendente === filtroAtendente);
    if (filtroPeriodo !== "todos") {
      const agora = new Date();
      const lim = filtroPeriodo === "hoje" ? 1 : filtroPeriodo === "semana" ? 7 : 30;
      const dataLim = new Date(agora.getTime() - lim * 24 * 60 * 60 * 1000);
      lista = lista.filter(c => new Date(c.ultimaData) >= dataLim);
    }
    return lista;
  }, [contatos, busca, filtroStatus, filtroEtiqueta, filtroAtendente, filtroPeriodo]);

  useEffect(() => { setPaginaAtual(1); }, [busca, filtroStatus, filtroEtiqueta, filtroAtendente, filtroPeriodo]);

  const totalPaginas = Math.max(1, Math.ceil(contatosFiltrados.length / PAGINA_SIZE));
  const contatosPagina = contatosFiltrados.slice((paginaAtual - 1) * PAGINA_SIZE, paginaAtual * PAGINA_SIZE);

  const atendentesUnicos = useMemo(() => {
    const set = new Set<string>();
    contatos.forEach(c => { if (c.ultimoAtendente) set.add(c.ultimoAtendente); });
    return Array.from(set).sort();
  }, [contatos]);

  // ═══ STATS ═══
  const stats = useMemo(() => {
    const agora = new Date();
    const seteDias = new Date(agora.getTime() - 7 * 24 * 60 * 60 * 1000);
    return {
      total: contatos.length,
      novosSemana: contatos.filter(c => new Date(c.ultimaData) >= seteDias).length,
      ativos: contatos.filter(c => c.ultimoStatus === "aberto" || c.ultimoStatus === "em_atendimento").length,
      bot: contatos.filter(c => c.ultimoAtendente === "BOT").length,
    };
  }, [contatos]);

  // ═══ MODAL ═══
  const abrirEditar = (c: Contato) => {
    setContatoEditando(c);
    setNomeEditado(c.nome);
    setEtiquetasSelecionadas(new Set(c.etiquetasIds));
  };

  const fecharModal = () => {
    setContatoEditando(null);
    setNomeEditado("");
    setEtiquetasSelecionadas(new Set());
  };

  // ═══ SALVAR (nome + etiquetas) ═══
  const salvarContato = async () => {
    if (!contatoEditando) return;
    if (!nomeEditado.trim()) { alert("Nome não pode ficar vazio."); return; }
    if (modoDemo) {
      alert("⚠️ Modo demo ativo. Crie a tabela `atendimentos` no Supabase pra salvar de verdade.");
      return;
    }
    setSalvandoContato(true);
    try {
      if (nomeEditado.trim() !== contatoEditando.nome) {
        const { error } = await supabase.from("atendimentos")
          .update({ nome: nomeEditado.trim() })
          .eq("numero", contatoEditando.numero);
        if (error) { alert("Erro ao atualizar nome: " + error.message); setSalvandoContato(false); return; }
      }

      const ultimoAtend = contatoEditando.atendimentos
        .slice()
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

      if (ultimoAtend) {
        const atuais = new Set(etiquetasPorAtend[ultimoAtend.id] || []);
        const novas = etiquetasSelecionadas;
        const paraAdd = Array.from(novas).filter(eid => !atuais.has(eid));
        const paraRemover = Array.from(atuais).filter(eid => !novas.has(eid));

        if (paraAdd.length > 0) {
          const inserts = paraAdd.map(eid => ({ atendimento_id: ultimoAtend.id, etiqueta_id: eid }));
          await supabase.from("atendimento_etiquetas").insert(inserts);
        }
        for (const eid of paraRemover) {
          await supabase.from("atendimento_etiquetas").delete()
            .eq("atendimento_id", ultimoAtend.id)
            .eq("etiqueta_id", eid);
        }
      }

      await carregarDados();
      fecharModal();
      alert("✅ Contato atualizado!");
    } catch (e: any) {
      alert("Erro: " + e.message);
    }
    setSalvandoContato(false);
  };

  // ═══ EXCLUIR CONTATO ═══
  const excluirContato = async (c: Contato) => {
    if (!confirm(`⚠️ Excluir TODOS os ${c.totalAtendimentos} atendimento(s) do contato "${c.nome}"?\n\nNúmero: ${c.numero}\n\nEsta ação NÃO pode ser desfeita.`)) return;
    if (modoDemo) {
      alert("⚠️ Modo demo ativo. Crie a tabela `atendimentos` no Supabase pra excluir de verdade.");
      return;
    }
    try {
      const ids = c.atendimentos.map(a => a.id);
      const LOTE = 500;
      for (let i = 0; i < ids.length; i += LOTE) {
        const lote = ids.slice(i, i + LOTE);
        await supabase.from("atendimento_etiquetas").delete().in("atendimento_id", lote);
      }
      const { error } = await supabase.from("atendimentos").delete()
        .eq("numero", c.numero);
      if (error) { alert("Erro ao excluir: " + error.message); return; }
      await carregarDados();
      fecharModal();
      alert("✅ Contato excluído!");
    } catch (e: any) { alert("Erro: " + e.message); }
  };

  // ═══ EXPORTAR EXCEL ═══
  const exportar = () => {
    if (contatosFiltrados.length === 0) { alert("Nenhum contato pra exportar."); return; }
    setExportando(true);
    try {
      const dados = contatosFiltrados.map(c => ({
        "Nome": c.nome,
        "Telefone": c.numero.replace(/\D/g, ""),
        "Total Atendimentos": c.totalAtendimentos,
        "Etiquetas": c.etiquetasIds.map(id => {
          const e = etiquetas.find(x => x.id === id);
          return e ? `${e.icone} ${e.nome}` : "";
        }).filter(Boolean).join(", "),
        "Última Mensagem": c.ultimaMensagem,
        "Última Fila": c.ultimaFila || "",
        "Último Atendente": c.ultimoAtendente || "",
        "Último Status": c.ultimoStatus === "resolvido" ? "Resolvido" : c.ultimoStatus === "aberto" ? "Aberto" : c.ultimoStatus === "em_atendimento" ? "Em atendimento" : c.ultimoStatus === "pendente" ? "Pendente" : c.ultimoStatus,
        "Última Interação": new Date(c.ultimaData).toLocaleString("pt-BR"),
      }));
      const ws = XLSX.utils.json_to_sheet(dados);
      ws["!cols"] = [
        { wch: 28 }, { wch: 16 }, { wch: 12 }, { wch: 30 }, { wch: 40 }, { wch: 16 }, { wch: 22 }, { wch: 14 }, { wch: 18 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Contatos");
      const hoje = new Date().toISOString().split("T")[0];
      XLSX.writeFile(wb, `contatos_unita_${hoje}.xlsx`);
    } catch (e: any) { alert("Erro ao exportar: " + e.message); }
    setExportando(false);
  };

  const corStatus = (s: string) => ({
    resolvido: "#16a34a", aberto: "#3b82f6", em_atendimento: "#f59e0b", pendente: "#f59e0b",
  }[s] || "#6b7280");
  const labelStatus = (s: string) => ({
    resolvido: "✅ Resolvido", aberto: "💬 Aberto", em_atendimento: "👤 Em atendimento", pendente: "⏳ Pendente",
  }[s] || s);

  const limparFiltros = () => {
    setBusca(""); setFiltroStatus("todos"); setFiltroEtiqueta("todas");
    setFiltroAtendente("todos"); setFiltroPeriodo("todos");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 18 : 24 }}>

      {/* ═══ MODAL DE EDIÇÃO ═══ */}
      {contatoEditando && (
        <div onClick={fecharModal}
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", backdropFilter: "blur(4px)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ ...cardStyle, width: "100%", maxWidth: 680, maxHeight: "92vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>

            {/* Header do modal */}
            <div style={{ padding: "18px 24px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: "50%",
                  background: "linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "white", fontSize: 18, fontWeight: 700,
                  boxShadow: "0 4px 12px rgba(37,99,235,0.25)",
                }}>
                  {contatoEditando.nome.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 style={{ color: "#1f2937", fontSize: 16, fontWeight: 700, margin: 0 }}>{contatoEditando.nome}</h3>
                  <p style={{ color: "#6b7280", fontSize: 12, margin: "2px 0 0", fontFamily: "monospace" }}>📱 {contatoEditando.numero}</p>
                </div>
              </div>
              <button onClick={fecharModal}
                style={{ background: "#f3f4f6", border: "none", color: "#6b7280", fontSize: 16, cursor: "pointer", width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
            </div>

            <div style={{ padding: 24, overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 18 }}>

              {/* Nome editável */}
              <div>
                <label style={{ color: "#6b7280", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 6 }}>Nome do Contato</label>
                <input value={nomeEditado} onChange={e => setNomeEditado(e.target.value)} style={inputStyle} placeholder="Nome do contato" />
                <p style={{ color: "#9ca3af", fontSize: 10, margin: "4px 0 0" }}>Alterar aqui atualiza o nome em TODOS os atendimentos deste número.</p>
              </div>

              {/* Stats do contato */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10, padding: 12, textAlign: "center" }}>
                  <p style={{ color: "#2563eb", fontSize: 22, fontWeight: 800, margin: 0, letterSpacing: -0.5 }}>{contatoEditando.totalAtendimentos}</p>
                  <p style={{ color: "#6b7280", fontSize: 10, margin: "3px 0 0", fontWeight: 600, textTransform: "uppercase" }}>Atendimentos</p>
                </div>
                <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: 12, textAlign: "center" }}>
                  <p style={{ color: "#16a34a", fontSize: 22, fontWeight: 800, margin: 0, letterSpacing: -0.5 }}>{contatoEditando.atendimentos.filter(a => a.status === "resolvido").length}</p>
                  <p style={{ color: "#6b7280", fontSize: 10, margin: "3px 0 0", fontWeight: 600, textTransform: "uppercase" }}>Resolvidos</p>
                </div>
                <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: 12, textAlign: "center" }}>
                  <p style={{ color: "#f59e0b", fontSize: 22, fontWeight: 800, margin: 0, letterSpacing: -0.5 }}>{contatoEditando.atendimentos.filter(a => a.status === "aberto" || a.status === "em_atendimento" || a.status === "pendente").length}</p>
                  <p style={{ color: "#6b7280", fontSize: 10, margin: "3px 0 0", fontWeight: 600, textTransform: "uppercase" }}>Em aberto</p>
                </div>
              </div>

              {/* Etiquetas */}
              <div>
                <label style={{ color: "#6b7280", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 8 }}>🏷️ Etiquetas</label>
                {etiquetas.length === 0 ? (
                  <p style={{ color: "#9ca3af", fontSize: 12, fontStyle: "italic", margin: 0 }}>Nenhuma etiqueta cadastrada. Vá em Chatbot → Etiquetas para criar.</p>
                ) : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {etiquetas.map(e => {
                      const marcada = etiquetasSelecionadas.has(e.id);
                      return (
                        <button key={e.id} onClick={() => {
                          const nova = new Set(etiquetasSelecionadas);
                          if (nova.has(e.id)) nova.delete(e.id); else nova.add(e.id);
                          setEtiquetasSelecionadas(nova);
                        }}
                          style={{
                            background: marcada ? `${e.cor}15` : "#ffffff",
                            border: `1.5px solid ${marcada ? e.cor : "#e5e7eb"}`,
                            color: marcada ? e.cor : "#6b7280",
                            borderRadius: 20, padding: "6px 12px", fontSize: 12,
                            cursor: "pointer", fontWeight: 600,
                            display: "inline-flex", alignItems: "center", gap: 6,
                            transition: "all 0.15s",
                            boxShadow: marcada ? `0 2px 6px ${e.cor}25` : "none",
                          }}>
                          <span>{e.icone}</span>
                          <span>{e.nome}</span>
                          {marcada && <span style={{ marginLeft: 2 }}>✓</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Histórico recente */}
              <div>
                <label style={{ color: "#6b7280", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 8 }}>📜 Histórico de atendimentos</label>
                <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, maxHeight: 240, overflowY: "auto" }}>
                  {contatoEditando.atendimentos
                    .slice()
                    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                    .slice(0, 10)
                    .map(a => (
                      <div key={a.id}
                        style={{
                          padding: "8px 10px", borderRadius: 8,
                          background: "#ffffff", marginBottom: 6,
                          borderLeft: `3px solid ${corStatus(a.status)}`,
                          fontSize: 12,
                        }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                          <span style={{ color: corStatus(a.status), fontSize: 11, fontWeight: 700 }}>{labelStatus(a.status)}</span>
                          <span style={{ color: "#9ca3af", fontSize: 10 }}>{new Date(a.created_at).toLocaleString("pt-BR")}</span>
                        </div>
                        <p style={{ color: "#374151", fontSize: 12, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.mensagem || "—"}</p>
                        <p style={{ color: "#9ca3af", fontSize: 10, margin: "3px 0 0" }}>
                          {a.fila && <>📋 {a.fila} · </>}
                          {a.atendente && (a.atendente === "BOT" ? "🤖 BOT" : `👤 ${a.atendente}`)}
                        </p>
                      </div>
                    ))}
                  {contatoEditando.atendimentos.length > 10 && (
                    <p style={{ color: "#9ca3af", fontSize: 11, textAlign: "center", margin: "8px 0 0", fontStyle: "italic" }}>
                      +{contatoEditando.atendimentos.length - 10} atendimentos mais antigos
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Footer modal */}
            <div style={{ padding: "14px 24px", borderTop: "1px solid #e5e7eb", display: "flex", gap: 10, justifyContent: "space-between", background: "#f9fafb", flexWrap: "wrap" }}>
              <button onClick={() => excluirContato(contatoEditando)}
                style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", borderRadius: 10, padding: "9px 18px", fontSize: 12, cursor: "pointer", fontWeight: 700 }}>
                🗑️ Excluir contato
              </button>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => { fecharModal(); router.push("/chatbot"); }}
                  style={{ background: "#ffffff", color: "#2563eb", border: "1px solid #bfdbfe", borderRadius: 10, padding: "9px 18px", fontSize: 12, cursor: "pointer", fontWeight: 700 }}>
                  💬 Abrir chat
                </button>
                <button onClick={salvarContato} disabled={salvandoContato}
                  style={{
                    background: salvandoContato ? "#1e40af" : "linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)",
                    color: "white", border: "none", borderRadius: 10, padding: "9px 22px", fontSize: 12,
                    cursor: salvandoContato ? "not-allowed" : "pointer", fontWeight: 700,
                    boxShadow: "0 4px 12px rgba(37,99,235,0.3)",
                  }}>
                  {salvandoContato ? "Salvando..." : "💾 Salvar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ HEADER ═══ */}
      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: isMobile ? "stretch" : "center", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14,
            background: "linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 24, boxShadow: "0 8px 20px rgba(37,99,235,0.25)",
            flexShrink: 0,
          }}>
            <span style={{ filter: "saturate(0) brightness(2)" }}>👥</span>
          </div>
          <div>
            <h1 style={{ color: "#1f2937", fontSize: isMobile ? 20 : 24, fontWeight: 700, margin: 0, letterSpacing: -0.3 }}>Meus Contatos</h1>
            <p style={{ color: "#6b7280", fontSize: 12, margin: "2px 0 0" }}>
              Leads que chegaram pelo WhatsApp · <b style={{ color: "#2563eb" }}>{contatos.length}</b> contato(s) únicos
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <EquipeSelector />
          <button onClick={exportar} disabled={exportando || contatosFiltrados.length === 0}
            style={{
              background: (exportando || contatosFiltrados.length === 0) ? "#f3f4f6" : "linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)",
              color: (exportando || contatosFiltrados.length === 0) ? "#9ca3af" : "white",
              border: "none", borderRadius: 12, padding: "11px 20px", fontSize: 13,
              cursor: (exportando || contatosFiltrados.length === 0) ? "not-allowed" : "pointer", fontWeight: 700,
              boxShadow: (exportando || contatosFiltrados.length === 0) ? "none" : "0 4px 12px rgba(37,99,235,0.3)",
              whiteSpace: "nowrap",
            }}>
            {exportando ? "⏳ Exportando..." : "📥 Exportar Excel"}
          </button>
        </div>
      </div>

      {/* Banner MODO DEMO */}
      {modoDemo && (
        <div style={{
          background: "linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)",
          border: "1px solid #bfdbfe",
          borderLeft: "4px solid #2563eb",
          borderRadius: 12,
          padding: "12px 18px",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}>
          <span style={{ fontSize: 22 }}>💡</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ color: "#1e40af", fontSize: 13.5, margin: 0, fontWeight: 700 }}>
              Modo Demonstração
            </p>
            <p style={{ color: "#3b82f6", fontSize: 12, margin: "2px 0 0", lineHeight: 1.4 }}>
              Os contatos abaixo são <b>fictícios</b>. Conecte o chatbot WhatsApp ou crie a tabela <code style={{ background: "#dbeafe", padding: "1px 6px", borderRadius: 4, fontFamily: "monospace", fontSize: 11.5 }}>atendimentos</code> no Supabase pra ver dados reais.
            </p>
          </div>
        </div>
      )}

      {/* Truncamento */}
      {truncado && (
        <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderLeft: "4px solid #f59e0b", borderRadius: 12, padding: "12px 16px" }}>
          <p style={{ color: "#92400e", fontSize: 12, margin: 0, fontWeight: 600 }}>
            ⚠️ Mostrando os 10.000 atendimentos mais recentes. Use os <b>Relatórios</b> com filtros de período se precisar de mais.
          </p>
        </div>
      )}

      {/* ═══ STATS ═══ */}
      <div style={{ display: "flex", gap: isMobile ? 10 : 14, flexWrap: "wrap" }}>
        {[
          { label: "Total de contatos", value: stats.total, color: "#2563eb", icon: "👥" },
          { label: "Últimos 7 dias", value: stats.novosSemana, color: "#8b5cf6", icon: "📅" },
          { label: "Em aberto", value: stats.ativos, color: "#f59e0b", icon: "💬" },
          { label: "Atendidos pelo bot", value: stats.bot, color: "#16a34a", icon: "🤖" },
        ].map(card => (
          <div key={card.label}
            style={{
              flex: isMobile ? "1 1 calc(50% - 5px)" : 1, minWidth: isMobile ? 0 : 140,
              ...cardStyle,
              padding: isMobile ? 14 : 18,
              borderTop: `3px solid ${card.color}`,
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.boxShadow = `0 8px 20px ${card.color}20`; e.currentTarget.style.transform = "translateY(-2px)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)"; e.currentTarget.style.transform = "translateY(0)"; }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: `${card.color}15`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>
                {card.icon}
              </div>
              <p style={{ color: "#6b7280", fontSize: isMobile ? 10 : 11, margin: 0, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.3 }}>{card.label}</p>
            </div>
            <p style={{ color: card.color, fontSize: isMobile ? 24 : 30, fontWeight: 800, margin: 0, letterSpacing: -1 }}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* ═══ FILTROS ═══ */}
      <div style={{ ...cardStyle, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <input placeholder="🔍 Buscar por nome, número ou mensagem..." value={busca} onChange={e => setBusca(e.target.value)}
            style={{ ...inputStyle, flex: "1 1 280px", maxWidth: 500, borderRadius: 20 }} />

          <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} style={{ ...inputStyle, maxWidth: 160 }}>
            <option value="todos">Status: Todos</option>
            <option value="aberto">💬 Aberto</option>
            <option value="em_atendimento">👤 Em atendimento</option>
            <option value="pendente">⏳ Pendente</option>
            <option value="resolvido">✅ Resolvido</option>
          </select>

          <select value={filtroEtiqueta} onChange={e => setFiltroEtiqueta(e.target.value)} style={{ ...inputStyle, maxWidth: 200 }}>
            <option value="todas">🏷️ Etiqueta: Todas</option>
            {etiquetas.map(e => <option key={e.id} value={e.id.toString()}>{e.icone} {e.nome}</option>)}
          </select>

          <select value={filtroAtendente} onChange={e => setFiltroAtendente(e.target.value)} style={{ ...inputStyle, maxWidth: 180 }}>
            <option value="todos">Atendente: Todos</option>
            {atendentesUnicos.map(a => <option key={a} value={a}>{a === "BOT" ? "🤖 BOT" : `👤 ${a}`}</option>)}
          </select>
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {[
            { key: "todos", label: "📅 Todos", color: "#8b5cf6" },
            { key: "hoje", label: "📆 Hoje", color: "#16a34a" },
            { key: "semana", label: "🗓️ 7 dias", color: "#2563eb" },
            { key: "mes", label: "📊 30 dias", color: "#f59e0b" },
          ].map(p => {
            const ativo = filtroPeriodo === p.key;
            return (
              <button key={p.key} onClick={() => setFiltroPeriodo(p.key as any)}
                style={{
                  background: ativo ? `${p.color}15` : "#f9fafb",
                  color: ativo ? p.color : "#6b7280",
                  border: `1px solid ${ativo ? `${p.color}50` : "#e5e7eb"}`,
                  borderRadius: 10, padding: "7px 14px", fontSize: 12,
                  cursor: "pointer", fontWeight: ativo ? 700 : 600,
                  boxShadow: ativo ? `0 2px 8px ${p.color}20` : "none",
                  transition: "all 0.15s",
                }}>
                {p.label}
              </button>
            );
          })}
          {(busca || filtroStatus !== "todos" || filtroEtiqueta !== "todas" || filtroAtendente !== "todos" || filtroPeriodo !== "todos") && (
            <button onClick={limparFiltros}
              style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", borderRadius: 10, padding: "7px 14px", fontSize: 12, cursor: "pointer", fontWeight: 700, marginLeft: "auto" }}>
              ✕ Limpar filtros
            </button>
          )}
        </div>
        <p style={{ color: "#6b7280", fontSize: 11, margin: 0 }}>
          <b style={{ color: "#1f2937" }}>{contatosFiltrados.length}</b> contato(s) {contatosFiltrados.length !== contatos.length && `de ${contatos.length} `}encontrado(s)
        </p>
      </div>

      {/* ═══ LISTA / TABELA ═══ */}
      {loading ? (
        <div style={{ ...cardStyle, padding: 48, textAlign: "center" }}>
          <p style={{ color: "#6b7280" }}>Carregando contatos...</p>
        </div>
      ) : contatos.length === 0 ? (
        <div style={{ ...cardStyle, padding: 48, textAlign: "center" }}>
          <div style={{
            width: 80, height: 80, borderRadius: 20,
            background: "linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 40, margin: "0 auto 16px",
            boxShadow: "0 12px 24px rgba(37,99,235,0.25)",
          }}>
            <span style={{ filter: "saturate(0) brightness(2)" }}>👥</span>
          </div>
          <h3 style={{ color: "#1f2937", fontSize: 16, fontWeight: 700, margin: "0 0 8px 0" }}>Nenhum contato ainda</h3>
          <p style={{ color: "#6b7280", fontSize: 13, margin: 0 }}>Os leads que chegarem pelo WhatsApp aparecerão aqui automaticamente.</p>
        </div>
      ) : contatosFiltrados.length === 0 ? (
        <div style={{ ...cardStyle, padding: 40, textAlign: "center" }}>
          <p style={{ fontSize: 36, margin: "0 0 8px" }}>🔍</p>
          <p style={{ color: "#6b7280", fontSize: 13 }}>Nenhum contato com esses filtros</p>
        </div>
      ) : isMobile ? (
        /* ═══ MOBILE: CARDS ═══ */
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {contatosPagina.map(c => {
            const cor = corStatus(c.ultimoStatus);
            const etiqs = c.etiquetasIds.map(id => etiquetas.find(e => e.id === id)).filter(Boolean) as Etiqueta[];
            return (
              <div key={c.numero} onClick={() => abrirEditar(c)}
                style={{
                  ...cardStyle, padding: 14, cursor: "pointer",
                  borderLeft: `4px solid ${cor}`,
                  display: "flex", flexDirection: "column", gap: 10,
                  transition: "all 0.15s",
                }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{
                    width: 42, height: 42, borderRadius: "50%",
                    background: "linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "white", fontSize: 16, fontWeight: 700, flexShrink: 0,
                  }}>
                    {c.nome.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ color: "#1f2937", fontSize: 14, fontWeight: 700, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.nome}</p>
                    <p style={{ color: "#6b7280", fontSize: 12, margin: "2px 0 0", fontFamily: "monospace" }}>📱 {c.numero}</p>
                  </div>
                  <span style={{ background: "#f3e8ff", color: "#8b5cf6", border: "1px solid #ddd6fe", fontSize: 11, padding: "3px 8px", borderRadius: 8, fontWeight: 700, flexShrink: 0 }}>
                    {c.totalAtendimentos}
                  </span>
                </div>
                <p style={{ color: "#6b7280", fontSize: 12, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.ultimaMensagem || "—"}</p>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {etiqs.slice(0, 3).map(e => (
                    <span key={e.id} style={{ background: e.cor + "15", color: e.cor, border: `1px solid ${e.cor}40`, fontSize: 10, padding: "2px 8px", borderRadius: 8, fontWeight: 600 }}>
                      {e.icone} {e.nome}
                    </span>
                  ))}
                  {etiqs.length > 3 && <span style={{ color: "#9ca3af", fontSize: 10, padding: "2px 4px", fontStyle: "italic" }}>+{etiqs.length - 3}</span>}
                  <span style={{ background: `${cor}15`, color: cor, border: `1px solid ${cor}40`, fontSize: 10, padding: "2px 8px", borderRadius: 8, fontWeight: 700, marginLeft: "auto" }}>
                    {labelStatus(c.ultimoStatus)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ═══ DESKTOP: TABELA ═══ */
        <div style={{ ...cardStyle, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f9fafb" }}>
                  {["Contato", "Telefone", "Etiquetas", "Última Interação", "Atendente", "Status", "Atendim.", ""].map(h => (
                    <th key={h} style={{ padding: "12px 16px", color: "#6b7280", fontSize: 11, textAlign: "left", textTransform: "uppercase", letterSpacing: 0.5, whiteSpace: "nowrap", fontWeight: 700, borderBottom: "1px solid #e5e7eb" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {contatosPagina.map((c, i) => {
                  const cor = corStatus(c.ultimoStatus);
                  const etiqs = c.etiquetasIds.map(id => etiquetas.find(e => e.id === id)).filter(Boolean) as Etiqueta[];
                  return (
                    <tr key={c.numero} onClick={() => abrirEditar(c)}
                      style={{
                        borderTop: "1px solid #f3f4f6",
                        background: i % 2 === 0 ? "#ffffff" : "#fafbfc",
                        cursor: "pointer", transition: "background 0.1s",
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = "#f3f4f6"}
                      onMouseLeave={(e) => e.currentTarget.style.background = i % 2 === 0 ? "#ffffff" : "#fafbfc"}
                    >
                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{
                            width: 34, height: 34, borderRadius: "50%",
                            background: "linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            color: "white", fontSize: 13, fontWeight: 700, flexShrink: 0,
                          }}>
                            {c.nome.charAt(0).toUpperCase()}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <p style={{ color: "#1f2937", fontSize: 13, fontWeight: 700, margin: 0, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.nome}</p>
                            <p style={{ color: "#9ca3af", fontSize: 11, margin: "2px 0 0", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.ultimaMensagem || "—"}</p>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: "12px 16px", color: "#6b7280", fontSize: 12, fontFamily: "monospace", whiteSpace: "nowrap" }}>{c.numero}</td>
                      <td style={{ padding: "12px 16px" }}>
                        {etiqs.length === 0 ? <span style={{ color: "#d1d5db", fontSize: 11 }}>—</span> : (
                          <div style={{ display: "flex", gap: 3, flexWrap: "wrap", maxWidth: 180 }}>
                            {etiqs.slice(0, 2).map(e => (
                              <span key={e.id} style={{ background: e.cor + "15", color: e.cor, border: `1px solid ${e.cor}40`, fontSize: 10, padding: "2px 7px", borderRadius: 8, fontWeight: 600, whiteSpace: "nowrap" }}>
                                {e.icone} {e.nome}
                              </span>
                            ))}
                            {etiqs.length > 2 && <span style={{ color: "#9ca3af", fontSize: 10, padding: "2px 4px", fontStyle: "italic" }}>+{etiqs.length - 2}</span>}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "12px 16px", color: "#6b7280", fontSize: 11, whiteSpace: "nowrap" }}>
                        {new Date(c.ultimaData).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td style={{ padding: "12px 16px", color: "#4b5563", fontSize: 12 }}>
                        {c.ultimoAtendente ? (c.ultimoAtendente === "BOT" ? "🤖 BOT" : `👤 ${c.ultimoAtendente}`) : <span style={{ color: "#d1d5db" }}>—</span>}
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <span style={{
                          background: `${cor}15`, color: cor,
                          border: `1px solid ${cor}40`,
                          fontSize: 11, padding: "3px 10px", borderRadius: 10, fontWeight: 700, whiteSpace: "nowrap",
                        }}>{labelStatus(c.ultimoStatus)}</span>
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <span style={{ background: "#f3e8ff", color: "#8b5cf6", border: "1px solid #ddd6fe", fontSize: 11, padding: "3px 10px", borderRadius: 10, fontWeight: 700 }}>
                          {c.totalAtendimentos}
                        </span>
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <button onClick={(e) => { e.stopPropagation(); abrirEditar(c); }}
                          style={{ background: "#eff6ff", color: "#2563eb", border: "1px solid #bfdbfe", borderRadius: 8, padding: "5px 11px", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>
                          ✏️
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══ PAGINAÇÃO ═══ */}
      {totalPaginas > 1 && (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, padding: "12px 0", flexWrap: "wrap" }}>
          <button onClick={() => setPaginaAtual(p => Math.max(1, p - 1))} disabled={paginaAtual === 1}
            style={{
              background: paginaAtual === 1 ? "#f3f4f6" : "#ffffff",
              color: paginaAtual === 1 ? "#9ca3af" : "#374151",
              border: "1px solid #e5e7eb", borderRadius: 10,
              padding: "8px 14px", fontSize: 12,
              cursor: paginaAtual === 1 ? "not-allowed" : "pointer", fontWeight: 600,
            }}>
            ← Anterior
          </button>
          <span style={{ color: "#6b7280", fontSize: 13, padding: "0 12px", fontWeight: 600 }}>
            Página <b style={{ color: "#1f2937" }}>{paginaAtual}</b> de <b style={{ color: "#1f2937" }}>{totalPaginas}</b>
          </span>
          <button onClick={() => setPaginaAtual(p => Math.min(totalPaginas, p + 1))} disabled={paginaAtual === totalPaginas}
            style={{
              background: paginaAtual === totalPaginas ? "#f3f4f6" : "#ffffff",
              color: paginaAtual === totalPaginas ? "#9ca3af" : "#374151",
              border: "1px solid #e5e7eb", borderRadius: 10,
              padding: "8px 14px", fontSize: 12,
              cursor: paginaAtual === totalPaginas ? "not-allowed" : "pointer", fontWeight: 600,
            }}>
            Próxima →
          </button>
        </div>
      )}
    </div>
  );
}