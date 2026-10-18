/**
 * PHAS loci 浏览与详情接口。
 *
 * 对应原站的：
 *   browse.php → clusters.php?spe=<物种>          物种的 PHAS loci 表格（分页/排序/搜索）
 *   single_cluster.php?spe=&phas=&span=            单个 PHAS locus 详情
 */
import { Router } from 'express';
import { query } from '../db/index.js';
import { tplotUrl } from '../tplot.js';
import { jbrowseUrl } from '../jbrowse.js';

export const lociRouter = Router();

/** 允许排序的列白名单 —— ORDER BY 不能用参数占位，只能白名单校验后拼接 */
const SORTABLE = {
  recorder:           'c.recorder',
  phas_loci:          'c.phas_loci',
  chromosome:         'c.chromosome',
  genome_start:       'c.genome_start',
  genome_end:         'c.genome_end',
  locus_gene:         'c.locus_gene',
  transcript:         'c.transcript',
  phas_gene_type:     'c.phas_gene_type',
  pvalue:             'c.pvalue',
  phase_score:        'c.phase_score',
  phase_ratio:        'c.phase_ratio',
  annotation:         'c.annotation',
  target_verified:    'c.target_verified',
  initiator_verified: 'c.initiator_verified',
  initiator_number:   'c.initiator_number',
  phasi_rna_count:    'phasi_rna_count',   // SELECT 别名，ORDER BY 可直接引用
};

const clampInt = (v, def, min, max) => {
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) return def;
  return Math.min(Math.max(n, min), max);
};

/**
 * GET /api/loci
 *   ?species=osa          物种缩写（可选，不传就是全部）
 *   &q=PHAS9              关键词，匹配 locus 名 / 基因号 / 转录本 / 注释
 *   &sort=phase_score     排序字段（白名单）
 *   &order=desc|asc
 *   &page=1&pageSize=25
 */
lociRouter.get('/loci', async (req, res, next) => {
  try {
    const { species, q } = req.query;
    const sortKey = SORTABLE[req.query.sort] ? req.query.sort : 'recorder';
    const order = String(req.query.order).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    const page = clampInt(req.query.page, 1, 1, 100000);
    const pageSize = clampInt(req.query.pageSize, 25, 1, 200);

    const where = [];
    const params = [];
    if (species) {
      params.push(species);
      where.push(`c.species = $${params.length}`);
    }
    if (q && String(q).trim()) {
      params.push(`%${String(q).trim()}%`);
      const p = `$${params.length}`;
      where.push(`(c.phas_loci ILIKE ${p} OR c.locus_gene ILIKE ${p} OR c.transcript ILIKE ${p} OR c.annotation ILIKE ${p} OR c.chromosome ILIKE ${p})`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const countRes = await query(`SELECT count(*)::int AS total FROM clusters c ${whereSql}`, params);
    const total = countRes.rows[0].total;

    const { rows } = await query(
      `SELECT c.phas_loci, c.species, s.scientific_name, s.common_name, s.common_name_en,
              c.chromosome, c.genome_start, c.genome_end,
              c.locus_gene, c.transcript, c.phas_gene_type,
              c.transcript_start, c.transcript_end,
              c.pvalue, c.phase_score, c.phase_ratio,
              c.annotation, c.method_ref, c.tag, c.recorder,
              c.target_verified, c.initiator_verified, c.initiator_number,
              (SELECT count(*)::int FROM phasi_rna p WHERE p.parent_locus = c.phas_loci) AS phasi_rna_count
       FROM clusters c
       JOIN species s ON s.abbr = c.species
       ${whereSql}
       ORDER BY ${SORTABLE[sortKey]} ${order} NULLS LAST, c.phas_loci ASC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, (page - 1) * pageSize],
    );

    res.json({ total, page, pageSize, pageCount: Math.ceil(total / pageSize), rows });
  } catch (e) {
    next(e);
  }
});

/** GET /api/loci/:id —— 单个 PHAS locus 的完整信息（含序列） */
lociRouter.get('/loci/:id', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT c.*, s.scientific_name, s.common_name, s.common_name_en,
              q.length AS seq_length, q.sequence,
              (SELECT count(*)::int FROM phasi_rna p WHERE p.parent_locus = c.phas_loci) AS phasi_rna_count,
              (SELECT count(*)::int FROM initiator i WHERE i.phas_gene = c.phas_loci)   AS initiator_count
       FROM clusters c
       JOIN species s ON s.abbr = c.species
       LEFT JOIN phas_seq q ON q.phas_loci = c.phas_loci
       WHERE c.phas_loci = $1`,
      [req.params.id],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'not_found', message: `PHAS locus not found: ${req.params.id}` });

    // 只有水稻 chr11 能映射到老站 JBrowse 的 refseq；其他返回 null
    const row = rows[0];
    row.jbrowse = jbrowseUrl({
      species: row.species,
      chromosome: row.chromosome,
      start: row.genome_start,
      end: row.genome_end,
    });
    res.json(row);
  } catch (e) {
    next(e);
  }
});

/** GET /api/loci/:id/phasi-rna —— 该 locus 产生的 phasiRNA 列表（分页） */
lociRouter.get('/loci/:id/phasi-rna', async (req, res, next) => {
  try {
    const page = clampInt(req.query.page, 1, 1, 100000);
    const pageSize = clampInt(req.query.pageSize, 25, 1, 500);

    const countRes = await query('SELECT count(*)::int AS total FROM phasi_rna WHERE parent_locus = $1', [req.params.id]);
    const total = countRes.rows[0].total;

    const { rows } = await query(
      `SELECT p.phasi_rna, p.sequence, p.length,
              min(t.start_in_transcript)  AS start_in_transcript,
              max(t.end_in_transcript)    AS end_in_transcript,
              max(t.chromosome)           AS chromosome,
              max(t.strand)               AS strand,
              max(t.verified_target_num)  AS verified_target_num,
              count(DISTINCT t.verified_target)::int AS target_count,
              bool_or(t.t_verified = 'yes')          AS target_verified
       FROM phasi_rna p
       LEFT JOIN phasi_rna_target t ON t.phasi_rna = p.phasi_rna
       WHERE p.parent_locus = $1
       GROUP BY p.phasi_rna, p.sequence, p.length
       ORDER BY NULLIF(regexp_replace(p.phasi_rna, '^.*\\.', ''), p.phasi_rna)::int NULLS LAST, p.phasi_rna
       LIMIT $2 OFFSET $3`,
      [req.params.id, pageSize, (page - 1) * pageSize],
    );

    res.json({ total, page, pageSize, pageCount: Math.ceil(total / pageSize), rows });
  } catch (e) {
    next(e);
  }
});

/** GET /api/loci/:id/initiators —— 该 locus 的 phase initiator 列表 */
lociRouter.get('/loci/:id/initiators', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id, species, mirna, geneid, cleavege_site, target_pos_end, posmax_min, distance,
              initiator_seq, initiator_len, verified, degradome, category, deg_count, t_plot
       FROM initiator
       WHERE phas_gene = $1
       ORDER BY id`,
      [req.params.id],
    );

    // 老站只有 verified=yes 的 initiator 才显示 T-plot；文件不存在也不给 URL
    const withPlot = rows.map((r) => ({
      ...r,
      tplot: r.verified === 'yes' ? tplotUrl('initiator', r.species, r.t_plot) : null,
    }));

    res.json({ total: withPlot.length, rows: withPlot });
  } catch (e) {
    next(e);
  }
});
