"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { LeitorFinanceiroIA } from "./LeitorFinanceiroIA";
import { MetasInadimplencia } from "./MetasInadimplencia";
import { CadastrosFinanceiros } from "./CadastrosFinanceiros";
import { IntegracaoBancaria } from "./IntegracaoBancaria";
import { RelatoriosFinanceiros } from "./RelatoriosFinanceiros";
import { ConciliacaoAvancada } from "./ConciliacaoAvancada";
import { ImportacaoFinanceira } from "./ImportacaoFinanceira";
import { ConfiguracaoComissaoPlanos } from "./ConfiguracaoComissaoPlanos";
import { CaixaGeralAutomatico } from "./CaixaGeralAutomatico";
import { usePermissao } from "../../../hooks/usePermissao";

const moeda = (v: number) => (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const compAtual = () => new Date().toISOString().slice(0, 7);
const inicioProximaComp = (c: string) => {
  const [a, m] = c.split("-").map(Number);
  const d = new Date(a, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
};
const mesNome = (c: string) => {
  const [a, m] = c.split("-").map(Number);
  return new Date(a, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
};
const card = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: 20, boxShadow: "0 10px 28px rgba(15,23,42,.05)" } as const;
const input = { border: "1px solid #cbd5e1", borderRadius: 10, padding: "10px 12px", minHeight: 42, fontSize: 12, background: "#fff" } as const;
const botao = { border: "1px solid #365f4b", borderRadius: 10, padding: "10px 15px", minHeight: 40, fontSize: 12, fontWeight: 800, cursor: "pointer", background: "linear-gradient(180deg,#7fb095 0%,#5b8f74 100%)", color: "#fff", boxShadow: "0 2px 0 #294c3b,0 7px 14px rgba(91,143,116,.18)" } as const;

type Titulo = { id: string; tipo: string; descricao: string; valor: number; status: string; competencia: string; vencimento: string; categoria: string; centro_custo?: string; valor_conciliado?: number; origem_modulo?: string; origem_tipo?: string };
type Fechamento = { competencia: string; status: string; entradas_snapshot: number; saidas_snapshot: number; saldo_snapshot: number };
type Venda = { id: number; nome: string; vendedor: string; plano: string; dados_customizados?: Record<string, any>; data_instalacao: string; comissao_manual: number };
type Extrato = { id: string; data: string; descricao: string; valor: number; tipo: string; conciliado: boolean; titulo_id?: string; status_conciliacao?: string; valor_alocado?: number };
type Alerta = { id: string; tipo: string; titulo: string; mensagem: string; vencimento: string; status: string };
type IdentidadeVendedor = { id?: number | string; email: string; nome: string; fila: string; filaId?: number | string | null; filasAcesso?: (number | string)[] };
type EquipeSupervisor = { id: number | string; nome: string; responsavel_usuario_id?: number | string | null };
type FaixaComissao = { de: number; ate: number | null; valor: number };
type RegraComissao = { id?: string; competencia: string; vendedor: string; modo: "por_plano" | "por_venda" | "faixas" | "valor_unico"; valor_por_venda: number; valor_unico: number; faixas: FaixaComissao[]; valores_por_plano: Record<string, number> };
type PlanoComissao = { plano: string; valor_comissao: number; ativo: boolean };
const normalizarPlano = (valor: string) => String(valor || "").trim().replace(/\s+/g, " ").toLocaleUpperCase("pt-BR").replace(/GLOBO PLAY/g, "GLOBOPLAY").replace(/PARAMOUNT\+/g, "PARAMOUNT").replace(/ MEGAS/g, " MEGA").replace(/ MB/g, " MEGA").replace(/ GB/g, " GIGA").replace(/ COM /g, " ").replace(/\s*\+\s*/g, " ").replace(/\s*-\s*/g, "-").replace(/\s+/g, " ").trim();
const planoResolvido = (item: Venda) => String(item.plano || item.dados_customizados?.plano_escolhido || item.dados_customizados?.plano || "").trim();

export function GestaoFinanceiraRH() {
  const { isDono, isSuperAdmin, perfil } = usePermissao();
  const podeEditarComissao = isDono || isSuperAdmin || perfil === "Administrador";
  const [aba, setAba] = useState("caixa");
  const [comp, setComp] = useState(compAtual());
  const [titulos, setTitulos] = useState<Titulo[]>([]);
  const [fechamentos, setFechamentos] = useState<Fechamento[]>([]);
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [extratos, setExtratos] = useState<Extrato[]>([]);
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState("");
  const [identidades, setIdentidades] = useState<IdentidadeVendedor[]>([]);
  const [equipesSupervisor, setEquipesSupervisor] = useState<EquipeSupervisor[]>([]);
  const [regraSupervisor, setRegraSupervisor] = useState({ valor: 10, desconto: 20 });
  const [vendedorAberto, setVendedorAberto] = useState<string | null>(null);
  const [salvandoVenda, setSalvandoVenda] = useState<number | null>(null);
  const [regrasComissao, setRegrasComissao] = useState<RegraComissao[]>([]);
  const [salvandoRegra, setSalvandoRegra] = useState<string | null>(null);
  const [planosComissao, setPlanosComissao] = useState<PlanoComissao[]>([]);
  const [salvandoPlanosInline, setSalvandoPlanosInline] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [u, f, r] = await Promise.all([
        supabase.from("usuarios").select("id,email,nome,fila_id,filas_acesso"),
        supabase.from("filas").select("id,nome,responsavel_usuario_id").eq("ativo", true),
        supabase.from("fin_planilha_regras").select("valor_venda_supervisor,percentual_desconto_supervisor").eq("id",1).maybeSingle(),
      ]);
      const filas = new Map((f.data || []).map((x: any) => [String(x.id), x.nome]));
      setIdentidades((u.data || []).map((x: any) => ({ id:x.id, email:String(x.email||""), nome:String(x.nome||x.email||""), filaId:x.fila_id, filasAcesso:Array.isArray(x.filas_acesso)?x.filas_acesso:[], fila:x.fila_id==null?"Sem equipe":String(filas.get(String(x.fila_id))||`Equipe ${x.fila_id}`) })));
      setEquipesSupervisor((f.data || []) as EquipeSupervisor[]);
      if (r.data) setRegraSupervisor({ valor:Number(r.data.valor_venda_supervisor)||0, desconto:Number(r.data.percentual_desconto_supervisor)||0 });
    })();
  }, []);

  const identidadeDoVendedor = (chave: string) => {
    const normal = chave.trim().toLowerCase();
    return identidades.find(x => x.email.trim().toLowerCase() === normal || x.nome.trim().toLowerCase() === normal);
  };
  const carregar = async () => {
    const [t, f, v, e, a, r, pc] = await Promise.all([
      supabase.from("fin_titulos").select("id,tipo,descricao,valor,status,competencia,vencimento,categoria,centro_custo,valor_conciliado,origem_modulo,origem_tipo").order("vencimento"),
      supabase.from("fin_competencias").select("*").order("competencia", { ascending: false }),
      supabase.from("proposta").select("id,nome,vendedor,plano,dados_customizados,data_instalacao,comissao_manual").in("status_venda", ["INSTALADA", "BACKLOG"]).gte("data_instalacao", `${comp}-01`).lt("data_instalacao", inicioProximaComp(comp)).order("vendedor"),
      supabase.from("fin_extratos").select("*").order("data", { ascending: false }).limit(500),
      supabase.from("fin_alertas").select("*").neq("status", "resolvido").order("vencimento"),
      supabase.from("fin_comissao_regras").select("*").eq("competencia", comp),
      supabase.from("fin_comissao_planos").select("plano,valor_comissao,ativo"),
    ]);
    setTitulos((t.data || []).map((x: any) => ({ ...x, valor: Number(x.valor) || 0, competencia: x.competencia || (x.vencimento || "").slice(0, 7) })));
    setFechamentos((f.data || []) as Fechamento[]);
    setVendas((v.data || []).map((x: any) => ({ ...x, plano: planoResolvido(x), comissao_manual: Number(x.comissao_manual) || 0 })) as Venda[]);
    setExtratos((e.data || []).map((x: any) => ({ ...x, valor: Number(x.valor) || 0 })) as Extrato[]);
    setAlertas((a.data || []) as Alerta[]);
    setRegrasComissao((r.data || []).map((x: any) => ({ ...x, valor_por_venda: Number(x.valor_por_venda) || 0, valor_unico: Number(x.valor_unico) || 0, faixas: Array.isArray(x.faixas) ? x.faixas.map((f: any) => ({ de: Number(f.de) || 0, ate: f.ate === null || f.ate === "" ? null : Number(f.ate), valor: Number(f.valor) || 0 })) : [], valores_por_plano: Object.fromEntries(Object.entries(x.valores_por_plano || {}).map(([k,v]) => [k, Number(v) || 0])) })) as RegraComissao[]);
    setPlanosComissao((pc.data || []).map((x: any) => ({ ...x, valor_comissao: Number(x.valor_comissao) || 0 })) as PlanoComissao[]);
  };
  useEffect(() => { carregar(); supabase.rpc("gerar_alertas_financeiros"); }, [comp]);

  const meses = useMemo(() => {
    const mapa: Record<string, { entradas: number; saidas: number }> = {};
    titulos.forEach(t => {
      if (!t.competencia) return;
      mapa[t.competencia] ||= { entradas: 0, saidas: 0 };
      if (t.tipo === "receber") mapa[t.competencia].entradas += t.valor;
      else mapa[t.competencia].saidas += t.valor;
    });
    return Object.entries(mapa).map(([competencia, x]) => ({ competencia, ...x, saldo: x.entradas - x.saidas })).sort((a, b) => b.competencia.localeCompare(a.competencia));
  }, [titulos]);
  const atual = meses.find(x => x.competencia === comp) || { entradas: 0, saidas: 0, saldo: 0 };
  const fechado = fechamentos.find(x => x.competencia === comp)?.status === "fechada";

  const fechar = async () => {
    setOcupado(true);
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from("fin_competencias").upsert({
      competencia: comp, status: fechado ? "aberta" : "fechada",
      fechado_em: fechado ? null : new Date().toISOString(),
      fechado_por: fechado ? null : auth.user?.email,
      entradas_snapshot: atual.entradas, saidas_snapshot: atual.saidas, saldo_snapshot: atual.saldo,
      updated_at: new Date().toISOString(),
    });
    setMsg(error ? error.message : fechado ? "Competência reaberta." : "Competência fechada com snapshot.");
    setOcupado(false); carregar();
  };

  const sincronizarRH = async () => {
    setOcupado(true);
    const { data, error } = await supabase.rpc("sincronizar_financeiro_rh", { p_competencia: comp });
    setMsg(error ? error.message : `RH sincronizado: ${JSON.stringify(data)}`);
    setOcupado(false); carregar();
  };

  const salvarVenda = async (v: Venda, patch: Partial<Venda>) => {
    const atualizado = { ...v, ...patch };
    setVendas(xs => xs.map(x => x.id === v.id ? atualizado : x));
    const payload: any = { ...patch };
    const { error } = await supabase.from("proposta").update(payload).eq("id", v.id);
    if (!error) await supabase.rpc("sincronizar_financeiro_rh", { p_competencia: comp });
    else setMsg(error.message);
  };

  const conciliarAutomatico = async () => {
    setOcupado(true);
    let n = 0;
    for (const e of extratos.filter(x => !x.conciliado)) {
      const alvo = titulos.find(t => !t.status?.includes("conciliado") && Math.abs(t.valor - e.valor) < 0.01 && t.tipo === (e.tipo === "credito" ? "receber" : "pagar"));
      if (!alvo) continue;
      await supabase.from("fin_extratos").update({ conciliado: true, titulo_id: alvo.id }).eq("id", e.id);
      n++;
    }
    setMsg(`${n} movimento(s) conciliado(s) automaticamente.`);
    setOcupado(false); carregar();
  };

  const gerarAlertas = async () => {
    setOcupado(true);
    const { data, error } = await supabase.rpc("gerar_alertas_financeiros");
    setMsg(error ? error.message : `${data || 0} novo(s) alerta(s).`);
    setOcupado(false); carregar();
  };

  const porVendedor = useMemo(() => {
    const mapaPlanos = new Map<string, number>();
    [...planosComissao].sort((a,b) => Number(a.ativo) - Number(b.ativo)).forEach(x => mapaPlanos.set(normalizarPlano(x.plano), x.valor_comissao));
    const m: Record<string, { qtd: number; valor: number; valorPlano: number; vendas: Venda[] }> = {};
    vendas.forEach(v => {
      const k = v.vendedor || "Sem vendedor";
      m[k] ||= { qtd: 0, valor: 0, valorPlano: 0, vendas: [] };
      m[k].qtd++;
      m[k].valor += v.comissao_manual;
      m[k].valorPlano += mapaPlanos.get(normalizarPlano(v.plano)) || 0;
      m[k].vendas.push(v);
    });
    return Object.entries(m).sort((a, b) => b[1].qtd - a[1].qtd);
  }, [vendas, planosComissao]);

  const comissoesSupervisor = useMemo(() => {
    const porIdentidade = new Map<string, IdentidadeVendedor>();
    identidades.forEach(item => { porIdentidade.set(item.email.trim().toLowerCase(),item); porIdentidade.set(item.nome.trim().toLowerCase(),item); });
    const equipePorId = new Map(equipesSupervisor.map(item => [String(item.id),item]));
    const usuarioPorId = new Map(identidades.map(item => [String(item.id),item]));
    const grupos = new Map<string,{ equipe:EquipeSupervisor; quantidade:number }>();
    vendas.forEach(venda => {
      const identidade=porIdentidade.get(String(venda.vendedor||"").trim().toLowerCase());
      const filaId=venda.dados_customizados?.equipe_comercial_id||venda.dados_customizados?.fila_id||identidade?.filaId||identidade?.filasAcesso?.[0];
      const equipe=filaId!=null?equipePorId.get(String(filaId)):undefined;
      if(!equipe?.responsavel_usuario_id)return;
      const chave=String(equipe.id); const atual=grupos.get(chave)||{equipe,quantidade:0}; atual.quantidade++; grupos.set(chave,atual);
    });
    return Array.from(grupos.values()).map(item=>{const bruto=item.quantidade*regraSupervisor.valor;const desconto=bruto*regraSupervisor.desconto/100;return{...item,responsavel:usuarioPorId.get(String(item.equipe.responsavel_usuario_id)),bruto,desconto,total:bruto-desconto};}).sort((a,b)=>b.total-a.total);
  },[vendas,identidades,equipesSupervisor,regraSupervisor]);

  const regraDoVendedor = (vendedor: string): RegraComissao => regrasComissao.find(r => r.vendedor.trim().toLowerCase() === vendedor.trim().toLowerCase()) || { competencia: comp, vendedor, modo: "por_plano", valor_por_venda: 0, valor_unico: 0, faixas: [], valores_por_plano: {} };

  const atualizarRegra = (vendedor: string, patch: Partial<RegraComissao>) => {
    setRegrasComissao(xs => {
      const atual = xs.find(r => r.vendedor.trim().toLowerCase() === vendedor.trim().toLowerCase());
      if (atual) return xs.map(r => r === atual ? { ...r, ...patch } : r);
      return [...xs, { competencia: comp, vendedor, modo: "por_plano", valor_por_venda: 0, valor_unico: 0, faixas: [], valores_por_plano: {}, ...patch }];
    });
  };

  const salvarRegraComissao = async (vendedor: string) => {
    const regra = regraDoVendedor(vendedor);
    setSalvandoRegra(vendedor);
    const payload = { competencia: comp, vendedor, modo: regra.modo, valor_por_venda: regra.valor_por_venda || 0, valor_unico: regra.valor_unico || 0, faixas: regra.faixas, valores_por_plano: regra.valores_por_plano || {} };
    const resposta = regra.id ? await supabase.from("fin_comissao_regras").update(payload).eq("id", regra.id).select("*").single() : await supabase.from("fin_comissao_regras").insert(payload).select("*").single();
    if (resposta.error) setMsg(resposta.error.message);
    else {
      setRegrasComissao(xs => xs.map(r => r.vendedor.trim().toLowerCase() === vendedor.trim().toLowerCase() ? { ...r, id: resposta.data.id } : r));
      const sync = await supabase.rpc("sincronizar_financeiro_rh", { p_competencia: comp });
      setMsg(sync.error ? sync.error.message : "Regra de comissão salva e folha recalculada.");
    }
    setSalvandoRegra(null);
  };

  const valorPlano = (nomePlano: string) => {
    const correspondentes = [...planosComissao]
      .sort((a, b) => Number(a.ativo) - Number(b.ativo))
      .filter(item => normalizarPlano(item.plano) === normalizarPlano(nomePlano));
    return Number(correspondentes.at(-1)?.valor_comissao || 0);
  };

  const valorPlanoVendedor = (vendedor: string, nomePlano: string) => {
    const regra = regraDoVendedor(vendedor);
    const chave = normalizarPlano(nomePlano);
    return Object.prototype.hasOwnProperty.call(regra.valores_por_plano || {}, chave)
      ? Number(regra.valores_por_plano[chave]) || 0
      : valorPlano(nomePlano);
  };

  const editarValorPlanoVendedor = (vendedor: string, nomePlano: string, valor: number) => {
    const regra=regraDoVendedor(vendedor);
    atualizarRegra(vendedor,{ valores_por_plano: { ...(regra.valores_por_plano || {}), [normalizarPlano(nomePlano)]: valor } });
  };

  const salvarPlanosInline = async (vendedor: string) => {
    if (!podeEditarComissao) return;
    setSalvandoPlanosInline(vendedor);
    const regra=regraDoVendedor(vendedor);
    const payload={ competencia:comp, vendedor, modo:"por_plano", valor_por_venda:regra.valor_por_venda||0, valor_unico:regra.valor_unico||0, faixas:regra.faixas, valores_por_plano:regra.valores_por_plano||{} };
    const resposta=regra.id
      ? await supabase.from("fin_comissao_regras").update(payload).eq("id",regra.id).select("*").single()
      : await supabase.from("fin_comissao_regras").insert(payload).select("*").single();
    if(resposta.error) setMsg(resposta.error.message);
    else {
      setRegrasComissao(xs=>xs.map(r=>r.vendedor.trim().toLowerCase()===vendedor.trim().toLowerCase()?{...r,id:resposta.data.id}:r));
      const sync=await supabase.rpc("sincronizar_financeiro_rh",{p_competencia:comp});
      setMsg(sync.error?sync.error.message:"Valores exclusivos deste vendedor salvos e folha recalculada.");
    }
    setSalvandoPlanosInline(null);
    await carregar();
  };

  const valorCalculado = (grupo: { qtd: number; valor: number; valorPlano: number; vendas: Venda[] }, regra: RegraComissao, vendedor: string) => {
    if (grupo.qtd < 20) return 0;
    if (regra.modo === "por_venda") return grupo.qtd * regra.valor_por_venda;
    if (regra.modo === "valor_unico") return regra.valor_unico;
    if (regra.modo === "faixas") {
      const faixa = [...regra.faixas].sort((a,b) => b.de-a.de).find(f => grupo.qtd >= f.de && (f.ate == null || grupo.qtd <= f.ate));
      return grupo.qtd * Number(faixa?.valor || 0);
    }
    return grupo.vendas.reduce((total,venda)=>total+valorPlanoVendedor(vendedor,venda.plano),0);
  };
  const editarComissaoLocal = (id: number, valor: number) => {
    setVendas(xs => xs.map(x => x.id === id ? { ...x, comissao_manual: valor } : x));
  };

  const gravarComissao = async (v: Venda) => {
    setSalvandoVenda(v.id);
    await salvarVenda(v, { comissao_manual: v.comissao_manual });
    setSalvandoVenda(null);
  };

  const nomesAba: Record<string, string> = {
    caixa: "Caixa geral", competencias: "Competências", relatorios: "Relatórios",
    rh: "RH integrado", comissoes: "Comissões", importacao: "Importação",
    conciliacao: "Conciliação", projecao: "Fluxo projetado", alertas: "Alertas",
    metas: "Metas e inadimplência", cadastros: "Cadastros", bancos: "Open Finance", ia: "Leitura por IA",
  };
  return (
    <div className="fin-gestao" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ background: "linear-gradient(135deg,#ffffff 0%,#f3f8f5 100%)", border: "1px solid #dcebe2", borderRadius: 18, padding: "20px 22px", boxShadow: "0 12px 32px rgba(63,98,18,.07)" }}><span style={{ display: "inline-block", background: "#e6f1eb", color: "#294c3b", borderRadius: 999, padding: "5px 9px", fontSize: 10, fontWeight: 900, letterSpacing: ".06em" }}>CENTRAL FINANCEIRA</span><h1 style={{ margin: "9px 0 0", fontSize: 25 }}>Gestão Financeira + RH</h1><p style={{ color: "#64748b", fontSize: 12, margin: "5px 0 0" }}>Competências, folha, comissões, conciliação e planejamento em um só lugar.</p></div>
      <div className="fin-gestao-nav">
        <div className="fin-gestao-nav-identidade"><small>ÁREA ATUAL</small><b>{nomesAba[aba]}</b></div>
        <label><span>Navegar para</span><select value={aba} onChange={e => setAba(e.target.value)}>
          <optgroup label="Visão financeira"><option value="caixa">Caixa geral</option><option value="competencias">Competências</option><option value="relatorios">Relatórios</option></optgroup>
          <optgroup label="Operação"><option value="rh">RH integrado</option><option value="comissoes">Comissões</option><option value="importacao">Importação</option><option value="conciliacao">Conciliação</option></optgroup>
          <optgroup label="Planejamento"><option value="projecao">Fluxo projetado</option><option value="alertas">Alertas</option><option value="metas">Metas e inadimplência</option></optgroup>
          <optgroup label="Configurações"><option value="cadastros">Cadastros</option><option value="bancos">Open Finance</option><option value="ia">Leitura por IA</option></optgroup>
        </select></label>
      </div>
      <div className="fin-gestao-toolbar" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}><span style={{ color: "#64748b", fontSize: 11, fontWeight: 800 }}>COMPETÊNCIA</span><input type="month" value={comp} onChange={e => setComp(e.target.value)} style={input}/>{msg && <span style={{ fontSize: 11, color: "#475569" }}>{msg}</span>}</div>

      {aba === "caixa" && <CaixaGeralAutomatico competencia={comp} fechado={fechado} onMensagem={setMsg} />}

      {aba === "competencias" && <div style={{ display: "grid", gap: 12 }}>
        <div style={{ ...card, display: "flex", justifyContent: "space-between", alignItems: "center" }}><div><b>{mesNome(comp)}</b><p style={{ margin: "4px 0 0", fontSize: 12, color: fechado ? "#16a34a" : "#5b8f74" }}>{fechado ? "Fechada" : "Aberta"}</p></div><button disabled={ocupado} onClick={fechar} style={botao}>{fechado ? "Reabrir" : "Fechar competência"}</button></div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>{[["Entradas",atual.entradas],["Saídas",atual.saidas],["Saldo",atual.saldo]].map(([l,v]) => <div style={card} key={String(l)}><small>{l}</small><h3>{moeda(Number(v))}</h3></div>)}</div>
        <div style={card}><b>Comparação mensal</b>{meses.slice(0,12).map(m => <div key={m.competencia} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", padding: "8px 0", borderBottom: "1px solid #f1f5f9", fontSize: 12 }}><span>{mesNome(m.competencia)}</span><span>{moeda(m.entradas)}</span><span>{moeda(m.saidas)}</span><b>{moeda(m.saldo)}</b></div>)}</div>
      </div>}

      {aba === "relatorios" && <RelatoriosFinanceiros titulos={titulos} />}

      {aba === "rh" && <div style={card}><h3>Sincronização RH → Financeiro</h3><p style={{ color: "#64748b", fontSize: 12 }}>Cria a folha da competência com salário, VT, alimentação, benefícios, encargos e recalcula comissões elegíveis. Itens pagos não são alterados.</p><button disabled={ocupado || fechado} onClick={sincronizarRH} style={botao}>Sincronizar competência</button></div>}

      {aba === "comissoes" && <div style={{ display: "grid", gap: 16 }}>
        <ConfiguracaoComissaoPlanos competencia={comp} podeEditar={podeEditarComissao} onMensagem={setMsg} onAtualizar={carregar} />
        <div style={{ background: "linear-gradient(135deg,#f3f8f5 0%,#f3f8f5 100%)", border: "1px solid #dcebe2", borderRadius: 16, padding: "16px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div><b style={{ color: "#294c3b", fontSize: 15 }}>Comissões por vendedor</b><p style={{ margin: "4px 0 0", color: "#78716c", fontSize: 12 }}>A edição é liberada ao completar 20 vendas instaladas na competência.</p></div>
          <span style={{ background: "#fff", border: "1px solid #dcebe2", borderRadius: 999, padding: "7px 12px", color: "#294c3b", fontSize: 11, fontWeight: 800 }}>{vendas.length} instalações em {mesNome(comp)}</span>
        </div>
        {comissoesSupervisor.length > 0 && <div style={{ ...card, padding:0, overflow:"hidden" }}>
          <div style={{ padding:"14px 17px", background:"#f8fbf9", borderBottom:"1px solid #dcebe2" }}><b style={{color:"#294c3b",fontSize:13}}>Comissão dos responsáveis de equipe</b><p style={{margin:"3px 0 0",fontSize:10,color:"#64748b"}}>Calculada pelas vendas instaladas dos vendedores vinculados à equipe.</p></div>
          <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:11,minWidth:720}}><thead><tr style={{background:"#f8fafc"}}>{["Equipe","Responsável","Instaladas","Valor/venda","Bruto",`Desconto (${regraSupervisor.desconto}%)`,"A receber"].map(h=><th key={h} style={{padding:10,textAlign:"left",color:"#64748b",fontSize:9}}>{h}</th>)}</tr></thead><tbody>{comissoesSupervisor.map(item=><tr key={String(item.equipe.id)} style={{borderTop:"1px solid #e2e8f0"}}><td style={{padding:10,fontWeight:800}}>{item.equipe.nome}</td><td style={{padding:10}}><b>{item.responsavel?.nome||"Não identificado"}</b><small style={{display:"block",color:"#94a3b8"}}>{item.responsavel?.email||""}</small></td><td style={{padding:10}}>{item.quantidade}</td><td style={{padding:10}}>{moeda(regraSupervisor.valor)}</td><td style={{padding:10}}>{moeda(item.bruto)}</td><td style={{padding:10,color:"#dc2626"}}>{moeda(item.desconto)}</td><td style={{padding:10,color:"#15803d",fontWeight:900}}>{moeda(item.total)}</td></tr>)}</tbody></table></div>
        </div>}
        {porVendedor.map(([vendedor,x]) => {
          const pessoa = identidadeDoVendedor(vendedor);
          const liberada = x.qtd >= 20;
          const aberta = vendedorAberto === vendedor;
          const percentual = Math.min(100, (x.qtd / 20) * 100);
          const regra = regraDoVendedor(vendedor);
          const totalComissao = valorCalculado(x, regra, vendedor);
          return <div key={vendedor} style={{ background: "#fff", border: `1px solid ${liberada ? "#bbf7d0" : "#e2e8f0"}`, borderRadius: 18, overflow: "hidden", boxShadow: liberada ? "0 8px 24px rgba(22,163,74,.08)" : "0 4px 16px rgba(15,23,42,.04)" }}>
            <div style={{ padding: "18px 20px", display: "grid", gridTemplateColumns: "minmax(220px,1.4fr) minmax(220px,1fr) auto", gap: 18, alignItems: "center" }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0 }}>
                <div style={{ width: 42, height: 42, borderRadius: 13, flexShrink: 0, display: "grid", placeItems: "center", background: liberada ? "#dcfce7" : "#f1f5f9", color: liberada ? "#15803d" : "#64748b", fontWeight: 900 }}>{(pessoa?.nome || vendedor).slice(0,2).toUpperCase()}</div>
                <div style={{ minWidth: 0 }}><b style={{ color: "#0f172a", fontSize: 14 }}>{pessoa?.nome || vendedor}</b><p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis" }}>{pessoa?.email || vendedor}</p><span style={{ display: "inline-block", marginTop: 6, borderRadius: 999, padding: "4px 8px", background: "#eff6ff", color: "#1d4ed8", fontSize: 10, fontWeight: 800 }}>{pessoa?.fila || "Fila não identificada"}</span></div>
              </div>
              <div><div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 7 }}><span style={{ color: "#64748b" }}>Progresso da meta</span><b style={{ color: liberada ? "#15803d" : "#365f4b" }}>{x.qtd}/20</b></div><div style={{ height: 8, background: "#f1f5f9", borderRadius: 999, overflow: "hidden" }}><div style={{ height: "100%", width: `${percentual}%`, borderRadius: 999, background: liberada ? "linear-gradient(90deg,#22c55e,#16a34a)" : "linear-gradient(90deg,#fbbf24,#7fb095)" }}/></div><p style={{ margin: "7px 0 0", fontSize: 11, color: "#64748b" }}>{liberada ? `${x.qtd - 20} venda(s) acima da meta` : `Faltam ${20 - x.qtd} venda(s)`}</p></div>
              <div style={{ textAlign: "right" }}><span style={{ display: "inline-block", borderRadius: 999, padding: "6px 10px", background: liberada ? "#dcfce7" : "#f3f8f5", color: liberada ? "#166534" : "#294c3b", fontSize: 10, fontWeight: 900 }}>{liberada ? "LIBERADA" : "BLOQUEADA"}</span><b style={{ display: "block", marginTop: 8, fontSize: 16, color: "#0f172a" }}>{moeda(totalComissao)}</b>{liberada && <button onClick={() => setVendedorAberto(aberta ? null : vendedor)} style={{ ...botao, marginTop: 10, background: aberta ? "#475569" : "#16a34a", minWidth: 152 }}>{aberta ? "Fechar edição" : "Definir comissões"}</button>}</div>
            </div>
            {aberta && liberada && <div style={{ borderTop: "1px solid #dcebe2", background: "#f8fbf9", padding: "20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}><div><b style={{ color: "#294c3b", fontSize: 14 }}>Configurar comissão de {pessoa?.nome || vendedor}</b><p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 11 }}>Escolha uma modalidade. A regra será aplicada somente nesta competência.</p></div><span style={{ background: "#e6f1eb", color: "#294c3b", borderRadius: 999, padding: "7px 11px", fontSize: 12, fontWeight: 900 }}>Total calculado: {moeda(totalComissao)}</span></div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(150px,1fr))", gap: 8, marginBottom: 16 }}>{([
                ["por_plano","Por plano","Usa a tabela padrão dos planos ativos das vendas"],
                ["por_venda","Valor por venda","Use o mesmo valor em todas as instalações"],
                ["faixas","Faixas de vendas","Mude o valor conforme o volume atingido"],
                ["valor_unico","Comissão única","Informe apenas o total a receber"],
              ] as const).map(([modo,titulo,descricao]) => <button key={modo} onClick={() => atualizarRegra(vendedor,{modo})} style={{ textAlign: "left", minHeight: 76, padding: "11px 12px", border: `1px solid ${regra.modo===modo?"#5b8f74":"#dbe5cf"}`, background: regra.modo===modo?"linear-gradient(180deg,#e6f1eb,#dcebe2)":"#fff", color: regra.modo===modo?"#365314":"#475569", boxShadow: regra.modo===modo?"0 2px 0 #5b8f74,0 7px 16px rgba(91,143,116,.12)":"0 3px 10px rgba(15,23,42,.04)" }}><b style={{ display: "block", fontSize: 11 }}>{titulo}</b><span style={{ display: "block", marginTop: 4, fontSize: 9, lineHeight: 1.35, fontWeight: 500 }}>{descricao}</span></button>)}</div>

              {regra.modo === "por_plano" && (() => {
                const nomesPlanos = Array.from(new Set(x.vendas.map(v => v.plano || "Plano não informado")));
                return <div style={{ background: "#fff", border: "1px solid #dcebe2", borderRadius: 14, padding: 16, marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                    <div><b style={{ color: "#294c3b", fontSize: 12 }}>Valores exclusivos de {pessoa?.nome || vendedor}</b><p style={{ color: "#64748b", fontSize: 10, margin: "4px 0 0" }}>As alterações abaixo valem somente para este vendedor e esta competência. A tabela padrão não será modificada.</p></div>
                    {podeEditarComissao && <button type="button" disabled={salvandoPlanosInline === vendedor} onClick={() => salvarPlanosInline(vendedor)} style={{ ...botao, minHeight: 36, padding: "8px 12px", fontSize: 10 }}>{salvandoPlanosInline === vendedor ? "Salvando..." : "Salvar valores deste vendedor"}</button>}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 8, marginTop: 12 }}>
                    {nomesPlanos.map(nomePlano => {
                      const quantidade = x.vendas.filter(item => (item.plano || "Plano não informado") === nomePlano).length;
                      const semPlano = nomePlano === "Plano não informado";
                      const valor = valorPlanoVendedor(vendedor, nomePlano);
                      return <div key={nomePlano} style={{ padding: 10, border: `1px solid ${semPlano ? "#fde68a" : "#dcebe2"}`, borderRadius: 11, background: semPlano ? "#fffbeb" : "#f8fbf9", fontSize: 10 }}>
                        <b style={{ display: "block", color: "#1e293b", marginBottom: 7 }}>{nomePlano}</b>
                        {podeEditarComissao && !semPlano ? <label style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 7 }}><span style={{ color: "#365f4b", fontWeight: 900 }}>R$</span><input type="number" min="0" step="0.01" value={valor} onChange={evento => editarValorPlanoVendedor(vendedor, nomePlano, Number(evento.target.value))} aria-label={`Valor de comissão do plano ${nomePlano}`} style={{ ...input, width: "100%", minHeight: 35, padding: "7px 9px", fontSize: 11, fontWeight: 800 }} /></label> : <span style={{ display: "block", color: semPlano ? "#a16207" : "#64748b", marginBottom: 7 }}>{semPlano ? "Corrija o plano no cadastro da venda" : `Comissão: ${moeda(valor)}`}</span>}
                        <span style={{ color: "#64748b" }}>{quantidade} × {moeda(valor)} = <b style={{ color: "#294c3b" }}>{moeda(quantidade * valor)}</b></span>
                      </div>;
                    })}
                  </div>
                  {!podeEditarComissao && <p style={{ margin: "10px 0 0", color: "#94a3b8", fontSize: 10 }}>Somente administradores podem alterar os valores dos planos.</p>}
                </div>;
              })()}

              {regra.modo === "por_venda" && <div style={{ background: "#fff", border: "1px solid #dcebe2", borderRadius: 14, padding: 16, marginBottom: 14 }}><label style={{ display: "block", color: "#294c3b", fontSize: 11, fontWeight: 900, marginBottom: 7 }}>VALOR PARA CADA VENDA INSTALADA</label><div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}><div style={{ position: "relative", width: 220 }}><span style={{ position: "absolute", left: 12, top: 12, fontSize: 11, fontWeight: 800, color: "#365f4b" }}>R$</span><input type="number" min="0" step="0.01" value={regra.valor_por_venda} onChange={e=>atualizarRegra(vendedor,{valor_por_venda:Number(e.target.value)})} style={{...input,width:"100%",paddingLeft:36}}/></div><span style={{ color: "#64748b", fontSize: 11 }}>{x.qtd} vendas × {moeda(regra.valor_por_venda)} = <b>{moeda(x.qtd*regra.valor_por_venda)}</b></span></div></div>}

              {regra.modo === "valor_unico" && <div style={{ background: "#fff", border: "1px solid #dcebe2", borderRadius: 14, padding: 16, marginBottom: 14 }}><label style={{ display: "block", color: "#294c3b", fontSize: 11, fontWeight: 900, marginBottom: 7 }}>VALOR TOTAL DA COMISSÃO</label><div style={{ position: "relative", width: 240 }}><span style={{ position: "absolute", left: 12, top: 12, fontSize: 11, fontWeight: 800, color: "#365f4b" }}>R$</span><input type="number" min="0" step="0.01" value={regra.valor_unico} onChange={e=>atualizarRegra(vendedor,{valor_unico:Number(e.target.value)})} style={{...input,width:"100%",paddingLeft:36}}/></div></div>}

              {regra.modo === "faixas" && <div style={{ background: "#fff", border: "1px solid #dcebe2", borderRadius: 14, padding: 16, marginBottom: 14 }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 10 }}><div><b style={{ color: "#294c3b", fontSize: 12 }}>Faixas por volume</b><p style={{ margin: "3px 0 0", color: "#64748b", fontSize: 10 }}>O valor da faixa selecionada será multiplicado pelas vendas instaladas.</p></div><button onClick={()=>atualizarRegra(vendedor,{faixas:[...regra.faixas,{de:20,ate:null,valor:0}]})} style={{...botao,background:"linear-gradient(180deg,#7fb095,#5b8f74)",borderColor:"#365f4b"}}>+ Adicionar faixa</button></div>{regra.faixas.length===0?<p style={{ color:"#94a3b8",fontSize:11 }}>Adicione ao menos uma faixa.</p>:regra.faixas.map((fx,i)=><div key={i} style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1.2fr auto",gap:8,alignItems:"end",padding:"10px 0",borderTop:i?"1px solid #eef2e8":"none" }}><label style={{fontSize:10,color:"#64748b"}}>De<input type="number" min="20" value={fx.de} onChange={e=>atualizarRegra(vendedor,{faixas:regra.faixas.map((f,j)=>j===i?{...f,de:Number(e.target.value)}:f)})} style={{...input,width:"100%",marginTop:4}}/></label><label style={{fontSize:10,color:"#64748b"}}>Até (vazio = sem limite)<input type="number" min={fx.de} value={fx.ate??""} onChange={e=>atualizarRegra(vendedor,{faixas:regra.faixas.map((f,j)=>j===i?{...f,ate:e.target.value===""?null:Number(e.target.value)}:f)})} style={{...input,width:"100%",marginTop:4}}/></label><label style={{fontSize:10,color:"#64748b"}}>R$ por venda<input type="number" min="0" step="0.01" value={fx.valor} onChange={e=>atualizarRegra(vendedor,{faixas:regra.faixas.map((f,j)=>j===i?{...f,valor:Number(e.target.value)}:f)})} style={{...input,width:"100%",marginTop:4}}/></label><button onClick={()=>atualizarRegra(vendedor,{faixas:regra.faixas.filter((_,j)=>j!==i)})} style={{minHeight:42,background:"#fff",color:"#dc2626",border:"1px solid #fecaca"}}>Remover</button></div>)}</div>}


              <div style={{ display:"flex",justifyContent:"flex-end",marginTop:16 }}><button onClick={()=>salvarRegraComissao(vendedor)} disabled={salvandoRegra===vendedor} style={{...botao,background:"linear-gradient(180deg,#7fb095,#5b8f74)",borderColor:"#365f4b",minWidth:180}}>{salvandoRegra===vendedor?"Salvando regra...":"Salvar modalidade"}</button></div>
            </div>}
          </div>;
        })}
      </div>}
      {aba === "importacao" && <ImportacaoFinanceira competenciaPadrao={comp} fechado={fechado} onImportado={mensagem => { setMsg(mensagem); carregar(); }} />}
      {aba === "conciliacao" && <ConciliacaoAvancada extratos={extratos} titulos={titulos} fechado={fechado} onAtualizar={carregar} />}
      {aba === "projecao" && <div style={card}><h3>Fluxo de caixa projetado</h3>{meses.slice(0,12).map(m=><div key={m.competencia} style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",fontSize:12,padding:8,borderBottom:"1px solid #eee"}}><span>{mesNome(m.competencia)}</span><span>{moeda(m.entradas)}</span><span>{moeda(m.saidas)}</span><b>{moeda(m.saldo)}</b></div>)}</div>}
      {aba === "alertas" && <div style={card}><button onClick={gerarAlertas} disabled={ocupado} style={botao}>Atualizar alertas</button>{alertas.map(a=><div key={a.id} style={{padding:9,borderBottom:"1px solid #eee"}}><b style={{fontSize:12}}>{a.titulo}</b><p style={{margin:3,fontSize:11}}>{a.mensagem} · {a.vencimento}</p></div>)}</div>}
      {aba === "metas" && <MetasInadimplencia competencia={comp} />}
      {aba === "cadastros" && <CadastrosFinanceiros />}
      {aba === "bancos" && <IntegracaoBancaria />}
      {aba === "ia" && <LeitorFinanceiroIA />}
    </div>
  );
}
