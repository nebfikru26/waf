import { Lock, Zap, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

interface UpgradeOverlayProps {
  title: string;
  description: string;
  feature: string;
}

export function UpgradeOverlay({ title, description, feature }: UpgradeOverlayProps) {
  const navigate = useNavigate();

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-6 bg-background/60 backdrop-blur-[2px]">
      <div className="max-w-md w-full bg-card border border-primary/30 shadow-2xl rounded-2xl p-8 text-center animate-in fade-in zoom-in duration-300">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 mb-6 glow-primary">
          <Lock className="h-8 w-8 text-primary" />
        </div>
        
        <h2 className="text-xl font-bold mb-2">{title}</h2>
        <p className="text-sm text-muted-foreground mb-8 leading-relaxed">
          {description || `The ${feature} module is available on our higher-tier plans. Upgrade your subscription to unlock advanced security features.`}
        </p>

        <div className="space-y-3">
          <Button 
            onClick={() => navigate("/billing")} 
            className="w-full h-12 glow-primary font-mono tracking-wider"
          >
            <Zap className="h-4 w-4 mr-2" /> UPGRADE PLAN
          </Button>
          <Button 
            variant="outline" 
            onClick={() => navigate(-1)} 
            className="w-full h-11 text-xs font-mono"
          >
            GO BACK
          </Button>
        </div>

        <div className="mt-8 pt-6 border-t border-border/50">
          <div className="flex items-center justify-center gap-4 grayscale opacity-40">
            <ShieldCheck className="h-5 w-5" />
            <span className="text-[10px] font-bold tracking-widest uppercase">Affini Enterprise Security</span>
          </div>
        </div>
      </div>
    </div>
  );
}
