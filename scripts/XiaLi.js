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

//: 夏历
import * as LP from "../assets/shiLiPu.js";
import * as LS from "../assets/LiShi.js";
import * as tl from "./tools.js";
import {findLast} from "./tools.js";
import {MING} from "./ming.js";
import qu_QI from "./qu_QI.js";
export {aQI_ShiKe, aQIvLiPu, aShiLiPu, aRi_ShuvZi, aSanFu, qu_NianHao};

//: 【对气朔数据作时刻偏移】
function aQI_ShiKe(QI, cha) {
	let qishuo = JSON.parse(JSON.stringify(QI));
	if(cha < 0.000000001) return qishuo;
	return qishuo.map(x => Math.round(x * 10**9 + cha * 10**9) / 10**9);
}

//: 【三伏】
function aSanFu(XiaZhi, LiQiu) {
	let x = XiaZhi + 30 - (((XiaZhi % 10) + 13) % 10 + 1);
	let l = LiQiu + 10 - (((LiQiu % 10) + 13) % 10 + 1);
	return [x, x + 10, l];
}

//: 【处理实历历谱】
//: 暂不支持多实历切换
function aShiLiPu(nian) {
	if((nian < 1976) || (nian >= 4625)) return false;
	let n = nian - 1976;
	let tzh = LP.TZh[n] * 60;
	
	let JQ = [LP.JQ[n][0] + tzh];
	//: 索引i的值 = i的积日 - 索引0积日 - 15i
	for(let i = 1; i < LP.JQ[n].length; i++) JQ[i] = JQ[0] + LP.JQ[n][i] + 15 * i;
	
	let Shuo = [LP.Yue[n][0] + tzh];
	let Yue_dx = [], Yue_dxZi = [];
	let RunY = LP.Yue[n][2];
	for(let i = 0; i < LP.Yue[n][1].length; i++) {
		Yue_dx[i] = LP.Yue[n][1][i] === 1 ? 30 : 29;
		Shuo[i + 1] = Shuo[i] + Yue_dx[i];
		Yue_dxZi[i] = Yue_dx[i] === 30 ? "大" : "小";
	}
	Shuo.pop();
	
	let gan = MING.Gan.concat(MING.Gan.concat(MING.Gan));
	let lun = (((nian - 1) % 5 + 5) % 5) * 2;
	let ym = JSON.parse(JSON.stringify(LP.Yue_Zi.Yin));
	let Yue_GZh = [], Yue_Gan = [];
	if(RunY < 0) throw new Error("阴历闰月标识错误！");
	else if(RunY <= 13) {
		if((1652 <= nian) && (nian < 2477)) { //: 西周、东周且统一按子正
			ym = JSON.parse(JSON.stringify(LP.Yue_Zi.Zi));
			Yue_GZh = JSON.parse(JSON.stringify(MING.Zhi));
			Yue_Gan = gan.slice(lun, lun + 12);
		}
		else {
			Yue_GZh = JSON.parse(JSON.stringify(tl.roArray(MING.Zhi, -2))); //: 寅正
			Yue_Gan = gan.slice(lun + 2, lun + 14);
		}
		for(let i = 0; i < 12; i++) Yue_GZh[i] = Yue_Gan[i] + Yue_GZh[i];
		if((RunY > 0) && (RunY < 13)) {
			ym.splice(RunY, 0, "闰" + ym[RunY - 1]);
			Yue_GZh.splice(RunY, 0, "闰"); //: 闰月不标干支
		}
		if(RunY === 13) {
			ym[12] = "十三";
			Yue_GZh[12] = "十三";
		}
	}
	else if(RunY < 24) throw new Error("阴历闰月标识错误！");
	else if(RunY <= 36) { //: 丑正
		Yue_GZh = JSON.parse(JSON.stringify(tl.roArray(MING.Zhi, -1)));
		Yue_Gan = gan.slice(lun + 1, lun + 13);
		for(let i = 0; i < 12; i++) Yue_GZh[i] = Yue_Gan[i] + Yue_GZh[i];
		if(RunY > 24) {
			ym.splice(RunY - 24, 0, "闰" + ym[RunY - 25]);
			Yue_GZh.splice(RunY - 24, 0, "闰");
		}
	}
	else if(RunY < 48) throw new Error("阴历闰月标识错误！");
	else if(RunY <= 60) { //: 子正
		ym = JSON.parse(JSON.stringify(LP.Yue_Zi.Zi));
		Yue_GZh = JSON.parse(JSON.stringify(MING.Zhi));
		Yue_Gan = gan.slice(lun, lun + 12);
		for(let i = 0; i < 12; i++) Yue_GZh[i] = Yue_Gan[i] + Yue_GZh[i];
		if(RunY > 48) {
			ym.splice(RunY - 48, 0, "闰" + ym[RunY - 49]);
			Yue_GZh.splice(RunY - 48, 0, "闰");
		}
	}
	else if(RunY < 72) throw new Error("阴历闰月标识错误！");
	else if(RunY <= 73) { //: 亥正
		ym = JSON.parse(JSON.stringify(LP.Yue_Zi.Hai));
		Yue_GZh = JSON.parse(JSON.stringify(tl.roArray(MING.Zhi, 1)));
		Yue_Gan = gan.slice(lun + 9, lun + 21);
		for(let i = 0; i < 12; i++) Yue_GZh[i] = Yue_Gan[i] + Yue_GZh[i];
		if(RunY === 73) {
			ym[12] = "后九";
			Yue_GZh[12] = "闰";
		}
	}
	else if(RunY < 90) throw new Error("阴历闰月标识错误！");
	else if(RunY <= 99) { //: 过渡异常年份
		ym = LP.Yue_Zi.Yi[RunY - 90];
		Yue_GZh = LP.Yue_Zi.Yi_GZh[RunY - 90];
	}
	else throw new Error("阴历闰月标识错误！");
	if(!ym) throw new Error("阴历闰月识别失败！");
	
	let Yue_Zi = [];
	ym.map(x => Yue_Zi.push(x));
	let ShWY = [];
	let nn = ((nian - 1) % 60 + 60) % 60;
	for(let i = 0; i < Shuo.length; i++) {
		ShWY[i] = {
			Nian: nian,
			N_GZh: MING.Gan[nn % 10] + MING.Zhi[nn % 12],
			N_ShX: MING.ShX[nn % 12],
			Y_Zi: Yue_Zi[i], //: 月名（纪月汉字）
			Y_GZh: Yue_GZh[i] || "", //: 月干支
			Y_dxZi: Yue_dxZi[i], //: 月大小汉字
		};
	}
	return {
		LVI_Zi: "实历复原", //: 历准时名称
		JQ, //: 立春～立春，对齐节历年，积日完全值
		Shuo, //: 朔的积日完全值，实历年
		Yue_dx, //: 月大小日数
		ShWY, //: 朔望月逐月信息，实历年
		RunY, //: 闰月标记
	}
}

//: 【用气朔数据生成当前年夏正历谱】
function aQIvLiPu(nian) {
	//: 需要取三组天正年数据，以防当前夏历年有闰十一、闰十二月
	let [QI_q, QI_h, QI_s] = qu_QI(+nian, 3);
	let yi_q = LS.ShiKe.qu_LVI(+nian);
	let qsh_qian = [QI_q[0], aQI_ShiKe(QI_q[1], yi_q), aQI_ShiKe(QI_q[2], yi_q)];
	let yi_h = LS.ShiKe.qu_LVI(nian + 1);
	let qsh_hou = [QI_h[0], aQI_ShiKe(QI_h[1], yi_h), aQI_ShiKe(QI_h[2], yi_h)];
	let yi_s = LS.ShiKe.qu_LVI(nian + 2);
	let qsh_san = [QI_s[0], aQI_ShiKe(QI_s[1], yi_s), aQI_ShiKe(QI_s[2], yi_s)];
	
	let tzh_q = qsh_qian[0] * 60;
	let tzh_h = qsh_hou[0] * 60;
	let tzh_s = qsh_san[0] * 60;
	let jq_q = qsh_qian[1].map(x => Math.floor(x));
	let yx_q = qsh_qian[2].map(x => Math.floor(x));
	let shuo_q = yx_q.filter((_, i) => i % 2 === 0);
	let jq_h = qsh_hou[1].map(x => Math.floor(x) + tzh_h - tzh_q);
	let yx_h = qsh_hou[2].map(x => Math.floor(x) + tzh_h - tzh_q);
	let shuo_h = yx_h.filter((_, i) => i % 2 === 0);
	let dongzhi_s = qsh_san[1][0] + tzh_s - tzh_q;
	let shuo_s0 = Math.floor(qsh_san[2][0]) + tzh_s - tzh_q;
	let shuo_s1 = Math.floor(qsh_san[2][2]) + tzh_s - tzh_q;

	//: 按日历日计中朔关系，调整各天正年组
	if(shuo_q[1] <= jq_q[0]) shuo_q.shift();
	if(shuo_h[1] <= jq_h[0]) shuo_q.push(shuo_h.shift());
	if(shuo_s1 <= Math.floor(dongzhi_s)) shuo_h.push(shuo_s0);
	
	//: 闰月判定
	let gan = MING.Gan.concat(MING.Gan.concat(MING.Gan));
	let lun = (((nian - 1) % 5 + 5) % 5) * 2;
	let y_gan_q = gan.slice(lun, lun + 12);
	let y_gan_h = gan.slice(lun + 2, lun + 14);
	let ym_q = ["十一", "十二", "正", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
	let ym_h = ["十一", "十二", "正", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
	let ygzh_q = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
	for(let i = 0; i < 12; i++) ygzh_q[i] = y_gan_q[i] + ygzh_q[i];
	let ygzh_h = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
	for(let i = 0; i < 12; i++) ygzh_h[i] = y_gan_h[i] + ygzh_h[i];
	let xialiYue = [2, 14]; //: 月份数组的年归属，索引2～13号即第3～14个月为当前年
	let RunY = 0;
	let dongzhi_q = qsh_qian[1][0] * 10**9;
	let dongzhi_h = (qsh_hou[1][0] + tzh_h - tzh_q) * 10**9;
	dongzhi_s *= 10**9;
	if(shuo_q.length === 13) {
		for(let i = 1; i < 12; i++) {
			let zhong = (nian >= LS.WuZhong[0]) && (nian < LS.WuZhong[1])? jq_q[i * 2] : Math.floor((dongzhi_q + (dongzhi_h - dongzhi_q) * i / 12) / 10**9);
			if(shuo_q[i + 1] <= zhong) {
				RunY = i;
				break;
			}
		}
		if(RunY === 0) RunY = 12;
		ym_q.splice(RunY, 0, "闰" + ym_q[RunY - 1]);
		ygzh_q.splice(RunY, 0, "闰");
		xialiYue[1]++;
		if(RunY < 3) xialiYue[0]++;
	}
	else if(shuo_q.length != 12) throw new Error(String(nian) + " 天正年朔望月数量有误！");
	else if(shuo_h.length === 13) {
		for(let i = 1; i < 12; i++) {
			let zhong = ((nian + 1) >= LS.WuZhong[0]) && ((nian + 1) < LS.WuZhong[1])? jq_q[i * 2] : Math.floor((dongzhi_h + (dongzhi_s - dongzhi_h) * i / 12) / 10**9);
			if(shuo_h[i + 1] <= zhong) {
				RunY = i;
				break;
			}
		}
		if(RunY === 0) RunY = 12;
		ym_h.splice(RunY, 0, "闰" + ym_h[RunY - 1]);
		ygzh_h.splice(RunY, 0, "闰");
		if(RunY < 3) xialiYue[1]++;
		RunY += 12;
	}
	else if(shuo_h.length != 12) throw new Error(String(nian + 1) + " 天正年朔望月数量有误！");
	
	let shuo = shuo_q.concat(shuo_h);
	let ym = ym_q.concat(ym_h);
	let ygzh = ygzh_q.concat(ygzh_h);
	let xialiShuo = shuo.slice(xialiYue[0], xialiYue[1] + 1).map(x => x + qsh_qian[0] * 60);
	RunY = (RunY < xialiYue[0]) || (RunY >= xialiYue[1]) ? 0 : RunY - xialiYue[0];

	let Yue_dx = [];
	let Yue_dxZi = [];
	for(let i = 0; i < xialiShuo.length - 1; i++) {
		Yue_dx[i] = xialiShuo[i + 1] - xialiShuo[i];
		if((Yue_dx[i] != 29) && (Yue_dx[i] != 30)) throw new Error(String(nian) + " 夏历年第" + String(i) + "个朔望月月长异常，计" + String(Yue_dx[i]) + "日！");
		Yue_dxZi[i] = Yue_dx[i] === 30 ? "大" : "小";
	}
	xialiShuo.pop();
	
	let Yue_Zi = [], Yue_GZh = [];
	ym.slice(xialiYue[0], xialiYue[1]).map(x => Yue_Zi.push(x));
	ygzh.slice(xialiYue[0], xialiYue[1]).map(x => Yue_GZh.push(x));
	jq_q = jq_q.slice(3, 24).concat(jq_h.slice(0, 4));
	let JQ = jq_q.map(x => x + qsh_qian[0] * 60);
	let ShWY = [];
	let nn = ((nian - 1) % 60 + 60) % 60;
	for(let i = 0; i < xialiShuo.length; i++) {
		ShWY[i] = {
			Nian: nian,
			N_GZh: MING.Gan[nn % 10] + MING.Zhi[nn % 12],
			N_ShX: MING.ShX[nn % 12],
			Y_Zi: Yue_Zi[i],
			Y_GZh: Yue_GZh[i] || "",
			Y_dxZi: Yue_dxZi[i],
		};
	}
	return {
		LVI_Zi: LS.ShiKe.qu_LVI_Zi(nian),
		JQ,
		Shuo: xialiShuo,
		Yue_dx,
		ShWY,
		RunY,
	}
}

//: 【朔望月纪日数转汉字】
function aRi_ShuvZi(shu) {
	if(typeof shu !== "number" || isNaN(shu)) throw new Error("纪日需为数字！");
	shu = Math.floor(shu);
	if((shu < 1) || (shu > 30)) throw new Error("朔望月纪日数应在1～30范围内！");
	const Han = [, "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
	if(shu <= 10) return "初" + Han[shu];
	else if(shu < 20) return "十" + Han[shu - 10];
	else if(shu === 20) return "二十";
	else if(shu < 30) return "廿" + Han[shu - 20];
	else return "三十";
}

//: 【取年号】
//: 支持多年号，支持具体月份改换；暂不支持同步切换不同实历
function qu_NianHao(nian) {
	const keys = Object.keys(LS.NianHao)
		.map(k => parseInt(k))
		.sort((a, b) => a - b);
	let nh_duan = 0;
	if(nian >= keys[0]) nh_duan = findLast(keys, x => x <= nian);
	else return ["上古"];

	const keyData = LS.NianHao[String(nh_duan)];
	const NH_Ming = [], NH_Yue = [];
	for(let item of keyData) {
		let JiNian = "";
		if(item[3] > 0) {
			let n = nian - nh_duan + item[3]
			if(item[2] === "西元") JiNian = " " + String(n) + " 年";
			else if(n === 1) JiNian = "元年";
			else JiNian = tl.num2Han(n) + "年";
		}

		let str = item[1] + item[2] + JiNian;
		let dian = item[0] && str ? "・" : "";
		NH_Ming.push(item[0] + dian + str);

		let yuefen = [0];
		if(nian === nh_duan) yuefen = item[4] || [0];
		//: 覆盖月份：[起始月索引（0起，可省）, 截止月索引（不含，可省）]
		//: 仅改年号年有月份值
		NH_Yue.push(yuefen);
	}

	return {NH_Ming, NH_Yue};
}
