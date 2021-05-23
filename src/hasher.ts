import { toBigIntBE } from "bigint-buffer";
import { crc32, crc64 } from "node-crc";

const internalWDFnv64 = (string: string): bigint => {
    string = normalizeString(string);
    let hash = 0xCBF29CE484222325n;
    for (let i = 0; i < string.length; i++) {
        const c = string.charCodeAt(i);
        hash *= 0x100000001B3n;
        hash ^= BigInt(c);
        hash &= 0xFFFFFFFFFFFFFFFFn;
    }
    return hash;
};

export const normalizeString = (s: string) => s.toLowerCase().replace(/\//g, "\\").replace(/[\n\r]/g, "");

// WD1
export const hashWDFnv32 = (string: string): bigint => {
    const hash64 = hashWDFnv64(string);
	const hash32 = hash64 & 0xFFFFFFFFn;
	if ((hash32 & 0xFFFF0000n) === 0xFFFF0000n) {
		return hash32 & ~(1n << 16n);
	}
	return hash32;
};

// WD2
export const hashWDFnv64 = (string: string): bigint => internalWDFnv64(string) & 0x1FFFFFFFFFFFFFFFn | 0xA000000000000000n;

export const hashCrc32 = (string: string): bigint => toBigIntBE(crc32(Buffer.from(string, "utf8")) as Buffer);

export const hashCrc64 = (string: string): bigint => toBigIntBE(crc64(Buffer.from(string, "utf8")) as Buffer);


export const toHexString = (num: bigint): string => {
    let s = num.toString(16);
    if (num > 0xFFFFFFFFn) {
        s = s.padStart(16, "0");
    } else {
        s = s.padStart(8, "0");
    }
    return s.toUpperCase();
};

export const toReverseHexString = (num: bigint | string) => reverseHexString(typeof num === "string" ? num : toHexString(num));

export const reverseHexString = (str: string): string => {
    if (str.length % 2 !== 0) {
        throw new Error("Input hex string length must be a multiple of 2");
    }
    const len = str.length;
    let res = "";
    for (let i = len - 1; i >= 0; i -= 2) {
        res += str[i - 1];
        res += str[i];
    }
    return res;
};
