/**
 * 导出「单文件演示版」所需的全部数据。
 *
 * 用法：cd backend && node scripts/dump-demo-data.mjs
 * 前提：本地数据库已灌好（pg 或 pglite 均可），或临时改 .env。
 * 输出：../src/demo/demo-data.json（约 45MB，随后会被压缩内嵌）
 *
 * 数据裁剪原则：
 *   - 8 个物种的位点元数据 / 序列 / phasiRNA：全量
 *   - initiator（osa/gma）：全量
 *   - 靶基因：只保留"每个 phasiRNA 的聚合信息"（位点表格需要），
 *     外加演示位点 OsaPHAS10g4348527 的全部明细行（详情页需要）
 */
import fs from 'node:fs';
import path from 'node:path';
import { query } from '../src/db/index.js';

const OUT = path.resolve(import.meta.dirname, '..', '..', 'src', 'demo', 'demo-data.json');

const D = {
  species: [],
  totals: null,
  atlas: null,
  tree: null,
  loci: [],
  sequences: {},
  phasiRna: [],
  targetAgg: [],
  targetsDemo: [],
  initiators: [],
};

console.log('[1/7] species …');
D.species = (await query(`
  SELECT s.abbr, s.scientific_name, s.common_name, s.common_name_en,
         (SELECT count(*)::int FROM clusters  c WHERE c.species = s.abbr) AS phas_loci,
         (SELECT count(*)::int FROM phasi_rna p WHERE p.species = s.abbr) AS phasi_rna,
         (SELECT count(*)::int FROM clusters c WHERE c.species = s.abbr AND c.target_verified    = 'yes') AS loci_target_verified,
         (SELECT count(*)::int FROM clusters c WHERE c.species = s.abbr AND c.initiator_verified = 'yes') AS loci_initiator_verified
  FROM species s ORDER BY phas_loci DESC
`)).rows;

console.log('[2/7] totals …');
D.totals = (await query(`
  SELECT
    (SELECT count(*)::int FROM species)          AS species_count,
    (SELECT count(*)::int FROM clusters)         AS phas_loci,
    (SELECT count(*)::int FROM phasi_rna)        AS phasi_rna,
    (SELECT count(*)::int FROM phasi_rna_target) AS phasi_rna_target,
    (SELECT count(*)::int FROM initiator)        AS initiator,
    (SELECT count(*)::int FROM clusters WHERE initiator_verified = 'yes') AS initiator_verified,
    (SELECT count(*)::int FROM clusters WHERE target_verified    = 'yes') AS target_verified
`)).rows[0];

console.log('[3/7] loci …');
D.loci = (await query(`
  SELECT c.*, s.common_name, s.common_name_en, s.scientific_name, ph.length AS seq_length
  FROM clusters c
  JOIN species s ON s.abbr = c.species
  LEFT JOIN phas_seq ph ON ph.phas_loci = c.phas_loci
`)).rows;

console.log('[4/7] sequences …');
for (const r of (await query('SELECT phas_loci, sequence FROM phas_seq')).rows) {
  D.sequences[r.phas_loci] = r.sequence;
}

console.log('[5/7] phasiRNA …');
D.phasiRna = (await query(`
  SELECT p.phasi_rna, p.species, p.parent_locus, p.sequence, p.length,
         s.common_name, s.common_name_en, s.scientific_name,
         c.locus_gene, c.transcript, c.annotation
  FROM phasi_rna p
  JOIN species s ON s.abbr = p.species
  LEFT JOIN clusters c ON c.phas_loci = p.parent_locus
`)).rows;

console.log('[6/7] target aggregates …');
D.targetAgg = (await query(`
  SELECT t.phasi_rna,
         min(t.start_in_transcript)  AS start_in_transcript,
         max(t.end_in_transcript)    AS end_in_transcript,
         max(t.strand)               AS strand,
         max(t.verified_target_num)  AS verified_target_num,
         count(DISTINCT t.verified_target)::int AS target_count,
         bool_or(t.t_verified = 'yes')          AS target_verified
  FROM phasi_rna_target t
  GROUP BY t.phasi_rna
`)).rows;

console.log('[7/7] initiators + demo targets …');
D.initiators = (await query(`
  SELECT i.id, i.species, i.phas_gene, i.mirna, i.geneid, i.cleavege_site,
         i.target_pos_end, i.posmax_min, i.distance, i.initiator_seq,
         i.initiator_len, i.verified,
         s.common_name, s.common_name_en, s.scientific_name
  FROM initiator i
  JOIN species s ON s.abbr = i.species
`)).rows;

D.targetsDemo = (await query(`
  SELECT * FROM phasi_rna_target
  WHERE phasi_rna LIKE 'OsaPHAS10g4348527.1@21%23%'
     OR phasi_rna LIKE 'OsaPHAS10g4348527.1@21#%'
     OR phasi_rna LIKE 'GmaPHAS19gIntergenic.%'
`)).rows;

// atlas 聚合直接复用后端逻辑太绕，这里独立算一份
console.log('[extra] atlas aggregates …');
const one = async (sql) => (await query(sql)).rows;
D.atlas = {
  bySpecies: D.species.map((s) => ({
    abbr: s.abbr, scientific_name: s.scientific_name, common_name: s.common_name, common_name_en: s.common_name_en,
    phas_loci: s.phas_loci, phasi_rna: s.phasi_rna,
    targets: D.targetAgg.length ? undefined : 0,
    initiators: undefined,
  })),
};

// bySpecies 的 targets / initiators 精确统计
const tCounts = {};
for (const r of (await query('SELECT species, count(*)::int AS n FROM phasi_rna_target GROUP BY 1')).rows) tCounts[r.species] = r.n;
const iCounts = {};
for (const r of (await query('SELECT species, count(*)::int AS n FROM initiator GROUP BY 1')).rows) iCounts[r.species] = r.n;
for (const s of D.atlas.bySpecies) {
  s.targets = tCounts[s.abbr] || 0;
  s.initiators = iCounts[s.abbr] || 0;
}

D.atlas.heatmap = await one(`SELECT species, chromosome, count(*)::int AS n FROM clusters GROUP BY 1, 2`);
D.atlas.geneType = await one(`SELECT species, phas_gene_type AS type, count(*)::int AS n FROM clusters WHERE phas_gene_type IS NOT NULL AND phas_gene_type <> '' GROUP BY 1, 2`);
D.atlas.families = await one(`SELECT mirna, species, count(*)::int AS n FROM initiator WHERE mirna IS NOT NULL AND mirna <> '' GROUP BY 1, 2 ORDER BY n DESC LIMIT 12`);
D.atlas.targetCategory = await one(`SELECT coalesce(nullif(category, ''), 'Unknown') AS category, count(*)::int AS n FROM phasi_rna_target GROUP BY 1 ORDER BY n DESC`);
D.atlas.initiatorCategory = await one(`SELECT coalesce(nullif(category, ''), 'Unknown') AS category, count(*)::int AS n FROM initiator GROUP BY 1 ORDER BY n DESC`);
D.atlas.lengthHist = await one(`SELECT least((length / 1000) * 1000, 8000)::int AS bin, count(*)::int AS n FROM phas_seq WHERE length IS NOT NULL GROUP BY 1 ORDER BY 1`);
D.atlas.yieldHist = await one(`
  SELECT CASE WHEN n >= 50 THEN '>50' WHEN n >= 21 THEN '21-50' WHEN n >= 11 THEN '11-20'
              WHEN n >= 6 THEN '6-10' WHEN n >= 2 THEN '2-5' ELSE '1' END AS bucket,
         count(*)::int AS n
  FROM (SELECT count(*) AS n FROM phasi_rna GROUP BY parent_locus) t GROUP BY 1`);
const scatRows = await one(`SELECT species, pvalue, phase_score FROM (SELECT species, pvalue, phase_score, random() AS rnd FROM clusters WHERE pvalue IS NOT NULL AND phase_score IS NOT NULL) s ORDER BY rnd LIMIT 2000`);
D.atlas.scatter = scatRows.map((r) => ({ species: r.species, pvalue: Number(r.pvalue), phase_score: Number(r.phase_score) }));
D.atlas.methods = await one(`SELECT method_ref AS method, count(*)::int AS n FROM clusters WHERE method_ref IS NOT NULL AND method_ref <> '' GROUP BY 1 ORDER BY n DESC LIMIT 8`);

console.log('writing', OUT);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(D));
const mb = (fs.statSync(OUT).size / 1048576).toFixed(1);
console.log(`done: ${mb} MB`);
