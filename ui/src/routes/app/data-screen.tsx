import { createFileRoute, Outlet, useChildMatches } from "@tanstack/react-router";
import { MainDashboard } from "@/features/data-screen/components/MainDashboard";
import "@/features/data-screen/styles/dashboard.css";

export const Route = createFileRoute("/app/data-screen")({
  component: DataScreenLayout,
});

/**
 * Layout route: keeps MainDashboard always mounted so the AMap instance
 * and particle canvas survive navigation to/from the project board.
 * When the project child route is active, ProjectBoard is rendered on top
 * via a fixed overlay, leaving the dashboard intact underneath.
 */
function DataScreenLayout() {
  const children = useChildMatches();
  // Only show the overlay when on a project-board child route,
  // not on the index route (which renders null).
  const isProjectBoard = children.some((m) =>
    m.routeId.includes("/project/")
  );

  return (
    <>
      {/* Always mounted — AMap instance, particles and queries all stay alive */}
      <MainDashboard />

      {/* Project board overlays on top; unmounted when back on the dashboard */}
      {isProjectBoard && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 200,
          }}
        >
          <Outlet />
        </div>
      )}
    </>
  );
}
