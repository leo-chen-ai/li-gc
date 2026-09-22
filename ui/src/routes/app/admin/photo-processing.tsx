import { createFileRoute } from "@tanstack/react-router";
import { PhotoProcessingPage } from "@/features/photo-processing/PhotoProcessingPage";

export const Route = createFileRoute("/app/admin/photo-processing")({
  component: PhotoProcessingPage,
});
