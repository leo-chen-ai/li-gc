import { createFileRoute } from "@tanstack/react-router";
import { FaceLibrarySyncPage } from "@/features/face/FaceLibrarySyncPage";

export const Route = createFileRoute("/app/admin/face-library-sync")({
  component: FaceLibrarySyncPage,
});
