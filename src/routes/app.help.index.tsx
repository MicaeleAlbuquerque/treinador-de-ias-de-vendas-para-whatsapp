import { createFileRoute } from "@tanstack/react-router";
import { getArticle } from "@/content/help";
import { HelpArticleView } from "@/components/help/HelpArticleView";

export const Route = createFileRoute("/app/help/")({
  component: HelpIndex,
});

function HelpIndex() {
  const article = getArticle("visao-geral");
  if (!article) return null;
  return <HelpArticleView article={article} />;
}