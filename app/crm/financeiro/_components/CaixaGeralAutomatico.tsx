"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabase";

type Props = { competencia: string; fechado: boolean; onMensagem: (mensagem: string) => void };
type Titulo = { id: string; tipo: string; descricao: string; valor: number; status: string; vencimento?: string; categoria?: string; centro_custo?: string; origem_modulo?: string; origem_tipo?: string; valor_conciliado?: number };
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
  const [aberto, setAberto] = useState<string | null>("recebimentos");
  const [carregando, setCarregando] = useState(false);

  const carregar = async () => {
    setCarregando(true);
    const [t, f, v, p] = await Promise.all([
      supabase.from("fin_titulos").select("id,tipo,descricao,valor,status,vencimento,categoria,centro_custo,origem_modulo,origem_tipo,valor_conciliado").eq("competencia", competencia).order("vencimento"),
      supabase.from("folha_itens").select("id,nome,cargo,base,vale_transporte,vale_alimentacao,beneficios,encargos_empresa,comissao,bonus_meta,inss,irrf,outros,status").eq("competencia", competencia).order("nome"),
      supabase.from("proposta").select("id,nome,vendedor,plano,dados_customizados,data_instalacao").eq("status_venda", "INSTALADA").gte("data_instalacao", `${competencia}-01`).lt("data_instalacao", proxima(competencia)),
      supabase.from("fin_comissao_planos").select("plano,valor_comissao,ativo"),
    ]);
    setTitulos((t.data || []).map((item: any) => ({ ...item, valor: Number(item.valor) || 0, valor_conciliado: Number(item.valor_conciliado) || 0 })));
    setFolha((f.data || []).map((item: any) => ({ ...item, base: Number(item.base) || 0, vale_transporte: Number(item.vale_transporte) || 0, vale_alimentacao: Number(item.vale_alimentacao) || 0, beneficios: Number(item.beneficios) || 0, encargos_empresa: Number(item.encargos_empresa) || 0, comissao: Number(item.comissao) || 0, bonus_meta: Number(item.bonus_meta) || 0, inss: Number(item.inss) || 0, irrf: Number(item.irrf) || 0, outros: Number(item.outros) || 0 })));
    setVendas(((v.data || []) as Venda[]).map(item => ({ ...item, plano: planoResolvido(item) })));
    setPlanos((p.data || []).map((item: any) => ({ ...item, valor_comissao: Number(item.valor_comissao) || 0 })));
    const erro = t.error || f.error || v.error || (p.error?.code === "PGRST205" ? null : p.error);
    if (erro) onMensagem(erro.message);
    setCarregando(false);
  };

  useEffect(() => { carregar(); }, [competencia]);

  const recebimentos = titulos.filter(item => item.tipo === "receber");
  const despesas = titulos.filter(item => item.tipo !== "receber" && item.origem_modulo !== "rh");
  const tituloFolha = titulos.filter(item => item.origem_modulo === "rh" || item.origem_tipo === "folha_competencia");
  const entradas = soma(recebimentos, item => item.valor);
  const saidas = soma(titulos.filter(item => item.tipo !== "receber"), item => item.valor);
  const entradasPagas = soma(recebimentos.filter(pago), item => item.valor);
  const saidasPagas = soma(titulos.filter(item => item.tipo !== "receber" && pago(item)), item => item.valor);
  const pendente = soma(titulos.filter(item => !pago(item)), item => item.valor);
  const totalFolha = soma(folha, item => item.base + item.vale_transporte + item.vale_alimentacao + item.beneficios + item.encargos_empresa + item.comissao + item.bonus_meta);
  const mapaPlanos = new Map<string, number>(); [...planos].sort((a,b) => Number(a.ativo) - Number(b.ativo)).forEach(item => mapaPlanos.set(chavePlano(item.plano), item.valor_comissao));
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

  const folhaTotais = [
    ["Salários", soma(folha, item => item.base)], ["Vale-transporte", soma(folha, item => item.vale_transporte)],
    ["Vale-alimentação", soma(folha, item => item.vale_alimentacao)], ["Benefícios", soma(folha, item => item.beneficios)],
    ["Encargos", soma(folha, item => item.encargos_empresa)], ["Comissões liberadas", soma(folha, item => item.comissao)],
    ["Bônus de meta", soma(folha, item => item.bonus_meta)],
  ] as const;

  const Secao = ({ id, titulo, subtitulo, valor, children }: { id: string; titulo: string; subtitulo: string; valor: number; children: React.ReactNode }) => <section style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, overflow: "hidden" }}><button onClick={() => setAberto(aberto === id ? null : id)} style={{ width: "100%", border: 0, background: aberto === id ? "#f8fbf9" : "#fff", padding: "15px 17px", cursor: "pointer", display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "center", textAlign: "left" }}><span><b style={{ display: "block", color: "#1e293b", fontSize: 13 }}>{titulo}</b><small style={{ color: "#64748b" }}>{subtitulo}</small></span><span style={{ display: "flex", alignItems: "center", gap: 10 }}><b style={{ color: "#294c3b" }}>{dinheiro(valor)}</b><span style={{ color: "#5b8f74" }}>{aberto === id ? "▲" : "▼"}</span></span></button>{aberto === id && <div style={{ borderTop: "1px solid #e6f1eb", padding: 15 }}>{children}</div>}</section>;

  const ListaTitulos = ({ itens }: { itens: Titulo[] }) => itens.length ? <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}><thead><tr>{["Descrição", "Origem", "Vencimento", "Valor", "Situação"].map(rotulo => <th key={rotulo} style={{ textAlign: "left", color: "#64748b", padding: "7px 9px", borderBottom: "1px solid #e2e8f0" }}>{rotulo}</th>)}</tr></thead><tbody>{itens.map(item => <tr key={item.id} style={{ borderBottom: "1px solid #f1f5f9" }}><td style={{ padding: 9 }}><b>{item.descricao}</b><br/><small style={{ color: "#94a3b8" }}>{item.categoria || "Sem categoria"}{item.centro_custo ? ` · ${item.centro_custo}` : ""}</small></td><td style={{ padding: 9 }}>{item.origem_modulo || "Financeiro"}</td><td style={{ padding: 9 }}>{item.vencimento ? new Date(`${item.vencimento}T00:00:00`).toLocaleDateString("pt-BR") : "—"}</td><td style={{ padding: 9, fontWeight: 800 }}>{dinheiro(item.valor)}</td><td style={{ padding: 9 }}><span style={{ borderRadius: 999, padding: "4px 7px", background: pago(item) ? "#dcfce7" : "#fef3c7", color: pago(item) ? "#166534" : "#92400e", fontWeight: 800 }}>{pago(item) ? "Pago" : "Pendente"}</span></td></tr>)}</tbody></table></div> : <p style={{ color: "#94a3b8", fontSize: 11 }}>Nenhum lançamento encontrado nesta competência.</p>;

  return <div style={{ display: "grid", gap: 13 }}>
    <div style={{ background: "linear-gradient(135deg,#365314,#5b8f74)", color: "#fff", borderRadius: 18, padding: "19px 20px", display: "flex", justifyContent: "space-between", gap: 14, alignItems: "center", flexWrap: "wrap", boxShadow: "0 12px 30px rgba(54,95,75,.18)" }}><div><span style={{ fontSize: 10, fontWeight: 900, letterSpacing: ".08em", color: "#dcebe2" }}>CAIXA GERAL AUTOMÁTICO</span><h2 style={{ margin: "6px 0 3px", fontSize: 20 }}>Financeiro consolidado da competência</h2><p style={{ margin: 0, color: "#e6f1eb", fontSize: 11 }}>Os valores são buscados em lançamentos, folha do RH, vendas instaladas e tabela de comissão por plano.</p></div><button onClick={carregar} disabled={carregando} style={{ minHeight: 42, border: "1px solid #bfd9ca", borderRadius: 10, background: "#fff", color: "#294c3b", padding: "10px 15px", fontWeight: 900, cursor: "pointer" }}>{carregando ? "Atualizando..." : "Atualizar dados"}</button></div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 9 }}>{[
      ["Entradas previstas", entradas, "#166534"], ["Saídas previstas", saidas, "#b91c1c"], ["Resultado previsto", entradas - saidas, entradas - saidas >= 0 ? "#166534" : "#b91c1c"],
      ["Entradas recebidas", entradasPagas, "#166534"], ["Saídas pagas", saidasPagas, "#475569"], ["Total pendente", pendente, "#92400e"],
    ].map(([rotulo, valor, cor]) => <div key={String(rotulo)} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 14 }}><small style={{ color: "#64748b" }}>{rotulo}</small><b style={{ display: "block", color: String(cor), fontSize: 16, marginTop: 5 }}>{dinheiro(Number(valor))}</b></div>)}</div>
    <div style={{ padding: "10px 13px", borderRadius: 12, background: fechado ? "#f1f5f9" : "#f3f8f5", color: fechado ? "#475569" : "#294c3b", fontSize: 11 }}><b>{fechado ? "Competência fechada" : "Competência aberta"}</b> · A planilha manual foi convertida em blocos rastreáveis; clique em cada um para ver a origem.</div>
    <Secao id="recebimentos" titulo="Recebimentos" subtitulo={`${recebimentos.length} lançamento(s) · ${recebimentos.filter(pago).length} recebido(s)`} valor={entradas}><ListaTitulos itens={recebimentos}/></Secao>
    <Secao id="despesas" titulo="Despesas da empresa" subtitulo={`${despesas.length} conta(s), sem duplicar o título consolidado da folha`} valor={soma(despesas, item => item.valor)}><ListaTitulos itens={despesas}/></Secao>
    <Secao id="folha" titulo="Folha consolidada" subtitulo={`${folha.length} colaborador(es) · cálculo detalhado centralizado na Aba Geral`} valor={totalFolha}><div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(145px,1fr))",gap:8 }}>{folhaTotais.map(([rotulo,valor])=><div key={rotulo} style={{border:"1px solid #dcebe2",background:"#f8fbf9",borderRadius:11,padding:10}}><small style={{color:"#64748b"}}>{rotulo}</small><b style={{display:"block",color:"#365314",marginTop:3}}>{dinheiro(valor)}</b></div>)}</div><p style={{margin:"12px 0 0",padding:10,borderRadius:10,background:"#f8fafc",color:"#475569",fontSize:10}}>O detalhamento por funcionário não é duplicado aqui. Consulte <b>Visão → Geral → Salários + Comissão</b> para salário líquido, horas, faltas, VT, VR/VA, comissão e custo da empresa.</p></Secao>
    <Secao id="comissoes" titulo="Comissões por plano" subtitulo={`${vendas.length} instalada(s) · somente vendedores com 20 ou mais entram no valor liberado`} valor={soma(folha, item => item.comissao)}>{comissoesPlano.length ? <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(235px,1fr))", gap: 8 }}>{comissoesPlano.map(item => <div key={item.plano} style={{ border: `1px solid ${item.valorUnitario > 0 ? "#dcebe2" : "#fecaca"}`, borderRadius: 12, padding: 11, background: item.valorUnitario > 0 ? "#f8fbf9" : "#fff7f7" }}><b style={{ display: "block", color: "#1e293b", fontSize: 11 }}>{item.plano}</b><small style={{ display: "block", color: "#64748b", margin: "4px 0" }}>{item.instaladas} instalada(s) · {item.elegiveis} elegível(is)</small><span style={{ color: item.valorUnitario > 0 ? "#294c3b" : "#b91c1c", fontSize: 11 }}>{item.valorUnitario > 0 ? `${dinheiro(item.valorUnitario)} por plano · ${dinheiro(item.total)}` : "Sem valor configurado"}</span></div>)}</div> : <p style={{ color: "#94a3b8", fontSize: 11 }}>Nenhuma venda instalada na competência.</p>}</Secao>
  </div>;
}
