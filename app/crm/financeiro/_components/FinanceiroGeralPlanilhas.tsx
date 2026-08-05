"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabase";

type Aba = "pessoal" | "empresa" | "salarios" | "ajuda" | "vendas" | "vendedores" | "comissao" | "colagem" | "parceiro" | "hsi" | "supervisor";
type Titulo = { id: string; tipo: string; descricao: string; valor: number; valor_conciliado: number; juros_multa: number; status: string; vencimento?: string; pago_em?: string; observacao?: string; categoria?: string; centro_custo?: string; planilha_grupo: "pessoal" | "empresa" };
type Folha = { id: string; funcionario_id?: string; nome: string; cargo?: string; base: number; proventos_manuais: number; comissao: number; bonus_meta: number; inss: number; irrf: number; outros: number; fgts: number; encargos_empresa: number; vale_transporte: number; vale_alimentacao: number; beneficios: number; desconto_horas: number; desconto_beneficios: number; desconto_vale_transporte: number; memoria_calculo?: Record<string, any>; status: string };
type Venda = { id: number; nome: string; cpf?: string; vendedor: string; plano: string; data_instalacao: string; valor_plano: number; equipe_id?: number | string; equipe_id_criador?: number | string };
type Plano = { id: string; plano: string; valor_comissao: number; ativo: boolean };
type Funcionario = { id: string; nome: string; email?: string; user_email?: string; cargo?: string; status?: string; equipe_id?: number | string };
type Equipe = { id: number | string; nome: string };
type Regras = { percentual_imposto_hsi: number; percentual_desconto_supervisor: number; valor_venda_supervisor: number };

const ABAS: { key: Aba; titulo: string; subtitulo: string; sigla: string }[] = [
  { key: "pessoal", titulo: "Pessoal", subtitulo: "Caixa pessoal", sigla: "PE" },
  { key: "empresa", titulo: "Empresa", subtitulo: "Caixa da empresa", sigla: "EM" },
  { key: "salarios", titulo: "Salários + Comissão", subtitulo: "Folha consolidada", sigla: "SC" },
  { key: "ajuda", titulo: "Ajuda de Custo", subtitulo: "VT e alimentação", sigla: "AC" },
  { key: "vendas", titulo: "Vendas", subtitulo: "Instalações do CRM", sigla: "VE" },
  { key: "vendedores", titulo: "Vendedores", subtitulo: "Ativos e produção", sigla: "VD" },
  { key: "comissao", titulo: "Comissão por Plano", subtitulo: "Tabela parametrizada", sigla: "CP" },
  { key: "colagem", titulo: "Base de Vendas", subtitulo: "Busca automática", sigla: "BV" },
  { key: "parceiro", titulo: "Parceiro Emerson", subtitulo: "Extrato do parceiro", sigla: "PA" },
  { key: "hsi", titulo: "HSI", subtitulo: "Repasse e imposto", sigla: "HS" },
  { key: "supervisor", titulo: "Comissão SUP", subtitulo: "Resultado por equipe", sigla: "SU" },
];

const padraoRegras: Regras = { percentual_imposto_hsi: 10, percentual_desconto_supervisor: 20, valor_venda_supervisor: 10 };
const dinheiro = (valor: number) => Number(valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const numero = (valor: unknown) => Number(valor || 0);
const chave = (valor: string) => String(valor || "").trim().replace(/\s+/g, " ").toLocaleUpperCase("pt-BR");
const dataBR = (valor?: string) => valor ? new Date(`${valor.slice(0, 10)}T00:00:00`).toLocaleDateString("pt-BR") : "—";
const proximaCompetencia = (competencia: string) => { const [ano, mes] = competencia.split("-").map(Number); const data = new Date(ano, mes, 1); return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-01`; };
const nomeCompetencia = (competencia: string) => new Date(`${competencia}-01T00:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
const pago = (item: Titulo) => /pago|paga|quitado|conciliado/.test(String(item.status || "").toLowerCase()) || item.valor_conciliado >= item.valor + item.juros_multa;
const soma = <T,>(itens: T[], seletor: (item: T) => number) => itens.reduce((total, item) => total + numero(seletor(item)), 0);

function Tabela({ colunas, children, vazio }: { colunas: string[]; children: React.ReactNode; vazio?: boolean }) {
  if (vazio) return <div className="fg-vazio">Nenhum registro encontrado nesta competência.</div>;
  return <div className="fg-tabela-wrap"><table className="fg-tabela"><thead><tr>{colunas.map(coluna => <th key={coluna}>{coluna}</th>)}</tr></thead><tbody>{children}</tbody></table></div>;
}

function ResumoCards({ itens }: { itens: { rotulo: string; valor: string; tom?: "verde" | "vermelho" | "azul" }[] }) {
  return <div className="fg-resumos">{itens.map(item => <div className={`fg-resumo ${item.tom || ""}`} key={item.rotulo}><small>{item.rotulo}</small><strong>{item.valor}</strong></div>)}</div>;
}

export function FinanceiroGeralPlanilhas() {
  const hoje = new Date();
  const [competencia, setCompetencia] = useState(`${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`);
  const [aba, setAba] = useState<Aba>("empresa");
  const [titulos, setTitulos] = useState<Titulo[]>([]);
  const [folha, setFolha] = useState<Folha[]>([]);
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [equipes, setEquipes] = useState<Equipe[]>([]);
  const [regras, setRegras] = useState<Regras>(padraoRegras);
  const [admin, setAdmin] = useState(false);
  const [editor, setEditor] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [mensagem, setMensagem] = useState("");

  const carregar = async () => {
    setCarregando(true); setMensagem("");
    const inicio = `${competencia}-01`; const fim = proximaCompetencia(competencia);
    const resultados = await Promise.all([
      supabase.from("fin_titulos").select("id,tipo,descricao,valor,valor_conciliado,juros_multa,status,vencimento,pago_em,observacao,categoria,centro_custo,planilha_grupo").eq("competencia", competencia).order("vencimento"),
      supabase.from("folha_itens").select("id,funcionario_id,nome,cargo,base,proventos_manuais,comissao,bonus_meta,inss,irrf,outros,fgts,encargos_empresa,vale_transporte,vale_alimentacao,beneficios,desconto_horas,desconto_beneficios,desconto_vale_transporte,memoria_calculo,status").eq("competencia", competencia).order("nome"),
      supabase.from("proposta").select("id,nome,cpf,vendedor,plano,data_instalacao,valor_plano,equipe_id,equipe_id_criador").eq("status_venda", "INSTALADA").gte("data_instalacao", inicio).lt("data_instalacao", fim).order("data_instalacao"),
      supabase.from("fin_comissao_planos").select("id,plano,valor_comissao,ativo").order("plano"),
      supabase.from("funcionarios").select("id,nome,email,user_email,cargo,status,equipe_id").order("nome"),
      supabase.from("equipes").select("id,nome").order("nome"),
      supabase.from("fin_planilha_regras").select("percentual_imposto_hsi,percentual_desconto_supervisor,valor_venda_supervisor").eq("id", 1).maybeSingle(),
      supabase.rpc("usuario_pode_administrar_financeiro"),
    ]);
    const [t, f, v, p, fn, eq, rg, ad] = resultados;
    setTitulos((t.data || []).map((item: any) => ({ ...item, valor: numero(item.valor), valor_conciliado: numero(item.valor_conciliado), juros_multa: numero(item.juros_multa), planilha_grupo: item.planilha_grupo || "empresa" })));
    setFolha((f.data || []).map((item: any) => ({ ...item, base: numero(item.base), proventos_manuais: numero(item.proventos_manuais), comissao: numero(item.comissao), bonus_meta: numero(item.bonus_meta), inss: numero(item.inss), irrf: numero(item.irrf), outros: numero(item.outros), fgts: numero(item.fgts), encargos_empresa: numero(item.encargos_empresa), vale_transporte: numero(item.vale_transporte), vale_alimentacao: numero(item.vale_alimentacao), beneficios: numero(item.beneficios), desconto_horas: numero(item.desconto_horas), desconto_beneficios: numero(item.desconto_beneficios), desconto_vale_transporte: numero(item.desconto_vale_transporte) })));
    setVendas((v.data || []).map((item: any) => ({ ...item, valor_plano: numero(item.valor_plano) })));
    setPlanos((p.data || []).map((item: any) => ({ ...item, valor_comissao: numero(item.valor_comissao) })));
    setFuncionarios((fn.data || []) as Funcionario[]); setEquipes((eq.data || []) as Equipe[]);
    if (rg.data) setRegras({ percentual_imposto_hsi: numero(rg.data.percentual_imposto_hsi), percentual_desconto_supervisor: numero(rg.data.percentual_desconto_supervisor), valor_venda_supervisor: numero(rg.data.valor_venda_supervisor) });
    setAdmin(Boolean(ad.data));
    const erro = [t.error, f.error, v.error, p.error, fn.error, eq.error, rg.error, ad.error].find(Boolean);
    if (erro) setMensagem(erro.message.includes("fin_planilha_regras") || erro.message.includes("juros_multa") ? "Execute a migração da Aba Geral no Supabase e atualize esta tela." : erro.message);
    setCarregando(false);
  };

  useEffect(() => { carregar(); }, [competencia]);

  const mapaPlanos = useMemo(() => new Map(planos.filter(item => item.ativo).map(item => [chave(item.plano), item.valor_comissao])), [planos]);
  const contagemVendedor = useMemo(() => { const mapa = new Map<string, number>(); vendas.forEach(venda => mapa.set(chave(venda.vendedor), (mapa.get(chave(venda.vendedor)) || 0) + 1)); return mapa; }, [vendas]);
  const valorComissaoVenda = (venda: Venda) => (contagemVendedor.get(chave(venda.vendedor)) || 0) >= 20 ? (mapaPlanos.get(chave(venda.plano)) || 0) : 0;
  const mapaEquipes = useMemo(() => new Map(equipes.map(item => [String(item.id), item.nome])), [equipes]);
  const titulosPessoal = titulos.filter(item => item.planilha_grupo === "pessoal");
  const titulosEmpresa = titulos.filter(item => item.planilha_grupo !== "pessoal");

  const salvarRegras = async () => {
    setMensagem("");
    const { error } = await supabase.rpc("salvar_fin_planilha_regras", { p_percentual_imposto_hsi: regras.percentual_imposto_hsi, p_percentual_desconto_supervisor: regras.percentual_desconto_supervisor, p_valor_venda_supervisor: regras.valor_venda_supervisor });
    if (error) setMensagem(error.message); else { setMensagem("Padrões de cálculo salvos."); setEditor(false); await carregar(); }
  };

  const classificar = async (item: Titulo, grupo: "pessoal" | "empresa") => {
    const entrada = window.prompt("Juros/multa deste lançamento (R$):", String(item.juros_multa || 0));
    if (entrada === null) return;
    const juros = Number(entrada.replace(",", "."));
    if (!Number.isFinite(juros) || juros < 0) { setMensagem("Informe um valor válido para juros/multa."); return; }
    const { error } = await supabase.rpc("classificar_fin_titulo_planilha", { p_titulo_id: item.id, p_grupo: grupo, p_juros_multa: juros });
    if (error) setMensagem(error.message); else await carregar();
  };

  const renderCaixa = (itens: Titulo[], grupo: "pessoal" | "empresa") => {
    const entradas = itens.filter(item => item.tipo === "receber"); const saidas = itens.filter(item => item.tipo !== "receber");
    const totalEntrada = soma(entradas, item => item.valor + item.juros_multa); const totalSaida = soma(saidas, item => item.valor + item.juros_multa);
    const totalPago = soma(itens, item => pago(item) ? item.valor + item.juros_multa : Math.min(item.valor_conciliado, item.valor + item.juros_multa));
    return <>
      <ResumoCards itens={[{ rotulo: "Entradas", valor: dinheiro(totalEntrada), tom: "verde" }, { rotulo: "Saídas", valor: dinheiro(totalSaida), tom: "vermelho" }, { rotulo: "Saldo projetado", valor: dinheiro(totalEntrada - totalSaida), tom: totalEntrada >= totalSaida ? "verde" : "vermelho" }, { rotulo: "Pago/recebido", valor: dinheiro(totalPago), tom: "azul" }]} />
      <Tabela colunas={["Descrição", "Vencimento", "Pagamento", "Observação", "Valores", "Juros/multa", "Pendente", "Pago", "Tipo", "Ação"]} vazio={!itens.length}>
        {itens.map(item => { const total = item.valor + item.juros_multa; const realizado = pago(item) ? total : Math.min(item.valor_conciliado, total); return <tr key={item.id}><td><b>{item.descricao}</b><small>{item.categoria || "Sem categoria"}{item.centro_custo ? ` · ${item.centro_custo}` : ""}</small></td><td>{dataBR(item.vencimento)}</td><td>{dataBR(item.pago_em)}</td><td>{item.observacao || "—"}</td><td className="numero">{dinheiro(item.valor)}</td><td className="numero">{dinheiro(item.juros_multa)}</td><td className="numero pendente">{dinheiro(Math.max(0, total - realizado))}</td><td className="numero pago">{dinheiro(realizado)}</td><td><span className={`fg-pill ${item.tipo === "receber" ? "entrada" : "saida"}`}>{item.tipo === "receber" ? "Entrada" : "Saída"}</span></td><td>{admin && <button className="fg-link" onClick={() => classificar(item, grupo === "pessoal" ? "empresa" : "pessoal")}>Mover para {grupo === "pessoal" ? "Empresa" : "Pessoal"}</button>}</td></tr>; })}
      </Tabela>
    </>;
  };

  const renderSalarios = () => {
    const total = soma(folha, item => item.base + item.proventos_manuais + item.comissao + item.bonus_meta - item.inss - item.irrf - item.outros - item.desconto_horas - item.desconto_vale_transporte);
    return <><ResumoCards itens={[{ rotulo: "Colaboradores", valor: String(folha.length) }, { rotulo: "Salários", valor: dinheiro(soma(folha, i => i.base)), tom: "azul" }, { rotulo: "Comissões", valor: dinheiro(soma(folha, i => i.comissao)), tom: "verde" }, { rotulo: "Líquido calculado", valor: dinheiro(total), tom: "verde" }]} /><Tabela colunas={["Cargo", "Nome", "Salário", "Compl. salário", "Comissão", "Bônus", "INSS", "IRRF", "Outros descontos", "Pagamento", "Total"]} vazio={!folha.length}>{folha.map(item => { const liquido = item.base + item.proventos_manuais + item.comissao + item.bonus_meta - item.inss - item.irrf - item.outros - item.desconto_horas - item.desconto_vale_transporte; return <tr key={item.id}><td>{item.cargo || "—"}</td><td><b>{item.nome}</b></td><td className="numero">{dinheiro(item.base)}</td><td className="numero">{dinheiro(item.proventos_manuais)}</td><td className="numero pago">{dinheiro(item.comissao)}</td><td className="numero">{dinheiro(item.bonus_meta)}</td><td className="numero pendente">{dinheiro(item.inss)}</td><td className="numero pendente">{dinheiro(item.irrf)}</td><td className="numero pendente">{dinheiro(item.outros + item.desconto_horas + item.desconto_vale_transporte)}</td><td><span className="fg-pill entrada">{item.status || "calculado"}</span></td><td className="numero total">{dinheiro(liquido)}</td></tr>; })}</Tabela></>;
  };

  const renderAjuda = () => <><ResumoCards itens={[{ rotulo: "Beneficiários", valor: String(folha.filter(i => i.vale_transporte || i.vale_alimentacao).length) }, { rotulo: "VT líquido", valor: dinheiro(soma(folha, i => i.vale_transporte)), tom: "azul" }, { rotulo: "Alimentação líquida", valor: dinheiro(soma(folha, i => i.vale_alimentacao)), tom: "verde" }, { rotulo: "Total líquido", valor: dinheiro(soma(folha, i => i.vale_transporte + i.vale_alimentacao)), tom: "verde" }]} /><div className="fg-aviso">A planilha descontava R$ 8,60 de VT e R$ 20/R$ 16/R$ 10 de alimentação por falta. No sistema, os valores vêm do cadastro individual e obedecem ao editor visual de dias completos, sábado, VT e VA do RH.</div><Tabela colunas={["Cargo", "Nome", "VT bruto", "Alimentação bruta", "Total bruto", "VT líquido", "Alimentação líquida", "Descontos/faltas", "Total líquido"]} vazio={!folha.length}>{folha.map(item => { const memoria = item.memoria_calculo || {}; const vtBruto = numero(memoria.vt_nominal ?? item.vale_transporte + item.desconto_vale_transporte); const vaBruto = numero(memoria.va_nominal ?? item.vale_alimentacao + item.desconto_beneficios); return <tr key={item.id}><td>{item.cargo || "—"}</td><td><b>{item.nome}</b></td><td className="numero">{dinheiro(vtBruto)}</td><td className="numero">{dinheiro(vaBruto)}</td><td className="numero">{dinheiro(vtBruto + vaBruto)}</td><td className="numero pago">{dinheiro(item.vale_transporte)}</td><td className="numero pago">{dinheiro(item.vale_alimentacao)}</td><td className="numero pendente">{dinheiro(item.desconto_beneficios + item.desconto_vale_transporte)}</td><td className="numero total">{dinheiro(item.vale_transporte + item.vale_alimentacao)}</td></tr>; })}</Tabela></>;

  const renderVendas = (base = vendas) => <><ResumoCards itens={[{ rotulo: "Vendas instaladas", valor: String(base.length), tom: "verde" }, { rotulo: "Valor dos planos", valor: dinheiro(soma(base, i => i.valor_plano)), tom: "azul" }, { rotulo: "Comissão elegível", valor: dinheiro(soma(base, valorComissaoVenda)), tom: "verde" }, { rotulo: "Sem plano parametrizado", valor: String(base.filter(i => !mapaPlanos.has(chave(i.plano))).length), tom: "vermelho" }]} /><Tabela colunas={["Instalação", "Vendedor", "Cliente", "CPF/CNPJ", "Plano", "Status instalação", "Valor plano", "Comissão"]} vazio={!base.length}>{base.map(item => <tr key={item.id}><td>{dataBR(item.data_instalacao)}</td><td><b>{item.vendedor || "Sem vendedor"}</b></td><td>{item.nome}</td><td>{item.cpf || "—"}</td><td>{item.plano || "—"}</td><td><span className="fg-pill entrada">Instalada</span></td><td className="numero">{dinheiro(item.valor_plano)}</td><td className="numero total">{dinheiro(valorComissaoVenda(item))}</td></tr>)}</Tabela></>;

  const renderVendedores = () => {
    const dados = funcionarios.filter(item => String(item.status || "ativo").toLowerCase() !== "inativo").map(item => { const nomes = [item.nome, item.email, item.user_email].map(chave); const instaladas = vendas.filter(venda => nomes.includes(chave(venda.vendedor))).length; return { ...item, instaladas }; }).sort((a, b) => b.instaladas - a.instaladas);
    return <><ResumoCards itens={[{ rotulo: "Vendedores/colaboradores ativos", valor: String(dados.length) }, { rotulo: "Com 20 ou mais", valor: String(dados.filter(i => i.instaladas >= 20).length), tom: "verde" }, { rotulo: "Instalações vinculadas", valor: String(soma(dados, i => i.instaladas)), tom: "azul" }]} /><Tabela colunas={["Vendedor", "E-mail", "Cargo", "Equipe", "Ativo", "Instaladas", "Meta 20", "Situação"]} vazio={!dados.length}>{dados.map(item => <tr key={item.id}><td><b>{item.nome}</b></td><td>{item.email || item.user_email || "—"}</td><td>{item.cargo || "—"}</td><td>{mapaEquipes.get(String(item.equipe_id || "")) || "Sem equipe"}</td><td><span className="fg-pill entrada">Sim</span></td><td className="numero total">{item.instaladas}</td><td>{Math.min(item.instaladas, 20)}/20</td><td><span className={`fg-pill ${item.instaladas >= 20 ? "entrada" : "saida"}`}>{item.instaladas >= 20 ? "Liberada" : `Faltam ${20 - item.instaladas}`}</span></td></tr>)}</Tabela></>;
  };

  const renderPlanos = () => <><ResumoCards itens={[{ rotulo: "Planos cadastrados", valor: String(planos.length) }, { rotulo: "Planos ativos", valor: String(planos.filter(i => i.ativo).length), tom: "verde" }, { rotulo: "Sem comissão", valor: String(planos.filter(i => !i.valor_comissao).length), tom: "vermelho" }]} /><div className="fg-aviso">Esta tabela é a versão viva da aba COMISSAO_PARAM. Os valores continuam editáveis em Gestão Financeira + RH › Comissões.</div><Tabela colunas={["Plano", "Valor comissão", "Situação"]} vazio={!planos.length}>{planos.map(item => <tr key={item.id}><td><b>{item.plano}</b></td><td className="numero total">{dinheiro(item.valor_comissao)}</td><td><span className={`fg-pill ${item.ativo ? "entrada" : "saida"}`}>{item.ativo ? "Ativo" : "Inativo"}</span></td></tr>)}</Tabela></>;

  const renderParceiro = () => { const base = vendas.filter(item => /EMERSON|PARCEIR/.test(chave(item.vendedor))); return renderVendas(base); };
  const renderHSI = () => { const base = vendas.filter(item => /HSI/.test(chave(`${item.vendedor} ${item.plano}`))); const bruto = soma(base, i => i.valor_plano); const imposto = bruto * regras.percentual_imposto_hsi / 100; return <><ResumoCards itens={[{ rotulo: "Vendas HSI", valor: String(base.length) }, { rotulo: "Total bruto", valor: dinheiro(bruto), tom: "azul" }, { rotulo: `Imposto (${regras.percentual_imposto_hsi}%)`, valor: dinheiro(imposto), tom: "vermelho" }, { rotulo: "Total líquido", valor: dinheiro(bruto - imposto), tom: "verde" }]} />{renderVendas(base)}</>; };
  const renderSupervisor = () => { const grupos = new Map<string, Venda[]>(); vendas.forEach(item => { const equipe = mapaEquipes.get(String(item.equipe_id || item.equipe_id_criador || "")) || "Sem equipe"; grupos.set(equipe, [...(grupos.get(equipe) || []), item]); }); const dados = Array.from(grupos.entries()).map(([equipe, itens]) => { const bruto = itens.length * regras.valor_venda_supervisor; const desconto = bruto * regras.percentual_desconto_supervisor / 100; return { equipe, quantidade: itens.length, bruto, desconto, liquido: bruto - desconto }; }).sort((a, b) => b.liquido - a.liquido); return <><ResumoCards itens={[{ rotulo: "Equipes", valor: String(dados.length) }, { rotulo: "Vendas instaladas", valor: String(vendas.length), tom: "azul" }, { rotulo: "Comissão bruta", valor: dinheiro(soma(dados, i => i.bruto)) }, { rotulo: "Líquido SUP", valor: dinheiro(soma(dados, i => i.liquido)), tom: "verde" }]} /><Tabela colunas={["Equipe/supervisor", "Vendas", "Valor por venda", "Comissão bruta", `Desconto (${regras.percentual_desconto_supervisor}%)`, "Total líquido"]} vazio={!dados.length}>{dados.map(item => <tr key={item.equipe}><td><b>{item.equipe}</b></td><td className="numero">{item.quantidade}</td><td className="numero">{dinheiro(regras.valor_venda_supervisor)}</td><td className="numero">{dinheiro(item.bruto)}</td><td className="numero pendente">{dinheiro(item.desconto)}</td><td className="numero total">{dinheiro(item.liquido)}</td></tr>)}</Tabela></>; };

  const conteudo = () => {
    if (aba === "pessoal") return renderCaixa(titulosPessoal, "pessoal");
    if (aba === "empresa") return renderCaixa(titulosEmpresa, "empresa");
    if (aba === "salarios") return renderSalarios();
    if (aba === "ajuda") return renderAjuda();
    if (aba === "vendas") return renderVendas();
    if (aba === "vendedores") return renderVendedores();
    if (aba === "comissao") return renderPlanos();
    if (aba === "colagem") return <><div className="fg-aviso sucesso"><b>Colagem eliminada.</b> Esta base é preenchida automaticamente pelas vendas com status INSTALADA no CRM. Não é preciso copiar e colar a planilha todos os meses.</div>{renderVendas()}</>;
    if (aba === "parceiro") return renderParceiro();
    if (aba === "hsi") return renderHSI();
    return renderSupervisor();
  };

  const selecionada = ABAS.find(item => item.key === aba)!;
  return <div className="fg-root">
    <div className="fg-hero"><div><span>ABA GERAL</span><h1>Caixa Geral Financeiro</h1><p>As planilhas viraram visões automáticas conectadas ao Financeiro, RH e CRM.</p></div><div className="fg-acoes"><label>Competência<input type="month" value={competencia} onChange={e => setCompetencia(e.target.value)} /></label>{admin && <button className="fg-secundario" onClick={() => setEditor(!editor)}>⚙ Padrões</button>}<button className="fg-atualizar" onClick={carregar} disabled={carregando}>{carregando ? "Atualizando..." : "Atualizar"}</button></div></div>
    {mensagem && <div className="fg-mensagem">{mensagem}<button onClick={() => setMensagem("")}>×</button></div>}
    {editor && <div className="fg-editor"><div><b>Padrões de cálculo das planilhas</b><small>Somente o administrador pode alterar. Os valores são aplicados imediatamente nas visões HSI e Comissão SUP.</small></div><label>Imposto HSI (%)<input type="number" min="0" max="100" step="0.01" value={regras.percentual_imposto_hsi} onChange={e => setRegras({ ...regras, percentual_imposto_hsi: numero(e.target.value) })} /></label><label>Desconto SUP (%)<input type="number" min="0" max="100" step="0.01" value={regras.percentual_desconto_supervisor} onChange={e => setRegras({ ...regras, percentual_desconto_supervisor: numero(e.target.value) })} /></label><label>Valor por venda SUP<input type="number" min="0" step="0.01" value={regras.valor_venda_supervisor} onChange={e => setRegras({ ...regras, valor_venda_supervisor: numero(e.target.value) })} /></label><button className="fg-atualizar" onClick={salvarRegras}>Salvar padrões</button></div>}
    <div className="fg-abas">{ABAS.map(item => <button key={item.key} className={aba === item.key ? "ativo" : ""} onClick={() => setAba(item.key)}><span>{item.sigla}</span><b>{item.titulo}</b><small>{item.subtitulo}</small></button>)}</div>
    <section className="fg-planilha"><header><div><span>{selecionada.sigla}</span><div><h2>{selecionada.titulo}</h2><p>{selecionada.subtitulo} · {nomeCompetencia(competencia)}</p></div></div><em>DADOS AUTOMÁTICOS</em></header><div className="fg-conteudo">{conteudo()}</div></section>
    <style jsx global>{`
      .fg-root{display:grid;gap:16px;color:#172033}.fg-hero{background:linear-gradient(135deg,#365314,#65a30d);border-radius:22px;padding:24px;color:#fff;display:flex;justify-content:space-between;align-items:center;gap:20px;box-shadow:0 18px 45px rgba(77,124,15,.2)}.fg-hero span{font-size:10px;font-weight:900;letter-spacing:.14em;color:#d9f99d}.fg-hero h1{font-size:25px;margin:6px 0 4px}.fg-hero p{margin:0;color:#ecfccb;font-size:12px}.fg-acoes{display:flex;align-items:end;gap:8px;flex-wrap:wrap}.fg-acoes label{font-size:9px;font-weight:900;letter-spacing:.08em}.fg-acoes input{display:block;margin-top:5px;min-height:40px;border:1px solid #bef264;border-radius:10px;padding:0 10px;background:#fff;color:#172033}.fg-atualizar,.fg-secundario{min-height:42px;border:0;border-radius:11px;padding:0 16px;font-weight:900;cursor:pointer}.fg-atualizar{background:#d9f99d;color:#365314}.fg-secundario{background:#fff;color:#365314}.fg-mensagem{padding:12px 14px;background:#fff7ed;border:1px solid #fdba74;border-radius:12px;color:#9a3412;font-size:12px;display:flex;justify-content:space-between}.fg-mensagem button{border:0;background:transparent;font-size:18px;cursor:pointer}.fg-editor{background:#f7fee7;border:1px solid #bef264;border-radius:16px;padding:15px;display:grid;grid-template-columns:minmax(220px,1fr) repeat(3,minmax(130px,180px)) auto;gap:10px;align-items:end}.fg-editor small{display:block;color:#64748b;margin-top:4px}.fg-editor label{font-size:10px;font-weight:800;color:#4d7c0f}.fg-editor input{display:block;width:100%;box-sizing:border-box;margin-top:5px;border:1px solid #cbd5e1;border-radius:9px;padding:10px;background:#fff}.fg-abas{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:9px}.fg-abas button{border:1px solid #dbe5c9;background:#fff;border-radius:14px;padding:11px;text-align:left;display:grid;grid-template-columns:36px 1fr;column-gap:9px;cursor:pointer;box-shadow:0 4px 12px rgba(15,23,42,.05);transition:.18s}.fg-abas button:hover{transform:translateY(-2px);border-color:#84cc16}.fg-abas button.ativo{background:#f7fee7;border-color:#65a30d;box-shadow:0 8px 22px rgba(101,163,13,.15)}.fg-abas button>span{grid-row:1/3;width:34px;height:34px;border-radius:10px;display:grid;place-items:center;background:#ecfccb;color:#4d7c0f;font-size:10px;font-weight:900}.fg-abas b{font-size:11px;align-self:end}.fg-abas small{color:#64748b;font-size:9px;margin-top:2px}.fg-planilha{background:#fff;border:1px solid #dfe7d3;border-radius:19px;overflow:hidden;box-shadow:0 10px 35px rgba(15,23,42,.06)}.fg-planilha>header{padding:16px 18px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;background:linear-gradient(90deg,#fbfff4,#fff)}.fg-planilha>header>div{display:flex;gap:11px;align-items:center}.fg-planilha>header>div>span{width:40px;height:40px;border-radius:12px;display:grid;place-items:center;background:#65a30d;color:#fff;font-size:11px;font-weight:900}.fg-planilha h2{font-size:16px;margin:0}.fg-planilha header p{margin:3px 0 0;color:#64748b;font-size:10px}.fg-planilha header em{font-style:normal;font-size:9px;font-weight:900;color:#4d7c0f;background:#ecfccb;padding:6px 9px;border-radius:999px}.fg-conteudo{padding:17px;display:grid;gap:14px}.fg-resumos{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:9px}.fg-resumo{border:1px solid #e2e8f0;border-radius:13px;padding:12px;background:#fff}.fg-resumo small{color:#64748b;display:block;font-size:10px}.fg-resumo strong{display:block;margin-top:4px;font-size:16px}.fg-resumo.verde strong{color:#15803d}.fg-resumo.vermelho strong{color:#b91c1c}.fg-resumo.azul strong{color:#0369a1}.fg-tabela-wrap{overflow:auto;border:1px solid #e2e8f0;border-radius:13px}.fg-tabela{width:100%;border-collapse:collapse;min-width:900px;font-size:10px}.fg-tabela th{background:#f8fafc;color:#64748b;text-transform:uppercase;letter-spacing:.04em;text-align:left;padding:9px;white-space:nowrap}.fg-tabela td{padding:9px;border-top:1px solid #eef2f7;vertical-align:middle}.fg-tabela tbody tr:hover{background:#fbfff4}.fg-tabela td small{display:block;color:#94a3b8;margin-top:3px}.fg-tabela .numero{font-variant-numeric:tabular-nums;white-space:nowrap}.fg-tabela .total{font-weight:900;color:#365314}.fg-tabela .pendente{color:#b91c1c}.fg-tabela .pago{color:#15803d}.fg-pill{display:inline-flex;border-radius:999px;padding:4px 7px;font-size:9px;font-weight:900;white-space:nowrap}.fg-pill.entrada{background:#dcfce7;color:#166534}.fg-pill.saida{background:#fee2e2;color:#991b1b}.fg-link{border:0;background:transparent;color:#4d7c0f;text-decoration:underline;font-size:9px;font-weight:800;cursor:pointer}.fg-vazio{border:1px dashed #cbd5e1;border-radius:13px;padding:30px;text-align:center;color:#94a3b8}.fg-aviso{background:#f8fafc;border-left:4px solid #65a30d;border-radius:9px;padding:11px;color:#475569;font-size:10px}.fg-aviso.sucesso{background:#f0fdf4;color:#166534}@media(max-width:900px){.fg-hero{align-items:flex-start;flex-direction:column}.fg-editor{grid-template-columns:1fr 1fr}.fg-editor>div{grid-column:1/-1}}@media(max-width:560px){.fg-hero{padding:18px}.fg-hero h1{font-size:20px}.fg-acoes{width:100%}.fg-acoes label{width:100%}.fg-acoes input{width:100%;box-sizing:border-box}.fg-editor{grid-template-columns:1fr}.fg-editor>div{grid-column:auto}.fg-abas{grid-template-columns:1fr 1fr}.fg-planilha>header em{display:none}.fg-conteudo{padding:11px}}
    `}</style>
  </div>;
}
