// Lightweight spreadsheet engine: A1-style refs, ranges, a few functions, and safe arithmetic.

export function colLabel(n) {
  let s = ''
  n = Number(n)
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s
    n = Math.floor(n / 26) - 1
  }
  return s
}

export function colIndex(label) {
  let n = 0
  for (const ch of String(label).toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

const key = (r, c) => r + ',' + c
const round = (n) => Math.round((n + Number.EPSILON) * 1e10) / 1e10

// Returns { display(r, c) } which resolves formulas (with cycle protection) to strings.
export function makeCompute(cells) {
  const cache = new Map()
  const computing = new Set()

  const raw = (r, c) => cells[key(r, c)] ?? ''
  const toNum = (v) => {
    if (v === '' || v == null) return 0
    const n = Number(v)
    return isNaN(n) ? 0 : n
  }

  function refValue(ref) {
    const m = /^([A-Za-z]+)(\d+)$/.exec(ref)
    if (!m) return 0
    return toNum(compute(parseInt(m[2], 10) - 1, colIndex(m[1])))
  }

  function rangeValues(a, b) {
    const ma = /^([A-Za-z]+)(\d+)$/.exec(a)
    const mb = /^([A-Za-z]+)(\d+)$/.exec(b)
    if (!ma || !mb) return []
    let c1 = colIndex(ma[1]), r1 = parseInt(ma[2], 10) - 1
    let c2 = colIndex(mb[1]), r2 = parseInt(mb[2], 10) - 1
    if (c1 > c2) [c1, c2] = [c2, c1]
    if (r1 > r2) [r1, r2] = [r2, r1]
    const out = []
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) out.push(toNum(compute(r, c)))
    return out
  }

  function evalFormula(expr) {
    // Functions with simple (non-nested) argument lists.
    expr = expr.replace(
      /\b(SUM|AVERAGE|AVG|MIN|MAX|COUNT|PRODUCT)\s*\(([^()]*)\)/gi,
      (_m, fn, args) => {
        const nums = []
        for (const part of String(args).split(',')) {
          const p = part.trim()
          if (!p) continue
          if (p.includes(':')) {
            const [a, b] = p.split(':')
            nums.push(...rangeValues(a.trim(), b.trim()))
          } else if (/^[A-Za-z]+\d+$/.test(p)) {
            nums.push(refValue(p))
          } else {
            nums.push(toNum(p))
          }
        }
        fn = fn.toUpperCase()
        let v = 0
        if (fn === 'SUM') v = nums.reduce((a, b) => a + b, 0)
        else if (fn === 'AVERAGE' || fn === 'AVG') v = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0
        else if (fn === 'MIN') v = nums.length ? Math.min(...nums) : 0
        else if (fn === 'MAX') v = nums.length ? Math.max(...nums) : 0
        else if (fn === 'COUNT') v = nums.filter((x) => x !== 0 || true).length
        else if (fn === 'PRODUCT') v = nums.reduce((a, b) => a * b, 1)
        return '(' + v + ')'
      }
    )

    // Remaining bare cell references → their numeric values.
    expr = expr.replace(/\b([A-Za-z]+)(\d+)\b/g, (_m, col, row) => '(' + refValue(col + row) + ')')

    // Only arithmetic characters may remain — otherwise it's an error, not eval-able.
    if (!/^[-+*/().\d\s]*$/.test(expr)) return '#ERROR'
    try {
      // eslint-disable-next-line no-new-func
      const val = Function('"use strict"; return (' + (expr.trim() || '0') + ')')()
      if (typeof val === 'number' && isFinite(val)) return String(round(val))
      return '#ERROR'
    } catch {
      return '#ERROR'
    }
  }

  function compute(r, c) {
    const k = key(r, c)
    if (cache.has(k)) return cache.get(k)
    if (computing.has(k)) return '#CYCLE'
    const rv = raw(r, c)
    if (typeof rv === 'string' && rv.startsWith('=')) {
      computing.add(k)
      let res
      try { res = evalFormula(rv.slice(1)) } catch { res = '#ERROR' }
      computing.delete(k)
      cache.set(k, res)
      return res
    }
    cache.set(k, rv)
    return rv
  }

  return { display: (r, c) => compute(r, c) }
}

export const isNumericStr = (v) => v !== '' && v != null && !isNaN(Number(v))
