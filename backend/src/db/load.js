/**
 * 把 ../data 里的真实 PPSD 数据灌进数据库。
 *
 * 用法：
 *   npm run db:load      # 建表 + 灌数据（已有表会先删掉重建）
 *   npm run db:reset     # 同上，另外把 pglite 数据目录整个清空
 *
 * 数据来源（都在 ../data 下，列定义见 ../data/README.md）：
 *   derived/pha_loci_all_species.tsv    8 物种 PHAS loci    7760 行
 *   derived/phas_locus_seq_all_species.fa                    7760 条序列
 *   derived/phasi_rna_seq_all_species.tsv                    104166 条
 *   raw/{osa,gma}_database_initiator.txt                     phase initiator
 *   raw/{osa,gma}_database_phasiRNA.txt                      phasiRNA + 靶基因
 *   scraped/initiator_scraped.tsv                           其余 6 物种的 initiator
 *                                                            （抓取自老站公开页面，见 data/scraped/）
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { exec, query, closeDb, getServerVersion } from './index.js';
import { paths, config } from '../config.js';

const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);

// ---------------------------------------------------------------------------
// 工具
// ---------------------------------------------------------------------------

/** 把 '-'、''、'NA' 之类的占位符统一变成 null，数字列尤其重要 */
const clean = (v) => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (s === '' || s === '-' || s === 'NA' || s === 'N/A') return null;
  return s;
};
const num = (v) => {
  const s = clean(v);
  if (s === null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/**
 * Strand 列要特殊处理：它的取值是 '+' 和 '-'，这里的 '-' 表示**负链**，
 * 是一个真实取值，不是缺失占位符 —— 原站 phasiRNA 详情页也会显示 "-"。
 * 所以不能走通用的 clean()，否则负链的 phasiRNA 会全部变成空值。
 */
const strandOf = (v) => {
  const s = String(v ?? '').trim();
  return s === '+' || s === '-' ? s : null;
};

/** 按行读 TSV，跳过表头，逐行回调（大文件不能一次性读进内存） */
async function readTsv(file, onRow, { keepHeader = false } = {}) {
  const rl = readline.createInterface({
    input: fs.createReadStream(file, { encoding: 'utf-8' }),
    crlfDelay: Infinity,
  });
  let header = null;
  let n = 0;
  for await (const line of rl) {
    if (line.trim() === '') continue;
    const cols = line.split('\t');
    if (header === null) {
      header = cols;
      if (keepHeader) onRow(cols);
      continue;
    }
    onRow(cols, header);
    n++;
  }
  return n;
}

/**
 * 批量 INSERT。
 * PostgreSQL 单个语句最多 65535 个参数，所以按列数反推每批行数。
 */
async function batchInsert(table, columns, rows, { chunkRows } = {}) {
  if (rows.length === 0) return 0;
  const nCols = columns.length;
  const maxPerStmt = chunkRows || Math.max(1, Math.floor(60000 / nCols));
  let done = 0;
  for (let i = 0; i < rows.length; i += maxPerStmt) {
    const slice = rows.slice(i, i + maxPerStmt);
    const values = [];
    const placeholders = slice.map((row, ri) => {
      const ph = row.map((_, ci) => `$${ri * nCols + ci + 1}`);
      values.push(...row);
      return `(${ph.join(',')})`;
    });
    await query(
      `INSERT INTO ${table} (${columns.join(',')}) VALUES ${placeholders.join(',')} ON CONFLICT DO NOTHING`,
      values,
    );
    done += slice.length;
    if (rows.length > 20000) process.stdout.write(`\r    ${table}: ${done}/${rows.length}`);
  }
  if (rows.length > 20000) process.stdout.write('\n');
  return done;
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

/**
 * 物种清单：[数据文件名前缀, 缩写, 学名, 中文名, 英文名]
 * 中英文名都要存 —— 前端有语言切换，英文界面显示 common_name_en。
 */
const SPECIES = [
  ['oryza_sativa',         'osa', 'Oryza sativa',          '水稻',   'Rice'],
  ['glycine_max',          'gma', 'Glycine max',           '大豆',   'Soybean'],
  ['zea_mays',             'zma', 'Zea mays',              '玉米',   'Maize'],
  ['arabidopsis_thaliana', 'ath', 'Arabidopsis thaliana',  '拟南芥', 'Arabidopsis'],
  ['vitis_vinifera',       'vvi', 'Vitis vinifera',        '葡萄',   'Grape'],
  ['brassica_napus',       'bna', 'Brassica napus',        '油菜',   'Rapeseed'],
  ['citrus_sinensis',      'csi', 'Citrus sinensis',       '柑橘',   'Orange'],
  ['gossypium_hirsutum',   'ghi', 'Gossypium hirsutum',    '棉花',   'Cotton'],
];

async function main() {
  const reset = process.argv.includes('--reset');

  if (reset) {
    log(`清空 pglite 数据目录: ${config.pgliteDir}`);
    fs.rmSync(config.pgliteDir, { recursive: true, force: true });
  }

  log(`驱动 = ${config.dbDriver}`);
  log(`数据库版本 = ${await getServerVersion()}`);

  // ---- 建表 -------------------------------------------------------------
  log('建表中 …');
  await exec(fs.readFileSync(paths.schemaSql, 'utf-8'));
  log('建表完成');

  // 物种维表必须先插 —— clusters.species 有外键指向它
  log('写入 species 维表（先占位，最后回填数量）…');
  for (const [slug, abbr, sci, common, commonEn] of SPECIES) {
    await query(
      `INSERT INTO species (abbr, scientific_name, common_name, common_name_en)
       VALUES ($1,$2,$3,$4) ON CONFLICT (abbr) DO NOTHING`,
      [abbr, sci, common, commonEn],
    );
  }

  const D = paths.dataDir;
  const must = (p) => {
    if (!fs.existsSync(p)) throw new Error(`找不到数据文件: ${p}\n先确认 ../data 目录完整`);
    return p;
  };

  const speciesCounts = new Map(); // abbr -> {loci, sirna}

  // ---- ① clusters -------------------------------------------------------
  log('导入 clusters（8 物种 PHAS loci）…');
  {
    const rows = [];
    const cols = [
      'species', 'phas_loci', 'chromosome', 'genome_start', 'genome_end', 'locus_gene',
      'transcript', 'phas_gene_type', 'transcript_start', 'transcript_end', 'pvalue',
      'phase_score', 'phase_ratio', 'annotation', 'method_ref', 'tag', 'recorder',
      'target_verified', 'initiator_verified', 'initiator_number',
    ];
    const abbrByName = new Map(SPECIES.map(([slug, abbr, sci]) => [sci, abbr]));
    await readTsv(
      must(path.join(D, 'derived', 'pha_loci_all_species.tsv')),
      (c) => {
        const abbr = abbrByName.get(c[0]) || c[0];
        rows.push([
          abbr, c[1], clean(c[2]), num(c[3]), num(c[4]), clean(c[5]), clean(c[6]),
          clean(c[7]), num(c[8]), num(c[9]), num(c[10]), num(c[11]), num(c[12]),
          clean(c[13]), clean(c[14]), clean(c[15]), num(c[16]), clean(c[17]),
          clean(c[18]), num(c[19]),
        ]);
        speciesCounts.set(abbr, (speciesCounts.get(abbr)?.loci || 0) + 1);
      },
    );
    await batchInsert('clusters', cols, rows);
    log(`  clusters: ${rows.length} 行`);
  }

  // ---- ② phas_seq -------------------------------------------------------
  log('导入 phas_seq（PHAS locus 序列）…');
  {
    const rows = [];
    let name = null;
    let buf = [];
    const rl = readline.createInterface({
      input: fs.createReadStream(must(path.join(D, 'derived', 'phas_locus_seq_all_species.fa')), { encoding: 'utf-8' }),
      crlfDelay: Infinity,
    });
    for await (const line of rl) {
      if (line.startsWith('>')) {
        if (name) rows.push([name, buf.join('').length, buf.join('')]);
        name = line.slice(1).trim();
        buf = [];
      } else if (line.trim()) buf.push(line.trim());
    }
    if (name) rows.push([name, buf.join('').length, buf.join('')]);
    await batchInsert('phas_seq', ['phas_loci', 'length', 'sequence'], rows);
    log(`  phas_seq: ${rows.length} 行`);
  }

  // ---- ③④ phasi_rna / phasi_rna_target ---------------------------------
  // 水稻和大豆用官方导出文件（信息最全），其余 6 物种用 derived 的序列表
  const official = [
    ['osa', 'osa_database_phasiRNA.txt'],
    ['gma', 'gma_database_phasiRNA.txt'],
  ];
  const officialSpecies = new Set(official.map(([a]) => a));

  log('导入 phasi_rna（其余 6 物种，来自 derived）…');
  {
    const rows = [];
    const abbrByName = new Map(SPECIES.map(([slug, abbr, sci]) => [sci, abbr]));
    await readTsv(
      must(path.join(D, 'derived', 'phasi_rna_seq_all_species.tsv')),
      (c) => {
        const abbr = abbrByName.get(c[0]) || c[0];
        speciesCounts.set(abbr, { ...(speciesCounts.get(abbr) || {}), sirna: (speciesCounts.get(abbr)?.sirna || 0) + 1 });
        if (officialSpecies.has(abbr)) return; // 这两物种稍后用官方文件覆盖导入
        rows.push([c[1], abbr, c[2], c[3], c[3] ? c[3].length : null]);
      },
    );
    await batchInsert('phasi_rna', ['phasi_rna', 'species', 'parent_locus', 'sequence', 'length'], rows);
    log(`  phasi_rna: ${rows.length} 行（6 个物种）`);
  }

  log('导入 phasi_rna + phasi_rna_target（水稻、大豆，来自官方文件）…');
  for (const [abbr, file] of official) {
    const fp = path.join(D, 'raw', file);
    if (!fs.existsSync(fp)) {
      log(`  跳过 ${file}（文件不存在）`);
      continue;
    }
    const sirnaRows = new Map(); // phasi_rna -> row
    const targetRows = [];
    let total = 0;
    await readTsv(fp, (c, header) => {
      total++;
      const phasiRna = clean(c[0]);
      const parent = clean(c[7]);
      if (!sirnaRows.has(phasiRna)) {
        sirnaRows.set(phasiRna, [phasiRna, abbr, parent, clean(c[5]), num(c[6])]);
      }
      targetRows.push([
        phasiRna, abbr, parent, clean(c[1]), strandOf(c[4]), clean(c[8]),
        num(c[9]), num(c[10]), clean(c[11]), num(c[12]), clean(c[13]), clean(c[14]),
        clean(c[15]), num(c[16]), num(c[17]), num(c[18]), num(c[19]), clean(c[20]),
      ]);
    });
    const sirnaArr = [...sirnaRows.values()];
    await batchInsert('phasi_rna', ['phasi_rna', 'species', 'parent_locus', 'sequence', 'length'], sirnaArr);
    await batchInsert(
      'phasi_rna_target',
      ['phasi_rna', 'species', 'phas_loci', 'chromosome', 'strand', 'transcript_id',
       'start_in_transcript', 'end_in_transcript', 't_verified', 'verified_target_num',
       'verified_target', 'degradome_lib', 'category', 'small_rna_loc', 'deg_loc',
       'deg_count', 'shift', 't_plot'],
      targetRows,
    );
    speciesCounts.set(abbr, { ...(speciesCounts.get(abbr) || {}), sirna: sirnaArr.length });
    log(`  ${abbr}: phasi_rna ${sirnaArr.length} 行（官方文件 ${total} 行摊平）→ phasi_rna_target ${targetRows.length} 行`);
  }

  // ---- ⑤ initiator ------------------------------------------------------
  // 官方导出文件按降解组库重复记录（同一 miRNA 多行，仅后 4 列不同），
  // 老站 single_cluster 页面是 select DISTINCT 语义（前 11 列）。
  // 这里按前 11 列去重后导入，保证 8 个物种的 initiator 表语义一致、
  // 且与老站展示的记录数一致（initiator_number 回填也以此为基准）。
  log('导入 initiator（phase initiator，来自官方文件，DISTINCT 语义）…');
  for (const [abbr, file] of [['osa', 'osa_database_initiator.txt'], ['gma', 'gma_database_initiator.txt']]) {
    const fp = path.join(D, 'raw', file);
    if (!fs.existsSync(fp)) {
      log(`  跳过 ${file}（文件不存在）`);
      continue;
    }
    const rows = [];
    const seen = new Set();
    let dup = 0;
    await readTsv(fp, (c) => {
      const key = c.slice(0, 11).join('\u0001');
      if (seen.has(key)) {
        dup++;
        return;
      }
      seen.add(key);
      rows.push([
        abbr, clean(c[0]), clean(c[1]), clean(c[2]), num(c[3]), num(c[4]), num(c[5]),
        num(c[6]), clean(c[7]), num(c[8]), clean(c[9]), clean(c[10]), clean(c[11]),
        clean(c[12]), num(c[13]), clean(c[14]),
      ]);
    });
    await batchInsert(
      'initiator',
      ['species', 'phas_gene', 'mirna', 'geneid', 'cleavege_site', 'target_pos_end',
       'posmax_min', 'distance', 'initiator_seq', 'initiator_len', 'recordmarker',
       'verified', 'degradome', 'category', 'deg_count', 't_plot'],
      rows,
    );
    log(`  ${abbr}: initiator ${rows.length} 行（原始 ${rows.length + dup} 行，去重丢弃 ${dup} 行降解组重复）`);
  }

  // ---- ⑤-b 其余 6 物种的 initiator（抓取自老站公开页面）--------------------
  // 老站 PostgreSQL 里 8 个物种都有 {spe}_initiator_21 表，但官网只发布水稻/大豆
  // 的导出包。其余 6 物种的 initiator 记录由 data/scraped/scrape_loci.py 从
  // single_cluster.php 公开页面抓取、convert.py 转换成 initiator_scraped.tsv
  // （已与官方文件交叉验证：水稻 33/33、大豆 30/30 位点完全一致）。
  {
    const fp = path.join(D, 'scraped', 'initiator_scraped.tsv');
    if (fs.existsSync(fp)) {
      const rows = [];
      const spSeen = new Set();
      await readTsv(fp, (c) => {
        if (officialSpecies.has(c[0])) return; // 水稻/大豆用官方文件，别重复灌
        spSeen.add(c[0]);
        rows.push([
          c[0], clean(c[1]), clean(c[2]), clean(c[3]), num(c[4]), num(c[5]), num(c[6]),
          num(c[7]), clean(c[8]), num(c[9]), clean(c[10]), clean(c[11]), clean(c[12]),
          clean(c[13]), num(c[14]), clean(c[15]),
        ]);
      });
      await batchInsert(
        'initiator',
        ['species', 'phas_gene', 'mirna', 'geneid', 'cleavege_site', 'target_pos_end',
         'posmax_min', 'distance', 'initiator_seq', 'initiator_len', 'recordmarker',
         'verified', 'degradome', 'category', 'deg_count', 't_plot'],
        rows,
      );
      log(`  抓取数据: initiator ${rows.length} 行（物种 ${[...spSeen].join('/')}）`);
    } else {
      log('  跳过 initiator_scraped.tsv（不存在；需要先跑 data/scraped/scrape_loci.py + convert.py）');
    }
  }

  // ---- 回填 species 的数量列 --------------------------------------------
  log('回填 species 统计数字 …');
  await query(`
    UPDATE species s SET
      phas_loci_count = (SELECT count(*) FROM clusters  c WHERE c.species = s.abbr),
      phasi_rna_count = (SELECT count(*) FROM phasi_rna p WHERE p.species = s.abbr)
  `);

  // ---- 用真实 initiator 记录回填 clusters.initiator_number -----------------
  // 2026-09-25 从浏览页提取的 initiator_number 有错位（实测 770 个位点里
  // 327 个与官方文件不符：有的少算、有的混成了官方文件原始行数）。
  // initiator 记录现已覆盖 8 个物种，以实际记录数为准纠正这个字段
  // （与老站 single_cluster 页面 "total initiators count" 同语义）。
  //
  // pglite 驱动灌完几十万行之后，同一个进程里继续 SELECT 会读不到数据行
  // （WASM 后端丢了 dataRow 消息；INSERT 不受影响，落库数据始终正确，
  // 换个新进程读也正常）。这里重连一次恢复读取，pg 驱动无此问题、
  // closeDb() 后同样会自动重连，两种驱动行为一致。
  await closeDb();
  {
    const { rows: before } = await query(`
      SELECT count(*)::int AS n FROM clusters c
      WHERE c.initiator_number IS DISTINCT FROM
            (SELECT count(*)::int FROM initiator i WHERE i.phas_gene = c.phas_loci)
    `);
    await query(`
      UPDATE clusters c SET initiator_number = sub.n
      FROM (SELECT phas_gene, count(*)::int AS n FROM initiator GROUP BY phas_gene) sub
      WHERE c.phas_loci = sub.phas_gene AND c.initiator_number IS DISTINCT FROM sub.n
    `);
    log(`回填 initiator_number：纠正 ${before[0]?.n ?? 0} 个位点（原浏览页提取值有错位）`);
  }

  // ---- 汇总 --------------------------------------------------------------
  log('\n=== 装载结果 ===');
  for (const t of ['species', 'clusters', 'phas_seq', 'phasi_rna', 'phasi_rna_target', 'initiator']) {
    const { rows } = await query(`SELECT count(*)::int AS n FROM ${t}`);
    console.log(`  ${t.padEnd(18)} ${String(rows[0]?.n ?? '?').padStart(8)} 行`);
  }

  await closeDb();
  log('完成');
}

main().catch(async (e) => {
  console.error('\n导入失败:', e.message);
  console.error(e.stack);
  await closeDb().catch(() => {});
  process.exit(1);
});
