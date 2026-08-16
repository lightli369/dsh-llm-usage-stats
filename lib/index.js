// dsh-llm-usage-stats — host half.
// 1. Listens to llm/stream and aggregates per-model input/output/cache tokens in memory (zero I/O per call).
// 2. Flushes increments into ~/.dsh/llm-usage-stats/usage-YYYY-MM-DD.json on a timer (default 300s).
// 3. Serves a JSON API (used by the settings UI bundle) plus a standalone HTML dashboard at /llm-usage-stats/.

const DASHBOARD_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>模型用量</title>
<style>
html,body{margin:0;padding:0;background:transparent;}
body{color:#e8e8ea;font-size:14px;line-height:1.5;}
.lu-page{padding:14px 18px 24px;display:flex;flex-direction:column;gap:12px;width:100%;min-width:0;box-sizing:border-box;overflow-x:hidden;}
.lu-bar{display:flex;flex-direction:column;gap:8px;align-items:stretch;min-width:0;}
.lu-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;min-width:0;}
.lu-grain{display:inline-flex;border:1px solid rgba(127,127,127,.35);border-radius:8px;overflow:hidden;flex:none;align-self:flex-start;}
.lu-grain button{border:0;background:transparent;color:inherit;padding:5px 12px;cursor:pointer;font-size:12.5px;white-space:nowrap;}
.lu-grain button.on{background:rgba(79,140,255,.22);font-weight:600;}
.lu-bar select,.lu-bar input,.lu-footer input{background:transparent;color:inherit;border:1px solid rgba(127,127,127,.35);border-radius:8px;padding:5px 8px;font-size:12.5px;min-width:0;}
.lu-bar select{max-width:100%;}
.lu-btn{border:1px solid rgba(127,127,127,.35);background:transparent;color:inherit;border-radius:8px;padding:5px 12px;cursor:pointer;font-size:12.5px;white-space:nowrap;}
.lu-btn:hover{background:rgba(127,127,127,.12);}
.lu-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;min-width:0;}
.lu-card{border:1px solid rgba(127,127,127,.3);border-radius:10px;padding:10px 12px;background:rgba(127,127,127,.05);min-width:0;}
.lu-card .t{font-size:11.5px;opacity:.72;}
.lu-card .v{font-size:17px;font-weight:650;margin-top:3px;}
.lu-panel{border:1px solid rgba(127,127,127,.3);border-radius:10px;padding:12px 14px;background:rgba(127,127,127,.05);min-width:0;}
.lu-panel h3{margin:0 0 10px;font-size:13px;font-weight:650;opacity:.9;}
.lu-panel svg{display:block;max-width:100%;}
.lu-legend{display:flex;flex-wrap:wrap;gap:12px;font-size:11.5px;opacity:.8;margin-bottom:6px;}
.lu-legend span{display:inline-flex;align-items:center;gap:5px;}
.lu-dot{width:9px;height:9px;border-radius:2px;display:inline-block;}
.lu-models{display:flex;flex-direction:column;gap:8px;min-width:0;}
.lu-model-card{border:1px solid rgba(127,127,127,.25);border-radius:10px;padding:10px 12px;min-width:0;background:rgba(127,127,127,.04);}
.lu-model-name{font-size:13px;font-weight:600;margin-bottom:7px;word-break:break-all;}
.lu-model-fields{display:flex;flex-wrap:wrap;gap:6px 18px;min-width:0;}
.lu-field{display:inline-flex;gap:5px;font-size:12px;align-items:baseline;white-space:nowrap;}
.lu-field .k{opacity:.65;}
.lu-field .v{font-weight:600;font-variant-numeric:tabular-nums;}
.lu-footer{display:flex;flex-direction:column;gap:8px;font-size:12.5px;}
.lu-danger{border:1px solid rgba(230,90,90,.55);color:#e05a5a;background:transparent;border-radius:8px;padding:5px 12px;cursor:pointer;font-size:12.5px;}
.lu-danger.armed{background:rgba(230,90,90,.2);}
.lu-notice{font-size:12.5px;opacity:.85;}
.lu-empty{padding:28px;text-align:center;opacity:.6;font-size:13px;}
.lu-muted{opacity:.6;}
.lu-code{font-family:ui-monospace,SFMono-Regular,monospace;font-size:11.5px;opacity:.85;word-break:break-all;}
</style>
</head>
<body>
<div class="lu-page">
  <div class="lu-bar">
    <div class="lu-row" id="row1"></div>
    <div class="lu-row" id="row2"></div>
  </div>
  <div id="notice" class="lu-notice"></div>
  <div id="cards" class="lu-cards"></div>
  <div class="lu-panel"><h3 id="chartTitle">Token 消耗趋势</h3><div id="legend" class="lu-legend"></div><div id="barchart"></div></div>
  <div class="lu-panel"><h3>缓存命中率趋势</h3><div id="ratechart"></div></div>
  <div class="lu-panel"><h3>模型明细</h3><div id="models" class="lu-models"></div></div>
  <div class="lu-panel lu-footer" id="footer"></div>
</div>
<script>
(function () {
  'use strict'
  var NS = 'http://www.w3.org/2000/svg'
  var state = { grain: 'day', custom: { from: dk(addDays(new Date(), -29)), to: dk(new Date()) }, model: 'all', rows: null, status: null, confModels: [], defaultSel: null, seenModels: [], intervalDraft: '', clearArmed: false, busy: false }
  function pad2(n) { return n < 10 ? '0' + n : '' + n }
  function dk(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) }
  function addDays(d, n) { var x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x }
  function trimZ(s) { return s.replace(/\\.0+$/, '') }
  function fmt(v) { if (v == null) return '—'; if (v < 1000) return String(Math.round(v)); if (v < 1e6) return trimZ((v / 1e3).toFixed(1)) + 'K'; if (v < 1e9) return trimZ((v / 1e6).toFixed(1)) + 'M'; return trimZ((v / 1e9).toFixed(2)) + 'B' }
  function addNullable(a, b) { if (a == null && b == null) return null; return (a == null ? 0 : a) + (b == null ? 0 : b) }
  function computeRange() {
    var today = new Date()
    if (state.grain === 'day') return { from: addDays(today, -29), to: today }
    if (state.grain === 'week') { var from = addDays(today, -11 * 7); var dow = (from.getDay() + 6) % 7; from.setDate(from.getDate() - dow); return { from: from, to: today } }
    if (state.grain === 'month') return { from: new Date(today.getFullYear(), today.getMonth() - 11, 1), to: today }
    var f = new Date(state.custom.from + 'T00:00:00'); var t = new Date(state.custom.to + 'T00:00:00')
    if (isNaN(f.getTime())) f = addDays(today, -29)
    if (isNaN(t.getTime())) t = today
    if (f.getTime() > t.getTime()) { var tmp = f; f = t; t = tmp }
    return { from: f, to: t }
  }
  function bucketRows(rows, grain) {
    var map = {}
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i]; var key, label
      if (grain === 'week') { var d = new Date(r.day + 'T00:00:00'); var dow = (d.getDay() + 6) % 7; key = dk(addDays(d, -dow)); label = key.slice(5) }
      else if (grain === 'month') { key = r.day.slice(0, 7); label = key }
      else { key = r.day; label = r.day.slice(5) }
      var b = map[key]
      if (b === undefined) { b = { label: label, input: 0, output: 0, cacheRead: null, cacheWrite: null, reasoning: null, requests: 0 }; map[key] = b }
      b.input += r.input; b.output += r.output; b.requests += r.requests
      b.cacheRead = addNullable(b.cacheRead, r.cacheRead); b.cacheWrite = addNullable(b.cacheWrite, r.cacheWrite); b.reasoning = addNullable(b.reasoning, r.reasoning)
    }
    return Object.keys(map).sort().map(function (k) { return map[k] })
  }
  function aggregateByModel(rows) {
    var map = {}
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i]; var m = map[r.model]
      if (m === undefined) { m = { model: r.model, input: 0, output: 0, cacheRead: null, cacheWrite: null, reasoning: null, requests: 0 }; map[r.model] = m }
      m.input += r.input; m.output += r.output; m.requests += r.requests
      m.cacheRead = addNullable(m.cacheRead, r.cacheRead); m.cacheWrite = addNullable(m.cacheWrite, r.cacheWrite); m.reasoning = addNullable(m.reasoning, r.reasoning)
    }
    return Object.keys(map).sort().map(function (k) { return map[k] })
  }
  function svgEl(name, attrs, text) { var e = document.createElementNS(NS, name); for (var k in attrs) e.setAttribute(k, attrs[k]); if (text !== undefined) e.textContent = text; return e }
  function api(path, opts) { return fetch(path, opts || {}).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json() }) }
  function setNotice(text) { document.getElementById('notice').textContent = text || '' }
  function load() {
    var range = computeRange()
    var q = 'from=' + encodeURIComponent(dk(range.from)) + '&to=' + encodeURIComponent(dk(range.to)) + '&model=' + encodeURIComponent(state.model)
    state.busy = true; render()
    Promise.all([api('/llm-usage-stats/api/query?' + q), api('/llm-usage-stats/api/status')]).then(function (r) {
      state.rows = r[0].rows || []; state.seenModels = r[0].models || []; state.status = r[1]; state.busy = false
      if (state.intervalDraft === '' && state.status && state.status.flushSecs) state.intervalDraft = String(state.status.flushSecs)
      render()
    }).catch(function (err) { state.busy = false; setNotice('加载失败：' + err.message); render() })
  }
  function loadModels() {
    api('/llm-usage-stats/api/models').then(function (r) { state.confModels = r.models || []; state.defaultSel = r.default || null; render() }).catch(function () {})
  }
  function render() { renderBar(); renderCards(); renderCharts(); renderModels(); renderFooter() }
  function renderBar() {
    var row1 = document.getElementById('row1'); var row2 = document.getElementById('row2')
    row1.innerHTML = ''; row2.innerHTML = ''
    var grain = document.createElement('div'); grain.className = 'lu-grain'
    ;['day', 'week', 'month', 'custom'].forEach(function (g) {
      var b = document.createElement('button')
      b.textContent = g === 'day' ? '天' : g === 'week' ? '周' : g === 'month' ? '月' : '自定义'
      if (state.grain === g) b.className = 'on'
      b.onclick = function () { state.grain = g; load() }
      grain.appendChild(b)
    })
    row1.appendChild(grain)
    if (state.grain === 'custom') {
      var f = document.createElement('input'); f.type = 'date'; f.value = state.custom.from; f.onchange = function () { state.custom.from = f.value; load() }
      var t = document.createElement('input'); t.type = 'date'; t.value = state.custom.to; t.onchange = function () { state.custom.to = t.value; load() }
      row1.appendChild(f); row1.appendChild(t)
    }
    var nameMap = {}
    state.confModels.forEach(function (m) { nameMap[m.provider + '/' + m.model] = m.name || m.model })
    var defaultKey = state.defaultSel ? state.defaultSel.provider + '/' + state.defaultSel.model : null
    var seenSet = {}
    state.seenModels.forEach(function (k) { seenSet[k] = true })
    state.confModels.forEach(function (m) { seenSet[m.provider + '/' + m.model] = true })
    var keys = Object.keys(seenSet).sort()
    var sel = document.createElement('select')
    var all = document.createElement('option'); all.value = 'all'; all.textContent = '全部模型'; sel.appendChild(all)
    keys.forEach(function (k) { var o = document.createElement('option'); o.value = k; o.textContent = (nameMap[k] || k) + (k === defaultKey ? ' · 默认' : ''); sel.appendChild(o) })
    sel.value = state.model
    sel.onchange = function () { state.model = sel.value; load() }
    row2.appendChild(sel)
    var refresh = document.createElement('button'); refresh.className = 'lu-btn'; refresh.textContent = state.busy ? '加载中…' : '刷新'; refresh.onclick = load
    row2.appendChild(refresh)
  }
  function renderCards() {
    var host = document.getElementById('cards')
    var days = state.rows || []
    var range = computeRange()
    var rangeDays = Math.round((range.to.getTime() - range.from.getTime()) / 86400000) + 1
    var grain = state.grain === 'custom' && rangeDays > 90 ? 'month' : state.grain
    var buckets = bucketRows(days, grain)
    var totals = { input: 0, output: 0, cacheRead: null, cacheWrite: null, requests: 0 }
    buckets.forEach(function (b) { totals.input += b.input; totals.output += b.output; totals.requests += b.requests; totals.cacheRead = addNullable(totals.cacheRead, b.cacheRead); totals.cacheWrite = addNullable(totals.cacheWrite, b.cacheWrite) })
    var denom = totals.input + (totals.cacheRead == null ? 0 : totals.cacheRead) + (totals.cacheWrite == null ? 0 : totals.cacheWrite)
    var hitRate = totals.cacheRead == null || denom === 0 ? null : totals.cacheRead / denom
    var defs = [['总输入 tokens（未缓存）', fmt(totals.input)], ['缓存读取 tokens', fmt(totals.cacheRead)], ['缓存写入 tokens', fmt(totals.cacheWrite)], ['总输出 tokens', fmt(totals.output)], ['缓存命中率', hitRate == null ? '—' : (hitRate * 100).toFixed(1) + '%'], ['请求次数', String(totals.requests)]]
    host.innerHTML = ''
    if (days.length === 0) {
      var empty = document.createElement('div'); empty.className = 'lu-empty'; empty.style.gridColumn = '1 / -1'
      empty.textContent = '所选范围内暂无用量数据（落盘每 ' + ((state.status && state.status.flushSecs) || 300) + ' 秒一次）'
      host.appendChild(empty)
      return
    }
    defs.forEach(function (d) {
      var card = document.createElement('div'); card.className = 'lu-card'
      var t = document.createElement('div'); t.className = 't'; t.textContent = d[0]
      var v = document.createElement('div'); v.className = 'v'; v.textContent = d[1]
      card.appendChild(t); card.appendChild(v); host.appendChild(card)
    })
  }
  function renderCharts() {
    var days = state.rows || []
    var range = computeRange()
    var rangeDays = Math.round((range.to.getTime() - range.from.getTime()) / 86400000) + 1
    var grain = state.grain === 'custom' && rangeDays > 90 ? 'month' : state.grain
    var buckets = bucketRows(days, grain)
    document.getElementById('chartTitle').textContent = 'Token 消耗趋势' + (grain === 'month' ? '（按月）' : grain === 'week' ? '（按周）' : '（按天）')
    var legend = document.getElementById('legend'); legend.innerHTML = ''
    ;[['#4f8cff', '输入（未缓存）'], ['#f0a63c', '缓存读取'], ['#b06fd8', '缓存写入'], ['#3fc77d', '输出']].forEach(function (p) {
      var s = document.createElement('span'); var i = document.createElement('i'); i.className = 'lu-dot'; i.style.background = p[0]
      s.appendChild(i); s.appendChild(document.createTextNode(p[1])); legend.appendChild(s)
    })
    renderBars(buckets)
    var rateHost = document.getElementById('ratechart'); rateHost.innerHTML = ''
    var ratePoints = buckets.map(function (b) { var d = b.input + (b.cacheRead == null ? 0 : b.cacheRead) + (b.cacheWrite == null ? 0 : b.cacheWrite); return { label: b.label, rate: b.cacheRead == null || d === 0 ? null : (b.cacheRead / d) * 100 } }).filter(function (p) { return p.rate != null })
    if (ratePoints.length > 1) rateHost.appendChild(rateSvg(ratePoints))
    else { var hint = document.createElement('div'); hint.className = 'lu-muted'; hint.textContent = '数据不足，暂无法绘制（缓存字段缺失或样本过少）'; rateHost.appendChild(hint) }
  }
  function renderBars(points) {
    var host = document.getElementById('barchart'); host.innerHTML = ''
    if (points.length === 0) return
    var W = 760, H = 250, padL = 48, padR = 10, padT = 10, padB = 24
    var innerW = W - padL - padR; var innerH = H - padT - padB
    var maxV = 1
    points.forEach(function (p) { var tot = p.input + (p.cacheRead == null ? 0 : p.cacheRead) + (p.cacheWrite == null ? 0 : p.cacheWrite); if (tot > maxV) maxV = tot; if (p.output > maxV) maxV = p.output })
    function y(v) { return padT + innerH - (v / maxV) * innerH }
    var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, width: '100%' })
    ;[0, 0.25, 0.5, 0.75, 1].forEach(function (g) {
      var gy = y(g * maxV)
      svg.appendChild(svgEl('line', { x1: padL, y1: gy, x2: W - padR, y2: gy, stroke: 'rgba(127,127,127,.18)', 'stroke-width': 1 }))
      svg.appendChild(svgEl('text', { x: padL - 5, y: gy + 3, 'text-anchor': 'end', 'font-size': 10, fill: 'currentColor', opacity: 0.55 }, fmt(g * maxV)))
    })
    var n = points.length; var groupW = innerW / Math.max(n, 1); var barW = Math.min(24, groupW * 0.3); var step = n > 12 ? Math.ceil(n / 10) : 1
    points.forEach(function (p, i) {
      var cx = padL + groupW * i + groupW / 2; var xIn = cx - barW - 2; var xOut = cx + 2
      var topIn = y(p.input + (p.cacheRead == null ? 0 : p.cacheRead) + (p.cacheWrite == null ? 0 : p.cacheWrite)); var hIn = padT + innerH - topIn
      var yRead = y(p.input + (p.cacheRead == null ? 0 : p.cacheRead)); var hRead = padT + innerH - yRead
      var yInput = y(p.input); var hInput = padT + innerH - yInput
      var yOut = y(p.output); var hOut = padT + innerH - yOut
      if (hIn > 0) {
        var cw = svgEl('rect', { x: xIn, y: topIn, width: barW, height: hIn, fill: '#b06fd8' }); cw.appendChild(svgEl('title', {}, p.label + ' 缓存写入 ' + fmt(p.cacheWrite))); svg.appendChild(cw)
        var cr = svgEl('rect', { x: xIn, y: yRead, width: barW, height: hRead, fill: '#f0a63c' }); cr.appendChild(svgEl('title', {}, p.label + ' 缓存读取 ' + fmt(p.cacheRead))); svg.appendChild(cr)
        var cIn = svgEl('rect', { x: xIn, y: yInput, width: barW, height: hInput, fill: '#4f8cff' }); cIn.appendChild(svgEl('title', {}, p.label + ' 输入(未缓存) ' + fmt(p.input))); svg.appendChild(cIn)
      }
      if (hOut > 0) { var cOut = svgEl('rect', { x: xOut, y: yOut, width: barW, height: hOut, fill: '#3fc77d' }); cOut.appendChild(svgEl('title', {}, p.label + ' 输出 ' + fmt(p.output))); svg.appendChild(cOut) }
      if (i % step === 0) svg.appendChild(svgEl('text', { x: cx, y: H - padB + 13, 'text-anchor': 'middle', 'font-size': 9.5, fill: 'currentColor', opacity: 0.6 }, p.label))
    })
    host.appendChild(svg)
  }
  function rateSvg(points) {
    var W = 760, H = 180, padL = 48, padR = 12, padT = 12, padB = 24
    var innerW = W - padL - padR; var innerH = H - padT - padB
    var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, width: '100%' })
    ;[0, 25, 50, 75, 100].forEach(function (g) { var gy = padT + innerH - (g / 100) * innerH; svg.appendChild(svgEl('line', { x1: padL, y1: gy, x2: W - padR, y2: gy, stroke: 'rgba(127,127,127,.18)', 'stroke-width': 1 })); svg.appendChild(svgEl('text', { x: padL - 5, y: gy + 3, 'text-anchor': 'end', 'font-size': 10, fill: 'currentColor', opacity: 0.55 }, g + '%')) })
    var n = points.length
    function xs(i) { return padL + (innerW * i) / (n - 1) }
    function ys(p) { return padT + innerH - (p.rate / 100) * innerH }
    var path = points.map(function (p, i) { return (i === 0 ? 'M' : 'L') + xs(i).toFixed(1) + ' ' + ys(p).toFixed(1) }).join(' ')
    svg.appendChild(svgEl('path', { d: path, fill: 'none', stroke: '#4f8cff', 'stroke-width': 1.8 }))
    var step = Math.max(1, Math.ceil(n / 10))
    points.forEach(function (p, i) { var c = svgEl('circle', { cx: xs(i), cy: ys(p), r: 2.6, fill: '#4f8cff' }); c.appendChild(svgEl('title', {}, p.label + ' 命中率 ' + p.rate.toFixed(1) + '%')); svg.appendChild(c); if (i % step === 0) svg.appendChild(svgEl('text', { x: xs(i), y: H - padB + 13, 'text-anchor': 'middle', 'font-size': 9.5, fill: 'currentColor', opacity: 0.6 }, p.label)) })
    return svg
  }
  function renderModels() {
    var host = document.getElementById('models'); host.innerHTML = ''
    var days = state.rows || []
    var nameMap = {}
    state.confModels.forEach(function (m) { nameMap[m.provider + '/' + m.model] = m.name || m.model })
    var rows = aggregateByModel(days)
    if (rows.length === 0) { var e = document.createElement('div'); e.className = 'lu-muted'; e.textContent = '暂无数据'; host.appendChild(e); return }
    rows.forEach(function (m) {
      var denom = m.input + (m.cacheRead == null ? 0 : m.cacheRead) + (m.cacheWrite == null ? 0 : m.cacheWrite)
      var rate = m.cacheRead == null || denom === 0 ? null : m.cacheRead / denom
      var card = document.createElement('div'); card.className = 'lu-model-card'
      var name = document.createElement('div'); name.className = 'lu-model-name'; name.textContent = nameMap[m.model] || m.model; card.appendChild(name)
      var fields = document.createElement('div'); fields.className = 'lu-model-fields'
      ;[['请求数', String(m.requests)], ['输入(未缓存)', fmt(m.input)], ['缓存读取', fmt(m.cacheRead)], ['缓存写入', fmt(m.cacheWrite)], ['输出', fmt(m.output)], ['缓存命中率', rate == null ? '—' : (rate * 100).toFixed(1) + '%']].forEach(function (f) {
        var span = document.createElement('span'); span.className = 'lu-field'
        var k = document.createElement('span'); k.className = 'k'; k.textContent = f[0]
        var v = document.createElement('span'); v.className = 'v'; v.textContent = f[1]
        span.appendChild(k); span.appendChild(v); fields.appendChild(span)
      })
      card.appendChild(fields); host.appendChild(card)
    })
  }
  function renderFooter() {
    var host = document.getElementById('footer'); host.innerHTML = ''
    var s = state.status
    var rowA = document.createElement('div'); rowA.className = 'lu-row'
    rowA.appendChild(document.createTextNode('数据目录：'))
    var code = document.createElement('code'); code.className = 'lu-code'; code.textContent = (s && s.dir) || '解析中…'; rowA.appendChild(code)
    host.appendChild(rowA)
    var rowB = document.createElement('div'); rowB.className = 'lu-row'
    rowB.appendChild(document.createTextNode('落盘间隔：'))
    var input = document.createElement('input'); input.style.width = '70px'; input.value = state.intervalDraft; input.placeholder = (s && String(s.flushSecs)) || '300'
    input.onchange = function () { state.intervalDraft = input.value }
    rowB.appendChild(input); rowB.appendChild(document.createTextNode('秒'))
    var apply = document.createElement('button'); apply.className = 'lu-btn'; apply.textContent = '应用'
    apply.onclick = function () {
      var n = parseInt(state.intervalDraft, 10)
      if (!(n >= 30)) { setNotice('间隔最小 30 秒'); return }
      api('/llm-usage-stats/api/set-interval?n=' + n, { method: 'POST' }).then(function (r) { if (r.ok) { setNotice('落盘间隔已更新为 ' + r.flushSecs + ' 秒'); state.intervalDraft = String(r.flushSecs) } else setNotice('设置失败（有效范围 30–86400 秒）') }).catch(function (err) { setNotice('设置失败：' + err.message) })
    }
    rowB.appendChild(apply)
    var flush = document.createElement('button'); flush.className = 'lu-btn'; flush.textContent = '立即落盘'
    flush.onclick = function () { api('/llm-usage-stats/api/flush', { method: 'POST' }).then(function () { setNotice('已落盘'); load() }).catch(function (err) { setNotice('落盘失败：' + err.message) }) }
    rowB.appendChild(flush)
    var muted = document.createElement('span'); muted.className = 'lu-muted'
    muted.textContent = '上次落盘：' + ((s && s.lastFlushAt) ? new Date(s.lastFlushAt).toLocaleString() : '尚未落盘') + ((s && s.pendingDays) ? ' · 待落盘 ' + s.pendingDays + ' 天' : '')
    rowB.appendChild(muted)
    host.appendChild(rowB)
    var rowC = document.createElement('div'); rowC.className = 'lu-row'
    var clear = document.createElement('button'); clear.className = 'lu-danger' + (state.clearArmed ? ' armed' : ''); clear.textContent = state.clearArmed ? '确认清空所有记录？' : '清空所有记录'
    clear.onclick = function () {
      if (!state.clearArmed) { state.clearArmed = true; setTimeout(function () { state.clearArmed = false; renderFooter() }, 4000); renderFooter(); return }
      state.clearArmed = false
      api('/llm-usage-stats/api/clear', { method: 'POST' }).then(function (r) { state.rows = []; state.seenModels = []; setNotice('已清空 ' + (r.cleared || 0) + ' 个日志文件与内存统计'); render() }).catch(function (err) { setNotice('清空失败：' + err.message) })
    }
    rowC.appendChild(clear)
    var warn = document.createElement('span'); warn.className = 'lu-muted'; warn.textContent = '清空后不可恢复；历史记录与内存统计一并清除'; rowC.appendChild(warn)
    host.appendChild(rowC)
  }
  loadModels()
  load()
  setInterval(load, 60000)
})()
</script>
</body>
</html>
`

export default {
  name: 'dsh-llm-usage-stats',
  inject: ['timer'],
  apply(ctx) {
    const fs = ctx.get('fs')
    const llm = ctx.get('llm')
    const webServer = ctx.get('webServer')
    const shell = ctx.get('shell')
    const agentDefaultModel = ctx.get('agentDefaultModel')
    if (fs === undefined || llm === undefined || webServer === undefined) return

    // ---------- state ----------
    let dataDir = null
    let pending = {}
    let flushSecs = 300
    let flushDisposer = null
    let flushing = false
    let lastFlushAt = null
    let lastFlushError = null
    let modelsCache = { at: 0, value: { models: [], default: null } }
    const seenUsage = new WeakSet()
    // 嵌套 adapter（如 modlens vision 包装）会把内层 usage chunk 转发到外层流，
    // 两层包装各统计一次造成双计；而深度计数在流被中断时会计数泄漏，导致后续
    // 单层调用全部漏计。这里改用「对象去重 + 值签名时间窗去重」：嵌套两层的
    // usage 数值相同，10 秒窗口内同签名只记一次；单层调用不受影响。
    const recentUsageSigs = []
    const isDuplicateUsage = (usage) => {
      if (seenUsage.has(usage)) return true
      const sig = num(usage.inputTokens) + '|' + num(usage.outputTokens) +
        '|' + (usage.cacheReadTokens == null ? -1 : usage.cacheReadTokens) +
        '|' + (usage.cacheWriteTokens == null ? -1 : usage.cacheWriteTokens) +
        '|' + (usage.reasoningTokens == null ? -1 : usage.reasoningTokens)
      const now = Date.now()
      while (recentUsageSigs.length > 0 && now - recentUsageSigs[0].at > 10000) recentUsageSigs.shift()
      if (recentUsageSigs.some((r) => r.sig === sig)) return true
      recentUsageSigs.push({ sig, at: now })
      if (recentUsageSigs.length > 64) recentUsageSigs.shift()
      return false
    }

    // ---------- helpers ----------
    const pad2 = (n) => (n < 10 ? '0' + n : '' + n)
    const toDayKey = (d) => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate())
    const zero = () => ({ input: 0, output: 0, cacheRead: null, cacheWrite: null, reasoning: null, requests: 0 })
    const num = (v) => (typeof v === 'number' && isFinite(v) ? v : 0)
    const addNullable = (a, b) => {
      if (a == null && b == null) return null
      return (a == null ? 0 : a) + (b == null ? 0 : b)
    }
    const mergeInto = (cur, inc) => {
      cur.input = num(cur.input) + num(inc.input)
      cur.output = num(cur.output) + num(inc.output)
      cur.requests = num(cur.requests) + num(inc.requests)
      cur.cacheRead = addNullable(cur.cacheRead, inc.cacheRead)
      cur.cacheWrite = addNullable(cur.cacheWrite, inc.cacheWrite)
      cur.reasoning = addNullable(cur.reasoning, inc.reasoning)
    }
    const enumerateDays = (from, to) => {
      const out = []
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return out
      const cur = new Date(from + 'T00:00:00')
      const end = new Date(to + 'T00:00:00')
      const MAX = 4000
      while (cur.getTime() <= end.getTime() && out.length < MAX) {
        out.push(toDayKey(cur))
        cur.setDate(cur.getDate() + 1)
      }
      return out
    }

    // ---------- data dir: ~/.dsh/llm-usage-stats ----------
    async function resolveDir() {
      if (dataDir !== null) return dataDir
      let home = ''
      if (shell !== undefined && typeof shell.resolve === 'function' && typeof shell.run === 'function') {
        try {
          const spec = shell.resolve({ command: 'printf %s "$HOME"', timeoutMs: 5000, stdoutMaxBytes: 4096 })
          const result = await shell.run(spec)
          if (result && result.stdout && typeof result.stdout.text === 'string') {
            home = result.stdout.text.trim()
          }
        } catch (err) { home = '' }
      }
      if (!home) home = '/'
      dataDir = home.replace(/\/+$/, '') + '/.dsh/llm-usage-stats'
      return dataDir
    }

    // ---------- in-memory accumulation (zero I/O per call) ----------
    function accumulate(provider, model, usage) {
      const dayKey = toDayKey(new Date())
      const modelKey = provider + '/' + model
      const dayMap = pending[dayKey] || (pending[dayKey] = {})
      const cell = dayMap[modelKey] || (dayMap[modelKey] = zero())
      cell.requests += 1
      cell.input += num(usage.inputTokens)
      cell.output += num(usage.outputTokens)
      cell.cacheRead = addNullable(cell.cacheRead, usage.cacheReadTokens)
      cell.cacheWrite = addNullable(cell.cacheWrite, usage.cacheWriteTokens)
      cell.reasoning = addNullable(cell.reasoning, usage.reasoningTokens)
    }

    // ---------- llm/stream listener (transparent passthrough; dedupe nested wrapper double-counting) ----------
    ctx.on('llm/stream', function (options, next) {
      const provider = options && typeof options.provider === 'string' ? options.provider : ''
      const model = options && typeof options.model === 'string' ? options.model : ''
      if (!provider || !model) return next()
      const inner = next()
      return {
        async *[Symbol.asyncIterator]() {
          let usage = null
          try {
            for await (const chunk of inner) {
              if (chunk && chunk.type === 'usage' && chunk.usage) usage = chunk.usage
              yield chunk
            }
          } finally {
            if (usage && !isDuplicateUsage(usage)) {
              seenUsage.add(usage)
              accumulate(provider, model, usage)
            }
          }
        },
      }
    })

    // ---------- timed flush (default 300s, write only when dirty) ----------
    async function flush() {
      if (flushing) return
      const keys = Object.keys(pending)
      if (keys.length === 0) return
      flushing = true
      try {
        const dir = await resolveDir()
        for (const dayKey of keys) {
          const filePath = dir + '/usage-' + dayKey + '.json'
          let existing = {}
          try {
            const target = await fs.resolve(filePath)
            const info = await fs.stat(target)
            if (info !== undefined) {
              const text = await fs.readText(target)
              if (text) existing = JSON.parse(text)
            }
          } catch (err) { existing = {} }
          const models = existing && existing.models && typeof existing.models === 'object' ? existing.models : {}
          const dayMap = pending[dayKey]
          for (const modelKey of Object.keys(dayMap)) {
            const inc = dayMap[modelKey]
            if (models[modelKey] === undefined) {
              models[modelKey] = { input: num(inc.input), output: num(inc.output), cacheRead: inc.cacheRead, cacheWrite: inc.cacheWrite, reasoning: inc.reasoning, requests: num(inc.requests) }
            } else {
              mergeInto(models[modelKey], inc)
            }
          }
          await fs.writeText(await fs.resolve(filePath), JSON.stringify({ models }))
          delete pending[dayKey]
        }
        lastFlushAt = Date.now()
        lastFlushError = null
      } catch (err) {
        lastFlushError = err && err.message ? String(err.message) : String(err)
        console.error('[llm-usage] flush failed:', lastFlushError)
      } finally {
        flushing = false
      }
    }
    flushDisposer = ctx.interval(() => { void flush() }, flushSecs * 1000)
    ctx.effect(() => () => { if (Object.keys(pending).length > 0) void flush() })

    // ---------- query (files + in-memory merge) ----------
    async function queryData(from, to, model) {
      const rows = []
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
        return { rows, dir: dataDir, models: [] }
      }
      let dir = null
      try { dir = await resolveDir() } catch (err) { dir = dataDir }
      const seen = {}
      for (const day of enumerateDays(from, to)) {
        let fileModels = {}
        try {
          const target = await fs.resolve(dir + '/usage-' + day + '.json')
          const info = await fs.stat(target)
          if (info !== undefined) {
            const text = await fs.readText(target)
            if (text) {
              const parsed = JSON.parse(text)
              if (parsed && parsed.models && typeof parsed.models === 'object') fileModels = parsed.models
            }
          }
        } catch (err) { fileModels = {} }
        const dayMap = pending[day] || {}
        const keys = {}
        for (const k of Object.keys(fileModels)) keys[k] = true
        for (const k of Object.keys(dayMap)) keys[k] = true
        for (const mk of Object.keys(keys)) {
          seen[mk] = true
          if (model && model !== '' && model !== 'all' && mk !== model) continue
          const base = fileModels[mk] || zero()
          const inc = dayMap[mk]
          rows.push({
            day,
            model: mk,
            input: num(base.input) + num(inc ? inc.input : 0),
            output: num(base.output) + num(inc ? inc.output : 0),
            cacheRead: addNullable(base.cacheRead, inc ? inc.cacheRead : null),
            cacheWrite: addNullable(base.cacheWrite, inc ? inc.cacheWrite : null),
            reasoning: addNullable(base.reasoning, inc ? inc.reasoning : null),
            requests: num(base.requests) + num(inc ? inc.requests : 0),
          })
        }
      }
      return { rows, dir, models: Object.keys(seen) }
    }

    async function listConfiguredModels() {
      const now = Date.now()
      if (now - modelsCache.at < 600000 && modelsCache.value.models.length > 0) return modelsCache.value
      let models = []
      try {
        const providers = llm.listProviders() || []
        const groups = await Promise.all(providers.map((p) => (async () => {
          try {
            const list = await llm.listModels(p.id)
            return (list || []).map((m) => ({ provider: p.id, model: m.id, name: m.name || m.id }))
          } catch (err) { return [] }
        })()))
        models = []
        for (const group of groups) for (const m of group) models.push(m)
      } catch (err) { models = [] }
      let def = null
      try {
        if (agentDefaultModel !== undefined && typeof agentDefaultModel.currentSelection === 'function') {
          const sel = agentDefaultModel.currentSelection()
          if (sel && typeof sel.provider === 'string' && typeof sel.model === 'string') {
            def = { provider: sel.provider, model: sel.model }
          }
        }
      } catch (err) { def = null }
      modelsCache = { at: now, value: { models, default: def } }
      return modelsCache.value
    }

    async function clearAll() {
      pending = {}
      let dir = null
      try { dir = await resolveDir() } catch (err) { return { ok: true, cleared: 0, dir: null } }
      let cleared = 0
      try {
        const target = await fs.resolve(dir)
        const entries = await fs.listDir(target)
        for (const entry of entries) {
          const name = entry && entry.name
          if (typeof name === 'string' && /^usage-\d{4}-\d{2}-\d{2}\.json$/.test(name)) {
            try {
              await fs.writeText(await fs.resolve(dir + '/' + name), '{"models":{}}')
              cleared += 1
            } catch (err) { /* skip */ }
          }
        }
      } catch (err) { /* dir missing = cleared */ }
      return { ok: true, cleared, dir }
    }

    // ---------- HTTP API + standalone dashboard ----------
    const json = (res, code, obj) => {
      res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify(obj))
    }
    webServer.register({
      kind: 'prefix',
      path: '/llm-usage-stats',
      handler: async (req, res) => {
        let pathname
        try { pathname = new URL(req.url, 'http://x').pathname } catch (err) { pathname = String(req.url || '') }
        if (req.method === 'GET' && (pathname === '/llm-usage-stats' || pathname === '/llm-usage-stats/')) {
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
          res.end(DASHBOARD_HTML)
          return
        }
        try {
          const u = new URL(req.url, 'http://x')
          const sp = u.searchParams
          if (pathname === '/llm-usage-stats/api/query') {
            json(res, 200, await queryData(sp.get('from') || '', sp.get('to') || '', sp.get('model') || ''))
            return
          }
          if (pathname === '/llm-usage-stats/api/status') {
            let dir = null
            try { dir = await resolveDir() } catch (err) { dir = null }
            json(res, 200, { dir, flushSecs, lastFlushAt, lastFlushError, pendingDays: Object.keys(pending).length })
            return
          }
          if (pathname === '/llm-usage-stats/api/models') {
            json(res, 200, await listConfiguredModels())
            return
          }
          if (req.method === 'POST' && pathname === '/llm-usage-stats/api/flush') {
            await flush()
            json(res, 200, { ok: true, lastFlushAt, lastFlushError })
            return
          }
          if (req.method === 'POST' && pathname === '/llm-usage-stats/api/clear') {
            json(res, 200, await clearAll())
            return
          }
          if (req.method === 'POST' && pathname === '/llm-usage-stats/api/set-interval') {
            const n = Number(sp.get('n'))
            if (!(n >= 30 && n <= 86400)) {
              json(res, 200, { ok: false, flushSecs })
              return
            }
            flushSecs = Math.floor(n)
            if (flushDisposer !== null) flushDisposer()
            flushDisposer = ctx.interval(() => { void flush() }, flushSecs * 1000)
            await flush()
            json(res, 200, { ok: true, flushSecs })
            return
          }
        } catch (err) {
          json(res, 500, { error: err && err.message ? String(err.message) : String(err) })
          return
        }
        json(res, 404, { error: 'not found' })
      },
    })
  },
}
