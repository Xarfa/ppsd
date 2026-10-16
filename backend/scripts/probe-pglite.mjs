import { PGlite } from '@electric-sql/pglite';

const candidates = [
  ['C: no space', 'C:/Users/22345/AppData/Local/Temp/pglite-x1'],
  ['C: with space', 'C:/Users/22345/AppData/Local/Temp/pg lite x2'],
  ['E: no space', 'E:/pglite-x3'],
  ['E: with space', 'E:/pglite x4'],
];

for (const [label, dir] of candidates) {
  try {
    const db = await PGlite.create({ dataDir: dir });
    await db.exec('create table if not exists t(a int); insert into t values (7);');
    const r = await db.query('select * from t');
    console.log('OK  ', label.padEnd(14), dir, '->', JSON.stringify(r.rows));
    await db.close();
  } catch (e) {
    console.log('FAIL', label.padEnd(14), dir, '|', e.name, 'errno=', e.errno);
  }
}
