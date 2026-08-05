"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { ImportacaoFinanceira } from "./ImportacaoFinanceira";
import { ConciliacaoAvancada } from "./ConciliacaoAvancada";

type Aba = "pessoal" | "empresa" | "manual" | "conciliacao" | "salarios" | "ajuda" | "vendas" | "vendedores" | "comissao" | "colagem" | "supervisor";
type Titulo = { id: string; competencia: string; tipo: string; descricao: string; valor: number; valor_conciliado: number; juros_multa: number; status: string; vencimento?: string; pago_em?: string; observacao?: string; categoria?: string; centro_custo?: string; planilha_grupo: "pessoal" | "empresa" };
type Folha = { id: string; funcionario_id?: string; nome: string; cargo?: string; salario_cadastrado: number; salario_proporcional: number; base: number; proventos: number; comissao: number; bonus_meta: number; inss: number; irrf: number; outros: number; fgts: number; encargos_empresa: number; vale_transporte: number; vale_alimentacao: number; beneficios: number; desconto_horas: number; desconto_dsr: number; desconto_beneficios: number; desconto_vale_transporte: number; horas_previstas_min: number; horas_trabalhadas_min: number; saldo_banco_min: number; memoria_calculo?: Record<string, any>; status: string };
type Venda = { id: number; nome: string; cpf?: string; vendedor: string; plano: string; dados_customizados?: Record<string, any>; data_instalacao: string; valor_plano: number; equipe_id?: number | string; equipe_id_criador?: number | string; fila_id?: number | string };
type Plano = { id: string; plano: string; valor_comissao: number; ativo: boolean };
type Funcionario = { id: string; nome: string; email?: string; user_email?: string; cargo?: string; status?: string; equipe_id?: number | string };
type Equipe = { id: number | string; nome: string };
type EquipeComercial = { id: number | string; nome: string; equipe_id?: number | string; responsavel_usuario_id?: number | string; valor_comissao_supervisor?: number | null };
type UsuarioComercial = { id: number | string; nome: string; email: string; fila_id?: number | string; filas_acesso?: (number | string)[] };
type Extrato = { id: string; data: string; descricao: string; valor: number; tipo: string; conciliado: boolean; titulo_id?: string; status_conciliacao?: string; valor_alocado?: number };
type ManualForm = { tipo: "receber" | "pagar"; descricao: string; valor: string; juros_multa: string; vencimento: string; pago_em: string; status: "pendente" | "pago"; categoria: string; centro_custo: string; grupo: "pessoal" | "empresa"; observacao: string };
const manualVazio = (competencia: string): ManualForm => ({ tipo: "pagar", descricao: "", valor: "", juros_multa: "", vencimento: `${competencia}-01`, pago_em: "", status: "pendente", categoria: "", centro_custo: "", grupo: "empresa", observacao: "" });
type Regras = { percentual_imposto_hsi: number; percentual_desconto_supervisor: number; valor_venda_supervisor: number };

const ABAS: { key: Aba; titulo: string; subtitulo: string; sigla: string }[] = [
  { key: "pessoal", titulo: "Pessoal", subtitulo: "Caixa pessoal", sigla: "PE" },
  { key: "empresa", titulo: "Empresa", subtitulo: "Caixa da empresa", sigla: "EM" },
  { key: "manual", titulo: "Lançamento Manual", subtitulo: "Entradas e gastos avulsos", sigla: "LM" },
  { key: "conciliacao", titulo: "Conciliar Planilha", subtitulo: "Importar e comparar o mês", sigla: "CI" },
  { key: "salarios", titulo: "Salários + Comissão", subtitulo: "Folha consolidada", sigla: "SC" },
  { key: "ajuda", titulo: "Ajuda de Custo", subtitulo: "VT e alimentação", sigla: "AC" },
  { key: "vendas", titulo: "Vendas", subtitulo: "Instalações do CRM", sigla: "VE" },
  { key: "vendedores", titulo: "Vendedores", subtitulo: "Ativos e produção", sigla: "VD" },
  { key: "comissao", titulo: "Comissão por Plano", subtitulo: "Tabela parametrizada", sigla: "CP" },
  { key: "colagem", titulo: "Base de Vendas", subtitulo: "Busca automática", sigla: "BV" },
  { key: "supervisor", titulo: "Comissão SUP", subtitulo: "Resultado por equipe", sigla: "SU" },
];

const padraoRegras: Regras = { percentual_imposto_hsi: 10, percentual_desconto_supervisor: 20, valor_venda_supervisor: 10 };
const dinheiro = (valor: number) => Number(valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const numero = (valor: unknown) => Number(valor || 0);
const chave = (valor: string) => String(valor || "").trim().replace(/\s+/g, " ").toLocaleUpperCase("pt-BR");
const chavePlano = (valor: string) => chave(valor).replace(/GLOBO PLAY/g, "GLOBOPLAY").replace(/PARAMOUNT\+/g, "PARAMOUNT").replace(/ MEGAS/g, " MEGA").replace(/ MB/g, " MEGA").replace(/ GB/g, " GIGA").replace(/ COM /g, " ").replace(/\s*\+\s*/g, " ").replace(/\s*-\s*/g, "-").replace(/\s+/g, " ").trim();
const planoResolvido = (item: { plano?: string; dados_customizados?: Record<string, any> }) => String(item.plano || item.dados_customizados?.plano_escolhido || item.dados_customizados?.plano || "").trim();
const dataBR = (valor?: string) => valor ? new Date(`${valor.slice(0, 10)}T00:00:00`).toLocaleDateString("pt-BR") : "—";
const proximaCompetencia = (competencia: string) => { const [ano, mes] = competencia.split("-").map(Number); const data = new Date(ano, mes, 1); return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-01`; };
const nomeCompetencia = (competencia: string) => new Date(`${competencia}-01T00:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
const pago = (item: Titulo) => /pago|paga|quitado|conciliado/.test(String(item.status || "").toLowerCase()) || item.valor_conciliado >= item.valor + item.juros_multa;
const soma = <T,>(itens: T[], seletor: (item: T) => number) => itens.reduce((total, item) => total + numero(seletor(item)), 0);
const horasMin = (minutos: number) => { const sinal=minutos<0?"-":""; const valor=Math.abs(Math.round(minutos||0)); return `${sinal}${Math.floor(valor/60)}h${String(valor%60).padStart(2,"0")}`; };
const calcularFolha = (item: Folha) => { const memoria=item.memoria_calculo||{}; const salarioCadastrado=numero(item.salario_cadastrado||memoria.salario_cadastrado||memoria.salario_bruto||item.base); const salarioProporcional=numero(item.salario_proporcional||memoria.salario_proporcional||item.base); const remuneracao=Math.max(0,salarioProporcional+item.proventos+item.comissao+item.bonus_meta-item.desconto_horas-item.desconto_dsr); const descontosFolha=item.inss+item.irrf+item.outros+item.desconto_vale_transporte; const liquidoSalario=Math.max(0,remuneracao-descontosFolha); const ajudaCusto=item.vale_transporte+item.vale_alimentacao+item.beneficios; const totalReceber=liquidoSalario+ajudaCusto; const custoEmpresa=remuneracao+ajudaCusto+item.encargos_empresa; return { salarioCadastrado,salarioProporcional,remuneracao,descontosFolha,liquidoSalario,ajudaCusto,totalReceber,custoEmpresa,diasFalta:numero(memoria.dias_falta),vtNominal:numero(memoria.vt_nominal||item.vale_transporte+item.desconto_beneficios),vaNominal:numero(memoria.va_nominal||item.vale_alimentacao),saldoMin:numero(item.saldo_banco_min||memoria.saldo_banco_min) }; };

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
  const [equipesComerciais, setEquipesComerciais] = useState<EquipeComercial[]>([]);
  const [usuariosComerciais, setUsuariosComerciais] = useState<UsuarioComercial[]>([]);
  const [extratos, setExtratos] = useState<Extrato[]>([]);
  const [fechado, setFechado] = useState(false);
  const [manual, setManual] = useState<ManualForm>(() => manualVazio(`${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`));
  const [salvandoManual, setSalvandoManual] = useState(false);
  const [regras, setRegras] = useState<Regras>(padraoRegras);
  const [admin, setAdmin] = useState(false);
  const [editor, setEditor] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [detalheFolhaId, setDetalheFolhaId] = useState<string | null>(null);

  const carregar = async () => {
    setCarregando(true); setMensagem("");
    const inicio = `${competencia}-01`; const fim = proximaCompetencia(competencia);
    const permissao = await supabase.rpc("usuario_pode_administrar_financeiro");
    const consolidacao = permissao.data ? await supabase.rpc("consolidar_folha_financeiro", { p_competencia: competencia }) : { error: null };
    const resultados = await Promise.all([
      supabase.from("fin_titulos").select("id,competencia,tipo,descricao,valor,valor_conciliado,juros_multa,status,vencimento,pago_em,observacao,categoria,centro_custo,planilha_grupo").eq("competencia", competencia).order("vencimento"),
      supabase.from("folha_itens").select("id,funcionario_id,nome,cargo,salario_cadastrado,salario_proporcional,base,proventos,comissao,bonus_meta,inss,irrf,outros,fgts,encargos_empresa,vale_transporte,vale_alimentacao,beneficios,desconto_horas,desconto_dsr,desconto_beneficios,desconto_vale_transporte,horas_previstas_min,horas_trabalhadas_min,saldo_banco_min,memoria_calculo,status").eq("competencia", competencia).order("nome"),
      supabase.from("proposta").select("id,nome,cpf,vendedor,plano,dados_customizados,data_instalacao,valor_plano,equipe_id,equipe_id_criador,fila_id").eq("status_venda", "INSTALADA").gte("data_instalacao", inicio).lt("data_instalacao", fim).order("data_instalacao"),
      supabase.from("fin_comissao_planos").select("id,plano,valor_comissao,ativo").order("plano"),
      supabase.from("funcionarios").select("id,nome,email,user_email,cargo,status,equipe_id").order("nome"),
      supabase.from("equipes").select("id,nome").order("nome"),
      supabase.from("filas").select("id,nome,equipe_id,responsavel_usuario_id,valor_comissao_supervisor").eq("ativo",true).order("nome"),
      supabase.from("usuarios").select("id,nome,email,fila_id,filas_acesso").eq("ativo",true),
      supabase.from("fin_planilha_regras").select("percentual_imposto_hsi,percentual_desconto_supervisor,valor_venda_supervisor").eq("id", 1).maybeSingle(),
      supabase.from("fin_extratos").select("id,data,descricao,valor,tipo,conciliado,titulo_id,status_conciliacao,valor_alocado").gte("data", inicio).lt("data", fim).order("data", { ascending: false }),
      supabase.from("fin_competencias").select("status").eq("competencia", competencia).maybeSingle(),
    ]);
    const [t, f, v, p, fn, eq, filasEquipe, usuariosEquipe, rg, ex, fc] = resultados;
    setTitulos((t.data || []).map((item: any) => ({ ...item, valor: numero(item.valor), valor_conciliado: numero(item.valor_conciliado), juros_multa: numero(item.juros_multa), planilha_grupo: item.planilha_grupo || "empresa" })));
    setFolha((f.data || []).map((item: any) => ({ ...item, salario_cadastrado:numero(item.salario_cadastrado), salario_proporcional:numero(item.salario_proporcional), base:numero(item.base), proventos:numero(item.proventos), comissao:numero(item.comissao), bonus_meta:numero(item.bonus_meta), inss:numero(item.inss), irrf:numero(item.irrf), outros:numero(item.outros), fgts:numero(item.fgts), encargos_empresa:numero(item.encargos_empresa), vale_transporte:numero(item.vale_transporte), vale_alimentacao:numero(item.vale_alimentacao), beneficios:numero(item.beneficios), desconto_horas:numero(item.desconto_horas), desconto_dsr:numero(item.desconto_dsr), desconto_beneficios:numero(item.desconto_beneficios), desconto_vale_transporte:numero(item.desconto_vale_transporte), horas_previstas_min:numero(item.horas_previstas_min), horas_trabalhadas_min:numero(item.horas_trabalhadas_min), saldo_banco_min:numero(item.saldo_banco_min) })));
    setVendas((v.data || []).map((item: any) => ({ ...item, plano: planoResolvido(item), valor_plano: numero(item.valor_plano) })));
    setPlanos((p.data || []).map((item: any) => ({ ...item, valor_comissao: numero(item.valor_comissao) })));
    setFuncionarios((fn.data || []) as Funcionario[]); setEquipes((eq.data || []) as Equipe[]);
    setEquipesComerciais((filasEquipe.data || []) as EquipeComercial[]); setUsuariosComerciais((usuariosEquipe.data || []) as UsuarioComercial[]);
    setExtratos((ex.data || []).map((item: any) => ({ ...item, valor: numero(item.valor), valor_alocado: numero(item.valor_alocado) })) as Extrato[]);
    setFechado(fc.data?.status === "fechada");
    if (rg.data) setRegras({ percentual_imposto_hsi: numero(rg.data.percentual_imposto_hsi), percentual_desconto_supervisor: numero(rg.data.percentual_desconto_supervisor), valor_venda_supervisor: numero(rg.data.valor_venda_supervisor) });
    setAdmin(Boolean(permissao.data));
    const erro = [t.error, f.error, v.error, p.error, fn.error, eq.error, filasEquipe.error, usuariosEquipe.error, rg.error, ex.error, fc.error, permissao.error, consolidacao.error].find(Boolean);
    if (erro) setMensagem(erro.message.includes("fin_planilha_regras") || erro.message.includes("juros_multa") ? "Execute a migração da Aba Geral no Supabase e atualize esta tela." : erro.message);
    setCarregando(false);
  };

  useEffect(() => { setManual(atual => ({ ...atual, vencimento: `${competencia}-01` })); carregar(); }, [competencia]);

  const mapaPlanos = useMemo(() => { const mapa = new Map<string, number>(); [...planos].sort((a,b) => Number(a.ativo) - Number(b.ativo)).forEach(item => mapa.set(chavePlano(item.plano), item.valor_comissao)); return mapa; }, [planos]);
  const contagemVendedor = useMemo(() => { const mapa = new Map<string, number>(); vendas.forEach(venda => mapa.set(chave(venda.vendedor), (mapa.get(chave(venda.vendedor)) || 0) + 1)); return mapa; }, [vendas]);
  const valorComissaoVenda = (venda: Venda) => (contagemVendedor.get(chave(venda.vendedor)) || 0) >= 20 ? (mapaPlanos.get(chavePlano(venda.plano)) || 0) : 0;
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

  const salvarManual = async () => {
    if (!admin) return setMensagem("Somente administradores podem cadastrar lançamentos manuais.");
    if (fechado) return setMensagem("A competência está fechada. Reabra antes de lançar.");
    const valor = Math.abs(numero(manual.valor));
    if (!manual.descricao.trim() || !valor || !manual.vencimento) return setMensagem("Preencha descrição, valor e data.");
    setSalvandoManual(true); setMensagem("");
    const { error } = await supabase.from("fin_titulos").insert({
      competencia, tipo: manual.tipo, descricao: manual.descricao.trim(), valor,
      vencimento: manual.vencimento, pago_em: manual.status === "pago" ? (manual.pago_em || manual.vencimento) : null,
      juros_multa: Math.abs(numero(manual.juros_multa)),
      status: manual.status, categoria: manual.categoria.trim() || "Outros",
      centro_custo: manual.centro_custo.trim() || null, planilha_grupo: manual.grupo,
      observacao: manual.observacao.trim() || "Lançamento manual pelo Caixa Geral",
      origem_modulo: "FINANCEIRO", origem_tipo: "MANUAL", metadata: { cadastro: "caixa_geral" },
    });
    setSalvandoManual(false);
    if (error) return setMensagem(error.message);
    setManual(manualVazio(competencia)); await carregar();
    setMensagem("Lançamento manual salvo e incluído no Caixa Geral.");
  };

  const renderManual = () => <div className="fg-manual">
    <div className="fg-aviso"><b>Novo lançamento.</b> Preencha a linha financeira como na planilha mensal. Os campos automáticos continuam vindo do CRM, RH e cobrança.</div>
    <div className="fg-form-grid">
      <label>TIPO<select value={manual.tipo} onChange={e=>setManual({...manual,tipo:e.target.value as ManualForm["tipo"]})}><option value="pagar">Saída / despesa</option><option value="receber">Entrada / recebimento</option></select></label>
      <label className="fg-form-descricao">DESCRIÇÃO *<input value={manual.descricao} onChange={e=>setManual({...manual,descricao:e.target.value})} placeholder="Ex.: aluguel, fornecedor, recebimento" /></label>
      <label>VENCIMENTO *<input type="date" value={manual.vencimento} onChange={e=>setManual({...manual,vencimento:e.target.value})} /></label>
      <label>PAGAMENTO<input type="date" value={manual.pago_em} onChange={e=>setManual({...manual,pago_em:e.target.value})} disabled={manual.status!=="pago"} /></label>
      <label>VALOR (R$) *<input type="number" min="0" step="0.01" value={manual.valor} onChange={e=>setManual({...manual,valor:e.target.value})} /></label>
      <label>JUROS / MULTA<input type="number" min="0" step="0.01" value={manual.juros_multa} onChange={e=>setManual({...manual,juros_multa:e.target.value})} /></label>
      <label>SITUAÇÃO<select value={manual.status} onChange={e=>setManual({...manual,status:e.target.value as ManualForm["status"]})}><option value="pendente">Previsto / pendente</option><option value="pago">Realizado / pago</option></select></label>
      <label>CAIXA<select value={manual.grupo} onChange={e=>setManual({...manual,grupo:e.target.value as ManualForm["grupo"]})}><option value="empresa">Empresa</option><option value="pessoal">Pessoal</option></select></label>
      <label>CATEGORIA<input value={manual.categoria} onChange={e=>setManual({...manual,categoria:e.target.value})} placeholder="Ex.: Operacional" /></label>
      <label>CENTRO DE CUSTO<input value={manual.centro_custo} onChange={e=>setManual({...manual,centro_custo:e.target.value})} placeholder="Ex.: Comercial" /></label>
      <label className="fg-form-observacao">OBSERVAÇÃO<textarea value={manual.observacao} onChange={e=>setManual({...manual,observacao:e.target.value})} rows={2} /></label>
    </div>
    <div className="fg-form-acoes"><button className="fg-secundario" onClick={()=>setManual(manualVazio(competencia))}>Limpar</button><button className="fg-atualizar" disabled={salvandoManual||fechado} onClick={salvarManual}>{salvandoManual?"Salvando...":"Salvar lançamento"}</button></div>
  </div>;

  const renderConciliacao = () => <div className="fg-conciliacao">
    <div className="fg-aviso sucesso"><b>Planilha mensal + dados automáticos.</b> Importe a planilha como <b>Extrato bancário — conciliação</b>. Depois confira as correspondências abaixo. Linhas ambíguas permanecem pendentes.</div>
    <ImportacaoFinanceira competenciaPadrao={competencia} fechado={fechado} destinoInicial="extratos" onImportado={async mensagem => { await carregar(); setMensagem(mensagem); }} />
    <ConciliacaoAvancada extratos={extratos} titulos={titulos.map(item => ({ ...item, vencimento: item.vencimento || `${competencia}-01`, categoria: item.categoria || "Outros" }))} fechado={fechado} onAtualizar={carregar} />
  </div>;

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
    const calculos = folha.map(item => ({ item, calculo: calcularFolha(item) }));
    const detalhe = calculos.find(x => x.item.id === detalheFolhaId);
    return <><ResumoCards itens={[
      { rotulo:"Colaboradores",valor:String(folha.length) },
      { rotulo:"Salário bruto",valor:dinheiro(soma(calculos,x=>x.calculo.salarioProporcional)),tom:"azul" },
      { rotulo:"Comissões",valor:dinheiro(soma(folha,x=>x.comissao)),tom:"verde" },
      { rotulo:"Desconto horas/faltas",valor:dinheiro(soma(folha,x=>x.desconto_horas+x.desconto_dsr)),tom:"vermelho" },
      { rotulo:"Líquido dos salários",valor:dinheiro(soma(calculos,x=>x.calculo.liquidoSalario)),tom:"verde" },
      { rotulo:"VT + VR/VA + benefícios",valor:dinheiro(soma(calculos,x=>x.calculo.ajudaCusto)),tom:"azul" },
      { rotulo:"Total a receber",valor:dinheiro(soma(calculos,x=>x.calculo.totalReceber)),tom:"verde" },
      { rotulo:"Custo total empresa",valor:dinheiro(soma(calculos,x=>x.calculo.custoEmpresa)),tom:"azul" }
    ]}/><div className="fg-aviso sucesso"><b>Cálculo único e automático.</b> Ponto, faltas, horas, comissão, VT, VR/VA, INSS, IRRF, benefícios e encargos são recalculados ao atualizar a competência.</div>
    <Tabela colunas={["Colaborador","Salário bruto","Faltas / banco","Desc. horas","Comissão","VT líquido","VR/VA líquido","INSS + IRRF","Outros descontos","Líquido salário","Total a receber","Custo empresa","Cálculo"]} vazio={!folha.length}>{calculos.map(({item,calculo})=><tr key={item.id}><td><b>{item.nome}</b><small>{item.cargo||"—"}</small></td><td className="numero">{dinheiro(calculo.salarioProporcional)}</td><td><b className={calculo.saldoMin<0?"pendente":"pago"}>{horasMin(calculo.saldoMin)}</b><small>{calculo.diasFalta} falta(s)</small></td><td className="numero pendente">{dinheiro(item.desconto_horas+item.desconto_dsr)}</td><td className="numero pago">{dinheiro(item.comissao)}</td><td className="numero">{dinheiro(item.vale_transporte)}</td><td className="numero">{dinheiro(item.vale_alimentacao)}</td><td className="numero pendente">{dinheiro(item.inss+item.irrf)}</td><td className="numero pendente">{dinheiro(item.outros+item.desconto_vale_transporte)}</td><td className="numero total">{dinheiro(calculo.liquidoSalario)}</td><td className="numero total">{dinheiro(calculo.totalReceber)}</td><td className="numero">{dinheiro(calculo.custoEmpresa)}</td><td><button className="fg-calculo-btn" onClick={()=>setDetalheFolhaId(detalheFolhaId===item.id?null:item.id)}>{detalheFolhaId===item.id?"Fechar":"Ver cálculo"}</button></td></tr>)}</Tabela>
    {detalhe&&<div className="fg-detalhe"><header><div><b>Memória de cálculo completa</b><small>{detalhe.item.nome} · {nomeCompetencia(competencia)}</small></div><button onClick={()=>setDetalheFolhaId(null)}>×</button></header><div className="fg-detalhe-grid">{[
      ["Salário cadastrado",detalhe.calculo.salarioCadastrado],["Salário proporcional",detalhe.calculo.salarioProporcional],["Proventos/complementos",detalhe.item.proventos],["Comissão CRM",detalhe.item.comissao],["Bônus",detalhe.item.bonus_meta],["Desconto por horas",-detalhe.item.desconto_horas],["DSR/faltas",-detalhe.item.desconto_dsr],["INSS",-detalhe.item.inss],["IRRF",-detalhe.item.irrf],["Desconto VT 6%",-detalhe.item.desconto_vale_transporte],["Outros descontos",-detalhe.item.outros],["Líquido do salário",detalhe.calculo.liquidoSalario],["VT líquido",detalhe.item.vale_transporte],["VR/VA líquido",detalhe.item.vale_alimentacao],["Outros benefícios",detalhe.item.beneficios],["Desconto benefícios por faltas",-detalhe.item.desconto_beneficios],["Total a receber",detalhe.calculo.totalReceber],["FGTS",detalhe.item.fgts],["Encargos empresa",detalhe.item.encargos_empresa],["Custo total empresa",detalhe.calculo.custoEmpresa]
    ].map(([rotulo,valor])=><div key={String(rotulo)}><small>{rotulo}</small><b className={Number(valor)<0?"negativo":""}>{dinheiro(Number(valor))}</b></div>)}</div><p>Horas previstas: <b>{horasMin(detalhe.item.horas_previstas_min)}</b> · trabalhadas: <b>{horasMin(detalhe.item.horas_trabalhadas_min)}</b> · saldo: <b>{horasMin(detalhe.calculo.saldoMin)}</b></p></div>}</>;
  };

  const renderAjuda = () => <><ResumoCards itens={[{ rotulo: "Beneficiários", valor: String(folha.filter(i => i.vale_transporte || i.vale_alimentacao).length) }, { rotulo: "VT líquido", valor: dinheiro(soma(folha, i => i.vale_transporte)), tom: "azul" }, { rotulo: "Alimentação líquida", valor: dinheiro(soma(folha, i => i.vale_alimentacao)), tom: "verde" }, { rotulo: "Total líquido", valor: dinheiro(soma(folha, i => i.vale_transporte + i.vale_alimentacao)), tom: "verde" }]} /><div className="fg-aviso">A planilha descontava R$ 8,60 de VT e R$ 20/R$ 16/R$ 10 de alimentação por falta. No sistema, os valores vêm do cadastro individual e obedecem ao editor visual de dias completos, sábado, VT e VA do RH.</div><Tabela colunas={["Cargo", "Nome", "VT bruto", "Alimentação bruta", "Total bruto", "VT líquido", "Alimentação líquida", "Descontos/faltas", "Total líquido"]} vazio={!folha.length}>{folha.map(item => { const memoria = item.memoria_calculo || {}; const vtBruto = numero(memoria.vt_nominal ?? item.vale_transporte + item.desconto_vale_transporte); const vaBruto = numero(memoria.va_nominal ?? item.vale_alimentacao + item.desconto_beneficios); return <tr key={item.id}><td>{item.cargo || "—"}</td><td><b>{item.nome}</b></td><td className="numero">{dinheiro(vtBruto)}</td><td className="numero">{dinheiro(vaBruto)}</td><td className="numero">{dinheiro(vtBruto + vaBruto)}</td><td className="numero pago">{dinheiro(item.vale_transporte)}</td><td className="numero pago">{dinheiro(item.vale_alimentacao)}</td><td className="numero pendente">{dinheiro(item.desconto_beneficios + item.desconto_vale_transporte)}</td><td className="numero total">{dinheiro(item.vale_transporte + item.vale_alimentacao)}</td></tr>; })}</Tabela></>;

  const renderVendas = (base = vendas) => <><ResumoCards itens={[{ rotulo: "Vendas instaladas", valor: String(base.length), tom: "verde" }, { rotulo: "Valor dos planos", valor: dinheiro(soma(base, i => i.valor_plano)), tom: "azul" }, { rotulo: "Comissão elegível", valor: dinheiro(soma(base, valorComissaoVenda)), tom: "verde" }, { rotulo: "Sem plano parametrizado", valor: String(base.filter(i => !mapaPlanos.has(chavePlano(i.plano))).length), tom: "vermelho" }]} /><Tabela colunas={["Instalação", "Vendedor", "Cliente", "CPF/CNPJ", "Plano", "Status instalação", "Valor plano", "Comissão"]} vazio={!base.length}>{base.map(item => <tr key={item.id}><td>{dataBR(item.data_instalacao)}</td><td><b>{item.vendedor || "Sem vendedor"}</b></td><td>{item.nome}</td><td>{item.cpf || "—"}</td><td>{item.plano || "—"}</td><td><span className="fg-pill entrada">Instalada</span></td><td className="numero">{dinheiro(item.valor_plano)}</td><td className="numero total">{dinheiro(valorComissaoVenda(item))}</td></tr>)}</Tabela></>;

  const renderVendedores = () => {
    const dados = funcionarios.filter(item => String(item.status || "ativo").toLowerCase() !== "inativo").map(item => { const nomes = [item.nome, item.email, item.user_email].map(chave); const instaladas = vendas.filter(venda => nomes.includes(chave(venda.vendedor))).length; return { ...item, instaladas }; }).sort((a, b) => b.instaladas - a.instaladas);
    return <><ResumoCards itens={[{ rotulo: "Vendedores/colaboradores ativos", valor: String(dados.length) }, { rotulo: "Com 20 ou mais", valor: String(dados.filter(i => i.instaladas >= 20).length), tom: "verde" }, { rotulo: "Instalações vinculadas", valor: String(soma(dados, i => i.instaladas)), tom: "azul" }]} /><Tabela colunas={["Vendedor", "E-mail", "Cargo", "Equipe", "Ativo", "Instaladas", "Meta 20", "Situação"]} vazio={!dados.length}>{dados.map(item => <tr key={item.id}><td><b>{item.nome}</b></td><td>{item.email || item.user_email || "—"}</td><td>{item.cargo || "—"}</td><td>{mapaEquipes.get(String(item.equipe_id || "")) || "Sem equipe"}</td><td><span className="fg-pill entrada">Sim</span></td><td className="numero total">{item.instaladas}</td><td>{Math.min(item.instaladas, 20)}/20</td><td><span className={`fg-pill ${item.instaladas >= 20 ? "entrada" : "saida"}`}>{item.instaladas >= 20 ? "Liberada" : `Faltam ${20 - item.instaladas}`}</span></td></tr>)}</Tabela></>;
  };

  const renderPlanos = () => <><ResumoCards itens={[{ rotulo: "Planos cadastrados", valor: String(planos.length) }, { rotulo: "Planos ativos", valor: String(planos.filter(i => i.ativo).length), tom: "verde" }, { rotulo: "Sem comissão", valor: String(planos.filter(i => !i.valor_comissao).length), tom: "vermelho" }]} /><div className="fg-aviso">Esta tabela é a versão viva da aba COMISSAO_PARAM. Os valores continuam editáveis em Gestão Financeira + RH › Comissões.</div><Tabela colunas={["Plano", "Valor comissão", "Situação"]} vazio={!planos.length}>{planos.map(item => <tr key={item.id}><td><b>{item.plano}</b></td><td className="numero total">{dinheiro(item.valor_comissao)}</td><td><span className={`fg-pill ${item.ativo ? "entrada" : "saida"}`}>{item.ativo ? "Ativo" : "Inativo"}</span></td></tr>)}</Tabela></>;

  const renderSupervisor = () => {
    const usuarioPorVendedor = new Map<string, UsuarioComercial>();
    usuariosComerciais.forEach(usuario => { usuarioPorVendedor.set(chave(usuario.email), usuario); usuarioPorVendedor.set(chave(usuario.nome), usuario); });
    const equipePorId = new Map(equipesComerciais.map(item => [String(item.id), item]));
    const responsavelPorId = new Map(usuariosComerciais.map(item => [String(item.id), item]));
    const grupos = new Map<string, { equipe: EquipeComercial | null; vendas: Venda[] }>();
    vendas.forEach(venda => {
      const usuario = usuarioPorVendedor.get(chave(venda.vendedor));
      const filaId = venda.fila_id || usuario?.fila_id || usuario?.filas_acesso?.[0];
      const equipe = filaId != null ? equipePorId.get(String(filaId)) || null : null;
      const fallbackPdv = mapaEquipes.get(String(venda.equipe_id || venda.equipe_id_criador || "")) || "Sem equipe vinculada";
      const grupoId = equipe ? String(equipe.id) : `pdv:${fallbackPdv}`;
      const atual = grupos.get(grupoId) || { equipe, vendas: [] };
      atual.vendas.push(venda); grupos.set(grupoId, atual);
    });
    const dados = Array.from(grupos.entries()).map(([grupoId, grupo]) => {
      const responsavel = grupo.equipe?.responsavel_usuario_id != null ? responsavelPorId.get(String(grupo.equipe.responsavel_usuario_id)) : undefined;
      const valorVenda = grupo.equipe?.valor_comissao_supervisor == null ? regras.valor_venda_supervisor : numero(grupo.equipe.valor_comissao_supervisor);
      const bruto = grupo.vendas.length * valorVenda;
      const desconto = bruto * regras.percentual_desconto_supervisor / 100;
      return { grupoId, equipe: grupo.equipe?.nome || grupoId.replace(/^pdv:/,""), responsavel, quantidade:grupo.vendas.length, valorVenda, bruto, desconto, liquido:bruto-desconto };
    }).sort((a,b)=>b.liquido-a.liquido);
    return <><ResumoCards itens={[{ rotulo:"Equipes",valor:String(dados.length) },{ rotulo:"Com responsável",valor:String(dados.filter(i=>i.responsavel).length),tom:"azul" },{ rotulo:"Vendas instaladas",valor:String(vendas.length),tom:"azul" },{ rotulo:"Líquido SUP",valor:dinheiro(soma(dados,i=>i.liquido)),tom:"verde" }]} />
      <div className="fg-aviso">O responsável vem de Configurações → Equipes. As vendas dos usuários vinculados à equipe são contabilizadas automaticamente para o supervisor.</div>
      <Tabela colunas={["Equipe","Responsável / supervisor","Vendas","Valor por venda","Comissão bruta",`Desconto (${regras.percentual_desconto_supervisor}%)`,"Total líquido"]} vazio={!dados.length}>{dados.map(item=><tr key={item.grupoId}><td><b>{item.equipe}</b></td><td>{item.responsavel?<><b>{item.responsavel.nome}</b><small>{item.responsavel.email}</small></>:<span className="fg-pill saida">Sem responsável</span>}</td><td className="numero">{item.quantidade}</td><td className="numero">{dinheiro(item.valorVenda)}</td><td className="numero">{dinheiro(item.bruto)}</td><td className="numero pendente">{dinheiro(item.desconto)}</td><td className="numero total">{dinheiro(item.liquido)}</td></tr>)}</Tabela></>;
  };

  const conteudo = () => {
    if (aba === "pessoal") return renderCaixa(titulosPessoal, "pessoal");
    if (aba === "empresa") return renderCaixa(titulosEmpresa, "empresa");
    if (aba === "manual") return renderManual();
    if (aba === "conciliacao") return renderConciliacao();
    if (aba === "salarios") return renderSalarios();
    if (aba === "ajuda") return renderAjuda();
    if (aba === "vendas") return renderVendas();
    if (aba === "vendedores") return renderVendedores();
    if (aba === "comissao") return renderPlanos();
    if (aba === "colagem") return <><div className="fg-aviso sucesso"><b>Colagem eliminada.</b> Esta base é preenchida automaticamente pelas vendas com status INSTALADA no CRM. Não é preciso copiar e colar a planilha todos os meses.</div>{renderVendas()}</>;
    return renderSupervisor();
  };

  const selecionada = ABAS.find(item => item.key === aba)!;
  return <div className="fg-root">
    <div className="fg-hero"><div><span>ABA GERAL</span><h1>Caixa Geral Financeiro</h1><p>As planilhas viraram visões automáticas conectadas ao Financeiro, RH e CRM.</p></div><div className="fg-acoes"><label>Competência<input type="month" value={competencia} onChange={e => setCompetencia(e.target.value)} /></label>{admin && <button className="fg-secundario" onClick={() => setEditor(!editor)}>⚙ Padrões</button>}<button className="fg-atualizar" onClick={carregar} disabled={carregando}>{carregando ? "Atualizando..." : "Atualizar"}</button></div></div>
    {mensagem && <div className="fg-mensagem">{mensagem}<button onClick={() => setMensagem("")}>×</button></div>}
    {editor && <div className="fg-editor"><div><b>Padrões de cálculo das planilhas</b><small>Somente o administrador pode alterar. Os valores são aplicados imediatamente na visão Comissão SUP.</small></div><label>Desconto SUP (%)<input type="number" min="0" max="100" step="0.01" value={regras.percentual_desconto_supervisor} onChange={e => setRegras({ ...regras, percentual_desconto_supervisor: numero(e.target.value) })} /></label><label>Valor por venda SUP<input type="number" min="0" step="0.01" value={regras.valor_venda_supervisor} onChange={e => setRegras({ ...regras, valor_venda_supervisor: numero(e.target.value) })} /></label><button className="fg-atualizar" onClick={salvarRegras}>Salvar padrões</button></div>}
    <div className="fg-navegacao">
      <label><span>PLANILHA / VISÃO</span><select value={aba} onChange={e=>setAba(e.target.value as Aba)}>
        <optgroup label="Caixa geral"><option value="empresa">Empresa</option><option value="pessoal">Pessoal</option></optgroup>
        <optgroup label="Folha e benefícios"><option value="salarios">Salários + Comissão</option><option value="ajuda">Ajuda de Custo</option></optgroup>
        <optgroup label="Comercial"><option value="vendas">Vendas instaladas</option><option value="vendedores">Vendedores</option><option value="comissao">Comissão por Plano</option><option value="supervisor">Comissão SUP</option><option value="colagem">Base automática de vendas</option></optgroup>
        <optgroup label="Ações"><option value="manual">Novo lançamento</option><option value="conciliacao">Importar / conciliar</option></optgroup>
      </select></label>
      <div className="fg-nav-acoes"><button className={aba==="manual"?"ativo":""} onClick={()=>setAba("manual")}>＋ Novo lançamento</button><button className={aba==="conciliacao"?"ativo":""} onClick={()=>setAba("conciliacao")}>⇧ Importar / conciliar</button></div>
    </div>
    <section className="fg-planilha"><header><div><span>{selecionada.sigla}</span><div><h2>{selecionada.titulo}</h2><p>{selecionada.subtitulo} · {nomeCompetencia(competencia)}</p></div></div><em>{aba === "manual" ? "CADASTRO MANUAL" : aba === "conciliacao" ? "IMPORTAR + CONCILIAR" : "DADOS AUTOMÁTICOS"}</em></header><div className="fg-conteudo">{conteudo()}</div></section>
    <style jsx global>{`
      .fg-root{display:grid;gap:12px;color:#172033}.fg-hero{background:#fff;border:1px solid #dbe5df;border-radius:14px;padding:16px 18px;color:#173126;display:flex;justify-content:space-between;align-items:center;gap:18px;box-shadow:0 5px 18px rgba(15,23,42,.04)}.fg-hero span{font-size:9px;font-weight:900;letter-spacing:.14em;color:#658072}.fg-hero h1{font-size:21px;margin:4px 0 3px;color:#172033}.fg-hero p{margin:0;color:#64748b;font-size:11px}.fg-acoes{display:flex;align-items:end;gap:7px;flex-wrap:wrap}.fg-acoes label,.fg-navegacao label>span{font-size:9px;font-weight:900;letter-spacing:.07em;color:#64748b}.fg-acoes input,.fg-navegacao select{display:block;margin-top:4px;min-height:38px;border:1px solid #cbd8d1;border-radius:8px;padding:0 10px;background:#fff;color:#172033}.fg-atualizar,.fg-secundario,.fg-nav-acoes button{min-height:38px;border-radius:8px;padding:0 13px;font-weight:800;cursor:pointer;font-size:11px}.fg-atualizar{background:#648c78;color:#fff;border:1px solid #557966;box-shadow:none}.fg-secundario,.fg-nav-acoes button{background:#fff;color:#365f4b;border:1px solid #cbd8d1}.fg-mensagem{padding:10px 12px;background:#fff8ed;border:1px solid #fed7aa;border-radius:9px;color:#9a3412;font-size:11px;display:flex;justify-content:space-between}.fg-mensagem button{border:0;background:transparent;font-size:18px;cursor:pointer}.fg-editor{background:#f6f9f7;border:1px solid #dbe5df;border-radius:11px;padding:13px;display:grid;grid-template-columns:minmax(220px,1fr) repeat(2,minmax(130px,180px)) auto;gap:9px;align-items:end}.fg-editor small{display:block;color:#64748b;margin-top:4px}.fg-editor label{font-size:9px;font-weight:800;color:#4b6758}.fg-editor input{display:block;width:100%;box-sizing:border-box;margin-top:5px;border:1px solid #cbd5e1;border-radius:7px;padding:9px;background:#fff}.fg-navegacao{display:flex;align-items:end;justify-content:space-between;gap:12px;padding:12px 14px;background:#f8faf9;border:1px solid #dbe5df;border-radius:11px}.fg-navegacao label{min-width:min(340px,100%)}.fg-navegacao select{width:100%;font-weight:800}.fg-nav-acoes{display:flex;gap:7px;flex-wrap:wrap}.fg-nav-acoes button.ativo{background:#e7f0eb;border-color:#87a997;color:#244936}.fg-planilha{background:#fff;border:1px solid #dbe3e8;border-radius:11px;overflow:hidden;box-shadow:none}.fg-planilha>header{padding:12px 14px;border-bottom:1px solid #dbe3e8;display:flex;justify-content:space-between;align-items:center;background:#f8fafc}.fg-planilha>header>div{display:flex;gap:9px;align-items:center}.fg-planilha>header>div>span{width:32px;height:32px;border-radius:7px;display:grid;place-items:center;background:#e4ece8;color:#355a47;font-size:9px;font-weight:900}.fg-planilha h2{font-size:15px;margin:0}.fg-planilha header p{margin:2px 0 0;color:#64748b;font-size:10px}.fg-planilha header em{font-style:normal;font-size:8px;font-weight:900;color:#4b6758;background:#e9f0ec;padding:5px 8px;border-radius:999px}.fg-conteudo{padding:12px;display:grid;gap:11px}.fg-manual,.fg-conciliacao{display:grid;gap:12px}.fg-form-grid{display:grid;grid-template-columns:minmax(145px,.8fr) minmax(260px,1.7fr) repeat(4,minmax(140px,1fr));gap:0;border:1px solid #dbe3e8;border-radius:8px;overflow:hidden;background:#fff}.fg-form-grid label{font-size:8px;font-weight:900;color:#52677a;letter-spacing:.04em;padding:8px;border-right:1px solid #e6ebef;border-bottom:1px solid #e6ebef;background:#f8fafc}.fg-form-grid input,.fg-form-grid select,.fg-form-grid textarea{display:block;width:100%;box-sizing:border-box;margin-top:5px;border:1px solid #cfd9df;border-radius:5px;padding:8px;background:#fff;color:#172033;font:inherit;font-size:10px;outline:none}.fg-form-grid input:focus,.fg-form-grid select:focus,.fg-form-grid textarea:focus{border-color:#789d89;box-shadow:0 0 0 2px rgba(120,157,137,.12)}.fg-form-descricao{grid-column:span 2}.fg-form-observacao{grid-column:span 2}.fg-form-acoes{display:flex;justify-content:flex-end;gap:7px}.fg-resumos{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:0;border:1px solid #dbe3e8;border-radius:8px;overflow:hidden}.fg-resumo{border:0;border-right:1px solid #e5eaee;border-radius:0;padding:10px 11px;background:#f8fafc}.fg-resumo:last-child{border-right:0}.fg-resumo small{color:#64748b;display:block;font-size:9px}.fg-resumo strong{display:block;margin-top:3px;font-size:14px}.fg-resumo.verde strong{color:#28724c}.fg-resumo.vermelho strong{color:#b42318}.fg-resumo.azul strong{color:#285a84}.fg-tabela-wrap{overflow:auto;border:1px solid #d8e1e6;border-radius:8px}.fg-tabela{width:100%;border-collapse:collapse;min-width:960px;font-size:10px}.fg-tabela th{position:sticky;top:0;z-index:1;background:#243b53;color:#fff;text-transform:uppercase;letter-spacing:.04em;text-align:left;padding:9px 8px;white-space:nowrap;font-size:8px}.fg-tabela td{padding:8px;border-top:1px solid #e8edf0;vertical-align:middle;background:#fff}.fg-tabela tbody tr:nth-child(even) td{background:#fbfcfd}.fg-tabela tbody tr:hover td{background:#f0f6f2}.fg-tabela td small{display:block;color:#8a9aaa;margin-top:2px}.fg-tabela .numero{font-variant-numeric:tabular-nums;white-space:nowrap;text-align:right}.fg-tabela .total{font-weight:900;color:#315f47}.fg-tabela .pendente{color:#b42318}.fg-tabela .pago{color:#28724c}.fg-pill{display:inline-flex;border-radius:999px;padding:3px 6px;font-size:8px;font-weight:900;white-space:nowrap}.fg-pill.entrada{background:#e5f5eb;color:#23633f}.fg-pill.saida{background:#fde8e7;color:#982d28}.fg-link{border:0;background:transparent;color:#315f47;text-decoration:underline;font-size:8px;font-weight:800;cursor:pointer}.fg-vazio{border:1px dashed #cbd5e1;border-radius:8px;padding:28px;text-align:center;color:#94a3b8}.fg-aviso{background:#f8fafc;border-left:3px solid #789d89;border-radius:6px;padding:9px 10px;color:#475569;font-size:10px}.fg-aviso.sucesso{background:#f1f7f3;color:#285941}.fg-calculo-btn{border:1px solid #a9c0b4;background:#f3f7f5;color:#315f47;border-radius:6px;padding:5px 8px;font-size:8px;font-weight:900;cursor:pointer;white-space:nowrap}.fg-detalhe{border:1px solid #cbd8d1;background:#f8faf9;border-radius:9px;padding:13px}.fg-detalhe>header{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}.fg-detalhe>header small{display:block;color:#64748b;margin-top:3px}.fg-detalhe>header button{border:0;background:transparent;font-size:20px;cursor:pointer}.fg-detalhe-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:7px}.fg-detalhe-grid>div{background:#fff;border:1px solid #e2e8f0;border-radius:7px;padding:8px}.fg-detalhe-grid small{display:block;color:#64748b;font-size:8px}.fg-detalhe-grid b{display:block;margin-top:3px;font-size:10px;color:#315f47}.fg-detalhe-grid b.negativo{color:#b42318}.fg-detalhe>p{font-size:10px;color:#475569;margin:10px 0 0}@media(max-width:1050px){.fg-form-grid{grid-template-columns:repeat(3,1fr)}}@media(max-width:900px){.fg-form-grid{grid-template-columns:1fr 1fr}.fg-hero{align-items:flex-start;flex-direction:column}.fg-editor{grid-template-columns:1fr 1fr}.fg-editor>div{grid-column:1/-1}.fg-navegacao{align-items:stretch;flex-direction:column}.fg-navegacao label{min-width:0}.fg-nav-acoes button{flex:1}}@media(max-width:560px){.fg-form-grid{grid-template-columns:1fr}.fg-form-descricao,.fg-form-observacao{grid-column:auto}.fg-hero{padding:14px}.fg-hero h1{font-size:18px}.fg-acoes{width:100%}.fg-acoes label{width:100%}.fg-acoes input{width:100%;box-sizing:border-box}.fg-editor{grid-template-columns:1fr}.fg-editor>div{grid-column:auto}.fg-planilha>header em{display:none}.fg-conteudo{padding:8px}.fg-resumos{grid-template-columns:1fr 1fr}}
    `}</style>
  </div>;
}
