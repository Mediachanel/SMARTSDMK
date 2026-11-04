"use client";

export default function Stepper({ steps, activeStep, onStepChange }) {
  const progress = Math.round(((activeStep + 1) / steps.length) * 100);
  const isComplete = progress >= 100;

  return (
    <div className="surface overflow-hidden">
      <div className="border-b border-slate-200 bg-white px-4 py-3 sm:px-5 sm:py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className={`section-label ${isComplete ? "text-emerald-700" : "text-dinkes-800"}`}>Progress Pengisian</p>
            <h2 className="mt-1 font-display text-base font-bold text-slate-900 sm:text-lg">Step {activeStep + 1} dari {steps.length}</h2>
          </div>
          <div className="shrink-0 text-right">
            <p className={`text-xl font-semibold sm:text-2xl ${isComplete ? "text-emerald-700" : "text-dinkes-700"}`}>{progress}%</p>
            <p className="max-w-28 truncate text-xs text-slate-500 sm:max-w-none sm:text-sm">{steps[activeStep]?.title}</p>
          </div>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200">
          <div
            className={`h-full rounded-full transition-all duration-300 ${isComplete ? "bg-emerald-600" : "bg-dinkes-800"}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <ol className="grid gap-2 px-4 py-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        {steps.map((step, index) => {
          const status = index < activeStep ? "done" : index === activeStep ? "active" : "upcoming";
          return (
            <li key={step.id}>
              <button
                type="button"
                onClick={() => onStepChange(index)}
                className={[
                  "flex w-full min-w-0 items-center gap-2 rounded-lg border px-3 py-2.5 text-left transition",
                  status === "active" ? (isComplete ? "border-emerald-300 bg-emerald-50" : "border-dinkes-300 bg-dinkes-50") : "",
                  status === "done" ? "border-emerald-200 bg-emerald-50 hover:border-emerald-300" : "",
                  status === "upcoming" ? "border-slate-200 bg-white hover:border-slate-300" : ""
                ].join(" ")}
              >
                <span
                  className={[
                    "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                    status === "active" ? (isComplete ? "bg-emerald-600 text-white" : "bg-dinkes-800 text-white") : "",
                    status === "done" ? "bg-emerald-600 text-white" : "",
                    status === "upcoming" ? "bg-slate-100 text-slate-500" : ""
                  ].join(" ")}
                >
                  {index + 1}
                </span>
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold text-slate-900 sm:text-sm">{step.title}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
