import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ArrowRight,
  Calculator,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  MonitorSmartphone,
  QrCode,
  RefreshCw,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { authKeys, useLogin } from "@/features/auth/hooks/use-login";
import { authService } from "@/lib/api/services/auth-services";
import {
  clearAdminWindowState,
  readStoredAdminActivePath,
} from "@/components/layout/admin-window-storage";
import { useAuthActions } from "@/stores/use-auth-store";
import {
  createMathCaptcha,
  isMathCaptchaAnswerValid,
} from "@/features/auth/lib/math-captcha";
import type {
  AuthResponse,
  ScanLoginPollResponse,
  ScanLoginSession,
} from "@/features/auth/types/auth-types";

function isAuthResponse(data: ScanLoginPollResponse): data is AuthResponse {
  return "token" in data && "user" in data;
}

export function LoginForm() {
  const [loginMode, setLoginMode] = useState<"password" | "scan">("password");
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [captcha, setCaptcha] = useState(() => createMathCaptcha());
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  const [captchaError, setCaptchaError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [scanSession, setScanSession] = useState<ScanLoginSession | null>(null);
  const [scanStatus, setScanStatus] = useState<"idle" | "loading" | "pending" | "confirmed" | "expired" | "error">("idle");
  const [scanError, setScanError] = useState("");
  const [registerOpen, setRegisterOpen] = useState(false);
  const [registerUsername, setRegisterUsername] = useState("");
  const [registerName, setRegisterName] = useState("");
  const [registerPhone, setRegisterPhone] = useState("");
  const [registerSubmitting, setRegisterSubmitting] = useState(false);
  const [registerDone, setRegisterDone] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const login = useLogin();
  const { login: saveAuth } = useAuthActions();

  const startScanLogin = useCallback(async () => {
    setScanStatus("loading");
    setScanError("");
    try {
      const session = await authService.createScanLoginSession();
      setScanSession(session);
      setScanStatus("pending");
    } catch (error) {
      setScanSession(null);
      setScanStatus("error");
      setScanError(error instanceof Error ? error.message : "二维码生成失败");
    }
  }, []);

  useEffect(() => {
    if (loginMode === "scan" && scanStatus === "idle") {
      void startScanLogin();
    }
  }, [loginMode, scanStatus, startScanLogin]);

  useEffect(() => {
    if (loginMode !== "scan" || !scanSession || scanStatus !== "pending") return;

    let cancelled = false;
    let timer: number | undefined;

    const poll = async () => {
      try {
        const result = await authService.pollScanLoginSession(scanSession.scan_token);
        if (cancelled) return;

        if (isAuthResponse(result)) {
          setScanStatus("confirmed");
          saveAuth(result.token.access_token, result.user);
          clearAdminWindowState();
          queryClient.invalidateQueries({ queryKey: authKeys.me() });
          toast.success("扫码登录成功");
          navigate({ to: readStoredAdminActivePath(), replace: true });
          return;
        }

        timer = window.setTimeout(poll, 1600);
      } catch (error) {
        if (cancelled) return;
        setScanStatus("expired");
        setScanError(error instanceof Error ? error.message : "二维码已失效，请刷新");
      }
    };

    timer = window.setTimeout(poll, 1000);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [loginMode, navigate, queryClient, saveAuth, scanSession, scanStatus]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isMathCaptchaAnswerValid(captchaAnswer, captcha.answer)) {
      setCaptchaError("计算结果不正确，请重新输入");
      refreshCaptcha();
      return;
    }

    try {
      await login.mutateAsync({ account, password });
      clearAdminWindowState();
      navigate({ to: readStoredAdminActivePath(), replace: true });
    } catch {
      // Error handled by hook
    }
  };

  const refreshCaptcha = () => {
    setCaptcha(createMathCaptcha());
    setCaptchaAnswer("");
  };

  const submitRegistrationLead = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegisterSubmitting(true);
    try {
      await authService.createRegistrationLead({
        username: registerUsername.trim(),
        name: registerName.trim(),
        phone: registerPhone.trim(),
      });
      setRegisterDone(true);
      setRegisterUsername("");
      setRegisterName("");
      setRegisterPhone("");
    } finally {
      setRegisterSubmitting(false);
    }
  };

  return (
    <div className="w-full">
      <div className="space-y-4">
        <div className="border-b border-slate-900/8 pb-4 dark:border-white/10">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#0f7d6f]/14 bg-[#0f7d6f]/8 px-3 py-1.5 text-xs font-semibold text-[#0f6b5d] dark:border-[#28c7b4]/20 dark:bg-[#28c7b4]/10 dark:text-[#a8fff4]">
            <ShieldCheck className="size-3.5" />
            安全入口
          </div>
          <h1 className="text-[28px] font-semibold leading-tight tracking-normal text-slate-950 dark:text-white">
            登录山淮筑
          </h1>
          <p className="mt-1.5 text-sm leading-5 text-slate-500 dark:text-white/54">
            账号可使用邮箱或用户名，登录后进入业务工作台。
          </p>
        </div>

        <div className="grid grid-cols-2 rounded-lg border border-slate-200 bg-slate-50 p-1 text-sm font-semibold text-slate-500 dark:border-white/12 dark:bg-white/[0.05] dark:text-white/58">
          <button
            type="button"
            onClick={() => setLoginMode("password")}
            className={`inline-flex h-10 items-center justify-center gap-2 rounded-md transition ${
              loginMode === "password"
                ? "bg-white text-[#0f6b5d] shadow-sm dark:bg-white/12 dark:text-white"
                : "hover:bg-white/70 hover:text-slate-800 dark:hover:bg-white/8 dark:hover:text-white"
            }`}
          >
            <UserRound className="size-4" />
            账号登录
          </button>
          <button
            type="button"
            onClick={() => setLoginMode("scan")}
            className={`inline-flex h-10 items-center justify-center gap-2 rounded-md transition ${
              loginMode === "scan"
                ? "bg-white text-[#0f6b5d] shadow-sm dark:bg-white/12 dark:text-white"
                : "hover:bg-white/70 hover:text-slate-800 dark:hover:bg-white/8 dark:hover:text-white"
            }`}
          >
            <QrCode className="size-4" />
            小程序扫码
          </button>
        </div>

        {loginMode === "password" ? (
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="account" className="text-sm font-semibold text-slate-700 dark:text-white/78">
              账号
            </Label>
            <div className="relative">
              <UserRound className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-400 dark:text-white/42" />
              <Input
                id="account"
                type="text"
                placeholder="请输入邮箱或用户名"
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                required
                className="h-12 rounded-lg border-slate-200 bg-white/76 pl-11 pr-4 text-[15px] text-slate-950 shadow-inner shadow-slate-900/4 transition-all placeholder:text-slate-400 focus-visible:border-[#0f7d6f] focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-[#0f7d6f]/15 dark:border-white/14 dark:bg-white/[0.06] dark:text-white dark:shadow-black/10 dark:placeholder:text-white/34 dark:focus-visible:border-[#28c7b4] dark:focus-visible:bg-white/[0.08] dark:focus-visible:ring-[#28c7b4]/20"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="text-sm font-semibold text-slate-700 dark:text-white/78">
              密码
            </Label>
            <div className="relative">
              <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-400 dark:text-white/42" />
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="请输入密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-12 rounded-lg border-slate-200 bg-white/76 px-11 text-[15px] text-slate-950 shadow-inner shadow-slate-900/4 transition-all placeholder:text-slate-400 focus-visible:border-[#0f7d6f] focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-[#0f7d6f]/15 dark:border-white/14 dark:bg-white/[0.06] dark:text-white dark:shadow-black/10 dark:placeholder:text-white/34 dark:focus-visible:border-[#28c7b4] dark:focus-visible:bg-white/[0.08] dark:focus-visible:ring-[#28c7b4]/20"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-white/42 dark:hover:bg-white/10 dark:hover:text-white"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "隐藏密码" : "显示密码"}
              >
                {showPassword ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="captcha" className="text-sm font-semibold text-slate-700 dark:text-white/78">
                安全校验
              </Label>
              <button
                type="button"
                onClick={refreshCaptcha}
                className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs font-medium text-[#0f7d6f] transition-colors hover:bg-[#0f7d6f]/10 dark:text-[#80f3e5] dark:hover:bg-white/10 dark:hover:text-white"
              >
                <RefreshCw className="size-3.5" />
                换一题
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-[118px_minmax(0,1fr)]">
              <div className="flex h-12 items-center justify-center gap-2 rounded-lg border border-[#0f7d6f]/18 bg-[#ecf4f1] text-base font-semibold text-[#0f5f55] dark:border-[#28c7b4]/22 dark:bg-[#0f7d6f]/24 dark:text-white">
                <Calculator className="size-4 text-[#0f7d6f] dark:text-[#80f3e5]" />
                {captcha.expression}
              </div>
              <Input
                id="captcha"
                inputMode="numeric"
                placeholder="请输入计算结果"
                value={captchaAnswer}
                onChange={(e) => {
                  setCaptchaAnswer(e.target.value);
                  setCaptchaError("");
                }}
                required
                className="h-12 rounded-lg border-slate-200 bg-white/76 px-4 text-[15px] text-slate-950 shadow-inner shadow-slate-900/4 transition-all placeholder:text-slate-400 focus-visible:border-[#0f7d6f] focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-[#0f7d6f]/15 dark:border-white/14 dark:bg-white/[0.06] dark:text-white dark:shadow-black/10 dark:placeholder:text-white/34 dark:focus-visible:border-[#28c7b4] dark:focus-visible:bg-white/[0.08] dark:focus-visible:ring-[#28c7b4]/20"
              />
            </div>
            {captchaError && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 dark:border-amber-500/28 dark:bg-amber-500/10 dark:text-amber-200">
                {captchaError}
              </div>
            )}
          </div>

          <Button
            type="submit"
            className="group mt-4 h-12 w-full rounded-lg bg-[#0f8f7e] text-base font-semibold text-white shadow-[0_18px_42px_rgba(15,143,126,0.28)] transition-all hover:-translate-y-0.5 hover:bg-[#0d7f70] hover:shadow-[0_22px_50px_rgba(15,143,126,0.34)] disabled:translate-y-0"
            disabled={login.isPending}
          >
            {login.isPending ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <>
                登录 <ArrowRight className="ml-2 size-5 transition-transform group-hover:translate-x-0.5" />
              </>
            )}
          </Button>
        </form>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-[#0f7d6f]/14 bg-[#f5fbf8] p-4 text-center dark:border-[#28c7b4]/18 dark:bg-white/[0.05]">
              <div className="text-xs leading-5 text-slate-500 dark:text-white/54">
                打开小程序「我的」页，点「扫码登录电脑端」后扫描此二维码。
              </div>

              <div className="mx-auto mt-4 flex size-[210px] items-center justify-center rounded-xl border border-slate-200 bg-white p-3 shadow-inner shadow-slate-900/5 dark:border-white/12 dark:bg-white">
                {scanStatus === "loading" || !scanSession ? (
                  <Loader2 className="size-8 animate-spin text-[#0f7d6f]" />
                ) : (
                  <img
                    src={authService.getScanLoginQrUrl(scanSession.scan_token)}
                    alt="小程序扫码登录二维码"
                    className="size-full"
                  />
                )}
              </div>

              <div className="mt-4 inline-flex min-h-9 items-center justify-center gap-2 rounded-full border border-[#0f7d6f]/14 bg-white px-3 text-xs font-semibold text-[#0f6b5d] dark:border-white/12 dark:bg-white/8 dark:text-[#a8fff4]">
                {scanStatus === "confirmed" ? (
                  <>
                    <MonitorSmartphone className="size-3.5" />
                    登录确认中
                  </>
                ) : scanStatus === "expired" || scanStatus === "error" ? (
                  <>
                    <RefreshCw className="size-3.5" />
                    {scanError || "二维码已失效，请刷新"}
                  </>
                ) : (
                  <>
                    <MonitorSmartphone className="size-3.5" />
                    等待小程序确认
                  </>
                )}
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={startScanLogin}
              disabled={scanStatus === "loading"}
              className="h-11 w-full rounded-lg border-[#0f7d6f]/20 text-[#0f6b5d] hover:bg-[#ecf4f1] hover:text-[#0b5148] dark:border-[#28c7b4]/24 dark:text-[#a8fff4] dark:hover:bg-white/10 dark:hover:text-white"
            >
              {scanStatus === "loading" ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="mr-2 size-4" />}
              刷新二维码
            </Button>
          </div>
        )}
        <div className="text-center text-sm text-slate-500 dark:text-white/54">
          没有账号？
          <button
            type="button"
            onClick={() => {
              setRegisterDone(false);
              setRegisterOpen(true);
            }}
            className="ml-1 font-semibold text-[#0f7d6f] hover:text-[#0b5148] hover:underline dark:text-[#80f3e5]"
          >
            注册
          </button>
        </div>
      </div>
      <Dialog open={registerOpen} onOpenChange={setRegisterOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>注册山淮筑</DialogTitle>
            <DialogDescription>
              提交后工作人员会根据用户名、姓名和手机号联系开通。
            </DialogDescription>
          </DialogHeader>
          {registerDone ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
              注册信息已提交，请等待工作人员联系。
            </div>
          ) : (
            <form onSubmit={submitRegistrationLead} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="register-username">用户名</Label>
                <Input
                  id="register-username"
                  value={registerUsername}
                  onChange={(e) => setRegisterUsername(e.target.value)}
                  required
                  minLength={3}
                  maxLength={50}
                  autoComplete="username"
                  placeholder="请输入用户名"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="register-name">姓名</Label>
                <Input
                  id="register-name"
                  value={registerName}
                  onChange={(e) => setRegisterName(e.target.value)}
                  required
                  minLength={2}
                  placeholder="请输入姓名"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="register-phone">手机号</Label>
                <Input
                  id="register-phone"
                  value={registerPhone}
                  onChange={(e) => setRegisterPhone(e.target.value)}
                  required
                  inputMode="tel"
                  placeholder="请输入手机号"
                />
              </div>
              <Button type="submit" className="w-full bg-[#0f7d6f] hover:bg-[#0b5148]" disabled={registerSubmitting}>
                {registerSubmitting ? <Loader2 className="size-4 animate-spin" /> : "提交注册"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
