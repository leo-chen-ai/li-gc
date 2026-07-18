import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { LoginForm } from "./LoginForm";
import { useIsAuthenticated } from "@/stores/use-auth-store";

export function LoginPage() {
  const navigate = useNavigate();
  const isAuthenticated = useIsAuthenticated();
  const { setTheme, theme } = useTheme();
  const selectedTheme = theme ?? "system";

  useEffect(() => {
    // handled by app.tsx
  }, [isAuthenticated, navigate]);

  if (isAuthenticated) return null;

  return (
    <div className="h-dvh overflow-hidden bg-[#eef7f1] text-slate-950 dark:bg-[#071f22] dark:text-white">
      <div className="grid h-full w-full lg:grid-cols-[56vw_44vw]">
        <section className="relative hidden overflow-hidden bg-[#dcefe4] lg:block">
          <img
            src="/login-construction-bg.jpg"
            alt=""
            aria-hidden="true"
            className="absolute inset-x-0 bottom-0 h-[42%] w-full object-cover object-left-bottom opacity-[0.08] mix-blend-multiply grayscale"
          />
          <div
            className="absolute inset-0 opacity-60"
            aria-hidden="true"
            style={{
              backgroundImage:
                "linear-gradient(rgba(15,107,93,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(15,107,93,0.07) 1px, transparent 1px)",
              backgroundSize: "44px 44px",
            }}
          />
          <div className="absolute inset-x-0 bottom-0 h-1/2 bg-[linear-gradient(180deg,rgba(220,239,228,0)_0%,rgba(196,226,209,0.72)_100%)]" />

          <div className="absolute left-12 top-10 z-10 flex items-center gap-4 xl:left-16 xl:top-14">
            <div className="flex size-14 items-center justify-center rounded-xl bg-[#0f6b5d] text-[34px] font-semibold leading-none text-white shadow-[0_16px_36px_rgba(15,107,93,0.22)] ring-1 ring-[#073d35]/10">
              山
            </div>
            <div className="text-[#0b3d34]">
              <div className="text-[30px] font-semibold leading-none tracking-normal">
                山淮筑
              </div>
              <div className="mt-2 text-[10px] font-semibold uppercase tracking-[0.28em] text-[#0b3d34]/68">
                SHANHUAI ZHU
              </div>
            </div>
          </div>

          <div className="relative flex h-full items-center justify-center px-12 pb-16 pt-32 xl:px-16">
            <img
              src="/login-construction-illustration.jpg"
              alt=""
              aria-hidden="true"
              className="w-full max-w-[780px] mix-blend-multiply opacity-95 drop-shadow-[0_28px_48px_rgba(15,107,93,0.12)]"
            />
          </div>
        </section>

        <section className="relative flex h-dvh flex-col overflow-hidden bg-[#f8fcf9] px-5 py-4 dark:bg-[#071f22] sm:px-8 lg:px-10">
          <div className="flex justify-end">
            <div className="hidden items-center gap-1 rounded-full border border-slate-900/10 bg-white/72 p-1 text-xs font-semibold text-slate-600 shadow-sm backdrop-blur-md dark:border-white/14 dark:bg-white/10 dark:text-white/82 sm:flex">
            <button
              type="button"
              onClick={() => setTheme("light")}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 transition ${
                selectedTheme === "light"
                  ? "bg-[#0f7d6f] text-white shadow-sm"
                  : "hover:bg-white/16 hover:text-white lg:hover:bg-slate-900/5 lg:hover:text-slate-950 lg:dark:hover:bg-white/10 lg:dark:hover:text-white"
              }`}
            >
              <Sun className="size-3.5" />
              白天
            </button>
            <button
              type="button"
              onClick={() => setTheme("dark")}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 transition ${
                selectedTheme === "dark"
                  ? "bg-[#0f7d6f] text-white shadow-sm"
                  : "hover:bg-white/16 hover:text-white lg:hover:bg-slate-900/5 lg:hover:text-slate-950 lg:dark:hover:bg-white/10 lg:dark:hover:text-white"
              }`}
            >
              <Moon className="size-3.5" />
              夜间
            </button>
            <button
              type="button"
              onClick={() => setTheme("system")}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 transition ${
                selectedTheme === "system"
                  ? "bg-[#0f7d6f] text-white shadow-sm"
                  : "hover:bg-white/16 hover:text-white lg:hover:bg-slate-900/5 lg:hover:text-slate-950 lg:dark:hover:bg-white/10 lg:dark:hover:text-white"
              }`}
            >
              <Monitor className="size-3.5" />
              跟随系统
            </button>
          </div>
          </div>

          <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col justify-center space-y-3 py-3">
            <section className="w-full rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_24px_70px_rgba(15,23,42,0.12)] dark:border-white/16 dark:bg-[#09272d] dark:shadow-[0_32px_90px_rgba(0,0,0,0.42)] sm:p-5 lg:p-6">
              <LoginForm />
            </section>

            <footer className="text-center text-xs font-medium text-slate-500/82 dark:text-white/52">
              2026 宁波山淮科技有限公司 技术支持
            </footer>
          </div>
        </section>
      </div>
    </div>
  );
}
