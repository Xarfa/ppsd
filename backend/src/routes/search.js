/**
 * 搜索接口。
 *
 * 对应原站的：
 *   search.php → single_phasiRNA.php?id=        按 phasiRNA ID 搜
 *              → single_cluster.php?phas=        按 PHAS locus ID 搜
 *              → search_res_Gene.php?loc=       按 NCBI Gene locus 搜
 *              → search_res_Gene.php?tid=       按 NCBI 转录本 ID 搜
 *              → search_res_location.php?spe=&chr=&s=&e=   按基因组区间搜
 */
import { Router } from 'express';
import { query } from '../db/index.js';

export const searchRouter = Router();

const clampInt = (v, def, min, max) => {
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) return def;
  return Math.min(Math.max(n, min), max);
};

const TYPES = new Set(['locus', 'phasiRNA', 'gene', 'transcript', 'annotation', 'mirna']);

/**
 * GET /api/search?type=locus|phasiRNA|gene|transcript|annotation|mirna&q=&species=&limit=
 * 不传 type 就在全部类型里找（给首页搜索框用）
 */
searchRouter.get('/search', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.json({ q, type: null, count: 0, rows: [] });

    const limit = clampInt(req.query.limit, 25, 1, 200);
    const species = req.query.species || null;
    const rawType = String(req.query.type || 'all');
    const type = TYPES.has(rawType) ? rawType : 'all';

    const like = `%${q}%`;
    const results = [];

    const want = (t) => type === 'all' || type === t;

    // PHAS locus：按 locus 名 / 基因号 / 转录本 / 注释 匹配
    if (want('locus')) {
      const params = [like];
      let sp = '';
      if (species) { params.push(species); sp = `AND c.species = $${params.length}`; }
      const r = await query(
        `SELECT 'locus' AS kind, c.phas_loci AS id, c.species, s.common_name, s.common_name_en,
                c.chromosome, c.genome_start, c.genome_end, c.locus_gene,
                c.transcript, c.phase_score, c.annotation
         FROM clusters c JOIN species s ON s.abbr = c.species
         WHERE (c.phas_loci ILIKE $1 OR c.locus_gene ILIKE $1 OR c.transcript ILIKE $1 OR c.annotation ILIKE $1)
         ${sp}
         ORDER BY c.recorder LIMIT $${params.length + 1}`,
        [...params, limit],
      );
      results.push(...r.rows);
    }

    if (want('gene')) {
      const params = [like];
      let sp = '';
      if (species) { params.push(species); sp = `AND c.species = $${params.length}`; }
      const r = await query(
        `SELECT 'gene' AS kind, c.locus_gene AS id, c.species, s.common_name, s.common_name_en,
                c.chromosome, c.genome_start, c.genome_end, c.locus_gene,
                c.transcript, c.phase_score, c.annotation
         FROM clusters c JOIN species s ON s.abbr = c.species
         WHERE c.locus_gene ILIKE $1 ${sp}
         ORDER BY c.recorder LIMIT $${params.length + 1}`,
        [...params, limit],
      );
      results.push(...r.rows);
    }

    if (want('transcript')) {
      const params = [like];
      let sp = '';
      if (species) { params.push(species); sp = `AND c.species = $${params.length}`; }
      const r = await query(
        `SELECT 'transcript' AS kind, c.transcript AS id, c.species, s.common_name, s.common_name_en,
                c.chromosome, c.genome_start, c.genome_end, c.locus_gene,
                c.transcript, c.phase_score, c.annotation
         FROM clusters c JOIN species s ON s.abbr = c.species
         WHERE c.transcript ILIKE $1 ${sp}
         ORDER BY c.recorder LIMIT $${params.length + 1}`,
        [...params, limit],
      );
      results.push(...r.rows);
    }

    if (want('phasiRNA')) {
      const params = [like];
      let sp = '';
      if (species) { params.push(species); sp = `AND p.species = $${params.length}`; }
      const r = await query(
        `SELECT 'phasiRNA' AS kind, p.phasi_rna AS id, p.species, s.common_name, s.common_name_en,
                p.parent_locus, p.sequence, p.length
         FROM phasi_rna p JOIN species s ON s.abbr = p.species
         WHERE (p.phasi_rna ILIKE $1 OR p.sequence ILIKE $1) ${sp}
         ORDER BY p.phasi_rna LIMIT $${params.length + 1}`,
        [...params, limit],
      );
      results.push(...r.rows);
    }

    // 按 miRNA 找它触发的 PHAS loci（initiator 关联）
    if (want('mirna')) {
      const params = [like];
      let sp = '';
      if (species) { params.push(species); sp = `AND i.species = $${params.length}`; }
      const r = await query(
        `SELECT DISTINCT ON (i.phas_gene) 'mirna' AS kind, i.phas_gene AS id, i.species,
                s.common_name, s.common_name_en, c.chromosome, c.genome_start, c.genome_end,
                i.mirna, i.verified, i.category, c.phase_score, c.annotation
         FROM initiator i
         JOIN species s ON s.abbr = i.species
         LEFT JOIN clusters c ON c.phas_loci = i.phas_gene
         WHERE i.mirna ILIKE $1 ${sp}
         ORDER BY i.phas_gene, i.id
         LIMIT $${params.length + 1}`,
        [...params, limit],
      );
      results.push(...r.rows);
    }

    res.json({ q, type, count: results.length, rows: results });
  } catch (e) {
    next(e);
  }
});

/**
 * GET /api/search/region?species=osa&chrom=9&start=6678000&end=6680000
 * 基因组区间搜索 —— 找出与该区间有重叠的所有 PHAS loci
 */
searchRouter.get('/search/region', async (req, res, next) => {
  try {
    const { species, chrom } = req.query;
    const start = Number.parseInt(req.query.start, 10);
    const end = Number.parseInt(req.query.end, 10);

    if (!species || !chrom || !Number.isFinite(start) || !Number.isFinite(end)) {
      return res.status(400).json({
        error: 'bad_request',
        message: 'missing required parameters: species, chrom, start, end — e.g. ?species=osa&chrom=9&start=6678000&end=6680000',
      });
    }
    const lo = Math.min(start, end);
    const hi = Math.max(start, end);

    const { rows } = await query(
      `SELECT c.phas_loci, c.species, s.common_name, s.common_name_en, c.chromosome,
              LEAST(c.genome_start, c.genome_end)    AS genome_start,
              GREATEST(c.genome_start, c.genome_end) AS genome_end,
              c.locus_gene, c.transcript,
              c.phase_score, c.phase_ratio, c.annotation,
              c.target_verified, c.initiator_verified, c.recorder,
              (SELECT count(*)::int FROM phasi_rna p WHERE p.parent_locus = c.phas_loci) AS phasi_rna_count
       FROM clusters c JOIN species s ON s.abbr = c.species
       WHERE c.species = $1 AND c.chromosome = $2
         AND LEAST(c.genome_start, c.genome_end) <= $4
         AND GREATEST(c.genome_start, c.genome_end) >= $3
       ORDER BY genome_start
       LIMIT 500`,
      [species, String(chrom), lo, hi],
    );

    res.json({ species, chrom: String(chrom), start: lo, end: hi, count: rows.length, rows });
  } catch (e) {
    next(e);
  }
});
