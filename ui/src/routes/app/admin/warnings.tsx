import { createFileRoute } from "@tanstack/react-router";
import { SystemWarningsPage } from "@/features/system-warnings/SystemWarningsPage";

export const Route = createFileRoute("/app/admin/warnings")({ component: SystemWarningsPage });
