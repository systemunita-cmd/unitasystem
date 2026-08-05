"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabase";

type Props = { competencia: string; fechado: boolean; onMensagem: (mensagem: string) => void };
type Titulo = { id: string; tipo: string; descricao: string; valor: number; status: string; vencimento?: string; pago_em?: string; observacao?: string; categoria?: string; centro_custo?: string; origem_modulo?: string; origem_tipo?: string; valor_conciliado?: number; juros_multa?: number; planilha_grupo?: "pessoal" | "empresa" };
type Folha = { id: string; nome: string; cargo?: string; base: number; vale_transporte: number; vale_alimentacao: number; beneficios: number; encargos_empresa: number; comissao: number; bonus_meta: number; inss: number; irrf: number; outros: number; status: string };
type Venda = { id: number; nome: string; vendedor: string; plano: string; dados_customizados?: Record<string, any>; data_instalacao: string };
type Plano = { plano: string; valor_comissao: number; ativo: boolean };

const dinheiro = (valor: number) => Number(valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const soma = <T,>(itens: T[], seletor: (item: T) => number) => itens.reduce((total, item) => total + Number(seletor(item) || 0), 0);
const proxima = (competencia: string) => { const [ano, mes] = competencia.split("-").map(Number); const data = new Date(ano, mes, 1); return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-01`; };
const pago = (titulo: Titulo) => /pago|paga|quitado|conciliado/.test(String(titulo.status || "").toLowerCase()) || Number(titulo.valor_conciliado || 0) >= Number(titulo.valor || 0);
const chave = (valor: string) => valor.trim().replace(/\s+/g, " ").toLocaleUpperCase("pt-BR");
const chavePlano = (valor: string) => chave(valor).replace(/GLOBO PLAY/g, "GLOBOPLAY").replace(/PARAMOUNT\+/g, "PARAMOUNT").replace(/ MEGAS/g, " MEGA").replace(/ MB/g, " MEGA").replace(/ GB/g, " GIGA").replace(/ COM /g, " ").replace(/\s*\+\s*/g, " ").replace(/\s*-\s*/g, "-").replace(/\s+/g, " ").trim();
const planoResolvido = (item: Venda) => String(item.plano || item.dados_customizados?.plano_escolhido || item.dados_customizados?.plano || "").trim();

export function CaixaGeralAutomatico({ competencia, fechado, onMensagem }: Props) {
  const [titulos, setTitulos] = useState<Titulo[]>([]);
  const [folha, setFolha] = useState<Folha[]>([]);
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [grupo, setGrupo] = useState<"todos" | "empresa" | "pessoal">("empresa");
  const [busca, setBusca] = useState("");
  const [carregando, setCarregando] = useState(false);

  const carregar = async () => {
    setCarregando(true);
    const [t, f, v, p] = await Promise.all([
      supabase.from("fin_titulos").select("id,tipo,descricao,valor,status,vencimento,pago_em,observacao,categoria,centro_custo,origem_modulo,origem_tipo,valor_conciliado,juros_multa,planilha_grupo").eq("competencia", competencia).order("vencimento"),
      supabase.from("folha_itens").select("id,nome,cargo,base,vale_transporte,vale_alimentacao,beneficios,encargos_empresa,comissao,bonus_meta,inss,irrf,outros,status").eq("competencia", competencia).order("nome"),
      supabase.from("proposta").select("id,nome,vendedor,plano,dados_customizados,data_instalacao").eq("status_venda", "INSTALADA").gte("data_instalacao", `${competencia}-01`).lt("data_instalacao", proxima(competencia)),
      supabase.from("fin_comissao_planos").select("plano,valor_comissao,ativo"),
    ]);
    setTitulos((t.data || []).map((item: any) => ({ ...item, valor: Number(item.valor) || 0, valor_conciliado: Number(item.valor_conciliado) || 0, juros_multa: Number(item.juros_multa) || 0, planilha_grupo: item.planilha_grupo || "empresa" })));
    setFolha((f.data || []).map((item: any) => ({ ...item, base: Number(item.base) || 0, vale_transporte: Number(item.vale_transporte) || 0, vale_alimentacao: Number(item.vale_alimentacao) || 0, beneficios: Number(item.beneficios) || 0, encargos_empresa: Number(item.encargos_empresa) || 0, comissao: Number(item.comissao) || 0, bonus_meta: Number(item.bonus_meta) || 0, inss: Number(item.inss) || 0, irrf: Number(item.irrf) || 0, outros: Number(item.outros) || 0 })));
    setVendas(((v.data || []) as Venda[]).map(item => ({ ...item, plano: planoResolvido(item) })));
    setPlanos((p.data || []).map((item: any) => ({ ...item, valor_comissao: Number(item.valor_comissao) || 0 })));
    const erro = t.error || f.error || v.error || (p.error?.code === "PGRST205" ? null : p.error);
    if (erro) onMensagem(erro.message);
    setCarregando(false);
  };

  useEffect(() => { carregar(); }, [competencia]);

  const mapaPlanos = new Map<string, number>();
  [...planos].sort((a,b) => Number(a.ativo) - Number(b.ativo)).forEach(item => mapaPlanos.set(chavePlano(item.plano), item.valor_comissao));
  const vendedores = new Map<string, number>();
  vendas.forEach(item => vendedores.set(chave(item.vendedor || "Sem vendedor"), (vendedores.get(chave(item.vendedor || "Sem vendedor")) || 0) + 1));
  const comissoesPlano = useMemo(() => {
    const mapa = new Map<string, { plano: string; instaladas: number; elegiveis: number; valorUnitario: number; total: number }>();
    vendas.forEach(venda => {
      const nomePlano = venda.plano || "Plano não informado";
      const item = mapa.get(chave(nomePlano)) || { plano: nomePlano, instaladas: 0, elegiveis: 0, valorUnitario: mapaPlanos.get(chavePlano(nomePlano)) || 0, total: 0 };
      item.instaladas += 1;
      if ((vendedores.get(chave(venda.vendedor || "Sem vendedor")) || 0) >= 20) { item.elegiveis += 1; item.total += item.valorUnitario; }
      mapa.set(chave(nomePlano), item);
    });
    return Array.from(mapa.values()).sort((a, b) => b.total - a.total || b.instaladas - a.instaladas);
  }, [vendas, planos]);

  const normalizar = (valor: string) => String(valor || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const visiveis = titulos.filter(item => (grupo === "todos" || item.planilha_grupo === grupo) && (!busca || normalizar(`${item.descricao} ${item.categoria || ""} ${item.centro_custo || ""}`).includes(normalizar(busca))));
  const totalTitulo = (item: Titulo) => Number(item.valor || 0) + Number(item.juros_multa || 0);
  const realizado = (item: Titulo) => pago(item) ? totalTitulo(item) : Math.min(Number(item.valor_conciliado || 0), totalTitulo(item));
  const entradas = soma(visiveis.filter(item => item.tipo === "receber"), totalTitulo);
  const saidas = soma(visiveis.filter(item => item.tipo !== "receber"), totalTitulo);
  const totalRealizado = soma(visiveis, realizado);
  const totalPendente = soma(visiveis, item => Math.max(0, totalTitulo(item) - realizado(item)));
  const totalFolha = soma(folha, item => item.base + item.vale_transporte + item.vale_alimentacao + item.beneficios + item.encargos_empresa + item.comissao + item.bonus_meta);
  const dataBR = (valor?: string) => valor ? new Date(`${valor.slice(0,10)}T00:00:00`).toLocaleDateString("pt-BR") : "—";

  return <div className="cg-root">
    <header className="cg-cabecalho"><div><small>CAIXA GERAL · {fechado ? "COMPETÊNCIA FECHADA" : "COMPETÊNCIA ABERTA"}</small><h2>Movimentações da competência</h2><p>Mesma estrutura da planilha mensal, preenchida automaticamente pelos módulos.</p></div><button onClick={carregar} disabled={carregando}>{carregando ? "Atualizando..." : "Atualizar dados"}</button></header>
    <div className="cg-filtros"><label>CAIXA<select value={grupo} onChange={e=>setGrupo(e.target.value as typeof grupo)}><option value="empresa">Empresa</option><option value="pessoal">Pessoal</option><option value="todos">Todos</option></select></label><label className="cg-busca">LOCALIZAR<input value={busca} onChange={e=>setBusca(e.target.value)} placeholder="Descrição, categoria ou centro de custo" /></label><span>{visiveis.length} linha(s)</span></div>
    <div className="cg-resumo">{[["Entradas",entradas,"entrada"],["Saídas",saidas,"saida"],["Saldo previsto",entradas-saidas,entradas-saidas>=0?"entrada":"saida"],["Realizado",totalRealizado,"neutro"],["Pendente",totalPendente,"alerta"]].map(([rotulo,valor,tom])=><div key={String(rotulo)} className={String(tom)}><small>{rotulo}</small><b>{dinheiro(Number(valor))}</b></div>)}</div>
    <div className="cg-tabela-wrap"><table className="cg-tabela"><thead><tr>{["Descrição","Vencimento","Data do pagamento","Observação / origem","Valores","Juros / multa","Pendente","Pago"].map(item=><th key={item}>{item}</th>)}</tr></thead><tbody>{visiveis.map(item=>{const total=totalTitulo(item);const valorRealizado=realizado(item);return <tr key={item.id}><td><b>{item.descricao}</b><small>{item.categoria || "Sem categoria"}{item.centro_custo?` · ${item.centro_custo}`:""}</small></td><td>{dataBR(item.vencimento)}</td><td>{dataBR(item.pago_em)}</td><td>{item.observacao || item.origem_modulo || "Financeiro"}<small>{item.origem_tipo || (item.tipo==="receber"?"Entrada":"Saída")}</small></td><td className="numero">{dinheiro(item.valor)}</td><td className="numero">{dinheiro(item.juros_multa || 0)}</td><td className="numero pendente">{dinheiro(Math.max(0,total-valorRealizado))}</td><td className="numero pago">{dinheiro(valorRealizado)}</td></tr>})}{!visiveis.length&&<tr><td className="cg-vazio" colSpan={8}>Nenhum lançamento encontrado para este filtro.</td></tr>}</tbody><tfoot><tr><td colSpan={4}>TOTAIS DA VISÃO</td><td className="numero">{dinheiro(soma(visiveis,item=>item.valor))}</td><td className="numero">{dinheiro(soma(visiveis,item=>item.juros_multa||0))}</td><td className="numero pendente">{dinheiro(totalPendente)}</td><td className="numero pago">{dinheiro(totalRealizado)}</td></tr></tfoot></table></div>
    <section className="cg-automaticos"><header><div><small>COMPOSIÇÕES AUTOMÁTICAS</small><b>Origem dos valores consolidados</b></div><span>Sem preenchimento duplicado</span></header><div><article><small>Folha + benefícios + encargos</small><b>{dinheiro(totalFolha)}</b><p>{folha.length} colaborador(es) calculados pelo RH</p></article><article><small>Comissões elegíveis por plano</small><b>{dinheiro(soma(comissoesPlano,item=>item.total))}</b><p>{vendas.length} instalação(ões) · {comissoesPlano.length} plano(s)</p></article></div></section>
    <style jsx>{`
      .cg-root{display:grid;gap:11px}.cg-cabecalho{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 16px;background:#fff;border:1px solid #dbe5df;border-radius:11px}.cg-cabecalho small,.cg-filtros label{font-size:8px;font-weight:900;letter-spacing:.08em;color:#6b7e73}.cg-cabecalho h2{font-size:17px;margin:4px 0 2px;color:#172033}.cg-cabecalho p{margin:0;color:#718096;font-size:10px}.cg-cabecalho button{min-height:38px;border:1px solid #708f7e;border-radius:8px;background:#6f927f;color:#fff;padding:0 13px;font-weight:800;cursor:pointer}.cg-filtros{display:flex;align-items:end;gap:9px;padding:10px 12px;background:#f8faf9;border:1px solid #dbe5df;border-radius:9px}.cg-filtros label{display:grid;gap:4px}.cg-filtros select,.cg-filtros input{height:36px;box-sizing:border-box;border:1px solid #cbd8d1;border-radius:7px;background:#fff;color:#172033;padding:0 10px;font-size:10px}.cg-filtros select{min-width:160px}.cg-filtros .cg-busca{flex:1}.cg-filtros span{margin-left:auto;color:#718096;font-size:9px;padding-bottom:10px}.cg-resumo{display:grid;grid-template-columns:repeat(5,1fr);border:1px solid #dbe3e8;border-radius:8px;overflow:hidden}.cg-resumo>div{padding:10px 11px;background:#f8fafc;border-right:1px solid #e3e9ed}.cg-resumo>div:last-child{border-right:0}.cg-resumo small{display:block;color:#718096;font-size:9px}.cg-resumo b{display:block;margin-top:3px;font-size:14px}.cg-resumo .entrada b{color:#28724c}.cg-resumo .saida b{color:#b42318}.cg-resumo .alerta b{color:#9a5b13}.cg-resumo .neutro b{color:#285a84}.cg-tabela-wrap{overflow:auto;border:1px solid #d8e1e6;border-radius:8px;background:#fff}.cg-tabela{width:100%;min-width:980px;border-collapse:collapse;font-size:10px}.cg-tabela th{background:#243b53;color:#fff;text-align:left;text-transform:uppercase;letter-spacing:.04em;font-size:8px;padding:9px 8px;white-space:nowrap}.cg-tabela td{padding:8px;border-top:1px solid #e8edf0;vertical-align:middle}.cg-tabela tbody tr:nth-child(even){background:#fbfcfd}.cg-tabela tbody tr:hover{background:#f0f6f2}.cg-tabela td small{display:block;color:#8a9aaa;margin-top:2px}.cg-tabela .numero{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}.cg-tabela .pendente{color:#b42318}.cg-tabela .pago{color:#28724c}.cg-tabela tfoot{background:#eef3f0;font-weight:900}.cg-tabela tfoot td{border-top:2px solid #91aa9d}.cg-vazio{text-align:center!important;color:#94a3b8;padding:28px!important}.cg-automaticos{border:1px solid #dbe5df;border-radius:9px;overflow:hidden;background:#fff}.cg-automaticos>header{padding:10px 12px;background:#f8faf9;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #e4eae6}.cg-automaticos header small{display:block;color:#718096;font-size:8px;font-weight:900;letter-spacing:.08em}.cg-automaticos header b{font-size:11px}.cg-automaticos header span{font-size:8px;color:#527060;background:#e8f0eb;border-radius:999px;padding:4px 7px}.cg-automaticos>div{display:grid;grid-template-columns:1fr 1fr}.cg-automaticos article{padding:11px 12px}.cg-automaticos article+article{border-left:1px solid #e4eae6}.cg-automaticos article small{color:#718096}.cg-automaticos article b{display:block;color:#315f47;font-size:14px;margin-top:3px}.cg-automaticos article p{margin:2px 0 0;color:#8a9aaa;font-size:9px}@media(max-width:800px){.cg-resumo{grid-template-columns:1fr 1fr}.cg-resumo>div{border-bottom:1px solid #e3e9ed}.cg-filtros{align-items:stretch;flex-direction:column}.cg-filtros select,.cg-filtros input{width:100%}.cg-filtros span{margin:0;padding:0}.cg-automaticos>div{grid-template-columns:1fr}.cg-automaticos article+article{border-left:0;border-top:1px solid #e4eae6}}@media(max-width:560px){.cg-cabecalho{align-items:flex-start;flex-direction:column}.cg-cabecalho button{width:100%}.cg-resumo{grid-template-columns:1fr}}
    `}</style>
  </div>;
}
