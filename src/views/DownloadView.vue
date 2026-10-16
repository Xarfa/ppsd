<!--
    批量下载 —— 对应原站 download.php。
    文件清单由后端扫描 data/raw 目录动态生成，不在前端写死。
    v2：顶部树影横幅、物种色点分组、格式徽章。
-->
<script setup>
import { ref, computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import api, { downloadUrl, speciesName, IS_DEMO } from '../api/ppsd.js'
import { t } from '../i18n/index.js'
import { speciesColor } from '../utils/echarts.js'
import { fmt } from '../utils/ui.js'

const files = ref([])
const speciesList = ref([])
const loading = ref(true)
const error = ref('')

/** 数据类型 → 显示名。key 与后端 classify() 返回的 kind 对应 */
const KIND_LABEL = {
    phas_loci: { en: 'PHAS loci', zh: 'PHAS 位点' },
    phasi_rna: { en: 'phasiRNA', zh: 'phasiRNA' },
    initiator: { en: 'Initiator', zh: '相位起始因子' },
    phas_seq: { en: 'PHAS sequences', zh: 'PHAS 位点序列' },
    other: { en: 'Other', zh: '其他' },
}

const grouped = computed(() => {
    const map = new Map()
    for (const f of files.value) {
        if (!map.has(f.species)) {
            const sp = speciesList.value.find((x) => x.abbr === f.species)
            map.set(f.species, {
                label: sp ? `${speciesName(sp)} — ${sp.scientific_name}` : f.speciesLabel,
                rows: [],
            })
        }
        map.get(f.species).rows.push(f)
    }
    return [...map.entries()].map(([abbr, v]) => ({ abbr, ...v }))
})

function humanSize(bytes) {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function kindLabel(kind) {
    const k = KIND_LABEL[kind] || KIND_LABEL.other
    return k[document.documentElement.lang === 'zh-CN' ? 'zh' : 'en']
}

onMounted(async () => {
    try {
        const [d, sp] = await Promise.all([api.downloads(), api.species()])
        speciesList.value = sp.species || []
        files.value = d.files || []
    } catch (e) {
        error.value = e.message
    } finally {
        loading.value = false
    }
})
</script>

<template>
    <div>
        <!-- 顶部横幅 -->
        <section class="on-dark dl-hero">
            <div class="dl-hero__bg" aria-hidden="true"></div>
            <div class="page" style="padding-top: var(--sp-6); padding-bottom: var(--sp-6); position: relative">
                <div class="crumbs">
                    <RouterLink to="/">{{ t('nav.home') }}</RouterLink>
                    <span class="crumbs__sep">/</span>
                    <span class="crumbs__here">{{ t('download.title') }}</span>
                </div>
                <h1 class="display" style="font-size: var(--fs-3xl); color: #fff; margin-top: var(--sp-2)">{{ t('download.title') }}</h1>
                <p style="color: var(--c-hero-dim); max-width: 62ch">{{ t('download.sub') }}</p>
            </div>
        </section>

        <div class="page page-body" style="padding-top: var(--sp-5)">
            <div v-if="loading" class="state">
                <div class="state__spinner"></div>
                {{ t('state.loading') }}
            </div>

            <div v-else-if="IS_DEMO" class="state">
                <div class="note note--warn" style="max-width: 620px">{{ t('download.demoNote') }}</div>
            </div>

            <div v-else-if="error" class="state state--error">{{ error }}</div>

            <template v-else>
                <div class="note" style="margin-bottom: var(--sp-4)">
                    <span>{{ t('download.hint') }}</span>
                </div>

                <div v-for="g in grouped" :key="g.abbr" class="card" style="margin-bottom: var(--sp-4)">
                    <div class="card__head">
                        <span class="dot" :style="{ background: speciesColor(g.abbr) }"></span>
                        <span class="card__title">{{ g.label }}</span>
                        <span class="badge badge--soft mono">{{ g.abbr }}</span>
                    </div>
                    <div class="table-wrap">
                        <table class="data">
                            <thead>
                                <tr>
                                    <th scope="col">{{ t('download.file') }}</th>
                                    <th scope="col">{{ t('download.contents') }}</th>
                                    <th scope="col">{{ t('col.format') }}</th>
                                    <th scope="col">{{ t('download.rows') }}</th>
                                    <th scope="col">{{ t('download.size') }}</th>
                                    <th scope="col">{{ t('download.action') }}</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="f in g.rows" :key="f.file">
                                    <td class="mono">{{ f.file }}</td>
                                    <td>{{ kindLabel(f.kind) }}</td>
                                    <td><span class="badge badge--soft">{{ f.format }}</span></td>
                                    <td class="mono">{{ fmt(f.rows) }}</td>
                                    <td class="mono">{{ humanSize(f.bytes) }}</td>
                                    <td>
                                        <a :href="downloadUrl(f.file)" class="btn btn--secondary btn--sm">{{ t('download.btn') }}</a>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </template>
        </div>
    </div>
</template>

<style scoped>
.dl-hero {
    background: var(--grad-hero);
    position: relative;
    overflow: hidden;
}
.dl-hero__bg {
    position: absolute;
    inset: 0;
    background: url('../assets/img/tree.jpg') center 30% / cover no-repeat;
    opacity: 0.3;
    filter: saturate(0.7);
}
.dl-hero__bg::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, rgba(9, 30, 21, 0.55), rgba(13, 43, 30, 0.85));
}
.dl-hero .crumbs a { color: var(--c-hero-dim); }
.dl-hero .crumbs a:hover { color: #fff; }
.dl-hero .crumbs__here { color: var(--c-hero-text); }
</style>
