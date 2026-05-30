import { useState } from "react";
import { Link } from "react-router-dom";
import { 
  LogOut, 
  User, 
  Key, 
  UserCircle, 
  Loader2,
  ShieldCheck,
  ShieldAlert
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export function UserNav() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast({ title: "Validation Error", description: "Passwords do not match.", variant: "destructive" });
      return;
    }
    if (newPassword.length < 6) {
      toast({ title: "Validation Error", description: "Password must be at least 6 characters.", variant: "destructive" });
      return;
    }

    setIsChangingPassword(true);
    try {
      const res = await fetch("/api/profile/password", {
        method: "PUT",
        headers: { 
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ password: newPassword })
      });
      
      if (!res.ok) throw new Error("Failed to update password");
      
      toast({ title: "Security Updated", description: "Your administrative password has been changed." });
      setIsPasswordModalOpen(false);
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      toast({ title: "Security Error", description: err.message, variant: "destructive" });
    } finally {
      setIsChangingPassword(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="relative h-8 w-8 rounded-full ring-offset-background transition-all hover:ring-2 hover:ring-primary/20">
            <Avatar className="h-8 w-8 border border-border/50">
              <AvatarFallback className="bg-primary/10 text-primary text-[10px] font-bold font-mono">
                {user?.name?.substring(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" align="end" forceMount>
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col space-y-1">
              <p className="text-sm font-bold leading-none">{user?.name}</p>
              <p className="text-[10px] font-mono leading-none text-muted-foreground uppercase tracking-tight">
                {user?.role} • {user?.email}
              </p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem asChild>
              <Link to="/profile" className="cursor-pointer">
                <UserCircle className="mr-2 h-4 w-4" />
                <span>Profile Identity</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setIsPasswordModalOpen(true)} className="cursor-pointer">
              <Key className="mr-2 h-4 w-4" />
              <span>Update Password</span>
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => logout()} className="cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/5">
            <LogOut className="mr-2 h-4 w-4" />
            <span>Logout</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={isPasswordModalOpen} onOpenChange={setIsPasswordModalOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" /> Update Security Credentials
            </DialogTitle>
            <DialogDescription>
              Enter your new administrative password below to update your access keys.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleChangePassword} className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1.5 font-mono">
                 New Password
              </label>
              <Input 
                type="password" 
                required 
                value={newPassword} 
                onChange={e => setNewPassword(e.target.value)} 
                className="bg-muted/30 font-mono text-sm"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1.5 font-mono">
                 Confirm New Password
              </label>
              <Input 
                type="password" 
                required 
                value={confirmPassword} 
                onChange={e => setConfirmPassword(e.target.value)} 
                className="bg-muted/30 font-mono text-sm"
              />
            </div>
            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setIsPasswordModalOpen(false)} className="text-xs font-mono">
                CANCEL
              </Button>
              <Button type="submit" className="glow-primary text-xs font-mono" disabled={isChangingPassword}>
                {isChangingPassword ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                APPLY SECURITY KEYS
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Dummy Save icon as it wasn't imported from lucide-react in use-auth
const Save = ({ className }: { className?: string }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    width="24" 
    height="24" 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
    <polyline points="17 21 17 13 7 13 7 21" />
    <polyline points="7 3 7 8 15 8" />
  </svg>
);
