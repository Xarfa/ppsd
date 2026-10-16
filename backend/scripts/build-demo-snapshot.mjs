/**
 * 生成「轻量单文件演示版」的数据快照。
 *
 * 与 dump-demo-data.mjs 的区别：那个从本地 PostgreSQL 导出整库（约 45MB），
 * 这个只从 data/ 下已采集的公开数据文件里节选一小批位点，产出几百 KB 的 JSON，
 * 供 GitHub Pages 上的公开演示使用 —— 不把整库数据带进公开仓库。
 *
 * 用法：node backend/scripts/build-demo-snapshot.mjs
 * 输出：src/demo/demo-data.json
 *       src/demo/demo-data.b64.txt（gzip + base64，构建时内嵌进单文件 HTML）
 *
 * 收录范围：
 *   - 每个物种按 phasiRNA 数量取前 PER_SPECIES 个位点，另加 MUST 里的演示位点
 *   - 这些位点的序列、全部 phasiRNA、initiator、靶基因聚合数
 *   - 靶基因明细（targetsDemo）只保留两个演示位点，与整库版口径一致
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import readline from 'node:readline';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const DATA = (p) => path.join(ROOT, 'data', p);
const OUT_JSON = path.join(ROOT, 'src', 'demo', 'demo-data.json');
const OUT_B64 = path.join(ROOT, 'src', 'demo', 'demo-data.b64.txt');

/** 每个物种节选的位点数（按 phasiRNA 数量取最多的前 N 个，详情页最饱满） */
const PER_SPECIES = 20;
/** 必须收录的演示位点 */
const MUST = [
    'OsaPHAS9g4346635.1@21#1',   // 12 条 phasiRNA、双链交错的经典例子
    'OsaPHAS9g4346635.2@21#1',
    'OsaPHAS10g4348527.1@21#1',  // 靶基因明细最全的水稻位点
    'GmaPHAS19gIntergenic.1@21#1',
    'GmaPHAS19gIntergenic.1@21#2',
];
/** 靶基因明细保留的位点前缀（与 dump-demo-data.mjs 的口径一致） */
const TARGET_DEMO_PREFIX = ['OsaPHAS10g4348527.1@21#', 'GmaPHAS19gIntergenic.'];

// 物种维表，与原库 species 表一致
const SPECIES = [
    { abbr: 'osa', scientific_name: 'Oryza sativa', common_name: '水稻', common_name_en: 'Rice' },
    { abbr: 'zma', scientific_name: 'Zea mays', common_name: '玉米', common_name_en: 'Maize' },
    { abbr: 'vvi', scientific_name: 'Vitis vinifera', common_name: '葡萄', common_name_en: 'Grape' },
    { abbr: 'csi', scientific_name: 'Citrus sinensis', common_name: '柑橘', common_name_en: 'Orange' },
    { abbr: 'gma', scientific_name: 'Glycine max', common_name: '大豆', common_name_en: 'Soybean' },
    { abbr: 'ath', scientific_name: 'Arabidopsis thaliana', common_name: '拟南芥', common_name_en: 'Arabidopsis' },
    { abbr: 'ghi', scientific_name: 'Gossypium hirsutum', common_name: '棉花', common_name_en: 'Cotton' },
    { abbr: 'bna', scientific_name: 'Brassica napus', common_name: '油菜', common_name_en: 'Rapeseed' },
];
const BY_SCI = new Map(SPECIES.map((s) => [s.scientific_name, s]));

/* ---------------- 小工具 ---------------- */
// 官方导出用 '-' 表示空值；Python 端 None 会写成字面量 'None'，原库里就是这个字符串
const num = (v) => {
    if (v === '' || v === '-' || v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};
const orNull = (v) => (v === '' || v === '-' ? null : v);

function readTsv(file) {
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => l !== '');
    const head = lines[0].split('\t');
    return lines.slice(1).map((line) => {
        const c = line.split('\t');
        const o = {};
        head.forEach((h, i) => { o[h] = c[i] ?? ''; });
        return o;
    });
}

// 大文件（phasiRNA 官方导出 40 万行级）走流式，避免一次性读进内存
async function* tsvStream(file) {
    const rl = readline.createInterface({ input: fs.createReadStream(file, 'utf8'), crlfDelay: Infinity });
    let head = null;
    for await (const line of rl) {
        if (line === '') continue;
        if (!head) { head = line.split('\t'); continue; }
        const c = line.split('\t');
        const o = {};
        for (let i = 0; i < head.length; i++) o[head[i]] = c[i] ?? '';
        yield o;
    }
}

/* ---------------- 1. 位点 ---------------- */
console.log('[1/6] loci …');
const lociAll = readTsv(DATA('derived/pha_loci_all_species.tsv')).map((r) => {
    const sp = BY_SCI.get(r.species);
    if (!sp) throw new Error(`未知物种名：${r.species}`);
    return {
        phas_loci: r.phas_loci,
        species: sp.abbr,
        chromosome: r.chromosome,
        genome_start: r.genome_start,
        genome_end: r.genome_end,
        locus_gene: r.locus_gene,
        transcript: r.transcript,
        phas_gene_type: r.phas_gene_type,
        transcript_start: num(r.transcript_start),
        transcript_end: num(r.transcript_end),
        pvalue: num(r.pvalue),
        phase_score: num(r.phase_score),
        phase_ratio: num(r.phase_ratio),
        annotation: r.annotation,
        method_ref: r.method_ref,
        tag: r.tag,
        recorder: num(r.recorder),
        target_verified: r.target_verified,
        initiator_verified: r.initiator_verified,
        initiator_number: num(r.initiator_number),
        common_name: sp.common_name,
        common_name_en: sp.common_name_en,
        scientific_name: sp.scientific_name,
        seq_length: null,
    };
});

/* ---------------- 2. phasiRNA（按父位点分组） ---------------- */
console.log('[2/6] phasiRNA …');
const byParent = new Map();
for (const r of readTsv(DATA('derived/phasi_rna_seq_all_species.tsv'))) {
    if (!byParent.has(r.parent_locus)) byParent.set(r.parent_locus, []);
    byParent.get(r.parent_locus).push(r);
}

/* ---------------- 3. 位点序列 ---------------- */
console.log('[3/6] sequences …');
const seqAll = {};
{
    let cur = null;
    for (const line of fs.readFileSync(DATA('derived/phas_locus_seq_all_species.fa'), 'utf8').split(/\r?\n/)) {
        if (line.startsWith('>')) { cur = line.slice(1).trim(); seqAll[cur] = ''; }
        else if (cur && line.trim()) seqAll[cur] += line.trim();
    }
}
for (const l of lociAll) l.seq_length = seqAll[l.phas_loci] ? seqAll[l.phas_loci].length : null;

/* ---------------- 4. 选位点 ---------------- */
console.log('[4/6] select loci …');
const picked = new Set(MUST);
const realCount = new Map();
for (const sp of SPECIES) {
    const rows = lociAll
        .filter((l) => l.species === sp.abbr)
        .map((l) => ({ l, n: (byParent.get(l.phas_loci) || []).length }))
        .sort((a, b) => b.n - a.n || a.l.recorder - b.l.recorder);
    realCount.set(sp.abbr, rows.length);
    for (const r of rows.slice(0, PER_SPECIES)) picked.add(r.l.phas_loci);
}
const loci = lociAll.filter((l) => picked.has(l.phas_loci));

/* ---------------- 5. 明细行 ---------------- */
console.log('[5/6] detail rows …');
const phasiRna = [];
for (const l of loci) {
    for (const r of byParent.get(l.phas_loci) || []) {
        const sp = BY_SCI.get(r.species);
        phasiRna.push({
            phasi_rna: r.phasi_rna,
            species: sp.abbr,
            parent_locus: r.parent_locus,
            sequence: r.sequence,
            length: r.sequence.length,
            common_name: sp.common_name,
            common_name_en: sp.common_name_en,
            scientific_name: sp.scientific_name,
            locus_gene: l.locus_gene,
            transcript: l.transcript,
            annotation: l.annotation,
        });
    }
}
const sequences = {};
for (const l of loci) if (seqAll[l.phas_loci]) sequences[l.phas_loci] = seqAll[l.phas_loci];

// initiator：官方文件只有水稻和大豆；其余 6 物种用 scraped/initiator_scraped.tsv
// （2026-10-16 从老站公开页面抓取，已与官方文件交叉验证一致）。
// 注意：官方导出按降解组库重复记录（同一 miRNA 多行），老站页面是 DISTINCT 语义，
// 所以这里按 11 个正文字段去重，保证 demo 与原站展示一致。
const initiators = [];
let iniId = 0;
const iniSeen = new Set();
const pushInitiator = (r, abbr) => {
    const phasGene = r.phas_gene ?? r.PHAS_Gene;
    const mirna = r.mirna ?? r.miRNA;
    const geneid = r.geneid ?? r.GeneID;
    const cleavege = r.cleavege_site ?? r.Cleavege_site;
    const tpe = r.target_pos_end ?? r.Target_pos_end;
    const posmax = r.posmax_min ?? r.Posmax_min;
    const dist = r.distance ?? r.Distance;
    const seq = r.initiator_seq ?? r.Initiator_seq;
    const len = r.initiator_len ?? r.Initiator_len;
    const marker = r.recordmarker ?? r.Recordmarker;
    const verified = r.verified ?? r.Verified;
    const key = [phasGene, mirna, geneid, cleavege, tpe, posmax, dist, seq, len, marker, verified].join('\u0001');
    if (iniSeen.has(key)) return;
    iniSeen.add(key);
    if (!picked.has(phasGene)) return;
    const sp = SPECIES.find((s) => s.abbr === abbr);
    initiators.push({
        id: ++iniId,
        species: abbr,
        phas_gene: phasGene,
        mirna,
        geneid,
        cleavege_site: num(cleavege),
        target_pos_end: num(tpe),
        posmax_min: num(posmax),
        distance: num(dist),
        initiator_seq: seq,
        initiator_len: num(len),
        verified,
        common_name: sp.common_name,
        common_name_en: sp.common_name_en,
        scientific_name: sp.scientific_name,
    });
};
for (const [abbr, file] of [['osa', 'osa_database_initiator.txt'], ['gma', 'gma_database_initiator.txt']]) {
    for (const r of readTsv(DATA(`raw/${file}`))) pushInitiator(r, abbr);
}
// 其余 6 物种：抓取数据（列名已是小写下划线）
{
    const fp = DATA('scraped/initiator_scraped.tsv');
    if (fs.existsSync(fp)) {
        let n = 0;
        for (const r of readTsv(fp)) {
            if (r.species === 'osa' || r.species === 'gma') continue; // 这两个物种用官方文件
            pushInitiator(r, r.species);
            n++;
        }
        console.log(`  initiator: +${n} 行抓取数据（6 物种，去重后入快照）`);
    }
}

// 用去重后的 initiator 记录重算演示位点的 initiator_number：
// derived 里这个字段有列错位（2026-10-16 抽样 770 个位点发现 327 个少算），
// 以真实记录数为准。
{
    const cnt = new Map();
    for (const i of initiators) cnt.set(i.phas_gene, (cnt.get(i.phas_gene) || 0) + 1);
    let fixed = 0;
    for (const l of loci) {
        const n = cnt.get(l.phas_loci);
        if (n !== undefined && l.initiator_number !== n) {
            l.initiator_number = n;
            fixed++;
        }
    }
    console.log(`  initiator_number: 重算 ${fixed} 个演示位点（原 derived 值有错位）`);
}

// 靶基因：全量流式扫一遍官方导出，只要两类信息
//   a) 每个入选 phasiRNA 的聚合数（位点表格的"靶基因数"列要用）
//   b) 两个演示位点的完整明细行（详情页要用）
const wantedPhasi = new Set(phasiRna.map((p) => p.phasi_rna));
const targetAgg = new Map();
const targetsDemo = [];
for (const [abbr, file] of [['osa', 'osa_database_phasiRNA.txt'], ['gma', 'gma_database_phasiRNA.txt']]) {
    for await (const r of tsvStream(DATA(`raw/${file}`))) {
        const id = r.PhasiRNA;
        if (!wantedPhasi.has(id)) continue;

        let a = targetAgg.get(id);
        if (!a) {
            a = {
                phasi_rna: id, start_in_transcript: null, end_in_transcript: null,
                strand: null, verified_target_num: null, target_verified: false,
                _targets: new Set(),
            };
            targetAgg.set(id, a);
        }
        const s = num(r.Start_in_Transcript);
        const e = num(r.End_in_Transcript);
        if (s !== null) a.start_in_transcript = a.start_in_transcript === null ? s : Math.min(a.start_in_transcript, s);
        if (e !== null) a.end_in_transcript = a.end_in_transcript === null ? e : Math.max(a.end_in_transcript, e);
        if (r.Strand) a.strand = r.Strand;
        const vn = num(r.Verified_Target_Num);
        if (vn !== null) a.verified_target_num = a.verified_target_num === null ? vn : Math.max(a.verified_target_num, vn);
        if (orNull(r.Verified_Target)) a._targets.add(r.Verified_Target);
        if (r.T_Verified === 'yes') a.target_verified = true;

        if (TARGET_DEMO_PREFIX.some((p) => id.startsWith(p))) {
            targetsDemo.push({
                phasi_rna: id,
                species: abbr,
                chromosome: orNull(r.Chromosome),
                genome_start: orNull(r.Genome_Start),
                genome_end: orNull(r.Genome_End),
                strand: orNull(r.Strand),
                sequence: r.Sequence,
                length: num(r.Length),
                phas_loci: r.PHAS_Loci,
                transcript_id: orNull(r.Transcript_id),
                start_in_transcript: num(r.Start_in_Transcript),
                end_in_transcript: num(r.End_in_Transcript),
                t_verified: r.T_Verified,
                verified_target_num: num(r.Verified_Target_Num),
                verified_target: orNull(r.Verified_Target),
                degradome_lib: orNull(r.Degradome_Lib),
                category: orNull(r.Category),
                smallrna_loc: orNull(r.SmallRNA_Loc),
                deg_loc: orNull(r.Deg_Loc),
                deg_count: num(r.Deg_Count),
                shift: num(r.Shift),
                t_plot: orNull(r.T_plot),
            });
        }
    }
}
for (const a of targetAgg.values()) {
    a.target_count = a._targets.size;
    delete a._targets;
}

/* ---------------- 6. species / totals ---------------- */
console.log('[6/6] stats …');
const species = SPECIES.map((sp) => {
    const ls = loci.filter((l) => l.species === sp.abbr);
    return {
        abbr: sp.abbr,
        scientific_name: sp.scientific_name,
        common_name: sp.common_name,
        common_name_en: sp.common_name_en,
        phas_loci: ls.length,
        phasi_rna: phasiRna.filter((p) => p.species === sp.abbr).length,
        loci_target_verified: ls.filter((l) => l.target_verified === 'yes').length,
        loci_initiator_verified: ls.filter((l) => l.initiator_verified === 'yes').length,
    };
}).sort((a, b) => b.phas_loci - a.phas_loci || (realCount.get(b.abbr) - realCount.get(a.abbr)));

const totals = {
    species_count: species.length,
    phas_loci: loci.length,
    phasi_rna: phasiRna.length,
    phasi_rna_target: [...targetAgg.values()].reduce((n, a) => n + a.target_count, 0),
    initiator: initiators.length,
    initiator_verified: loci.filter((l) => l.initiator_verified === 'yes').length,
    target_verified: loci.filter((l) => l.target_verified === 'yes').length,
};

/* ---------------- 写出 ---------------- */
const D = {
    species, totals,
    atlas: null,      // 演示版不含图鉴页
    tree: null,       // 演示版不含系统树
    loci, sequences, phasiRna,
    targetAgg: [...targetAgg.values()],
    targetsDemo,
    initiators,
};

fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
fs.writeFileSync(OUT_JSON, JSON.stringify(D));
const jsonMB = (fs.statSync(OUT_JSON).size / 1048576).toFixed(2);

// 单文件演示版要把数据 gzip + base64 后内嵌（见 src/demo/mockApi.js）
fs.writeFileSync(OUT_B64, zlib.gzipSync(fs.readFileSync(OUT_JSON), { level: 9 }).toString('base64'));
const b64KB = (fs.statSync(OUT_B64).size / 1024).toFixed(0);

console.log(`done: ${loci.length} loci / ${phasiRna.length} phasiRNA / ${initiators.length} initiators / ${targetsDemo.length} target detail rows`);
console.log(`  ${OUT_JSON}  ${jsonMB} MB`);
console.log(`  ${OUT_B64}  ${b64KB} KB`);
