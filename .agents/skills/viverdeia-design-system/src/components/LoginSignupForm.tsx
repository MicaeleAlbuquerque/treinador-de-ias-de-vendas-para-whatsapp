import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { PenTool, Loader2 } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Mínimo 6 caracteres'),
});

const signupSchema = z.object({
  fullName: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  email: z.string().email('Email inválido'),
  password: z.string()
    .min(8, 'Mínimo 8 caracteres')
    .regex(/[A-Z]/, 'Deve conter pelo menos uma letra maiúscula')
    .regex(/[a-z]/, 'Deve conter pelo menos uma letra minúscula')
    .regex(/[0-9]/, 'Deve conter pelo menos um número'),
});

type LoginFormData = z.infer<typeof loginSchema>;
type SignupFormData = z.infer<typeof signupSchema>;

export function LoginSignupForm() {
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loginForm = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const signupForm = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
  });

  const toggle = (toSignUp: boolean) => {
    setError(null);
    setSuccess(null);
    loginForm.reset();
    signupForm.reset();
    setIsSignUp(toSignUp);
  };

  const onLogin = async (data: LoginFormData) => {
    try {
      setError(null);
      await signIn(data.email, data.password);
      navigate({ to: '/dashboard' });
    } catch {
      setError('Email ou senha incorretos');
    }
  };

  const onSignup = async (data: SignupFormData) => {
    try {
      setError(null);
      await signUp(data.email, data.password, data.fullName);
      toast.success('Conta criada! Verifique seu email para confirmar.');
      navigate({ to: '/dashboard' });
    } catch (err: any) {
      const msg = err?.message ?? '';
      if (msg.includes('already registered')) {
        setError('Este email já possui uma conta. Faça login.');
      } else if (msg.includes('email')) {
        setError('Verifique seu email para confirmar o cadastro.');
      } else {
        setError(msg || 'Erro ao criar conta. Tente novamente.');
      }
    }
  };

  const onForgot = async () => {
    const email = loginForm.getValues('email');
    if (!email) {
      setError('Digite seu email acima para redefinir a senha.');
      return;
    }
    try {
      setError(null);
      setSuccess(null);
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/reset-password',
      });
      if (resetError) throw resetError;
      setSuccess('Verifique seu email para redefinir a senha.');
    } catch {
      setError('Erro ao enviar email. Tente novamente.');
    }
  };

  return (
    <>
      <style>{`
        .auth-container {
          background-color: var(--bg-elevated);
          border-radius: 20px;
          box-shadow: 0 25px 80px rgba(26, 26, 46, 0.15);
          position: relative;
          overflow: hidden;
          width: 820px;
          max-width: 100%;
          min-height: 520px;
        }

        .auth-container .form-container {
          position: absolute;
          top: 0;
          height: 100%;
          transition: all 0.6s ease-in-out;
        }

        .auth-container .form-container form {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 0 40px;
          height: 100%;
        }

        .auth-container input {
          background-color: var(--bg-surface-1);
          border: none;
          margin: 6px 0;
          padding: 12px 16px;
          font-size: 14px;
          border-radius: 8px;
          width: 100%;
          outline: none;
          transition: background-color 0.2s;
        }

        .auth-container input:focus {
          background-color: var(--bg-surface-2);
        }

        .auth-container .auth-btn {
          background-color: var(--accent-primary);
          color: var(--primary-foreground);
          font-size: 13px;
          padding: 10px 45px;
          border: 1px solid transparent;
          border-radius: 8px;
          font-weight: 600;
          letter-spacing: 0.5px;
          text-transform: uppercase;
          margin-top: 10px;
          cursor: pointer;
          transition: background-color 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          min-width: 160px;
        }

        .auth-container .auth-btn:hover {
          background-color: var(--accent-primary-hover);
        }

        .auth-container .auth-btn:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .auth-container .auth-btn.ghost {
          background-color: transparent;
          border-color: var(--text-on-dark);
          color: var(--text-on-dark);
        }

        .auth-container .auth-btn.ghost:hover {
          background-color: rgba(255, 255, 255, 0.15);
        }

        .auth-container .sign-in {
          left: 0;
          width: 50%;
          z-index: 2;
        }

        .auth-container.active .sign-in {
          transform: translateX(100%);
        }

        .auth-container .sign-up {
          left: 0;
          width: 50%;
          opacity: 0;
          z-index: 1;
        }

        .auth-container.active .sign-up {
          transform: translateX(100%);
          opacity: 1;
          z-index: 5;
          animation: show 0.6s;
        }

        @keyframes show {
          0%, 49.99% { opacity: 0; z-index: 1; }
          50%, 100% { opacity: 1; z-index: 5; }
        }

        .auth-container .toggle-container {
          position: absolute;
          top: 0;
          left: 50%;
          width: 50%;
          height: 100%;
          overflow: hidden;
          transition: all 0.6s ease-in-out;
          border-radius: 150px 0 0 100px;
          z-index: 1000;
        }

        .auth-container.active .toggle-container {
          transform: translateX(-100%);
          border-radius: 0 150px 100px 0;
        }

        .auth-container .toggle {
          background-color: var(--accent-primary);
          height: 100%;
          background: linear-gradient(to right, var(--accent-primary-hover), var(--accent-primary));
          color: var(--text-on-dark);
          position: relative;
          left: -100%;
          width: 200%;
          transform: translateX(0);
          transition: all 0.6s ease-in-out;
        }

        .auth-container.active .toggle {
          transform: translateX(50%);
        }

        .auth-container .toggle-panel {
          position: absolute;
          width: 50%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-direction: column;
          padding: 0 30px;
          text-align: center;
          top: 0;
          transform: translateX(0);
          transition: all 0.6s ease-in-out;
        }

        .auth-container .toggle-left {
          transform: translateX(-200%);
        }

        .auth-container.active .toggle-left {
          transform: translateX(0);
        }

        .auth-container .toggle-right {
          right: 0;
          transform: translateX(0);
        }

        .auth-container.active .toggle-right {
          transform: translateX(200%);
        }

        .auth-container .toggle-panel h1 {
          font-size: 24px;
          font-weight: 700;
          margin-bottom: 8px;
        }

        .auth-container .toggle-panel p {
          font-size: 14px;
          line-height: 20px;
          letter-spacing: 0.3px;
          margin: 16px 0 24px;
          opacity: 0.9;
        }

        .auth-container .form-container h1 {
          font-size: 22px;
          font-weight: 700;
          color: var(--text-primary);
          margin-bottom: 4px;
        }

        .auth-container .form-error {
          color: var(--destructive);
          font-size: 13px;
          margin-top: 4px;
          text-align: center;
          width: 100%;
        }

        .auth-container .form-success {
          color: var(--accent-success);
          font-size: 13px;
          margin-top: 4px;
          text-align: center;
          width: 100%;
        }

        .auth-container .field-error {
          color: var(--destructive);
          font-size: 12px;
          width: 100%;
          text-align: left;
          margin-top: -2px;
          margin-bottom: 2px;
        }

        .auth-container .forgot-link {
          color: var(--text-tertiary);
          font-size: 13px;
          margin-top: 8px;
          cursor: pointer;
          background: none;
          border: none;
          text-decoration: none;
          transition: color 0.2s;
        }

        .auth-container .forgot-link:hover {
          color: var(--text-secondary);
        }

        .auth-container .logo {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 16px;
        }

        .auth-container .logo span {
          font-size: 20px;
          font-weight: 700;
          color: var(--text-primary);
        }

        @media (max-width: 768px) {
          .auth-container {
            min-height: auto;
          }

          .auth-container .form-container {
            position: relative;
            width: 100% !important;
            left: 0 !important;
            transform: none !important;
            opacity: 1 !important;
            z-index: 5 !important;
          }

          .auth-container .form-container form {
            padding: 32px 24px;
            min-height: 400px;
          }

          .auth-container .sign-up {
            display: none;
          }

          .auth-container.active .sign-in {
            display: none;
          }

          .auth-container.active .sign-up {
            display: block;
            transform: none;
          }

          .auth-container .toggle-container {
            display: none;
          }

          .auth-container .mobile-toggle {
            display: flex !important;
          }
        }

        @media (min-width: 769px) {
          .auth-container .mobile-toggle {
            display: none !important;
          }
        }
      `}</style>

      <div className={`auth-container${isSignUp ? ' active' : ''}`}>
        {/* Sign Up Form */}
        <div className="form-container sign-up">
          <form onSubmit={signupForm.handleSubmit(onSignup)}>
            <div className="logo">
              <PenTool className="h-7 w-7 text-accent-primary" />
              <span>Assina.ai</span>
            </div>
            <h1>Criar Conta</h1>
            <input
              type="text"
              placeholder="Nome completo"
              {...signupForm.register('fullName')}
            />
            {signupForm.formState.errors.fullName && (
              <p className="field-error">{signupForm.formState.errors.fullName.message}</p>
            )}
            <input
              type="email"
              placeholder="Email"
              {...signupForm.register('email')}
            />
            {signupForm.formState.errors.email && (
              <p className="field-error">{signupForm.formState.errors.email.message}</p>
            )}
            <input
              type="password"
              placeholder="Mín. 8 chars, maiúscula, minúscula e número"
              {...signupForm.register('password')}
            />
            {signupForm.formState.errors.password && (
              <p className="field-error">{signupForm.formState.errors.password.message}</p>
            )}
            {error && isSignUp && <p className="form-error">{error}</p>}
            <button
              type="submit"
              className="auth-btn"
              disabled={signupForm.formState.isSubmitting}
            >
              {signupForm.formState.isSubmitting && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              Cadastrar
            </button>
            <button
              type="button"
              className="forgot-link mobile-toggle"
              onClick={() => toggle(false)}
            >
              Já tem conta? Faça login
            </button>
          </form>
        </div>

        {/* Sign In Form */}
        <div className="form-container sign-in">
          <form onSubmit={loginForm.handleSubmit(onLogin)}>
            <div className="logo">
              <PenTool className="h-7 w-7 text-accent-primary" />
              <span>Assina.ai</span>
            </div>
            <h1>Entrar</h1>
            <input
              type="email"
              placeholder="Email"
              {...loginForm.register('email')}
            />
            {loginForm.formState.errors.email && (
              <p className="field-error">{loginForm.formState.errors.email.message}</p>
            )}
            <input
              type="password"
              placeholder="Senha"
              {...loginForm.register('password')}
            />
            {loginForm.formState.errors.password && (
              <p className="field-error">{loginForm.formState.errors.password.message}</p>
            )}
            {error && !isSignUp && <p className="form-error">{error}</p>}
            {success && <p className="form-success">{success}</p>}
            <button
              type="button"
              className="forgot-link"
              onClick={onForgot}
            >
              Esqueci minha senha
            </button>
            <button
              type="submit"
              className="auth-btn"
              disabled={loginForm.formState.isSubmitting}
            >
              {loginForm.formState.isSubmitting && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              Entrar
            </button>
            <button
              type="button"
              className="forgot-link mobile-toggle"
              onClick={() => toggle(true)}
            >
              Não tem conta? Cadastre-se
            </button>
          </form>
        </div>

        {/* Toggle Overlay */}
        <div className="toggle-container">
          <div className="toggle">
            <div className="toggle-panel toggle-left">
              <h1>Bem-vindo de volta!</h1>
              <p>Já tem conta? Entre com seus dados para acessar a plataforma.</p>
              <button
                type="button"
                className="auth-btn ghost"
                onClick={() => toggle(false)}
              >
                Entrar
              </button>
            </div>
            <div className="toggle-panel toggle-right">
              <h1>Olá, Bem-vindo!</h1>
              <p>Não tem conta? Cadastre-se e comece a assinar documentos agora.</p>
              <button
                type="button"
                className="auth-btn ghost"
                onClick={() => toggle(true)}
              >
                Cadastre-se
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
