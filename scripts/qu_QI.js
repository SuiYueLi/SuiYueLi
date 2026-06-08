/*
* Copyright (c) 2026 江俊
* 华夏岁月历 is licensed under Mulan PSL v2.
* You can use this software according to the terms and conditions of the Mulan PSL v2.
* You may obtain a copy of Mulan PSL v2 at:
*          http://license.coscl.org.cn/MulanPSL2
* THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND,
* EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT,
* MERCHANTABILITY OR FIT FOR A PARTICULAR PURPOSE.
* See the Mulan PSL v2 for more details.
*/

import { QI_jin } from '../assets/UT_4600_4800.js';
export {
	ensureDataForSuiPu,
	preloadHighFreq,
};
export default qu_QI;

//: ========== 气朔数据
const FILE_CONFIG = {
	'UT_-1300_1857': {
		path: '/assets/UT_-1300_1857.json',
		startYear: -1300,
		endYear: 1857,
		size: 1.7
	},
	'UT_1857_4600': {
		path: '/assets/UT_1857_4600.json',
		startYear: 1857,
		endYear: 4600,
		size: 1.7
	},
	'UT_4600_4800': {
		path: '/assets/UT_4600_4800.js',
		startYear: 4600,
		endYear: 4800,
		size: 0.14,
		data: QI_jin
	},
	'UT_4800_6602': {
		path: '/assets/UT_4800_6602.json',
		startYear: 4800,
		endYear: 6602,
		size: 1.0
	}
};

//: ========== 缓存管理
const rawCache = new Map();
const loadingPromises = new Map();

//: ========== 初始化：将 QI_jin 放入缓存
rawCache.set('UT_4600_4800', QI_jin);

//: ========== 辅助函数
function getFileIdByYear(nian) {
	if (nian >= -1300 && nian < 1857) return 'UT_-1300_1857';
	if (nian >= 1857 && nian < 4600) return 'UT_1857_4600';
	if (nian >= 4600 && nian < 4800) return 'UT_4600_4800';
	if (nian >= 4800 && nian <= 6602) return 'UT_4800_6602';
	throw new Error(`要求年份 ${nian} 超出数据范围 [-1300, 6602]`);
}

function calculateIndex(nian, fileId) {
	const config = FILE_CONFIG[fileId];
	return nian - config.startYear;
}

//: ========== 异步确保数据就绪
async function ensureDataForYear(nian) {
	const fileId = getFileIdByYear(nian);
	if (rawCache.has(fileId)) return;

	if (loadingPromises.has(fileId)) {
		await loadingPromises.get(fileId);
		return;
	}

	const promise = (async () => {
		const config = FILE_CONFIG[fileId];
		if (config.data) {
			rawCache.set(fileId, config.data);
			return;
		}
		const startTime = performance.now();
		const response = await fetch(config.path);
		if (!response.ok) throw new Error(`HTTP ${response.status}`);
		const data = await response.json();
		rawCache.set(fileId, data);
		const duration = (performance.now() - startTime).toFixed(0);
	})();

	loadingPromises.set(fileId, promise);
	try {
		await promise;
	} finally {
		loadingPromises.delete(fileId);
	}
}

async function ensureDataForSuiPu(nian) {
	const promises = [];
	for (let y = nian - 1; y <= nian + 2; y++) {
		if (y >= -1300 && y <= 6602) {
			promises.push(ensureDataForYear(y));
		}
	}
	await Promise.all(promises);
}

//: ========== 核心导出函数（同步读取缓存）

function qu_QI(nian, quantity = 1) {
	if (typeof nian !== 'number' || isNaN(nian)) {
		throw new Error(`参数 nian 必须是有效数字，收到: ${nian}`);
	}
	if (quantity < 1) {
		throw new Error(`quantity 必须 >= 1，收到: ${quantity}`);
	}
	if (nian < -1300 || (nian + quantity - 1) > 6602) {
		throw new Error(`要求的首尾年份超出范围 [-1300, 6602]`);
	}

	const results = [];

	for (let offset = 0; offset < quantity; offset++) {
		const currentYear = nian + offset;
		const fileId = getFileIdByYear(currentYear);
		const index = calculateIndex(currentYear, fileId);

		if (!rawCache.has(fileId)) {
			throw new Error(`数据 ${fileId} 未加载，请先调用 ensureDataForYear(${currentYear})`);
		}

		const rawArray = rawCache.get(fileId);
		const rawElement = rawArray[index];

		if (!rawElement) {
			throw new Error(`索引 ${index} 在文件 ${fileId} 中不存在`);
		}

		results.push(rawElement);
	}

	return quantity === 1 ? results[0] : results;
}

function preloadHighFreq() {
	const fileId = 'UT_1857_4600';
	if (rawCache.has(fileId) || loadingPromises.has(fileId)) return;
	ensureDataForYear(FILE_CONFIG[fileId].startYear).catch(() => {});
}
