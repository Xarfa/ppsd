/**
 * 后端 API 封装。
 *
 * 前端跑在 5173，后端跑在 3000 —— 两个独立程序，靠 HTTP 通信。
 * 所有 axios 调用集中在这个文件，页面组件只管调函数、不管 URL。
 *
 * 演示模式：构建时设 VITE_STATIC_DEMO=1（见 vite.config.demo.mjs），
 * 则不接后端，改用内嵌数据的本地适配器（src/demo/mockApi.js）——
 * 产物是单个 HTML，双击即用。
 */
import axios from 'axios'
import { locale } from '../i18n/index.js'

export const IS_DEMO = import.meta.env.VITE_STATIC_DEMO === '1'

/* 真实后端的 axios 实现（普通模式用；演示模式不会被打进产物） */
function buildHttpApi() {
    const baseURL = import.meta.env.VITE_API_BASE || 'http://localhost:3000/api'
    const http = axios.create({ baseURL, timeout: 60000 })

    /** 把后端返回的 { error, message } 统一变成可读异常 */
    http.interceptors.response.use(
        (res) => res.data,
        (err) => {
            const msg = err.response?.data?.message || err.message || 'Request failed'
            return Promise.reject(new Error(msg))
        },
    )

    return {
        health: () => http.get('/health'),
        stats: () => http.get('/stats'),
        statsAtlas: () => http.get('/stats/atlas'),
        species: () => http.get('/species'),

        /** PHAS loci 分页列表（物种 / 关键词 / 排序 / 分页） */
        loci: (params) => http.get('/loci', { params }),
        locus: (id) => http.get(`/loci/${encodeURIComponent(id)}`),
        locusPhasiRna: (id, params) => http.get(`/loci/${encodeURIComponent(id)}/phasi-rna`, { params }),
        locusInitiators: (id) => http.get(`/loci/${encodeURIComponent(id)}/initiators`),

        phasiRna: (id) => http.get(`/phasi-rna/${encodeURIComponent(id)}`),

        search: (params) => http.get('/search', { params }),
        searchRegion: (params) => http.get('/search/region', { params }),

        /* 序列比对（本地实现，非 NCBI BLAST） */
        blastInfo: () => http.get('/blast/info'),
        blast: (payload) => http.post('/blast', payload),

        /* 物种系统发育树（对应原站 browse.php 里那棵 ECharts 树） */
        speciesTree: () => http.get('/species-tree'),

        /* 批量下载文件清单 */
        downloads: () => http.get('/downloads'),
    }
}

/* 惰性选择实现：演示模式动态 import mock（5.8MB 数据不会进普通构建），
   用 Proxy 转发，调用方完全无感。 */
let _impl = null
function getImpl() {
    if (!_impl) {
        _impl = IS_DEMO
            ? import('../demo/mockApi.js').then((m) => m.mockApi)
            : Promise.resolve(buildHttpApi())
    }
    return _impl
}

const api = new Proxy({}, {
    get(_t, key) {
        return (...args) => getImpl().then((m) => m[key](...args))
    },
})

/**
 * 物种显示名。
 *
 * 后端同时返回 common_name（中文）和 common_name_en（英文），
 * 显示哪个由当前语言决定。这个函数是全站唯一的判断点 ——
 * 别在模板里各写各的，否则漏一处就会出现中英混排。
 */
export function speciesName(row) {
    if (!row) return ''
    return locale.value === 'zh'
        ? row.common_name || row.common_name_en || row.scientific_name
        : row.common_name_en || row.common_name || row.scientific_name
}

/** 拼接批量文件的下载地址（浏览器直接打开，不走 axios）；演示版无文件 */
export const downloadUrl = (file) => (IS_DEMO ? '#' : `${(import.meta.env.VITE_API_BASE || 'http://localhost:3000/api')}/downloads/${encodeURIComponent(file)}`)

export default api
