/**
 * 物种与数据统计接口。
 *
 * 对应原站的：
 *   browse.php 的下拉框物种列表
 *   index.php 首页的数据统计图（论文图 3-2）
 */
import { Router } from 'express';
import { query } from '../db/index.js';

export const speciesRouter = Router();

/** GET /api/species —— 8 个物种 + 各自的 PHAS loci / phasiRNA 数量 */
speciesRouter.get('/species', async (_req, res, next) => {
  try {
    // 中英文名都返回，前端按当前语言自己挑（common_name 是中文，common_name_en 是英文）
    const { rows } = await query(`
      SELECT s.abbr, s.scientific_name, s.common_name, s.common_name_en,
             (SELECT count(*)::int FROM clusters  c WHERE c.species = s.abbr) AS phas_loci,
             (SELECT count(*)::int FROM phasi_rna p WHERE p.species = s.abbr) AS phasi_rna,
             (SELECT count(*)::int FROM clusters c WHERE c.species = s.abbr AND c.target_verified    = 'yes') AS loci_target_verified,
             (SELECT count(*)::int FROM clusters c WHERE c.species = s.abbr AND c.initiator_verified = 'yes') AS loci_initiator_verified
      FROM species s
      ORDER BY phas_loci DESC
    `);
    res.json({ count: rows.length, species: rows });
  } catch (e) {
    next(e);
  }
});

/** GET /api/stats —— 首页统计数字 + 各物种分布（给图表用） */
speciesRouter.get('/stats', async (_req, res, next) => {
  try {
    const totals = await query(`
      SELECT
        (SELECT count(*)::int FROM species)          AS species_count,
        (SELECT count(*)::int FROM clusters)         AS phas_loci,
        (SELECT count(*)::int FROM phasi_rna)        AS phasi_rna,
        (SELECT count(*)::int FROM phasi_rna_target) AS phasi_rna_target,
        (SELECT count(*)::int FROM initiator)        AS initiator,
        (SELECT count(*)::int FROM clusters WHERE initiator_verified = 'yes') AS initiator_verified,
        (SELECT count(*)::int FROM clusters WHERE target_verified    = 'yes') AS target_verified
    `);
    const bySpecies = await query(`
      SELECT s.abbr, s.scientific_name, s.common_name, s.common_name_en,
             (SELECT count(*)::int FROM clusters  c WHERE c.species = s.abbr) AS phas_loci,
             (SELECT count(*)::int FROM phasi_rna p WHERE p.species = s.abbr) AS phasi_rna
      FROM species s
      ORDER BY phas_loci DESC
    `);
    res.json({ totals: totals.rows[0], bySpecies: bySpecies.rows });
  } catch (e) {
    next(e);
  }
});
