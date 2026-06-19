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

//: 华夏岁月历之节历
import {roArray, D2HMS} from "./tools.js";
export {HJ_ShvZh, jJieYue, SJRvHJ, HJvSJRSh};

//: 【季节纪】
const JJJ = {
	guJ: [3100, 1300, -500, -2300],
	//: 0仲冬纪、-1孟冬纪、-2季秋纪、-3仲秋纪
	laiJ: [4700, 6600, 8300],
	//: 0仲冬纪、1季冬纪、2孟春纪
	guRunZh: [300], //: 往古向大闰周改换点，索引0最近
	laiRunZh: [5500, 7500], //: 未来向大闰周改换点，索引0最近
	jiARun: [6600], //: 大闰周加闰的整百年
	RunC: 4700,
	RunC_HJ: 1935464 + 366,
	Jie12L: [30, 30, 31, 31, 32, 31, 31, 30, 30, 30, 29, 30], //: 轮转月长
	Jie12G: [31, 31, 31, 31, 31, 30, 30, 30, 30, 30, 30, 30], //: 固定月长
};

//: 花积完全数字形式转甲子周余数形式
function HJ_ShvZh(hj) {
	let zheng = hj, xiao = 0;
	if(!Number.isInteger(hj)) {
		zheng = Math.floor(hj);
		xiao = (hj * 10**9 - zheng * 10**9) / 10 ** 9;
	}
	let JZ = Math.floor(zheng / 60);
	let Yu = zheng - JZ * 60 + xiao;
	return [JZ, Yu];
}

//: 求岁首花积
function jSuiShou(nian) {
	let nxx = nian - (JJJ.RunC + 1);
	let RunRi = 0;

	//: 先计算整百年还闰、加闰数
	if (nian <= JJJ.guRunZh[0]) { //: 往古向远端，组合式闰周
		RunRi = Math.floor((JJJ.guRunZh[0] - JJJ.RunC) / 400);
		let nn = nian - (JJJ.guRunZh[0] + 1);
		if (nn < 0) RunRi += -1;
		for (; nn < -300;) {
			if (nn < -300) RunRi += -1;
			nn -= -300;
			if (nn < -300) RunRi += -1;
			nn -= -300;
			if (nn < -400) RunRi += -1;
			nn -= -400;
		}
	}
	else if (nian <= JJJ.laiRunZh[0]) { //: 400年大闰周段
		RunRi = Math.floor(nxx / 400);
	}
	else if (nian <= JJJ.laiRunZh[1]) { //: 500年大闰周段，有加闰
		RunRi = Math.floor((JJJ.laiRunZh[0] - JJJ.RunC) / 400);
		let nn = nian - (JJJ.laiRunZh[0] + 1);
		RunRi += Math.floor(nn / 500);
		if (nian > JJJ.jiARun[0]) RunRi += 1;
	}
	else { //: 未来向远端，600年大闰周
		RunRi = Math.floor((JJJ.laiRunZh[0] - JJJ.RunC) / 400);
		RunRi += Math.floor((JJJ.laiRunZh[1] - JJJ.laiRunZh[0]) / 500);
		RunRi += JJJ.jiARun.length;
		let nn = nian - (JJJ.laiRunZh[1] + 1);
		RunRi += Math.floor(nn / 600);
	}

	RunRi += Math.floor(nxx / 4) - Math.floor(nxx / 100);

	let HJ_Shu = 365 * nxx + RunRi + JJJ.RunC_HJ;
	return HJ_Shu;
}

//: 判断闰年
function jRunF(nian) {
	let nxx = nian - JJJ.RunC;
	let RunF = false;

	if (nxx % 4 === 0) {
		if (nxx % 100 === 0) {
			if (nian <= JJJ.guRunZh[0]) { //: 往古向远端
				let nn = nian - JJJ.guRunZh[0];
				for (; nn <= 0;) {
					if (nn === 0) RunF = true;
					if (nn === -300) RunF = true;
					if (nn === -600) RunF = true;
					if (nn === -1000) RunF = true;
					nn -= -1000;
				}
			}
			else if (nian <= JJJ.laiRunZh[0]) { //: 400年大闰周
				if (nxx % 400 === 0) RunF = true;
			}
			else if (nian <= JJJ.laiRunZh[1]) { //: 500年大闰周，有加闰
				let nn = nian - JJJ.laiRunZh[0];
				if (nn % 500 === 0) RunF = true;
				else if (JJJ.jiARun.includes(nian)) RunF = true;
			}
			else { //: 未来向远端
				let nn = nian - JJJ.laiRunZh[1];
				if (nn % 600 === 0) RunF = true;
			}
		}
		else RunF = true;
	}
	return RunF;
}

//: 判断季节纪段落归属
function jJJJd(nian) {
	let JJJd = 0; //: 0 = 仲冬纪
	let nChao = true;

	if (nian <= JJJ.guJ[0]) {
		if ((nian === JJJ.guJ[JJJ.guJ.length - 1]) || (nian === JJJ.guJ[JJJ.guJ.length - 1] - 1)) {
		//: 有效范围涵盖至往古向的端点加一年
			JJJd = -JJJ.guJ.length;
			nChao = false;
		}
		for (let i = 1; i < (JJJ.guJ.length); i++) {
			if (nian > JJJ.guJ[i]) {
				JJJd = -i;
				nChao = false;
				break;
			}
		}
	}
	else if (nian > JJJ.laiJ[0]) {
		if (nian === JJJ.laiJ[JJJ.laiJ.length - 1] + 1) {
		//: 有效范围涵盖至未来向的端点加一年
			JJJd = JJJ.laiJ.length;
			nChao = false;
		}
		for (let i = 1; i < (JJJ.laiJ.length); i++) {
			if (nian <= JJJ.laiJ[i]) {
				JJJd = i;
				nChao = false;
				break;
			}
		}
	}
	else nChao = false;

	if (nChao) throw new Error("年份超出范围！");

	return JJJd;
}

//: 12节 日数、节首
function jJieYue(nian) {
	let JJJd = jJJJd(nian);
	let RiShu = [0];
	let RunJY = 0;
	let lunJ12 = roArray(JJJ.Jie12L, JJJd);
	if (JJJd < -1) { //: 季秋纪及往古用固定月长，孟冬纪开始轮转月长
		RiShu = RiShu.concat(JJJ.Jie12G);
		RunJY = 12;
	}
	else {
		RiShu = RiShu.concat(lunJ12);
		RunJY = ((JJJd + 11) % 12 + 11) % 12 + 1; //: 闰节序号/索引号，1～12
	}

	let RunF = jRunF(nian);
	if(RunF) {
		RiShu[0] = RunJY;
		RiShu[RunJY] += 1;
	}

	let JY12_HJ = HJ_ShvZh(jSuiShou(nian));
	for(let i = 2; i <= 13; i++) JY12_HJ[i] = JY12_HJ[i - 1] + RiShu[i - 1];

	let JY12_Yao = [RunJY];
	let yao_ssh = (((JY12_HJ[0] * 60) % 7) + 7 + 3) % 7;
	for(let i = 1; i <= 13; i++) JY12_Yao[i] = (yao_ssh + JY12_HJ[i]) % 7;

	return {
		RunF,
		RiShu, //: 索引0为闰节序号（平年为0），索引1～12为1～12节之日数
		HJ: JY12_HJ, //: 索引0为岁首甲子周数，索引1～13为1～13节节首的余数（13节即次年1节）
		Yao: JY12_Yao, //: 索引0冗余，存为闰节序号（平年不为0），索引1～13为1～13节节首星曜
	};
}

//: 季节历岁月日转花积
function SJRvHJ(Nian, YY = 1, RR = 1, shu = 1) {
	const geshi = [-1, 0, 1, 2];
	if (!geshi.includes(shu)) {
		throw new Error("输出参数取值必须是 -1、 0、 1、 2 之一！");
	}

	let n = +Nian, y = +YY, r = +RR;
	let JY12 = jJieYue(n).HJ;
	let hj = JY12[0] * 60 + JY12[y] + (r - 1);
	if (shu === 1) return hj;
	else if (shu === 2) return HJ_ShvZh(hj);
	else {
		let mjd = hj - 1882790;
		if (shu === 0) return mjd;
		else return mjd + 2400000.5;
	}
}

//: 花积转季节历岁月日；jibie 为保留时间级别，0、2、3 对应 日、分、秒
function HJvSJRSh(hj, jibie = 0) {
	let j, t;
	if(jibie === 0) j = Math.floor(hj);
	else if(Number.isInteger(hj)) {
		t = jibie === 2 ? {H : 0, M : 0}
			: jibie === 3 ? {H : 0, M : 0, S : 0}
			: {};
		j = hj;
	}
	else {
		t = D2HMS(hj, jibie);
		j = t.D;
		delete t.D;
	}

	let caiN = JJJ.RunC + 1;
	let caiN_SSh = JJJ.RunC_HJ;
	let max = Math.floor((j - caiN_SSh) / 365);
	if (max < 0) {
		caiN += max;
		caiN_SSh = jSuiShou(caiN);
		max = Math.floor((j - caiN_SSh) / 365);
	}

	if (max > 0) {
		for (; j - caiN_SSh >= 365;) {
			let min = Math.floor((j - caiN_SSh) / 366);
			caiN += min;
			if (j < jSuiShou(caiN + 1)) break;
			else caiN++;
			caiN_SSh = jSuiShou(caiN);
		}
	}

	let jy12 = jJieYue(caiN).HJ;
	let m = 1, d = 0;
	let jYu = j - jy12[0] * 60;
	let n = jYu - jy12[1]; //: 这里用重新计算的岁首（月首），避开了前面可能在break时与caiN不同步的caiN_SSh
	if (n > 0) {
		m = Math.floor(n / 32) + 1;
		for (; m < 13; m++) {
			if (jy12[m + 1] > jYu) break;
		}
		if (m > 12) throw new Error("转换月份出错了！");
		d = jYu - jy12[m];
	}

	let result = {
		SJR: {
			S: caiN,
			J: m,
			R: d + 1
		}
	};
	if(t) result.Shi = t;
	return result;
}

