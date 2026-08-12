import { createFileRoute } from "@tanstack/react-router";

import { HomeWarningsPage } from "@/features/system-warnings/SystemWarningsPage";

export const Route = createFileRoute("/app/admin/")({
  component: HomeWarningsPage,
});
