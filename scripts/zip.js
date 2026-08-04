// ZIP 工具模块：STORE 方法（无压缩）+ CRC32
// 用于缩略图打包导出/导入（10.1 / 10.2 / 10.3）
// 缩略图本身已是 WebP 压缩格式，再压缩无收益，STORE 即可。

// ========== CRC32 ==========
// 多项式 0xEDB88320，预计算表
const _CRC32_TABLE = (() => {
	const table = new Uint32Array(256);
	for (let i = 0; i < 256; i++) {
		let c = i;
		for (let k = 0; k < 8; k++) {
			c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
		}
		table[i] = c >>> 0;
	}
	return table;
})();

function crc32(bytes) {
	let c = 0xFFFFFFFF;
	for (let i = 0; i < bytes.length; i++) {
		c = _CRC32_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
	}
	return (c ^ 0xFFFFFFFF) >>> 0;
}

// ========== 工具函数 ==========
// UTF-8 编码字符串为 Uint8Array
function _strToBytes(str) {
	return new TextEncoder().encode(str);
}

// 将 Uint32 写入字节数组（小端序）
function _writeUint32LE(bytes, offset, value) {
	bytes[offset]     = value & 0xFF;
	bytes[offset + 1] = (value >>> 8) & 0xFF;
	bytes[offset + 2] = (value >>> 16) & 0xFF;
	bytes[offset + 3] = (value >>> 24) & 0xFF;
}

// 将 Uint16 写入字节数组（小端序）
function _writeUint16LE(bytes, offset, value) {
	bytes[offset]     = value & 0xFF;
	bytes[offset + 1] = (value >>> 8) & 0xFF;
}

// DOS 时间戳转换（当地时区）
// date: Date 对象
// 返回 { time, date }：Uint16 时间、Uint16 日期
function _dosDateTime(date) {
	const time = ((date.getHours() & 0x1F) << 11) |
	             ((date.getMinutes() & 0x3F) << 5) |
	                     ((date.getSeconds() >> 1) & 0x1F);
	const day = (((date.getFullYear() - 1980) & 0x7F) << 9) |
	                    ((date.getMonth() + 1) & 0x0F) << 5 |
	                     (date.getDate() & 0x1F);
	return { time: time & 0xFFFF, date: day & 0xFFFF };
}

// ========== ZIP 打包（STORE）==========
// entries: [{ name: string, data: Uint8Array | ArrayBuffer | Blob }]
// 返回 Blob（application/zip）
export async function createZip(entries) {
	// 预先把所有 data 转为 Uint8Array
	const items = [];
	for (const e of entries) {
		const nameBytes = _strToBytes(e.name);
		let dataBytes;
		if (e.data instanceof Uint8Array) dataBytes = e.data;
		else if (e.data instanceof ArrayBuffer) dataBytes = new Uint8Array(e.data);
		else if (e.data instanceof Blob) dataBytes = new Uint8Array(await e.data.arrayBuffer());
		else throw new Error('ZIP 项数据类型不支持');
		items.push({ name: e.name, nameBytes, data: dataBytes });
	}

	// 计算总长度
	let totalSize = 0;
	for (const it of items) {
		// local file header: 30 + nameBytes.length + data.length
		totalSize += 30 + it.nameBytes.length + it.data.length;
	}
	// central directory
	const centralSize = items.reduce((s, it) =>
		s + 46 + it.nameBytes.length, 0);
	// end of central directory: 22
	totalSize += centralSize + 22;

	const out = new Uint8Array(totalSize);
	let offset = 0;
	const now = new Date();
	const dos = _dosDateTime(now);
	const centralEntries = [];

	for (const it of items) {
		const crc = crc32(it.data);
		const nameLen = it.nameBytes.length;
		const dataLen = it.data.length;
		const localHeaderOffset = offset;

		// === Local file header ===
		// 0  PK\003\004  (4 bytes)
		out[offset]     = 0x50; out[offset + 1] = 0x4B;
		out[offset + 2] = 0x03; out[offset + 3] = 0x04;
		// 4  version needed (2) = 20 (2.0)
		_writeUint16LE(out, offset + 4, 20);
		// 6  general purpose bit flag (2) = 0
		_writeUint16LE(out, offset + 6, 0);
		// 8  compression method (2) = 0 (STORE)
		_writeUint16LE(out, offset + 8, 0);
		// 10 last mod file time (2)
		_writeUint16LE(out, offset + 10, dos.time);
		// 12 last mod file date (2)
		_writeUint16LE(out, offset + 12, dos.date);
		// 14 CRC-32 (4)
		_writeUint32LE(out, offset + 14, crc);
		// 18 compressed size (4)
		_writeUint32LE(out, offset + 18, dataLen);
		// 22 uncompressed size (4)
		_writeUint32LE(out, offset + 22, dataLen);
		// 26 file name length (2)
		_writeUint16LE(out, offset + 26, nameLen);
		// 28 extra field length (2) = 0
		_writeUint16LE(out, offset + 28, 0);
		offset += 30;
		// name
		out.set(it.nameBytes, offset);
		offset += nameLen;
		// data
		out.set(it.data, offset);
		offset += dataLen;

		centralEntries.push({ nameBytes: it.nameBytes, crc, dataLen, localHeaderOffset });
	}

	// === Central directory ===
	const centralStart = offset;
	for (const ce of centralEntries) {
		const nameLen = ce.nameBytes.length;
		// 0  PK\001\002  (4 bytes)
		out[offset]     = 0x50; out[offset + 1] = 0x4B;
		out[offset + 2] = 0x01; out[offset + 3] = 0x02;
		// 4  version made by (2) = 20
		_writeUint16LE(out, offset + 4, 20);
		// 6  version needed (2) = 20
		_writeUint16LE(out, offset + 6, 20);
		// 8  general purpose bit flag (2) = 0
		_writeUint16LE(out, offset + 8, 0);
		// 10 compression method (2) = 0
		_writeUint16LE(out, offset + 10, 0);
		// 12 last mod file time (2)
		_writeUint16LE(out, offset + 12, dos.time);
		// 14 last mod file date (2)
		_writeUint16LE(out, offset + 14, dos.date);
		// 16 CRC-32 (4)
		_writeUint32LE(out, offset + 16, ce.crc);
		// 20 compressed size (4)
		_writeUint32LE(out, offset + 20, ce.dataLen);
		// 24 uncompressed size (4)
		_writeUint32LE(out, offset + 24, ce.dataLen);
		// 28 file name length (2)
		_writeUint16LE(out, offset + 28, nameLen);
		// 30 extra field length (2) = 0
		_writeUint16LE(out, offset + 30, 0);
		// 32 file comment length (2) = 0
		_writeUint16LE(out, offset + 32, 0);
		// 34 disk number start (2) = 0
		_writeUint16LE(out, offset + 34, 0);
		// 36 internal file attributes (2) = 0
		_writeUint16LE(out, offset + 36, 0);
		// 38 external file attributes (4) = 0
		_writeUint32LE(out, offset + 38, 0);
		// 42 relative offset of local header (4)
		_writeUint32LE(out, offset + 42, ce.localHeaderOffset);
		offset += 46;
		// name
		out.set(ce.nameBytes, offset);
		offset += nameLen;
	}
	const centralEnd = offset;

	// === End of central directory ===
	// 0  PK\005\006  (4 bytes)
	out[offset]     = 0x50; out[offset + 1] = 0x4B;
	out[offset + 2] = 0x05; out[offset + 3] = 0x06;
	// 4  number of this disk (2) = 0
	_writeUint16LE(out, offset + 4, 0);
	// 6  disk where central directory starts (2) = 0
	_writeUint16LE(out, offset + 6, 0);
	// 8  number of central directory records on this disk (2)
	_writeUint16LE(out, offset + 8, centralEntries.length);
	// 10 total number of central directory records (2)
	_writeUint16LE(out, offset + 10, centralEntries.length);
	// 12 size of central directory (4)
	_writeUint32LE(out, offset + 12, centralEnd - centralStart);
	// 16 offset of start of central directory (4)
	_writeUint32LE(out, offset + 16, centralStart);
	// 20 comment length (2) = 0
	_writeUint16LE(out, offset + 20, 0);

	return new Blob([out], { type: 'application/zip' });
}

// ========== ZIP 解析（仅支持 STORE）==========
// blob: Blob (zip 文件)
// 返回 [{ name: string, data: Uint8Array }]
export async function readZip(blob) {
	const buf = new Uint8Array(await blob.arrayBuffer());
	const result = [];

	// 从末尾查找 End of Central Directory 记录
	// EOCD 最小 22 字节，最大 22 + 65535（注释）
	const minEOCD = 22;
	const maxScan = Math.min(buf.length, 65535 + minEOCD);
	if (buf.length < minEOCD) return result;

	let eocdOffset = -1;
	for (let i = buf.length - minEOCD; i >= buf.length - maxScan && i >= 0; i--) {
		if (buf[i] === 0x50 && buf[i + 1] === 0x4B &&
		    buf[i + 2] === 0x05 && buf[i + 3] === 0x06) {
			eocdOffset = i;
			break;
		}
	}
	if (eocdOffset < 0) throw new Error('未找到 EOCD 记录，非有效 ZIP 文件');

	// 读取 central directory 起始偏移与记录数
	const centralCount = (buf[eocdOffset + 10] | (buf[eocdOffset + 11] << 8)) & 0xFFFF;
	const centralOffset = (buf[eocdOffset + 16] |
	                       (buf[eocdOffset + 17] << 8) |
	                       (buf[eocdOffset + 18] << 16) |
	                       (buf[eocdOffset + 19] << 24)) >>> 0;

	let off = centralOffset;
	for (let i = 0; i < centralCount; i++) {
		// 校验 PK\001\002
		if (buf[off] !== 0x50 || buf[off + 1] !== 0x4B ||
		    buf[off + 2] !== 0x01 || buf[off + 3] !== 0x02) {
			throw new Error('Central directory 记录损坏');
		}
		// 10 compression method
		const method = (buf[off + 10] | (buf[off + 11] << 8)) & 0xFFFF;
		// 28 file name length
		const nameLen = (buf[off + 28] | (buf[off + 29] << 8)) & 0xFFFF;
		// 30 extra field length
		const extraLen = (buf[off + 30] | (buf[off + 31] << 8)) & 0xFFFF;
		// 32 file comment length
		const commentLen = (buf[off + 32] | (buf[off + 33] << 8)) & 0xFFFF;
		// 42 relative offset of local header
		const localOff = ((buf[off + 42] | (buf[off + 43] << 8) |
		                    (buf[off + 44] << 16) | (buf[off + 45] << 24)) >>> 0);

		// 提取文件名
		const nameBytes = buf.subarray(off + 46, off + 46 + nameLen);
		const name = new TextDecoder().decode(nameBytes);

		// 跳到下一 central record
		off += 46 + nameLen + extraLen + commentLen;

		if (method !== 0) {
			// 仅支持 STORE，遇到压缩项跳过
			result.push({ name, data: null, error: 'unsupported method: ' + method });
			continue;
		}

		// 读取 local file header
		// 26 file name length
		const lNameLen = (buf[localOff + 26] | (buf[localOff + 27] << 8)) & 0xFFFF;
		// 28 extra field length
		const lExtraLen = (buf[localOff + 28] | (buf[localOff + 29] << 8)) & 0xFFFF;
		// 22 uncompressed size
		const size = ((buf[localOff + 22] | (buf[localOff + 23] << 8) |
		               (buf[localOff + 24] << 16) | (buf[localOff + 25] << 24)) >>> 0);
		const dataStart = localOff + 30 + lNameLen + lExtraLen;
		const data = buf.subarray(dataStart, dataStart + size);
		// 拷贝避免 subarray 引用整个大缓冲区
		result.push({ name, data: new Uint8Array(data) });
	}

	return result;
}
