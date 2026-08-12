import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { HelpArticle } from "@/content/help";

export function HelpArticleView({ article }: { article: HelpArticle }) {
  return (
    <article className="prose prose-sm max-w-3xl prose-headings:text-foreground prose-headings:font-normal prose-h1:text-3xl prose-h2:text-xl prose-h2:mt-8 prose-h3:text-base prose-p:text-foreground prose-li:text-foreground prose-strong:text-foreground prose-a:text-[color:var(--via-blue)] prose-a:no-underline hover:prose-a:underline prose-code:text-[color:var(--via-blue)] prose-code:bg-secondary prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{article.content}</ReactMarkdown>
    </article>
  );
}