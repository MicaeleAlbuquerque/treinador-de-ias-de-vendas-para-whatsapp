import type { LucideIcon } from "lucide-react";

type PhaseEmptyStateProps = {
  icon: LucideIcon;
  title: string;
  badge: string;
  description: string;
};

export function PhaseEmptyState({ icon: Icon, title, badge, description }: PhaseEmptyStateProps) {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <span className="via-label">{title}</span>
        <div className="mt-2 flex items-center gap-3">
          <h1 className="text-3xl">{title}</h1>
          <span className="via-badge via-badge-blue">{badge}</span>
        </div>
      </header>

      <section className="via-card flex flex-col items-center gap-4 py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[color:var(--via-blue-light)] text-[color:var(--via-blue)]">
          <Icon size={22} strokeWidth={1.75} />
        </div>
        <h2 className="text-xl">Em breve</h2>
        <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      </section>
    </div>
  );
}
