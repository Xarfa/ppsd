<!--
    单条 phasiRNA 详情 —— 对应原站 single_phasiRNA.php?id=。

    v2：深色页眉带（物种色块 + 徽章）、序列一键复制、
    靶基因「降解组证据分类」小环图 + 按文库分布的横向条形图、靶基因全表。
-->
<script setup>
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import api, { speciesName } from '../api/ppsd.js'
import { t } from '../i18n/index.js'
import TplotModal from '../components/TplotModal.vue'
import { useChart, darkTooltip, cssVar, speciesColor } from '../utils/echarts.js'
import { fmt, copyText } from '../utils/ui.js'

const route = useRoute()
const data = ref(null)
const loading = ref(true)
const error = ref('')
const tplot = ref(null)

function openTplot(tg) {
    if (!tg?.tplot) return
    tplot.value = {
        src: `${import.meta.env.BASE_URL}${tg.tplot}`,
        title: tg.verified_target || t('tplot.title'),
    }
}

const basicRows = computed(() => {
    const d = data.value
    if (!d) return []
    return [
        { k: 'f.species', v: `${speciesName(d)} (${d.scientific_name})`, plain: true },
        { k: 'f.phasGene', v: d.parent_locus, locus: true },
        { k: 'f.locusGene', v: d.locus_gene || t('common.empty') },
        { k: 'f.transcript', v: d.transcript || t('common.empty') },
        { k: 'f.annotation', v: d.annotation || t('common.empty') },
        { k: 'f.length', v: `${d.length} nt` },
        { k: 'f.targetNum', v: fmt(d.target_count) },
    ]
})

/** 后端告诉前端：这个物种的靶基因表到底导没导（不是"有没有靶基因"） */
const targetDataAvailable = computed(() => data.value?.target_data_available !== false)

const catLabel = (c) => (c === 'Cat_1' ? t('stats.cat.1') : c === 'Cat_2' ? t('stats.cat.2') : t('stats.cat.unknown'))
const catColor = (c) => (c === 'Cat_1' ? cssVar('--c-accent', '#127a50') : c === 'Cat_2' ? cssVar('--c-sp-zma', '#e3a63b') : cssVar('--c-chart-2', '#9aa9a0'))

/* ---------- 靶基因证据分类环图 ---------- */
const { el: catEl, setOption: setCat } = useChart((d) => {
    const byCat = {}
    d.targets.forEach((tg) => {
        const k = tg.category || 'Unknown'
        byCat[k] = (byCat[k] || 0) + 1
    })
    const rows = Object.entries(byCat).map(([c, n]) => ({ name: catLabel(c), value: n, color: catColor(c) }))
    return {
        tooltip: darkTooltip({ trigger: 'item', formatter: (p) => `${p.marker} ${p.name}<br/><strong>${fmt(p.value)}</strong> (${p.percent}%)` }),
        legend: { bottom: 0, icon: 'circle', itemWidth: 9, itemHeight: 9, textStyle: { color: cssVar('--c-text-3'), fontSize: 10.5 } },
        series: [
            {
                type: 'pie',
                radius: ['48%', '70%'],
                center: ['50%', '42%'],
                itemStyle: { borderColor: '#fff', borderWidth: 2, borderRadius: 4 },
                label: { show: false },
                data: rows.map((r) => ({ name: r.name, value: r.value, itemStyle: { color: r.color } })),
            },
        ],
        graphic: [
            {
                type: 'text',
                left: 'center',
                top: '37%',
                style: { text: fmt(d.target_count), fontSize: 20, fontWeight: 700, fontFamily: 'IBM Plex Mono', fill: cssVar('--c-text'), textAlign: 'center' },
            },
            {
                type: 'text',
                left: 'center',
                top: '47%',
                style: { text: t('col.target'), fontSize: 11, fill: cssVar('--c-text-3'), textAlign: 'center' },
            },
        ],
    }
})

/* ---------- 靶基因按降解组文库分布 ---------- */
const { el: libEl, setOption: setLib } = useChart((d) => {
    const byLib = {}
    d.targets.forEach((tg) => {
        const k = tg.degradome_lib || t('stats.cat.unknown')
        byLib[k] = (byLib[k] || 0) + 1
    })
    const rows = Object.entries(byLib).sort((a, b) => b[1] - a[1]).slice(0, 8).reverse()
    return {
        tooltip: darkTooltip({ formatter: (p) => `${p.name}<br/><strong>${fmt(p.value)}</strong> ${t('col.target')}` }),
        grid: { left: 8, right: 40, top: 6, bottom: 0, containLabel: true },
        xAxis: {
            type: 'value',
            minInterval: 1,
            splitLine: { lineStyle: { color: cssVar('--c-border') } },
            axisLabel: { color: cssVar('--c-text-3'), fontSize: 10 },
        },
        yAxis: {
            type: 'category',
            data: rows.map((r) => r[0]),
            axisLine: { show: false },
            axisTick: { show: false },
            axisLabel: { color: cssVar('--c-text-2'), fontSize: 10, fontFamily: 'IBM Plex Mono' },
        },
        series: [
            {
                type: 'bar',
                barWidth: 12,
                itemStyle: { borderRadius: [0, 3, 3, 0], color: speciesColor(d.species) },
                label: { show: true, position: 'right', color: cssVar('--c-text-3'), fontSize: 10, fontFamily: 'IBM Plex Mono' },
                data: rows.map((r) => r[1]),
            },
        ],
    }
})

async function fetchData() {
    loading.value = true
    error.value = ''
    try {
        data.value = await api.phasiRna(route.params.id)
    } catch (e) {
        error.value = e.message
        data.value = null
    } finally {
        loading.value = false
    }
    if (!error.value && data.value?.targets?.length) {
        await nextTick()
        setCat(data.value)
        setLib(data.value)
    }
}

onMounted(fetchData)
watch(() => route.params.id, fetchData)
</script>

<template>
    <div>
        <div v-if="loading" class="page page-body">
            <div class="skeleton skeleton--title"></div>
            <div class="skeleton skeleton--block"></div>
        </div>

        <div v-else-if="error" class="page page-body state state--error">{{ error }}</div>

        <template v-else-if="data">
            <!-- ===== 深色页眉带 ===== -->
            <section class="on-dark sirna-hero">
                <div class="page" style="padding-top: var(--sp-5); padding-bottom: var(--sp-5)">
                    <nav class="crumbs">
                        <RouterLink to="/">{{ t('nav.home') }}</RouterLink>
                        <span class="crumbs__sep">/</span>
                        <RouterLink :to="`/browse/${data.species}`">{{ t('nav.browse') }} · {{ speciesName(data) }}</RouterLink>
                        <span class="crumbs__sep">/</span>
                        <RouterLink :to="`/locus/${encodeURIComponent(data.parent_locus)}`" class="mono">{{ data.parent_locus }}</RouterLink>
                        <span class="crumbs__sep">/</span>
                        <span class="crumbs__here">{{ t('crumbs.sirna') }}</span>
                    </nav>

                    <div class="rowline rowline--wrap" style="gap: var(--sp-4); margin-top: var(--sp-3)">
                        <span class="sirna-hero__dot" :style="{ background: speciesColor(data.species) }">
                            {{ data.species.toUpperCase() }}
                        </span>
                        <div style="min-width: 0">
                            <h1 class="sirna-hero__id mono display">{{ data.phasi_rna }}</h1>
                            <div class="rowline rowline--wrap" style="gap: var(--sp-2); margin-top: 6px">
                                <span class="badge badge--soft">{{ data.scientific_name }}</span>
                                <span
                                    class="badge"
                                    :class="!targetDataAvailable ? 'badge--warn' : data.target_count > 0 ? 'badge--yes' : 'badge--no'"
                                >
                                    {{ t('f.degVerified') }}:
                                    {{
                                        !targetDataAvailable
                                            ? t('common.notAvailable')
                                            : data.target_count > 0
                                              ? t('common.yes')
                                              : t('common.no')
                                    }}
                                </span>
                                <span class="badge badge--accent mono">{{ data.length }} nt</span>
                            </div>
                        </div>
                        <div class="spacer"></div>
                        <button class="btn btn--secondary btn--sm" @click="copyText(data.sequence, t('ux.copied'))">
                            {{ t('detail.copySeq') }}
                        </button>
                    </div>

                    <div class="seq-block on-dark" style="margin-top: var(--sp-4); max-height: 76px">{{ data.sequence }}</div>
                </div>
            </section>

            <div class="page page-body" style="padding-top: var(--sp-5)">
                <div class="detail-grid">
                    <!-- 基本信息 -->
                    <section class="card" style="grid-column: span 7">
                        <div class="card__head"><span class="card__title">{{ t('detail.basic') }}</span></div>
                        <div class="card__body card__body--flush">
                            <div class="kv">
                                <template v-for="row in basicRows" :key="row.k">
                                    <div class="kv__k">{{ t(row.k) }}</div>
                                    <div class="kv__v">
                                        <RouterLink v-if="row.locus" :to="`/locus/${encodeURIComponent(row.v)}`" class="mono">
                                            {{ row.v }}
                                        </RouterLink>
                                        <span v-else :class="{ mono: row.k !== 'f.annotation' }">{{ row.v }}</span>
                                    </div>
                                </template>
                            </div>
                        </div>
                    </section>

                    <!-- 证据分类环图 -->
                    <section v-if="data.targets.length" class="card" style="grid-column: span 5">
                        <div class="card__body">
                            <div class="chart-box" style="height: 240px"><div ref="catEl" class="chart"></div></div>
                        </div>
                    </section>

                    <!-- 靶基因表：占满整行，否则列多时 T-plot 会被挤到横向滚动条外 -->
                    <section class="card" style="grid-column: span 12">
                        <div class="card__head">
                            <span class="card__title">{{ t('sirna.title') }}</span>
                            <span class="card__hint mono">{{ fmt(data.target_count) }}</span>
                        </div>

                        <div v-if="!data.targets.length" class="state">
                            <template v-if="!targetDataAvailable && !data.demoTrimmed">
                                {{ t('sirna.notImported') }}
                                <div class="state__hint dim">{{ t('sirna.notImportedHint') }}</div>
                            </template>
                            <template v-else>
                                {{ data.demoTrimmed ? t('sirna.demoTrimmed') : t('sirna.noTargets') }}
                                <div class="state__hint dim">{{ data.demoTrimmed ? t('demo.note') : t('sirna.noTargetsHint') }}</div>
                            </template>
                        </div>

                        <div v-else class="table-wrap" style="max-height: 460px">
                            <table class="data">
                                <thead>
                                    <tr>
                                        <th scope="col" style="width: 56px">{{ t('col.id') }}</th>
                                        <th scope="col">{{ t('col.target') }}</th>
                                        <th scope="col">{{ t('col.transcript') }}</th>
                                        <th scope="col">{{ t('col.startTx') }}</th>
                                        <th scope="col">{{ t('col.endTx') }}</th>
                                        <th scope="col">{{ t('col.degLib') }}</th>
                                        <th scope="col">{{ t('col.category') }}</th>
                                        <th scope="col">{{ t('col.degCount') }}</th>
                                        <th scope="col">{{ t('col.shift') }}</th>
                                        <th scope="col">{{ t('col.tplot') }}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-for="(tg, i) in data.targets" :key="i">
                                        <td class="mono dim">{{ i + 1 }}</td>
                                        <td class="mono">
                                            <a :href="`https://www.ncbi.nlm.nih.gov/gene/?term=${tg.verified_target}`" target="_blank" rel="noopener" class="strong">
                                                {{ tg.verified_target }}
                                            </a>
                                        </td>
                                        <td class="mono">{{ tg.transcript_id || t('common.empty') }}</td>
                                        <td class="mono">{{ tg.start_in_transcript ?? t('common.empty') }}</td>
                                        <td class="mono">{{ tg.end_in_transcript ?? t('common.empty') }}</td>
                                        <td class="mono">{{ tg.degradome_lib || t('common.empty') }}</td>
                                        <td>
                                            <span v-if="tg.category" class="badge" :class="tg.category === 'Cat_1' ? 'badge--yes' : 'badge--warn'">{{ tg.category }}</span>
                                            <span v-else class="dim">{{ t('common.empty') }}</span>
                                        </td>
                                        <td class="mono">{{ tg.deg_count ?? t('common.empty') }}</td>
                                        <td class="mono">{{ tg.shift ?? t('common.empty') }}</td>
                                        <td class="mono">
                                            <button
                                                v-if="tg.tplot"
                                                type="button"
                                                class="btn btn--ghost btn--sm"
                                                @click="openTplot(tg)"
                                            >
                                                {{ t('col.tplot') }}
                                            </button>
                                            <span v-else class="dim">{{ t('common.empty') }}</span>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </section>

                    <!-- 文库分布 -->
                    <section v-if="data.targets.length" class="card" style="grid-column: span 12">
                        <div class="card__head"><span class="card__title">{{ t('col.degLib') }}</span></div>
                        <div class="card__body">
                            <div class="chart-box" style="height: 280px"><div ref="libEl" class="chart"></div></div>
                        </div>
                        <div class="card__foot">{{ t('stats.chart.categories.hint') }}</div>
                    </section>
                </div>
            </div>
        </template>

        <TplotModal
            :open="!!tplot"
            :src="tplot?.src || ''"
            :title="tplot?.title || ''"
            @close="tplot = null"
        />
    </div>
</template>

<style scoped>
.sirna-hero {
    background: var(--grad-hero);
    color: var(--c-hero-text);
    position: relative;
    overflow: hidden;
}
.sirna-hero::after {
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
.sirna-hero .crumbs a { color: var(--c-hero-dim); }
.sirna-hero .crumbs a:hover { color: #fff; }
.sirna-hero .crumbs__here { color: var(--c-hero-text); }
.sirna-hero .seq-block {
    background: rgba(242, 247, 243, 0.07);
    border-color: rgba(242, 247, 243, 0.15);
    color: var(--c-hero-accent);
}
.sirna-hero__dot {
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
.sirna-hero__id {
    font-size: var(--fs-2xl);
    color: #fff;
    word-break: break-all;
}
.on-dark .badge--soft { background: rgba(242, 247, 243, 0.1); border-color: rgba(242, 247, 243, 0.2); color: var(--c-hero-dim); }

.detail-grid {
    display: grid;
    grid-template-columns: repeat(12, 1fr);
    gap: var(--sp-4);
    align-items: start; /* 卡片保持自然高度，不留死白 */
}
@media (max-width: 1024px) {
    .detail-grid > * { grid-column: span 12 !important; }
}
</style>
