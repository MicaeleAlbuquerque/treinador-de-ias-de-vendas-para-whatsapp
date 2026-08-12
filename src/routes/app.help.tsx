import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { helpArticles, helpCategories } from "@/content/help";

export const Route = createFileRoute("/app/help")({
  component: HelpLayout,
});

function HelpLayout() {
  const location = useLocation();
  const currentSlug = location.pathname.replace(/^\/app\/help\/?/, "") || "visao-geral";

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header>
        <span className="via-label">Ajuda</span>
        <h1 className="mt-2 text-3xl">Ajuda</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tudo sobre o sistema, atualizado a cada nova feature.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-[240px_1fr]">
        <aside className="space-y-6">
          {helpCategories.map((category) => {
            const items = helpArticles.filter((a) => a.category === category);
            if (items.length === 0) return null;
            return (
              <div key={category}>
                <div className="via-label mb-2">{category}</div>
                <ul className="space-y-0.5">
                  {items.map((a) => {
                    const active = a.slug === currentSlug;
                    return (
                      <li key={a.slug}>
                        <Link
                          to="/app/help/$slug"
                          params={{ slug: a.slug }}
                          className={`block rounded-md px-3 py-1.5 text-sm transition-colors ${
                            active
                              ? "bg-secondary text-[color:var(--via-navy)]"
                              : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                          }`}
                        >
                          {a.title}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </aside>

        <section className="min-w-0">
          <Outlet />
        </section>
      </div>
    </div>
  );
}