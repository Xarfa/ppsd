/**
 * 老站静态资产自检。
 *
 * 服务器上没有 root、资产又分散在 /home/www/html/PPSD_zby/ 下，
 * 出问题时最怕"页面能开但 BLAST/tplot/JBrowse 悄悄不可用"。
 * 这个接口把三块资产的路径和可用状态一次返回，部署后先跑它。
 */
import { Router } from 'express';
import fs from 'node:fs';
import { detectNcbi } from '../blast/ncbi.js';
import { getTplotDir, SPECIES_DIRS } from '../tplot.js';
import { getJbrowseDir, jbrowseAvailable, RICE_CHR11_REFSEQ } from '../jbrowse.js';

export const assetsRouter = Router();

function listDirs(dir) {
    try {
        return fs
            .readdirSync(dir, { withFileTypes: true })
            .filter((d) => d.isDirectory())
            .map((d) => d.name)
            .sort();
    } catch {
        return [];
    }
}

assetsRouter.get('/assets', async (_req, res, next) => {
    try {
        const ncbi = await detectNcbi();
        const tplotDir = getTplotDir();
        const jbrowseDir = getJbrowseDir();
        const tplotSpecies = listDirs(tplotDir);

        res.json({
            blast: {
                available: ncbi.available,
                version: ncbi.version || null,
                reason: ncbi.reason || null,
                bin: ncbi.bin,
                dbDir: ncbi.dbDir,
            },
            tplot: {
                dir: tplotDir,
                exists: fs.existsSync(tplotDir),
                species: tplotSpecies,
                // 本地/服务器都只应出现这 8 个目录名，缺哪个一眼能看出来
                expectedSpecies: Object.values(SPECIES_DIRS),
                missingSpecies: Object.values(SPECIES_DIRS).filter((s) => !tplotSpecies.includes(s)),
            },
            jbrowse: {
                dir: jbrowseDir,
                available: jbrowseAvailable(),
                refseq: RICE_CHR11_REFSEQ,
                scope: 'Oryza sativa chromosome 11 only',
            },
        });
    } catch (e) {
        next(e);
    }
});
