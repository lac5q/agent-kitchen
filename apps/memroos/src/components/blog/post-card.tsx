import type { Post } from "@/lib/blog";

export function PostCard({ post }: { post: Post }) {
  const { slug, frontmatter } = post;
  const date = new Date(frontmatter.publishedAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <article className="border-b border-slate-100 pb-8">
      <time className="text-sm text-slate-400">{date}</time>
      <h2 className="text-xl font-semibold mt-1 mb-2">
        <a href={`/blog/${slug}`} className="hover:text-[#A8392C] transition-colors">
          {frontmatter.title}
        </a>
      </h2>
      <p className="text-slate-600 text-sm leading-relaxed">{frontmatter.description}</p>
      {frontmatter.tags?.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {frontmatter.tags.map((tag) => (
            <span key={tag} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
              {tag}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}
