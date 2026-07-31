export interface InfoRssPost {
	title: string;
	date: string;
	category: string;
	summary: string;
	department: string;
	source: string;
	xxid: string;
	slug: string;
	htmlPath: string;
	preview: string;
	searchText: string;
}

export function parseInfoRssIndex(raw: string) {
	const posts = JSON.parse(raw) as InfoRssPost[];
	return posts.sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
}

export function infoRssPostSearchText(post: InfoRssPost) {
	return `${post.title} ${post.date} ${post.category} ${post.department} ${post.searchText}`.toLowerCase();
}

export function infoRssPreviewText(post: InfoRssPost, maxLength = 150) {
	const text = (post.summary || post.preview || "")
		.replace(/\s+/g, " ")
		.trim();

	return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}
