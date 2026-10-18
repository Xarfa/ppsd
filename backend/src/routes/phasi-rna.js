/**
 * phasiRNA 详情接口。
 *
 * 对应原站的 single_phasiRNA.php?id=<phasiRNA ID>
 */
import { Router } from 'express';
import { query } from '../db/index.js';
import { tplotUrl } from '../tplot.js';

export const phasiRnaRouter = Router();

/** GET /api/phasi-rna/:id —— 单条 phasiRNA 的基本信息 + 全部降解组验证靶基因 */
phasiRnaRouter.get('/phasi-rna/:id', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT p.phasi_rna, p.species, p.parent_locus, p.sequence, p.length,
              s.scientific_name, s.common_name, s.common_name_en,
              c.chromosome, c.locus_gene, c.transcript, c.annotation,
              c.genome_start AS locus_genome_start, c.genome_end AS locus_genome_end,
              c.phas_gene_type
       FROM phasi_rna p
       JOIN species  s ON s.abbr = p.species
       LEFT JOIN clusters c ON c.phas_loci = p.parent_locus
       WHERE p.phasi_rna = $1`,
      [req.params.id],
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'not_found', message: `phasiRNA not found: ${req.params.id}` });
    }

    const targets = await query(
      `SELECT verified_target, degradome_lib, category, deg_count, t_verified,
              verified_target_num, transcript_id, start_in_transcript, end_in_transcript,
              small_rna_loc, deg_loc, shift, strand, t_plot
       FROM phasi_rna_target
       WHERE phasi_rna = $1
       ORDER BY deg_count DESC NULLS LAST`,
      [req.params.id],
    );

    // 老站只有 Cat_1 的靶基因才显示 T-plot 图标；文件不存在时也不给 URL
    const sp = rows[0].species;
    const targetsWithPlot = targets.rows.map((r) => ({
      ...r,
      tplot: r.category === 'Cat_1' ? tplotUrl('phasiRNA', sp, r.t_plot) : null,
    }));

    res.json({
      ...rows[0],
      targets: targetsWithPlot,
      target_count: targetsWithPlot.length,
    });
  } catch (e) {
    next(e);
  }
});
