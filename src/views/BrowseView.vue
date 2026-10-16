<!--
    Browse v2 —— 对应原站 browse.php + clusters.php。

      未选物种 → 物种系统发育树（119 种，8 个有数据的可点）
      已选物种 → PHAS 位点表格

    v2 的手感升级：
      · 关键词过滤 400ms 防抖，边打字边查，不用按回车
      · 列表状态（关键词 / 排序 / 页码 / 页大小）写进 URL，可分享、可刷新
      · 页大小 25/50/100/200 可选，行高紧凑/宽松两档
      · 一键导出当前页 CSV
      · 分页条显示页码窗口，不再只有前后翻页
-->
<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import * as echarts from 'echarts'
import api, { speciesName } from '../api/ppsd.js'
import { t, locale } from '../i18n/index.js'
import { speciesColor } from '../utils/echarts.js'
import { fmt, downloadCsv, copyText } from '../utils/ui.js'

const route = useRoute()
const router = useRouter()

const speciesList = ref([])
const rows = ref([])
const total = ref(0)
const pageCount = ref(0)
const loading = ref(false)
const error = ref('')

/* 表格状态 —— 初始值从 URL 读，保证刷新/分享链接一致 */
const page = ref(Math.max(1, parseInt(route.query.page) || 1))
const pageSize = ref([25, 50, 100, 200].includes(parseInt(route.query.size)) ? parseInt(route.query.size) : 25)
const keyword = ref(String(route.query.q || ''))
const sort = ref(String(route.query.sort || 'recorder'))
const order = ref(['asc', 'desc'].includes(route.query.order) ? route.query.order : 'asc')
const compact = ref(localStorage.getItem('ppsd.compact') === '1')

/* 物种树 */
const treeData = ref(null)
const treeLoading = ref(true)
const treeError = ref('')
const treeEl = ref(null)
let treeChart = null

const abbrByName = computed(() => {
    const m = new Map()
    for (const sp of speciesList.value) m.set(sp.scientific_name, sp.abbr)
    return m
})

const currentSpecies = computed(() => route.params.species || '')
const hasSpeciesSelected = computed(() => !!currentSpecies.value)
const currentSpeciesInfo = computed(() => speciesList.value.find((s) => s.abbr === currentSpecies.value))

/* ---------------- 系统发育树 ---------------- */
function drawTree() {
    if (!treeEl.value || !treeData.value) return
    if (treeChart && treeChart.getDom() !== treeEl.value) {
        treeChart.dispose()
        treeChart = null
    }
    if (!treeChart) treeChart = echarts.init(treeEl.value)

    const ink = cssVar('--c-text', '#17231d')
    const faint = cssVar('--c-text-muted', '#9aa9a0')
    const line = cssVar('--c-border-strong', '#cbd5cc')
    const surface = cssVar('--c-surface', '#ffffff')
    const heroBg = cssVar('--c-hero-bg', '#0d2b1e')
    const heroText = cssVar('--c-hero-text', '#f2f7f3')

    treeChart.setOption(
        {
            tooltip: {
                trigger: 'item',
                triggerOn: 'mousemove',
                backgroundColor: heroBg,
                borderWidth: 0,
                textStyle: { color: heroText, fontSize: 12 },
                extraCssText: 'border-radius:8px;',
                formatter: (p) => {
                    if (p.data?.children) return p.name
                    return `${p.name} — ${p.data?.hasData ? t('browse.tree.haveData') : t('browse.tree.noData')}`
                },
            },
            series: [
                {
                    type: 'tree',
                    data: [treeData.value],
                    initialTreeDepth: 8,
                    top: '1%',
                    left: '2%',
                    right: '27%',
                    bottom: '1%',
                    symbolSize: 7,
                    itemStyle: {
                        color: (p) => (p.data?.hasData ? cssVar('--c-accent', '#127a50') : surface),
                        borderColor: (p) => (p.data?.hasData ? cssVar('--c-accent', '#127a50') : line),
                        borderWidth: 1.5,
                    },
                    lineStyle: { width: 1, color: line },
                    label: {
                        position: 'left',
                        verticalAlign: 'middle',
                        align: 'right',
                        fontSize: 11,
                        formatter: (p) => (p.data?.hasData ? `{hi|${p.name}}` : `{lo|${p.name}}`),
                        rich: {
                            hi: { color: ink, fontWeight: 'bold', fontSize: 11 },
                            lo: { color: faint, fontSize: 11 },
                        },
                    },
                    leaves: {
                        label: { position: 'right', verticalAlign: 'middle', align: 'left' },
                    },
                    emphasis: { focus: 'descendant' },
                    expandAndCollapse: true,
                    animationDuration: 450,
                    animationDurationUpdate: 600,
                },
            ],
        },
        true,
    )

    treeChart.off('click')
    treeChart.on('click', (params) => {
        const abbr = abbrByName.value.get(params?.name)
        if (abbr) router.push(`/browse/${abbr}`)
    })
}

function cssVar(name, fallback = '') {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
    return v || fallback
}

/* ---------------- 位点表格 ---------------- */
const SORTABLE = new Set([
    'recorder', 'phas_loci', 'chromosome', 'genome_start', 'genome_end', 'locus_gene',
    'transcript', 'phas_gene_type', 'pvalue', 'phase_score', 'phase_ratio',
    'annotation', 'target_verified', 'initiator_verified', 'initiator_number',
    'phasi_rna_count',
])

const columns = [
    { key: 'recorder',           label: 'col.id',                w: 64 },
    { key: 'phas_loci',          label: 'col.locus',             link: true },
    { key: 'chromosome',         label: 'col.chromosome',        w: 100 },
    { key: 'genome_start',       label: 'col.genomeStart',       w: 112, num: true },
    { key: 'genome_end',         label: 'col.genomeEnd',         w: 112, num: true },
    { key: 'locus_gene',         label: 'col.gene',              w: 124, idLink: true },
    { key: 'transcript',         label: 'col.transcript',        w: 148, idLink: true },
    { key: 'phas_gene_type',     label: 'browse.source',         w: 96 },
    { key: 'transcript_start',   label: 'browse.startTx',        w: 104, sortable: false, num: true },
    { key: 'transcript_end',     label: 'browse.endTx',          w: 98,  sortable: false, num: true },
    { key: 'pvalue',             label: 'col.pvalue',            w: 116, sci: true, num: true },
    { key: 'phase_score',        label: 'col.phaseScore',        w: 104, num: true },
    { key: 'phase_ratio',        label: 'col.phaseRatio',        w: 96, num: true },
    { key: 'annotation',         label: 'col.annotation' },
    { key: 'method_ref',         label: 'col.methodRef',         w: 120, sortable: false },
    { key: 'target_verified',    label: 'col.targetVerified',    w: 122, badge: true },
    { key: 'initiator_verified', label: 'col.initiatorVerified', w: 138, badge: true },
    { key: 'initiator_number',   label: 'browse.initiatorNum',   w: 118, num: true },
    { key: 'phasi_rna_count',    label: 'browse.sirnaNum',       w: 122, num: true },
]

async function fetchLoci(push = false) {
    if (!currentSpecies.value) return
    loading.value = true
    error.value = ''
    try {
        const d = await api.loci({
            species: currentSpecies.value,
            q: keyword.value || undefined,
            sort: sort.value,
            order: order.value,
            page: page.value,
            pageSize: pageSize.value,
        })
        rows.value = d.rows
        total.value = d.total
        pageCount.value = d.pageCount
    } catch (e) {
        error.value = e.message
        rows.value = []
        total.value = 0
    } finally {
        loading.value = false
    }
    syncUrl(push)
}

/** 把当前表格状态写进 URL。
 *  push=false 用 replace（关键词防抖输入，不值得占历史栈）；
 *  push=true 用 push（排序/翻页/页大小是显式动作，浏览器后退应能撤销）。 */
function syncUrl(push = false) {
    const q = {}
    if (keyword.value) q.q = keyword.value
    if (page.value > 1) q.page = page.value
    if (pageSize.value !== 25) q.size = pageSize.value
    if (sort.value !== 'recorder') q.sort = sort.value
    if (order.value !== 'asc') q.order = order.value
    const nav = push ? router.push : router.replace
    nav({ query: q }).catch(() => {})
}

let debounceTimer = null
/** 关键词防抖输入（400ms） */
function onKeywordInput() {
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
        page.value = 1
        fetchLoci()
    }, 400)
}

function toggleSort(key) {
    if (!SORTABLE.has(key)) return
    if (sort.value === key) order.value = order.value === 'asc' ? 'desc' : 'asc'
    else { sort.value = key; order.value = 'desc' }
    page.value = 1
    fetchLoci(true)
}

function goto(p) {
    if (p < 1 || p > pageCount.value) return
    page.value = p
    fetchLoci(true)
}

function setPageSize(n) {
    pageSize.value = n
    page.value = 1
    fetchLoci(true)
}

function toggleCompact() {
    compact.value = !compact.value
    try { localStorage.setItem('ppsd.compact', compact.value ? '1' : '0') } catch { /* 忽略 */ }
}

/** 分页页码窗口：当前页前后各 2 页 */
const pageWindow = computed(() => {
    const w = []
    const from = Math.max(1, page.value - 2)
    const to = Math.min(pageCount.value, from + 4)
    for (let i = Math.max(1, to - 4); i <= to; i++) w.push(i)
    return w
})

const DASH = new Set(['none', 'na', 'n/a', '-', ''])
function fmtNum(v, col) {
    if (v === null || v === undefined || v === '') return t('common.empty')
    if (typeof v === 'string' && DASH.has(v.trim().toLowerCase())) return t('common.empty')
    if (col?.sci && typeof v === 'number') return v < 0.001 ? v.toExponential(3) : v.toFixed(4)
    if (typeof v === 'number') return Number.isInteger(v) ? v.toLocaleString('en-US') : v.toFixed(3)
    return v
}

const ID_LIKE = /^(LOC|XM_|NM_|XR_|NR_|NC_|NP_|XP_)/i
const isRealId = (v) => typeof v === 'string' && ID_LIKE.test(v.trim())

/** 导出当前页为 CSV */
function exportCsv() {
    downloadCsv(
        `PPSD_${currentSpecies.value}_p${page.value}.csv`,
        rows.value,
        columns.map((c) => ({ label: t(c.label), key: c.key })),
    )
}

/* 导出全部（当前筛选+排序）—— 逐页拉取后合并，一次下载 */
const exportingAll = ref(false)
async function exportAllCsv() {
    if (exportingAll.value) return
    exportingAll.value = true
    try {
        const all = []
        const size = 200
        for (let p = 1; p <= pageCount.value; p++) {
            const d = await api.loci({
                species: currentSpecies.value,
                q: keyword.value || undefined,
                sort: sort.value,
                order: order.value,
                page: p,
                pageSize: size,
            })
            all.push(...d.rows)
        }
        downloadCsv(
            `PPSD_${currentSpecies.value}_all_${all.length}.csv`,
            all,
            columns.map((c) => ({ label: t(c.label), key: c.key })),
        )
    } catch (e) {
        error.value = e.message
    } finally {
        exportingAll.value = false
    }
}

async function loadTree() {
    treeLoading.value = true
    treeError.value = ''
    try {
        const d = await api.speciesTree()
        treeData.value = d.tree
    } catch (e) {
        treeError.value = e.message
    } finally {
        treeLoading.value = false
    }
}

const onResize = () => treeChart?.resize()

onMounted(async () => {
    try {
        const d = await api.species()
        speciesList.value = d.species
    } catch (e) {
        error.value = e.message
    }
    await loadTree()
    if (hasSpeciesSelected.value) fetchLoci()
    else {
        await nextTick()
        drawTree()
    }
    window.addEventListener('resize', onResize)
})

onBeforeUnmount(() => {
    window.removeEventListener('resize', onResize)
    treeChart?.dispose()
    treeChart = null
})

watch(
    () => route.params.species,
    async (sp) => {
        // 物种切换时把整套表格状态从 URL 恢复一遍（q/sort/order/size/page），
        // 保证"同一视图跨物种对比"时列排序不会悄悄重置
        page.value = Math.max(1, parseInt(route.query.page) || 1)
        pageSize.value = [25, 50, 100, 200].includes(parseInt(route.query.size)) ? parseInt(route.query.size) : pageSize.value
        const urlSort = String(route.query.sort || '')
        if (SORTABLE.has(urlSort)) sort.value = urlSort
        if (['asc', 'desc'].includes(route.query.order)) order.value = route.query.order
        keyword.value = String(route.query.q || '')
        if (sp) {
            treeChart?.dispose()
            treeChart = null
            fetchLoci()
        } else {
            await nextTick()
            drawTree()
        }
    },
)

watch(locale, async () => {
    if (!hasSpeciesSelected.value) {
        await nextTick()
        drawTree()
    }
})

watch(treeData, async () => {
    if (treeData.value && !hasSpeciesSelected.value) {
        await nextTick()
        drawTree()
    }
})

watch(compact, () => {})
</script>

<template>
    <div class="page page-body">
        <div class="crumbs" style="margin-bottom: var(--sp-2)">
            <RouterLink to="/">{{ t('nav.home') }}</RouterLink>
            <span class="crumbs__sep">/</span>
            <span class="crumbs__here">{{ t('browse.title') }}</span>
        </div>

        <div class="layout">
            <!-- ============ 左栏：物种导航 ============ -->
            <aside class="sidebar">
                <div class="sidebar__group">
                    <ul class="sidebar__list">
                        <li>
                            <RouterLink to="/browse" class="sidebar__link" :class="{ 'is-active': !hasSpeciesSelected }">
                                <span>{{ t('browse.tree.title') }}</span>
                            </RouterLink>
                        </li>
                        <li v-for="sp in speciesList" :key="sp.abbr">
                            <RouterLink
                                :to="`/browse/${sp.abbr}`"
                                class="sidebar__link"
                                :class="{ 'is-active': currentSpecies === sp.abbr }"
                            >
                                <span class="rowline" style="gap: 8px">
                                    <span class="dot" :style="{ background: speciesColor(sp.abbr) }"></span>
                                    <span>{{ speciesName(sp) }}</span>
                                </span>
                                <span class="sidebar__count">{{ fmt(sp.phas_loci) }}</span>
                            </RouterLink>
                        </li>
                    </ul>
                </div>

                <div class="sidebar__group">
                    <div class="sidebar__title">{{ t('nav.search') }}</div>
                    <ul class="sidebar__list" style="position: static">
                        <li><RouterLink to="/search" class="sidebar__link"><span>{{ t('search.tab.locus') }}</span></RouterLink></li>
                        <li><RouterLink to="/download" class="sidebar__link"><span>{{ t('nav.download') }}</span></RouterLink></li>
                    </ul>
                </div>
            </aside>

            <!-- ============ 主内容列 ============ -->
            <div>
                <!-- —— 未选物种：树 —— -->
                <template v-if="!hasSpeciesSelected">
                    <h1 class="page-title">{{ t('browse.title') }}</h1>
                    <p class="page-sub">{{ t('browse.tree.hint') }}</p>

                    <div class="card">
                        <div class="card__head">
                            <span class="card__title">{{ t('browse.tree.title') }}</span>
                            <span class="legend">
                                <span class="legend__item"><span class="legend__swatch"></span>{{ t('browse.tree.haveData') }}</span>
                                <span class="legend__item"><span class="legend__swatch legend__swatch--hollow"></span>{{ t('browse.tree.noData') }}</span>
                            </span>
                        </div>

                        <div v-if="treeLoading" class="state">
                            <div class="state__spinner"></div>
                            {{ t('state.loading') }}
                        </div>
                        <div v-else-if="treeError" class="state state--error">
                            {{ treeError }}
                        </div>
                        <!-- 演示快照不含系统树（tree 为 null）：给说明，别留一个空盒子 -->
                        <div v-else-if="!treeData" class="state">
                            <div class="note note--warn" style="max-width: 620px">{{ t('browse.tree.demoNote') }}</div>
                        </div>
                        <div v-else class="card__body">
                            <div ref="treeEl" style="width: 100%; height: 1700px"></div>
                        </div>

                        <div class="card__foot">{{ t('browse.sub') }}</div>
                    </div>
                </template>

                <!-- —— 已选物种：表格 —— -->
                <template v-else>
                    <!-- 物种头 -->
                    <div v-if="currentSpeciesInfo" class="rowline rowline--wrap" style="gap: var(--sp-3); margin-bottom: var(--sp-4)">
                        <span class="sp-dot" :style="{ background: speciesColor(currentSpecies) }">{{ currentSpecies.toUpperCase() }}</span>
                        <div>
                            <h1 class="sp-title display">{{ speciesName(currentSpeciesInfo) }}
                                <span class="dim" style="font-style: italic; font-size: var(--fs-md); font-weight: 400">{{ currentSpeciesInfo.scientific_name }}</span>
                            </h1>
                            <div class="muted" style="font-size: var(--fs-sm)">
                                <span class="mono strong">{{ fmt(total) }}</span> {{ t('browse.count') }}
                                <span class="dim"> · </span><span class="mono strong">{{ fmt(currentSpeciesInfo.phasi_rna) }}</span> {{ t('stat.sirna') }}
                                <span class="dim"> · </span><span class="mono strong">{{ fmt(currentSpeciesInfo.loci_target_verified) }}</span> {{ t('stat.verified') }}
                                <template v-if="keyword"> · {{ t('browse.filteredBy') }} “{{ keyword }}”</template>
                            </div>
                        </div>
                    </div>

                    <!-- 工具栏 -->
                    <div class="toolbar card">
                        <div class="toolbar__search">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="color: var(--c-text-muted)">
                                <circle cx="11" cy="11" r="7" />
                                <path d="m20 20-3.5-3.5" />
                            </svg>
                            <input
                                v-model="keyword"
                                class="toolbar__input"
                                :placeholder="t('browse.placeholder')"
                                @input="onKeywordInput"
                                @keyup.enter="page = 1; fetchLoci()"
                            />
                            <button v-if="keyword" class="chip__x" @click="keyword = ''; page = 1; fetchLoci()">✕</button>
                        </div>

                        <div class="toolbar__right">
                            <div class="seg" role="group" :aria-label="t('ux.density')">
                                <button class="seg__btn" :class="{ 'is-active': compact }" @click="toggleCompact">{{ t('ux.compact') }}</button>
                                <button class="seg__btn" :class="{ 'is-active': !compact }" @click="toggleCompact">{{ t('ux.cozy') }}</button>
                            </div>

                            <select class="select" style="width: auto" :value="pageSize" @change="setPageSize(parseInt($event.target.value))">
                                <option v-for="n in [25, 50, 100, 200]" :key="n" :value="n">{{ n }} {{ t('ux.rows') }}</option>
                            </select>

                            <button class="btn btn--secondary btn--sm" @click="exportCsv">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" />
                                </svg>
                                {{ t('ux.export') }}
                            </button>
                            <button class="btn btn--ghost btn--sm" :disabled="exportingAll" @click="exportAllCsv">
                                {{ exportingAll ? '…' : t('ux.exportAll') }}
                            </button>
                        </div>
                    </div>

                    <!-- 表格 -->
                    <div v-if="error" class="state state--error">{{ error }}</div>

                    <div v-else class="card">
                        <div class="table-wrap" :class="{ 'is-loading': loading }" style="max-height: 68vh">
                            <table class="data" :class="{ 'is-compact': compact }">
                                <thead>
                                    <tr>
                                        <th
                                            v-for="col in columns"
                                            :key="col.key"
                                            :class="{ 'is-sortable': col.sortable !== false, 'is-sorted': sort === col.key, 'num-cell': col.num }"
                                            :aria-sort="sort === col.key ? (order === 'asc' ? 'ascending' : 'descending') : 'none'"
                                            scope="col"
                                            :style="col.w ? `min-width:${col.w}px` : ''"
                                            @click="toggleSort(col.key)"
                                        >
                                            {{ t(col.label) }}
                                            <span class="sort-ind">{{ sort === col.key ? (order === 'asc' ? '▲' : '▼') : '⇅' }}</span>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-for="r in rows" :key="r.phas_loci">
                                        <td v-for="col in columns" :key="col.key" :class="{ mono: col.key !== 'annotation', 'num-cell': col.num }">
                                            <RouterLink v-if="col.link" :to="`/locus/${encodeURIComponent(r.phas_loci)}`" class="strong">
                                                {{ r[col.key] }}
                                            </RouterLink>

                                            <a v-else-if="col.idLink && isRealId(r[col.key])"
                                                :href="`https://www.ncbi.nlm.nih.gov/gene/?term=${r[col.key]}`"
                                                target="_blank" rel="noopener">
                                                {{ r[col.key] }}
                                            </a>

                                            <span v-else-if="col.badge" class="badge" :class="r[col.key] === 'yes' ? 'badge--yes' : 'badge--no'">
                                                {{ r[col.key] === 'yes' ? t('common.yes') : t('common.no') }}
                                            </span>

                                            <span v-else-if="col.key === 'annotation'" class="cell-clip" :title="r[col.key] || ''">{{ fmtNum(r[col.key], col) }}</span>

                                            <template v-else>{{ fmtNum(r[col.key], col) }}</template>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                            <div v-if="loading" class="table-veil"><div class="state__spinner"></div></div>
                        </div>

                        <!-- 分页条 -->
                        <div class="pager">
                            <span class="pager__info">
                                <span class="mono">{{ fmt(total) }}</span> {{ t('browse.count') }}
                                · <span class="mono">{{ pageSize }}</span> {{ t('pager.perPage') }}
                            </span>
                            <div class="pager__ctl">
                                <button class="pager__btn" :disabled="page <= 1" @click="goto(1)">«</button>
                                <button class="pager__btn" :disabled="page <= 1" @click="goto(page - 1)">‹</button>
                                <button
                                    v-for="p in pageWindow"
                                    :key="p"
                                    class="pager__btn"
                                    :class="{ 'is-active': p === page }"
                                    @click="goto(p)"
                                >
                                    {{ p }}
                                </button>
                                <button class="pager__btn" :disabled="page >= pageCount" @click="goto(page + 1)">›</button>
                                <button class="pager__btn" :disabled="page >= pageCount" @click="goto(pageCount)">»</button>
                            </div>
                        </div>
                    </div>
                </template>
            </div>

        </div>
    </div>
</template>

<style scoped>
/* 物种标题行 */
.sp-dot {
    width: 52px;
    height: 52px;
    flex: none;
    border-radius: var(--r-lg);
    display: grid;
    place-items: center;
    color: #fff;
    font-family: var(--font-mono);
    font-size: var(--fs-sm);
    font-weight: 600;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.18);
}
.sp-title { font-size: var(--fs-2xl); margin: 0; }

/* 工具栏 */
.toolbar {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    padding: var(--sp-2) var(--sp-3);
    margin-bottom: var(--sp-4);
    flex-wrap: wrap;
}
.toolbar__search {
    flex: 1;
    min-width: 220px;
    display: flex;
    align-items: center;
    gap: 8px;
    border: 1px solid var(--c-border-strong);
    border-radius: var(--r-md);
    padding: 0 10px;
    background: var(--c-surface);
    transition: border-color var(--dur) var(--ease), box-shadow var(--dur) var(--ease);
}
.toolbar__search:focus-within {
    border-color: var(--c-accent);
    box-shadow: 0 0 0 3px rgba(18, 122, 80, 0.14);
}
.toolbar__input {
    flex: 1;
    border: 0;
    outline: none;
    background: transparent;
    font: inherit;
    font-size: var(--fs-sm);
    color: var(--c-text);
    padding: 8px 0;
}
.toolbar__right { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; }

/* 换页时表格上的半透明遮罩（不闪白） */
.table-wrap { position: relative; }
.table-veil {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    background: color-mix(in srgb, var(--c-surface) 55%, transparent);
    backdrop-filter: blur(1px);
}

/* 右栏通路列表 */
.b-flow {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
}
.b-flow li { display: flex; gap: var(--sp-2); align-items: flex-start; }
.flow__n {
    font-family: var(--font-mono);
    font-size: var(--fs-xs);
    color: var(--c-text-3);
    background: var(--c-surface-sunk);
    border: 1px solid var(--c-border);
    border-radius: var(--r-sm);
    padding: 0 4px;
    flex-shrink: 0;
    margin-top: 2px;
}
.flow__t { font-weight: 600; color: var(--c-text); font-size: var(--fs-sm); }
.flow__d { color: var(--c-text-3); font-size: var(--fs-xs); }
</style>
