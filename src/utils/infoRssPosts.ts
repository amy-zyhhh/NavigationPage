export interface InfoRssError {
	title: string;
	url: string;
	sourceId?: string;
	sourceName?: string;
	stage: string;
	message: string;
	createdAt: string;
}

export interface InfoRssSource {
	id: string;
	name: string;
}

export interface InfoRssPost {
	title: string;
	date: string;
	category: string;
	summary: string;
	department: string;
	sourceId?: string;
	sourceName?: string;
	source: string;
	xxid: string;
	slug: string;
	htmlPath: string;
	preview: string;
	titleSummaryText?: string;
	searchText: string;
}

export interface InfoRssIndex {
	generatedAt: string;
	lastScrapeAt: string;
	total: number;
	errorCount: number;
	sources: InfoRssSource[];
	tags: string[];
	errors: InfoRssError[];
	posts: InfoRssPost[];
}

export function parseInfoRssIndex(raw: string): InfoRssPost[] {
	return parseInfoRssPayload(raw).posts;
}

export function parseInfoRssPayload(raw: string): InfoRssIndex {
	const parsed = JSON.parse(raw) as InfoRssPost[] | Partial<InfoRssIndex>;
	const posts = Array.isArray(parsed) ? parsed : parsed.posts || [];
	const sortedPosts = posts.sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
	const tags = Array.isArray(parsed) ? buildTags(sortedPosts) : parsed.tags || buildTags(sortedPosts);
	const sources = Array.isArray(parsed)
		? buildSources(sortedPosts)
		: normalizeSources(parsed.sources) || buildSources(sortedPosts);

	return {
		generatedAt: Array.isArray(parsed) ? "" : parsed.generatedAt || "",
		lastScrapeAt: Array.isArray(parsed) ? "" : parsed.lastScrapeAt || "",
		total: Array.isArray(parsed) ? sortedPosts.length : parsed.total || sortedPosts.length,
		errorCount: Array.isArray(parsed) ? 0 : parsed.errorCount || parsed.errors?.length || 0,
		sources,
		tags,
		errors: Array.isArray(parsed) ? [] : parsed.errors || [],
		posts: sortedPosts,
	};
}

export function infoRssPostSearchText(post: InfoRssPost) {
	return `${post.title} ${post.date} ${post.category} ${post.department} ${displaySourceName(post.sourceId, post.sourceName)} ${post.searchText}`.toLowerCase();
}

export function infoRssTitleSummarySearchText(post: InfoRssPost) {
	return `${post.title} ${post.summary} ${post.preview} ${post.titleSummaryText || ""}`.toLowerCase();
}

export function infoRssPreviewText(post: InfoRssPost, maxLength = 150) {
	const text = (post.summary || post.preview || "")
		.replace(/\s+/g, " ")
		.trim();

	return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function buildTags(posts: InfoRssPost[]) {
	const tags: string[] = [];
	posts.forEach((post) => {
		const tag = post.category?.trim();
		if (tag && !tags.includes(tag)) tags.push(tag);
	});
	return tags;
}

function buildSources(posts: InfoRssPost[]) {
	const sources: InfoRssSource[] = [];
	posts.forEach((post) => {
		const id = post.sourceId || "info_all";
		const name = displaySourceName(id, post.sourceName);
		if (!sources.some((source) => source.id === id)) {
			sources.push({ id, name });
		}
	});
	return sources;
}

function normalizeSources(sources?: InfoRssSource[]) {
	if (!sources?.length) return null;
	return sources.map((source) => ({
		id: source.id,
		name: displaySourceName(source.id, source.name),
	}));
}

function displaySourceName(id = "", name = "") {
	if (id === "info_all" && (!name || name === id)) return "清华信息门户-全部";
	if (name) return name;
	return id;
}
