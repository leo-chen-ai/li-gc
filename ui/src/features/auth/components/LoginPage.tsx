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
    <div className="relative min-h-screen overflow-hidden bg-[#e7f0ed] text-slate-950 dark:bg-[#071f22] dark:text-white">
      <img
        src="/login-construction-bg.jpg"
        alt=""
        className="absolute inset-0 h-full w-full object-cover object-[34%_center]"
        aria-hidden="true"
      />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,34,35,0.84)_0%,rgba(5,34,35,0.62)_38%,rgba(231,240,237,0.94)_72%,rgba(231,240,237,0.98)_100%)] dark:bg-[linear-gradient(180deg,rgba(3,24,28,0.92)_0%,rgba(4,30,34,0.78)_44%,rgba(7,31,34,0.94)_100%)] lg:bg-[linear-gradient(100deg,rgba(3,29,31,0.9)_0%,rgba(5,39,40,0.74)_43%,rgba(232,241,238,0.9)_65%,rgba(232,241,238,0.98)_100%)] lg:dark:bg-[linear-gradient(100deg,rgba(3,20,24,0.94)_0%,rgba(4,30,34,0.8)_44%,rgba(7,31,34,0.92)_67%,rgba(7,31,34,0.98)_100%)]" />
      <div className="absolute inset-y-0 right-0 hidden w-[44vw] bg-[#f6fbf8]/72 backdrop-blur-sm dark:bg-[#071f22]/72 lg:block" />
      <div className="absolute inset-x-0 top-0 h-px bg-white/22 dark:bg-white/14" />

      <div className="relative grid min-h-screen w-full grid-rows-[auto_1fr] px-5 py-6 sm:px-8 lg:grid-rows-[auto_minmax(0,1fr)] lg:px-0 lg:py-0">
        <header className="flex items-center justify-between lg:grid lg:grid-cols-[56vw_44vw]">
          <div className="flex items-center gap-4 lg:px-10 lg:pt-6">
            <div className="flex size-13 items-center justify-center rounded-lg bg-[#0f7d6f] text-2xl font-semibold text-white shadow-[0_18px_44px_rgba(4,120,103,0.34)] ring-1 ring-white/30">
              山
            </div>
            <div>
              <div className="text-lg font-semibold tracking-normal text-white lg:text-slate-50">
                山淮筑
              </div>
              <div className="mt-1 text-sm font-medium text-white/68">管理后台</div>
            </div>
          </div>
          <div className="hidden items-center gap-1 rounded-full border border-white/28 bg-white/18 p-1 text-xs font-semibold text-white/78 shadow-sm backdrop-blur-md dark:border-white/14 dark:bg-white/10 sm:flex lg:mt-6 lg:justify-self-center lg:border-slate-900/10 lg:bg-white/70 lg:text-slate-600 lg:dark:border-white/14 lg:dark:bg-white/10 lg:dark:text-white/82">
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
        </header>

        <main className="grid items-center gap-7 py-7 lg:grid-cols-[56vw_44vw] lg:gap-0 lg:py-0">
          <section className="hidden max-w-2xl lg:block lg:px-10 lg:pb-10">
            <h1 className="max-w-[620px] text-[40px] font-semibold leading-[1.2] tracking-normal text-white drop-shadow-sm xl:text-[44px]">
              专注现场管理
              <br />
              让工程更安全、高效、可控
            </h1>

            <div className="mt-10 space-y-5">
              {loginHighlights.map((item) => (
                <div key={item.title} className="flex max-w-[520px] items-center gap-5">
                  <div className="flex size-12 shrink-0 items-center justify-center rounded-full border border-white/18 bg-white/12 text-[#c8fff7] shadow-[0_18px_44px_rgba(4,120,103,0.18)] backdrop-blur">
                    <item.icon className="size-5" />
                  </div>
                  <div>
                    <div className="text-lg font-semibold text-white">{item.title}</div>
                    <div className="mt-1 text-sm font-medium leading-6 text-white/64">{item.text}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <div className="mx-auto w-full min-w-0 max-w-[440px] space-y-5 lg:flex lg:max-w-none lg:flex-col lg:items-center lg:px-10 lg:pb-10">
            <section className="w-full min-w-0 max-w-full rounded-2xl border border-white/82 bg-white/88 p-5 shadow-[0_32px_90px_rgba(15,23,42,0.18)] backdrop-blur-xl dark:border-white/16 dark:bg-[#09272d]/88 dark:shadow-[0_32px_90px_rgba(0,0,0,0.42)] sm:p-7 lg:max-w-[440px] lg:p-8">
              <LoginForm />
            </section>

            <footer className="w-full max-w-[440px] text-center text-xs font-medium text-slate-500/82 dark:text-white/52">
              2026 宁波山淮科技有限公司 技术支持
            </footer>
          </div>
        </main>
      </div>
    </div>
  );
}
