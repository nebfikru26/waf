import { useState, useEffect } from "react";
import { Shield, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";

export default function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    // In this local environment, we assume the user reached here via a valid mock link
    setReady(true);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      
      if (response.ok) {
        toast({ title: "Password updated", description: "You can now sign in with your new password." });
        navigate("/login");
      } else {
        const data = await response.json();
        toast({ title: "Error", description: data.error || "Update failed", variant: "destructive" });
      }
    } catch (e) {
      toast({ title: "Error", description: "Network error during password update", variant: "destructive" });
    }
    setLoading(false);
  };

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Shield className="h-8 w-8 text-primary mx-auto mb-4" />
          <h1 className="text-2xl font-bold">Set New Password</h1>
        </div>
        <form onSubmit={handleSubmit} className="bg-card border border-border rounded-xl p-6 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="email">Your Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@affinisecurity.io"
              className="bg-muted/50"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">New Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-muted/50"
              required
              minLength={6}
            />
          </div>
          <Button type="submit" disabled={loading} className="w-full font-mono glow-primary">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "UPDATE PASSWORD"}
          </Button>
          <div className="text-center pt-2">
             <Button variant="ghost" className="text-xs text-muted-foreground" onClick={() => navigate("/login")}>
               BACK TO LOGIN
             </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
