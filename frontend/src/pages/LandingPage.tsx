import { useState } from "react";
import { Shield, Zap, Lock, Globe, BarChart3, Bell, CheckCircle2, ChevronRight, Mail, Phone, MapPin, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { Logo } from "@/components/Logo";
import { HeroGraphic } from "@/components/HeroGraphic";
import { useQuery } from "@tanstack/react-query";
import { useBranding } from "@/components/BrandingProvider";
import { AnnouncementBanner } from "@/components/AnnouncementBanner";
import { HolidaySparkle } from "@/components/HolidaySparkle";


const NAV_LINKS = [
  { label: "Services", href: "#services" },
  { label: "Features", href: "#features" },
  { label: "Pricing", href: "#pricing" },
  { label: "About Us", href: "#about" },
  { label: "Contact", href: "#contact" },
];

const SERVICES = [
  {
    icon: "Shield",
    title: "AI Threat Engine",
    description: "Dual-engine ML + AST pipeline: an ONNX XGBoost classifier fused with a semantic SQL/HTML Abstract Syntax Tree parser to score zero-day threats with probabilistic precision.",
  },
  {
    icon: "Zap",
    title: "JA4 Behavioral Fingerprinting",
    description: "Extracts TLS 1.3 JA4 client fingerprints at the edge. Known-bad fingerprints are auto-blocklisted in Redis for instant threat correlation across all tenants.",
  },
  {
    icon: "Shield",
    title: "Web Application Firewall",
    description: "Enterprise-grade WAF powered by OWASP CRS rules to block SQL injection, XSS, and zero-day attacks before they reach your servers.",
  },
  {
    icon: "Globe",
    title: "DDoS Protection",
    description: "L7 DDoS mitigation with automatic traffic scrubbing and behavioral analysis to keep your applications online.",
  },
  {
    icon: "Lock",
    title: "SSL/TLS Termination",
    description: "High-performance SSL/TLS offloading and termination with automated certificate provisioning and strict HTTPS enforcement.",
  },
  {
    icon: "BarChart3",
    title: "Real-Time Analytics",
    description: "Live dashboards showing attack patterns, traffic trends, and behavioral threat intelligence powered by ClickHouse.",
  },
  {
    icon: "Bell",
    title: "Instant Notifications",
    description: "Get notified via email, webhook, SMS, or Slack when security incidents occur. Full immutable audit logs provided.",
  },
];

const FEATURES = [
  "Dual-Engine ML + AST Classifier",
  "XGBoost Anomaly Probability Scoring",
  "JA4 TLS Fingerprint Blocklisting",
  "ONNX Model Hot-Reload Pipeline",
  "SHA-256 Immutable Audit Hash Chain",
  "Basic WAF rules (Detection)",
  "Full OWASP Protection (Blocking)",
  "API Protection Shielding",
  "Advanced Bot Intelligence",
  "L7 DDoS Defense Shield",
  "Account Takeover Protection",
  "Rate Limiting & Brute Force Prevention",
  "SSL/TLS Termination & Offloading",
  "Advanced Threat Intelligence",
  "Real-time security notifications",
  "Dedicated Managed Support",
  "Custom SLA & Compliance Reporting",
];

const PRICING = [
  {
    name: "Free",
    price: "0 ETB",
    period: "/month",
    description: "For personal projects and testing",
    features: [
      "1 Domain",
      "WAF rules (Detection only)",
      "SSL/TLS Management",
      "Real-time Security Logs",
      "Standard Analytics",
    ],
    cta: "Get Started",
    highlighted: false,
  },
  {
    name: "Professional",
    price: "14,999 ETB",
    period: "/month",
    description: "For growing businesses",
    features: [
      "Up to 5 Domains",
      "WAF rules (Detection)",
      "Full OWASP Protection (Blocking)",
      "API Protection Shielding",
      "Rate Limiting Engine",
      "Advanced Threat Intel",
      "Real-time security notifications",
      "Real-Time Analytics",
    ],
    cta: "Start Free Trial",
    highlighted: true,
  },
  {
    name: "Enterprise",
    price: "49,999 ETB",
    period: "/month",
    description: "For large organizations",
    features: [
      "Up to 50 Domains",
      "WAF rules (Detection)",
      "Full OWASP Protection (Blocking)",
      "API Protection Shielding",
      "Advanced Bot Intelligence",
      "L7 DDoS Defense Shield",
      "Account Takeover Protection",
      "Rate Limiting Engine",
      "SSL/TLS Management",
      "Advanced Threat Intel",
      "Real-time security notifications",
      "Real-Time Analytics",
    ],
    cta: "Upgrade to Enterprise",
    highlighted: false,
  },
  {
    name: "Custom",
    price: "Custom",
    period: "",
    description: "Tailored for your infrastructure",
    features: [
      "Unlimited Domains",
      "High-Performance Bot Defense",
      "Dedicated WAF Instance",
      "L7 DDoS Shield+",
      "Account Takeover Protect+",
      "Managed Security Service",
      "Custom SLA & TAM",
    ],
    cta: "Contact Sales",
    highlighted: false,
  },
];

const IconMap: Record<string, any> = {
  Shield, Zap, Lock, Globe, BarChart3, Bell, Mail, Phone, MapPin
};

export default function LandingPage() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const { data: cmsContent } = useQuery({
    queryKey: ["cms-landing-page"],
    queryFn: () => fetch("/api/cms/landing-page").then(r => r.json()),
  });

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  const services = cmsContent?.services || SERVICES;
  const features = cmsContent?.features || FEATURES;
  const pricing = cmsContent?.pricing || PRICING;
  const contactInfo = cmsContent?.contact || {
    email: "info@affinisecurity.io",
    phone: "+1 (800) 555-0199",
    office: "Global — Remote First"
  };

  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" });
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) {
      toast({ title: "Missing fields", description: "Please fill in name, email, and message.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim().slice(0, 100),
          email: form.email.trim().slice(0, 255),
          subject: form.subject.trim().slice(0, 200) || "Landing Page Inquiry",
          message: form.message.trim().slice(0, 2000),
        })
      });

      if (response.ok) {
        setSent(true);
        setForm({ name: "", email: "", subject: "", message: "" });
        toast({ title: "Message sent!", description: "We'll get back to you soon." });
      } else {
        toast({ title: "Error", description: "Failed to send message. Please try again.", variant: "destructive" });
      }
    } catch (e) {
      toast({ title: "Error", description: "Network error while sending message.", variant: "destructive" });
    }
    setLoading(false);
  };

  const { siteName, banner, holiday } = useBranding();

  return (
    <div className="min-h-screen bg-white text-[#0A2540] font-sans selection:bg-blue-100">
      <HolidaySparkle config={holiday} />
      <AnnouncementBanner config={banner} />
      {/* Navbar */}
      <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 flex items-center justify-between h-24">
          <div className="flex items-center">
            <Logo showText className="h-14 w-auto" />
          </div>
          <div className="hidden lg:flex items-center gap-10">
            {NAV_LINKS.map((l) => (
              <Button
                key={l.label}
                variant="ghost"
                onClick={() => scrollTo(l.href.slice(1))}
                className="text-[15px] font-bold text-gray-600 hover:bg-primary hover:text-white px-5 transition-all duration-300"
              >
                {l.label}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              className="text-gray-600 font-bold hover:bg-primary hover:text-white px-5 transition-all duration-300"
              onClick={() => navigate("/login")}
            >
              Sign In
            </Button>
            <Button
              className="bg-primary hover:opacity-90 text-white px-6 rounded-lg h-11 font-bold shadow-lg transition-all hover:scale-[1.02]"
              style={{ boxShadow: 'var(--glow-primary)' }}
              onClick={() => navigate("/login")}
            >
              Get Started
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-white pt-24 pb-40">
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
          <div className="absolute inset-0 opacity-[0.05]"
            style={{
              backgroundImage: `
                   radial-gradient(circle at 2px 2px, var(--primary) 1.5px, transparent 0),
                   linear-gradient(to right, var(--primary) 0.5px, transparent 0.5px),
                   linear-gradient(to bottom, var(--primary) 0.5px, transparent 0.5px)
                 `,
              backgroundSize: '40px 40px, 120px 120px, 120px 120px'
            }}>
          </div>
          <div className="absolute top-0 right-0 w-[800px] h-[800px] rounded-full blur-[150px] -mr-96 -mt-96" style={{ backgroundColor: 'hsl(var(--primary) / 0.05)' }}></div>
          <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-blue-50/50 rounded-full blur-[120px] -ml-64 -mb-64"></div>
        </div>

        <div className="max-w-7xl mx-auto px-6 sm:px-8 relative z-10">
          <div className="grid lg:grid-cols-2 gap-20 items-center">
            <div className="text-left animate-in fade-in slide-in-from-left duration-1000">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/5 text-primary text-[13px] font-bold mb-10 border border-primary/10 tracking-wide uppercase">
                <Shield className="h-3.5 w-3.5" /> AI-Native WAAP Platform &middot; v2.0
              </div>
              <h1 className="text-4xl sm:text-6xl lg:text-[68px] font-black tracking-tight leading-[1.1] mb-10 text-[#0A2540]">
                {cmsContent?.heroTitle ? (
                  <>
                    <div className="block">{cmsContent.heroTitle.split(',')[0] || cmsContent.heroTitle}{cmsContent.heroTitle.includes(',') ? ',' : ''}</div>
                    {cmsContent.heroTitle.includes(',') && <div className="block text-primary">{cmsContent.heroTitle.split(',').slice(1).join(',')}</div>}
                  </>
                ) : (
                  <>
                    <div className="block">Adaptive Intelligence,</div>
                    <div className="block text-primary">Zero-Day Precision</div>
                  </>
                )}
              </h1>
              <p className="text-lg sm:text-xl text-gray-500 mb-12 leading-relaxed max-w-xl font-medium">
                {cmsContent?.heroSubtitle || `${siteName || 'AffiniSecurity'} 2.0 is an AI-native Web Application & API Protection (WAAP) platform. A dual-engine XGBoost ML classifier fused with a semantic AST parser evaluates every request probabilistically — stopping zero-days before they happen.`}
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-start gap-4">
                <Button
                  size="lg"
                  className="bg-primary hover:opacity-90 text-white px-8 rounded-xl h-14 text-lg shadow-xl shadow-primary/20 transition-all hover:translate-y-[-2px] font-bold w-full sm:w-auto"
                  onClick={() => navigate("/login")}
                >
                  {cmsContent?.ctaText || "Protect Your Infrastructure"}
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="px-8 rounded-xl h-14 text-lg border-gray-200 text-gray-600 hover:bg-primary hover:text-white hover:border-primary transition-all duration-300 font-bold w-full sm:w-auto"
                  onClick={() => scrollTo('services')}
                >
                  View Services
                </Button>
              </div>
            </div>

            <div className="relative flex justify-center lg:justify-end animate-in fade-in zoom-in duration-1000 delay-200">
              <div className="relative w-full max-w-[550px] aspect-square flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-primary/5 rounded-full blur-[100px] opacity-60"></div>
                <img
                  src="/images.png"
                  alt="Security Shield"
                  className="w-full h-full object-contain relative z-10"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Services */}
      <section id="services" className="py-20 bg-card/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold mb-3">Our Services</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">Comprehensive cloud security solutions for businesses of every size, everywhere.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {services.map((s: any, idx: number) => {
              const IconComp = IconMap[s.icon] || Shield;
              return (
                <Card key={idx} className="group hover:shadow-lg transition-shadow border-border/60">
                  <CardHeader>
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-3 group-hover:bg-primary/15 transition-colors">
                      <IconComp className="h-6 w-6 text-primary" />
                    </div>
                    <CardTitle className="text-lg">{s.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-sm leading-relaxed">{s.description}</CardDescription>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold mb-3">Everything You Need</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">Built-in tools for full WAF lifecycle management — from onboarding to incident response.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map((f: string, idx: number) => (
              <div key={idx} className="flex items-start gap-3 p-4 rounded-xl bg-card border border-border/40 hover:border-primary/30 transition-colors">
                <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                <span className="text-sm">{f}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 bg-card/50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold mb-3">How It Works</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">Get protected as simple as 123...</p>
          </div>
          <div className="grid md:grid-cols-4 gap-8">
            {[
              { step: "1", title: "Add Your Domain", desc: "Register your domain and point your DNS (CNAME/A record) to our cloud proxy." },
              { step: "2", title: "Configure Policies", desc: "Enable OWASP rules, set custom IP lists, and choose detection or blocking mode." },
              { step: "3", title: "Monitor & Respond", desc: "View real-time attack logs, receive alerts, and take action from the dashboard." },
              { step: "4", title: "AI Learns & Adapts", desc: "The ML pipeline retrains on your threat history. Smarter ONNX models hot-reload automatically — no downtime." },
            ].map((s) => (
              <div key={s.step} className="text-center">
                <div className="w-14 h-14 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center text-xl font-bold mx-auto mb-4 shadow-lg" style={{ boxShadow: "var(--glow-primary)" }}>
                  {s.step}
                </div>
                <h3 className="font-semibold text-lg mb-2">{s.title}</h3>
                <p className="text-sm text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold mb-3">Simple, Transparent Pricing</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">Start free and scale as you grow. No hidden fees.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto">
            {pricing.filter((p: any) => p.isActive !== false).map((p: any, idx: number) => (
              <Card key={idx} className={`relative overflow-hidden ${p.highlighted ? "border-primary shadow-xl ring-2 ring-primary/20" : "border-border/60"}`}>
                {p.highlighted && (
                  <div className="absolute top-0 inset-x-0 h-1 bg-primary" />
                )}
                <CardHeader className="text-center pb-2">
                  <CardTitle className="text-xl">{p.name}</CardTitle>
                  <CardDescription>{p.description}</CardDescription>
                  <div className="pt-4">
                    <span className="text-4xl font-bold">{p.price}</span>
                    <span className="text-muted-foreground text-sm">{p.period}</span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="space-y-2.5">
                    {p.features?.map((f: string, fIdx: number) => (
                      <li key={fIdx} className="flex items-center gap-2 text-sm">
                        <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Button className={`w-full ${p.highlighted ? "glow-primary" : ""}`} variant={p.highlighted ? "default" : "outline"} onClick={() => navigate("/login")}>
                    {p.cta} <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* About */}
      <section id="about" className="py-20 bg-card/50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold mb-3">{cmsContent?.aboutTitle || `About ${siteName || 'Affinisecurity'}`}</h2>
          </div>
          <div className="prose prose-sm sm:prose max-w-none text-muted-foreground leading-relaxed space-y-4 whitespace-pre-line">
            {cmsContent?.aboutContent ? (
              <p>{cmsContent.aboutContent}</p>
            ) : (
              <>
                <p>
                  {siteName || 'AffiniSecurity'} 2.0 is an AI-native, enterprise-class cloud Web Application & API Protection (WAAP) platform. We replaced traditional heuristic rule matching with a <strong>dual-engine intelligence system</strong>: a real-time ONNX XGBoost ML classifier fused with a semantic AST parser that understands SQL grammar and HTML structure — not just string patterns.
                </p>
                <p>
                  Every blocked request generates a cryptographically-chained audit row in ClickHouse — a SHA-256 hash ledger that prevents evidence tampering and satisfies strict federal regulatory requirements (INSA, ECA Proclamation 1205/2020).
                </p>
                <p>
                  Our multi-tenant platform supports organizations of all sizes. With OWASP CRS integration, JA4 TLS fingerprinting, and automated ML model retraining, {siteName || 'AffiniSecurity'} delivers provably intelligent protection wherever you operate.
                </p>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Contact */}
      <section id="contact" className="py-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold mb-3">Contact Us</h2>
            <p className="text-muted-foreground">Have questions? We'd love to hear from you.</p>
          </div>
          <div className="grid lg:grid-cols-5 gap-10">
            <div className="lg:col-span-2 space-y-4">
              {[
                { icon: Mail, label: "Email", value: contactInfo.email },
                { icon: Phone, label: "Phone", value: contactInfo.phone },
                { icon: MapPin, label: "Office", value: contactInfo.office },
              ].map((c) => (
                <Card key={c.label} className="border-border/60">
                  <CardContent className="flex items-center gap-4 p-5">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <c.icon className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{c.label}</p>
                      <p className="text-sm text-muted-foreground">{c.value}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card className="lg:col-span-3 border-border/60">
              <CardContent className="p-6">
                {sent ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <CheckCircle2 className="h-12 w-12 text-primary mb-4" />
                    <h3 className="text-lg font-semibold mb-2">Thank you!</h3>
                    <p className="text-sm text-muted-foreground mb-4">Your message has been received. We'll respond shortly.</p>
                    <Button variant="outline" size="sm" onClick={() => setSent(false)}>Send another message</Button>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="contact-name">Name *</Label>
                        <Input id="contact-name" placeholder="Your name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={100} required className="bg-muted/30" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="contact-email">Email *</Label>
                        <Input id="contact-email" type="email" placeholder="you@example.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} maxLength={255} required className="bg-muted/30" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="contact-subject">Subject</Label>
                      <Input id="contact-subject" placeholder="What's this about?" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} maxLength={200} className="bg-muted/30" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="contact-message">Message *</Label>
                      <Textarea id="contact-message" placeholder="Tell us more..." value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} maxLength={2000} rows={5} required className="bg-muted/30 resize-none" />
                    </div>
                    <Button type="submit" disabled={loading} className="w-full sm:w-auto glow-primary">
                      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="h-4 w-4 mr-2" /> Send Message</>}
                    </Button>
                  </form>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3 h-8">
            <Logo showText className="h-full w-auto" />
          </div>
          <p className="text-sm text-muted-foreground">&copy; {new Date().getFullYear()} {siteName || 'Affinisecurity'}. All rights reserved. &nbsp;<span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/15">v2.0 AI-Native</span></p>
        </div>
      </footer>
    </div>
  );
}
