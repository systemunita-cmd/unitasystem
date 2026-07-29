import { NextRequest,NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
export const runtime="nodejs";
export async function POST(req:NextRequest){
 const token=req.headers.get("authorization")?.replace(/^Bearer\s+/i,"");
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!token||!url||!anon)return NextResponse.json({error:"Não autorizado."},{status:401});
 const db=createClient(url,anon,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false}});
 const [{data:user,error:authError},{data:permitido}]=await Promise.all([db.auth.getUser(token),db.rpc("usuario_pode_acessar_financeiro")]);
 if(authError||!user.user||!permitido)return NextResponse.json({error:"Acesso financeiro não autorizado."},{status:403});
 const body=await req.json(),id=String(body.conexao_id||"");
 const {data:cx,error:cxError}=await db.from("fin_conexoes_bancarias").select("*").eq("id",id).eq("ativo",true).single();
 if(cxError||!cx)return NextResponse.json({error:"Conexão bancária não encontrada."},{status:404});
 let endpoint:URL;try{endpoint=new URL(cx.base_url)}catch{return NextResponse.json({error:"URL bancária inválida."},{status:400})}
 if(endpoint.protocol!=="https:")return NextResponse.json({error:"A API bancária deve usar HTTPS."},{status:400});
 const permitidos=String(process.env.OPEN_FINANCE_ALLOWED_HOSTS||"").split(",").map(x=>x.trim().toLowerCase()).filter(Boolean);
 if(!permitidos.includes(endpoint.hostname.toLowerCase()))return NextResponse.json({error:`Host ${endpoint.hostname} não autorizado em OPEN_FINANCE_ALLOWED_HOSTS.`},{status:403});
 const nomeCredencial=String(cx.credencial_env||"");if(!/^OPEN_FINANCE_TOKEN_[A-Z0-9_]+$/.test(nomeCredencial))return NextResponse.json({error:"A credencial deve começar com OPEN_FINANCE_TOKEN_."},{status:400});const segredo=process.env[nomeCredencial];if(!segredo)return NextResponse.json({error:`Credencial ${nomeCredencial} não configurada no servidor.`},{status:503});
 endpoint.searchParams.set("from",String(body.de||new Date(Date.now()-30*86400000).toISOString().slice(0,10)));endpoint.searchParams.set("to",String(body.ate||new Date().toISOString().slice(0,10)));
 const resposta=await fetch(endpoint,{headers:{Authorization:`Bearer ${segredo}`,Accept:"application/json",...(cx.conta?{"X-Account-ID":String(cx.conta)}:{})},cache:"no-store"});
 const json=await resposta.json().catch(()=>({}));if(!resposta.ok)return NextResponse.json({error:json?.message||`Banco respondeu ${resposta.status}.`},{status:502});
 const lista=Array.isArray(json)?json:Array.isArray(json.transactions)?json.transactions:Array.isArray(json.data?.transactions)?json.data.transactions:[];
 const movimentos=lista.map((x:any)=>{const valor=Number(x.amount??x.valor??0);return{conexao_id:id,external_id:String(x.id??x.transactionId??x.fitid??`${x.date||x.data}-${x.description||x.descricao}-${valor}`),data:String(x.date??x.data??x.bookingDate??"").slice(0,10),descricao:String(x.description??x.descricao??x.memo??"Movimento bancário"),documento:String(x.document??x.documento??"")||null,valor:Math.abs(valor),tipo:String(x.type??x.tipo??"").toLowerCase().includes("deb")||valor<0?"debito":"credito",conta_bancaria:cx.nome}}).filter((x:any)=>x.data&&x.valor>=0);
 const ids=movimentos.map((x:any)=>x.external_id);const {data:existentes}=ids.length?await db.from("fin_extratos").select("external_id").eq("conexao_id",id).in("external_id",ids):{data:[] as any[]};const ja=new Set((existentes||[]).map((x:any)=>x.external_id));const novos=movimentos.filter((x:any)=>!ja.has(x.external_id));
 const insercao=novos.length?await db.from("fin_extratos").insert(novos):{error:null};if(insercao.error)return NextResponse.json({error:insercao.error.message},{status:500});
 await db.from("fin_conexoes_bancarias").update({ultima_sincronizacao:new Date().toISOString()}).eq("id",id);
 return NextResponse.json({recebidos:movimentos.length,importados:novos.length,duplicados:movimentos.length-novos.length});
}