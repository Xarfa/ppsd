/**
 * BLAST 可检索的两个库。
 *
 * 这里同时描述两套信息：
 *   - JS 引擎怎么从 PostgreSQL 里取序列（table/idCol/…）
 *   - NCBI 引擎用哪个预编译库（blastDb）
 *
 * 两个引擎共用同一份定义，避免"页面显示的库"和"实际检索的库"对不上。
 */
export const DATABASES = {
    phasi_rna: {
        label: 'phasiRNA',
        table: 'phasi_rna',
        idCol: 'phasi_rna',
        // phasiRNA 全部是 21 nt，长度上没有筛选余地，给个宽松上界即可
        minLen: () => 1,
        maxLen: () => 200,
        parentCol: 'parent_locus',
        joinSpecies: false,
        // 老站 blast/db 下的预编译库名
        blastDb: 'phasiRNA',
    },
    phas_seq: {
        label: 'PHAS loci',
        table: 'phas_seq',
        idCol: 'phas_loci',
        // ⚠️ 只有下界，没有上界：查询序列可以被包含在长位点里
        minLen: (qlen) => Math.max(20, Math.floor(qlen * 0.5)),
        maxLen: () => null,
        parentCol: null,
        joinSpecies: true,
        blastDb: 'PHASGene',
    },
};

/** 老站表单里的库名 → 内部 key（兼容旧页面传参） */
export const DATABASE_ALIASES = {
    phasiRNA: 'phasi_rna',
    'PHAS Gene': 'phas_seq',
    PHASGene: 'phas_seq',
};

/** 前端传进来的库名统一成内部 key；未知返回 null */
export function resolveDatabase(name) {
    const key = String(name || 'phasi_rna').trim();
    if (DATABASES[key]) return key;
    return DATABASE_ALIASES[key] || null;
}
