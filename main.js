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
	getBijiDefaultIcon, setBijiDefaultIcon, getBijiAttachIcon, setBijiAttachIcon,
	getJieSu, setJieSu, getFuRi, setFuRi,
	getUpdateCheckInterval, setUpdateCheckInterval, getLastUpdateCheck, setLastUpdateCheck,
	getAutoUpdateFailCount, setAutoUpdateFailCount, getAutoUpdateIgnoredVersion, setAutoUpdateIgnoredVersion,
	getLastAutoUpdateFailTime, setLastAutoUpdateFailTime,
	getCustomFonts, loadFontFile, removeFontFile, initCustomFonts,
	previewFontChange, commitFontPreview, cancelFontPreview,
	resetAllCustomFonts,
	getAttachRootPath, setAttachRootPath, getAttachRootTree, setAttachRootTree,
	getAttachAskAccess, setAttachAskAccess, getAttachShowPath, setAttachShowPath,
	getThumbManualMode, setThumbManualMode, getThumbAutoMode, setThumbAutoMode,
	getThumbAutoInterval, setThumbAutoInterval,
	getDisabledRanges, setDisabledRanges, getEnabledTypes, setEnabledTypes,
	getLastThumbMaintainHJ, setLastThumbMaintainHJ
} from "./config.js";
import * as fujian from "./scripts/fujian.js";

// 移动端浏览器在 HTTPS 下可能暴露 File System Access API 的 stub，实际不可用
// 借助 PWA 可安装性判断：触发 beforeinstallprompt 或处于 standalone 模式的是完整 Chromium
let _hasFileSystemAccess = !!(window.showSaveFilePicker && window.matchMedia('(display-mode: standalone)').matches);

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
	icon: biji.getBijiDefaultIcon(),
	fullscreen: false,
	undoStack: [],
	draftTimer: null,
	debounceTimer: null,
	assets: [],              // 当前笔记附件列表
	thumbBlobURLs: {},       // { [thumbKey]: blobURL } 编辑器栏已创建的 URL
	thumbReleaseTimer: null  // 延迟释放定时器
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
	DOM.app = $('app');
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
	DOM.bijiAddAttachBtn = $('bijiAddAttachBtn');
	DOM.bijiEditorThumbBar = $('bijiEditorThumbBar');
	DOM.bijiThumbScrollTrack = $('bijiThumbScrollTrack');
	DOM.bijiThumbScrollPrev = $('bijiThumbScrollPrev');
	DOM.bijiThumbScrollNext = $('bijiThumbScrollNext');
	// 附件查看器
	DOM.attachViewer = $('attachViewer');
	DOM.attachViewerHint = $('attachViewerHint');
	DOM.attachViewerClose = $('attachViewerClose');
	DOM.attachViewerPrev = $('attachViewerPrev');
	DOM.attachViewerNext = $('attachViewerNext');
	DOM.attachViewerStage = $('attachViewerStage');
	DOM.attachViewerInfo = $('attachViewerInfo');
	DOM.attachViewerFontZoom = $('attachViewerFontZoom');
	DOM.attachViewerFontZoomBtn = $('attachViewerFontZoomBtn');
	DOM.attachViewerFontZoomPanel = $('attachViewerFontZoomPanel');
	DOM.attachViewerFontZoomInput = $('attachViewerFontZoomInput');
	DOM.attachViewerFontZoomOK = $('attachViewerFontZoomOK');
	DOM.attachViewerFontZoomReset = $('attachViewerFontZoomReset');
	// 死引用清理
	DOM.thumbMaintainWrap = $('thumbMaintainWrap');
	DOM.cleanMissingRefsRow = $('cleanMissingRefsRow');
	DOM.cleanMissingRefsBtn = $('cleanMissingRefsBtn');
	// 停用区间
	DOM.thumbDisabledStart = $('thumbDisabledStart');
	DOM.thumbDisabledEnd = $('thumbDisabledEnd');
	DOM.thumbDisabledExport = $('thumbDisabledExport');
	DOM.thumbDisabledAddBtn = $('thumbDisabledAddBtn');
	DOM.thumbDisabledListRow = $('thumbDisabledListRow');
	DOM.thumbDisabledToggle = $('thumbDisabledToggle');
	DOM.thumbDisabledMenu = $('thumbDisabledMenu');
	// 启用类型 / 维护模式 / 自动维护
	DOM.thumbTypeImage = $('thumbTypeImage');
	DOM.thumbTypeVideo = $('thumbTypeVideo');
	DOM.thumbTypeAudio = $('thumbTypeAudio');
	DOM.thumbManualMode = $('thumbManualMode');
	DOM.thumbAutoMode = $('thumbAutoMode');
	DOM.thumbAutoInterval = $('thumbAutoInterval');
	DOM.thumbMaintainBtn = $('thumbMaintainBtn');
	DOM.thumbMaintainOverlay = $('thumbMaintainOverlay');
	DOM.thumbMaintainTitle = $('thumbMaintainTitle');
	DOM.thumbMaintainBar = $('thumbMaintainBar');
	DOM.thumbMaintainStats = $('thumbMaintainStats');
	DOM.cleanRefsOverlay = $('cleanRefsOverlay');
	DOM.cleanRefsClose = $('cleanRefsClose');
	DOM.cleanRefsTip = $('cleanRefsTip');
	DOM.cleanRefsList = $('cleanRefsList');
	DOM.cleanRefsSelectAll = $('cleanRefsSelectAll');
	DOM.cleanRefsCancel = $('cleanRefsCancel');
	DOM.cleanRefsConfirm = $('cleanRefsConfirm');
	DOM.lsDirBtn = $('lsDirBtn');
	DOM.lsDirName = $('lsDirName');
	DOM.lsDirRow = $('lsDirRow');
	DOM.lsDirRowLabel = $('lsDirRowLabel');
	DOM.lsSectionTitle = $('lsSectionTitle');
	DOM.attachRootPathRow = $('attachRootPathRow');
	DOM.attachRootPathBtn = $('attachRootPathBtn');
	DOM.attachRootRefreshBtn = $('attachRootRefreshBtn');
	DOM.attachRootPathName = $('attachRootPathName');
	DOM.attachAskAccessRow = $('attachAskAccessRow');
	DOM.attachAskAccess = $('attachAskAccess');
	DOM.attachAskAccessLabel = $('attachAskAccessLabel');
	DOM.attachShowPath = $('attachShowPath');
	DOM.attachShowPathLabel = $('attachShowPathLabel');
	DOM.attachShowPathText = $('attachShowPathText');
	DOM.bAttachToggleWrap = $('bAttachToggleWrap');
	DOM.bAttachToggle = $('bAttachToggle');
	DOM.lsSplitWrap = $('lsSplitWrap');
	DOM.lsSplitToggle = $('lsSplitToggle');
	DOM.lsSplitDropdown = $('lsSplitDropdown');
	DOM.lsClearBtn = $('lsClearBtn');
	DOM.bijiExportBtn = $('bijiExportBtn');
	DOM.bijiImportBtn = $('bijiImportBtn');
	DOM.bijiImportModeToggle = $('bijiImportModeToggle');
	DOM.bijiExportFormat = $('bijiExportFormat');
	DOM.bijiExportStart = $('bijiExportStart');
	DOM.bijiExportEnd = $('bijiExportEnd');
	DOM.bijiExportThumbsRow = $('bijiExportThumbsRow');
	DOM.bijiExportThumbs = $('bijiExportThumbs');
	DOM.bijiExportClear = $('bijiExportClear');
	DOM.bijiExportClearLabel = $('bijiExportClearLabel');
	DOM.boExportThumbsRow = $('boExportThumbsRow');
	DOM.boExportThumbs = $('boExportThumbs');
	DOM.boExportClearRow = $('boExportClearRow');
	DOM.boExportClear = $('boExportClear');
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
	DOM.ieBiJiBtn = $('ieBiJiBtn');
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
	DOM.boExpandAllSui = $('boExpandAllSui');
	DOM.boSortOrder = $('boSortOrder');
	DOM.boIconFilter = $('boIconFilter');
	DOM.boSearch = $('boSearch');
	DOM.boStartSui = $('boStartSui');
	DOM.boEndSui = $('boEndSui');
	DOM.boSuiConfirm = $('boSuiConfirm');
	DOM.boSearchRow = $('boSearchRow');
	DOM.boSearchInput = $('boSearchInput');
	DOM.boSearchBtn = $('boSearchBtn');
	DOM.boIconFilterRow = $('boIconFilterRow');
	DOM.boIconList = $('boIconList');
	DOM.boIconInvert = $('boIconInvert');
	DOM.boDeleteSelected = $('boDeleteSelected');
	DOM.boExportSelected = $('boExportSelected');
	DOM.boExportRow = $('boExportRow');
	DOM.boExportFormat = $('boExportFormat');
	DOM.boExportConfirm = $('boExportConfirm');
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
	DOM.bijiDefaultIconInput = $('bijiDefaultIconInput');
	DOM.bijiAttachIconInput = $('bijiAttachIconInput');
	DOM.jieSuImportBtn = $('jieSuImportBtn');
	DOM.jieSuExportBtn = $('jieSuExportBtn');
	DOM.jieSuResetBtn = $('jieSuResetBtn');
	DOM.jieSuImportModeToggle = $('jieSuImportModeToggle');
	DOM.jieSuExportFormat = $('jieSuExportFormat');
	DOM.fuRiImportBtn = $('fuRiImportBtn');
	DOM.fuRiExportBtn = $('fuRiExportBtn');
	DOM.fuRiResetBtn = $('fuRiResetBtn');
	DOM.fuRiImportModeToggle = $('fuRiImportModeToggle');
	DOM.fuRiExportFormat = $('fuRiExportFormat');
	DOM.mergeDialog = $('mergeDialog');
	DOM.mergeDialogTitle = $('mergeDialogTitle');
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
	_updateAppScale();

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

	// 附件权限三分法 UI 初始化（内部会调用 _syncManualModeUI / _syncAutoModeUI）
	_updateAttachCaseUI();
	// 停用区间 UI 初始化
	_syncDisabledRangesUI();
	// 启用类型 UI 初始化
	_syncEnabledTypesUI();
	// 定期自动维护检查（7.3，延迟执行不阻塞启动）
	if (typeof requestIdleCallback !== 'undefined') {
		requestIdleCallback(() => _checkAutoThumbMaintain(), { timeout: 5000 });
	} else {
		setTimeout(_checkAutoThumbMaintain, 3000);
	}

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

// 取某历法类别 k 的节庆民俗详情名（k: 0=夏历, 1=节气, 2=节历, 3=西历）
// 优先取 [日历格名, 详情名] 二元组的详情名；全角空格间隔
function _getJSDetailByCat(js, k) {
	if (!js || !js[k] || js[k].length === 0) return '';
	const result = [];
	for (const item of js[k]) {
		let name = '';
		if (Array.isArray(item) && item.length >= 2 && item[1]) {
			name = item[1];
		} else if (Array.isArray(item) && item[0]) {
			name = item[0];
		} else if (item) {
			name = item;
		}
		if (!name) continue;
		// 冬至名称加粗
		const isDongZhi = Array.isArray(item) && item[0] === '冬至';
		result.push(isDongZhi ? '<strong>' + name + '</strong>' : name);
	}
	return result.join('　');
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

	const idx = _findCurrentCellIdx(sp);
	const mod7 = idx % 7;
	const weekdayStr = formatWeekdayName(mod7);
	const T = '&thinsp;';   // 细分隔
	const FS = '　';        // 全角空格（节俗/重复日间隔）
	// 节历岁前缀（夏历行用隐藏副本对齐节历行的节、号位置）
	const suiPrefix = '华夏' + T + sp.Sui + T + '岁' + T;

	const items = [];

	// 1. 年号（居中，每个值占一行）
	if (cell.AL) {
		const shwy = sp.ShWY[cell.AL[0]];
		if (shwy && shwy.N_Hao && shwy.N_Hao.length > 0) {
			items.push('<li class="detail-center">' + shwy.N_Hao.join('<br>') + '</li>');
		}
	}

	// 2. 节历岁/节/号 ┆ 干支岁/节/日
	{
		const left = '华夏' + T + sp.Sui + T + '岁' + T + sp.Jie_Zi[cell.JL[0]] + T + String(cell.JL[1]) + T + '日';
		const right = sp.Sui_GZh[0] + '岁' + T + sp.Jie_GZh[cell.JL[0]] + '节' + T + cell.GZh + '日';
		items.push('<li class="detail-flex"><span>' + left + '</span><span>' + right + '</span></li>');
	}

	// 3. 节历节俗、重复日（无则不生成）
	{
		const parts = [];
		const js2 = _getJSDetailByCat(cell.JS, 2);
		if (js2) parts.push(js2);
		if (cell.FR && cell.FR.JL && cell.FR.JL.length > 0) parts.push(cell.FR.JL.join(FS));
		if (parts.length > 0) items.push('<li>' + parts.join(FS) + '</li>');
	}

	// 4. 夏历月日 ┆ HJ积日
	if (cell.AL) {
		const shwy = sp.ShWY[cell.AL[0]];
		if (shwy) {
			const cellhj = sp.Biao0_HJ + idx;
			const zhou = Math.floor(cellhj / 60);
			const yu = cellhj - zhou * 60;
			const left = '<span class="detail-spacer">' + suiPrefix + '</span>' + shwy.Y_Zi + '月' + '  ' + cell.AL[1];
			const right = '花' + T + '(' + zhou + ')' + T + '+' + T + yu;
			items.push('<li class="detail-flex"><span>' + left + '</span><span>' + right + '</span></li>');
		}
	}

	// 5. 夏历节俗、重复日（无则不生成；右栏留空占位）
	{
		const parts = [];
		const js0 = _getJSDetailByCat(cell.JS, 0);
		if (js0) parts.push(js0);
		if (cell.FR && cell.FR.AL && cell.FR.AL.length > 0) parts.push(cell.FR.AL.join(FS));
		if (parts.length > 0) {
			const left = '<span class="detail-spacer">' + suiPrefix + '</span>' + parts.join(FS);
			items.push('<li class="detail-flex"><span>' + left + '</span><span></span></li>');
		}
	}

	// 6. 西历节俗、重复日 ┆ 西历年月日+星期
	{
		const parts = [];
		const js3 = _getJSDetailByCat(cell.JS, 3);
		if (js3) parts.push(js3);
		if (cell.FR && cell.FR.WC && cell.FR.WC.length > 0) parts.push(cell.FR.WC.join(FS));
		const leftStr = parts.join(FS);

		let rightStr = '';
		if (cell.WC) {
			const y = cell.WC[0];
			const adStr = y > 0
				? 'AD' + y + '-' + String(cell.WC[1]).padStart(2, '0') + '-' + String(cell.WC[2]).padStart(2, '0')
				: (1 - y) + 'BC-' + String(cell.WC[1]).padStart(2, '0') + '-' + String(cell.WC[2]).padStart(2, '0');
			rightStr = '<span class="detail-ad">' + adStr + '</span>' + ' ' + weekdayStr;
		}

		if (leftStr || rightStr) {
			items.push('<li class="detail-flex"><span>' + leftStr + '</span><span>' + rightStr + '</span></li>');
		}
	}

	// 7. 节气、月相（含节气节俗/重复日；无则不生成）
	{
		const QiRi = sp.Sui >= WuZhong[0] ? ' <small>(定气历日)</small>' : ' <small>(平气历日)</small>';
		const leftParts = [];
		const js1 = _getJSDetailByCat(cell.JS, 1);
		if (js1) leftParts.push(js1);
		if (cell.FR && cell.FR.JQ && cell.FR.JQ.length > 0) leftParts.push(cell.FR.JQ.join(FS));
		if (cell.JQR) leftParts.push(cell.JQR + QiRi);

		const rightParts = [];
		if (cell.JQ) rightParts.push(cell.JQ[0] + ' <small>(今算定气时刻) </small>' + cell.JQ[1]);
		if (cell.YX) rightParts.push(cell.YX[0] + ' <small>(今算定朔时刻) </small>' + cell.YX[1]);

		if (leftParts.length > 0 || rightParts.length > 0) {
			items.push('<li class="detail-flex"><span>' + leftParts.join(FS) + '</span><span>' + rightParts.join(FS) + '</span></li>');
		}
	}

	DOM.detailList.innerHTML = items.join('');
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
	if (DOM.bijiAddAttachBtn) DOM.bijiAddAttachBtn.addEventListener('click', _bijiAddAttach);
	if (DOM.bijiThumbScrollPrev) DOM.bijiThumbScrollPrev.addEventListener('click', () => _bijiThumbScrollBy(-200));
	if (DOM.bijiThumbScrollNext) DOM.bijiThumbScrollNext.addEventListener('click', () => _bijiThumbScrollBy(200));
	// 附件查看器事件（9.1 / 9.2）
	if (DOM.attachViewerClose) DOM.attachViewerClose.addEventListener('click', _closeAttachViewer);
	if (DOM.attachViewerPrev) DOM.attachViewerPrev.addEventListener('click', () => _attachViewerNavigate(-1));
	if (DOM.attachViewerNext) DOM.attachViewerNext.addEventListener('click', () => _attachViewerNavigate(1));
	// 文本附件字号缩放浮动控件
	if (DOM.attachViewerFontZoomBtn) DOM.attachViewerFontZoomBtn.addEventListener('click', (e) => {
		e.stopPropagation();
		const show = DOM.attachViewerFontZoomPanel.style.display === 'none';
		DOM.attachViewerFontZoomPanel.style.display = show ? '' : 'none';
		if (show) {
			DOM.attachViewerFontZoomInput.value = Math.round(_attachViewerState.textFontScale * 100);
			DOM.attachViewerFontZoomInput.focus();
			DOM.attachViewerFontZoomInput.select();
		}
	});
	if (DOM.attachViewerFontZoomOK) DOM.attachViewerFontZoomOK.addEventListener('click', (e) => {
		e.stopPropagation();
		const v = parseInt(DOM.attachViewerFontZoomInput.value);
		if (isNaN(v)) return;
		const clamped = Math.max(ATTACH_VIEWER_TEXT_FONT_SCALE_MIN * 100, Math.min(ATTACH_VIEWER_TEXT_FONT_SCALE_MAX * 100, v));
		_attachViewerState.textFontScale = clamped / 100;
		_applyAttachViewerTextFontScale();
		DOM.attachViewerFontZoomPanel.style.display = 'none';
	});
	if (DOM.attachViewerFontZoomReset) DOM.attachViewerFontZoomReset.addEventListener('click', (e) => {
		e.stopPropagation();
		_attachViewerState.textFontScale = 1;
		_applyAttachViewerTextFontScale();
		DOM.attachViewerFontZoomInput.value = 100;
	});
	if (DOM.attachViewerFontZoomInput) DOM.attachViewerFontZoomInput.addEventListener('keydown', (e) => {
		if (e.key === 'Enter') { e.preventDefault(); DOM.attachViewerFontZoomOK.click(); }
		else if (e.key === 'Escape') { e.preventDefault(); DOM.attachViewerFontZoomPanel.style.display = 'none'; }
	});
	if (DOM.attachViewerFontZoomPanel) DOM.attachViewerFontZoomPanel.addEventListener('click', (e) => e.stopPropagation());
	if (DOM.attachViewer) DOM.attachViewer.addEventListener('click', (e) => {
		// 鼠标拖动后消费此次 click，避免误关闭
		if (_attachViewerSuppressNextClick) {
			_attachViewerSuppressNextClick = false;
			return;
		}
		// 点击遮罩空白处关闭（9.1）；点击媒体/文本/按钮等不关闭
		if (e.target.closest('.attach-viewer-media, .attach-viewer-text, .attach-viewer-text-tip, .attach-viewer-close, .attach-viewer-prev, .attach-viewer-next, .attach-viewer-hint, .attach-viewer-info')) return;
		_closeAttachViewer();
	});
	// 键盘 / 滚轮 / 触屏 / 鼠标拖动交互（9.1）
	if (DOM.attachViewer) {
		DOM.attachViewer.addEventListener('wheel', _onAttachViewerWheel, { passive: false });
		DOM.attachViewer.addEventListener('touchstart', _onAttachViewerTouchStart, { passive: true });
		DOM.attachViewer.addEventListener('touchmove', _onAttachViewerTouchMove, { passive: false });
		DOM.attachViewer.addEventListener('touchend', _onAttachViewerTouchEnd, { passive: true });
		// 鼠标拖动：仅在图片放大后启用，move/up 挂到 window 以便鼠标离开元素时仍能接收
		DOM.attachViewer.addEventListener('mousedown', _onAttachViewerMouseDown);
		window.addEventListener('mousemove', _onAttachViewerMouseMove);
		window.addEventListener('mouseup', _onAttachViewerMouseUp);
	}
	// 键盘事件挂到 window，确保附件查看器打开时优先拦截（即使焦点不在遮罩内）
	window.addEventListener('keydown', _onAttachViewerKeydown, true);
	window.addEventListener('resize', _updateThumbBarScrollState);
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
	// 导出所含缩略图勾选项（默认勾选，情况 C 下整行隐藏由 _updateAttachCaseUI 处理）
	// 无需额外事件绑定，读取时用 .checked
	// 导出后删除笔记勾选项（勾选时文字红色 + 警示）
	DOM.bijiExportClear?.addEventListener('change', () => {
		const v = DOM.bijiExportClear.checked;
		if (DOM.bijiExportClearLabel) {
			DOM.bijiExportClearLabel.style.color = v ? '#dc3232' : '';
		}
		if (v) {
			_showToast('⚠警告：导出后将删除本次导出范围内的笔记❗', 3000);
		}
	});
	// 笔记总览页导出栏勾选项
	DOM.boExportClear?.addEventListener('change', () => {
		const v = DOM.boExportClear.checked;
		const labelEl = DOM.boExportClearRow?.querySelector('span');
		if (labelEl) labelEl.style.color = v ? '#dc3232' : '';
		if (v) {
			_showToast('⚠警告：导出后将删除本次导出范围内的笔记❗', 3000);
		}
	});
	DOM.bijiEditorHint.querySelector('#bijiHintExport').addEventListener('click', async (e) => {
		e.stopPropagation();
		DOM.bijiEditor.classList.remove('open', 'fullscreen');
		DOM.bijiEditorOverlay.classList.remove('active');
		_bijiEditState.open = false;
		clearTimeout(_bijiEditState.draftTimer);
		clearTimeout(_bijiEditState.debounceTimer);
		await _openIEPage();
		// 滚动到「笔记与本地文件夹」栏位置
		const target = DOM.lsDirRow || DOM.lsSectionTitle;
		if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
	});

	// 本地文件夹设置
	DOM.lsDirBtn.addEventListener('click', _onLsDirBtnClick);
	DOM.lsSplitToggle.addEventListener('click', _toggleLsSplitDropdown);
	// 点击外部收起「本地笔记文件分割」下拉菜单
	document.addEventListener('click', (e) => {
		if (!DOM.lsSplitDropdown || DOM.lsSplitDropdown.style.display === 'none') return;
		const wrap = DOM.lsSplitToggle.parentElement;
		if (wrap && !wrap.contains(e.target)) _closeLsSplitDropdown();
	});
	DOM.lsClearBtn.addEventListener('click', _lsClearBiji);
	// 附件设置项（4.1 / 4.2，仅情况 B）
	// 「指定文件夹」按钮：用 <input type="file" webkitdirectory> 唤起目录选择器
	// 情况 B 不支持 showDirectoryPicker，但 webkitRelativePath 普遍支持
	// 注：浏览器会显示「上传该目录中的文件」提示，先弹应用预提示解释
	// 指定后遍历目录结构建立文件夹树（纯目录）持久化保存
	const _attachBrowserUploadTip = '　　接下来对文件夹的选择将唤起「上传」选择器，浏览器会询问是否“<b>上传文件夹中的所有文件到网站</b>”——这是浏览器调用 <a href="https://developer.mozilla.org/zh-CN/docs/Web/API/File/webkitRelativePath" target="_blank" rel="noopener noreferrer"><small>webkitRelativePath</small></a> 的固定安全提示，<b>本应用不上传任何数据</b>。若有疑虑，可选择断网操作或取消。';

	// 从 webkitdirectory 返回的 FileList 建立纯目录树
	// relPaths: webkitRelativePath 数组（如 ['root/sub/a.jpg', 'root/sub2/b.jpg']）
	// rootName: 根目录名（relPath 第一段）
	function _buildDirTreeFromRelPaths(relPaths, rootName) {
		const root = { name: rootName, dirs: [] };
		for (const rel of relPaths) {
			const parts = rel.split(/[\\/]/).filter(Boolean);
			// 第一段是根目录名，跳过；最后一段是文件名，跳过
			if (parts.length < 3) continue;
			let node = root;
			for (let i = 1; i < parts.length - 1; i++) {
				const seg = parts[i];
				let child = node.dirs.find(d => d.name === seg);
				if (!child) { child = { name: seg, dirs: [] }; node.dirs.push(child); }
				node = child;
			}
		}
		return root;
	}

	// 用 webkitdirectory 唤起目录选择器，返回 { rootName, tree } 或 null（取消）
	function _pickDirAndBuildTree() {
		return new Promise(resolve => {
			const inp = document.createElement('input');
			inp.type = 'file';
			inp.webkitdirectory = true;
			inp.style.display = 'none';
			inp.addEventListener('change', () => {
				const files = inp.files;
				inp.remove();
				if (!files || files.length === 0) return resolve(null);
				const rel = files[0].webkitRelativePath || '';
				const rootName = rel.split(/[\\/]/)[0] || '';
				if (!rootName) return resolve(null);
				const relPaths = [];
				for (const f of files) relPaths.push(f.webkitRelativePath || f.name);
				const tree = _buildDirTreeFromRelPaths(relPaths, rootName);
				resolve({ rootName, tree });
			});
			inp.addEventListener('cancel', () => { inp.remove(); resolve(null); });
			document.body.appendChild(inp);
			inp.click();
		});
	}

	if (DOM.attachRootPathBtn) DOM.attachRootPathBtn.addEventListener('click', async () => {
		// 已指定文件夹：弹确认解除
		if (getAttachRootPath()) {
			const ok = await _showAppConfirm('解除指定', '解除附件限定根目录不会丢失应用中现有笔记，也不会删除原文件。是否继续？');
			if (ok) {
				setAttachRootPath('');
				setAttachRootTree(null);
				_bijiSubDirFingerprints = null;  // 清空子目录指纹缓存
				_bijiRootFileMap = null;          // 清空根目录映射表
				_syncAttachSettingsUI();
				_refreshAttachButtonVisibility();
			}
			return;
		}
		// 未指定：唤起目录选择器
		const ok = await _showAppConfirm('关于浏览器的「上传」提示', _attachBrowserUploadTip);
		if (!ok) return;
		const result = await _pickDirAndBuildTree();
		if (!result) return;
		setAttachRootPath(result.rootName);
		setAttachRootTree(result.tree);
		_syncAttachSettingsUI();
		_refreshAttachButtonVisibility();
		_showToast('已记录根目录及其文件夹树。');
	});
	// 「授权刷新」按钮：重新 webkitdirectory 授权，刷新文件夹树记录
	if (DOM.attachRootRefreshBtn) DOM.attachRootRefreshBtn.addEventListener('click', async () => {
		if (!getAttachRootPath()) return;
		const ok = await _showAppConfirm('授权刷新', '重新指定【根目录】授权以刷新文件夹树记录，是否继续？');
		if (!ok) return;
		const result = await _pickDirAndBuildTree();
		if (!result) return;
		const oldRoot = getAttachRootPath();
		const mismatched = result.rootName !== oldRoot;
		if (mismatched) setAttachRootPath(result.rootName);
		setAttachRootTree(result.tree);
		_bijiSubDirFingerprints = null;  // 目录结构变化，指纹缓存失效
		_bijiRootFileMap = null;          // 映射表也失效
		_syncAttachSettingsUI();
		if (mismatched) {
			_showToast('⚠所选目录名与原根目录不一致❕ 根目录已更新，请注意已有笔记附件的相对路径是否仍有效❕', 9000);
		} else {
			_showToast('已刷新根目录文件夹树。');
		}
	});
	if (DOM.attachAskAccess) DOM.attachAskAccess.addEventListener('change', async () => {
		const checked = DOM.attachAskAccess.checked;
		if (checked) {
			// 勾选时给出详细提示
			const tipBody = '　　勾选后，每次运行应用首次浏览附件时，需授权访问附件根目录（浏览器会唤起「上传」选择器，与指定根目录时相同）。授权后的运行期间可直接浏览笔记内引用的根目录内附件。重启应用后需重新授权。';
			const ok = await _showAppConfirm('关于「每次运行授权访问」', tipBody);
			if (!ok) { DOM.attachAskAccess.checked = false; return; }
		}
		setAttachAskAccess(checked);
		_bijiRootFileMap = null;  // 切换开关时清空映射表
	});
	if (DOM.attachShowPath) DOM.attachShowPath.addEventListener('change', () => {
		setAttachShowPath(DOM.attachShowPath.checked);
	});
	// B 附件开关：点击切换开/关，关闭时清除 B 权限相关数据
	if (DOM.bAttachToggle) DOM.bAttachToggle.addEventListener('click', async () => {
		if (!_bAttachEnabled) return;  // 开启只能通过双隐形开关触发，此处只处理关闭
		const ok = await _showAppConfirm('关闭残缺的附件功能',
			'　　关闭后将清除「附件限定根目录」指定、子目录指纹缓存等残缺状态相关数据，并切换回不支持形态。是否继续？',
			'关闭');
		if (!ok) return;
		_bAttachEnabled = false;
		// 清除 B 权限相关设置数据
		setAttachRootPath('');
		setAttachRootTree(null);
		setAttachAskAccess(false);
		setAttachShowPath(false);
		_bijiSubDirFingerprints = null;
		_bijiRootFileMap = null;
		// 同步 UI
		_updateLsUI();
		_updateAttachCaseUI();
		_refreshAttachButtonVisibility();
		_showToast('已关闭残缺附件功能并清除相关配置。');
	});

	// 死引用清理（7.6）
	if (DOM.cleanMissingRefsBtn) DOM.cleanMissingRefsBtn.addEventListener('click', _openCleanMissingRefs);
	if (DOM.cleanRefsClose) DOM.cleanRefsClose.addEventListener('click', _closeCleanMissingRefs);
	if (DOM.cleanRefsCancel) DOM.cleanRefsCancel.addEventListener('click', _closeCleanMissingRefs);
	if (DOM.cleanRefsConfirm) DOM.cleanRefsConfirm.addEventListener('click', _confirmCleanMissingRefs);
	if (DOM.cleanRefsSelectAll) DOM.cleanRefsSelectAll.addEventListener('change', _onCleanRefsSelectAll);
	if (DOM.cleanRefsOverlay) DOM.cleanRefsOverlay.addEventListener('click', (e) => {
		if (e.target === DOM.cleanRefsOverlay) _closeCleanMissingRefs();
	});
	// 停用区间（7.5）
	if (DOM.thumbDisabledAddBtn) DOM.thumbDisabledAddBtn.addEventListener('click', _addDisabledRange);
	if (DOM.thumbDisabledStart) DOM.thumbDisabledStart.addEventListener('keydown', (e) => {
		if (e.key === 'Enter') { e.preventDefault(); DOM.thumbDisabledEnd.focus(); }
	});
	if (DOM.thumbDisabledEnd) DOM.thumbDisabledEnd.addEventListener('keydown', (e) => {
		if (e.key === 'Enter') { e.preventDefault(); _addDisabledRange(); }
	});
	if (DOM.thumbDisabledToggle) DOM.thumbDisabledToggle.addEventListener('click', _toggleDisabledDropdown);
	// 点击外部收起「已停用」下拉菜单
	document.addEventListener('click', (e) => {
		if (!DOM.thumbDisabledMenu || DOM.thumbDisabledMenu.style.display === 'none') return;
		const wrap = DOM.thumbDisabledToggle.parentElement;
		if (wrap && !wrap.contains(e.target)) _closeDisabledDropdown();
	});
	// 启用类型 / 维护模式 / 自动维护（7.1 / 7.3）
	if (DOM.thumbTypeImage) DOM.thumbTypeImage.addEventListener('change', _onThumbTypeChange);
	if (DOM.thumbTypeVideo) DOM.thumbTypeVideo.addEventListener('change', _onThumbTypeChange);
	if (DOM.thumbTypeAudio) DOM.thumbTypeAudio.addEventListener('change', _onThumbTypeChange);
	if (DOM.thumbManualMode) DOM.thumbManualMode.addEventListener('change', () => {
		setThumbManualMode(DOM.thumbManualMode.value);
	});
	if (DOM.thumbAutoMode) DOM.thumbAutoMode.addEventListener('change', () => {
		setThumbAutoMode(DOM.thumbAutoMode.value);
	});
	if (DOM.thumbAutoInterval) DOM.thumbAutoInterval.addEventListener('change', () => {
		let v = parseInt(DOM.thumbAutoInterval.value);
		if (isNaN(v) || v < 0) v = 0;
		if (v > 365) v = 365;
		setThumbAutoInterval(v);
		DOM.thumbAutoInterval.value = v;
	});
	if (DOM.thumbMaintainBtn) DOM.thumbMaintainBtn.addEventListener('click', () => {
		const mode = getThumbManualMode();
		// 情况 B 手动选「增减」：提示需临时授权，这里仍按增减触发
		// 实际执行时会通过 fileResolver=null 降级为 cleanup（情况 B 无 dirHandle）
		_runThumbMaintain({ mode, showUI: true });
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
	// 点击【确定】时阻止 input 失焦，避免 blur → setTimeout(_cancelNian) 抢在 submit 之前隐藏表单
	if (DOM.nianConfirm) DOM.nianConfirm.addEventListener('mousedown', (e) => e.preventDefault());
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

	// 笔记功能：fabAdd 新建按钮

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

	// 笔记默认图标自定义
	DOM.bijiDefaultIconInput.addEventListener('change', () => {
		const v = DOM.bijiDefaultIconInput.value.trim() || '✑';
		setBijiDefaultIcon(v);
		DOM.bijiDefaultIconInput.value = getBijiDefaultIcon();
	});
	DOM.bijiAttachIconInput.addEventListener('change', () => {
		const v = DOM.bijiAttachIconInput.value.trim() || '📎';
		setBijiAttachIcon(v);
		DOM.bijiAttachIconInput.value = getBijiAttachIcon();
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
			if (_hasFileSystemAccess) {
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
			if (e.name !== 'AbortError') _showToast('😿加载字体文件失败。');
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
		_showToast('已恢复默认字体。');
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
	DOM.jieSuExportFormat.addEventListener('click', () => {
		const v = DOM.jieSuExportFormat.getAttribute('data-value') === '1' ? '0' : '1';
		DOM.jieSuExportFormat.setAttribute('data-value', v);
	});
	DOM.fuRiImportBtn.addEventListener('click', _importFuRi);
	DOM.fuRiExportBtn.addEventListener('click', _exportFuRi);
	DOM.fuRiResetBtn.addEventListener('click', _resetFuRi);
	DOM.fuRiImportModeToggle.addEventListener('click', () => {
		const v = DOM.fuRiImportModeToggle.getAttribute('data-value') === '1' ? '0' : '1';
		DOM.fuRiImportModeToggle.setAttribute('data-value', v);
	});
	DOM.fuRiExportFormat.addEventListener('click', () => {
		const v = DOM.fuRiExportFormat.getAttribute('data-value') === '1' ? '0' : '1';
		DOM.fuRiExportFormat.setAttribute('data-value', v);
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
	DOM.ieGeShiBtn.addEventListener('click', () => { _openInfoPage('GeShi', '年节格式'); });
	DOM.ieBiJiBtn.addEventListener('click', () => { _openInfoPage('BiJi', '笔记说明'); });
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
		// 笔记总览导出附加栏打开时，先关闭它（不关闭整个笔记总览页）
		if (DOM.boExportRow?.classList.contains('open')) {
			DOM.boExportRow.classList.remove('open');
			_navFromPopstate = true;
			// 同步补回守卫，拦截下一次返回
			history.pushState(null, '');
			_navGuardActive = true;
			_navFromPopstate = false;
			return;
		}
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
			_showToast('连续返回两次退出页面。', 3000);
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
			// 附件查看器打开时优先关闭（9.1）
			if (DOM.attachViewer && DOM.attachViewer.classList.contains('open')) {
				_closeAttachViewer();
				e.preventDefault();
				return;
			}
			// 死引用清理面板打开时关闭（7.6）
			if (DOM.cleanRefsOverlay && DOM.cleanRefsOverlay.style.display !== 'none') {
				_closeCleanMissingRefs();
				e.preventDefault();
				return;
			}
			// 输入框中 Escape：先取消输入框自身
			if (DOM.nianInputWrap?.classList.contains('open') && tag === 'INPUT') {
				_cancelNian();
				e.preventDefault();
				return;
			}
			if (isInput) return;
			// 笔记总览导出附加栏打开时，先关闭它
			if (DOM.boExportRow?.classList.contains('open')) {
				DOM.boExportRow.classList.remove('open');
				e.preventDefault();
				return;
			}
			if (_anyPageOpen()) {
				_closeTopmost();
				e.preventDefault();
			}
		} else if (e.key === 'BrowserBack') {
			if (DOM.boExportRow?.classList.contains('open')) {
				DOM.boExportRow.classList.remove('open');
				e.preventDefault();
				return;
			}
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
			_showToast('偏移量绝对值应小于1。');
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
		_showToast('岁取值范围：HX.-1300～HX6600。');
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
async function _openSettingsPage() {
	_syncSettingsUI();
	DOM.settingsPage.classList.add('open');
	_navOnOpen();
	// await 确保文件夹行及分割行 UI 完全更新后再呈现
	await _updateLsUI();
	await _updateAttachCaseUI();
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
		_showToast('字体设置已应用。');
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

async function _openIEPage() {
	DOM.iePage.classList.add('open');
	_navOnOpen();
	// 同步刷新本地文件夹行与分割行（修复：直接进入存储与导出页时不显示）
	await _updateLsUI();
	await _updateAttachCaseUI();
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
	expandedSui: new Set(),      // 展开的岁
	suiSelectModes: new Set(),   // 启用多选的岁
	globalSelectMode: false,     // 全局多选（筛选/搜索时）
	selectedKeys: new Set(),     // 多选选中的笔记 key
	expandedKeys: new Set(),     // 展开的笔记 key
	iconFilter: new Set(),
	searchQuery: '',
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
		startSui: state.currentSui,
		endSui: state.currentSui,
		asc: localStorage.getItem('jieLi_bo_sort_asc') !== '0',
		expandedSui: new Set([state.currentSui]),
		suiSelectModes: new Set(),
		globalSelectMode: false,
		selectedKeys: new Set(),
		expandedKeys: new Set(),
		iconFilter: new Set(),
		searchQuery: '',
	};
	DOM.boSortOrder.textContent = _boState.asc ? 'ᐱ' : 'ᐯ';
	DOM.boSortOrder.dataset.asc = _boState.asc ? '1' : '0';
	DOM.boStartSui.value = state.currentSui;
	DOM.boEndSui.value = state.currentSui;
	DOM.boExpandAllSui.classList.remove('active');
	DOM.boSearchRow.style.display = 'none';
	DOM.boIconFilterRow.style.display = 'none';
	DOM.boDeleteSelected.style.display = 'none';
	DOM.boExportSelected.style.display = 'none';
	DOM.boExportRow.classList.remove('open');
	DOM.boExportFormat.setAttribute('data-value', '1');
	DOM.boIconFilter.classList.remove('active');
	DOM.boSearch.classList.remove('active');
	_renderBijiOverview();
	DOM.boPage.classList.add('open');
	_navOnOpen();
}

function _closeBijiOverview() {
	DOM.boExportRow.classList.remove('open');
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
				assets: Array.isArray(n.assets) ? n.assets : [],
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

function _updateBODeleteBtn() {
	const show = _boState.selectedKeys.size > 0;
	DOM.boDeleteSelected.style.display = show ? '' : 'none';
	DOM.boExportSelected.style.display = show ? '' : 'none';
	if (!show && DOM.boExportRow.classList.contains('open')) {
		DOM.boExportRow.classList.remove('open');
	}
}

function _renderBijiOverview() {
	let notes = _collectBijiInRange();
	if (_boState.iconFilter.size > 0) {
		notes = notes.filter(n => _boState.iconFilter.has(n.icon));
	}
	if (_boState.searchQuery) {
		const q = _boState.searchQuery.toLowerCase();
		if (notes.length > 999) {
			_showToast('搜索范围笔记较多，可能耗时较长。');
		}
		notes = notes.filter(n => n.biji.toLowerCase().includes(q));
	}
	// 列表重渲染前清理旧缩略图 blob URL
	_listOnRerender();
	DOM.boBody.innerHTML = '';
	const filterActive = _boState.iconFilter.size > 0 || _boState.searchQuery;
	if (!filterActive && _boState.globalSelectMode) {
		_boState.globalSelectMode = false;
	}
	_updateBODeleteBtn();
	if (notes.length === 0) {
		DOM.boBody.innerHTML = '<div class="bo-empty">暂无笔记</div>';
		return;
	}
	// 按岁分组
	const suiGroups = new Map();
	for (const n of notes) {
		if (!suiGroups.has(n.sui)) suiGroups.set(n.sui, []);
		suiGroups.get(n.sui).push(n);
	}
	const suiList = [...suiGroups.keys()].sort((a, b) => _boState.asc ? a - b : b - a);
	const totalCount = notes.length;
	// 顶部计数行（含全局操作按钮）
	const countRow = document.createElement('div');
	countRow.className = 'bo-count-row';
	const countText = document.createElement('span');
	countText.className = 'bo-count';
	countText.textContent = '共 ' + totalCount + ' 条';
	countRow.appendChild(countText);
	if (filterActive) {
		const gBtnGroup = document.createElement('span');
		gBtnGroup.className = 'bo-sui-btn-group';
		const gInvert = document.createElement('button');
		gInvert.type = 'button';
		gInvert.className = 'bo-tool-btn-sm';
		gInvert.title = '反选';
		gInvert.textContent = '反选';
		gInvert.style.display = _boState.globalSelectMode ? '' : 'none';
		gInvert.addEventListener('click', () => {
			for (const n of notes) {
				if (_boState.selectedKeys.has(n.key)) _boState.selectedKeys.delete(n.key);
				else _boState.selectedKeys.add(n.key);
			}
			_renderBijiOverview();
		});
		gBtnGroup.appendChild(gInvert);
		const gSelect = document.createElement('button');
		gSelect.type = 'button';
		gSelect.className = 'bo-tool-btn-sm';
		gSelect.title = '多选';
		gSelect.textContent = '☐';
		gSelect.classList.toggle('active', _boState.globalSelectMode);
		gSelect.addEventListener('click', () => {
			_boState.globalSelectMode = !_boState.globalSelectMode;
			if (!_boState.globalSelectMode) {
				for (const n of notes) _boState.selectedKeys.delete(n.key);
			}
			_renderBijiOverview();
		});
		gBtnGroup.appendChild(gSelect);
		const gExpand = document.createElement('button');
		gExpand.type = 'button';
		gExpand.className = 'bo-tool-btn-sm';
		gExpand.title = '全部展开/收起';
		gExpand.textContent = '≛';
		gExpand.classList.toggle('active', notes.every(n => _boState.expandedKeys.has(n.key)));
		gExpand.addEventListener('click', () => {
			const allExp = notes.every(n => _boState.expandedKeys.has(n.key));
			if (allExp) {
				for (const n of notes) _boState.expandedKeys.delete(n.key);
			} else {
				for (const n of notes) _boState.expandedKeys.add(n.key);
			}
			_renderBijiOverview();
		});
		gBtnGroup.appendChild(gExpand);
		countRow.appendChild(gBtnGroup);
	}
	DOM.boBody.appendChild(countRow);
	for (const sui of suiList) {
		const suiNotes = suiGroups.get(sui);
		// 岁分组头部
		const suiHeader = document.createElement('div');
		suiHeader.className = 'bo-sui-header';
		suiHeader.dataset.sui = sui;
		const toggle = document.createElement('span');
		toggle.className = 'bo-sui-toggle';
		suiHeader.appendChild(toggle);
		const label = document.createElement('span');
		label.className = 'bo-sui-label';
		label.textContent = sui + ' 岁';
		suiHeader.appendChild(label);
		const count = document.createElement('span');
		count.className = 'bo-sui-count';
		count.textContent = suiNotes.length + ' 条';
		suiHeader.appendChild(count);
		// 右侧按钮组
		const btnGroup = document.createElement('span');
		btnGroup.className = 'bo-sui-btn-group';
		const btnInvert = document.createElement('button');
		btnInvert.type = 'button';
		btnInvert.className = 'bo-tool-btn-sm bo-sui-invert';
		btnInvert.title = '反选';
		btnInvert.textContent = '反选';
		btnInvert.style.display = 'none';
		btnGroup.appendChild(btnInvert);
		const btnSelect = document.createElement('button');
		btnSelect.type = 'button';
		btnSelect.className = 'bo-tool-btn-sm bo-sui-select';
		btnSelect.title = '多选';
		btnSelect.textContent = '☐';
		btnGroup.appendChild(btnSelect);
		const btnExpand = document.createElement('button');
		btnExpand.type = 'button';
		btnExpand.className = 'bo-tool-btn-sm bo-sui-expand';
		btnExpand.title = '全部展开/收起';
		btnExpand.textContent = '≛';
		btnGroup.appendChild(btnExpand);
		suiHeader.appendChild(btnGroup);
		DOM.boBody.appendChild(suiHeader);
		// 岁组内容
		const suiBody = document.createElement('div');
		suiBody.className = 'bo-sui-body';
		// 按日分组
		const dayGroups = new Map();
		for (const n of suiNotes) {
			const gk = n.hj;
			if (!dayGroups.has(gk)) dayGroups.set(gk, []);
			dayGroups.get(gk).push(n);
		}
		const dayKeys = [...dayGroups.keys()].sort((a, b) => _boState.asc ? a - b : b - a);
		function _updateSuiExpanded() {
			const expanded = _boState.expandedSui.has(sui);
			suiHeader.classList.toggle('expanded', expanded);
			toggle.textContent = expanded ? '⑇' : '⑉';
			suiBody.style.display = expanded ? '' : 'none';
			btnGroup.style.display = expanded ? '' : 'none';
		}
		function _updateSelectUI() {
			const selectMode = _boState.suiSelectModes.has(sui) || _boState.globalSelectMode;
			btnSelect.style.display = _boState.globalSelectMode ? 'none' : '';
			btnSelect.classList.toggle('active', _boState.suiSelectModes.has(sui));
			btnInvert.style.display = selectMode ? '' : 'none';
		}
		btnSelect.addEventListener('click', (e) => {
			e.stopPropagation();
			if (_boState.suiSelectModes.has(sui)) {
				_boState.suiSelectModes.delete(sui);
				for (const n of suiNotes) _boState.selectedKeys.delete(n.key);
			} else {
				_boState.suiSelectModes.add(sui);
			}
			_updateSelectUI();
			_updateBODeleteBtn();
			_renderSuiItems();
		});
		btnInvert.addEventListener('click', (e) => {
			e.stopPropagation();
			for (const n of suiNotes) {
				if (_boState.selectedKeys.has(n.key)) _boState.selectedKeys.delete(n.key);
				else _boState.selectedKeys.add(n.key);
			}
			_renderSuiItems();
			_updateBODeleteBtn();
		});
		btnExpand.addEventListener('click', (e) => {
			e.stopPropagation();
			const allExp = suiNotes.every(n => _boState.expandedKeys.has(n.key));
			if (allExp) {
				for (const n of suiNotes) _boState.expandedKeys.delete(n.key);
			} else {
				for (const n of suiNotes) _boState.expandedKeys.add(n.key);
			}
			_renderBijiOverview();
		});
		function _renderSuiItems() {
			suiBody.innerHTML = '';
			btnExpand.classList.toggle('active', suiNotes.every(n => _boState.expandedKeys.has(n.key)));
			const showCheck = _boState.suiSelectModes.has(sui) || _boState.globalSelectMode;
			for (const hj of dayKeys) {
				const dayNotes = dayGroups.get(hj);
				const dayLabel = document.createElement('div');
				dayLabel.className = 'bo-date-label';
				let sjr = { S: sui, J: 1, R: 1 };
				try {
					const r = jl.HJvSJRSh(hj, 0).SJR;
					if (r) sjr = r;
				} catch(e) {}
				dayLabel.textContent = Jie_Ming[sjr.J] + ' ' + sjr.R + ' 日';
				suiBody.appendChild(dayLabel);
				const list = document.createElement('div');
				list.className = 'biji-list bo-group-list';
				for (let ni = 0; ni < dayNotes.length; ni++) {
					const n = dayNotes[ni];
					const nAssets = Array.isArray(n.assets) ? n.assets : [];
					const item = document.createElement('div');
					item.className = 'biji-item' + (_boState.expandedKeys.has(n.key) ? ' expanded' : '');
					item.dataset.key = n.key;
					const summary = document.createElement('div');
					summary.className = 'biji-item-summary';
					if (showCheck) {
						item.classList.add('has-check');
						const check = document.createElement('input');
						check.type = 'checkbox';
						check.className = 'bo-note-check';
						check.checked = _boState.selectedKeys.has(n.key);
						check.addEventListener('click', (e) => e.stopPropagation());
						check.addEventListener('change', () => {
							if (check.checked) _boState.selectedKeys.add(n.key);
							else _boState.selectedKeys.delete(n.key);
							_updateBODeleteBtn();
						});
						item.appendChild(check);
					}
					// 图标移到 item 层 overlay（收起态与展开态共用），summary 内不再放图标
				// 文字为空时用不间断空格撑住行高（避免空 summary 行高塌陷）
				const _summaryText = _bijiSummaryText(n.biji);
				summary.appendChild(document.createTextNode(_summaryText === '' ? '\u00A0' : _summaryText));
					// 收起态附件角标（8.1）
					if (nAssets.length > 0) {
						const badge = _buildAttachBadge(nAssets);
						if (badge) summary.appendChild(badge);
					}
					item.appendChild(summary);
					const expand = document.createElement('div');
				expand.className = 'biji-item-expand';
				// 展开态缩略图栏置顶（8.1）
				if (nAssets.length > 0) {
					item.classList.add('has-attach');
					const thumbBar = _renderExpandThumbBar(nAssets);
					if (thumbBar) expand.appendChild(thumbBar);
				}
				// 文字为空时不添加前导空格（避免 pre-wrap 下空格形成空 line box，多1行空白）
				// 无附件时文字前补两个全角空格让出图标位置
				const _expandText = _bijiExpandText(n.biji);
				const _prefix = nAssets.length > 0 ? '' : '\u3000\u3000';
				expand.appendChild(document.createTextNode(_expandText ? _prefix + _expandText : ''));
				item.appendChild(expand);
				// 展开 overlay 图标：独立叠加在缩略图栏与内容上层，点击切换展开/收起
			// 注：与 renderBar7 共用同一逻辑，收起态与展开态共用此 overlay 图标
			const expIcon = document.createElement('span');
			expIcon.className = 'biji-icon biji-expand-icon';
			expIcon.textContent = n.icon || biji.getBijiDefaultIcon();
			item.appendChild(expIcon);
				expIcon.addEventListener('click', (e) => {
					e.stopPropagation();
					if (item.classList.contains('expanded')) {
						item.classList.remove('expanded', 'actions-visible');
						const ex = item.querySelector('.biji-item-expand');
						if (ex) { ex.style.maxHeight = ''; ex.style.minHeight = ''; }
						_boState.expandedKeys.delete(n.key);
						btnExpand.classList.remove('active');
					} else {
						DOM.boBody.querySelectorAll('.biji-item.expanded').forEach(el => {
							el.classList.remove('expanded', 'actions-visible');
							const ex = el.querySelector('.biji-item-expand');
							if (ex) { ex.style.maxHeight = ''; ex.style.minHeight = ''; }
						});
						item.classList.add('expanded');
						_boState.expandedKeys.add(n.key);
						_boActionsVisible = false;
						_updateExpandMaxHeight(item, DOM.boBody);
						btnExpand.classList.add('active');
					}
				});
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
					btnDown.disabled = ni === dayNotes.length - 1;
					btnDown.addEventListener('click', (e) => {
						e.stopPropagation();
						biji.moveNote(n.sui, n.hj, n.idx, n.idx + 1);
						_renderBijiOverview();
						renderBar7();
					});
					const btnCollapse = document.createElement('button');
					btnCollapse.textContent = '≙';
					btnCollapse.title = '收起';
					btnCollapse.addEventListener('click', (e) => {
						e.stopPropagation();
						item.classList.remove('expanded');
						const ex = item.querySelector('.biji-item-expand');
						if (ex) { ex.style.maxHeight = ''; ex.style.minHeight = ''; }
						_boState.expandedKeys.delete(n.key);
						btnExpand.classList.remove('active');
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
						_updateExpandMaxHeight(item, DOM.boBody);
						btnExpand.classList.add('active');
					});
					list.appendChild(item);
				}
				suiBody.appendChild(list);
			}
			suiBody.querySelectorAll('.biji-item.expanded').forEach(item => {
				_updateExpandMaxHeight(item, DOM.boBody);
			});
		}
		suiHeader.addEventListener('click', (e) => {
			if (e.target.closest('button')) return;
			if (_boState.expandedSui.has(sui)) {
				_boState.expandedSui.delete(sui);
			} else {
				_boState.expandedSui.add(sui);
				if (!suiBody.innerHTML) _renderSuiItems();
			}
			_updateSuiExpanded();
		});
		_updateSuiExpanded();
		_updateSelectUI();
		DOM.boBody.appendChild(suiBody);
		if (_boState.expandedSui.has(sui)) _renderSuiItems();
	}
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
	DOM.boExpandAllSui.addEventListener('click', () => {
		const notes = _collectBijiInRange();
		const suiSet = new Set(notes.map(n => n.sui));
		const allExpanded = [...suiSet].every(s => _boState.expandedSui.has(s));
		if (allExpanded) {
			for (const s of suiSet) _boState.expandedSui.delete(s);
			DOM.boExpandAllSui.classList.remove('active');
		} else {
			for (const s of suiSet) _boState.expandedSui.add(s);
			DOM.boExpandAllSui.classList.add('active');
		}
		_renderBijiOverview();
	});
	DOM.boSortOrder.addEventListener('click', () => {
		_boState.asc = !_boState.asc;
		DOM.boSortOrder.textContent = _boState.asc ? 'ᐱ' : 'ᐯ';
		DOM.boSortOrder.dataset.asc = _boState.asc ? '1' : '0';
		localStorage.setItem('jieLi_bo_sort_asc', _boState.asc ? '1' : '0');
		_renderBijiOverview();
	});
	DOM.boSuiConfirm.addEventListener('click', () => {
		const startVal = DOM.boStartSui.value.trim();
		const endVal = DOM.boEndSui.value.trim();
		const startSui = startVal ? parseInt(startVal) : null;
		const endSui = endVal ? parseInt(endVal) : null;
		if (startSui !== null && endSui !== null && startSui > endSui) {
			_showToast('首岁不能大于末岁。');
			return;
		}
		_boState.startSui = startSui;
		_boState.endSui = endSui;
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
		if (show) {
			DOM.boSearchInput.focus();
		} else {
			_boState.searchQuery = '';
			DOM.boSearchInput.value = '';
			_renderBijiOverview();
		}
	});
	DOM.boSearchBtn.addEventListener('click', () => {
		_boState.searchQuery = DOM.boSearchInput.value.trim();
		_renderBijiOverview();
	});
	DOM.boSearchInput.addEventListener('keydown', (e) => {
		if (e.key === 'Enter') {
			_boState.searchQuery = DOM.boSearchInput.value.trim();
			_renderBijiOverview();
		}
	});
	DOM.boDeleteSelected.addEventListener('click', () => {
		const count = _boState.selectedKeys.size;
		if (count === 0) return;
		if (!confirm('⚠确认要删除' + count + '条笔记吗❓ 删除操作不可撤销❗')) return;
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
				for (const idx of indices) biji.deleteNote(sui, parseInt(hj), idx);
			}
		}
		_boState.selectedKeys.clear();
		_renderBijiOverview();
		_updateBijiOverviewVisibility();
		renderCalendar();
	});
	DOM.boExportSelected.addEventListener('click', _toggleBoExportPanel);
	DOM.boExportConfirm.addEventListener('click', _confirmBoExport);
	DOM.boExportFormat.addEventListener('click', () => {
		const v = DOM.boExportFormat.getAttribute('data-value') === '1' ? '0' : '1';
		DOM.boExportFormat.setAttribute('data-value', v);
	});
}

function _bijiTimestamp() {
	const sui = String(state.currentSui);
	const jie = String(state.currentJie).padStart(2, '0');
	const hao = String(state.currentHao).padStart(2, '0');
	const now = new Date();
	const hh = String(now.getHours()).padStart(2, '0');
	const mm = String(now.getMinutes()).padStart(2, '0');
	return sui + jie + hao + '_T' + hh + mm;
}

// 切换"导出选中"附加栏显隐
function _toggleBoExportPanel() {
	if (_boState.selectedKeys.size === 0) return;
	DOM.boExportRow.classList.toggle('open');
}

// 执行导出并关闭附加栏
async function _confirmBoExport() {
	const count = _boState.selectedKeys.size;
	if (count === 0) {
		DOM.boExportRow.classList.remove('open');
		return;
	}
	const format = DOM.boExportFormat.getAttribute('data-value') === '1' ? 'text' : 'json';
	const c = _currentAttachCase();
	const exportThumbs = c !== 'C' && DOM.boExportThumbs?.checked;
	const clearAfter = DOM.boExportClear?.checked;
	const selectedKeys = [..._boState.selectedKeys];

	const ts = _bijiTimestamp();
	const ext = format === 'text' ? '.txt' : '.json';
	const mime = format === 'text' ? 'text/plain' : 'application/json';
	const noteFilename = '岁月历_选中笔记_' + ts + ext;

	// 缩略图 zip 打包
	const assetsMap = _collectThumbKeysForSelected(selectedKeys, true);
	const thumbKeys = new Set(assetsMap.keys());
	const hasAssets = thumbKeys.size > 0;
	let zipFilename = null;
	if (exportThumbs && hasAssets) {
		try {
			const packResult = await fujian.packThumbnailsToZip(thumbKeys, assetsMap);
			if (packResult.blob) {
				zipFilename = '岁月历_缩略图_' + ts + '.zip';
				await _saveFile(packResult.blob, zipFilename, 'application/zip');
			}
		} catch(e) {
			if (e.name !== 'AbortError') _showToast('缩略图包导出失败：' + e.message);
			return;
		}
	}

	const content = biji.exportSelected(selectedKeys, format, { thumbnailsZip: zipFilename });
	if (!content || content === '{}' || content === '') {
		_showToast('没有笔记数据可导出。');
		DOM.boExportRow.classList.remove('open');
		return;
	}
	try {
		await _saveFile(content, noteFilename, mime);
	} catch(e) {
		if (e.name !== 'AbortError') _showToast('导出失败：' + e.message);
		return;
	}

	if (clearAfter) {
		_clearSelectedNotes(selectedKeys);
		_boState.selectedKeys.clear();
		renderBar7();
		renderCalendar();
		_renderBijiOverview();
	}

	let msg = '已导出 ' + count + ' 条笔记';
	if (zipFilename) msg += '（含缩略图包）';
	if (clearAfter) msg += '，选中笔记已删除';
	_showToast(msg, 5000);
	DOM.boExportRow.classList.remove('open');
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
	DOM.bijiDefaultIconInput.value = getBijiDefaultIcon();
	DOM.bijiAttachIconInput.value = getBijiAttachIcon();

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
		if (_hasFileSystemAccess) {
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
		if (e.name !== 'AbortError') _showToast('选择图片失败。');
	}
}

// ========== 节庆民俗/每年重复日 导入/导出 ==========

// CSV 字段转义：含逗号、引号、换行符或首尾空格时用双引号包裹，内部双引号加倍
function _csvEscape(field) {
	const s = String(field == null ? '' : field);
	if (/[",\r\n]/.test(s) || /^\s|\s$/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
	return s;
}
function _csvEncodeRow(fields) { return fields.map(_csvEscape).join(','); }

// CSV 文本解析为二维数组（支持引号转义、字段内换行）
function _csvParse(text) {
	if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); // 去 BOM
	const rows = [];
	let row = [], field = '', inQuotes = false;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (inQuotes) {
			if (c === '"') {
				if (text[i + 1] === '"') { field += '"'; i++; }
				else inQuotes = false;
			} else field += c;
		} else {
			if (c === '"') inQuotes = true;
			else if (c === ',') { row.push(field); field = ''; }
			else if (c === '\r' || c === '\n') {
				if (c === '\r' && text[i + 1] === '\n') i++;
				row.push(field); rows.push(row); row = []; field = '';
			} else field += c;
		}
	}
	if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
	return rows;
}

// 节庆民俗列表 CSV 编码：表头 历法,始行年,月,日,日历格名,详情名,终行年
function _jieSuToCsv(data) {
	const lines = ['\uFEFF历法,始行年,月,日,日历格名,详情名,终行年'];
	for (const key of Object.keys(data)) {
		if (!Array.isArray(data[key])) continue;
		for (const item of data[key]) {
			const startYear = Number.isInteger(item[0]) ? item[0] : '';
			const endYear = Number.isInteger(item[4]) ? item[4] : '';
			const names = Array.isArray(item[3]) ? item[3] : ['', ''];
			lines.push(_csvEncodeRow([key, startYear, item[1], item[2], names[0] || '', names[1] || '', endYear]));
		}
	}
	return lines.join('\n') + '\n';
}
function _jieSuFromCsv(text) {
	const rows = _csvParse(text);
	if (rows.length < 1) throw new Error('CSV 为空');
	const expected = ['历法', '始行年', '月', '日', '日历格名', '详情名', '终行年'];
	const header = rows[0];
	if (header.length < expected.length) throw new Error('CSV 表头字段不足');
	for (let i = 0; i < expected.length; i++) {
		if (header[i] !== expected[i]) throw new Error('CSV 表头不匹配：第' + (i + 1) + '列应为「' + expected[i] + '」');
	}
	const data = {};
	for (let i = 1; i < rows.length; i++) {
		const r = rows[i];
		if (r.length === 1 && r[0] === '') continue; // 空行
		if (r.length < 6) throw new Error('第' + (i + 1) + '行字段不足');
		const key = r[0];
		if (!key) throw new Error('第' + (i + 1) + '行历法为空');
		const startYear = r[1] === '' ? '' : Number(r[1]);
		if (r[1] !== '' && isNaN(startYear)) throw new Error('第' + (i + 1) + '行始行年无效');
		const month = Number(r[2]);
		const day = Number(r[3]);
		if (isNaN(month) || isNaN(day)) throw new Error('第' + (i + 1) + '行月或日无效');
		const endYearStr = r[6] != null ? r[6] : '';
		const endYear = endYearStr === '' ? '' : Number(endYearStr);
		if (endYearStr !== '' && isNaN(endYear)) throw new Error('第' + (i + 1) + '行终行年无效');
		if (!data[key]) data[key] = [];
		data[key].push([startYear, month, day, [r[4], r[5]], endYear]);
	}
	return data;
}

// 每年重复日列表 CSV 编码：表头 历法,始行年,月,日,详情名,终行年,图标
function _fuRiToCsv(data) {
	const lines = ['\uFEFF历法,始行年,月,日,详情名,终行年,图标'];
	for (const key of Object.keys(data)) {
		if (!Array.isArray(data[key])) continue;
		for (const item of data[key]) {
			const startYear = Number.isInteger(item[0]) ? item[0] : '';
			const endYear = Number.isInteger(item[4]) ? item[4] : '';
			const icon = (item.length > 5 && item[5] != null) ? item[5] : '';
			lines.push(_csvEncodeRow([key, startYear, item[1], item[2], item[3] || '', endYear, icon]));
		}
	}
	return lines.join('\n') + '\n';
}
function _fuRiFromCsv(text) {
	const rows = _csvParse(text);
	if (rows.length < 1) throw new Error('CSV 为空');
	const expected = ['历法', '始行年', '月', '日', '详情名', '终行年', '图标'];
	const header = rows[0];
	if (header.length < expected.length) throw new Error('CSV 表头字段不足');
	for (let i = 0; i < expected.length; i++) {
		if (header[i] !== expected[i]) throw new Error('CSV 表头不匹配：第' + (i + 1) + '列应为「' + expected[i] + '」');
	}
	const data = {};
	for (let i = 1; i < rows.length; i++) {
		const r = rows[i];
		if (r.length === 1 && r[0] === '') continue;
		if (r.length < 5) throw new Error('第' + (i + 1) + '行字段不足');
		const key = r[0];
		if (!key) throw new Error('第' + (i + 1) + '行历法为空');
		const startYear = r[1] === '' ? '' : Number(r[1]);
		if (r[1] !== '' && isNaN(startYear)) throw new Error('第' + (i + 1) + '行始行年无效');
		const month = Number(r[2]);
		const day = Number(r[3]);
		if (isNaN(month) || isNaN(day)) throw new Error('第' + (i + 1) + '行月或日无效');
		const detailName = r[4] != null ? r[4] : '';
		const endYearStr = r[5] != null ? r[5] : '';
		const endYear = endYearStr === '' ? '' : Number(endYearStr);
		if (endYearStr !== '' && isNaN(endYear)) throw new Error('第' + (i + 1) + '行终行年无效');
		const icon = r[6] != null ? r[6] : '';
		if (!data[key]) data[key] = [];
		// 保持与原数据结构兼容：终行年非数字时仍占位为空字符串，图标始终追加
		data[key].push([startYear, month, day, detailName, endYear, icon]);
	}
	return data;
}

function _validateJieSu(data) {
	if (!data || typeof data !== 'object') throw new Error('须为JSON对象');
	const VALID_KEYS = ['JQ', 'AL', 'JL', 'WC'];
	for (const key of Object.keys(data)) {
		if (!VALID_KEYS.includes(key)) throw new Error('未知的历法类型：' + key);
		if (!Array.isArray(data[key])) throw new Error(key + '须为数组');
		const isJQ = key === 'JQ';
		for (let i = 0; i < data[key].length; i++) {
			const item = data[key][i];
			const pos = key + '第' + (i + 1) + '项';
			if (!Array.isArray(item)) throw new Error(pos + '须为数组');
			// 始行年（item[0]）：空字符串表示省略，否则正整数
			if (item[0] !== '' && item[0] !== undefined) {
				if (typeof item[0] !== 'number' || !Number.isInteger(item[0]) || item[0] <= 0)
					throw new Error(pos + '始行年须为正整数');
			}
			// 月/节气编号（item[1]）
			if (typeof item[1] !== 'number' || !Number.isInteger(item[1]))
				throw new Error(pos + (isJQ ? '节气编号须为整数' : '月须为整数'));
			if (isJQ) {
				if (item[1] < 0 || item[1] > 27) throw new Error(pos + '节气编号须为0~27');
			} else {
				if (item[1] < 1 || item[1] > 12) throw new Error(pos + '月须为1~12');
			}
			// 日（item[2]）：整数（含0和负数）
			if (typeof item[2] !== 'number' || !Number.isInteger(item[2]))
				throw new Error(pos + '日须为整数');
			// [日历格名, 详情名]（item[3]）
			if (!Array.isArray(item[3]) || typeof item[3][0] !== 'string' || typeof item[3][1] !== 'string')
				throw new Error(pos + '格式：[始行年?, 月, 日, [日历格名, 详情名], 终行年?]');
			// 终行年（item[4]）：空字符串或undefined表示省略，否则正整数
			if (item.length > 4 && item[4] !== '' && item[4] !== undefined) {
				if (typeof item[4] !== 'number' || !Number.isInteger(item[4]) || item[4] <= 0)
					throw new Error(pos + '终行年须为正整数');
			}
		}
	}
}

function _validateFuRi(data) {
	if (!data || typeof data !== 'object') throw new Error('须为JSON对象');
	const VALID_KEYS = ['JQ', 'AL', 'JL', 'WC'];
	for (const key of Object.keys(data)) {
		if (!VALID_KEYS.includes(key)) throw new Error('未知的历法类型：' + key);
		if (!Array.isArray(data[key])) throw new Error(key + '须为数组');
		const isJQ = key === 'JQ';
		for (let i = 0; i < data[key].length; i++) {
			const item = data[key][i];
			const pos = key + '第' + (i + 1) + '项';
			if (!Array.isArray(item)) throw new Error(pos + '须为数组');
			// 始行年（item[0]）
			if (item[0] !== '' && item[0] !== undefined) {
				if (typeof item[0] !== 'number' || !Number.isInteger(item[0]) || item[0] <= 0)
					throw new Error(pos + '始行年须为正整数');
			}
			// 月/节气编号（item[1]）
			if (typeof item[1] !== 'number' || !Number.isInteger(item[1]))
				throw new Error(pos + (isJQ ? '节气编号须为整数' : '月须为整数'));
			if (isJQ) {
				if (item[1] < 0 || item[1] > 27) throw new Error(pos + '节气编号须为0~27');
			} else {
				if (item[1] < 1 || item[1] > 12) throw new Error(pos + '月须为1~12');
			}
			// 日（item[2]）
			if (typeof item[2] !== 'number' || !Number.isInteger(item[2]))
				throw new Error(pos + '日须为整数');
			// 详情名（item[3]）
			if (typeof item[3] !== 'string')
				throw new Error(pos + '详情名须为字符串');
			// 终行年（item[4]）
			if (item.length > 4 && item[4] !== '' && item[4] !== undefined) {
				if (typeof item[4] !== 'number' || !Number.isInteger(item[4]) || item[4] <= 0)
					throw new Error(pos + '终行年须为正整数');
			}
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

// 通用应用确认对话框：复用 mergeDialog 结构，仅显示「继续 / 取消」两个按钮
function _showAppConfirm(title, htmlBody, confirmText) {
	return new Promise(resolve => {
		DOM.mergeDialogTitle.textContent = title || '确认';
		DOM.mergeDialogBody.innerHTML = htmlBody || '';
		// 仅显示「继续」「取消」
		DOM.mergeIgnoreBtn.style.display = 'none';
		DOM.mergeNewBtn.style.display = 'none';
		DOM.mergeReplaceBtn.textContent = confirmText || '继续';
		DOM.mergeCancelBtn.textContent = '取消';
		DOM.mergeDialog.classList.add('open');
		_navOnOpen();
		const cleanup = (val) => {
			DOM.mergeDialog.classList.remove('open');
			// 恢复 mergeDialog 默认按钮显示与文本
			DOM.mergeIgnoreBtn.style.display = '';
			DOM.mergeNewBtn.style.display = '';
			DOM.mergeReplaceBtn.textContent = '替换';
			DOM.mergeCancelBtn.textContent = '取消导入';
			DOM.mergeDialogTitle.textContent = '导入冲突';
			DOM.mergeDialogBody.textContent = '';
			DOM.mergeReplaceBtn.onclick = null;
			DOM.mergeCancelBtn.onclick = null;
			_navOnClose();
			resolve(val);
		};
		DOM.mergeReplaceBtn.onclick = () => cleanup(true);
		DOM.mergeCancelBtn.onclick = () => cleanup(false);
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
		const acceptTypes = { 'application/json': ['.json'], 'text/csv': ['.csv'] };
		if (_hasFileSystemAccess) {
			const [handle] = await window.showOpenFilePicker({
				types: [{ description: 'JSON 或 CSV', accept: acceptTypes }],
				multiple: false,
			});
			const file = await handle.getFile();
			const text = await readFileAsText(file);
			const data = _parseJieSuText(text, file.name);
			const result = mode === 'replace' ? data : await _mergeWithData(getJieSu(), data, 'jieSu');
			if (!result) { _showToast('导入已取消。'); return; }
			setJieSu(result);
			_rebuildAfterDataChange();
			_showToast(mode === 'replace' ? '节庆民俗列表已替换。' : '节庆民俗列表已合并。', 3000);
		} else {
			const input = document.createElement('input');
			input.type = 'file'; input.accept = '.json,.csv';
			input.onchange = async () => {
				const file = input.files[0];
				if (!file) return;
				try {
					const text = await readFileAsText(file);
					const data = _parseJieSuText(text, file.name);
					const result = mode === 'replace' ? data : await _mergeWithData(getJieSu(), data, 'jieSu');
					if (!result) { _showToast('导入已取消。'); return; }
					setJieSu(result);
					_rebuildAfterDataChange();
					_showToast(mode === 'replace' ? '节庆民俗列表已替换。' : '节庆民俗列表已合并。', 3000);
				} catch(e) { _showToast('导入失败：' + e.message); }
			};
			input.click();
		}
	} catch(e) {
		if (e.name !== 'AbortError') _showToast('导入失败：' + e.message);
	}
}

// 解析节庆民俗文本：根据扩展名或内容自动识别 JSON/CSV
function _parseJieSuText(text, filename) {
	const ext = (filename.match(/\.[^.]+$/) || [''])[0].toLowerCase();
	let data;
	if (ext === '.csv') data = _jieSuFromCsv(text);
	else if (ext === '.json') data = JSON.parse(text);
	else {
		try { data = JSON.parse(text); }
		catch(e) { data = _jieSuFromCsv(text); }
	}
	_validateJieSu(data);
	return data;
}

async function _saveFile(content, filename, mime) {
	if (_hasFileSystemAccess) {
		const ext = filename.slice(filename.lastIndexOf('.'));
		const handle = await window.showSaveFilePicker({
			suggestedName: filename,
			types: [{ description: ext.slice(1).toUpperCase(), accept: { [mime]: [ext] } }],
		});
		const writable = await handle.createWritable();
		await writable.write(content);
		await writable.close();
		return;
	}
	// content 已是 Blob 时直接用；否则包装
	const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url; a.download = filename;
	a.style.display = 'none';
	document.body.appendChild(a); a.click();
	setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
}

// 收集指定岁范围内所有笔记引用的 thumbKey（10.1）
// withAsset=true 时返回 Map<thumbKey, asset>，否则返回 Set<thumbKey>
function _collectThumbKeysInRange(startSui, endSui, withAsset) {
	const out = withAsset ? new Map() : new Set();
	for (let i = 0; i < localStorage.length; i++) {
		const k = localStorage.key(i);
		if (!k) continue;
		// 跳过非纯数字键（草稿、设置、文件配置等）
		const sui = parseInt(k);
		if (isNaN(sui)) continue;
		if (startSui !== undefined && sui < startSui) continue;
		if (endSui !== undefined && sui > endSui) continue;
		let data;
		try { data = JSON.parse(localStorage.getItem(k)); } catch(e) { continue; }
		if (!data) continue;
		for (const hj of Object.keys(data)) {
			if (!Array.isArray(data[hj])) continue;
			for (const n of data[hj]) {
				if (!n || !Array.isArray(n.assets)) continue;
				for (const a of n.assets) {
					if (!a || !a.thumbKey) continue;
					if (withAsset) {
						if (!out.has(a.thumbKey)) out.set(a.thumbKey, a);
					} else {
						out.add(a.thumbKey);
					}
				}
			}
		}
	}
	return out;
}

// 删除指定岁范围内的所有笔记（10.1 导出后删除）
function _clearBijiInRange(startSui, endSui) {
	const keysToRemove = [];
	for (let i = 0; i < localStorage.length; i++) {
		const k = localStorage.key(i);
		if (!k) continue;
		const sui = parseInt(k);
		if (isNaN(sui)) continue;
		if (startSui !== undefined && sui < startSui) continue;
		if (endSui !== undefined && sui > endSui) continue;
		keysToRemove.push(k);
	}
	for (const k of keysToRemove) {
		try { localStorage.removeItem(k); } catch(e) {}
	}
}

// 收集选中笔记的 thumbKey（笔记总览页导出选中，10.1）
// withAsset=true 时返回 Map<thumbKey, asset>，否则返回 Set<thumbKey>
function _collectThumbKeysForSelected(selectedKeys, withAsset) {
	const out = withAsset ? new Map() : new Set();
	for (const key of selectedKeys) {
		const parts = key.split(':');
		if (parts.length < 3) continue;
		const s = Number(parts[0]); const h = Number(parts[1]); const i = Number(parts[2]);
		if (isNaN(s) || isNaN(h) || isNaN(i)) continue;
		let data;
		try { data = JSON.parse(localStorage.getItem(String(s)) || '{}'); } catch(e) { continue; }
		if (!data[h] || !data[h][i]) continue;
		const n = data[h][i];
		if (!n || !Array.isArray(n.assets)) continue;
		for (const a of n.assets) {
			if (!a || !a.thumbKey) continue;
			if (withAsset) {
				if (!out.has(a.thumbKey)) out.set(a.thumbKey, a);
			} else {
				out.add(a.thumbKey);
			}
		}
	}
	return out;
}

// 删除选中笔记（10.1 导出后删除）
function _clearSelectedNotes(selectedKeys) {
	// 按 sui 分组
	const bySui = new Map();
	for (const key of selectedKeys) {
		const parts = key.split(':');
		if (parts.length < 3) continue;
		const s = Number(parts[0]); const h = Number(parts[1]); const i = Number(parts[2]);
		if (isNaN(s) || isNaN(h) || isNaN(i)) continue;
		if (!bySui.has(s)) bySui.set(s, []);
		bySui.get(s).push({ h: String(h), i });
	}
	for (const [sui, items] of bySui) {
		const k = String(sui);
		let data;
		try { data = JSON.parse(localStorage.getItem(k) || '{}'); } catch(e) { continue; }
		// 按 hj 分组，每个 hj 内按索引倒序删除
		const byHj = new Map();
		for (const it of items) {
			if (!byHj.has(it.h)) byHj.set(it.h, []);
			byHj.get(it.h).push(it.i);
		}
		for (const [hj, idxs] of byHj) {
			if (!Array.isArray(data[hj])) continue;
			idxs.sort((a, b) => b - a);
			for (const idx of idxs) {
				if (idx >= 0 && idx < data[hj].length) data[hj].splice(idx, 1);
			}
			if (data[hj].length === 0) delete data[hj];
		}
		try { localStorage.setItem(k, JSON.stringify(data)); } catch(e) {}
	}
}

async function _exportJieSu() {
	try {
		const data = getJieSu();
		const asCsv = DOM.jieSuExportFormat.getAttribute('data-value') === '1';
		if (asCsv) {
			const content = _jieSuToCsv(data);
			await _saveFile(content, '岁月历_节庆民俗列表.csv', 'text/csv');
		} else {
			const content = JSON.stringify(data, null, '\t') + '\n';
			await _saveFile(content, '岁月历_节庆民俗列表.json', 'application/json');
		}
		_showToast('节庆民俗列表已导出。', 3000);
	} catch(e) {
		if (e.name !== 'AbortError') _showToast('导出失败：' + e.message);
	}
}

async function _importFuRi() {
	try {
		const mode = DOM.fuRiImportModeToggle.getAttribute('data-value') === '1' ? 'replace' : 'merge';
		const acceptTypes = { 'application/json': ['.json'], 'text/csv': ['.csv'] };
		if (_hasFileSystemAccess) {
			const [handle] = await window.showOpenFilePicker({
				types: [{ description: 'JSON 或 CSV', accept: acceptTypes }],
				multiple: false,
			});
			const file = await handle.getFile();
			const text = await readFileAsText(file);
			const data = _parseFuRiText(text, file.name);
			const result = mode === 'replace' ? data : await _mergeWithData(getFuRi(), data, 'fuRi');
			if (!result) { _showToast('导入已取消。'); return; }
			setFuRi(result);
			_rebuildAfterDataChange();
			_showToast(mode === 'replace' ? '每年重复日列表已替换。' : '每年重复日列表已合并。', 3000);
		} else {
			const input = document.createElement('input');
			input.type = 'file'; input.accept = '.json,.csv';
			input.onchange = async () => {
				const file = input.files[0];
				if (!file) return;
				try {
					const text = await readFileAsText(file);
					const data = _parseFuRiText(text, file.name);
					const result = mode === 'replace' ? data : await _mergeWithData(getFuRi(), data, 'fuRi');
					if (!result) { _showToast('导入已取消。'); return; }
					setFuRi(result);
					_rebuildAfterDataChange();
					_showToast(mode === 'replace' ? '每年重复日列表已替换。' : '每年重复日列表已合并。', 3000);
				} catch(e) { _showToast('导入失败：' + e.message); }
			};
			input.click();
		}
	} catch(e) {
		if (e.name !== 'AbortError') _showToast('导入失败：' + e.message);
	}
}

// 解析每年重复日文本：根据扩展名或内容自动识别 JSON/CSV
function _parseFuRiText(text, filename) {
	const ext = (filename.match(/\.[^.]+$/) || [''])[0].toLowerCase();
	let data;
	if (ext === '.csv') data = _fuRiFromCsv(text);
	else if (ext === '.json') data = JSON.parse(text);
	else {
		try { data = JSON.parse(text); }
		catch(e) { data = _fuRiFromCsv(text); }
	}
	_validateFuRi(data);
	return data;
}

async function _exportFuRi() {
	try {
		const data = getFuRi();
		const asCsv = DOM.fuRiExportFormat.getAttribute('data-value') === '1';
		if (asCsv) {
			const content = _fuRiToCsv(data);
			await _saveFile(content, '岁月历_每年重复日列表.csv', 'text/csv');
		} else {
			const content = JSON.stringify(data, null, '\t') + '\n';
			await _saveFile(content, '岁月历_每年重复日列表.json', 'application/json');
		}
		_showToast('每年重复日列表已导出。', 3000);
	} catch(e) {
		if (e.name !== 'AbortError') _showToast('导出失败：' + e.message);
	}
}

function _resetJieSu() {
	setJieSu(null);
	_rebuildAfterDataChange();
	_showToast('节庆民俗列表已恢复预设。', 3000);
}

function _resetFuRi() {
	setFuRi(null);
	_rebuildAfterDataChange();
	_showToast('每年重复日列表已恢复预设。', 3000);
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
		if (!Number.isInteger(d) || !Number.isInteger(m) || !Number.isInteger(s)) { _showToast('请输入经度。'); return; }
		lng = d + m / 60 + s / 3600;
		resultEl = DOM.lngDmsResult;
	} else {
		lng = parseFloat(DOM.lngDegreeInput.value);
		if (!Number.isFinite(lng)) { _showToast('请输入经度。'); return; }
		resultEl = DOM.lngDegResult;
	}
	const r = lng2cha(lng);
	resultEl.innerHTML =
		'&ensp;•&ensp;' + r.hms.sign + r.hms.H + ' 时 ' + r.hms.M + ' 分 ' + r.hms.S + ' 秒<br/>&ensp;•&ensp;' + (r.day >= 0 ? '+' : '') + r.day.toFixed(5) + ' 日';
}

function _calcD2HMS() {
	let v = parseFloat(DOM.d2hmsInput.value);
	if (!Number.isFinite(v)) { _showToast('请输入小数日。'); return; }
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
	if (!Number.isInteger(h) || !Number.isInteger(m) || !Number.isInteger(s)) { _showToast('请输入时分秒。'); return; }
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
	if (hao > j12d[jie]) { _showToast('请输入正确的节历日期。'); return; }
	const shu = _getRadioVal('jlJiRiType');
	const result = jl.SJRvHJ(sui, jie, hao, shu);
	const typeName = shu === -1 ? 'JD' : shu === 0 ? 'MJD' : 'HJ';
	DOM.jl2hjResult.textContent = typeName + '：' + result;
}

function _calcHJ2JL() {
	const hj = parseFloat(DOM.hj2jlInput.value);
	if (!Number.isFinite(hj)) { _showToast('请输入花甲积日数。'); return; }
	if (hj < -255992) { _showToast('请输入大于等于-255992的花甲积日数。'); return; } // HX.-1300.01.01
	if (hj >= 2629791) { _showToast('请输入小于2629791的花甲积日数。'); return; } // HX6601.01.01
	const r = jl.HJvSJRSh(hj, 3);
	DOM.hj2jlResult.innerHTML =
		'华夏 ' + r.SJR.S + ' 岁 ' + Jie_Ming[r.SJR.J] + ' ' + r.SJR.R + ' 日 ' +
		((r.Shi.H || r.Shi.M || r.Shi.S) ? '　' + r.Shi.H + ' 时 ' + r.Shi.M + ' 分 ' + r.Shi.S + ' 秒' : '');
}

function _calcWC2HJ() {
	const y = parseInt(DOM.wc2hjY.value);
	const m = parseInt(DOM.wc2hjM.value);
	const d = parseInt(DOM.wc2hjD.value);
	if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) { _showToast('请输入完整的西历日期。'); return; }
	if (y === 1582 && m === 10 && d > 4 && d < 15) { _showToast('西历1582年10月没有5～14日。'); return; }
	else {
		const m12d = wc.wMonths(y).Days;
		if (d > m12d[m] && !(y === 1582 && m === 10)) { _showToast('请输入正确的西历日期。'); return; }
		else if (d > 31) { _showToast('请输入正确的西历日期。'); return; }
	}
	const shu = _getRadioVal('wcJiRiType');
	const result = wc.wYMD2MJD(y, m, d, shu);
	const typeName = shu === -1 ? 'JD' : shu === 0 ? 'MJD' : 'HJ';
	DOM.wc2hjResult.textContent = typeName + '：' + result;
}

function _calcHJ2WC() {
	const mjd = parseFloat(DOM.hj2wcInput.value);
	if (!Number.isFinite(mjd)) { _showToast('请输入MJD积日数。'); return; }
	if (mjd < -2400001) { _showToast('请输入大于等于-2400001的简化儒略日数。'); return; } // 西元前4713年1月1日
	if (mjd >= 782395) { _showToast('请输入小于782395的简化儒略日数。'); return; } // 西元4001.01.01
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
	if (!Number.isInteger(sui) || !Number.isInteger(jie) || !Number.isInteger(hao)) { _showToast('请输入完整的节历日期。'); return; }
	const j12d = jl.jJieYue(sui).RiShu;
	if (hao > j12d[jie]) { _showToast('请输入正确的节历日期。'); return; }
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
	if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) { _showToast('请输入完整的西历日期。'); return; }
	if (y === 1582 && m === 10 && d > 4 && d < 15) { _showToast('西历1582年10月没有5～14日。'); return; }
	else {
		const m12d = wc.wMonths(y).Days;
		if (d > m12d[m] && !(y === 1582 && m === 10)) { _showToast('请输入正确的西历日期'); return; }
		else if (d > 31) { _showToast('请输入正确的西历日期。'); return; }
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
				_showToast('😿检查更新失败，请稍后重试。');
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
				_showToast('当前已是最新版本。', 3000);
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
			_showToast('更新完成，刷新页面以应用新版本。', 5000);
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
				_showToast('😿发现新版本 v' + ver + '，但自动更新失败，已跳过此版本。', 5000);
				setAutoUpdateFailCount(0);
			}
		} else {
			DOM.updateStatusText.textContent = '更新失败';
			_showToast('🤔新版本安装失败（可能是浏览器响应滞后），请稍后重试。', 4000);
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
	// 列表重渲染前清理旧缩略图 blob URL（避免泄漏）
	_listOnRerender();
	DOM.bijiList.innerHTML = '';
	for (let i = 0; i < notes.length; i++) {
		const n = notes[i];
		const nAssets = Array.isArray(n.assets) ? n.assets : [];
		const item = document.createElement('div');
		item.className = 'biji-item';
		item.dataset.idx = i;
		const summary = document.createElement('div');
		summary.className = 'biji-item-summary';
		// 图标移到 item 层 overlay（收起态与展开态共用），summary 内不再放图标
	// 文字为空时用不间断空格撑住行高（避免空 summary 行高塌陷）
	const _summaryText = _bijiSummaryText(n.biji);
	summary.appendChild(document.createTextNode(_summaryText === '' ? '\u00A0' : _summaryText));
		// 收起态附件角标（8.1）
		if (nAssets.length > 0) {
			const badge = _buildAttachBadge(nAssets);
			if (badge) summary.appendChild(badge);
		}
		item.appendChild(summary);
		const expand = document.createElement('div');
		expand.className = 'biji-item-expand';
		// 展开态缩略图栏置顶（8.1：展开区域顶部为缩略图栏）
		if (nAssets.length > 0) {
			item.classList.add('has-attach');
			const thumbBar = _renderExpandThumbBar(nAssets);
			if (thumbBar) expand.appendChild(thumbBar);
		}
		// 文字为空时不添加前导空格（避免 pre-wrap 下空格形成空 line box，多1行空白）
		// 无附件时文字前补两个全角空格让出图标位置
		const _expandText = _bijiExpandText(n.biji);
		const _prefix = nAssets.length > 0 ? '' : '\u3000\u3000';
		expand.appendChild(document.createTextNode(_expandText ? _prefix + _expandText : ''));
		item.appendChild(expand);
		// 展开 overlay 图标：独立叠加在缩略图栏与内容上层，点击切换展开/收起
		// 注：收起态与展开态共用此 overlay 图标
		const expIcon = document.createElement('span');
		expIcon.className = 'biji-icon biji-expand-icon';
		expIcon.textContent = n.icon || biji.getBijiDefaultIcon();
		item.appendChild(expIcon);
		expIcon.addEventListener('click', (e) => {
			e.stopPropagation();
			const items = DOM.bijiList.querySelectorAll('.biji-item');
			if (_bijiExpandedIdx === i) {
				items[i]?.classList.remove('expanded', 'actions-visible');
				_bijiExpandedIdx = -1;
				_bijiActionsVisible = false;
				_updateBar7Height();
			} else {
				items.forEach(el => el.classList.remove('expanded', 'actions-visible'));
				items[i]?.classList.add('expanded');
				_bijiExpandedIdx = i;
				_bijiActionsVisible = false;
				_updateExpandMaxHeight(items[i]);
				_updateBar7Height();
			}
		});
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
		btnCollapse.textContent = '≙';
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

// 展开区高度计算。container 省略时基准为视口（主列表），传入容器时基准为该容器底部（总览页）
function _updateExpandMaxHeight(item, container) {
	if (!item) return;
	const expand = item.querySelector('.biji-item-expand');
	if (!expand) return;
	expand.style.maxHeight = '';
	expand.style.minHeight = '';
	const itemCS = getComputedStyle(item);
	const itemExtra = (parseFloat(itemCS.paddingTop) || 0) + (parseFloat(itemCS.paddingBottom) || 0) + (parseFloat(itemCS.borderBottomWidth) || 0);
	const lineHeight = parseFloat(getComputedStyle(expand).lineHeight) || 24;
	const scrollH = expand.scrollHeight;
	// 基准高度：无缩略图时7行，有缩略图时4行+缩略图栏高
	const thumbBar = expand.querySelector('.biji-expand-thumb-bar');
	const thumbBarH = thumbBar ? thumbBar.offsetHeight : 0;
	const baseLineCount = thumbBar ? 4 : 7;
	const baselineH = baseLineCount * lineHeight + thumbBarH;
	// 高度策略：1. 内容<=2行→2行；2. 2<内容<=基准→内容高度；3. 内容>基准且剩余<=基准→基准；4. 内容>基准且剩余>基准→剩余
	const line2 = 2 * lineHeight;
	const minPx = Math.max(line2, Math.min(scrollH, baselineH));
	const baseline = (scrollH > baselineH) ? baselineH : minPx;
	const itemRect = item.getBoundingClientRect();
	let remaining;
	if (container) {
		// 总览页：基准为容器底部，扣除容器 paddingBottom 与底部预留 44
		const containerPadBot = parseFloat(getComputedStyle(container).paddingBottom) || 0;
		const containerRect = container.getBoundingClientRect();
		remaining = Math.floor(containerRect.bottom - itemRect.top - 44 - itemExtra - containerPadBot);
	} else {
		// 主列表：基准为视口底部，底部预留 40
		remaining = window.innerHeight - itemRect.top - 40 - itemExtra;
	}
	expand.style.minHeight = minPx + 'px';
	expand.style.maxHeight = Math.max(baseline, remaining) + 'px';
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
	// 理想高度 X：7行（含附件栏）+ 结构（基础高度由6改为7）
	const X = 7 * expandLineH + structuralH + itemPadTop + itemPadBot + itemBorderBot;
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
		icon: biji.getBijiDefaultIcon(), created: null, fullscreen: false,
		undoStack: [], draftTimer: null, debounceTimer: null,
		assets: [], thumbBlobURLs: {}, thumbReleaseTimer: null
	};
	DOM.bijiTextarea.value = '';
	DOM.bijiEditIcon.textContent = biji.getBijiDefaultIcon();
	DOM.bijiEditCount.textContent = '0/' + biji.BIJI_MAX_LEN;
	DOM.bijiEditDelete.style.display = 'none';
	DOM.bijiEditor.classList.remove('fullscreen');
	DOM.bijiEditor.classList.add('open');
	DOM.bijiEditorOverlay.classList.add('active');
	_navOnOpen();
	_updateBijiHint();
	_bijiClearThumbBar();
	_refreshAttachButtonVisibility();
	DOM.bijiTextarea.focus();
}

function _bijiOpenEditForSui(sui, hj, idx) {
	const notes = biji.getDayNotes(sui, hj);
	if (!notes[idx]) return;
	const n = notes[idx];
	_bijiEditState = {
		open: true, sui, hj, idx,
		icon: n.icon || biji.getBijiDefaultIcon(), created: n.created, fullscreen: false,
		undoStack: [], draftTimer: null, debounceTimer: null,
		assets: Array.isArray(n.assets) ? n.assets.slice() : [], thumbBlobURLs: {}, thumbReleaseTimer: null
	};
	DOM.bijiTextarea.value = n.biji;
	DOM.bijiEditIcon.textContent = _bijiEditState.icon;
	DOM.bijiEditCount.textContent = n.biji.length + '/' + biji.BIJI_MAX_LEN;
	DOM.bijiEditDelete.style.display = '';
	DOM.bijiEditor.classList.remove('fullscreen');
	DOM.bijiEditor.classList.add('open');
	DOM.bijiEditorOverlay.classList.add('active');
	_navOnOpen();
	_bijiClearThumbBar();
	_bijiRenderThumbBar();
	_refreshAttachButtonVisibility();
	DOM.bijiTextarea.focus();
}

function _bijiOpenEdit(idx) {
	const notes = biji.getDayNotes(state.currentSui, _getCurrentHJ());
	if (!notes[idx]) return;
	const n = notes[idx];
	_bijiEditState = {
		open: true, sui: state.currentSui, hj: _getCurrentHJ(), idx,
		icon: n.icon || biji.getBijiDefaultIcon(), created: n.created, fullscreen: false,
		undoStack: [], draftTimer: null, debounceTimer: null,
		assets: Array.isArray(n.assets) ? n.assets.slice() : [], thumbBlobURLs: {}, thumbReleaseTimer: null
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
	_bijiClearThumbBar();
	_bijiRenderThumbBar();
	_refreshAttachButtonVisibility();
	DOM.bijiTextarea.focus();
}

function _bijiCloseEditor() {
	clearTimeout(_bijiEditState.draftTimer);
	clearTimeout(_bijiEditState.debounceTimer);
	_bijiEditState.open = false;
	// 延迟释放缩略图 blob URL（8.7）
	_bijiReleaseThumbURLs();
	if (DOM.bijiThumbScrollTrack) DOM.bijiThumbScrollTrack.innerHTML = '';
	if (DOM.bijiEditorThumbBar) DOM.bijiEditorThumbBar.style.display = 'none';
	DOM.bijiEditor.classList.remove('open', 'fullscreen');
	DOM.bijiEditorOverlay.classList.remove('active');
	_navOnClose();
}

function _bijiSave() {
	const text = DOM.bijiTextarea.value;
	const icon = _bijiEditState.icon;
	const assets = _bijiEditState.assets || [];
	if (_bijiEditState.idx !== null) {
		biji.updateNote(_bijiEditState.sui, _bijiEditState.hj, _bijiEditState.idx, text, icon, assets);
	} else {
		biji.addNote(_bijiEditState.sui, _bijiEditState.hj, text, icon, _bijiEditState.created, assets);
	}
	biji.clearDraft();
	_bijiWriteToFile(_bijiEditState.sui);
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
	const attachCount = (_bijiEditState.assets || []).length;
	const msg = attachCount > 0
		? '⚠删除操作无法撤销，该笔记含 ' + attachCount + ' 个附件，确定删除吗❓'
		: '⚠删除操作无法撤销，确定删除笔记吗❓';
	if (!confirm(msg)) return;
	biji.deleteNote(_bijiEditState.sui, _bijiEditState.hj, _bijiEditState.idx);
	biji.clearDraft();
	_bijiWriteToFile(_bijiEditState.sui);
	_bijiCloseEditor();
	renderBar7();
	renderCalendar();
	if (DOM.boPage.classList.contains('open')) _renderBijiOverview();
}

function _bijiDeleteItem(idx) {
	if (!confirm('⚠删除操作无法撤销，确定删除笔记吗❓')) return;
	biji.deleteNote(state.currentSui, _getCurrentHJ(), idx);
	_bijiWriteToFile(state.currentSui);
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
	const result = prompt('输入图标字符（留空恢复默认）：', current === biji.getBijiDefaultIcon() ? '' : current);
	if (result === null) return;
	_bijiEditState.icon = result.trim() || biji.getBijiDefaultIcon();
	DOM.bijiEditIcon.textContent = _bijiEditState.icon;
}

// ========== 附件功能：添加附件（5.1 ~ 5.8）==========
let _thumbMaintaining = false;  // 维护期间全局标志

// 情况 B：计算文件指纹（文件名 + 大小 + 修改时间）
function _attachFingerprint(file) {
	return file.name + '|' + file.size + '|' + (file.lastModified || 0);
}

// 在根目录文件夹树中递归查找是否存在同名目录节点
function _findDirInTree(tree, dirName) {
	if (!tree || !dirName) return false;
	if (tree.name === dirName) return true;
	if (Array.isArray(tree.dirs)) {
		for (const child of tree.dirs) {
			if (_findDirInTree(child, dirName)) return true;
		}
	}
	return false;
}

// 情况 B：用 webkitdirectory 授权子目录，遍历文件建立指纹缓存
// 返回授权的文件数；返回 -1 表示用户取消
async function _authorizeAttachSubDir() {
	const rootPath = getAttachRootPath();
	const rootTree = getAttachRootTree();
	// 唤起子目录选择
	const files = await new Promise(resolve => {
		const inp = document.createElement('input');
		inp.type = 'file';
		inp.webkitdirectory = true;
		inp.style.display = 'none';
		inp.addEventListener('change', () => {
			const f = inp.files;
			inp.remove();
			resolve(f && f.length ? f : null);
		});
		inp.addEventListener('cancel', () => { inp.remove(); resolve(null); });
		document.body.appendChild(inp);
		inp.click();
	});
	if (!files) return -1;  // 用户取消
	// webkitdirectory 机制：所选子目录名作为 webkitRelativePath 第一段
	// 用根目录文件夹树做软校验：子目录名应在树中存在
	const firstRel = files[0].webkitRelativePath || '';
	const subDirName = firstRel.split(/[\\/]/)[0] || '';
	if (rootPath && rootTree && !_findDirInTree(rootTree, subDirName)) {
		// 不在记录的根目录树内：提示并引导前往设置页「授权刷新」
		const tipBody = '⊘附件需约束在根目录内，所选子目录「' + subDirName + '」未在附件根目录「' + rootPath + '」的文件夹树记录中找到。<br/>若确定该子目录在根目录内，建议前往「存储与导出」页「授权刷新」。';
		const ok = await _showAppConfirm('知道了', tipBody, '去刷新');
		if (!ok) return -1;
		// 跳转到设置页「授权刷新」按钮所在位置，由用户手动触发刷新
		await _openSettingsPage();
		const target = DOM.attachRootPathRow || DOM.attachRootRefreshBtn;
		if (target) {
			target.scrollIntoView({ behavior: 'smooth', block: 'center' });
		}
		return -1;  // 终止本次子目录授权流程；用户在设置页刷新后重新触发添加附件
	}
	// 校验通过，建立指纹库
	// webkitRelativePath 第一段是所选子目录名，需保留完整相对路径（含子目录名）
	// 这样指纹比对命中后，asset.path 记录的是「子目录名/内部路径」
	const map = new Map();
	for (const f of files) {
		const rel = f.webkitRelativePath || f.name;
		// 相对根目录的路径 = 完整 webkitRelativePath（已含子目录段）
		// 例：选 photos 子目录，文件 webkitRelativePath = "photos/2024/a.jpg"
		//     相对根目录路径 = "photos/2024/a.jpg"
		const parts = rel.split(/[\\/]/).filter(Boolean);
		const relPath = parts.join('/');
		map.set(_attachFingerprint(f), relPath);
	}
	_bijiSubDirFingerprints = map;
	return map.size;
}

// 情况 B：用系统选择器选文件（多选），通过指纹比对记录 path
// 返回 [{ file, path, name }]；返回 null 表示用户取消
async function _pickFilesViaSystemPicker() {
	const input = document.createElement('input');
	input.type = 'file';
	input.multiple = true;
	const chosen = await new Promise(resolve => {
		input.onchange = () => resolve(input.files);
		input.oncancel = () => resolve(null);
		input.click();
	});
	if (!chosen || !chosen.length) return null;
	const result = [];
	let matched = 0, unmatched = 0;
	for (const file of chosen) {
		const fp = _attachFingerprint(file);
		const relPath = _bijiSubDirFingerprints ? _bijiSubDirFingerprints.get(fp) : null;
		if (relPath) {
			matched++;
			const parts = relPath.split('/').filter(Boolean);
			const name = parts[parts.length - 1];
			const path = parts.length > 1 ? parts.slice(0, -1).join('/') + '/' : '';
			result.push({ file, fileHandle: null, path, name });
		} else {
			// 指纹未命中：path 留空，仅以文件名记录
			unmatched++;
			result.push({ file, fileHandle: null, path: '', name: file.name });
		}
	}
	if (matched > 0 && unmatched > 0) {
		_showToast('已匹配 ' + matched + ' 个路径，' + unmatched + ' 个未在子目录中找到（仅记录文件名）。');
	}
	return result;
}

async function _bijiAddAttach() {
	if (_thumbMaintaining) { _showToast('缩略图维护进行中，请稍候……'); return; }
	if (!_bijiEditState.open) return;
	if (_bijiEditState.assets.length >= fujian.MAX_ATTACHMENTS) {
		_showToast('每条笔记最多 ' + fujian.MAX_ATTACHMENTS + ' 个附件。');
		return;
	}
	const c = _currentAttachCase();
	if (c === 'C') { _showToast('当前环境不支持添加附件。'); return; }
	const enabledTypes = new Set(getEnabledTypes());
	const dirHandle = c === 'A' ? await biji.getDirHandle() : null;
	if (c === 'A' && !dirHandle) { _showToast('请先指定笔记本地目录。'); return; }
	if (c === 'A' && !(await biji.verifyDirHandle())) { _showToast('本地目录权限失效，请重新授权。'); return; }
	if (c === 'B' && !getAttachRootPath()) { _showToast('请先在设置中指定附件限定根目录。'); return; }

	// 选择文件
	let filesToAdd = [];  // [{ file, fileHandle, path, name }]
	try {
		if (c === 'A') {
			// 健壮性：优先用记忆的上次访问子目录，其次用根目录，失败时回退到不带 startIn
			const startIn = _lastAttachStartInHandle || dirHandle;
			let handles;
			try {
				handles = await window.showOpenFilePicker({ multiple: true, startIn });
			} catch(e1) {
				if (e1 && (e1.name === 'AbortError' || e1.name === 'CancelError')) return; // 用户取消
				// startIn 可能失效（如记忆的子目录已删除），清空记忆并回退到根目录
				_lastAttachStartInHandle = null;
				try {
					handles = await window.showOpenFilePicker({ multiple: true, startIn: dirHandle });
				} catch(e2) {
					if (e2 && (e2.name === 'AbortError' || e2.name === 'CancelError')) return;
					handles = await window.showOpenFilePicker({ multiple: true });
				}
			}
			if (!handles || !handles.length) return; // 用户取消
			for (const fh of handles) {
				if (!(await _isWithinRoot(fh))) { _showToast('⊘仅可添加本地指定根目录内的文件！'); return; }
				const file = await fh.getFile();
				const rel = await dirHandle.resolve(fh);
				if (!rel || !rel.length) continue;
				const name = rel[rel.length - 1];
				const path = rel.length > 1 ? rel.slice(0, -1).join('/') + '/' : '';
				filesToAdd.push({ file, fileHandle: fh, path, name });
			}
			// 记忆本次访问的子目录：取第一个文件父目录 handle，验证在根目录内
			try {
				const rel0 = await dirHandle.resolve(handles[0]);
				if (rel0 && rel0.length > 0 && !rel0[0].startsWith('..')) {
					let parentHandle = dirHandle;
					for (let i = 0; i < rel0.length - 1; i++) {
						parentHandle = await parentHandle.getDirectoryHandle(rel0[i]);
					}
					_lastAttachStartInHandle = parentHandle;
				} else {
					_lastAttachStartInHandle = null;
				}
			} catch(e) {
				_lastAttachStartInHandle = null;
			}
		} else if (c === 'B') {
			// 情况 B：子目录授权（首次）+ 系统选择器选文件 + 指纹比对记录 path
			// 首次添加附件（运行时）：触发子目录授权建立指纹库
			if (!_bijiSubDirFingerprints) {
				const ok = await _showAppConfirm('授权子目录访问',
					'请指定附件所在【子目录】，即附件保存的具体文件夹；此过程与指定根目录相同，仍将唤起「上传」选择器。');
				if (!ok) return;
				const n = await _authorizeAttachSubDir();
				if (n < 0) return;  // 用户取消
				_showToast('已授权子目录，记录 ' + n + ' 个文件指纹。');
			}
			// 系统选择器选文件；取消后提供【指定其他子目录】入口
			let picked = await _pickFilesViaSystemPicker();
			if (!picked) {
				// 用户取消系统选择器：询问是否指定其他子目录
				const retry = await _showAppConfirm('指定其他子目录',
					'是否重新选择附件所在的子目录？选择后将重新授权并再次唤起「上传」选择器。');
				if (!retry) return;
				const n = await _authorizeAttachSubDir();
				if (n < 0) return;
				_showToast('已重新指定子目录，记录 ' + n + ' 个文件指纹。');
				picked = await _pickFilesViaSystemPicker();
				if (!picked) return;
			}
			filesToAdd = picked;
		}
	} catch(e) {
		if (e && (e.name === 'AbortError' || e.name === 'CancelError')) return; // 用户取消，静默
		_showToast('添加附件失败：' + (e.message || e));
		return;
	}

	// 上限校验
	const remain = fujian.MAX_ATTACHMENTS - _bijiEditState.assets.length;
	if (filesToAdd.length > remain) {
		_showToast('一次最多添加 ' + remain + ' 个附件，已忽略多余文件。');
		filesToAdd = filesToAdd.slice(0, remain);
	}

	// 逐个处理
	let added = 0;
	for (const item of filesToAdd) {
		try {
			const { asset } = await fujian.addAttachmentFlow(item.file, {
				path: item.path, name: item.name,
				fileHandle: item.fileHandle, enabledTypes
			});
			// 情况 A：同步缩略图到本地镜像（3.3）
			if (c === 'A' && dirHandle) {
				const thumbVal = await fujian.getThumbnail(asset.thumbKey);
				if (thumbVal && thumbVal.blob) {
					try { await fujian._syncThumbToLocal(asset.thumbKey, thumbVal.blob, dirHandle); }
					catch(e) { /* 本地镜像失败不影响添加，仅 toast */ _showToast('缩略图本地镜像失败：' + (e.message || e)); }
				}
			}
			_bijiEditState.assets.push(asset);
			added++;
		} catch(e) {
			_showToast('附件「' + item.name + '」添加失败：' + (e.message || e));
		}
	}

	if (added > 0) {
		// icon 替换规则（3.1）：第一个附件添加后，icon 为默认图标则替换为带附件默认图标
		if (_bijiEditState.assets.length === added && _bijiEditState.icon === biji.getBijiDefaultIcon()) {
			_bijiEditState.icon = biji.getBijiAttachIcon();
			DOM.bijiEditIcon.textContent = _bijiEditState.icon;
		}
		_bijiRenderThumbBar();
		_showToast('已添加 ' + added + ' 个附件。');
		// 存储空间估算提示（6.8）
		_checkStorageEstimate();
	}
}

// 存储空间估算提示（6.8）
async function _checkStorageEstimate() {
	if (!navigator.storage || !navigator.storage.estimate) return;
	try {
		const est = await navigator.storage.estimate();
		if (est.usage && est.usage > 50 * 1024 * 1024) {
			const mb = (est.usage / 1024 / 1024).toFixed(1);
			_showToast('存储已用 ' + mb + 'MB，可执行缩略图维护或停用区间/类型以腾出空间。', 5000);
		}
	} catch(e) { /* 静默忽略，不支持的浏览器不提示 */ }
}

// ========== 列表附件呈现（8.1 收起态角标 / 8.2 展开态缩略图栏）==========

// 收起态角标：按类型分组计数（🖼️2 🎬），仅一个不显数量；不加×号
function _buildAttachBadge(assets) {
	if (!assets || !assets.length) return null;
	const order = [];  // 按首次出现顺序记录类型
	const counts = new Map();
	for (const a of assets) {
		if (!a) continue;
		const t = a.type || 'other';
		if (!counts.has(t)) { counts.set(t, 0); order.push(t); }
		counts.set(t, counts.get(t) + 1);
	}
	const parts = order.map(t => {
		const icon = fujian.TYPE_ICON[t] || fujian.TYPE_ICON.other;
		const n = counts.get(t);
		return n > 1 ? icon + n : icon;
	});
	const total = assets.length;
	const badge = document.createElement('span');
	badge.className = 'biji-item-attach-badge';
	badge.textContent = parts.join(' ');
	badge.title = total + ' 个附件';
	return badge;
}

// 展开态缩略图栏（列表用，只读，无删除/换位）
// 与编辑器栏共用 .thumb-item 结构；blob URL 生命周期由 _listThumbURLs 集中管理
const _listThumbURLs = new Map();  // { thumbKey: { url, refs:Set<item> } }

async function _listLoadThumbIntoItem(asset, item) {
	if (!asset.thumbKey) return;
	if (!item.isConnected) return;
	let entry = _listThumbURLs.get(asset.thumbKey);
	if (!entry) {
		let url;
		try {
			url = await fujian.getThumbnailBlobURL(asset.thumbKey);
		} catch(e) {
			return;
		}
		if (!url) return; // 无缩略图，保持占位图标
		entry = { url, refs: new Set() };
		_listThumbURLs.set(asset.thumbKey, entry);
	}
	entry.refs.add(item);
	if (!item.isConnected) { _listMaybeReleaseURL(asset.thumbKey); return; }
	// 缩略图始终是图片（WebP/PNG），统一用 img 元素加载
	const media = document.createElement('img');
	media.className = 'thumb-item-media';
	media.src = entry.url;
	const onReady = () => {
		if (!item.isConnected) return;
		const icon = item.querySelector('.thumb-item-icon');
		if (icon) icon.remove();
		item.insertBefore(media, item.firstChild);
	};
	if (media.decode) {
		media.decode().then(onReady).catch(() => { media.addEventListener('load', onReady, { once: true }); });
	} else {
		media.addEventListener('load', onReady, { once: true });
	}
}

function _listMaybeReleaseURL(thumbKey) {
	const entry = _listThumbURLs.get(thumbKey);
	if (!entry) return;
	// 清除已断开连接的 item 引用
	for (const it of entry.refs) {
		if (!it.isConnected) entry.refs.delete(it);
	}
	if (entry.refs.size === 0) {
		URL.revokeObjectURL(entry.url);
		_listThumbURLs.delete(thumbKey);
	}
}

function _listPurgeThumbURLs() {
	for (const [key, entry] of _listThumbURLs) {
		URL.revokeObjectURL(entry.url);
	}
	_listThumbURLs.clear();
}

// 构造展开态缩略图栏 DOM（已附加到 expand 容器末尾）
function _renderExpandThumbBar(asset) {
	if (!asset || !asset.length) return null;
	const bar = document.createElement('div');
	bar.className = 'biji-expand-thumb-bar';
	const prev = document.createElement('div');
	prev.className = 'thumb-scroll-btn thumb-scroll-prev';
	prev.title = '向左滚动';
	prev.textContent = '‹';
	const track = document.createElement('div');
	track.className = 'thumb-scroll-track';
	const next = document.createElement('div');
	next.className = 'thumb-scroll-btn thumb-scroll-next';
	next.title = '向右滚动';
	next.textContent = '›';
	bar.append(prev, track, next);
	const pendings = [];  // 待 DOM 连接后异步加载缩略图
	for (let i = 0; i < asset.length; i++) {
		const a = asset[i];
		const item = document.createElement('div');
		item.className = 'thumb-item';
		item.title = a.name || '';
		const icon = document.createElement('span');
		icon.className = 'thumb-item-icon';
		icon.textContent = fujian.TYPE_ICON[a.type] || fujian.TYPE_ICON.other;
		item.appendChild(icon);
		track.appendChild(item);
		pendings.push({ asset: a, item });
		// 绑定点击浏览（9.1）
		const idx = i;
		item.addEventListener('click', () => _openAttachViewer(asset, idx, 'list'));
	}
	// 滚动键交互（始终可点击，溢出时高亮）
	prev.addEventListener('click', () => track.scrollBy({ left: -track.clientWidth * 0.8, behavior: 'smooth' }));
	next.addEventListener('click', () => track.scrollBy({ left: track.clientWidth * 0.8, behavior: 'smooth' }));
	// 溢出检测：切换 .active 类高亮
	const updateState = () => {
		const overflow = track.scrollWidth > track.clientWidth + 1;
		prev.classList.toggle('active', overflow);
		next.classList.toggle('active', overflow);
	};
	track.addEventListener('scroll', updateState);
	// 延迟到下一 microtask，确保 bar 被 append 到 DOM 后再异步加载与检测
	queueMicrotask(() => {
		for (const p of pendings) {
			if (p.item.isConnected) _listLoadThumbIntoItem(p.asset, p.item);
		}
		requestAnimationFrame(updateState);
		requestAnimationFrame(() => requestAnimationFrame(updateState));
	});
	// 媒体加载后再次检测（decode 完成后尺寸变化）
	setTimeout(updateState, 300);
	return bar;
}

// 维护后刷新主列表展开态缩略图栏（重建 bar，重新加载 blob）
function _refreshMainListExpandThumb() {
	const expandedItem = DOM.bijiList.querySelector('.biji-item.expanded');
	if (!expandedItem) return;
	const idx = parseInt(expandedItem.dataset.idx, 10);
	if (isNaN(idx)) return;
	const hj = _getCurrentHJ();
	const notes = biji.getDayNotes(state.currentSui, hj);
	const n = notes[idx];
	if (!n) return;
	const nAssets = Array.isArray(n.assets) ? n.assets : [];
	const expand = expandedItem.querySelector('.biji-item-expand');
	if (!expand) return;
	const oldBar = expand.querySelector('.biji-expand-thumb-bar');
	if (oldBar) oldBar.remove();
	if (nAssets.length > 0) {
		const newBar = _renderExpandThumbBar(nAssets);
		if (newBar) expand.insertBefore(newBar, expand.firstChild);
	}
	_updateExpandMaxHeight(expandedItem);
	_updateBar7Height();
}

// 列表重渲染时统一清理旧 URL
function _listOnRerender() {
	_listPurgeThumbURLs();
}
// 占位图标 → 异步加载 blob URL → placeholder.remove() 再 append
function _bijiRenderThumbBar() {
	const track = DOM.bijiThumbScrollTrack;
	if (!track) return;
	// 先清空 DOM（断开旧 item 连接，使异步加载的 isConnected 检查失败而提前返回）
	track.innerHTML = '';
	// 再释放旧 URL（避免异步竞态导致 ERR_FILE_NOT_FOUND，8.7）
	_bijiReleaseThumbURLsImmediate();
	const assets = _bijiEditState.assets || [];
	if (!assets.length) {
		DOM.bijiEditorThumbBar.style.display = 'none';
		_updateThumbBarScrollState();
		return;
	}
	DOM.bijiEditorThumbBar.style.display = 'flex';
	for (let i = 0; i < assets.length; i++) {
		const asset = assets[i];
		const item = document.createElement('div');
		item.className = 'thumb-item';
		item.draggable = true;
		item.dataset.idx = String(i);
		item.dataset.thumbKey = asset.thumbKey || '';
		item.title = asset.name || '';
		// 占位图标（先 append，避免布局抖动）
		const icon = document.createElement('span');
		icon.className = 'thumb-item-icon';
		icon.textContent = fujian.TYPE_ICON[asset.type] || fujian.TYPE_ICON.other;
		item.appendChild(icon);
		// 删除按钮（移动端长按显示，桌面端 hover 显示）
		const del = document.createElement('span');
		del.className = 'thumb-item-del';
		del.textContent = '×';
		del.title = '删除附件';
		item.appendChild(del);
		track.appendChild(item);
		// 异步加载缩略图
		_loadThumbIntoItem(asset, item);
		// 绑定拖拽
		_bindThumbItemDrag(item);
		// 绑定删除
		del.addEventListener('click', (e) => { e.stopPropagation(); _bijiDeleteAttach(i); });
		// 绑定长按（移动端）
		_bindThumbItemLongPress(item, i);
		// 绑定点击浏览（9.1）
		item.addEventListener('click', (e) => {
			if (e.target === del || item.classList.contains('dragging')) return;
			_openAttachViewer(_bijiEditState.assets, i, 'editor');
		});
	}
	_updateThumbBarScrollState();
}

// 异步加载缩略图到 item
async function _loadThumbIntoItem(asset, item) {
	if (!asset.thumbKey) return;
	if (!item.isConnected) return; // 连接性检查（8.6）
	let url = _bijiEditState.thumbBlobURLs[asset.thumbKey];
	if (!url) {
		url = await fujian.getThumbnailBlobURL(asset.thumbKey);
		if (!url) return; // 缩略图不存在（停用类型或生成失败），保持占位图标
		_bijiEditState.thumbBlobURLs[asset.thumbKey] = url;
	}
	if (!item.isConnected) return; // 再次检查（8.6）
	// 缩略图始终是图片（WebP/PNG），统一用 img 元素加载
	const media = document.createElement('img');
	media.className = 'thumb-item-media';
	media.src = url;
	// 用 decode() 等待解码完成再替换（8.5），不支持的降级到 load 事件
	const onReady = () => {
		if (!item.isConnected) return;
		const icon = item.querySelector('.thumb-item-icon');
		if (icon) icon.remove();
		item.insertBefore(media, item.firstChild);
		_updateThumbBarScrollState();
	};
	if (media.decode) {
		media.decode().then(onReady).catch(() => { media.addEventListener('load', onReady, { once: true }); });
	} else {
		media.addEventListener('load', onReady, { once: true });
	}
}

// 滚动溢出检测（8.5）
function _updateThumbBarScrollState() {
	const track = DOM.bijiThumbScrollTrack;
	if (!track) return;
	const overflow = track.scrollWidth > track.clientWidth + 1;
	DOM.bijiThumbScrollPrev.style.visibility = overflow ? '' : 'hidden';
	DOM.bijiThumbScrollNext.style.visibility = overflow ? '' : 'hidden';
	// 媒体加载后重新检测
	requestAnimationFrame(_updateThumbBarScrollState2);
}
function _updateThumbBarScrollState2() {
	const track = DOM.bijiThumbScrollTrack;
	if (!track) return;
	const overflow = track.scrollWidth > track.clientWidth + 1;
	DOM.bijiThumbScrollPrev.style.visibility = overflow ? '' : 'hidden';
	DOM.bijiThumbScrollNext.style.visibility = overflow ? '' : 'hidden';
}

// 拖拽换位（5.6）
let _draggedThumbIdx = null;
function _bindThumbItemDrag(item) {
	item.addEventListener('dragstart', (e) => {
		_draggedThumbIdx = parseInt(item.dataset.idx, 10);
		item.classList.add('dragging');
		e.dataTransfer.effectAllowed = 'move';
	});
	item.addEventListener('dragend', () => {
		item.classList.remove('dragging');
		_draggedThumbIdx = null;
	});
	item.addEventListener('dragover', (e) => {
		e.preventDefault();
		e.dataTransfer.dropEffect = 'move';
	});
	item.addEventListener('drop', (e) => {
		e.preventDefault();
		const from = _draggedThumbIdx;
		const to = parseInt(item.dataset.idx, 10);
		if (from === null || from === to || isNaN(from) || isNaN(to)) return;
		_bijiMoveAttach(from, to);
	});
}

// 移动端长按显示删除键（8.4）
function _bindThumbItemLongPress(item, idx) {
	let timer = null;
	const start = (e) => {
		if (e.touches && e.touches.length) {
			timer = setTimeout(() => {
				item.classList.add('show-del');
				if (navigator.vibrate) navigator.vibrate(30);
			}, 500);
		}
	};
	const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };
	item.addEventListener('touchstart', start, { passive: true });
	item.addEventListener('touchend', cancel);
	item.addEventListener('touchmove', cancel, { passive: true });
	item.addEventListener('touchcancel', cancel);
}

// 换位
function _bijiMoveAttach(from, to) {
	if (from === to) return;
	const arr = _bijiEditState.assets;
	if (from < 0 || from >= arr.length || to < 0 || to >= arr.length) return;
	const [moved] = arr.splice(from, 1);
	arr.splice(to, 0, moved);
	_bijiRenderThumbBar();
}

// 删除单个附件（5.7 需确认）
function _bijiDeleteAttach(idx) {
	const arr = _bijiEditState.assets;
	if (idx < 0 || idx >= arr.length) return;
	const asset = arr[idx];
	if (!confirm('删除附件引用「' + (asset.name || '') + '」？\n（缩略图将由「维护」功能统一处理。）')) return;
	arr.splice(idx, 1);
	// 若附件清空且 icon 为带附件默认图标，恢复默认图标（3.1 反向规则）
	if (arr.length === 0 && _bijiEditState.icon === biji.getBijiAttachIcon()) {
		_bijiEditState.icon = biji.getBijiDefaultIcon();
		DOM.bijiEditIcon.textContent = _bijiEditState.icon;
	}
	_bijiRenderThumbBar();
}

// blob URL 延迟释放（8.7）：延迟 500ms，避免异步竞态导致 ERR_FILE_NOT_FOUND
function _bijiReleaseThumbURLs() {
	clearTimeout(_bijiEditState.thumbReleaseTimer);
	_bijiEditState.thumbReleaseTimer = setTimeout(_bijiReleaseThumbURLsImmediate, 500);
}
function _bijiReleaseThumbURLsImmediate() {
	const urls = _bijiEditState.thumbBlobURLs;
	for (const k in urls) {
		if (urls[k]) { URL.revokeObjectURL(urls[k]); }
	}
	_bijiEditState.thumbBlobURLs = {};
}

// 清空缩略图栏 DOM
function _bijiClearThumbBar() {
	if (DOM.bijiThumbScrollTrack) DOM.bijiThumbScrollTrack.innerHTML = '';
	if (DOM.bijiEditorThumbBar) DOM.bijiEditorThumbBar.style.display = 'none';
	_bijiReleaseThumbURLsImmediate();
}

// ========== 附件浏览遮罩（9.1 / 9.2 / 9.3）==========
// 状态：当前附件集合、索引、来源、权限情况、单次授权标志、Blob URL、音量、缩放
let _attachViewerState = {
	assets: null,
	index: 0,
	asset: null,         // 当前附件对象（缓存，便于键盘交互判断类型）
	source: 'editor',    // 'editor' | 'list'
	case: 'A',           // 'A' | 'B' | 'C'
	singleAuth: false,   // 已废弃（原情况 B 单次授权模式），保留字段防御性兼容
	blobURL: null,       // 当前原文件 Blob URL（关闭时释放）
	thumbBlobURL: null,  // 当前缩略图 Blob URL（原文件丢失降级用）
	isThumbFallback: false, // 当前是否为缩略图降级显示
	volume: 1,           // 会话内持久化音量（0~1）
	scale: 1,            // 图片缩放比例（切换时重置，9.1）
	scaleMin: 0.1,       // 动态计算的缩放下限
	scaleMax: 5,         // 动态计算的缩放上限
	tx: 0,               // 图片平移 X（px，scale>1 时生效）
	ty: 0,               // 图片平移 Y（px，scale>1 时生效）
	textFontScale: 1,   // 文本附件字号缩放比例（0.5~4，相对基础字号）
};

// 打开附件浏览遮罩
// assets: 附件数组；idx: 起始索引；source: 'editor' | 'list'
async function _openAttachViewer(assets, idx, source) {
	if (!assets || !assets.length || idx < 0 || idx >= assets.length) return;
	const asset = assets[idx];
	if (!asset) return;
	// 9.1：📊 (other) 不触发浏览
	if (asset.type === 'other') return;

	const c = _currentAttachCase();
	if (c === 'C') return; // 不应到达，防护

	// 情况 B：检查 askAccess 开关（9.2）
	if (c === 'B' && !getAttachAskAccess()) {
		_showToast('原文件浏览未启用。可在「存储与导出」中开启「每次运行授权访问」。');
		return;
	}

	// 初始化状态
	_attachViewerState.assets = assets;
	_attachViewerState.index = idx;
	_attachViewerState.source = source || 'editor';
	_attachViewerState.case = c;
	_attachViewerState.singleAuth = false;  // 放弃原单次授权模式
	_attachViewerState.scale = 1;
	_attachViewerState.tx = 0;
	_attachViewerState.ty = 0;

	// 显示遮罩（display 由 .open 类控制，避免与初始 inline none 冲突）
	DOM.attachViewer.style.display = '';
	// 强制重排以触发过渡
	void DOM.attachViewer.offsetWidth;
	DOM.attachViewer.classList.add('open');

	// UI：情况 A/B 均显示左右切换；情况 B 首次需授权根目录
	_updateAttachViewerNav();
	if (c === 'B' && !_bijiRootFileMap) {
		DOM.attachViewerHint.textContent = '等待根目录授权——';
		DOM.attachViewerHint.style.display = '';
	} else {
		DOM.attachViewerHint.style.display = 'none';
	}

	// 加载内容
	await _loadAttachViewerContent(asset);
}

// 加载当前附件内容到 stage
async function _loadAttachViewerContent(asset) {
	if (!asset) return;
	_attachViewerState.asset = asset;  // 缓存当前附件供键盘交互判断类型
	// 释放上一次的 Blob URL
	_attachViewerReleaseURLs();
	// 清空 stage（先暂停媒体，避免关闭后仍播放音频）
	const oldMedias = DOM.attachViewerStage.querySelectorAll('video, audio');
	for (const m of oldMedias) {
		try { m.pause(); m.src = ''; m.load(); } catch(e) {}
	}
	DOM.attachViewerStage.innerHTML = '';
	DOM.attachViewerInfo.textContent = '';

	// 重置缩放与平移（切换附件时，9.1）
	_attachViewerState.scale = 1;
	_attachViewerState.scaleMin = 0.1;
	_attachViewerState.scaleMax = 5;
	_attachViewerState.tx = 0;
	_attachViewerState.ty = 0;
	_attachViewerState.isThumbFallback = false;
	_attachViewerState.textFontScale = 1;  // 文本附件字号缩放重置

	// 获取原文件
	let file = null;
	let missingReason = 'notFound';  // 默认原因：原文件未找到
	if (_attachViewerState.case === 'A') {
		try {
			const r = await _resolveFileFromPath(asset);
			if (r instanceof File) file = r;
			else missingReason = r;  // 'noDir' | 'noPerm' | 'notFound'
		} catch(e) { file = null; missingReason = 'notFound'; }
	} else if (_attachViewerState.case === 'B') {
		// 情况 B：askAccess 已开启（_openAttachViewer 已校验）
		// 首次访问触发根目录授权，建立「相对路径→File」映射表
		if (!_bijiRootFileMap) {
			DOM.attachViewerHint.textContent = '请授权本次运行的【根目录】访问权限——';
			DOM.attachViewerHint.style.display = '';
			const n = await _authorizeAttachRootForBrowse();
			if (n < 0) {
				// 用户取消授权：关闭遮罩
				_closeAttachViewer();
				return;
			}
			DOM.attachViewerHint.style.display = 'none';
			_showToast('本次运行已授权，映射 ' + n + ' 个文件。');
		}
		// 从映射表取 File
		file = _getFileFromRootMap(asset);
		if (!file) missingReason = 'notFound';
	}

	if (file) {
		_renderAttachViewerMedia(asset, file);
	} else {
		// 9.1：附件原文件丢失，显示缩略图/类型图标及提示（区分原因）
		await _renderAttachViewerMissing(asset, missingReason);
	}

	// 信息栏：文件名（可选相对路径） + 大小 + 索引
	const total = _attachViewerState.assets.length;
	const cur = _attachViewerState.index + 1;
	const sizeText = (typeof asset.size === 'number') ? _formatFileSize(asset.size) : '';
	const idxText = (total > 1 && !_attachViewerState.singleAuth) ? '  ' + cur + '/' + total : '';
	// attachShowPath 关闭时仅显示文件名，开启时显示相对路径 + 文件名
	const namePart = asset.name || '';
	const relPath = getAttachShowPath() ? ((asset.path || '') + namePart) : namePart;
	DOM.attachViewerInfo.textContent = relPath + (sizeText ? '  ' + sizeText : '') + idxText;
}

// 渲染媒体内容（原文件存在）
function _renderAttachViewerMedia(asset, file) {
	const url = URL.createObjectURL(file);
	_attachViewerState.blobURL = url;
	const stage = DOM.attachViewerStage;
	// 字号缩放浮动控件：仅文本附件显示
	if (DOM.attachViewerFontZoom) {
		DOM.attachViewerFontZoom.style.display = (asset.type === 'text') ? '' : 'none';
		// 切换非文本时收起面板
		if (asset.type !== 'text' && DOM.attachViewerFontZoomPanel) {
			DOM.attachViewerFontZoomPanel.style.display = 'none';
		}
	}
	if (asset.type === 'image') {
		const img = document.createElement('img');
		img.className = 'attach-viewer-media attach-viewer-img';
		img.src = url;
		img.alt = asset.name || '';
		img.draggable = false;
		// 加载完成后计算缩放范围（基于原件尺寸与视口尺寸）
		img.addEventListener('load', () => _attachViewerComputeScaleRange(img, false));
		stage.appendChild(img);
	} else if (asset.type === 'video') {
		const video = document.createElement('video');
		video.className = 'attach-viewer-media attach-viewer-video';
		video.src = url;
		video.controls = true;
		video.volume = _attachViewerState.volume;
		video.addEventListener('volumechange', () => {
			_attachViewerState.volume = video.volume;
		});
		stage.appendChild(video);
	} else if (asset.type === 'audio') {
		const wrap = document.createElement('div');
		wrap.className = 'attach-viewer-audio-wrap';
		const icon = document.createElement('div');
		icon.className = 'attach-viewer-audio-icon';
		icon.textContent = fujian.TYPE_ICON.audio;
		const audio = document.createElement('audio');
		audio.className = 'attach-viewer-media attach-viewer-audio';
		audio.src = url;
		audio.controls = true;
		audio.volume = _attachViewerState.volume;
		audio.addEventListener('volumechange', () => {
			_attachViewerState.volume = audio.volume;
		});
		wrap.append(icon, audio);
		stage.appendChild(wrap);
	} else if (asset.type === 'text') {
		// 异步读取文本（≤16kB，9.1）：用 slice 避免大文件一次性加载
		const limit = fujian.TEXT_PREVIEW_MAX;
		const overflow = file.size > limit;
		file.slice(0, limit).arrayBuffer().then(buf => {
			// UTF-8 解码（不强制 fatal，避免乱码直接抛错）
			const decoder = new TextDecoder('utf-8', { fatal: false });
			const text = decoder.decode(new Uint8Array(buf));
			_renderAttachViewerText(text, overflow);
		}).catch(() => {
			_renderAttachViewerText('（无法读取文件内容）', false);
		});
	}
}

// 渲染文本附件
function _renderAttachViewerText(text, overflow) {
	const stage = DOM.attachViewerStage;
	const pre = document.createElement('pre');
	pre.className = 'attach-viewer-text';
	pre.textContent = text;
	// 应用字号缩放（基础字号由 CSS 定义，这里乘以 textFontScale）
	_applyAttachViewerTextFontScale(pre);
	if (overflow) {
		// 提示放在 pre 内部末尾，出现在文本截断位置（需滚动到底可见）
		const tip = document.createElement('div');
		tip.className = 'attach-viewer-text-tip';
		tip.textContent = '内容过长，请用专用软件打开。';
		pre.appendChild(tip);
	}
	stage.appendChild(pre);
}

// 应用文本附件字号缩放（50%~400%）
const ATTACH_VIEWER_TEXT_FONT_SCALE_MIN = 0.5;
const ATTACH_VIEWER_TEXT_FONT_SCALE_MAX = 4;
// 缓存基础字号（首次渲染时从 computed style 读取，避免覆盖后再读取得不到原值）
let _attachViewerTextBaseFontSize = 0;
function _applyAttachViewerTextFontScale(pre) {
	if (!pre) {
		pre = DOM.attachViewerStage.querySelector('.attach-viewer-text');
	}
	if (!pre) return;
	// 首次记录基础字号（pre 尚未应用 inline fontSize 时读取）
	if (!_attachViewerTextBaseFontSize) {
		const fs = getComputedStyle(pre).fontSize;
		_attachViewerTextBaseFontSize = parseFloat(fs) || 16;
	}
	// 直接以 px 为单位应用缩放（避免 rem 单位与基础字号混淆）
	pre.style.fontSize = (_attachViewerTextBaseFontSize * _attachViewerState.textFontScale).toFixed(1) + 'px';
}
// 调整字号缩放（delta 为相对步进）
function _attachViewerTextZoom(delta) {
	let next = _attachViewerState.textFontScale + delta;
	if (next < ATTACH_VIEWER_TEXT_FONT_SCALE_MIN) next = ATTACH_VIEWER_TEXT_FONT_SCALE_MIN;
	if (next > ATTACH_VIEWER_TEXT_FONT_SCALE_MAX) next = ATTACH_VIEWER_TEXT_FONT_SCALE_MAX;
	if (Math.abs(next - _attachViewerState.textFontScale) < 0.01) return;
	_attachViewerState.textFontScale = next;
	_applyAttachViewerTextFontScale();
}

// 渲染原文件丢失（9.1：显示缩略图/类型图标及提示，最大显示为自身尺寸的200%）
async function _renderAttachViewerMissing(asset, reason) {
	const stage = DOM.attachViewerStage;
	const wrap = document.createElement('div');
	wrap.className = 'attach-viewer-missing';

	// 尝试获取缩略图
	let thumbURL = null;
	if (asset.thumbKey) {
		try { thumbURL = await fujian.getThumbnailBlobURL(asset.thumbKey); } catch(e) {}
	}
	_attachViewerState.thumbBlobURL = thumbURL;

	if (thumbURL) {
		// 缩略图降级：复用 .attach-viewer-img 类以支持缩放/拖动
		_attachViewerState.isThumbFallback = true;
		const img = document.createElement('img');
		img.className = 'attach-viewer-media attach-viewer-img attach-viewer-thumb-fallback';
		img.src = thumbURL;
		img.alt = asset.name || '';
		img.draggable = false;
		// 缩略图默认显示放大至自身尺寸的 200%（但不超过视口，由 max-width/max-height 限制）
		img.addEventListener('load', () => {
			const tw = img.naturalWidth * 2;
			const th = img.naturalHeight * 2;
			img.style.width = tw + 'px';
			img.style.height = th + 'px';
			// 计算缩放范围（基于缩略图自身尺寸，默认显示为 200%）
			_attachViewerComputeScaleRange(img, true);
		});
		wrap.appendChild(img);
	} else {
		const icon = document.createElement('div');
		icon.className = 'attach-viewer-missing-icon';
		icon.textContent = fujian.TYPE_ICON[asset.type] || fujian.TYPE_ICON.other;
		wrap.appendChild(icon);
	}

	const tip = document.createElement('div');
	tip.className = 'attach-viewer-missing-tip';
	// 根据原因显示对应提示（情况 A 区分；情况 B 默认 notFound）
	let tipText = '附件原文件未找到。';
	if (reason === 'noDir') tipText = '尚未指定文件夹，请在「存储与导出」中指定后再浏览。';
	else if (reason === 'noPerm') tipText = '文件夹权限已失效，请前往「存储与导出」重新授权。';
	else if (_attachViewerState.case === 'B') tipText = '附件原文件未在授权目录中找到，可能已被移动或重命名。';
	tip.textContent = tipText;
	wrap.appendChild(tip);

	stage.appendChild(wrap);
}

// 情况 B：askAccess 开启时，用 webkitdirectory 授权根目录，建立「相对路径→File」映射表
// 返回映射表大小；返回 -1 表示用户取消
async function _authorizeAttachRootForBrowse() {
	const rootPath = getAttachRootPath();
	return new Promise(resolve => {
		const inp = document.createElement('input');
		inp.type = 'file';
		inp.webkitdirectory = true;
		inp.style.display = 'none';
		inp.addEventListener('change', () => {
			const files = inp.files;
			inp.remove();
			if (!files || files.length === 0) return resolve(-1);
			// 校验所选目录是根目录（webkitRelativePath 第一段应等于 rootPath）
			const firstRel = files[0].webkitRelativePath || '';
			const rootSeg = firstRel.split(/[\\/]/)[0] || '';
			if (rootPath && rootSeg !== rootPath) {
				_showToast('⊘所选目录与指定的附件根目录「' + rootPath + '」不一致！');
				return resolve(-1);
			}
			const map = new Map();
			for (const f of files) {
				const rel = f.webkitRelativePath || f.name;
				// 去掉根目录段，得到相对根目录的路径
				const parts = rel.split(/[\\/]/).filter(Boolean);
				const relPath = parts.length > 1 ? parts.slice(1).join('/') : parts[0];
				map.set(relPath, f);
			}
			_bijiRootFileMap = map;
			resolve(map.size);
		});
		inp.addEventListener('cancel', () => { inp.remove(); resolve(-1); });
		document.body.appendChild(inp);
		inp.click();
	});
}

// 情况 B：从根目录映射表中按 asset.path+name 取 File
function _getFileFromRootMap(asset) {
	if (!_bijiRootFileMap) return null;
	const relPath = (asset.path || '') + (asset.name || '');
	return _bijiRootFileMap.get(relPath) || null;
}

// 更新左右切换按钮显隐（情况 A，9.1）
function _updateAttachViewerNav() {
	if (_attachViewerState.singleAuth) {
		DOM.attachViewerPrev.style.visibility = 'hidden';
		DOM.attachViewerNext.style.visibility = 'hidden';
		return;
	}
	const total = _attachViewerState.assets ? _attachViewerState.assets.length : 0;
	const i = _attachViewerState.index;
	DOM.attachViewerPrev.style.visibility = (i > 0) ? '' : 'hidden';
	DOM.attachViewerNext.style.visibility = (i < total - 1) ? '' : 'hidden';
}

// 切换到上一个/下一个附件（情况 A/B，9.1）
async function _attachViewerNavigate(delta) {
	if (_attachViewerState.singleAuth) return;
	const total = _attachViewerState.assets ? _attachViewerState.assets.length : 0;
	if (total <= 1) return;
	let next = _attachViewerState.index + delta;
	if (next < 0 || next >= total) return;
	_attachViewerState.index = next;
	_updateAttachViewerNav();
	await _loadAttachViewerContent(_attachViewerState.assets[next]);
}

// 释放当前 Blob URL
function _attachViewerReleaseURLs() {
	if (_attachViewerState.blobURL) {
		URL.revokeObjectURL(_attachViewerState.blobURL);
		_attachViewerState.blobURL = null;
	}
	if (_attachViewerState.thumbBlobURL) {
		URL.revokeObjectURL(_attachViewerState.thumbBlobURL);
		_attachViewerState.thumbBlobURL = null;
	}
}

// 关闭附件浏览
function _closeAttachViewer() {
	if (DOM.attachViewer.classList.contains('open')) {
		DOM.attachViewer.classList.remove('open');
	}
	DOM.attachViewer.style.display = 'none';
	// 暂停媒体播放（避免关闭后仍播放音频）
	const medias = DOM.attachViewerStage.querySelectorAll('video, audio');
	for (const m of medias) {
		try { m.pause(); m.src = ''; m.load(); } catch(e) {}
	}
	DOM.attachViewerStage.innerHTML = '';
	DOM.attachViewerInfo.textContent = '';
	DOM.attachViewerHint.style.display = 'none';
	// 隐藏字号缩放浮动控件
	if (DOM.attachViewerFontZoom) DOM.attachViewerFontZoom.style.display = 'none';
	if (DOM.attachViewerFontZoomPanel) DOM.attachViewerFontZoomPanel.style.display = 'none';
	DOM.attachViewerPrev.style.visibility = 'hidden';
	DOM.attachViewerNext.style.visibility = 'hidden';
	_attachViewerReleaseURLs();
	_attachViewerState.assets = null;
	_attachViewerState.index = 0;
	_attachViewerState.singleAuth = false;
	_attachViewerState.scale = 1;
	_attachViewerState.scaleMin = 0.1;
	_attachViewerState.scaleMax = 5;
	_attachViewerState.tx = 0;
	_attachViewerState.ty = 0;
	_attachViewerState.isThumbFallback = false;
	_attachViewerState.textFontScale = 1;
	_attachViewerTextBaseFontSize = 0;  // 重置基础字号缓存
}

// 文件大小格式化
function _formatFileSize(bytes) {
	if (typeof bytes !== 'number' || isNaN(bytes)) return '';
	if (bytes < 1024) return bytes + ' B';
	if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
	if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
	return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

// ========== 附件浏览：键盘 / 滚轮 / 触屏交互（9.1）==========
// 键盘事件处理（capture 阶段，仅在附件查看器打开时拦截）
function _onAttachViewerKeydown(e) {
	// 查看器未打开时放行，避免影响其他键盘交互
	if (!DOM.attachViewer || !DOM.attachViewer.classList.contains('open')) return;
	const st = _attachViewerState;
	if (!st.assets) return;
	const asset = st.asset;
	if (!asset) return;
	const isMedia = asset.type === 'video' || asset.type === 'audio';
	const isImage = asset.type === 'image';
	const isText = asset.type === 'text';

	// ESC 已在全局 keydown 中处理

	if (e.key === 'ArrowLeft') {
		// 单次授权模式禁用左右切换（9.2）
		if (st.singleAuth) { e.preventDefault(); return; }
		if (e.ctrlKey && isMedia) {
			// Ctrl+←：跳转 -15 秒
			_attachViewerSeek(-15);
		} else {
			_attachViewerNavigate(-1);
		}
		e.preventDefault();
	} else if (e.key === 'ArrowRight') {
		if (st.singleAuth) { e.preventDefault(); return; }
		if (e.ctrlKey && isMedia) {
			// Ctrl+→：跳转 +15 秒
			_attachViewerSeek(15);
		} else {
			_attachViewerNavigate(1);
		}
		e.preventDefault();
	} else if (e.key === 'ArrowUp') {
		if (e.ctrlKey && isText) {
			// Ctrl+↑：文本字号 +
			_attachViewerTextZoom(0.1);
		} else if (isText) {
			// 文本：向上滚动页面
			const pre = DOM.attachViewerStage.querySelector('.attach-viewer-text');
			if (pre) pre.scrollBy({ top: -pre.clientHeight * 0.8, behavior: 'smooth' });
		} else if (isImage) {
			// 图片：放大
			_attachViewerZoom(0.1);
		} else if (isMedia) {
			// 音视频：音量 +
			_attachViewerChangeVolume(0.05);
		}
		e.preventDefault();
	} else if (e.key === 'ArrowDown') {
		if (e.ctrlKey && isText) {
			// Ctrl+↓：文本字号 -
			_attachViewerTextZoom(-0.1);
		} else if (isText) {
			// 文本：向下滚动页面
			const pre = DOM.attachViewerStage.querySelector('.attach-viewer-text');
			if (pre) pre.scrollBy({ top: pre.clientHeight * 0.8, behavior: 'smooth' });
		} else if (isImage) {
			// 图片：缩小
			_attachViewerZoom(-0.1);
		} else if (isMedia) {
			// 音视频：音量 -
			_attachViewerChangeVolume(-0.05);
		}
		e.preventDefault();
	} else if (e.key === ' ' || e.code === 'Space') {
		// 空格：音视频播放/暂停 / 文本向下滚动
		if (isMedia) {
			const media = DOM.attachViewerStage.querySelector('video, audio');
			if (media) {
				if (media.paused) media.play(); else media.pause();
			}
			e.preventDefault();
		} else if (isText) {
			const pre = DOM.attachViewerStage.querySelector('.attach-viewer-text');
			if (pre) pre.scrollBy({ top: pre.clientHeight * 0.8, behavior: 'smooth' });
			e.preventDefault();
		}
	}
}

// 计算缩放范围（基于原件尺寸与视口尺寸）
// 规则（用户要求）：
//   最小显示尺寸 = min(视口短边, 原件短边) × 0.2
//   最大显示尺寸 = max(视口长边, 原件长边) × 4
//   转换为相对默认显示尺寸的 scale
// isThumbFallback: 缩略图降级时，默认显示为自身尺寸 × 2（但不超过视口）
function _attachViewerComputeScaleRange(img, isThumbFallback) {
	const st = _attachViewerState;
	if (!img || !img.naturalWidth || !img.naturalHeight) {
		st.scaleMin = 0.1; st.scaleMax = 5; return;
	}
	const naturalW = img.naturalWidth;
	const naturalH = img.naturalHeight;
	const naturalLong = Math.max(naturalW, naturalH);
	const naturalShort = Math.min(naturalW, naturalH);

	const stage = DOM.attachViewerStage;
	const vw = stage.clientWidth;
	const vh = stage.clientHeight;
	const viewportLong = Math.max(vw, vh);
	const viewportShort = Math.min(vw, vh);

	// 默认显示尺寸（scale=1 时的长边）：
	// - 原件存在：长边适配视口或原尺寸（取较小者）
	// - 缩略图降级：缩略图自身尺寸 × 2（但不超过视口）
	let defaultDisplayLong;
	if (isThumbFallback) {
		defaultDisplayLong = Math.min(naturalLong * 2, viewportLong);
	} else {
		defaultDisplayLong = Math.min(naturalLong, viewportLong);
	}
	if (defaultDisplayLong <= 0) { st.scaleMin = 0.1; st.scaleMax = 5; return; }

	// 最小/最大显示尺寸（长边）
	const minDisplayLong = Math.min(viewportShort, naturalShort) * 0.2;
	const maxDisplayLong = Math.max(viewportLong, naturalLong) * 4;

	// 转换为 scale
	let minS = minDisplayLong / defaultDisplayLong;
	let maxS = maxDisplayLong / defaultDisplayLong;
	if (!isFinite(minS) || minS <= 0) minS = 0.1;
	if (!isFinite(maxS) || maxS <= 0) maxS = 5;
	if (minS > maxS) { minS = 0.1; maxS = 5; }
	st.scaleMin = minS;
	st.scaleMax = maxS;
}

// 图片缩放（9.1）：步进 delta，范围动态计算，切换时重置
function _attachViewerZoom(delta) {
	const st = _attachViewerState;
	const img = DOM.attachViewerStage.querySelector('.attach-viewer-img');
	if (!img) return;
	let next = st.scale + delta;
	const minS = st.scaleMin || 0.1;
	const maxS = st.scaleMax || 5;
	if (next < minS) next = minS;
	if (next > maxS) next = maxS;
	if (Math.abs(next - st.scale) < 0.001) return;
	st.scale = next;
	// scale<1 时重置平移但仍应用缩小变换；scale=1 时清空 transform
	st.tx = 0; st.ty = 0;
	img.classList.remove('draggable', 'dragging');
	if (next < 1) {
		img.style.transform = 'scale(' + next + ')';
		return;
	}
	if (next === 1) {
		img.style.transform = '';
		return;
	}
	_attachViewerClampTranslate();
	_attachViewerApplyTransform();
}

// 应用 transform: scale + translate
function _attachViewerApplyTransform() {
	const st = _attachViewerState;
	const img = DOM.attachViewerStage.querySelector('.attach-viewer-img');
	if (!img) return;
	img.style.transform = 'translate(' + st.tx + 'px, ' + st.ty + 'px) scale(' + st.scale + ')';
	// 放大后启用 grab 光标
	if (st.scale > 1) img.classList.add('draggable');
	else img.classList.remove('draggable');
}

// 平移到指定偏移（dx/dy 增量），并钳制在溢出范围内
function _attachViewerPan(dx, dy) {
	const st = _attachViewerState;
	if (st.scale <= 1) return;  // 未放大不允许平移
	st.tx += dx;
	st.ty += dy;
	_attachViewerClampTranslate();
	_attachViewerApplyTransform();
}

// 钳制平移范围：图片放大后超出视口的尺寸内自由挪动
function _attachViewerClampTranslate() {
	const st = _attachViewerState;
	if (st.scale <= 1) { st.tx = 0; st.ty = 0; return; }
	const img = DOM.attachViewerStage.querySelector('.attach-viewer-img');
	if (!img) return;
	// 缩放后图片显示尺寸
	const sw = img.clientWidth * st.scale;
	const sh = img.clientHeight * st.scale;
	// stage 视口尺寸（content-box，去掉 padding）
	const stage = DOM.attachViewerStage;
	const vw = stage.clientWidth;
	const vh = stage.clientHeight;
	// 溢出量（每侧）
	const overX = Math.max(0, (sw - vw) / 2);
	const overY = Math.max(0, (sh - vh) / 2);
	if (st.tx > overX) st.tx = overX;
	if (st.tx < -overX) st.tx = -overX;
	if (st.ty > overY) st.ty = overY;
	if (st.ty < -overY) st.ty = -overY;
}

// 音量调整（9.1）：步进 delta，范围 0~1，会话内持久化
function _attachViewerChangeVolume(delta) {
	const st = _attachViewerState;
	const media = DOM.attachViewerStage.querySelector('video, audio');
	if (!media) return;
	let next = (media.volume !== undefined ? media.volume : st.volume) + delta;
	if (next < 0) next = 0;
	if (next > 1) next = 1;
	if (Math.abs(next - (media.volume || 0)) < 0.001) return;
	media.volume = next;
	st.volume = next;  // volumechange 事件也会更新，这里同步确保即时
}

// 音视频跳转（9.1）：Ctrl+← → 偏移秒数
function _attachViewerSeek(deltaSec) {
	const media = DOM.attachViewerStage.querySelector('video, audio');
	if (!media || !isFinite(media.duration)) {
		// 无 duration 信息时仍尝试相对跳转
		try { media.currentTime = Math.max(0, (media.currentTime || 0) + deltaSec); } catch(e) {}
		return;
	}
	try {
		const target = media.currentTime + deltaSec;
		media.currentTime = Math.max(0, Math.min(media.duration, target));
	} catch(e) {}
}

// 鼠标滚轮事件处理（9.1）
function _onAttachViewerWheel(e) {
	const st = _attachViewerState;
	if (!st.assets || !st.asset) return;
	const asset = st.asset;
	const isMedia = asset.type === 'video' || asset.type === 'audio';
	const isImage = asset.type === 'image';
	const isText = asset.type === 'text';
	if (!isMedia && !isImage && !isText) return;
	// 文本附件：单独滚轮 = 上下滚动（不阻止默认，让 pre 自身滚动）；
	//           Ctrl+滚轮 = 字号缩放
	if (isText) {
		if (e.ctrlKey) {
			e.preventDefault();
			const delta = e.deltaY < 0 ? 1 : -1;
			_attachViewerTextZoom(delta * 0.1);
		}
		// 非 Ctrl 时不阻止，让 pre 自身滚动
		return;
	}
	e.preventDefault();
	// 上滚（deltaY < 0）：图片放大 / 音量 +
	// 下滚（deltaY > 0）：图片缩小 / 音量 -
	const delta = e.deltaY < 0 ? 1 : -1;
	if (isImage) {
		_attachViewerZoom(delta * 0.1);
	} else if (isMedia) {
		_attachViewerChangeVolume(delta * 0.05);
	}
}

// 触屏交互状态（9.1）
let _attachViewerTouchState = null;
// 	{ startX, startY, startT, pinchStartDist, pinchStartScale }

function _onAttachViewerTouchStart(e) {
	const st = _attachViewerState;
	if (!st.assets || !st.asset) return;
	const asset = st.asset;
	if (!asset) return;
	const isMedia = asset.type === 'video' || asset.type === 'audio';
	const isImage = asset.type === 'image';
	if (!isMedia && !isImage) return;
	if (e.touches.length === 1) {
		// 单指：记录起点（用于左右滑动切换、上下滑动音量）
		const t = e.touches[0];
		_attachViewerTouchState = {
			startX: t.clientX,
			startY: t.clientY,
			startT: Date.now(),
			pinchStartDist: 0,
			pinchStartScale: st.scale,
			moved: false
		};
	} else if (e.touches.length === 2 && isImage) {
		// 二指：记录初始距离与缩放（仅图片，9.1）
		const d = _attachViewerPinchDist(e.touches);
		if (d > 0) {
			if (!_attachViewerTouchState) {
				_attachViewerTouchState = { startX: 0, startY: 0, startT: Date.now(), moved: false };
			}
			_attachViewerTouchState.pinchStartDist = d;
			_attachViewerTouchState.pinchStartScale = st.scale;
		}
	}
}

function _onAttachViewerTouchMove(e) {
	const st = _attachViewerState;
	if (!_attachViewerTouchState) return;
	if (e.touches.length === 2 && _attachViewerTouchState.pinchStartDist > 0) {
		// 二指缩放（仅图片）
		e.preventDefault();
		const d = _attachViewerPinchDist(e.touches);
		if (d > 0 && _attachViewerTouchState.pinchStartDist > 0) {
			const ratio = d / _attachViewerTouchState.pinchStartDist;
			const target = _attachViewerTouchState.pinchStartScale * ratio;
			// 使用动态计算的缩放范围
			const minS = st.scaleMin || 0.1;
			const maxS = st.scaleMax || 5;
			const clamped = Math.max(minS, Math.min(maxS, target));
			if (Math.abs(clamped - st.scale) > 0.001) {
				st.scale = clamped;
				const img = DOM.attachViewerStage.querySelector('.attach-viewer-img');
				st.tx = 0; st.ty = 0;
				if (clamped < 1) {
					if (img) { img.style.transform = 'scale(' + clamped + ')'; img.classList.remove('draggable', 'dragging'); }
				} else if (clamped === 1) {
					if (img) { img.style.transform = ''; img.classList.remove('draggable', 'dragging'); }
				} else {
					_attachViewerClampTranslate();
					_attachViewerApplyTransform();
				}
			}
		}
		_attachViewerTouchState.moved = true;
		return;
	}
	if (e.touches.length === 1) {
		const t = e.touches[0];
		const dx = t.clientX - _attachViewerTouchState.startX;
		const dy = t.clientY - _attachViewerTouchState.startY;
		if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
			_attachViewerTouchState.moved = true;
		}
		// 图片放大且单指按住拖动：实时平移
		if (_attachViewerTouchState.pinchStartDist === 0 && st.scale > 1) {
			e.preventDefault();
			if (!_attachViewerTouchState.lastX) {
				_attachViewerTouchState.lastX = _attachViewerTouchState.startX;
				_attachViewerTouchState.lastY = _attachViewerTouchState.startY;
			}
			const ldx = t.clientX - _attachViewerTouchState.lastX;
			const ldy = t.clientY - _attachViewerTouchState.lastY;
			_attachViewerTouchState.lastX = t.clientX;
			_attachViewerTouchState.lastY = t.clientY;
			_attachViewerPan(ldx, ldy);
		}
	}
}

function _onAttachViewerTouchEnd(e) {
	const st = _attachViewerState;
	if (!_attachViewerTouchState) return;
	const ts = _attachViewerTouchState;
	_attachViewerTouchState = null;
	if (!st.assets || !st.asset) return;
	const asset = st.asset;
	if (!asset) return;
	// 二指手势结束，不处理切换
	if (ts.pinchStartDist > 0) return;
	if (ts.moved) {
		// 单指滑动结束
		const last = e.changedTouches[0];
		if (!last) return;
		const dx = last.clientX - ts.startX;
		const dy = last.clientY - ts.startY;
		const adx = Math.abs(dx);
		const ady = Math.abs(dy);
		// 单次授权模式禁用左右切换（9.2）
		if (!st.singleAuth && adx > 40 && adx > ady) {
			// 左右滑动：切换附件
			_attachViewerNavigate(dx < 0 ? 1 : -1);
			return;
		}
		const isMedia = asset.type === 'video' || asset.type === 'audio';
		if (isMedia && ady > 40 && ady > adx) {
			// 上下滑动：音量调整
			_attachViewerChangeVolume(dy < 0 ? 0.1 : -0.1);
			return;
		}
	}
}

// 计算两指距离
function _attachViewerPinchDist(touches) {
	if (touches.length < 2) return 0;
	const dx = touches[0].clientX - touches[1].clientX;
	const dy = touches[0].clientY - touches[1].clientY;
	return Math.hypot(dx, dy);
}

// 鼠标拖动状态（图片放大后按住挪动）
let _attachViewerMouseDrag = null;
// 	{ startX, startY, lastX, lastY }
// 拖动后消费下一次 click，避免误触发遮罩关闭
let _attachViewerSuppressNextClick = false;

function _onAttachViewerMouseDown(e) {
	const st = _attachViewerState;
	if (!st.assets || !st.asset) return;
	if (st.asset.type !== 'image') return;
	if (st.scale <= 1) return;  // 仅放大后才启用拖动
	// 仅左键
	if (e.button !== 0) return;
	_attachViewerMouseDrag = {
		startX: e.clientX,
		startY: e.clientY,
		lastX: e.clientX,
		lastY: e.clientY,
		moved: false
	};
	const img = DOM.attachViewerStage.querySelector('.attach-viewer-img');
	if (img) img.classList.add('dragging');
	e.preventDefault();
}

function _onAttachViewerMouseMove(e) {
	if (!_attachViewerMouseDrag) return;
	const dx = e.clientX - _attachViewerMouseDrag.lastX;
	const dy = e.clientY - _attachViewerMouseDrag.lastY;
	if (Math.abs(e.clientX - _attachViewerMouseDrag.startX) > 3 ||
		Math.abs(e.clientY - _attachViewerMouseDrag.startY) > 3) {
		_attachViewerMouseDrag.moved = true;
	}
	_attachViewerMouseDrag.lastX = e.clientX;
	_attachViewerMouseDrag.lastY = e.clientY;
	_attachViewerPan(dx, dy);
}

function _onAttachViewerMouseUp(e) {
	if (!_attachViewerMouseDrag) return;
	const wasMoved = _attachViewerMouseDrag.moved;
	_attachViewerMouseDrag = null;
	const img = DOM.attachViewerStage.querySelector('.attach-viewer-img');
	if (img) img.classList.remove('dragging');
	// 若拖动产生过移动，消费此次 click 避免触发遮罩关闭
	if (wasMoved) {
		_attachViewerSuppressNextClick = true;
	}
}

// 缩略图栏滚动按钮
function _bijiThumbScrollBy(dx) {
	if (DOM.bijiThumbScrollTrack) DOM.bijiThumbScrollTrack.scrollBy({ left: dx, behavior: 'smooth' });
}

function _bijiOnInput() {
	const text = DOM.bijiTextarea.value;
	const len = text.length;
	DOM.bijiEditCount.textContent = Math.min(len, biji.BIJI_MAX_LEN) + '/' + biji.BIJI_MAX_LEN;
	if (_bijiEditState.undoStack.length < 64) {
		_bijiEditState.undoStack.push(text);
	}
	clearTimeout(_bijiEditState.debounceTimer);
	if (len >= 15) { // 仅在输入内容超过15个字符时才开始保存草稿
		clearTimeout(_bijiEditState.draftTimer);
		_bijiEditState.draftTimer = setTimeout(() => {
			biji.saveDraft(_bijiEditState.hj, _bijiEditState.idx, _bijiEditState.icon, DOM.bijiTextarea.value, _bijiEditState.created, _bijiEditState.assets);
		}, 15000);
		biji.saveDraft(_bijiEditState.hj, _bijiEditState.idx, _bijiEditState.icon, text, _bijiEditState.created, _bijiEditState.assets);
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
		DOM.bijiEditorHint.style.display = 'none';
		return;
	}
	const dirHandle = await biji.getDirHandle();
	if (dirHandle && (await biji.verifyDirHandle())) {
		DOM.bijiEditorHint.style.display = 'none';
		return;
	}
	DOM.bijiEditorHint.style.display = '';
	// 不支持本地文件夹时只显示"导出"，支持时显示"导出或启用本地同步保存"
	const hasFS = _hasFileSystemAccess && typeof window.showDirectoryPicker === 'function';
	DOM.bijiEditorHint.querySelector('#bijiHintExport').textContent = hasFS ? '导出或启用本地同步保存' : '导出';
}

// 笔记保存到本地文件（按岁区间原子写入，自动处理今岁一致性）
// 启用与否由本地目录句柄是否存在决定；句柄不存在时 writeNoteToFiles 返回 noDir 静默
function _bijiWriteToFile(sui) {
	const jin = state.todaySui;
	biji.writeNoteToFiles(sui, jin).then(result => {
		if (!result || result.ok) return;
		if (result.reason === 'noDir') return; // 未指定文件夹，静默
		if (result.reason === 'noPerm') { _showToast('😿本地文件夹授权失效，请在「存储与导出」页重新授权。'); return; }
		_showToast('😿本地文件写入失败。');
	}).catch(() => { _showToast('😿本地文件写入失败。'); });
}

// 同步本地 manifest.json（assets 信息表）到 .thumbnails/ 目录
// 收集所有笔记中的 assets 信息，生成 thumbKey → asset 映射并写入
async function _syncLocalManifest() {
	try {
		const dirHandle = await biji.getDirHandle();
		if (!dirHandle || !(await biji.verifyDirHandle())) return;
		const assetsMap = _collectAllThumbKeys(true);
		await fujian.writeLocalManifest(dirHandle, assetsMap);
	} catch(e) { /* manifest 同步失败不影响主流程 */ }
}

// ========== 本地文件夹设置 ==========
// 从笔记文件名识别分割节点
// 文件名格式：笔记_起点~终点.json 或 笔记_今岁(jin).json
// 分割节点 = 所有段的起点数字，排除"远古"(_gu段)、"今岁"(_jin段)、jin+1(_lai段起点)
function _parseSplitNodesFromFilenames(filenames, jin) {
	const nodes = new Set();
	for (const name of filenames) {
		// 去除前缀和后缀
		let label = name;
		const prefix = '笔记_';
		if (label.startsWith(prefix)) label = label.slice(prefix.length);
		if (label.endsWith('.json')) label = label.slice(0, -5);
		// 今岁段：今岁(jin)
		if (label.startsWith('今岁(')) continue;
		// 提取起点（~ 之前的部分）
		const tildeIdx = label.indexOf('~');
		if (tildeIdx < 0) continue;
		const startStr = label.slice(0, tildeIdx);
		if (startStr === '远古') continue;  // _gu 段
		const start = parseInt(startStr);
		if (isNaN(start)) continue;
		// 排除 jin（今岁段，理论上已被上面的判断拦截）和 jin+1（_lai 段起点）
		if (start === jin || start === jin + 1) continue;
		nodes.add(start);
	}
	return Array.from(nodes).sort((a, b) => a - b);
}

async function _lsSpecifyDir() {
	if (!(_hasFileSystemAccess && window.showDirectoryPicker)) { _showToast('当前浏览器不支持选择文件夹。'); return; }
	try {
		const handle = await window.showDirectoryPicker({ id: 'bijiRoot', mode: 'readwrite' });
		await biji.saveDirHandle(handle);
		// 检查目录中是否有已有笔记文件，提示合并导入
		const existingFiles = await biji.listBijiFiles();
		if (existingFiles.length > 0) {
			try {
				const result = await biji.readAllSegmentFiles();
				if (result && result.data && Object.keys(result.data).length > 0) {
					if (confirm('检测到目录中已存在笔记文件，是否合并导入到应用？ ⚠【注意】：不导入建议先备份，点击「取消」可能清除现有文件❗')) {
						_importJsonBiji(JSON.stringify(result.data), 'merge');
						// 根据文件名识别本地笔记文件分割节点并应用
						const jin = state.todaySui;
						const nodes = _parseSplitNodesFromFilenames(existingFiles, jin);
						if (nodes.length > 0) {
							biji.setBijiFileConfig({ splitNodes: nodes });
						}
					}
				}
			} catch(e) {}
		}
		// 检查 .thumbnails/ 目录：先导入缩略图文件，再用 manifest 补全笔记 assets 信息
		try {
			const thumbResult = await fujian.importLocalThumbnails(handle);
			const manifest = await fujian.readLocalManifest(handle);
			let suppCount = 0;
			if (manifest) {
				const supp = biji.supplementAssetsFromManifest(manifest);
				suppCount = supp.supplemented;
			}
			const parts = [];
			if (thumbResult.imported > 0) parts.push('缩略图 ' + thumbResult.imported + ' 个');
			if (suppCount > 0) parts.push('附件信息 ' + suppCount + ' 个');
			if (parts.length > 0) _showToast('已从本地导入：' + parts.join('、'), 3000);
		} catch(e) {}
		const written = await biji.rewriteAllSegmentFiles(state.todaySui);
		if (written) {
			_showToast('已指定文件夹并启用本地保存。');
			const perm = await handle.queryPermission({ mode: 'readwrite' });
			if (perm !== 'granted' && !/android/i.test(navigator.userAgent)) {
				_showToast('因系统限制，后续每次保存仍可能触发权限确认。');
			}
		} else {
			_showToast('😿已启用，但写入文件失败。');
		}
		_updateLsUI();
		_updateBijiHint();
	} catch(e) {
		if (e.name !== 'AbortError') _showToast('指定文件夹失败：' + e.message);
	}
}

async function _lsUnlinkDir() {
	const handle = await biji.getDirHandle();
	const name = handle ? (handle.name || '') : '';
	if (!confirm('解除本地文件夹权限不会丢失应用中现有笔记，也不会删除「' + (name || '本地目录') + '」中的文件。是否继续？')) return;
	await biji.removeDirHandle();
	biji.clearBijiFileConfig();
	_lastAttachStartInHandle = null; // 清空记忆的访问子目录
	_updateLsUI();
	_updateBijiHint();
	_showToast('已解除本地文件夹。');
}

async function _lsReauthorizeDir() {
	const ok = await biji.verifyDirHandle();
	if (ok) {
		_updateLsUI();
		_updateBijiHint();
		_showToast('已重新获得授权。');
	} else {
		_showToast('😿无法获得授权，请重新指定文件夹。');
	}
}

function _toggleLsSplitDropdown() {
	if (!DOM.lsSplitDropdown || !DOM.lsSplitToggle) return;
	const cur = DOM.lsSplitDropdown.style.display;
	if (cur === 'none') {
		DOM.lsSplitDropdown.style.display = '';
		DOM.lsSplitToggle.classList.add('active');
	} else {
		DOM.lsSplitDropdown.style.display = 'none';
		DOM.lsSplitToggle.classList.remove('active');
	}
}

function _closeLsSplitDropdown() {
	if (!DOM.lsSplitDropdown) return;
	DOM.lsSplitDropdown.style.display = 'none';
	if (DOM.lsSplitToggle) DOM.lsSplitToggle.classList.remove('active');
}

function _fmtSegPoint(v, jin) {
	if (v === -Infinity) return '远古';
	if (v === +Infinity) return '未来';
	if (v === jin) return '今岁 (' + jin + ')';
	return String(v);
}

function _fmtSegRange(seg, jin) {
	// 今岁段例外
	if (seg.start === jin && seg.end === jin) return '今岁(' + jin + ')';
	return _fmtSegPoint(seg.start, jin) + '~' + _fmtSegPoint(seg.end, jin);
}

function _buildLsSplitList() {
	const jin = state.todaySui;
	const cfg = biji.getBijiFileConfig();
	const segs = biji.computeSegments(jin, cfg.splitNodes || []);
	// 将 _lai 段移到末尾，使列表顺序为 -∞、<jin 节点、今、>jin 节点、∞
	const laiIdx = segs.findIndex(s => s.suffix === '_lai');
	if (laiIdx !== -1 && laiIdx !== segs.length - 1) {
		segs.push(segs.splice(laiIdx, 1)[0]);
	}
	DOM.lsSplitDropdown.innerHTML = '';
	// 顶部添加行（lsSplitWrap 无外部添加行，嵌入下拉菜单顶部）
	DOM.lsSplitDropdown.appendChild(_makeLsSplitAddRow());
	for (const s of segs) {
		const name = s.suffix === '_gu' ? '-∞' :
			s.suffix === '_jin' ? '今' :
			(s.suffix === '_lai' ? '∞' : s.suffix.slice(1));
		const removable = !/^_(gu|jin|lai)$/.test(s.suffix);
		const nodeVal = removable ? parseInt(s.suffix.slice(1)) : null;
		DOM.lsSplitDropdown.appendChild(_makeLsSplitItem(name, _fmtSegRange(s, jin), removable, nodeVal));
	}
	DOM.lsSplitToggle.textContent = '当前共' + segs.length + '段';
}

function _makeLsSplitAddRow() {
	const row = document.createElement('div');
	row.className = 'ls-split-add-row';
	const input = document.createElement('input');
	input.type = 'number';
	input.placeholder = '节点纪年数';
	input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); _lsAddSplitNode(input); } });
	const btn = document.createElement('button');
	btn.type = 'button';
	btn.textContent = '添加';
	btn.addEventListener('click', (e) => { e.stopPropagation(); _lsAddSplitNode(input); });
	row.appendChild(input);
	row.appendChild(btn);
	return row;
}

function _makeLsSplitItem(name, range, removable, nodeVal) {
	const item = document.createElement('div');
	item.className = 'ls-split-item';
	const nameSpan = document.createElement('span');
	nameSpan.className = 'ls-split-item-name';
	nameSpan.textContent = name + '：';
	const rangeSpan = document.createElement('span');
	rangeSpan.className = 'ls-split-item-range';
	rangeSpan.textContent = range;
	item.appendChild(nameSpan);
	item.appendChild(rangeSpan);
	if (removable) {
		const del = document.createElement('button');
		del.type = 'button';
		del.className = 'ls-split-item-del';
		del.textContent = '✕';
		del.title = '删除该分割节点';
		del.addEventListener('click', (e) => {
			e.stopPropagation();
			_lsRemoveSplitNode(nodeVal);
		});
		item.appendChild(del);
	}
	return item;
}

function _lsAddSplitNode(input) {
	const raw = (input && input.value ? input.value : '').trim();
	if (!raw) { _showToast('请输入节点纪年数。'); return; }
	const n = Number(raw);
	if (!Number.isInteger(n)) { _showToast('请输入整数。'); return; }
	const jin = state.todaySui;
	if (n === jin) { _showToast('不能与今岁相同。'); return; }
	const cfg = biji.getBijiFileConfig();
	const nodes = cfg.splitNodes || [];
	if (nodes.includes(n)) { _showToast('该节点已存在。'); return; }
	nodes.push(n);
	biji.setBijiFileConfig({ splitNodes: nodes });
	// jin+1 与 _lai 段起点重合，_lai 空区间跳过；jin-1 自然产生单年段，无需特殊提示
	const tip = (n === jin + 1)
		? '已添加节点（目前与默认分段的明岁重合）。'
		: '已添加节点。';
	// 同步写入文件
	biji.rewriteAllSegmentFiles(jin).then(ok => {
		_showToast(ok ? tip : '😿已添加节点，但写入文件失败。');
	}).catch(() => { _showToast('😿已添加节点，但写入文件失败。'); });
	input.value = '';
	_buildLsSplitList();
}

function _lsRemoveSplitNode(nodeVal) {
	const cfg = biji.getBijiFileConfig();
	const nodes = (cfg.splitNodes || []).filter(n => n !== nodeVal);
	biji.setBijiFileConfig({ splitNodes: nodes });
	biji.rewriteAllSegmentFiles(state.todaySui).then(ok => {
		_showToast(ok ? '已删除节点。' : '😿已删除节点，但写入文件失败。');
	}).catch(() => { _showToast('😿已删除节点，但写入文件失败。'); });
	_buildLsSplitList();
}

async function _lsClearBiji() {
	if (!confirm('⚠此举将删除应用内保存的所有笔记及缩略图，并解除本地文件夹授权（不影响本地文件）。是否继续❓')) return;
	if (!confirm('❗ 再次确认：笔记若无备份将无法找回，确定要清空吗❓')) return;
	biji.clearAllBijiInStorage();
	// 同步清空缩略图（IDB thumbnails store）
	try { await fujian.clearAllThumbnails(); } catch(e) { console.warn('clearAllThumbnails error:', e); }
	// 解除本地保存配置与文件夹句柄
	biji.clearBijiFileConfig();
	try { await biji.removeDirHandle(); } catch(e) {}
	_lastAttachStartInHandle = null;
	_updateLsUI();
	renderBar7();
	renderCalendar();
	if (DOM.boPage.classList.contains('open')) _renderBijiOverview();
	_showToast('已清空应用内笔记及缩略图并解除本地文件夹授权。');
}

async function _updateLsUI() {
	// 同步先行显示 lsDirRow，避免进入设置页时空白
	if (DOM.lsDirRow) DOM.lsDirRow.style.display = '';
	try {
		// 不支持长持句柄时：文件夹行显示提示文本，分割节点行隐藏
		if (!(_hasFileSystemAccess && window.showDirectoryPicker)) {
			DOM.lsDirName.style.display = 'none';
			// 区分情况 B（支持 webkitRelativePath）与情况 C（完全不支持）
			const isCaseB = (() => {
				const input = document.createElement('input');
				return 'webkitdirectory' in input;
			})();
			// 情况 B 已启用：隐藏 lsDirRow（attachRootPathRow 会显示，避免重复"附件限定根目录"两行）
			// 情况 B 未启用 / 情况 C：显示 lsDirRow，按钮位置替换为提示文字
			if (DOM.lsDirRow) DOM.lsDirRow.style.display = (isCaseB && _bAttachEnabled) ? 'none' : '';
			// lsDirRowLabel：B 未启用时显示"本地保存/添加附件"，其他情况保持默认
			if (DOM.lsDirRowLabel && isCaseB && !_bAttachEnabled) {
				DOM.lsDirRowLabel.textContent = '本地保存/添加附件';
			}
			// B 未启用：提示"当前系统/浏览器支持残缺"，叠加透明双开关覆盖层
			// C：提示"当前系统/浏览器不支持"
			const tipText = isCaseB ? '当前系统/浏览器支持残缺' : '当前系统/浏览器不支持';
			const needResidualToggles = isCaseB && !_bAttachEnabled;
			// 若当前 DOM 不符合目标形态，重建
			const isCurrentSpan = DOM.lsDirBtn.tagName === 'SPAN';
			const currentText = isCurrentSpan ? DOM.lsDirBtn.textContent : '';
			const hasToggles = isCurrentSpan && DOM.lsDirBtn.querySelector('.ls-residual-toggle');
			const needRebuild = !isCurrentSpan || currentText !== tipText || (needResidualToggles !== hasToggles);
			if (needRebuild) {
				const span = document.createElement('span');
				span.style.cssText = 'position:relative;color:var(--text-tertiary);font-size:var(--small-size)';
				if (needResidualToggles) {
					// B 关闭态：透明双开关覆盖层
					span.classList.add('ls-residual-tip');
					const textEl = document.createElement('span');
					textEl.className = 'ls-residual-text';
					textEl.textContent = tipText;
					textEl.style.cssText = 'pointer-events:none;user-select:none';
					span.appendChild(textEl);
					// 左半透明 checkbox
					const left = document.createElement('input');
					left.type = 'checkbox';
					left.className = 'ls-residual-toggle ls-residual-left';
					left.setAttribute('aria-label', '残缺功能左开关');
					left.style.cssText = 'opacity:0;position:absolute;left:0;top:0;width:50%;height:100%;margin:0;cursor:pointer';
					// 右半透明 checkbox
					const right = document.createElement('input');
					right.type = 'checkbox';
					right.className = 'ls-residual-toggle ls-residual-right';
					right.setAttribute('aria-label', '残缺功能右开关');
					right.style.cssText = 'opacity:0;position:absolute;right:0;top:0;width:50%;height:100%;margin:0;cursor:pointer';
					// 双开关都切换为 checked 时触发 B 附件开关开启
					const onChange = () => {
						if (left.checked && right.checked) {
							_bAttachEnabled = true;
							_showToast('已启用残缺的附件功能。');
							_updateLsUI();
							_updateAttachCaseUI();
							_refreshAttachButtonVisibility();
						}
					};
					left.addEventListener('change', onChange);
					right.addEventListener('change', onChange);
					span.appendChild(left);
					span.appendChild(right);
				} else {
					// C 态：纯提示文字
					span.textContent = tipText;
				}
				DOM.lsDirBtn.replaceWith(span);
				DOM.lsDirBtn = span;
			}
			DOM.lsSplitWrap.style.display = 'none';
			return;
		}
		// 支持时：若按钮曾被替换为文本，恢复为按钮
		if (DOM.lsDirBtn.tagName === 'SPAN') {
			const btn = document.createElement('button');
			btn.type = 'button';
			btn.id = 'lsDirBtn';
			btn.addEventListener('click', _onLsDirBtnClick);
			DOM.lsDirBtn.replaceWith(btn);
			DOM.lsDirBtn = btn;
		}
		// 文件夹按钮
		const dirHandle = await biji.getDirHandle();
		const hasDir = !!dirHandle;
		let dirOk = false;
		if (hasDir) {
			dirOk = await biji.verifyDirHandle();
			// 仅显示目录名
			DOM.lsDirName.textContent = dirHandle.name || '';
			DOM.lsDirName.style.display = '';
			DOM.lsDirBtn.textContent = dirOk ? '解除指定' : '重新授权';
		} else {
			DOM.lsDirName.textContent = '未启用';
			DOM.lsDirName.style.display = '';
			DOM.lsDirBtn.textContent = '指定文件夹';
		}
		DOM.lsDirBtn.dataset.state = hasDir ? (dirOk ? 'unlink' : 'reauth') : 'specify';
		// 分割节点：指定文件夹后即显示（配置项，不依赖授权状态）
		if (hasDir) {
			DOM.lsSplitWrap.style.display = '';
			_buildLsSplitList();
		} else {
			DOM.lsSplitWrap.style.display = 'none';
		}
		// dirHandle 变化后刷新附件按钮显隐
		_refreshAttachButtonVisibility();
	} catch(e) {
		console.warn('_updateLsUI error:', e);
	}
}

async function _onLsDirBtnClick() {
	const st = DOM.lsDirBtn.dataset.state;
	if (st === 'specify') {
		// 权限 A 状态下，安卓环境提示：指定后每次运行、首次读写仍将询问授权
		if (_currentAttachCase() === 'A' && /android/i.test(navigator.userAgent)) {
			if (!confirm('因系统安全策略，指定后每次运行期间首次触发本地读写时仍会弹窗询问，确定要继续吗？')) return;
		}
		await _lsSpecifyDir();
	}
	else if (st === 'unlink') await _lsUnlinkDir();
	else if (st === 'reauth') await _lsReauthorizeDir();
}

// ========== 附件功能：权限三分法（文档二章）==========
// 返回 'A' | 'B' | 'C'
// A：支持长持句柄（showDirectoryPicker + showOpenFilePicker）
// B：不支持长持句柄但支持 webkitRelativePath
// C：不支持获取路径
async function _getAttachCase() {
	if (_hasFileSystemAccess && window.showDirectoryPicker && window.showOpenFilePicker) {
		const dirHandle = await biji.getDirHandle();
		if (dirHandle) return 'A';
		// 有能力但未指定根目录：仍可添加附件（A 模式 startIn），但 _bijiAddAttach 内部防护
		return 'A';
	}
	// 检测 webkitRelativePath 支持（通过 input webkitdirectory）
	if (typeof document !== 'undefined') {
		const input = document.createElement('input');
		if ('webkitdirectory' in input) {
			return 'B';
		}
	}
	return 'C';
}

// 缓存当前附件权限情况，避免频繁异步判定
let _attachCase = null;
// 情况 A：记忆上次添加附件访问的子目录 handle（在根目录内时记忆，否则清空）
let _lastAttachStartInHandle = null;
// 情况 B：子目录文件指纹缓存（运行时内存，每次运行重建）
// 结构：Map<fingerprint, relativePath>，fingerprint = name|size|lastModified
let _bijiSubDirFingerprints = null;
// 情况 B：askAccess 开启时的根目录「相对路径→File」映射表（运行时内存）
let _bijiRootFileMap = null;
// 情况 B 附件功能运行时启用开关（不持久化，每次运行默认关闭）
// false：B 权限对外表现为 C（不显示附件相关 UI、不可添加附件）
// true：B 权限恢复原设计形态（附件限定根目录 + 功能按钮）
let _bAttachEnabled = false;
async function _refreshAttachCase() {
	_attachCase = await _getAttachCase();
	return _attachCase;
}
function _currentAttachCase() {
	// B 权限未启用时对外表现为 C，复用所有 c === 'C' 分支
	if (_attachCase === 'B' && !_bAttachEnabled) return 'C';
	return _attachCase || 'C';
}

// 更新「笔记与本地文件夹」栏文案与形态（2.3 / 2.4）
async function _updateAttachCaseUI() {
	let c;
	try {
		await _refreshAttachCase();
	} catch(e) {}
	// 注意：用 _currentAttachCase() 而非 _refreshAttachCase() 的返回值
	// _refreshAttachCase 返回底层 _attachCase（真实权限，B 就是 B）
	// _currentAttachCase 在 B 未启用时对外表现为 C，确保 UI 走 C 分支
	c = _currentAttachCase();
	// 情况 C（含 B 未启用对外表现为 C）：后跟「当前系统/浏览器不支持/支持残缺」
	// _updateLsUI 已处理 lsDirBtn 的不支持提示，这里仅处理附件相关显隐
	if (c === 'C') {
		// 维护栏在情况 C 保留（4.3），仅清理引用行隐藏
		if (DOM.attachAskAccessRow) DOM.attachAskAccessRow.style.display = 'none';
		if (DOM.attachRootPathRow) DOM.attachRootPathRow.style.display = 'none';
		// B 附件开关隐藏（C 态不显示）
		if (DOM.bAttachToggleWrap) DOM.bAttachToggleWrap.style.display = 'none';
		// 情况 C 隐藏「导出所含缩略图」勾选项（无附件可导出）
		if (DOM.bijiExportThumbsRow) DOM.bijiExportThumbsRow.style.display = 'none';
		if (DOM.boExportThumbsRow) DOM.boExportThumbsRow.style.display = 'none';
	} else {
		// attachRootPathRow 仅情况 B 显示（4.2）
		if (DOM.attachRootPathRow) DOM.attachRootPathRow.style.display = (c === 'B') ? '' : 'none';
		// attachAskAccessRow：A/B 均显示（B 显示"每次询问"+"访问时显示路径"，A 仅显示"浏览时显示路径"）
		if (DOM.attachAskAccessRow) DOM.attachAskAccessRow.style.display = '';
		// "每次运行授权访问"仅情况 B 显示
		if (DOM.attachAskAccessLabel) DOM.attachAskAccessLabel.style.display = (c === 'B') ? '' : 'none';
		// "显示路径"文案：B 为"访问时显示路径"，A 为"浏览时显示路径"
		if (DOM.attachShowPathText) DOM.attachShowPathText.textContent = (c === 'B') ? '访问时显示路径' : '浏览时显示路径';
		// B 附件开关：仅情况 B 显示（行末居右）
		if (DOM.bAttachToggleWrap) DOM.bAttachToggleWrap.style.display = (c === 'B') ? '' : 'none';
		if (DOM.bAttachToggle) {
			// 同步开关状态：左侧"残缺附件功能"=开，右侧"关闭"=关
			// data-value="0" thumb 在左（开），"1" thumb 在右（关，指向"关闭"）
			DOM.bAttachToggle.dataset.value = _bAttachEnabled ? '0' : '1';
		}
		if (DOM.bijiExportThumbsRow) DOM.bijiExportThumbsRow.style.display = '';
		if (DOM.boExportThumbsRow) DOM.boExportThumbsRow.style.display = '';
	}
	// 同步附件设置项 UI 状态（4.1 / 4.2）
	_syncAttachSettingsUI();
	// 维护栏在 A/B/C 均显示（4.3）
	if (DOM.thumbMaintainWrap) DOM.thumbMaintainWrap.style.display = '';
	// 清理引用按钮行：仅情况 A 可用（7.6 权限适配）
	if (DOM.cleanMissingRefsRow) DOM.cleanMissingRefsRow.style.display = (c === 'A') ? '' : 'none';
	// 维护模式选项按权限适配（4.3 第 4 行）
	_syncManualModeUI();
	_syncAutoModeUI();
	// 「笔记与本地文件夹」栏：文件夹行前方文字（2.3）
	// h3 栏标题保持「笔记与本地文件夹」不变，仅修改 lsDirRow 内的 span 文案
	const lsDirRowLabel = DOM.lsDirRowLabel;
	if (lsDirRowLabel) {
		if (c === 'A') lsDirRowLabel.textContent = '本地同步及附件目录';
		else if (c === 'B') lsDirRowLabel.textContent = '附件限定根目录';
		else lsDirRowLabel.textContent = '本地同步及附件目录';
	}
}

// 同步附件设置项 UI 状态（4.1 / 4.2）
function _syncAttachSettingsUI() {
	// 附件限定根目录：显示目录名 + 按钮文案（情况 B）
	const rootPath = getAttachRootPath() || '';
	if (DOM.attachRootPathName) {
		DOM.attachRootPathName.textContent = rootPath || '未指定';
		DOM.attachRootPathName.style.display = '';
	}
	if (DOM.attachRootPathBtn) {
		DOM.attachRootPathBtn.textContent = rootPath ? '解除指定' : '指定文件夹';
	}
	// 授权刷新按钮：仅已指定根目录时显示（用于刷新文件夹树记录）
	if (DOM.attachRootRefreshBtn) {
		DOM.attachRootRefreshBtn.style.display = rootPath ? '' : 'none';
	}
	// 每次运行授权访问开关（情况 B）
	if (DOM.attachAskAccess) {
		DOM.attachAskAccess.checked = !!getAttachAskAccess();
	}
	// 显示路径开关（A/B）
	if (DOM.attachShowPath) {
		DOM.attachShowPath.checked = !!getAttachShowPath();
	}
}

// 添加附件按钮的显隐条件（5.3）
function _refreshAttachButtonVisibility() {
	const c = _currentAttachCase();
	if (!DOM.bijiAddAttachBtn) return;
	if (c === 'C') { DOM.bijiAddAttachBtn.style.display = 'none'; return; }
	// 情况 A：dirHandle 不存在则隐藏（5.3）
	// 情况 B：attachRootPath 为空则隐藏
	if (c === 'A') {
		biji.getDirHandle().then(h => {
			DOM.bijiAddAttachBtn.style.display = h ? '' : 'none';
		});
	} else if (c === 'B') {
		DOM.bijiAddAttachBtn.style.display = getAttachRootPath() ? '' : 'none';
	}
}

// ========== 文件解析（情况 A 通过 dirHandle 逐级解析 path+name，7.2）==========
// asset.path 形如 "folder0/folder1/"，asset.name 形如 "img.jpg"
// 返回 File 或 null
async function _resolveFileFromPath(asset) {
	// 返回：File | 'noDir' | 'noPerm' | 'notFound'
	const dirHandle = await biji.getDirHandle();
	if (!dirHandle) return 'noDir';
	const ok = await biji.verifyDirHandle();
	if (!ok) return 'noPerm';
	let cur = dirHandle;
	const parts = (asset.path || '').split('/').filter(Boolean);
	for (const p of parts) {
		try {
			cur = await cur.getDirectoryHandle(p, { create: false });
		} catch(e) { return 'notFound'; }
	}
	try {
		const fileHandle = await cur.getFileHandle(asset.name, { create: false });
		return await fileHandle.getFile();
	} catch(e) { return 'notFound'; }
}

// 根目录约束判定（5.5）：返回 true 表示在根目录内
async function _isWithinRoot(fileHandle) {
	const dirHandle = await biji.getDirHandle();
	if (!dirHandle) return false;
	try {
		const rel = await dirHandle.resolve(fileHandle);
		if (!rel) return false;
		if (rel.some(seg => seg === '..')) return false;
		return true;
	} catch(e) { return false; }
}

// ========== 死引用清理（7.6）==========
// 当前检测到的缺失项缓存
let _cleanMissingRefsState = [];

// 收集所有笔记中的 asset 引用（7.6 检测流程第1步）
function _collectAllAssetRefs() {
	const refs = [];
	for (let i = 0; i < localStorage.length; i++) {
		const k = localStorage.key(i);
		if (!k) continue;
		const sui = parseInt(k);
		if (isNaN(sui)) continue;
		let data;
		try { data = JSON.parse(localStorage.getItem(k)); } catch(e) { continue; }
		if (!data) continue;
		for (const hj of Object.keys(data)) {
			if (!Array.isArray(data[hj])) continue;
			for (let nIdx = 0; nIdx < data[hj].length; nIdx++) {
				const n = data[hj][nIdx];
				if (!n || !Array.isArray(n.assets)) continue;
				for (let aIdx = 0; aIdx < n.assets.length; aIdx++) {
					const a = n.assets[aIdx];
					if (!a) continue;
					refs.push({ sui, hj: Number(hj), nIdx, aIdx, asset: a, note: n });
				}
			}
		}
	}
	return refs;
}

// 打开清理引用面板（7.6）
async function _openCleanMissingRefs() {
	const c = _currentAttachCase();
	if (c !== 'A') {
		_showToast('当前权限模式下不支持清理引用。');
		return;
	}
	const dirHandle = await biji.getDirHandle();
	if (!dirHandle) {
		_showToast('请先指定本地文件夹。');
		return;
	}
	const ok = await biji.verifyDirHandle();
	if (!ok) {
		_showToast('本地文件夹已失效，请重新指定。');
		return;
	}

	// 重置面板状态
	DOM.cleanRefsTip.textContent = '正在检测附件原文件……';
	DOM.cleanRefsList.innerHTML = '';
	DOM.cleanRefsConfirm.disabled = true;
	DOM.cleanRefsConfirm.textContent = '清理引用';
	DOM.cleanRefsSelectAll.checked = true;
	DOM.cleanRefsSelectAll.disabled = true;
	DOM.cleanRefsOverlay.style.display = 'flex';

	// 收集所有 asset 引用并逐个检测（7.6 检测流程第1~2步）
	const refs = _collectAllAssetRefs();
	if (refs.length === 0) {
		DOM.cleanRefsTip.textContent = '没有附件引用';
		return;
	}
	const missing = [];
	for (let i = 0; i < refs.length; i++) {
		const ref = refs[i];
		let isMissing = true;
		try {
			const r = await _resolveFileFromPath(ref.asset);
			isMissing = !(r instanceof File);
		} catch(e) { isMissing = true; }
		if (isMissing) missing.push(ref);
		// 每 10 项更新一次进度，让出主线程避免长时间阻塞
		if (i % 10 === 9) {
			DOM.cleanRefsTip.textContent = '正在检测原文件… (' + (i + 1) + '/' + refs.length + ')';
			await new Promise(r => setTimeout(r, 0));
		}
	}

	_cleanMissingRefsState = missing;
	_renderCleanRefsList(missing);
}

// 渲染缺失项列表（7.6 检测流程第3~4步）
function _renderCleanRefsList(missing) {
	const tip = DOM.cleanRefsTip;
	const list = DOM.cleanRefsList;
	if (missing.length === 0) {
		tip.textContent = '未发现缺失引用。';
		list.innerHTML = '';
		DOM.cleanRefsConfirm.disabled = true;
		DOM.cleanRefsConfirm.textContent = '清理引用';
		DOM.cleanRefsSelectAll.disabled = true;
		DOM.cleanRefsSelectAll.checked = false;
		return;
	}
	tip.textContent = '发现 ' + missing.length + ' 个缺失引用，默认全选：';
	DOM.cleanRefsSelectAll.disabled = false;
	DOM.cleanRefsSelectAll.checked = true;
	list.innerHTML = '';
	missing.forEach((ref, idx) => {
		const item = document.createElement('label');
		item.className = 'clean-refs-item';

		const cb = document.createElement('input');
		cb.type = 'checkbox';
		cb.checked = true;
		cb.dataset.idx = String(idx);
		cb.addEventListener('change', _updateCleanRefsConfirm);

		const icon = document.createElement('span');
		icon.className = 'clean-refs-item-icon';
		icon.textContent = fujian.TYPE_ICON[ref.asset.type] || fujian.TYPE_ICON.other;

		const info = document.createElement('span');
		info.className = 'clean-refs-item-info';

		const pathEl = document.createElement('span');
		pathEl.className = 'clean-refs-item-path';
		pathEl.textContent = (ref.asset.path || '') + (ref.asset.name || '');

		const exEl = document.createElement('span');
		exEl.className = 'clean-refs-item-excerpt';
		const ex = biji.excerpt(ref.note.biji, 20);
		exEl.textContent = ex || '(空笔记)';

		info.appendChild(pathEl);
		info.appendChild(exEl);
		item.appendChild(cb);
		item.appendChild(icon);
		item.appendChild(info);
		list.appendChild(item);
	});
	_updateCleanRefsConfirm();
}

// 更新确认按钮状态（7.6 UI：选中项 > 0 时可用，显示「清理 N 个引用」）
function _updateCleanRefsConfirm() {
	const all = DOM.cleanRefsList.querySelectorAll('input[type="checkbox"]');
	const checked = DOM.cleanRefsList.querySelectorAll('input[type="checkbox"]:checked');
	DOM.cleanRefsConfirm.disabled = checked.length === 0;
	DOM.cleanRefsConfirm.textContent = checked.length > 0
		? '清理 ' + checked.length + ' 个引用'
		: '清理引用';
	if (all.length > 0) {
		DOM.cleanRefsSelectAll.checked = checked.length === all.length;
	}
}

// 全选切换
function _onCleanRefsSelectAll() {
	const checked = DOM.cleanRefsSelectAll.checked;
	DOM.cleanRefsList.querySelectorAll('input[type="checkbox"]').forEach(cb => {
		cb.checked = checked;
	});
	_updateCleanRefsConfirm();
}

// 确认清理（7.6 检测流程第5步）
async function _confirmCleanMissingRefs() {
	const checked = DOM.cleanRefsList.querySelectorAll('input[type="checkbox"]:checked');
	if (checked.length === 0) return;

	// 按 sui+hj 分组，每组内按 nIdx 分组收集要删除的 aIdx
	const groups = new Map();
	checked.forEach(cb => {
		const idx = parseInt(cb.dataset.idx);
		const ref = _cleanMissingRefsState[idx];
		if (!ref) return;
		const gk = ref.sui + ':' + ref.hj;
		if (!groups.has(gk)) groups.set(gk, { sui: ref.sui, hj: ref.hj, notes: new Map() });
		const g = groups.get(gk);
		if (!g.notes.has(ref.nIdx)) g.notes.set(ref.nIdx, new Set());
		g.notes.get(ref.nIdx).add(ref.aIdx);
	});

	let cleaned = 0;
	for (const g of groups.values()) {
		const k = String(g.sui);
		let data;
		try { data = JSON.parse(localStorage.getItem(k)); } catch(e) { continue; }
		if (!data || !Array.isArray(data[String(g.hj)])) continue;
		const arr = data[String(g.hj)];
		for (const [nIdx, aIdxSet] of g.notes) {
			if (!arr[nIdx] || !Array.isArray(arr[nIdx].assets)) continue;
			arr[nIdx].assets = arr[nIdx].assets.filter((_, i) => !aIdxSet.has(i));
			arr[nIdx].updated = biji.nowTs();
			cleaned += aIdxSet.size;
		}
		try { localStorage.setItem(k, JSON.stringify(data)); } catch(e) {}
	}

	_cleanMissingRefsState = [];
	DOM.cleanRefsOverlay.style.display = 'none';
	_showToast('已清理 ' + cleaned + ' 个缺失引用。');

	// 刷新当前笔记显示
	_refreshAfterRefsCleaned();
}

// 关闭清理引用面板
function _closeCleanMissingRefs() {
	DOM.cleanRefsOverlay.style.display = 'none';
	_cleanMissingRefsState = [];
}

// 清理后刷新笔记显示（笔记总览页 / 编辑器 / 主界面）
function _refreshAfterRefsCleaned() {
	// 笔记总览页打开时刷新列表
	if (DOM.boPage && DOM.boPage.classList.contains('active')) {
		if (typeof _renderBijiOverview === 'function') _renderBijiOverview();
	}
	// 编辑器打开时刷新缩略图栏
	if (DOM.bijiEditor && DOM.bijiEditor.classList.contains('open')) {
		if (typeof _bijiRenderThumbBar === 'function') _bijiRenderThumbBar();
	}
}

// ========== 停用区间管理（7.5）==========
// 判断 sui 是否在任意停用区间内
function _isInDisabledRange(sui) {
	const ranges = getDisabledRanges();
	for (const r of ranges) {
		if (sui >= r.start && sui <= r.end) return true;
	}
	return false;
}

// 收集区间外笔记引用的 thumbKey 集合（用于跨笔记引用检查策略）
function _collectThumbKeysUsedOutsideRange(startSui, endSui) {
	const keys = new Set();
	for (let i = 0; i < localStorage.length; i++) {
		const k = localStorage.key(i);
		if (!k) continue;
		const sui = parseInt(k);
		if (isNaN(sui)) continue;
		// 跳过区间内
		if (sui >= startSui && sui <= endSui) continue;
		let data;
		try { data = JSON.parse(localStorage.getItem(k)); } catch(e) { continue; }
		if (!data) continue;
		for (const hj of Object.keys(data)) {
			if (!Array.isArray(data[hj])) continue;
			for (const n of data[hj]) {
				if (!n || !Array.isArray(n.assets)) continue;
				for (const a of n.assets) {
					if (a && a.thumbKey) keys.add(a.thumbKey);
				}
			}
		}
	}
	return keys;
}

// 添加停用区间（4.3 第 1 行 / 7.5）
async function _addDisabledRange() {
	const startStr = DOM.thumbDisabledStart.value.trim();
	const endStr = DOM.thumbDisabledEnd.value.trim();
	if (!startStr || !endStr) {
		_showToast('请输入起岁和止岁。');
		return;
	}
	const startSui = parseInt(startStr);
	const endSui = parseInt(endStr);
	if (isNaN(startSui) || isNaN(endSui)) {
		_showToast('起止岁必须为数字。');
		return;
	}
	if (startSui > endSui) {
		_showToast('起岁不能大于止岁。');
		return;
	}

	// 检查与现有区间全包含（允许交叉，仅处理完全包含或被包含）
	const ranges = getDisabledRanges();
	let replaceIdx = -1;  // 需要取代的旧区间索引
	for (let i = 0; i < ranges.length; i++) {
		const r = ranges[i];
		const newContainsOld = startSui <= r.start && endSui >= r.end;
		const oldContainsNew = startSui >= r.start && endSui <= r.end;
		if (oldContainsNew) {
			// 旧区间完全包含新区间：拒绝
			_showToast('已包含于停用区间 ' + r.start + '～' + r.end);
			return;
		}
		if (newContainsOld) {
			// 新区间完全包含旧区间：提示确认后取代
			replaceIdx = i;
			break;
		}
	}
	if (replaceIdx >= 0) {
		const r = ranges[replaceIdx];
		if (!confirm('新区间 ' + startSui + '～' + endSui + ' 将取代已有停用区间 ' + r.start + '～' + r.end + '，是否继续？')) {
			return;
		}
	}

	const exportThumbs = DOM.thumbDisabledExport.checked;

	// 1. 收集区间内笔记引用的 thumbKey（7.5 第 1 步）
	const assetsMapInRange = _collectThumbKeysInRange(startSui, endSui, true);
	const keysInRange = new Set(assetsMapInRange.keys());

	// 2. 若勾选导出，先打包为 zip（7.5 第 2 步 / 10.1）
	if (exportThumbs && keysInRange.size > 0) {
		try {
			const packResult = await fujian.packThumbnailsToZip(keysInRange, assetsMapInRange);
			if (packResult.blob) {
				const ts = _bijiTimestamp();
				const zipFilename = '岁月历_缩略图_停用_' + startSui + '-' + endSui + '_' + ts + '.zip';
				await _saveFile(packResult.blob, zipFilename, 'application/zip');
			} else if (packResult.missing > 0) {
				_showToast('提示：' + packResult.missing + ' 个缩略图未找到，已跳过。', 3000);
			}
		} catch(e) {
			if (e.name !== 'AbortError') {
				_showToast('😿缩略图包导出失败：' + e.message);
				return;
			} else {
				// 用户取消保存，终止添加流程
				return;
			}
		}
	}

	// 3. 按跨笔记引用检查策略清除（7.5 第 3 步 / 7.4）
	if (keysInRange.size > 0) {
		const keysOutside = _collectThumbKeysUsedOutsideRange(startSui, endSui);
		let cleared = 0;
		for (const key of keysInRange) {
			// 被区间外笔记引用则保留，否则删除
			if (keysOutside.has(key)) continue;
			try {
				await fujian.deleteThumbnail(key);
				cleared++;
			} catch(e) {}
		}
		if (cleared > 0) {
			_showToast('已清理 ' + cleared + ' 个区间内独占缩略图。', 2500);
		}
	}

	// 4. 写入 disabledRanges（7.5 第 4 步；若取代旧区间则先移除）
	if (replaceIdx >= 0) ranges.splice(replaceIdx, 1);
	ranges.push({ start: startSui, end: endSui });
	ranges.sort((a, b) => a.start - b.start);
	setDisabledRanges(ranges);

	// 清空输入框
	DOM.thumbDisabledStart.value = '';
	DOM.thumbDisabledEnd.value = '';

	// 5. 刷新 UI
	_syncDisabledRangesUI();
	_showToast('已添加停用区间：' + startSui + '～' + endSui + '。', 2500);
}

// 移除停用区间（4.3 第 2 行 / 7.5）
function _removeDisabledRange(idx) {
	const ranges = getDisabledRanges();
	if (idx < 0 || idx >= ranges.length) return;
	const r = ranges[idx];
	if (!confirm('解除停用区间 ' + r.start + '～' + r.end + '？\n（缺失缩略图需由「增减/重建」模式「维护」）。')) return;
	ranges.splice(idx, 1);
	setDisabledRanges(ranges);
	_syncDisabledRangesUI();
	_showToast('已解除停用区间。', 2000);
}

// 同步「已停用」行 UI（4.3 第 2 行）
function _syncDisabledRangesUI() {
	const ranges = getDisabledRanges();
	if (!DOM.thumbDisabledListRow || !DOM.thumbDisabledToggle || !DOM.thumbDisabledMenu) return;
	if (ranges.length === 0) {
		DOM.thumbDisabledListRow.style.display = 'none';
		DOM.thumbDisabledMenu.style.display = 'none';
		DOM.thumbDisabledToggle.textContent = '共0区间';
		return;
	}
	DOM.thumbDisabledListRow.style.display = '';
	DOM.thumbDisabledToggle.textContent = '共' + ranges.length + '区间';
	// 渲染下拉菜单项
	DOM.thumbDisabledMenu.innerHTML = '';
	ranges.forEach((r, idx) => {
		const item = document.createElement('div');
		item.className = 'thumb-disabled-item';
		const text = document.createElement('span');
		text.className = 'thumb-disabled-item-text';
		text.textContent = r.start + '～' + r.end;
		const del = document.createElement('button');
		del.type = 'button';
		del.className = 'thumb-disabled-item-del';
		del.textContent = '✕';
		del.title = '解除该停用区间';
		del.addEventListener('click', (e) => {
			e.stopPropagation();
			_removeDisabledRange(idx);
		});
		item.appendChild(text);
		item.appendChild(del);
		DOM.thumbDisabledMenu.appendChild(item);
	});
}

// 切换「已停用」下拉菜单显隐（4.3 第 2 行）
function _toggleDisabledDropdown() {
	if (!DOM.thumbDisabledMenu || !DOM.thumbDisabledToggle) return;
	const cur = DOM.thumbDisabledMenu.style.display;
	if (cur === 'none') {
		DOM.thumbDisabledMenu.style.display = '';
		DOM.thumbDisabledToggle.classList.add('active');
	} else {
		DOM.thumbDisabledMenu.style.display = 'none';
		DOM.thumbDisabledToggle.classList.remove('active');
	}
}

function _closeDisabledDropdown() {
	if (!DOM.thumbDisabledMenu) return;
	DOM.thumbDisabledMenu.style.display = 'none';
	if (DOM.thumbDisabledToggle) DOM.thumbDisabledToggle.classList.remove('active');
}

// ========== 缩略图维护（7.1 / 7.2 / 7.3）==========
// 收集所有笔记引用的 thumbKey（7.2）
// withAsset 为真时返回 Map<thumbKey, asset>，asset 附带 _sui 临时字段
function _collectAllThumbKeys(withAsset) {
	const out = withAsset ? new Map() : new Set();
	for (let i = 0; i < localStorage.length; i++) {
		const k = localStorage.key(i);
		if (!k) continue;
		const sui = parseInt(k);
		if (isNaN(sui)) continue;
		let data;
		try { data = JSON.parse(localStorage.getItem(k)); } catch(e) { continue; }
		if (!data) continue;
		for (const hj of Object.keys(data)) {
			if (!Array.isArray(data[hj])) continue;
			for (const n of data[hj]) {
				if (!n || !Array.isArray(n.assets)) continue;
				for (const a of n.assets) {
					if (!a || !a.thumbKey) continue;
					if (withAsset) {
						if (!out.has(a.thumbKey)) {
							// 复制一份避免污染原数据，附加 _sui
							out.set(a.thumbKey, { ...a, _sui: sui });
						}
					} else {
						out.add(a.thumbKey);
					}
				}
			}
		}
	}
	return out;
}

// 补全笔记中缺失 thumbKey 的 asset（第七章 维护阶段）
// 仅在情况 A（有 fileResolver）且 rebuild/increment 模式下调用
// 流程：遍历笔记 → 找出无 thumbKey 的 asset → fileResolver 取文件 → 计算哈希 → 生成 thumbKey → 补全 size/mime/type → 回写
// dirHandle: 情况 A 下的笔记根目录句柄，用于生成缩略图后同步本地镜像
// 返回 { supplemented, failed, scanned, missingRefs }
async function _supplementMissingThumbKeys(fileResolver, enabledTypes, disabledRanges, dirHandle, onProgress) {
	const result = { supplemented: 0, failed: 0, scanned: 0, missingRefs: [] };
	if (!fileResolver) return result;
	// 收集所有缺少 thumbKey 的 asset（带位置信息）
	const missing = []; // [{ sui, hj, noteIdx, assetIdx }]
	for (let i = 0; i < localStorage.length; i++) {
		const k = localStorage.key(i);
		if (!k) continue;
		const sui = parseInt(k);
		if (isNaN(sui)) continue;
		let data;
		try { data = JSON.parse(localStorage.getItem(k)); } catch(e) { continue; }
		if (!data) continue;
		for (const hj of Object.keys(data)) {
			if (!Array.isArray(data[hj])) continue;
			for (let noteIdx = 0; noteIdx < data[hj].length; noteIdx++) {
				const n = data[hj][noteIdx];
				if (!n || !Array.isArray(n.assets)) continue;
				for (let assetIdx = 0; assetIdx < n.assets.length; assetIdx++) {
					const a = n.assets[assetIdx];
					if (!a || a.thumbKey) continue;
					missing.push({ sui, hj, noteIdx, assetIdx });
				}
			}
		}
	}
	result.scanned = missing.length;
	if (missing.length === 0) return result;
	// 按 sui 分组，减少 localStorage 读写次数
	const bySui = new Map();
	for (const item of missing) {
		if (!bySui.has(item.sui)) bySui.set(item.sui, []);
		bySui.get(item.sui).push(item);
	}
	const total = missing.length;
	let done = 0;
	for (const [sui, items] of bySui) {
		const k = String(sui);
		let data;
		try { data = JSON.parse(localStorage.getItem(k)); } catch(e) { continue; }
		if (!data) continue;
		let changed = false;
		for (const item of items) {
			done++;
			const arr = data[item.hj];
			const n = arr && arr[item.noteIdx];
			const a = n && Array.isArray(n.assets) ? n.assets[item.assetIdx] : null;
			if (!a || a.thumbKey) continue;  // 可能已被同轮补全
			// 类型未启用：仍记录 thumbKey 作为唯一标识（6.7），但不生成缩略图
			const typeEnabled = !enabledTypes || enabledTypes.has(a.type || 'other');
			// 停用区间：跳过
			if (disabledRanges) {
				const inDisabled = disabledRanges.some(r => sui >= r.start && sui <= r.end);
				if (inDisabled) continue;
			}
			try {
				const file = await fileResolver(a);
				if (!(file instanceof File)) {
					// 取不到文件：收集到 missingRefs 供后续询问
					result.missingRefs.push({ sui, hj: item.hj, noteIdx: item.noteIdx, assetIdx: item.assetIdx, asset: { ...a }, reason: typeof file === 'string' ? file : 'unknown' });
					continue;
				}
				const hash = await fujian.computeSampleHash(file);
				const { key: thumbKey } = await fujian._resolveThumbKey(hash);
				// 补全缺失字段
				if (typeof a.size !== 'number' || a.size === 0) a.size = file.size;
				if (!a.mime) a.mime = file.type || '';
				if (!a.type) a.type = fujian.detectType(file);
				// 类型启用时生成缩略图
				if (typeEnabled) {
					const exists = await fujian.getThumbnail(thumbKey);
					if (!exists) {
						const thumbResult = await fujian.generateThumbnail(file, a.type);
						if (thumbResult) {
							const value = {
								blob: thumbResult.blob,
								originalType: a.type,
								originalName: a.name || '',
								originalSize: file.size,
								createdAt: Date.now(),
								lastUsed: Date.now(),
								hashSuffix: 0
							};
							await fujian.putThumbnail(thumbKey, value);
							// 情况 A：同步缩略图到本地镜像（3.3）
							if (dirHandle) {
								try { await fujian._syncThumbToLocal(thumbKey, thumbResult.blob, dirHandle); }
								catch(e) { /* 本地镜像失败不影响补全结果 */ }
							}
						}
					}
				}
				a.thumbKey = thumbKey;
				result.supplemented++;
				changed = true;
			} catch(e) {
				result.failed++;
			}
			if (onProgress) onProgress({ phase: 'supplement', total, done, supplemented: result.supplemented, failed: result.failed });
		}
		if (changed) {
			try { localStorage.setItem(k, JSON.stringify(data)); } catch(e) {}
		}
	}
	return result;
}

// 纠正笔记中已有但错误的 thumbKey（仅 rebuild 模式）
// 流程：遍历笔记 → 对每个有 thumbKey 的 asset → fileResolver 取文件 → 重新计算哈希 → 对比 → 不一致则更新
// 取不到文件的 asset 收集到 missingRefs 供后续询问
// 返回 { corrected, failed, scanned, missingRefs }
async function _correctThumbKeysInNotes(fileResolver, disabledRanges, onProgress) {
	const result = { corrected: 0, failed: 0, scanned: 0, missingRefs: [] };
	if (!fileResolver) return result;
	// 收集所有有 thumbKey 的 asset（带位置信息）
	const items = [];
	for (let i = 0; i < localStorage.length; i++) {
		const k = localStorage.key(i);
		if (!k) continue;
		const sui = parseInt(k);
		if (isNaN(sui)) continue;
		let data;
		try { data = JSON.parse(localStorage.getItem(k)); } catch(e) { continue; }
		if (!data) continue;
		for (const hj of Object.keys(data)) {
			if (!Array.isArray(data[hj])) continue;
			for (let noteIdx = 0; noteIdx < data[hj].length; noteIdx++) {
				const n = data[hj][noteIdx];
				if (!n || !Array.isArray(n.assets)) continue;
				for (let assetIdx = 0; assetIdx < n.assets.length; assetIdx++) {
					const a = n.assets[assetIdx];
					if (!a || !a.thumbKey) continue;
					items.push({ sui, hj, noteIdx, assetIdx });
				}
			}
		}
	}
	result.scanned = items.length;
	if (items.length === 0) return result;
	// 按 sui 分组
	const bySui = new Map();
	for (const item of items) {
		if (!bySui.has(item.sui)) bySui.set(item.sui, []);
		bySui.get(item.sui).push(item);
	}
	const total = items.length;
	let done = 0;
	for (const [sui, suiItems] of bySui) {
		const k = String(sui);
		let data;
		try { data = JSON.parse(localStorage.getItem(k)); } catch(e) { continue; }
		if (!data) continue;
		let changed = false;
		for (const item of suiItems) {
			done++;
			const arr = data[item.hj];
			const n = arr && arr[item.noteIdx];
			const a = n && Array.isArray(n.assets) ? n.assets[item.assetIdx] : null;
			if (!a || !a.thumbKey) continue;
			// 停用区间：跳过
			if (disabledRanges) {
				const inDisabled = disabledRanges.some(r => sui >= r.start && sui <= r.end);
				if (inDisabled) continue;
			}
			try {
				const file = await fileResolver(a);
				if (!(file instanceof File)) {
					result.missingRefs.push({ sui, hj: item.hj, noteIdx: item.noteIdx, assetIdx: item.assetIdx, asset: { ...a }, reason: typeof file === 'string' ? file : 'unknown' });
					continue;
				}
				const hash = await fujian.computeSampleHash(file);
				// 判断原 thumbKey 是否已匹配该 hash（hash 本身或 hash-N 形式均视为一致）
				// _resolveThumbKey 是"寻找可用 key"的函数，不适用于此处判断正确性
				const isHashMatch = a.thumbKey === hash || a.thumbKey.startsWith(hash + '-');
				if (!isHashMatch) {
					// 真正需要纠正：原 thumbKey 与重算的 hash 不一致
					// 直接用 hash 作为新 key（rebuild 流程随后会清空 IDB 并重生成，无冲突风险）
					a.thumbKey = hash;
					if (typeof a.size !== 'number' || a.size === 0) a.size = file.size;
					if (!a.mime) a.mime = file.type || '';
					result.corrected++;
					changed = true;
				}
			} catch(e) {
				result.failed++;
			}
			if (onProgress) onProgress({ phase: 'correct', total, done, corrected: result.corrected, failed: result.failed });
		}
		if (changed) {
			try { localStorage.setItem(k, JSON.stringify(data)); } catch(e) {}
		}
	}
	return result;
}

// 询问用户是否删除原文件缺失的附件引用
// missingRefs: [{ sui, hj, noteIdx, assetIdx, asset, reason }]
// 返回 { deleted, skipped }
function _promptDeleteMissingRefs(missingRefs) {
	const result = { deleted: 0, skipped: 0 };
	if (!missingRefs || missingRefs.length === 0) return result;
	// 去重（同一 asset 可能被多次收集）
	const seen = new Set();
	const unique = [];
	for (const ref of missingRefs) {
		const id = ref.sui + ':' + ref.hj + ':' + ref.noteIdx + ':' + ref.assetIdx;
		if (!seen.has(id)) { seen.add(id); unique.push(ref); }
	}
	if (unique.length === 0) return result;
	// 构建提示信息
	const fileList = unique.slice(0, 10).map(r => {
		const p = r.asset.path || '';
		const n = r.asset.name || '';
		return '  ' + (p + n) + '（' + r.sui + '岁）';
	}).join('\n');
	const more = unique.length > 10 ? '\n...共 ' + unique.length + ' 个' : '';
	const msg = '⚠以下 ' + unique.length + ' 个附件的原文件未找到：\n' + fileList + more + '\n\n是否在笔记中删除这些附件引用，并在应用中清除相关信息❓';
	if (!confirm(msg)) {
		result.skipped = unique.length;
		return result;
	}
	// 按 sui 分组删除
	const bySui = new Map();
	for (const ref of unique) {
		if (!bySui.has(ref.sui)) bySui.set(ref.sui, []);
		bySui.get(ref.sui).push(ref);
	}
	for (const [sui, refs] of bySui) {
		const k = String(sui);
		let data;
		try { data = JSON.parse(localStorage.getItem(k)); } catch(e) { continue; }
		if (!data) continue;
		let changed = false;
		// 按 hj + noteIdx 分组，每组内按 assetIdx 倒序删除
		const byHjNote = new Map();
		for (const ref of refs) {
			const key = ref.hj + ':' + ref.noteIdx;
			if (!byHjNote.has(key)) byHjNote.set(key, { hj: ref.hj, noteIdx: ref.noteIdx, assetIdxs: [] });
			byHjNote.get(key).assetIdxs.push(ref.assetIdx);
		}
		for (const { hj, noteIdx, assetIdxs } of byHjNote.values()) {
			if (!Array.isArray(data[hj]) || !data[hj][noteIdx]) continue;
			if (!Array.isArray(data[hj][noteIdx].assets)) continue;
			assetIdxs.sort((a, b) => b - a);  // 倒序删除避免索引偏移
			for (const idx of assetIdxs) {
				if (data[hj][noteIdx].assets[idx]) {
					data[hj][noteIdx].assets.splice(idx, 1);
					result.deleted++;
					changed = true;
				}
			}
		}
		if (changed) {
			try { localStorage.setItem(k, JSON.stringify(data)); } catch(e) {}
		}
	}
	return result;
}

// 显示维护进度（7.2）
function _showThumbMaintainProgress(title) {
	if (!DOM.thumbMaintainOverlay) return;
	if (DOM.thumbMaintainTitle) DOM.thumbMaintainTitle.textContent = title || '缩略图维护中…';
	if (DOM.thumbMaintainBar) DOM.thumbMaintainBar.style.width = '0%';
	if (DOM.thumbMaintainStats) DOM.thumbMaintainStats.textContent = '';
	DOM.thumbMaintainOverlay.style.display = 'flex';
}
function _hideThumbMaintainProgress() {
	if (!DOM.thumbMaintainOverlay) return;
	DOM.thumbMaintainOverlay.style.display = 'none';
}
function _updateThumbMaintainProgress(stats) {
	if (!DOM.thumbMaintainStats || !DOM.thumbMaintainBar) return;
	const parts = [];
	if (stats.cleared) parts.push('清理 ' + stats.cleared);
	if (stats.generated !== undefined) parts.push('生成 ' + stats.generated);
	if (stats.supplemented !== undefined) parts.push('补全 ' + stats.supplemented);
	if (stats.failed !== undefined) parts.push('失败 ' + stats.failed);
	if (stats.total !== undefined && stats.done !== undefined) {
		DOM.thumbMaintainBar.style.width = (stats.total > 0 ? (stats.done / stats.total * 100) : 0) + '%';
	}
	DOM.thumbMaintainStats.textContent = parts.join(' · ');
}

// 执行维护（7.1 / 7.2）
// opts: { mode, showUI }
async function _runThumbMaintain(opts) {
	const { mode, showUI } = opts;
	if (_thumbMaintaining) {
		if (showUI) _showToast('缩略图维护进行中，请稍候……');
		return;
	}
	const c = _currentAttachCase();
	// 权限适配：情况 B/C 仅允许 cleanup
	let actualMode = mode;
	if (c !== 'A' && mode !== 'cleanup') {
		if (showUI) _showToast('当前权限模式下仅支持「仅清理」。');
		actualMode = 'cleanup';
	}
	// 情况 A 下检查目录句柄
	let fileResolver = null;
	let dirHandle = null;
	if (c === 'A') {
		dirHandle = await biji.getDirHandle();
		if (!dirHandle || !(await biji.verifyDirHandle())) {
			if (showUI) _showToast('本地目录权限失效，请重新指定。');
			// 降级为 cleanup
			actualMode = 'cleanup';
			dirHandle = null;
		} else {
			fileResolver = _resolveFileFromPath;
		}
	}

	// rebuild 模式下先纠正错误的 thumbKey（重新计算哈希）
	const allMissingRefs = [];
	let result_corrected = 0, result_correctFailed = 0;
	const enabledTypes = new Set(getEnabledTypes());
	const disabledRanges = getDisabledRanges();

	_thumbMaintaining = true;
	try {
		if (actualMode === 'rebuild' && fileResolver) {
			if (showUI) _showThumbMaintainProgress('纠正附件缩略图标识…');
			const corr = await _correctThumbKeysInNotes(fileResolver, disabledRanges, showUI ? (stats) => _updateThumbMaintainProgress(stats) : null);
			result_corrected = corr.corrected;
			result_correctFailed = corr.failed;
			allMissingRefs.push(...corr.missingRefs);
		}

		// 收集全部 thumbKey 和 asset 映射（纠正后重新收集）
		const assetsMap = _collectAllThumbKeys(true);
		const usedThumbKeys = new Set(assetsMap.keys());

		if (showUI) {
			const modeText = actualMode === 'rebuild' ? '重建' : (actualMode === 'increment' ? '增减' : '仅清理');
			_showThumbMaintainProgress('缩略图' + modeText + '维护中…');
		}

		const result = await fujian.runMaintenance({
			mode: actualMode,
			usedThumbKeys,
			assetsMap,
			fileResolver,
			enabledTypes,
			disabledRanges,
			dirHandle,
			onProgress: (stats) => _updateThumbMaintainProgress(stats)
		});
		// 记录纠正阶段的结果
		result.corrected = result_corrected;
		result.correctFailed = result_correctFailed;
		// 补全笔记中缺失 thumbKey 的 asset（仅 rebuild/increment 且有 fileResolver）
		if ((actualMode === 'rebuild' || actualMode === 'increment') && fileResolver) {
			if (showUI) _showThumbMaintainProgress('补全附件缩略图标识…');
			const supp = await _supplementMissingThumbKeys(fileResolver, enabledTypes, disabledRanges, dirHandle, showUI ? (stats) => _updateThumbMaintainProgress(stats) : null);
			result.supplemented = supp.supplemented;
			result.supplementFailed = supp.failed;
			allMissingRefs.push(...supp.missingRefs);
		}
		// 上次维护HJ积日由调用方记录（自动维护成功后记录，手动维护不记录）
		// 原文件缺失的附件引用：仅手动维护时询问用户
		if (allMissingRefs.length > 0 && showUI) {
			const del = _promptDeleteMissingRefs(allMissingRefs);
			result.deletedRefs = del.deleted;
			result.skippedRefs = del.skipped;
		}
		// 同步本地 manifest（assets 信息表）
		await _syncLocalManifest();
		// 刷新界面
		// 维护后列表缩略图 blob 已更新，清除列表 URL 缓存（编辑器为独立缓存，不受影响）
		_listPurgeThumbURLs();
		if (typeof _bijiRenderThumbBar === 'function' && DOM.bijiEditor && DOM.bijiEditor.classList.contains('open')) {
			_bijiRenderThumbBar();
		}
		if (DOM.boPage && DOM.boPage.classList.contains('active') && typeof _renderBijiOverview === 'function') {
			_renderBijiOverview();
		}
		// 主列表展开态缩略图栏刷新
		if (DOM.bijiList && DOM.bijiList.querySelector('.biji-item.expanded') && typeof _refreshMainListExpandThumb === 'function') {
			_refreshMainListExpandThumb();
		}
		if (showUI) {
			const parts = [];
			if (result.corrected) parts.push('纠正 ' + result.corrected);
			if (result.cleared) parts.push('清理 ' + result.cleared);
			if (result.localCleared) parts.push('本地镜像清理 ' + result.localCleared);
			if (result.generated) parts.push('生成 ' + result.generated);
			if (result.supplemented) parts.push('补全 ' + result.supplemented);
			if (result.deletedRefs) parts.push('删除引用 ' + result.deletedRefs);
			if (result.failed) parts.push('失败 ' + result.failed);
			if (result.supplementFailed) parts.push('补全失败 ' + result.supplementFailed);
			_showToast('维护完成' + (parts.length ? '：' + parts.join('、') : ''), 3000);
		}
		return result;
	} catch(e) {
		if (showUI) _showToast('😿维护失败：' + e.message);
	} finally {
		_thumbMaintaining = false;
		if (showUI) _hideThumbMaintainProgress();
	}
}

// 定期自动维护检查（7.3）
async function _checkAutoThumbMaintain() {
	const interval = getThumbAutoInterval();
	if (interval <= 0) return;  // 0=仅手动
	const lastHJ = getLastThumbMaintainHJ();
	const nowHJ = HJ_Jin();
	if (lastHJ && (nowHJ - lastHJ) < interval) return;

	// 自动维护模式：A 权限按用户选择，B/C 权限强制 cleanup
	const c = _currentAttachCase();
	const autoMode = c === 'A' ? getThumbAutoMode() : 'cleanup';
	const result = await _runThumbMaintain({ mode: autoMode, showUI: false });
	// 仅在维护成功时记录 HJ 积日
	if (result) setLastThumbMaintainHJ(nowHJ);
}

// 类型勾选变更（4.3 第 3 行 / 6.7 / 7.4）
async function _onThumbTypeChange() {
	const types = [];
	if (DOM.thumbTypeImage?.checked) types.push('image');
	if (DOM.thumbTypeVideo?.checked) types.push('video');
	if (DOM.thumbTypeAudio?.checked) types.push('audio');
	const oldTypes = new Set(getEnabledTypes());
	const newTypes = new Set(types);
	// 找出被取消的类型
	const disabled = [...oldTypes].filter(t => !newTypes.has(t));
	if (disabled.length === 0) {
		setEnabledTypes(types);
		// 新增启用的类型：已有笔记中该类型附件的缩略图需手动维护生成
		const enabled = [...newTypes].filter(t => !oldTypes.has(t));
		if (enabled.length > 0) {
			_showToast('已在笔记中的「' + enabled.join('、') + '」类型附件缩略图需由「增减/重建」模式「维护」生成。', 6000);
		}
		return;
	}
	// 提示「现有缩略图维护后清除」
	if (!confirm('取消 ' + disabled.join('、') + ' 类型后，对应缩略图将在维护后清除。是否继续？')) {
		// 用户取消：恢复勾选状态
		_syncEnabledTypesUI();
		return;
	}
	setEnabledTypes(types);
	// 立即全局清除被取消类型的缩略图（7.4 类型停用清除）
	const all = await fujian.getAllThumbnailsWithKeys();
	for (const { key, value } of all) {
		if (value && disabled.includes(value.originalType)) {
			try { await fujian.deleteThumbnail(key); } catch(e) {}
		}
	}
	_showToast('已清除 ' + disabled.join('、') + ' 类型缩略图。', 2500);
}

// 同步启用类型勾选 UI
function _syncEnabledTypesUI() {
	const types = new Set(getEnabledTypes());
	if (DOM.thumbTypeImage) DOM.thumbTypeImage.checked = types.has('image');
	if (DOM.thumbTypeVideo) DOM.thumbTypeVideo.checked = types.has('video');
	if (DOM.thumbTypeAudio) DOM.thumbTypeAudio.checked = types.has('audio');
}

// 同步手动维护模式 UI
function _syncManualModeUI() {
	const c = _currentAttachCase();
	const mode = getThumbManualMode();
	if (!DOM.thumbManualMode) return;
	// 清空现有选项
	DOM.thumbManualMode.innerHTML = '';
	const opts = [];
	if (c === 'A') {
		opts.push(['increment', '增减'], ['rebuild', '重建'], ['cleanup', '仅清理']);
	} else if (c === 'B') {
		opts.push(['increment', '增减'], ['cleanup', '仅清理']);
	} else {
		opts.push(['cleanup', '仅清理']);
	}
	for (const [v, t] of opts) {
		const o = document.createElement('option');
		o.value = v; o.textContent = t;
		DOM.thumbManualMode.appendChild(o);
	}
	// 选中当前值；若当前权限下不可用则降级显示「仅清理」，但不回写存储以保留用户设定
	let val = mode;
	if (!opts.some(o => o[0] === val)) val = 'cleanup';
	DOM.thumbManualMode.value = val;
}

// 同步自动维护模式 UI（B/C 权限下仅「仅清理」可选）
function _syncAutoModeUI() {
	const c = _currentAttachCase();
	const mode = getThumbAutoMode();
	if (!DOM.thumbAutoMode) return;
	DOM.thumbAutoMode.innerHTML = '';
	const opts = [];
	if (c === 'A') {
		opts.push(['increment', '增减'], ['rebuild', '重建'], ['cleanup', '仅清理']);
	} else {
		// B/C 权限下自动维护只有「仅清理」
		opts.push(['cleanup', '仅清理']);
	}
	for (const [v, t] of opts) {
		const o = document.createElement('option');
		o.value = v; o.textContent = t;
		DOM.thumbAutoMode.appendChild(o);
	}
	// 选中当前值；若当前权限下不可用则降级显示「仅清理」，但不回写存储以保留用户设定
	let val = mode;
	if (!opts.some(o => o[0] === val)) val = 'cleanup';
	DOM.thumbAutoMode.value = val;
	// 间隔日数输入
	if (DOM.thumbAutoInterval) {
		DOM.thumbAutoInterval.value = getThumbAutoInterval();
	}
}

async function _bijiExport() {
	const format = DOM.bijiExportFormat?.getAttribute('data-value') === '1' ? 'text' : 'json';
	const startSui = DOM.bijiExportStart?.value ? parseInt(DOM.bijiExportStart.value) : undefined;
	const endSui = DOM.bijiExportEnd?.value ? parseInt(DOM.bijiExportEnd.value) : undefined;
	const c = _currentAttachCase();
	const exportThumbs = c !== 'C' && DOM.bijiExportThumbs?.checked;
	const clearAfter = DOM.bijiExportClear?.checked;

	const ts = _bijiTimestamp();
	const ext = format === 'text' ? '.txt' : '.json';
	const mime = format === 'text' ? 'text/plain' : 'application/json';
	const noteFilename = '岁月历_导出笔记_' + ts + ext;

	// 缩略图 zip 打包（10.1）
	const assetsMap = _collectThumbKeysInRange(startSui, endSui, true);
	const thumbKeys = new Set(assetsMap.keys());
	const hasAssets = thumbKeys.size > 0;
	let zipFilename = null;
	if (exportThumbs && hasAssets) {
		try {
			const packResult = await fujian.packThumbnailsToZip(thumbKeys, assetsMap);
			if (packResult.blob) {
				zipFilename = '岁月历_缩略图_' + ts + '.zip';
				await _saveFile(packResult.blob, zipFilename, 'application/zip');
			} else if (packResult.missing > 0) {
				_showToast('提示：' + packResult.missing + ' 个缩略图未找到，已跳过。', 3000);
			}
		} catch(e) {
			if (e.name !== 'AbortError') _showToast('😿缩略图包导出失败：' + e.message);
			return;
		}
	}

	// 笔记文件
	const content = biji.exportAll(startSui, endSui, format, { thumbnailsZip: zipFilename });
	if (!content || content === '{}' || content === '') {
		_showToast('没有笔记数据可导出。');
		return;
	}
	try {
		await _saveFile(content, noteFilename, mime);
	} catch(e) {
		if (e.name !== 'AbortError') _showToast('😿导出失败：' + e.message);
		return;
	}

	// 导出后删除笔记（10.1）
	if (clearAfter) {
		_clearBijiInRange(startSui, endSui);
		renderBar7();
		renderCalendar();
		if (DOM.boPage.classList.contains('open')) _renderBijiOverview();
	}

	let msg = '笔记已导出';
	if (zipFilename) msg += '（含缩略图包）';
	if (clearAfter) msg += '，范围内笔记已删除';
	msg += '。';
	_showToast(msg, 5000);
}

function _bijiImport() {
	const mode = DOM.bijiImportModeToggle.getAttribute('data-value') === '1' ? 'replace' : 'merge';
	const input = document.createElement('input');
	input.type = 'file';
	input.accept = '.json,.txt,.zip';
	input.multiple = true;
	input.onchange = async () => {
		const files = Array.from(input.files || []);
		if (files.length === 0) return;
		if (files.length === 1) {
			// 单文件：保持原逻辑（带冲突对话框）
			_importBijiFile(files[0], mode);
			return;
		}
		// 多文件：分离笔记文件与 zip 文件（10.3）
		const noteFiles = [];
		const zipFiles = [];
		for (const f of files) {
			if (f.name.endsWith('.zip')) zipFiles.push(f);
			else noteFiles.push(f);
		}
		// 手动导入文件不询问也不执行从文件名识别分割节点（仅指定本地目录识别到旧数据时触发）
		noteFiles.sort((a, b) => a.name.localeCompare(b.name, 'zh'));
		if (mode === 'replace') {
			if (!confirm('⚠替换模式下多文件导入将先清空应用内笔记再依次合并，是否继续❓')) return;
			biji.clearAllBijiInStorage();
		}
		// 1. 读取所有笔记文件，合并为统一 mergedData（JSON 与 TXT 统一格式）
		const mergedData = {};
		let importedCount = 0;
		let parseErrors = [];
		let firstZipName = null;  // 收集笔记中记录的缩略图包名（取第一个）
		for (const f of noteFiles) {
			const text = await new Promise(resolve => {
				const reader = new FileReader();
				reader.onload = () => resolve(reader.result);
				reader.onerror = () => resolve(null);
				reader.readAsText(f);
			});
			if (!text) continue;
			importedCount++;
			const isText = f.name.endsWith('.txt') || !text.trimStart().startsWith('{');
			if (isText) {
				const parsed = biji.parseTextImport(text);
				if (parsed.errors.length > 0) parseErrors.push(...parsed.errors);
				if (!firstZipName && parsed.thumbnailsZip) firstZipName = parsed.thumbnailsZip;
				// 合并 parsed.data 到 mergedData（同 sui 同 hj 的笔记 concat）
				for (const sk of Object.keys(parsed.data)) {
					if (!mergedData[sk]) mergedData[sk] = {};
					for (const dk of Object.keys(parsed.data[sk])) {
						if (!mergedData[sk][dk]) mergedData[sk][dk] = [];
						mergedData[sk][dk] = mergedData[sk][dk].concat(parsed.data[sk][dk]);
					}
				}
			} else {
				try {
					const data = JSON.parse(text);
					if (!firstZipName && data.thumbnailsZip) firstZipName = data.thumbnailsZip;
					for (const k of Object.keys(data)) {
						if (!mergedData[k]) mergedData[k] = {};
						for (const dk of Object.keys(data[k])) {
							if (!mergedData[k][dk]) mergedData[k][dk] = [];
							mergedData[k][dk] = mergedData[k][dk].concat(data[k][dk]);
						}
					}
				} catch(e) {
					parseErrors.push({ line: 0, reason: f.name + '：JSON 解析失败' });
				}
			}
		}
		// 解析错误提示
		if (parseErrors.length > 0) {
			const errLines = parseErrors.slice(0, 10).map(e => e.line ? '第' + e.line + '行：' + e.reason : e.reason).join('\n');
			const more = parseErrors.length > 10 ? '\n...共' + parseErrors.length + '处错误' : '';
			_showToast('😿导入有错误：' + errLines + more, 5000);
		}
		// 2. 笔记导入（merge 模式接入冲突对话框，与单文件流程一致）
		if (Object.keys(mergedData).length > 0) {
			const parsed = { data: mergedData, errors: [], conflicts: [] };
			if (mode === 'replace') {
				biji.applyTextImport(parsed, []);
			} else {
				const conflicts = biji.detectConflicts(mergedData);
				if (conflicts.length > 0) {
					parsed.conflicts = conflicts;
					const confirmed = await _showBijiConflictDialog(parsed, true);
					if (!confirmed) {
						_showToast('已取消导入。');
						return;
					}
				} else {
					biji.applyTextImport(parsed, []);
				}
			}
		}
		// 3. 处理 zip 文件（10.3）
		let zipImported = 0;
		let zipSkipped = 0;
		let suppCount = 0;
		for (const f of zipFiles) {
			try {
				const r = await fujian.unpackThumbnailsZip(f);
				zipImported += r.imported;
				zipSkipped += r.skipped;
				// 使用 manifest 补全笔记中缺失的 assets 字段
				if (r.manifest) {
					const supp = biji.supplementAssetsFromManifest(r.manifest);
					suppCount += supp.supplemented;
				}
			} catch(e) {
				_showToast('😿缩略图包 ' + f.name + ' 导入失败：' + e.message);
			}
		}
		// 4. 最终 toast + UI 刷新
		let msg = '已导入 ' + importedCount + ' 个笔记文件';
		if (zipFiles.length > 0) msg += '，' + zipImported + ' 个缩略图' + (zipSkipped > 0 ? '（跳过 ' + zipSkipped + '）' : '');
		if (suppCount > 0) msg += '，补全 ' + suppCount + ' 个附件信息';
		msg += '。';
		_showToast(msg, 3000);
		renderBar7();
		renderCalendar();
		if (DOM.boPage.classList.contains('open')) _renderBijiOverview();
		// 未提供 zip 文件，且笔记中记录了缩略图包名时，提示用户后续可选路径
		if (zipFiles.length === 0 && firstZipName) {
			_notifyThumbnailsZipMissing(firstZipName);
		}
	};
	input.click();
}

function _importBijiFile(file, mode) {
	// zip 文件：直接解压写入 IDB（10.3）
	if (file.name.endsWith('.zip')) {
		_importThumbnailsZip(file);
		return;
	}
	const reader = new FileReader();
	reader.onload = async () => {
		const text = reader.result;
		const isText = file.name.endsWith('.txt') || !text.trimStart().startsWith('{');
		let zipName = null;
		if (isText) {
			// 解析一次，提取 zipName 后交由 _importTextBijiParsed 处理导入
			const parsed = biji.parseTextImport(text);
			zipName = parsed.thumbnailsZip;
			await _importTextBijiParsed(parsed, mode);
		} else {
			try {
				const incoming = JSON.parse(text);
				zipName = incoming.thumbnailsZip || null;
				await _importJsonBiji(text, mode);
			} catch(e) {}
		}
		// 笔记中记录了缩略图包名，但用户未同时提供 zip 文件时，提示用户后续可选路径
		if (zipName) {
			_notifyThumbnailsZipMissing(zipName);
		}
	};
	reader.readAsText(file);
}

// 导入缩略图 zip 包（10.3）
async function _importThumbnailsZip(file) {
	try {
		const result = await fujian.unpackThumbnailsZip(file);
		let msg = '已导入 ' + result.imported + ' 个缩略图';
		if (result.skipped > 0) msg += '，跳过 ' + result.skipped + ' 个';
		if (result.errors.length > 0) msg += '，' + result.errors.length + ' 个错误';
		// 使用 manifest 补全笔记中缺失的 assets 字段（thumbKey/size/mime/type）
		if (result.manifest) {
			const supp = biji.supplementAssetsFromManifest(result.manifest);
			if (supp.supplemented > 0) msg += '，补全 ' + supp.supplemented + ' 个附件信息';
		}
		msg += '。';
		_showToast(msg, 3000);
		renderBar7();
		if (DOM.boPage.classList.contains('open')) _renderBijiOverview();
	} catch(e) {
		_showToast('😿缩略图包导入失败：' + e.message);
	}
}

async function _importJsonBiji(text, mode) {
	let incoming;
	try { incoming = JSON.parse(text); } catch(e) {
		_showToast('😿导入失败：文件格式错误。');
		return;
	}
	// 提取缩略图包名（如有）
	const zipName = incoming.thumbnailsZip || null;
	if (mode === 'replace') {
		const ok = biji.importAll(text, 'replace');
		if (ok) {
			_showToast('笔记已替换导入。');
			renderBar7();
			renderCalendar();
		} else {
			_showToast('😿导入失败：文件格式错误。');
		}
		return;
	}
	const conflicts = biji.detectConflicts(incoming);
	if (conflicts.length > 0) {
		const parsed = { data: incoming, errors: [], conflicts };
		const confirmed = await _showBijiConflictDialog(parsed, true);
		if (confirmed) {
			_showToast('笔记已合并导入。');
			renderBar7();
			renderCalendar();
		} else {
			_showToast('已取消导入。');
			return;
		}
	} else {
		const ok = biji.importAll(text, 'merge');
		if (ok) {
			_showToast('笔记已合并导入。');
			renderBar7();
			renderCalendar();
		} else {
			_showToast('😿导入失败：文件格式错误。');
			return;
		}
	}
}

async function _importTextBijiParsed(parsed, mode) {
	if (parsed.errors.length > 0) {
		const errLines = parsed.errors.slice(0, 10).map(e => '第' + e.line + '行：' + e.reason).join('\n');
		const more = parsed.errors.length > 10 ? '\n...共' + parsed.errors.length + '处错误' : '';
		_showToast('😿导入有错误：' + errLines + more, 5000);
	}
	if (mode === 'replace') {
		for (const sk of Object.keys(parsed.data)) {
			try { localStorage.setItem(sk, JSON.stringify(parsed.data[sk])); } catch(e) {}
		}
		_showToast('笔记已替换导入。');
		renderBar7();
		renderCalendar();
		return;
	}
	// 用统一的 detectConflicts 替代 parseTextImport 内部检测，确保与 JSON 流程一致
	parsed.conflicts = biji.detectConflicts(parsed.data);
	if (parsed.conflicts.length > 0) {
		const confirmed = await _showBijiConflictDialog(parsed, false);
		if (confirmed) {
			_showToast('笔记已合并导入。');
			renderBar7();
			renderCalendar();
		} else {
			_showToast('已取消导入。');
			return;
		}
	} else {
		biji.applyTextImport(parsed, []);
		_showToast('笔记已合并导入。');
		renderBar7();
		renderCalendar();
	}
}

// 笔记中记录了缩略图包名但本次未导入时，提示用户后续可选路径
// 浏览器安全策略：confirm/input.click 之间隔了 await 会丢失用户激活，无法直接续起文件选择器
function _notifyThumbnailsZipMissing(zipName) {
	if (!zipName) return;
	_showToast('配套的缩略图包「' + zipName + '」尚未导入。可继续导入该压缩包，或在指定本地目录后通过「维护」重新生成缩略图。', 9000);
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
			resolvePromise(false);
		} else if (btn.dataset.action === 'confirm') {
			const finalResolutions = conflicts.map((c, i) => ({
				action: resolutions[i],
				importNote: c.importNote,
				sui: c.sui,
				dayKey: c.dayKey
			}));
			document.body.removeChild(overlay);
			biji.applyTextImport(parsed, finalResolutions);
			resolvePromise(true);
		}
	});

	let resolvePromise;
	return new Promise(resolve => { resolvePromise = resolve; });
}

function _checkBijiDraft() {
	if (!biji.hasDraft()) return;
	const draft = biji.loadDraft();
	if (!draft) return;
	const msg = '检测到未保存的草稿，是否恢复？';
	if (confirm(msg)) {
		_bijiEditState = {
			open: true, sui: state.currentSui, hj: draft.hj,
			idx: draft.idx, icon: draft.icon || biji.getBijiDefaultIcon(),
			created: draft.created || null, fullscreen: false, undoStack: [], draftTimer: null, debounceTimer: null,
			assets: Array.isArray(draft.assets) ? draft.assets.slice() : [], thumbBlobURLs: {}, thumbReleaseTimer: null
		};
		DOM.bijiTextarea.value = draft.biji;
		DOM.bijiEditIcon.textContent = _bijiEditState.icon;
		DOM.bijiEditCount.textContent = draft.biji.length + '/' + biji.BIJI_MAX_LEN;
		DOM.bijiEditDelete.style.display = draft.idx !== null ? '' : 'none';
		DOM.bijiEditor.classList.add('open');
		DOM.bijiEditorOverlay.classList.add('active');
		_navOnOpen();
		_updateBijiHint();
		_bijiClearThumbBar();
		_bijiRenderThumbBar();
		_refreshAttachButtonVisibility();
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
		// 触发 beforeinstallprompt 说明是完整 Chromium，支持 File System Access API
		if (window.showSaveFilePicker && !_hasFileSystemAccess) {
			_hasFileSystemAccess = true;
			_updateLsUI();
			_updateBijiHint();
		}
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
let _resizeDebounce = null;
window.addEventListener('resize', () => {
	if (_resizeDebounce) clearTimeout(_resizeDebounce);
	_resizeDebounce = setTimeout(() => {
		_resizeDebounce = null;
		_updateBar7Height();
		_updateAppScale();
	}, 200);
});

// 基于 #app 宽度 w 计算 --multi-WX = sqrt(w/412)，作为边距与文字横向拉伸的缩放倍数
// 修改斜率，取中间值，最终公式：y = a * x + (1 - a)
// 设在 :root 上，使 --safe-margin（定义于 :root）处的 var(--multi-WX) 能正确解析
function _updateAppScale() {
	const app = DOM.app;
	if (!app) return;
	const w = app.clientWidth;
	if (w <= 0) return;
	const m = w / 412;
	const wx = 0.5 * m + 0.5;
	document.documentElement.style.setProperty('--multi-WX', wx);
}
