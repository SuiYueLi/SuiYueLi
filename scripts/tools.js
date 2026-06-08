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

import * as jl from "./JieLi.js";
import * as wc from "./westCal.js";
export {roArray, HJ_Jin, JL_Jin, D2HMS, showHMS, num2Han, lng2cha,
	findLastIndex, findLast, last, readFileAsText, readFileAsArrayBuffer};

// ========== 兼容工具（ES2022/2023 polyfill） ==========
function findLastIndex(arr, fn) {
	for (let i = arr.length - 1; i >= 0; i--) { if (fn(arr[i], i, arr)) return i; }
	return -1;
}
function findLast(arr, fn) {
	for (let i = arr.length - 1; i >= 0; i--) { if (fn(arr[i], i, arr)) return arr[i]; }
	return undefined;
}
function last(arr) { return arr[arr.length - 1]; }
function readFileAsText(file) {
	if (file.text) return file.text();
	return new Promise((resolve, reject) => {
		const r = new FileReader();
		r.onload = () => resolve(r.result);
		r.onerror = () => reject(r.error);
		r.readAsText(file);
	});
}
function readFileAsArrayBuffer(file) {
	if (file.arrayBuffer) return file.arrayBuffer();
	return new Promise((resolve, reject) => {
		const r = new FileReader();
		r.onload = () => resolve(r.result);
		r.onerror = () => reject(r.error);
		r.readAsArrayBuffer(file);
	});
}

//: 数组循环移位函数；向右（后移）为正
function roArray(arr, steps) {
	let n = -steps % arr.length;
	let newArr = arr.slice(n).concat(arr.slice(0, n));
	return JSON.parse(JSON.stringify(newArr));
}

function nowDate(zero = false) {
//: 传入布尔值决定是否添加前置0
	let date = new Date();
	let obj = {
		YMD: {
			Y: date.getFullYear(),
			M: date.getMonth() + 1,
			D: date.getDate()
		},
		HMS: {
			H: date.getHours(),
			M: date.getMinutes(),
			S: date.getSeconds()
		}
	};
	if (zero) {
		for (const group of Object.values(obj)) {
			for (const k of Object.keys(group)) {
				if (group[k] < 10) group[k] = `0${group[k]}`;
			}
		}
	}

	obj.Week = date.getDay();
	return obj;
}

//: 【获取系统时间，转换今日积日】
function HJ_Jin() {
	let {Y, M, D} = nowDate().YMD;
	return wc.wYMD2MJD(Y, M, D, 1);
}

//: 【获取系统时间，转换今日节历日期】
function JL_Jin() {
	let HJ = HJ_Jin();
	return jl.HJvSJRSh(HJ).SJR;
}

//: 实数日转时分秒，jibie 传入日内时间级别，0～3 对应 日时分秒
function D2HMS(ri, jibie = 3) {
	const shi_ji = [0, 2, 3];
	if (!shi_ji.includes(jibie)) throw new Error("要求时间级别有误！");
	let h = 0, m = 0;
	let d = Math.floor(ri);
	let xd = ri - d;
	if(jibie == 0) {
		return {D: d};
	}

	let mm = xd * 1440;
	if(jibie == 2) {
		m = Math.round(mm);
		if(m >= 1440) {
			d++;
			m = 0;
		}
		h = Math.floor(m / 60);
		m -= h * 60;
		return {
			D: d,
			H: h,
			M: m
		};
	}

	let s = xd * 86400;
	let n = Math.round(s);
	if (n == 86400) {
		d++;
		s = 0;
		n = 0;
	}
	else s = n % 60;
	n -= s;
	n /= 60;
	m = n % 60;
	n -= m;
	h = n / 60;
	return {
		D: d,
		H: h,
		M: m,
		S: s
	};
//: 时分秒总是输出正的整数即时钟值
}

//: 将时分秒对象格式化为时间字符串
function showHMS(t, shi = 24, zero = true) {
	if (t == null || t == undefined || Object.keys(t).length === 0) {
		return "";
	}
	let { H, M, S } = t;
	if (shi !== 12 && shi !== 24) {
		throw new Error("小时制参数 shi 必须为 12 或 24");
	}
	let suffix = "";
	if (shi === 12) {
		suffix = H >= 12 ? "pm" : "am";
		H = H % 12;
		if (H === 0) {
			H = 12;
		}
	}

	const pad = (num, isHour = false) => {
		if (num === undefined || num === null) return "00";
		if (isHour && !zero) {
			return num.toString();
		}
		return num.toString().padStart(2, "0");
	};

	const hasSeconds = S !== undefined && S !== null;
	let timeStr;
	if (hasSeconds) {
		timeStr = `${pad(H, true)}:${pad(M)}:${pad(S)}`;
	} else {
		timeStr = `${pad(H, true)}:${pad(M)}`;
	}

	return shi === 12 ? `${timeStr} ${suffix}` : timeStr;
}

function num2Han(num) {
	if(typeof num !== "number" || isNaN(num)) throw new Error("输入不是数字！");
	if(num === 0) return "零";
	const isNegative = num < 0;
	const absNum = Math.abs(num);
	const parts = absNum.toString().split(".");
	const integerPart = +parts[0];
	const decimalPart = parts[1] || "";
	const integerChinese = int2Han(integerPart);

	let decimalChinese = "";
	if(decimalPart) {
		const digits = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
		decimalChinese = "点";
		for (let i = 0; i < decimalPart.length; i++) {
			const digit = parseInt(decimalPart[i]);
			decimalChinese += digits[digit];
		}
	}

	let result = integerChinese + decimalChinese;
	if(isNegative) {
		result = "负" + result;
	}
	return result;
}

function int2Han(num) {
	if(typeof num !== "number" || isNaN(num)) throw new Error("输入不是数字！");
	if(!Number.isInteger(num)) num = parseInt(num);
	if(num === 0) return "零";
	const digits = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
	const units = ["", "十", "百", "千"];
	const bigUnits = ["", "万", "亿", "兆", "万兆", "亿兆", "兆兆"];
	let neg = "";
	if(num < 0) {
		neg = "负";
		num = -num;
	}
	let str = String(num);
	const len = str.length;
	if(len > 24) throw new Error("输入数字超过兆兆！");
	let result = "";
	let prevZero = false;

	for (let i = 0; i < len; i++) {
		const digit = parseInt(str[i]);
		const pos = len - i - 1;
		const sectionPos = pos % 4;
		const sectionUnit = bigUnits[Math.floor(pos / 4)];
		if (digit === 0) {
			//: 零的处理：只有在非节尾且前一位非零且后面还有非零数字时才添加"零"
			if (!prevZero && sectionPos !== 0) {
				let hasNonZeroAfter = false;
				for (let j = i + 1; j < len; j++) {
					if (str[j] !== "0") {
						hasNonZeroAfter = true;
						break;
					}
				}
				if (hasNonZeroAfter) {
					result += "零";
					prevZero = true;
				}
			}
		} else {
			const digitChar = digits[digit];
			//: 特殊处理"一十"省略"一"
			if (digit === 1 && sectionPos === 1) {
				if (result.length === 0) {
					result += units[sectionPos];
				} else {
					const lastChar = result.charAt(result.length - 1);
					if (result.length === 0 || bigUnits.includes(lastChar)) {
						result += units[sectionPos];
					} else {
						result += digitChar + units[sectionPos];
					}
				}
			} else {
				result += digitChar + units[sectionPos];
			}
			prevZero = false;
		}
		//: 处理节单位 (万, 亿等)
		if (sectionPos === 0) {
			const sectionStart = Math.max(0, i - 3);
			const sectionDigits = str.slice(sectionStart, i + 1);
			const isSectionAllZero = /^0+$/.test(sectionDigits);
			//: 全零的节单位不读
			if (!isSectionAllZero) {
				if (pos >= 4) {
					result += sectionUnit;
					prevZero = false;
				}
			}
		}
	}

	if (result.endsWith("零")) {
		result = result.slice(0, -1);
	}

	return neg + result;
}

//: 经度差转时差
function lng2cha(lng) {
	let cha = (lng - 120) / 360;
	let hms = D2HMS(Math.abs(cha), 3);
	let sign = cha >= 0 ? '+' : '-';
	return {
		day: cha,
		hms: {
			sign: sign,
			H: hms.H,
			M: hms.M,
			S: hms.S
		}
	};
}

