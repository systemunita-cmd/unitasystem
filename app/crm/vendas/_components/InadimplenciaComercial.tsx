"use client";
import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
export function InadimplenciaComercial(){
 const [itens,setItens]=useState<any[]>([]);
 useEffect(()=>{supabase.from("fin_inadimplencia").select("id,cliente,vendedor,valor,vencimento,status").neq("status","regularizada").order("vencimento").limit(20).then(({data})=>setItens(data||[]))},[]);
 if(!itens.length)return null;
 const total=itens.reduce((s,x)=>s+Number(x.valor||0),0);
 return <details style={{background:"#fff7ed",border:"1px solid #fdba74",borderRadius:12,padding:"11px 14px",color:"#9a3412"}}><summary style={{cursor:"pointer",fontWeight:800,fontSize:12}}>⚠ Inadimplência ativa: {itens.length} cliente(s) · {total.toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</summary><div style={{marginTop:8,display:"grid",gap:5}}>{itens.map(x=><div key={x.id} style={{fontSize:11,display:"grid",gridTemplateColumns:"1fr 150px 120px"}}><b>{x.cliente}</b><span>{x.vendedor||"Sem vendedor"}</span><span>{Number(x.valor||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</span></div>)}</div></details>
}