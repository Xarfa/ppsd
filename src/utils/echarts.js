/**
 * ECharts composable —— 全站图表的唯一初始化入口。
 *
 * 把 docs/前端手册.md 第六节踩过的两个坑一次性堵死：
 *   坑一  容器还没渲染就 init（loading 还没关）→ 这里统一等 nextTick；
 *   坑二  图表实例挂在已被销毁/重建的 DOM 上 → 每次画之前核对 getDom()。
 * 同时统一处理：resize（ResizeObserver）、卸载 dispose、
 * 语言切换重绘、颜色从 CSS 变量读取。
 *
 * 用法：
 *   const { el, setOption, loading } = useChart(buildOption)
 *   数据到位后 setOption()；option 由 buildOption(data, t) 生成。
 */
import { ref, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import * as echarts from 'echarts'
import { locale } from '../i18n/index.js'

/** 从当前 DOM 读 CSS 变量（图表颜色跟着 tokens.css 走） */
export function cssVar(name, fallback = '') {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
    return v || fallback
}

/** 8 个物种的标准配色顺序（与 tokens.css 的 --c-sp-* 一一对应） */
export const SPECIES_ORDER = ['osa', 'gma', 'zma', 'ath', 'vvi', 'bna', 'csi', 'ghi']

export function speciesColor(abbr) {
    return cssVar(`--c-sp-${abbr}`, '#127a50')
}

/** 深色 tooltip —— 全站统一的一套，和 hero 深色首屏呼应 */
export function darkTooltip(extra = {}) {
    return {
        backgroundColor: cssVar('--c-chart-ink', '#17231d'),
        borderWidth: 0,
        padding: [8, 12],
        textStyle: { color: '#f2f7f3', fontSize: 12 },
        extraCssText: 'border-radius:8px; box-shadow:0 8px 24px rgba(0,0,0,.25);',
        ...extra,
    }
}

export function useChart(buildOption) {
    const el = ref(null)
    let chart = null
    let lastData = null
    let ro = null

    function render() {
        if (!el.value || lastData === null) return
        // 坑二：容器可能被 v-if 销毁重建，实例还指着旧 DOM
        if (chart && chart.getDom() !== el.value) {
            chart.dispose()
            chart = null
        }
        if (!chart) chart = echarts.init(el.value)
        chart.setOption(buildOption(lastData), true) // notMerge=true
    }

    function setOption(data) {
        lastData = data
        // 坑一：容器可能在 v-if 里，先等一个 tick 再画
        nextTick(render)
    }

    onMounted(() => {
        ro = new ResizeObserver(() => chart && chart.resize())
        if (el.value) ro.observe(el.value)
    })

    onBeforeUnmount(() => {
        ro && ro.disconnect()
        chart && chart.dispose()
        chart = null
    })

    // 语言切换：图例/轴标签跟着换
    watch(locale, () => nextTick(render))

    return { el, setOption, getChart: () => chart }
}
