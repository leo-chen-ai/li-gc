import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowRight, Calculator, Eye, EyeOff, Loader2, LockKeyhole, RefreshCw, UserRound } from "lucide-react";
import { useLogin } from "@/features/auth/hooks/use-login";
import {
  createMathCaptcha,
  isMathCaptchaAnswerValid,
} from "@/features/auth/lib/math-captcha";

export function LoginForm() {
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [captcha, setCaptcha] = useState(() => createMathCaptcha());
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  const [captchaError, setCaptchaError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const login = useLogin();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isMathCaptchaAnswerValid(captchaAnswer, captcha.answer)) {
      setCaptchaError("计算结果不正确，请重新输入");
      refreshCaptcha();
      return;
    }

    try {
      await login.mutateAsync({ account, password });
      navigate({ to: "/app/admin/projects", replace: true });
    } catch {
      // Error handled by hook
    }
  };

  const refreshCaptcha = () => {
    setCaptcha(createMathCaptcha());
    setCaptchaAnswer("");
  };

  return (
    <div className="w-full">
      <div className="space-y-8">
        <div className="space-y-2">
          <h1 className="text-[28px] font-semibold leading-tight tracking-normal text-slate-950 dark:text-white">
            管理员登录
          </h1>
          <p className="text-sm leading-6 text-slate-500 dark:text-white/54">
            欢迎使用山淮筑
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2.5">
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
                className="h-13 rounded-lg border-slate-200 bg-white/72 pl-11 pr-4 text-[15px] text-slate-950 shadow-inner shadow-slate-900/5 transition-all placeholder:text-slate-400 focus-visible:border-[#0f7d6f] focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-[#0f7d6f]/15 dark:border-white/14 dark:bg-white/[0.06] dark:text-white dark:shadow-black/10 dark:placeholder:text-white/34 dark:focus-visible:border-[#28c7b4] dark:focus-visible:bg-white/[0.08] dark:focus-visible:ring-[#28c7b4]/20"
              />
            </div>
          </div>

          <div className="space-y-2.5">
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
                className="h-13 rounded-lg border-slate-200 bg-white/72 px-11 text-[15px] text-slate-950 shadow-inner shadow-slate-900/5 transition-all placeholder:text-slate-400 focus-visible:border-[#0f7d6f] focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-[#0f7d6f]/15 dark:border-white/14 dark:bg-white/[0.06] dark:text-white dark:shadow-black/10 dark:placeholder:text-white/34 dark:focus-visible:border-[#28c7b4] dark:focus-visible:bg-white/[0.08] dark:focus-visible:ring-[#28c7b4]/20"
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

          <div className="space-y-2.5">
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
            <div className="grid gap-3 sm:grid-cols-[112px_minmax(0,1fr)]">
              <div className="flex h-13 items-center justify-center gap-2 rounded-lg border border-[#0f7d6f]/20 bg-[#0f7d6f]/10 text-base font-semibold text-[#0f5f55] dark:border-[#28c7b4]/22 dark:bg-[#0f7d6f]/24 dark:text-white">
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
                className="h-13 rounded-lg border-slate-200 bg-white/72 px-4 text-[15px] text-slate-950 shadow-inner shadow-slate-900/5 transition-all placeholder:text-slate-400 focus-visible:border-[#0f7d6f] focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-[#0f7d6f]/15 dark:border-white/14 dark:bg-white/[0.06] dark:text-white dark:shadow-black/10 dark:placeholder:text-white/34 dark:focus-visible:border-[#28c7b4] dark:focus-visible:bg-white/[0.08] dark:focus-visible:ring-[#28c7b4]/20"
              />
            </div>
            {captchaError && (
              <div className="text-xs font-medium text-amber-700 dark:text-amber-200">{captchaError}</div>
            )}
          </div>

          <Button
            type="submit"
            className="mt-8 h-13 w-full rounded-lg bg-[#0f9b88] text-base font-semibold text-white shadow-[0_18px_42px_rgba(15,155,136,0.28)] transition-all hover:bg-[#0d8a7a] hover:shadow-[0_22px_50px_rgba(15,155,136,0.34)]"
            disabled={login.isPending}
          >
            {login.isPending ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <>
                登录 <ArrowRight className="ml-2 size-5" />
              </>
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
