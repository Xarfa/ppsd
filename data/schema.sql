-- ============================================================================
-- PPSD (Plant Phased siRNA Database) — PostgreSQL 建表脚本（初稿）
--
-- 依据：http://cbi.njau.edu.cn/PPSD 官网 download_dir/*.txt 的真实表头
--       以及奉泽荣硕士论文《基于多参考序列phasiRNA预测程序开发及PhasiRBase构建》
--       第三章 1.3「数据库构建与设计」原文：
--         "PhasiRBase 是一个关系型数据库，其使用了基于 Linux（Cent OS release 6.10）,
--          Apache2（2.4.48）, PHP（8.0.7）, PostgreSQL（13.3）的框架搭建。
--          我们设计了 9 张表用于数据的存储。"
--
-- 说明：原库 9 张表中，只有 clusters / initiator / PTI / PHAS 这 4 张是真正的
--       业务数据表，另外 5 张是测序数据来源的登记表（sRNA-seq / degradome /
--       flnc / genome / transcriptome），本地 demo 阶段可以先不建。
--
-- 目标版本：PostgreSQL 13+（与学校服务器保持一致，便于将来迁移）
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. 物种维表（原库没有显式物化，靠 species 字符串区分；这里显式建出来更好查）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS species (
    id              serial PRIMARY KEY,
    abbr            text NOT NULL UNIQUE,      -- osa / gma / zma / ath / vvi / bna / csi / ghi
    scientific_name text NOT NULL UNIQUE,      -- Oryza sativa
    common_name     text,                      -- 水稻
    phas_loci_count integer,
    phasi_rna_count integer
);

-- ---------------------------------------------------------------------------
-- 1. clusters —— 对应原库 clusters 表：一个 PHAS locus 一行
--    来源：osa_database_PHAS_Loci.txt（19 列，含主键 PHAS_Loci）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clusters (
    phas_loci          text PRIMARY KEY,        -- OsaPHAS9g4346635.1@21#1
    species            text NOT NULL,           -- 外键 -> species.scientific_name
    chromosome         text,
    genome_start       bigint,
    genome_end         bigint,
    locus_gene         text,                    -- NCBI Gene locus, e.g. LOC4346635
    transcript         text,                    -- NCBI Transcript, e.g. XM_015757151.2
    phas_gene_type     text,                    -- mRNA / lncRNA / ...
    transcript_start   integer,
    transcript_end     integer,
    pvalue             double precision,
    phase_score        double precision,
    phase_ratio        double precision,
    annotation         text,
    method_ref         text,                    -- HC,PC,PG,HG 打靶方法组合
    tag                text,                    -- HC1 / HC2 ...（原始记录号）
    recorder           integer,                 -- 站点上显示的 ID 序号
    target_verified    text,                    -- yes / no
    initiator_verified text,                    -- yes / no
    initiator_number   integer
);

CREATE INDEX IF NOT EXISTS idx_clusters_species   ON clusters (species);
CREATE INDEX IF NOT EXISTS idx_clusters_pos       ON clusters (species, chromosome, genome_start, genome_end);
CREATE INDEX IF NOT EXISTS idx_clusters_gene      ON clusters (locus_gene);
CREATE INDEX IF NOT EXISTS idx_clusters_tx        ON clusters (transcript);

-- ---------------------------------------------------------------------------
-- 2. phas_seq —— 对应原库 PHAS 表：PHAS locus 的核酸序列
--    来源：*_new_PHAS_Gene.fa / derived/phas_locus_seq_all_species.fa
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS phas_seq (
    phas_loci text PRIMARY KEY REFERENCES clusters (phas_loci) ON DELETE CASCADE,
    length    integer,
    sequence  text NOT NULL
);

-- ---------------------------------------------------------------------------
-- 3. pti —— 对应原库 PTI 表：phasiRNA 及其靶基因（原论文记作 "save all
--    phasiRNA and phasiRNA target details"）
--
--    注意：官网导出的 osa_database_phasiRNA.txt 是把「一条 phasiRNA」和
--    「它的一条降解组验证靶基因」拉平成一行的宽表（同一 PhasiRNA 会重复多行）。
--    这里保留这个扁平结构，方便直接用 COPY 导入；将来要规范化可以拆成
--    phasi_rna + target 两张表。
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pti (
    id                  bigserial PRIMARY KEY,
    phasi_rna           text NOT NULL,          -- OsaPHAS9g4346635.1@21#1.1
    species             text NOT NULL,
    chromosome          text,
    genome_start        text,                   -- 官网导出里是 "-"，故用 text
    genome_end          text,
    strand              text,                   -- + / -
    sequence            text,
    length              integer,
    phas_loci           text,                   -- 外键 -> clusters.phas_loci
    transcript_id       text,
    start_in_transcript integer,
    end_in_transcript   integer,
    t_verified          text,                   -- 该条 phasiRNA 是否降解组验证
    verified_target_num integer,                -- 验证到的靶基因个数
    verified_target     text,                   -- 本节这条记录的靶基因
    degradome_lib       text,                   -- GSM 编号
    category            text,                   -- Cat_1 / Cat_2 ...
    small_rna_loc       integer,
    deg_loc             integer,
    deg_count           double precision,
    shift               integer,
    t_plot              text                    -- 降解组作图图名
);

CREATE INDEX IF NOT EXISTS idx_pti_sirna   ON pti (phasi_rna);
CREATE INDEX IF NOT EXISTS idx_pti_locus   ON pti (phas_loci);
CREATE INDEX IF NOT EXISTS idx_pti_species ON pti (species);
CREATE INDEX IF NOT EXISTS idx_pti_seq     ON pti (sequence);

-- ---------------------------------------------------------------------------
-- 4. initiator —— 对应原库 initiator 表：触发 PHAS locus 的 miRNA（phase initiator）
--    来源：osa_database_initiator.txt（15 列）
--    注意官网把拼写写成了 Cleavege_site，这里沿用原名以便直接 COPY
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS initiator (
    id              bigserial PRIMARY KEY,
    species         text NOT NULL,
    phas_gene       text,                       -- 外键 -> clusters.phas_loci
    mirna           text,                       -- osa-miR5521
    geneid          text,
    cleavege_site   integer,
    target_pos_end  integer,
    posmax_min      integer,
    distance        integer,
    initiator_seq   text,
    initiator_len   integer,
    recordmarker    text,
    verified        text,                       -- yes / no
    degradome       text,
    category        text,
    deg_count       double precision,
    t_plot          text
);

CREATE INDEX IF NOT EXISTS idx_initiator_locus ON initiator (phas_gene);
CREATE INDEX IF NOT EXISTS idx_initiator_mirna ON initiator (mirna);

-- ---------------------------------------------------------------------------
-- 5. 原库另外 5 张「测序数据登记表」——目前没有导出数据，先留结构占位
--    将来从实验室服务器拿到清单后再灌数据
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS srna_seq_data (
    id       bigserial PRIMARY KEY,
    species  text,
    gsm_id   text UNIQUE,
    tissue   text,
    note     text
);

CREATE TABLE IF NOT EXISTS degradome_data (
    id       bigserial PRIMARY KEY,
    species  text,
    gsm_id   text UNIQUE,
    tissue   text,
    note     text
);

CREATE TABLE IF NOT EXISTS flnc_data (
    id       bigserial PRIMARY KEY,
    species  text,
    gsm_id   text UNIQUE,
    note     text
);

CREATE TABLE IF NOT EXISTS genome_data (
    id       bigserial PRIMARY KEY,
    species  text,
    version  text,
    source   text
);

CREATE TABLE IF NOT EXISTS transcriptome_data (
    id       bigserial PRIMARY KEY,
    species  text,
    version  text,
    source   text
);

-- ============================================================================
-- 导入（在 psql 里执行；路径换成你机器上的实际路径，Windows 下注意正斜杠）
-- ============================================================================
-- \copy species FROM 'data/derived/species.tsv' WITH (FORMAT csv, DELIMITER E'\t', HEADER true);
-- \copy clusters FROM 'data/raw/osa_database_PHAS_Loci.txt' WITH (FORMAT csv, DELIMITER E'\t', HEADER true);
-- \copy pti FROM 'data/raw/osa_database_phasiRNA.txt' WITH (FORMAT csv, DELIMITER E'\t', HEADER true);
-- \copy initiator FROM 'data/raw/osa_database_initiator.txt' WITH (FORMAT csv, DELIMITER E'\t', HEADER true);
--
-- 注意：官网导出的 clusters / initiator / pti 表头是大写驼峰，而本脚本用小写下划线，
--       导入时用 \copy ... (FORMAT csv, HEADER true) 无法自动对列名做映射。
--       两种做法二选一：
--       (a) 用官网表头原样建表（列名加大写引号），最省事；
--       (b) 建一个临时表按位置导入，再 INSERT ... SELECT 转进目标表。
--       详见 data/README.md「导入步骤」。
