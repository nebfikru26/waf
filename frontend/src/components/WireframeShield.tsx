import React from "react";

export function WireframeShield({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 400 400" className={`overflow-visible ${className}`}>
      <defs>
        <radialGradient id="shield-glow" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
          <stop offset="0%" stopColor="#0B3B8A" stopOpacity="0.1" />
          <stop offset="100%" stopColor="#0B3B8A" stopOpacity="0" />
        </radialGradient>
      </defs>
      
      {/* Glow effect */}
      <circle cx="200" cy="200" r="180" fill="url(#shield-glow)" />

      <g stroke="#0B3B8A" strokeOpacity="0.2" fill="none">
        {/* Main Shield Outline */}
        <path 
          d="M200 30 L350 75 L350 200 C350 320 200 380 200 380 C200 380 50 320 50 200 L50 75 Z" 
          strokeWidth="1.5" 
        />
        
        {/* Internal Grid Lines - Vertical */}
        <line x1="200" y1="30" x2="200" y2="380" strokeWidth="0.5" strokeDasharray="2 4" />
        <line x1="125" y1="52" x2="125" y2="335" strokeWidth="0.5" strokeDasharray="1 5" />
        <line x1="275" y1="52" x2="275" y2="335" strokeWidth="0.5" strokeDasharray="1 5" />
        <line x1="87" y1="90" x2="87" y2="280" strokeWidth="0.5" strokeDasharray="1 6" />
        <line x1="313" y1="90" x2="313" y2="280" strokeWidth="0.5" strokeDasharray="1 6" />

        {/* Internal Grid Lines - Horizontal */}
        {[100, 150, 200, 250, 300].map(y => (
          <path 
            key={y}
            d={`M${200 - Math.sqrt(1 - Math.pow((y-200)/180, 2))*150} ${y} L${200 + Math.sqrt(1 - Math.pow((y-200)/180, 2))*150} ${y}`}
            strokeWidth="0.5" 
            strokeDasharray="1 5"
            className="opacity-40"
          />
        ))}

        {/* Dots at intersections */}
        {[
          [200, 30], [350, 75], [50, 75], [200, 380],
          [125, 52], [275, 52], [87, 90], [313, 90],
          [125, 335], [275, 335], [87, 280], [313, 280],
          [200, 100], [200, 150], [200, 200], [200, 250], [200, 300],
          [125, 100], [125, 150], [125, 200], [125, 250], [125, 300],
          [275, 100], [275, 150], [275, 200], [275, 250], [275, 300],
        ].map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r="2" fill="#0B3B8A" fillOpacity="0.4" />
        ))}

        {/* Additional random tech dots */}
        {[
          [160, 120], [240, 120], [160, 280], [240, 280],
          [100, 200], [300, 200], [200, 60], [200, 340]
        ].map(([cx, cy], i) => (
          <circle key={`t-${i}`} cx={cx} cy={cy} r="1" fill="#0B3B8A" fillOpacity="0.3" />
        ))}
      </g>
    </svg>
  );
}
