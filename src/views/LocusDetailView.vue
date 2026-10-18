<!--
    单个 PHAS 位点详情 —— 对应原站 single_cluster.php。

    板块与原站一致：基本信息 / 序列 / 相位分布图 / phasiRNA 表 / 起始因子表。
    相位分布图是本页的核心：原站是一张服务端静态 JPG，这里是前端 ECharts 动态绘制，
    v2 又加了"相邻间距直方图" —— 21 nt 处一根独峰就是强相位的直接证据。

    UX：顶部深色页眉带（物种色块 + 徽章 + 复制位点名）、序列一键复制 + GC 含量、
    表格滚动容器、分页。
-->
<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import api, { speciesName } from '../api/ppsd.js'
import { t, locale } from '../i18n/index.js'
import { useChart, darkTooltip, cssVar, speciesColor } from '../utils/echarts.js'
import { fmt, copyText } from '../utils/ui.js'

const route = useRoute()

const locus = ref(null)
const sirnas = ref([])
const sirnaTotal = ref(0)
const sirnaPage = ref(1)
const sirnaPageSize = ref(25)
const sirnaPageCount = ref(1)
const initiators = ref([])
const loading = ref(true)
const error = ref('')

const fmtP = (v) =>
    v === null || v === undefined
        ? t('common.empty')
        : v < 0.001
          ? Number(v).toExponential(3)
          : Number(v).toFixed(4)

const PLAIN_DASH = new Set(['none', 'na', 'n/a', '-', ''])
const orDash = (v) =>
    v === null || v === undefined || PLAIN_DASH.has(String(v).trim().toLowerCase())
        ? t('common.empty')
        : v

const ID_LIKE = /^(LOC|XM_|NM_|XR_|NR_|NC_|NP_|XP_)/i
const isRealId = (v) => typeof v === 'string' && ID_LIKE.test(v.trim())

const gcContent = computed(() => {
    const seq = locus.value?.sequence
    if (!seq) return null
    const gc = (seq.match(/[GC]/gi) || []).length
    return ((gc / seq.length) * 100).toFixed(1) + '%'
})

const basicRows = computed(() => {
    const d = locus.value
    if (!d) return []
    /* 负链位点源数据里 start > end，展示时规范成从小到大（手工比对坐标的人只会困惑） */
    const lo = Math.min(d.genome_start, d.genome_end)
    const hi = Math.max(d.genome_start, d.genome_end)
    return [
        { k: 'f.position', v: `Chr${d.chromosome}:${lo}-${hi}${d.genome_start > d.genome_end ? ' (−)' : ''} ;  ${d.transcript}:${d.transcript_start}-${d.transcript_end}` },
        { k: 'f.locusGene', v: orDash(d.locus_gene), idLink: true },
        { k: 'f.transcript', v: orDash(d.transcript), idLink: true },
        { k: 'f.sourceType', v: orDash(d.phas_gene_type) },
        { k: 'f.annotation', v: orDash(d.annotation) },
        { k: 'f.clusterId', v: d.recorder },
        { k: 'f.pvalue', v: fmtP(d.pvalue) },
        { k: 'f.phaseScore', v: d.phase_score ?? t('common.empty') },
        { k: 'f.phaseRatio', v: d.phase_ratio ?? t('common.empty') },
        { k: 'f.methodRef', v: orDash(d.method_ref) },
        { k: 'f.sirnaNum', v: fmt(d.phasi_rna_count) },
        { k: 'f.initiatorNum', v: fmt(d.initiator_count) },
    ]
})

/* 按位点排序的全部 phasiRNA（画相位图用，不分页） */
const sortedSirnas = computed(() =>
    [...sirnas.value]
        .filter((s) => s.start_in_transcript != null)
        .sort((a, b) => a.start_in_transcript - b.start_in_transcript),
)

const medianGap = computed(() => {
    const rows = sortedSirnas.value
    const gaps = rows.slice(1).map((s, i) => s.start_in_transcript - rows[i].start_in_transcript).filter((g) => g > 0)
    return gaps.length ? [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)] : null
})

/* ---------- 老站位点结构图（plot/{物种}/{span}/{recorder}.jpg）----------
   老站 single_cluster.php 里唯一在线运行的图表，按 recorder 编号直接取图。
   图片属于静态资产，部署时把老站 plot/ 目录放到站点根下即可生效；
   路径必须带构建 base（/PPSD_new/），否则在 /locus/:id 下会解析成
   /PPSD_new/locus/plot/... 而 404。
   本地开发/演示版没有这个目录，img onerror 后显示提示。 */
const legacyPlot = computed(() => {
    const l = locus.value
    if (!l?.recorder || !l.scientific_name) return null
    const span = (l.phas_loci.match(/@(\d+)#/) || [])[1] || '21'
    const dir = l.scientific_name.toLowerCase().replace(/\s+/g, '_')
    const base = import.meta.env.BASE_URL || '/'
    return {
        url: `${base}plot/${dir}/${span}/${l.recorder}.jpg`,
        species: dir,
        span,
        recorder: l.recorder,
    }
})
const legacyPlotFailed = ref(false)

/* ---------- 相位分布散点 ---------- */
const { el: plotEl, setOption: setPlot } = useChart((rows) => {
    const mk = (r, i) => [r.start_in_transcript, i + 1, r.phasi_rna, r.length, r.strand]
    const plus = rows.filter((r) => r.strand !== '-').map(mk)
    const minus = rows.filter((r) => r.strand === '-').map(mk)
    return {
        tooltip: darkTooltip({
            trigger: 'item',
            formatter: (p) =>
                `<b>${p.value[2]}</b><br/>${t('f.position')}: ${p.value[0]}<br/>${t('col.length')}: ${p.value[3]} nt<br/>${t('col.strand')}: ${p.value[4] || '+'}`,
        }),
        legend: {
            data: [t('detail.plot.plus'), t('detail.plot.minus')],
            top: 0,
            right: 0,
            icon: 'circle',
            itemWidth: 9,
            itemHeight: 9,
            textStyle: { color: cssVar('--c-text-3'), fontSize: 11 },
        },
        grid: { left: 8, right: 12, top: 34, bottom: 4, containLabel: true },
        xAxis: {
            type: 'value',
            scale: true,
            name: medianGap.value
                ? `${t('detail.plot.axisX')}   ·   ${t('detail.plot.spacing')} ${medianGap.value} nt`
                : t('detail.plot.axisX'),
            nameLocation: 'middle',
            nameGap: 28,
            nameTextStyle: { color: cssVar('--c-text-3'), fontSize: 11 },
            axisLine: { lineStyle: { color: cssVar('--c-border-strong') } },
            axisLabel: { color: cssVar('--c-text-3'), fontSize: 11 },
            splitLine: { lineStyle: { color: cssVar('--c-border') } },
        },
        yAxis: {
            type: 'value',
            name: t('detail.plot.axisY'),
            nameTextStyle: { color: cssVar('--c-text-3'), fontSize: 11 },
            axisLine: { show: false },
            axisLabel: { color: cssVar('--c-text-3'), fontSize: 11 },
            minInterval: 1,
            splitLine: { lineStyle: { color: cssVar('--c-border') } },
        },
        series: [
            {
                name: t('detail.plot.plus'),
                type: 'scatter',
                symbolSize: 10,
                data: plus,
                itemStyle: { color: cssVar('--c-accent', '#127a50'), borderColor: '#fff', borderWidth: 1 },
            },
            {
                name: t('detail.plot.minus'),
                type: 'scatter',
                symbolSize: 10,
                data: minus,
                itemStyle: { color: cssVar('--c-sp-zma', '#e3a63b'), borderColor: '#fff', borderWidth: 1 },
            },
        ],
    }
})

/* ---------- 相邻间距直方图（21 nt 处出峰 = 强相位） ---------- */
const { el: gapEl, setOption: setGap } = useChart((rows) => {
    const gaps = rows.slice(1).map((s, i) => s.start_in_transcript - rows[i].start_in_transcript).filter((g) => g > 0)
    const counts = {}
    gaps.forEach((g) => (counts[g] = (counts[g] || 0) + 1))
    const keys = Object.keys(counts).map(Number).sort((a, b) => a - b).slice(0, 40)
    const peak = medianGap.value
    return {
        tooltip: darkTooltip({
            formatter: (p) => `${t('detail.gapHist.x')}: <strong>${keys[p.dataIndex]} nt</strong><br/>${t('detail.gapHist.count')}: ${fmt(p.value)}`,
        }),
        grid: { left: 8, right: 8, top: 14, bottom: 0, containLabel: true },
        xAxis: {
            type: 'category',
            data: keys.map(String),
            axisLine: { lineStyle: { color: cssVar('--c-border-strong') } },
            axisTick: { show: false },
            axisLabel: { color: cssVar('--c-text-3'), fontSize: 10, fontFamily: 'IBM Plex Mono' },
        },
        yAxis: {
            type: 'value',
            splitLine: { lineStyle: { color: cssVar('--c-border') } },
            axisLabel: { color: cssVar('--c-text-3'), fontSize: 10 },
        },
        series: [
            {
                type: 'bar',
                barCategoryGap: 20,
                data: keys.map((k) => ({
                    value: counts[k],
                    itemStyle: {
                        borderRadius: [2, 2, 0, 0],
                        color: k === peak ? cssVar('--c-accent', '#127a50') : cssVar('--c-chart-2', '#9aa9a0'),
                    },
                })),
            },
        ],
    }
})

async function fetchAll() {
    const id = route.params.id
    loading.value = true
    error.value = ''
    try {
        const [l, sr, ini] = await Promise.all([
            api.locus(id),
            api.locusPhasiRna(id, { page: sirnaPage.value, pageSize: sirnaPageSize.value }),
            api.locusInitiators(id),
        ])
        locus.value = l
        sirnas.value = sr.rows
        sirnaTotal.value = sr.total
        sirnaPageCount.value = sr.pageCount
        initiators.value = ini.rows
    } catch (e) {
        error.value = e.message
        locus.value = null
    } finally {
        loading.value = false
    }
    if (!error.value && locus.value) {
        await nextTick()
        setPlot(sortedSirnas.value)
        setGap(sortedSirnas.value)
    }
}

async function gotoSirnaPage(p) {
    if (p < 1 || p > sirnaPageCount.value) return
    sirnaPage.value = p
    try {
        const sr = await api.locusPhasiRna(route.params.id, { page: p, pageSize: sirnaPageSize.value })
        sirnas.value = sr.rows
    } catch (e) {
        error.value = e.message
    }
}

onMounted(() => fetchAll())

watch(
    () => route.params.id,
    () => {
        sirnaPage.value = 1
        fetchAll()
    },
)
</script>

<template>
    <div>
        <div v-if="loading" class="page page-body">
            <div class="skeleton skeleton--title"></div>
            <div class="skeleton skeleton--block"></div>
        </div>

        <div v-else-if="error" class="page page-body state state--error">{{ error }}</div>

        <template v-else-if="locus">
            <!-- ===== 深色页眉带 ===== -->
            <section class="on-dark locus-hero">
                <div class="page" style="padding-top: var(--sp-5); padding-bottom: var(--sp-5)">
                    <nav class="crumbs">
                        <RouterLink to="/">{{ t('nav.home') }}</RouterLink>
                        <span class="crumbs__sep">/</span>
                        <RouterLink :to="`/browse/${locus.species}`">{{ t('nav.browse') }} · {{ speciesName(locus) }}</RouterLink>
                        <span class="crumbs__sep">/</span>
                        <span class="crumbs__here">{{ t('crumbs.cluster') }}</span>
                    </nav>

                    <div class="rowline rowline--wrap" style="gap: var(--sp-4); margin-top: var(--sp-3)">
                        <span class="locus-hero__dot" :style="{ background: speciesColor(locus.species) }">
                            {{ locus.species.toUpperCase() }}
                        </span>
                        <div style="min-width: 0">
                            <h1 class="locus-hero__id mono display">{{ locus.phas_loci }}</h1>
                            <div class="rowline rowline--wrap" style="gap: var(--sp-2); margin-top: 6px">
                                <span class="badge badge--soft on-dark">{{ locus.scientific_name }}</span>
                                <span class="badge" :class="locus.target_verified === 'yes' ? 'badge--yes' : 'badge--no'">
                                    {{ t('col.targetVerified') }}: {{ locus.target_verified === 'yes' ? t('common.yes') : t('common.no') }}
                                </span>
                                <span class="badge" :class="locus.initiator_verified === 'yes' ? 'badge--yes' : 'badge--no'">
                                    {{ t('col.initiatorVerified') }}: {{ locus.initiator_verified === 'yes' ? t('common.yes') : t('common.no') }}
                                </span>
                            </div>
                        </div>
                        <div class="spacer"></div>
                        <button class="btn btn--secondary btn--sm" @click="copyText(locus.phas_loci, t('ux.copied'))">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="9" y="9" width="12" height="12" rx="2" />
                                <path d="M5 15V5a2 2 0 0 1 2-2h10" />
                            </svg>
                            {{ t('ux.copy') }}
                        </button>
                    </div>
                </div>
            </section>

            <div class="page page-body" style="padding-top: var(--sp-5)">
                <div class="detail-grid">
                    <!-- ===== 基本信息 ===== -->
                    <section class="card" style="grid-column: span 7">
                        <div class="card__head">
                            <span class="card__title">{{ t('detail.basic') }}</span>
                        </div>
                        <div class="card__body card__body--flush">
                            <div class="kv">
                                <template v-for="row in basicRows" :key="row.k">
                                    <div class="kv__k">{{ t(row.k) }}</div>
                                    <div class="kv__v">
                                        <a v-if="row.idLink && isRealId(row.v)"
                                            :href="`https://www.ncbi.nlm.nih.gov/gene/?term=${row.v}`"
                                            target="_blank" rel="noopener" class="mono">
                                            {{ row.v }}
                                        </a>
                                        <span v-else :class="{ mono: row.k !== 'f.annotation' }">{{ row.v }}</span>
                                    </div>
                                </template>
                            </div>
                        </div>
                    </section>

                    <!-- ===== 序列 ===== -->
                    <section v-if="locus.sequence" class="card seq-card" style="grid-column: span 5">
                        <div class="card__head">
                            <span class="card__title">{{ t('detail.sequence') }}</span>
                            <span class="card__hint mono">{{ fmt(locus.seq_length) }} nt · GC {{ gcContent }}</span>
                            <div class="spacer"></div>
                            <button class="btn btn--secondary btn--sm" @click="copyText(locus.sequence, t('ux.copied'))">
                                {{ t('detail.copySeq') }}
                            </button>
                        </div>
                        <div class="card__body">
                            <div class="seq-block seq-block--tall">{{ locus.sequence }}</div>
                        </div>
                    </section>

                    <!-- ===== 相位分布 + 间距直方图 ===== -->
                    <section v-if="sortedSirnas.length" class="card" style="grid-column: span 12">
                        <div class="card__head">
                            <span class="card__title">{{ t('detail.plot') }}</span>
                            <span class="card__hint">{{ t('detail.plot.hint') }}</span>
                        </div>
                        <div class="card__body plot-grid">
                            <div class="chart-box" style="height: 300px">
                                <div ref="plotEl" class="chart"></div>
                            </div>
                            <div>
                                <div class="rowline" style="gap: 8px; margin-bottom: 4px">
                                    <span class="card__title" style="font-size: var(--fs-sm)">{{ t('detail.gapHist') }}</span>
                                    <span v-if="medianGap" class="badge badge--accent mono">{{ medianGap }} nt</span>
                                </div>
                                <div class="chart-box" style="height: 264px">
                                    <div ref="gapEl" class="chart"></div>
                                </div>
                            </div>
                        </div>
                    </section>

                    <!-- ===== 老站位点结构图 ===== -->
                    <section v-if="legacyPlot" class="card" style="grid-column: span 12">
                        <div class="card__head">
                            <span class="card__title">{{ t('detail.legacyPlot') }}</span>
                            <span class="card__hint">{{ t('detail.legacyPlot.hint') }}</span>
                        </div>
                        <div class="card__body" style="text-align: center">
                            <img
                                v-if="!legacyPlotFailed"
                                :src="legacyPlot.url"
                                :alt="t('detail.legacyPlot')"
                                class="legacy-plot"
                                @error="legacyPlotFailed = true"
                            />
                            <div v-else class="state">
                                {{ t('detail.legacyPlot.missing') }}
                                <div class="state__hint dim mono">{{ legacyPlot.url }}</div>
                            </div>
                        </div>
                    </section>

                    <!-- ===== phasiRNA 列表 ===== -->
                    <section class="card" style="grid-column: span 12">
                        <div class="card__head">
                            <span class="card__title">{{ t('detail.sirna') }}</span>
                            <span class="card__hint mono">{{ fmt(sirnaTotal) }}</span>
                        </div>

                        <div v-if="!sirnas.length" class="state">{{ t('detail.noSirna') }}</div>

                        <template v-else>
                            <div class="table-wrap">
                                <table class="data">
                                    <thead>
                                        <tr>
                                            <th scope="col" style="width: 56px">{{ t('col.id') }}</th>
                                            <th scope="col">{{ t('col.phasiRna') }}</th>
                                            <th scope="col">{{ t('browse.startTx') }}</th>
                                            <th scope="col">{{ t('browse.endTx') }}</th>
                                            <th scope="col">{{ t('col.strand') }}</th>
                                            <th scope="col">{{ t('col.sequence') }}</th>
                                            <th scope="col">{{ t('col.length') }}</th>
                                            <th scope="col">{{ t('col.targetNum') }}</th>
                                            <th scope="col">{{ t('col.targetVerified') }}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr v-for="(s, i) in sirnas" :key="s.phasi_rna">
                                            <td class="mono dim">{{ (sirnaPage - 1) * sirnaPageSize + i + 1 }}</td>
                                            <td class="mono">
                                                <RouterLink :to="`/phasi-rna/${encodeURIComponent(s.phasi_rna)}`" class="strong">
                                                    {{ s.phasi_rna }}
                                                </RouterLink>
                                            </td>
                                            <td class="mono">{{ s.start_in_transcript ?? t('common.empty') }}</td>
                                            <td class="mono">{{ s.end_in_transcript ?? t('common.empty') }}</td>
                                            <td class="mono">{{ s.strand ?? '+' }}</td>
                                            <td class="cell-seq">{{ s.sequence }}</td>
                                            <td class="mono">{{ s.length }}</td>
                                            <td class="mono">{{ s.verified_target_num ?? t('common.empty') }}</td>
                                            <td>
                                                <span class="badge" :class="s.target_verified ? 'badge--yes' : 'badge--no'">
                                                    {{ s.target_verified ? t('common.yes') : t('common.no') }}
                                                </span>
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            <div v-if="sirnaPageCount > 1" class="pager">
                                <span class="pager__info">
                                    {{ t('pager.page') }} <span class="mono">{{ sirnaPage }}</span> {{ t('pager.of') }} <span class="mono">{{ sirnaPageCount }}</span>
                                </span>
                                <div class="pager__ctl">
                                    <button class="pager__btn" :disabled="sirnaPage <= 1" @click="gotoSirnaPage(sirnaPage - 1)">‹</button>
                                    <button class="pager__btn" :disabled="sirnaPage >= sirnaPageCount" @click="gotoSirnaPage(sirnaPage + 1)">›</button>
                                </div>
                            </div>
                        </template>
                    </section>

                    <!-- ===== 起始因子 ===== -->
                    <section class="card" style="grid-column: span 12">
                        <div class="card__head">
                            <span class="card__title">{{ t('detail.initiator') }}</span>
                            <span class="card__hint mono">{{ initiators.length }}</span>
                        </div>

                        <div v-if="!initiators.length" class="state">
                            {{ t('detail.noInitiator') }}
                            <div class="state__hint dim">{{ t('detail.noInitiatorHint') }}</div>
                        </div>

                        <div v-else class="table-wrap">
                            <table class="data">
                                <thead>
                                    <tr>
                                        <th scope="col" style="width: 56px">{{ t('col.id') }}</th>
                                        <th scope="col">{{ t('col.mirna') }}</th>
                                        <th scope="col">{{ t('col.transcript') }}</th>
                                        <th scope="col">{{ t('col.cleavage') }}</th>
                                        <th scope="col">{{ t('col.targetPosEnd') }}</th>
                                        <th scope="col">{{ t('col.posmax') }}</th>
                                        <th scope="col">{{ t('col.distance') }}</th>
                                        <th scope="col">{{ t('col.initiatorSeq') }}</th>
                                        <th scope="col">{{ t('col.length') }}</th>
                                        <th scope="col">{{ t('col.verified') }}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-for="(it, i) in initiators" :key="it.id">
                                        <td class="mono dim">{{ i + 1 }}</td>
                                        <td class="mono strong">
                                            <!-- miRNA 名可点击：反查该 miRNA 触发的所有位点 -->
                                            <RouterLink :to="{ path: '/search', query: { q: it.mirna, type: 'mirna' } }">
                                                {{ it.mirna }}
                                            </RouterLink>
                                        </td>
                                        <td class="mono">{{ it.geneid }}</td>
                                        <td class="mono">{{ it.cleavege_site ?? t('common.empty') }}</td>
                                        <td class="mono">{{ it.target_pos_end ?? t('common.empty') }}</td>
                                        <td class="mono">{{ it.posmax_min ?? t('common.empty') }}</td>
                                        <td class="mono">{{ it.distance ?? t('common.empty') }}</td>
                                        <td class="cell-seq">{{ it.initiator_seq }}</td>
                                        <td class="mono">{{ it.initiator_len }}</td>
                                        <td>
                                            <span class="badge" :class="it.verified === 'yes' ? 'badge--yes' : 'badge--no'">
                                                {{ it.verified === 'yes' ? t('common.yes') : t('common.no') }}
                                            </span>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </section>
                </div>
            </div>
        </template>
    </div>
</template>

<style scoped>
.locus-hero {
    background: var(--grad-hero);
    color: var(--c-hero-text);
    position: relative;
    overflow: hidden;
}
.locus-hero::after {
    content: '';
    position: absolute;
    right: -40px;
    top: -60px;
    width: 220px;
    height: 220px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(127, 214, 172, 0.22), transparent 65%);
    pointer-events: none;
}
.locus-hero .crumbs a { color: var(--c-hero-dim); }
.locus-hero .crumbs a:hover { color: #fff; }
.locus-hero .crumbs__here { color: var(--c-hero-text); }
.locus-hero__dot {
    width: 48px;
    height: 48px;
    flex: none;
    border-radius: var(--r-lg);
    display: grid;
    place-items: center;
    color: #fff;
    font-family: var(--font-mono);
    font-size: var(--fs-sm);
    font-weight: 600;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}
.locus-hero__id {
    font-size: var(--fs-2xl);
    color: #fff;
    letter-spacing: -0.01em;
    word-break: break-all;
}
.on-dark .badge--soft { background: rgba(242, 247, 243, 0.1); border-color: rgba(242, 247, 243, 0.2); color: var(--c-hero-dim); }

.detail-grid {
    display: grid;
    grid-template-columns: repeat(12, 1fr);
    gap: var(--sp-4);
    align-items: start; /* 卡片保持自然高度，不留死白 */
}
/* 序列卡是右列唯一内容，撑满行高，避免旁边留一大块空白 */
.seq-card { align-self: stretch; display: flex; flex-direction: column; }
.seq-card .card__body { flex: 1; }
.seq-block--tall { max-height: none; height: 100%; }
@media (max-width: 1024px) {
    .detail-grid > * { grid-column: span 12 !important; }
}

.plot-grid {
    display: grid;
    grid-template-columns: 7fr 5fr;
    gap: var(--sp-5);
}
@media (max-width: 900px) {
    .plot-grid { grid-template-columns: 1fr; }
}
.legacy-plot {
    max-width: 100%;
    height: auto;
    border-radius: var(--radius-lg, 12px);
    border: 1px solid var(--c-border);
    background: #fff;
}
</style>
