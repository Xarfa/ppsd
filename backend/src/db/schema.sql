-- ============================================================================
-- PPSD 本地复刻 —— PostgreSQL 建表脚本
--
-- 列定义直接来自原站 http://cbi.njau.edu.cn/PPSD 的官方导出表头，
-- 以及奉泽荣硕士论文第三章 1.3「数据库构建与设计」中描述的 9 张表设计。
-- 这里落成 6 张表：原库的 clusters / initiator / PTI / PHAS 四张业务表，
-- 加上 species 维表，并把 PTI 拆成 phasi_rna + phasi_rna_target 两张
-- （原站导出是「一条 phasiRNA × 一条靶基因」拉平的宽表，重复严重）。
-- ============================================================================

DROP TABLE IF EXISTS phasi_rna_target CASCADE;
DROP TABLE IF EXISTS phasi_rna CASCADE;
DROP TABLE IF EXISTS initiator CASCADE;
DROP TABLE IF EXISTS phas_seq CASCADE;
DROP TABLE IF EXISTS clusters CASCADE;
DROP TABLE IF EXISTS species CASCADE;

-- 物种维表
-- 注意有两个名字字段：common_name 是中文常用名（英文界面不显示），
-- common_name_en 是英文常用名（英文界面显示这个）。界面语言切换靠它们。
CREATE TABLE species (
    abbr              text PRIMARY KEY,          -- osa / gma / zma ...
    scientific_name   text NOT NULL UNIQUE,      -- Oryza sativa
    common_name       text,                      -- 水稻
    common_name_en    text,                      -- Rice
    phas_loci_count   integer,
    phasi_rna_count   integer
);

-- ① clusters —— 一个 PHAS locus 一行（原库表名 clusters）
CREATE TABLE clusters (
    phas_loci          text PRIMARY KEY,
    species            text NOT NULL REFERENCES species (abbr),
    chromosome         text,
    genome_start       bigint,
    genome_end         bigint,
    locus_gene         text,
    transcript         text,
    phas_gene_type     text,
    transcript_start   integer,
    transcript_end     integer,
    pvalue             double precision,
    phase_score        double precision,
    phase_ratio        double precision,
    annotation         text,
    method_ref         text,
    tag                text,
    recorder           integer,
    target_verified    text,
    initiator_verified text,
    initiator_number   integer
);
CREATE INDEX idx_clusters_species ON clusters (species);
CREATE INDEX idx_clusters_pos     ON clusters (species, chromosome, genome_start, genome_end);
CREATE INDEX idx_clusters_gene    ON clusters (locus_gene);
CREATE INDEX idx_clusters_tx      ON clusters (transcript);

-- ② phas_seq —— PHAS locus 序列（原库表名 PHAS）
CREATE TABLE phas_seq (
    phas_loci text PRIMARY KEY REFERENCES clusters (phas_loci) ON DELETE CASCADE,
    length    integer,
    sequence  text NOT NULL
);

-- ③ phasi_rna —— phasiRNA 主表（从原库 PTI 表拆出）
CREATE TABLE phasi_rna (
    phasi_rna    text PRIMARY KEY,
    species      text NOT NULL REFERENCES species (abbr),
    parent_locus text REFERENCES clusters (phas_loci) ON DELETE CASCADE,
    sequence     text,
    length       integer
);
CREATE INDEX idx_phasi_rna_locus   ON phasi_rna (parent_locus);
CREATE INDEX idx_phasi_rna_species ON phasi_rna (species);

-- ④ phasi_rna_target —— phasiRNA 的降解组验证靶基因（原库 PTI 表拆分出的另一半）
--    只有水稻和大豆有数据（官网只发布了这两物种的下载包）
CREATE TABLE phasi_rna_target (
    id                  bigserial PRIMARY KEY,
    phasi_rna           text NOT NULL REFERENCES phasi_rna (phasi_rna) ON DELETE CASCADE,
    species             text NOT NULL,
    phas_loci           text,
    chromosome          text,
    strand              text,
    transcript_id       text,
    start_in_transcript integer,
    end_in_transcript   integer,
    t_verified          text,
    verified_target_num integer,
    verified_target     text,
    degradome_lib       text,
    category            text,
    small_rna_loc       integer,
    deg_loc             integer,
    deg_count           double precision,
    shift               integer,
    t_plot              text
);
CREATE INDEX idx_prt_sirna   ON phasi_rna_target (phasi_rna);
CREATE INDEX idx_prt_locus   ON phasi_rna_target (phas_loci);
CREATE INDEX idx_prt_species ON phasi_rna_target (species);

-- ⑤ initiator —— 触发 PHAS locus 的 miRNA（原库表名 initiator）
CREATE TABLE initiator (
    id              bigserial PRIMARY KEY,
    species         text NOT NULL,
    phas_gene       text REFERENCES clusters (phas_loci) ON DELETE CASCADE,
    mirna           text,
    geneid          text,
    cleavege_site   integer,
    target_pos_end  integer,
    posmax_min      integer,
    distance        integer,
    initiator_seq   text,
    initiator_len   integer,
    recordmarker    text,
    verified        text,
    degradome       text,
    category        text,
    deg_count       double precision,
    t_plot          text
);
CREATE INDEX idx_initiator_locus ON initiator (phas_gene);
CREATE INDEX idx_initiator_mirna ON initiator (mirna);
