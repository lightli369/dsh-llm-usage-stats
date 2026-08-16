window.__ModuleLoader__.load({
	id: "dsh-llm-usage-stats",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let React = require("react");

		// ---------- styles (injected during factory materialization; auto-claimed by the module system) ----------
		if (typeof document !== "undefined") {
			try {
				const style = document.createElement("style");
				style.textContent =
					'.lu-page{padding:14px 18px 24px;display:flex;flex-direction:column;gap:12px;width:100%;min-width:0;box-sizing:border-box;overflow-x:hidden;}' +
					'.lu-bar{display:flex;flex-direction:column;gap:8px;align-items:stretch;min-width:0;}' +
					'.lu-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;min-width:0;}' +
					'.lu-grain{display:inline-flex;border:1px solid rgba(127,127,127,.35);border-radius:8px;overflow:hidden;flex:none;align-self:flex-start;}' +
					'.lu-grain button{border:0;background:transparent;color:inherit;padding:5px 12px;cursor:pointer;font-size:12.5px;white-space:nowrap;}' +
					'.lu-grain button.on{background:rgba(79,140,255,.22);font-weight:600;}' +
					'.lu-bar select,.lu-bar input,.lu-footer input{background:transparent;color:inherit;border:1px solid rgba(127,127,127,.35);border-radius:8px;padding:5px 8px;font-size:12.5px;min-width:0;}' +
					'.lu-bar select{max-width:100%;}' +
					'.lu-btn{border:1px solid rgba(127,127,127,.35);background:transparent;color:inherit;border-radius:8px;padding:5px 12px;cursor:pointer;font-size:12.5px;white-space:nowrap;}' +
					'.lu-btn:hover{background:rgba(127,127,127,.12);}' +
					'.lu-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;min-width:0;}' +
					'.lu-card{border:1px solid rgba(127,127,127,.3);border-radius:10px;padding:10px 12px;background:rgba(127,127,127,.05);min-width:0;}' +
					'.lu-card .t{font-size:11.5px;opacity:.72;}' +
					'.lu-card .v{font-size:17px;font-weight:650;margin-top:3px;}' +
					'.lu-panel{border:1px solid rgba(127,127,127,.3);border-radius:10px;padding:12px 14px;background:rgba(127,127,127,.05);min-width:0;}' +
					'.lu-panel h3{margin:0 0 10px;font-size:13px;font-weight:650;opacity:.9;}' +
					'.lu-panel svg{display:block;max-width:100%;}' +
					'.lu-legend{display:flex;flex-wrap:wrap;gap:12px;font-size:11.5px;opacity:.8;margin-bottom:6px;}' +
					'.lu-legend span{display:inline-flex;align-items:center;gap:5px;}' +
					'.lu-dot{width:9px;height:9px;border-radius:2px;display:inline-block;}' +
					'.lu-models{display:flex;flex-direction:column;gap:8px;min-width:0;}' +
					'.lu-model-card{border:1px solid rgba(127,127,127,.25);border-radius:10px;padding:10px 12px;min-width:0;background:rgba(127,127,127,.04);}' +
					'.lu-model-name{font-size:13px;font-weight:600;margin-bottom:7px;word-break:break-all;}' +
					'.lu-model-fields{display:flex;flex-wrap:wrap;gap:6px 18px;min-width:0;}' +
					'.lu-field{display:inline-flex;gap:5px;font-size:12px;align-items:baseline;white-space:nowrap;}' +
					'.lu-field .k{opacity:.65;}' +
					'.lu-field .v{font-weight:600;font-variant-numeric:tabular-nums;}' +
					'.lu-footer{display:flex;flex-direction:column;gap:8px;font-size:12.5px;}' +
					'.lu-danger{border:1px solid rgba(230,90,90,.55);color:#e05a5a;background:transparent;border-radius:8px;padding:5px 12px;cursor:pointer;font-size:12.5px;}' +
					'.lu-danger.armed{background:rgba(230,90,90,.2);}' +
					'.lu-error{color:#e05a5a;font-size:12.5px;}' +
					'.lu-notice{font-size:12.5px;opacity:.85;}' +
					'.lu-empty{padding:28px;text-align:center;opacity:.6;font-size:13px;}' +
					'.lu-muted{opacity:.6;}' +
					'.lu-code{font-family:ui-monospace,SFMono-Regular,monospace;font-size:11.5px;opacity:.85;word-break:break-all;}';
				document.head.appendChild(style);
			} catch (e) {}
		}

		const { createElement, useState, useEffect, Fragment } = React;

		// ---------- helpers ----------
		const pad2 = (n) => (n < 10 ? '0' + n : '' + n);
		const toDayKey = (d) => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
		const addDays = (d, n) => { const x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; };
		const trimZ = (s) => s.replace(/\.0+$/, '');
		const fmt = (v) => {
			if (v == null) return '—';
			if (v < 1000) return String(Math.round(v));
			if (v < 1e6) return trimZ((v / 1e3).toFixed(1)) + 'K';
			if (v < 1e9) return trimZ((v / 1e6).toFixed(1)) + 'M';
			return trimZ((v / 1e9).toFixed(2)) + 'B';
		};
		const addNullable = (a, b) => {
			if (a == null && b == null) return null;
			return (a == null ? 0 : a) + (b == null ? 0 : b);
		};
		const fetchJson = (path, opts) => fetch(path, opts || {}).then((r) => {
			if (!r.ok) throw new Error('HTTP ' + r.status);
			return r.json();
		});

		function computeRange(grain, custom) {
			const today = new Date();
			if (grain === 'day') return { from: addDays(today, -29), to: today };
			if (grain === 'week') {
				const from = addDays(today, -11 * 7);
				const dow = (from.getDay() + 6) % 7;
				from.setDate(from.getDate() - dow);
				return { from, to: today };
			}
			if (grain === 'month') {
				return { from: new Date(today.getFullYear(), today.getMonth() - 11, 1), to: today };
			}
			let f = new Date(custom.from + 'T00:00:00');
			let t = new Date(custom.to + 'T00:00:00');
			if (isNaN(f.getTime())) f = addDays(today, -29);
			if (isNaN(t.getTime())) t = today;
			if (f.getTime() > t.getTime()) { const tmp = f; f = t; t = tmp; }
			return { from: f, to: t };
		}

		function bucketRows(rows, grain) {
			const map = {};
			for (const r of rows) {
				let key;
				let label;
				if (grain === 'week') {
					const d = new Date(r.day + 'T00:00:00');
					const dow = (d.getDay() + 6) % 7;
					const mon = addDays(d, -dow);
					key = toDayKey(mon);
					label = key.slice(5);
				} else if (grain === 'month') {
					key = r.day.slice(0, 7);
					label = key;
				} else {
					key = r.day;
					label = r.day.slice(5);
				}
				let b = map[key];
				if (b === undefined) {
					b = { label, input: 0, output: 0, cacheRead: null, cacheWrite: null, reasoning: null, requests: 0 };
					map[key] = b;
				}
				b.input += r.input;
				b.output += r.output;
				b.requests += r.requests;
				b.cacheRead = addNullable(b.cacheRead, r.cacheRead);
				b.cacheWrite = addNullable(b.cacheWrite, r.cacheWrite);
				b.reasoning = addNullable(b.reasoning, r.reasoning);
			}
			return Object.keys(map).sort().map((k) => map[k]);
		}

		function aggregateByModel(rows) {
			const map = {};
			for (const r of rows) {
				let m = map[r.model];
				if (m === undefined) {
					m = { model: r.model, input: 0, output: 0, cacheRead: null, cacheWrite: null, reasoning: null, requests: 0 };
					map[r.model] = m;
				}
				m.input += r.input;
				m.output += r.output;
				m.requests += r.requests;
				m.cacheRead = addNullable(m.cacheRead, r.cacheRead);
				m.cacheWrite = addNullable(m.cacheWrite, r.cacheWrite);
				m.reasoning = addNullable(m.reasoning, r.reasoning);
			}
			return Object.keys(map).sort().map((k) => map[k]);
		}

		// ---------- SVG bar chart ----------
		function BarChart(props) {
			const points = props.points || [];
			const W = 760;
			const H = 250;
			const padL = 48;
			const padR = 10;
			const padT = 10;
			const padB = 24;
			const innerW = W - padL - padR;
			const innerH = H - padT - padB;
			let maxV = 1;
			for (const p of points) {
				const tot = p.input + (p.cacheRead == null ? 0 : p.cacheRead) + (p.cacheWrite == null ? 0 : p.cacheWrite);
				if (tot > maxV) maxV = tot;
				if (p.output > maxV) maxV = p.output;
			}
			const y = (v) => padT + innerH - (v / maxV) * innerH;
			const children = [];
			for (const g of [0, 0.25, 0.5, 0.75, 1]) {
				const gy = y(g * maxV);
				children.push(createElement('line', { key: 'g' + g, x1: padL, y1: gy, x2: W - padR, y2: gy, stroke: 'rgba(127,127,127,.18)', strokeWidth: 1 }));
				children.push(createElement('text', { key: 'gt' + g, x: padL - 5, y: gy + 3, textAnchor: 'end', fontSize: 10, fill: 'currentColor', opacity: 0.55 }, fmt(g * maxV)));
			}
			const n = points.length;
			const groupW = innerW / Math.max(n, 1);
			const barW = Math.min(24, groupW * 0.3);
			const step = n > 12 ? Math.ceil(n / 10) : 1;
			points.forEach((p, i) => {
				const cx = padL + groupW * i + groupW / 2;
				const xIn = cx - barW - 2;
				const xOut = cx + 2;
				const topIn = y(p.input + (p.cacheRead == null ? 0 : p.cacheRead) + (p.cacheWrite == null ? 0 : p.cacheWrite));
				const hIn = padT + innerH - topIn;
				const yRead = y(p.input + (p.cacheRead == null ? 0 : p.cacheRead));
				const hRead = padT + innerH - yRead;
				const yInput = y(p.input);
				const hInput = padT + innerH - yInput;
				const yOut = y(p.output);
				const hOut = padT + innerH - yOut;
				if (hIn > 0) {
					children.push(createElement('rect', { key: 'cw' + i, x: xIn, y: topIn, width: barW, height: hIn, fill: '#b06fd8' }, createElement('title', null, p.label + ' 缓存写入 ' + fmt(p.cacheWrite))));
					children.push(createElement('rect', { key: 'cr' + i, x: xIn, y: yRead, width: barW, height: hRead, fill: '#f0a63c' }, createElement('title', null, p.label + ' 缓存读取 ' + fmt(p.cacheRead))));
					children.push(createElement('rect', { key: 'in' + i, x: xIn, y: yInput, width: barW, height: hInput, fill: '#4f8cff' }, createElement('title', null, p.label + ' 输入(未缓存) ' + fmt(p.input))));
				}
				if (hOut > 0) {
					children.push(createElement('rect', { key: 'out' + i, x: xOut, y: yOut, width: barW, height: hOut, fill: '#3fc77d' }, createElement('title', null, p.label + ' 输出 ' + fmt(p.output))));
				}
				if (i % step === 0) {
					children.push(createElement('text', { key: 'lab' + i, x: cx, y: H - padB + 13, textAnchor: 'middle', fontSize: 9.5, fill: 'currentColor', opacity: 0.6 }, p.label));
				}
			});
			return createElement('svg', { viewBox: '0 0 ' + W + ' ' + H, width: '100%', role: 'img' }, children);
		}

		// ---------- SVG hit-rate line chart ----------
		function RateChart(props) {
			const points = (props.points || []).filter((p) => p.rate != null);
			const W = 760;
			const H = 180;
			const padL = 48;
			const padR = 12;
			const padT = 12;
			const padB = 24;
			const innerW = W - padL - padR;
			const innerH = H - padT - padB;
			const children = [];
			for (const g of [0, 25, 50, 75, 100]) {
				const gy = padT + innerH - (g / 100) * innerH;
				children.push(createElement('line', { key: 'g' + g, x1: padL, y1: gy, x2: W - padR, y2: gy, stroke: 'rgba(127,127,127,.18)', strokeWidth: 1 }));
				children.push(createElement('text', { key: 't' + g, x: padL - 5, y: gy + 3, textAnchor: 'end', fontSize: 10, fill: 'currentColor', opacity: 0.55 }, g + '%'));
			}
			if (points.length > 1) {
				const n = points.length;
				const xs = (i) => padL + (innerW * i) / (n - 1);
				const ys = (p) => padT + innerH - (p.rate / 100) * innerH;
				const path = points.map((p, i) => (i === 0 ? 'M' : 'L') + xs(i).toFixed(1) + ' ' + ys(p).toFixed(1)).join(' ');
				children.push(createElement('path', { key: 'line', d: path, fill: 'none', stroke: '#4f8cff', strokeWidth: 1.8 }));
				const step = Math.max(1, Math.ceil(n / 10));
				points.forEach((p, i) => {
					children.push(createElement('circle', { key: 'c' + i, cx: xs(i), cy: ys(p), r: 2.6, fill: '#4f8cff' }, createElement('title', null, p.label + ' 命中率 ' + p.rate.toFixed(1) + '%')));
					if (i % step === 0) {
						children.push(createElement('text', { key: 'l' + i, x: xs(i), y: H - padB + 13, textAnchor: 'middle', fontSize: 9.5, fill: 'currentColor', opacity: 0.6 }, p.label));
					}
				});
			}
			return createElement('svg', { viewBox: '0 0 ' + W + ' ' + H, width: '100%', role: 'img' }, children);
		}

		// ---------- settings page component ----------
		function UsageView() {
			const [grain, setGrain] = useState('day');
			const [custom, setCustom] = useState({ from: toDayKey(addDays(new Date(), -29)), to: toDayKey(new Date()) });
			const [modelKey, setModelKey] = useState('all');
			const [rows, setRows] = useState(null);
			const [status, setStatus] = useState(null);
			const [confModels, setConfModels] = useState([]);
			const [defaultSel, setDefaultSel] = useState(null);
			const [seenModels, setSeenModels] = useState([]);
			const [error, setError] = useState(null);
			const [busy, setBusy] = useState(false);
			const [notice, setNotice] = useState(null);
			const [intervalDraft, setIntervalDraft] = useState('');
			const [clearArmed, setClearArmed] = useState(false);
			const [tick, setTick] = useState(0);

			const range = computeRange(grain, custom);
			const fromKey = toDayKey(range.from);
			const toKey = toDayKey(range.to);

			useEffect(() => {
				let cancelled = false;
				setBusy(true);
				Promise.all([
					fetchJson('/llm-usage-stats/api/query?from=' + encodeURIComponent(fromKey) + '&to=' + encodeURIComponent(toKey) + '&model=' + encodeURIComponent(modelKey)),
					fetchJson('/llm-usage-stats/api/status'),
				]).then((result) => {
					if (cancelled) return;
					const q = result[0];
					const s = result[1];
					setRows(q && q.rows ? q.rows : []);
					if (q && Array.isArray(q.models)) setSeenModels(q.models);
					setStatus(s);
					setError(null);
					setBusy(false);
				}).catch((err) => {
					if (cancelled) return;
					setError(err && err.message ? String(err.message) : String(err));
					setBusy(false);
				});
				return () => { cancelled = true; };
			}, [fromKey, toKey, modelKey, tick]);

			useEffect(() => {
				let cancelled = false;
				fetchJson('/llm-usage-stats/api/models').then((r) => {
					if (cancelled) return;
					setConfModels(r && r.models ? r.models : []);
					setDefaultSel(r && r.default ? r.default : null);
				}).catch(() => {});
				return () => { cancelled = true; };
			}, []);

			// 60s auto refresh
			useEffect(() => {
				const id = setInterval(() => {
					fetchJson('/llm-usage-stats/api/query?from=' + encodeURIComponent(fromKey) + '&to=' + encodeURIComponent(toKey) + '&model=' + encodeURIComponent(modelKey)).then((q) => {
						setRows(q && q.rows ? q.rows : []);
						if (q && Array.isArray(q.models)) setSeenModels(q.models);
					}).catch(() => {});
				}, 60000);
				return () => clearInterval(id);
			}, [fromKey, toKey, modelKey]);

			useEffect(() => {
				if (status && status.flushSecs && intervalDraft === '') setIntervalDraft(String(status.flushSecs));
			}, [status, intervalDraft]);

			// model dropdown: configured + seen
			const nameMap = {};
			const defaultKey = defaultSel ? defaultSel.provider + '/' + defaultSel.model : null;
			for (const m of confModels) nameMap[m.provider + '/' + m.model] = m.name || m.model;
			const seenSet = {};
			for (const k of seenModels) seenSet[k] = true;
			for (const m of confModels) seenSet[m.provider + '/' + m.model] = true;
			const optionKeys = Object.keys(seenSet).sort();

			// aggregation
			const days = rows === null ? [] : rows;
			const rangeDays = Math.round((range.to.getTime() - range.from.getTime()) / 86400000) + 1;
			const effectiveGrain = grain === 'custom' && rangeDays > 90 ? 'month' : grain;
			const buckets = bucketRows(days, effectiveGrain);
			const totals = { input: 0, output: 0, cacheRead: null, cacheWrite: null, reasoning: null, requests: 0 };
			for (const b of buckets) {
				totals.input += b.input;
				totals.output += b.output;
				totals.requests += b.requests;
				totals.cacheRead = addNullable(totals.cacheRead, b.cacheRead);
				totals.cacheWrite = addNullable(totals.cacheWrite, b.cacheWrite);
				totals.reasoning = addNullable(totals.reasoning, b.reasoning);
			}
			const hitDenom = totals.input + (totals.cacheRead == null ? 0 : totals.cacheRead) + (totals.cacheWrite == null ? 0 : totals.cacheWrite);
			const hitRate = totals.cacheRead == null || hitDenom === 0 ? null : totals.cacheRead / hitDenom;
			const ratePoints = buckets.map((b) => {
				const denom = b.input + (b.cacheRead == null ? 0 : b.cacheRead) + (b.cacheWrite == null ? 0 : b.cacheWrite);
				return { label: b.label, rate: b.cacheRead == null || denom === 0 ? null : (b.cacheRead / denom) * 100 };
			});
			const modelRows = aggregateByModel(days);

			// actions
			const refresh = () => setTick(tick + 1);
			const applyInterval = () => {
				const n = parseInt(intervalDraft, 10);
				if (!(n >= 30)) { setNotice('间隔最小 30 秒'); return; }
				fetchJson('/llm-usage-stats/api/set-interval?n=' + n, { method: 'POST' }).then((r) => {
					if (r && r.ok) {
						setNotice('落盘间隔已更新为 ' + r.flushSecs + ' 秒');
						if (status) setStatus({ dir: status.dir, flushSecs: r.flushSecs, lastFlushAt: status.lastFlushAt, lastFlushError: status.lastFlushError, pendingDays: status.pendingDays });
					} else {
						setNotice('设置失败（有效范围 30–86400 秒）');
					}
				}).catch((err) => setNotice(String(err && err.message || err)));
			};
			const doFlushNow = () => {
				fetchJson('/llm-usage-stats/api/flush', { method: 'POST' }).then(() => setNotice('已落盘')).catch((err) => setNotice('落盘失败：' + String(err && err.message || err)));
			};
			const doClear = () => {
				if (!clearArmed) {
					setClearArmed(true);
					setTimeout(() => setClearArmed(false), 4000);
					return;
				}
				setClearArmed(false);
				fetchJson('/llm-usage-stats/api/clear', { method: 'POST' }).then((r) => {
					setRows([]);
					setSeenModels([]);
					setNotice('已清空 ' + (r && r.cleared || 0) + ' 个日志文件与内存统计');
				}).catch((err) => setNotice('清空失败：' + String(err && err.message || err)));
			};

			// toolbar (row1: grain + custom dates; row2: model + refresh)
			const grainButtons = [
				{ key: 'day', text: '天' },
				{ key: 'week', text: '周' },
				{ key: 'month', text: '月' },
				{ key: 'custom', text: '自定义' },
			].map((g) => createElement('button', {
				key: g.key,
				className: grain === g.key ? 'on' : '',
				onClick: () => setGrain(g.key),
			}, g.text));
			const row1 = [createElement('div', { key: 'grain', className: 'lu-grain' }, grainButtons)];
			if (grain === 'custom') {
				row1.push(createElement('input', {
					key: 'from',
					type: 'date',
					value: custom.from,
					onChange: (e) => setCustom({ from: e.target.value, to: custom.to }),
				}));
				row1.push(createElement('input', {
					key: 'to',
					type: 'date',
					value: custom.to,
					onChange: (e) => setCustom({ from: custom.from, to: e.target.value }),
				}));
			}
			const optionElements = [createElement('option', { key: 'all', value: 'all' }, '全部模型')];
			for (const k of optionKeys) {
				const display = (nameMap[k] || k) + (k === defaultKey ? ' · 默认' : '');
				optionElements.push(createElement('option', { key: k, value: k }, display));
			}
			const row2 = [
				createElement('select', {
					key: 'model',
					value: modelKey,
					onChange: (e) => setModelKey(e.target.value),
				}, optionElements),
				createElement('button', { key: 'refresh', className: 'lu-btn', onClick: refresh }, busy ? '加载中…' : '刷新'),
			];
			const bar = createElement('div', { className: 'lu-bar' },
				createElement('div', { className: 'lu-row' }, row1),
				createElement('div', { className: 'lu-row' }, row2));

			// summary cards
			const card = (label, value) => createElement('div', { className: 'lu-card' },
				createElement('div', { className: 't' }, label),
				createElement('div', { className: 'v' }, value));
			const cards = createElement('div', { className: 'lu-cards' },
				card('总输入 tokens（未缓存）', fmt(totals.input)),
				card('缓存读取 tokens', fmt(totals.cacheRead)),
				card('缓存写入 tokens', fmt(totals.cacheWrite)),
				card('总输出 tokens', fmt(totals.output)),
				card('缓存命中率', hitRate == null ? '—' : (hitRate * 100).toFixed(1) + '%'),
				card('请求次数', String(totals.requests)));

			// bar chart panel
			const legendDot = (color, text) => createElement('span', null,
				createElement('i', { className: 'lu-dot', style: { background: color } }), text);
			const legend = createElement('div', { className: 'lu-legend' },
				legendDot('#4f8cff', '输入（未缓存）'),
				legendDot('#f0a63c', '缓存读取'),
				legendDot('#b06fd8', '缓存写入'),
				legendDot('#3fc77d', '输出'));
			const chartPanel = createElement('div', { className: 'lu-panel' },
				createElement('h3', null, 'Token 消耗趋势' + (effectiveGrain === 'month' ? '（按月）' : effectiveGrain === 'week' ? '（按周）' : '（按天）')),
				legend,
				createElement(BarChart, { points: buckets }));

			// hit-rate panel
			const ratePanel = createElement('div', { className: 'lu-panel' },
				createElement('h3', null, '缓存命中率趋势'),
				ratePoints.length > 1
					? createElement(RateChart, { points: ratePoints })
					: createElement('div', { className: 'lu-muted' }, '数据不足，暂无法绘制（缓存字段缺失或样本过少）'));

			// model detail cards
			const field = (label, value) => createElement('span', { className: 'lu-field' },
				createElement('span', { className: 'k' }, label),
				createElement('span', { className: 'v' }, value));
			const modelCards = modelRows.map((m, i) => {
				const denom = m.input + (m.cacheRead == null ? 0 : m.cacheRead) + (m.cacheWrite == null ? 0 : m.cacheWrite);
				const rate = m.cacheRead == null || denom === 0 ? null : m.cacheRead / denom;
				return createElement('div', { key: 'm' + i, className: 'lu-model-card' },
					createElement('div', { className: 'lu-model-name' }, nameMap[m.model] || m.model),
					createElement('div', { className: 'lu-model-fields' },
						field('请求数', String(m.requests)),
						field('输入(未缓存)', fmt(m.input)),
						field('缓存读取', fmt(m.cacheRead)),
						field('缓存写入', fmt(m.cacheWrite)),
						field('输出', fmt(m.output)),
						field('缓存命中率', rate == null ? '—' : (rate * 100).toFixed(1) + '%')));
			});
			const modelsPanel = createElement('div', { className: 'lu-panel' },
				createElement('h3', null, '模型明细'),
				createElement('div', { className: 'lu-models' }, modelCards));

			// footer
			const lastFlushText = status && status.lastFlushAt ? new Date(status.lastFlushAt).toLocaleString() : '尚未落盘';
			const footer = createElement('div', { className: 'lu-panel lu-footer' },
				createElement('div', { className: 'lu-row' },
					createElement('span', null, '数据目录：'),
					createElement('code', { className: 'lu-code' }, (status && status.dir) || '解析中…')),
				createElement('div', { className: 'lu-row' },
					createElement('span', null, '落盘间隔：'),
					createElement('input', {
						value: intervalDraft,
						placeholder: status && status.flushSecs ? String(status.flushSecs) : '300',
						style: { width: 70 },
						onChange: (e) => setIntervalDraft(e.target.value),
					}),
					createElement('span', null, '秒'),
					createElement('button', { className: 'lu-btn', onClick: applyInterval }, '应用'),
					createElement('button', { className: 'lu-btn', onClick: doFlushNow }, '立即落盘'),
					createElement('span', { className: 'lu-muted' }, '上次落盘：' + lastFlushText + (status && status.pendingDays ? ' · 待落盘 ' + status.pendingDays + ' 天' : ''))),
				createElement('div', { className: 'lu-row' },
					createElement('button', { className: 'lu-danger' + (clearArmed ? ' armed' : ''), onClick: doClear }, clearArmed ? '确认清空所有记录？' : '清空所有记录'),
					createElement('span', { className: 'lu-muted' }, '清空后不可恢复；历史记录与内存统计一并清除')));

			// assemble
			const body = [];
			if (error !== null) body.push(createElement('div', { key: 'err', className: 'lu-error' }, '加载失败：' + error));
			if (notice !== null) body.push(createElement('div', { key: 'note', className: 'lu-notice' }, notice));
			if (rows === null) {
				body.push(createElement('div', { key: 'empty', className: 'lu-empty' }, '加载中…'));
			} else if (days.length === 0) {
				body.push(createElement('div', { key: 'empty', className: 'lu-empty' }, '所选范围内暂无用量数据（落盘每 ' + (status && status.flushSecs || 300) + ' 秒一次）'));
			} else {
				body.push(cards);
				body.push(chartPanel);
				body.push(ratePanel);
				body.push(modelsPanel);
			}
			body.push(footer);
			return createElement('div', { className: 'lu-page' }, bar, body);
		}

		// ---------- apply ----------
		function apply(ctx) {
			const slots = ctx.get('slots');
			if (slots === undefined) return;
			slots.inject('settings.section', () => slots.register(
				{ name: 'settings.section', id: 'llm-usage', order: 12, label: '模型用量' },
				() => createElement(UsageView),
			));
		}

		exports.apply = apply;
		exports.inject = [];
		return module.exports;
	}
});
