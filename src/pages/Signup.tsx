import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getPasswordValidation, isStrongPassword, validateBusinessEmail } from "@/lib/validation";

export default function Signup() {
  const { signUpCompany } = useAuth();
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const passwordChecks = getPasswordValidation(signupPassword);
  const strongPassword = isStrongPassword(signupPassword);

  const handleCompanySignup = async (e: React.FormEvent) => {
    e.preventDefault();
    const emailCheck = validateBusinessEmail(signupEmail);
    if (!emailCheck.valid) {
      toast({ title: "Invalid email", description: emailCheck.message, variant: "destructive" });
      return;
    }
    if (signupPassword !== confirmPassword) {
      toast({ title: "Password mismatch", description: "Password and confirm password must match.", variant: "destructive" });
      return;
    }
    if (!strongPassword) {
      toast({
        title: "Weak password",
        description: "Use at least 8 characters and include one special character.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      await signUpCompany({ name, email: signupEmail, password: signupPassword, companyName });
      toast({ title: "Company signup submitted", description: "Your company is pending super admin approval." });
      setName("");
      setCompanyName("");
      setSignupEmail("");
      setSignupPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      toast({ title: "Signup failed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-[420px] px-5 py-10 text-center animate-fade-in">
        <div className="mb-10">
          <img
            src="https://fwkivdkcpxymkghpoiys.supabase.co/storage/v1/object/public/logo%20and%20other%20stuff/workflow%20loop%20logo%20png.png"
            alt="Work Flow Loop Logo"
            className="max-w-[240px] h-auto mx-auto"
          />
        </div>

        <h1 className="text-[28px] font-medium mb-2">Create an account</h1>
        <p className="text-base text-muted-foreground mb-8">Start managing your workflow today.</p>

        <form onSubmit={handleCompanySignup} className="text-left">
          <div className="mb-5">
            <Label className="block text-sm font-medium mb-2">Representative Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="John Doe" className="h-12 rounded-xl" />
          </div>

          <div className="mb-5">
            <Label className="block text-sm font-medium mb-2">Company Name</Label>
            <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} required placeholder="Acme Inc" className="h-12 rounded-xl" />
          </div>

          <div className="mb-5">
            <Label className="block text-sm font-medium mb-2">Company Email</Label>
            <Input type="email" value={signupEmail} onChange={(e) => setSignupEmail(e.target.value)} required placeholder="owner@acme.com" className="h-12 rounded-xl" />
          </div>

          <div className="mb-5">
            <Label className="block text-sm font-medium mb-2">Password</Label>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                value={signupPassword}
                onChange={(e) => setSignupPassword(e.target.value)}
                required
                minLength={8}
                className="h-12 rounded-xl pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute inset-y-0 right-0 px-3 text-muted-foreground hover:text-foreground"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="mb-5">
            <Label className="block text-sm font-medium mb-2">Confirm Password</Label>
            <div className="relative">
              <Input
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                className="h-12 rounded-xl pr-10"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((prev) => !prev)}
                className="absolute inset-y-0 right-0 px-3 text-muted-foreground hover:text-foreground"
                aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
              >
                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <p className="text-[13px] text-muted-foreground leading-6 mb-6">
            By creating an account, you agree to our <a href="#" className="text-foreground underline">Terms of Service</a> and{" "}
            <a href="#" className="text-foreground underline">Privacy Policy</a>.
          </p>
          <div className="rounded-xl bg-[#f9fafb] p-4 text-left mb-6">
            <h3 className="text-[13px] uppercase tracking-[0.05em] text-[#666] mb-3">Password Requirements</h3>
            <div className={`text-sm mb-1 ${passwordChecks.minLength ? "text-emerald-600" : "text-[#666]"}`}>At least 8 characters</div>
            <div className={`text-sm ${passwordChecks.special ? "text-emerald-600" : "text-[#666]"}`}>At least one special character</div>
          </div>

          <button
            type="submit"
            disabled={loading || !strongPassword}
            className="w-full h-12 text-base font-medium text-white bg-black rounded-xl hover:opacity-85 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed mb-6"
          >
            {loading ? <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Submitting...</span> : "Get started"}
          </button>
        </form>

        {/* <div className="flex items-center text-center mb-6 text-sm text-muted-foreground">
          <div className="flex-1 border-t border-border" />
          <span className="mx-3">or</span>
          <div className="flex-1 border-t border-border" />
        </div> */}

        {/* <button
          type="button"
          disabled
          className="w-full h-12 text-base font-medium text-foreground bg-white border border-border rounded-xl inline-flex items-center justify-center gap-2 opacity-60 cursor-not-allowed"
          title="Google sign up not configured"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Sign up with Google
        </button> */}

        <p className="mt-10 text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link to="/login" className="text-foreground font-medium hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
