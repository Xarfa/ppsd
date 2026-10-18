/**
 * JS 近似比对引擎（保留版）。
 *
 * 原站用的是 NCBI blast+ 二进制。这个引擎不依赖任何外部程序，
 * 用 JavaScript 对 PostgreSQL 实现「种子筛选 + 局部比对」：
 *
 *   1. 长度下界 + SQL 层 k-mer 预筛（用 PG 的 strpos，C 实现，很快）
 *   2. 取回候选后，在 JS 里统计种子命中密度
 *   3. 只对种子最密的一批跑 Smith-Waterman，拿到真实得分与对齐串
 *   4. 正负链都试，取分高的那条
 *
 * ⚠️ 这不是 NCBI BLAST。打分方案固定（见下方常量），E 值是近似公式而非
 *    Karlin-Altschul 统计量。页面必须标明这一点。
 *
 * 保留它的原因：Windows 本机没有 Linux 版 blastn，开发时用它；
 * 服务器上如果 NCBI 不可用，也可以作为兜底。
 */
import { query } from '../db/index.js';
import { DATABASES } from './databases.js';
import { attachAnnotations } from './annotate.js';

// ---------------------------------------------------------------------------
// 参数
// ---------------------------------------------------------------------------

/** 打分方案：匹配 +2，错配 −1，开空位 −3，延伸空位 −1 */
const MATCH = 2;
const MISMATCH = -1;
const GAP_OPEN = -3;
const GAP_EXTEND = -1;

/**
 * 种子长度随查询长度自适应。
 * 查询短（21 nt 的 phasiRNA）时必须用小 k，否则切不出种子；
 * 查询长时必须用大 k，否则随机命中太多。
 */
function seedLength(qlen) {
    if (qlen < 30) return 11;
    return Math.min(21, Math.max(11, Math.floor(qlen / 12)));
}

/** 送去做 SQL 预筛的 k-mer 个数上限。太多会让 SQL 变长变慢。 */
const MAX_PREFILTER_KMERS = 16;

/** 最多对多少条候选跑 Smith-Waterman（按种子密度排序后取前 N） */
const MAX_ALIGN_CANDIDATES = 500;

/** 单次 SW 的规模上限，超了就在种子附近开窗 */
const MAX_ALIGN_CELLS = 400000;

/**
 * E 值近似公式的常数。真正的 Karlin-Altschul λ/K 要按打分矩阵标定，
 * 这里取经验值 —— 只保证「随得分单调下降、随候选规模线性上升」，
 * 数值本身不能和 BLAST 的 E 值直接比。
 */
const LAMBDA_APPROX = 0.62;
const K_APPROX = 0.5;

// ---------------------------------------------------------------------------
// 序列工具
// ---------------------------------------------------------------------------

const COMPLEMENT = {
    A: 'T', T: 'A', G: 'C', C: 'G', U: 'A', N: 'N',
    R: 'Y', Y: 'R', K: 'M', M: 'K', S: 'S', W: 'W',
    B: 'V', V: 'B', D: 'H', H: 'D',
};

/** 反向互补。比对另一条链要用。 */
function reverseComplement(seq) {
    let out = '';
    for (let i = seq.length - 1; i >= 0; i--) out += COMPLEMENT[seq[i]] || 'N';
    return out;
}

/** 取一个序列的全部 k-mer，放进 Set 做成员判断 */
function kmerSet(seq, k) {
    const set = new Set();
    for (let i = 0; i + k <= seq.length; i++) set.add(seq.slice(i, i + k));
    return set;
}

/**
 * 从查询序列里挑几个 k-mer 送去做 SQL 预筛。
 * 均匀取样而不是取开头几个 —— 序列一端可能带重复片段。
 */
function sampleKmers(seq, k, n = MAX_PREFILTER_KMERS) {
    const total = seq.length - k + 1;
    if (total <= 0) return [];
    if (total <= n) {
        const all = [];
        for (let i = 0; i < total; i++) all.push(seq.slice(i, i + k));
        return [...new Set(all)];
    }
    const step = Math.floor(total / n);
    const out = new Set();
    for (let i = 0; i < total && out.size < n; i += step) out.add(seq.slice(i, i + k));
    return [...out];
}

/**
 * Smith-Waterman 局部比对（带回溯）。
 * 两行滚动数组算分 + 方向位图回溯，40 万格也只占几百 KB。
 */
function smithWaterman(a, b, { offsetB = 0 } = {}) {
    const n = a.length;
    const m = b.length;
    if (n === 0 || m === 0) return null;

    const width = m + 1;
    let prev = new Int32Array(width);
    let curr = new Int32Array(width);
    const trace = new Uint8Array((n + 1) * width); // 0=停 1=对角 2=上 3=左

    let best = 0;
    let bestI = 0;
    let bestJ = 0;

    for (let i = 1; i <= n; i++) {
        const ai = a[i - 1];
        const rowBase = i * width;
        const prevBase = (i - 1) * width;
        curr[0] = 0;
        for (let j = 1; j <= m; j++) {
            const diag = prev[j - 1] + (ai === b[j - 1] ? MATCH : MISMATCH);
            const up = prev[j] + (trace[prevBase + j] === 3 ? GAP_EXTEND : GAP_OPEN);
            const left = curr[j - 1] + (trace[rowBase + j - 1] === 2 ? GAP_EXTEND : GAP_OPEN);

            let score = 0;
            let dir = 0;
            if (diag > score) { score = diag; dir = 1; }
            if (up > score) { score = up; dir = 2; }
            if (left > score) { score = left; dir = 3; }

            curr[j] = score;
            trace[rowBase + j] = dir;

            if (score > best) { best = score; bestI = i; bestJ = j; }
        }
        const tmp = prev;
        prev = curr;
        curr = tmp;
    }

    if (best === 0) return null;

    // 回溯，收集对齐串
    let i = bestI;
    let j = bestJ;
    const qa = [];
    const sa = [];
    const mid = [];
    let mismatches = 0;
    let gaps = 0;

    while (i > 0 && j > 0 && trace[i * width + j] !== 0) {
        const dir = trace[i * width + j];
        if (dir === 1) {
            qa.push(a[i - 1]);
            sa.push(b[j - 1]);
            if (a[i - 1] === b[j - 1]) mid.push('|');
            else { mid.push('.'); mismatches++; }
            i--; j--;
        } else if (dir === 2) {
            qa.push(a[i - 1]); sa.push('-'); mid.push(' '); gaps++; i--;
        } else {
            qa.push('-'); sa.push(b[j - 1]); mid.push(' '); gaps++; j--;
        }
    }

    qa.reverse(); sa.reverse(); mid.reverse();
    const aligned = qa.length;
    const matches = mid.reduce((n2, c) => n2 + (c === '|' ? 1 : 0), 0);

    return {
        score: best,
        mismatches,
        gaps,
        alignedLength: aligned,
        identity: aligned ? matches / aligned : 0,
        queryAligned: qa.join(''),
        subjectAligned: sa.join(''),
        midline: mid.join(''),
        queryStart: i + 1,
        queryEnd: bestI,
        // subject 可能是窗口截出来的，坐标要还原到原始序列上
        subjectStart: j + 1 + offsetB,
        subjectEnd: bestJ + offsetB,
    };
}

/** 统计 subject 里命中查询 k-mer 集合的次数（种子密度，用来排序候选） */
function countSeeds(queryKmerSet, subject, k) {
    let n = 0;
    for (let i = 0; i + k <= subject.length; i++) {
        if (queryKmerSet.has(subject.slice(i, i + k))) n++;
    }
    return n;
}

/** 第一个种子命中的位置，用来决定 SW 的开窗位置 */
function firstSeedPos(queryKmerSet, subject, k) {
    for (let i = 0; i + k <= subject.length; i++) {
        if (queryKmerSet.has(subject.slice(i, i + k))) return i;
    }
    return -1;
}

/**
 * 取候选序列。
 * 两道筛选都在数据库侧完成，不把整张表拉进内存：
 *   ① 长度下界
 *   ② strpos 预筛 —— subject 必须含有查询的至少一个采样 k-mer
 */
async function fetchCandidates(spec, qlen, species, seedKmers) {
    const params = [];
    const where = [];

    params.push(spec.minLen(qlen));
    where.push(`q.length >= $${params.length}`);

    const maxLen = spec.maxLen(qlen);
    if (maxLen !== null) {
        params.push(maxLen);
        where.push(`q.length <= $${params.length}`);
    }

    if (seedKmers.length) {
        const ors = seedKmers.map((km) => {
            params.push(km);
            return `strpos(q.sequence, $${params.length}) > 0`;
        });
        where.push(`(${ors.join(' OR ')})`);
    }

    const speciesExpr = spec.joinSpecies ? 'c.species' : 'q.species';
    const join = spec.joinSpecies ? 'JOIN clusters c ON c.phas_loci = q.phas_loci' : '';

    if (species) {
        params.push(species);
        where.push(`${speciesExpr} = $${params.length}`);
    }

    const sql = `
    SELECT q.${spec.idCol} AS id,
           ${speciesExpr} AS species,
           ${spec.parentCol ? `q.${spec.parentCol}` : `q.${spec.idCol}`} AS parent,
           q.sequence, q.length
    FROM ${spec.table} q
    ${join}
    WHERE ${where.join(' AND ')}
  `;
    const { rows } = await query(sql, params);
    return rows;
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

/**
 * @param {object} opts
 * @param {string} opts.sequence      已校验的纯序列
 * @param {string} opts.database      内部库 key：phasi_rna / phas_seq
 * @param {string|null} opts.species  物种缩写，可选
 * @param {number} opts.maxHits       最多返回多少条
 */
export async function runJs({ sequence: seq, database: dbKey = 'phasi_rna', species = null, maxHits = 50 }) {
    const started = Date.now();
    const spec = DATABASES[dbKey];
    if (!spec) throw new Error(`unknown database "${dbKey}"`);

    const limit = Math.min(Math.max(Number.parseInt(maxHits, 10) || 50, 1), 500);
    const k = seedLength(seq.length);
    const rcSeq = reverseComplement(seq);

    const fwdKmers = kmerSet(seq, k);
    const revKmers = kmerSet(rcSeq, k);

    // SQL 预筛用的采样 k-mer：两条链都要带上，否则会漏掉反向命中的记录
    const prefilterKmers = [...new Set([...sampleKmers(seq, k), ...sampleKmers(rcSeq, k)])].slice(
        0,
        MAX_PREFILTER_KMERS,
    );

    const candidates = await fetchCandidates(spec, seq.length, species, prefilterKmers);
    const scanned = candidates.length;

    // ---- 统计种子密度，按密度排序后只对前 N 条跑 SW ----
    const scored = [];
    for (const cand of candidates) {
        const subject = String(cand.sequence || '').toUpperCase();
        if (subject.length < k) continue;
        const nFwd = countSeeds(fwdKmers, subject, k);
        const nRev = countSeeds(revKmers, subject, k);
        if (nFwd === 0 && nRev === 0) continue;
        scored.push({ cand, subject, nFwd, nRev, seeds: nFwd + nRev });
    }
    scored.sort((a, b) => b.seeds - a.seeds);
    const toAlign = scored.slice(0, MAX_ALIGN_CANDIDATES);

    // ---- 局部比对 ----
    const hits = [];
    for (const { cand, subject, nFwd, nRev } of toAlign) {
        const results = [];
        for (const [strand, querySeq, kset, hasSeed] of [
            ['+', seq, fwdKmers, nFwd > 0],
            ['-', rcSeq, revKmers, nRev > 0],
        ]) {
            if (!hasSeed) continue;

            let windowSeq = subject;
            let offsetB = 0;
            if (querySeq.length * subject.length > MAX_ALIGN_CELLS) {
                const pos = firstSeedPos(kset, subject, k);
                if (pos < 0) continue;
                const pad = querySeq.length + k;
                const from = Math.max(0, pos - pad);
                const to = Math.min(subject.length, pos + k + pad);
                windowSeq = subject.slice(from, to);
                offsetB = from;
            }

            const aln = smithWaterman(querySeq, windowSeq, { offsetB });
            if (aln) results.push({ strand, aln });
        }
        if (!results.length) continue;

        results.sort((x, y) => y.aln.score - x.aln.score);
        const winner = results[0];

        // E 值近似：与查询长度、候选规模成正比，与得分指数反比。
        // ⚠️ 近似值，不是 Karlin-Altschul 统计量。
        const evalue =
            K_APPROX * seq.length * (scanned || 1) * Math.exp(-LAMBDA_APPROX * winner.aln.score);

        hits.push({
            id: cand.id,
            species: cand.species,
            parentLocus: cand.parent,
            subjectLength: subject.length,
            strand: winner.strand,
            score: winner.aln.score,
            identity: winner.aln.identity,
            mismatches: winner.aln.mismatches,
            gaps: winner.aln.gaps,
            alignedLength: winner.aln.alignedLength,
            // 覆盖度：局部比对会主动裁掉两端，identity=100% 可能只在很少的碱基上成立
            queryCoverage: winner.aln.alignedLength / seq.length,
            subjectCoverage: winner.aln.alignedLength / subject.length,
            seedCount: nFwd + nRev,
            evalue,
            queryAligned: winner.aln.queryAligned,
            subjectAligned: winner.aln.subjectAligned,
            midline: winner.aln.midline,
            queryStart: winner.aln.queryStart,
            queryEnd: winner.aln.queryEnd,
            subjectStart: winner.aln.subjectStart,
            subjectEnd: winner.aln.subjectEnd,
        });
    }

    hits.sort((a, b) => b.score - a.score || a.evalue - b.evalue);
    const top = hits.slice(0, limit);
    await attachAnnotations(top);

    const response = {
        engine: 'js',
        engineVersion: 'JS seed-and-extend',
        query: { sequence: seq, length: seq.length, reverseComplement: rcSeq },
        database: dbKey,
        databaseLabel: spec.label,
        seedLength: k,
        // totalScanned 是经过 SQL 预筛后进入 JS 的候选数，不是全表行数
        totalScanned: scanned,
        totalHits: hits.length,
        returned: top.length,
        tookMs: Date.now() - started,
        hits: top,
    };

    const warnings = [];
    if (hits.length > top.length) {
        warnings.push(`Showing the top ${top.length} of ${hits.length} hits.`);
    }
    if (scored.length > MAX_ALIGN_CANDIDATES) {
        warnings.push(
            `${scored.length} candidates shared a seed but only the ${MAX_ALIGN_CANDIDATES} ` +
                `with the densest seeds were aligned.`,
        );
    }
    if (warnings.length) response.warning = warnings.join(' ');

    return response;
}

/** 页面上的说明文字（两个引擎共用一份，避免前后端文案不一致） */
export const JS_SCORING = { match: MATCH, mismatch: MISMATCH, gapOpen: GAP_OPEN, gapExtend: GAP_EXTEND };
