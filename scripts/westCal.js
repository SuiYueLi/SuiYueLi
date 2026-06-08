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

import {D2HMS} from "./tools.js";
import {HJ_ShvZh} from "./JieLi.js";
export {wMonthsHJ, wYMD2MJD, MJD2wYMDT};

//: 计算西历年年首即1月1日0时简化儒略日数
function wY2MJD(year) {
	let leapD = 0;
	let yx = year - 2001;
	let yy = year - 1581;
	let days = 0;

	if (year > 1582) {
		leapD = Math.floor(yx / 4) - Math.floor(yx / 100) + Math.floor(yx / 400);
	}
	else {
		leapD = -102 + Math.floor(yy / 4);
		days += 10;
	}

	days += yx * 365 + leapD + 51910;
	return days;
}

//: 计算西历年是否为闰年
function wYLeap(year) {
	let lp = false;
	if (!Number.isInteger(year)) throw new Error("需要整数年份！");

	if (year % 4 === 0) {
		if (year > 1582) {
			if (year % 100 === 0) {
				if (year % 400 === 0) lp = true;
				else lp = false;
			}
			else lp = true;
		}
		else lp = true;
	}
	return lp;
}

//: 西历年12个月日数、月首
function wMonths(year) {
	if (year === 1582) return {
		Days: [0,
			31, 28, 31, 30, 31, 30,
			31, 31, 30, 21, 30, 31],
		MJD: [-101117,
			0, 31, 59, 90, 120, 151,
			181, 212, 243, 273, 294, 324,
			355],
		WkNo: [NaN, 1, 4, 4, 0, 2, 5, 0, 3, 6, 1, 1, 3],
	}
	let islp = wYLeap(year);
	let lp = islp ? 1 : 0;
	let mjd = wY2MJD(year);
	let wM12_MJD = [mjd,
		0, 31, 59 + lp, 90 + lp, 120 + lp, 151 + lp,
		181 + lp, 212 + lp, 243 + lp, 273 + lp, 304 + lp, 334 + lp,
		365 + lp];
	let wn_yh = ((mjd % 7) + 10) % 7;
	let wM12_WkNo = [wn_yh];
	for(let i = 1; i <= 13; i++) {
		wM12_WkNo[i] = (wn_yh + wM12_MJD[i]) % 7;
	}
	return {
		Days: [islp,
			31, 28 + lp, 31, 30, 31, 30,
			31, 31, 30, 31, 30, 31],
		MJD: wM12_MJD,
		WkNo: wM12_WkNo,
	};
}

//: 西历年12个月月首花积
function wMonthsHJ(year) {
	let mHJ = wMonths(year).MJD;
	mHJ[0] += 1882790;
	let wMth_HJ = [];
	for(let i = 0; i < 12; i++) wMth_HJ[i] = mHJ[0] + mHJ[i + 1];
	return wMth_HJ;
}

//: 西历年月日转简化儒略日/花积，只传入年时等同于wY2MJD()
function wYMD2MJD(YYYY, MM = 1, DD = 1, shu = 0) {
	const shuIn = [-1, 0, 1, 2];
	if (!shuIn.includes(shu)) {
		throw new Error("shu 参数取值必须是 -1, 0, 1, 2 之一！");
	}
	let y = +YYYY, m = +MM, d = +DD;
	let m2yh = wMonths(y).MJD;
	if ((y == 1582) && (m == 10) && (d > 4)) d -= 10;
	let mjd = wY2MJD(y) + m2yh[m] + (d - 1);
	if (shu == 0) return mjd;
	else if (shu == -1) {
		return mjd + 2400000.5;
	}
	else {
		let hj = mjd + 1882790;
		if (shu == 1) return hj;
		else return HJ_ShvZh(hj);
	}
}

//: 简化儒略日转西历日期，jibie 为保留时间级别，0、2、3 对应 日、分、秒
function MJD2wYMDT(mjd, jibie = 0) {
	let j, t;
	if(jibie === 0) j = Math.floor(mjd);
	else if(Number.isInteger(mjd)) {
		t = jibie === 2 ? {H : 0, M : 0}
			: jibie === 3 ? {H : 0, M : 0, S : 0}
			: {};
		j = mjd;
	}
	else {
		t = D2HMS(mjd, jibie);
		j = t.D;
		delete t.D;
	}

	let d = 0;
	let gY = 1582;
	let gYHd = -101117;
	if ((j < -101117) || (j >= -100762)) {
		if (j < -101117) {
			gY = 0;
			gYHd = -678943;
		}
		else {
			gY = 1583;
			gYHd = -100762;
		}
		let max = Math.floor((j - gYHd) / 365);
		if (max < 0) {
			gY += max;
			gYHd = wY2MJD(gY);
			max = Math.floor((j - gYHd) / 365);
		}
		if (max > 0) {
			for (; gYHd < j;) {
				let min = Math.floor((j - gYHd) / 366);
				gY += min;
				if (j < wY2MJD(gY + 1)) break;
				else gY++;
				gYHd = wY2MJD(gY);
			}
		}
	}
	else {
		if ((j >= -100840) && (j < -100823)) d += 10;
	}

	let m2yh = wMonths(gY).MJD;
	let m = 1;
	let n = j - gYHd;
	if (n > 0) {
		m = Math.floor(n / 31) + 1;
		for (; m < 13; m++) {
			if (m2yh[m + 1] > n) break;
		}
		d = n - m2yh[m];
	}

	let result = {
		YMD: {
			Y: gY,
			M: m,
			D: d + 1
		}
	};
	if(t) result.Time = t;
	return result;
}

