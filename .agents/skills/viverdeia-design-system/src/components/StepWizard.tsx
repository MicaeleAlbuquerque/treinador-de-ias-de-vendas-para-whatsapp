import { Button } from './ui/button';
import { cn } from '../lib/utils';
import type { ReactNode } from 'react';

interface Step {
  label: string;
  content: ReactNode;
}

interface StepWizardProps {
  steps: Step[];
  currentStep: number;
  onNext: () => void;
  onBack: () => void;
  onComplete: () => void;
  canProceed?: boolean;
  isSubmitting?: boolean;
}

export function StepWizard({ steps, currentStep, onNext, onBack, onComplete, canProceed = true, isSubmitting }: StepWizardProps) {
  const isLast = currentStep === steps.length - 1;
  const isFirst = currentStep === 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Progress bar */}
      <div className="hidden items-center justify-between md:flex">
        {steps.map((step, i) => (
          <div key={i} className="flex items-center">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium',
                  i <= currentStep ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground',
                )}
              >
                {i + 1}
              </div>
              <span
                className={cn(
                  'text-sm font-medium',
                  i <= currentStep ? 'text-accent' : 'text-muted-foreground',
                )}
              >
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={cn('mx-4 h-0.5 w-12', i < currentStep ? 'bg-accent' : 'bg-muted')} />
            )}
          </div>
        ))}
      </div>

      {/* Mobile step indicator */}
      <div className="md:hidden">
        <p className="text-sm font-medium text-muted-foreground">
          Passo {currentStep + 1} de {steps.length}
        </p>
        <p className="text-lg font-semibold text-foreground">{steps[currentStep].label}</p>
      </div>

      {/* Content */}
      <div className="min-h-[300px]">{steps[currentStep].content}</div>

      {/* Navigation */}
      <div className="flex justify-between border-t pt-4">
        <Button variant="outline" onClick={onBack} disabled={isFirst}>
          Voltar
        </Button>
        {isLast ? (
          <Button onClick={onComplete} disabled={!canProceed || isSubmitting}>
            {isSubmitting ? 'Enviando...' : 'Enviar Envelope'}
          </Button>
        ) : (
          <Button onClick={onNext} disabled={!canProceed}>
            Próximo
          </Button>
        )}
      </div>
    </div>
  );
}
