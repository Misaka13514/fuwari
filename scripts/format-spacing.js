import fs from "node:fs";
import path from "node:path";

function walkDir(dir) {
	let results = [];
	const list = fs.readdirSync(dir);
	for (const file of list) {
		const fullPath = path.join(dir, file);
		const stat = fs.statSync(fullPath);
		if (stat.isDirectory()) {
			results = results.concat(walkDir(fullPath));
		} else if (file.endsWith(".md") || file.endsWith(".mdx")) {
			results.push(fullPath);
		}
	}
	return results;
}

// CJK characters range (Hiragana, Katakana, CJK Unified Ideographs, etc.)
const CJK = "\\u3040-\\u30ff\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff";
const RUBY_SYNTAX = "\\{[^{}]+\\}\\([^()]+\\)";
const ENGLISH_WORD = "[A-Za-z]+(?:'[A-Za-z]+)?";

export function formatSpacing(content) {
	// Split by frontmatter
	let frontmatter = "";
	let body = content;

	const fmMatch = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/);
	if (fmMatch) {
		frontmatter = fmMatch[0];
		body = content.slice(frontmatter.length);
	}

	// Split by codeblocks to avoid touching code
	const codeBlocks = [];
	const placeholder = (idx) => `__CODE_BLOCK_PLACEHOLDER_${idx}__`;

	body = body.replace(/(```[\s\S]*?```|`[^`\n]+`)/g, (match) => {
		const idx = codeBlocks.length;
		codeBlocks.push(match);
		return placeholder(idx);
	});

	// Split by lines
	const lines = body.split("\n");

	const formattedLines = lines.map((line) => {
		// Do not touch markdown image/link URLs: [text](url) -> we only touch text outside URLs
		// First, separate links or process plain lines
		let l = line;

		// 1. CJK followed by Ruby syntax: CJK {base}(rt)
		l = l.replace(
			new RegExp(`([${CJK}])\\s*(${RUBY_SYNTAX})`, "g"),
			"$1 $2",
		);
		// 2. Ruby syntax followed by CJK: {base}(rt) CJK
		l = l.replace(
			new RegExp(`(${RUBY_SYNTAX})\\s*([${CJK}])`, "g"),
			"$1 $2",
		);

		// 3. CJK followed by English word: CJK Eng
		l = l.replace(
			new RegExp(`([${CJK}])\\s*(${ENGLISH_WORD})`, "g"),
			"$1 $2",
		);
		// 4. English word followed by CJK: Eng CJK
		l = l.replace(
			new RegExp(`(${ENGLISH_WORD})\\s*([${CJK}])`, "g"),
			"$1 $2",
		);

		// 5. Ensure NO spaces between CJK and Numbers: 2027年, 16区, 3回
		l = l.replace(
			new RegExp(`([${CJK}])\\s+([0-9])`, "g"),
			"$1$2",
		);
		l = l.replace(
			new RegExp(`([0-9])\\s+([${CJK}])`, "g"),
			"$1$2",
		);

		return l;
	});

	body = formattedLines.join("\n");

	// Restore code blocks
	body = body.replace(/__CODE_BLOCK_PLACEHOLDER_(\d+)__/g, (_, idx) => {
		return codeBlocks[Number(idx)];
	});

	return frontmatter + body;
}

// CLI execution
const targetDir = process.argv[2] || "./src/content";
const files = walkDir(targetDir);
let changedCount = 0;

for (const file of files) {
	// Skip official government document post to keep its raw archival wording
	if (file.includes("japan-foreign-resident-alias-guidelines-2018.md")) {
		continue;
	}

	const original = fs.readFileSync(file, "utf-8");
	const formatted = formatSpacing(original);
	if (original !== formatted) {
		fs.writeFileSync(file, formatted, "utf-8");
		console.log(`Formatted: ${file}`);
		changedCount++;
	}
}

console.log(`Done! ${changedCount} file(s) updated.`);
