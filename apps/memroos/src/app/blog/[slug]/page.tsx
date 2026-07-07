import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { getAllPostSlugs, getPostBySlug } from "@/lib/blog";
import { articleSchema, breadcrumbSchema, JsonLd } from "@/lib/schema";
import { makeCanonical, BASE_URL } from "@/lib/metadata";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return getAllPostSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return {};
  const { frontmatter } = post;
  return {
    title: `${frontmatter.title} | MemroOS`,
    description: frontmatter.description,
    keywords: frontmatter.keywords,
    alternates: { canonical: makeCanonical(`/blog/${slug}`) },
    openGraph: {
      title: frontmatter.title,
      description: frontmatter.description,
      url: `${BASE_URL}/blog/${slug}`,
      type: "article",
      publishedTime: frontmatter.publishedAt,
      modifiedTime: frontmatter.updatedAt ?? frontmatter.publishedAt,
    },
  };
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();

  const { frontmatter, content } = post;

  const date = new Date(frontmatter.publishedAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const breadcrumbs = [
    { name: "MemroOS", url: BASE_URL },
    { name: "Blog", url: `${BASE_URL}/blog` },
    { name: frontmatter.title, url: `${BASE_URL}/blog/${slug}` },
  ];

  return (
    <>
      <JsonLd
        data={articleSchema({
          title: frontmatter.title,
          description: frontmatter.description,
          url: `${BASE_URL}/blog/${slug}`,
          publishedAt: frontmatter.publishedAt,
          updatedAt: frontmatter.updatedAt,
          author: frontmatter.author,
        })}
      />
      <JsonLd data={breadcrumbSchema(breadcrumbs)} />
      <main className="mx-auto max-w-3xl px-4 py-16">
        <nav className="mb-8 text-sm text-slate-500">
          <Link href="/" className="hover:text-slate-900">MemroOS</Link>
          {" / "}
          <Link href="/blog" className="hover:text-slate-900">Blog</Link>
          {" / "}
          <span>{frontmatter.title}</span>
        </nav>

        <header className="mb-10">
          <h1 className="text-4xl font-bold mb-4">{frontmatter.title}</h1>
          <p className="text-xl text-slate-600 mb-4">{frontmatter.description}</p>
          <time className="text-sm text-slate-400">{date}</time>
          {frontmatter.tags?.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {frontmatter.tags.map((tag) => (
                <span key={tag} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </header>

        <article className="blog-prose text-slate-700 leading-relaxed">
          <ReactMarkdown>{content}</ReactMarkdown>
        </article>

        <div className="mt-16 rounded-xl bg-[#F2E2DC]/40 border border-[#A8392C]/30 p-8 text-center">
          <h2 className="text-2xl font-bold mb-3">Try MemroOS</h2>
          <p className="text-slate-600 mb-6">
            Self-hosted agentic memory and orchestration. Ready in 5 minutes.
          </p>
          <a
            href="https://github.com/lac5q/memroos"
            className="inline-flex items-center gap-2 rounded-lg bg-slate-950 text-white px-6 py-3 font-semibold hover:bg-slate-800 hover:shadow-[inset_0_-3px_0_#A8392C] transition-all"
          >
            Get Started on GitHub →
          </a>
        </div>
      </main>
    </>
  );
}
