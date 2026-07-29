"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../../../lib/supabase";
import { LeitorFinanceiroIA } from "./LeitorFinanceiroIA";
import { MetasInadimplencia } from "./MetasInadimplencia";

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
const card = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 18 } as const;
const input = { border: "1px solid #d1d5db", borderRadius: 9, padding: "9px 11px", fontSize: 12, background: "#fff" } as const;
const botao = { border: 0, borderRadius: 9, padding: "9px 13px", fontSize: 12, fontWeight: 800, cursor: "pointer", background: "#d97706", color: "#fff" } as const;

type Titulo = { id: string; tipo: string; descricao: string; valor: number; status: string; competencia: string; vencimento: string; categoria: string; centro_custo?: string };
type Fechamento = { competencia: string; status: string; entradas_snapshot: number; saidas_snapshot: number; saldo_snapshot: number };
type Venda = { id: number; nome: string; vendedor: string; data_instalacao: string; comissao_manual: number };
type Extrato = { id: string; data: string; descricao: string; valor: number; tipo: string; conciliado: boolean; titulo_id?: string };
type Alerta = { id: string; tipo: string; titulo: string; mensagem: string; vencimento: string; status: string };
type IdentidadeVendedor = { email: string; nome: string; fila: string };

export function GestaoFinanceiraRH() {
  const [aba, setAba] = useState("competencias");
  const [comp, setComp] = useState(compAtual());
  const [titulos, setTitulos] = useState<Titulo[]>([]);
  const [fechamentos, setFechamentos] = useState<Fechamento[]>([]);
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [extratos, setExtratos] = useState<Extrato[]>([]);
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState("");
  const [identidades, setIdentidades] = useState<IdentidadeVendedor[]>([]);
  const [vendedorAberto, setVendedorAberto] = useState<string | null>(null);
  const [salvandoVenda, setSalvandoVenda] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const [u, f] = await Promise.all([
        supabase.from("usuarios").select("email,nome,fila_id"),
        supabase.from("filas").select("id,nome"),
      ]);
      const filas = new Map((f.data || []).map((x: any) => [String(x.id), x.nome]));
      setIdentidades((u.data || []).map((x: any) => ({
        email: String(x.email || ""),
        nome: String(x.nome || x.email || ""),
        fila: x.fila_id == null ? "Sem fila" : String(filas.get(String(x.fila_id)) || `Fila ${x.fila_id}`),
      })));
    })();
  }, []);

  const identidadeDoVendedor = (chave: string) => {
    const normal = chave.trim().toLowerCase();
    return identidades.find(x => x.email.trim().toLowerCase() === normal || x.nome.trim().toLowerCase() === normal);
  };
  const carregar = async () => {
    const [t, f, v, e, a] = await Promise.all([
      supabase.from("fin_titulos").select("id,tipo,descricao,valor,status,competencia,vencimento,categoria,centro_custo").order("vencimento"),
      supabase.from("fin_competencias").select("*").order("competencia", { ascending: false }),
      supabase.from("proposta").select("id,nome,vendedor,data_instalacao,comissao_manual").eq("status_venda", "INSTALADA").gte("data_instalacao", `${comp}-01`).lt("data_instalacao", inicioProximaComp(comp)).order("vendedor"),
      supabase.from("fin_extratos").select("*").order("data", { ascending: false }).limit(500),
      supabase.from("fin_alertas").select("*").neq("status", "resolvido").order("vencimento"),
    ]);
    setTitulos((t.data || []).map((x: any) => ({ ...x, valor: Number(x.valor) || 0, competencia: x.competencia || (x.vencimento || "").slice(0, 7) })));
    setFechamentos((f.data || []) as Fechamento[]);
    setVendas((v.data || []).map((x: any) => ({ ...x, comissao_manual: Number(x.comissao_manual) || 0 })) as Venda[]);
    setExtratos((e.data || []).map((x: any) => ({ ...x, valor: Number(x.valor) || 0 })) as Extrato[]);
    setAlertas((a.data || []) as Alerta[]);
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

  const importarArquivo = async (arquivo?: File) => {
    if (!arquivo) return;
    setOcupado(true);
    let registros: any[] = [];
    const ext = arquivo.name.split(".").pop()?.toLowerCase();
    if (ext === "xlsx" || ext === "xls") {
      const wb = XLSX.read(await arquivo.arrayBuffer(), { type: "array", cellDates: true });
      registros = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
    } else if (ext === "ofx") {
      const texto = await arquivo.text();
      registros = (texto.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) || []).map(bloco => ({
        data: bloco.match(/<DTPOSTED>([^<\r\n]+)/i)?.[1]?.slice(0,8).replace(/(\d{4})(\d{2})(\d{2})/,"$1-$2-$3"),
        descricao: bloco.match(/<(?:MEMO|NAME)>([^<\r\n]+)/i)?.[1] || "Movimento bancário",
        valor: bloco.match(/<TRNAMT>([^<\r\n]+)/i)?.[1] || "0",
        tipo: bloco.match(/<TRNTYPE>([^<\r\n]+)/i)?.[1] || "",
      }));
    } else {
      const texto = await arquivo.text();
      const linhas = texto.split(/\r?\n/).filter(Boolean), sep = linhas[0]?.includes(";") ? ";" : ",";
      const cab = (linhas.shift() || "").split(sep);
      registros = linhas.map(l => Object.fromEntries(l.split(sep).map((v,i)=>[cab[i],v])));
    }
    const achar=(r:any,...nomes:string[])=>{const k=Object.keys(r).find(x=>nomes.includes(x.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim()));return k?r[k]:""};
    const itens=registros.map(r=>{const bruto=String(achar(r,"valor","amount")||0);const n=Number(bruto.replace(/\./g,"").replace(",","."))||0;const tipoRaw=String(achar(r,"tipo","type")||"").toLowerCase();return {data:achar(r,"data","date"),descricao:achar(r,"descricao","historico","memo","name")||"Movimento bancário",valor:Math.abs(n),tipo:tipoRaw.includes("deb")||n<0?"debito":"credito"}}).filter(x=>x.data&&x.descricao);
    const { data: auth } = await supabase.auth.getUser();
    const imp=await supabase.from("fin_importacoes").insert({nome_arquivo:arquivo.name,formato:ext||"arquivo",total_linhas:itens.length,importado_por:auth.user?.email}).select("id").single();
    if(imp.error){setMsg(imp.error.message);setOcupado(false);return}
    const {error}=await supabase.from("fin_extratos").insert(itens.map(x=>({...x,importacao_id:imp.data.id})));
    setMsg(error?error.message:`${itens.length} movimentos importados de ${ext?.toUpperCase()}.`);setOcupado(false);carregar();
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
    const m: Record<string, { qtd: number; valor: number; vendas: Venda[] }> = {};
    vendas.forEach(v => {
      const k = v.vendedor || "Sem vendedor";
      m[k] ||= { qtd: 0, valor: 0, vendas: [] };
      m[k].qtd++;
      m[k].valor += v.comissao_manual;
      m[k].vendas.push(v);
    });
    return Object.entries(m).sort((a, b) => b[1].qtd - a[1].qtd);
  }, [vendas]);

  const editarComissaoLocal = (id: number, valor: number) => {
    setVendas(xs => xs.map(x => x.id === id ? { ...x, comissao_manual: valor } : x));
  };

  const gravarComissao = async (v: Venda) => {
    setSalvandoVenda(v.id);
    await salvarVenda(v, { comissao_manual: v.comissao_manual });
    setSalvandoVenda(null);
  };

  const abas = [["competencias","Competências"],["rh","RH integrado"],["comissoes","Comissões"],["importacao","Importação"],["conciliacao","Conciliação"],["projecao","Fluxo projetado"],["alertas","Alertas"],["metas","Metas e inadimplência"],["ia","Leitura por IA"]] as const;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div><h1 style={{ margin: 0, fontSize: 23 }}>Gestão Financeira + RH</h1><p style={{ color: "#64748b", fontSize: 12 }}>Fechamento, automações, auditoria e planejamento</p></div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>{abas.map(([k,l]) => <button key={k} onClick={() => setAba(k)} style={{ ...botao, background: aba === k ? "#d97706" : "#fff", color: aba === k ? "#fff" : "#92400e", border: "1px solid #fde68a" }}>{l}</button>)}</div>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}><input type="month" value={comp} onChange={e => setComp(e.target.value)} style={input}/>{msg && <span style={{ fontSize: 11, color: "#475569" }}>{msg}</span>}</div>

      {aba === "competencias" && <div style={{ display: "grid", gap: 12 }}>
        <div style={{ ...card, display: "flex", justifyContent: "space-between", alignItems: "center" }}><div><b>{mesNome(comp)}</b><p style={{ margin: "4px 0 0", fontSize: 12, color: fechado ? "#16a34a" : "#d97706" }}>{fechado ? "Fechada" : "Aberta"}</p></div><button disabled={ocupado} onClick={fechar} style={botao}>{fechado ? "Reabrir" : "Fechar competência"}</button></div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>{[["Entradas",atual.entradas],["Saídas",atual.saidas],["Saldo",atual.saldo]].map(([l,v]) => <div style={card} key={String(l)}><small>{l}</small><h3>{moeda(Number(v))}</h3></div>)}</div>
        <div style={card}><b>Comparação mensal</b>{meses.slice(0,12).map(m => <div key={m.competencia} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", padding: "8px 0", borderBottom: "1px solid #f1f5f9", fontSize: 12 }}><span>{mesNome(m.competencia)}</span><span>{moeda(m.entradas)}</span><span>{moeda(m.saidas)}</span><b>{moeda(m.saldo)}</b></div>)}</div>
      </div>}

      {aba === "rh" && <div style={card}><h3>Sincronização RH → Financeiro</h3><p style={{ color: "#64748b", fontSize: 12 }}>Cria a folha da competência com salário, VT, alimentação, benefícios, encargos e recalcula comissões elegíveis. Itens pagos não são alterados.</p><button disabled={ocupado || fechado} onClick={sincronizarRH} style={botao}>Sincronizar competência</button></div>}

      {aba === "comissoes" && <div style={{ display: "grid", gap: 16 }}>
        <div style={{ background: "linear-gradient(135deg,#fff7ed 0%,#fffbeb 100%)", border: "1px solid #fed7aa", borderRadius: 16, padding: "16px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div><b style={{ color: "#9a3412", fontSize: 15 }}>Comissões por vendedor</b><p style={{ margin: "4px 0 0", color: "#78716c", fontSize: 12 }}>A edição é liberada ao completar 20 vendas instaladas na competência.</p></div>
          <span style={{ background: "#fff", border: "1px solid #fed7aa", borderRadius: 999, padding: "7px 12px", color: "#9a3412", fontSize: 11, fontWeight: 800 }}>{vendas.length} instalações em {mesNome(comp)}</span>
        </div>
        {porVendedor.map(([vendedor,x]) => {
          const pessoa = identidadeDoVendedor(vendedor);
          const liberada = x.qtd >= 20;
          const aberta = vendedorAberto === vendedor;
          const percentual = Math.min(100, (x.qtd / 20) * 100);
          return <div key={vendedor} style={{ background: "#fff", border: `1px solid ${liberada ? "#bbf7d0" : "#e2e8f0"}`, borderRadius: 18, overflow: "hidden", boxShadow: liberada ? "0 8px 24px rgba(22,163,74,.08)" : "0 4px 16px rgba(15,23,42,.04)" }}>
            <div style={{ padding: "18px 20px", display: "grid", gridTemplateColumns: "minmax(220px,1.4fr) minmax(220px,1fr) auto", gap: 18, alignItems: "center" }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0 }}>
                <div style={{ width: 42, height: 42, borderRadius: 13, flexShrink: 0, display: "grid", placeItems: "center", background: liberada ? "#dcfce7" : "#f1f5f9", color: liberada ? "#15803d" : "#64748b", fontWeight: 900 }}>{(pessoa?.nome || vendedor).slice(0,2).toUpperCase()}</div>
                <div style={{ minWidth: 0 }}><b style={{ color: "#0f172a", fontSize: 14 }}>{pessoa?.nome || vendedor}</b><p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis" }}>{pessoa?.email || vendedor}</p><span style={{ display: "inline-block", marginTop: 6, borderRadius: 999, padding: "4px 8px", background: "#eff6ff", color: "#1d4ed8", fontSize: 10, fontWeight: 800 }}>{pessoa?.fila || "Fila não identificada"}</span></div>
              </div>
              <div><div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 7 }}><span style={{ color: "#64748b" }}>Progresso da meta</span><b style={{ color: liberada ? "#15803d" : "#b45309" }}>{x.qtd}/20</b></div><div style={{ height: 8, background: "#f1f5f9", borderRadius: 999, overflow: "hidden" }}><div style={{ height: "100%", width: `${percentual}%`, borderRadius: 999, background: liberada ? "linear-gradient(90deg,#22c55e,#16a34a)" : "linear-gradient(90deg,#fbbf24,#f59e0b)" }}/></div><p style={{ margin: "7px 0 0", fontSize: 11, color: "#64748b" }}>{liberada ? `${x.qtd - 20} venda(s) acima da meta` : `Faltam ${20 - x.qtd} venda(s)`}</p></div>
              <div style={{ textAlign: "right" }}><span style={{ display: "inline-block", borderRadius: 999, padding: "6px 10px", background: liberada ? "#dcfce7" : "#fff7ed", color: liberada ? "#166534" : "#9a3412", fontSize: 10, fontWeight: 900 }}>{liberada ? "LIBERADA" : "BLOQUEADA"}</span><b style={{ display: "block", marginTop: 8, fontSize: 16, color: "#0f172a" }}>{moeda(x.valor)}</b>{liberada && <button onClick={() => setVendedorAberto(aberta ? null : vendedor)} style={{ ...botao, marginTop: 10, background: aberta ? "#475569" : "#16a34a", minWidth: 152 }}>{aberta ? "Fechar edição" : "Definir comissões"}</button>}</div>
            </div>
            {aberta && liberada && <div style={{ borderTop: "1px solid #dcfce7", background: "#f8fffa", padding: "18px 20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}><div><b style={{ color: "#166534", fontSize: 13 }}>Vendas instaladas de {pessoa?.nome || vendedor}</b><p style={{ margin: "3px 0 0", color: "#64748b", fontSize: 11 }}>Informe a comissão individual de cada instalação. O valor é salvo ao sair do campo.</p></div><span style={{ color: "#166534", fontSize: 12, fontWeight: 800 }}>Total: {moeda(x.valor)}</span></div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 10 }}>{x.vendas.map(v => <div key={v.id} style={{ background: "#fff", border: "1px solid #d1fae5", borderRadius: 12, padding: 12, display: "grid", gridTemplateColumns: "1fr 130px", gap: 12, alignItems: "center" }}><div style={{ minWidth: 0 }}><b style={{ display: "block", color: "#1e293b", fontSize: 11, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.nome}</b><span style={{ color: "#94a3b8", fontSize: 10 }}>Instalada em {v.data_instalacao ? new Date(`${v.data_instalacao}T00:00:00`).toLocaleDateString("pt-BR") : "data não informada"}</span></div><label style={{ position: "relative" }}><span style={{ position: "absolute", left: 10, top: 9, color: "#64748b", fontSize: 11, fontWeight: 700 }}>R$</span><input aria-label={`Comissão de ${v.nome}`} type="number" min="0" step="0.01" value={v.comissao_manual} onChange={e => editarComissaoLocal(v.id, Number(e.target.value))} onBlur={() => gravarComissao(v)} style={{ ...input, width: "100%", paddingLeft: 31, borderColor: v.comissao_manual > 0 ? "#86efac" : "#cbd5e1", boxSizing: "border-box" }}/>{salvandoVenda === v.id && <small style={{ position: "absolute", right: 7, bottom: -14, color: "#16a34a", fontSize: 9 }}>Salvando...</small>}</label></div>)}</div>
            </div>}
          </div>;
        })}
      </div>}
      {aba === "importacao" && <div style={card}><h3>Importar extrato/planilha</h3><p style={{ fontSize: 12, color: "#64748b" }}>CSV com data, descrição, valor e tipo. A importação não altera lançamentos existentes.</p><input type="file" accept=".csv,.xls,.xlsx,.ofx,text/csv" onChange={e => importarArquivo(e.target.files?.[0])}/></div>}
      {aba === "conciliacao" && <div style={card}><button disabled={ocupado} onClick={conciliarAutomatico} style={botao}>Conciliar valores correspondentes</button><p style={{ fontSize: 12 }}>{extratos.filter(x=>x.conciliado).length} conciliados · {extratos.filter(x=>!x.conciliado).length} pendentes</p>{extratos.slice(0,100).map(e=><div key={e.id} style={{ display:"grid",gridTemplateColumns:"100px 1fr 120px 100px",fontSize:11,padding:7,borderBottom:"1px solid #eee" }}><span>{e.data}</span><span>{e.descricao}</span><b>{moeda(e.valor)}</b><span>{e.conciliado?"Conciliado":"Pendente"}</span></div>)}</div>}
      {aba === "projecao" && <div style={card}><h3>Fluxo de caixa projetado</h3>{meses.slice(0,12).map(m=><div key={m.competencia} style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",fontSize:12,padding:8,borderBottom:"1px solid #eee"}}><span>{mesNome(m.competencia)}</span><span>{moeda(m.entradas)}</span><span>{moeda(m.saidas)}</span><b>{moeda(m.saldo)}</b></div>)}</div>}
      {aba === "alertas" && <div style={card}><button onClick={gerarAlertas} disabled={ocupado} style={botao}>Atualizar alertas</button>{alertas.map(a=><div key={a.id} style={{padding:9,borderBottom:"1px solid #eee"}}><b style={{fontSize:12}}>{a.titulo}</b><p style={{margin:3,fontSize:11}}>{a.mensagem} · {a.vencimento}</p></div>)}</div>}
      {aba === "metas" && <MetasInadimplencia competencia={comp} />}
      {aba === "ia" && <LeitorFinanceiroIA />}
    </div>
  );
}
