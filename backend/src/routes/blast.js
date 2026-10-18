/**
 * 序列比对路由 —— 对应原站 blast.php。
 *
 * 两个引擎：
 *   ncbi  NCBI BLAST+ 2.9.0+（复用老站二进制和库，结果与老站一致）
 *   js    JS 种子延伸 + Smith-Waterman（Windows 本机开发 / 兜底）
 *
 * auto 规则：NCBI 可用就用 NCBI；不可用或运行失败就回退 JS，并在
 * response.warning 里说明原因。页面不会静默换引擎。
 */
import { Router } from 'express';
import { query } from '../db/index.js';
import { config } from '../config.js';
import { DATABASES, resolveDatabase } from '../blast/databases.js';
import { normalizeQuery } from '../blast/validate.js';
import { runJs, JS_SCORING } from '../blast/js.js';
import { runNcbi, detectNcbi, NcbiUnavailableError, EVALUES } from '../blast/ncbi.js';

export const blastRouter = Router();

const clampInt = (v, def, min, max) => {
    const n = Number.parseInt(v, 10);
    if (!Number.isFinite(n)) return def;
    return Math.min(Math.max(n, min), max);
};

/** 页面传 auto / ncbi / js；没传时看 .env 的 PPSD_BLAST_ENGINE */
function requestedEngine(value) {
    const v = String(value || '').toLowerCase();
    if (v === 'ncbi' || v === 'js') return v;
    if (config.blast.engine === 'ncbi' || config.blast.engine === 'js') return config.blast.engine;
    return 'auto';
}

function payloadFrom(body) {
    return {
        sequence: normalizeQuery(body.sequence),
        database: resolveDatabase(body.database),
        species: body.species ? String(body.species) : null,
        maxHits: clampInt(body.maxHits, 50, 1, 500),
        maxSeqs: clampInt(body.maxSeqs, 10, 1, 500),
        evalue: EVALUES.has(String(body.evalue)) ? String(body.evalue) : '1e-5',
    };
}

function badRequest(res, message) {
    return res.status(400).json({ error: 'bad_request', message });
}

/** POST /api/blast */
blastRouter.post('/blast', async (req, res, next) => {
    try {
        const body = req.body || {};
        const p = payloadFrom(body);
        if (p.sequence.error) return badRequest(res, p.sequence.error);
        if (!p.database) {
            return badRequest(
                res,
                `unknown database "${body.database}"; expected one of: ${Object.keys(DATABASES).join(', ')}`,
            );
        }

        const engine = requestedEngine(body.engine);
        const opts = {
            sequence: p.sequence.sequence,
            database: p.database,
            species: p.species,
            maxHits: p.maxHits,
            maxSeqs: p.maxSeqs,
            evalue: p.evalue,
        };

        if (engine === 'js') {
            return res.json(await runJs(opts));
        }

        const ncbi = await detectNcbi();
        if (!ncbi.available) {
            if (engine === 'ncbi') {
                return res.status(503).json({ error: 'blast_unavailable', message: ncbi.reason });
            }
            const result = await runJs(opts);
            result.warning = [result.warning, `NCBI BLAST unavailable: ${ncbi.reason}`]
                .filter(Boolean)
                .join(' ');
            return res.json(result);
        }

        try {
            return res.json(await runNcbi(opts));
        } catch (e) {
            if (engine === 'ncbi') {
                if (e instanceof NcbiUnavailableError) {
                    return res.status(503).json({ error: 'blast_unavailable', message: e.message });
                }
                const status = e.code === 'blast_timeout' ? 504 : 502;
                return res.status(status).json({ error: e.code || 'blast_failed', message: e.message });
            }

            // auto：NCBI 运行失败时回退 JS，但必须让用户知道
            const result = await runJs(opts);
            result.warning = [
                `NCBI BLAST failed (${e.message}); fell back to the JS approximate engine.`,
                result.warning,
            ]
                .filter(Boolean)
                .join(' ');
            return res.json(result);
        }
    } catch (e) {
        next(e);
    }
});

/** GET /api/blast/info —— 给页面填下拉框 + 告诉前端哪个引擎可用 */
blastRouter.get('/blast/info', async (_req, res, next) => {
    try {
        const { rows } = await query(`
      SELECT 'phasi_rna' AS id, 'phasiRNA' AS label, count(*)::int AS rows,
             min(length)::int AS "minLen", max(length)::int AS "maxLen"
      FROM phasi_rna
      UNION ALL
      SELECT 'phas_seq', 'PHAS loci', count(*)::int,
             min(length)::int, max(length)::int
      FROM phas_seq
    `);

        const ncbi = await detectNcbi();
        const defaultEngine =
            config.blast.engine === 'js' ? 'js' : ncbi.available ? 'ncbi' : 'js';

        res.json({
            databases: rows,
            engines: [
                {
                    id: 'ncbi',
                    label: 'NCBI BLAST+',
                    available: ncbi.available,
                    version: ncbi.version || null,
                    reason: ncbi.reason || null,
                },
                {
                    id: 'js',
                    label: 'JS 近似',
                    available: true,
                    version: 'JS seed-and-extend',
                },
            ],
            defaultEngine,
            evalues: [...EVALUES],
            maxSeqsOptions: [5, 10, 15, 20],
            scoring: JS_SCORING,
            note: ncbi.available
                ? 'NCBI BLAST+ is available. JS remains selectable as a fallback.'
                : `NCBI BLAST+ unavailable: ${ncbi.reason}`,
        });
    } catch (e) {
        next(e);
    }
});
