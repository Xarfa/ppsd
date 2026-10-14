<!--
    帮助 —— 对应原站 help.php。
    内容分五块：数据库是什么 / 怎么用 / 字段速查 / 快捷键 / 技术架构。
    技术架构那块是给组会讲技术路线用的 —— 直接翻到这一页就能讲。
    v2：左栏锚点目录 + 快捷键卡片。
-->
<script setup>
import { computed } from 'vue'
import { t, locale } from '../i18n/index.js'

const L = (enText, zhText) => (locale.value === 'zh' ? zhText : enText)
const pick = (o) => (o ? o[locale.value] || o.en : '')

const glossary = computed(() => [
    {
        k: 'PHAS loci',
        v: {
            en: 'A genomic locus that produces phasiRNAs. Named <species>PHAS<chromosome>g<gene>.<transcript>@<length>#<index>, e.g. OsaPHAS9g4346635.1@21#1.',
            zh: '产生 phasiRNA 的基因组位点。命名规则 <物种>PHAS<染色体>g<基因号>.<转录本序号>@<长度>#<编号>，例如 OsaPHAS9g4346635.1@21#1。',
        },
    },
    {
        k: 'Phase Score / Ratio',
        v: {
            en: 'Measures of phasing. The higher the score and the closer the ratio is to 1, the more strictly the small RNAs are spaced at 21-nt intervals.',
            zh: '相位性打分。得分越高、比值越接近 1，说明小 RNA 越是严格按 21 nt 周期排列，可信度越高。',
        },
    },
    {
        k: 'P-value',
        v: {
            en: 'Significance of the small-RNA enrichment test (hypergeometric). Smaller is more significant.',
            zh: '小 RNA 富集分析（超几何分布检验）的显著性，越小越显著。',
        },
    },
    {
        k: 'Method_Ref',
        v: {
            en: 'Which target-prediction methods support this locus, e.g. HC,PC,PG,HG.',
            zh: '支持该位点的打靶预测方法组合，例如 HC,PC,PG,HG。',
        },
    },
    {
        k: 'Target / Initiator Verified',
        v: {
            en: 'Whether the evidence is supported by degradome sequencing — the strongest class of evidence in this database.',
            zh: '是否经过降解组测序验证。这是本库中可信度最高的一档证据。',
        },
    },
    {
        k: 'Category',
        v: {
            en: 'Degradome confidence class. Cat_1 and Cat_2 are treated as verified.',
            zh: '降解组验证的置信分类。Cat_1 和 Cat_2 视为通过验证。',
        },
    },
    {
        k: 'Deg Count',
        v: {
            en: 'Read count in the degradome library, normalised to RP10M.',
            zh: '降解组文库中的读数，按 RP10M 归一化。',
        },
    },
])

const steps = computed(() => [
    {
        en: 'Open Browse and pick a species — you get every PHAS locus in that species. Every column header is clickable to sort, the box above filters as you type (400 ms debounce), and the whole table state (keyword / sort / page) lives in the URL so you can share or bookmark it.',
        zh: '进「浏览」选一个物种，就能看到它全部 PHAS 位点。任意表头可点击排序，上方输入框边输边过滤（400 ms 防抖），表格状态（关键词/排序/页码）都在 URL 里，可以直接分享或收藏。',
    },
    {
        en: 'Click a PHAS locus name to open its detail page: basic annotation, the locus sequence (one-click copy, GC content), the phase distribution plot plus the spacing histogram, every phasiRNA it produces, and the miRNA that triggers it.',
        zh: '点击位点名进入详情页：基本信息、位点序列（一键复制、GC 含量）、相位分布图 + 相邻间距直方图、它产生的每一条 phasiRNA，以及触发它的 miRNA。',
    },
    {
        en: 'Click a phasiRNA ID to see its degradome-verified target genes, with the supporting library, confidence class and read counts — plus two mini charts summarising the evidence.',
        zh: '点击 phasiRNA 的 ID，可以看到它经过降解组验证的靶基因，以及支持该结论的文库、置信分类和读数 —— 还有两张小结证据的小图。',
    },
    {
        en: 'Press Ctrl+K (or "/") anywhere to open the command palette — one box that searches pages, species, loci and phasiRNAs at once, fully keyboard-navigable.',
        zh: '在任何页面按 Ctrl+K（或 "/"）打开命令面板 —— 一个输入框同时搜索页面、物种、位点和 phasiRNA，全程键盘操作。',
    },
    {
        en: 'Open the Atlas to see the whole database at a glance: chromosome heatmaps, initiator miRNA families, phase-score landscape and more — every chart is a live aggregation query.',
        zh: '打开「统计图鉴」一屏看全库：染色体热力图、起始 miRNA 家族、相位得分全景图等 —— 每张图都是一次实时聚合查询。',
    },
    {
        en: 'Use Blast to paste a nucleotide sequence and find similar loci or phasiRNAs. Use Download for the bulk data files.',
        zh: '「序列比对」可以粘贴一段序列，查找相似的位点或 phasiRNA；「下载」页提供批量数据文件。',
    },
])

const arch = computed(() => [
    {
        k: L('Frontend', '前端'),
        v: L(
            'Vue 3 + Vite, routed with vue-router. Charts are ECharts, driven by a single composable that reads colours from CSS variables. Runs on port 5173.',
            'Vue 3 + Vite，路由用 vue-router，图表用 ECharts，由统一的 composable 驱动、颜色读自 CSS 变量。跑在 5173 端口。',
        ),
    },
    {
        k: L('Backend', '后端'),
        v: L(
            'Node.js + Express, exposing a REST API on port 3000. Frontend and backend are two separate programs that talk over HTTP.',
            'Node.js + Express，提供 REST 风格接口，跑在 3000 端口。前后端是两个独立程序，靠 HTTP 通信。',
        ),
    },
    {
        k: L('Database', '数据库'),
        v: L(
            'PostgreSQL. Six tables derived from the real column layout of the upstream exports.',
            'PostgreSQL。表结构依据原站导出数据的真实字段设计，共 6 张表。',
        ),
    },
    {
        k: L('Data', '数据'),
        v: L(
            'From the public PPSD site of the Crop Bioinformatics Group, Nanjing Agricultural University. The production version should read from the lab server.',
            '来自南京农业大学作物生物信息学组公开站点。正式版本应当从实验室服务器取数。',
        ),
    },
])

const sections = computed(() => [
    { id: 'what', n: '1', label: L('What this database is', '这个数据库是什么') },
    { id: 'how', n: '2', label: L('How to use it', '怎么用') },
    { id: 'fields', n: '3', label: L('Field glossary', '字段含义速查') },
    { id: 'keys', n: '4', label: L('Keyboard shortcuts', '键盘快捷键') },
    { id: 'arch', n: '5', label: L('How this site is built', '技术架构') },
])

const shortcuts = computed(() => [
    { k: 'Ctrl K', d: L('Open the command palette', '打开命令面板') },
    { k: '/', d: L('Open the command palette (when not typing)', '打开命令面板（非输入状态）') },
    { k: '↑ ↓', d: L('Move through palette results', '在面板结果间移动') },
    { k: 'Enter', d: L('Open the selected result', '打开选中的结果') },
    { k: 'Esc', d: L('Close the palette', '关闭面板') },
])
</script>

<template>
    <div class="page page-body">
        <h1 class="page-title display">{{ t('help.title') }}</h1>
        <p class="page-sub">{{ t('help.sub') }}</p>

        <div class="layout">
            <!-- 左栏目录 -->
            <aside class="sidebar">
                <div class="sidebar__group">
                    <div class="sidebar__title">Contents</div>
                    <ul class="sidebar__list">
                        <li v-for="s in sections" :key="s.id">
                            <a :href="`#${s.id}`" class="sidebar__link">
                                <span>{{ s.n }} · {{ s.label }}</span>
                            </a>
                        </li>
                    </ul>
                </div>
            </aside>

            <div>
                <!-- 一、数据库是什么 -->
                <div id="what" class="card" style="margin-bottom: var(--sp-4)">
                    <div class="card__head">
                        <span class="card__title">{{ L('1 · What this database is', '一、这个数据库是什么') }}</span>
                    </div>
                    <div class="card__body prose">
                        <p v-if="locale === 'zh'">
                            phasiRNA（phased small interfering RNA，相位小干扰 RNA）是植物特有的一类非编码小
                            RNA。它由 <strong>PHAS 位点</strong>被 <strong>miRNA</strong> 剪切后，
                            以 21 个核苷酸为周期依次切割产生，进而降解或抑制下游的<strong>靶基因</strong>。
                            这条链路就是所谓的 phasiRNA 调控通路：
                        </p>
                        <p v-else>
                            phasiRNAs (phased small interfering RNAs) are plant-specific non-coding RNAs.
                            A <strong>microRNA</strong> cleaves a transcript, creating a
                            <strong>PHAS locus</strong>; that locus is then processed in 21-nucleotide steps
                            into a phased array of small RNAs, which go on to cleave downstream
                            <strong>target genes</strong>. This chain is the phasiRNA regulatory pathway:
                        </p>

                        <div class="seq-block" style="max-height: none; margin-bottom: var(--sp-3)">
                            miRNA (phase initiator) → cleave → PHAS locus → phased processing → phasiRNA → target
                        </div>

                        <p v-if="locale === 'zh'">
                            本库把这条通路上四个组分的详细信息全部收录，这是它相对 sRNAanno、tasiRNAdb、
                            TarDB 等其他数据库的主要优势 —— 那些库只提供部分组分。
                        </p>
                        <p v-else>
                            PPSD stores full details for all four components of that pathway, which is what
                            distinguishes it from resources such as sRNAanno, tasiRNAdb or TarDB that publish
                            only part of the chain.
                        </p>
                    </div>
                </div>

                <!-- 二、怎么用 -->
                <div id="how" class="card" style="margin-bottom: var(--sp-4)">
                    <div class="card__head">
                        <span class="card__title">{{ L('2 · How to use it', '二、怎么用') }}</span>
                    </div>
                    <div class="card__body">
                        <ol class="steps">
                            <li v-for="(s, i) in steps" :key="i" class="steps__item">
                                <span class="steps__n">{{ String(i + 1).padStart(2, '0') }}</span>
                                <span>{{ pick(s) }}</span>
                            </li>
                        </ol>
                    </div>
                </div>

                <!-- 三、字段速查 -->
                <div id="fields" class="card" style="margin-bottom: var(--sp-4)">
                    <div class="card__head">
                        <span class="card__title">{{ L('3 · Field glossary', '三、字段含义速查') }}</span>
                    </div>
                    <div class="card__body card__body--flush">
                        <div class="kv">
                            <template v-for="g in glossary" :key="g.k">
                                <div class="kv__k mono">{{ g.k }}</div>
                                <div class="kv__v">{{ pick(g.v) }}</div>
                            </template>
                        </div>
                    </div>
                </div>

                <!-- 四、快捷键 -->
                <div id="keys" class="card" style="margin-bottom: var(--sp-4)">
                    <div class="card__head">
                        <span class="card__title">{{ L('4 · Keyboard shortcuts', '四、键盘快捷键') }}</span>
                    </div>
                    <div class="card__body card__body--flush">
                        <div class="kv">
                            <template v-for="s in shortcuts" :key="s.k">
                                <div class="kv__k"><span class="kbd">{{ s.k }}</span></div>
                                <div class="kv__v">{{ s.d }}</div>
                            </template>
                        </div>
                    </div>
                </div>

                <!-- 五、技术架构 -->
                <div id="arch" class="card">
                    <div class="card__head">
                        <span class="card__title">{{ L('5 · How this site is built', '五、技术架构') }}</span>
                        <span class="card__hint">Vue :5173 → Express :3000 → PostgreSQL :5432</span>
                    </div>
                    <div class="card__body">
                        <div class="seq-block" style="max-height: none; margin-bottom: var(--sp-3)">
Browser  Vue 3 + vue-router + ECharts          :5173
   │  HTTP /api/...
Backend  Node.js + Express (pg driver)          :3000
   │  SQL
Database PostgreSQL                              :5432
                        </div>
                        <div class="kv">
                            <template v-for="a in arch" :key="a.k">
                                <div class="kv__k">{{ a.k }}</div>
                                <div class="kv__v">{{ a.v }}</div>
                            </template>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.steps {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
}

.steps__item {
    display: flex;
    gap: var(--sp-3);
    align-items: flex-start;
    font-size: var(--fs-md);
    line-height: var(--lh-loose);
    color: var(--c-text-2);
}

.steps__n {
    font-family: var(--font-mono);
    font-size: var(--fs-xs);
    font-weight: 500;
    color: var(--c-accent);
    background: var(--c-accent-tint);
    border: 1px solid var(--c-accent-border);
    border-radius: var(--r-sm);
    padding: 1px 5px;
    flex-shrink: 0;
    margin-top: 4px;
}

.sidebar { position: sticky; top: calc(var(--topbar-h) + var(--sp-4)); }
</style>
