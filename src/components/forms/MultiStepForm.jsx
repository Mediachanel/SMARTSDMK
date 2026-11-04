"use client";

export default function MultiStepForm({ header, body, footer }) {
  return (
    <div className="space-y-6 pb-64">
      {header}
      {body}
      {footer}
    </div>
  );
}
