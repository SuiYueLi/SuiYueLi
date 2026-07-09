const APP_VERSION = '1.47230605.0';
const CACHE_NAME = 'SuiYueLi_v' + APP_VERSION;

const CACHE_FILES = [
	'/',
	'/config.js',
	'/favicon.ico',
	'/index.html',
	'/LICENSE',
	'/main.js',
	'/manifest.json',
	'/assets/FuRi.js',
	'/assets/JieSu.js',
	'/assets/LiShi.js',
	'/assets/shiLiPu.js',
	'/assets/UT_-1300_1857.json',
	'/assets/UT_1857_4600.json',
	'/assets/UT_4600_4800.js',
	'/assets/UT_4800_6602.json',
	'/assets/Fonts/ChillHuoFangKai_F_Con-sub.woff2',
	'/assets/Fonts/CooperZhengKai-sub.woff2',
	'/assets/Fonts/KurintoGrgaCore-Bd-No_sub.woff2',
	'/assets/Fonts/ShipporiMincho-sub.woff2',
	'/assets/IMG/circle.png',
	'/assets/IMG/二里头绿松石龙形器.png',
	'/assets/IMG/历_192.png',
	'/assets/IMG/历_512.png',
	'/pages/AnZhuang.html',
	'/pages/GeShi.html',
	'/pages/GuanYu.html',
	'/pages/LiFa_Jian.html',
	'/pages/ShuJu.html',
	'/pages/ZiTi.html',
	'/pages/IMG/PWA_addrBar.png',
	'/pages/IMG/Zan.jpg',
	'/scripts/biji.js',
	'/scripts/JieLi.js',
	'/scripts/ming.js',
	'/scripts/qu_QI.js',
	'/scripts/SuiPu.js',
	'/scripts/tools.js',
	'/scripts/westCal.js',
	'/scripts/XiaLi.js',
	'/styles/biji.css',
	'/styles/Li_Ge.css',
	'/styles/main.css',
];

const CACHE_RELOAD_WHITELIST = [
/*
	'/manifest.json',
	'/favicon.ico',
	'/LICENSE',
	'/assets/FuRi.js',
	'/assets/JieSu.js',
	'/assets/LiShi.js',
	'/assets/shiLiPu.js',
	'/assets/UT_-1300_1857.json',
	'/assets/UT_1857_4600.json',
	'/assets/UT_4600_4800.js',
	'/assets/UT_4800_6602.json',
	'/assets/Fonts/ChillHuoFangKai_F_Con-sub.woff2',
	'/assets/Fonts/CooperZhengKai-sub.woff2',
	'/assets/Fonts/KurintoGrgaCore-Bd-No_sub.woff2',
	'/assets/Fonts/ShipporiMincho-sub.woff2',
	'/assets/IMG/circle.png',
	'/assets/IMG/二里头绿松石龙形器.png',
	'/assets/IMG/历_192.png',
	'/assets/IMG/历_512.png',
*/
];

self.addEventListener('install', event => {
	event.waitUntil(
		caches.open(CACHE_NAME).then(cache => {
			const reloadReqs = CACHE_FILES.filter(url => !CACHE_RELOAD_WHITELIST.includes(url))
				.map(url => new Request(url, { cache: 'reload' }));
			const otherReqs = CACHE_FILES.filter(url => CACHE_RELOAD_WHITELIST.includes(url));
			return cache.addAll([...reloadReqs, ...otherReqs]);
		}).then(() => self.skipWaiting())
	);
});

self.addEventListener('activate', event => {
	event.waitUntil(
		caches.keys().then(keys => {
			return Promise.all(
				keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
			);
		}).then(() => self.clients.claim()).then(() => {
			self.clients.matchAll().then(clients => {
				clients.forEach(client => {
					client.postMessage({ type: 'SW_UPDATED', version: APP_VERSION });
				});
			});
		})
	);
});

self.addEventListener('fetch', event => {
	const url = new URL(event.request.url);

	// 非 http(s) 协议（data:, blob: 等）交给浏览器原生处理，避免 SW 拦截导致下载失败
	if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

	if (url.pathname.endsWith('/sw.js')) {
		event.respondWith(
			fetch(event.request).then(response => {
				if (response.ok) {
					const clone = response.clone();
					caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
				}
				return response;
			}).catch(() => caches.match(event.request))
		);
		return;
	}

	if (url.pathname.endsWith('/config.js')) {
		event.respondWith(
			caches.match(event.request).then(cached => {
				const networkFetch = fetch(event.request).then(response => {
					if (response.ok) {
						const clone = response.clone();
						caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
					}
					return response;
				}).catch(() => null);
				if (cached) return cached;
				return networkFetch.then(r => r || new Response('', { status: 503 }));
			})
		);
		return;
	}

	event.respondWith(
		caches.match(event.request).then(cached => {
			if (cached) return cached;
			return fetch(event.request).then(response => {
				if (response.ok && new URL(event.request.url).origin === self.location.origin) {
					const clone = response.clone();
					caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
				}
				return response;
			});
		})
	);
});

self.addEventListener('message', event => {
	if (event.data && event.data.type === 'CHECK_UPDATE') {
		fetch('/sw.js', { cache: 'no-store' }).then(response => {
			return response.text();
		}).then(text => {
			const match = text.match(/APP_VERSION\s*=\s*'([^']+)'/);
			if (match) {
				const remoteVersion = match[1];
				event.source.postMessage({
					type: 'UPDATE_RESULT',
					currentVersion: APP_VERSION,
					remoteVersion: remoteVersion,
					hasUpdate: remoteVersion !== APP_VERSION,
				});
			}
		}).catch(() => {
			event.source.postMessage({
				type: 'UPDATE_RESULT',
				currentVersion: APP_VERSION,
				remoteVersion: APP_VERSION,
				hasUpdate: false,
				error: true,
			});
		});
	}

	if (event.data && event.data.type === 'APPLY_UPDATE') {
		self.skipWaiting();
	}

	if (event.data && event.data.type === 'GET_VERSION') {
		event.source.postMessage({
			type: 'VERSION_INFO',
			version: APP_VERSION,
		});
	}
});
