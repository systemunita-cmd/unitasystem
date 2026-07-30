"use client";

import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

type TituloRelatorio = {
  id: string;
  tipo: string;
  descricao: string;
  valor: number;
  status: string;
  competencia: string;
  vencimento: string;
  categoria: string;
  centro_custo?: string;
};

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const cores = ["#65a30d", "#0f766e", "#2563eb", "#7c3aed", "#ca8a04", "#dc2626", "#0891b2"];
const box = { background: "#fff", border: "1px solid #d9f99d", borderRadius: 16, padding: 18, boxShadow: "0 8px 24px rgba(63,98,18,.06)" } as const;
const btn = { border: "1px solid #4d7c0f", borderRadius: 10, padding: "10px 14px", background: "#65a30d", color: "#fff", fontWeight: 800, cursor: "pointer" } as const;

export function RelatoriosFinanceiros({ titulos }: { titulos: TituloRelatorio[] }) {
  const competencias = useMemo(() => [...new Set(titulos.map(t => t.competencia).filter(Boolean))].sort(), [titulos]);
  const [inicio, setInicio] = useState(competencias.at(-12) || "");
  const [fim, setFim] = useState(competencias.at(-1) || "");
  const [recebimentoRealista,setRecebimentoRealista]=useState(85);
  const [recebimentoPessimista,setRecebimentoPessimista]=useState(65);
  const filtrados = useMemo(() => titulos.filter(t => (!inicio || t.competencia >= inicio) && (!fim || t.competencia <= fim)), [titulos, inicio, fim]);

  const mensal = useMemo(() => {
    const mapa = new Map<string, { competencia: string; entradas: number; saidas: number; saldo: number; acumulado: number }>();
    filtrados.forEach(t => {
      const x = mapa.get(t.competencia) || { competencia: t.competencia, entradas: 0, saidas: 0, saldo: 0, acumulado: 0 };
      if (t.tipo === "receber") x.entradas += t.valor; else x.saidas += t.valor;
      x.saldo = x.entradas - x.saidas;
      mapa.set(t.competencia, x);
    });
    let acumulado = 0;
    return [...mapa.values()].sort((a,b) => a.competencia.localeCompare(b.competencia)).map(x => ({ ...x, acumulado: acumulado += x.saldo }));
  }, [filtrados]);

  const cenarios=useMemo(()=>{
    let otimista=0,realista=0,pessimista=0;
    return mensal.map(x=>{
      otimista+=x.entradas-x.saidas*.98;
      realista+=x.entradas*(recebimentoRealista/100)-x.saidas;
      pessimista+=x.entradas*(recebimentoPessimista/100)-x.saidas*1.08;
      return{
        competencia:x.competencia,
        otimista:Math.round(otimista*100)/100,
        realista:Math.round(realista*100)/100,
        pessimista:Math.round(pessimista*100)/100,
      };
    });
  },[mensal,recebimentoRealista,recebimentoPessimista]);

  const porCategoria = useMemo(() => {
    const mapa = new Map<string, number>();
    filtrados.filter(t => t.tipo === "pagar").forEach(t => mapa.set(t.categoria || "Sem categoria", (mapa.get(t.categoria || "Sem categoria") || 0) + t.valor));
    return [...mapa].map(([nome, valor]) => ({ nome, valor })).sort((a,b) => b.valor-a.valor).slice(0,8);
  }, [filtrados]);
  const porCentro = useMemo(() => {
    const mapa = new Map<string, number>();
    filtrados.filter(t => t.tipo === "pagar").forEach(t => mapa.set(t.centro_custo || "Sem centro", (mapa.get(t.centro_custo || "Sem centro") || 0) + t.valor));
    return [...mapa].map(([nome, valor]) => ({ nome, valor })).sort((a,b) => b.valor-a.valor).slice(0,10);
  }, [filtrados]);
  const hoje = new Date().toISOString().slice(0,10);
  const entradas = filtrados.filter(t=>t.tipo==="receber").reduce((s,t)=>s+t.valor,0);
  const saidas = filtrados.filter(t=>t.tipo==="pagar").reduce((s,t)=>s+t.valor,0);
  const vencido = filtrados.filter(t=>t.status!=="pago" && t.vencimento && t.vencimento<hoje).reduce((s,t)=>s+t.valor,0);

  const exportarExcel = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(mensal.map(x=>({ Competência:x.competencia,Entradas:x.entradas,Saídas:x.saidas,Saldo:x.saldo,Acumulado:x.acumulado }))), "Resumo mensal");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filtrados.map(t=>({ Competência:t.competencia,Tipo:t.tipo,Descrição:t.descricao,Valor:t.valor,Status:t.status,Vencimento:t.vencimento,Categoria:t.categoria,"Centro de custo":t.centro_custo||"" }))), "Lançamentos");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(porCategoria.map(x=>({Categoria:x.nome,Saídas:x.valor}))), "Categorias");
    XLSX.writeFile(wb, `relatorio-financeiro-${inicio || "inicio"}-${fim || "fim"}.xlsx`);
  };

  const imprimirPdf = () => {
    const janela = window.open("", "_blank", "noopener,noreferrer");
    if (!janela) return alert("Permita pop-ups para gerar o PDF.");
    const max = Math.max(1, ...mensal.flatMap(x=>[x.entradas,x.saidas]));
    const linhas = mensal.map(x=>`<tr><td>${x.competencia}</td><td>${brl(x.entradas)}</td><td>${brl(x.saidas)}</td><td class="${x.saldo<0?"neg":"pos"}">${brl(x.saldo)}</td></tr>`).join("");
    const barras = mensal.map(x=>`<div class="mes"><b>${x.competencia}</b><div class="bars"><i class="in" style="width:${x.entradas/max*100}%"></i><i class="out" style="width:${x.saidas/max*100}%"></i></div><small>${brl(x.entradas)} / ${brl(x.saidas)}</small></div>`).join("");
    janela.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Relatório financeiro</title><style>
      @page{size:A4 landscape;margin:12mm}*{box-sizing:border-box}body{font:12px Arial;color:#172033;margin:0}header{border-bottom:3px solid #65a30d;padding-bottom:12px;margin-bottom:18px}h1{margin:0;font-size:24px}p{color:#64748b}.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.k{border:1px solid #d9f99d;border-radius:10px;padding:12px}.k b{display:block;font-size:17px;margin-top:5px}.chart{margin:18px 0}.mes{display:grid;grid-template-columns:70px 1fr 180px;gap:9px;align-items:center;margin:7px 0}.bars{display:grid;gap:3px}.bars i{height:7px;border-radius:9px}.in{background:#65a30d}.out{background:#dc2626}table{width:100%;border-collapse:collapse}th,td{padding:7px;border-bottom:1px solid #e2e8f0;text-align:right}th:first-child,td:first-child{text-align:left}.pos{color:#3f6212}.neg{color:#dc2626}footer{margin-top:12px;color:#64748b;font-size:10px}
    </style></head><body><header><h1>Relatório financeiro gerencial</h1><p>Período: ${inicio || "início"} a ${fim || "fim"} · gerado em ${new Date().toLocaleString("pt-BR")}</p></header>
    <section class="kpis"><div class="k">Entradas<b>${brl(entradas)}</b></div><div class="k">Saídas<b>${brl(saidas)}</b></div><div class="k">Saldo<b>${brl(entradas-saidas)}</b></div><div class="k">Vencido em aberto<b>${brl(vencido)}</b></div></section>
    <section class="chart"><h2>Entradas e saídas por competência</h2>${barras}</section>
    <table><thead><tr><th>Competência</th><th>Entradas</th><th>Saídas</th><th>Saldo</th></tr></thead><tbody>${linhas}</tbody></table>
    <footer>Documento gerencial emitido pelo UnitSystem. Use a opção “Salvar como PDF” da janela de impressão.</footer>
    <script>window.onload=()=>setTimeout(()=>window.print(),250)<\/script></body></html>`);
    janela.document.close();
  };

  return <div style={{display:"grid",gap:14}}>
    <div style={{...box,display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"}}>
      <div><h3 style={{margin:"0 0 4px"}}>Painel financeiro completo</h3><span style={{fontSize:11,color:"#64748b"}}>Entradas, saídas, saldo, vencidos, categorias e centros de custo.</span></div>
      <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
        <input type="month" value={inicio} onChange={e=>setInicio(e.target.value)} />
        <span style={{fontSize:11}}>até</span><input type="month" value={fim} onChange={e=>setFim(e.target.value)} />
        <button style={btn} onClick={exportarExcel}>Exportar Excel</button>
        <button style={{...btn,background:"#0f172a",borderColor:"#0f172a"}} onClick={imprimirPdf}>PDF / Imprimir</button>
      </div>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:10}}>
      {[["Entradas",entradas,"#3f6212"],["Saídas",saidas,"#dc2626"],["Saldo",entradas-saidas,entradas-saidas>=0?"#166534":"#dc2626"],["Vencido em aberto",vencido,"#b45309"]].map(([l,v,c])=><div key={String(l)} style={box}><small style={{color:"#64748b",fontWeight:800}}>{l}</small><b style={{display:"block",fontSize:21,marginTop:8,color:String(c)}}>{brl(Number(v))}</b></div>)}
    </div>
    <div style={{...box,height:360}}><h3>Entradas, saídas e saldo acumulado</h3><ResponsiveContainer width="100%" height="85%"><AreaChart data={mensal}><defs><linearGradient id="gIn" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#65a30d" stopOpacity={.35}/><stop offset="95%" stopColor="#65a30d" stopOpacity={.02}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/><XAxis dataKey="competencia"/><YAxis tickFormatter={v=>`${Math.round(v/1000)}k`}/><Tooltip formatter={(v:number)=>brl(v)}/><Legend/><Area type="monotone" dataKey="entradas" name="Entradas" stroke="#65a30d" fill="url(#gIn)"/><Bar dataKey="saidas" name="Saídas" fill="#ef4444" radius={[5,5,0,0]}/><Line type="monotone" dataKey="acumulado" name="Saldo acumulado" stroke="#2563eb" strokeWidth={3}/></AreaChart></ResponsiveContainer></div>
    <div style={{...box}}>
      <div style={{display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap",alignItems:"center"}}><div><h3 style={{margin:"0 0 4px"}}>Fluxo projetado por cenario</h3><small style={{color:"#64748b"}}>Otimista: 100% dos recebimentos. Realista e pessimista usam os percentuais configurados abaixo; o pessimista tambem considera 8% de aumento nas saidas.</small></div><div style={{display:"flex",gap:10,flexWrap:"wrap"}}><label style={{fontSize:10,color:"#64748b"}}>Recebimento realista <input type="number" min="0" max="100" value={recebimentoRealista} onChange={e=>setRecebimentoRealista(Math.max(0,Math.min(100,Number(e.target.value)||0)))} style={{width:65,marginLeft:5}}/>%</label><label style={{fontSize:10,color:"#64748b"}}>Recebimento pessimista <input type="number" min="0" max="100" value={recebimentoPessimista} onChange={e=>setRecebimentoPessimista(Math.max(0,Math.min(100,Number(e.target.value)||0)))} style={{width:65,marginLeft:5}}/>%</label></div></div>
      <div style={{height:310,marginTop:14}}><ResponsiveContainer width="100%" height="100%"><AreaChart data={cenarios}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/><XAxis dataKey="competencia"/><YAxis tickFormatter={v=>`${Math.round(v/1000)}k`}/><Tooltip formatter={(v:number)=>brl(v)}/><Legend/>
        <Line type="monotone" dataKey="otimista" name="Otimista" stroke="#65a30d" strokeWidth={3}/><Line type="monotone" dataKey="realista" name="Realista" stroke="#2563eb" strokeWidth={3}/><Line type="monotone" dataKey="pessimista" name="Pessimista" stroke="#dc2626" strokeWidth={3}/>
      </AreaChart></ResponsiveContainer></div>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(360px,1fr))",gap:12}}>
      <div style={{...box,height:340}}><h3>Saídas por categoria</h3><ResponsiveContainer width="100%" height="84%"><PieChart><Pie data={porCategoria} dataKey="valor" nameKey="nome" innerRadius={55} outerRadius={95} label={(p:any)=>p.name}>{porCategoria.map((_,i)=><Cell key={i} fill={cores[i%cores.length]}/>)}</Pie><Tooltip formatter={(v:number)=>brl(v)}/></PieChart></ResponsiveContainer></div>
      <div style={{...box,height:340}}><h3>Saídas por centro de custo</h3><ResponsiveContainer width="100%" height="84%"><BarChart data={porCentro} layout="vertical"><CartesianGrid strokeDasharray="3 3"/><XAxis type="number" tickFormatter={v=>`${Math.round(v/1000)}k`}/><YAxis type="category" dataKey="nome" width={105}/><Tooltip formatter={(v:number)=>brl(v)}/><Bar dataKey="valor" name="Saídas" fill="#65a30d" radius={[0,6,6,0]}/></BarChart></ResponsiveContainer></div>
    </div>
  </div>;
}
