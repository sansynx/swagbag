import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { PieChart } from "echarts/charts";
import { TooltipComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";

echarts.use([PieChart, TooltipComponent, SVGRenderer]);

type Slice = { name: string; value: number; color: string };

export default function DonutChart({
  slices,
  center,
  caption,
  theme,
}: {
  slices: Slice[];
  center: string;
  caption: string;
  theme: "light" | "dark";
}) {
  const host = useRef<HTMLDivElement>(null);
  const signature = JSON.stringify(slices);

  useEffect(() => {
    if (!host.current) return;
    const chart = echarts.init(host.current, undefined, { renderer: "svg" });
    const data = JSON.parse(signature) as Slice[];
    const visible = data.some((slice) => slice.value > 0)
      ? data
      : [
          {
            name: "No activity yet",
            value: 1,
            color: theme === "dark" ? "#2c3d60" : "#e5ebf4",
          },
        ];
    chart.setOption({
      animationDuration: 550,
      tooltip: {
        trigger: "item",
        backgroundColor: theme === "dark" ? "#152544" : "#ffffff",
        borderWidth: 0,
        textStyle: { color: theme === "dark" ? "#ffffff" : "#17315b" },
        formatter: (item: { name: string; value: number }) =>
          `${item.name}: ${item.value}`,
      },
      series: [
        {
          type: "pie",
          radius: ["70%", "89%"],
          center: ["50%", "50%"],
          avoidLabelOverlap: true,
          label: { show: false },
          labelLine: { show: false },
          itemStyle: {
            borderColor: theme === "dark" ? "#111c33" : "#ffffff",
            borderWidth: 3,
            borderRadius: 8,
          },
          emphasis: { scale: false },
          data: visible.map((slice) => ({
            name: slice.name,
            value: slice.value,
            itemStyle: { color: slice.color },
          })),
        },
      ],
    });
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(host.current);
    return () => {
      observer.disconnect();
      chart.dispose();
    };
  }, [signature, theme]);

  return (
    <div
      className="donut"
      role="img"
      aria-label={`${caption}: ${slices.map((slice) => `${slice.name} ${slice.value}`).join(", ")}`}
    >
      <div ref={host} className="donut-canvas" aria-hidden="true" />
      <div className="donut-center">
        <strong>{center}</strong>
        <span>{caption}</span>
      </div>
    </div>
  );
}
