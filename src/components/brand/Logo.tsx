import lockupBlack from "@/assets/brand/viverdeia-lockup-black.svg";
import lockupWhite from "@/assets/brand/viverdeia-lockup-white.svg";
import iconBlack from "@/assets/brand/viverdeia-icon-black.svg";
import iconWhite from "@/assets/brand/viverdeia-icon-white.svg";

type LogoProps = {
  variant?: "lockup" | "icon";
  tone?: "dark" | "light" | "auto";
  className?: string;
};

export function Logo({ variant = "lockup", tone = "auto", className = "" }: LogoProps) {
  if (tone === "light") {
    const src = variant === "icon" ? iconWhite : lockupWhite;
    return <img src={src} alt="Viver de IA" className={className} />;
  }

  if (tone === "dark") {
    const src = variant === "icon" ? iconBlack : lockupBlack;
    return <img src={src} alt="Viver de IA" className={className} />;
  }

  // tone === "auto" (padrão): adapta automaticamente com classes do Tailwind dark:
  const isIcon = variant === "icon";
  return (
    <span className="inline-flex items-center">
      <img
        src={isIcon ? iconBlack : lockupBlack}
        alt="Viver de IA"
        className={`${className} dark:hidden block`}
      />
      <img
        src={isIcon ? iconWhite : lockupWhite}
        alt="Viver de IA"
        className={`${className} hidden dark:block`}
      />
    </span>
  );
}