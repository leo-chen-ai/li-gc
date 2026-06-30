import { createFileRoute } from "@tanstack/react-router";
import { EnvironmentMonitoringPage } from "@/features/admin/components/MonitoringMockPages";

export const Route = createFileRoute("/app/admin/environment-monitoring")({
  component: EnvironmentMonitoringPage,
});
