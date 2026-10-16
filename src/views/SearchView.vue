<!--
    检索 v2 —— 对应原站 search.php。
    六种检索方式与原站一一对应：
      phasiRNA ID / 序列、PHAS 位点 ID、NCBI 基因号、NCBI 转录本号、
      miRNA 名称、基因组区间

    v2：支持 /search?q=xxx 深链接（命令面板、Browse 的基因号结果都会跳到这里），
    检索后把关键词写回 URL，可分享。
-->
<script setup>
import { ref, computed, onMounted } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import api, { speciesName } from '../api/ppsd.js'
import { t } from '../i18n/index.js'
import { fmt } from '../utils/ui.js'

const route = useRoute()
const router = useRouter()

const speciesList = ref([])
const tab = ref('phasiRNA')

const tabs = computed(() => [
    { key: 'phasiRNA',   label: t('search.tab.sirna'),      ph: t('search.ph.sirna') },
    { key: 'locus',      label: t('search.tab.locus'),      ph: t('search.ph.locus') },
    { key: 'gene',       label: t('search.tab.gene'),       ph: t('search.ph.gene') },
    { key: 'transcript', label: t('search.tab.transcript'), ph: t('search.ph.transcript') },
    { key: 'mirna',      label: t('search.tab.mirna'),      ph: t('search.ph.mirna') },
    { key: 'region',     label: t('search.tab.region'),     ph: '' },
])

const q = ref('')
const sp = ref('')
const loading = ref(false)
const error = ref('')
const results = ref([])
const searched = ref(false)

/* 各检索方式的示例值（与输入框占位符里的例子一致）。
   没带关键词打开检索页时预填并直接搜，演示时不用现打。 */
const EXAMPLE_QUERIES = {
    phasiRNA: 'OsaPHAS9g4346635.1@21#1.1',
    locus: 'OsaPHAS9g4346635',
    gene: 'LOC4346635',
    transcript: 'XM_015757151',
    mirna: 'osa-miR6250',
}

/* 区间检索默认值：水稻 9 号染色体上那个有 4 个位点的区间，一点就出结果 */
const rSpecies = ref('osa')
const rChrom = ref('9')
const rStart = ref('6678000')
const rEnd = ref('6680000')

const currentTab = computed(() => tabs.value.find((x) => x.key === tab.value))

/* 结果列按需显示：整列全空的列直接不渲染，避免一排破折号 */
const visibleCols = computed(() => {
    const rows = results.value
    if (!rows.length) return []
    const has = (fn) => rows.some(fn)
    const cols = ['id', 'species', 'pos']
    if (has((r) => r.locus_gene || r.transcript || r.transcript_id)) cols.push('gene')
    if (has((r) => r.sequence)) cols.push('seq')
    if (has((r) => r.phase_score !== null && r.phase_score !== undefined)) cols.push('score')
    cols.push('note')
    return cols
})

const COL_LABELS = {
    id: 'col.recordId',
    species: 'f.species',
    pos: 'f.position',
    gene: 'col.gene',
    seq: 'col.sequence',
    score: 'col.phaseScore',
    note: 'col.annotation',
}
const colLabel = (c) => t(COL_LABELS[c])

/* 只有 locus / phasiRNA / region 结果能连详情页；基因号和转录本号不是位点 ID */
function resultTo(r) {
    if (r.kind === 'phasiRNA') return `/phasi-rna/${encodeURIComponent(r.id)}`
    if (r.kind !== 'gene' && r.kind !== 'transcript') return `/locus/${encodeURIComponent(r.id)}`
    return null
}

async function doSearch() {
    if (tab.value === 'region') return doRegionSearch()
    if (!q.value.trim()) return
    loading.value = true
    error.value = ''
    searched.value = true
    try {
        const d = await api.search({
            type: tab.value,
            q: q.value.trim(),
            species: sp.value || undefined,
            limit: 100,
        })
        results.value = d.rows
    } catch (e) {
        error.value = e.message
        results.value = []
    } finally {
        loading.value = false
    }
    router.replace({ query: { q: q.value.trim(), type: tab.value, ...(sp.value ? { species: sp.value } : {}) } }).catch(() => {})
}

/* 起止倒置（常见的录入失误）：自动交换并明示，不再静默处理 */
const swappedNote = ref(false)

async function doRegionSearch(opts = {}) {
    let rStartV = String(rStart.value).trim()
    let rEndV = String(rEnd.value).trim()
    if (Number.isFinite(+rStartV) && Number.isFinite(+rEndV) && +rStartV > +rEndV) {
        ;[rStartV, rEndV] = [rEndV, rStartV]
        swappedNote.value = true
    } else {
        swappedNote.value = false
    }
    loading.value = true
    error.value = ''
    searched.value = true
    try {
        const d = await api.searchRegion({
            species: rSpecies.value,
            chrom: rChrom.value,
            start: rStartV,
            end: rEndV,
        })
        // 区间接口返回的字段是 phas_loci，而结果表格统一读 id —— 必须补映射
        results.value = d.rows.map((r) => ({ ...r, id: r.phas_loci, kind: 'region' }))
    } catch (e) {
        error.value = e.message
        results.value = []
    } finally {
        loading.value = false
    }
    // 区间查询写进 URL："这段区间里有什么位点"可以直接分享给合作者
    if (!opts.silent) {
        router.replace({
            query: {
                tab: 'region',
                species: rSpecies.value,
                chrom: String(rChrom.value),
                start: String(rStartV),
                end: String(rEndV),
            },
        }).catch(() => {})
    }
}

function switchTab(k) {
    tab.value = k
    results.value = []
    searched.value = false
    error.value = ''
    q.value = EXAMPLE_QUERIES[k] || ''
}

onMounted(async () => {
    try {
        const d = await api.species()
        speciesList.value = d.species
    } catch {
        /* 物种列表拿不到不影响检索本身 */
    }

    // 深链接：/search?q=xxx&type=mirna 或 /search?tab=region&species=osa&chrom=9&start=…&end=…
    if (String(route.query.tab) === 'region') {
        tab.value = 'region'
        if (route.query.species) rSpecies.value = String(route.query.species)
        if (route.query.chrom) rChrom.value = String(route.query.chrom)
        if (route.query.start) rStart.value = String(route.query.start)
        if (route.query.end) rEnd.value = String(route.query.end)
        doRegionSearch()
        return
    }

    const urlQ = String(route.query.q || '')
    const urlType = String(route.query.type || '')
    if (urlQ) {
        if (tabs.value.some((x) => x.key === urlType)) tab.value = urlType
        q.value = urlQ
        if (route.query.species) sp.value = String(route.query.species)
        doSearch()
        return
    }

    // 没有深链接关键词：用示例值预填并直接搜，打开就是有结果的演示状态
    if (tab.value !== 'region') {
        q.value = EXAMPLE_QUERIES[tab.value] || ''
        if (q.value) doSearch()
    }
})
</script>

<template>
    <div class="page page-body">
        <div class="crumbs" style="margin-bottom: var(--sp-2)">
            <RouterLink to="/">{{ t('nav.home') }}</RouterLink>
            <span class="crumbs__sep">/</span>
            <span class="crumbs__here">{{ t('search.title') }}</span>
        </div>
        <h1 class="page-title display">{{ t('search.title') }}</h1>
        <p class="page-sub">{{ t('search.sub') }}</p>

        <!-- 检索方式 -->
        <div class="tabs" style="margin-bottom: var(--sp-4)">
            <button v-for="x in tabs" :key="x.key" class="tabs__item" :class="{ 'is-active': tab === x.key }" @click="switchTab(x.key)">
                {{ x.label }}
            </button>
        </div>

        <!-- 关键词类检索 -->
        <div v-if="tab !== 'region'" class="card" style="margin-bottom: var(--sp-4)">
            <div class="card__body">
                <div class="searchrow">
                    <div class="field" style="flex: 0 0 230px">
                        <label class="field__label">{{ t('f.species') }}</label>
                        <select v-model="sp" class="select">
                            <option value="">{{ t('search.allSpecies') }}</option>
                            <option v-for="s in speciesList" :key="s.abbr" :value="s.abbr">
                                {{ speciesName(s) }} — {{ s.scientific_name }}
                            </option>
                        </select>
                    </div>
                    <div class="field" style="flex: 1">
                        <label class="field__label">{{ currentTab.label }}</label>
                        <div class="searchbar">
                            <input v-model="q" class="input" :placeholder="currentTab.ph" @keyup.enter="doSearch" />
                            <button class="btn btn--primary" @click="doSearch">{{ t('search.btn') }}</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- 区间检索 -->
        <div v-else class="card" style="margin-bottom: var(--sp-4)">
            <div class="card__body">
                <div class="searchrow">
                    <div class="field" style="flex: 0 0 200px">
                        <label class="field__label">{{ t('f.species') }}</label>
                        <select v-model="rSpecies" class="select">
                            <option v-for="s in speciesList" :key="s.abbr" :value="s.abbr">
                                {{ speciesName(s) }} ({{ s.abbr }})
                            </option>
                        </select>
                    </div>
                    <div class="field" style="flex: 0 0 110px">
                        <label class="field__label">{{ t('col.chromosome') }}</label>
                        <input v-model="rChrom" class="input mono" />
                    </div>
                    <div class="field" style="flex: 1">
                        <label class="field__label">{{ t('col.genomeStart') }}</label>
                        <input v-model="rStart" class="input mono" />
                    </div>
                    <div class="field" style="flex: 1">
                        <label class="field__label">{{ t('col.genomeEnd') }}</label>
                        <input v-model="rEnd" class="input mono" />
                    </div>
                    <div class="field" style="flex: 0 0 auto">
                        <label class="field__label">&nbsp;</label>
                        <button class="btn btn--primary" @click="doRegionSearch">{{ t('search.btn.region') }}</button>
                    </div>
                </div>
                <div class="card__hint" style="margin-top: var(--sp-3)">{{ t('search.region.hint') }}</div>
                <div v-if="swappedNote" class="note note--warn" style="margin-top: var(--sp-2)">{{ t('search.region.swapped') }}</div>
            </div>
        </div>

        <!-- 结果 -->
        <div v-if="loading" class="state">
            <div class="state__spinner"></div>
            {{ t('state.loading') }}
        </div>

        <div v-else-if="error" class="state state--error">{{ error }}</div>

        <div v-else-if="searched && !results.length" class="state">
            {{ t('search.noResults') }}
        </div>

        <div v-else-if="results.length" class="card">
            <div class="card__head">
                <span class="card__title">{{ t('search.results') }}</span>
                <span class="card__hint mono">
                    {{ results.length >= 100 ? t('search.showingFirst') + ' 100' : fmt(results.length) }}
                    <template v-if="results.length >= 100"> · {{ t('search.refine') }}</template>
                </span>
            </div>
            <div class="table-wrap" style="max-height: 60vh">
                <table class="data">
                    <thead>
                        <tr>
                            <th v-for="c in visibleCols" :key="c" scope="col">{{ colLabel(c) }}</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="(r, i) in results" :key="i">
                            <td v-for="c in visibleCols" :key="c" :class="{ mono: c !== 'species' && c !== 'note' }">
                                <!-- 基因号/转录本号不是位点 ID，只显示文本不链接 -->
                                <RouterLink v-if="c === 'id' && resultTo(r)" :to="resultTo(r)" class="strong">
                                    {{ r.id }}
                                </RouterLink>
                                <span v-else-if="c === 'id'" class="strong">{{ r.id }}</span>

                                <template v-else-if="c === 'species'">{{ speciesName(r) || t('common.empty') }}</template>

                                <template v-else-if="c === 'pos'">
                                    <template v-if="r.chromosome">chr{{ r.chromosome }}:{{ fmt(r.genome_start) }}-{{ fmt(r.genome_end) }}</template>
                                    <template v-else>{{ t('common.empty') }}</template>
                                </template>

                                <template v-else-if="c === 'gene'">{{ r.locus_gene || r.transcript || r.transcript_id || t('common.empty') }}</template>
                                <template v-else-if="c === 'seq'"><span class="cell-seq">{{ r.sequence || t('common.empty') }}</span></template>
                                <template v-else-if="c === 'score'">{{ r.phase_score ?? t('common.empty') }}</template>
                                <template v-else-if="c === 'note'">
                                    <span v-if="r.kind === 'mirna'" class="badge badge--accent">{{ r.mirna }}</span>
                                    <template v-else>{{ r.annotation || t('common.empty') }}</template>
                                </template>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    </div>
</template>

<style scoped>
.searchrow {
    display: flex;
    gap: var(--sp-3);
    align-items: flex-end;
    flex-wrap: wrap;
}
</style>
