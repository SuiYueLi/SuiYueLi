import {ShiKe} from "./assets/LiShi.js";
import _defaultJieSu from "./assets/JieSu.js";
import _defaultFuRi from "./assets/FuRi.js";
import {readFileAsArrayBuffer} from "./scripts/tools.js";

// ========== 设置管理模块 ==========

const STORAGE_KEY = 'jieLi_settings';

// 默认设置
const DEFAULT_SETTINGS = {
	weekdayType: 'shu',
	weekStart: 1,
	themeMode: 'auto',
	palette: 'jade',
	customPalettes: [],
	vliBZh: 'UTC8',
	customVLIs: [],
	activeVLI: 'UTC8',
	bgImageData: null,
	bgBlur: 1,
	cellShadow: true,
	zuoRotateHanzi: false,
	customJieSu: null,
	customFuRi: null,
	updateCheckInterval: 7,
	lastUpdateCheck: 1944000,
	autoUpdateFailCount: 0,
	autoUpdateIgnoredVersion: null,
	lastAutoUpdateFailTime: 0,
	customFonts: {},
};

let settings = {...DEFAULT_SETTINGS};

// ========== 初始化 ==========
export function initConfig() {
	_loadSettings();
	_applyTheme();
	_applyBackground();
	_applyCellShadow();
	window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
		if (settings.themeMode === 'auto') _applyTheme();
	});
}

function _loadSettings() {
	try {
		const saved = localStorage.getItem(STORAGE_KEY);
		if (saved) {
			settings = {...DEFAULT_SETTINGS, ...JSON.parse(saved)};
			if (settings.customVLI && !settings.customVLIs?.length) {
				settings.customVLIs = [{id: 'cv1', Cha: settings.customVLI.Cha, Ming: settings.customVLI.Ming}];
				settings.activeVLI = 'cv1';
			}
			delete settings.customVLI;
			if (!settings.activeVLI) settings.activeVLI = settings.vliBZh || 'UTC8';
		}
	} catch(e) {}
}

function _saveSettings() {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
	} catch(e) {}
}

// ========== 主题 ==========
function getThemeMode() { return settings.themeMode; }
function getPalette() { return settings.palette; }

export function setThemeMode(mode) {
	settings.themeMode = mode;
	_saveSettings();
	_applyTheme();
}

export function setPalette(palette) {
	settings.palette = palette;
	_saveSettings();
	_applyTheme();
}

function _applyTheme() {
	let mode = settings.themeMode;
	if (mode === 'auto') {
		mode = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
	}
	document.body.setAttribute('data-theme', mode);
	const custom = _findCustomPalette(settings.palette);
	if (custom) {
		const hsl = _hexToHsl(custom.hex);
		document.body.style.setProperty('--accent-h', hsl.h);
		document.body.style.setProperty('--accent-s', hsl.s + '%');
		document.body.style.setProperty('--accent-l', hsl.l + '%');
		document.body.setAttribute('data-palette', 'custom');
	} else {
		document.body.style.removeProperty('--accent-h');
		document.body.style.removeProperty('--accent-s');
		document.body.style.removeProperty('--accent-l');
		document.body.setAttribute('data-palette', settings.palette);
	}
	const meta = document.querySelector('meta[name="theme-color"]');
	if (meta) {
		meta.content = mode === 'dark' ? '#1A1A1E' : '#FAFAF8';
	}
}

function _hexToHsl(hex) {
	hex = hex.replace('#', '');
	if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
	const r = parseInt(hex.substring(0,2), 16) / 255;
	const g = parseInt(hex.substring(2,4), 16) / 255;
	const b = parseInt(hex.substring(4,6), 16) / 255;
	const max = Math.max(r, g, b), min = Math.min(r, g, b);
	let h, s, l = (max + min) / 2;
	if (max === min) {
		h = s = 0;
	} else {
		const d = max - min;
		s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
		switch (max) {
			case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
			case g: h = ((b - r) / d + 2) / 6; break;
			case b: h = ((r - g) / d + 4) / 6; break;
		}
	}
	return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function _findCustomPalette(paletteId) {
	if (!settings.customPalettes) return null;
	return settings.customPalettes.find(p => p.id === paletteId) || null;
}

function _getNextCustomId() {
	if (!settings.customPalettes || settings.customPalettes.length === 0) return 'c1';
	const maxNum = settings.customPalettes.reduce((max, p) => {
		const num = parseInt(p.id.replace('c', ''), 10) || 0;
		return num > max ? num : max;
	}, 0);
	return 'c' + (maxNum + 1);
}

export function addCustomPalette(name, hex) {
	if (!settings.customPalettes) settings.customPalettes = [];
	const id = _getNextCustomId();
	const palette = { id, name: name || '自定义', hex };
	settings.customPalettes.push(palette);
	settings.palette = id;
	_saveSettings();
	_applyTheme();
	return palette;
}

export function removeCustomPalette(id) {
	if (!settings.customPalettes) return;
	settings.customPalettes = settings.customPalettes.filter(p => p.id !== id);
	if (settings.palette === id) {
		settings.palette = 'vermillion';
	}
	_saveSettings();
	_applyTheme();
}

export function updateCustomPalette(id, name, hex) {
	if (!settings.customPalettes) return;
	const cp = settings.customPalettes.find(p => p.id === id);
	if (!cp) return;
	cp.name = name || '自定义';
	cp.hex = hex;
	_saveSettings();
	_applyTheme();
}

export function getCustomPalettes() {
	return settings.customPalettes || [];
}

// ========== 星期名 ==========
const WEEKDAY_NAMES = {
	yao: ['日','月','火','水','木','金','土'],
	shu: ['日','一','二','三','四','五','六'],
};

function getWeekdayType() { return settings.weekdayType; }

export function setWeekdayType(type) {
	settings.weekdayType = type;
	_saveSettings();
}

export function getWeekdayNames() {
	return WEEKDAY_NAMES[settings.weekdayType] || WEEKDAY_NAMES.shu;
}

export function getWeekStart() { return settings.weekStart; }

export function setWeekStart(val) {
	settings.weekStart = val ? 1 : 0;
	_saveSettings();
}

// 获取格式化的星期名
export function formatWeekdayName(mod7) {
	// mod7: SBiao索引取模7的值 (0-6, 0=周日)
	const names = getWeekdayNames();
	if (settings.weekdayType === 'yao') {
		return names[mod7] + '曜日';
	}
	return '星期' + names[mod7];
}

// ========== VLI ==========
// 导出qu_VLI模块，为SuiPu()提供当前VLI设定值
export function qu_VLI() {
	let active = settings.activeVLI || settings.vliBZh;
	const custom = (settings.customVLIs || []).find(v => v.id === active);
	if (custom) {
		return { Cha: custom.Cha, Ming: custom.Ming, _custom: true, _id: custom.id };
	}
	if (active !== settings.vliBZh) active = settings.vliBZh;
	const vli = yu_VLI(active);
	return { ...vli, _bZh: active, _custom: false };
}

export function setVLI(bZh) {
	settings.activeVLI = bZh;
	const customs = settings.customVLIs || [];
	if (!customs.some(c => c.id === bZh)) {
		settings.vliBZh = bZh;
	}
	_saveSettings();
}

export function addCustomVLI(cha, ming) {
	if (!settings.customVLIs) settings.customVLIs = [];
	const id = _getNextCustomVLIId();
	const n = settings.customVLIs.length + 1;
	const vli = { id, Cha: cha, Ming: ming || ('自定义 ' + n) };
	settings.customVLIs.push(vli);
	settings.activeVLI = id;
	_saveSettings();
	return vli;
}

export function removeCustomVLI(id) {
	if (!settings.customVLIs) return;
	settings.customVLIs = settings.customVLIs.filter(v => v.id !== id);
	if (settings.activeVLI === id) {
		settings.activeVLI = settings.vliBZh || 'UTC8';
	}
	_saveSettings();
}

export function getCustomVLIs() {
	return settings.customVLIs || [];
}

function _getNextCustomVLIId() {
	if (!settings.customVLIs || settings.customVLIs.length === 0) return 'cv1';
	const maxNum = settings.customVLIs.reduce((max, v) => {
		const num = parseInt(v.id.replace('cv', ''), 10) || 0;
		return num > max ? num : max;
	}, 0);
	return 'cv' + (maxNum + 1);
}

// VLI预设值
export function yu_VLI(BZh = "UTC8") {
	return {
		Ming: ShiKe.Ming[BZh],
		Cha: ShiKe.Cha[BZh]
	};
}

// 获取VLI预设列表
export function getVLIPresets() {
	const presets = [];
	if (ShiKe && ShiKe.Ming && ShiKe.Cha) {
		for (const key of Object.keys(ShiKe.Ming)) {
			presets.push({ BZh: key, Ming: ShiKe.Ming[key], Cha: ShiKe.Cha[key] });
		}
	}
	return presets;
}

// ========== 背景图片 ==========
function getBgImageData() { return settings.bgImageData; }
function getBgBlur() { return settings.bgBlur; }

export function setBgBlur(val) {
	settings.bgBlur = parseFloat(val) || 0;
	_saveSettings();
	_applyBackground();
}

export function getCellShadow() { return settings.cellShadow; }

export function setCellShadow(val) {
	settings.cellShadow = val;
	_saveSettings();
	_applyCellShadow();
}

function _applyCellShadow() {
	document.body.setAttribute('data-cell-shadow', settings.cellShadow ? 'on' : 'off');
}

export function getZuoRotateHanzi() { return settings.zuoRotateHanzi; }

export function setZuoRotateHanzi(val) {
	settings.zuoRotateHanzi = val;
	_saveSettings();
}

export function setBgImageData(base64Data) {
	settings.bgImageData = base64Data;
	_saveSettings();
	_applyBackground();
}

export function removeBgImage() {
	settings.bgImageData = null;
	_saveSettings();
	_applyBackground();
}

function _applyBackground() {
	const layer = document.getElementById('bgImageLayer');
	const img = document.getElementById('bgImage');
	if (!layer || !img) return;
	if (settings.bgImageData) {
		img.src = settings.bgImageData;
		img.style.filter = settings.bgBlur ? ('blur(' + settings.bgBlur + 'px)') : '';
		layer.style.display = '';
	} else {
		layer.style.display = 'none';
		img.src = '';
	}
}

// ========== 获取所有设置 ==========
export function getAllSettings() {
	return {...settings};
}

// ========== 节庆民俗/每年重复日 列表管理 ==========
export function getJieSu() {
	return settings.customJieSu || _defaultJieSu;
}

export function setJieSu(data) {
	settings.customJieSu = data;
	_saveSettings();
}

export function getFuRi() {
	return settings.customFuRi || _defaultFuRi;
}

export function setFuRi(data) {
	settings.customFuRi = data;
	_saveSettings();
}

// ========== 更新检查 ==========
export function getUpdateCheckInterval() { return settings.updateCheckInterval; }

export function setUpdateCheckInterval(val) {
	settings.updateCheckInterval = val;
	_saveSettings();
}

export function getLastUpdateCheck() { return settings.lastUpdateCheck; }

export function setLastUpdateCheck(val) {
	settings.lastUpdateCheck = val;
	_saveSettings();
}

export function getAutoUpdateFailCount() { return settings.autoUpdateFailCount; }
export function setAutoUpdateFailCount(val) {
	settings.autoUpdateFailCount = val;
	_saveSettings();
}
export function getAutoUpdateIgnoredVersion() { return settings.autoUpdateIgnoredVersion; }
export function setAutoUpdateIgnoredVersion(val) {
	settings.autoUpdateIgnoredVersion = val;
	_saveSettings();
}
export function getLastAutoUpdateFailTime() { return settings.lastAutoUpdateFailTime; }
export function setLastAutoUpdateFailTime(val) {
	settings.lastAutoUpdateFailTime = val;
	_saveSettings();
}

// ========== 自定义字体 ==========
const FONT_CSS_VARS = ['--font-Base', '--font-SuiJie', '--font-Hao', '--font-Ri', '--font-XiangQing', '--font-BiJi'];
const FONT_DB_NAME = 'JieLi_FontDB';
const FONT_DB_VERSION = 1;
const FONT_STORE = 'fonts';
let _fontDB = null;

async function _openFontDB() {
	if (_fontDB) return _fontDB;
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(FONT_DB_NAME, FONT_DB_VERSION);
		req.onupgradeneeded = (e) => {
			const db = e.target.result;
			if (!db.objectStoreNames.contains(FONT_STORE)) {
				db.createObjectStore(FONT_STORE, { keyPath: 'name' });
			}
		};
		req.onsuccess = (e) => {
			_fontDB = e.target.result;
			resolve(_fontDB);
		};
		req.onerror = () => reject(req.error);
	});
}

export function getCustomFonts() {
	return settings.customFonts || {};
}

function setCustomFont(key, value) {
	if (!settings.customFonts) settings.customFonts = {};
	if (value) {
		settings.customFonts[key] = value;
	} else {
		delete settings.customFonts[key];
	}
	_saveSettings();
	_applyCustomFonts();
}

function removeCustomFont(key) {
	if (!settings.customFonts) return;
	delete settings.customFonts[key];
	_saveSettings();
	_applyCustomFonts();
}

function setCustomFontScale(key, scale) {
	if (!settings.customFonts) settings.customFonts = {};
	if (!settings.customFonts[key]) {
		settings.customFonts[key] = { type: 'default', scale };
	} else {
		settings.customFonts[key].scale = scale;
	}
	_saveSettings();
	_applyCustomFonts();
}

export async function loadFontFile(key, file) {
	const buffer = await readFileAsArrayBuffer(file);
	const db = await _openFontDB();
	const ext = file.name.split('.').pop().toLowerCase();
	let format = 'truetype';
	if (ext === 'woff') format = 'woff';
	else if (ext === 'woff2') format = 'woff2';
	else if (ext === 'otf') format = 'opentype';
	const record = { name: key, buffer, format, fileName: file.name };
	return new Promise((resolve, reject) => {
		const tx = db.transaction(FONT_STORE, 'readwrite');
		tx.objectStore(FONT_STORE).put(record);
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
}

export async function removeFontFile(key) {
	const db = await _openFontDB();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(FONT_STORE, 'readwrite');
		tx.objectStore(FONT_STORE).delete(key);
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
}

export async function applyFontFromDB(key) {
	const db = await _openFontDB();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(FONT_STORE, 'readonly');
		const req = tx.objectStore(FONT_STORE).get(key);
		req.onsuccess = () => {
			const record = req.result;
			if (!record) { resolve(false); return; }
			const blob = new Blob([record.buffer]);
			const url = URL.createObjectURL(blob);
			const fontFace = new FontFace('JieLi_' + key, `url('${url}') format('${record.format}')`);
			fontFace.load().then((loaded) => {
				document.fonts.add(loaded);
				resolve(true);
			}).catch(() => resolve(false));
		};
		req.onerror = () => reject(req.error);
	});
}

export async function resetAllCustomFonts() {
	const oldFonts = settings.customFonts || {};
	for (const key of Object.keys(oldFonts)) {
		if (oldFonts[key].type === 'file') {
			await removeFontFile(key).catch(() => {});
		}
	}
	settings.customFonts = {};
	_saveSettings();
	_applyCustomFonts();
}

function _applyCustomFonts() {
	_applyFontState(settings.customFonts || {});
}

function _getDefaultFontValue(cssVar) {
	const defaults = {
		'--font-Base': "var(--font-family)",
		'--font-SuiJie': '"CooperZhengKai Sub", var(--font-kaiTi)',
		'--font-Hao': '"KurintoGrgaCore sub", serif',
		'--font-Ri': '"ChillHuoFangKai_F Con Sub", var(--font-kaiTi)',
		'--font-XiangQing': '"Shippori Mincho Sub", "STZhongSong", "华文中宋", var(--font-songTi)',
		'--font-BiJi': 'var(--font-heiTi)',
	};
	return defaults[cssVar] || 'sans-serif';
}

export async function initCustomFonts() {
	const custom = settings.customFonts || {};
	for (const cssVar of FONT_CSS_VARS) {
		const key = cssVar.replace('--font-', '');
		const val = custom[key];
		if (val && val.type === 'file') {
			await applyFontFromDB(key).catch(() => {});
		}
	}
	_applyCustomFonts();
}

let _fontPreviewState = null;

function startFontPreview() {
	_fontPreviewState = JSON.parse(JSON.stringify(settings.customFonts || {}));
}

export function previewFontChange(key, change) {
	if (!_fontPreviewState) _fontPreviewState = JSON.parse(JSON.stringify(settings.customFonts || {}));
	const existing = _fontPreviewState[key];
	if (change.type === 'reset') {
		delete _fontPreviewState[key];
		if (change.scale != null) {
			_fontPreviewState[key] = { type: 'default', scale: change.scale };
		}
	} else if (change.type === 'system') {
		_fontPreviewState[key] = { type: 'system', name: change.name, scale: change.scale ?? existing?.scale ?? 100 };
	} else if (change.type === 'file') {
		_fontPreviewState[key] = { type: 'file', fileName: change.fileName, scale: change.scale ?? existing?.scale ?? 100 };
	}
	if (change.scale != null && _fontPreviewState[key] && change.type !== 'reset') {
		_fontPreviewState[key].scale = change.scale;
	}
	if (change.scale != null && !_fontPreviewState[key] && !change.type) {
		_fontPreviewState[key] = { type: 'default', scale: change.scale };
	}
	_applyFontState(_fontPreviewState);
}

export async function commitFontPreview() {
	if (!_fontPreviewState) return;
	const oldFonts = settings.customFonts || {};
	for (const key of Object.keys(_fontPreviewState)) {
		const val = _fontPreviewState[key];
		if (val.type === 'default' && (val.scale == null || val.scale === 100)) {
			delete _fontPreviewState[key];
		}
	}
	for (const key of Object.keys(oldFonts)) {
		if (oldFonts[key].type === 'file' && (!_fontPreviewState[key] || _fontPreviewState[key].type !== 'file')) {
			await removeFontFile(key).catch(() => {});
		}
	}
	settings.customFonts = _fontPreviewState;
	_fontPreviewState = null;
	_saveSettings();
	_applyCustomFonts();
}

export function cancelFontPreview() {
	_fontPreviewState = null;
	_applyCustomFonts();
}

function _applyFontState(state) {
	for (const cssVar of FONT_CSS_VARS) {
		const key = cssVar.replace('--font-', '');
		const val = state[key];
		const targetVar = key === 'Base' ? '--font-family' : cssVar;
		if (val && val.type === 'file') {
			document.body.style.setProperty(targetVar, `'JieLi_${key}', ${_getDefaultFontValue(cssVar)}`);
			applyFontFromDB(key).catch(() => {});
		} else if (val && val.type === 'system' && val.name) {
			document.body.style.setProperty(targetVar, `'${val.name}', ${_getDefaultFontValue(cssVar)}`);
		} else {
			document.body.style.removeProperty(targetVar);
		}
		if (key === 'Base') continue;
		const scaleVar = `--size-${key}-scale`;
		const sizeVar = `--size-${key}`;
		if (val && val.scale != null) {
			document.body.style.setProperty(scaleVar, String(val.scale / 100));
			document.body.style.setProperty(sizeVar, `calc(var(--size-${key}-base) * var(--size-${key}-scale))`);
		} else {
			document.body.style.removeProperty(scaleVar);
			document.body.style.removeProperty(sizeVar);
		}
	}
}
