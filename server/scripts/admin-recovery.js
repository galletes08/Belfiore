import readline from 'node:readline/promises';
import {pool} from '../src/config/db.js';
import {issueOfflineAdminReset} from '../src/utils/offlineAdminRecovery.js';

let input,c;
try {
  if(process.argv.slice(2).join(' ')!=='--issue-reset-link'||!process.stdin.isTTY||!process.stdout.isTTY)
    throw new Error('Run interactively on the trusted server: node scripts/admin-recovery.js --issue-reset-link. Do not redirect or record this terminal.');
  input=readline.createInterface({input:process.stdin,output:process.stdout});
  console.log('Host/database operator recovery only. Verify the existing Administrator through your approved ownership procedure before continuing. No email will be sent.');
  const email=await input.question('Verified registered Administrator email: ');
  const reference=await input.question('Internal verification reference (no identity document numbers): ');
  const reason=await input.question('Recovery reason: ');
  const confirmation=await input.question('Type ISSUE RESET LINK to confirm verified recovery: ');
  c=await pool.connect();await c.query('BEGIN');
  const url=await issueOfflineAdminReset(c,{email,reference,reason,confirmed:confirmation==='ISSUE RESET LINK'});
  await c.query('COMMIT');
  console.log('One-time sensitive link (15 minutes). Deliver only to the verified Administrator using the approved secure channel; do not paste it in logs or tickets.');
  console.log(url);
}catch(error){if(c)await c.query('ROLLBACK').catch(()=>{});console.error(error.message);process.exitCode=1;}
finally{input?.close();c?.release();await pool.end();}
