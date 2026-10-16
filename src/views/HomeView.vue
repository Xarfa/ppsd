<!--
    首页 v2 —— 对应原站 index.php。

    版式：深色 hero（植物摄影 + 相位环动效）→ bento 卡片（通路 / 双图表 / 关于）
    → 8 个物种入口网格。统计数字带滚动动画，图表全部走 useChart composable。
-->
<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { t } from '../i18n/index.js'
import api, { speciesName } from '../api/ppsd.js'
import { useChart, speciesColor, darkTooltip, cssVar } from '../utils/echarts.js'
import { fmt, countUp, observeReveal } from '../utils/ui.js'
import SirnaStrand from '../components/SirnaStrand.vue'

const router = useRouter()

const stats = ref(null)
const species = ref([])
const error = ref('')
const loading = ref(true)

const statEls = { species: ref(null), loci: ref(null), sirna: ref(null), target: ref(null) }
let revealIo = null

/* ---------- 环图：各物种 phasiRNA 占比 ---------- */
const { el: donutEl, setOption: setDonut, getChart: getDonut } = useChart((d) => ({
    tooltip: darkTooltip({
        trigger: 'item',
        formatter: (p) => `${p.marker} <strong>${p.name}</strong><br/>${fmt(p.value)} (${p.percent}%)`,
    }),
    legend: {
        bottom: 0,
        icon: 'circle',
        itemWidth: 9,
        itemHeight: 9,
        textStyle: { color: cssVar('--c-text-3', '#6b7d73'), fontSize: 11 },
    },
    series: [
        {
            type: 'pie',
            radius: ['50%', '72%'],
            center: ['50%', '42%'],
            itemStyle: { borderColor: '#fff', borderWidth: 2, borderRadius: 5 },
            label: { show: false },
            emphasis: { scaleSize: 5 },
            data: d.bySpecies.map((s) => ({
                name: speciesName(s),
                value: s.phasi_rna,
                abbr: s.abbr,
                itemStyle: { color: speciesColor(s.abbr) },
            })),
        },
    ],
    graphic: [
        {
            type: 'text',
            left: 'center',
            top: '36%',
            style: {
                text: fmt(d.totals.phasi_rna),
                fontSize: 21,
                fontWeight: 700,
                fontFamily: 'IBM Plex Mono',
                fill: cssVar('--c-text', '#17231d'),
                textAlign: 'center',
            },
        },
        {
            type: 'text',
            left: 'center',
            top: '47%',
            style: { text: 'phasiRNA', fontSize: 11, fill: cssVar('--c-text-3', '#6b7d73'), textAlign: 'center' },
        },
    ],
}))

/* 环图点击扇区 → 直接进该物种（图表即导航） */
function bindDonutClick() {
    const chart = getDonut()
    if (!chart) return
    chart.on('click', (p) => {
        if (p.data?.abbr) router.push(`/browse/${p.data.abbr}`)
    })
}

onMounted(async () => {
    try {
        const [d, sp] = await Promise.all([api.stats(), api.species()])
        stats.value = d
        species.value = sp.species
    } catch (e) {
        error.value = e.message
    } finally {
        loading.value = false
    }

    if (!error.value) {
        await nextTick()
        countUp(statEls.species.value, 8)
        countUp(statEls.loci.value, stats.value.totals.phas_loci)
        countUp(statEls.sirna.value, stats.value.totals.phasi_rna)
        countUp(statEls.target.value, stats.value.totals.phasi_rna_target)
        setDonut(stats.value)
        bindDonutClick()
        revealIo = observeReveal(document.body)
    }
})

onBeforeUnmount(() => revealIo && revealIo.disconnect())

// computed 保证切语言时流程文案跟着重算
const flow = computed(() => [1, 2, 3, 4].map((i) => ({ t: t(`home.flow.${i}.t`), d: t(`home.flow.${i}.d`) })))
</script>

<template>
    <div>
        <!-- ================= HERO ================= -->
        <section class="hero on-dark">
            <div class="hero__bg" aria-hidden="true"></div>
            <div class="hero__art" aria-hidden="true">
                <SirnaStrand />
            </div>

            <div class="page hero__inner">
                <div class="hero__copy">
                    <h1 class="hero__title display">{{ t('hero.title') }}</h1>
                    <p class="hero__lede">{{ t('hero.lede') }}</p>

                    <div class="rowline rowline--wrap" style="gap: var(--sp-3)">
                        <RouterLink to="/browse/osa" class="btn btn--primary btn--lg">{{ t('hero.cta.browse') }}</RouterLink>
                        <RouterLink to="/search" class="btn btn--secondary btn--lg">{{ t('nav.search') }}</RouterLink>
                    </div>

                    <div class="hero__stats rowline rowline--wrap" v-if="stats">
                        <div class="statn">
                            <div class="statn__n" :ref="statEls.species">8</div>
                            <div class="statn__l">{{ t('hero.stat.species') }}</div>
                        </div>
                        <div class="statn">
                            <div class="statn__n" :ref="statEls.loci">0</div>
                            <div class="statn__l">{{ t('hero.stat.loci') }}</div>
                        </div>
                        <div class="statn">
                            <div class="statn__n" :ref="statEls.sirna">0</div>
                            <div class="statn__l">{{ t('hero.stat.sirna') }}</div>
                        </div>
                        <div class="statn">
                            <div class="statn__n" :ref="statEls.target">0</div>
                            <div class="statn__l">{{ t('hero.stat.target') }}</div>
                        </div>
                    </div>
                </div>
            </div>
        </section>

        <!-- ================= BENTO ================= -->
        <div class="page" style="padding-top: var(--sp-5); padding-bottom: var(--sp-7)">
            <div class="home-grid">
                <!-- 调控通路（通栏横排） -->
                <section class="card reveal home-cell home-cell--path">
                    <div class="card__head">
                        <h2 class="card__title">{{ t('home.flow.title') }}</h2>
                    </div>
                    <div class="card__body">
                        <div class="flow-h">
                            <div v-for="(f, i) in flow" :key="i" class="flow-h__step">
                                <span class="flow__n mono">{{ String(i + 1).padStart(2, '0') }}</span>
                                <div class="flow-h__t">{{ f.t }}</div>
                                <div class="flow-h__d">{{ f.d }}</div>
                            </div>
                        </div>
                    </div>
                </section>

                <!-- 环图 -->
                <section class="card reveal home-cell home-cell--donut">
                    <div class="card__head">
                        <h2 class="card__title">{{ t('home.donut.title') }}</h2>
                    </div>
                    <div class="card__body">
                        <div class="chart-box" style="height: 268px">
                            <div ref="donutEl" class="chart"></div>
                        </div>
                    </div>
                    <div class="card__foot">{{ t('home.donut.hint') }}</div>
                </section>

                <!-- 关于 -->
                <section class="card reveal home-cell home-cell--about">
                    <div class="card__body about-body">
                        <h2 class="card__title" style="margin-bottom: var(--sp-3)">{{ t('home.about.title') }}</h2>
                        <p class="dim">{{ t('home.about.p1') }}</p>
                        <p class="dim">{{ t('home.about.p2') }}</p>
                    </div>
                </section>
            </div>

            <!-- ================= 物种网格 ================= -->
            <section class="section">
                <div class="section__head">
                    <h2 class="section__title">{{ t('home.species.title') }}</h2>
                    <span class="section__hint">{{ t('home.species.hint') }}</span>
                </div>

                <div v-if="loading" class="sp-grid">
                    <div v-for="i in 8" :key="i" class="skeleton" style="height: 138px"></div>
                </div>
                <div v-else class="sp-grid">
                    <RouterLink
                        v-for="sp in species"
                        :key="sp.abbr"
                        :to="`/browse/${sp.abbr}`"
                        class="sp-tile card card--link"
                        :style="{ '--sp-c': `var(--c-sp-${sp.abbr})` }"
                    >
                        <div class="sp-tile__mono display">{{ sp.abbr.toUpperCase() }}</div>
                        <div class="sp-tile__name">{{ speciesName(sp) }}</div>
                        <div class="sp-tile__sci dim">{{ sp.scientific_name }}</div>
                        <div class="sp-tile__nums mono">
                            <span>{{ fmt(sp.phas_loci) }}</span>
                            <span class="dim">loci</span>
                            <span class="dim">·</span>
                            <span>{{ fmt(sp.phasi_rna) }}</span>
                            <span class="dim">phasiRNA</span>
                        </div>
                    </RouterLink>
                </div>
            </section>
        </div>
    </div>
</template>

<style scoped>
/* ---------- hero ---------- */
.hero {
    position: relative;
    background: var(--grad-hero);
    color: var(--c-hero-text);
    overflow: hidden;
}
.hero__bg {
    position: absolute;
    inset: 0;
    background: url('../assets/img/hero-leaves.jpg') center / cover no-repeat;
    opacity: 0.55;
    filter: saturate(0.85) brightness(0.9);
}
.hero__bg::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(100deg, rgba(8, 30, 21, 0.94) 24%, rgba(11, 38, 27, 0.62) 58%, rgba(10, 34, 24, 0.85) 100%);
}
.hero__art {
    position: absolute;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
    width: min(520px, 42%);
    color: var(--c-hero-accent);
    opacity: 0.95;
    pointer-events: none;
}
@media (max-width: 1180px) {
    .hero__art { display: none; }
}
.hero__inner {
    position: relative;
    padding-top: var(--sp-8);
    padding-bottom: var(--sp-7);
    display: flex;
    align-items: center;
    min-height: 500px;
}
.hero__copy { max-width: 780px; }
.hero__title {
    font-size: clamp(2.2rem, 5vw, 3.6rem);
    font-weight: 700;
    color: #fff;
    margin-bottom: var(--sp-4);
}
.hero__lede {
    font-size: var(--fs-md);
    line-height: var(--lh-loose);
    color: var(--c-hero-dim);
    max-width: 62ch;
    margin-bottom: var(--sp-5);
}
.hero__stats {
    margin-top: var(--sp-6);
    padding-top: var(--sp-5);
    border-top: 1px solid rgba(242, 247, 243, 0.14);
    gap: var(--sp-6);
}

/* ---------- bento 网格 ---------- */
.home-grid {
    display: grid;
    grid-template-columns: repeat(12, 1fr);
    gap: var(--sp-4);
}
.home-cell--path { grid-column: span 12; }
.home-cell--donut { grid-column: span 5; }
.home-cell--about {
    grid-column: span 7;
    background: var(--c-accent-tint);
    border-color: var(--c-accent-border);
}
/* 文案在加高的卡片里垂直居中，避免底部一大块空色 */
.about-body { display: flex; flex-direction: column; justify-content: center; height: 100%; }
@media (max-width: 1024px) {
    .home-cell--path, .home-cell--donut, .home-cell--about { grid-column: span 12; }
}

/* ---------- 通路流程（通栏横排） ---------- */
.flow-h {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--sp-5);
}
@media (max-width: 900px) { .flow-h { grid-template-columns: 1fr; } }
.flow-h__step {
    position: relative;
    padding-top: var(--sp-4);
    border-top: 3px solid var(--c-accent-border);
}
.flow-h__step .flow__n {
    position: absolute;
    top: -16px;
    left: 0;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    font-size: var(--fs-xs);
    font-weight: 600;
    color: #fff;
    background: var(--grad-brand);
    box-shadow: 0 2px 5px rgba(18, 122, 80, 0.3);
}
.flow-h__t { font-weight: 600; font-size: var(--fs-md); margin-top: var(--sp-2); }
.flow-h__d { color: var(--c-text-3); font-size: var(--fs-sm); margin-top: 2px; }

/* ---------- 物种网格 ---------- */
.sp-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--sp-4);
}
@media (max-width: 1024px) { .sp-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 560px) { .sp-grid { grid-template-columns: 1fr; } }

.sp-tile {
    padding: var(--sp-4);
    position: relative;
    overflow: hidden;
    color: var(--c-text);
    border-top: 3px solid var(--sp-c);
}
.sp-tile:hover { text-decoration: none; }
.sp-tile__mono {
    font-size: 2rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: var(--sp-c);
    line-height: 1;
    margin-bottom: var(--sp-2);
}
.sp-tile__name { font-weight: 600; }
.sp-tile__sci { font-style: italic; font-size: var(--fs-sm); }
.sp-tile__nums {
    margin-top: var(--sp-2);
    font-size: var(--fs-xs);
    color: var(--c-text-2);
    display: flex;
    gap: 5px;
    flex-wrap: wrap;
}
.sp-tile::after {
    content: '';
    position: absolute;
    right: -18px;
    top: -18px;
    width: 74px;
    height: 74px;
    border-radius: 50%;
    background: var(--sp-c);
    opacity: 0.08;
    transition: opacity var(--dur) var(--ease), transform var(--dur-slow) var(--ease-out);
}
.sp-tile:hover::after { opacity: 0.18; transform: scale(1.25); }
</style>
