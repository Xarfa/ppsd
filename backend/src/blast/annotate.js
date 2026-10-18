/**
 * 给 BLAST 命中补上功能注释。
 *
 * NCBI 和 JS 两个引擎都返回"命中 ID + 父位点"，页面需要的是
 * 位点注释（基因、转录本、phase score、验证状态等），统一在这里补齐。
 */
import { query } from '../db/index.js';

export async function attachAnnotations(hits) {
    const loci = [...new Set(hits.map((h) => h.parentLocus).filter(Boolean))];
    if (!loci.length) return hits;

    const { rows } = await query(
        `SELECT phas_loci, locus_gene, transcript, annotation, phase_score, chromosome,
                genome_start, genome_end, target_verified, initiator_verified
         FROM clusters WHERE phas_loci = ANY($1)`,
        [loci],
    );
    const byId = new Map(rows.map((r) => [r.phas_loci, r]));
    for (const h of hits) {
        const info = byId.get(h.parentLocus);
        if (!info) continue;
        h.locusGene = info.locus_gene;
        h.transcript = info.transcript;
        h.annotation = info.annotation;
        h.phaseScore = info.phase_score;
        h.chromosome = info.chromosome;
        h.genomeStart = info.genome_start;
        h.genomeEnd = info.genome_end;
        h.targetVerified = info.target_verified;
        h.initiatorVerified = info.initiator_verified;
    }
    return hits;
}
