import { Calculator } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function FormulaDialogButton({
  title = "计算方式",
  description,
  rows,
}: {
  title?: string;
  description?: string;
  rows: Array<{ label: string; formula: string }>;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="shrink-0">
          <Calculator className="mr-2 size-4" />
          计算方式
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {description ? <p className="text-sm text-slate-500">{description}</p> : null}
        <div className="grid gap-2 md:grid-cols-2">
          {rows.map((item) => (
            <div key={item.label} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
              <div className="text-sm font-semibold text-slate-900">{item.label}</div>
              <div className="mt-1 text-xs text-slate-500">{item.formula}</div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
