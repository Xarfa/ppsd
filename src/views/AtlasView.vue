<!--
    数据图鉴（Atlas）—— v2 新增页面，对应导航 Atlas。

    一屏八张 ECharts，全部走 /api/stats/atlas 的实时聚合查询：
      ① 各物种四组分柱状图（对数轴）  ② 染色体 × 物种热力图
      ③ PHAS 生物类型旭日图           ④ 触发位点最多的 miRNA Top 12
      ⑤ 位点长度分布                  ⑥ 每个 locus 的 phasiRNA 产量
      ⑦ 降解组证据分类（双环图）      ⑧ P 值 × 相位得分全景（散点采样）
      ⑨ 预测方法组合
    所有颜色从 tokens.css 的 CSS 变量读取，换肤图表自动跟随。
-->
<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { t } from '../i18n/index.js'
import api, { speciesName } from '../api/ppsd.js'
import { useChart, speciesColor, darkTooltip, cssVar, SPECIES_ORDER } from '../utils/echarts.js'
import { fmt, observeReveal } from '../utils/ui.js'

const stats = ref(null)
const atlas = ref(null)
const error = ref('')
const loading = ref(true)
let revealIo = null

/* 物种按数据量排序（柱状图的固定顺序） */
const speciesOrder = () => (atlas.value?.bySpecies || []).map((s) => s.abbr)
const spName = (abbr) => {
    const row = (atlas.value?.bySpecies || []).find((s) => s.abbr === abbr)
    return row ? speciesName(row) : abbr
}

/* 染色体排序：数字升序在前，非数字（如 n / Un）排最后 */
function sortChrs(list) {
    const key = (c) => {
        const m = String(c).match(/\d+/)
        return m ? [0, +m[0], String(c)] : [1, 0, String(c)]
    }
    return [...list].sort((a, b) => {
        const ka = key(a), kb = key(b)
        return ka[0] - kb[0] || ka[1] - kb[1] || ka[2].localeCompare(kb[2])
    })
}

/* ---------- ① 四组分 × 物种（对数轴） ----------
   Nature 风：四个组分各占一个固定系列色，图例与柱色严格一致；
   物种身份由横轴承担，不再用物种色涂柱。 */
const { el: compEl, setOption: setComp } = useChart((d) => {
    const order = [...d.bySpecies].sort((a, b) => b.phas_loci - a.phas_loci)
    return {
        tooltip: darkTooltip({
            trigger: 'axis',
            axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(18,122,80,0.08)' } },
            formatter: (ps) =>
                `<strong>${ps[0].name && spName(ps[0].name)}</strong><br/>` +
                ps.map((p) => `${p.marker} ${p.seriesName}: ${fmt(p.value)}`).join('<br/>'),
        }),
        legend: { top: 0, icon: 'roundRect', itemWidth: 12, itemHeight: 8, textStyle: { color: cssVar('--c-text-3'), fontSize: 11 } },
        grid: { left: 8, right: 8, top: 34, bottom: 0, containLabel: true },
        xAxis: {
            type: 'category',
            data: order.map((s) => s.abbr),
            axisLine: { lineStyle: { color: cssVar('--c-border-strong') } },
            axisTick: { show: false },
            axisLabel: { color: cssVar('--c-text-3'), fontSize: 11, fontFamily: 'IBM Plex Mono' },
        },
        yAxis: {
            type: 'log',
            name: 'log scale',
            nameTextStyle: { color: cssVar('--c-text-3'), fontSize: 11, align: 'left' },
            splitLine: { lineStyle: { color: cssVar('--c-border') } },
            axisLabel: { color: cssVar('--c-text-3'), fontSize: 11, formatter: (v) => (v >= 1000000 ? v / 1000000 + 'M' : v >= 1000 ? v / 1000 + 'k' : v) },
        },
        series: [
            {
                name: t('stats.loci'),
                type: 'bar',
                barWidth: 10,
                itemStyle: { borderRadius: [2, 2, 0, 0], color: cssVar('--c-accent', '#127a50') },
                data: order.map((s) => s.phas_loci),
            },
            {
                name: t('stats.sirna'),
                type: 'bar',
                barWidth: 10,
                itemStyle: { borderRadius: [2, 2, 0, 0], color: cssVar('--c-sp-zma', '#e0aa2e') },
                data: order.map((s) => s.phasi_rna),
            },
            {
                name: t('stats.targets'),
                type: 'bar',
                barWidth: 10,
                itemStyle: { borderRadius: [2, 2, 0, 0], color: cssVar('--c-chart-2', '#9aa9a0') },
                data: order.map((s) => s.targets),
            },
            {
                name: t('stats.initiators'),
                type: 'bar',
                barWidth: 10,
                itemStyle: { borderRadius: [2, 2, 0, 0], color: cssVar('--c-sp-ath', '#4fa3c7') },
                data: order.map((s) => s.initiators),
            },
        ],
    }
})

/* ---------- ② 染色体 × 物种 热力图 ---------- */
const { el: heatEl, setOption: setHeat } = useChart((d) => {
    const chrCount = {}
    d.heatmap.forEach((r) => {
        if (!chrCount[r.chromosome]) chrCount[r.chromosome] = 0
        chrCount[r.chromosome] += r.n
    })
    let chrs = sortChrs(Object.keys(chrCount))
    const capped = chrs.length > 24
    const shown = capped ? chrs.slice(0, 23) : chrs
    // 类目轴自下而上渲染，反转让 1 号染色体在顶部、Other 沉底
    const yLabels = shown.map(String).reverse()
    if (capped) yLabels.unshift(t('stats.other'))
    const yIndexOf = (c) => {
        let yi = yLabels.indexOf(String(c))
        if (yi === -1 && capped) yi = 0
        return yi
    }

    const data = []
    d.heatmap.forEach((r) => {
        const xi = d.bySpecies.findIndex((s) => s.abbr === r.species)
        const yi = yIndexOf(String(r.chromosome))
        if (xi >= 0 && yi >= 0) data.push([xi, yi, r.n])
    })
    const maxN = Math.max(...data.map((x) => x[2]), 1)

    return {
        tooltip: darkTooltip({
            formatter: (p) =>
                `<strong>${spName(d.bySpecies[p.value[0]].abbr)}</strong> · ${p.value[1] === 0 && capped ? t('stats.other') : yLabels[p.value[1]]}<br/>${fmt(p.value[2])} ${t('stats.loci')}`,
        }),
        grid: { left: 8, right: 90, top: 10, bottom: 0, containLabel: true },
        xAxis: {
            type: 'category',
            data: d.bySpecies.map((s) => s.abbr),
            axisLine: { show: false },
            axisTick: { show: false },
            axisLabel: { color: cssVar('--c-text-3'), fontSize: 11, fontFamily: 'IBM Plex Mono' },
            splitArea: { show: false },
        },
        yAxis: {
            type: 'category',
            data: yLabels,
            axisLine: { show: false },
            axisTick: { show: false },
            axisLabel: { color: cssVar('--c-text-3'), fontSize: 11, fontFamily: 'IBM Plex Mono' },
        },
        visualMap: {
            min: 0,
            max: maxN,
            calculable: false,
            orient: 'vertical',
            right: 0,
            top: 'center',
            itemHeight: 110,
            textStyle: { color: cssVar('--c-text-3'), fontSize: 11 },
            inRange: { color: [cssVar('--c-surface-sunk', '#eef2ec'), cssVar('--c-sp-osa', '#2e9e6b'), cssVar('--c-accent-hover', '#0c5f3d')] },
        },
        series: [
            {
                type: 'heatmap',
                data,
                itemStyle: { borderRadius: 3, borderColor: '#fff', borderWidth: 2 },
                emphasis: { itemStyle: { shadowBlur: 6, shadowColor: 'rgba(0,0,0,0.25)' } },
            },
        ],
    }
})

/* ---------- ③ 生物类型旭日图 ---------- */
const { el: sunEl, setOption: setSun } = useChart((d) => {
    const totals = {}
    d.geneType.forEach((r) => {
        totals[r.type] = (totals[r.type] || 0) + r.n
    })
    const topTypes = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 6).map((x) => x[0])

    const children = d.bySpecies.map((s) => {
        const rows = d.geneType.filter((r) => r.species === s.abbr)
        const main = rows.filter((r) => topTypes.includes(r.type))
        const rest = rows.filter((r) => !topTypes.includes(r.type)).reduce((a, r) => a + r.n, 0)
        return {
            name: s.abbr,
            itemStyle: { color: speciesColor(s.abbr) },
            children: [
                ...main.map((r) => ({ name: r.type, value: r.n, itemStyle: { color: speciesColor(s.abbr), opacity: 0.55 } })),
                ...(rest ? [{ name: t('stats.other'), value: rest, itemStyle: { color: speciesColor(s.abbr), opacity: 0.25 } }] : []),
            ],
        }
    })
    return {
        tooltip: darkTooltip({ formatter: (p) => {
            const path = p.treePathInfo.map((x) => x.name).filter(Boolean).join(' › ')
            return `${path}<br/><strong>${fmt(p.value)}</strong> (${p.percent}%)`
        } }),
        series: [
            {
                type: 'sunburst',
                radius: ['12%', '88%'],
                center: ['50%', '50%'],
                sort: undefined,
                data: children,
                levels: [
                    {},
                    { r0: '12%', r: '48%', label: { rotate: 'tangential', fontSize: 11, fontFamily: 'IBM Plex Mono', color: '#fff' } },
                    { r0: '48%', r: '82%', label: { align: 'right', fontSize: 11, minAngle: 12, color: cssVar('--c-text-2') } },
                ],
                itemStyle: { borderWidth: 1.5, borderColor: '#fff' },
                emphasis: { focus: 'ancestor' },
            },
        ],
    }
})

/* ---------- ④ Top miRNA 触发器 ---------- */
const { el: famEl, setOption: setFam } = useChart((d) => {
    const rows = [...d.families].reverse()
    return {
        tooltip: darkTooltip({
            formatter: (p) => `${p.marker} <strong>${p.name}</strong><br/>${fmt(p.value)} PHAS loci triggered`,
        }),
        grid: { left: 8, right: 46, top: 6, bottom: 0, containLabel: true },
        xAxis: { type: 'value', splitLine: { show: false }, axisLabel: { show: false }, axisLine: { show: false }, axisTick: { show: false } },
        yAxis: {
            type: 'category',
            data: rows.map((r) => r.mirna),
            axisLine: { show: false },
            axisTick: { show: false },
            axisLabel: { color: cssVar('--c-text-2'), fontSize: 11, fontFamily: 'IBM Plex Mono' },
        },
        series: [
            {
                type: 'bar',
                barWidth: 12,
                itemStyle: { borderRadius: [0, 3, 3, 0] },
                label: { show: true, position: 'right', color: cssVar('--c-text-3'), fontSize: 11, fontFamily: 'IBM Plex Mono' },
                data: rows.map((r) => ({ value: r.n, itemStyle: { color: speciesColor(r.species) } })),
            },
        ],
    }
})

/* ---------- ⑤ 位点长度直方图 ---------- */
const { el: lenEl, setOption: setLen } = useChart((d) => {
    const bins = d.lengthHist
    const labels = bins.map((b) => (b.bin >= 8000 ? '≥8k' : `${b.bin / 1000}k`))
    return {
        tooltip: darkTooltip({ formatter: (p) => `${labels[p.dataIndex]}<br/><strong>${fmt(p.value)}</strong> loci` }),
        grid: { left: 8, right: 8, top: 18, bottom: 0, containLabel: true },
        xAxis: {
            type: 'category',
            data: labels,
            axisLine: { lineStyle: { color: cssVar('--c-border-strong') } },
            axisTick: { show: false },
            axisLabel: { color: cssVar('--c-text-3'), fontSize: 11, fontFamily: 'IBM Plex Mono' },
        },
        yAxis: {
            type: 'value',
            splitLine: { lineStyle: { color: cssVar('--c-border') } },
            axisLabel: { color: cssVar('--c-text-3'), fontSize: 11, formatter: (v) => (v >= 1000 ? v / 1000 + 'k' : v) },
        },
        series: [
            {
                type: 'bar',
                barWidth: '62%',
                // Nature 风：单色实底，不用渐变
                data: bins.map((b) => ({
                    value: b.n,
                    itemStyle: { borderRadius: [2, 2, 0, 0], color: cssVar('--c-accent', '#127a50'), opacity: 0.9 },
                })),
            },
        ],
    }
})

/* ---------- ⑥ 每个 locus 的 phasiRNA 产量 ---------- */
const { el: yieldEl, setOption: setYield } = useChart((d) => {
    const order = ['1', '2-5', '6-10', '11-20', '21-50', '>50']
    const rows = order.map((k) => ({ bucket: k, n: d.yieldHist.find((y) => y.bucket === k)?.n || 0 }))
    const palette = ['#9fd9bd', '#6cc398', '#3da87b', '#228a5f', '#14704c', '#0c5f3d']
    return {
        tooltip: darkTooltip({ formatter: (p) => `${rows[p.dataIndex].bucket} phasiRNAs / locus<br/><strong>${fmt(p.value)}</strong> loci` }),
        grid: { left: 8, right: 8, top: 18, bottom: 0, containLabel: true },
        xAxis: {
            type: 'category',
            data: rows.map((r) => r.bucket),
            axisLine: { lineStyle: { color: cssVar('--c-border-strong') } },
            axisTick: { show: false },
            axisLabel: { color: cssVar('--c-text-3'), fontSize: 11, fontFamily: 'IBM Plex Mono' },
        },
        yAxis: {
            type: 'log',
            splitLine: { lineStyle: { color: cssVar('--c-border') } },
            axisLabel: { color: cssVar('--c-text-3'), fontSize: 11, formatter: (v) => (v >= 1000 ? v / 1000 + 'k' : v) },
        },
        series: [
            {
                type: 'bar',
                barWidth: '58%',
                data: rows.map((r, i) => ({ value: r.n, itemStyle: { borderRadius: [3, 3, 0, 0], color: palette[i] } })),
            },
        ],
    }
})

/* ---------- ⑦ 降解组证据分类（双环图） ---------- */
const { el: catEl, setOption: setCat } = useChart((d) => {
    const catLabel = (c) =>
        c === 'Cat_1' ? t('stats.cat.1') : c === 'Cat_2' ? t('stats.cat.2') : t('stats.cat.unknown')
    const catColor = (c) => (c === 'Cat_1' ? cssVar('--c-accent', '#127a50') : c === 'Cat_2' ? cssVar('--c-sp-zma', '#e3a63b') : cssVar('--c-chart-2', '#9aa9a0'))
    const mk = (rows) => rows.map((r) => ({ name: catLabel(r.category), value: r.n, itemStyle: { color: catColor(r.category) } }))
    return {
        tooltip: darkTooltip({ trigger: 'item', formatter: (p) => `${p.marker} ${p.name}<br/><strong>${fmt(p.value)}</strong> (${p.percent}%)` }),
        legend: {
            bottom: 0,
            icon: 'circle',
            itemWidth: 9,
            itemHeight: 9,
            textStyle: { color: cssVar('--c-text-3'), fontSize: 11 },
        },
        title: [
            { text: t('stats.targets'), subtext: fmt(d.targetCategory.reduce((a, r) => a + r.n, 0)), left: '25%', top: '38%', textAlign: 'center', textStyle: { fontSize: 12, fontWeight: 600, color: cssVar('--c-text-2') }, subtextStyle: { fontSize: 15, fontFamily: 'IBM Plex Mono', fontWeight: 700, color: cssVar('--c-text'), rich: {} } },
            { text: t('stats.initiators'), subtext: fmt(d.initiatorCategory.reduce((a, r) => a + r.n, 0)), left: '75%', top: '38%', textAlign: 'center', textStyle: { fontSize: 12, fontWeight: 600, color: cssVar('--c-text-2') }, subtextStyle: { fontSize: 15, fontFamily: 'IBM Plex Mono', fontWeight: 700, color: cssVar('--c-text') } },
        ],
        series: [
            {
                type: 'pie',
                radius: ['46%', '66%'],
                center: ['25%', '46%'],
                itemStyle: { borderColor: '#fff', borderWidth: 2, borderRadius: 4 },
                label: { show: false },
                data: mk(d.targetCategory),
            },
            {
                type: 'pie',
                radius: ['46%', '66%'],
                center: ['75%', '46%'],
                itemStyle: { borderColor: '#fff', borderWidth: 2, borderRadius: 4 },
                label: { show: false },
                data: mk(d.initiatorCategory),
            },
        ],
    }
})

/* ---------- ⑧ P 值 × 相位得分 散点全景 ---------- */
const { el: scatEl, setOption: setScat } = useChart((d) => {
    const bySp = {}
    d.scatter.forEach((r) => {
        if (!r.pvalue || r.pvalue <= 0) return
        ;(bySp[r.species] = bySp[r.species] || []).push([r.pvalue, r.phase_score])
    })
    return {
        tooltip: darkTooltip({
            formatter: (p) =>
                `<strong>${spName(p.seriesName)}</strong><br/>P = ${p.value[0].toExponential(1)}<br/>Phase score = ${fmt(p.value[1])}`,
        }),
        legend: {
            top: 0,
            icon: 'circle',
            itemWidth: 8,
            itemHeight: 8,
            textStyle: { color: cssVar('--c-text-3'), fontSize: 11 },
        },
        grid: { left: 8, right: 16, top: 30, bottom: 0, containLabel: true },
        xAxis: {
            type: 'log',
            name: 'P-value',
            nameTextStyle: { color: cssVar('--c-text-3'), fontSize: 11 },
            nameLocation: 'middle',
            nameGap: 22,
            splitLine: { show: false },
            axisLine: { lineStyle: { color: cssVar('--c-border-strong') } },
            axisLabel: { color: cssVar('--c-text-3'), fontSize: 11, formatter: (v) => Number(v).toExponential(0) },
        },
        yAxis: {
            type: 'value',
            name: 'Phase score',
            nameTextStyle: { color: cssVar('--c-text-3'), fontSize: 11, align: 'left' },
            splitLine: { lineStyle: { color: cssVar('--c-border') } },
            axisLabel: { color: cssVar('--c-text-3'), fontSize: 11 },
        },
        series: SPECIES_ORDER.filter((abbr) => bySp[abbr]?.length).map((abbr) => ({
            name: abbr,
            type: 'scatter',
            symbolSize: 4,
            itemStyle: { color: speciesColor(abbr), opacity: 0.4 },
            data: bySp[abbr],
        })),
    }
})

/* ---------- ⑨ 预测方法组合 ---------- */
const { el: methEl, setOption: setMeth } = useChart((d) => {
    const rows = [...d.methods].reverse()
    const maxN = Math.max(...rows.map((r) => r.n), 1)
    return {
        tooltip: darkTooltip({ formatter: (p) => `<strong>${p.name}</strong><br/>${fmt(p.value)} loci` }),
        grid: { left: 8, right: 52, top: 6, bottom: 0, containLabel: true },
        xAxis: { type: 'value', splitLine: { show: false }, axisLabel: { show: false }, axisLine: { show: false }, axisTick: { show: false } },
        yAxis: {
            type: 'category',
            data: rows.map((r) => r.method),
            axisLine: { show: false },
            axisTick: { show: false },
            axisLabel: { color: cssVar('--c-text-2'), fontSize: 11, fontFamily: 'IBM Plex Mono' },
        },
        series: [
            {
                type: 'bar',
                barWidth: 13,
                itemStyle: { borderRadius: [0, 2, 2, 0] },
                label: { show: true, position: 'right', color: cssVar('--c-text-3'), fontSize: 11, fontFamily: 'IBM Plex Mono', formatter: (p) => fmt(p.value) },
                data: rows.map((r) => ({
                    value: r.n,
                    // 单色实底 + 按值调透明度（Nature 风，不用渐变）
                    itemStyle: { borderRadius: [0, 2, 2, 0], color: cssVar('--c-accent', '#127a50'), opacity: 0.55 + 0.45 * (r.n / maxN) },
                })),
            },
        ],
    }
})

onMounted(async () => {
    try {
        const [s, a] = await Promise.all([api.stats(), api.statsAtlas()])
        stats.value = s
        atlas.value = a
    } catch (e) {
        error.value = e.message
    } finally {
        loading.value = false
    }

    if (!error.value) {
        await nextTick()
        setComp(atlas.value)
        setHeat(atlas.value)
        setSun(atlas.value)
        setFam(atlas.value)
        setLen(atlas.value)
        setYield(atlas.value)
        setCat(atlas.value)
        setScat(atlas.value)
        setMeth(atlas.value)
        revealIo = observeReveal(document.body)
    }
})

onBeforeUnmount(() => revealIo && revealIo.disconnect())
</script>

<template>
    <div class="page page-body">
        <div class="crumbs" style="margin-bottom: var(--sp-2)">
            <RouterLink to="/">{{ t('nav.home') }}</RouterLink>
            <span class="crumbs__sep">/</span>
            <span class="crumbs__here">{{ t('stats.title') }}</span>
        </div>
        <h1 class="page-title display">{{ t('stats.title') }}</h1>
        <p class="page-sub">{{ t('stats.sub') }}</p>

        <!-- 顶部统计带 -->
        <div v-if="stats" class="stats reveal" style="margin-bottom: var(--sp-5)">
            <div class="stat"><div class="stat__n">{{ fmt(stats.totals.species_count) }}</div><div class="stat__l">{{ t('stat.species') }}</div></div>
            <div class="stat"><div class="stat__n">{{ fmt(stats.totals.phas_loci) }}</div><div class="stat__l">{{ t('stat.loci') }}</div></div>
            <div class="stat"><div class="stat__n">{{ fmt(stats.totals.phasi_rna) }}</div><div class="stat__l">{{ t('stat.sirna') }}</div></div>
            <div class="stat"><div class="stat__n">{{ fmt(stats.totals.phasi_rna_target) }}</div><div class="stat__l">{{ t('stat.target') }}</div></div>
            <div class="stat"><div class="stat__n">{{ fmt(stats.totals.initiator) }}</div><div class="stat__l">{{ t('stat.initiator') }}</div></div>
            <div class="stat"><div class="stat__n">{{ fmt(stats.totals.target_verified) }}</div><div class="stat__l">{{ t('stat.verified') }}</div></div>
        </div>

        <div v-if="loading" class="stack">
            <div class="skeleton skeleton--block"></div>
            <div class="skeleton skeleton--block"></div>
        </div>
        <div v-else-if="error" class="state state--error">{{ error }}</div>

        <!-- 演示快照不含图鉴聚合数据（atlas 为 null）：给说明，别甩一排空图表 -->
        <div v-else-if="!atlas" class="state">
            <div class="note note--warn" style="max-width: 620px">{{ t('stats.demoNote') }}</div>
        </div>

        <div v-else class="atlas-grid">
            <section class="card reveal" style="grid-column: span 7">
                <div class="card__head"><span class="panel-letter">a</span><h2 class="card__title">{{ t('stats.chart.species') }}</h2><span class="card__hint">{{ t('stats.chart.species.hint') }}</span></div>
                <div class="card__body"><div class="chart-box" style="height: 300px"><div ref="compEl" class="chart"></div></div></div>
            </section>

            <section class="card reveal" style="grid-column: span 5">
                <div class="card__head"><span class="panel-letter">b</span><h2 class="card__title">{{ t('stats.chart.families') }}</h2><span class="card__hint">{{ t('stats.chart.families.hint') }}</span></div>
                <div class="card__body"><div class="chart-box" style="height: 300px"><div ref="famEl" class="chart"></div></div></div>
            </section>

            <section class="card reveal" style="grid-column: span 7">
                <div class="card__head"><span class="panel-letter">c</span><h2 class="card__title">{{ t('stats.chart.heat') }}</h2><span class="card__hint">{{ t('stats.chart.heat.hint') }}</span></div>
                <div class="card__body"><div class="chart-box" style="height: 420px"><div ref="heatEl" class="chart"></div></div></div>
            </section>

            <section class="card reveal" style="grid-column: span 5">
                <div class="card__head"><span class="panel-letter">d</span><h2 class="card__title">{{ t('stats.chart.geneType') }}</h2><span class="card__hint">{{ t('stats.chart.geneType.hint') }}</span></div>
                <div class="card__body"><div class="chart-box" style="height: 420px"><div ref="sunEl" class="chart"></div></div></div>
            </section>

            <section class="card reveal" style="grid-column: span 4">
                <div class="card__head"><span class="panel-letter">e</span><h2 class="card__title">{{ t('stats.chart.lengthHist') }}</h2></div>
                <div class="card__body"><div class="chart-box" style="height: 250px"><div ref="lenEl" class="chart"></div></div></div>
                <div class="card__foot">{{ t('stats.chart.lengthHist.hint') }}</div>
            </section>

            <section class="card reveal" style="grid-column: span 4">
                <div class="card__head"><span class="panel-letter">f</span><h2 class="card__title">{{ t('stats.chart.yield') }}</h2></div>
                <div class="card__body"><div class="chart-box" style="height: 250px"><div ref="yieldEl" class="chart"></div></div></div>
                <div class="card__foot">{{ t('stats.chart.yield.hint') }}</div>
            </section>

            <section class="card reveal" style="grid-column: span 4">
                <div class="card__head"><span class="panel-letter">g</span><h2 class="card__title">{{ t('stats.chart.categories') }}</h2></div>
                <div class="card__body"><div class="chart-box" style="height: 250px"><div ref="catEl" class="chart"></div></div></div>
                <div class="card__foot">{{ t('stats.chart.categories.hint') }}</div>
            </section>

            <section class="card reveal" style="grid-column: span 8">
                <div class="card__head"><span class="panel-letter">h</span><h2 class="card__title">{{ t('stats.chart.scatter') }}</h2><span class="card__hint">{{ t('stats.chart.scatter.hint') }}</span></div>
                <div class="card__body"><div class="chart-box" style="height: 320px"><div ref="scatEl" class="chart"></div></div></div>
            </section>

            <section class="card reveal" style="grid-column: span 4">
                <div class="card__head"><span class="panel-letter">i</span><h2 class="card__title">{{ t('stats.chart.methods') }}</h2></div>
                <div class="card__body"><div class="chart-box" style="height: 320px"><div ref="methEl" class="chart"></div></div></div>
                <div class="card__foot">{{ t('stats.chart.methods.hint') }}</div>
            </section>
        </div>
    </div>
</template>

<style scoped>
/* Nature 式面板字母（a-i），图表卡片的图版编号 */
.panel-letter {
    font-family: var(--font-mono);
    font-weight: 700;
    font-size: var(--fs-sm);
    color: var(--c-accent);
    flex: none;
    width: 18px;
}
.atlas-grid {
    display: grid;
    grid-template-columns: repeat(12, 1fr);
    gap: var(--sp-4);
}
@media (max-width: 1024px) {
    .atlas-grid > * { grid-column: span 12 !important; }
}
</style>
