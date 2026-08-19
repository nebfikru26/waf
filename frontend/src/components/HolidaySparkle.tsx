import { useEffect, useRef, useCallback } from "react";

export type ParticleType = "confetti" | "sparkle" | "snowflake" | "star";

export interface HolidayConfig {
    active: boolean;
    particleType: ParticleType;
    colors?: string[];
    durationMs?: number; // default 8000
    count?: number; // default 60
}

interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    color: string;
    opacity: number;
    rotation: number;
    rotationSpeed: number;
    shape: ParticleType;
    wobble: number;
    wobbleSpeed: number;
    life: number; // 0–1
    decay: number;
}

const DEFAULT_COLORS = {
    confetti: ["#FF6B6B", "#FFD93D", "#6BCB77", "#4D96FF", "#FF6FC8", "#C77DFF"],
    sparkle: ["#FFD700", "#FFF8DC", "#FFFACD", "#FFE066", "#FFC200"],
    snowflake: ["#E0F7FF", "#B3E5FC", "#FFFFFF", "#90CAF9"],
    star: ["#FFD700", "#FFA500", "#FF69B4", "#C77DFF", "#60EFFF"],
};

function rand(min: number, max: number) {
    return Math.random() * (max - min) + min;
}

function pick<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

function createParticle(type: ParticleType, colors: string[], canvasW: number): Particle {
    const isSnow = type === "snowflake";
    return {
        x: rand(0, canvasW),
        y: isSnow ? rand(-100, -10) : rand(-20, canvasW * 0.3),
        vx: rand(-1.5, 1.5),
        vy: rand(isSnow ? 0.5 : 2, isSnow ? 2 : 5),
        size: type === "confetti" ? rand(6, 12) : type === "sparkle" ? rand(3, 7) : rand(8, 18),
        color: pick(colors),
        opacity: 1,
        rotation: rand(0, Math.PI * 2),
        rotationSpeed: rand(-0.05, 0.05),
        shape: type,
        wobble: rand(0, Math.PI * 2),
        wobbleSpeed: rand(0.01, 0.04),
        life: 1,
        decay: rand(0.003, 0.008),
    };
}

function drawParticle(ctx: CanvasRenderingContext2D, p: Particle) {
    ctx.save();
    ctx.globalAlpha = p.opacity * p.life;
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rotation);
    ctx.fillStyle = p.color;
    ctx.strokeStyle = p.color;

    if (p.shape === "confetti") {
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
    } else if (p.shape === "sparkle") {
        // 4-pointed star sparkle
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
            const r = i % 2 === 0 ? p.size : p.size * 0.35;
            const angle = (i * Math.PI) / 4;
            if (i === 0) ctx.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
            else ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
        }
        ctx.closePath();
        ctx.fill();
    } else if (p.shape === "snowflake") {
        ctx.lineWidth = p.size * 0.12;
        ctx.lineCap = "round";
        for (let arm = 0; arm < 6; arm++) {
            ctx.save();
            ctx.rotate((arm * Math.PI) / 3);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(0, -p.size);
            // branch
            ctx.moveTo(0, -p.size * 0.6);
            ctx.lineTo(p.size * 0.25, -p.size * 0.35);
            ctx.moveTo(0, -p.size * 0.6);
            ctx.lineTo(-p.size * 0.25, -p.size * 0.35);
            ctx.stroke();
            ctx.restore();
        }
    } else if (p.shape === "star") {
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
            const r = i % 2 === 0 ? p.size : p.size * 0.45;
            const angle = (i * Math.PI) / 5 - Math.PI / 2;
            if (i === 0) ctx.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
            else ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
        }
        ctx.closePath();
        ctx.fill();
    }

    ctx.restore();
}

export function HolidaySparkle({ config }: { config: HolidayConfig }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animRef = useRef<number>(0);
    const particlesRef = useRef<Particle[]>([]);
    const startRef = useRef<number>(0);

    const colors = config.colors || DEFAULT_COLORS[config.particleType];
    const duration = config.durationMs ?? 8000;
    const count = config.count ?? 60;

    const animate = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const now = performance.now();
        const elapsed = now - startRef.current;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Spawn new particles early
        if (elapsed < duration * 0.6 && particlesRef.current.length < count) {
            for (let i = 0; i < 2; i++) {
                particlesRef.current.push(
                    createParticle(config.particleType, colors, canvas.width)
                );
            }
        }

        particlesRef.current = particlesRef.current.filter((p) => {
            p.x += p.vx + Math.sin(p.wobble) * 0.5;
            p.y += p.vy;
            p.rotation += p.rotationSpeed;
            p.wobble += p.wobbleSpeed;
            p.life -= p.decay;
            drawParticle(ctx, p);
            return p.life > 0 && p.y < canvas.height + 30;
        });

        if (elapsed < duration || particlesRef.current.length > 0) {
            animRef.current = requestAnimationFrame(animate);
        }
    }, [config.particleType, colors, count, duration]);

    useEffect(() => {
        if (!config.active) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        const resize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };
        resize();
        window.addEventListener("resize", resize);

        particlesRef.current = [];
        startRef.current = performance.now();
        animRef.current = requestAnimationFrame(animate);

        return () => {
            cancelAnimationFrame(animRef.current);
            window.removeEventListener("resize", resize);
            particlesRef.current = [];
        };
    }, [config.active, animate]);

    if (!config.active) return null;

    return (
        <canvas
            ref={canvasRef}
            className="fixed inset-0 pointer-events-none z-[9999]"
            aria-hidden="true"
        />
    );
}
