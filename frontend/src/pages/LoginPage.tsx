import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Shield, Eye, EyeOff, Loader2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { lovable } from "@/integrations/lovable/index";
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

          {mode !== "forgot" && mode !== "signup" && (
            <>
              <div className="relative flex items-center justify-center pt-2">
                <div className="absolute inset-0 flex items-center pt-2">
                  <div className="w-full border-t border-border" />
                </div>
                <span className="relative bg-card px-3 text-xs text-muted-foreground pt-2">or</span>
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full font-mono text-xs tracking-wider h-11"
                disabled={loading}
                onClick={async () => {
                  setLoading(true);
                  try {
                    // DEVELOPMENT BYPASS for Google Auth
                    if (!import.meta.env.VITE_SUPABASE_URL) {
                      await login("google-user@affinisecurity.io", "bypass", rememberMe);
                      toast({ title: "Google Auth Bypassed", description: "Logged in via dev mock." });
                      return;
                    }
                    const result = await lovable.auth.signInWithOAuth("google", {
                      redirect_uri: window.location.origin,
                    });
                    if (result.error) {
                      toast({ title: "Error", description: String(result.error), variant: "destructive" });
                    }
                  } finally {
                    setLoading(false);
                  }
                }}
              >
                <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                CONTINUE WITH GOOGLE
              </Button>
            </>
          )}

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
