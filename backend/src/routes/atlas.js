/**
 * 图表数据聚合接口 —— 给前端 Atlas 统计页和首页图表用。
 *
 * 这里的查询全部是 GROUP BY 聚合，毫秒级返回；
 * scatter 做了随机采样，把上万个点压到两千个以内，前端渲染不卡。
 *
 *   GET /api/stats/atlas
 */
import { Router } from 'express';
import { query } from '../db/index.js';

export const atlasRouter = Router();

atlasRouter.get('/stats/atlas', async (_req, res, next) => {
  try {
    // ① 各物种四大组分数量（loci / phasiRNA / 靶基因记录 / initiator）
    const bySpecies = await query(`
      SELECT s.abbr, s.scientific_name, s.common_name, s.common_name_en,
             (SELECT count(*)::int FROM clusters         c WHERE c.species = s.abbr) AS phas_loci,
             (SELECT count(*)::int FROM phasi_rna        p WHERE p.species = s.abbr) AS phasi_rna,
             (SELECT count(*)::int FROM phasi_rna_target t WHERE t.species = s.abbr) AS targets,
             (SELECT count(*)::int FROM initiator        i WHERE i.species = s.abbr) AS initiators
      FROM species s ORDER BY phas_loci DESC
    `);

    // ② 物种 × 染色体 热力图（染色体按数值排序，非数字的排最后）
    const heat = await query(`
      SELECT species, chromosome, count(*)::int AS n
      FROM clusters GROUP BY 1, 2
    `);

    // ③ 物种 × PHAS 基因类型（Intergenic / mRNA / lnc_RNA …）
    const geneType = await query(`
      SELECT species, phas_gene_type AS type, count(*)::int AS n
      FROM clusters WHERE phas_gene_type IS NOT NULL AND phas_gene_type <> ''
      GROUP BY 1, 2
    `);

    // ④ 触发 PHAS 的 miRNA Top 12（只水稻、大豆有 initiator 数据）
    const families = await query(`
      SELECT mirna, species, count(*)::int AS n
      FROM initiator WHERE mirna IS NOT NULL AND mirna <> ''
      GROUP BY 1, 2 ORDER BY n DESC LIMIT 12
    `);

    // ⑤ 降解组 Category 分布（Cat_1 强证据 / Cat_2 弱证据）
    const targetCategory = await query(`
      SELECT coalesce(nullif(category, ''), 'Unknown') AS category, count(*)::int AS n
      FROM phasi_rna_target GROUP BY 1 ORDER BY n DESC
    `);
    const initiatorCategory = await query(`
      SELECT coalesce(nullif(category, ''), 'Unknown') AS category, count(*)::int AS n
      FROM initiator GROUP BY 1 ORDER BY n DESC
    `);

    // ⑥ PHAS locus 长度直方图（p99 ≈ 6.9 kb，>8 kb 归入最后一档）
    const lengthHist = await query(`
      SELECT least((length / 1000) * 1000, 8000)::int AS bin, count(*)::int AS n
      FROM phas_seq WHERE length IS NOT NULL
      GROUP BY 1 ORDER BY 1
    `);

    // ⑦ 每个 locus 的 phasiRNA 产量分布
    const yieldHist = await query(`
      SELECT CASE
               WHEN n >= 50 THEN '>50'
               WHEN n >= 21 THEN '21-50'
               WHEN n >= 11 THEN '11-20'
               WHEN n >= 6  THEN '6-10'
               WHEN n >= 2  THEN '2-5'
               ELSE '1'
             END AS bucket, count(*)::int AS n
      FROM (SELECT count(*) AS n FROM phasi_rna GROUP BY parent_locus) t
      GROUP BY 1
    `);

    // ⑧ P-value × Phase Score 散点（随机采样 2000 个，按物种着色）
    const scatter = await query(`
      SELECT species, pvalue, phase_score
      FROM (
        SELECT species, pvalue, phase_score, random() AS rnd
        FROM clusters
        WHERE pvalue IS NOT NULL AND phase_score IS NOT NULL
      ) s ORDER BY rnd LIMIT 2000
    `);

    // ⑨ 方法学标签（PG/HG/HC/PC 组合）
    const methods = await query(`
      SELECT method_ref AS method, count(*)::int AS n
      FROM clusters WHERE method_ref IS NOT NULL AND method_ref <> ''
      GROUP BY 1 ORDER BY n DESC LIMIT 8
    `);

    res.json({
      bySpecies: bySpecies.rows,
      heatmap: heat.rows,
      geneType: geneType.rows,
      families: families.rows,
      targetCategory: targetCategory.rows,
      initiatorCategory: initiatorCategory.rows,
      lengthHist: lengthHist.rows,
      yieldHist: yieldHist.rows,
      scatter: scatter.rows.map((r) => ({
        species: r.species,
        pvalue: Number(r.pvalue),
        phase_score: Number(r.phase_score),
      })),
      methods: methods.rows,
    });
  } catch (e) {
    next(e);
  }
});
