import { useMemo, useState, useEffect } from "react";
import { ParticlesProvider, Particles } from "@tsparticles/react";
import { loadSlim } from "@tsparticles/slim";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const initParticles = async (engine: any) => {
  await loadSlim(engine);
};

function ParticlesLayer() {
  const options = useMemo(
    () => ({
      fullScreen: { enable: false },
      fpsLimit: 40,
      pauseOnBlur: true,
      smoothRandom: true,
      particles: {
        number: {
          // Reduced from 90 to 55: fewer particles = lower per-frame cost.
          value: 55,
          density: { enable: true, area: 1000 },
        },
        color: {
          value: [
            "#00e5ff", "#00d4ff", "#00b8ff", "#0088ff",
            "#66e0ff", "#99ecff", "#ffffff",
          ],
        },
        shape: { type: "circle" as const },
        opacity: {
          value: { min: 0.06, max: 0.5 },
          animation: {
            enable: true,
            speed: 0.4,
            sync: false,
            startValue: "random" as const,
          },
        },
        size: {
          value: { min: 0.5, max: 3 },
          animation: {
            enable: true,
            speed: 1.5,
            sync: false,
            startValue: "random" as const,
          },
        },
        links: {
          enable: true,
          distance: 130,
          color: "#00c8ff",
          opacity: 0.08,
          width: 0.5,
          // Disabled triangles: they require O(n²) edge checks every frame.
          triangles: { enable: false },
        },
        move: {
          enable: true,
          speed: { min: 0.15, max: 0.5 },
          direction: "top" as const,
          random: true,
          straight: false,
          outModes: { default: "out" as const },
          drift: 0,
        },
        // Removed shadow: it calls ctx.shadowBlur per particle per frame,
        // which forces software compositing and is the single biggest FPS killer.
        twinkle: {
          particles: {
            enable: true,
            frequency: 0.04,
            color: "#ffffff",
            opacity: 0.7,
          },
        },
      },
      // Wall-display page: interaction disabled to save per-frame work
      interactivity: {
        detectsOn: "none" as const,
        events: {
          onHover: { enable: false },
          onClick: { enable: false },
          resize: { enable: true },
        },
      },
      detectRetina: true,
      background: { color: "transparent" },
    }),
    []
  );

  return (
    <Particles
      id="db-particles"
      options={options}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 5,
        pointerEvents: "none",
      }}
    />
  );
}

export function ParticleBackground() {
  // Defer mounting until after the first paint so the map and UI panels
  // render first. tsParticles init (loadSlim + canvas setup) is the
  // heaviest synchronous work on first load.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setMounted(true), 300);
    return () => clearTimeout(id);
  }, []);

  if (!mounted) return null;

  return (
    <ParticlesProvider init={initParticles}>
      <ParticlesLayer />
    </ParticlesProvider>
  );
}
