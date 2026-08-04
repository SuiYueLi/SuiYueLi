// 附件功能核心模块：采样哈希、类型检测、缩略图生成、IDB CRUD、添加流程
// 详见 .Doc/笔记附件功能实现文档_修订.txt 第六章

import { openBijiIDB, THUMB_STORE_NAME } from './biji.js';
import { createZip, readZip } from './zip.js';

// ========== 常量 ==========
export const MAX_ATTACHMENTS = 30;

// 类型图标（6.1）
export const TYPE_ICON = {
	image:  '🖼️',
	video:  '🎬',
	audio:  '🔉',
	text:   '📝',
	other:  '📊',
};

// 缩略图尺寸（6.5）
const THUMB_SHORT = 72;        // 短边目标像素
const AUDIO_W = 128;
const AUDIO_H = 72;
const LONG_SHORT_RATIO = 16 / 9;  // 长短比超过此值时裁切长边（仅图片）

// 采样哈希参数（6.2）
const CHUNK_SIZE = 64 * 1024;          // 64KB
const SAMPLE_THRESHOLD = 3 * CHUNK_SIZE; // 192KB
const HASH_LEN = 12;                   // 截取前 12 位十六进制
const HASH_SUFFIX_MAX = 1000;          // 哈希冲突循环上限

// 文本附件预览上限（9.1）
export const TEXT_PREVIEW_MAX = 16 * 1024;

// 缩略图本地镜像后缀（3.3）
const THUMB_LOCAL_SUFFIX = '_s.webp';
const THUMB_LOCAL_DIR = '.thumbnails';

// ========== 类型检测（6.1）==========
const IMAGE_EXTS = ['jpg','jpeg','png','gif','webp','bmp','svg','avif','ico','tif','tiff'];
const VIDEO_EXTS = ['mp4','webm','ogv','mov','m4v','mkv','avi','3gp','flv'];
const AUDIO_EXTS = ['mp3','wav','ogg','oga','m4a','aac','flac','wma','opus','weba'];
const TEXT_EXTS  = ['txt','md','markdown','log','csv','tsv','json','xml','html','htm','css','js','ts','py','java','c','cpp','h','hpp','sh','yml','yaml','ini','conf','toml'];

function _extOf(fileName) {
	if (!fileName) return '';
	const idx = fileName.lastIndexOf('.');
	if (idx < 0) return '';
	return fileName.slice(idx + 1).toLowerCase();
}

// 按 mime 前缀 + 扩展名双判定，无法判定归 other
export function detectType(file) {
	const mime = (file.type || '').toLowerCase();
	const ext = _extOf(file.name);
	if (mime.startsWith('image/') || IMAGE_EXTS.includes(ext)) return 'image';
	if (mime.startsWith('video/') || VIDEO_EXTS.includes(ext)) return 'video';
	if (mime.startsWith('audio/') || AUDIO_EXTS.includes(ext)) return 'audio';
	if (mime.startsWith('text/') || mime.includes('json') || mime.includes('xml') || mime.includes('javascript') || TEXT_EXTS.includes(ext)) return 'text';
	return 'other';
}

// ========== 采样哈希（6.2）==========
// 对文件头 64KB + 中段 64KB + 尾 64KB 进行 SHA-1 计算
// 文件总大小 ≤ 192KB 时直接对整个文件计算
// 输出十六进制字符串截取前 12 位
// 非安全上下文（HTTP 非 localhost、file:// 等）下 crypto.subtle 不可用，
// 回退为 FNV-1a 变体简单哈希（安全性较低，但满足本地附件去重需求）
export async function computeSampleHash(file) {
	const size = file.size;
	let buf;
	if (size <= SAMPLE_THRESHOLD) {
		// 整个文件
		buf = await file.arrayBuffer();
	} else {
		const headEnd = CHUNK_SIZE;
		const midStart = Math.max(0, Math.floor((size - CHUNK_SIZE) / 2));
		const tailStart = size - CHUNK_SIZE;
		const headBuf = await file.slice(0, headEnd).arrayBuffer();
		const midBuf  = await file.slice(midStart, midStart + CHUNK_SIZE).arrayBuffer();
		const tailBuf = await file.slice(tailStart, size).arrayBuffer();
		const total = headBuf.byteLength + midBuf.byteLength + tailBuf.byteLength;
		const merged = new Uint8Array(total);
		let offset = 0;
		merged.set(new Uint8Array(headBuf), offset); offset += headBuf.byteLength;
		merged.set(new Uint8Array(midBuf),  offset); offset += midBuf.byteLength;
		merged.set(new Uint8Array(tailBuf), offset);
		buf = merged.buffer;
	}
	// 安全上下文：优先使用 SHA-1
	if (crypto?.subtle?.digest) {
		const digest = await crypto.subtle.digest('SHA-1', buf);
		const hex = Array.from(new Uint8Array(digest))
			.map(b => b.toString(16).padStart(2, '0'))
			.join('');
		return hex.slice(0, HASH_LEN);
	}
	// 非安全上下文回退：FNV-1a 变体，输出 48 位十六进制
	return _fnv1aHash(new Uint8Array(buf), size);
}

// FNV-1a 变体简单哈希（非安全上下文回退）
// 用两组不同初值/素数做两轮 FNV-1a，拼成 64 位，再补齐到 48 位十六进制
function _fnv1aHash(bytes, fileSize) {
	const PRIME = 0x01000193;
	let h1 = 0x811c9dc5;
	let h2 = 0x84222325;
	const len = bytes.length;
	// 步长采样：大文件避免全量遍历，最多扫描 64K 个字节
	const step = len > 65536 ? Math.floor(len / 65536) : 1;
	for (let i = 0; i < len; i += step) {
		h1 ^= bytes[i];
		h1 = Math.imul(h1, PRIME);
		h2 ^= bytes[i] ^ (i & 0xff);
		h2 = Math.imul(h2, 0x0021936b);
	}
	// 混入文件总大小降低碰撞
	h1 ^= fileSize & 0xffffffff;
	h1 = Math.imul(h1, PRIME);
	h2 ^= fileSize & 0xffffffff;
	h2 = Math.imul(h2, 0x0021936b);
	const hex1 = (h1 >>> 0).toString(16).padStart(8, '0');
	const hex2 = (h2 >>> 0).toString(16).padStart(8, '0');
	return (hex1 + hex2 + hex1).slice(0, HASH_LEN * 2).slice(0, HASH_LEN);
}

// ========== 哈希冲突处理（6.3）==========
// 返回 { key, suffix }；suffix 默认 0，冲突时追加 -1、-2…
export async function _resolveThumbKey(hash) {
	const exists = await getThumbnail(hash);
	if (!exists) return { key: hash, suffix: 0 };
	for (let i = 1; i <= HASH_SUFFIX_MAX; i++) {
		const key = hash + '-' + i;
		if (!(await getThumbnail(key))) return { key, suffix: i };
	}
	throw new Error('缩略图哈希冲突超过上限');
}

// ========== 缩略图生成（6.4 / 6.5）==========
// 入参：file, type。返回 { blob, originalType } 或 null
export async function generateThumbnail(file, type) {
	try {
		let result = null;
		if (type === 'image') result = await _generateImageThumb(file);
		else if (type === 'video') result = await _generateVideoThumb(file);
		else if (type === 'audio') result = await _generateAudioThumb(file);
		return result;
	} catch(e) {
		return null;
	}
}

// 计算等比缩放与裁剪参数
// cropLong=true（图片）：长边超过 16:9 时裁切
// cropLong=false（视频）：不裁切，仅等比缩放
function _drawScaled(sourceW, sourceH, shortTarget, cropLong) {
	const isWide = sourceW >= sourceH;
	const shortSrc = isWide ? sourceH : sourceW;
	const longSrc  = isWide ? sourceW : sourceH;
	const scale = shortTarget / shortSrc;
	let longTarget = longSrc * scale;
	let sx = 0, sy = 0, sw = sourceW, sh = sourceH;
	if (cropLong && longTarget / shortTarget > LONG_SHORT_RATIO) {
		longTarget = Math.round(shortTarget * LONG_SHORT_RATIO);
		const longSrcCropped = longTarget / scale;
		if (isWide) {
			sx = Math.floor((sourceW - longSrcCropped) / 2);
			sw = Math.round(longSrcCropped);
		} else {
			sy = Math.floor((sourceH - longSrcCropped) / 2);
			sh = Math.round(longSrcCropped);
		}
	}
	const w = Math.round(isWide ? longTarget : shortTarget);
	const h = Math.round(isWide ? shortTarget : longTarget);
	return { w, h, sx, sy, sw, sh };
}

// Canvas → Blob，优先 WebP 质量 0.75，不支持则降级 PNG
function _canvasToBlob(canvas) {
	return new Promise(resolve => {
		canvas.toBlob(blob => {
			if (blob) { resolve({ blob, type: 'image/webp' }); return; }
			// Safari 早期不支持 WebP 编码，降级 PNG
			canvas.toBlob(blob2 => {
				resolve(blob2 ? { blob: blob2, type: 'image/png' } : null);
			}, 'image/png');
		}, 'image/webp', 0.75);
	});
}

// 图片缩略图
async function _generateImageThumb(file) {
	const bitmap = await createImageBitmap(file);
	const { w, h, sx, sy, sw, sh } = _drawScaled(bitmap.width, bitmap.height, THUMB_SHORT, true);
	const canvas = document.createElement('canvas');
	canvas.width = w; canvas.height = h;
	const ctx = canvas.getContext('2d');
	ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, w, h);
	bitmap.close && bitmap.close();
	const r = await _canvasToBlob(canvas);
	return r ? { blob: r.blob, originalType: 'image' } : null;
}

// video seek Promise
function _seek(video, time) {
	return new Promise((resolve, reject) => {
		const onSeeked = () => { video.removeEventListener('seeked', onSeeked); resolve(); };
		video.addEventListener('seeked', onSeeked);
		video.currentTime = time;
		// 超时保护
		setTimeout(() => { video.removeEventListener('seeked', onSeeked); reject(new Error('seek timeout')); }, 5000);
	});
}

// 视频缩略图：取 1~3 帧，选字节数最大者
async function _generateVideoThumb(file) {
	const url = URL.createObjectURL(file);
	let result = null;
	try {
		const video = document.createElement('video');
		video.preload = 'metadata';
		video.muted = true;
		video.src = url;
		await new Promise((resolve, reject) => {
			video.addEventListener('loadedmetadata', resolve, { once: true });
			video.addEventListener('error', reject, { once: true });
			setTimeout(() => reject(new Error('metadata timeout')), 10000);
		});
		const dur = video.duration;
		let times;
		if (!isFinite(dur) || dur <= 0) {
			times = [0];
		} else if (dur < 30) {
			times = [dur * 0.1, dur * 0.5, dur * 0.9];
		} else {
			const start = dur * 0.2;
			times = [start, start + 12, start + 24].filter(t => t < dur);
			if (times.length === 0) times = [0];
		}
		let bestBlob = null;
		let bestSize = -1;
		for (const t of times) {
			try {
				await _seek(video, t);
				const { w, h } = _drawScaled(video.videoWidth, video.videoHeight, THUMB_SHORT, false);
				const canvas = document.createElement('canvas');
				canvas.width = w; canvas.height = h;
				const ctx = canvas.getContext('2d');
				ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight, 0, 0, w, h);
				const r = await _canvasToBlob(canvas);
				if (r && r.blob.size > bestSize) {
					bestBlob = r.blob; bestSize = r.blob.size;
				}
			} catch(e) { /* 单帧失败跳过 */ }
		}
		if (bestBlob) result = { blob: bestBlob, originalType: 'video' };
	} finally {
		URL.revokeObjectURL(url);
	}
	return result;
}

// 音频缩略图：波形图
async function _generateAudioThumb(file) {
	const arrayBuf = await file.arrayBuffer();
	const AudioCtx = window.AudioContext || window.webkitAudioContext;
	if (!AudioCtx) return null;
	const audioCtx = new AudioCtx();
	let audioBuf;
	try {
		audioBuf = await audioCtx.decodeAudioData(arrayBuf);
	} finally {
		audioCtx.close && audioCtx.close();
	}
	if (!audioBuf) return null;
	const channelData = audioBuf.getChannelData(0);
	const sampleRate = audioBuf.sampleRate;
	const totalDur = audioBuf.duration;
	// 截取策略：总时长不足 30 秒截取全部；否则从 20% 开始截取 24 秒
	let startSec, endSec;
	if (totalDur < 30) {
		startSec = 0; endSec = totalDur;
	} else {
		startSec = totalDur * 0.2;
		endSec = Math.min(startSec + 24, totalDur);
	}
	const startSample = Math.floor(startSec * sampleRate);
	const endSample = Math.floor(endSec * sampleRate);
	const segmentLen = endSample - startSample;
	if (segmentLen <= 0) return null;
	// 128 个采样点，每点取该段内最大绝对值
	const N = AUDIO_W;
	const samples = new Float32Array(N);
	const perPoint = segmentLen / N;
	for (let i = 0; i < N; i++) {
		const s = startSample + Math.floor(i * perPoint);
		const e = Math.min(startSample + Math.floor((i + 1) * perPoint), endSample);
		let max = 0;
		for (let j = s; j < e; j++) {
			const v = Math.abs(channelData[j]);
			if (v > max) max = v;
		}
		samples[i] = max;
	}
	// 画布 128×72，透明底，绿色波形，居中上下镜像填充
	const canvas = document.createElement('canvas');
	canvas.width = AUDIO_W; canvas.height = AUDIO_H;
	const ctx = canvas.getContext('2d');
	const mid = AUDIO_H / 2;
	ctx.fillStyle = '#22c55e';
	for (let i = 0; i < N; i++) {
		const h = Math.max(1, samples[i] * mid);
		const x = i;
		ctx.fillRect(x, mid - h, 1, h);
		ctx.fillRect(x, mid, 1, h);
	}
	const r = await _canvasToBlob(canvas);
	return r ? { blob: r.blob, originalType: 'audio' } : null;
}

// ========== IDB CRUD（3.2）==========
// value 结构：{ blob, originalType, originalName, originalSize, createdAt, lastUsed, hashSuffix }

async function _thumbTransaction(mode) {
	const db = await openBijiIDB();
	return db.transaction(THUMB_STORE_NAME, mode).objectStore(THUMB_STORE_NAME);
}

export async function getThumbnail(key) {
	const store = await _thumbTransaction('readonly');
	return new Promise((resolve, reject) => {
		const req = store.get(key);
		req.onsuccess = () => resolve(req.result || null);
		req.onerror = () => reject(req.error);
	});
}

export async function putThumbnail(key, value) {
	const store = await _thumbTransaction('readwrite');
	return new Promise((resolve, reject) => {
		const req = store.put(value, key);
		req.onsuccess = () => resolve();
		req.onerror = () => reject(req.error);
	});
}

export async function deleteThumbnail(key) {
	const store = await _thumbTransaction('readwrite');
	return new Promise((resolve, reject) => {
		const req = store.delete(key);
		req.onsuccess = () => resolve();
		req.onerror = () => reject(req.error);
	});
}

export async function getAllThumbnailKeys() {
	const store = await _thumbTransaction('readonly');
	return new Promise((resolve, reject) => {
		const req = store.getAllKeys();
		req.onsuccess = () => resolve(req.result || []);
		req.onerror = () => reject(req.error);
	});
}

export async function getAllThumbnails() {
	const store = await _thumbTransaction('readonly');
	return new Promise((resolve, reject) => {
		const req = store.getAll();
		req.onsuccess = () => resolve(req.result || []);
		req.onerror = () => reject(req.error);
	});
}

export async function getAllThumbnailsWithKeys() {
	const store = await _thumbTransaction('readonly');
	return new Promise((resolve, reject) => {
		const req = store.openCursor();
		const out = [];
		req.onsuccess = () => {
			const cur = req.result;
			if (cur) { out.push({ key: cur.key, value: cur.value }); cur.continue(); }
			else resolve(out);
		};
		req.onerror = () => reject(req.error);
	});
}

export async function clearAllThumbnails() {
	const store = await _thumbTransaction('readwrite');
	return new Promise((resolve, reject) => {
		const req = store.clear();
		req.onsuccess = () => resolve();
		req.onerror = () => reject(req.error);
	});
}

// 清除本地镜像目录（.thumbnails/）下所有文件（3.3，仅情况 A）
// dirHandle: 笔记根目录句柄
// 返回删除的文件数；失败返回 0
export async function clearLocalThumbnails(dirHandle) {
	if (!dirHandle) return 0;
	let thumbDir;
	try {
		thumbDir = await dirHandle.getDirectoryHandle(THUMB_LOCAL_DIR, { create: false });
	} catch(e) { return 0; }  // 目录不存在，无需清除
	let cleared = 0;
	for await (const [name, handle] of thumbDir.entries()) {
		if (handle.kind === 'file') {
			try { await thumbDir.removeEntry(name); cleared++; } catch(e) {}
		}
	}
	return cleared;
}

// 获取缩略图 blob URL（同时更新 lastUsed）
export async function getThumbnailBlobURL(key) {
	const value = await getThumbnail(key);
	if (!value || !value.blob) return null;
	// 更新 lastUsed（用于 LRU 清理）
	try {
		value.lastUsed = Date.now();
		await putThumbnail(key, value);
	} catch(e) {}
	return URL.createObjectURL(value.blob);
}

// ========== 添加附件流程（5.1）==========
// options: { path, name, fileHandle, enabledTypes }
//   path: 相对根目录的路径（"/" 分隔、结尾）
//   name: 文件名（含扩展名）
//   fileHandle: 情况 A 下的文件句柄（可选，透传返回）
//   enabledTypes: Set<'image'|'video'|'audio'>，启用的缩略图类型
// 返回 { asset, fileHandle }
//   asset: { type, path, name, size, mime, thumbKey }
export async function addAttachmentFlow(file, options) {
	const { path, name, fileHandle, enabledTypes } = options;
	const type = detectType(file);
	const size = file.size;
	const mime = file.type || '';
	const hash = await computeSampleHash(file);
	const { key: thumbKey, suffix: hashSuffix } = await _resolveThumbKey(hash);
	// 仅当类型启用时生成缩略图；停用时仍记录 thumbKey 作为唯一标识（6.7）
	if (enabledTypes && enabledTypes.has(type)) {
		const thumbResult = await generateThumbnail(file, type);
		if (thumbResult) {
			const value = {
				blob: thumbResult.blob,
				originalType: type,
				originalName: name,
				originalSize: size,
				createdAt: Date.now(),
				lastUsed: Date.now(),
				hashSuffix
			};
			await putThumbnail(thumbKey, value);
		}
		// 缩略图生成失败不影响附件添加，仅缩略图栏降级显示类型图标（6.6）
	}
	const asset = { type, path, name, size, mime, thumbKey };
	return { asset, fileHandle };
}

// ========== 本地镜像（3.3，仅情况 A）==========
// 在 dirHandle/.thumbnails/ 下写入 <thumbKey>_s.webp
// 失败抛错由调用方 toast 提示
export async function _syncThumbToLocal(thumbKey, blob, dirHandle) {
	if (!dirHandle) return;
	let thumbDir;
	try {
		thumbDir = await dirHandle.getDirectoryHandle(THUMB_LOCAL_DIR, { create: true });
	} catch(e) {
		throw new Error('无法访问缩略图目录');
	}
	const fileName = thumbKey + THUMB_LOCAL_SUFFIX;
	const fileHandle = await thumbDir.getFileHandle(fileName, { create: true });
	const writable = await fileHandle.createWritable();
	await writable.write(blob);
	await writable.close();
}

// 写入本地 manifest.json（assets 信息表）到 .thumbnails/ 目录
// assetsMap: Map<thumbKey, asset>，asset 结构: { type, name, path, size, mime, thumbKey }
export async function writeLocalManifest(dirHandle, assetsMap) {
	if (!dirHandle || !assetsMap) return;
	let thumbDir;
	try {
		thumbDir = await dirHandle.getDirectoryHandle(THUMB_LOCAL_DIR, { create: true });
	} catch(e) {
		throw new Error('无法访问缩略图目录');
	}
	const manifest = {};
	for (const [key, asset] of assetsMap) {
		manifest[key] = {
			type: asset.type || 'other',
			name: asset.name || '',
			path: asset.path || '',
			size: typeof asset.size === 'number' ? asset.size : 0,
			mime: asset.mime || ''
		};
	}
	const fileHandle = await thumbDir.getFileHandle('manifest.json', { create: true });
	const writable = await fileHandle.createWritable();
	await writable.write(JSON.stringify(manifest, null, 2));
	await writable.close();
}

// 读取本地 .thumbnails/manifest.json
// 返回 manifest 对象（thumbKey → { type, name, path, size, mime }）或 null
export async function readLocalManifest(dirHandle) {
	if (!dirHandle) return null;
	let thumbDir;
	try {
		thumbDir = await dirHandle.getDirectoryHandle(THUMB_LOCAL_DIR, { create: false });
	} catch(e) { return null; }  // 目录不存在
	let fileHandle;
	try {
		fileHandle = await thumbDir.getFileHandle('manifest.json', { create: false });
	} catch(e) { return null; }  // 文件不存在
	const file = await fileHandle.getFile();
	const text = await file.text();
	try {
		return JSON.parse(text);
	} catch(e) {
		return null;
	}
}

// 从本地 .thumbnails/ 目录导入缩略图文件到 IDB
// 仅导入 IDB 中不存在的 thumbKey（已存在则跳过）
// 返回 { imported: number, skipped: number, failed: number }
export async function importLocalThumbnails(dirHandle) {
	const result = { imported: 0, skipped: 0, failed: 0 };
	if (!dirHandle) return result;
	let thumbDir;
	try {
		thumbDir = await dirHandle.getDirectoryHandle(THUMB_LOCAL_DIR, { create: false });
	} catch(e) { return result; }  // 目录不存在
	for await (const [name, handle] of thumbDir.entries()) {
		if (handle.kind !== 'file') continue;
		if (name === 'manifest.json') continue;
		// 从文件名提取 thumbKey（去掉 _s.webp 后缀）
		if (!name.endsWith(THUMB_LOCAL_SUFFIX)) continue;
		const thumbKey = name.slice(0, name.length - THUMB_LOCAL_SUFFIX.length);
		// 校验 key 格式（哈希或哈希-N）
		if (!/^[0-9a-f]{12}(-\d+)?$/.test(thumbKey)) {
			result.skipped++;
			continue;
		}
		// 已存在则跳过
		const exists = await getThumbnail(thumbKey);
		if (exists) { result.skipped++; continue; }
		try {
			const file = await handle.getFile();
			const value = {
				blob: file,
				originalType: 'image',
				originalName: '',
				originalSize: file.size,
				createdAt: Date.now(),
				lastUsed: Date.now(),
				hashSuffix: 0
			};
			await putThumbnail(thumbKey, value);
			result.imported++;
		} catch(e) {
			result.failed++;
		}
	}
	return result;
}

// ========== 维护（第七章，阶段 4 填充）==========
// runMaintenance({ mode, usedThumbKeys, assetsMap, fileResolver, enabledTypes, disabledRanges, dirHandle, onProgress })
//   dirHandle: 情况 A 下的笔记根目录句柄，用于 rebuild 时清除本地镜像、生成时同步本地镜像
// 返回 { cleared, generated, failed, localCleared }
export async function runMaintenance(opts) {
	const { mode, usedThumbKeys, assetsMap, fileResolver, enabledTypes, disabledRanges, dirHandle, onProgress } = opts;
	const result = { cleared: 0, generated: 0, failed: 0, localCleared: 0 };

	if (mode === 'rebuild') {
		await clearAllThumbnails();
		// 同时清除本地镜像目录（.thumbnails/）下所有文件
		if (dirHandle) {
			result.localCleared = await clearLocalThumbnails(dirHandle);
		}
	} else if (mode === 'increment' || mode === 'cleanup') {
		// 清除未使用：删除 IDB 中 key 不在 usedThumbKeys 内的条目
		const all = await getAllThumbnailsWithKeys();
		for (const { key } of all) {
			if (!usedThumbKeys.has(key)) {
				await deleteThumbnail(key);
				result.cleared++;
				if (onProgress) onProgress({ phase: 'cleanup', cleared: result.cleared });
			}
		}
	}

	if (mode === 'rebuild' || mode === 'increment') {
		if (!fileResolver) {
			// 情况 B/C 无法重建或生成缺失
			return result;
		}
		const total = usedThumbKeys.size;
		let done = 0;
		for (const thumbKey of usedThumbKeys) {
			done++;
			const asset = assetsMap ? assetsMap.get(thumbKey) : null;
			if (!asset) { result.failed++; continue; }
			// 类型未启用：跳过（不视为 failed）
			if (enabledTypes && !enabledTypes.has(asset.type)) continue;
			// 停用区间：跳过（不视为 failed）
			if (disabledRanges && asset._sui !== undefined) {
				const inDisabled = disabledRanges.some(r => asset._sui >= r.start && asset._sui <= r.end);
				if (inDisabled) continue;
			}
			// increment 模式：已有记录则跳过生成（不验证 blob 完整性）
			if (mode === 'increment') {
				const exists = await getThumbnail(thumbKey);
				if (exists) continue;
			}
			try {
				const file = await fileResolver(asset);
				if (!file) { result.failed++; continue; }
				const thumbResult = await generateThumbnail(file, asset.type);
				if (thumbResult) {
					const value = {
						blob: thumbResult.blob,
						originalType: asset.type,
						originalName: asset.name,
						originalSize: asset.size,
						createdAt: Date.now(),
						lastUsed: Date.now(),
						hashSuffix: 0
					};
					await putThumbnail(thumbKey, value);
					// 情况 A：同步缩略图到本地镜像（3.3）
					if (dirHandle) {
						try { await _syncThumbToLocal(thumbKey, thumbResult.blob, dirHandle); }
						catch(e) { /* 本地镜像失败不影响维护结果 */ }
					}
					result.generated++;
				} else {
					result.failed++;
				}
			} catch(e) {
				result.failed++;
			}
			if (onProgress) onProgress({ phase: 'generate', total, done, generated: result.generated, failed: result.failed });
		}
	}

	return result;
}

// ========== 缩略图 zip 打包 / 解包（10.1 / 10.3）==========

// 从笔记数据结构中收集所有 thumbKey
// notesData: { "<hj>": [note, ...], ... } 或 [note, ...]
// 返回 Set<thumbKey>
export function collectThumbKeysFromNotes(notesData) {
	const keys = new Set();
	if (!notesData) return keys;
	const iter = Array.isArray(notesData) ? notesData : Object.values(notesData);
	for (const arr of iter) {
		if (!Array.isArray(arr)) continue;
		for (const n of arr) {
			if (!n || !Array.isArray(n.assets)) continue;
			for (const a of n.assets) {
				if (a && a.thumbKey) keys.add(a.thumbKey);
			}
		}
	}
	return keys;
}

// 打包缩略图为 zip
// thumbKeys: Iterable<thumbKey>
// assetsMap: 可选 Map<thumbKey, asset>，用于生成 manifest（assets 信息表）
//   asset 结构: { type, name, path, size, mime, thumbKey }
// 返回 { blob: Blob, count: number, missing: number, manifestCount: number }
export async function packThumbnailsToZip(thumbKeys, assetsMap) {
	const entries = [];
	let count = 0;
	let missing = 0;
	const manifest = {};
	for (const key of thumbKeys) {
		const value = await getThumbnail(key);
		if (!value || !value.blob) { missing++; continue; }
		// zip 内文件名：<thumbKey>.webp（保持原始 blob 类型，可能是 png）
		const ext = (value.originalType === 'image' && value.blob.type === 'image/png') ? 'png' : 'webp';
		entries.push({ name: key + '.' + ext, data: value.blob });
		// 构建 manifest 条目（优先使用 assetsMap，回退到 IDB value 中的元数据）
		const asset = assetsMap ? assetsMap.get(key) : null;
		if (asset) {
			manifest[key] = {
				type: asset.type || value.originalType || 'other',
				name: asset.name || value.originalName || '',
				path: asset.path || '',
				size: typeof asset.size === 'number' ? asset.size : (value.originalSize || 0),
				mime: asset.mime || ''
			};
		} else {
			manifest[key] = {
				type: value.originalType || 'image',
				name: value.originalName || '',
				path: '',
				size: value.originalSize || 0,
				mime: ''
			};
		}
		count++;
	}
	if (entries.length === 0) return { blob: null, count: 0, missing, manifestCount: 0 };
	// 附加 manifest.json（assets 信息表）
	entries.push({
		name: 'manifest.json',
		data: new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' })
	});
	const blob = await createZip(entries);
	return { blob, count, missing, manifestCount: count };
}

// 从 zip 解包缩略图并写入 IDB
// blob: Blob (zip 文件)
// 返回 { imported: number, skipped: number, errors: string[], manifest: object|null }
export async function unpackThumbnailsZip(blob) {
	const result = { imported: 0, skipped: 0, errors: [], manifest: null };
	let entries;
	try {
		entries = await readZip(blob);
	} catch(e) {
		result.errors.push('解压失败：' + e.message);
		return result;
	}
	// 先读取 manifest.json（assets 信息表）
	let manifest = null;
	const thumbEntries = [];
	for (const entry of entries) {
		if (entry.name === 'manifest.json') {
			try {
				const text = await (new Blob([entry.data], { type: 'application/json' })).text();
				manifest = JSON.parse(text);
			} catch(e) { /* manifest 损坏则忽略 */ }
			continue;
		}
		thumbEntries.push(entry);
	}
	result.manifest = manifest;
	for (const entry of thumbEntries) {
		if (!entry.data) { result.skipped++; continue; }
		// 从文件名提取 thumbKey（去掉扩展名）
		const dotIdx = entry.name.lastIndexOf('.');
		const key = dotIdx > 0 ? entry.name.slice(0, dotIdx) : entry.name;
		// 校验 key 格式（哈希或哈希-N）
		if (!/^[0-9a-f]{12}(-\d+)?$/.test(key)) {
			result.skipped++;
			continue;
		}
		// 检查是否已存在（已存在则跳过，避免覆盖更新的 lastUsed）
		const existing = await getThumbnail(key);
		if (existing) { result.skipped++; continue; }
		// 从 manifest 读取元数据，回退到文件扩展名推断
		const mf = manifest && manifest[key] ? manifest[key] : null;
		const ext = dotIdx > 0 ? entry.name.slice(dotIdx + 1).toLowerCase() : 'webp';
		const blobObj = new Blob([entry.data], { type: ext === 'png' ? 'image/png' : 'image/webp' });
		const value = {
			blob: blobObj,
			originalType: (mf && mf.type) || 'image',
			originalName: (mf && mf.name) || '',
			originalSize: (mf && typeof mf.size === 'number') ? mf.size : 0,
			createdAt: Date.now(),
			lastUsed: Date.now(),
			hashSuffix: 0
		};
		try {
			await putThumbnail(key, value);
			result.imported++;
		} catch(e) {
			result.errors.push(key + ': ' + e.message);
		}
	}
	return result;
}
