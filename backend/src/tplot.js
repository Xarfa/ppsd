/**
 * tplot 表达/降解组图。
 *
 * 老站把图片放在 tplot/{物种}/{span}/{phasiRNA|initiator}/{文件名}，
 * 文件名直接存在数据库的 t_plot 列里。这里负责：
 *   - 找到图片目录（服务器老目录 / 本地 reference 拷贝）
 *   - 检查文件是否真的存在（没有就不给前端 URL，避免 404）
 *   - 生成 URL（注意 # 必须编码，否则浏览器会把它当 fragment）
 */
import fs from 'node:fs';
import path from 'node:path';
import { config, paths } from './config.js';

const SPECIES_DIRS = {
    ath: 'arabidopsis_thaliana',
    bna: 'brassica_napus',
    csi: 'citrus_sinensis',
    gma: 'glycine_max',
    ghi: 'gossypium_hirsutum',
    osa: 'oryza_sativa',
    vvi: 'vitis_vinifera',
    zma: 'zea_mays',
};

let cachedDir = null;

/** 图片根目录：显式配置 > 服务器老目录 > 本地 reference 拷贝 */
export function getTplotDir() {
    if (cachedDir) return cachedDir;
    if (config.tplotDir) {
        cachedDir = config.tplotDir;
    } else {
        const serverDir = '/home/www/html/PPSD_zby/tplot';
        cachedDir = fs.existsSync(serverDir)
            ? serverDir
            : path.join(paths.dataDir, 'reference', 'PPSD_zby', 'tplot');
    }
    return cachedDir;
}

export function speciesDir(abbr) {
    return SPECIES_DIRS[abbr] || null;
}

export function tplotPath(kind, abbr, filename) {
    const sp = speciesDir(abbr);
    if (!sp || !filename) return null;
    return path.join(getTplotDir(), sp, '21', kind, filename);
}

export function tplotExists(kind, abbr, filename) {
    const p = tplotPath(kind, abbr, filename);
    return !!(p && fs.existsSync(p));
}

/**
 * 返回相对 URL（不含 base），例如：
 *   tplot/oryza_sativa/21/phasiRNA/GSM...%23...png
 * 前端统一拼 import.meta.env.BASE_URL，开发/服务器子路径都能用。
 */
export function tplotUrl(kind, abbr, filename) {
    if (!tplotExists(kind, abbr, filename)) return null;
    const sp = speciesDir(abbr);
    return `tplot/${sp}/21/${kind}/${encodeURIComponent(filename)}`;
}

export { SPECIES_DIRS };
