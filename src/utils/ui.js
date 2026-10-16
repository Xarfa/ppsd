/**
 * 小工具：数字格式化、剪贴板、Toast 事件、数字滚动动画。
 */
import { reactive } from 'vue'

/** 千分位（en-US 分组，中英文都习惯） */
export const fmt = (n) => (n === null || n === undefined ? '—' : Number(n).toLocaleString('en-US'))

/* ---------------- Toast ---------------- */
export const toasts = reactive([])
let toastSeq = 0

export function toast(message) {
    const id = ++toastSeq
    toasts.push({ id, message })
    setTimeout(() => {
        const i = toasts.findIndex((t) => t.id === id)
        if (i !== -1) toasts.splice(i, 1)
    }, 2200)
}

/** 复制文本 + toast 反馈（浏览器老 API 兜底） */
export async function copyText(text, msg = 'Copied') {
    try {
        await navigator.clipboard.writeText(text)
    } catch {
        const ta = document.createElement('textarea')
        ta.value = text
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        ta.remove()
    }
    toast(msg)
}

/* ---------------- 数字滚动 ----------------
   hero 统计数字从 0 滚到目标值，600ms 内完成，
   prefers-reduced-motion 时直接显示最终值。 */
export function countUp(el, target, duration = 700) {
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        el.textContent = fmt(target)
        return
    }
    const start = performance.now()
    const step = (now) => {
        const p = Math.min((now - start) / duration, 1)
        const eased = 1 - Math.pow(1 - p, 3)
        el.textContent = fmt(Math.round(target * eased))
        if (p < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
}

/* ---------------- CSV 导出（纯前端，当前页数据） ---------------- */
export function downloadCsv(filename, rows, columns) {
    const esc = (v) => {
        const s = v === null || v === undefined ? '' : String(v)
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const head = columns.map((c) => esc(c.label)).join(',')
    const body = rows.map((r) => columns.map((c) => esc(typeof c.get === 'function' ? c.get(r) : r[c.key])).join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + head + '\n' + body], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = filename
    a.click()
    URL.revokeObjectURL(a.href)
}

/* ---------------- 滚动入场动画 ---------------- */
export function observeReveal(rootEl) {
    const io = new IntersectionObserver(
        (entries) => {
            entries.forEach((e) => {
                if (e.isIntersecting) {
                    e.target.classList.add('is-in')
                    io.unobserve(e.target)
                }
            })
        },
        { threshold: 0.08 },
    )
    rootEl.querySelectorAll('.reveal').forEach((el) => io.observe(el))
    return io
}
