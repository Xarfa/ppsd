/**
 * BLAST 查询序列校验。
 *
 * 两个引擎（NCBI / JS）共用同一套规则，保证"同一个输入在两边都能跑"。
 */
const MAX_QUERY_LEN = 5000;
const VALID_DNA = /^[ACGTUNRYKMSWBDHV]+$/;

/**
 * 把用户粘贴的内容（可能带 FASTA 头行、空白、数字）规范成纯序列。
 * 返回 { sequence } 或 { error }。
 */
export function normalizeQuery(raw) {
    if (typeof raw !== 'string' || !raw.trim()) {
        return { error: 'sequence is required' };
    }
    const seq = raw.replace(/[\s\d]/g, '').toUpperCase();
    if (!seq) return { error: 'sequence is empty after removing whitespace' };
    if (!VALID_DNA.test(seq)) {
        const bad = [...new Set(seq.split('').filter((c) => !/[ACGTUNRYKMSWBDHV]/.test(c)))];
        return { error: `invalid characters in sequence: ${bad.join(' ')}` };
    }
    if (seq.length > MAX_QUERY_LEN) {
        return { error: `sequence too long (${seq.length} nt); limit is ${MAX_QUERY_LEN} nt` };
    }
    return { sequence: seq };
}

export { MAX_QUERY_LEN, VALID_DNA };
