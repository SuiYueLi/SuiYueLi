import * as jl from "./JieLi.js";
import {readFileAsText} from "./tools.js";

const STORAGE_PREFIX = '';
const DRAFT_KEY = 'jieLi_biji_draft';
const SETTINGS_KEY = 'jieLi_settings';
const _EXCLUDED_KEYS = new Set([DRAFT_KEY, SETTINGS_KEY]);
const MAX_LEN = 3000;
const DEFAULT_ICON = '\u2711';
const IDB_NAME = 'jieLi_biji_idb';
const IDB_STORE = 'handles';
const IDB_KEY = 'fileHandle';

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
				lines.push('### "' + ex + '" `' + (n.icon || DEFAULT_ICON) + ' [' + ts + ' | ' + us + ']`');
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
			if (isNaN(currentSui)) { result.errors.push({ line: ln, reason: '无效的岁值' }); currentSui = null; continue; }
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
			const tsMatch = meta.match(/`\s*(\S)\s*\[\s*(\d+)\s*\|\s*(\d*)\s*\]\s*`/);
			const icon = tsMatch ? tsMatch[1] : DEFAULT_ICON;
			const created = tsMatch ? Number(tsMatch[2]) : _nowMs();
			const updated = tsMatch && tsMatch[3] ? Number(tsMatch[3]) : _nowSec();
			currentNote = { icon, biji: '', created, updated };
			continue;
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

export async function saveFileHandle(handle) {
	const db = await _openIDB();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(IDB_STORE, 'readwrite');
		tx.objectStore(IDB_STORE).put(handle, IDB_KEY);
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
}

export async function getFileHandle() {
	const db = await _openIDB();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(IDB_STORE, 'readonly');
		const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
		req.onsuccess = () => resolve(req.result || null);
		req.onerror = () => reject(req.error);
	});
}

export async function removeFileHandle() {
	const db = await _openIDB();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(IDB_STORE, 'readwrite');
		tx.objectStore(IDB_STORE).delete(IDB_KEY);
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
}

export async function verifyFileHandle() {
	const handle = await getFileHandle();
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

export async function writeCurrentDataToFile() {
	const handle = await getFileHandle();
	if (!handle) return false;
	const ok = await verifyFileHandle();
	if (!ok) return false;
	const allData = {};
	for (let i = 0; i < localStorage.length; i++) {
		const k = localStorage.key(i);
		if (k && k.startsWith(STORAGE_PREFIX) && !_EXCLUDED_KEYS.has(k)) {
			try { allData[k] = JSON.parse(localStorage.getItem(k)); } catch(e) {}
		}
	}
	const json = JSON.stringify(allData, null, 2);
	const writable = await handle.createWritable();
	await writable.write(json);
	await writable.close();
	return true;
}

export async function readDataFromFile() {
	const handle = await getFileHandle();
	if (!handle) return null;
	const ok = await verifyFileHandle();
	if (!ok) return null;
	const file = await handle.getFile();
	const text = await readFileAsText(file);
	return JSON.parse(text);
}

export async function checkPersistence() {
	if (navigator.storage && navigator.storage.persisted) {
		return await navigator.storage.persisted();
	}
	return false;
}

export const BIJI_MAX_LEN = MAX_LEN;
export const BIJI_DEFAULT_ICON = DEFAULT_ICON;
