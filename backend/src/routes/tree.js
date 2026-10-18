/**
 * 物种系统发育树 —— 对应原站 browse.php 里那棵 ECharts 树。
 *
 * 原站的做法：browse.php 里有一个 2000px 高的空 div#trees，
 * 页面加载后用 $.getJSON('/PPSD/json/all.json') 取树数据，
 * 再用 ECharts 的 type:'tree' 画出来，点叶节点就 window.open 到 clusters.php。
 *
 * 这里保持一致，只是数据改成从项目内的文件读（原站那个 json 是写死在
 * 服务器路径下的）。树本身是整棵植物系统发育树，119 个物种，
 * 其中只有 8 个在库里有数据 —— 这样能把这 8 个物种放进演化背景里看，
 * 比单纯列 8 个名字有信息量。
 */
import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { paths } from '../config.js';

export const treeRouter = Router();

/**
 * 树数据放哪，两个位置依次找：
 *   1. data/reference/species-tree.json —— 本地开发用的完整版
 *   2. data/samples/01_物种系统发育树_species-tree.json —— 会打进部署包，
 *      所以线上一定有（data/reference/ 里有 15G 老站资料，不进部署包）
 */
const TREE_CANDIDATES = [
    path.join(paths.dataDir, 'reference', 'species-tree.json'),
    path.join(paths.dataDir, 'samples', '01_物种系统发育树_species-tree.json'),
];

/** 读一次就缓存 —— 这个文件不会变，没必要每次请求都读盘 */
let cache = null;

function loadTree() {
    if (cache) return cache;
    for (const file of TREE_CANDIDATES) {
        if (fs.existsSync(file)) {
            cache = JSON.parse(fs.readFileSync(file, 'utf-8'));
            return cache;
        }
    }
    return null;
}

/**
 * GET /api/species-tree
 *
 * 同时返回一份「有数据的物种 → 库里用的缩写」的映射，
 * 前端点树上的叶节点时要用它去查对应物种。
 * 树上的名字是完整学名（Glycine max），库里的缩写是 gma，两者要对上。
 */
treeRouter.get('/species-tree', async (_req, res, next) => {
    try {
        const tree = loadTree();
        if (!tree) {
            return res.status(404).json({
                error: 'not_found',
                message:
                    'species-tree.json not found. Looked in: ' +
                    TREE_CANDIDATES.map((f) => f.replace(paths.dataDir, 'data/')).join(' and '),
            });
        }
        res.json({ tree });
    } catch (e) {
        next(e);
    }
});
