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

import * as cfg from "../config.js";
import * as tl from "./tools.js";
import {findLastIndex, findLast, last} from "./tools.js";
import {MING} from "./ming.js";
import * as jl from "./JieLi.js";
import * as al from "./XiaLi.js";
import * as wc from "./westCal.js";
import qu_QI from "./qu_QI.js";

//: 【季节历整岁星曜周表】
//: 前后各增补一至七日至周日，兼容周起始为周日/周一
function Sui_Biao(nian) {
	let SBiao = [];
	let Jie_sy = [0];
	let ig_jy_ri = jl.jJieYue(nian - 1).RiShu;
	let jy = jl.jJieYue(nian);
	
	let qian = jy.Yao[1];
	if(qian === 0) qian = 7;
	for(let i = 0; i < qian; i++) {
		SBiao[i] = {
			JL: [12, ig_jy_ri[12] - (qian - 1) + i],
		};
	}
	if(qian === 7) SBiao[0].JRi = 0;
	
	let jsh_sy = qian;
	for(let j = 1; j <= 12; j++) {
		Jie_sy[j] = jsh_sy;
		for(let i = 0; i < jy.RiShu[j]; i++) {
			SBiao[i + jsh_sy] = {
				JL: [j, i + 1],
			};
		}
		jsh_sy += jy.RiShu[j];
	}
	
	let hou = 7 - (jy.Yao[13] + 6) % 7;
	for(let i = 0; i < hou; i++) {
		SBiao[i + jsh_sy] = {
			JL: [1, i + 1],
		};
	}
	if(hou === 7) SBiao[SBiao.length - 1].JL[1] = 0;
	
	Jie_sy[13] = jsh_sy;
	let Biao0_HJ = jy.HJ[0] * 60 + jy.HJ[1] - qian;
	
	let nn = ((nian - 1) % 60 + 60) % 60;
	let Sui_GZh = [MING.Gan[nn % 10] + MING.Zhi[nn % 12], MING.ShX[nn % 12]];
	let gan = MING.Gan.concat(MING.Gan.concat(MING.Gan));
	let lun = (((nian - 1) % 5 + 5) % 5) * 2;
	let sgan = gan.slice(lun + 2, lun + 14);
	let Jie_GZh = [, "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥", "子", "丑"]; //: 索引0空置
	for(let i = 1; i <= 12; i++) Jie_GZh[i] = sgan[i - 1] + Jie_GZh[i];

	return {
		Biao0_HJ,
		Sui_GZh,
		RunF: jy.RunF,
		Jie_GZh,
		Jie_sy,
			//: Jie_sy[1～13]为各节首（含下年1节）在SBiao中的索引号
		SBiao,

	};
}

//: 【一岁历谱表】
function SuiPu(nian) {
	if(typeof nian !== "number" || isNaN(nian)) throw new Error("纪年需输入数字！");
	nian = Math.floor(nian);
	if((nian < -1300) || (nian > 6600)) {
		throw new Error("输入纪年数超出本历法当前有效范围！");
	}
	let {
		Biao0_HJ,
		Sui_GZh,
		RunF,
		Jie_GZh,
		Jie_sy,
		SBiao
	} = Sui_Biao(nian);
	let SShou_sy = Jie_sy[1], SWei_sy = Jie_sy[13];
	let SShou_HJ = Biao0_HJ + Jie_sy[1], SWei_HJ = Biao0_HJ + Jie_sy[13];

	let {
		LVI_Zi, //: 历准时名称
		JQ, //: 节气日，由历准时决定的实历日，立春～立春
		Shuo, //: 朔的积日完全值，历正年
		Yue_dx, //: 月大小日数
		ShWY, //: 朔望月逐月信息，历正年
		RunY, //: 闰月标记
	} = al.aShiLiPu(nian) || al.aQIvLiPu(nian);
	let yueshu_D = Shuo.length;
	let NY_qi_vi = [0, yueshu_D];
	let yueshu_sh = 0;
	let yueshu_bu = 0;

//: ======== 准备需要的朔 ========
	{
	if(Shuo[0] > SShou_HJ) {
		let lipu_sh = al.aShiLiPu(nian - 1) || al.aQIvLiPu(nian - 1);
		yueshu_sh = lipu_sh.Shuo.length;
		let ss = findLastIndex(lipu_sh.Shuo, (x) => x <= SShou_HJ);
		NY_qi_vi[0] += yueshu_sh - ss;
		NY_qi_vi[1] += yueshu_sh - ss;
		Shuo = lipu_sh.Shuo.slice(ss).concat(Shuo);
		Yue_dx = lipu_sh.Yue_dx.slice(ss).concat(Yue_dx);
		ShWY = lipu_sh.ShWY.slice(ss).concat(ShWY);
	}
	else if(Shuo[1] <= SShou_HJ) {
		let ss = findLastIndex(Shuo, (x) => x <= SShou_HJ);
		NY_qi_vi[1] -= ss;
		Shuo = Shuo.slice(ss);
		Yue_dx = Yue_dx.slice(ss);
		ShWY = ShWY.slice(ss);
	}
	if(last(Shuo) + last(Yue_dx) < SWei_HJ) {
		let lipu_x = al.aShiLiPu(nian + 1) || al.aQIvLiPu(nian + 1);
		yueshu_bu = lipu_x.Shuo.findIndex((x) => x >= SWei_HJ);
		Shuo = Shuo.concat(lipu_x.Shuo.slice(0, yueshu_bu));
		Yue_dx = Yue_dx.concat(lipu_x.Yue_dx.slice(0, yueshu_bu));
		ShWY = ShWY.concat(lipu_x.ShWY.slice(0, yueshu_bu));
	}
	else if(last(Shuo) >= SWei_HJ) {
		let ee = Shuo.findIndex((x) => x >= SWei_HJ);
		NY_qi_vi[1] = ee;
		Shuo = Shuo.slice(0, ee);
		Yue_dx = Yue_dx.slice(0, ee);
		ShWY = ShWY.slice(0, ee);
	}
	}
	let Shuo_sy = Shuo.map(x => x - Biao0_HJ);

//: ======== 按月填写年号 ========
	let NianHao = [];
	{
	Shuo.map((x) => NianHao.push([]));
	let {NH_Ming, NH_Yue} = al.qu_NianHao(nian);
	if(NY_qi_vi[0] > 0) {
		let NH_sh = al.qu_NianHao(nian - 1);
		for(let i = 0; i < NH_sh.NH_Yue.length; i++) {
			let ss = NH_sh.NH_Yue[i][0] ? NH_sh.NH_Yue[i][0] : 0;
			let ee = NH_sh.NH_Yue[i][1] ? NH_sh.NH_Yue[i][1] : yueshu_sh;
			let xx = yueshu_sh - NY_qi_vi[0];
			if(xx < ee) {
				let yy = ss - xx;
				yy = yy > 0 ? yy : 0;
				ee = ee < yueshu_sh ? NY_qi_vi[0] - (yueshu_sh - ee) : NY_qi_vi[0];
				for(yy; yy < ee; yy++) NianHao[yy].push(NH_sh.NH_Ming[i]);
			}
		}
	}
	if(yueshu_bu > 0) {
		let NH_x = al.qu_NianHao(nian + 1);
		for(let i = 0; i < NH_x.NH_Yue.length; i++) {
			let ss = NH_x.NH_Yue[i][0] ? NH_x.NH_Yue[i][0] : 0;
			let ee = NH_x.NH_Yue[i][1] ? NH_x.NH_Yue[i][1] : 13;
			if((yueshu_bu > ss) && (yueshu_bu <= ee)) {
				let xx = Shuo.length - yueshu_bu;
				ss += xx;
				ee = ee < yueshu_bu ? ee + xx : Shuo.length;
				for(ss; ss < ee; ss++) NianHao[ss].push(NH_x.NH_Ming[i]);
			}
		}
	}
	for(let i = 0; i < NH_Yue.length; i++) {
		let xx = NY_qi_vi[1] - yueshu_D;
		let ss = NH_Yue[i][0] ? NH_Yue[i][0] + xx : xx;
		let ee = NH_Yue[i][1] ? NH_Yue[i][1] + xx : NY_qi_vi[1];
		ss = ss < 0 ? 0 : ss;
		for(ss; ss < ee; ss++) NianHao[ss].push(NH_Ming[i]);
	}
	
	for(let i = 0; i < ShWY.length; i++) ShWY[i].N_Hao = NianHao[i];
	}

//: ======== 填写夏历 ========
	{
	let x = SShou_HJ - Shuo[0];
	for(let i = 0; i < Yue_dx[0] - x; i++) {
		SBiao[SShou_sy + i].AL = [0, al.aRi_ShuvZi(x + i + 1)];
	}
	let yueshou = SShou_sy + Yue_dx[0] - x;
	for(let j = 1; j < Shuo.length - 1; j++) {
		for(let i = 0; i < Yue_dx[j]; i++) {
			SBiao[yueshou + i].AL = [j, al.aRi_ShuvZi(i + 1)];
		}
		yueshou += Yue_dx[j];
	}
	for(let i = 0; i < SWei_sy - yueshou; i++) {
		SBiao[yueshou + i].AL = [Shuo.length - 1, al.aRi_ShuvZi(i + 1)];
	}
	}

//: ======== 填写纪日干支 ========
	for(let i = SShou_sy; i < SWei_sy; i++) {
		let ri_jz = Math.floor((Biao0_HJ + i) / 60);
		let ri_yu = Biao0_HJ + i - ri_jz * 60;
		let ri_gan = ri_yu % 10;
		let ri_zhi = ri_yu % 12;
		SBiao[i].GZh = MING.Gan[ri_gan] + MING.Zhi[ri_zhi];
		if(ri_gan === 0) {
			let Jia = "";
			if(ri_zhi === 0) Jia = "(" + String(ri_jz) + ")"; //: 甲子周
			else Jia = SBiao[i].GZh; //: 其他逢甲日
			SBiao[i].Zuo = Jia;
		}
	}

//: ======== 填写节气日 ========
	{
	//: 节气日，由历准时决定的实历日，JQ 数组为 立春～立春
	let jq_sy = JQ.map((x) => x - Biao0_HJ);
	let qi = jq_sy.findIndex(x => x >= SShou_sy);
	let vi = findLastIndex(jq_sy, x => x < SWei_sy);
	for(let i = qi; i <= vi; i++) {
		if(SBiao[jq_sy[i]].Zuo) {
			if(SBiao[jq_sy[i]].Zuo[0] != "(") SBiao[jq_sy[i]].Zuo = MING.JQ[i + 3];
		}
		else SBiao[jq_sy[i]].Zuo = MING.JQ[i + 3];
		//: 覆盖逢甲日，但甲子周除外
		SBiao[jq_sy[i]].JQR = MING.JQ[i + 3];
	}
	}

//: ======== 填写西历 ========
	let wMon_YM = [];
	let wMon_HJ = [];
	{
	let cyr = nian - 2697;
	wMon_HJ = wc.wMonthsHJ(cyr);
	for(let i = 0; i < 12; i++) wMon_YM[i] = [cyr, i + 1];
	if(wMon_HJ[0] > SShou_HJ) {
		let lyr = nian - 2698;
		let lastHJ = wc.wMonthsHJ(lyr);
		let idx = findLastIndex(lastHJ, (x) => x <= SShou_HJ);
		wMon_HJ = lastHJ.slice(idx).concat(wMon_HJ);
		for(let i = 12; i > idx; i--) wMon_YM.unshift([lyr, i]);
	}
	else if(wMon_HJ[1] <= SShou_HJ) {
		let idx = findLastIndex(wMon_HJ, (x) => x <= SShou_HJ);
		wMon_HJ = wMon_HJ.slice(idx);
		wMon_YM = wMon_YM.slice(idx);
	}
	if(last(wMon_HJ) + 31 < SWei_HJ) {
		let nyr = nian - 2696;
		let nextHJ = wc.wMonthsHJ(nyr);
		let idx = nextHJ.findIndex((x) => x >= SWei_HJ);
		wMon_HJ = wMon_HJ.concat(nextHJ.slice(0, idx));
		for(let i = 0; i < idx; i++) wMon_YM.push([nyr, i + 1]);
	}
	else if(last(wMon_HJ) >= SWei_HJ) {
		let idx = wMon_HJ.findIndex((x) => x >= SWei_HJ);
		wMon_HJ = wMon_HJ.slice(0, idx);
		wMon_YM = wMon_YM.slice(0, idx);
	}

	let wday = SShou_HJ;
	for(wday; wday < wMon_HJ[1]; wday++) {
		let d_no = wday - wMon_HJ[0] + 1;
		let d_sy = wday - Biao0_HJ;
		SBiao[d_sy].WC = [...wMon_YM[0], d_no];
	}
	for(let i = 1; i < wMon_HJ.length - 1; i++) {
		for(wday; wday < wMon_HJ[i + 1]; wday++) {
			let d_no = wday - wMon_HJ[i] + 1;
			let d_sy = wday - Biao0_HJ;
			SBiao[d_sy].WC = [...wMon_YM[i], d_no];
		}
	}
	for(wday; wday < SWei_HJ; wday++) {
		let d_no = wday - wMon_HJ[wMon_HJ.length - 1] + 1;
		let d_sy = wday - Biao0_HJ;
		SBiao[d_sy].WC = [...wMon_YM[wMon_HJ.length - 1], d_no];
	}

	let wMon_N = [, "JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
	let wm_qi = wMon_HJ.findIndex((x) => x >= SShou_HJ);
	let wm_vi = findLastIndex(wMon_HJ, (x) => x < SWei_HJ);
	for(let i = wm_qi; i <= wm_vi; i++) {
		let wMonS = "";
		if(wMon_YM[i][1] === 1) wMonS = wMon_YM[i][0] > 0 ? "AD" + String(wMon_YM[i][0]) : String(1 - wMon_YM[i][0]) + "BC";
		//: 1月JAN改为西元纪年
		else wMonS = wMon_N[wMon_YM[i][1]];
		let sy = wMon_HJ[i] - Biao0_HJ;
		if(SBiao[sy].Zuo) {
			if(SBiao[sy].Zuo[0] != "(") SBiao[sy].Zuo = wMonS;
		}
		else SBiao[sy].Zuo = wMonS;
		//: 覆盖逢甲日、节气日，但甲子周除外
	}
	}

//: ======== 配备气朔时刻 ========
	let JQ_dian, YX_dian;
	{
	let [qsh_q, qsh_h] = qu_QI(+nian, 2);
	JQ_dian = qsh_q[1].slice(0, 24).map(x => x + qsh_q[0] * 60).concat(qsh_h[1].slice(0, 4).map(x => x + qsh_h[0] * 60));
	YX_dian = qsh_q[2].map(x => x + qsh_q[0] * 60).concat(qsh_h[2].map(x => x + qsh_h[0] * 60));
	let ee = findLastIndex(YX_dian, x => x < SWei_HJ + 1);
	YX_dian = YX_dian.slice(0, ee + 1);
	}

	let SP = {
		Sui: nian,
		Sui_GZh,
		RunF,
		LVI_Zi,
		ShWY,
		Shuo_sy,
		Yue_dx,
		YX_dian, //: 北京时间的天文时刻
		JQ_dian,
		JQ, //: 节气日，由历准时决定的实历日，JQ 数组为 立春～立春
		Jie_Zi: MING.Jie,
		Jie_GZh,
		Jie_sy,
		wMon_YM, //: [[year, month]]
		wMon_HJ,
		Biao0_HJ,
		SShou_sy,
		SWei_sy,
		SBiao,
	};
	let JieSu = cfg.getJieSu();
	JieRi(nian, JieSu, SP); //: 填写节庆民俗日
	let FuRi = cfg.getFuRi();
	ChongFu(nian, FuRi, SP); //: 填写按年重复日
	return SP;
}

//: 【按日历年重复的节庆民俗日】
function JieRi(nian, JieSu, SP) {
	let {
		Sui,
		Sui_GZh,
		LVI_Zi,
		ShWY,
		Shuo_sy,
		Yue_dx,
		YX_dian,
		JQ_dian,
		JQ,
		Jie_Zi,
		Jie_GZh,
		Jie_sy,
		wMon_YM,
		wMon_HJ,
		Biao0_HJ,
		SShou_sy,
		SWei_sy,
		SBiao,
	} = SP;

//: ======== 填写夏历节日 === SBiao[i].JS[0]
	if(JieSu.AL) {
		let YueM = [, "正", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二"];
		for(let i = 0; i < JieSu.AL.length; i++) {
			let jsY_Zi = YueM[JieSu.AL[i][1]];
			let bbN = Number.isInteger(JieSu.AL[i][0]) ? JieSu.AL[i][0] : 2594; //: 始行年缺省取太初元年
			let eeN = Number.isInteger(JieSu.AL[i][4]) ? JieSu.AL[i][4] : 99999;
			//: 由于头尾可能有相同的纪月序数，前后检查两遍
			let Ysy_q = ShWY.findIndex(x => x.Y_Zi === jsY_Zi);
			if((Ysy_q > -1) && (ShWY[Ysy_q].Nian >= bbN) && (ShWY[Ysy_q].Nian <= eeN)) {
				let JS_q = Shuo_sy[Ysy_q] + JieSu.AL[i][2] - 1;
				if((JS_q >= SShou_sy) && (JS_q < SWei_sy)) {
					if(SBiao[JS_q].JS) {
						if(SBiao[JS_q].JS[0]) SBiao[JS_q].JS[0].push(JieSu.AL[i][3]);
						else SBiao[JS_q].JS[0] = [JieSu.AL[i][3]];
					}
					else SBiao[JS_q].JS = [[JieSu.AL[i][3]]];
				}
			}
			let Ysy_h = findLastIndex(ShWY, x => x.Y_Zi === jsY_Zi);
			if((Ysy_h > -1) && (Ysy_h !== Ysy_q) && (ShWY[Ysy_h].Nian >= bbN) && (ShWY[Ysy_h].Nian <= eeN)) {
				let JS_h = Shuo_sy[Ysy_h] + JieSu.AL[i][2] - 1;
				if((JS_h >= SShou_sy) && (JS_h < SWei_sy)) {
					if(SBiao[JS_h].JS) {
						if(SBiao[JS_h].JS[0]) SBiao[JS_h].JS[0].push(JieSu.AL[i][3]);
						else SBiao[JS_h].JS[0] = [JieSu.AL[i][3]];
					}
					else SBiao[JS_h].JS = [[JieSu.AL[i][3]]];
				}
			}
		}
	}

//: ======== 填写节历节日 === SBiao[i].JS[2]
	if(JieSu.JL) {
		for(let i = 0; i < JieSu.JL.length; i++) {
			let bbN = Number.isInteger(JieSu.JL[i][0]) ? JieSu.JL[i][0] : -9999;
			let eeN = Number.isInteger(JieSu.JL[i][4]) ? JieSu.JL[i][4] : 99999;
			if((nian >= bbN) && (nian <= eeN)) {
				let JS_sy = Jie_sy[JieSu.JL[i][1]] + JieSu.JL[i][2] - 1;
				if(SBiao[JS_sy].JS) {
					if(SBiao[JS_sy].JS[2]) SBiao[JS_sy].JS[2].push(JieSu.JL[i][3]);
					else SBiao[JS_sy].JS[2] = [JieSu.JL[i][3]];
				}
				else SBiao[JS_sy].JS = [, , [JieSu.JL[i][3]]];
			}
		}
	}

//: ======== 填写西历节日 === SBiao[i].JS[3]
	if(JieSu.WC) {
		for(let i = 0; i < JieSu.WC.length; i++) {
			let M_sy = wMon_YM.findIndex(x => x[1] === JieSu.WC[i][1]);
			if(M_sy > -1) {
				let wy = wMon_YM[M_sy][0];
				let bbN = Number.isInteger(JieSu.WC[i][0]) ? JieSu.WC[i][0] : -9999;
				let eeN = Number.isInteger(JieSu.WC[i][4]) ? JieSu.WC[i][4] : 99999;
				if((wy >= bbN) && (wy <= eeN)) {
					let JS_sy = wMon_HJ[M_sy] - Biao0_HJ + JieSu.WC[i][2] - 1;
					if(SBiao[JS_sy].JS) {
						if(SBiao[JS_sy].JS[3]) SBiao[JS_sy].JS[3].push(JieSu.WC[i][3]);
						else SBiao[JS_sy].JS[3] = [JieSu.WC[i][3]];
					}
					else SBiao[JS_sy].JS = [, , , [JieSu.WC[i][3]]];
				}
			}
		}
	}

//: ======== 填写节气节日 === SBiao[i].JS[1]
	if(JieSu.JQ) {
		let jq_xu = JieSu.JQ.map((x) => x[1]);
		let qian = findLastIndex(jq_xu, (x) => x < 3);
		//: 检查是否有基于立春前节气的节日，有则需要上年数据
		if(qian > -1) {
			let lipu_sh = al.aShiLiPu(nian - 1) || al.aQIvLiPu(nian - 1);
			for(let i = 0; i <= qian; i++) {
				let bbN = Number.isInteger(JieSu.JQ[i][0]) ? JieSu.JQ[i][0] : -9999;
				let eeN = Number.isInteger(JieSu.JQ[i][4]) ? JieSu.JQ[i][4] : 99999;
				if((nian >= bbN) && (nian <= eeN)) {
				//: 这里上游夏历历谱输出的JQ数组从立春～立春，序号需要偏移3；上年组需要偏移24
					let j = JieSu.JQ[i][1] + 21;
					let jq_sy = lipu_sh.JQ[j] - Biao0_HJ;
					let jqjr_sy = jq_sy + JieSu.JQ[i][2];
					if(jqjr_sy >= SShou_sy) {
						if(SBiao[jqjr_sy].JS) {
							if(SBiao[jqjr_sy].JS[1]) SBiao[jqjr_sy].JS[1].push(JieSu.JQ[i][3]);
							else SBiao[jqjr_sy].JS[1] = [JieSu.JQ[i][3]];
						}
						else SBiao[jqjr_sy].JS = [, [JieSu.JQ[i][3]]];
					}
				}
			}
		}
		let ss = qian > -1 ? qian + 1 : 0; //: 直接等于qian+1也可以
		for(ss; ss < JieSu.JQ.length; ss++) {
			let bbN = Number.isInteger(JieSu.JQ[ss][0]) ? JieSu.JQ[ss][0] : -9999;
			let eeN = Number.isInteger(JieSu.JQ[ss][4]) ? JieSu.JQ[ss][4] : 99999;
			if((nian >= bbN) && (nian <= eeN)) {
				let jq_sy = JQ[JieSu.JQ[ss][1] - 3] - Biao0_HJ;
				let jqjr_sy = jq_sy + JieSu.JQ[ss][2];
				if((jqjr_sy >= SShou_sy) && (jqjr_sy < SWei_sy)) {
					if(SBiao[jqjr_sy].JS) {
						if(SBiao[jqjr_sy].JS[1]) SBiao[jqjr_sy].JS[1].push(JieSu.JQ[ss][3]);
						else SBiao[jqjr_sy].JS[1] = [JieSu.JQ[ss][3]];
					}
					else SBiao[jqjr_sy].JS = [, [JieSu.JQ[ss][3]]];
				}
			}
		}
	}

//: ======== 填写三伏（填入节气节日） === SBiao[i].JS[1]
	let sf = al.aSanFu(JQ[9], JQ[12]).map((x) => x - Biao0_HJ);
	let sfm = ["初伏", "中伏", "末伏"];
	for(let i = 0; i < 3; i++) {
		if(SBiao[sf[i]].JS) {
			if(SBiao[sf[i]].JS[1]) SBiao[sf[i]].JS[1].push([sfm[i], "今日入" + sfm[i]]);
			else SBiao[sf[i]].JS[1] = [[sfm[i], "今日入" + sfm[i]]];
		}
		else SBiao[sf[i]].JS = [, [[sfm[i], "今日入" + sfm[i]]]];
	}

	return SP;
}

//: 【按日历年重复的日期】
//: 在后者图标优先，西历 < 节历 < 节气 < 夏历
function ChongFu(nian, FuRi, SP) {
	let {
		ShWY,
		Shuo_sy,
		Yue_dx,
		YX_dian,
		JQ_dian,
		JQ,
		Jie_Zi,
		Jie_GZh,
		Jie_sy,
		wMon_YM,
		wMon_HJ,
		Biao0_HJ,
		SShou_sy,
		SWei_sy,
		SBiao,
	} = SP;

//: ======== 填写西历重复日 ========
	if(FuRi.WC) {
		for(let i = 0; i < FuRi.WC.length; i++) {
			let M_sy = wMon_YM.findIndex(x => x[1] === FuRi.WC[i][1]);
			if(M_sy > -1) {
				let wy = wMon_YM[M_sy][0];
				let bbN = Number.isInteger(FuRi.WC[i][0]) ? FuRi.WC[i][0] : -9999;
				let eeN = Number.isInteger(FuRi.WC[i][4]) ? FuRi.WC[i][4] : 99999;
				if((wy >= bbN) && (wy <= eeN)) {
					let FR_sy = wMon_HJ[M_sy] - Biao0_HJ + FuRi.WC[i][2] - 1;
					if(!SBiao[FR_sy].FR) SBiao[FR_sy].FR = {};
					if(SBiao[FR_sy].FR.WC) SBiao[FR_sy].FR.WC.push(FuRi.WC[i][3]);
					else SBiao[FR_sy].FR.WC = [FuRi.WC[i][3]];
					SBiao[FR_sy].FR.icon = FuRi.WC[i][5] || SBiao[FR_sy].FR.icon || "❀"; //: "❀"是缺省字符图标
				}
			}
		}
	}

//: ======== 填写节历重复日 ========
	if(FuRi.JL) {
		for(let i = 0; i < FuRi.JL.length; i++) {
			let bbN = Number.isInteger(FuRi.JL[i][0]) ? FuRi.JL[i][0] : -9999;
			let eeN = Number.isInteger(FuRi.JL[i][4]) ? FuRi.JL[i][4] : 99999;
			if((nian >= bbN) && (nian <= eeN)) {
				let FR_sy = Jie_sy[FuRi.JL[i][1]] + FuRi.JL[i][2] - 1;
				if(!SBiao[FR_sy].FR) SBiao[FR_sy].FR = {};
				if(SBiao[FR_sy].FR.JL) SBiao[FR_sy].FR.JL.push(FuRi.JL[i][3]);
				else SBiao[FR_sy].FR.JL = [FuRi.JL[i][3]];
				SBiao[FR_sy].FR.icon = FuRi.JL[i][5] || SBiao[FR_sy].FR.icon || "❀";
			}
		}
	}

//: ======== 填写节气重复日 ========
	if(FuRi.JQ) {
		let jq_xu = FuRi.JQ.map((x) => x[1]);
		let qian = findLastIndex(jq_xu, (x) => x < 3);
		//: 检查是否有基于立春前节气的重复日，有则需要上年数据
		if(qian > -1) {
			let lipu_sh = al.aShiLiPu(nian - 1) || al.aQIvLiPu(nian - 1);
			for(let i = 0; i <= qian; i++) {
				let bbN = Number.isInteger(FuRi.JQ[i][0]) ? FuRi.JQ[i][0] : -9999;
				let eeN = Number.isInteger(FuRi.JQ[i][4]) ? FuRi.JQ[i][4] : 99999;
				if((nian >= bbN) && (nian <= eeN)) {
				//: 这里上游夏历历谱输出的JQ数组从立春～立春，序号需要偏移3；上年组需要偏移24
					let j = FuRi.JQ[i][1] + 21;
					let jq_sy = lipu_sh.JQ[j] - Biao0_HJ;
					let jqfr_sy = jq_sy + FuRi.JQ[i][2];
					if(jqfr_sy >= SShou_sy) {
						if(!SBiao[jqfr_sy].FR) SBiao[jqfr_sy].FR = {};
						if(SBiao[jqfr_sy].FR.JQ) SBiao[jqfr_sy].FR.JQ.push(FuRi.JQ[i][3]);
						else SBiao[jqfr_sy].FR.JQ = [FuRi.JQ[i][3]];
						SBiao[jqfr_sy].FR.icon = FuRi.JQ[i][5] || SBiao[jqfr_sy].FR.icon || "❀";
					}
				}
			}
		}
		let ss = qian > -1 ? qian + 1 : 0;
		for(ss; ss < FuRi.JQ.length; ss++) {
			let bbN = Number.isInteger(FuRi.JQ[ss][0]) ? FuRi.JQ[ss][0] : -9999;
			let eeN = Number.isInteger(FuRi.JQ[ss][4]) ? FuRi.JQ[ss][4] : 99999;
			if((nian >= bbN) && (nian <= eeN)) {
				let jq_sy = JQ[FuRi.JQ[ss][1] - 3] - Biao0_HJ;
				let jqfr_sy = jq_sy + FuRi.JQ[ss][2];
				if((jqfr_sy >= SShou_sy) && (jqfr_sy < SWei_sy)) {
					if(!SBiao[jqfr_sy].FR) SBiao[jqfr_sy].FR = {};
					if(SBiao[jqfr_sy].FR.JQ) SBiao[jqfr_sy].FR.JQ.push(FuRi.JQ[ss][3]);
					else SBiao[jqfr_sy].FR.JQ = [FuRi.JQ[ss][3]];
					SBiao[jqfr_sy].FR.icon = FuRi.JQ[ss][5] || SBiao[jqfr_sy].FR.icon || "❀";
				}
			}
		}
	}

//: ======== 填写夏历重复日 ========
	if(FuRi.AL) {
		let YueM = [, "正", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二"]; //: 索引0空置
		for(let i = 0; i < FuRi.AL.length; i++) {
			let jsY_Zi = YueM[FuRi.AL[i][1]];
			let bbN = Number.isInteger(FuRi.AL[i][0]) ? FuRi.AL[i][0] : 2594;
			let eeN = Number.isInteger(FuRi.AL[i][4]) ? FuRi.AL[i][4] : 99999;
			//: 由于头尾可能有相同的纪月序数，前后检查两遍
			let Ysy_q = ShWY.findIndex(x => x.Y_Zi === jsY_Zi);
			if((Ysy_q > -1) && (ShWY[Ysy_q].Nian >= bbN) && (ShWY[Ysy_q].Nian <= eeN)) {
				let FR_q = Shuo_sy[Ysy_q] + FuRi.AL[i][2] - 1;
				if((FR_q >= SShou_sy) && (FR_q < SWei_sy)) {
					if(!SBiao[FR_q].FR) SBiao[FR_q].FR = {};
					if(SBiao[FR_q].FR.AL) SBiao[FR_q].FR.AL.push(FuRi.AL[i][3]);
					else SBiao[FR_q].FR.AL = [FuRi.AL[i][3]];
					SBiao[FR_q].FR.icon = FuRi.AL[i][5] || SBiao[FR_q].FR.icon || "❀";
				}
			}
			let Ysy_h = findLastIndex(ShWY, x => x.Y_Zi === jsY_Zi);
			if((Ysy_h > -1) && (Ysy_h !== Ysy_q) && (ShWY[Ysy_h].Nian >= bbN) && (ShWY[Ysy_h].Nian <= eeN)) {
				let FR_h = Shuo_sy[Ysy_h] + FuRi.AL[i][2] - 1;
				if((FR_h >= SShou_sy) && (FR_h < SWei_sy)) {
					if(!SBiao[FR_h].FR) SBiao[FR_h].FR = {};
					if(SBiao[FR_h].FR.AL) SBiao[FR_h].FR.AL.push(FuRi.AL[i][3]);
					else SBiao[FR_h].FR.AL = [FuRi.AL[i][3]];
					SBiao[FR_h].FR.icon = FuRi.AL[i][5] || SBiao[FR_h].FR.icon || "❀";
				}
			}
		}
	}
	return SP;
}

//: 【处理气朔点注历时】
//: 传入的 xVLI 时差总是相对北京时间，而不是注历时当前值
function ZhuLi(nian, xVLI, SP) {
	const YXM = ["朔", "望"];
	const jinS = tl.JL_Jin().S; //: 由系统时间获取“今岁”
	let jibie = ((+nian >= 4354) && (+nian <= jinS + 12)) ? 3 : 2;
	//: 日内时间转换级别，指定年限内保留至秒，其外保留至分
	SP.VLI = xVLI;
	let SShou_HJ = SP.Biao0_HJ + SP.Jie_sy[1];
	let SWei_HJ = SP.Biao0_HJ + SP.Jie_sy[13];
	let jq_v = al.aQI_ShiKe(SP.JQ_dian, xVLI.Cha);
	let jqbb = jq_v.findIndex(x => x >= SShou_HJ);
	let jqee = findLastIndex(jq_v, x => x < SWei_HJ);
	let yx_v = al.aQI_ShiKe(SP.YX_dian, xVLI.Cha);
	let yxbb = yx_v.findIndex(x => x >= SShou_HJ);
	let yxee = findLastIndex(yx_v, x => x < SWei_HJ);
	
	for(let i = 0; i < SP.SBiao.length; i++) {
		delete SP.SBiao[i].JQ;
		delete SP.SBiao[i].YX;
	}
	for(let i = jqbb; i <= jqee; i++) {
		let jqd = tl.D2HMS(jq_v[i], jibie);
		let sy = jqd.D - SP.Biao0_HJ;
		delete jqd.D;
		SP.SBiao[sy].JQ = [MING.JQ[i % 24], tl.showHMS(jqd)];
	}
	for(let i = yxbb; i <= yxee; i++) {
		let yxd = tl.D2HMS(yx_v[i], jibie);
		let sy = yxd.D - SP.Biao0_HJ;
		delete yxd.D;
		SP.SBiao[sy].YX = [YXM[i % 2], tl.showHMS(yxd)];
	}
	return SP;
}

//: 【缓存管理器】
class Cache {
	constructor(maxSize = 24) {
		this.store = new Map();
		this.maxSize = maxSize;
		this.hits = 0;
		this.misses = 0;
	}

	get(key) {
		if (this.store.has(key)) {
			this.hits++;
			const value = this.store.get(key);
			this.store.delete(key);
			this.store.set(key, value);
			return value;
		}
		this.misses++;
		return null;
	}

	set(key, value) {
		if (this.store.has(key)) {
			this.store.delete(key);
		} else if (this.store.size >= this.maxSize) {
			const oldestKey = this.store.keys().next().value;
			this.store.delete(oldestKey);
		}
		this.store.set(key, value);
	}

	getStats() {
		const total = this.hits + this.misses;
		return {
			size: this.store.size,
			maxSize: this.maxSize,
			hits: this.hits,
			misses: this.misses,
			hitRate: total > 0 ? (this.hits / total * 100).toFixed(2) + '%' : '0%',
			keys: [...this.store.keys()]
		};
	}

	clear() {
		this.store.clear();
		this.hits = 0;
		this.misses = 0;
	}
}

const cache = new Cache(24);

//: 取岁谱，交付日历数据的主功能函数
export function qu_SuiPu(Sui) {
	let VLI = cfg.qu_VLI();
	let S = cache.get(Sui);
	if (S) {
		if(Math.abs(S.VLI.Cha - VLI.Cha) < 0.0000001) {
			return S;
		}
		else {
			return ZhuLi(Sui, VLI, S);
		}
	}
	else {
		S = ZhuLi(Sui, VLI, SuiPu(Sui));
		cache.set(Sui, S);
		return S;
	}
}

//: 缓存状态查询（可选工具函数）
qu_SuiPu.cacheInfo = function() {
	return cache.getStats();
};

//: 清空缓存（可选工具函数）
qu_SuiPu.clearCache = function() {
	cache.clear();
};
