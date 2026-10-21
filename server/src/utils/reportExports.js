import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';

export const pht = value => value ? new Date(value).toLocaleString('en-PH',{timeZone:'Asia/Manila',year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:true})+' PHT' : 'Unavailable';
const metrics = r => [['Total Sales (PHP)',r.summary.sales],['Orders created',r.summary.orders],['Current available plants',r.summary.plants],['Current available 400g packs',r.summary.packs],['Recorded completed deliveries',r.summary.completed],['Undated delivered orders in creation cohort',r.summary.undated_deliveries]];
function exportTables(r) {
  const tables=[...r.tables];
  if(r.series.length) tables.unshift({title:'Sales performance',columns:[{key:'date',label:'Period'},{key:'revenue',label:'Revenue (PHP)',type:'money'}],rows:r.series});
  if(r.breakdowns.length) tables.unshift({title:'Current status breakdown',columns:[{key:'label',label:'Status / method'},{key:'count',label:'Orders',type:'number'}],rows:r.breakdowns});
  if(r.carriers) tables.push({title:'Riders and couriers',columns:[{key:'carrier',label:'Rider / courier'},{key:'assigned',label:'Assigned orders',type:'number'},{key:'completed',label:'Currently delivered',type:'number'}],rows:r.carriers});
  return tables;
}
export async function reportXlsx(r) {
  const book=new ExcelJS.Workbook(); book.creator='Belfiore'; book.created=new Date(r.generatedAt);
  const overview=book.addWorksheet('Report summary');
  overview.columns=[{header:'Metric / definition',key:'metric',width:65},{header:'Value',key:'value',width:35}];
  overview.addRow(['Belfiore Succulents and Farms',r.tab.toUpperCase()]);
  overview.addRow(['Period (Asia/Manila)',r.period.from+' through '+r.period.to]);
  // Excel has no timezone; store actual numeric date cells as Manila wall time, explicitly labelled.
  overview.addRow(['Generated (PHT)',new Date(new Date(r.generatedAt).getTime()+8*3600000)]).getCell(2).numFmt='yyyy-mm-dd hh:mm';
  for(const row of metrics(r)) overview.addRow(row);
  overview.getCell('B5').numFmt='"PHP" #,##0.00';
  overview.addRow(['Gross sales before discounts','Unavailable']);
  overview.addRow(['Net eligible sales (PHP)',r.summary.sales]).getCell(2).numFmt='"PHP" #,##0.00';
  overview.addRow(['Valid sales transactions',r.summary.transactions]);
  overview.addRow(['Separate discounts / refund amounts','Unavailable']);
  if(r.deliverySummary) for(const [k,v] of Object.entries(r.deliverySummary)) overview.addRow(['Shipment cohort: '+k,v]);
  for(const note of r.notes) overview.addRow([note]).getCell(1).alignment={wrapText:true,vertical:'top'};
  for(const t of exportTables(r)) {
    const sheet=book.addWorksheet(t.title.replace(/[\\/*?:[\]]/g,'').slice(0,31));
    sheet.columns=t.columns.map(c=>({header:c.label,key:c.key,width:c.type==='date'?25:c.type==='money'?20:Math.min(45,Math.max(18,c.label.length+3))}));
    for(const row of t.rows) sheet.addRow(Object.fromEntries(t.columns.map(c=>[c.key,c.type==='date'?(row[c.key]?new Date(new Date(row[c.key]).getTime()+8*3600000):null):row[c.key]])));
    for(const c of t.columns) if(c.type==='money'||c.type==='date') sheet.getColumn(c.key).numFmt=c.type==='money'?'"PHP" #,##0.00':'yyyy-mm-dd hh:mm';
    sheet.autoFilter={from:{row:1,column:1},to:{row:Math.max(1,t.rows.length+1),column:t.columns.length}};
    sheet.views=[{state:'frozen',ySplit:1}];
    if(!t.rows.length) sheet.addRow(['No records found for the selected period.']);
  }
  for(const sheet of book.worksheets) {
    sheet.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};
    sheet.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF14553D'}};
    sheet.eachRow(row=>{row.alignment={vertical:'top',wrapText:true};});
    sheet.pageSetup={paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0};
  }
  return Buffer.from(await book.xlsx.writeBuffer());
}

export async function reportPdf(r) {
  const doc=new PDFDocument({size:'A4',layout:'landscape',margin:34,bufferPages:true});
  const chunks=[];
  const done=new Promise((resolve,reject)=>{doc.on('data',chunk=>chunks.push(chunk));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);});
  const width=doc.page.width-68, bottom=doc.page.height-48;
  function room(h) { if(doc.y+h>bottom) doc.addPage(); }
  function text(value,size=9) {doc.fontSize(size).fillColor('#172b3a').text(value,{width,lineGap:3});}
  doc.font('Helvetica-Bold').fillColor('#14553d').fontSize(19).text('Belfiore Succulents and Farms');
  text(r.tab.toUpperCase()+' REPORT',14);
  text(`Period: ${r.period.from} through ${r.period.to} (Asia/Manila) | Generated: ${pht(r.generatedAt)}`);
  doc.moveDown();
  for(const [label,value] of metrics(r)) text(`${label}: ${typeof value==='number'?value.toLocaleString('en-PH',{maximumFractionDigits:2}):value}`);
  text(`Net eligible sales: PHP ${Number(r.summary.sales).toFixed(2)} | Valid transactions: ${r.summary.transactions} | Pre-discount gross / separate discount / refund amounts: unavailable`);
  for(const t of exportTables(r)) {
    room(70); doc.moveDown(); doc.font('Helvetica-Bold');text(t.title,12); doc.moveDown(.3);
    const weights=t.columns.map(c=>c.key==='codes'||c.key==='beginning'||c.key==='ending'||c.key==='fulfilled'?2:c.type==='number'?0.8:1.3);
    const sum=weights.reduce((a,b)=>a+b,0); const widths=weights.map(w=>width*w/sum);
    function row(values,header=false) {
      doc.font(header?'Helvetica-Bold':'Helvetica').fontSize(8);
      const strings=values.map(v=>String(v??'Unavailable'));
      const h=Math.max(...strings.map((v,i)=>doc.heightOfString(v,{width:widths[i]-10})))+12;
      // Normal rows stay together. Exceptionally long code lists continue on subsequent pages.
      if(h>bottom-90) {
        const pieces=strings.map(s=>s.match(/.{1,90}(?:\s|$)|.{1,90}/g)||['']);
        const count=Math.max(...pieces.map(p=>p.length));
        for(let start=0;start<count;start+=3) row(pieces.map(p=>p.slice(start,start+3).join('')),header);
        return;
      }
      if(doc.y+h>bottom) {doc.addPage(); if(!header) row(t.columns.map(c=>c.label),true);}
      const y=doc.y; let x=34;
      if(header) doc.rect(34,y,width,h).fill('#e8f4ee');
      strings.forEach((v,i)=>{doc.fillColor('#172b3a').text(v,x+5,y+6,{width:widths[i]-10});x+=widths[i];});
      doc.moveTo(34,y+h).lineTo(34+width,y+h).strokeColor('#dce5df').stroke();doc.y=y+h;
    }
    row(t.columns.map(c=>c.label),true);
    if(!t.rows.length) {room(30);text('No records found for the selected period.');}
    for(const record of t.rows) row(t.columns.map(c=>c.type==='date'?pht(record[c.key]):c.type==='money'?Number(record[c.key]).toLocaleString('en-PH',{minimumFractionDigits:2}):record[c.key]));
  }
  room(50);doc.moveDown();doc.font('Helvetica-Bold');text('Report definitions and limitations',11);doc.font('Helvetica');
  for(const note of r.notes) {room(doc.heightOfString(note,{width})+20);text(note);doc.moveDown(.4);}
  const range=doc.bufferedPageRange();
  for(let i=0;i<range.count;i++) {doc.switchToPage(i);doc.fontSize(8).fillColor('#64748b').text(`Belfiore | ${r.period.from} - ${r.period.to} | Page ${i+1} of ${range.count}`,34,doc.page.height-30,{lineBreak:false,width});}
  doc.end();return done;
}
