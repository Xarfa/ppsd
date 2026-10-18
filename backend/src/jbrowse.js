/**
 * JBrowse 链接（仅水稻 chr11）。
 *
 * 老站的 JBrowse 是 JBrowse 1.16.11 的静态实例，数据只有一条 refseq：
 *   CM003932.2_RagTag = Oryza sativa Indica Group Minghui 63 chromosome 11
 *
 * 所以只有水稻 11 号染色体的位点能生成链接；其他物种/染色体一律返回 null，
 * 避免把用户跳到错误的染色体上。老站的 “Link to JBrowse” 按钮原本也是注释掉的。
 */
import fs from 'node:fs';
import path from 'node:path';
import { config, paths } from './config.js';

const RICE_CHR11_REFSEQ = 'CM003932.2_RagTag';

let cachedDir = null;

export function getJbrowseDir() {
    if (cachedDir) return cachedDir;
    if (config.jbrowseDir) {
        cachedDir = config.jbrowseDir;
    } else {
        const serverDir = '/home/www/html/PPSD_zby/JBrowse/jbrowse';
        cachedDir = fs.existsSync(serverDir)
            ? serverDir
            : path.join(paths.dataDir, 'reference', 'PPSD_zby', 'JBrowse', 'jbrowse');
    }
    return cachedDir;
}

export function jbrowseAvailable() {
    return fs.existsSync(path.join(getJbrowseDir(), 'index.html'));
}

/**
 * 生成页面上的相对 URL（前端再拼 BASE_URL）。
 * 只有水稻 chr11 且 JBrowse 目录存在时返回对象。
 */
export function jbrowseUrl({ species, chromosome, start, end }) {
    if (species !== 'osa' || String(chromosome) !== '11') return null;
    if (!jbrowseAvailable()) return null;

    const s = Number(start);
    const e = Number(end);
    if (!Number.isFinite(s) || !Number.isFinite(e)) return null;

    // 位点前后各留 2 kb，打开时能看到上下文
    const pad = 2000;
    const from = Math.max(0, Math.floor(Math.min(s, e)) - pad);
    const to = Math.ceil(Math.max(s, e)) + pad;

    return {
        refseq: RICE_CHR11_REFSEQ,
        start: from,
        end: to,
        url: `jbrowse/?data=data/trackList.json&loc=${RICE_CHR11_REFSEQ}:${from}..${to}`,
    };
}

export { RICE_CHR11_REFSEQ };
