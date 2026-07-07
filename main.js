import {qu_SuiPu} from "./scripts/SuiPu.js";
import {ensureDataForSuiPu, preloadHighFreq} from "./scripts/qu_QI.js";
import {JL_Jin, HJ_Jin, lng2cha, D2HMS, readFileAsText} from "./scripts/tools.js";
import * as biji from "./scripts/biji.js";
import * as jl from "./scripts/JieLi.js";
import * as wc from "./scripts/westCal.js";
import {WuZhong} from "./assets/LiShi.js";

import {
	initConfig, setThemeMode, setPalette,
	addCustomPalette, removeCustomPalette, updateCustomPalette, getCustomPalettes,
	setWeekdayType, getWeekdayNames, getWeekStart, setWeekStart,
	formatWeekdayName, qu_VLI, setVLI, addCustomVLI, removeCustomVLI, getCustomVLIs, getVLIPresets,
	setBgImageData, removeBgImage,
	setBgBlur,
	getAllSettings,
	getCellShadow, setCellShadow,
	getZuoRotateHanzi, setZuoRotateHanzi,
	getJieSu, setJieSu, getFuRi, setFuRi,
	getUpdateCheckInterval, setUpdateCheckInterval, getLastUpdateCheck, setLastUpdateCheck,
	getAutoUpdateFailCount, setAutoUpdateFailCount, getAutoUpdateIgnoredVersion, setAutoUpdateIgnoredVersion,
	getLastAutoUpdateFailTime, setLastAutoUpdateFailTime,
	getCustomFonts, loadFontFile, removeFontFile, initCustomFonts,
	previewFontChange, commitFontPreview, cancelFontPreview,
	resetAllCustomFonts
} from "./config.js";

const Jie_Ming = [ , "孟春", "仲春", "季春", "孟夏", "仲夏", "季夏", "孟秋", "仲秋", "季秋", "孟冬", "仲冬", "季冬"];

// ========== 状态 ==========
const state = {
	currentSui: 0,      // 当前岁
	currentJie: 0,      // 当前节 (1-12)
	currentHao: 0,      // 当前号（始终有值，初始化为今日）
	todaySui: 0,
	todayJie: 0,
	todayHao: 0,
	eraType: 'huaxia',  // 'xiyuan' | 'huaxia'
	settingsPageOpen: false,
	eraIndex: 0,         // 当前年号索引
};

// 月历表视口状态
let calendarVS = {
	baseOffset: 0,
	currentSectionStartRow: 0,
	currentSectionRows: 0,
	currentSectionHeight: 0,
	cellHeight: 0,
};

let _updateCheckMode = null;
let _pendingNewVersion = null;

let _bijiEditState = {
	open: false,
	sui: 0,
	hj: 0,
	idx: null,
	icon: biji.BIJI_DEFAULT_ICON,
	fullscreen: false,
	undoStack: [],
	draftTimer: null,
	debounceTimer: null
};
let _bijiExpandedIdx = -1;
let _bijiActionsVisible = false;
let _editingPaletteId = null;
let _pickerHSV = { h: 154, s: 0.46, v: 0.55 };
let _pickerDragging = null;
let _bijiActionsTimer = null;
let _boActionsVisible = false;
let _boActionsTimer = null;
let _fontDirty = false;

// ========== 返回键导航 ==========
let _navGuardActive = false;
let _suppressPopstateCount = 0;
let _navFromPopstate = false;
let _backExitTimer = 0;
let _navFirstInteraction = false;

function _navEnsureGuard() {
	if (!_navGuardActive) {
		history.pushState(null, '');
		_navGuardActive = true;
	}
}

// 首次用户交互后激活导航守卫（避免无交互时 pushState 导致 Skippable 警告）
function _navOnFirstInteraction() {
	if (_navFirstInteraction) return;
	_navFirstInteraction = true;
	_navEnsureGuard();
	['click', 'touchstart', 'keydown'].forEach(evt =>
		document.removeEventListener(evt, _navOnFirstInteraction));
}
['click', 'touchstart', 'keydown'].forEach(evt =>
	document.addEventListener(evt, _navOnFirstInteraction, { passive: true }));

// 任何面板/页面打开时调用
function _navOnOpen() {
	_navEnsureGuard();
}

// 任何面板/页面关闭时调用（守卫常驻，由 popstate 统一管理）
function _navOnClose() {
}

function _anyPageOpen() {
	return !!(
		DOM.settingsPage?.classList.contains('open') ||
		DOM.convertPage?.classList.contains('open') ||
		DOM.iePage?.classList.contains('open') ||
		DOM.boPage?.classList.contains('open') ||
		DOM.infoPage?.classList.contains('open') ||
		DOM.hamburgerMenu?.classList.contains('open') ||
		DOM.vliPanel?.classList.contains('open') ||
		DOM.bijiEditor?.classList.contains('open') ||
		DOM.fontSubmenu?.classList.contains('open') ||
		DOM.mergeDialog?.classList.contains('open') ||
		DOM.jieDropdown?.classList.contains('open') ||
		DOM.nianInputWrap?.classList.contains('open')
	);
}

function _closeTopmost() {
	if (DOM.mergeDialog?.classList.contains('open')) {
		DOM.mergeCancelBtn?.click();
		return;
	}
	if (_fontSubmenuKey) { _closeFontSubmenu(false); return; }
	if (DOM.bijiEditor?.classList.contains('open')) {
		if (_bijiEditState.fullscreen) {
			_bijiToggleFullscreen();
		} else {
			_bijiCloseEditor();
		}
		return;
	}
	if (DOM.infoPage?.classList.contains('open')) { _closeInfoPage(); return; }
	if (DOM.boPage?.classList.contains('open')) { _closeBijiOverview(); return; }
	if (DOM.iePage?.classList.contains('open')) { _closeIEPage(); return; }
	if (DOM.convertPage?.classList.contains('open')) { _closeConvertPage(); return; }
	if (DOM.settingsPage?.classList.contains('open')) { _closeSettingsPage(); return; }
	if (DOM.hamburgerMenu?.classList.contains('open')) { _closeHamburger(); return; }
	if (DOM.vliPanel?.classList.contains('open')) { _closeVLIPanel(); return; }
	if (DOM.jieDropdown?.classList.contains('open')) { DOM.jieDropdown.classList.remove('open'); _navOnClose(); return; }
	if (DOM.nianInputWrap?.classList.contains('open')) { _cancelNian(); return; }
}

let _fontSubmenuKey = null;
let _deferredInstallPrompt = null;

// ========== DOM引用 ==========
const $ = id => document.getElementById(id);
const DOM = {};

function cacheDOM() {
	DOM.lviLabel = $('lviLabel');
	DOM.vliLabel = $('vliLabel');
	DOM.weekStartToggle = $('weekStartToggle');
	DOM.hamburgerBtn = $('hamburgerBtn');
	DOM.eraToggle = $('eraToggle');
	DOM.nianDisplay = $('nianDisplay');
	DOM.nianInputWrap = $('nianInputWrap');
	DOM.nianInput = $('nianInput');
	DOM.nianConfirm = $('nianConfirm');
	DOM.suiPrev = $('suiPrev');
	DOM.suiNext = $('suiNext');
	DOM.jieName = $('jieName');
	DOM.jiePrev = $('jiePrev');
	DOM.jieNext = $('jieNext');
	DOM.todayBtn = $('todayBtn');
	DOM.eraPrev = $('eraPrev');
	DOM.eraNext = $('eraNext');
	DOM.eraText = $('eraText');
	DOM.barWeekday = $('barWeekday');
	DOM.barCalendar = $('barCalendar');
	DOM.calendarGrid = $('calendarGrid');
	DOM.barDetails = $('barDetails');
	DOM.detailList = $('detailList');
	DOM.bijiList = $('bijiList');
	DOM.barEvents = $('barEvents');
	DOM.fabAdd = $('fabAdd');
	DOM.bijiEditor = $('bijiEditor');
	DOM.bijiEditorOverlay = $('bijiEditorOverlay');
	DOM.bijiEditorDrag = $('bijiEditorDrag');
	DOM.bijiClose = $('bijiClose');
	DOM.bijiMaximize = $('bijiMaximize');
	DOM.bijiTextarea = $('bijiTextarea');
	DOM.bijiEditIcon = $('bijiEditIcon');
	DOM.bijiEditCount = $('bijiEditCount');
	DOM.bijiEditDelete = $('bijiEditDelete');
	DOM.bijiEditCancel = $('bijiEditCancel');
	DOM.bijiEditSave = $('bijiEditSave');
	DOM.bijiEditorHint = $('bijiEditorHint');
	DOM.bijiFileBtn = $('bijiFileBtn');
	DOM.bijiFileName = $('bijiFileName');
	DOM.bijiExportBtn = $('bijiExportBtn');
	DOM.bijiImportBtn = $('bijiImportBtn');
	DOM.bijiImportModeToggle = $('bijiImportModeToggle');
	DOM.bijiExportFormat = $('bijiExportFormat');
	DOM.bijiExportStart = $('bijiExportStart');
	DOM.bijiExportEnd = $('bijiExportEnd');
	DOM.vliPanel = $('vliPanel');
	DOM.vliList = $('vliList');
	DOM.vliCustomForm = $('vliCustomForm');
	DOM.vliCustomCha = $('vliCustomCha');
	DOM.vliCustomName = $('vliCustomName');
	DOM.vliCancel = $('vliCancel');
	DOM.vliConfirm = $('vliConfirm');
	DOM.jieDropdown = $('jieDropdown');
	DOM.hamburgerMenu = $('hamburgerMenu');
	DOM.menuOverlay = $('menuOverlay');
	DOM.menuSettings = $('menuSettings');
	DOM.menuShuJu = $('menuShuJu');
	DOM.menuAbout = $('menuAbout');
	DOM.menuInstallApp = $('menuInstallApp');
	DOM.menuInstallGuide = $('menuInstallGuide');
	DOM.menuImportExport = $('menuImportExport');
	DOM.iePage = $('iePage');
	DOM.ieBack = $('ieBack');
	DOM.ieGeShiBtn = $('ieGeShiBtn');
	DOM.fontOverlay = $('fontOverlay');
	DOM.fontActions = $('fontActions');
	DOM.fontApplyBtn = $('fontApplyBtn');
	DOM.fontCancelBtn = $('fontCancelBtn');
	DOM.fontSubmenu = $('fontSubmenu');
	DOM.fontSubmenuTitle = $('fontSubmenuTitle');
	DOM.fontNameInput = $('fontNameInput');
	DOM.fontFileBtn = $('fontFileBtn');
	DOM.fontScaleInput = $('fontScaleInput');
	DOM.fontPreview = $('fontPreview');
	DOM.fontResetBtn = $('fontResetBtn');
	DOM.fontResetSingleBtn = $('fontResetSingleBtn');
	DOM.menuBijiOverview = $('menuBijiOverview');
	DOM.boPage = $('boPage');
	DOM.boBack = $('boBack');
	DOM.boBody = $('boBody');
	DOM.boSelectAll = $('boSelectAll');
	DOM.boExpandAll = $('boExpandAll');
	DOM.boSortOrder = $('boSortOrder');
	DOM.boIconFilter = $('boIconFilter');
	DOM.boSearch = $('boSearch');
	DOM.boSuiRow = $('boSuiRow');
	DOM.boStartSui = $('boStartSui');
	DOM.boEndSui = $('boEndSui');
	DOM.boSuiConfirm = $('boSuiConfirm');
	DOM.boSuiCancel = $('boSuiCancel');
	DOM.boSearchRow = $('boSearchRow');
	DOM.boSearchInput = $('boSearchInput');
	DOM.boSearchClose = $('boSearchClose');
	DOM.boIconFilterRow = $('boIconFilterRow');
	DOM.boIconList = $('boIconList');
	DOM.boIconInvert = $('boIconInvert');
	DOM.boSelectRow = $('boSelectRow');
	DOM.boSelectInvert = $('boSelectInvert');
	DOM.boDeleteSelected = $('boDeleteSelected');
	DOM.settingsPage = $('settingsPage');
	DOM.spBack = $('spBack');
	DOM.spCustomStyleBtn = $('spCustomStyleBtn');
	DOM.paletteGrid = $('paletteGrid');
	DOM.paletteAddBtn = $('paletteAddBtn');
	DOM.paletteConfirm = $('paletteConfirm');
	DOM.paletteConfirmPreview = $('paletteConfirmPreview');
	DOM.paletteConfirmName = $('paletteConfirmName');
	DOM.paletteConfirmOk = $('paletteConfirmOk');
	DOM.paletteConfirmCancel = $('paletteConfirmCancel');
	DOM.palettePickerSV = $('palettePickerSV');
	DOM.palettePickerSVCursor = $('palettePickerSVCursor');
	DOM.palettePickerHue = $('palettePickerHue');
	DOM.palettePickerHueThumb = $('palettePickerHueThumb');
	DOM.paletteValueHex = $('paletteValueHex');
	DOM.paletteValueRgb = $('paletteValueRgb');
	DOM.paletteValueHsl = $('paletteValueHsl');
	DOM.bgImageBtn = $('bgImageBtn');
	DOM.bgImageRemove = $('bgImageRemove');
	DOM.bgImageRemoveWrap = $('bgImageRemoveWrap');
	DOM.bgBlurInput = $('bgBlurInput');
	DOM.cellShadowToggle = $('cellShadowToggle');
	DOM.zuoRotateToggle = $('zuoRotateToggle');
	DOM.jieSuImportBtn = $('jieSuImportBtn');
	DOM.jieSuExportBtn = $('jieSuExportBtn');
	DOM.jieSuResetBtn = $('jieSuResetBtn');
	DOM.jieSuImportModeToggle = $('jieSuImportModeToggle');
	DOM.fuRiImportBtn = $('fuRiImportBtn');
	DOM.fuRiExportBtn = $('fuRiExportBtn');
	DOM.fuRiResetBtn = $('fuRiResetBtn');
	DOM.fuRiImportModeToggle = $('fuRiImportModeToggle');
	DOM.mergeDialog = $('mergeDialog');
	DOM.mergeDialogBody = $('mergeDialogBody');
	DOM.mergeIgnoreBtn = $('mergeIgnoreBtn');
	DOM.mergeReplaceBtn = $('mergeReplaceBtn');
	DOM.mergeNewBtn = $('mergeNewBtn');
	DOM.mergeCancelBtn = $('mergeCancelBtn');
	DOM.convertPage = $('convertPage');
	DOM.cvpBack = $('cvpBack');
	DOM.cvpTabs = $('cvpTabs');
	DOM.lngDegreeInput = $('lngDegreeInput');
	DOM.lngDegForm = $('lngDegForm');
	DOM.lngDmsForm = $('lngDmsForm');
	DOM.lngD = $('lngD');
	DOM.lngM = $('lngM');
	DOM.lngS = $('lngS');
	DOM.lngDegResult = $('lngDegResult');
	DOM.lngDmsResult = $('lngDmsResult');
	DOM.d2hmsInput = $('d2hmsInput');
	DOM.d2hmsForm = $('d2hmsForm');
	DOM.d2hmsResult = $('d2hmsResult');
	DOM.hms2dH = $('hms2dH');
	DOM.hms2dM = $('hms2dM');
	DOM.hms2dS = $('hms2dS');
	DOM.hms2dForm = $('hms2dForm');
	DOM.hms2dResult = $('hms2dResult');
	DOM.jl2hjSui = $('jl2hjSui');
	DOM.jl2hjJie = $('jl2hjJie');
	DOM.jl2hjHao = $('jl2hjHao');
	DOM.jl2hjForm = $('jl2hjForm');
	DOM.jl2hjResult = $('jl2hjResult');
	DOM.hj2jlInput = $('hj2jlInput');
	DOM.hj2jlForm = $('hj2jlForm');
	DOM.hj2jlResult = $('hj2jlResult');
	DOM.wc2hjY = $('wc2hjY');
	DOM.wc2hjM = $('wc2hjM');
	DOM.wc2hjD = $('wc2hjD');
	DOM.wc2hjForm = $('wc2hjForm');
	DOM.wc2hjResult = $('wc2hjResult');
	DOM.hj2wcInput = $('hj2wcInput');
	DOM.hj2wcForm = $('hj2wcForm');
	DOM.hj2wcResult = $('hj2wcResult');
	DOM.jl2wcSui = $('jl2wcSui');
	DOM.jl2wcJie = $('jl2wcJie');
	DOM.jl2wcHao = $('jl2wcHao');
	DOM.jl2wcForm = $('jl2wcForm');
	DOM.jl2wcResult = $('jl2wcResult');
	DOM.wc2jlY = $('wc2jlY');
	DOM.wc2jlM = $('wc2jlM');
	DOM.wc2jlD = $('wc2jlD');
	DOM.wc2jlForm = $('wc2jlForm');
	DOM.wc2jlResult = $('wc2jlResult');
	DOM.menuConvert = $('menuConvert');
	DOM.infoPage = $('infoPage');
	DOM.ipBack = $('ipBack');
	DOM.ipTitle = $('ipTitle');
	DOM.ipBody = $('ipBody');
	DOM.toast = $('toast');
	DOM.updateCheckInterval = $('updateCheckInterval');
	DOM.updateCheckBtn = $('updateCheckBtn');
	DOM.updateStatusText = $('updateStatusText');
	DOM.currentVersionText = $('currentVersionText');
}

// ========== 初始化 ==========
export async function init() {
	cacheDOM();
	initConfig();
	initCustomFonts();

	const today = JL_Jin();
	state.todaySui = today.S;
	state.todayJie = today.J;
	state.todayHao = today.R;
	state.currentSui = today.S;
	state.currentJie = today.J;
	state.currentHao = today.R;

	await _ensureSuiPu(state.currentSui);

	renderAll();
	bindEvents();
	_bindBijiOverviewEvents();
	_updateBijiOverviewVisibility();

	// 后台预加载高频数据
	preloadHighFreq();

	// 草稿检查
	_checkBijiDraft();

	// SW 消息监听
	_initSWMessageListener();

	// 自动检查更新（延迟执行，不阻塞启动加载）
	if (typeof requestIdleCallback !== 'undefined') {
		requestIdleCallback(_autoCheckUpdate, { timeout: 3000 });
	} else {
		setTimeout(_autoCheckUpdate, 2000);
	}

	_initInstallPrompt();
}

async function _ensureSuiPu(sui) {
	await ensureDataForSuiPu(sui);
	return qu_SuiPu(sui);
}

function _getCurrentSuiPu() {
	return qu_SuiPu(state.currentSui);
}

// ========== 纪年转换 ==========
function _suiToNian(sui) {
	return state.eraType === 'xiyuan' ? sui - 2697 : sui;
}

function _nianToSui(nian) {
	return state.eraType === 'xiyuan' ? nian + 2697 : nian;
}

// ========== 渲染 ==========
function renderAll() {
	renderBar1();
	renderBar2();
	renderBar3();
	renderBar4();
	renderCalendar();
	renderDetails();
	renderBar7();
}

// ----- Bar 1: Header -----
function renderBar1() {
	const sp = _getCurrentSuiPu();
	if (!sp) return;
	DOM.lviLabel.textContent = '历准时：' + sp.LVI_Zi;
	DOM.vliLabel.textContent = '注历时：' + sp.VLI.Ming;

	// 星期起始拨子
	DOM.weekStartToggle.setAttribute('data-value', getWeekStart() ? '1' : '0');
}

// ----- Bar 2: Navigation -----
function renderBar2() {
	const sp = _getCurrentSuiPu();
	if (!sp) return;

	// 纪年类型
	DOM.eraToggle.textContent = state.eraType === 'xiyuan' ? '西元' : '华夏';

	// Nian显示
	const nian = _suiToNian(state.currentSui);
	const gzh = sp.Sui_GZh;
	const runFText = sp.RunF ? ' ⟮闰⟯' : ' ⟮平⟯';
	DOM.nianDisplay.innerHTML = '  ' + nian + ' ' + gzh[1] + '岁' + '<span style="font-size:0.8em; vertical-align:bottom">' + runFText + '</span>';

	// 节名
	if (sp.Jie_Zi && sp.Jie_Zi[state.currentJie]) {
		DOM.jieName.textContent = sp.Jie_Zi[state.currentJie];
	}

	// 年号索引重置
	state.eraIndex = 0;
}

// ----- Bar 3: Era Name -----
function renderBar3() {
	const sp = _getCurrentSuiPu();
	if (!sp) return;

	// 取当前节中间日的年号
	const i = state.currentJie;
	const x = sp.Jie_sy[i] + Math.round((sp.Jie_sy[i + 1] - sp.Jie_sy[i]) / 2);
	const cell = sp.SBiao[x];
	if (!cell || !cell.AL) { DOM.eraText.textContent = ''; return; }
	const shwy = sp.ShWY[cell.AL[0]];
	if (!shwy || !shwy.N_Hao || shwy.N_Hao.length === 0) { DOM.eraText.textContent = ''; return; }

	// 限制eraIndex范围
	if (state.eraIndex >= shwy.N_Hao.length) state.eraIndex = 0;
	if (state.eraIndex < 0) state.eraIndex = shwy.N_Hao.length - 1;

	DOM.eraText.textContent = shwy.N_Hao[state.eraIndex];

	// 显示/隐藏箭头
	DOM.eraPrev.style.visibility = shwy.N_Hao.length > 1 ? 'visible' : 'hidden';
	DOM.eraNext.style.visibility = shwy.N_Hao.length > 1 ? 'visible' : 'hidden';
}

// ----- Bar 4: Weekday Names -----
function renderBar4() {
	const names = getWeekdayNames();
	const weekStart = getWeekStart();
	DOM.barWeekday.innerHTML = '';
	for (let i = 0; i < 7; i++) {
		// weekStart=0时列顺序：日(0)一(1)...六(6)
		// weekStart=1时列顺序：一(1)二(2)...日(0)
		const weekdayIdx = (i + weekStart) % 7;
		const el = document.createElement('div');
		el.className = 'wd-name';
		// 周日(0)和周六(6)的列为周末列
		if (weekdayIdx === 0 || weekdayIdx === 6) el.classList.add('wd-weekend');
		el.textContent = names[weekdayIdx];
		DOM.barWeekday.appendChild(el);
	}
}

// ----- Bar 5: Calendar Grid -----
function renderCalendar() {
	const sp = _getCurrentSuiPu();
	if (!sp) return;

	const jieIdx = state.currentJie;
	const weekStart = getWeekStart();
	const grid = DOM.calendarGrid;
	grid.innerHTML = '';

	// 收集三节单元格数据
	const allItems = []; // [{weekday, sbiaoIdx, cell, suiPu, jieIdx, isCurrentSection, sui}]

	// 上一节
	if (jieIdx > 1) {
		_collectSection(allItems, sp, jieIdx - 1, false, state.currentSui);
	} else {
		const prevSp = qu_SuiPu(state.currentSui - 1);
		if (prevSp) _collectSection(allItems, prevSp, 12, false, state.currentSui - 1);
	}

	// 当前节
	_collectSection(allItems, sp, jieIdx, true, state.currentSui);

	// 下一节
	if (jieIdx < 12) {
		_collectSection(allItems, sp, jieIdx + 1, false, state.currentSui);
	} else {
		const nextSp = qu_SuiPu(state.currentSui + 1);
		if (nextSp) _collectSection(allItems, nextSp, 1, false, state.currentSui + 1);
	}

	if (allItems.length === 0) return;

	// 前导占位：使第一个单元格对齐到正确的星期列
	const firstWeekday = allItems[0].weekday;
	const firstCol = (firstWeekday - weekStart + 7) % 7;
	let cellCount = 0;
	for (let p = 0; p < firstCol; p++) {
		grid.appendChild(_makePlaceholder());
		cellCount++;
	}

	// 渲染所有单元格，跟踪当前节的行范围
	let currentSectionStartCell = -1;
	let currentSectionEndCell = -1;

	for (let idx = 0; idx < allItems.length; idx++) {
		const item = allItems[idx];

		// 跨年边界：检查星期连续性，插入占位符填补空白天
		if (idx > 0) {
			const prevWd = allItems[idx - 1].weekday;
			const expectedWd = (prevWd + 1) % 7;
			if (item.weekday !== expectedWd) {
				let w = expectedWd;
				while (w !== item.weekday) {
					grid.appendChild(_makePlaceholder());
					cellCount++;
					w = (w + 1) % 7;
				}
			}
		}

		if (item.isCurrentSection && currentSectionStartCell === -1) {
			currentSectionStartCell = cellCount;
		}

		const el = _createCellEl(item);
		grid.appendChild(el);
		cellCount++;

		if (item.isCurrentSection) {
			currentSectionEndCell = cellCount;
		}
	}

	// 计算行高和视口
	const totalRows = Math.ceil(cellCount / 7);
	const currentSectionStartRow = Math.floor(currentSectionStartCell / 7);
	const currentSectionEndRow = Math.ceil(currentSectionEndCell / 7);
	const currentSectionRows = currentSectionEndRow - currentSectionStartRow;
	const cellHeight = Math.max(48, Math.min(72, (window.innerHeight * 0.45) / currentSectionRows));

	grid.style.gridTemplateRows = `repeat(${totalRows}, ${cellHeight}px)`;

	// 视口截断：容器高度 = 当前节行数 × 行高
	const visibleHeight = currentSectionRows * cellHeight;
	DOM.barCalendar.style.height = visibleHeight + 'px';

	// 偏移以显示当前节
	const offset = -currentSectionStartRow * cellHeight;
	grid.style.transform = `translateY(${offset}px)`;

	// 保存视口状态供拖动使用
	calendarVS = {
		baseOffset: offset,
		currentSectionStartRow,
		currentSectionRows,
		currentSectionHeight: visibleHeight,
		cellHeight,
	};
}

function _collectSection(items, suiPu, jieIdx, isCurrent, sui) {
	if (!suiPu) return;
	const startIdx = suiPu.Jie_sy[jieIdx];
	const endIdx = suiPu.Jie_sy[jieIdx + 1];
	for (let i = startIdx; i < endIdx; i++) {
		const cell = suiPu.SBiao[i];
		if (!cell) continue;
		items.push({
			weekday: i % 7,
			sbiaoIdx: i,
			cell,
			suiPu,
			jieIdx,
			isCurrentSection: isCurrent,
			sui,
		});
	}
}

function _makePlaceholder() {
	const ph = document.createElement('div');
	ph.className = 'calendar-cell dimmed';
	return ph;
}

function _createCellEl(item) {
	const {cell, suiPu, sbiaoIdx, jieIdx, isCurrentSection, sui} = item;
	const el = document.createElement('div');
	el.className = 'calendar-cell';
	el.dataset.idx = sbiaoIdx;
	el.dataset.sui = sui;
	el.dataset.jie = jieIdx;

	// 非当前节半透明
	if (!isCurrentSection) el.classList.add('dimmed');

	// 周末
	const mod7 = sbiaoIdx % 7;
	if (mod7 === 0 || mod7 === 6) el.classList.add('weekend');

	// 今天
	if (cell.JL && cell.JL[0] === state.todayJie && cell.JL[1] === state.todayHao && sui === state.todaySui) {
		el.classList.add('is-today');
	}

	if (cell.JL && cell.JL[0] === state.currentJie && cell.JL[1] === state.currentHao && sui === state.currentSui) {
		const ring = document.createElement('div');
		ring.className = 'cell-ring';
		const img = document.createElement('img');
		img.src = 'assets/IMG/circle.png';
		img.alt = '';
		img.onerror = function() {
			ring.style.border = '1.5px solid var(--accent-primary)';
			ring.style.borderRadius = '50%';
			ring.style.width = '80%';
			ring.style.height = '80%';
		};
		ring.appendChild(img);
		el.appendChild(ring);
	}

	// 上部内容
	const upper = document.createElement('div');
	upper.className = 'cell-upper';

	// Zuo (左侧)
	if (cell.Zuo) {
		const zuo = document.createElement('div');
		const isHanzi = _isHanzi(cell.Zuo);
		zuo.className = 'cell-zuo' + (isHanzi ? ' hanzi' : '');
		if (isHanzi && !getZuoRotateHanzi()) {
			zuo.classList.add('upright');
		}
		zuo.textContent = cell.Zuo;
		upper.appendChild(zuo);
	}

	// Hao (中间) - 仅显示号数
	const hao = document.createElement('div');
	hao.className = 'cell-hao';
	hao.textContent = cell.JL ? cell.JL[1] : '';
	upper.appendChild(hao);

	// JQ (右侧上)
	if (cell.JQ) {
		const jq = document.createElement('div');
		jq.className = 'cell-jq';
		jq.textContent = '🔆';
		upper.appendChild(jq);
	}

	// YX (右侧下)
	if (cell.YX) {
		const yx = document.createElement('div');
		yx.className = 'cell-yx';
		yx.textContent = cell.YX[0] === '朔' ? '🌑' : '🌕';
		upper.appendChild(yx);
	}

	el.appendChild(upper);

	// 下部：夏历日期（JS有值时替换为节庆民俗）
	const lower = document.createElement('div');
	lower.className = 'cell-lower';
	const firstJS = cell.JS ? _getFirstJS(cell.JS) : null;

	if (firstJS) {
		lower.textContent = firstJS;
		lower.classList.add('js-override');
	} else if (cell.AL) {
		if (cell.AL[1] === '初一') {
			const shwy = suiPu.ShWY[cell.AL[0]];
			if (shwy) {
				const yueSpan = document.createElement('span');
				yueSpan.className = 'yue-name';
				yueSpan.textContent = shwy.Y_Zi + '月';
				lower.appendChild(yueSpan);
				const dxSpan = document.createElement('span');
				dxSpan.className = 'dx-zi';
				dxSpan.textContent = shwy.Y_dxZi;
				lower.appendChild(dxSpan);
			}
		} else {
			lower.textContent = cell.AL[1];
		}
	}
	el.appendChild(lower);

	// 符号叠加层
	const hasFr = cell.FR && cell.FR.icon;
	const cellHJ = suiPu.Biao0_HJ + sbiaoIdx;
	const noteIcon = biji.getNoteIcon(sui, cellHJ);
	if (hasFr || noteIcon) {
		const overlay = document.createElement('div');
		overlay.className = 'cell-overlay';
		if (hasFr) {
			const frMark = document.createElement('div');
			frMark.className = 'cell-fr' + (cell.FR.icon.length > 1 ? ' multi' : '');
			frMark.textContent = cell.FR.icon;
			overlay.appendChild(frMark);
		}
		if (noteIcon) {
			const evMark = document.createElement('div');
			evMark.className = 'cell-event' + (noteIcon.length > 1 ? ' multi' : '');
			evMark.textContent = noteIcon;
			overlay.appendChild(evMark);
		}
		upper.appendChild(overlay);
	}

	// 点击选择
	el.addEventListener('click', () => _onCellClick(sbiaoIdx, sui, jieIdx));

	return el;
}

function _isHanzi(str) {
	return /^\p{Script=Han}+$/u.test(str);
}

function _getFirstJS(js) {
	if (!js) return null;
	for (let k = 0; k < js.length; k++) {
		if (js[k] && js[k].length > 0) {
			const firstItem = js[k][0];
			if (Array.isArray(firstItem) && firstItem.length >= 2) {
				return firstItem[0];
			} else if (Array.isArray(firstItem)) {
				return firstItem[0];
			} else {
				return firstItem;
			}
		}
	}
	return null;
}

function _getAllJSDetail(js) {
	if (!js) return [];
	const result = [];
	for (let k = 0; k < js.length; k++) {
		if (js[k] && js[k].length > 0) {
			for (let j = 0; j < js[k].length; j++) {
				const item = js[k][j];
				if (Array.isArray(item) && item.length >= 2 && item[1]) {
					result.push(item[1]);
				} else if (Array.isArray(item) && item[0]) {
					result.push(item[0]);
				} else if (item) {
					result.push(item);
				}
			}
		}
	}
	return result;
}

// ----- Bar 6: Details -----
function renderDetails() {
	const sp = _getCurrentSuiPu();
	if (!sp) return;

	// 找当前号对应的SBiao单元格
	const cell = _findCurrentCell(sp);
	if (!cell) {
		DOM.detailList.innerHTML = '';
		return;
	}

	const items = [];

	// 1. 节历日期 + 星期
	const idx = _findCurrentCellIdx(sp);
	const mod7 = idx % 7;
	const weekdayStr = formatWeekdayName(mod7);
	items.push('华夏 ' + sp.Sui + ' 岁 ' + sp.Jie_Zi[cell.JL[0]] + " " + String(cell.JL[1]) + ' 日┆' + sp.Sui_GZh[0] + '岁 ' + sp.Jie_GZh[cell.JL[0]] + '节 ' + cell.GZh + '日┆' + weekdayStr);

	// 2. FR.JL
	if (cell.FR && cell.FR.JL && cell.FR.JL.length > 0) {
		items.push(cell.FR.JL.join('，'));
	}

	// 3. 年号
	if (cell.AL) {
		const shwy = sp.ShWY[cell.AL[0]];
		if (shwy && shwy.N_Hao) {
			for (const hao of shwy.N_Hao) {
				items.push(hao);
			}
		}
	}

	// 4. 夏历、西历
		if (cell.AL) {
		const shwy = sp.ShWY[cell.AL[0]];
		let wYearS = '';
		if(cell.WC) {
			wYearS = cell.WC[0] > 0 ? "┆西历 " +String(cell.WC[0]) : "┆西元前 " + String(1 - cell.WC[0]) + "(" + cell.WC[0] + ")";
			wYearS += ' 年 ' + String(cell.WC[1]) + ' 月 ' + String(cell.WC[2]) + ' 日';
		}
		let cellhj = sp.Biao0_HJ + idx;
		let zhou = Math.floor(cellhj / 60);
		let yu = cellhj - zhou * 60;
		let hjS = '花 (' + String(zhou) + ') + ' + String(yu);
		if (shwy) {
			items.push(
				'&emsp;&emsp;' + shwy.Y_Zi + '月' +
				cell.AL[1] + '┆' + hjS + wYearS 
			);
		}
	}

	// 5. FR.AL
	if (cell.FR && cell.FR.AL && cell.FR.AL.length > 0) {
		items.push(cell.FR.AL.join('，'));
	}

	// 6. FR.WC
	if (cell.FR && cell.FR.WC && cell.FR.WC.length > 0) {
		items.push(cell.FR.WC.join('，'));
	}

	// 7. 节气/朔望
	let QiRi = sp.Sui >= WuZhong[0] ? " (定气历日)" : " (平气历日)";
	let qa = !cell.JQR ? "" : cell.JQR + QiRi;
	let qb = !cell.JQ ? ""
			: qa ? "┆" + cell.JQ[0] + " (今算定气时刻)：" + cell.JQ[1]
			: cell.JQ[0] + " (今算定气时刻)：" + cell.JQ[1];
	let qc = !cell.YX ? ""
			: qa || qb ? "┆" + cell.YX[0] + " (今算定朔时刻)：" + cell.YX[1]
			: cell.YX[0] + " (今算定朔时刻)：" + cell.YX[1];
	const qStr = qa + qb + qc;
	if (qStr) items.push(qStr);

	// 8. FR.JQ
	if (cell.FR && cell.FR.JQ && cell.FR.JQ.length > 0) {
		items.push(cell.FR.JQ.join('，'));
	}

	// 9. 节庆民俗
	if (cell.JS) {
		const allJS = _getAllJSDetail(cell.JS);
		if (allJS.length > 0) items.push(allJS.join('，'));
	}

	DOM.detailList.innerHTML = items.map(t => '<li>' + t + '</li>').join('');
}

function _findCurrentCell(sp) {
	const idx = _findCurrentCellIdx(sp);
	return sp.SBiao[idx] || null;
}

function _findCurrentCellIdx(sp) {
	// 在SBiao中查找当前节+号的单元格
	const jieStart = sp.Jie_sy[state.currentJie];
	const jieEnd = sp.Jie_sy[state.currentJie + 1];
	for (let i = jieStart; i < jieEnd; i++) {
		const cell = sp.SBiao[i];
		if (cell && cell.JL && cell.JL[0] === state.currentJie && cell.JL[1] === state.currentHao) {
			return i;
		}
	}
	// 默认返回节首
	return jieStart;
}

// ========== 交互绑定 ==========
function bindEvents() {
	// VLI面板
	DOM.vliLabel.addEventListener('click', _openVLIPanel);
	DOM.vliCancel.addEventListener('click', _closeVLIPanel);
	DOM.vliConfirm.addEventListener('click', _confirmVLI);
	DOM.vliCustomForm.addEventListener('submit', e => { e.preventDefault(); _confirmVLI(); });

	// 星期起始
	DOM.weekStartToggle.addEventListener('click', () => {
		const newVal = getWeekStart() ? 0 : 1;
		setWeekStart(newVal);
		DOM.weekStartToggle.setAttribute('data-value', String(newVal));
		renderBar4();
		renderCalendar();
	});

	// 汉堡菜单
	DOM.hamburgerBtn.addEventListener('click', _openHamburger);
	DOM.menuOverlay.addEventListener('click', () => { _closeHamburger(); _navOnClose(); });
	DOM.menuConvert.addEventListener('click', () => { _closeHamburger(); _openConvertPage(); });
	DOM.menuSettings.addEventListener('click', () => { _closeHamburger(); _openSettingsPage(); });
	DOM.menuBijiOverview.addEventListener('click', () => { _closeHamburger(); _openBijiOverview(); });
	DOM.menuImportExport.addEventListener('click', () => { _closeHamburger(); _openIEPage(); });
	DOM.menuShuJu.addEventListener('click', () => { _closeHamburger(); _openInfoPage('ShuJu', '历法与数据'); });
	DOM.menuAbout.addEventListener('click', () => { _closeHamburger(); _openInfoPage('GuanYu', '关于应用'); });
	DOM.menuInstallApp.addEventListener('click', () => {
		_closeHamburger();
		if (_deferredInstallPrompt) {
			_navOnClose();
			_deferredInstallPrompt.prompt();
			_deferredInstallPrompt.userChoice.then(() => {
				_deferredInstallPrompt = null;
			});
		}
	});
	DOM.menuInstallGuide.addEventListener('click', () => {
		_closeHamburger();
		_openInfoPage('AnZhuang', '安装说明');
	});

	// 笔记
	DOM.fabAdd.addEventListener('click', _bijiOpenNew);
	DOM.bijiClose.addEventListener('click', _bijiCloseEditor);
	DOM.bijiEditCancel.addEventListener('click', () => { biji.clearDraft(); _bijiCloseEditor(); });
	DOM.bijiEditSave.addEventListener('click', _bijiSave);
	DOM.bijiEditDelete.addEventListener('click', _bijiDeleteFromEditor);
	DOM.bijiMaximize.addEventListener('click', _bijiToggleFullscreen);
	DOM.bijiEditIcon.addEventListener('click', _bijiChangeIcon);
	DOM.bijiTextarea.addEventListener('input', _bijiOnInput);
	DOM.bijiTextarea.addEventListener('keydown', (e) => {
		if (e.key === 'Tab') {
			e.preventDefault();
			const ta = e.target;
			const start = ta.selectionStart;
			const end = ta.selectionEnd;
			ta.value = ta.value.substring(0, start) + '\t' + ta.value.substring(end);
			ta.selectionStart = ta.selectionEnd = start + 1;
			_bijiOnInput();
		}
	});
	DOM.bijiEditorDrag.addEventListener('pointerdown', _bijiOnDragStart);
	DOM.bijiExportBtn.addEventListener('click', _bijiExport);
	DOM.bijiImportBtn.addEventListener('click', _bijiImport);
	DOM.bijiImportModeToggle.addEventListener('click', () => {
		const v = DOM.bijiImportModeToggle.getAttribute('data-value') === '1' ? '0' : '1';
		DOM.bijiImportModeToggle.setAttribute('data-value', v);
	});
	DOM.bijiExportFormat.addEventListener('click', () => {
		const v = DOM.bijiExportFormat.getAttribute('data-value') === '1' ? '0' : '1';
		DOM.bijiExportFormat.setAttribute('data-value', v);
	});
	DOM.bijiEditorHint.addEventListener('click', () => {
		DOM.bijiEditor.classList.remove('open', 'fullscreen');
		DOM.bijiEditorOverlay.classList.remove('active');
		_bijiEditState.open = false;
		clearTimeout(_bijiEditState.draftTimer);
		clearTimeout(_bijiEditState.debounceTimer);
		_openIEPage();
	});

	// 纪年切换
	DOM.eraToggle.addEventListener('click', () => {
		state.eraType = state.eraType === 'xiyuan' ? 'huaxia' : 'xiyuan';
		renderBar2();
	});

	// Nian输入
	DOM.nianDisplay.addEventListener('click', () => {
		DOM.nianDisplay.classList.add('hidden');
		DOM.nianInputWrap.classList.add('open');
		_navOnOpen();
		const nian = _suiToNian(state.currentSui);
		DOM.nianInput.value = nian;
		DOM.nianInput.focus();
	});
	DOM.nianInputWrap.addEventListener('submit', e => { e.preventDefault(); _confirmNian(); });
	DOM.nianInput.addEventListener('blur', () => { setTimeout(_cancelNian, 100); });

	// 岁切换
	DOM.suiPrev.addEventListener('click', () => _switchSui(state.currentSui - 1));
	DOM.suiNext.addEventListener('click', () => _switchSui(state.currentSui + 1));

	// 节切换
	DOM.jiePrev.addEventListener('click', () => _switchJie(state.currentJie - 1));
	DOM.jieNext.addEventListener('click', () => _switchJie(state.currentJie + 1));

	// 节名下拉
	DOM.jieName.addEventListener('click', _toggleJieDropdown);

	// 今按钮
	DOM.todayBtn.addEventListener('click', _goToday);

	// 年号切换
	DOM.eraPrev.addEventListener('click', () => { state.eraIndex--; renderBar3(); });
	DOM.eraNext.addEventListener('click', () => { state.eraIndex++; renderBar3(); });

	// 录事功能预留：fabAdd 新建按钮

	// 设置页
	DOM.spBack.addEventListener('click', _closeSettingsPage);
	DOM.spCustomStyleBtn.addEventListener('click', () => { _openInfoPage('ZiTi', '字体 与 简繁字型'); });
	DOM.bgImageBtn.addEventListener('click', _onBgImageSelect);
	DOM.bgImageRemove.addEventListener('click', () => { removeBgImage(); DOM.bgImageRemoveWrap.style.display = 'none'; });
	DOM.bgBlurInput.addEventListener('change', () => {
		const val = parseFloat(DOM.bgBlurInput.value);
		if (!isNaN(val) && val >= 0) setBgBlur(val);
	});

	DOM.cellShadowToggle.addEventListener('click', () => {
		const val = !getCellShadow();
		setCellShadow(val);
		DOM.cellShadowToggle.setAttribute('data-value', val ? '1' : '0');
	});

	DOM.zuoRotateToggle.addEventListener('click', () => {
		const val = !getZuoRotateHanzi();
		setZuoRotateHanzi(val);
		DOM.zuoRotateToggle.setAttribute('data-value', val ? '1' : '0');
		renderCalendar();
	});

	const _fontPreviewTexts = {
		Base: '节历 民俗 笔记 详情 设置',
		SuiJie: '华夏　孟春　仲冬',
		Hao: '1 3 7 15 20',
		Ri: '初一　十五　冬至',
		XiangQing: '甲子岁　冬至　日曜日',
		BiJi: '历史事件　个人笔记',
	};
	const _fontLabels = {
		Base: '基础字体',
		SuiJie: '纪年名，节名',
		Hao: '节历日数 (阿拉伯)',
		Ri: '夏历日数 (汉字)，节庆民俗',
		XiangQing: '年号，日期详情',
		BiJi: '笔记文本',
	};

	function _openFontSubmenu(key) {
		if (_fontSubmenuKey === key) return;
		if (_fontSubmenuKey) _closeFontSubmenu(false);
		_fontSubmenuKey = key;
		const custom = getCustomFonts()[key];
		DOM.fontNameInput.value = (custom && custom.type === 'system') ? custom.name : '';
		DOM.fontScaleInput.value = (custom && custom.scale != null) ? custom.scale : 100;
		DOM.fontSubmenuTitle.textContent = _fontLabels[key];
		DOM.fontPreview.textContent = _fontPreviewTexts[key];
		DOM.fontPreview.style.fontFamily = key === 'Base' ? 'var(--font-family)' : `var(--font-${key})`;
		DOM.fontPreview.style.fontSize = key === 'Base' ? 'var(--body-size)' : `var(--size-${key})`;
		DOM.fontScaleInput.closest('.sp-font-scale-row').style.display = key === 'Base' ? 'none' : '';
		DOM.fontOverlay.classList.add('open');
		DOM.fontSubmenu.classList.add('open');
		document.querySelectorAll('.sp-font-row').forEach(r => {
			r.classList.toggle('active', r.dataset.fontKey === key);
		});
		_navOnOpen();
	}

	document.querySelectorAll('.sp-font-row').forEach(row => {
		row.addEventListener('click', () => _openFontSubmenu(row.dataset.fontKey));
	});

	DOM.fontNameInput.addEventListener('input', () => {
		if (!_fontSubmenuKey) return;
		const name = DOM.fontNameInput.value.trim();
		if (name) {
			previewFontChange(_fontSubmenuKey, { type: 'system', name });
		} else {
			previewFontChange(_fontSubmenuKey, { type: 'reset' });
		}
		DOM.fontPreview.style.fontFamily = _fontSubmenuKey === 'Base' ? 'var(--font-family)' : `var(--font-${_fontSubmenuKey})`;
		_fontDirty = true;
	});

	DOM.fontFileBtn.addEventListener('click', async () => {
		if (!_fontSubmenuKey) return;
		const key = _fontSubmenuKey;
		try {
			if (window.showOpenFilePicker) {
				const [handle] = await window.showOpenFilePicker({
					types: [{ description: '字体文件', accept: { 'font/*': ['.ttf', '.otf', '.woff', '.woff2'] } }],
					multiple: false,
				});
				const file = await handle.getFile();
				await loadFontFile(key, file);
				previewFontChange(key, { type: 'file', fileName: file.name });
				DOM.fontNameInput.value = '';
				DOM.fontPreview.style.fontFamily = key === 'Base' ? 'var(--font-family)' : `var(--font-${key})`;
				_fontDirty = true;
			} else {
				const input = document.createElement('input');
				input.type = 'file';
				input.accept = '.ttf,.otf,.woff,.woff2';
				input.onchange = async () => {
					const file = input.files[0];
					if (!file) return;
					await loadFontFile(key, file);
					previewFontChange(key, { type: 'file', fileName: file.name });
					DOM.fontNameInput.value = '';
					DOM.fontPreview.style.fontFamily = key === 'Base' ? 'var(--font-family)' : `var(--font-${key})`;
					_fontDirty = true;
				};
				input.click();
			}
		} catch(e) {
			if (e.name !== 'AbortError') _showToast('加载字体文件失败');
		}
	});

	DOM.fontScaleInput.addEventListener('input', () => {
		if (!_fontSubmenuKey) return;
		const scale = parseInt(DOM.fontScaleInput.value);
		if (!isNaN(scale) && scale >= 50 && scale <= 200) {
			previewFontChange(_fontSubmenuKey, { scale });
			DOM.fontPreview.style.fontSize = `var(--size-${_fontSubmenuKey})`;
			_fontDirty = true;
		}
	});

	DOM.fontApplyBtn.addEventListener('click', () => _closeFontSubmenu(true));
	DOM.fontCancelBtn.addEventListener('click', () => _closeFontSubmenu(false));
	DOM.fontOverlay.addEventListener('click', () => _closeFontSubmenu(false));

	DOM.fontResetBtn.addEventListener('click', async () => {
		await resetAllCustomFonts();
		_syncFontSettingsUI();
		_showToast('已恢复默认字体');
	});

	DOM.fontResetSingleBtn.addEventListener('click', () => {
		if (!_fontSubmenuKey) return;
		previewFontChange(_fontSubmenuKey, { type: 'reset' });
		DOM.fontNameInput.value = '';
		DOM.fontScaleInput.value = 100;
		DOM.fontPreview.style.fontFamily = _fontSubmenuKey === 'Base' ? 'var(--font-family)' : `var(--font-${_fontSubmenuKey})`;
		DOM.fontPreview.style.fontSize = _fontSubmenuKey === 'Base' ? 'var(--body-size)' : `var(--size-${_fontSubmenuKey})`;
		_fontDirty = true;
	});

	DOM.jieSuImportBtn.addEventListener('click', _importJieSu);
	DOM.jieSuExportBtn.addEventListener('click', _exportJieSu);
	DOM.jieSuResetBtn.addEventListener('click', _resetJieSu);
	DOM.jieSuImportModeToggle.addEventListener('click', () => {
		const v = DOM.jieSuImportModeToggle.getAttribute('data-value') === '1' ? '0' : '1';
		DOM.jieSuImportModeToggle.setAttribute('data-value', v);
	});
	DOM.fuRiImportBtn.addEventListener('click', _importFuRi);
	DOM.fuRiExportBtn.addEventListener('click', _exportFuRi);
	DOM.fuRiResetBtn.addEventListener('click', _resetFuRi);
	DOM.fuRiImportModeToggle.addEventListener('click', () => {
		const v = DOM.fuRiImportModeToggle.getAttribute('data-value') === '1' ? '0' : '1';
		DOM.fuRiImportModeToggle.setAttribute('data-value', v);
	});

	// 更新检查
	DOM.updateCheckInterval.addEventListener('change', () => {
		setUpdateCheckInterval(parseInt(DOM.updateCheckInterval.value));
	});
	DOM.updateCheckBtn.addEventListener('click', _onManualCheckUpdate);

	// 设置页radio
	document.querySelectorAll('input[name="weekdayType"]').forEach(r => {
		r.addEventListener('change', () => { setWeekdayType(r.value); renderBar4(); renderCalendar(); renderDetails(); });
	});
	document.querySelectorAll('input[name="themeMode"]').forEach(r => {
		r.addEventListener('change', () => { setThemeMode(r.value); _syncSettingsUI(); });
	});
	DOM.paletteGrid.querySelectorAll('.sp-palette-item:not(.sp-palette-add)').forEach(item => {
		item.addEventListener('click', () => {
			_editingPaletteId = null;
			DOM.paletteConfirm.style.display = 'none';
			setPalette(item.dataset.palette);
			_syncSettingsUI();
		});
	});
	DOM.paletteAddBtn.addEventListener('click', () => {
		_editingPaletteId = null;
		_pickerHSV = { h: 154, s: 0.46, v: 0.55 };
		DOM.paletteConfirmName.value = '';
		DOM.paletteConfirm.style.display = 'flex';
		_updatePickerUI();
	});
	DOM.paletteConfirmOk.addEventListener('click', () => {
		const hex = _hsvToHex(_pickerHSV.h, _pickerHSV.s, _pickerHSV.v);
		const name = DOM.paletteConfirmName.value.trim();
		if (_editingPaletteId) {
			updateCustomPalette(_editingPaletteId, name, hex);
		} else {
			addCustomPalette(name, hex);
		}
		_editingPaletteId = null;
		DOM.paletteConfirm.style.display = 'none';
		_syncSettingsUI();
	});
	DOM.paletteConfirmCancel.addEventListener('click', () => {
		_editingPaletteId = null;
		DOM.paletteConfirm.style.display = 'none';
	});
	DOM.palettePickerSV.addEventListener('mousedown', e => {
		_pickerDragging = 'sv';
		_onSVPick(e);
	});
	DOM.palettePickerHue.addEventListener('mousedown', e => {
		_pickerDragging = 'hue';
		_onHuePick(e);
	});
	document.addEventListener('mousemove', e => {
		if (_pickerDragging === 'sv') _onSVPick(e);
		else if (_pickerDragging === 'hue') _onHuePick(e);
	});
	document.addEventListener('mouseup', () => { _pickerDragging = null; });
	DOM.palettePickerSV.addEventListener('touchstart', e => {
		_pickerDragging = 'sv';
		_onSVPick(e);
	}, { passive: true });
	DOM.palettePickerHue.addEventListener('touchstart', e => {
		_pickerDragging = 'hue';
		_onHuePick(e);
	}, { passive: true });
	document.addEventListener('touchmove', e => {
		if (!_pickerDragging) return;
		e.preventDefault();
		if (_pickerDragging === 'sv') _onSVPick(e);
		else if (_pickerDragging === 'hue') _onHuePick(e);
	}, { passive: false });
	document.addEventListener('touchend', () => { _pickerDragging = null; });
	document.querySelectorAll('.sp-color-value').forEach(el => {
		el.addEventListener('change', () => {
			const fmt = el.dataset.format;
			const val = el.value.trim();
			if (!val) return;
			let hsv = null;
			if (fmt === 'hex') {
				hsv = _parseHexInput(val);
			} else if (fmt === 'rgb') {
				hsv = _parseRgbInput(val);
			} else if (fmt === 'hsl') {
				hsv = _parseHslInput(val);
			}
			if (hsv) {
				_pickerHSV = hsv;
				_updatePickerUI();
			}
		});
	});
	document.addEventListener('touchstart', e => {
		if (!e.target.closest('.sp-palette-custom')) {
			DOM.paletteGrid.querySelectorAll('.sp-palette-show-actions').forEach(el => {
				el.classList.remove('sp-palette-show-actions');
			});
		}
	}, { passive: true });

	// 换算工具页
	DOM.cvpBack.addEventListener('click', _closeConvertPage);
	DOM.cvpTabs.addEventListener('click', e => {
		const tab = e.target.closest('.cvp-tab');
		if (!tab) return;
		DOM.cvpTabs.querySelectorAll('.cvp-tab').forEach(t => t.classList.remove('active'));
		tab.classList.add('active');
		DOM.convertPage.querySelectorAll('.cvp-panel').forEach(p => p.classList.remove('active'));
		const id = 'cvp' + tab.dataset.tab.charAt(0).toUpperCase() + tab.dataset.tab.slice(1);
		const panel = DOM.convertPage.querySelector('#' + id);
		if (panel) panel.classList.add('active');
	});
	DOM.lngDegForm.addEventListener('submit', e => { e.preventDefault(); _calcLng2Cha('degree'); });
	DOM.lngDmsForm.addEventListener('submit', e => { e.preventDefault(); _calcLng2Cha('dms'); });
	DOM.d2hmsForm.addEventListener('submit', e => { e.preventDefault(); _calcD2HMS(); });
	DOM.hms2dForm.addEventListener('submit', e => { e.preventDefault(); _calcHMS2D(); });
	DOM.jl2hjForm.addEventListener('submit', e => { e.preventDefault(); _calcJL2HJ(); });
	DOM.hj2jlForm.addEventListener('submit', e => { e.preventDefault(); _calcHJ2JL(); });
	DOM.wc2hjForm.addEventListener('submit', e => { e.preventDefault(); _calcWC2HJ(); });
	DOM.hj2wcForm.addEventListener('submit', e => { e.preventDefault(); _calcHJ2WC(); });
	DOM.jl2wcForm.addEventListener('submit', e => { e.preventDefault(); _calcJL2WC(); });
	DOM.wc2jlForm.addEventListener('submit', e => { e.preventDefault(); _calcWC2JL(); });

	// 信息页
	DOM.ipBack.addEventListener('click', _closeInfoPage);
	DOM.ipBody.addEventListener('click', (e) => {
		const a = e.target.closest('a[data-info-page]');
		if (!a) return;
		e.preventDefault();
		_openInfoPage(a.dataset.infoPage, a.textContent.trim());
	});
	DOM.ieBack.addEventListener('click', _closeIEPage);
	DOM.ieGeShiBtn.addEventListener('click', () => { _openInfoPage('GeShi', '导入导出格式说明'); });
	DOM.boBack.addEventListener('click', _closeBijiOverview);

	// 点击外部关闭节下拉
	document.addEventListener('click', e => {
		if (!DOM.jieName.contains(e.target) && !DOM.jieDropdown.contains(e.target)) {
			if (DOM.jieDropdown.classList.contains('open')) {
				DOM.jieDropdown.classList.remove('open');
				_navOnClose();
			}
		}
	});

	// 返回键导航
	window.addEventListener('popstate', () => {
		if (_suppressPopstateCount > 0) {
			_suppressPopstateCount--;
			return;
		}
		_navGuardActive = false;
		if (_anyPageOpen()) {
			_navFromPopstate = true;
			_closeTopmost();
			_navFromPopstate = false;
		} else {
			// 主页面：双击退出
			const now = Date.now();
			if (_backExitTimer && now - _backExitTimer < 2000) {
				_backExitTimer = 0;
				// 不补回守卫，让浏览器自然后退退出
				return;
			}
			_backExitTimer = now;
			_showToast('连续返回两次退出页面', 2000);
		}
		// 守卫常驻：同步补回，拦截下一次返回
		history.pushState(null, '');
		_navGuardActive = true;
	});

	// 键盘快捷键：Escape 取消/关闭，BrowserBack 后退
	document.addEventListener('keydown', e => {
		const tag = e.target.tagName;
		const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable;

		if (e.key === 'Escape') {
			// 输入框中 Escape：先取消输入框自身
			if (DOM.nianInputWrap?.classList.contains('open') && tag === 'INPUT') {
				_cancelNian();
				e.preventDefault();
				return;
			}
			if (isInput) return;
			if (_anyPageOpen()) {
				_closeTopmost();
				e.preventDefault();
			}
		} else if (e.key === 'BrowserBack') {
			if (_anyPageOpen()) {
				_closeTopmost();
				e.preventDefault();
			}
		}
	});

	// 日历触摸/鼠标拖动
	_initCalendarDrag();

	// 预加载相邻岁
	_preloadAdjacentSui();
}

// ========== VLI面板 ==========
let _vliSelected = null;
let _vliCustomMode = false;

function _buildVLIList() {
	const presets = getVLIPresets();
	const customs = getCustomVLIs();
	const current = qu_VLI();
	_vliSelected = current._custom ? (current._id || null) : (current._bZh || 'UTC8');
	_vliCustomMode = false;

	DOM.vliList.innerHTML = '';

	for (const p of presets) {
		const item = document.createElement('div');
		item.className = 'vli-item' + (_vliSelected === p.BZh ? ' active' : '');
		item.dataset.id = p.BZh;
		item.innerHTML =
			'<span class="vli-item-name">' + p.Ming + '</span>' +
			'<span class="vli-item-cha">' + p.Cha + '</span>';
		item.addEventListener('click', () => _selectVLI(p.BZh));
		DOM.vliList.appendChild(item);
	}

	for (const c of customs) {
		const item = document.createElement('div');
		item.className = 'vli-item' + (_vliSelected === c.id ? ' active' : '');
		item.dataset.id = c.id;
		item.innerHTML =
			'<span class="vli-item-name">' + c.Ming + '</span>' +
			'<span class="vli-item-cha">' + c.Cha + '</span>' +
			'<button type="button" class="vli-item-del" title="删除">&times;</button>';
		item.addEventListener('click', (e) => {
			if (e.target.classList.contains('vli-item-del')) return;
			_selectVLI(c.id);
		});
		item.querySelector('.vli-item-del').addEventListener('click', (e) => {
			e.stopPropagation();
			removeCustomVLI(c.id);
			_buildVLIList();
		});
		DOM.vliList.appendChild(item);
	}

	const customEntry = document.createElement('div');
	customEntry.className = 'vli-item vli-item-custom';
	customEntry.innerHTML =
		'<span class="vli-item-name">自定义…</span>' +
		'<span class="vli-item-cha">相对 UTC﹢8 的时差 (日)</span>';
	customEntry.addEventListener('click', () => {
		_vliCustomMode = true;
		DOM.vliCustomForm.style.display = '';
		DOM.vliCustomCha.value = '';
		DOM.vliCustomName.value = '';
		DOM.vliCustomCha.focus();
		DOM.vliList.querySelectorAll('.vli-item').forEach(el => el.classList.remove('active'));
		customEntry.classList.add('active');
	});
	DOM.vliList.appendChild(customEntry);

	DOM.vliCustomForm.style.display = 'none';
}

function _selectVLI(id) {
	_vliSelected = id;
	_vliCustomMode = false;
	DOM.vliCustomForm.style.display = 'none';
	DOM.vliList.querySelectorAll('.vli-item').forEach(el => {
		el.classList.toggle('active', el.dataset.id === id);
	});
}

function _openVLIPanel() {
	_buildVLIList();
	DOM.vliPanel.classList.add('open');
	_navOnOpen();
}

function _closeVLIPanel() {
	DOM.vliPanel.classList.remove('open');
	_navOnClose();
}

function _confirmVLI() {
	if (_vliCustomMode) {
		const cha = parseFloat(DOM.vliCustomCha.value);
		const name = DOM.vliCustomName.value.trim();
		if (isNaN(cha) || Math.abs(cha) >= 1) {
			_showToast('偏移量绝对值应小于1');
			return;
		}
		addCustomVLI(cha, name);
	} else if (_vliSelected) {
		setVLI(_vliSelected);
	}
	_closeVLIPanel();
	qu_SuiPu(state.currentSui);
	renderAll();
}

// ========== 汉堡菜单 ==========
function _openHamburger() {
	DOM.hamburgerMenu.classList.add('open');
	_navOnOpen();
}

function _closeHamburger() {
	DOM.hamburgerMenu.classList.remove('open');
}

// ========== Nian输入 ==========
function _confirmNian() {
	const nian = parseInt(DOM.nianInput.value);
	if (isNaN(nian)) {
		_cancelNian();
		return;
	}
	const sui = _nianToSui(nian);
	if (sui < -1300 || sui > 6600) {
		_showToast('岁取值范围：HX.-1300～HX6600');
		return;
	}
	_switchSui(sui);
	DOM.nianDisplay.classList.remove('hidden');
	DOM.nianInputWrap.classList.remove('open');
	_navOnClose();
}

function _cancelNian() {
	DOM.nianDisplay.classList.remove('hidden');
	DOM.nianInputWrap.classList.remove('open');
	_navOnClose();
}

// ========== 岁/节切换 ==========
async function _switchSui(sui) {
	if (sui < -1300 || sui > 6600) return;
	state.currentSui = sui;
	await _ensureSuiPu(sui);
	state.currentHao = 1;
	state.eraIndex = 0;
	renderAll();
	_preloadAdjacentSui();
}

async function _switchJie(jie) {
	if (jie < 1 || jie > 12) {
		if (jie < 1) {
			await _switchSui(state.currentSui - 1);
			state.currentJie = 12;
		} else {
			await _switchSui(state.currentSui + 1);
			state.currentJie = 1;
		}
		renderAll();
		return;
	}
	state.currentJie = jie;
	state.currentHao = 1;
	renderAll();
}

// ========== 节下拉 ==========
function _toggleJieDropdown(e) {
	e.stopPropagation();
	const sp = _getCurrentSuiPu();
	if (!sp) return;

	DOM.jieDropdown.innerHTML = '';
	for (let i = 1; i <= 12; i++) {
		const opt = document.createElement('div');
		opt.className = 'jie-option' + (i === state.currentJie ? ' active' : '');
		opt.textContent = sp.Jie_Zi[i];
		opt.addEventListener('click', () => {
			DOM.jieDropdown.classList.remove('open');
			_navOnClose();
			_switchJie(i);
		});
		DOM.jieDropdown.appendChild(opt);
	}

	// 定位
	const rect = DOM.jieName.getBoundingClientRect();
	DOM.jieDropdown.style.top = (rect.bottom + 2) + 'px';
	DOM.jieDropdown.style.left = (rect.left - 7.5) + 'px';
	DOM.jieDropdown.classList.toggle('open');
	if (DOM.jieDropdown.classList.contains('open')) {
		_navOnOpen();
	} else {
		_navOnClose();
	}
}

// ========== 今按钮 ==========
async function _goToday() {
	const today = JL_Jin();
	state.todaySui = today.S;
	state.todayJie = today.J;
	state.todayHao = today.R;
	state.currentSui = today.S;
	state.currentJie = today.J;
	state.currentHao = today.R;
	await _ensureSuiPu(state.currentSui);
	renderAll();
	_preloadAdjacentSui();
}

// ========== 单元格点击 ==========
async function _onCellClick(idx, sui, jieIdx) {
	const suiChanged = sui && sui !== state.currentSui;
	const jieChanged = jieIdx && jieIdx !== state.currentJie;
	if (suiChanged) {
		state.currentSui = sui;
		await _ensureSuiPu(sui);
	}
	if (jieChanged) {
		state.currentJie = jieIdx;
	}
	const sp = _getCurrentSuiPu();
	if (!sp) return;
	const cell = sp.SBiao[idx];
	if (!cell || !cell.JL) return;

	state.currentHao = cell.JL[1];
	if (suiChanged || jieChanged) {
		renderBar2();
	}
	renderCalendar();
	renderDetails();
	renderBar7();
}

// ========== 日历拖动滚动 ==========
let dragState = null;

function _initCalendarDrag() {
	const el = DOM.barCalendar;

	el.addEventListener('touchstart', _onDragStart, { passive: false });
	el.addEventListener('touchmove', _onDragMove, { passive: false });
	el.addEventListener('touchend', _onDragEnd);
	el.addEventListener('mousedown', _onDragStart);
	document.addEventListener('mousemove', _onDragMove);
	document.addEventListener('mouseup', _onDragEnd);
}

function _onDragStart(e) {
	const startY = e.touches ? e.touches[0].clientY : e.clientY;
	dragState = {
		startY,
		currentY: startY,
		moved: false,
	};
}

function _onDragMove(e) {
	if (!dragState) return;
	const y = e.touches ? e.touches[0].clientY : e.clientY;
	const dy = y - dragState.startY;
	dragState.currentY = y;
	if (Math.abs(dy) > 5) {
		dragState.moved = true;
	}
	if (!dragState.moved) return;
	const newOffset = calendarVS.baseOffset + dy;
	DOM.calendarGrid.style.transform = `translateY(${newOffset}px)`;
	if (e.touches) e.preventDefault();
}

function _onDragEnd(e) {
	if (!dragState) return;
	const dy = dragState.currentY - dragState.startY;
	const threshold = calendarVS.currentSectionHeight * 0.4;

	if (dragState.moved && Math.abs(dy) > threshold) {
		// 吸附到目标节：先动画，再切换
		const targetOffset = dy > 0
			? calendarVS.baseOffset + calendarVS.currentSectionHeight  // 上一节
			: calendarVS.baseOffset - calendarVS.currentSectionHeight; // 下一节

		DOM.calendarGrid.style.transition = 'transform 300ms ease-out';
		DOM.calendarGrid.style.transform = `translateY(${targetOffset}px)`;

		const direction = dy > 0 ? -1 : 1;
		setTimeout(() => {
			DOM.calendarGrid.style.transition = '';
			_switchJie(state.currentJie + direction);
		}, 300);
	} else {
		// 吸附回当前节
		DOM.calendarGrid.style.transition = 'transform 300ms ease-out';
		DOM.calendarGrid.style.transform = `translateY(${calendarVS.baseOffset}px)`;

		setTimeout(() => {
			DOM.calendarGrid.style.transition = '';
		}, 300);
	}

	dragState = null;
}

// ========== 预加载相邻岁 ==========
async function _preloadAdjacentSui() {
	if (state.currentJie <= 1) {
		await _ensureSuiPu(state.currentSui - 1);
	}
	if (state.currentJie >= 12) {
		await _ensureSuiPu(state.currentSui + 1);
	}
}

// ========== 设置页 ==========
function _openSettingsPage() {
	_syncSettingsUI();
	DOM.settingsPage.classList.add('open');
	_navOnOpen();
}

function _closeSettingsPage() {
	DOM.settingsPage.classList.remove('open');
	if (_fontSubmenuKey) _closeFontSubmenu(false);
	_navOnClose();
}

function _closeFontSubmenu(commit) {
	if (!_fontSubmenuKey) return;
	if (commit) {
		commitFontPreview();
		_showToast('字体设置已应用');
	} else {
		cancelFontPreview();
	}
	_fontDirty = false;
	_fontSubmenuKey = null;
	DOM.fontOverlay.classList.remove('open');
	DOM.fontSubmenu.classList.remove('open');
	document.querySelectorAll('.sp-font-row').forEach(r => r.classList.remove('active'));
	_syncFontSettingsUI();
	_navOnClose();
}

function _openIEPage() {
	_updateBijiFileBtn();
	DOM.iePage.classList.add('open');
	_navOnOpen();
}

function _closeIEPage() {
	DOM.iePage.classList.remove('open');
	_navOnClose();
}

// ========== Biji Overview ==========
let _boState = {
	startSui: null,
	endSui: null,
	asc: true,
	selectMode: false,
	selectedKeys: new Set(),
	expandedKeys: new Set(),
	iconFilter: new Set(),
	searchQuery: '',
	allExpanded: false,
};

function _hasAnyBiji() {
	for (let i = 0; i < localStorage.length; i++) {
		const key = localStorage.key(i);
		if (key && !key.startsWith('_') && !isNaN(parseInt(key))) {
			try {
				const data = JSON.parse(localStorage.getItem(key) || '{}');
				for (const hj of Object.keys(data)) {
					if (data[hj] && data[hj].length > 0) return true;
				}
			} catch(e) {}
		}
	}
	return false;
}

function _updateBijiOverviewVisibility() {
	DOM.menuBijiOverview.style.display = _hasAnyBiji() ? '' : 'none';
}

function _openBijiOverview() {
	_boState = {
		startSui: null,
		endSui: null,
		asc: true,
		selectMode: false,
		selectedKeys: new Set(),
		expandedKeys: new Set(),
		iconFilter: new Set(),
		searchQuery: '',
		allExpanded: false,
	};
	DOM.boSortOrder.textContent = '↑';
	DOM.boSortOrder.dataset.asc = '1';
	DOM.boSelectRow.style.display = 'none';
	DOM.boSuiRow.style.display = 'none';
	DOM.boSearchRow.style.display = 'none';
	DOM.boIconFilterRow.style.display = 'none';
	DOM.boSelectAll.classList.remove('active');
	DOM.boExpandAll.classList.remove('active');
	DOM.boIconFilter.classList.remove('active');
	DOM.boSearch.classList.remove('active');
	_renderBijiOverview();
	DOM.boPage.classList.add('open');
	_navOnOpen();
}

function _closeBijiOverview() {
	DOM.boPage.classList.remove('open');
	_navOnClose();
}

function _collectBijiInRange() {
	const startSui = _boState.startSui;
	const endSui = _boState.endSui;
	const results = [];
	for (let i = 0; i < localStorage.length; i++) {
		const key = localStorage.key(i);
		if (!key || key.startsWith('_')) continue;
		const sui = parseInt(key);
		if (isNaN(sui)) continue;
		if (startSui != null && sui < startSui) continue;
		if (endSui != null && sui > endSui) continue;
		let data;
		try { data = JSON.parse(localStorage.getItem(key) || '{}'); } catch(e) { continue; }
		for (const hjStr of Object.keys(data)) {
			const hj = parseInt(hjStr);
			if (isNaN(hj)) continue;
			const notes = data[hjStr];
			if (!notes || !notes.length) continue;
			for (let idx = 0; idx < notes.length; idx++) {
				const n = notes[idx];
				results.push({
					sui,
					hj,
					idx,
					icon: n.icon || '\u2711',
					biji: n.biji || '',
					created: n.created || 0,
					updated: n.updated || 0,
					key: sui + ':' + hj + ':' + idx,
				});
			}
		}
	}
	results.sort((a, b) => {
		const da = a.sui * 10000 + a.hj;
		const db = b.sui * 10000 + b.hj;
		return _boState.asc ? da - db : db - da;
	});
	return results;
}

function _renderBijiOverview() {
	let notes = _collectBijiInRange();
	if (_boState.iconFilter.size > 0) {
		notes = notes.filter(n => _boState.iconFilter.has(n.icon));
	}
	if (_boState.searchQuery) {
		const q = _boState.searchQuery.toLowerCase();
		if (notes.length > 999) {
			_showToast('搜索范围笔记较多，可能耗时较长');
		}
		notes = notes.filter(n => n.biji.toLowerCase().includes(q));
	}
	DOM.boBody.innerHTML = '';
	if (notes.length === 0) {
		DOM.boBody.innerHTML = '<div class="bo-empty">暂无笔记</div>';
		return;
	}
	const countEl = document.createElement('div');
	countEl.className = 'bo-count';
	countEl.textContent = '共 ' + notes.length + ' 条';
	DOM.boBody.appendChild(countEl);
	const groups = new Map();
	for (const n of notes) {
		const gk = n.sui + ':' + n.hj;
		if (!groups.has(gk)) groups.set(gk, { sui: n.sui, hj: n.hj, items: [] });
		groups.get(gk).items.push(n);
	}
	for (const [, g] of groups) {
		const groupLabel = document.createElement('div');
		groupLabel.className = 'bo-date-label';
		let sjr = { S: g.sui, J: 1, R: 1 };
		try {
			const r = jl.HJvSJRSh(g.hj, 0).SJR;
			if (r) sjr = r;
		} catch(e) {}
		groupLabel.textContent = sjr.S + '岁' + Jie_Ming[sjr.J] + sjr.R + '号';
		DOM.boBody.appendChild(groupLabel);
		const list = document.createElement('div');
		list.className = 'biji-list bo-group-list';
		for (let ni = 0; ni < g.items.length; ni++) {
			const n = g.items[ni];
			const item = document.createElement('div');
			item.className = 'biji-item' + (_boState.expandedKeys.has(n.key) ? ' expanded' : '');
			item.dataset.key = n.key;
			const summary = document.createElement('div');
			summary.className = 'biji-item-summary';
			if (_boState.selectMode) {
				const check = document.createElement('input');
				check.type = 'checkbox';
				check.className = 'bo-note-check';
				check.checked = _boState.selectedKeys.has(n.key);
				check.addEventListener('click', (e) => e.stopPropagation());
				check.addEventListener('change', () => {
					if (check.checked) _boState.selectedKeys.add(n.key);
					else _boState.selectedKeys.delete(n.key);
				});
				summary.appendChild(check);
			}
			const iconSpan = document.createElement('span');
			iconSpan.className = 'biji-icon';
			iconSpan.textContent = n.icon || biji.BIJI_DEFAULT_ICON;
			summary.appendChild(iconSpan);
			summary.appendChild(document.createTextNode(' ' + _bijiSummaryText(n.biji)));
			item.appendChild(summary);
			const expand = document.createElement('div');
			expand.className = 'biji-item-expand';
			const expIcon = document.createElement('span');
			expIcon.className = 'biji-icon';
			expIcon.textContent = n.icon || biji.BIJI_DEFAULT_ICON;
			expand.appendChild(expIcon);
			expand.appendChild(document.createTextNode(' ' + _bijiExpandText(n.biji)));
			item.appendChild(expand);
			const actions = document.createElement('div');
			actions.className = 'biji-item-actions';
			const btnEdit = document.createElement('button');
			btnEdit.textContent = '✎';
			btnEdit.title = '编辑';
			btnEdit.addEventListener('click', (e) => {
				e.stopPropagation();
				_bijiOpenEditForSui(n.sui, n.hj, n.idx);
			});
			const btnUp = document.createElement('button');
			btnUp.textContent = '⇧';
			btnUp.title = '上移';
			btnUp.disabled = ni === 0;
			btnUp.addEventListener('click', (e) => {
				e.stopPropagation();
				biji.moveNote(n.sui, n.hj, n.idx, n.idx - 1);
				_renderBijiOverview();
				renderBar7();
			});
			const btnDown = document.createElement('button');
			btnDown.textContent = '⇩';
			btnDown.title = '下移';
			btnDown.disabled = ni === g.items.length - 1;
			btnDown.addEventListener('click', (e) => {
				e.stopPropagation();
				biji.moveNote(n.sui, n.hj, n.idx, n.idx + 1);
				_renderBijiOverview();
				renderBar7();
			});
			const btnCollapse = document.createElement('button');
			btnCollapse.textContent = '⧋';
			btnCollapse.title = '收起';
			btnCollapse.addEventListener('click', (e) => {
				e.stopPropagation();
				item.classList.remove('expanded');
				const ex = item.querySelector('.biji-item-expand');
				if (ex) { ex.style.maxHeight = ''; ex.style.minHeight = ''; }
				_boState.expandedKeys.delete(n.key);
			});
			actions.append(btnEdit, btnUp, btnDown, btnCollapse);
			item.appendChild(actions);
			item.addEventListener('click', () => {
				const wasExpanded = item.classList.contains('expanded');
				clearTimeout(_boActionsTimer);
				if (wasExpanded) {
					if (_boActionsVisible) {
						_boActionsVisible = false;
						item.classList.remove('actions-visible');
						_boActionsTimer = setTimeout(() => {
							if (_boActionsVisible) return;
							item.classList.remove('actions-visible');
						}, 0);
					} else {
						_boActionsVisible = true;
						item.classList.add('actions-visible');
						_boActionsTimer = setTimeout(() => {
							_boActionsVisible = false;
							item.classList.remove('actions-visible');
						}, 5000);
					}
					return;
				}
				DOM.boBody.querySelectorAll('.biji-item.expanded').forEach(el => {
					el.classList.remove('expanded', 'actions-visible');
					const ex = el.querySelector('.biji-item-expand');
					if (ex) { ex.style.maxHeight = ''; ex.style.minHeight = ''; }
				});
				item.classList.add('expanded');
				_boState.expandedKeys.add(n.key);
				_boActionsVisible = false;
				_updateBOExpandMaxHeight(item);
			});
			list.appendChild(item);
		}
		DOM.boBody.appendChild(list);
	}
	DOM.boBody.querySelectorAll('.biji-item.expanded').forEach(item => {
		_updateBOExpandMaxHeight(item);
	});
}

function _collectIcons(notes) {
	const icons = new Set();
	for (const n of notes) icons.add(n.icon);
	return [...icons];
}

function _renderIconFilter() {
	const notes = _collectBijiInRange();
	const icons = _collectIcons(notes);
	DOM.boIconList.innerHTML = '';
	for (const icon of icons) {
		const el = document.createElement('span');
		el.className = 'bo-icon-item' + (_boState.iconFilter.has(icon) ? ' active' : '');
		el.textContent = icon;
		el.addEventListener('click', () => {
			if (_boState.iconFilter.has(icon)) _boState.iconFilter.delete(icon);
			else _boState.iconFilter.add(icon);
			_renderIconFilter();
			_renderBijiOverview();
		});
		DOM.boIconList.appendChild(el);
	}
}

function _bindBijiOverviewEvents() {
	DOM.boSelectAll.addEventListener('click', () => {
		_boState.selectMode = !_boState.selectMode;
		DOM.boSelectAll.classList.toggle('active', _boState.selectMode);
		DOM.boSelectRow.style.display = _boState.selectMode ? 'flex' : 'none';
		if (!_boState.selectMode) _boState.selectedKeys.clear();
		_renderBijiOverview();
	});
	DOM.boSelectInvert.addEventListener('click', () => {
		const notes = _collectBijiInRange();
		for (const n of notes) {
			if (_boState.selectedKeys.has(n.key)) _boState.selectedKeys.delete(n.key);
			else _boState.selectedKeys.add(n.key);
		}
		_renderBijiOverview();
	});
	DOM.boDeleteSelected.addEventListener('click', () => {
		const count = _boState.selectedKeys.size;
		if (count === 0) return;
		if (!confirm('确认要删除' + count + '条录事吗？删除操作不可恢复。')) return;
		const toDelete = {};
		for (const key of _boState.selectedKeys) {
			const [s, h, i] = key.split(':').map(Number);
			const sk = String(s);
			if (!toDelete[sk]) toDelete[sk] = {};
			if (!toDelete[sk][h]) toDelete[sk][h] = [];
			toDelete[sk][h].push(i);
		}
		for (const sk of Object.keys(toDelete)) {
			const sui = parseInt(sk);
			for (const hj of Object.keys(toDelete[sk])) {
				const indices = toDelete[sk][hj].sort((a, b) => b - a);
				for (const idx of indices) {
					biji.deleteNote(sui, parseInt(hj), idx);
				}
			}
		}
		_boState.selectedKeys.clear();
		_boState.selectMode = false;
		DOM.boSelectAll.classList.remove('active');
		DOM.boSelectRow.style.display = 'none';
		_renderBijiOverview();
		_updateBijiOverviewVisibility();
		renderCalendar();
	});
	DOM.boExpandAll.addEventListener('click', () => {
		_boState.allExpanded = !_boState.allExpanded;
		DOM.boExpandAll.classList.toggle('active', _boState.allExpanded);
		if (_boState.allExpanded) {
			const notes = _collectBijiInRange();
			for (const n of notes) _boState.expandedKeys.add(n.key);
		} else {
			_boState.expandedKeys.clear();
		}
		_renderBijiOverview();
	});
	DOM.boSortOrder.addEventListener('click', () => {
		_boState.asc = !_boState.asc;
		DOM.boSortOrder.textContent = _boState.asc ? '↑' : '↓';
		DOM.boSortOrder.dataset.asc = _boState.asc ? '1' : '0';
		_renderBijiOverview();
	});
	DOM.boIconFilter.addEventListener('click', () => {
		const show = DOM.boIconFilterRow.style.display === 'none';
		DOM.boIconFilterRow.style.display = show ? 'flex' : 'none';
		DOM.boIconFilter.classList.toggle('active', show);
		if (show) {
			_renderIconFilter();
		} else {
			_boState.iconFilter.clear();
			_renderBijiOverview();
		}
	});
	DOM.boIconInvert.addEventListener('click', () => {
		const notes = _collectBijiInRange();
		const icons = _collectIcons(notes);
		for (const icon of icons) {
			if (_boState.iconFilter.has(icon)) _boState.iconFilter.delete(icon);
			else _boState.iconFilter.add(icon);
		}
		_renderIconFilter();
		_renderBijiOverview();
	});
	DOM.boSearch.addEventListener('click', () => {
		const show = DOM.boSearchRow.style.display === 'none';
		DOM.boSearchRow.style.display = show ? 'flex' : 'none';
		DOM.boSearch.classList.toggle('active', show);
		if (show) DOM.boSearchInput.focus();
		else {
			_boState.searchQuery = '';
			DOM.boSearchInput.value = '';
			_renderBijiOverview();
		}
	});
	DOM.boSearchInput.addEventListener('input', () => {
		_boState.searchQuery = DOM.boSearchInput.value.trim();
		_renderBijiOverview();
	});
	DOM.boSearchClose.addEventListener('click', () => {
		DOM.boSearchRow.style.display = 'none';
		DOM.boSearch.classList.remove('active');
		_boState.searchQuery = '';
		DOM.boSearchInput.value = '';
		_renderBijiOverview();
	});
	DOM.boStartSui.addEventListener('focus', () => {
		DOM.boSuiRow.style.display = 'flex';
	});
	DOM.boEndSui.addEventListener('focus', () => {
		DOM.boSuiRow.style.display = 'flex';
	});
	DOM.boSuiConfirm.addEventListener('click', () => {
		const startVal = DOM.boStartSui.value.trim();
		const endVal = DOM.boEndSui.value.trim();
		_boState.startSui = startVal ? parseInt(startVal) : null;
		_boState.endSui = endVal ? parseInt(endVal) : null;
		DOM.boSuiRow.style.display = 'none';
		_renderBijiOverview();
	});
	DOM.boSuiCancel.addEventListener('click', () => {
		DOM.boStartSui.value = '';
		DOM.boEndSui.value = '';
		_boState.startSui = null;
		_boState.endSui = null;
		DOM.boSuiRow.style.display = 'none';
		_renderBijiOverview();
	});
}

function _hsvToHex(h, s, v) {
	const c = v * s;
	const x = c * (1 - Math.abs((h / 60) % 2 - 1));
	const m = v - c;
	let r, g, b;
	if (h < 60) { r = c; g = x; b = 0; }
	else if (h < 120) { r = x; g = c; b = 0; }
	else if (h < 180) { r = 0; g = c; b = x; }
	else if (h < 240) { r = 0; g = x; b = c; }
	else if (h < 300) { r = x; g = 0; b = c; }
	else { r = c; g = 0; b = x; }
	const toHex = n => Math.round((n + m) * 255).toString(16).padStart(2, '0');
	return '#' + toHex(r) + toHex(g) + toHex(b);
}

function _hexToHSV(hex) {
	hex = hex.replace('#', '');
	const r = parseInt(hex.substring(0,2), 16) / 255;
	const g = parseInt(hex.substring(2,4), 16) / 255;
	const b = parseInt(hex.substring(4,6), 16) / 255;
	const max = Math.max(r, g, b), min = Math.min(r, g, b);
	const d = max - min;
	let h = 0, s = max === 0 ? 0 : d / max, v = max;
	if (d !== 0) {
		switch (max) {
			case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
			case g: h = ((b - r) / d + 2) / 6; break;
			case b: h = ((r - g) / d + 4) / 6; break;
		}
	}
	return { h: h * 360, s, v };
}

function _parseHexInput(val) {
	val = val.trim().replace(/^#/, '');
	if (val.length === 3) val = val[0]+val[0]+val[1]+val[1]+val[2]+val[2];
	if (!/^[0-9a-fA-F]{6}$/.test(val)) return null;
	return _hexToHSV('#' + val);
}

function _parseRgbInput(val) {
	const m = val.match(/(\d+)\s*[,\s]\s*(\d+)\s*[,\s]\s*(\d+)/);
	if (!m) return null;
	const r = parseInt(m[1]) / 255, g = parseInt(m[2]) / 255, b = parseInt(m[3]) / 255;
	const max = Math.max(r, g, b), min = Math.min(r, g, b);
	const d = max - min;
	let h = 0, s = max === 0 ? 0 : d / max, v = max;
	if (d !== 0) {
		if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
		else if (max === g) h = ((b - r) / d + 2) / 6;
		else h = ((r - g) / d + 4) / 6;
	}
	return { h: h * 360, s, v };
}

function _parseHslInput(val) {
	const m = val.match(/([\d.]+)\s*[,\s]\s*([\d.]+)%?\s*[,\s]\s*([\d.]+)%?/);
	if (!m) return null;
	const h = parseFloat(m[1]), s = parseFloat(m[2]) / 100, l = parseFloat(m[3]) / 100;
	if (s === 0) {
		const v = l;
		return { h, s: 0, v };
	}
	const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
	const p = 2 * l - q;
	const hue2rgb = (p, q, t) => {
		if (t < 0) t += 1;
		if (t > 1) t -= 1;
		if (t < 1/6) return p + (q - p) * 6 * t;
		if (t < 1/2) return q;
		if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
		return p;
	};
	const r = hue2rgb(p, q, h / 360 + 1/3);
	const g = hue2rgb(p, q, h / 360);
	const b = hue2rgb(p, q, h / 360 - 1/3);
	const max = Math.max(r, g, b);
	const d = max - Math.min(r, g, b);
	return { h, s: max === 0 ? 0 : d / max, v: max };
}

function _updatePickerUI() {
	const { h, s, v } = _pickerHSV;
	DOM.palettePickerSV.style.background =
		'linear-gradient(to bottom, transparent, #000), linear-gradient(to right, #fff, hsl(' + h + ',100%,50%))';
	DOM.palettePickerSVCursor.style.left = (s * 100) + '%';
	DOM.palettePickerSVCursor.style.top = ((1 - v) * 100) + '%';
	DOM.palettePickerHueThumb.style.left = (h / 360 * 100) + '%';
	DOM.palettePickerHueThumb.style.background = 'hsl(' + h + ',100%,50%)';
	const hex = _hsvToHex(h, s, v);
	DOM.paletteConfirmPreview.style.background = hex;
	const c = v * s;
	const x = c * (1 - Math.abs((h / 60) % 2 - 1));
	const m = v - c;
	let r, g, b;
	if (h < 60) { r = c; g = x; b = 0; }
	else if (h < 120) { r = x; g = c; b = 0; }
	else if (h < 180) { r = 0; g = c; b = x; }
	else if (h < 240) { r = 0; g = x; b = c; }
	else if (h < 300) { r = x; g = 0; b = c; }
	else { r = c; g = 0; b = x; }
	const ri = Math.round((r + m) * 255), gi = Math.round((g + m) * 255), bi = Math.round((b + m) * 255);
	const rf = (r + m), gf = (g + m), bf = (b + m);
	const max = Math.max(rf, gf, bf), min = Math.min(rf, gf, bf);
	const l = (max + min) / 2;
	let hh = h, ss = 0;
	if (max !== min) {
		const d = max - min;
		ss = l > 0.5 ? d / (2 - max - min) : d / (max + min);
	}
	DOM.paletteValueHex.value = hex.toUpperCase();
	DOM.paletteValueRgb.value = `rgb(${ri}, ${gi}, ${bi})`;
	DOM.paletteValueHsl.value = `hsl(${Math.round(hh)}, ${Math.round(ss * 100)}%, ${Math.round(l * 100)}%)`;
}

function _getPickerPos(el, e) {
	const rect = el.getBoundingClientRect();
	const cx = e.touches ? e.touches[0].clientX : e.clientX;
	const cy = e.touches ? e.touches[0].clientY : e.clientY;
	return {
		x: Math.max(0, Math.min(1, (cx - rect.left) / rect.width)),
		y: Math.max(0, Math.min(1, (cy - rect.top) / rect.height))
	};
}

function _onSVPick(e) {
	const pos = _getPickerPos(DOM.palettePickerSV, e);
	_pickerHSV.s = pos.x;
	_pickerHSV.v = 1 - pos.y;
	_updatePickerUI();
}

function _onHuePick(e) {
	const pos = _getPickerPos(DOM.palettePickerHue, e);
	_pickerHSV.h = pos.x * 360;
	_updatePickerUI();
}

function _renderCustomPalettes() {
	DOM.paletteGrid.querySelectorAll('.sp-palette-custom').forEach(el => el.remove());
	const addBtn = DOM.paletteAddBtn;
	const customs = getCustomPalettes();
	customs.forEach(cp => {
		const item = document.createElement('div');
		item.className = 'sp-palette-item sp-palette-custom';
		item.dataset.palette = cp.id;
		item.innerHTML = `<div class="sp-palette-swatch" style="background:${cp.hex}"><span class="sp-palette-edit" title="编辑">✎</span><span class="sp-palette-del" title="删除">✕</span></div><div class="sp-palette-label">${cp.name}</div>`;
		item.addEventListener('click', e => {
			if (e.target.classList.contains('sp-palette-del')) {
				e.stopPropagation();
				removeCustomPalette(cp.id);
				_syncSettingsUI();
			} else if (e.target.classList.contains('sp-palette-edit')) {
				e.stopPropagation();
				_editingPaletteId = cp.id;
				_pickerHSV = _hexToHSV(cp.hex);
				DOM.paletteConfirmName.value = cp.name;
				DOM.paletteConfirm.style.display = 'flex';
				_updatePickerUI();
			} else {
				_editingPaletteId = null;
				DOM.paletteConfirm.style.display = 'none';
				setPalette(cp.id);
				_syncSettingsUI();
			}
		});
		let longPressTimer = null;
		item.addEventListener('touchstart', () => {
			longPressTimer = setTimeout(() => {
				item.classList.add('sp-palette-show-actions');
			}, 500);
		}, { passive: true });
		item.addEventListener('touchend', () => { clearTimeout(longPressTimer); });
		item.addEventListener('touchmove', () => { clearTimeout(longPressTimer); });
		DOM.paletteGrid.insertBefore(item, addBtn);
	});
}

function _syncSettingsUI() {
	const s = getAllSettings();

	// 星期名
	const wtRadio = document.querySelector(`input[name="weekdayType"][value="${s.weekdayType}"]`);
	if (wtRadio) wtRadio.checked = true;

	// 主题
	document.querySelector(`input[name="themeMode"][value="${s.themeMode}"]`).checked = true;

	// 配色
	_renderCustomPalettes();
	DOM.paletteGrid.querySelectorAll('.sp-palette-item').forEach(item => {
		item.classList.toggle('active', item.dataset.palette === s.palette);
	});

	// 背景图片
	DOM.bgImageRemoveWrap.style.display = s.bgImageData ? 'flex' : 'none';
	DOM.bgBlurInput.value = s.bgBlur ?? 1;

	DOM.cellShadowToggle.setAttribute('data-value', s.cellShadow ? '1' : '0');
	DOM.zuoRotateToggle.setAttribute('data-value', s.zuoRotateHanzi ? '1' : '0');

	// 更新检查
	DOM.updateCheckInterval.value = String(s.updateCheckInterval);
	_fetchAppVersion();

	// 字体自定义
	_syncFontSettingsUI();
}

function _syncFontSettingsUI() {
	const custom = getCustomFonts();
	document.querySelectorAll('.sp-font-row').forEach(row => {
		const key = row.dataset.fontKey;
		const val = custom[key];
		const valueEl = row.querySelector('.sp-font-row-value');
		const scaleStr = (key !== 'Base' && val && val.scale && val.scale !== 100) ? ` ${val.scale}%` : '';
		if (val && val.type === 'system' && val.name) {
			valueEl.textContent = val.name + scaleStr;
		} else if (val && val.type === 'file' && val.fileName) {
			valueEl.textContent = val.fileName + scaleStr;
		} else if (key !== 'Base' && val && val.scale && val.scale !== 100) {
			valueEl.textContent = val.scale + '%';
		} else {
			valueEl.textContent = '默认';
		}
	});
}

async function _onBgImageSelect() {
	try {
		if (window.showOpenFilePicker) {
			const [handle] = await window.showOpenFilePicker({
				types: [{ description: '图片', accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.gif'] } }],
				multiple: false,
			});
			const file = await handle.getFile();
			const reader = new FileReader();
			reader.onload = () => {
				setBgImageData(reader.result);
				DOM.bgImageRemoveWrap.style.display = 'flex';
			};
			reader.readAsDataURL(file);
		} else {
			const input = document.createElement('input');
			input.type = 'file';
			input.accept = 'image/png,image/jpeg,image/webp,image/gif';
			input.onchange = () => {
				const file = input.files[0];
				if (!file) return;
				const reader = new FileReader();
				reader.onload = () => {
					setBgImageData(reader.result);
					DOM.bgImageRemoveWrap.style.display = 'flex';
				};
				reader.readAsDataURL(file);
			};
			input.click();
		}
	} catch(e) {
		if (e.name !== 'AbortError') _showToast('选择图片失败');
	}
}

// ========== 节庆民俗/每年重复日 导入/导出 ==========
function _validateJieSu(data) {
	if (!data || typeof data !== 'object') throw new Error('须为JSON对象');
	for (const key of Object.keys(data)) {
		if (!Array.isArray(data[key])) throw new Error(key + '须为数组');
		for (const item of data[key]) {
			if (!Array.isArray(item)) throw new Error(key + '的条目须为数组');
			if (typeof item[1] !== 'number' || typeof item[2] !== 'number' || !Array.isArray(item[3]) || typeof item[3][0] !== 'string')
				throw new Error(key + '条目格式：[始行年?, 月, 日, [日历格名, 详情名], 终行年?]');
		}
	}
}

function _validateFuRi(data) {
	if (!data || typeof data !== 'object') throw new Error('须为JSON对象');
	for (const key of Object.keys(data)) {
		if (!Array.isArray(data[key])) throw new Error(key + '须为数组');
		for (const item of data[key]) {
			if (!Array.isArray(item)) throw new Error(key + '的条目须为数组');
			if (typeof item[1] !== 'number' || typeof item[2] !== 'number' || typeof item[3] !== 'string')
				throw new Error(key + '条目格式：[始行年?, 月, 日, 详情名, 终行年?, 图标?]');
		}
	}
}

function _itemIdentity(item, type) {
	if (type === 'JQ') return item[0] + '|' + item[1];
	return item[1] + '|' + item[2] + '|' + (Array.isArray(item[3]) ? item[3][0] : item[3]);
}

function _itemName(item, type) {
	if (type === 'JQ') return item[2][0];
	return Array.isArray(item[3]) ? item[3][0] : item[3];
}

function _itemsEqual(a, b) {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) {
		if (Array.isArray(a[i]) && Array.isArray(b[i])) {
			if (!_itemsEqual(a[i], b[i])) return false;
		} else if (a[i] !== b[i]) {
			return false;
		}
	}
	return true;
}

function _showMergeConflict(name) {
	return new Promise(resolve => {
		DOM.mergeDialogBody.textContent = '「' + name + '」的设定有变化';
		DOM.mergeDialog.classList.add('open');
		_navOnOpen();
		const cleanup = (val) => {
			DOM.mergeDialog.classList.remove('open');
			_navOnClose();
			resolve(val);
		};
		const h1 = () => { cleanup('ignore'); };
		const h2 = () => { cleanup('replace'); };
		const h3 = () => { cleanup('new'); };
		const h4 = () => { cleanup('cancel'); };
		DOM.mergeIgnoreBtn.onclick = h1;
		DOM.mergeReplaceBtn.onclick = h2;
		DOM.mergeNewBtn.onclick = h3;
		DOM.mergeCancelBtn.onclick = h4;
	});
}

async function _mergeWithData(base, incoming, dataType) {
	const result = {};
	const keys = new Set([...Object.keys(base), ...Object.keys(incoming)]);
	for (const key of keys) {
		const bArr = base[key] || [];
		const iArr = incoming[key] || [];
		const merged = [...bArr];
		for (const item of iArr) {
			const id = _itemIdentity(item, key);
			const idx = merged.findIndex(m => _itemIdentity(m, key) === id);
			if (idx === -1) {
				merged.push(item);
			} else if (_itemsEqual(merged[idx], item)) {
				continue;
			} else {
				const name = _itemName(item, key);
				const choice = await _showMergeConflict(name);
				if (choice === 'replace') {
					merged[idx] = item;
				} else if (choice === 'new') {
					merged.push(item);
				} else if (choice === 'cancel') {
					return null;
				}
			}
		}
		result[key] = merged;
	}
	return result;
}

async function _rebuildAfterDataChange() {
	await ensureDataForSuiPu(state.currentSui);
	qu_SuiPu.clearCache();
	qu_SuiPu(state.currentSui);
	renderAll();
}

async function _importJieSu() {
	try {
		const mode = DOM.jieSuImportModeToggle.getAttribute('data-value') === '1' ? 'replace' : 'merge';
		if (window.showOpenFilePicker) {
			const [handle] = await window.showOpenFilePicker({
				types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
				multiple: false,
			});
			const file = await handle.getFile();
			const text = await readFileAsText(file);
			const data = JSON.parse(text);
			_validateJieSu(data);
			const result = mode === 'replace' ? data : await _mergeWithData(getJieSu(), data, 'jieSu');
			if (!result) { _showToast('导入已取消'); return; }
			setJieSu(result);
			_rebuildAfterDataChange();
			_showToast(mode === 'replace' ? '节庆民俗列表已替换' : '节庆民俗列表已合并', 3000);
		} else {
			const input = document.createElement('input');
			input.type = 'file'; input.accept = '.json';
			input.onchange = async () => {
				const file = input.files[0];
				if (!file) return;
				try {
					const text = await readFileAsText(file);
					const data = JSON.parse(text);
					_validateJieSu(data);
					const result = mode === 'replace' ? data : await _mergeWithData(getJieSu(), data, 'jieSu');
					if (!result) { _showToast('导入已取消'); return; }
					setJieSu(result);
					_rebuildAfterDataChange();
					_showToast(mode === 'replace' ? '节庆民俗列表已替换' : '节庆民俗列表已合并', 3000);
				} catch(e) { _showToast('导入失败：' + e.message); }
			};
			input.click();
		}
	} catch(e) {
		if (e.name !== 'AbortError') _showToast('导入失败：' + e.message);
	}
}

async function _saveFile(content, filename, mime) {
	if (window.showSaveFilePicker) {
		try {
			const ext = filename.slice(filename.lastIndexOf('.'));
			const handle = await window.showSaveFilePicker({
				suggestedName: filename,
				types: [{ description: ext.slice(1).toUpperCase(), accept: { [mime]: [ext] } }],
			});
			const writable = await handle.createWritable();
			await writable.write(content);
			await writable.close();
			return;
		} catch(e) {
			if (e.name === 'AbortError') throw e;
		}
	}
	const blob = new Blob([content], { type: mime });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url; a.download = filename;
	a.style.display = 'none';
	document.body.appendChild(a); a.click();
	setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
}

async function _exportJieSu() {
	try {
		const data = getJieSu();
		const content = JSON.stringify(data, null, '\t') + '\n';
		await _saveFile(content, 'JieSu.json', 'application/json');
		_showToast('节庆民俗列表已导出', 3000);
	} catch(e) {
		if (e.name !== 'AbortError') _showToast('导出失败：' + e.message);
	}
}

async function _importFuRi() {
	try {
		const mode = DOM.fuRiImportModeToggle.getAttribute('data-value') === '1' ? 'replace' : 'merge';
		if (window.showOpenFilePicker) {
			const [handle] = await window.showOpenFilePicker({
				types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
				multiple: false,
			});
			const file = await handle.getFile();
			const text = await readFileAsText(file);
			const data = JSON.parse(text);
			_validateFuRi(data);
			const result = mode === 'replace' ? data : await _mergeWithData(getFuRi(), data, 'fuRi');
			if (!result) { _showToast('导入已取消'); return; }
			setFuRi(result);
			_rebuildAfterDataChange();
			_showToast(mode === 'replace' ? '每年重复日列表已替换' : '每年重复日列表已合并', 3000);
		} else {
			const input = document.createElement('input');
			input.type = 'file'; input.accept = '.json';
			input.onchange = async () => {
				const file = input.files[0];
				if (!file) return;
				try {
					const text = await readFileAsText(file);
					const data = JSON.parse(text);
					_validateFuRi(data);
					const result = mode === 'replace' ? data : await _mergeWithData(getFuRi(), data, 'fuRi');
					if (!result) { _showToast('导入已取消'); return; }
					setFuRi(result);
					_rebuildAfterDataChange();
					_showToast(mode === 'replace' ? '每年重复日列表已替换' : '每年重复日列表已合并', 3000);
				} catch(e) { _showToast('导入失败：' + e.message); }
			};
			input.click();
		}
	} catch(e) {
		if (e.name !== 'AbortError') _showToast('导入失败：' + e.message);
	}
}

async function _exportFuRi() {
	try {
		const data = getFuRi();
		const content = JSON.stringify(data, null, '\t') + '\n';
		await _saveFile(content, 'FuRi.json', 'application/json');
		_showToast('每年重复日列表已导出', 3000);
	} catch(e) {
		if (e.name !== 'AbortError') _showToast('导出失败：' + e.message);
	}
}

function _resetJieSu() {
	setJieSu(null);
	_rebuildAfterDataChange();
	_showToast('节庆民俗列表已恢复预设', 3000);
}

function _resetFuRi() {
	setFuRi(null);
	_rebuildAfterDataChange();
	_showToast('每年重复日列表已恢复预设', 3000);
}

// ========== 换算工具页 ==========
function _openConvertPage() {
	DOM.convertPage.classList.add('open');
	_navOnOpen();
}

function _closeConvertPage() {
	DOM.convertPage.classList.remove('open');
	_navOnClose();
}

// ========== 信息页 ==========
const _infoPageCache = {};
const _infoPageStack = []; // { name, title, scrollTop }
let _infoPageCurrent = null;

function _renderEmailLink() {
	const placeholder = DOM.ipBody?.querySelector('#emailPlaceholder');
	if (placeholder) {
		const user = 'suiyue.li';
		const domain = 'outlook.com';
		const email = user + '@' + domain;
		const a = document.createElement('a');
		a.href = 'mailto:' + email;
		a.target = '_blank';
		a.rel = 'noopener noreferrer';
		a.textContent = email;
		placeholder.replaceWith(a);
	}
}

function _infoPageRestore(name, title) {
	DOM.ipTitle.textContent = title;
	DOM.ipBody.innerHTML = _infoPageCache[name] || '<div class="page-placeholder">加载失败</div>';
	if (name === 'GuanYu') _renderEmailLink();
}

async function _openInfoPage(name, title) {
	// infoPage 已打开时，将当前状态压栈
	if (_infoPageCurrent && DOM.infoPage.classList.contains('open')) {
		_infoPageStack.push({ ..._infoPageCurrent, scrollTop: DOM.ipBody.scrollTop });
	}
	_infoPageCurrent = { name, title };

	DOM.ipTitle.textContent = title;
	DOM.ipBody.scrollTop = 0;
	if (_infoPageCache[name]) {
		DOM.ipBody.innerHTML = _infoPageCache[name];
	} else {
		DOM.ipBody.innerHTML = '<div class="page-placeholder">加载中…</div>';
		try {
			const resp = await fetch('pages/' + name + '.html');
			if (!resp.ok) throw new Error(resp.status);
			const html = await resp.text();
			_infoPageCache[name] = html;
			DOM.ipBody.innerHTML = html;
		} catch(e) {
			DOM.ipBody.innerHTML = '<div class="page-placeholder">加载失败</div>';
		}
	}
	if (name === 'GuanYu') _renderEmailLink();
	if (!DOM.infoPage.classList.contains('open')) {
		DOM.infoPage.classList.add('open');
		_navOnOpen();
	}
}

function _closeInfoPage() {
	if (_infoPageStack.length > 0) {
		const prev = _infoPageStack.pop();
		_infoPageCurrent = prev;
		_infoPageRestore(prev.name, prev.title);
		DOM.ipBody.scrollTop = prev.scrollTop;
		return;
	}
	_infoPageCurrent = null;
	_infoPageStack.length = 0;
	DOM.infoPage.classList.remove('open');
	_navOnClose();
}



function _getRadioVal(name) {
	const el = document.querySelector('input[name="' + name + '"]:checked');
	return el ? parseInt(el.value) : 0;
}

function _calcLng2Cha(mode) {
	let lng;
	let resultEl;
	if (mode === 'dms') {
		const d = parseFloat(DOM.lngD.value);
		const m = parseFloat(DOM.lngM.value);
		const s = parseFloat(DOM.lngS.value);
		if (!Number.isInteger(d) || !Number.isInteger(m) || !Number.isInteger(s)) { _showToast('请输入经度'); return; }
		lng = d + m / 60 + s / 3600;
		resultEl = DOM.lngDmsResult;
	} else {
		lng = parseFloat(DOM.lngDegreeInput.value);
		if (!Number.isFinite(lng)) { _showToast('请输入经度'); return; }
		resultEl = DOM.lngDegResult;
	}
	const r = lng2cha(lng);
	resultEl.innerHTML =
		'&ensp;•&ensp;' + r.hms.sign + r.hms.H + ' 时 ' + r.hms.M + ' 分 ' + r.hms.S + ' 秒<br/>&ensp;•&ensp;' + (r.day >= 0 ? '+' : '') + r.day.toFixed(5) + ' 日';
}

function _calcD2HMS() {
	let v = parseFloat(DOM.d2hmsInput.value);
	if (!Number.isFinite(v)) { _showToast('请输入小数日'); return; }
	let d = Math.floor(v);
	v -= d;
	let ds = d ? String(d) + ' 日 + ' : '';
	const r = D2HMS(v, 3);
	DOM.d2hmsResult.innerHTML =
		ds + r.H + ' 时 ' + r.M + ' 分 ' + r.S + ' 秒';
}

function _calcHMS2D() {
	const h = parseFloat(DOM.hms2dH.value);
	const m = parseFloat(DOM.hms2dM.value);
	const s = parseFloat(DOM.hms2dS.value);
	if (!Number.isInteger(h) || !Number.isInteger(m) || !Number.isInteger(s)) { _showToast('请输入时分秒'); return; }
	const day = (h * 3600 + m * 60 + s) / 86400;
	DOM.hms2dResult.innerHTML =
		day.toFixed(5) + ' 日';
}

function _calcJL2HJ() {
	const sui = parseInt(DOM.jl2hjSui.value);
	const jie = parseInt(DOM.jl2hjJie.value);
	const hao = parseInt(DOM.jl2hjHao.value);
	if (!Number.isInteger(sui) || !Number.isInteger(jie) || !Number.isInteger(hao)) { _showToast('请输入完整的节历日期'); return; }
	const j12d = jl.jJieYue(sui).RiShu;
	if (hao > j12d[jie]) { _showToast('请输入正确的节历日期'); return; }
	const shu = _getRadioVal('jlJiRiType');
	const result = jl.SJRvHJ(sui, jie, hao, shu);
	const typeName = shu === -1 ? 'JD' : shu === 0 ? 'MJD' : 'HJ';
	DOM.jl2hjResult.textContent = typeName + '：' + result;
}

function _calcHJ2JL() {
	const hj = parseFloat(DOM.hj2jlInput.value);
	if (!Number.isFinite(hj)) { _showToast('请输入花甲积日数'); return; }
	if (hj < -255992) { _showToast('请输入大于等于-255992的花甲积日数'); return; } // HX.-1300.01.01
	if (hj >= 2629791) { _showToast('请输入小于2629791的花甲积日数'); return; } // HX6601.01.01
	const r = jl.HJvSJRSh(hj, 3);
	DOM.hj2jlResult.innerHTML =
		'华夏 ' + r.SJR.S + ' 岁 ' + Jie_Ming[r.SJR.J] + ' ' + r.SJR.R + ' 日 ' +
		((r.Shi.H || r.Shi.M || r.Shi.S) ? '　' + r.Shi.H + ' 时 ' + r.Shi.M + ' 分 ' + r.Shi.S + ' 秒' : '');
}

function _calcWC2HJ() {
	const y = parseInt(DOM.wc2hjY.value);
	const m = parseInt(DOM.wc2hjM.value);
	const d = parseInt(DOM.wc2hjD.value);
	if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) { _showToast('请输入完整的西历日期'); return; }
	if (y === 1582 && m === 10 && d > 4 && d < 15) { _showToast('西历1582年10月没有5～14日'); return; }
	else {
		const m12d = wc.wMonths(y).Days;
		if (d > m12d[m] && !(y === 1582 && m === 10)) { _showToast('请输入正确的西历日期'); return; }
		else if (d > 31) { _showToast('请输入正确的西历日期'); return; }
	}
	const shu = _getRadioVal('wcJiRiType');
	const result = wc.wYMD2MJD(y, m, d, shu);
	const typeName = shu === -1 ? 'JD' : shu === 0 ? 'MJD' : 'HJ';
	DOM.wc2hjResult.textContent = typeName + '：' + result;
}

function _calcHJ2WC() {
	const mjd = parseFloat(DOM.hj2wcInput.value);
	if (!Number.isFinite(mjd)) { _showToast('请输入MJD积日数'); return; }
	if (mjd < -2400001) { _showToast('请输入大于等于-2400001的简化儒略日数'); return; } // 西元前4713年1月1日
	if (mjd >= 782395) { _showToast('请输入小于782395的简化儒略日数'); return; } // 西元4001.01.01
	const r = wc.MJD2wYMDT(mjd, 3);
	const yn = r.YMD.Y < 1 ? '西元前 ' + String(1 - r.YMD.Y) + ' 年 ' : '西元 ' + String(r.YMD.Y) + ' 年 ';
	DOM.hj2wcResult.innerHTML =
		yn + r.YMD.M + ' 月 ' + r.YMD.D + ' 日' +
		((r.Time.H || r.Time.M || r.Time.S) ? '　' + r.Time.H + ' 时 ' + r.Time.M + ' 分 ' + r.Time.S + ' 秒' : '');
}

function _calcJL2WC() {
	const sui = parseInt(DOM.jl2wcSui.value);
	const jie = parseInt(DOM.jl2wcJie.value);
	const hao = parseInt(DOM.jl2wcHao.value);
	if (!Number.isInteger(sui) || !Number.isInteger(jie) || !Number.isInteger(hao)) { _showToast('请输入完整的节历日期'); return; }
	const j12d = jl.jJieYue(sui).RiShu;
	if (hao > j12d[jie]) { _showToast('请输入正确的节历日期'); return; }
	const mjd = jl.SJRvHJ(sui, jie, hao, 0);
	const r = wc.MJD2wYMDT(mjd, 0);
	const yn = r.YMD.Y < 1 ? '西元前 ' + String(1 - r.YMD.Y) + ' 年 ' : '西元 ' + String(r.YMD.Y) + ' 年 ';
	DOM.jl2wcResult.innerHTML =
		yn + r.YMD.M + ' 月 ' + r.YMD.D + ' 日';
}

function _calcWC2JL() {
	const y = parseInt(DOM.wc2jlY.value);
	const m = parseInt(DOM.wc2jlM.value);
	const d = parseInt(DOM.wc2jlD.value);
	if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) { _showToast('请输入完整的西历日期'); return; }
	if (y === 1582 && m === 10 && d > 4 && d < 15) { _showToast('西历1582年10月没有5～14日'); return; }
	else {
		const m12d = wc.wMonths(y).Days;
		if (d > m12d[m] && !(y === 1582 && m === 10)) { _showToast('请输入正确的西历日期'); return; }
		else if (d > 31) { _showToast('请输入正确的西历日期'); return; }
	}
	const hj = wc.wYMD2MJD(y, m, d, 1);
	const r = jl.HJvSJRSh(hj, 0);
	DOM.wc2jlResult.innerHTML =
		'华夏 ' + r.SJR.S + ' 岁 ' + Jie_Ming[r.SJR.J] + ' ' + r.SJR.R + ' 日';
}

// ========== Toast ==========
let toastTimer = null;
function _showToast(msg, duration) {
	DOM.toast.textContent = msg;
	DOM.toast.classList.add('show');
	if (toastTimer) clearTimeout(toastTimer);
	toastTimer = setTimeout(() => {
		DOM.toast.classList.remove('show');
	}, duration || 5200);
}

// ========== 更新检查 ==========
function _initSWMessageListener() {
	if (!navigator.serviceWorker) return;
	navigator.serviceWorker.addEventListener('message', event => {
		const data = event.data;
		if (!data) return;

		if (data.type === 'SW_UPDATED') {
			// 非手动更新流程触发的 SW 更新（如浏览器自动更新），静默处理
			if (!_updateCheckMode) {
				_fetchAppVersion();
			}
		}

		if (data.type === 'UPDATE_RESULT') {
			if (_updateCheckMode === 'auto') {
				if (data.hasUpdate) {
					// 远端版本比忽略版本新时，清除忽略标记
					const ignoredVer = getAutoUpdateIgnoredVersion();
					if (ignoredVer && data.remoteVersion !== ignoredVer) {
						setAutoUpdateIgnoredVersion(null);
						setAutoUpdateFailCount(0);
					}
					// 跳过已忽略的版本
					if (data.remoteVersion === getAutoUpdateIgnoredVersion()) {
						setLastUpdateCheck(HJ_Jin());
						_updateCheckMode = null;
						return;
					}
					_applyUpdate();
					// _updateCheckMode 由 _applyUpdate 的 onUpdateDone/onUpdateFail 清除
					return;
				}
				setLastUpdateCheck(HJ_Jin());
				_updateCheckMode = null;
				return;
			}

			if (data.error) {
				DOM.updateStatusText.textContent = '检查失败';
				_showToast('检查更新失败，请稍后重试');
				_updateCheckMode = null;
				return;
			}
			if (data.hasUpdate) {
				_pendingNewVersion = data.remoteVersion;
				DOM.updateStatusText.textContent = '新版本 v' + data.remoteVersion;
				DOM.updateStatusText.style.color = 'var(--text-accent)';
				if (confirm('发现新版本 v' + data.remoteVersion + '（当前 v' + data.currentVersion + '），是否立即更新？')) {
					_applyUpdate();
				} else {
					_pendingNewVersion = null;
					_updateCheckMode = null;
				}
			} else {
				DOM.updateStatusText.textContent = '已是最新 v' + data.currentVersion;
				DOM.updateStatusText.style.color = '';
				_showToast('当前已是最新版本', 3000);
				_updateCheckMode = null;
			}
			setLastUpdateCheck(HJ_Jin());
		}
	});
}

function _autoCheckUpdate() {
	const interval = getUpdateCheckInterval();
	if (interval === 0) return;

	const failCount = getAutoUpdateFailCount();
	const ignoredVer = getAutoUpdateIgnoredVersion();

	// 有未放弃的失败记录，2小时后或下次启动时重试
	if (failCount > 0 && failCount < 3 && !ignoredVer) {
		const lastFail = getLastAutoUpdateFailTime();
		if (!lastFail || Date.now() - lastFail >= 2 * 3600_000) {
			_updateCheckMode = 'auto';
			_checkUpdate();
		}
		return;
	}

	const last = getLastUpdateCheck();
	const now = HJ_Jin();
	if (now - last >= interval) {
		_updateCheckMode = 'auto';
		_checkUpdate();
	}
}

function _onManualCheckUpdate() {
	DOM.updateStatusText.textContent = '检查中……';
	DOM.updateStatusText.style.color = '';
	_updateCheckMode = 'manual';
	_checkUpdate();
}

function _checkUpdate() {
	if (!navigator.serviceWorker || !navigator.serviceWorker.controller) {
		if (_updateCheckMode === 'manual') {
			DOM.updateStatusText.textContent = '网站服务未就绪';
		}
		_updateCheckMode = null;
		return;
	}
	navigator.serviceWorker.controller.postMessage({ type: 'CHECK_UPDATE' });
}

async function _applyUpdate() {
	if (!navigator.serviceWorker) return;
	const reg = await navigator.serviceWorker.getRegistration();
	if (!reg) return;

	const isAuto = _updateCheckMode === 'auto';
	if (!isAuto) {
		DOM.updateStatusText.textContent = '更新中……';
		DOM.updateStatusText.style.color = '';
	}

	// 更新成功回调
	let _updateDone = false;
	const onUpdateDone = async () => {
		if (_updateDone) return;
		_updateDone = true;
		await new Promise(r => setTimeout(r, 300));
		const ver = await _fetchAppVersion();
		const newVer = _pendingNewVersion || ver;
		if (!isAuto) {
			DOM.updateStatusText.textContent = '已更新至 v' + newVer;
			DOM.updateStatusText.style.color = '';
			_showToast('更新完成，刷新页面以应用新版本', 5000);
			// 手动更新成功，清除自动模式的忽略版本和失败计数
			setAutoUpdateIgnoredVersion(null);
			setAutoUpdateFailCount(0);
		} else {
			// 自动模式成功，静默并重置失败计数
			setAutoUpdateFailCount(0);
		}
		_updateCheckMode = null;
		_pendingNewVersion = null;
		setLastUpdateCheck(HJ_Jin());
	};

	// 自动模式失败处理
	const onUpdateFail = () => {
		if (isAuto) {
			const count = getAutoUpdateFailCount() + 1;
			setAutoUpdateFailCount(count);
			setLastAutoUpdateFailTime(Date.now());
			if (count >= 3) {
				const ver = _pendingNewVersion;
				if (ver) setAutoUpdateIgnoredVersion(ver);
				_showToast('发现新版本 v' + ver + '，但自动更新失败，已跳过此版本', 5000);
				setAutoUpdateFailCount(0);
			}
		} else {
			DOM.updateStatusText.textContent = '更新失败';
			_showToast('新版本安装失败，请稍后重试', 4000);
		}
		_updateCheckMode = null;
		_pendingNewVersion = null;
	};

	// 监听 controllerchange（SW skipWaiting + claim 后触发）
	navigator.serviceWorker.addEventListener('controllerchange', onUpdateDone, { once: true });

	// 如果已有 waiting 的 SW，直接通知其激活
	if (reg.waiting) {
		reg.waiting.postMessage({ type: 'APPLY_UPDATE' });
	} else {
		// 等待新 SW 安装：可能进入 waiting，也可能因 skipWaiting 直接激活
		const waitForResult = new Promise(resolve => {
			reg.addEventListener('updatefound', () => {
				const nw = reg.installing;
				nw.addEventListener('statechange', () => {
					if (nw.state === 'installed' || nw.state === 'redundant' || nw.state === 'activated') resolve();
				});
			}, { once: true });
			setTimeout(resolve, 10000);
		});
		try { await reg.update(); } catch(e) {}

		// 如果新 SW 已进入 waiting，通知其激活
		if (reg.waiting) {
			reg.waiting.postMessage({ type: 'APPLY_UPDATE' });
		} else {
			// 新 SW 可能已通过 skipWaiting 直接激活（controllerchange 已触发 onUpdateDone）
			await waitForResult;
			if (reg.waiting) {
				reg.waiting.postMessage({ type: 'APPLY_UPDATE' });
			} else if (!_updateDone) {
				navigator.serviceWorker.removeEventListener('controllerchange', onUpdateDone);
				onUpdateFail();
				return;
			}
		}
	}

	// 超时兜底
	setTimeout(() => {
		if (_updateDone) return;
		navigator.serviceWorker.removeEventListener('controllerchange', onUpdateDone);
		onUpdateFail();
	}, 15000);
}

async function _fetchAppVersion() {
	if (!navigator.serviceWorker || !navigator.serviceWorker.controller) {
		if (DOM.currentVersionText) DOM.currentVersionText.textContent = '--';
		return null;
	}
	return new Promise(resolve => {
		const timer = setTimeout(() => {
			navigator.serviceWorker.removeEventListener('message', handler);
			if (DOM.currentVersionText) DOM.currentVersionText.textContent = '--';
			resolve(null);
		}, 3000);
		const handler = (event) => {
			if (event.data && event.data.type === 'VERSION_INFO') {
				clearTimeout(timer);
				navigator.serviceWorker.removeEventListener('message', handler);
				if (DOM.currentVersionText) {
					DOM.currentVersionText.textContent = 'v' + event.data.version;
				}
				resolve(event.data.version);
			}
		};
		navigator.serviceWorker.addEventListener('message', handler);
		navigator.serviceWorker.controller.postMessage({ type: 'GET_VERSION' });
	});
}

// ========== 笔记功能 ==========
function _getCurrentHJ() {
	const sp = _getCurrentSuiPu();
	if (!sp) return 0;
	const idx = _findCurrentCellIdx(sp);
	return sp.Biao0_HJ + idx;
}

function renderBar7() {
	const sp = _getCurrentSuiPu();
	if (!sp) return;
	const hj = _getCurrentHJ();
	const notes = biji.getDayNotes(state.currentSui, hj);
	_bijiExpandedIdx = -1;
	DOM.bijiList.innerHTML = '';
	for (let i = 0; i < notes.length; i++) {
		const n = notes[i];
		const item = document.createElement('div');
		item.className = 'biji-item';
		item.dataset.idx = i;
		const summary = document.createElement('div');
		summary.className = 'biji-item-summary';
		const iconSpan = document.createElement('span');
		iconSpan.className = 'biji-icon';
		iconSpan.textContent = n.icon || biji.BIJI_DEFAULT_ICON;
		summary.appendChild(iconSpan);
		summary.appendChild(document.createTextNode(' ' + _bijiSummaryText(n.biji)));
		item.appendChild(summary);
		const expand = document.createElement('div');
		expand.className = 'biji-item-expand';
		const expIcon = document.createElement('span');
		expIcon.className = 'biji-icon';
		expIcon.textContent = n.icon || biji.BIJI_DEFAULT_ICON;
		expand.appendChild(expIcon);
		expand.appendChild(document.createTextNode(' ' + _bijiExpandText(n.biji)));
		item.appendChild(expand);
		const actions = document.createElement('div');
		actions.className = 'biji-item-actions';
		const btnEdit = document.createElement('button');
		btnEdit.textContent = '✎';
		btnEdit.title = '编辑';
		btnEdit.addEventListener('click', (e) => { e.stopPropagation(); _bijiOpenEdit(i); });
		const btnUp = document.createElement('button');
		btnUp.textContent = '⇧';
		btnUp.title = '上移';
		btnUp.disabled = i === 0;
		btnUp.addEventListener('click', (e) => { e.stopPropagation(); _bijiMoveItem(i, i - 1); });
		const btnDown = document.createElement('button');
		btnDown.textContent = '⇩';
		btnDown.title = '下移';
		btnDown.disabled = i === notes.length - 1;
		btnDown.addEventListener('click', (e) => { e.stopPropagation(); _bijiMoveItem(i, i + 1); });
		const btnCollapse = document.createElement('button');
		btnCollapse.textContent = '⧋';
		btnCollapse.title = '收起';
		btnCollapse.addEventListener('click', (e) => { e.stopPropagation(); _bijiCollapse(i); });
		actions.append(btnEdit, btnUp, btnDown, btnCollapse);
		item.appendChild(actions);
		item.addEventListener('click', () => _bijiToggleExpand(i));
		DOM.bijiList.appendChild(item);
	}
	_updateBar7Height();
	_updateBijiOverviewVisibility();
}

function _bijiSummaryText(text) {
	return biji.excerpt(text, 15);
}

function _bijiExpandText(text) {
	if (!text) return '';
	return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').replace(/ /g, '\u2002');
}

function _bijiToggleExpand(idx) {
	const items = DOM.bijiList.querySelectorAll('.biji-item');
	clearTimeout(_bijiActionsTimer);
	if (_bijiExpandedIdx === idx) {
		if (_bijiActionsVisible) {
			_bijiActionsVisible = false;
			items[idx]?.classList.remove('actions-visible');
			_bijiActionsTimer = setTimeout(() => {
				if (_bijiActionsVisible) return;
				items[idx]?.classList.remove('actions-visible');
			}, 0);
			return;
		}
		_bijiActionsVisible = true;
		items[idx]?.classList.add('actions-visible');
		_bijiActionsTimer = setTimeout(() => {
			_bijiActionsVisible = false;
			items[_bijiExpandedIdx]?.classList.remove('actions-visible');
		}, 5000);
		return;
	}
	items.forEach(el => el.classList.remove('expanded', 'actions-visible'));
	items[idx]?.classList.add('expanded');
	_bijiExpandedIdx = idx;
	_bijiActionsVisible = false;
	_updateExpandMaxHeight(items[idx]);
	_updateBar7Height();
}

function _updateExpandMaxHeight(item) {
	if (!item) return;
	const expand = item.querySelector('.biji-item-expand');
	if (!expand) return;
	expand.style.maxHeight = '';
	expand.style.minHeight = '';
	const itemCS = getComputedStyle(item);
	const itemExtra = (parseFloat(itemCS.paddingTop) || 0) + (parseFloat(itemCS.paddingBottom) || 0) + (parseFloat(itemCS.borderBottomWidth) || 0);
	const lineHeight = parseFloat(getComputedStyle(expand).lineHeight) || 24;
	const scrollH = expand.scrollHeight;
	const contentLines = Math.ceil(scrollH / lineHeight);
	const minLines = Math.max(2, Math.min(contentLines, 6));
	const minPx = minLines * lineHeight;
	const rect = item.getBoundingClientRect();
	const viewH = window.innerHeight;
	const remaining = viewH - rect.top - 40 - itemExtra;
	expand.style.minHeight = minPx + 'px';
	expand.style.maxHeight = Math.max(minPx, remaining) + 'px';
}

function _updateBOExpandMaxHeight(item) {
	if (!item) return;
	const expand = item.querySelector('.biji-item-expand');
	if (!expand) return;
	expand.style.maxHeight = '';
	expand.style.minHeight = '';
	const itemCS = getComputedStyle(item);
	const itemExtra = (parseFloat(itemCS.paddingTop) || 0) + (parseFloat(itemCS.paddingBottom) || 0) + (parseFloat(itemCS.borderBottomWidth) || 0);
	const boBodyCS = getComputedStyle(DOM.boBody);
	const boBodyPadBot = parseFloat(boBodyCS.paddingBottom) || 0;
	const lineHeight = parseFloat(getComputedStyle(expand).lineHeight) || 24;
	const scrollH = expand.scrollHeight;
	const contentLines = Math.ceil(scrollH / lineHeight);
	const minLines = Math.max(2, Math.min(contentLines, 6));
	const minPx = minLines * lineHeight;
	const boBodyRect = DOM.boBody.getBoundingClientRect();
	const itemRect = item.getBoundingClientRect();
	const remaining = Math.floor(boBodyRect.bottom - itemRect.top - 44 - itemExtra - boBodyPadBot);
	expand.style.minHeight = minPx + 'px';
	expand.style.maxHeight = Math.max(minPx, remaining) + 'px';
}

function _updateBar7Height() {
	const bar = DOM.barEvents;
	if (!bar) return;
	const items = bar.querySelectorAll('.biji-item');
	if (items.length === 0) {
		bar.style.height = '';
		return;
	}
	const cs = getComputedStyle(bar);
	const padTop = parseFloat(cs.paddingTop) || 0;
	const padBot = parseFloat(cs.paddingBottom) || 0;
	const listPadTop = parseFloat(getComputedStyle(DOM.bijiList).paddingTop) || 0;
	const listPadBot = parseFloat(getComputedStyle(DOM.bijiList).paddingBottom) || 0;
	const itemCS = getComputedStyle(items[0]);
	const itemPadTop = parseFloat(itemCS.paddingTop) || 0;
	const itemPadBot = parseFloat(itemCS.paddingBottom) || 0;
	const itemBorderBot = parseFloat(itemCS.borderBottomWidth) || 0;
	const summaryLineH = parseFloat(getComputedStyle(items[0].querySelector('.biji-item-summary')).lineHeight) || 24;
	const expandLineH = parseFloat(getComputedStyle(items[0].querySelector('.biji-item-expand') || items[0]).lineHeight) || 24;
	const itemCollapsedH = itemPadTop + summaryLineH + itemPadBot + itemBorderBot;
	const structuralH = padTop + padBot + listPadTop + listPadBot;
	const X = 6 * expandLineH + structuralH + itemPadTop + itemPadBot + itemBorderBot;
	let Y = structuralH;
	for (const item of items) {
		if (item.classList.contains('expanded')) {
			const expand = item.querySelector('.biji-item-expand');
			Y += itemPadTop + (expand ? expand.scrollHeight : expandLineH) + itemPadBot + itemBorderBot;
		} else {
			Y += itemCollapsedH;
		}
	}
	const barRect = bar.getBoundingClientRect();
	const appRect = bar.parentElement.getBoundingClientRect();
	const Z = window.innerHeight - (barRect.top - appRect.top);
	const MIN_H = 4 * 16;
	let H;
	if (Z >= X) {
		H = Z;
	} else {
		H = Y < X ? Y : X;
	}
	H = Math.max(MIN_H, H);
	bar.style.height = H + 'px';
}

function _bijiCollapse(idx) {
	const items = DOM.bijiList.querySelectorAll('.biji-item');
	const target = idx !== undefined ? idx : _bijiExpandedIdx;
	items[target]?.classList.remove('expanded');
	if (target === _bijiExpandedIdx) _bijiExpandedIdx = -1;
	_updateBar7Height();
}

function _bijiOpenNew() {
	const hj = _getCurrentHJ();
	_bijiEditState = {
		open: true, sui: state.currentSui, hj, idx: null,
		icon: biji.BIJI_DEFAULT_ICON, created: null, fullscreen: false,
		undoStack: [], draftTimer: null, debounceTimer: null
	};
	DOM.bijiTextarea.value = '';
	DOM.bijiEditIcon.textContent = biji.BIJI_DEFAULT_ICON;
	DOM.bijiEditCount.textContent = '0/' + biji.BIJI_MAX_LEN;
	DOM.bijiEditDelete.style.display = 'none';
	DOM.bijiEditor.classList.remove('fullscreen');
	DOM.bijiEditor.classList.add('open');
	DOM.bijiEditorOverlay.classList.add('active');
	_navOnOpen();
	_updateBijiHint();
	DOM.bijiTextarea.focus();
}

function _bijiOpenEditForSui(sui, hj, idx) {
	const notes = biji.getDayNotes(sui, hj);
	if (!notes[idx]) return;
	const n = notes[idx];
	_bijiEditState = {
		open: true, sui, hj, idx,
		icon: n.icon || biji.BIJI_DEFAULT_ICON, created: n.created, fullscreen: false,
		undoStack: [], draftTimer: null, debounceTimer: null
	};
	DOM.bijiTextarea.value = n.biji;
	DOM.bijiEditIcon.textContent = _bijiEditState.icon;
	DOM.bijiEditCount.textContent = n.biji.length + '/' + biji.BIJI_MAX_LEN;
	DOM.bijiEditDelete.style.display = '';
	DOM.bijiEditor.classList.remove('fullscreen');
	DOM.bijiEditor.classList.add('open');
	DOM.bijiEditorOverlay.classList.add('active');
	_navOnOpen();
	DOM.bijiTextarea.focus();
}

function _bijiOpenEdit(idx) {
	const notes = biji.getDayNotes(state.currentSui, _getCurrentHJ());
	if (!notes[idx]) return;
	const n = notes[idx];
	_bijiEditState = {
		open: true, sui: state.currentSui, hj: _getCurrentHJ(), idx,
		icon: n.icon || biji.BIJI_DEFAULT_ICON, created: n.created, fullscreen: false,
		undoStack: [], draftTimer: null, debounceTimer: null
	};
	DOM.bijiTextarea.value = n.biji;
	DOM.bijiEditIcon.textContent = _bijiEditState.icon;
	DOM.bijiEditCount.textContent = n.biji.length + '/' + biji.BIJI_MAX_LEN;
	DOM.bijiEditDelete.style.display = '';
	DOM.bijiEditor.classList.remove('fullscreen');
	DOM.bijiEditor.classList.add('open');
	DOM.bijiEditorOverlay.classList.add('active');
	_navOnOpen();
	_updateBijiHint();
	DOM.bijiTextarea.focus();
}

function _bijiCloseEditor() {
	clearTimeout(_bijiEditState.draftTimer);
	clearTimeout(_bijiEditState.debounceTimer);
	_bijiEditState.open = false;
	DOM.bijiEditor.classList.remove('open', 'fullscreen');
	DOM.bijiEditorOverlay.classList.remove('active');
	_navOnClose();
}

function _bijiSave() {
	const text = DOM.bijiTextarea.value;
	const icon = _bijiEditState.icon;
	if (_bijiEditState.idx !== null) {
		biji.updateNote(_bijiEditState.sui, _bijiEditState.hj, _bijiEditState.idx, text, icon);
	} else {
		biji.addNote(_bijiEditState.sui, _bijiEditState.hj, text, icon, _bijiEditState.created);
	}
	biji.clearDraft();
	biji.writeCurrentDataToFile().catch(() => { _showToast('本地文件写入失败'); });
	_bijiCloseEditor();
	renderBar7();
	renderCalendar();
	if (DOM.boPage.classList.contains('open')) _renderBijiOverview();
}

function _bijiDeleteFromEditor() {
	if (_bijiEditState.idx === null) {
		biji.clearDraft();
		_bijiCloseEditor();
		return;
	}
	if (!confirm('笔记删除后无法恢复，确定删除吗？')) return;
	biji.deleteNote(_bijiEditState.sui, _bijiEditState.hj, _bijiEditState.idx);
	biji.clearDraft();
	biji.writeCurrentDataToFile().catch(() => { _showToast('本地文件写入失败'); });
	_bijiCloseEditor();
	renderBar7();
	renderCalendar();
	if (DOM.boPage.classList.contains('open')) _renderBijiOverview();
}

function _bijiDeleteItem(idx) {
	if (!confirm('笔记删除后无法恢复，确定删除吗？')) return;
	biji.deleteNote(state.currentSui, _getCurrentHJ(), idx);
	biji.writeCurrentDataToFile().catch(() => { _showToast('本地文件写入失败'); });
	renderBar7();
	renderCalendar();
	if (DOM.boPage.classList.contains('open')) _renderBijiOverview();
}

function _bijiMoveItem(from, to) {
	biji.moveNote(state.currentSui, _getCurrentHJ(), from, to);
	renderBar7();
	renderCalendar();
}

function _bijiToggleFullscreen() {
	_bijiEditState.fullscreen = !_bijiEditState.fullscreen;
	DOM.bijiEditor.classList.toggle('fullscreen', _bijiEditState.fullscreen);
	if (_bijiEditState.fullscreen) {
		DOM.bijiEditor.style.height = '';
	} else {
		DOM.bijiEditor.style.height = '45vh';
	}
}

function _bijiChangeIcon() {
	const current = _bijiEditState.icon;
	const result = prompt('输入图标字符（留空恢复默认）：', current === biji.BIJI_DEFAULT_ICON ? '' : current);
	if (result === null) return;
	_bijiEditState.icon = result.trim() || biji.BIJI_DEFAULT_ICON;
	DOM.bijiEditIcon.textContent = _bijiEditState.icon;
}

function _bijiOnInput() {
	const text = DOM.bijiTextarea.value;
	const len = text.length;
	DOM.bijiEditCount.textContent = Math.min(len, biji.BIJI_MAX_LEN) + '/' + biji.BIJI_MAX_LEN;
	if (_bijiEditState.undoStack.length < 64) {
		_bijiEditState.undoStack.push(text);
	}
	clearTimeout(_bijiEditState.debounceTimer);
	if (len >= 40) {
		clearTimeout(_bijiEditState.draftTimer);
		_bijiEditState.draftTimer = setTimeout(() => {
			biji.saveDraft(_bijiEditState.hj, _bijiEditState.idx, _bijiEditState.icon, DOM.bijiTextarea.value, _bijiEditState.created);
		}, 15000);
		biji.saveDraft(_bijiEditState.hj, _bijiEditState.idx, _bijiEditState.icon, text, _bijiEditState.created);
	}
}

function _bijiOnDragStart(e) {
	if (e.target.closest('.biji-editor-close, .biji-editor-maximize')) return;
	if (e.target !== DOM.bijiEditorDrag && !DOM.bijiEditorDrag.contains(e.target)) return;
	e.preventDefault();
	const el = DOM.bijiEditorDrag;
	el.setPointerCapture(e.pointerId);
	const startY = e.clientY;
	const startH = DOM.bijiEditor.getBoundingClientRect().height;
	const viewH = window.innerHeight;
	const minH = 120;
	DOM.bijiEditor.style.transition = 'none';
	function onMove(ev) {
		const dy = startY - ev.clientY;
		let newH = Math.max(minH, Math.min(viewH, startH + dy));
		DOM.bijiEditor.style.height = newH + 'px';
		if (newH >= viewH * 0.75) {
			_bijiEditState.fullscreen = true;
			DOM.bijiEditor.classList.add('fullscreen');
		} else {
			_bijiEditState.fullscreen = false;
			DOM.bijiEditor.classList.remove('fullscreen');
		}
	}
	function onUp(ev) {
		el.releasePointerCapture(ev.pointerId);
		DOM.bijiEditor.style.transition = '';
		if (_bijiEditState.fullscreen) {
			DOM.bijiEditor.style.height = '';
		}
		document.removeEventListener('pointermove', onMove);
		document.removeEventListener('pointerup', onUp);
	}
	document.addEventListener('pointermove', onMove);
	document.addEventListener('pointerup', onUp);
}

async function _updateBijiHint() {
	const persisted = await biji.checkPersistence();
	if (persisted) {
		DOM.bijiEditorHint.textContent = '';
		return;
	}
	const handle = await biji.getFileHandle();
	if (handle) {
		const ok = await biji.verifyFileHandle();
		if (ok) {
			DOM.bijiEditorHint.textContent = '';
			return;
		}
	}
	if (window.showSaveFilePicker) {
		DOM.bijiEditorHint.textContent = '笔记保存在浏览器缓存，请及时导出或指定本地文件保存 →';
	} else {
		DOM.bijiEditorHint.textContent = '笔记保存在浏览器缓存，请及时导出以防丢失 →';
	}
}

async function _bijiSpecifyFile() {
	try {
		const [handle] = await window.showOpenFilePicker({
			types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
			multiple: false,
		});
		// 读取文件已有数据，询问是否合并导入
		try {
			const file = await handle.getFile();
			const text = await readFileAsText(file);
			if (text && text.trim()) {
				const fileData = JSON.parse(text);
				if (fileData && Object.keys(fileData).length > 0) {
					if (confirm('文件已有数据，是否合并导入？')) {
						_importJsonBiji(text, 'merge');
					}
				}
			}
		} catch(e) {}
		await biji.saveFileHandle(handle);
		const written = await biji.writeCurrentDataToFile();
		if (written) {
			_showToast('已指定本地文件并写入数据');
			const perm = await handle.queryPermission({ mode: 'readwrite' });
			if (perm !== 'granted') {
				_showToast('因系统限制，后续每次保存可能都需要权限确认');
			}
		} else {
			_showToast('已指定本地文件，但写入失败');
		}
		_updateBijiFileBtn();
		_updateBijiHint();
	} catch(e) {
		if (e.name !== 'AbortError') _showToast('指定文件失败：' + e.message);
	}
}

async function _bijiReauthorize() {
	const ok = await biji.verifyFileHandle();
	if (ok) {
		_updateBijiFileBtn();
		_updateBijiHint();
		_showToast('已重新获得授权');
	} else {
		_showToast('无法获得授权，请重新指定文件');
	}
}

async function _bijiUnlinkFile() {
	const handle = await biji.getFileHandle();
	const name = handle ? (handle.name || 'biji.json') : 'biji.json';
	const doImport = confirm('解除不会丢失应用中现有笔记。保险起见可再导入一次「' + name + '」的数据，是否执行？');
	if (doImport) {
		try {
			const fileData = await biji.readDataFromFile();
			if (fileData && typeof fileData === 'object') {
				_importJsonBiji(JSON.stringify(fileData), 'merge');
			} else {
				_showToast('无法读取本地文件数据');
			}
		} catch(e) {
			_showToast('读取本地文件失败');
		}
	}
	await biji.removeFileHandle();
	_updateBijiFileBtn();
	_updateBijiHint();
	_showToast('已解除本地文件关联');
}

async function _updateBijiFileBtn() {
	if (!window.showSaveFilePicker) {
		const span = document.createElement('span');
		span.textContent = '当前系统/浏览器不支持';
		span.style.cssText = 'color:var(--text-tertiary);font-size:var(--small-size)';
		DOM.bijiFileBtn.replaceWith(span);
		DOM.bijiFileBtn = span;
		DOM.bijiFileName.style.display = 'none';
		return;
	}
	const handle = await biji.getFileHandle();
	if (handle) {
		const ok = await biji.verifyFileHandle();
		if (ok) {
			DOM.bijiFileName.textContent = handle.name || 'biji.json';
			DOM.bijiFileName.style.display = '';
			DOM.bijiFileBtn.textContent = '解除本地保存';
			DOM.bijiFileBtn.onclick = _bijiUnlinkFile;
			DOM.bijiFileBtn.title = '';
		} else {
			DOM.bijiFileName.textContent = handle.name || 'biji.json';
			DOM.bijiFileName.style.display = '';
			DOM.bijiFileBtn.textContent = '重新授权';
			DOM.bijiFileBtn.onclick = _bijiReauthorize;
			DOM.bijiFileBtn.title = '';
		}
	} else {
		DOM.bijiFileName.style.display = 'none';
		DOM.bijiFileBtn.textContent = '指定文件';
		DOM.bijiFileBtn.onclick = _bijiSpecifyFile;
		DOM.bijiFileBtn.title = '';
	}
}

async function _bijiExport() {
	const format = DOM.bijiExportFormat?.getAttribute('data-value') === '1' ? 'text' : 'json';
	const startSui = DOM.bijiExportStart?.value ? parseInt(DOM.bijiExportStart.value) : undefined;
	const endSui = DOM.bijiExportEnd?.value ? parseInt(DOM.bijiExportEnd.value) : undefined;
	const content = biji.exportAll(startSui, endSui, format);
	if (!content || content === '{}' || content === '') {
		_showToast('没有笔记数据可导出');
		return;
	}
	try {
		const ext = format === 'text' ? '.txt' : '.json';
		const mime = format === 'text' ? 'text/plain' : 'application/json';
		const filename = '岁月历_笔记_' + new Date().toISOString().slice(0, 10) + ext;
		await _saveFile(content, filename, mime);
		_showToast('笔记已导出');
	} catch(e) {
		if (e.name !== 'AbortError') _showToast('导出失败：' + e.message);
	}
}

function _bijiImport() {
	const mode = DOM.bijiImportModeToggle.getAttribute('data-value') === '1' ? 'replace' : 'merge';
	const input = document.createElement('input');
	input.type = 'file';
	input.accept = '.json,.txt';
	input.onchange = () => {
		const file = input.files[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
			const text = reader.result;
			const isText = file.name.endsWith('.txt') || !text.trimStart().startsWith('{');
			if (isText) {
				_importTextBiji(text, mode);
			} else {
				_importJsonBiji(text, mode);
			}
		};
		reader.readAsText(file);
	};
	input.click();
}

function _importJsonBiji(text, mode) {
	let incoming;
	try { incoming = JSON.parse(text); } catch(e) {
		_showToast('导入失败：文件格式错误');
		return;
	}
	if (mode === 'replace') {
		const ok = biji.importAll(text, 'replace');
		if (ok) {
			_showToast('笔记已替换导入');
			renderBar7();
			renderCalendar();
		} else {
			_showToast('导入失败：文件格式错误');
		}
		return;
	}
	const conflicts = [];
	for (const k of Object.keys(incoming)) {
		const sui = parseInt(k);
		if (isNaN(sui)) continue;
		const existing = localStorage.getItem(k);
		if (!existing) continue;
		let existData, inData;
		try { existData = JSON.parse(existing); } catch(e) { continue; }
		try { inData = incoming[k]; } catch(e) { continue; }
		for (const dk of Object.keys(inData)) {
			if (!Array.isArray(inData[dk])) continue;
			if (!existData[dk] || !Array.isArray(existData[dk])) continue;
			const existCreatedSet = new Set(existData[dk].map(n => n.created));
			for (const inNote of inData[dk]) {
				if (existCreatedSet.has(inNote.created)) {
					conflicts.push({
						sui: sui,
						dayKey: dk,
						existNote: existData[dk].find(n => n.created === inNote.created),
						importNote: inNote
					});
				}
			}
		}
	}
	if (conflicts.length > 0) {
		const parsed = { data: incoming, errors: [], conflicts };
		_showBijiConflictDialog(parsed, true);
	} else {
		const ok = biji.importAll(text, 'merge');
		if (ok) {
			_showToast('笔记已合并导入');
			renderBar7();
			renderCalendar();
		} else {
			_showToast('导入失败：文件格式错误');
		}
	}
}

function _importTextBiji(text, mode) {
	const parsed = biji.parseTextImport(text);
	if (parsed.errors.length > 0) {
		const errLines = parsed.errors.slice(0, 10).map(e => '第' + e.line + '行：' + e.reason).join('\n');
		const more = parsed.errors.length > 10 ? '\n...共' + parsed.errors.length + '处错误' : '';
		_showToast('导入有错误：' + errLines + more, 5000);
	}
	if (mode === 'replace') {
		for (const sk of Object.keys(parsed.data)) {
			try { localStorage.setItem(sk, JSON.stringify(parsed.data[sk])); } catch(e) {}
		}
		_showToast('笔记已替换导入');
		renderBar7();
		renderCalendar();
		return;
	}
	if (parsed.conflicts.length > 0) {
		_showBijiConflictDialog(parsed, false);
	} else {
		biji.applyTextImport(parsed, []);
		_showToast('笔记已合并导入');
		renderBar7();
		renderCalendar();
	}
}

function _showBijiConflictDialog(parsed, isJson) {
	const conflicts = parsed.conflicts;
	const PAGE_SIZE = 99;
	const totalPages = Math.ceil(conflicts.length / PAGE_SIZE);
	let currentPage = 0;
	let resolutions = new Array(conflicts.length).fill('keepUpdated');
	let bulkAction = null;
	let cancelled = false;

	const overlay = document.createElement('div');
	overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;';

	const dialog = document.createElement('div');
	dialog.style.cssText = 'background:var(--bg-primary);color:var(--text-primary);border-radius:8px;padding:16px;max-width:90vw;width:400px;max-height:80vh;display:flex;flex-direction:column;';

	const renderPage = () => {
		const start = currentPage * PAGE_SIZE;
		const end = Math.min(start + PAGE_SIZE, conflicts.length);
		let html = '<div style="font-weight:bold;margin-bottom:8px">同日笔记冲突（' + (start + 1) + '-' + end + ' / ' + conflicts.length + '）</div>';
		html += '<div style="display:flex;gap:4px;margin-bottom:8px;flex-wrap:wrap">';
		html += '<button type="button" data-bulk="keepExist" style="font-size:12px;padding:2px 6px">全部保留应用项</button>';
		html += '<button type="button" data-bulk="keepImport" style="font-size:12px;padding:2px 6px">全部保留导入项</button>';
		html += '<button type="button" data-bulk="keepUpdated" style="font-size:12px;padding:2px 6px">全部保留较新项</button>';
		html += '<button type="button" data-bulk="reassignId" style="font-size:12px;padding:2px 6px">全部ID顺延</button>';
		html += '</div>';
		html += '<div style="overflow-y:auto;flex:1">';
		for (let i = start; i < end; i++) {
			const c = conflicts[i];
			const exShort = biji.excerpt(c.existNote.biji, 15);
			const imShort = biji.excerpt(c.importNote.biji, 15);
			const sel = resolutions[i] || '';
			html += '<div style="border:1px solid var(--border-color);border-radius:4px;padding:6px;margin-bottom:4px;font-size:12px">';
			html += '<div>应用内：' + exShort + (exShort.length >= 15 ? '…' : '') + '</div>';
			html += '<div>导入：' + imShort + (imShort.length >= 15 ? '…' : '') + '</div>';
			html += '<select data-idx="' + i + '" style="font-size:11px;margin-top:2px;width:100%">';
			html += '<option value="keepExist"' + (sel === 'keepExist' ? ' selected' : '') + '>保留应用项</option>';
			html += '<option value="keepImport"' + (sel === 'keepImport' ? ' selected' : '') + '>保留导入项</option>';
			html += '<option value="keepUpdated"' + (sel === 'keepUpdated' ? ' selected' : '') + '>保留较新项</option>';
			html += '<option value="reassignId"' + (sel === 'reassignId' ? ' selected' : '') + '>导入项ID顺延</option>';
			html += '</select></div>';
		}
		html += '</div>';
		html += '<div style="display:flex;justify-content:space-between;margin-top:8px">';
		if (totalPages > 1) {
			html += '<div><button type="button" data-page="prev"' + (currentPage === 0 ? ' disabled' : '') + '>上一页</button> ' + (currentPage + 1) + '/' + totalPages + ' <button type="button" data-page="next"' + (currentPage >= totalPages - 1 ? ' disabled' : '') + '>下一页</button></div>';
		} else {
			html += '<div></div>';
		}
		html += '<div><button type="button" data-action="cancel">取消导入</button> <button type="button" data-action="confirm">确认</button></div>';
		html += '</div>';
		dialog.innerHTML = html;
	};

	renderPage();
	overlay.appendChild(dialog);
	document.body.appendChild(overlay);

	dialog.addEventListener('change', (e) => {
		if (e.target.tagName === 'SELECT') {
			const idx = parseInt(e.target.dataset.idx);
			resolutions[idx] = e.target.value;
		}
	});

	dialog.addEventListener('click', (e) => {
		const btn = e.target.closest('button');
		if (!btn) return;
		if (btn.dataset.bulk) {
			bulkAction = btn.dataset.bulk;
			resolutions = resolutions.map(() => bulkAction);
			renderPage();
		} else if (btn.dataset.page === 'prev' && currentPage > 0) {
			currentPage--;
			renderPage();
		} else if (btn.dataset.page === 'next' && currentPage < totalPages - 1) {
			currentPage++;
			renderPage();
		} else if (btn.dataset.action === 'cancel') {
			cancelled = true;
			document.body.removeChild(overlay);
			_showToast('已取消导入');
		} else if (btn.dataset.action === 'confirm') {
			const finalResolutions = conflicts.map((c, i) => ({
				action: resolutions[i],
				importNote: c.importNote,
				sui: c.sui,
				dayKey: c.dayKey
			}));
			document.body.removeChild(overlay);
			if (isJson) {
				biji.applyTextImport({ data: parsed.data, errors: [], conflicts: [] }, finalResolutions);
			} else {
				biji.applyTextImport(parsed, finalResolutions);
			}
			_showToast('笔记已合并导入');
			renderBar7();
			renderCalendar();
		}
	});
}

function _checkBijiDraft() {
	if (!biji.hasDraft()) return;
	const draft = biji.loadDraft();
	if (!draft) return;
	const msg = '检测到未保存的草稿，是否恢复？';
	if (confirm(msg)) {
		_bijiEditState = {
			open: true, sui: state.currentSui, hj: draft.hj,
			idx: draft.idx, icon: draft.icon || biji.BIJI_DEFAULT_ICON,
			created: draft.created || null, fullscreen: false, undoStack: [], draftTimer: null, debounceTimer: null
		};
		DOM.bijiTextarea.value = draft.biji;
		DOM.bijiEditIcon.textContent = _bijiEditState.icon;
		DOM.bijiEditCount.textContent = draft.biji.length + '/' + biji.BIJI_MAX_LEN;
		DOM.bijiEditDelete.style.display = draft.idx !== null ? '' : 'none';
		DOM.bijiEditor.classList.add('open');
		DOM.bijiEditorOverlay.classList.add('active');
		_navOnOpen();
		_updateBijiHint();
	} else {
		biji.clearDraft();
	}
}

// ========== PWA 安装 ==========
function _initInstallPrompt() {
	window.addEventListener('beforeinstallprompt', (e) => {
		e.preventDefault();
		_deferredInstallPrompt = e;
		DOM.menuInstallApp.style.display = '';
	});

	window.addEventListener('appinstalled', () => {
		_deferredInstallPrompt = null;
		DOM.menuInstallApp.style.display = 'none';
		DOM.menuInstallGuide.style.display = 'none';
	});

	if (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone) {
		DOM.menuInstallApp.style.display = 'none';
		DOM.menuInstallGuide.style.display = 'none';
		return;
	}
}

// ========== 启动 ==========
document.addEventListener('DOMContentLoaded', init);
window.addEventListener('resize', () => _updateBar7Height());
