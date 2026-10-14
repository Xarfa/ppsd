/**
 * 批量数据下载 —— 对应原站 download.php
 *
 * 原站的 download.php 只是列出一堆指向 download_dir/*.txt 的静态链接。
 * 这里做成动态的：扫描 ../data/raw 目录得到真实文件清单（大小、行数），
 * 并通过 /api/downloads/:file 以流的方式把文件发出去。
 *
 * 为什么做成动态而不是写死清单：
 *   数据是离线准备好的，随时可能补充物种或更新版本。写死的清单一旦和
 *   磁盘上的文件对不上，页面就会出现"点了下载 404"这种最难查的问题。
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { Router } from 'express';
import { paths } from '../config.js';

export const downloadsRouter = Router();

/** 发布数据的目录：项目根下的 data/raw（由 src/db/load.js 从这里读数据） */
const RAW_DIR = path.join(paths.dataDir, 'raw');

/** 文件名规则：<物种缩写>_<类型>.<后缀> */
const SPECIES_LABEL = {
  osa: 'Rice (Oryza sativa)',
  gma: 'Soybean (Glycine max)',
  zma: 'Maize (Zea mays)',
  ath: 'Arabidopsis (Arabidopsis thaliana)',
  vvi: 'Grape (Vitis vinifera)',
  bna: 'Rapeseed (Brassica napus)',
  csi: 'Orange (Citrus sinensis)',
  ghi: 'Cotton (Gossypium hirsutum)',
};

/** 从文件名里认出这是哪一类数据 */
function classify(name) {
  if (name.includes('PHAS_Loci')) return { kind: 'phas_loci', format: 'TSV' };
  if (name.includes('phasiRNA')) return { kind: 'phasi_rna', format: 'TSV' };
  if (name.includes('initiator')) return { kind: 'initiator', format: 'TSV' };
  if (name.endsWith('.fa')) return { kind: 'phas_seq', format: 'FASTA' };
  return { kind: 'other', format: 'TXT' };
}

/** 文件类型在页面上的排列顺序（按数据通路的上下游排，不是按字母） */
const KIND_ORDER = { phas_loci: 0, phasi_rna: 1, initiator: 2, phas_seq: 3, other: 9 };

/**
 * 记录数缓存。
 * 数一遍要整个文件读一次（水稻那个 phasiRNA 文件有 92 MB），
 * 所以只在第一次请求清单时算，之后一直用缓存。
 */
const rowCountCache = new Map();

/**
 * 统计记录数。
 *
 * 两种格式要分开数，这里踩过坑：
 *   · TSV 有表头，数据行数 = 总行数 - 1
 *   · FASTA 没有表头，而且**每条序列占两行**（">名字" + 序列），
 *     所以不能数行数，只能数 ">" 开头的行，也不能减 1。
 * 之前两种一起按"行数-1"处理，导致 3366 条序列被报成 6731 条。
 */
async function countRecords(file, format) {
  if (rowCountCache.has(file)) return rowCountCache.get(file);

  let n = 0;
  const rl = readline.createInterface({
    input: fs.createReadStream(file, { encoding: 'utf-8' }),
    crlfDelay: Infinity,
  });

  if (format === 'FASTA') {
    for await (const line of rl) {
      if (line.startsWith('>')) n++;
    }
  } else {
    let lines = 0;
    for await (const line of rl) {
      if (line.trim()) lines++;
    }
    n = Math.max(0, lines - 1); // 去掉表头
  }

  rowCountCache.set(file, n);
  return n;
}

/** 扫描目录，得到文件清单（含元数据） */
async function buildCatalog() {
  if (!fs.existsSync(RAW_DIR)) return [];
  const files = fs.readdirSync(RAW_DIR).filter((f) => !f.startsWith('.'));
  const out = [];
  for (const name of files) {
    const full = path.join(RAW_DIR, name);
    const st = fs.statSync(full);
    if (!st.isFile()) continue;
    const abbr = name.split('_')[0];
    const { kind, format } = classify(name);
    out.push({
      file: name,
      species: abbr,
      speciesLabel: SPECIES_LABEL[abbr] || abbr,
      kind,
      format,
      bytes: st.size,
      rows: await countRecords(full, format),
      modified: st.mtime.toISOString(),
    });
  }
  // 按物种排，同一物种内按通路顺序排
  return out.sort((a, b) =>
    a.species === b.species
      ? (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9)
      : a.species.localeCompare(b.species),
  );
}

/** GET /api/downloads —— 列出所有可下载的批量文件 */
downloadsRouter.get('/downloads', async (_req, res, next) => {
  try {
    const entries = await buildCatalog();
    res.json({
      count: entries.length,
      files: entries,
      note:
        'The upstream source publishes bulk files for rice and soybean only. ' +
        'All eight species are fully browsable and searchable online.',
    });
  } catch (e) {
    next(e);
  }
});

/**
 * GET /api/downloads/:file —— 下载单个文件
 *
 * 安全：文件名来自用户，必须先解析成绝对路径再确认它确实落在 RAW_DIR 里，
 * 否则 ../ 就能把服务器上任意文件读走（路径穿越）。
 */
downloadsRouter.get('/downloads/:file', async (req, res, next) => {
  try {
    const requested = req.params.file;
    const full = path.resolve(RAW_DIR, requested);
    const root = path.resolve(RAW_DIR);

    // 解析后的路径必须以数据目录开头，并且不能是目录本身
    if (!full.startsWith(root + path.sep) || !fs.existsSync(full) || !fs.statSync(full).isFile()) {
      return res.status(404).json({ error: 'not_found', message: `No such data file: ${requested}` });
    }

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${path.basename(full)}"`);
    fs.createReadStream(full).pipe(res);
  } catch (e) {
    next(e);
  }
});
