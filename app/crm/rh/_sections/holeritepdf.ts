export type HoleriteParaPdf = {
  nome: string;
  cargo: string;
  competencia: string;
  proventos: { rotulo: string; valor: number }[];
  descontos: { rotulo: string; valor: number }[];
  informacoes?: Record<string, any>;
};

const moeda = (valor: number) =>
  Number(valor || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const meses = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function competenciaExtenso(competencia: string) {
  const [ano, mes] = competencia.split("-");
  return `${meses[Number(mes) - 1] || mes} de ${ano}`;
}

function limparTexto(texto: string, limite = 70) {
  return String(texto || "")
    .replace(/[–—]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .slice(0, limite);
}

function escaparPdf(texto: string) {
  return limparTexto(texto, 240)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function texto(font: "F1" | "F2", tamanho: number, x: number, y: number, valor: string, cor = "0.12 0.16 0.23") {
  return `${cor} rg BT /${font} ${tamanho} Tf 1 0 0 1 ${x} ${y} Tm (${escaparPdf(valor)}) Tj ET\n`;
}

function textoDireita(font: "F1" | "F2", tamanho: number, direita: number, y: number, valor: string, cor?: string) {
  const largura = limparTexto(valor).length * tamanho * 0.49;
  return texto(font, tamanho, Math.max(40, direita - largura), y, valor, cor);
}

function paginaHolerite(h: HoleriteParaPdf, pagina: number, totalPaginas: number) {
  const proventosOriginais = h.proventos || [];
  const descontosOriginais = h.descontos || [];
  const resumir = (linhas: { rotulo: string; valor: number }[]) => linhas.length <= 10 ? linhas : [
    ...linhas.slice(0, 9),
    { rotulo: "Outros lançamentos", valor: linhas.slice(9).reduce((s, item) => s + Number(item.valor || 0), 0) },
  ];
  const proventos = resumir(proventosOriginais);
  const descontos = resumir(descontosOriginais);
  const totalProventos = proventosOriginais.reduce((s, item) => s + Number(item.valor || 0), 0);
  const totalDescontos = descontosOriginais.reduce((s, item) => s + Number(item.valor || 0), 0);
  const liquido = totalProventos - totalDescontos;
  let c = "";

  c += "0.45 0.42 0.94 RG 1.4 w 36 36 523 770 re S\n";
  c += "0.96 0.96 1 rg 36 742 523 64 re f\n";
  c += texto("F2", 19, 52, 779, "UNITA", "0.31 0.27 0.90");
  c += texto("F2", 12, 52, 759, "DEMONSTRATIVO DE PAGAMENTO");
  c += textoDireita("F2", 11, 542, 779, competenciaExtenso(h.competencia));
  c += textoDireita("F1", 8, 542, 760, `Página ${pagina} de ${totalPaginas}`, "0.39 0.45 0.55");

  c += texto("F1", 8, 52, 718, "COLABORADOR", "0.39 0.45 0.55");
  c += texto("F2", 12, 52, 701, limparTexto(h.nome, 55));
  c += texto("F1", 8, 330, 718, "CARGO", "0.39 0.45 0.55");
  c += texto("F2", 10, 330, 701, limparTexto(h.cargo || "Não informado", 32));
  c += "0.88 0.90 0.94 RG 0.7 w 52 686 m 542 686 l S\n";

  c += "0.93 0.99 0.95 rg 52 651 235 25 re f\n";
  c += "1 0.95 0.95 rg 307 651 235 25 re f\n";
  c += texto("F2", 9, 62, 660, "PROVENTOS", "0.08 0.55 0.30");
  c += texto("F2", 9, 317, 660, "DESCONTOS", "0.75 0.12 0.18");

  const linhas = Math.max(proventos.length, descontos.length, 1);
  let y = 630;
  for (let i = 0; i < linhas && i < 16; i += 1) {
    const p = proventos[i];
    const d = descontos[i];
    if (p) {
      c += texto("F1", 9, 62, y, limparTexto(p.rotulo, 27));
      c += textoDireita("F2", 9, 277, y, `R$ ${moeda(p.valor)}`, "0.08 0.55 0.30");
    }
    if (d) {
      c += texto("F1", 9, 317, y, limparTexto(d.rotulo, 27));
      c += textoDireita("F2", 9, 532, y, `R$ ${moeda(d.valor)}`, "0.75 0.12 0.18");
    }
    c += `0.92 0.93 0.95 RG 0.4 w 52 ${y - 8} m 287 ${y - 8} l S\n`;
    c += `0.92 0.93 0.95 RG 0.4 w 307 ${y - 8} m 542 ${y - 8} l S\n`;
    y -= 25;
  }

  const totalY = Math.min(y - 8, 400);
  c += `0.96 0.97 0.98 rg 52 ${totalY} 490 42 re f\n`;
  c += texto("F1", 8, 63, totalY + 26, "TOTAL DE PROVENTOS", "0.39 0.45 0.55");
  c += texto("F2", 11, 63, totalY + 10, `R$ ${moeda(totalProventos)}`, "0.08 0.55 0.30");
  c += texto("F1", 8, 220, totalY + 26, "TOTAL DE DESCONTOS", "0.39 0.45 0.55");
  c += texto("F2", 11, 220, totalY + 10, `R$ ${moeda(totalDescontos)}`, "0.75 0.12 0.18");
  c += texto("F1", 8, 390, totalY + 26, "LÍQUIDO A RECEBER", "0.39 0.45 0.55");
  c += texto("F2", 12, 390, totalY + 10, `R$ ${moeda(liquido)}`, "0.31 0.27 0.90");

  const info = h.informacoes || {};
  c += "0.96 0.97 0.98 rg 52 310 490 54 re f\n";
  c += texto("F1", 7.5, 62, 346, `SALÁRIO BRUTO R$ ${moeda(info.salario_bruto || 0)}   |   BASE INSS R$ ${moeda(info.base_inss || 0)}   |   INSS NO QUADRO DE DESCONTOS`, "0.30 0.35 0.43");
  c += texto("F1", 7.5, 62, 332, `BASE FGTS R$ ${moeda(info.base_fgts || 0)}   |   FGTS DO MÊS R$ ${moeda(info.fgts || 0)} (DEPÓSITO DA EMPRESA)`, "0.30 0.35 0.43");
  c += texto("F1", 7.5, 62, 318, `BANCO: ${Math.round(Number(info.horas_trabalhadas_min || 0)/60*100)/100}h TRABALHADAS / ${Math.round(Number(info.horas_previstas_min || 0)/60*100)/100}h VENCIDAS | BENEFÍCIOS REDUZIDOS R$ ${moeda(info.desconto_beneficios || 0)}`, "0.30 0.35 0.43");

  c += texto("F1", 8.5, 52, 280, "Declaro ter recebido o valor líquido indicado neste demonstrativo, referente à competência acima,");
  c += texto("F1", 8.5, 52, 266, "dando plena quitação dos valores discriminados neste documento.");
  c += texto("F1", 8.5, 52, 235, "Data: ______ / ______ / __________");

  c += "0.35 0.39 0.47 RG 0.7 w 52 150 m 270 150 l S\n";
  c += "0.35 0.39 0.47 RG 0.7 w 324 150 m 542 150 l S\n";
  c += texto("F2", 8, 52, 135, "ASSINATURA DO COLABORADOR", "0.39 0.45 0.55");
  c += texto("F1", 8, 52, 120, limparTexto(h.nome, 40));
  c += texto("F2", 8, 324, 135, "ASSINATURA DA EMPRESA", "0.39 0.45 0.55");
  c += texto("F1", 8, 324, 120, "UNITA");
  c += texto("F1", 7, 52, 62, "Documento gerado pelo UnitaSystem.", "0.55 0.60 0.68");
  return c;
}

export function criarPdfHolerites(holerites: HoleriteParaPdf[]) {
  if (!holerites.length) throw new Error("Nenhum holerite selecionado.");
  const objetos: string[] = [""];
  objetos[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objetos[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objetos[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
  const paginas: number[] = [];

  holerites.forEach((holerite, indice) => {
    const conteudoId = 5 + indice * 2;
    const paginaId = conteudoId + 1;
    const conteudo = paginaHolerite(holerite, indice + 1, holerites.length);
    objetos[conteudoId] = `<< /Length ${conteudo.length} >>\nstream\n${conteudo}endstream`;
    objetos[paginaId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${conteudoId} 0 R >>`;
    paginas.push(paginaId);
  });
  objetos[2] = `<< /Type /Pages /Kids [${paginas.map((id) => `${id} 0 R`).join(" ")}] /Count ${paginas.length} >>`;

  let pdf = "%PDF-1.4\n%âãÏÓ\n";
  const offsets = [0];
  for (let i = 1; i < objetos.length; i += 1) {
    offsets[i] = pdf.length;
    pdf += `${i} 0 obj\n${objetos[i]}\nendobj\n`;
  }
  const xref = pdf.length;
  pdf += `xref\n0 ${objetos.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objetos.length; i += 1) pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objetos.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;

  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i += 1) bytes[i] = pdf.charCodeAt(i) & 0xff;
  return new Blob([bytes], { type: "application/pdf" });
}

function nomeSeguro(texto: string) {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9_-]+/g, "-");
}

export function baixarPdfHolerites(holerites: HoleriteParaPdf[], nome?: string) {
  const blob = criarPdfHolerites(holerites);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nome || `holerites-${nomeSeguro(holerites[0]?.competencia || "folha")}.pdf`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export function imprimirPdfHolerites(holerites: HoleriteParaPdf[]) {
  const blob = criarPdfHolerites(holerites);
  const url = URL.createObjectURL(blob);
  const janela = window.open(url, "_blank");
  if (!janela) {
    baixarPdfHolerites(holerites);
    alert("O navegador bloqueou a janela de impressão. O PDF foi baixado para você imprimir.");
    URL.revokeObjectURL(url);
    return;
  }
  janela.addEventListener("load", () => setTimeout(() => janela.print(), 700), { once: true });
  setTimeout(() => URL.revokeObjectURL(url), 120000);
}