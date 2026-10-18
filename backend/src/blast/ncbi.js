/**
 * NCBI BLAST+ 引擎。
 *
 * 复用老站 `PPSD_zby/blast/` 下现成的 NCBI BLAST+ 2.9.0+ 和两个预编译库：
 *   bin/ncbi-blast-2.9.0+/bin/blastn
 *   db/phasiRNA.{nin,nhr,nsq}
 *   db/PHASGene.{nin,nhr,nsq}
 *
 * 这样结果和老站 blast.php / blast_res_zrf.php 是同一套 BLAST 语义，
 * 不是 JS 近似。Windows 本机不能执行 Linux 二进制，detectNcbi() 会返回
 * available:false，页面自动退回 JS 引擎。
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { config, paths } from '../config.js';
import { query } from '../db/index.js';
import { DATABASES } from './databases.js';
import { attachAnnotations } from './annotate.js';

const execFileAsync = promisify(execFile);

const EVALUES = new Set(['1e-3', '1e-5', '1e-10', '1e-20']);

/**
 * 同时最多跑 2 个 BLAST。blastn 本身不慢，但服务器上可能多人同时点，
 * 不限制会把 CPU 打满。超出的请求排队，不直接拒绝。
 */
const MAX_CONCURRENT = 2;
let active = 0;
const waiters = [];

async function withSlot(fn) {
    if (active >= MAX_CONCURRENT) await new Promise((resolve) => waiters.push(resolve));
    active++;
    try {
        return await fn();
    } finally {
        active--;
        const next = waiters.shift();
        if (next) next();
    }
}

export class NcbiUnavailableError extends Error {
    constructor(reason) {
        super(reason);
        this.name = 'NcbiUnavailableError';
        this.code = 'blast_unavailable';
    }
}

/** 老站 BLAST 目录的候选位置：服务器优先，其次本地 reference 拷贝 */
function resolvePaths() {
    const configuredDir = config.blast.dir;
    let dir = configuredDir;
    if (!dir) {
        const serverDir = '/home/www/html/PPSD_zby/blast';
        dir = fs.existsSync(serverDir)
            ? serverDir
            : path.join(paths.dataDir, 'reference', 'PPSD_zby', 'blast');
    }
    return {
        dir,
        bin: config.blast.bin || path.join(dir, 'ncbi-blast-2.9.0+', 'bin', 'blastn'),
        dbDir: config.blast.dbDir || path.join(dir, 'db'),
    };
}

let cached = null;

/**
 * 检测 NCBI BLAST 是否可用。
 * 只检查一次并缓存（路径和版本在进程生命周期内不会变）。
 */
export async function detectNcbi() {
    if (cached) return cached;

    const p = resolvePaths();
    const base = { bin: p.bin, dbDir: p.dbDir, dir: p.dir };

    if (process.platform !== 'linux') {
        cached = {
            available: false,
            ...base,
            reason:
                'NCBI BLAST+ 是 Linux 二进制，当前系统不是 Linux；' +
                '本机开发请用 JS 引擎，服务器上会自动启用。',
        };
        return cached;
    }

    if (!fs.existsSync(p.bin)) {
        cached = { available: false, ...base, reason: `blastn not found: ${p.bin}` };
        return cached;
    }
    for (const db of ['phasiRNA', 'PHASGene']) {
        const nin = path.join(p.dbDir, `${db}.nin`);
        if (!fs.existsSync(nin)) {
            cached = { available: false, ...base, reason: `BLAST database not found: ${nin}` };
            return cached;
        }
    }

    try {
        const { stdout, stderr } = await execFileAsync(p.bin, ['-version'], { timeout: 8000 });
        const text = `${stdout || ''}\n${stderr || ''}`.trim();
        const m = text.match(/blastn:\s*([0-9][^\s]*)/i) || text.match(/blast\s+([0-9][^\s]*)/i);
        cached = {
            available: true,
            ...base,
            version: m ? m[1] : '2.9.0+',
            versionText: text.split(/\r?\n/)[0] || '',
        };
    } catch (e) {
        cached = {
            available: false,
            ...base,
            reason: `blastn exists but failed to run: ${e.message}`,
        };
    }
    return cached;
}

/** 测试用：清掉检测缓存 */
export function resetNcbiCache() {
    cached = null;
}

function parseCsv(stdout) {
    const bySubject = new Map();
    for (const line of String(stdout || '').split(/\r?\n/)) {
        if (!line.trim()) continue;
        const f = line.split(',');
        if (f.length < 12) continue;

        const sstart = Number(f[8]);
        const send = Number(f[9]);
        const hit = {
            id: f[1],
            species: null,
            parentLocus: null,
            subjectLength: null,
            strand: sstart <= send ? '+' : '-',
            identity: Number(f[2]) / 100,
            alignedLength: Number(f[3]),
            mismatches: Number(f[4]),
            gaps: Number(f[5]),
            queryStart: Number(f[6]),
            queryEnd: Number(f[7]),
            subjectStart: sstart,
            subjectEnd: send,
            evalue: Number(f[10]),
            score: Number(f[11]),
            hspCount: 1,
            // 覆盖度先按查询长度算；subjectCoverage 等拿到库里的长度再补
            queryCoverage: null,
            subjectCoverage: null,
        };

        const prev = bySubject.get(hit.id);
        if (!prev) {
            bySubject.set(hit.id, hit);
        } else {
            prev.hspCount++;
            if (hit.score > prev.score) {
                hit.hspCount = prev.hspCount;
                bySubject.set(hit.id, hit);
            }
        }
    }
    return bySubject;
}

/** 从 PostgreSQL 补齐物种 / 父位点 / 库内序列长度 */
async function enrichFromDb(hits, dbKey) {
    const ids = hits.map((h) => h.id).filter(Boolean);
    if (!ids.length) return;

    let rows;
    if (dbKey === 'phasi_rna') {
        ({ rows } = await query(
            `SELECT phasi_rna AS id, species, parent_locus AS "parentLocus", length
             FROM phasi_rna WHERE phasi_rna = ANY($1)`,
            [ids],
        ));
    } else {
        ({ rows } = await query(
            `SELECT q.phas_loci AS id, c.species, c.phas_loci AS "parentLocus", q.length
             FROM phas_seq q
             JOIN clusters c ON c.phas_loci = q.phas_loci
             WHERE q.phas_loci = ANY($1)`,
            [ids],
        ));
    }

    const byId = new Map(rows.map((r) => [r.id, r]));
    for (const h of hits) {
        const info = byId.get(h.id);
        if (!info) continue;
        h.species = info.species;
        h.parentLocus = info.parentLocus;
        h.subjectLength = info.length;
        if (info.length) h.subjectCoverage = h.alignedLength / info.length;
    }
}

/** BLAST 的进度/错误输出在 stderr，退出码非 0 时才当成失败 */
function describeExecError(e) {
    if (e?.killed || e?.signal) {
        return `NCBI BLAST timed out after ${config.blast.timeoutMs} ms`;
    }
    const stderr = String(e?.stderr || '').trim();
    return stderr || e?.message || 'NCBI BLAST failed';
}

/**
 * @param {object} opts
 * @param {string} opts.sequence
 * @param {string} opts.database   phasi_rna / phas_seq
 * @param {string|null} opts.species
 * @param {number} opts.maxHits
 * @param {number} opts.maxSeqs    old-site “Max sequences for each search”
 * @param {string} opts.evalue     1e-3 / 1e-5 / 1e-10 / 1e-20
 */
export async function runNcbi({
    sequence,
    database: dbKey = 'phasi_rna',
    species = null,
    maxHits = 50,
    maxSeqs = 10,
    evalue = '1e-5',
}) {
    const started = Date.now();
    const meta = await detectNcbi();
    if (!meta.available) throw new NcbiUnavailableError(meta.reason);

    const spec = DATABASES[dbKey];
    if (!spec) throw new Error(`unknown database "${dbKey}"`);

    const ev = EVALUES.has(String(evalue)) ? String(evalue) : '1e-5';
    const requested = Math.min(Math.max(Number.parseInt(maxSeqs, 10) || 10, 1), 500);
    const limit = Math.min(Math.max(Number.parseInt(maxHits, 10) || 50, 1), 500);

    // 物种过滤发生在 BLAST 之后。先多取一些候选，否则某个物种可能
    // 一条都进不了 top N，页面会误报“没有命中”。
    const fetchN = species ? Math.min(2000, Math.max(requested, 500)) : requested;
    const dbPath = path.join(meta.dbDir, spec.blastDb);

    if (!fs.existsSync(`${dbPath}.nin`)) {
        throw new NcbiUnavailableError(`BLAST database not found: ${dbPath}.nin`);
    }

    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ppsd-blast-'));
    const queryFile = path.join(tmpDir, 'query.fa');
    try {
        await fs.promises.writeFile(queryFile, `>query\n${sequence}\n`, 'utf-8');

        const commonArgs = [
            '-query', queryFile,
            '-db', dbPath,
            '-evalue', ev,
            '-task', 'blastn',
            '-dust', 'no',
        ];
        const execOpts = {
            timeout: config.blast.timeoutMs,
            maxBuffer: 32 * 1024 * 1024,
            windowsHide: true,
        };

        const { stdout: csv } = await withSlot(() =>
            execFileAsync(meta.bin, [...commonArgs, '-max_target_seqs', String(fetchN), '-outfmt', '10'], execOpts),
        );
        const bySubject = parseCsv(csv);

        // 单独跑一次人类可读对齐（只取前 5 条，文本不会太大）
        let alignmentText = '';
        if (bySubject.size) {
            try {
                const { stdout: text } = await withSlot(() =>
                    execFileAsync(
                        meta.bin,
                        [...commonArgs, '-max_target_seqs', String(Math.min(fetchN, 5)), '-outfmt', '0'],
                        execOpts,
                    ),
                );
                alignmentText = String(text || '').slice(0, 30000);
            } catch {
                // 对齐文本失败不影响表格结果；页面只显示“无对齐文本”
            }
        }

        let hits = [...bySubject.values()];
        await enrichFromDb(hits, dbKey);

        const totalBeforeFilter = hits.length;
        if (species) hits = hits.filter((h) => h.species === species);

        for (const h of hits) {
            h.queryCoverage = h.alignedLength / sequence.length;
        }
        await attachAnnotations(hits);

        hits.sort((a, b) => a.evalue - b.evalue || b.score - a.score);
        const top = hits.slice(0, limit);

        const warnings = [];
        if (species) {
            warnings.push(
                `NCBI BLAST searched the combined database; results were filtered to species "${species}".`,
            );
        }
        if (hits.length > top.length) {
            warnings.push(`Showing the top ${top.length} of ${hits.length} hits.`);
        }
        if (!hits.length && totalBeforeFilter > 0 && species) {
            warnings.push(
                `The combined database returned ${totalBeforeFilter} hits, but none belong to "${species}".`,
            );
        }

        return {
            engine: 'ncbi',
            engineVersion: meta.version,
            query: { sequence, length: sequence.length },
            database: dbKey,
            databaseLabel: spec.label,
            blastDatabase: spec.blastDb,
            evalue: ev,
            maxSeqs: requested,
            // NCBI 已经按 E 值筛过；这里给的是去重后的 subject 数
            totalScanned: totalBeforeFilter,
            totalHits: hits.length,
            returned: top.length,
            tookMs: Date.now() - started,
            hits: top,
            alignmentText,
            warning: warnings.length ? warnings.join(' ') : undefined,
        };
    } catch (e) {
        if (e instanceof NcbiUnavailableError) throw e;
        const err = new Error(describeExecError(e));
        err.code = e?.killed || e?.signal ? 'blast_timeout' : 'blast_failed';
        throw err;
    } finally {
        await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
}

export { EVALUES };
