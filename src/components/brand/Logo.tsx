import lockupBlack from "@/assets/brand/viverdeia-lockup-black.svg";
import lockupWhite from "@/assets/brand/viverdeia-lockup-white.svg";
import iconBlack from "@/assets/brand/viverdeia-icon-black.svg";
import iconWhite from "@/assets/brand/viverdeia-icon-white.svg";

type LogoProps = {
  variant?: "lockup" | "icon";
  tone?: "dark" | "light";
  className?: string;
};

export function Logo({ variant = "lockup", tone = "dark", className }: LogoProps) {
  const src =
    variant === "icon"
      ? tone === "light"
        ? iconWhite
        : iconBlack
      : tone === "light"
        ? lockupWhite
        : lockupBlack;
  return <img src={src} alt="Viver de IA" className={className} />;
}