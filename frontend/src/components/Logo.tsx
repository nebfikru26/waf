import { useBranding } from "@/components/BrandingProvider";

interface LogoProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  className?: string;
  showText?: boolean;
  blend?: boolean;
}

export function Logo({ className = "h-full w-auto", showText = false, blend = false, ...props }: LogoProps) {
  const { logoUrl, siteName } = useBranding();

  return (
    <div className={`flex items-center group transition-all duration-300 ${blend ? 'opacity-90 hover:opacity-100' : ''} ${className}`}>
      <div className="relative h-full w-auto flex items-center justify-center">
        <img
          src={logoUrl || "/images/brand-logo.png"}
          alt={siteName || "AffiniSecurity"}
          className="h-full w-auto object-contain"
          {...props}
        />
      </div>
    </div>
  );
}
