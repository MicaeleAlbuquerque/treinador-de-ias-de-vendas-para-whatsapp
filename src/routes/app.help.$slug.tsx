import { createFileRoute, Link } from "@tanstack/react-router";
import { getArticle } from "@/content/help";
import { HelpArticleView } from "@/components/help/HelpArticleView";

export const Route = createFileRoute("/app/help/$slug")({
  component: HelpArticlePage,
});

function HelpArticlePage() {
  const { slug } = Route.useParams();
  const article = getArticle(slug);

  if (!article) {
    return (
      <div className="via-card flex flex-col items-center gap-3 py-16 text-center">
        <h2 className="text-xl">Artigo não encontrado</h2>
        <p className="text-sm text-muted-foreground">
          O artigo que você tentou abrir não existe ou foi movido.
        </p>
        <Link
          to="/app/help"
          className="text-sm text-[color:var(--via-blue)] hover:underline"
        >
          Voltar para a ajuda
        </Link>
      </div>
    );
  }

  return <HelpArticleView article={article} />;
}