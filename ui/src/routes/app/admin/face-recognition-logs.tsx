import { createFileRoute } from "@tanstack/react-router";
import { FaceRecognitionLogsPage } from "@/features/face/FaceRecognitionLogsPage";

export const Route = createFileRoute("/app/admin/face-recognition-logs")({
  validateSearch: (search: Record<string, unknown>) => ({ project_id: typeof search.project_id === "string" ? search.project_id : undefined }),
  component: FaceRecognitionLogsPage,
});
