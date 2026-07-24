import * as jl from "./JieLi.js";
import {readFileAsText} from "./tools.js";

const STORAGE_PREFIX = '';
const DRAFT_KEY = 'jieLi_biji_draft';
const SETTINGS_KEY = 'jieLi_settings';
const _EXCLUDED_KEYS = new Set([DRAFT_KEY, SETTINGS_KEY]);
const MAX_LEN = 8000;
const DEFAULT_ICON = '\u2711';
const IDB_NAME = 'jieLi_biji_idb';
const IDB_STORE = 'handles';
const IDB_KEY = 'fileHandle';
const IDB_KEY_DIR = 'dirHandle';
const BIJI_FILE_CONFIG_KEY = 'jieLi_biji_file_config';
const FILE_PREFIX = '笔记_';
// 分段后缀
const SUFFIX_GU = '_gu';   // 今岁之前
const SUFFIX_JIN = '_jin'; // 今岁
const SUFFIX_LAI = '_lai'; // 今岁之后
const JIN_META_KEY = '__jin__';

function _suiKey(sui) { return STORAGE_PREFIX + sui; }

function _loadSui(sui) {
	try {
		const raw = localStorage.getItem(_suiKey(sui));
		return raw ? JSON.parse(raw) : null;
	} catch(e) { return null; }
}

function _saveSui(sui, data) {
	try {
		localStorage.setItem(_suiKey(sui), JSON.stringify(data));
	} catch(e) {}
}

function _removeSui(sui) {
	try { localStorage.removeItem(_suiKey(sui)); } catch(e) {}
}

function _nowMs() { return Date.now(); }

function _nowSec() { return Math.floor(Date.now() / 1000); }

export function excerpt(text, maxLen) {
	if (!text) return '';
	let nlCount = 0;
	let result = '';
	let lastWasSpace = false;
	for (let i = 0; i < text.length && result.length < (maxLen || 15); i++) {
		const ch = text.charCodeAt(i);
		if (ch === 0x0A || ch === 0x0D) {
			nlCount++;
			if (nlCount >= 2) break;
			if (!lastWasSpace) { result += ' '; lastWasSpace = true; }
			if (ch === 0x0D && text.charCodeAt(i + 1) === 0x0A) i++;
			continue;
		}
		if (ch === 0x09) {
			if (!lastWasSpace) { result += ' '; lastWasSpace = true; }
			continue;
		}
		if (ch === 0x20) {
			if (!lastWasSpace) { result += ' '; lastWasSpace = true; }
			continue;
		}
		if (ch < 0x20 || ch === 0x7F) continue;
		result += text[i];
		lastWasSpace = false;
	}
	return result;
}

export function getDayNotes(sui, hj) {
	const data = _loadSui(sui);
	if (!data) return [];
	const key = String(hj);
	return data[key] || [];
}

export function addNote(sui, hj, biji, icon, created) {
	let data = _loadSui(sui);
	if (!data) data = {};
	const key = String(hj);
	if (!data[key]) data[key] = [];
	data[key].push({
		icon: icon || DEFAULT_ICON,
		biji: biji.slice(0, MAX_LEN),
		created: created || _nowMs(),
		updated: _nowSec()
	});
	_saveSui(sui, data);
	return data[key].length - 1;
}

export function updateNote(sui, hj, idx, biji, icon) {
	let data = _loadSui(sui);
	if (!data) return;
	const key = String(hj);
	const arr = data[key];
	if (!arr || !arr[idx]) return;
	arr[idx].biji = biji.slice(0, MAX_LEN);
	arr[idx].icon = icon || DEFAULT_ICON;
	arr[idx].updated = _nowSec();
	_saveSui(sui, data);
}

export function deleteNote(sui, hj, idx) {
	let data = _loadSui(sui);
	if (!data) return;
	const key = String(hj);
	const arr = data[key];
	if (!arr) return;
	arr.splice(idx, 1);
	if (arr.length === 0) delete data[key];
	_saveSui(sui, data);
}

export function moveNote(sui, hj, fromIdx, toIdx) {
	let data = _loadSui(sui);
	if (!data) return;
	const key = String(hj);
	const arr = data[key];
	if (!arr) return;
	const [item] = arr.splice(fromIdx, 1);
	arr.splice(toIdx, 0, item);
	_saveSui(sui, data);
}

export function getNoteIcon(sui, hj) {
	const notes = getDayNotes(sui, hj);
	return notes.length > 0 ? (notes[0].icon || DEFAULT_ICON) : null;
}

export function saveDraft(hj, idx, icon, biji, created) {
	const draft = { hj, idx: idx ?? null, icon: icon || DEFAULT_ICON, biji: biji.slice(0, MAX_LEN) };
	if (created !== undefined && created !== null) draft.created = created;
	try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch(e) {}
}

export function loadDraft() {
	try {
		const raw = localStorage.getItem(DRAFT_KEY);
		return raw ? JSON.parse(raw) : null;
	} catch(e) { return null; }
}

export function clearDraft() {
	try { localStorage.removeItem(DRAFT_KEY); } catch(e) {}
}

export function hasDraft() {
	return loadDraft() !== null;
}

export function exportAll(startSui, endSui, format) {
	if (format === 'text') return _exportText(startSui, endSui);
	return _exportJson(startSui, endSui);
}

export function exportSelected(selectedKeys, format) {
	if (format === 'text') return _exportSelectedText(selectedKeys);
	return _exportSelectedJson(selectedKeys);
}

function _exportSelectedJson(selectedKeys) {
	const result = {};
	for (const key of selectedKeys) {
		const parts = key.split(':');
		if (parts.length < 3) continue;
		const s = Number(parts[0]); const h = Number(parts[1]); const i = Number(parts[2]);
		if (isNaN(s) || isNaN(h) || isNaN(i)) continue;
		const k = _suiKey(s);
		let data;
		try { data = JSON.parse(localStorage.getItem(k) || '{}'); } catch(e) { continue; }
		if (!data[h] || !data[h][i]) continue;
		if (!result[k]) result[k] = {};
		if (!result[k][h]) result[k][h] = [];
		result[k][h].push(data[h][i]);
	}
	return JSON.stringify(result, null, 2);
}

function _exportSelectedText(selectedKeys) {
	const grouped = new Map();
	for (const key of selectedKeys) {
		const parts = key.split(':');
		if (parts.length < 3) continue;
		const s = Number(parts[0]); const h = Number(parts[1]); const i = Number(parts[2]);
		if (isNaN(s) || isNaN(h) || isNaN(i)) continue;
		const gk = s + ':' + h;
		if (!grouped.has(gk)) grouped.set(gk, { sui: s, hj: h, notes: [] });
		const k = _suiKey(s);
		let data;
		try { data = JSON.parse(localStorage.getItem(k) || '{}'); } catch(e) { continue; }
		if (data[h] && data[h][i]) grouped.get(gk).notes.push(data[h][i]);
	}
	const sortedKeys = [...grouped.keys()].sort((a, b) => {
		const [sa, ha] = a.split(':').map(Number);
		const [sb, hb] = b.split(':').map(Number);
		return sa !== sb ? sa - sb : ha - hb;
	});
	const lines = [];
	let lastSui = null;
	for (const gk of sortedKeys) {
		const { sui, hj, notes } = grouped.get(gk);
		if (sui !== lastSui) {
			lines.push('# ' + sui);
			lastSui = sui;
		}
		const dateStr = _hjToDateStr(hj, sui);
		lines.push('## ' + dateStr);
		for (const n of notes) {
			const ts = n.created ?? '';
			const us = n.updated ?? '';
			const ex = excerpt(n.biji, 15);
			lines.push('### `' + (n.icon || DEFAULT_ICON) + '` ' + ex);
			lines.push('`[' + ts + ' | ' + us + ']`');
			lines.push('');
			lines.push(n.biji || '');
			lines.push('');
		}
	}
	return lines.join('\n');
}

function _exportJson(startSui, endSui) {
	const result = {};
	for (let i = 0; i < localStorage.length; i++) {
		const k = localStorage.key(i);
		if (!k || !k.startsWith(STORAGE_PREFIX) || _EXCLUDED_KEYS.has(k)) continue;
		const suiStr = k.slice(STORAGE_PREFIX.length);
		const sui = parseInt(suiStr);
		if (isNaN(sui)) continue;
		if (startSui !== undefined && sui < startSui) continue;
		if (endSui !== undefined && sui > endSui) continue;
		try { result[k] = JSON.parse(localStorage.getItem(k)); } catch(e) {}
	}
	return JSON.stringify(result, null, 2);
}

function _exportText(startSui, endSui) {
	const lines = [];
	const suis = [];
	for (let i = 0; i < localStorage.length; i++) {
		const k = localStorage.key(i);
		if (!k || !k.startsWith(STORAGE_PREFIX)) continue;
		const suiStr = k.slice(STORAGE_PREFIX.length);
		const sui = parseInt(suiStr);
		if (isNaN(sui)) continue;
		if (startSui !== undefined && sui < startSui) continue;
		if (endSui !== undefined && sui > endSui) continue;
		suis.push({ sui, k });
	}
	suis.sort((a, b) => a.sui - b.sui);
	for (const { sui, k } of suis) {
		let data;
		try { data = JSON.parse(localStorage.getItem(k)); } catch(e) { continue; }
		if (!data) continue;
		lines.push('# ' + sui);
		const dayKeys = Object.keys(data).sort((a, b) => Number(a) - Number(b));
		for (const dk of dayKeys) {
			if (!Array.isArray(data[dk])) continue;
			const dateStr = _hjToDateStr(Number(dk), sui);
			lines.push('## ' + dateStr);
			const arr = data[dk];
			for (const n of arr) {
				const ts = n.created ?? '';
				const us = n.updated ?? '';
				const ex = excerpt(n.biji, 15);
				lines.push('### `' + (n.icon || DEFAULT_ICON) + '` ' + ex);
				lines.push('`[' + ts + ' | ' + us + ']`');
				lines.push('');
				lines.push(n.biji || '');
				lines.push('');
			}
		}
		lines.push('');
	}
	return lines.join('\n');
}

function _hjToDateStr(hj, sui) {
	let sjr = { S: sui, J: 1, R: 1 };
	try {
		const r = jl.HJvSJRSh(hj, 0).SJR;
		if (r) sjr = r;
	} catch(e) {}
	return sjr.S + '-' + String(sjr.J).padStart(2, '0') + '-' + String(sjr.R).padStart(2, '0');
}

export function importAll(jsonStr, mode, dayOrder) {
	let incoming;
	try { incoming = JSON.parse(jsonStr); } catch(e) { return false; }
	const keys = Object.keys(incoming);
	for (const k of keys) {
		if (!k.startsWith(STORAGE_PREFIX)) continue;
		const existing = localStorage.getItem(k);
		if (existing) {
			let existData, inData;
			try { existData = JSON.parse(existing); } catch(e) { existData = {}; }
			try { inData = JSON.parse(JSON.stringify(incoming[k])); } catch(e) { continue; }
			if (mode === 'replace') {
				try { localStorage.setItem(k, JSON.stringify(inData)); } catch(e) {}
			} else {
				for (const dk of Object.keys(existData)) {
					if (!inData[dk]) {
						inData[dk] = existData[dk];
					} else if (dayOrder === 'importFirst') {
						inData[dk] = inData[dk].concat(existData[dk]);
					} else {
						inData[dk] = existData[dk].concat(inData[dk]);
					}
				}
				try { localStorage.setItem(k, JSON.stringify(inData)); } catch(e) {}
			}
		} else {
			try { localStorage.setItem(k, JSON.stringify(incoming[k])); } catch(e) {}
		}
	}
	return true;
}

export function parseTextImport(text) {
	const result = { errors: [], data: {}, conflicts: [] };
	const lines = text.split('\n');
	let currentSui = null;
	let currentDayKey = null;
	let currentNote = null;

	function _flushNote() {
		if (!currentNote || currentSui === null || currentDayKey === null) return;
		delete currentNote._tsParsed;
		const sk = _suiKey(currentSui);
		if (!result.data[sk]) result.data[sk] = {};
		if (!result.data[sk][currentDayKey]) result.data[sk][currentDayKey] = [];
		result.data[sk][currentDayKey].push(currentNote);
		currentNote = null;
	}

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const ln = i + 1;

		if (line.startsWith('# ') && !line.startsWith('## ') && !line.startsWith('### ')) {
			_flushNote();
			currentSui = parseInt(line.slice(2).trim());
			if (isNaN(currentSui)) { result.errors.push({ line: ln, reason: '无效的纪年数' }); currentSui = null; continue; }
			currentDayKey = null;
			if (!result.data[_suiKey(currentSui)]) result.data[_suiKey(currentSui)] = {};
			continue;
		}
		if (line.startsWith('## ')) {
			_flushNote();
			if (!currentSui) { result.errors.push({ line: ln, reason: '缺少岁标题行' }); continue; }
			const datePart = line.slice(3).split('(')[0].trim();
			const parts = datePart.split('-').map(p => parseInt(p.trim()));
			if (parts.length !== 3 || parts.some(isNaN)) { result.errors.push({ line: ln, reason: '无效日期格式' }); continue; }
			const hj = _datePartsToHJ(parts[0], parts[1], parts[2], currentSui);
			if (hj === null) { result.errors.push({ line: ln, reason: '无法转换为积日' }); continue; }
			currentDayKey = String(hj);
			continue;
		}
		if (line.startsWith('### ')) {
			_flushNote();
			if (!currentSui || currentDayKey === null) { result.errors.push({ line: ln, reason: '缺少日期标题行' }); continue; }
			const meta = line.slice(4);
			// 新格式：### `icon` excerpt
			const newMatch = meta.match(/^`(\S)`\s*(.*)/);
			if (newMatch) {
				currentNote = { icon: newMatch[1], biji: '', created: _nowMs(), updated: _nowSec() };
				continue;
			}
			// 旧格式：### "excerpt" `icon [created | updated]`
			const tsMatch = meta.match(/"`\s*(\S)\s*\[\s*(\d+)\s*\|\s*(\d*)\s*\]\s*`/);
			const icon = tsMatch ? tsMatch[1] : DEFAULT_ICON;
			const created = tsMatch ? Number(tsMatch[2]) : _nowMs();
			const updated = tsMatch && tsMatch[3] ? Number(tsMatch[3]) : _nowSec();
			currentNote = { icon, biji: '', created, updated };
			continue;
		}
		// 新格式第二行：`[created | updated]`
		if (currentNote && !currentNote._tsParsed && line.startsWith('`[') && line.endsWith('`]`')) {
			const tsMatch = line.match(/^`\[\s*(\d+)\s*\|\s*(\d*)\s*\]`$/);
			if (tsMatch) {
				currentNote.created = Number(tsMatch[1]);
				currentNote.updated = tsMatch[2] ? Number(tsMatch[2]) : _nowSec();
				currentNote._tsParsed = true;
				continue;
			}
		}
		if (currentNote && currentSui && currentDayKey !== null) {
			currentNote.biji += (currentNote.biji ? '\n' : '') + line;
			continue;
		}
	}

	_flushNote();

	for (const sk of Object.keys(result.data)) {
		const existing = localStorage.getItem(sk);
		if (existing) {
			let existData;
			try { existData = JSON.parse(existing); } catch(e) { continue; }
			for (const dk of Object.keys(result.data[sk])) {
				if (existData[dk] && Array.isArray(existData[dk])) {
					const existCreatedSet = new Set(existData[dk].map(n => n.created));
					for (const inNote of result.data[sk][dk]) {
						if (existCreatedSet.has(inNote.created)) {
							result.conflicts.push({
								sui: parseInt(sk.slice(STORAGE_PREFIX.length)),
								dayKey: dk,
								existNote: existData[dk].find(n => n.created === inNote.created),
								importNote: inNote
							});
						}
					}
				}
			}
		}
	}

	return result;
}

function _datePartsToHJ(y, m, d, sui) {
	try {
		const hj = jl.SJRvHJ(y, m, d, 1);
		return hj;
	} catch(e) {
		return null;
	}
}

export function applyTextImport(parsed, resolutions) {
	const conflictImportKeys = new Set();
	for (const res of resolutions) {
		conflictImportKeys.add(res.sui + ':' + res.dayKey + ':' + res.importNote.created);
	}

	for (const sk of Object.keys(parsed.data)) {
		const sui = parseInt(sk.slice(STORAGE_PREFIX.length));
		const existing = localStorage.getItem(sk);
		let existData;
		try { existData = existing ? JSON.parse(existing) : {}; } catch(e) { existData = {}; }
		const inData = parsed.data[sk];

		for (const dk of Object.keys(inData)) {
			if (!Array.isArray(inData[dk])) continue;
			if (!existData[dk]) existData[dk] = [];
			for (const inNote of inData[dk]) {
				if (!conflictImportKeys.has(sui + ':' + dk + ':' + inNote.created)) {
					existData[dk].push(inNote);
				}
			}
		}

		try { localStorage.setItem(sk, JSON.stringify(existData)); } catch(e) {}
	}

	for (const res of resolutions) {
		const { action, importNote, sui, dayKey } = res;
		if (action === 'keepExist') continue;
		const sk = _suiKey(sui);
		let data;
		try { data = JSON.parse(localStorage.getItem(sk)); } catch(e) { continue; }
		if (!data) continue;
		if (!data[dayKey]) data[dayKey] = [];

		if (action === 'keepImport') {
			const existIdx = data[dayKey].findIndex(n => n.created === importNote.created);
			if (existIdx >= 0) {
				data[dayKey][existIdx] = { icon: importNote.icon, biji: importNote.biji, created: importNote.created, updated: importNote.updated };
			} else {
				data[dayKey].push({ icon: importNote.icon, biji: importNote.biji, created: importNote.created, updated: importNote.updated });
			}
		} else if (action === 'keepUpdated') {
			const existIdx = data[dayKey].findIndex(n => n.created === importNote.created);
			if (existIdx >= 0) {
				if ((importNote.updated || 0) > (data[dayKey][existIdx].updated || 0)) {
					data[dayKey][existIdx] = { icon: importNote.icon, biji: importNote.biji, created: importNote.created, updated: importNote.updated };
				}
			} else {
				data[dayKey].push({ icon: importNote.icon, biji: importNote.biji, created: importNote.created, updated: importNote.updated });
			}
		} else if (action === 'reassignId') {
			const usedIds = new Set(data[dayKey].map(n => n.created));
			let newId = importNote.created;
			while (usedIds.has(newId)) newId++;
			data[dayKey].push({ icon: importNote.icon, biji: importNote.biji, created: newId, updated: importNote.updated });
		}

		if (data[dayKey].length === 0) delete data[dayKey];
		try { localStorage.setItem(sk, JSON.stringify(data)); } catch(e) {}
	}
}

function _openIDB() {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(IDB_NAME, 1);
		req.onupgradeneeded = () => {
			const db = req.result;
			if (!db.objectStoreNames.contains(IDB_STORE)) {
				db.createObjectStore(IDB_STORE);
			}
		};
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

export async function checkPersistence() {
	if (navigator.storage && navigator.storage.persisted) {
		return await navigator.storage.persisted();
	}
	return false;
}

// ========== 本地存储文件夹（目录句柄） ==========
export async function saveDirHandle(handle) {
	const db = await _openIDB();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(IDB_STORE, 'readwrite');
		tx.objectStore(IDB_STORE).put(handle, IDB_KEY_DIR);
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
}

export async function getDirHandle() {
	const db = await _openIDB();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(IDB_STORE, 'readonly');
		const req = tx.objectStore(IDB_STORE).get(IDB_KEY_DIR);
		req.onsuccess = () => resolve(req.result || null);
		req.onerror = () => reject(req.error);
	});
}

export async function removeDirHandle() {
	const db = await _openIDB();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(IDB_STORE, 'readwrite');
		tx.objectStore(IDB_STORE).delete(IDB_KEY_DIR);
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
}

export async function verifyDirHandle() {
	const handle = await getDirHandle();
	if (!handle) return false;
	try {
		const perm = await handle.queryPermission({ mode: 'readwrite' });
		if (perm === 'granted') return true;
		const req = await handle.requestPermission({ mode: 'readwrite' });
		return req === 'granted';
	} catch(e) {
		return false;
	}
}

// ========== 笔记文件配置（启用标志 + 分割节点） ==========
export function getBijiFileConfig() {
	try {
		const raw = localStorage.getItem(BIJI_FILE_CONFIG_KEY);
		if (!raw) return { enabled: false, splitNodes: [] };
		const cfg = JSON.parse(raw);
		return {
			enabled: !!cfg.enabled,
			splitNodes: Array.isArray(cfg.splitNodes) ? cfg.splitNodes.filter(n => Number.isFinite(n)).map(n => Math.trunc(n)) : []
		};
	} catch(e) {
		return { enabled: false, splitNodes: [] };
	}
}

export function setBijiFileConfig(cfg) {
	const cur = getBijiFileConfig();
	const next = {
		enabled: (cfg && typeof cfg.enabled === 'boolean') ? cfg.enabled : cur.enabled,
		splitNodes: (cfg && Array.isArray(cfg.splitNodes))
			? cfg.splitNodes.filter(n => Number.isFinite(n)).map(n => Math.trunc(n))
			: cur.splitNodes
	};
	try { localStorage.setItem(BIJI_FILE_CONFIG_KEY, JSON.stringify(next)); } catch(e) {}
	return next;
}

export function clearBijiFileConfig() {
	try { localStorage.removeItem(BIJI_FILE_CONFIG_KEY); } catch(e) {}
}

// ========== 分段计算 ==========
// 给定今岁 jin 和用户节点列表 nodes，返回有序分段数组。
// 每段 { suffix, start, end }，start/end 为纪年数（含端点），-Infinity/+Infinity 表示开区间。
// 规则：jin 单独成段 (_jin)；jin 之前合并为 _gu；jin 之后合并为 _lai；
// 用户节点 N 在 jin 之前/之后时，对应段后缀为 _N。
export function computeSegments(jin, nodes) {
	const cleanNodes = Array.from(new Set((nodes || []).filter(n => Number.isFinite(n)).map(n => Math.trunc(n)))).sort((a, b) => a - b);
	const before = cleanNodes.filter(n => n < jin);
	const after = cleanNodes.filter(n => n > jin);
	const segments = [];
	// _gu 段：从 -∞ 到 jin-1，内部按节点切分
	const guBounds = before.length ? before : null;
	if (guBounds && guBounds.length > 0) {
		// _gu 自身只覆盖 -∞ 到 guBounds[0]-1；其余按节点切分
		segments.push({ suffix: SUFFIX_GU, start: -Infinity, end: guBounds[0] - 1 });
		for (let i = 0; i < guBounds.length; i++) {
			const start = guBounds[i];
			const end = (i + 1 < guBounds.length) ? guBounds[i + 1] - 1 : jin - 1;
			segments.push({ suffix: '_' + start, start, end });
		}
	} else {
		segments.push({ suffix: SUFFIX_GU, start: -Infinity, end: jin - 1 });
	}
	// _jin 段
	segments.push({ suffix: SUFFIX_JIN, start: jin, end: jin });
	// _lai 段及之后节点
	const laiBounds = after;
	if (laiBounds.length > 0) {
		// jin+1 到 laiBounds[0]-1 归为 _lai
		segments.push({ suffix: SUFFIX_LAI, start: jin + 1, end: laiBounds[0] - 1 });
		for (let i = 0; i < laiBounds.length; i++) {
			const start = laiBounds[i];
			const end = (i + 1 < laiBounds.length) ? laiBounds[i + 1] - 1 : +Infinity;
			segments.push({ suffix: '_' + start, start, end });
		}
	} else {
		segments.push({ suffix: SUFFIX_LAI, start: jin + 1, end: +Infinity });
	}
	return segments;
}

function findSegmentForSui(sui, jin, nodes) {
	const segs = computeSegments(jin, nodes);
	for (const s of segs) {
		if (sui >= s.start && sui <= s.end) return s;
	}
	// 兜底
	return segs[segs.length - 1];
}

// ========== 文件名/路径 ==========
function _fmtPoint(v, jin) {
	if (v === -Infinity) return '远古';
	if (v === +Infinity) return '未来';
	if (v === jin) return '今岁(' + jin + ')';
	return String(v);
}

function _segLabel(seg, jin) {
	const s = _fmtPoint(seg.start, jin);
	const e = _fmtPoint(seg.end, jin);
	return s === e ? s : s + '~' + e;
}

function _bijiFileName(seg, jin) {
	return FILE_PREFIX + _segLabel(seg, jin) + '.json';
}

// 在目录句柄下原子写入单个分段文件（所有文件均存 jin 元数据）
async function _writeSegmentFile(dirHandle, seg, jin, dataObj) {
	const ok = await verifyDirHandle();
	if (!ok) return false;
	const payload = { ...dataObj };
	payload[JIN_META_KEY] = jin;
	const json = JSON.stringify(payload, null, 2);
	const fileHandle = await dirHandle.getFileHandle(_bijiFileName(seg, jin), { create: true });
	const writable = await fileHandle.createWritable();
	await writable.write(json);
	await writable.close();
	return true;
}

async function _readSegmentFile(dirHandle, fileName) {
	try {
		const fileHandle = await dirHandle.getFileHandle(fileName, { create: false });
		const file = await fileHandle.getFile();
		const text = await readFileAsText(file);
		if (!text || !text.trim()) return null;
		return JSON.parse(text);
	} catch(e) {
		return null;
	}
}

async function _removeSegmentFile(dirHandle, fileName) {
	try {
		await dirHandle.removeEntry(fileName);
		return true;
	} catch(e) {
		return false;
	}
}

// 列出目录中所有属于笔记的分段文件名
export async function listBijiFiles() {
	const dirHandle = await getDirHandle();
	if (!dirHandle) return [];
	const result = [];
	try {
		for await (const entry of dirHandle.values()) {
			if (entry.kind !== 'file') continue;
			if (!entry.name.startsWith(FILE_PREFIX) || !entry.name.endsWith('.json')) continue;
			result.push(entry.name);
		}
	} catch(e) {}
	return result;
}

// ========== 原子写入（按岁区间） ==========
// 收集 localStorage 中落在 [start, end] 范围内的笔记数据
function _collectSuiRange(start, end) {
	const out = {};
	for (let i = 0; i < localStorage.length; i++) {
		const k = localStorage.key(i);
		if (!k || !k.startsWith(STORAGE_PREFIX) || _EXCLUDED_KEYS.has(k) || k === BIJI_FILE_CONFIG_KEY) continue;
		const sui = parseInt(k.slice(STORAGE_PREFIX.length));
		if (isNaN(sui)) continue;
		if (sui < start || sui > end) continue;
		try { out[k] = JSON.parse(localStorage.getItem(k)); } catch(e) {}
	}
	return out;
}

// 全量收集所有笔记数据
function _collectAllSui() {
	const out = {};
	for (let i = 0; i < localStorage.length; i++) {
		const k = localStorage.key(i);
		if (!k || !k.startsWith(STORAGE_PREFIX) || _EXCLUDED_KEYS.has(k) || k === BIJI_FILE_CONFIG_KEY) continue;
		const sui = parseInt(k.slice(STORAGE_PREFIX.length));
		if (isNaN(sui)) continue;
		try { out[k] = JSON.parse(localStorage.getItem(k)); } catch(e) {}
	}
	return out;
}

// 全量重写所有分段文件（按当前 jin 与节点配置）；空段落不创建文件
export async function rewriteAllSegmentFiles(jin) {
	const dirHandle = await getDirHandle();
	if (!dirHandle) return false;
	const ok = await verifyDirHandle();
	if (!ok) return false;
	const cfg = getBijiFileConfig();
	const segments = computeSegments(jin, cfg.splitNodes);
	const allData = _collectAllSui();
	const oldFiles = await listBijiFiles();
	const newFileNames = [];
	for (const s of segments) {
		const rangeData = {};
		for (const k of Object.keys(allData)) {
			const sui = parseInt(k.slice(STORAGE_PREFIX.length));
			if (sui >= s.start && sui <= s.end) {
				rangeData[k] = allData[k];
			}
		}
		if (Object.keys(rangeData).length === 0) continue;
		const fn = _bijiFileName(s, jin);
		newFileNames.push(fn);
		const written = await _writeSegmentFile(dirHandle, s, jin, rangeData);
		if (!written) return false;
	}
	// 删除多余旧文件
	for (const old of oldFiles) {
		if (!newFileNames.includes(old)) {
			await _removeSegmentFile(dirHandle, old);
		}
	}
	return true;
}

// 保存动作：先检查文件中的今岁一致性，再决定写入范围；空段落不创建文件
export async function writeNoteToFiles(sui, jin) {
	const dirHandle = await getDirHandle();
	if (!dirHandle) return { ok: false, reason: 'noDir' };
	const ok = await verifyDirHandle();
	if (!ok) return { ok: false, reason: 'noPerm' };
	const cfg = getBijiFileConfig();
	const oldFiles = await listBijiFiles();
	// 1. 读取所有文件，检查 jin 一致性
	let fileJin = undefined;
	const allFileData = {};
	for (const fn of oldFiles) {
		const data = await _readSegmentFile(dirHandle, fn);
		if (!data) continue;
		if (fileJin === undefined && data[JIN_META_KEY] !== undefined && data[JIN_META_KEY] !== null) {
			fileJin = data[JIN_META_KEY];
		}
		for (const k of Object.keys(data)) {
			if (k === JIN_META_KEY) continue;
			if (!k.startsWith(STORAGE_PREFIX) || _EXCLUDED_KEYS.has(k) || k === BIJI_FILE_CONFIG_KEY) continue;
			if (allFileData[k] === undefined) allFileData[k] = data[k];
		}
	}
	const jinConsistent = (fileJin === undefined || fileJin === null || fileJin === jin);
	if (!jinConsistent) {
		// 今岁变化：将文件数据合并到 localStorage，再全量重写
		for (const k of Object.keys(allFileData)) {
			if (localStorage.getItem(k) === null) {
				try { localStorage.setItem(k, JSON.stringify(allFileData[k])); } catch(e) {}
			}
		}
		const result = await rewriteAllSegmentFiles(jin);
		return result ? { ok: true, scope: 'all' } : { ok: false, reason: 'writeFail', scope: 'all' };
	}
	// 2. 一致：仅覆盖该条笔记所在区间的文件
	const seg = findSegmentForSui(sui, jin, cfg.splitNodes);
	const rangeData = _collectSuiRange(seg.start, seg.end);
	const fn = _bijiFileName(seg, jin);
	if (Object.keys(rangeData).length === 0) {
		// 空段落：删除已有文件（如果存在）
		if (oldFiles.includes(fn)) await _removeSegmentFile(dirHandle, fn);
		return { ok: true, scope: 'segment', suffix: seg.suffix };
	}
	const written = await _writeSegmentFile(dirHandle, seg, jin, rangeData);
	if (!written) return { ok: false, reason: 'writeFail', scope: 'segment' };
	return { ok: true, scope: 'segment', suffix: seg.suffix };
}

// ========== 清空应用内笔记 ==========
// 清空 localStorage 中所有笔记数据（保留 settings、draft、字体配置等）
export function clearAllBijiInStorage() {
	const keysToRemove = [];
	for (let i = 0; i < localStorage.length; i++) {
		const k = localStorage.key(i);
		if (!k) continue;
		if (!k.startsWith(STORAGE_PREFIX)) continue;
		if (_EXCLUDED_KEYS.has(k) || k === BIJI_FILE_CONFIG_KEY) continue;
		const sui = parseInt(k.slice(STORAGE_PREFIX.length));
		if (isNaN(sui)) continue;
		keysToRemove.push(k);
	}
	for (const k of keysToRemove) {
		try { localStorage.removeItem(k); } catch(e) {}
	}
	return keysToRemove.length;
}

// 强制解除本地保存（不解除文件夹句柄）：
// 仅清除笔记文件配置，让"本地同步保存笔记"按钮回到未指定状态
export function unlinkBijiFileSync() {
	clearBijiFileConfig();
}

// ========== 多文件导入：从目录读取所有分段文件并合并 ==========
export async function readAllSegmentFiles() {
	const dirHandle = await getDirHandle();
	if (!dirHandle) return null;
	const ok = await verifyDirHandle();
	if (!ok) return null;
	const files = await listBijiFiles();
	const merged = {};
	let fileJin = null;
	for (const fn of files) {
		const data = await _readSegmentFile(dirHandle, fn);
		if (!data) continue;
		if (data[JIN_META_KEY] !== undefined && data[JIN_META_KEY] !== null) fileJin = data[JIN_META_KEY];
		for (const k of Object.keys(data)) {
			if (k === JIN_META_KEY) continue;
			if (!k.startsWith(STORAGE_PREFIX) || _EXCLUDED_KEYS.has(k) || k === BIJI_FILE_CONFIG_KEY) continue;
			const sui = parseInt(k.slice(STORAGE_PREFIX.length));
			if (isNaN(sui)) continue;
			if (merged[k] === undefined) merged[k] = data[k];
		}
	}
	return { data: merged, jin: fileJin, files };
}

export const BIJI_MAX_LEN = MAX_LEN;
export const BIJI_DEFAULT_ICON = DEFAULT_ICON;
