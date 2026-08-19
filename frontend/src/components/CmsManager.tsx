import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Loader2, Save, LayoutTemplate, FileText, Plus, Trash2,
  ShieldCheck, Info, CreditCard, Mail,
  CheckCircle2, Zap, Palette,
  Upload, Sparkles, Tag, PartyPopper, Calendar, X, RefreshCw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

export function CmsManager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const headers = {
    "Content-Type": "application/json"
  };

  const { data: landingPage, isLoading: isLoadingLanding } = useQuery({
    queryKey: ["cms-landing-page"],
    queryFn: () => fetch("/api/cms/landing-page", { headers }).then(r => r.json())
  });

  const updateLandingPage = useMutation({
    mutationFn: async (content: any) => {
      const res = await fetch("/api/cms/landing-page", { method: "POST", headers, body: JSON.stringify(content) });
      if (!res.ok) throw new Error("Failed to update content");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cms-landing-page"] });
      toast({ title: "Content Published", description: "Changes are live immediately." });
    }
  });

  const { data: bulletins, isLoading: isLoadingBulletins } = useQuery({
    queryKey: ["cms-bulletins"],
    queryFn: () => fetch("/api/cms/bulletins", { headers }).then(r => r.json())
  });

  const updateBulletins = useMutation({
    mutationFn: async (content: any) => {
      const res = await fetch("/api/cms/bulletins", { method: "POST", headers, body: JSON.stringify(content) });
      if (!res.ok) throw new Error("Failed to update bulletins");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cms-bulletins"] });
      toast({ title: "Bulletins Updated" });
    }
  });

  const { data: globalRules, isLoading: isLoadingRules } = useQuery({
    queryKey: ["cms-global-rules"],
    queryFn: () => fetch("/api/cms/global-rules", { headers }).then(r => r.json())
  });

  const updateGlobalRules = useMutation({
    mutationFn: async (content: any) => {
      const res = await fetch("/api/cms/global-rules", { method: "POST", headers, body: JSON.stringify(content) });
      if (!res.ok) throw new Error("Failed to update global rules");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cms-global-rules"] });
      toast({ title: "Global Rules Updated" });
    }
  });

  const { data: promotions } = useQuery({
    queryKey: ["cms-promotions"],
    queryFn: () => fetch("/api/cms/promotions", { headers }).then(r => r.json()),
    retry: false
  });

  const updatePromotions = useMutation({
    mutationFn: async (content: any) => {
      const res = await fetch("/api/cms/promotions", { method: "POST", headers, body: JSON.stringify(content) });
      if (!res.ok) throw new Error("Failed to update promotions");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cms-promotions"] });
      toast({ title: "Promotions Saved", description: "Banners and holiday effects updated." });
    }
  });

  const updateSection = (key: string, value: any) => {
    queryClient.setQueryData(["cms-landing-page"], { ...landingPage, [key]: value });
  };

  const updatePromoField = (path: string[], value: any) => {
    const clone = JSON.parse(JSON.stringify(promotions || { banner: {}, holidays: [] }));
    let obj = clone;
    for (let i = 0; i < path.length - 1; i++) obj = obj[path[i]];
    obj[path[path.length - 1]] = value;
    queryClient.setQueryData(["cms-promotions"], clone);
  };

  const updateHoliday = (idx: number, patch: any) => {
    const clone = JSON.parse(JSON.stringify(promotions || { banner: {}, holidays: [] }));
    clone.holidays[idx] = { ...clone.holidays[idx], ...patch };
    queryClient.setQueryData(["cms-promotions"], clone);
  };

  // --- Logo Upload ---
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoDragging, setLogoDragging] = useState(false);

  const handleLogoUpload = async (file: File) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max size is 5MB.", variant: "destructive" }); return;
    }
    setLogoUploading(true);
    setLogoPreview(URL.createObjectURL(file));
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/cms/upload-logo", {
        method: "POST", headers: {}, body: form,
      });
      if (!res.ok) throw new Error(await res.text());
      const { logoUrl } = await res.json();
      updateSection("branding", { ...landingPage?.branding, logoUrl });
      toast({ title: "Logo uploaded!", description: "Click 'Publish Branding' to save." });
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
      setLogoPreview(null);
    } finally { setLogoUploading(false); }
  };

  if (isLoadingLanding || isLoadingBulletins || isLoadingRules) {
    return <div className="flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  const particleOptions = [
    { value: "confetti", label: "🎊 Confetti", desc: "Colorful rectangles raining down" },
    { value: "sparkle", label: "✨ Sparkle", desc: "4-point star sparks shimmering" },
    { value: "snowflake", label: "❄️ Snowflake", desc: "Crystalline snow drifting down" },
    { value: "star", label: "⭐ Stars", desc: "5-point golden star shower" },
  ];

  return (
    <Tabs defaultValue="security" className="space-y-6">
      <TabsList className="bg-muted/50 p-1 rounded-lg">
        <TabsTrigger value="security" className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" /> Security Baseline
        </TabsTrigger>
        <TabsTrigger value="content" className="flex items-center gap-2">
          <LayoutTemplate className="h-4 w-4" /> Public Content
        </TabsTrigger>
        <TabsTrigger value="branding" className="flex items-center gap-2">
          <Palette className="h-4 w-4" /> Branding
        </TabsTrigger>
      </TabsList>

      {/* ─── Security Tab ─── */}
      <TabsContent value="security" className="space-y-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-card border border-border rounded-xl p-6 space-y-4 shadow-sm">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold flex items-center gap-2"><FileText className="h-5 w-5 text-destructive" /> Threat Bulletins</h3>
                <p className="text-xs text-muted-foreground mt-1">Publish alerts to all tenant dashboards.</p>
              </div>
              <Button size="sm" onClick={() => {
                const current = Array.isArray(bulletins) ? bulletins : [];
                queryClient.setQueryData(["cms-bulletins"], [{ id: Date.now(), title: "New Bulletin", severity: "Medium", content: "", date: new Date().toISOString().split('T')[0], isActive: true }, ...current]);
              }}><Plus className="h-4 w-4" /> Add Bulletin</Button>
            </div>
            <div className="space-y-4">
              {Array.isArray(bulletins) && bulletins.map((b: any, i: number) => (
                <div key={b.id || i} className="p-4 rounded-lg bg-muted/20 border border-border/60 space-y-3">
                  <div className="flex gap-2">
                    <div className="flex-1 space-y-2">
                      <Input value={b.title} placeholder="Title" onChange={e => { const n = [...bulletins]; n[i] = { ...n[i], title: e.target.value }; queryClient.setQueryData(["cms-bulletins"], n); }} />
                      <div className="flex gap-2">
                        <select className="flex-1 h-8 rounded-md border border-input bg-background px-2 text-xs" value={b.severity}
                          onChange={e => { const n = [...bulletins]; n[i] = { ...n[i], severity: e.target.value }; queryClient.setQueryData(["cms-bulletins"], n); }}>
                          {["Info", "Low", "Medium", "High", "Critical"].map(s => <option key={s}>{s}</option>)}
                        </select>
                        <div className="flex items-center gap-1"><input type="checkbox" checked={b.isActive} onChange={e => { const n = [...bulletins]; n[i] = { ...n[i], isActive: e.target.checked }; queryClient.setQueryData(["cms-bulletins"], n); }} /><span className="text-[10px]">Active</span></div>
                      </div>
                      <Textarea value={b.content} placeholder="Advisory details..." rows={2} onChange={e => { const n = [...bulletins]; n[i] = { ...n[i], content: e.target.value }; queryClient.setQueryData(["cms-bulletins"], n); }} />
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive/70 shrink-0" onClick={() => queryClient.setQueryData(["cms-bulletins"], bulletins.filter((_: any, j: number) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              ))}
            </div>
            <Button className="w-full glow-primary" onClick={() => updateBulletins.mutate(bulletins)} disabled={updateBulletins.isPending}>
              {updateBulletins.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />} PUBLISH BULLETINS
            </Button>
          </div>

          <div className="bg-card border border-border rounded-xl p-6 space-y-4 shadow-sm">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /> Global Security Baseline</h3>
                <p className="text-xs text-muted-foreground mt-1">Platform-wide security rule advisories.</p>
              </div>
              <Button size="sm" onClick={() => {
                const current = Array.isArray(globalRules) ? globalRules : [];
                queryClient.setQueryData(["cms-global-rules"], [...current, { id: Date.now(), name: "New Rule", description: "", enabled: true }]);
              }}><Plus className="h-4 w-4" /> Add Rule</Button>
            </div>
            <div className="space-y-3">
              {Array.isArray(globalRules) && globalRules.map((r: any, i: number) => (
                <div key={r.id || i} className="flex gap-2 items-center p-3 rounded-lg border border-border bg-muted/10">
                  <div className="flex-1 space-y-1">
                    <Input value={r.name} className="h-7 text-xs font-bold" onChange={e => { const n = [...globalRules]; n[i] = { ...n[i], name: e.target.value }; queryClient.setQueryData(["cms-global-rules"], n); }} />
                    <Input value={r.description} className="h-7 text-xs" placeholder="Description..." onChange={e => { const n = [...globalRules]; n[i] = { ...n[i], description: e.target.value }; queryClient.setQueryData(["cms-global-rules"], n); }} />
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive/70 shrink-0" onClick={() => queryClient.setQueryData(["cms-global-rules"], globalRules.filter((_: any, j: number) => j !== i))}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              ))}
            </div>
            <Button className="w-full" variant="outline" onClick={() => updateGlobalRules.mutate(globalRules)} disabled={updateGlobalRules.isPending}>
              {updateGlobalRules.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />} PUBLISH RULES
            </Button>
          </div>
        </div>
      </TabsContent>

      {/* ─── Content Tab ─── */}
      <TabsContent value="content" className="space-y-4">
        <Tabs defaultValue="hero">
          <TabsList className="flex flex-wrap gap-1 h-auto bg-muted/30 p-1 rounded-lg">
            <TabsTrigger value="hero" className="text-xs gap-1"><LayoutTemplate className="h-3 w-3" />Hero</TabsTrigger>
            <TabsTrigger value="services" className="text-xs gap-1"><Zap className="h-3 w-3" />Services</TabsTrigger>
            <TabsTrigger value="features" className="text-xs gap-1"><CheckCircle2 className="h-3 w-3" />Features</TabsTrigger>
            <TabsTrigger value="pricing" className="text-xs gap-1"><CreditCard className="h-3 w-3" />Pricing</TabsTrigger>
            <TabsTrigger value="about" className="text-xs gap-1"><Info className="h-3 w-3" />About</TabsTrigger>
            <TabsTrigger value="contact" className="text-xs gap-1"><Mail className="h-3 w-3" />Contact</TabsTrigger>
          </TabsList>
          <div className="flex justify-end mt-4">
            <Button className="glow-primary" onClick={() => updateLandingPage.mutate(landingPage)} disabled={updateLandingPage.isPending}>
              {updateLandingPage.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />} PUBLISH CHANGES
            </Button>
          </div>

          <TabsContent value="hero" className="space-y-4 max-w-3xl">
            <Card><CardContent className="pt-6 space-y-4">
              <div className="space-y-2"><Label>Hero Title</Label><Input value={landingPage?.heroTitle || ""} onChange={e => updateSection("heroTitle", e.target.value)} /></div>
              <div className="space-y-2"><Label>Hero Subtitle</Label><Textarea value={landingPage?.heroSubtitle || ""} onChange={e => updateSection("heroSubtitle", e.target.value)} rows={3} /></div>
              <div className="space-y-2"><Label>CTA Button Text</Label><Input value={landingPage?.ctaText || ""} onChange={e => updateSection("ctaText", e.target.value)} /></div>
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="services" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(landingPage?.services || []).map((s: any, i: number) => (
                <Card key={i}><CardContent className="pt-4 space-y-2">
                  <div className="flex justify-between"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Service {i + 1}</Label>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive/60" onClick={() => updateSection("services", landingPage.services.filter((_: any, j: number) => j !== i))}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                  <Input placeholder="Title" value={s.title || ""} onChange={e => { const n = [...landingPage.services]; n[i] = { ...n[i], title: e.target.value }; updateSection("services", n); }} />
                  <Textarea placeholder="Description" value={s.description || ""} rows={2} onChange={e => { const n = [...landingPage.services]; n[i] = { ...n[i], description: e.target.value }; updateSection("services", n); }} />
                </CardContent></Card>
              ))}
              <Button variant="outline" className="h-full border-dashed border-2 min-h-[120px]" onClick={() => updateSection("services", [...(landingPage?.services || []), { icon: "Shield", title: "New Service", description: "" }])}>
                <Plus className="h-5 w-5 mr-2" /> Add Service
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="features" className="space-y-4 max-w-2xl">
            <Card><CardContent className="pt-6 space-y-2">
              {(landingPage?.features || []).map((f: string, i: number) => (
                <div key={i} className="flex gap-2">
                  <Input value={f} className="h-8 text-xs" onChange={e => { const n = [...landingPage.features]; n[i] = e.target.value; updateSection("features", n); }} />
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => updateSection("features", landingPage.features.filter((_: any, j: number) => j !== i))}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                </div>
              ))}
              <Button variant="ghost" size="sm" className="w-full" onClick={() => updateSection("features", [...(landingPage?.features || []), "New feature"])}><Plus className="h-3.5 w-3.5 mr-1" /> Add Feature</Button>
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="pricing" className="space-y-4">
            <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
              {(landingPage?.pricing || []).map((p: any, i: number) => (
                <Card key={i}><CardContent className="pt-4 space-y-2">
                  <div className="flex justify-between"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Tier {i + 1}</Label>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive/60" onClick={() => updateSection("pricing", landingPage.pricing.filter((_: any, j: number) => j !== i))}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                  <Input placeholder="Name" value={p.name || ""} onChange={e => { const n = [...landingPage.pricing]; n[i] = { ...n[i], name: e.target.value }; updateSection("pricing", n); }} />
                  <Input placeholder="Price" value={p.price || ""} onChange={e => { const n = [...landingPage.pricing]; n[i] = { ...n[i], price: e.target.value }; updateSection("pricing", n); }} />
                  <Textarea placeholder="Description" value={p.description || ""} rows={2} onChange={e => { const n = [...landingPage.pricing]; n[i] = { ...n[i], description: e.target.value }; updateSection("pricing", n); }} />
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase font-bold text-muted-foreground">Features</Label>
                    {(p.features || []).map((pf: string, pfi: number) => (
                      <div key={pfi} className="flex gap-1">
                        <Input value={pf} className="h-7 text-xs" onChange={e => { const n = [...landingPage.pricing]; n[i].features[pfi] = e.target.value; updateSection("pricing", n); }} />
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { const n = [...landingPage.pricing]; n[i].features.splice(pfi, 1); updateSection("pricing", n); }}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                      </div>
                    ))}
                    <Button variant="ghost" size="sm" className="w-full h-7 text-[10px]" onClick={() => { const n = [...landingPage.pricing]; n[i].features = [...(n[i].features || []), "New feature"]; updateSection("pricing", n); }}><Plus className="h-3 w-3 mr-1" /> Add</Button>
                  </div>
                  <div className="flex items-center gap-2 pt-2"><Label className="text-[10px] font-bold text-muted-foreground">Highlight</Label><input type="checkbox" checked={p.highlighted || false} className="h-4 w-4" onChange={e => { const n = [...landingPage.pricing]; n[i] = { ...n[i], highlighted: e.target.checked }; updateSection("pricing", n); }} /></div>
                </CardContent></Card>
              ))}
              <Button variant="outline" className="h-full border-dashed border-2 flex flex-col gap-2 min-h-[300px]" onClick={() => updateSection("pricing", [...(landingPage?.pricing || []), { name: "New Plan", price: "0 ETB", period: "/month", description: "", features: ["1 Domain"], cta: "Get Started", highlighted: false }])}>
                <Plus className="h-6 w-6" /><span>Add Tier</span>
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="about" className="space-y-4 max-w-3xl">
            <Card><CardContent className="pt-6 space-y-4">
              <div className="space-y-2"><Label>About Title</Label><Input value={landingPage?.aboutTitle || ""} onChange={e => updateSection("aboutTitle", e.target.value)} /></div>
              <div className="space-y-2"><Label>About Content</Label><Textarea value={landingPage?.aboutContent || ""} onChange={e => updateSection("aboutContent", e.target.value)} rows={10} /></div>
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="contact" className="space-y-4 max-w-3xl">
            <Card><CardContent className="pt-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Public Email</Label><Input value={landingPage?.contact?.email || ""} onChange={e => updateSection("contact", { ...landingPage.contact, email: e.target.value })} /></div>
                <div className="space-y-2"><Label>Public Phone</Label><Input value={landingPage?.contact?.phone || ""} onChange={e => updateSection("contact", { ...landingPage.contact, phone: e.target.value })} /></div>
              </div>
              <div className="space-y-2"><Label>Office / Locale</Label><Input value={landingPage?.contact?.office || ""} onChange={e => updateSection("contact", { ...landingPage.contact, office: e.target.value })} /></div>
            </CardContent></Card>
          </TabsContent>
        </Tabs>
      </TabsContent>

      {/* ─── Branding Tab ─── */}
      <TabsContent value="branding" className="space-y-6">
        <Tabs defaultValue="identity">
          <TabsList className="bg-muted/30 p-1 rounded-lg">
            <TabsTrigger value="identity" className="text-xs gap-1.5">🎨 Identity</TabsTrigger>
            <TabsTrigger value="promotions" className="text-xs gap-1.5"><Tag className="h-3.5 w-3.5" /> Promotions</TabsTrigger>
            <TabsTrigger value="holidays" className="text-xs gap-1.5"><Calendar className="h-3.5 w-3.5" /> Holidays</TabsTrigger>
          </TabsList>

          {/* Identity */}
          <TabsContent value="identity" className="space-y-6 max-w-3xl">
            <Card><CardContent className="pt-6 space-y-8">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-lg font-bold">Visual Identity</h3>
                  <p className="text-xs text-muted-foreground">Upload your logo and set your brand colors.</p>
                </div>
                <Button className="glow-primary" onClick={() => updateLandingPage.mutate(landingPage)} disabled={updateLandingPage.isPending}>
                  {updateLandingPage.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />} PUBLISH BRANDING
                </Button>
              </div>

              {/* Logo Upload */}
              <div className="space-y-3">
                <Label className="text-sm font-bold">Platform Logo</Label>
                <div
                  onDragOver={e => { e.preventDefault(); setLogoDragging(true); }}
                  onDragLeave={() => setLogoDragging(false)}
                  onDrop={e => { e.preventDefault(); setLogoDragging(false); const f = e.dataTransfer.files[0]; if (f) handleLogoUpload(f); }}
                  onClick={() => logoInputRef.current?.click()}
                  className={`relative flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-xl p-8 cursor-pointer transition-all group
                    ${logoDragging ? "border-primary bg-primary/10 scale-[1.01]" : "border-border hover:border-primary/50 hover:bg-muted/30"}`}
                >
                  <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp,image/gif" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleLogoUpload(f); }} />
                  {logoUploading ? (
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  ) : (logoPreview || landingPage?.branding?.logoUrl) ? (
                    <div className="flex flex-col items-center gap-2">
                      <img src={logoPreview || landingPage?.branding?.logoUrl} alt="Logo preview" className="max-h-20 max-w-xs object-contain rounded-lg" />
                      <p className="text-xs text-muted-foreground group-hover:text-primary transition-colors">Click or drag to replace</p>
                    </div>
                  ) : (
                    <>
                      <div className="h-14 w-14 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                        <Upload className="h-6 w-6 text-primary" />
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-semibold">Drag & drop your logo</p>
                        <p className="text-xs text-muted-foreground mt-1">PNG, SVG, WebP, GIF — max 5MB</p>
                      </div>
                    </>
                  )}
                </div>
                <div className="flex gap-2">
                  <Input value={landingPage?.branding?.logoUrl || ""} placeholder="/images/brand-logo.png or https://..." className="text-xs font-mono"
                    onChange={e => updateSection("branding", { ...landingPage?.branding, logoUrl: e.target.value })} />
                  <Button variant="outline" size="sm" className="shrink-0" onClick={() => setLogoPreview(null)}><RefreshCw className="h-3.5 w-3.5" /></Button>
                </div>
                <p className="text-[10px] text-muted-foreground">Or manually paste a URL. Recommended: transparent PNG or SVG.</p>
              </div>

              {/* Site Name */}
              <div className="space-y-2 border-t pt-6">
                <Label className="text-sm font-bold">Portal Name</Label>
                <Input value={landingPage?.branding?.siteName || ""} placeholder="e.g. AffiniSecurity"
                  onChange={e => updateSection("branding", { ...landingPage?.branding, siteName: e.target.value })} />
                <p className="text-[10px] text-muted-foreground">Appears in browser tab title and emails.</p>
              </div>

              {/* Color Pickers */}
              <div className="grid sm:grid-cols-2 gap-6 border-t pt-6">
                {(["primaryColor", "accentColor"] as const).map(key => (
                  <div key={key} className="space-y-2">
                    <Label className="text-sm font-bold">{key === "primaryColor" ? "Primary Color" : "Accent Color"}</Label>
                    <div className="flex gap-2 items-center">
                      <input type="color" className="h-10 w-10 rounded-lg border border-border cursor-pointer p-0.5 bg-transparent"
                        value={(() => {
                          try {
                            const parts = (landingPage?.branding?.[key] || "217 85% 29%").split(" ");
                            const h = parseFloat(parts[0]);
                            const s = parseFloat(parts[1]) / 100;
                            const l = parseFloat(parts[2]) / 100;
                            const a = s * Math.min(l, 1 - l);
                            const f = (n: number) => { const k = (n + h / 30) % 12; const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1); return Math.round(255 * color).toString(16).padStart(2, '0'); };
                            return `#${f(0)}${f(8)}${f(4)}`;
                          } catch { return "#1a4fa0"; }
                        })()}
                        onChange={e => {
                          const hex = e.target.value;
                          const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
                          const max = Math.max(r, g, b), min = Math.min(r, g, b); let h = 0, s = 0; const l = (max + min) / 2;
                          if (max !== min) { const d = max - min; s = l > 0.5 ? d / (2 - max - min) : d / (max + min); switch (max) { case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break; case g: h = ((b - r) / d + 2) / 6; break; case b: h = ((r - g) / d + 4) / 6; break; } }
                          updateSection("branding", { ...landingPage?.branding, [key]: `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%` });
                        }}
                      />
                      <Input value={landingPage?.branding?.[key] || ""} placeholder="217 85% 29%" className="font-mono text-xs"
                        onChange={e => updateSection("branding", { ...landingPage?.branding, [key]: e.target.value })} />
                    </div>
                    <p className="text-[10px] text-muted-foreground">Format: H S% L%</p>
                  </div>
                ))}
              </div>

              <div className="p-4 rounded-lg bg-primary/5 border border-primary/20 flex gap-3 text-sm italic text-muted-foreground">
                <Info className="h-5 w-5 text-primary shrink-0" />
                Theme changes are applied globally via real-time CSS variable injection.
              </div>
            </CardContent></Card>
          </TabsContent>

          {/* Promotions */}
          <TabsContent value="promotions" className="space-y-6 max-w-3xl">
            <Card><CardContent className="pt-6 space-y-6">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-lg font-bold flex items-center gap-2"><Tag className="h-4 w-4 text-purple-400" /> Announcement Banner</h3>
                  <p className="text-xs text-muted-foreground">Shown at the top of the platform — dismissible by users.</p>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground">Active</Label>
                  <Switch checked={!!promotions?.banner?.active} onCheckedChange={v => updatePromoField(["banner", "active"], v)} />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase text-muted-foreground">Banner Type</Label>
                <div className="grid grid-cols-3 gap-2">
                  {(["promo", "holiday", "info"] as const).map(type => {
                    const active = promotions?.banner?.type === type;
                    const cls = active
                      ? (type === "promo" ? "border-purple-400 text-purple-400 bg-purple-400/10" : type === "holiday" ? "border-amber-400 text-amber-400 bg-amber-400/10" : "border-blue-400 text-blue-400 bg-blue-400/10")
                      : "border-border text-muted-foreground hover:border-muted-foreground";
                    return (
                      <button key={type} onClick={() => updatePromoField(["banner", "type"], type)}
                        className={`flex flex-col items-center gap-1 py-3 px-2 rounded-lg border text-xs font-bold transition-all ${cls}`}>
                        {type === "promo" ? <Tag className="h-4 w-4" /> : type === "holiday" ? <PartyPopper className="h-4 w-4" /> : <Info className="h-4 w-4" />}
                        {type.charAt(0).toUpperCase() + type.slice(1)}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase text-muted-foreground">Main Message</Label>
                  <Input value={promotions?.banner?.message || ""} placeholder="e.g. 🎉 20% off all plans — this month only!"
                    onChange={e => updatePromoField(["banner", "message"], e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase text-muted-foreground">Sub-message (optional)</Label>
                  <Input value={promotions?.banner?.subMessage || ""} placeholder="e.g. Use code SECURE20 at checkout"
                    onChange={e => updatePromoField(["banner", "subMessage"], e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase text-muted-foreground">CTA Button Text</Label>
                    <Input value={promotions?.banner?.ctaText || ""} placeholder="Get Deal" onChange={e => updatePromoField(["banner", "ctaText"], e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase text-muted-foreground">CTA URL</Label>
                    <Input value={promotions?.banner?.ctaUrl || ""} placeholder="/pricing" onChange={e => updatePromoField(["banner", "ctaUrl"], e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase text-muted-foreground">Expires At</Label>
                    <Input type="datetime-local" value={promotions?.banner?.expiresAt || ""} onChange={e => updatePromoField(["banner", "expiresAt"], e.target.value)} />
                  </div>
                  <div className="flex flex-col gap-2 justify-end pb-1">
                    <Label className="text-xs font-bold uppercase text-muted-foreground">Show Countdown Timer</Label>
                    <Switch checked={!!promotions?.banner?.showCountdown} onCheckedChange={v => updatePromoField(["banner", "showCountdown"], v)} />
                  </div>
                </div>
              </div>

              {/* Live Preview */}
              {promotions?.banner?.message && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground uppercase font-bold flex items-center gap-1"><Sparkles className="h-3 w-3" /> Live Preview</Label>
                  <div className="rounded-lg overflow-hidden border border-border">
                    <div className="flex items-center gap-2 px-4 py-2.5 text-white text-xs font-bold" style={{
                      background: promotions?.banner?.type === "holiday"
                        ? "linear-gradient(90deg,hsl(0,72%,35%),hsl(30,90%,42%),hsl(0,72%,35%))"
                        : promotions?.banner?.type === "promo"
                          ? "linear-gradient(90deg,hsl(280,80%,28%),hsl(217,85%,29%),hsl(280,80%,28%))"
                          : "linear-gradient(90deg,hsl(217,60%,22%),hsl(217,85%,29%))"
                    }}>
                      {promotions?.banner?.type === "promo" ? <Tag className="h-3.5 w-3.5 shrink-0" /> : promotions?.banner?.type === "holiday" ? <PartyPopper className="h-3.5 w-3.5 shrink-0" /> : <Info className="h-3.5 w-3.5 shrink-0" />}
                      <span>{promotions?.banner?.message}</span>
                      {promotions?.banner?.subMessage && <span className="opacity-70 text-[10px]">— {promotions?.banner?.subMessage}</span>}
                      {promotions?.banner?.ctaText && <span className="ml-auto shrink-0 bg-white/20 px-2 py-0.5 rounded-full text-[9px]">{promotions?.banner?.ctaText}</span>}
                      <X className="h-3.5 w-3.5 ml-1 opacity-60" />
                    </div>
                  </div>
                </div>
              )}

              <Button className="w-full glow-primary" onClick={() => updatePromotions.mutate(promotions)} disabled={updatePromotions.isPending}>
                {updatePromotions.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />} SAVE PROMOTIONS
              </Button>
            </CardContent></Card>
          </TabsContent>

          {/* Holidays */}
          <TabsContent value="holidays" className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold flex items-center gap-2"><Sparkles className="h-4 w-4 text-amber-400" /> Holiday & Seasonal Events</h3>
                <p className="text-xs text-muted-foreground mt-1">Enable an event to show particle effects + greeting banner automatically when the date matches.</p>
              </div>
              <Button onClick={() => updatePromotions.mutate(promotions)} disabled={updatePromotions.isPending} className="glow-primary">
                {updatePromotions.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />} SAVE EVENTS
              </Button>
            </div>

            <div className="space-y-4">
              {(promotions?.holidays || []).map((h: any, idx: number) => (
                <Card key={h.id || idx} className={`border transition-all ${h.active ? "border-amber-400/40 shadow-[0_0_0_1px_hsl(45_100%_60%/0.15)]" : "border-border"}`}>
                  <CardContent className="pt-4 space-y-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-sm font-bold">{h.name}</span>
                          {h.active && <span className="text-[9px] font-mono font-black px-1.5 py-0.5 rounded-full bg-amber-400/20 text-amber-400 border border-amber-400/30">LIVE</span>}
                        </div>
                        <Input value={h.message || ""} placeholder="Holiday greeting message…" className="h-8 text-xs"
                          onChange={e => updateHoliday(idx, { message: e.target.value })} />
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <Label className="text-[10px] text-muted-foreground">Enable</Label>
                        <Switch checked={!!h.active} onCheckedChange={v => updateHoliday(idx, { active: v })} />
                      </div>
                    </div>

                    <div className="grid sm:grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <Label className="text-[10px] font-bold uppercase text-muted-foreground">Start Date</Label>
                        <Input type="date" value={h.startDate || ""} className="h-8 text-xs" onChange={e => updateHoliday(idx, { startDate: e.target.value })} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] font-bold uppercase text-muted-foreground">End Date</Label>
                        <Input type="date" value={h.endDate || ""} className="h-8 text-xs" onChange={e => updateHoliday(idx, { endDate: e.target.value })} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] font-bold uppercase text-muted-foreground">Particle Effect</Label>
                        <select className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs" value={h.particleType || "confetti"}
                          onChange={e => updateHoliday(idx, { particleType: e.target.value })}>
                          {particleOptions.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                        </select>
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground italic">{particleOptions.find(p => p.value === h.particleType)?.desc}</p>

                    {/* Delete custom holidays */}
                    {!(h.id <= 10) && (
                      <div className="flex justify-end">
                        <Button variant="ghost" size="sm" className="h-7 text-[10px] text-destructive/60 hover:text-destructive"
                          onClick={() => { const clone = JSON.parse(JSON.stringify(promotions)); clone.holidays.splice(idx, 1); queryClient.setQueryData(["cms-promotions"], clone); }}>
                          <Trash2 className="h-3 w-3 mr-1" /> Remove
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}

              <Button variant="outline" className="w-full border-dashed border-2 h-14 gap-2"
                onClick={() => {
                  const clone = JSON.parse(JSON.stringify(promotions || { banner: {}, holidays: [] }));
                  clone.holidays.push({ id: Date.now(), name: "Custom Holiday", startDate: "", endDate: "", message: "🎉 Happy Holidays!", particleType: "confetti", active: false });
                  queryClient.setQueryData(["cms-promotions"], clone);
                }}>
                <Plus className="h-4 w-4" /> Add Custom Holiday
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </TabsContent>
    </Tabs>
  );
}
