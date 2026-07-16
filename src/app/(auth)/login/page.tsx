"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Store,
  AlertCircle,
  Eye,
  EyeOff,
  Lock,
  Mail,
  ArrowRight,
  CheckCircle2,
  KeyRound,
  ArrowLeft,
  ShieldAlert,
  RefreshCw,
  Copy,
  Check,
} from "lucide-react";
import { apiGet, apiPost } from "@/lib/fetcher";
import { toast } from "sonner";

// Password complexity rule (must match backend Zod schema)
const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d\W_]{6,}$/;

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<
    "login" | "changePassword" | "forgotPassword"
  >("login");
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  // Login state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);

  // Change password state
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [changeError, setChangeError] = useState("");
  const [changeLoading, setChangeLoading] = useState(false);
  const [changeSuccess, setChangeSuccess] = useState(false);

  // Forgot password state
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotStep, setForgotStep] = useState(1);
  const [forgotHasCode, setForgotHasCode] = useState<boolean | null>(null);
  const [forgotError, setForgotError] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState("");
  const [forgotNewPassword, setForgotNewPassword] = useState("");
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState("");
  const [forgotSuccess, setForgotSuccess] = useState(false);

  // First-time setup modal
  const [showFirstTimeModal, setShowFirstTimeModal] = useState(false);
  const [firstTimeCreds, setFirstTimeCreds] = useState<{
    email: string;
    recoveryCode: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  // Refs
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const newPasswordRef = useRef<HTMLInputElement>(null);
  const forgotEmailRef = useRef<HTMLInputElement>(null);
  const recoveryCodeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // FIX: Set a 10-second timeout — if the auth check hangs (cold start,
    // network issue, DB connection timeout), show the login form anyway.
    // The user can still log in — the auth check is only for auto-redirect
    // when a session already exists.
    const timeoutId = setTimeout(() => setIsCheckingAuth(false), 10000);

    async function checkExisting() {
      try {
        const data = await apiGet<{ user: { mustChangePassword: boolean } }>(
          "/api/auth",
          { showToast: false },
        );
        if (data?.user?.mustChangePassword) {
          setMode("changePassword");
        } else if (data?.user) {
          router.push("/dashboard");
        }
      } catch {
        // No session, stay on login
      } finally {
        clearTimeout(timeoutId);
        setIsCheckingAuth(false);
      }
    }
    checkExisting();

    return () => clearTimeout(timeoutId);
  }, [router]);

  useEffect(() => {
    if (isCheckingAuth) return;
    if (mode === "login") emailRef.current?.focus();
    if (mode === "changePassword")
      setTimeout(() => newPasswordRef.current?.focus(), 100);
    if (mode === "forgotPassword")
      setTimeout(() => forgotEmailRef.current?.focus(), 100);
  }, [mode, isCheckingAuth]);

  const triggerShake = useCallback(() => {
    setShake(true);
    setTimeout(() => setShake(false), 500);
  }, []);

  // ========================= LOGIN =========================

  const handleEmailKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      passwordRef.current?.focus();
    }
  };

  const handlePasswordKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleLogin();
    }
  };

  async function handleLogin() {
    if (!email.trim()) {
      setError("Please enter your email");
      triggerShake();
      emailRef.current?.focus();
      return;
    }
    if (!password) {
      setError("Please enter your password");
      triggerShake();
      passwordRef.current?.focus();
      return;
    }

    setLoading(true);
    setError("");

    try {
      const data = await apiPost<{
        message?: string;
        recoveryCode?: string;
        mustChangePassword?: boolean;
        user?: { email: string };
      }>("/api/auth", { email: email.trim(), password });

      // FIX: Explicit null check to satisfy TypeScript
      if (!data) {
        throw new Error("Login failed. No response from server.");
      }

      // First-time setup: show blocking modal
      if (data.message && data.recoveryCode) {
        setFirstTimeCreds({
          email: data.user?.email || email.trim(),
          recoveryCode: data.recoveryCode,
        });
        setShowFirstTimeModal(true);
        setCopied(false);
        return;
      }

      if (data.mustChangePassword) {
        setMode("changePassword");
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Invalid email or password",
      );
      triggerShake();
      setPassword("");
      passwordRef.current?.focus();
    } finally {
      setLoading(false);
    }
  }

  function handleFirstTimeContinue() {
    setShowFirstTimeModal(false);
    if (firstTimeCreds) {
      setMode("changePassword");
    }
  }

  async function copyRecoveryCode() {
    if (!firstTimeCreds) return;
    try {
      await navigator.clipboard.writeText(firstTimeCreds.recoveryCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy. Please copy manually.");
    }
  }

  // ========================= CHANGE PASSWORD =========================

  const handleConfirmKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleChangePassword();
    }
  };

  async function handleChangePassword() {
    if (!PASSWORD_REGEX.test(newPassword)) {
      setChangeError(
        "Password must be at least 6 chars, with 1 letter & 1 number",
      );
      newPasswordRef.current?.focus();
      return;
    }
    if (newPassword !== confirmPassword) {
      setChangeError("Passwords do not match");
      return;
    }

    setChangeLoading(true);
    setChangeError("");

    try {
      await apiPost("/api/auth/password", { password: newPassword });
      setChangeSuccess(true);
      setTimeout(() => {
        router.push("/dashboard");
        router.refresh();
      }, 2000);
    } catch (err) {
      setChangeError(
        err instanceof Error ? err.message : "Failed to change password",
      );
    } finally {
      setChangeLoading(false);
    }
  }

  // ========================= FORGOT PASSWORD =========================

  async function handleForgotCheck() {
    if (!forgotEmail.trim()) {
      setForgotError("Please enter your email");
      forgotEmailRef.current?.focus();
      return;
    }

    setForgotLoading(true);
    setForgotError("");

    try {
      const data = await apiPost<{ hasRecoveryCode: boolean }>(
        "/api/auth/forgot-password",
        { email: forgotEmail.trim() },
      );

      // FIX: Explicit null check to satisfy TypeScript
      if (!data) {
        throw new Error("No response from server.");
      }

      setForgotHasCode(data.hasRecoveryCode);
      setForgotStep(2);
      if (data.hasRecoveryCode) {
        setTimeout(() => recoveryCodeRef.current?.focus(), 100);
      }
    } catch (err) {
      setForgotError(
        err instanceof Error ? err.message : "Something went wrong",
      );
    } finally {
      setForgotLoading(false);
    }
  }

  async function handleForgotReset() {
    if (!recoveryCode) {
      setForgotError("Please enter your recovery code");
      recoveryCodeRef.current?.focus();
      return;
    }
    if (!PASSWORD_REGEX.test(forgotNewPassword)) {
      setForgotError(
        "Password must be at least 6 chars, with 1 letter & 1 number",
      );
      return;
    }
    if (forgotNewPassword !== forgotConfirmPassword) {
      setForgotError("Passwords do not match");
      return;
    }

    setForgotLoading(true);
    setForgotError("");

    try {
      await apiPost("/api/auth/forgot-password", {
        email: forgotEmail.trim(),
        recoveryCode: recoveryCode.trim().toUpperCase(),
        newPassword: forgotNewPassword,
      });

      setForgotSuccess(true);
      setTimeout(() => {
        setMode("login");
        setForgotStep(1);
        setForgotHasCode(null);
        setForgotEmail("");
        setRecoveryCode("");
        setForgotNewPassword("");
        setForgotConfirmPassword("");
        setForgotSuccess(false);
        setEmail(forgotEmail.trim());
      }, 3000);
    } catch (err) {
      setForgotError(
        err instanceof Error ? err.message : "Failed to reset password",
      );
    } finally {
      setForgotLoading(false);
    }
  }

  // Password strength
  const getStrength = (pwd: string) => {
    if (!pwd) return 0;
    let s = 0;
    if (pwd.length >= 6) s++;
    if (pwd.length >= 8) s++;
    if (/[A-Z]/.test(pwd)) s++;
    if (/[0-9]/.test(pwd)) s++;
    if (/[^A-Za-z0-9]/.test(pwd)) s++;
    return s;
  };

  const strength = getStrength(newPassword || forgotNewPassword);
  const strengthLabels = ["Weak", "Fair", "Good", "Strong", "Very Strong"];
  // Use semantic tokens so the meter works in light + dark mode
  const strengthColors = [
    "bg-destructive",
    "bg-warning",
    "bg-warning",
    "bg-success",
    "bg-success",
  ];

  if (isCheckingAuth) {
    return (
      <div className="min-h-screen bg-mesh flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="relative w-12 h-12">
            <div className="absolute inset-0 rounded-2xl bg-brand-gradient opacity-20 animate-pulse" />
            <Loader2 className="w-12 h-12 animate-spin text-primary" />
          </div>
          <p className="text-sm text-muted-foreground">Loading workspace…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-mesh flex items-center justify-center p-4 relative">
      {/* Decorative brand side panel — hidden on small screens */}
      <div className="hidden lg:flex fixed inset-y-0 left-0 w-[42%] xl:w-[45%] bg-brand-gradient flex-col justify-between p-12 text-primary-foreground overflow-hidden">
        <div className="absolute inset-0 opacity-20 pointer-events-none">
          <div className="absolute top-1/4 -left-12 w-72 h-72 bg-white/30 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 -right-12 w-96 h-96 bg-black/10 rounded-full blur-3xl" />
        </div>
        <div className="relative flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-white/15 backdrop-blur ring-1 ring-white/20 flex items-center justify-center">
            <Store className="w-5 h-5" />
          </div>
          <div>
            <p className="text-lg font-bold tracking-tight">ZKS Store</p>
            <p className="text-xs text-primary-foreground/70 -mt-0.5">
              Management System
            </p>
          </div>
        </div>
        <div className="relative space-y-6 max-w-md">
          <h2 className="text-3xl xl:text-4xl font-bold leading-tight tracking-tight">
            Run your store with confidence.
          </h2>
          <p className="text-sm xl:text-base text-primary-foreground/80 leading-relaxed">
            POS, inventory, khata, payroll &amp; accounting — built for
            Pakistani retail. Multi-store ready, FBR-aware, and offline-capable
            at the till.
          </p>
          <ul className="space-y-2 text-sm">
            {[
              "Lightning-fast checkout with register sessions",
              "Live stock levels across every branch",
              "Customer khata & supplier bakaya ledgers",
            ].map((line) => (
              <li key={line} className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-primary-foreground/90" />
                <span className="text-primary-foreground/85">{line}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="relative text-xs text-primary-foreground/60">
          © {new Date().getFullYear()} ZKS. Crafted for retailers.
        </div>
      </div>

      {/* Card — pushed right of the brand panel on large screens */}
      <div
        className={`w-full max-w-md lg:ml-auto lg:mr-[6%] xl:mr-[8%] bg-card rounded-2xl shadow-soft-lg ring-1 ring-border overflow-hidden transition-all duration-300 animate-rise ${
          shake ? "animate-shake" : ""
        }`}
      >
        {/* Header */}
        <div className="bg-surface-gradient px-8 py-8 sm:py-10 text-center border-b border-border relative">
          <div className="lg:hidden absolute inset-0 opacity-10 bg-brand-gradient" />
          <div className="relative">
            <div className="lg:hidden w-16 h-16 bg-brand-gradient rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-glow ring-1 ring-primary/20">
              <Store className="w-8 h-8 text-primary-foreground" />
            </div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">
              {mode === "login"
                ? "Welcome back"
                : mode === "changePassword"
                  ? "Set a new password"
                  : "Recover access"}
            </h1>
            <p className="text-sm text-muted-foreground mt-1 font-medium">
              {mode === "login"
                ? "Sign in to your ZKS workspace"
                : mode === "changePassword"
                  ? "For security, set a new password before continuing"
                  : "Enter your work email to continue"}
            </p>
          </div>
        </div>

        <div className="px-6 sm:px-8 py-7 sm:py-8">
          {/* ==================== LOGIN MODE ==================== */}
          {mode === "login" && (
            <div className="space-y-5">
              <div>
                <label
                  htmlFor="login-email"
                  className="block text-xs font-semibold text-foreground mb-1.5 uppercase tracking-wider"
                >
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  <input
                    id="login-email"
                    ref={emailRef}
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setError("");
                    }}
                    onKeyDown={handleEmailKeyDown}
                    placeholder="owner@zkr.local"
                    autoComplete="email"
                    maxLength={254}
                    className="w-full pl-11 pr-4 py-3 rounded-xl border border-input bg-background text-foreground text-sm placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30 outline-none transition-all"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="login-password"
                  className="block text-xs font-semibold text-foreground mb-1.5 uppercase tracking-wider"
                >
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  <input
                    id="login-password"
                    ref={passwordRef}
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setError("");
                    }}
                    onKeyDown={handlePasswordKeyDown}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    maxLength={128}
                    className="w-full pl-11 pr-12 py-3 rounded-xl border border-input bg-background text-foreground text-sm placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30 outline-none transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-md hover:bg-muted"
                    tabIndex={-1}
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2 text-destructive text-sm bg-destructive/10 px-4 py-3 rounded-xl border border-destructive/20">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <button
                onClick={handleLogin}
                disabled={loading}
                className="w-full bg-brand-gradient text-primary-foreground hover:brightness-110 active:brightness-95 disabled:opacity-50 disabled:hover:brightness-100 font-semibold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 shadow-soft-lg ring-1 ring-primary/20"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Signing in…</span>
                  </>
                ) : (
                  <>
                    <span>Sign In</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => {
                    setMode("forgotPassword");
                    setError("");
                    setForgotStep(1);
                    setForgotHasCode(null);
                    setForgotError("");
                    setForgotEmail("");
                  }}
                  className="text-sm text-primary hover:text-primary/80 font-medium transition-colors"
                >
                  Forgot password?
                </button>
              </div>
            </div>
          )}

          {/* ==================== CHANGE PASSWORD MODE ==================== */}
          {mode === "changePassword" && (
            <div className="space-y-5">
              <div className="text-center mb-2">
                <div className="w-12 h-12 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto mb-3 ring-1 ring-primary/15">
                  <Lock className="w-6 h-6" />
                </div>
                <h2 className="text-lg font-bold text-foreground">
                  Change Your Password
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  For security, set a new password before continuing.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1.5 uppercase tracking-wider">
                  New Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  <input
                    ref={newPasswordRef}
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => {
                      setNewPassword(e.target.value);
                      setChangeError("");
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        document.getElementById("confirm-password")?.focus();
                      }
                    }}
                    placeholder="Min 6 chars, 1 letter, 1 number"
                    autoComplete="new-password"
                    maxLength={128}
                    className="w-full pl-11 pr-12 py-3 rounded-xl border border-input bg-background text-foreground text-sm placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30 outline-none transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1.5 rounded-md hover:bg-muted"
                    tabIndex={-1}
                    aria-label={
                      showNewPassword ? "Hide password" : "Show password"
                    }
                  >
                    {showNewPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
                {newPassword && (
                  <div className="mt-2">
                    <div className="flex gap-1 h-1.5 mb-1.5">
                      {[1, 2, 3, 4, 5].map((l) => (
                        <div
                          key={l}
                          className={`flex-1 rounded-full transition-all ${
                            l <= strength
                              ? strengthColors[strength - 1]
                              : "bg-muted"
                          }`}
                        />
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Strength:{" "}
                      <span className="font-semibold text-foreground">
                        {strength > 0
                          ? strengthLabels[strength - 1]
                          : "Enter password"}
                      </span>
                    </p>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1.5 uppercase tracking-wider">
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  <input
                    id="confirm-password"
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      setChangeError("");
                    }}
                    onKeyDown={handleConfirmKeyDown}
                    placeholder="Re-enter your password"
                    autoComplete="new-password"
                    maxLength={128}
                    className="w-full pl-11 pr-12 py-3 rounded-xl border border-input bg-background text-foreground text-sm placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30 outline-none transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1.5 rounded-md hover:bg-muted"
                    tabIndex={-1}
                    aria-label={
                      showConfirmPassword ? "Hide password" : "Show password"
                    }
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {changeError && (
                <div className="flex items-start gap-2 text-destructive text-sm bg-destructive/10 px-4 py-3 rounded-xl border border-destructive/20">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{changeError}</span>
                </div>
              )}
              {changeSuccess && (
                <div className="flex items-start gap-2 text-success text-sm bg-success/15 px-4 py-3 rounded-xl border border-success/25">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>Password changed! Redirecting…</span>
                </div>
              )}

              <button
                onClick={handleChangePassword}
                disabled={changeLoading || changeSuccess}
                className="w-full bg-brand-gradient text-primary-foreground hover:brightness-110 disabled:opacity-50 disabled:hover:brightness-100 font-semibold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 shadow-soft-lg ring-1 ring-primary/20"
              >
                {changeLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Updating…</span>
                  </>
                ) : changeSuccess ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Done</span>
                  </>
                ) : (
                  <>
                    <span>Update Password</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          )}

          {/* ==================== FORGOT PASSWORD MODE ==================== */}
          {mode === "forgotPassword" && (
            <div className="space-y-5">
              <button
                onClick={() => setMode("login")}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to login
              </button>

              <div className="text-center mb-2">
                <div className="w-12 h-12 bg-warning/15 text-warning rounded-full flex items-center justify-center mx-auto mb-3 ring-1 ring-warning/25">
                  <RefreshCw className="w-6 h-6" />
                </div>
                <h2 className="text-lg font-bold text-foreground">
                  Reset Password
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {forgotStep === 1
                    ? "Enter your work email to continue."
                    : forgotHasCode
                      ? "Enter your recovery code and new password."
                      : "Contact your manager or owner"}
                </p>
              </div>

              {forgotStep === 1 && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-foreground mb-1.5 uppercase tracking-wider">
                      Email Address
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                      <input
                        ref={forgotEmailRef}
                        type="email"
                        value={forgotEmail}
                        onChange={(e) => {
                          setForgotEmail(e.target.value);
                          setForgotError("");
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleForgotCheck();
                          }
                        }}
                        placeholder="your@email.com"
                        maxLength={254}
                        className="w-full pl-11 pr-4 py-3 rounded-xl border border-input bg-background text-foreground text-sm placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30 outline-none transition-all"
                      />
                    </div>
                  </div>

                  {forgotError && (
                    <div className="flex items-start gap-2 text-destructive text-sm bg-destructive/10 px-4 py-3 rounded-xl border border-destructive/20">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{forgotError}</span>
                    </div>
                  )}

                  <button
                    onClick={handleForgotCheck}
                    disabled={forgotLoading}
                    className="w-full bg-brand-gradient text-primary-foreground hover:brightness-110 disabled:opacity-50 font-semibold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 shadow-soft-lg ring-1 ring-primary/20"
                  >
                    {forgotLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Checking…</span>
                      </>
                    ) : (
                      <>
                        <span>Continue</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              )}

              {forgotStep === 2 && forgotHasCode && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-foreground mb-1.5 uppercase tracking-wider">
                      Recovery Code
                    </label>
                    <div className="relative">
                      <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                      <input
                        ref={recoveryCodeRef}
                        type="text"
                        value={recoveryCode}
                        onChange={(e) => {
                          setRecoveryCode(e.target.value.toUpperCase());
                          setForgotError("");
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            document
                              .getElementById("forgot-new-password")
                              ?.focus();
                          }
                        }}
                        placeholder="XXXX-XXXX"
                        maxLength={9}
                        className="w-full pl-11 pr-4 py-3 rounded-xl border border-input bg-background text-foreground text-sm placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30 outline-none transition-all font-mono tracking-wider uppercase"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      The code shown during first-time setup
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-foreground mb-1.5 uppercase tracking-wider">
                      New Password
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                      <input
                        id="forgot-new-password"
                        type="password"
                        value={forgotNewPassword}
                        onChange={(e) => {
                          setForgotNewPassword(e.target.value);
                          setForgotError("");
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            document
                              .getElementById("forgot-confirm-password")
                              ?.focus();
                          }
                        }}
                        placeholder="Min 6 chars, 1 letter, 1 number"
                        autoComplete="new-password"
                        maxLength={128}
                        className="w-full pl-11 pr-4 py-3 rounded-xl border border-input bg-background text-foreground text-sm placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30 outline-none transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-foreground mb-1.5 uppercase tracking-wider">
                      Confirm Password
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                      <input
                        id="forgot-confirm-password"
                        type="password"
                        value={forgotConfirmPassword}
                        onChange={(e) => {
                          setForgotConfirmPassword(e.target.value);
                          setForgotError("");
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleForgotReset();
                          }
                        }}
                        placeholder="Re-enter password"
                        autoComplete="new-password"
                        maxLength={128}
                        className="w-full pl-11 pr-4 py-3 rounded-xl border border-input bg-background text-foreground text-sm placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30 outline-none transition-all"
                      />
                    </div>
                  </div>

                  {forgotError && (
                    <div className="flex items-start gap-2 text-destructive text-sm bg-destructive/10 px-4 py-3 rounded-xl border border-destructive/20">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{forgotError}</span>
                    </div>
                  )}

                  {forgotSuccess && (
                    <div className="flex items-start gap-2 text-success text-sm bg-success/15 px-4 py-3 rounded-xl border border-success/25">
                      <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>Password reset! Redirecting to login…</span>
                    </div>
                  )}

                  <button
                    onClick={handleForgotReset}
                    disabled={forgotLoading || forgotSuccess}
                    className="w-full bg-brand-gradient text-primary-foreground hover:brightness-110 disabled:opacity-50 font-semibold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 shadow-soft-lg ring-1 ring-primary/20"
                  >
                    {forgotLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Resetting…</span>
                      </>
                    ) : (
                      <>
                        <span>Reset Password</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              )}

              {forgotStep === 2 && forgotHasCode === false && (
                <div className="text-center py-6">
                  <ShieldAlert className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-foreground font-medium mb-2">
                    Self-service reset unavailable
                  </p>
                  <p className="text-sm text-muted-foreground mb-4">
                    Your account does not have a recovery code. Please contact
                    your <strong>manager</strong> or <strong>owner</strong> to
                    reset your password.
                  </p>
                  <button
                    onClick={() => {
                      setMode("login");
                      setForgotStep(1);
                      setForgotHasCode(null);
                    }}
                    className="text-primary hover:text-primary/80 font-medium text-sm"
                  >
                    Back to login
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-8 pb-8 text-center">
          <p className="text-xs text-muted-foreground">
            {mode === "login" && "Enter your work email and password"}
            {mode === "changePassword" && "Keep your account secure"}
            {mode === "forgotPassword" && "Account recovery"}
          </p>
        </div>
      </div>

      {/* ==================== FIRST-TIME SETUP MODAL ==================== */}
      {showFirstTimeModal && firstTimeCreds && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-card rounded-2xl shadow-soft-lg ring-1 ring-border overflow-hidden animate-scale-in">
            <div className="bg-brand-gradient px-6 py-6 text-center">
              <div className="w-14 h-14 bg-white/15 rounded-xl flex items-center justify-center mx-auto mb-3 backdrop-blur-sm ring-1 ring-white/20">
                <KeyRound className="w-7 h-7 text-primary-foreground" />
              </div>
              <h2 className="text-xl font-bold text-primary-foreground">
                Welcome, Owner!
              </h2>
              <p className="text-primary-foreground/80 text-sm mt-1">
                Your store is ready
              </p>
            </div>

            <div className="px-6 py-6 space-y-4">
              <div className="p-3 bg-muted/60 rounded-xl border border-border">
                <div className="flex justify-between text-sm items-center">
                  <span className="text-muted-foreground">Email</span>
                  <span className="font-semibold text-foreground truncate ml-2">
                    {firstTimeCreds.email}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  Your password is the one you just entered
                </p>
              </div>

              <div className="p-4 bg-warning/15 rounded-xl border-2 border-warning/40">
                <p className="text-xs text-warning font-semibold uppercase tracking-wider mb-2 text-center">
                  Recovery Code — Save This!
                </p>
                <p
                  id="recovery-code-text"
                  className="text-2xl font-bold text-foreground text-center font-mono tracking-[0.2em] select-all"
                >
                  {firstTimeCreds.recoveryCode}
                </p>
                <p className="text-xs text-muted-foreground text-center mt-2">
                  This is the only way to recover your password if you forget
                  it.
                </p>
              </div>

              <button
                onClick={copyRecoveryCode}
                className={`w-full py-3 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 ${
                  copied
                    ? "bg-success/15 text-success border border-success/30"
                    : "bg-muted hover:bg-muted/70 text-foreground border border-border"
                }`}
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Copied to clipboard!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Copy Recovery Code</span>
                  </>
                )}
              </button>

              <button
                onClick={handleFirstTimeContinue}
                className="w-full bg-brand-gradient hover:brightness-110 text-primary-foreground font-semibold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 shadow-soft-lg ring-1 ring-primary/20"
              >
                <span>I have saved it — Continue</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        @keyframes shake {
          0%,
          100% {
            transform: translateX(0);
          }
          20% {
            transform: translateX(-10px);
          }
          40% {
            transform: translateX(10px);
          }
          60% {
            transform: translateX(-5px);
          }
          80% {
            transform: translateX(5px);
          }
        }
        .animate-shake {
          animation: shake 0.5s ease-in-out;
        }
      `}</style>
    </div>
  );
}
