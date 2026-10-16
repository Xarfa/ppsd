<!--
    序列比对 —— 对应原站 blast.php

    说明：原站用的是 NCBI blast+ 二进制。这里改成后端用 JavaScript 对
    PostgreSQL 做的"种子延伸 + Smith-Waterman 局部比对"，不依赖任何外部程序。
    界面上必须把这件事说清楚（见下方 note），不能让人误以为是 NCBI BLAST。
-->
<script setup>
import { ref, onMounted, computed } from 'vue'
import { RouterLink } from 'vue-router'
import api from '../api/ppsd.js'
import { t } from '../i18n/index.js'

const info = ref(null)
const dbs = ref([])

const sequence = ref('')
const db = ref('phasi_rna')
const species = ref('')
const maxHits = ref(50)

const speciesList = ref([])
const loading = ref(false)
const error = ref('')
const result = ref(null)

/* 示例序列：水稻一个真实 phasiRNA，点一下就能出结果，适合演示 */
const DEMO_SEQ = 'CTATCAGCGGGCTTTCTTGTT'

const queryLen = computed(() => cleanSeq(sequence.value).length)

/** 生物学家最常粘贴 FASTA 格式（带 > 头行）；去掉头行、数字和一切非碱基字符 */
function cleanSeq(raw) {
    return raw
        .replace(/^>.*$/gm, '')   // FASTA 头行
        .replace(/^;.*$/gm, '')   // 老式注释行
        .replace(/[^ACGTUNacgtun]/g, '')
        .toUpperCase()
}

function useDemo() {
    sequence.value = DEMO_SEQ
}

async function run() {
    const seq = cleanSeq(sequence.value)
    if (!seq) return
    loading.value = true
    error.value = ''
    result.value = null
    try {
        result.value = await api.blast({
            sequence: seq,
            database: db.value,
            species: species.value || undefined,
            maxHits: Number(maxHits.value) || 50,
        })
    } catch (e) {
        error.value = e.message
    } finally {
        loading.value = false
    }
}

function clearAll() {
    sequence.value = ''
    result.value = null
    error.value = ''
}

const pct = (v) => `${(Number(v) * 100).toFixed(1)}%`

onMounted(async () => {
    try {
        const [bi, sp] = await Promise.all([api.blastInfo(), api.species()])
        dbs.value = bi.databases || []
        speciesList.value = sp.species || []
        if (dbs.value.length && !dbs.value.some((d) => d.id === db.value)) {
            db.value = dbs.value[0].id
        }
    } catch (e) {
        error.value = e.message
    }
})
</script>

<template>
    <div class="page page-body">
        <h1 class="page-title">{{ t('blast.title') }}</h1>
        <p class="page-sub">{{ t('blast.sub') }}</p>

        <div class="note mb-4">
            <span class="note__icon">i</span>
            <span>{{ t('blast.impl') }}</span>
        </div>

        <!-- 查询表单 -->
        <div class="card mb-4">
            <div class="card__body">
                <div class="field mb-3">
                    <label class="field__label">
                        {{ t('blast.query') }}
                        <span v-if="queryLen" class="dim" style="text-transform: none">
                            · <span class="mono">{{ queryLen }} nt</span>
                        </span>
                    </label>
                    <textarea
                        v-model="sequence"
                        class="textarea"
                        rows="4"
                        :placeholder="t('blast.ph.query')"
                        spellcheck="false"
                    ></textarea>
                </div>

                <div class="searchrow">
                    <div class="field" style="flex: 0 0 220px">
                        <label class="field__label">{{ t('blast.db') }}</label>
                        <select v-model="db" class="select">
                            <!-- 库名用前端文案，不用后端返回的 label：后端只给英文，
                                 中文界面会露馅 -->
                            <option v-for="d in dbs" :key="d.id" :value="d.id">
                                {{ d.id === 'phasi_rna' ? t('home.chart.sirna') : t('stat.loci') }}
                                — {{ (d.rows || 0).toLocaleString('en-US') }}
                            </option>
                        </select>
                    </div>
                    <div class="field" style="flex: 0 0 200px">
                        <label class="field__label">{{ t('blast.species') }}</label>
                        <select v-model="species" class="select">
                            <option value="">{{ t('search.allSpecies') }}</option>
                            <option v-for="s in speciesList" :key="s.abbr" :value="s.abbr">
                                {{ s.common_name_en || s.common_name }}
                            </option>
                        </select>
                    </div>
                    <div class="field" style="flex: 0 0 130px">
                        <label class="field__label">{{ t('blast.maxHits') }}</label>
                        <input v-model="maxHits" class="input mono" type="number" min="1" max="500" />
                    </div>
                    <div class="field" style="flex: 0 0 auto">
                        <label class="field__label">&nbsp;</label>
                        <div class="rowline">
                            <button class="btn btn--primary" :disabled="loading || !sequence.trim()" @click="run">
                                {{ t('blast.btn') }}
                            </button>
                            <button class="btn btn--ghost" @click="useDemo">
                                {{ t('blast.selftest') }}
                            </button>
                            <button class="btn btn--ghost" @click="clearAll">
                                {{ t('blast.btn.clear') }}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div v-if="loading" class="state">
            <div class="state__spinner"></div>
            {{ t('state.loading') }}
        </div>

        <div v-else-if="error" class="state state--error">{{ error }}</div>

        <template v-else-if="result">
            <div class="note note--warn mb-4" v-if="result.warning">
                <span class="note__icon">!</span>
                <span>{{ result.warning }}</span>
            </div>

            <div class="card">
                <div class="card__head">
                    <span class="card__title">{{ t('blast.results') }}</span>
                    <span class="card__hint mono">
                        {{ result.totalHits }} hits ·
                        {{ (result.totalScanned || 0).toLocaleString('en-US') }} {{ t('blast.candidates') }} ·
                        {{ t('blast.seed') }}={{ result.seedLength }} · {{ result.tookMs }} ms
                    </span>
                </div>

                <div v-if="result.demoNote" class="note note--warn" style="margin-bottom: var(--sp-4)">{{ result.demoNote }}</div>

            <div v-if="!result.hits?.length" class="state">{{ t('blast.noHits') }}</div>

                <div v-else class="table-wrap">
                    <table class="data">
                        <thead>
                            <tr>
                                <th scope="col" style="width: 56px">{{ t('blast.rank') }}</th>
                                <th scope="col">{{ t('col.id') }} / {{ t('col.locus') }}</th>
                                <th scope="col">{{ t('col.length') }}</th>
                                <th scope="col">{{ t('col.strand') }}</th>
                                <th scope="col">{{ t('col.identity') }}</th>
                                <th scope="col">{{ t('col.coverage') }}</th>
                                <th scope="col">{{ t('col.mismatch') }}</th>
                                <th scope="col">{{ t('col.gaps') }}</th>
                                <th scope="col">{{ t('col.score') }}</th>
                                <th scope="col">{{ t('col.evalue') }}</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="(h, i) in result.hits" :key="i">
                                <td class="mono dim">{{ i + 1 }}</td>
                                <td class="mono">
                                    <!-- 命中的可能是 phasiRNA，但详情挂在父位点上：链接文本与目的地保持一致 -->
                                    <RouterLink
                                        :to="`/locus/${encodeURIComponent(h.parentLocus || h.id)}`"
                                        class="strong"
                                    >
                                        {{ h.parentLocus || h.id }}
                                    </RouterLink>
                                    <div v-if="h.parentLocus && h.parentLocus !== h.id" class="dim" style="font-size: var(--fs-xs)">
                                        ↳ {{ h.id }}
                                    </div>
                                </td>
                                <td class="mono">{{ h.subjectLength.toLocaleString('en-US') }}</td>
                                <td class="mono">{{ h.strand }}</td>
                                <td class="mono">{{ pct(h.identity) }}</td>
                                <!-- 覆盖率单独一列：局部比对会主动裁掉两端，
                                     identity=100% 可能只在很少的碱基上成立 -->
                                <td class="mono">{{ pct(h.queryCoverage) }}</td>
                                <td class="mono">{{ h.mismatches }}</td>
                                <td class="mono">{{ h.gaps }}</td>
                                <td class="mono strong">{{ h.score }}</td>
                                <td class="mono">{{ Number(h.evalue).toExponential(2) }}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- 比对详情：显示前几条的实际对齐 -->
            <div v-if="result.hits?.length" class="card">
                <div class="card__head">
                    <span class="card__title">{{ t('blast.alignment') }}</span>
                    <span class="card__hint">top {{ Math.min(5, result.hits.length) }}</span>
                </div>
                <div class="card__body">
                    <div v-for="(h, i) in result.hits.slice(0, 5)" :key="i" class="aln">
                        <div class="aln__head mono">
                            <span class="strong">{{ h.id }}</span>
                            <span class="dim">
                                score {{ h.score }} · identity {{ pct(h.identity) }} ·
                                coverage {{ pct(h.queryCoverage) }} ·
                                {{ h.mismatches }} mismatch · strand {{ h.strand }}
                            </span>
                        </div>
                        <div class="aln__body">
                            <div class="aln__row">
                                <span class="aln__lbl">{{ t('blast.q') }}</span>
                                <span class="mono">{{ h.queryStart }}</span>
                                <span class="aln__seq">{{ h.queryAligned }}</span>
                                <span class="mono">{{ h.queryEnd }}</span>
                            </div>
                            <div class="aln__row">
                                <span class="aln__lbl"></span>
                                <span></span>
                                <span class="aln__mid">{{ h.midline }}</span>
                                <span></span>
                            </div>
                            <div class="aln__row">
                                <span class="aln__lbl">{{ t('blast.s') }}</span>
                                <span class="mono">{{ h.subjectStart }}</span>
                                <span class="aln__seq">{{ h.subjectAligned }}</span>
                                <span class="mono">{{ h.subjectEnd }}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </template>
    </div>
</template>

<style scoped>
.searchrow {
    display: flex;
    gap: var(--sp-3);
    align-items: flex-end;
    flex-wrap: wrap;
}

.aln {
    border-bottom: 1px solid var(--c-border);
    padding-bottom: var(--sp-3);
    margin-bottom: var(--sp-3);
}

.aln:last-child {
    border-bottom: 0;
    margin-bottom: 0;
    padding-bottom: 0;
}

.aln__head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--sp-3);
    flex-wrap: wrap;
    font-size: var(--fs-sm);
    margin-bottom: var(--sp-2);
}

.aln__body {
    background: var(--c-surface-sunk);
    border: 1px solid var(--c-border);
    border-radius: var(--r-md);
    padding: var(--sp-3);
    overflow-x: auto;
}

/* 三联比对：Query / 匹配线 / Sbjct，必须等宽且不换行 */
.aln__row {
    display: grid;
    grid-template-columns: 52px 48px 1fr 48px;
    align-items: baseline;
    gap: var(--sp-2);
    font-size: var(--fs-xs);
    line-height: 1.5;
}

.aln__lbl {
    font-size: var(--fs-xs);
    font-weight: 600;
    color: var(--c-text-3);
    text-transform: uppercase;
    letter-spacing: 0.04em;
}

.aln__seq,
.aln__mid {
    font-family: var(--font-mono);
    letter-spacing: 0.06em;
    white-space: pre;
    word-break: break-all;
}

.aln__seq {
    color: var(--c-text);
}

.aln__mid {
    color: var(--c-accent);
}

.aln__row .mono {
    color: var(--c-text-3);
    text-align: right;
}
</style>
