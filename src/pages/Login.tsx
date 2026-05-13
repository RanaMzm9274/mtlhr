import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Login() {
  const { signIn } = useAuth();
  const { toast } = useToast();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await signIn(email, password);
    } catch (err: any) {
      toast({ title: "Login failed", description: err.message, variant: "destructive" });
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

        <h1 className="text-[28px] font-medium mb-2">Welcome back</h1>
        <p className="text-base text-muted-foreground mb-8">Please enter your details to sign in.</p>

        <form onSubmit={handleSubmit} className="text-left">
          <div className="mb-5">
            <Label htmlFor="email" className="block text-sm font-medium mb-2">Email address</Label>
            <Input
              id="email"
              type="email"
              placeholder="name@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="h-12 rounded-xl"
            />
          </div>

          <div className="mb-5">
            <Label htmlFor="password" className="block text-sm font-medium mb-2">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="********"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
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

          <Link to="/set-password" className="block text-right text-sm text-[#409fff] hover:underline mt-[-8px] mb-6">
            Forgot password?
          </Link>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 text-base font-medium text-white bg-black rounded-xl hover:opacity-85 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Signing in...</span> : "Sign in"}
          </button>
        </form>

        <div className="flex items-center text-center my-6 text-sm text-muted-foreground">
          <div className="flex-1 border-t border-border" />
          <span className="mx-3">or</span>
          <div className="flex-1 border-t border-border" />
        </div>

        {/* <button
          type="button"
          disabled
          className="w-full h-12 text-base font-medium text-foreground bg-white border border-border rounded-xl inline-flex items-center justify-center gap-2 opacity-60 cursor-not-allowed"
          title="Google sign in not configured"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </button> */}

        <p className="mt-10 text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link to="/signup" className="text-foreground font-medium hover:underline">
            Create one for free
          </Link>
        </p>
      </div>
    </div>
  );
}
