import { createFileRoute } from "@tanstack/react-router";

// The MainDashboard is rendered by the parent layout route (route.tsx)
// and stays mounted across navigation. This index route is intentionally empty.
export const Route = createFileRoute("/app/data-screen/")({
  component: () => null,
});
