import { Leaf } from "lucide-react";

import { Badge } from "@/components/ui/badge";

const environmentMetrics = [
  { label: "温度", value: "26.4℃", status: "正常" },
  { label: "湿度", value: "62%", status: "正常" },
  { label: "风向", value: "东南风", status: "正常" },
  { label: "风速", value: "2.8m/s", status: "正常" },
  { label: "PM2.5", value: "38", status: "良" },
  { label: "噪声", value: "58dB", status: "正常" },
];

const videoPoints = [
  { name: "大门入口", image: "/video-monitoring/site-gate.jpg" },
  { name: "材料堆场", image: "/video-monitoring/material-yard.jpg" },
  { name: "塔吊作业区", image: "/video-monitoring/tower-crane-zone.jpg" },
  { name: "生活区通道", image: "/video-monitoring/living-area-passage.jpg" },
];

export function EnvironmentMonitoringPage() {
  return (
    <div className="space-y-3">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {environmentMetrics.map((item) => (
          <div key={item.label} className="rounded-xl border bg-white p-4 shadow-sm dark:bg-card">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Leaf className="size-4 text-[#0f6b5d]" />
                {item.label}
              </div>
              <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                {item.status}
              </Badge>
            </div>
            <div className="mt-4 text-2xl font-semibold">{item.value}</div>
          </div>
        ))}
      </section>
    </div>
  );
}

export function VideoMonitoringPage() {
  return (
    <div className="space-y-3">
      <section className="grid gap-3 md:grid-cols-2">
        {videoPoints.map((point) => (
          <div key={point.name} className="overflow-hidden rounded-xl border bg-white shadow-sm dark:bg-card">
            <img
              src={point.image}
              alt={`${point.name}监控画面`}
              className="aspect-video w-full bg-[#edf8f1] object-cover dark:bg-emerald-950/30"
              loading="lazy"
            />
            <div className="flex items-center justify-between px-4 py-3">
              <div className="font-medium">{point.name}</div>
              <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                在线
              </Badge>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
