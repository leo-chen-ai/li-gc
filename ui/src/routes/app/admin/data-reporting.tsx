import { createFileRoute } from "@tanstack/react-router";
import { DataReportingPage } from "@/features/data-reporting/DataReportingPage";

export const Route = createFileRoute("/app/admin/data-reporting")({ component: DataReportingPage });
