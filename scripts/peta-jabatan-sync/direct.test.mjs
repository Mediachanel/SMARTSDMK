import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const context = vm.createContext({});
vm.runInContext(await readFile(new URL('./google-sheets-langsung.js', import.meta.url), 'utf8'), context);
const headers = ['LEVEL','BAGAN JABATAN','KELAS','ATASAN LANGSUNG','RUMPUN JABATAN','B PNS','K PNS','S PNS','B NON PNS','K NON PNS','S NON PNS','UNIT KERJA','JENIS PETA'];
test('direct CSV aggregation separates both groups and keeps subordinate tree', () => {
  const rows = [headers,
    [1,'Kepala Unit',12,'Kepala Dinas','Administrator',1,1,0,0,0,0,'Unit A','UPT'],
    [1,'Kepala Unit',12,'Kepala Dinas','Administrator',1,1,0,0,0,0,'Unit B','UPT'],
    [2,'Analis',8,'Kepala Unit','Fungsional',2,3,-1,5,8,-3,'Unit A','UPT'],
    [2,'Analis',8,'Kepala Unit','Fungsional',4,6,-2,7,9,-2,'Unit B','UPT'],
  ];
  const positions = context.plPositions_(rows);
  assert.equal(positions.length,2);
  assert.equal(positions[1].ASN.b,6);
  assert.equal(positions[1].NON.b,12);
  const tree = context.plTree_(positions);
  assert.equal(tree.length,1);
  assert.equal(tree[0].leaves.length,1);
  const plan = context.plPlan_(positions,'NON','UPT');
  assert.ok(plan.cells.some(cell=>cell.text===12));
  assert.ok(plan.cells.some(cell=>cell.text===-5));
  assert.ok(plan.cells.some(cell=>String(cell.text).startsWith('Non-ASN')));
  for (const cell of plan.cells) { assert.ok(cell.c>=0); assert.ok(cell.c+cell.w<=plan.columns); assert.ok(cell.r+cell.h<=plan.rows); }
});
test('cycles fail before writing',()=> {
  const p = [{id:1,title:'A',boss:'B',family:'Administrator'},{id:2,title:'B',boss:'A',family:'Administrator'}];
  assert.throws(()=>context.plTree_(p),/berputar/);
});
test('matrix selects exact group suffix and retains numeric zero',()=> {
  const values=[['MATRIKS'],['No.','ORB','KL','MENPAN','KL','ATASAN','RUMPUN','U - B ASN','U - K ASN','U - S ASN','U - B NON-ASN','U - K NON-ASN','U - S NON-ASN'],[1,'Analis',8,'Analis',8,'Kepala','Fungsional',2,3,-1,0,5,-5]];
  const plan=context.plMatrix_(values,'NON','UPT');
  assert.equal(plan.columns,10);
  const numbers=plan.cells.filter(cell=>cell.r===4 && cell.c>=7).map(cell=>cell.text);
  assert.equal(JSON.stringify(numbers),'[0,5,-5]');
  assert.ok(context.plRequests_(plan,77).some(r=>r.updateCells?.rows[0].values[0].userEnteredValue.numberValue===0));
});
