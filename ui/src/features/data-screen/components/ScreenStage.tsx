import { useEffect, useState, type ReactNode } from "react";

const DESIGN_W = 1920;
const DESIGN_H = 1080;

/**
 * 全屏舞台：内部按固定 1920×1080 设计画布布局，
 * 外层分别按视口宽/高比例做 scaleX / scaleY，
 * 保证任意分辨率 / 窗口比例下大屏完整填满视口，无黑边。
 * 宽高比差异通常 < 8%（如 16:9 设计在 16:10 屏幕上），视觉不可感知。
 */
export function ScreenStage({ children }: { children: ReactNode }) {
  const [scale, setScale] = useState(() => ({
    x: window.innerWidth / DESIGN_W,
    y: window.innerHeight / DESIGN_H,
  }));

  useEffect(() => {
    const update = () =>
      setScale({
        x: window.innerWidth / DESIGN_W,
        y: window.innerHeight / DESIGN_H,
      });
    update();
    window.addEventListener("resize", update);
    // 全屏切换时部分浏览器不触发 resize，同时监听
    window.addEventListener("fullscreenchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("fullscreenchange", update);
    };
  }, []);

  return (
    <div className="db-stage">
      <div
        className="db-stage-canvas"
        style={{
          transform: `translate(-50%, -50%) scale(${scale.x}, ${scale.y})`,
          transformOrigin: "center center",
        }}
      >
        {children}
      </div>
    </div>
  );
}
