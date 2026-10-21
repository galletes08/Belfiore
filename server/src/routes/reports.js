import {Router} from 'express';
import {pool} from '../config/db.js';
import {verifyRequestToken} from '../utils/auth.js';
import {reportFilters,loadReport} from '../utils/reports.js';
import {reportPdf,reportXlsx} from '../utils/reportExports.js';
const router=Router();
router.use('/api/admin/reports',(req,res,next)=>{
  try {if(verifyRequestToken(req).role!=='admin') return res.status(403).json({error:'Admin access only'});res.set('Cache-Control','no-store');next();}
  catch(error){res.status(error.status||401).json({error:error.message});}
});
async function handle(req,res,exporting=false) {
  let client;
  try {
    const filters=reportFilters(req.query);
    const format=String(req.query.format||'');
    if(exporting&&!['pdf','xlsx'].includes(format)) return res.status(400).json({error:'Select PDF or XLSX'});
    client=await pool.connect();
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query("SET LOCAL statement_timeout='30s'");
    const report=await loadReport(client,filters,exporting);
    await client.query('COMMIT');client.release();client=null;
    if(!exporting) return res.json(report);
    const buffer=await (format==='pdf'?reportPdf(report):reportXlsx(report));
    res.set('Content-Type',format==='pdf'?'application/pdf':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.set('Content-Disposition',`attachment; filename="Belfiore-${filters.tab}-${filters.from}-${filters.to}.${format}"`);
    res.send(buffer);
  } catch(error) {
    if(client) await client.query('ROLLBACK').catch(()=>{});
    if(!res.headersSent) res.status(error.status||500).json({error:error.status===400?error.message:'Unable to generate report. Please retry.'});
  } finally {client?.release();}
}
router.get('/api/admin/reports',(req,res)=>handle(req,res));
router.get('/api/admin/reports/export',(req,res)=>handle(req,res,true));
export default router;
