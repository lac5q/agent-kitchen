import fs from "fs";
import path from "path";
import matter from "gray-matter";

export interface PostFrontmatter {
  title: string;
  description: string;
  publishedAt: string;
  updatedAt?: string;
  tags: string[];
  keywords: string[];
  author?: string;
}

export interface Post {
  slug: string;
  frontmatter: PostFrontmatter;
  content: string;
}

const CONTENT_DIR_CANDIDATES = [
  path.join(process.cwd(), "content/blog"),
  path.resolve(process.cwd(), "../../content/blog"),
];

function getContentDir(): string | null {
  return CONTENT_DIR_CANDIDATES.find((dir) => fs.existsSync(dir)) ?? null;
}

export function getAllPostSlugs(): string[] {
  const contentDir = getContentDir();
  if (!contentDir) return [];
  return fs
    .readdirSync(contentDir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""));
}

export function getPostBySlug(slug: string): Post | null {
  const contentDir = getContentDir();
  if (!contentDir) return null;
  const filePath = path.join(contentDir, `${slug}.md`);
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, "utf-8");
  const { data, content } = matter(raw);
  return {
    slug,
    frontmatter: data as PostFrontmatter,
    content,
  };
}

export function getAllPosts(): Post[] {
  return getAllPostSlugs()
    .map((slug) => getPostBySlug(slug))
    .filter((p): p is Post => p !== null)
    .sort(
      (a, b) =>
        new Date(b.frontmatter.publishedAt).getTime() -
        new Date(a.frontmatter.publishedAt).getTime()
    );
}
