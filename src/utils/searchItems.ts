import type { BlogPost } from "./blogPosts";
import type { Link } from "./parseLinks";

export interface SearchCardItem {
	name: string;
	url: string;
	category: string;
	description: string;
	tag: string;
	icon?: string;
	target?: string;
}

export function linkToSearchCard(link: Link): SearchCardItem {
	return {
		name: link.name,
		url: link.url,
		category: link.category,
		description: link.description,
		tag: link.tag,
		icon: link.icon,
		target: link.target,
	};
}

export function blogPostToSearchCard(post: BlogPost, basePath: string): SearchCardItem {
	return {
		name: post.title,
		url: `${basePath}blogs/${post.slug}/`,
		category: "blogs",
		description: `${post.summary} ${post.body}`,
		tag: `${post.category} ${post.date}`,
		target: "_self",
	};
}

export function blogPostSearchText(post: BlogPost) {
	return `${post.title} ${post.date} ${post.category} ${post.summary} ${post.body}`.toLowerCase();
}
