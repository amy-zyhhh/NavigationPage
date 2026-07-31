import { defineMdastPlugin } from "satteri";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export default defineMdastPlugin({
	name: "loose-images",
	text(node, ctx) {
		if (typeof node.value !== "string") return;

		const image = markdownImageToNode(node.value, ctx);
		if (!image) return;

		ctx.replaceNode(node, image);
	},
	html(node, ctx) {
		if (typeof node.value !== "string") return;

		const image = htmlImageToNode(node.value, ctx);
		if (!image) return;

		ctx.replaceNode(node, image);
	},
});

function markdownImageToNode(value, ctx) {
	const match = value.trim().match(/^!\[([^\]]*)\]\((.+)\)$/);
	if (!match) return undefined;

	return imageNode({
		type: "image",
		url: cleanUrl(match[2]),
		alt: match[1],
		title: null,
		dimensions: readImageDimensions(cleanUrl(match[2]), ctx),
	});
}

function htmlImageToNode(value, ctx) {
	const trimmed = value.trim();
	if (!/^<img\b/i.test(trimmed)) return undefined;

	const src = readHtmlAttribute(trimmed, "src");
	if (!src) return undefined;

	const zoom = readZoomPercent(readHtmlAttribute(trimmed, "style"));

	return imageNode({
		type: "image",
		url: src,
		alt: readHtmlAttribute(trimmed, "alt") || "",
		title: readHtmlAttribute(trimmed, "title") || null,
		zoom,
		dimensions: readImageDimensions(src, ctx),
	});
}

function readHtmlAttribute(source, name) {
	const match = source.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, "i"));
	return match?.[2] ? cleanUrl(match[2]) : "";
}

function cleanUrl(value) {
	return value.trim().replace(/^<|>$/g, "");
}

function readZoomPercent(style) {
	const match = style.match(/(?:^|;)\s*zoom\s*:\s*(\d+(?:\.\d+)?%)\s*;?/i);
	return match?.[1] || "";
}

function imageNode({ type, url, alt, title, zoom, dimensions }) {
	const node = { type, url, alt, title };
	const hProperties = {};
	if (dimensions) {
		hProperties.width = dimensions.width;
		hProperties.height = dimensions.height;
	}
	if (zoom) {
		hProperties.style = `--blog-image-width: ${zoom};`;
	}
	if (Object.keys(hProperties).length > 0) {
		node.data = { hProperties };
	}
	return node;
}

function readImageDimensions(src, ctx) {
	if (!src || /^(?:[a-z]+:)?\/\//i.test(src) || src.startsWith("/")) return undefined;
	if (!ctx.fileURL) return undefined;

	const imagePath = path.resolve(path.dirname(fileURLToPath(ctx.fileURL)), src);
	if (!existsSync(imagePath)) return undefined;

	const buffer = readFileSync(imagePath);
	return readPngDimensions(buffer) || readJpegDimensions(buffer) || readWebpDimensions(buffer);
}

function readPngDimensions(buffer) {
	if (buffer.length < 24) return undefined;
	if (buffer.readUInt32BE(0) !== 0x89504e47 || buffer.toString("ascii", 1, 4) !== "PNG") return undefined;
	return {
		width: buffer.readUInt32BE(16),
		height: buffer.readUInt32BE(20),
	};
}

function readJpegDimensions(buffer) {
	if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return undefined;

	let offset = 2;
	while (offset + 9 < buffer.length) {
		if (buffer[offset] !== 0xff) return undefined;
		const marker = buffer[offset + 1];
		const length = buffer.readUInt16BE(offset + 2);
		if (length < 2) return undefined;
		if (marker >= 0xc0 && marker <= 0xc3) {
			return {
				height: buffer.readUInt16BE(offset + 5),
				width: buffer.readUInt16BE(offset + 7),
			};
		}
		offset += 2 + length;
	}
	return undefined;
}

function readWebpDimensions(buffer) {
	if (buffer.length < 30 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WEBP") {
		return undefined;
	}

	const type = buffer.toString("ascii", 12, 16);
	if (type === "VP8X") {
		return {
			width: 1 + buffer.readUIntLE(24, 3),
			height: 1 + buffer.readUIntLE(27, 3),
		};
	}
	if (type === "VP8 " && buffer.length >= 30) {
		return {
			width: buffer.readUInt16LE(26) & 0x3fff,
			height: buffer.readUInt16LE(28) & 0x3fff,
		};
	}
	return undefined;
}
