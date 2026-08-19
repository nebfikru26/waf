import React, { useState, useEffect, useCallback } from "react";
import { X, Tag, PartyPopper, Info, Clock, ChevronRight } from "lucide-react";

export interface BannerConfig {
    active: boolean;
    type: "promo" | "holiday" | "info";
    message: string;
    subMessage?: string;
    ctaText?: string;
    ctaUrl?: string;
    expiresAt?: string; // ISO date string
    showCountdown?: boolean;
    bgGradient?: string; // custom CSS gradient
}

interface AnnouncementBannerProps {
    config: BannerConfig;
    dismissKey?: string; // unique key for sessionStorage
}

function useCountdown(expiresAt?: string) {
    const getRemaining = useCallback(() => {
        if (!expiresAt) return null;
        const diff = new Date(expiresAt).getTime() - Date.now();
        if (diff <= 0) return null;
        const d = Math.floor(diff / 86400000);
        const h = Math.floor((diff % 86400000) / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        return { d, h, m, s };
    }, [expiresAt]);

    const [remaining, setRemaining] = useState(getRemaining);

    useEffect(() => {
        if (!expiresAt) return;
        const id = setInterval(() => setRemaining(getRemaining()), 1000);
        return () => clearInterval(id);
    }, [expiresAt, getRemaining]);

    return remaining;
}

const GRADIENTS: Record<BannerConfig["type"], string> = {
    promo:
        "linear-gradient(90deg, hsl(280, 80%, 28%) 0%, hsl(217, 85%, 29%) 50%, hsl(280, 80%, 28%) 100%)",
    holiday:
        "linear-gradient(90deg, hsl(0, 72%, 35%) 0%, hsl(30, 90%, 42%) 50%, hsl(0, 72%, 35%) 100%)",
    info: "linear-gradient(90deg, hsl(217, 60%, 22%) 0%, hsl(217, 85%, 29%) 100%)",
};

const ICONS: Record<BannerConfig["type"], React.ReactNode> = {
    promo: <Tag className="h-3.5 w-3.5 shrink-0" />,
    holiday: <PartyPopper className="h-3.5 w-3.5 shrink-0" />,
    info: <Info className="h-3.5 w-3.5 shrink-0" />,
};

function CountdownUnit({ value, label }: { value: number; label: string }) {
    return (
        <span className="flex flex-col items-center leading-none mx-0.5">
            <span className="text-xs font-black tabular-nums bg-white/20 px-1.5 py-0.5 rounded min-w-[22px] text-center">
                {String(value).padStart(2, "0")}
            </span>
            <span className="text-[7px] font-bold uppercase opacity-70 mt-0.5">{label}</span>
        </span>
    );
}

export function AnnouncementBanner({ config, dismissKey = "announcement_banner" }: AnnouncementBannerProps) {
    const [visible, setVisible] = useState(false);
    const [mounted, setMounted] = useState(false);
    const remaining = useCountdown(config.showCountdown ? config.expiresAt : undefined);

    useEffect(() => {
        const dismissed = sessionStorage.getItem(`banner_dismissed_${dismissKey}`);
        if (!config.active || dismissed) return;
        if (config.expiresAt && new Date(config.expiresAt) < new Date()) return;
        setMounted(true);
        const t = setTimeout(() => setVisible(true), 50);
        return () => clearTimeout(t);
    }, [config, dismissKey]);

    const dismiss = () => {
        setVisible(false);
        setTimeout(() => {
            setMounted(false);
            sessionStorage.setItem(`banner_dismissed_${dismissKey}`, "1");
        }, 350);
    };

    if (!mounted) return null;

    const bg = config.bgGradient || GRADIENTS[config.type];

    return (
        <div
            className="relative overflow-hidden w-full z-50 transition-all duration-350 ease-out"
            style={{
                maxHeight: visible ? "80px" : "0px",
                opacity: visible ? 1 : 0,
                transform: visible ? "translateY(0)" : "translateY(-100%)",
            }}
        >
            {/* Animated shimmer effect */}
            <div
                className="absolute inset-0 pointer-events-none"
                style={{
                    background: bg,
                }}
            />
            <div
                className="absolute inset-0 pointer-events-none animate-pulse"
                style={{
                    background:
                        "linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.07) 50%, transparent 60%)",
                    backgroundSize: "200% 100%",
                    animation: "shimmer 2.5s linear infinite",
                }}
            />

            <div className="relative flex items-center justify-between px-4 py-2.5 text-white gap-3 max-w-screen-2xl mx-auto">
                {/* Icon + Message */}
                <div className="flex items-center gap-2 min-w-0 flex-1">
                    {ICONS[config.type]}
                    <div className="flex flex-col min-w-0">
                        <p className="text-xs font-bold leading-snug truncate">{config.message}</p>
                        {config.subMessage && (
                            <p className="text-[10px] opacity-80 leading-snug truncate hidden sm:block">
                                {config.subMessage}
                            </p>
                        )}
                    </div>
                </div>

                {/* Countdown */}
                {config.showCountdown && remaining && (
                    <div className="flex items-center gap-0.5 shrink-0 hidden md:flex">
                        <Clock className="h-3 w-3 opacity-70 mr-1" />
                        {remaining.d > 0 && <CountdownUnit value={remaining.d} label="d" />}
                        <CountdownUnit value={remaining.h} label="h" />
                        <CountdownUnit value={remaining.m} label="m" />
                        <CountdownUnit value={remaining.s} label="s" />
                    </div>
                )}

                {/* CTA */}
                {config.ctaText && config.ctaUrl && (
                    <a
                        href={config.ctaUrl}
                        className="shrink-0 flex items-center gap-1 bg-white/20 hover:bg-white/30 text-white text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full transition-all whitespace-nowrap border border-white/20"
                    >
                        {config.ctaText}
                        <ChevronRight className="h-3 w-3" />
                    </a>
                )}

                {/* Dismiss */}
                <button
                    onClick={dismiss}
                    className="shrink-0 p-1.5 rounded-full hover:bg-white/20 transition-colors ml-1"
                    aria-label="Dismiss banner"
                >
                    <X className="h-3.5 w-3.5" />
                </button>
            </div>

            <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
        </div>
    );
}
