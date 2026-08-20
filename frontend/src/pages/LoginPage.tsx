import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Shield, Eye, EyeOff, Loader2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Logo } from "@/components/Logo";

import { useBranding } from "@/components/BrandingProvider";

type Mode = "login" | "signup" | "forgot";

// Organization details (legal name, TIN, license, category, industry, address, etc.) are
// deliberately NOT collected here. Signup is intentionally reduced to the minimum needed to
// create an account; the full company profile is completed afterward in the post-signup
// CompanyOnboarding wizard (see components/CompanyOnboarding.tsx), which is driven by the
// tenant's `isProfileComplete`/`onboardingStep` flags. The backend already defaults every
// org field ("PENDING"/"Other"/"Private") when omitted at signup time.
const CLIENT_FORM_DEFAULT = {
  userEmail: "", userName: "", password: ""
};

function PasswordField({ value, onChange, placeholder = "Min 6 characters", required = true }: {
  value: string; onChange: (v: string) => void; placeholder?: string; required?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        minLength={6}
        className="pr-10 bg-muted/50"
      />
      <button type="button" onClick={() => setShow(!show)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

function Field({ label, children, required = false }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label} {required && "*"}</Label>
      {children}
    </div>
  );
}

export default function LoginPage() {
  const { siteName } = useBranding();
  const [mode, setMode] = useState<Mode>("login");

  // Login / Forgot State
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  // Load remembered email on mount
  React.useEffect(() => {
    const savedEmail = localStorage.getItem("remembered_email");
    if (savedEmail) {
      setEmail(savedEmail);
      setRememberMe(true);
    }
  }, []);

  // Registration State
  const [clientForm, setClientForm] = useState({ ...CLIENT_FORM_DEFAULT });

  const [loading, setLoading] = useState(false);
  const { login, signup, resetPassword } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const cf = (k: keyof typeof clientForm) => (e: React.ChangeEvent<HTMLInputElement>) => setClientForm({ ...clientForm, [k]: e.target.value });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (mode === "forgot") {
        const result = await resetPassword(email);
        if (result.error) {
          toast({ title: "Error", description: result.error, variant: "destructive" });
        } else {
          toast({ title: "Reset link sent", description: "If an account exists, instructions have been emailed." });
          setMode("login");
        }
      } else if (mode === "signup") {
        const result = await signup(clientForm);
        if (result.error) {
          toast({ title: "Registration failed", description: result.error, variant: "destructive" });
        } else {
          // The backend already authenticates the new account (HttpOnly session cookie set
          // on the signup response) — there is no separate email-verification gate, so
          // forcing a second manual login here would just be unnecessary friction. Reuse the
          // existing, tested login() call to populate user/tenant state, then go straight to
          // the dashboard, where CompanyOnboarding (org details, WAF policy, domain) opens
          // automatically because the new tenant's isProfileComplete is false.
          const loginResult = await login(clientForm.userEmail, clientForm.password, false);
          if (loginResult.error) {
            toast({ title: "Account Created!", description: "Please sign in to continue." });
            setMode("login");
            setClientForm({ ...CLIENT_FORM_DEFAULT });
          } else {
            toast({ title: "Account Created!", description: "Let's finish setting up your organization." });
            navigate("/");
          }
        }
      } else {
        console.log(`[Login] Attempting login, email: ${email}, rememberMe: ${rememberMe}`);
        if (rememberMe) {
          localStorage.setItem("remembered_email", email);
        } else {
          localStorage.removeItem("remembered_email");
        }
        const result = await login(email, password, rememberMe);
        if (result.error) {
          toast({ title: "Login failed", description: result.error, variant: "destructive" });
        } else {
          navigate("/");
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 py-12">
      {/* Background aesthetic */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-destructive/5 rounded-full blur-3xl" />
      </div>

      {/* Back to Home Header */}
      <div className="absolute top-6 left-6 z-10">
        <Button variant="ghost" className="text-muted-foreground hover:text-primary pl-2 font-mono text-xs" onClick={() => navigate("/")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> BACK TO HOME
        </Button>
      </div>

      <div className="w-full relative max-w-md">
        <div className="text-center mb-10">
          <div className="h-16 mb-2">
            <Logo className="h-full w-auto mx-auto" />
          </div>
          <p className="text-muted-foreground text-[10px] mt-2 font-semibold uppercase tracking-[0.4em] opacity-70">
            Next-Gen Security Shielding | {siteName}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-card border border-border rounded-xl p-6 space-y-6 shadow-xl relative z-10">
          <h2 className="text-sm font-medium text-center text-muted-foreground font-mono uppercase tracking-wider">
            {mode === "login" ? "Sign In" : mode === "signup" ? "Create Account" : "Reset Password"}
          </h2>

          {mode === "signup" ? (
            <div className="space-y-4">
              <Field label="Full Name" required>
                <Input required value={clientForm.userName} onChange={cf("userName")} placeholder="Your name" className="bg-muted/50" />
              </Field>
              <Field label="Email Address" required>
                <Input required type="email" value={clientForm.userEmail} onChange={cf("userEmail")} placeholder="you@company.com" className="bg-muted/50" />
              </Field>
              <Field label="Password" required>
                <PasswordField value={clientForm.password} onChange={(v) => setClientForm({ ...clientForm, password: v })} />
              </Field>
              <div className="pt-1 p-3 bg-muted/30 rounded-lg text-[10px] text-muted-foreground italic leading-relaxed">
                That's it — you can add your organization's details, domain, and security policy right after you sign in.
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="E-mail"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="bg-muted/50"
                  required
                />
              </div>

              {mode !== "forgot" && (
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="bg-muted/50 pr-10"
                      required
                      minLength={6}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {mode === "login" && (
                    <div className="flex items-center gap-2 pt-1">
                      <Checkbox
                        id="remember-me"
                        checked={rememberMe}
                        onCheckedChange={(v) => setRememberMe(!!v)}
                      />
                      <Label htmlFor="remember-me" className="text-xs text-muted-foreground cursor-pointer font-normal">
                        Remember me for 30 days
                      </Label>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <Button type="submit" disabled={loading} className="w-full font-mono tracking-wider glow-primary h-12">
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : mode === "login" ? (
              "AUTHENTICATE"
            ) : mode === "signup" ? (
              "CREATE ACCOUNT"
            ) : (
              "SEND RESET LINK"
            )}
          </Button>

          {/* Google OAuth removed — it was not wired to this app's real auth backend and its
              "not configured" fallback silently logged any visitor in as super_admin. */}

          <div className="text-center text-xs text-muted-foreground space-y-2 pt-2">
            {mode === "login" && (
              <>
                <p>
                  <button type="button" onClick={() => setMode("forgot")} className="text-primary hover:underline">
                    Forgot password?
                  </button>
                </p>
                <p>
                  Don't have an account?{" "}
                  <button type="button" onClick={() => { setMode("signup"); setClientForm({ ...CLIENT_FORM_DEFAULT }); }} className="text-primary hover:underline font-medium">
                    Create an account
                  </button>
                </p>
              </>
            )}
            {mode === "signup" && (
              <p>
                Already registered?{" "}
                <button type="button" onClick={() => setMode("login")} className="text-primary hover:underline font-medium">
                  Sign in
                </button>
              </p>
            )}
            {mode === "forgot" && (
              <p>
                <button type="button" onClick={() => setMode("login")} className="text-primary hover:underline">
                  Back to sign in
                </button>
              </p>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
