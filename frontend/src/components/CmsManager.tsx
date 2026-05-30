import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save, LayoutTemplate, FileText, Globe, Plus, Trash2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function CmsManager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const token = localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token");
  const headers = {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json"
  };

  // --- Landing Page Content ---
  const { data: landingPage, isLoading: isLoadingLanding } = useQuery({
    queryKey: ["cms-landing-page"],
    queryFn: () => fetch("/api/cms/landing-page", { headers }).then(r => r.json())
  });

  const updateLandingPage = useMutation({
    mutationFn: async (content: any) => {
      const res = await fetch("/api/cms/landing-page", {
        method: "POST",
        headers,
        body: JSON.stringify(content)
      });
      if (!res.ok) throw new Error("Failed to update content");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cms-landing-page"] });
      toast({ title: "Landing Page Updated", description: "Changes are live immediately." });
    }
  });

  // --- Threat Bulletins ---
  const { data: bulletins, isLoading: isLoadingBulletins } = useQuery({
    queryKey: ["cms-bulletins"],
    queryFn: () => fetch("/api/cms/bulletins", { headers }).then(r => r.json())
  });

  const updateBulletins = useMutation({
    mutationFn: async (content: any) => {
      const res = await fetch("/api/cms/bulletins", {
        method: "POST",
        headers,
        body: JSON.stringify(content)
      });
      if (!res.ok) throw new Error("Failed to update bulletins");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cms-bulletins"] });
      toast({ title: "Bulletins Updated", description: "Global threat intel has been published." });
    }
  });

  // --- Global Rules ---
  const { data: globalRules, isLoading: isLoadingRules } = useQuery({
    queryKey: ["cms-global-rules"],
    queryFn: () => fetch("/api/cms/global-rules", { headers }).then(r => r.json())
  });

  const updateGlobalRules = useMutation({
    mutationFn: async (content: any) => {
      const res = await fetch("/api/cms/global-rules", {
        method: "POST",
        headers,
        body: JSON.stringify(content)
      });
      if (!res.ok) throw new Error("Failed to update global rules");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cms-global-rules"] });
      toast({ title: "Global Rules Updated", description: "Platform-wide rules pushed successfully." });
    }
  });

  if (isLoadingLanding || isLoadingBulletins || isLoadingRules) {
    return <div className="flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <Tabs defaultValue="security" className="space-y-6">
      <TabsList className="bg-muted/50 p-1 rounded-lg">
        <TabsTrigger value="security" className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" /> Security Baseline
        </TabsTrigger>
        <TabsTrigger value="content" className="flex items-center gap-2">
          <LayoutTemplate className="h-4 w-4" /> Public Content
        </TabsTrigger>
      </TabsList>

      <TabsContent value="security" className="space-y-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Threat Bulletins */}
          <div className="bg-card border border-border rounded-xl p-6 space-y-4 shadow-sm">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <FileText className="h-5 w-5 text-destructive" /> Threat Bulletins
                </h3>
                <p className="text-xs text-muted-foreground mt-1">Publish alerts to all tenant dashboards.</p>
              </div>
              <Button size="sm" onClick={() => {
                const current = Array.isArray(bulletins) ? bulletins : [];
                queryClient.setQueryData(["cms-bulletins"], [...current, { id: Date.now(), title: "New Bulletin", severity: "High", date: new Date().toISOString().split('T')[0] }]);
              }}>
                <Plus className="h-4 w-4" /> Add
              </Button>
            </div>

            <div className="space-y-3">
              {Array.isArray(bulletins) && bulletins.map((b, i) => (
                <div key={b.id || i} className="flex gap-2 items-center bg-muted/20 p-2 rounded border">
                  <Input className="h-8" value={b.title} onChange={e => {
                    const newB = [...bulletins];
                    newB[i].title = e.target.value;
                    queryClient.setQueryData(["cms-bulletins"], newB);
                  }} />
                  <Button variant="ghost" size="sm" onClick={() => {
                    const newB = [...bulletins];
                    newB.splice(i, 1);
                    queryClient.setQueryData(["cms-bulletins"], newB);
                  }}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
              {(!bulletins || bulletins.length === 0) && <p className="text-xs text-muted-foreground text-center py-4">No active bulletins.</p>}
            </div>

            <Button
              className="w-full"
              onClick={() => updateBulletins.mutate(bulletins || [])}
              disabled={updateBulletins.isPending}
            >
              {updateBulletins.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              PUBLISH BULLETINS
            </Button>
          </div>

          {/* Global Security Rules */}
          <div className="bg-card border border-border rounded-xl p-6 space-y-4 shadow-sm">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <Globe className="h-5 w-5 text-primary" /> Global Security Rules
                </h3>
                <p className="text-xs text-muted-foreground mt-1">Enforced across all tenants universally.</p>
              </div>
              <Button size="sm" onClick={() => {
                const current = Array.isArray(globalRules) ? globalRules : [];
                queryClient.setQueryData(["cms-global-rules"], [...current, { id: Date.now(), ip: "0.0.0.0", action: "BLOCK", reason: "Malicious Actor" }]);
              }}>
                <Plus className="h-4 w-4" /> Add
              </Button>
            </div>

            <div className="space-y-3">
              {Array.isArray(globalRules) && globalRules.map((rule, i) => (
                <div key={rule.id || i} className="flex gap-2 items-center bg-muted/20 p-2 rounded border">
                  <Input className="h-8 w-32" placeholder="IP/CIDR" value={rule.ip} onChange={e => {
                    const newR = [...globalRules];
                    newR[i].ip = e.target.value;
                    queryClient.setQueryData(["cms-global-rules"], newR);
                  }} />
                  <Input className="h-8 flex-1" placeholder="Reason" value={rule.reason} onChange={e => {
                    const newR = [...globalRules];
                    newR[i].reason = e.target.value;
                    queryClient.setQueryData(["cms-global-rules"], newR);
                  }} />
                  <Button variant="ghost" size="sm" onClick={() => {
                    const newR = [...globalRules];
                    newR.splice(i, 1);
                    queryClient.setQueryData(["cms-global-rules"], newR);
                  }}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
              {(!globalRules || globalRules.length === 0) && <p className="text-xs text-muted-foreground text-center py-4">No global rules active.</p>}
            </div>

            <Button
              className="w-full"
              onClick={() => updateGlobalRules.mutate(globalRules || [])}
              disabled={updateGlobalRules.isPending}
            >
              {updateGlobalRules.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              DEPLOY GLOBAL RULES
            </Button>
          </div>
        </div>
      </TabsContent>

      <TabsContent value="content">
        {/* Landing Page CMS */}
        <div className="bg-card border border-border rounded-xl p-6 space-y-4 shadow-sm">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <LayoutTemplate className="h-5 w-5 text-primary" /> Landing Page Content
          </h3>
          <p className="text-xs text-muted-foreground">Modify the hero section and primary CTA text on the public homepage.</p>

          <div className="grid gap-4 mt-4 max-w-2xl">
            <div className="space-y-2">
              <Label>Hero Title</Label>
              <Input
                defaultValue={landingPage?.heroTitle}
                onChange={e => queryClient.setQueryData(["cms-landing-page"], { ...landingPage, heroTitle: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Hero Subtitle</Label>
              <Input
                defaultValue={landingPage?.heroSubtitle}
                onChange={e => queryClient.setQueryData(["cms-landing-page"], { ...landingPage, heroSubtitle: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Call to Action Button</Label>
              <Input
                defaultValue={landingPage?.ctaText}
                onChange={e => queryClient.setQueryData(["cms-landing-page"], { ...landingPage, ctaText: e.target.value })}
              />
            </div>
            <Button
              onClick={() => updateLandingPage.mutate(landingPage)}
              disabled={updateLandingPage.isPending}
              className="w-full sm:w-auto"
            >
              {updateLandingPage.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              PUBLISH CONTENT
            </Button>
          </div>
        </div>
      </TabsContent>
    </Tabs>
  );
}
