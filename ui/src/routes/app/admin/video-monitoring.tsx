import { createFileRoute } from "@tanstack/react-router";
import { VideoMonitoringPage } from "@/features/admin/components/MonitoringMockPages";

export const Route = createFileRoute("/app/admin/video-monitoring")({
  component: VideoMonitoringPage,
});
