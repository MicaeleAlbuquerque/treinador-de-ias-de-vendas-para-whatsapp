import { createFileRoute, useNavigate, Link } from '@tanstack/react-router';
import { PenTool, Upload, Shield, BarChart3 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Skeleton } from '../components/ui/skeleton';

export const Route = createFileRoute('/')({
  component: LandingPage,
});

const FEATURES = [
  {
    icon: Upload,
    title: 'Envio fácil',
    description: 'Faça upload do PDF e defina os signatários em minutos',
  },
  {
    icon: Shield,
    title: 'Assinatura segura',
    description: 'Assinatura digital com trilha de auditoria completa',
  },
  {
    icon: BarChart3,
    title: 'Acompanhamento',
    description: 'Dashboard em tempo real com status de cada documento',
  },
] as const;

function LandingPage() {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Skeleton className="h-12 w-48" />
      </div>
    );
  }

  if (user) {
    navigate({ to: '/dashboard' });
    return null;
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 md:px-12">
        <div className="flex items-center gap-2">
          <PenTool className="h-7 w-7 text-indigo-600" />
          <span className="text-xl font-bold text-gray-900">Assina.ai</span>
        </div>
        <Link to="/login">
          <Button variant="outline">Entrar</Button>
        </Link>
      </header>

      {/* Hero */}
      <section className="flex flex-col items-center px-6 py-20 text-center md:py-32">
        <h1 className="max-w-2xl text-4xl font-bold tracking-tight text-gray-900 md:text-5xl">
          Assine contratos digitalmente
        </h1>
        <p className="mt-4 max-w-lg text-lg text-gray-500">
          Envie, assine e gerencie contratos de forma segura e rápida.
        </p>
        <Link to="/login" className="mt-8">
          <Button size="lg" className="bg-indigo-600 hover:bg-indigo-700 text-base px-8">
            Começar agora
          </Button>
        </Link>
      </section>

      {/* Features */}
      <section className="bg-gray-50 px-6 py-16 md:py-24">
        <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-3">
          {FEATURES.map((feature) => (
            <Card key={feature.title}>
              <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100">
                  <feature.icon className="h-6 w-6 text-indigo-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">{feature.title}</h3>
                <p className="text-sm text-gray-500">{feature.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-8 text-center text-sm text-gray-400">
        © 2026 Assina.ai — Plataforma de assinatura digital
      </footer>
    </div>
  );
}
