"use client";

import { ArcElement, BarController, BarElement, CategoryScale, Chart as ChartJS, DoughnutController, Legend, LinearScale, LineController, LineElement, PointElement, Tooltip } from "chart.js";
import { useEffect, useRef, useState } from "react";
import { Bar, Chart, Doughnut } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, BarController, BarElement, DoughnutController, LineController, LineElement, PointElement, ArcElement, Tooltip, Legend);

const defaultColors = ["#00346d", "#d4af37", "#005914", "#325ea0", "#88d982", "#735c00", "#ba1a1a", "#64748b"];

function formatNumber(value) {
  return Number(value || 0).toLocaleString("id-ID");
}

function formatPercent(value, total) {
  const number = Number(value || 0);
  const denominator = Number(total || 0);
  if (!denominator) return "0%";
  return `${((number / denominator) * 100).toLocaleString("id-ID", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  })}%`;
}

function safeLabel(value) {
  const text = String(value ?? "").trim();
  return text || "Tidak Diketahui";
}

function safeNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function safeNameList(value) {
  return Array.isArray(value) ? value.map((item) => safeLabel(item)).filter(Boolean) : [];
}

function getVisibleDatasets(chart) {
  return chart.data.datasets
    .map((dataset, datasetIndex) => ({ dataset, datasetIndex }))
    .filter(({ datasetIndex }) => chart.isDatasetVisible(datasetIndex));
}

function getStackTotal(chart, dataIndex) {
  return getVisibleDatasets(chart)
    .filter(({ dataset }) => dataset.type !== "line")
    .reduce((sum, { dataset }) => sum + safeNumber(dataset.data?.[dataIndex]), 0);
}

function drawText(ctx, text, x, y, { color = "#334155", align = "center", baseline = "middle", font = "600 10px Inter, Arial, sans-serif", stroke = true, strokeColor = "rgba(255,255,255,0.92)" } = {}) {
  ctx.save();
  ctx.font = font;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  if (stroke) {
    ctx.lineWidth = 3;
    ctx.strokeStyle = strokeColor;
    ctx.strokeText(text, x, y);
  }
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

const valueLabelsPlugin = {
  id: "dashboardValueLabels",
  afterDatasetsDraw(chart, _args, pluginOptions = {}) {
    if (pluginOptions.display === false) return;
    const compact = Boolean(pluginOptions.compact);
    const { ctx, chartArea } = chart;
    const isDoughnut = chart.config.type === "doughnut";
    const horizontal = chart.options.indexAxis === "y";
    const stacked = Boolean(chart.options.scales?.x?.stacked || chart.options.scales?.y?.stacked);

    if (isDoughnut) {
      const dataset = chart.data.datasets[0];
      const values = dataset?.data || [];
      const total = values.reduce((sum, value, index) => {
        if (!chart.getDataVisibility(index)) return sum;
        return sum + Number(value || 0);
      }, 0);
      const meta = chart.getDatasetMeta(0);

      meta.data.forEach((arc, index) => {
        const value = Number(values[index] || 0);
        if (!chart.getDataVisibility(index)) return;
        if (!value || !total) return;

        const percent = (value / total) * 100;
        if (percent < 2.5) return;

        const { startAngle, endAngle, innerRadius, outerRadius, x, y } = arc.getProps(
          ["startAngle", "endAngle", "innerRadius", "outerRadius", "x", "y"],
          true
        );
        const angle = (startAngle + endAngle) / 2;
        const ringWidth = outerRadius - innerRadius;
        const labelRadius = innerRadius + ringWidth * (percent < 5 ? 0.72 : 0.56);
        const labelX = x + Math.cos(angle) * labelRadius;
        const labelY = y + Math.sin(angle) * labelRadius;
        const fontSize = compact ? 8 : percent < 5 ? 9 : percent < 10 ? 10 : 11;

        drawText(ctx, formatNumber(value), labelX, labelY, {
          color: "#0f172a",
          font: `700 ${fontSize}px Inter, Arial, sans-serif`,
          stroke: compact,
          strokeColor: "rgba(255,255,255,0.95)"
        });
      });

      const center = meta.data[0]?.getProps(["x", "y"], true);
      if (center && total) {
        drawText(ctx, "Total", center.x, center.y - (compact ? 6 : 9), {
          color: "#64748b",
          font: `600 ${compact ? 7 : 10}px Inter, Arial, sans-serif`,
          stroke: false
        });
        drawText(ctx, formatNumber(total), center.x, center.y + (compact ? 6 : 7), {
          color: "#0f172a",
          font: `800 ${compact ? 10 : 15}px Inter, Arial, sans-serif`,
          stroke: false
        });
      }
      return;
    }

    const visible = getVisibleDatasets(chart);
    const totals = chart.data.labels.map((_, dataIndex) => getStackTotal(chart, dataIndex));
    const maxTotal = Math.max(...totals, 0);

    if (stacked) {
      totals.forEach((total, dataIndex) => {
        if (!total) return;
        if (!horizontal && chart.data.labels.length > 20 && total < maxTotal * 0.16) return;

        const bars = visible
          .filter(({ dataset }) => dataset.type !== "line")
          .map(({ datasetIndex }) => chart.getDatasetMeta(datasetIndex).data[dataIndex])
          .filter(Boolean)
          .map((bar) => bar.getProps(["x", "y"], true));
        if (!bars.length) return;

        if (horizontal) {
          const right = Math.max(...bars.map((bar) => bar.x));
          const y = bars[0].y;
          if (right + 4 > chartArea.right + 46) return;
        drawText(ctx, formatNumber(total), right + 5, y, {
          align: "left",
          color: "#334155",
          font: `700 ${compact ? 8 : 10}px Inter, Arial, sans-serif`
        });
        } else {
          const top = Math.min(...bars.map((bar) => bar.y));
          const x = bars[0].x;
          if (top - 4 < chartArea.top - 2) return;
          drawText(ctx, formatNumber(total), x, top - 5, {
            baseline: "bottom",
            color: "#334155",
          font: `700 ${compact ? 8 : 9}px Inter, Arial, sans-serif`
          });
        }
      });
      return;
    }

    visible.forEach(({ dataset, datasetIndex }) => {
      const meta = chart.getDatasetMeta(datasetIndex);
      meta.data.forEach((bar, dataIndex) => {
        const value = Number(dataset.data?.[dataIndex] || 0);
        if (!value) return;
        const { x, y } = bar.getProps(["x", "y"], true);
        drawText(ctx, formatNumber(value), horizontal ? x + 5 : x, horizontal ? y : y - 5, {
          align: horizontal ? "left" : "center",
          baseline: horizontal ? "middle" : "bottom",
          color: "#334155",
          font: `700 ${compact ? 8 : 10}px Inter, Arial, sans-serif`
        });
      });
    });
  }
};

function getSummaryRows({ labels = [], values = [], colors = [], datasets = [] }) {
  const palette = colors?.length ? colors : defaultColors;
  const summaryDatasets = datasets?.filter((dataset) => dataset.summary !== false && dataset.type !== "line") || [];
  const rows = datasets?.length
    ? labels.map((label, index) => ({
        label,
        value: summaryDatasets.reduce((sum, dataset) => sum + safeNumber(dataset.data?.[index]), 0),
        color: palette[index % palette.length]
      }))
    : labels.map((label, index) => ({
        label,
        value: safeNumber(values[index]),
        color: palette[index % palette.length]
      }));

  const visibleRows = rows.filter((row) => row.label && row.value > 0);
  const total = visibleRows.reduce((sum, row) => sum + row.value, 0);
  const sortedRows = visibleRows.length > 8
    ? [...visibleRows].sort((a, b) => b.value - a.value).slice(0, 8)
    : visibleRows;

  return sortedRows.map((row) => ({
    ...row,
    percent: total ? formatPercent(row.value, total) : ""
  }));
}

function downloadChart(chartRef, title) {
  const chart = chartRef.current;
  if (!chart) return;
  const link = document.createElement("a");
  link.href = chart.toBase64Image("image/png", 1);
  link.download = `${title.toLowerCase().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "chart"}.png`;
  link.click();
}

function tooltipEmployeeLines(context) {
  const names = safeNameList(context.dataset.employeeNames?.[context.dataIndex]);
  if (!names.length) return [];

  const visibleNames = names.slice(0, 12);
  const total = Number(context.raw || 0);
  const remaining = Math.max(0, (total || names.length) - visibleNames.length);
  return [
    "Pegawai:",
    ...visibleNames.map((name) => `- ${name}`),
    ...(remaining > 0 ? [`+ ${formatNumber(remaining)} lainnya`] : [])
  ];
}

export default function DashboardChartCard({
  title,
  type = "bar",
  labels = [],
  values = [],
  colors,
  names = [],
  datasets,
  horizontal = false,
  stacked = false,
  heightClass = "h-96",
  compact = false
}) {
  const chartRef = useRef(null);
  const [isMobile, setIsMobile] = useState(false);
  const chartLabels = Array.isArray(labels) ? labels.map(safeLabel) : [];
  const chartValues = Array.isArray(values) ? values.map(safeNumber) : [];
  const chartNames = Array.isArray(names) ? names.map(safeNameList) : [];
  const chartDatasetsInput = Array.isArray(datasets) ? datasets : [];

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const flatTotal = chartValues.reduce((sum, value) => sum + safeNumber(value), 0);
  const chartDatasets = chartDatasetsInput.length
    ? chartDatasetsInput.map((dataset, index) => {
        const isLine = dataset.type === "line";
        const color = dataset.borderColor || dataset.backgroundColor || defaultColors[index % defaultColors.length];
        return {
          ...dataset,
          data: Array.isArray(dataset.data) ? dataset.data.map(safeNumber) : [],
          employeeNames: Array.isArray(dataset.employeeNames) ? dataset.employeeNames.map(safeNameList) : [],
          backgroundColor: dataset.backgroundColor || (isLine ? "rgba(56, 189, 248, 0.16)" : defaultColors[index % defaultColors.length]),
          borderColor: color,
          borderWidth: isLine ? dataset.borderWidth ?? 2 : dataset.borderWidth,
          borderRadius: !isLine && type === "bar" ? 4 : 0,
          maxBarThickness: isLine ? undefined : (horizontal ? 14 : 18),
          categoryPercentage: isLine ? undefined : 0.9,
          barPercentage: isLine ? undefined : 0.85,
          pointRadius: isLine ? dataset.pointRadius ?? 4 : dataset.pointRadius,
          pointHoverRadius: isLine ? dataset.pointHoverRadius ?? 5 : dataset.pointHoverRadius,
          pointBackgroundColor: dataset.pointBackgroundColor || color,
          tension: isLine ? dataset.tension ?? 0.35 : dataset.tension,
          fill: isLine ? dataset.fill ?? false : dataset.fill,
          order: dataset.order ?? (isLine ? 0 : 1)
        };
      })
    : [
        {
          label: title,
          data: chartValues,
          employeeNames: chartNames,
          backgroundColor: colors?.length ? colors : defaultColors,
          borderRadius: type === "bar" ? 2 : 0,
          maxBarThickness: horizontal ? 14 : 18
        }
      ];
  const data = {
    labels: chartLabels,
    datasets: chartDatasets
  };
  const summaryRows = getSummaryRows({ labels: chartLabels, values: chartValues, colors, datasets: chartDatasets });
  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: !isMobile,
        position: type === "doughnut" ? "bottom" : "top",
        align: "start",
        labels: {
          boxWidth: 11,
          boxHeight: 11,
          usePointStyle: true,
          pointStyle: "circle",
          color: "#434750",
          font: { size: 11 }
        }
      },
      tooltip: {
        callbacks: {
          label: (context) => {
            const value = Number(context.raw || 0);
            if (context.dataset.type === "line") {
              return `${context.dataset.label || "Total"}: ${formatNumber(value)}`;
            }
            const total = chartDatasets.length
              ? context.chart.data.datasets
                .filter((dataset) => dataset.type !== "line")
                .reduce((sum, dataset) => sum + safeNumber(dataset.data?.[context.dataIndex]), 0)
              : flatTotal;
            const label = type === "doughnut" ? context.label : (context.dataset.label || context.label);
            return `${label}: ${formatNumber(value)} (${formatPercent(value, total)})`;
          },
          afterBody: (items) => {
            const context = items?.[0];
            return context ? tooltipEmployeeLines(context) : [];
          }
        }
      }
    },
    layout: {
      padding: isMobile
        ? { top: 6, right: 2, left: 0, bottom: 0 }
        : {
            top: type === "bar" ? 20 : 4,
            right: type === "bar" && horizontal ? 52 : 8
          }
    }
  };

  return (
    <article className={`surface flex h-full min-w-0 flex-col overflow-hidden ${compact ? "min-h-[330px] p-3 sm:min-h-[370px]" : "min-h-[540px] p-4"}`}>
      <div className={`flex items-start justify-between gap-3 ${compact ? "min-h-8" : "min-h-10"}`}>
        <h2 className="min-w-0 font-display text-base font-bold leading-snug text-dinkes-900">{title}</h2>
        <button className="hidden rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-dinkes-600 hover:bg-dinkes-50 hover:text-dinkes-800 sm:inline-flex" onClick={() => downloadChart(chartRef, title)} type="button">
          Unduh PNG
        </button>
      </div>
      <div className={`${compact ? "mt-2" : "mt-3"} min-w-0 shrink-0 ${heightClass}`} role="img" aria-label={`Grafik ${title}`}>
        {type === "doughnut" ? (
          <Doughnut
            ref={chartRef}
            data={data}
            options={{
              ...commonOptions,
              cutout: isMobile ? "62%" : "55%",
              plugins: {
                ...commonOptions.plugins,
                legend: { ...commonOptions.plugins.legend, display: !isMobile, position: "bottom", align: "center" },
                tooltip: commonOptions.plugins.tooltip,
                dashboardValueLabels: { display: true, compact: isMobile }
              }
            }}
            plugins={[valueLabelsPlugin]}
          />
        ) : (
          <Chart
            type="bar"
            ref={chartRef}
            data={data}
            options={{
              ...commonOptions,
              indexAxis: horizontal ? "y" : "x",
              scales: {
                x: {
                  stacked,
                  beginAtZero: true,
                  grid: { color: "#e5e7eb" },
                  ticks: {
                    autoSkip: true,
                    maxTicksLimit: isMobile ? 4 : 8,
                    color: "#64748b",
                    font: { size: isMobile ? 9 : 10 },
                    maxRotation: isMobile ? 0 : (horizontal ? 0 : 55),
                    minRotation: 0,
                    callback(value) {
                      const label = this.getLabelForValue?.(value) ?? value;
                      return isMobile && String(label).length > 8 ? `${String(label).slice(0, 8)}...` : label;
                    }
                  }
                },
                y: {
                  stacked,
                  beginAtZero: true,
                  grid: { color: "#e5e7eb" },
                  ticks: {
                    autoSkip: true,
                    maxTicksLimit: isMobile ? 4 : 8,
                    color: "#64748b",
                    font: { size: isMobile ? 9 : 10 },
                    callback(value) {
                      const label = horizontal && this.getLabelForValue ? this.getLabelForValue(value) : value;
                      return isMobile && String(label).length > 12 ? `${String(label).slice(0, 12)}...` : label;
                    }
                  }
                }
              },
              plugins: {
                ...commonOptions.plugins,
                dashboardValueLabels: { display: true, compact: isMobile }
              }
            }}
            plugins={[valueLabelsPlugin]}
          />
        )}
      </div>
      {summaryRows.length ? (
        <div className={`${compact ? "mt-2 max-h-16 overflow-y-auto pt-2 sm:max-h-12" : "mt-3 min-h-16 pt-3"} flex flex-wrap items-start justify-center gap-x-3 gap-y-1.5 border-t border-slate-100 md:gap-x-4 md:gap-y-2`}>
          {summaryRows.map((row) => (
            <div key={row.label} className="inline-flex min-w-0 items-center gap-1.5 text-[11px] text-slate-600">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />
              <span className="max-w-24 truncate md:max-w-none">{row.label}</span>
              <span className="font-bold tabular-nums text-slate-900">
                {formatNumber(row.value)}
                <span className="hidden sm:inline">{row.percent ? ` (${row.percent})` : ""}</span>
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </article>
  );
}
