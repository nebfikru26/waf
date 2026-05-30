import React from "react";

interface LogoProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  className?: string;
  showText?: boolean;
  blend?: boolean;
}

export function Logo({ className = "h-full w-auto", showText = false, blend = false, ...props }: LogoProps) {
  return (
    <div className={`flex items-center group transition-all duration-300 ${blend ? 'opacity-90 hover:opacity-100' : ''} ${className}`}>
      <div className="relative h-full w-auto flex items-center justify-center">
        <img 
          src="/images/brand-logo.png?v=2" 
          alt="AffiniSecurity" 
          className="h-full w-auto object-contain"
          {...props}
        />
      </div>
    </div>
  );
}
