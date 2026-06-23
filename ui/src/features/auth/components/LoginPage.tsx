import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { BarChart3, Monitor, Moon, ShieldCheck, Sun, UsersRound } from "lucide-react";
import { useTheme } from "next-themes";
import { LoginForm } from "./LoginForm";
import { useIsAuthenticated } from "@/stores/use-auth-store";

const loginHighlights = [
  {
    icon: ShieldCheck,
    title: "安全合规",
    text: "实时掌握风险，守护施工安全",
  },
  {
    icon: BarChart3,
    title: "精细管控",
    text: "数据驱动决策，提升管理效率",
  },
  {
    icon: UsersRound,
    title: "协同高效",
    text: "多方协同作业，信息透明共享",
  },
];

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
    <div className="relative min-h-screen overflow-hidden bg-[#e8f1ee] text-slate-950 dark:bg-[#071f22] dark:text-white">
      <img
        src="/login-construction-bg.jpg"
        alt=""
        className="absolute inset-0 h-full w-full object-cover object-center"
        aria-hidden="true"
      />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(233,243,239,0.94)_0%,rgba(233,243,239,0.86)_42%,rgba(235,242,240,0.72)_72%,rgba(235,242,240,0.56)_100%)] dark:bg-[linear-gradient(90deg,rgba(2,34,35,0.92)_0%,rgba(3,45,47,0.82)_42%,rgba(5,28,33,0.58)_72%,rgba(5,20,26,0.38)_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_18%,rgba(16,126,111,0.18),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.28),rgba(221,234,230,0.72))] dark:bg-[radial-gradient(circle_at_16%_18%,rgba(19,124,106,0.38),transparent_34%),linear-gradient(180deg,rgba(2,12,18,0.08),rgba(2,12,18,0.72))]" />
      <div className="absolute inset-x-0 top-0 h-px bg-slate-900/10 dark:bg-white/20" />

      <div className="relative mx-auto grid min-h-screen w-full max-w-7xl grid-rows-[auto_1fr] px-5 py-7 sm:px-8 lg:px-10">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex size-14 items-center justify-center rounded-lg bg-[#0f7d6f] text-2xl font-semibold text-white shadow-[0_16px_42px_rgba(4,120,103,0.36)]">
              山
            </div>
            <div>
              <div className="text-xl font-semibold tracking-normal text-slate-950 dark:text-white">
                山淮建设管理平台
              </div>
              <div className="mt-1 text-sm font-medium text-slate-600 dark:text-white/62">管理后台</div>
            </div>
          </div>
          <div className="hidden items-center gap-1 rounded-full border border-slate-900/10 bg-white/70 p-1 text-xs font-semibold text-slate-600 shadow-sm backdrop-blur-md dark:border-white/14 dark:bg-white/10 dark:text-white/82 sm:flex">
            <button
              type="button"
              onClick={() => setTheme("light")}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 transition ${
                selectedTheme === "light"
                  ? "bg-[#0f7d6f] text-white shadow-sm"
                  : "hover:bg-white/10 hover:text-white"
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
                  : "hover:bg-slate-900/5 dark:hover:bg-white/10"
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
                  : "hover:bg-slate-900/5 dark:hover:bg-white/10"
              }`}
            >
              <Monitor className="size-3.5" />
              跟随系统
            </button>
          </div>
        </header>

        <main className="grid items-center gap-12 py-10 lg:grid-cols-[minmax(0,1fr)_430px] lg:py-14">
          <section className="hidden max-w-2xl lg:block">
            <div className="inline-flex items-center rounded-full border border-[#0f7d6f]/18 bg-white/68 px-4 py-2 text-sm font-semibold text-[#0f6b5d] shadow-sm backdrop-blur dark:border-[#48d6c1]/22 dark:bg-[#0f7d6f]/18 dark:text-[#baf6ee]">
              现场管理专用入口
            </div>
            <h1 className="mt-12 max-w-[620px] text-[42px] font-semibold leading-[1.22] tracking-normal text-slate-950 drop-shadow-sm dark:text-white xl:text-[48px]">
              专注现场管理
              <br />
              让工程更安全、高效、可控
            </h1>

            <div className="mt-14 space-y-7">
              {loginHighlights.map((item) => (
                <div key={item.title} className="flex max-w-[520px] items-center gap-5">
                  <div className="flex size-14 shrink-0 items-center justify-center rounded-full border border-[#0f7d6f]/18 bg-[#0f7d6f]/12 text-[#0f6b5d] shadow-[0_18px_44px_rgba(4,120,103,0.14)] backdrop-blur dark:border-[#4be0ce]/18 dark:bg-[#0f7d6f]/62 dark:text-[#d8fffa] dark:shadow-[0_18px_44px_rgba(4,120,103,0.26)]">
                    <item.icon className="size-6" />
                  </div>
                  <div>
                    <div className="text-xl font-semibold text-slate-950 dark:text-white">{item.title}</div>
                    <div className="mt-1.5 text-base font-medium text-slate-600 dark:text-white/64">{item.text}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="w-full rounded-2xl border border-white/80 bg-white/82 p-6 shadow-[0_30px_100px_rgba(15,23,42,0.18)] backdrop-blur-xl dark:border-white/20 dark:bg-[#09272d]/78 dark:shadow-[0_30px_100px_rgba(0,0,0,0.42)] sm:p-8">
            <LoginForm />
          </section>
        </main>
      </div>
    </div>
  );
}
