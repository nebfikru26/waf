import React, { createContext, useContext, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { BannerConfig } from "@/components/AnnouncementBanner";
import type { HolidayConfig, ParticleType } from "@/components/HolidaySparkle";

interface BrandingContextType {
    logoUrl: string;
    siteName: string;
    primaryColor: string;
    accentColor: string;
    banner: BannerConfig;
    holiday: HolidayConfig;
}

const DEFAULT_BANNER: BannerConfig = { active: false, type: "info", message: "" };
const DEFAULT_HOLIDAY: HolidayConfig = { active: false, particleType: "confetti" };

const BrandingContext = createContext<BrandingContextType>({
    logoUrl: "/images/brand-logo.png",
    siteName: "AffiniSecurity",
    primaryColor: "217 85% 29%",
    accentColor: "217 85% 29%",
    banner: DEFAULT_BANNER,
    holiday: DEFAULT_HOLIDAY,
});

export const useBranding = () => useContext(BrandingContext);

function isHolidayActive(holiday: any): boolean {
    if (!holiday?.active) return false;
    if (!holiday.startDate || !holiday.endDate) return true; // no range = always on
    const now = new Date();
    return now >= new Date(holiday.startDate) && now <= new Date(holiday.endDate);
}

export function BrandingProvider({ children }: { children: React.ReactNode }) {
    const { data: cmsContent } = useQuery({
        queryKey: ["cms-landing-page"],
        queryFn: () => fetch("/api/cms/landing-page").then(r => r.json()),
        staleTime: 1000 * 60 * 5,
    });

    const { data: promotions } = useQuery({
        queryKey: ["cms-promotions"],
        queryFn: () => fetch("/api/cms/promotions").then(r => r.json()),
        staleTime: 1000 * 60 * 5,
        retry: false,
    });

    const branding = cmsContent?.branding || {
        logoUrl: "/images/brand-logo.png",
        siteName: "AffiniSecurity",
        primaryColor: "217 85% 29%",
        accentColor: "217 85% 29%",
    };

    const banner: BannerConfig = useMemo(() => {
        const b = promotions?.banner;
        if (!b?.active) return DEFAULT_BANNER;
        if (b.expiresAt && new Date(b.expiresAt) < new Date()) return DEFAULT_BANNER;
        return b as BannerConfig;
    }, [promotions]);

    // Find the first active holiday that matches today's date range
    const holiday: HolidayConfig = useMemo(() => {
        const events: any[] = promotions?.holidays || [];
        const active = events.find(h => isHolidayActive(h));
        if (!active) return DEFAULT_HOLIDAY;
        return {
            active: true,
            particleType: (active.particleType || "confetti") as ParticleType,
            colors: active.colors,
            durationMs: active.durationMs || 8000,
            count: active.count || 60,
        };
    }, [promotions]);

    useEffect(() => {
        if (branding.primaryColor) {
            document.documentElement.style.setProperty("--primary", branding.primaryColor);
            document.documentElement.style.setProperty("--ring", branding.primaryColor);
            document.documentElement.style.setProperty("--accent", branding.primaryColor);
            document.documentElement.style.setProperty(
                "--glow-primary",
                `0 4px 14px hsl(${branding.primaryColor} / 0.15)`
            );
        }
        if (branding.siteName) {
            document.title = branding.siteName + " | WAF Protection";
        }
    }, [branding]);

    return (
        <BrandingContext.Provider
            value={{ ...branding, banner, holiday }}
        >
            {children}
        </BrandingContext.Provider>
    );
}
