/**
 * 「单文件演示版」的本地数据适配器。
 *
 * 构建时把快照数据（位点 + 序列 + phasiRNA + initiator + 统计聚合）
 * gzip 后内嵌进来；运行时用 DecompressionStream 解压一次，之后所有
 * 检索/排序/分页/详情/比对都在浏览器内存里完成 —— 双击 HTML 即可用，
 * 不需要任何后端。
 *
 * 快照裁剪说明（相对完整版，见 backend/scripts/build-demo-snapshot.mjs）：
 *   - 位点/phasiRNA：每物种按 phasiRNA 数量取前 20 + 5 个演示位点
 *   - 靶基因明细只保留演示位点（OsaPHAS10g4348527 / GmaPHAS19gIntergenic）；
 *     其余 phasiRNA 保留聚合信息（Browse/位点表格完整可用），
 *     详情页的靶基因明细会提示为快照裁剪
 *   - 统计图鉴（atlas）与系统发育树（tree）不在快照内，页面会给出提示
 *   - 序列比对（blast）与后端同算法，直接在内存快照上跑，功能完整
 */
import demoDataBase64 from './demo-data.b64.txt?raw'

let _data = null
let _ready = null

/** 解压 + 解析 + 建索引（只做一次） */
async function getData() {
    if (_data) return _data
    if (!_ready) {
        _ready = (async () => {
            const bin = Uint8Array.from(atob(demoDataBase64), (c) => c.charCodeAt(0))
            const ds = new DecompressionStream('gzip')
            const stream = new Blob([bin]).stream().pipeThrough(ds)
            const text = await new Response(stream).text()
            const d = JSON.parse(text)
            d._phasiByLocus = new Map()
            for (const p of d.phasiRna) {
                if (!d._phasiByLocus.has(p.parent_locus)) d._phasiByLocus.set(p.parent_locus, [])
                d._phasiByLocus.get(p.parent_locus).push(p)
            }
            d._phasiCount = new Map()
            for (const [locus, arr] of d._phasiByLocus) d._phasiCount.set(locus, arr.length)
            d._targetAggById = new Map(d.targetAgg.map((t) => [t.phasi_rna, t]))
            d._initiatorsByLocus = new Map()
            for (const it of d.initiators) {
                if (!d._initiatorsByLocus.has(it.phas_gene)) d._initiatorsByLocus.set(it.phas_gene, [])
                d._initiatorsByLocus.get(it.phas_gene).push(it)
            }
            d._phasiBySeq = new Map()
            for (const p of d.phasiRna) {
                if (!p.sequence) continue
                if (!d._phasiBySeq.has(p.sequence)) d._phasiBySeq.set(p.sequence, [])
                d._phasiBySeq.get(p.sequence).push(p)
            }
            _data = d
            return d
        })()
    }
    return _ready
}

const like = (s) => String(s ?? '').toLowerCase()
const nf = (n) => n

/* ---------------- 统计 / 物种 / 树 ---------------- */
async function species() {
    const d = await getData()
    return { count: d.species.length, species: d.species }
}

async function stats() {
    const d = await getData()
    return {
        totals: d.totals,
        bySpecies: d.species.map((s) => ({
            abbr: s.abbr, scientific_name: s.scientific_name,
            common_name: s.common_name, common_name_en: s.common_name_en,
            phas_loci: s.phas_loci, phasi_rna: s.phasi_rna,
        })),
    }
}

async function statsAtlas() {
    const d = await getData()
    return d.atlas
}

async function speciesTree() {
    const d = await getData()
    return { tree: d.tree }
}

/* ---------------- 位点列表（过滤/排序/分页全部本地实现） ---------------- */
const SORTABLE = new Set([
    'recorder', 'phas_loci', 'chromosome', 'genome_start', 'genome_end', 'locus_gene',
    'transcript', 'phas_gene_type', 'pvalue', 'phase_score', 'phase_ratio',
    'annotation', 'target_verified', 'initiator_verified', 'initiator_number',
    'phasi_rna_count',
])

async function loci(params = {}) {
    const d = await getData()
    const {
        species = '', q = '', sort = 'recorder', order = 'asc',
        page = 1, pageSize = 25,
    } = params

    let rows = d.loci
    if (species) rows = rows.filter((r) => r.species === species)
    if (q) {
        const k = like(q)
        rows = rows.filter((r) =>
            like(r.phas_loci).includes(k) ||
            like(r.locus_gene).includes(k) ||
            like(r.transcript).includes(k) ||
            like(r.annotation).includes(k))
    }

    const sortKey = SORTABLE.has(sort) ? sort : 'recorder'
    const dir = order === 'desc' ? -1 : 1
    rows = [...rows].sort((a, b) => {
        let va = sortKey === 'phasi_rna_count' ? (d._phasiCount.get(a.phas_loci) || 0) : a[sortKey]
        let vb = sortKey === 'phasi_rna_count' ? (d._phasiCount.get(b.phas_loci) || 0) : b[sortKey]
        if (va === null || va === undefined) return 1   // NULLS LAST
        if (vb === null || vb === undefined) return -1
        if (typeof va === 'string') { va = like(va); vb = like(vb) }
        return va < vb ? -1 * dir : va > vb ? dir : (a.phas_loci < b.phas_loci ? -1 : 1)
    })

    const size = pageSize
    const total = rows.length
    const pageCount = Math.max(1, Math.ceil(total / size))
    const p = Math.min(Math.max(1, page), pageCount)
    const slice = rows.slice((p - 1) * size, p * size).map((r) => ({
        ...r,
        phasi_rna_count: d._phasiCount.get(r.phas_loci) || 0,
    }))
    return { total, page: p, pageSize: size, pageCount, rows: slice }
}

async function locus(id) {
    const d = await getData()
    const row = d.loci.find((r) => r.phas_loci === id)
    if (!row) {
        const err = new Error(`PHAS locus not found: ${id}`)
        err.response = { status: 404 }
        throw err
    }
    return {
        ...row,
        phasi_rna_count: d._phasiCount.get(id) || 0,
        initiator_count: (d._initiatorsByLocus.get(id) || []).length,
        sequence: d.sequences[id] || null,
    }
}

async function locusPhasiRna(id, params = {}) {
    const d = await getData()
    const page = Math.max(1, params.page || 1)
    const pageSize = Math.min(Math.max(1, params.pageSize || 25), 500)
    const children = (d._phasiByLocus.get(id) || []).map((p) => {
        const agg = d._targetAggById.get(p.phasi_rna)
        return {
            phasi_rna: p.phasi_rna,
            sequence: p.sequence,
            length: p.length,
            start_in_transcript: agg ? agg.start_in_transcript : null,
            end_in_transcript: agg ? agg.end_in_transcript : null,
            strand: agg ? agg.strand : null,
            verified_target_num: agg ? agg.verified_target_num : null,
            target_count: agg ? agg.target_count : 0,
            target_verified: agg ? !!agg.target_verified : false,
        }
    })
    children.sort((a, b) => (a.start_in_transcript ?? 1e15) - (b.start_in_transcript ?? 1e15))
    const total = children.length
    const pageCount = Math.max(1, Math.ceil(total / pageSize))
    const p = Math.min(page, pageCount)
    return { total, page: p, pageSize, pageCount, rows: children.slice((p - 1) * pageSize, p * pageSize) }
}

async function locusInitiators(id) {
    const d = await getData()
    return { rows: d._initiatorsByLocus.get(id) || [] }
}

async function phasiRna(id) {
    const d = await getData()
    const row = d.phasiRna.find((p) => p.phasi_rna === id)
    if (!row) {
        const err = new Error(`phasiRNA not found: ${id}`)
        err.response = { status: 404 }
        throw err
    }
    const agg = d._targetAggById.get(id)
    const targets = d.targetsDemo.filter((t) => t.phasi_rna === id)
    return {
        ...row,
        target_count: agg ? agg.target_count : 0,
        targets,
        demoTrimmed: targets.length === 0 && agg && agg.target_count > 0,
    }
}

/* ---------------- 综合搜索 ---------------- */
function locusSearchRow(d, r) {
    return {
        kind: 'locus', id: r.phas_loci, species: r.species,
        common_name: r.common_name, common_name_en: r.common_name_en,
        chromosome: r.chromosome, genome_start: r.genome_start, genome_end: r.genome_end,
        locus_gene: r.locus_gene, transcript: r.transcript,
        phase_score: r.phase_score, annotation: r.annotation,
    }
}

async function search(params = {}) {
    const d = await getData()
    const q = like(params.q || '')
    if (!q) return { q: params.q, type: null, count: 0, rows: [] }
    const type = params.type || 'all'
    const limit = params.limit || 25
    const want = (t) => type === 'all' || type === t
    const out = []
    const cap = type === 'all' ? 8 : limit

    if (want('locus') || want('gene') || want('transcript') || want('annotation')) {
        const hitLoci = d.loci.filter((r) =>
            like(r.phas_loci).includes(q) || like(r.locus_gene).includes(q) ||
            like(r.transcript).includes(q) || like(r.annotation).includes(q))
        if (want('locus')) out.push(...hitLoci.slice(0, cap).map((r) => locusSearchRow(d, r)))
        if (want('gene')) out.push(...hitLoci.filter((r) => like(r.locus_gene).includes(q)).slice(0, cap).map((r) => ({ ...locusSearchRow(d, r), kind: 'gene', id: r.locus_gene })))
        if (want('transcript')) out.push(...hitLoci.filter((r) => like(r.transcript).includes(q)).slice(0, cap).map((r) => ({ ...locusSearchRow(d, r), kind: 'transcript', id: r.transcript })))
        if (want('annotation')) out.push(...hitLoci.filter((r) => like(r.annotation).includes(q)).slice(0, cap).map((r) => locusSearchRow(d, r)))
    }
    if (want('phasiRNA')) {
        const hits = d.phasiRna.filter((p) => like(p.phasi_rna).includes(q) || like(p.sequence).includes(q))
        out.push(...hits.slice(0, cap).map((p) => ({
            kind: 'phasiRNA', id: p.phasi_rna, species: p.species,
            common_name: p.common_name, common_name_en: p.common_name_en,
            chromosome: null, sequence: p.sequence, phase_score: null,
            annotation: p.annotation, locus_gene: p.locus_gene, transcript: p.transcript,
        })))
    }
    if (want('mirna')) {
        const hits = d.initiators.filter((it) => like(it.mirna).includes(q))
        const locusById = new Map(d.loci.map((r) => [r.phas_loci, r]))
        out.push(...hits.slice(0, cap).map((it) => {
            const loc = locusById.get(it.phas_gene)
            return {
                kind: 'mirna', id: it.phas_gene, mirna: it.mirna, species: it.species,
                common_name: it.common_name, common_name_en: it.common_name_en,
                chromosome: loc?.chromosome ?? null,
                genome_start: loc?.genome_start ?? null, genome_end: loc?.genome_end ?? null,
                phase_score: loc?.phase_score ?? null, annotation: loc?.annotation ?? null,
            }
        }))
    }
    return { q: params.q, type, count: out.length, rows: out.slice(0, limit) }
}

async function searchRegion(params = {}) {
    const d = await getData()
    const { species, chrom, start, end } = params
    const s = Math.min(+start, +end)
    const e = Math.max(+start, +end)
    const rows = d.loci
        .filter((r) => r.species === species && String(r.chromosome) === String(chrom))
        .filter((r) => {
            const lo = Math.min(r.genome_start, r.genome_end)
            const hi = Math.max(r.genome_start, r.genome_end)
            return lo <= e && hi >= s
        })
        .slice(0, 200)
        .map((r) => ({
            phas_loci: r.phas_loci, species: r.species,
            common_name: r.common_name, common_name_en: r.common_name_en,
            chromosome: r.chromosome, genome_start: r.genome_start, genome_end: r.genome_end,
            locus_gene: r.locus_gene, transcript: r.transcript,
            phase_score: r.phase_score, annotation: r.annotation,
        }))
    return { rows }
}

/* ---------------- 序列比对（与后端同算法，数据源换成内存快照） ----------------
   算法从 backend/src/routes/blast.js 原样移植：种子长度自适应、正负双链、
   Smith-Waterman 局部比对、E 值近似公式全部一致。差别只在候选来源 ——
   后端用 SQL 预筛，这里直接扫内嵌快照（几千条短序列，浏览器里是毫秒级）。
   ⚠️ 同样不是 NCBI BLAST：打分固定，E 值是近似值。 */

const MATCH = 2
const MISMATCH = -1
const GAP_OPEN = -3
const GAP_EXTEND = -1
const LAMBDA_APPROX = 0.62
const K_APPROX = 0.5
const MAX_QUERY_LEN = 5000
const MAX_ALIGN_CANDIDATES = 500
const MAX_ALIGN_CELLS = 400000
const VALID_DNA = /^[ACGTUNRYKMSWBDHV]+$/

/** 两张可检索的库（与后端 DATABASES 一致；长度筛选规则也一致） */
const DATABASES = {
    phasi_rna: { label: 'phasiRNA', minLen: () => 1, maxLen: () => 200 },
    phas_seq: {
        label: 'PHAS loci',
        // ⚠️ 只有下界没有上界：查询可以被"包含"在长位点里
        minLen: (qlen) => Math.max(20, Math.floor(qlen * 0.5)),
        maxLen: () => null,
    },
}

const COMPLEMENT = {
    A: 'T', T: 'A', G: 'C', C: 'G', U: 'A', N: 'N',
    R: 'Y', Y: 'R', K: 'M', M: 'K', S: 'S', W: 'W',
    B: 'V', V: 'B', D: 'H', H: 'D',
}

function reverseComplement(seq) {
    let out = ''
    for (let i = seq.length - 1; i >= 0; i--) out += COMPLEMENT[seq[i]] || 'N'
    return out
}

function seedLength(qlen) {
    if (qlen < 30) return 11
    return Math.min(21, Math.max(11, Math.floor(qlen / 12)))
}

function kmerSet(seq, k) {
    const set = new Set()
    for (let i = 0; i + k <= seq.length; i++) set.add(seq.slice(i, i + k))
    return set
}

/** Smith-Waterman 局部比对（两行滚动数组 + 方向位图回溯，不存完整矩阵） */
function smithWaterman(a, b, { offsetB = 0 } = {}) {
    const n = a.length
    const m = b.length
    if (n === 0 || m === 0) return null

    const width = m + 1
    let prev = new Int32Array(width)
    let curr = new Int32Array(width)
    const trace = new Uint8Array((n + 1) * width)

    let best = 0
    let bestI = 0
    let bestJ = 0

    for (let i = 1; i <= n; i++) {
        const ai = a[i - 1]
        const rowBase = i * width
        const prevBase = (i - 1) * width
        curr[0] = 0
        for (let j = 1; j <= m; j++) {
            const diag = prev[j - 1] + (ai === b[j - 1] ? MATCH : MISMATCH)
            const up = prev[j] + (trace[prevBase + j] === 3 ? GAP_EXTEND : GAP_OPEN)
            const left = curr[j - 1] + (trace[rowBase + j - 1] === 2 ? GAP_EXTEND : GAP_OPEN)

            let score = 0
            let dir = 0
            if (diag > score) { score = diag; dir = 1 }
            if (up > score) { score = up; dir = 2 }
            if (left > score) { score = left; dir = 3 }

            curr[j] = score
            trace[rowBase + j] = dir

            if (score > best) { best = score; bestI = i; bestJ = j }
        }
        const tmp = prev
        prev = curr
        curr = tmp
    }

    if (best === 0) return null

    let i = bestI
    let j = bestJ
    const qa = []
    const sa = []
    const mid = []
    let mismatches = 0
    let gaps = 0

    while (i > 0 && j > 0 && trace[i * width + j] !== 0) {
        const dir = trace[i * width + j]
        if (dir === 1) {
            qa.push(a[i - 1])
            sa.push(b[j - 1])
            if (a[i - 1] === b[j - 1]) mid.push('|')
            else { mid.push('.'); mismatches++ }
            i--; j--
        } else if (dir === 2) {
            qa.push(a[i - 1]); sa.push('-'); mid.push(' '); gaps++; i--
        } else {
            qa.push('-'); sa.push(b[j - 1]); mid.push(' '); gaps++; j--
        }
    }

    qa.reverse(); sa.reverse(); mid.reverse()
    const aligned = qa.length
    const matches = mid.reduce((n2, c) => (c === '|' ? n2 + 1 : n2), 0)

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
        subjectStart: j + 1 + offsetB,
        subjectEnd: bestJ + offsetB,
    }
}

function countSeeds(queryKmerSet, subject, k) {
    let n = 0
    for (let i = 0; i + k <= subject.length; i++) {
        if (queryKmerSet.has(subject.slice(i, i + k))) n++
    }
    return n
}

function firstSeedPos(queryKmerSet, subject, k) {
    for (let i = 0; i + k <= subject.length; i++) {
        if (queryKmerSet.has(subject.slice(i, i + k))) return i
    }
    return -1
}

function normalizeQuery(raw) {
    if (typeof raw !== 'string' || !raw.trim()) {
        return { error: 'sequence is required' }
    }
    const seq = raw.replace(/[\s\d]/g, '').toUpperCase()
    if (!seq) return { error: 'sequence is empty after removing whitespace' }
    if (!VALID_DNA.test(seq)) {
        const bad = [...new Set(seq.split('').filter((c) => !/[ACGTUNRYKMSWBDHV]/.test(c)))]
        return { error: `invalid characters in sequence: ${bad.join(' ')}` }
    }
    if (seq.length > MAX_QUERY_LEN) {
        return { error: `sequence too long (${seq.length} nt); limit is ${MAX_QUERY_LEN} nt` }
    }
    return { sequence: seq }
}

/** 从快照取候选（对应后端 fetchCandidates；长度筛选规则一致） */
function snapshotCandidates(d, dbKey, qlen, species) {
    const spec = DATABASES[dbKey]
    const minLen = spec.minLen(qlen)
    const maxLen = spec.maxLen(qlen)
    const out = []
    const keep = (len) => len >= minLen && (maxLen === null || len <= maxLen)

    if (dbKey === 'phasi_rna') {
        for (const p of d.phasiRna) {
            if (species && p.species !== species) continue
            const len = p.sequence ? p.sequence.length : 0
            if (!keep(len)) continue
            out.push({ id: p.phasi_rna, species: p.species, parent: p.parent_locus, sequence: p.sequence, length: len })
        }
    } else {
        const locusById = new Map(d.loci.map((l) => [l.phas_loci, l]))
        for (const [locus, seq] of Object.entries(d.sequences)) {
            const info = locusById.get(locus)
            const sp = info ? info.species : null
            if (species && sp !== species) continue
            const len = seq ? seq.length : 0
            if (!keep(len)) continue
            out.push({ id: locus, species: sp, parent: locus, sequence: seq, length: len })
        }
    }
    return out
}

/** 给命中补功能注释（对应后端 attachAnnotations） */
function attachAnnotations(d, hits) {
    const byId = new Map(d.loci.map((l) => [l.phas_loci, l]))
    for (const h of hits) {
        const info = byId.get(h.parentLocus)
        if (!info) continue
        h.locusGene = info.locus_gene
        h.transcript = info.transcript
        h.annotation = info.annotation
        h.phaseScore = info.phase_score
        h.chromosome = info.chromosome
        h.genomeStart = info.genome_start
        h.genomeEnd = info.genome_end
        h.targetVerified = info.target_verified
        h.initiatorVerified = info.initiator_verified
    }
}

async function blastInfo() {
    const d = await getData()
    const prLen = d.phasiRna.map((p) => (p.sequence ? p.sequence.length : 0)).filter((n) => n > 0)
    const psLen = Object.values(d.sequences).map((s) => s.length).filter((n) => n > 0)
    const range = (arr) => (arr.length ? { minLen: Math.min(...arr), maxLen: Math.max(...arr) } : { minLen: 0, maxLen: 0 })
    return {
        databases: [
            { id: 'phasi_rna', label: 'phasiRNA', rows: d.phasiRna.length, ...range(prLen) },
            { id: 'phas_seq', label: 'PHAS loci', rows: psLen.length, ...range(psLen) },
        ],
        scoring: { match: MATCH, mismatch: MISMATCH, gapOpen: GAP_OPEN, gapExtend: GAP_EXTEND },
        note:
            'Local seed-and-extend search implemented in JavaScript, running entirely in your browser ' +
            'against the embedded demo snapshot. Not NCBI BLAST; scores and E-values are approximations.',
    }
}

async function blast(payload = {}) {
    const d = await getData()
    const started = Date.now()
    const {
        sequence: rawSeq,
        database: dbKey = 'phasi_rna',
        species = null,
        maxHits = 50,
    } = payload

    const check = normalizeQuery(rawSeq)
    if (check.error) {
        const err = new Error(check.error)
        err.response = { status: 400 }
        throw err
    }
    const seq = check.sequence

    if (!DATABASES[dbKey]) {
        const err = new Error(`unknown database "${dbKey}"; expected one of: ${Object.keys(DATABASES).join(', ')}`)
        err.response = { status: 400 }
        throw err
    }
    const limit = Math.min(Math.max(Number.parseInt(maxHits, 10) || 50, 1), 500)
    const k = seedLength(seq.length)
    const rcSeq = reverseComplement(seq)
    const fwdKmers = kmerSet(seq, k)
    const revKmers = kmerSet(rcSeq, k)

    const candidates = snapshotCandidates(d, dbKey, seq.length, species)
    const scanned = candidates.length

    // ---- 统计种子密度，按密度排序后只对前 N 条跑 SW（与后端同策略） ----
    const scored = []
    for (const cand of candidates) {
        const subject = String(cand.sequence || '').toUpperCase()
        if (subject.length < k) continue
        const nFwd = countSeeds(fwdKmers, subject, k)
        const nRev = countSeeds(revKmers, subject, k)
        if (nFwd === 0 && nRev === 0) continue
        scored.push({ cand, subject, nFwd, nRev, seeds: nFwd + nRev })
    }
    scored.sort((a, b) => b.seeds - a.seeds)
    const toAlign = scored.slice(0, MAX_ALIGN_CANDIDATES)

    // ---- 局部比对 ----
    const hits = []
    for (const { cand, subject, nFwd, nRev } of toAlign) {
        const results = []
        for (const [strand, querySeq, kset, hasSeed] of [
            ['+', seq, fwdKmers, nFwd > 0],
            ['-', rcSeq, revKmers, nRev > 0],
        ]) {
            if (!hasSeed) continue

            let windowSeq = subject
            let offsetB = 0
            if (querySeq.length * subject.length > MAX_ALIGN_CELLS) {
                const pos = firstSeedPos(kset, subject, k)
                if (pos < 0) continue
                const pad = querySeq.length + k
                const from = Math.max(0, pos - pad)
                const to = Math.min(subject.length, pos + k + pad)
                windowSeq = subject.slice(from, to)
                offsetB = from
            }

            const aln = smithWaterman(querySeq, windowSeq, { offsetB })
            if (aln) results.push({ strand, aln })
        }
        if (!results.length) continue

        results.sort((x, y) => y.aln.score - x.aln.score)
        const winner = results[0]

        const evalue =
            K_APPROX * seq.length * (scanned || 1) * Math.exp(-LAMBDA_APPROX * winner.aln.score)

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
        })
    }

    hits.sort((a, b) => b.score - a.score || a.evalue - b.evalue)
    const top = hits.slice(0, limit)
    attachAnnotations(d, top)

    const response = {
        query: { sequence: seq, length: seq.length, reverseComplement: rcSeq },
        database: dbKey,
        databaseLabel: DATABASES[dbKey].label,
        seedLength: k,
        totalScanned: scanned,
        totalHits: hits.length,
        returned: top.length,
        tookMs: Date.now() - started,
        hits: top,
        demoNote:
            'Demo snapshot: only the embedded loci are searched. The full local build searches the ' +
            'complete database with SQL pre-filtering.',
    }

    const warnings = []
    if (hits.length > top.length) {
        warnings.push(`Showing the top ${top.length} of ${hits.length} hits.`)
    }
    if (scored.length > MAX_ALIGN_CANDIDATES) {
        warnings.push(
            `${scored.length} candidates shared a seed but only the ${MAX_ALIGN_CANDIDATES} ` +
                `with the densest seeds were aligned.`,
        )
    }
    if (warnings) response.warning = warnings.join(' ')

    return response
}

/* ---------------- 下载（演示版无文件） ---------------- */
async function downloads() {
    return { files: [], demo: true }
}

export const mockApi = {
    health: async () => ({ ok: true, driver: 'demo-snapshot (embedded)', database: 'PPSD demo snapshot', clusters: (await getData()).totals.phas_loci }),
    stats, statsAtlas, species, speciesTree,
    loci, locus, locusPhasiRna, locusInitiators,
    phasiRna: phasiRna,
    search, searchRegion,
    blastInfo, blast,
    downloads,
}

export default mockApi
