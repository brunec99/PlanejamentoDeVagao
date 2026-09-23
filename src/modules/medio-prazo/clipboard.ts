/** TSV com aspas compatível com células multilinha de planilhas. */
export function encodeGrid(values: string[][]): string {
  return values.map(row=>row.map(cell=>/[\t\n\r"]/.test(cell)?`"${cell.replace(/"/g,'""')}"`:cell).join('\t')).join('\n');
}
export function decodeGrid(text: string, limit=1000): string[][] {
  if(text.length>1_000_000)throw new Error('Colagem excede o limite de texto.');
  const rows:string[][]=[[]];let value='',quoted=false,closed=false,count=0;
  const cell=()=>{rows.at(-1)!.push(value);value='';closed=false;if(++count>limit)throw new Error(`Limite de ${limit} células por operação.`);};
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(quoted){if(c==='"'){if(text[i+1]==='"'){value+='"';i++;}else{quoted=false;closed=true;}}else value+=c;continue;}
    if(c==='"'&&!value&&!closed){quoted=true;continue;}
    if(c==='\t'){cell();continue;}
    if(c==='\r'||c==='\n'){if(c==='\r'&&text[i+1]==='\n')i++;cell();if(i<text.length-1)rows.push([]);continue;}
    if(closed)throw new Error('Texto inválido após fechamento de aspas.');
    value+=c;
  }
  if(quoted)throw new Error('Colagem contém aspas não fechadas.');
  if(value||closed||!/[\r\n]$/.test(text))cell();
  if(rows.some(row=>row.length!==rows[0].length))throw new Error('Selecione um intervalo retangular.');
  return rows;
}
