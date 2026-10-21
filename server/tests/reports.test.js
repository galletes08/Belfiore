import test from 'node:test';
import assert from 'node:assert/strict';
import {reportFilters} from '../src/utils/reports.js';
test('Report presets respect Philippine midnight, month/year transitions and leap dates',()=>{
  const now=new Date('2026-12-31T16:00:00Z');
  assert.equal(reportFilters({preset:'today'},now).from,'2027-01-01');
  assert.equal(reportFilters({preset:'week'},now).from,'2026-12-26');
  assert.equal(reportFilters({preset:'lastMonth'},now).from,'2026-12-01');
  assert.equal(reportFilters({preset:'lastMonth'},now).to,'2026-12-31');
  assert.equal(reportFilters({preset:'year'},now).from,'2027-01-01');
  assert.equal(reportFilters({preset:'custom',fromDate:'2024-02-29',toDate:'2024-02-29'},now).from,'2024-02-29');
  assert.throws(()=>reportFilters({preset:'custom',fromDate:'2026-02-29',toDate:'2026-03-01'}));
});
