import * as React from "react";
import Link from "next/link";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { STATUS_TONE, STATUS_LABELS, type ShipmentStatus } from "@/lib/domain/shipment-status";

/* ------------------------------------------------------------------- button */

const buttonStyles = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-150 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-bg active:translate-y-px",
  {
    variants: {
      variant: {
        primary: "bg-accent text-accent-foreground hover:bg-[#c8f984] shadow-[0_8px_24px_-12px_rgba(184,243,106,0.7)]",
        secondary: "border border-line bg-surface-raised/70 text-ink hover:border-accent/40 hover:bg-surface-raised",
        ghost: "text-muted hover:bg-surface-raised/60 hover:text-ink",
        danger: "border border-danger/40 bg-danger/10 text-danger hover:bg-danger/20",
        outline: "border border-accent/40 text-accent hover:bg-accent/10",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-4 text-sm",
        lg: "h-12 px-6 text-sm",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonStyles> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonStyles({ variant, size }), className)} {...props} />;
}

export interface ButtonLinkProps extends React.ComponentProps<typeof Link>, VariantProps<typeof buttonStyles> {}

export function ButtonLink({ className, variant, size, ...props }: ButtonLinkProps) {
  return <Link className={cn(buttonStyles({ variant, size }), className)} {...props} />;
}

/* -------------------------------------------------------------------- badge */

const badgeStyles = cva("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium leading-5", {
  variants: {
    tone: {
      neutral: "border-line/80 bg-surface-raised/60 text-muted",
      info: "border-info/30 bg-info/10 text-info",
      success: "border-success/30 bg-success/10 text-success",
      warning: "border-warning/30 bg-warning/10 text-warning",
      danger: "border-danger/30 bg-danger/10 text-danger",
      accent: "border-accent/30 bg-accent/10 text-accent",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export function Badge({ tone, className, children }: { tone?: VariantProps<typeof badgeStyles>["tone"]; className?: string; children: React.ReactNode }) {
  return <span className={cn(badgeStyles({ tone }), className)}>{children}</span>;
}

export function StatusBadge({ status }: { status: ShipmentStatus | string }) {
  const key = status as ShipmentStatus;
  const tone = STATUS_TONE[key] ?? "neutral";
  const label = STATUS_LABELS[key] ?? status;
  return (
    <Badge tone={tone}>
      <span className={cn("h-1.5 w-1.5 rounded-full", tone === "success" && "bg-success", tone === "warning" && "bg-warning", tone === "danger" && "bg-danger", tone === "info" && "bg-info", tone === "neutral" && "bg-muted/70")} />
      {label}
    </Badge>
  );
}

/* -------------------------------------------------------------------- panel */

export function Panel({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("panel", className)} {...props}>
      {children}
    </div>
  );
}

export function PanelHeader({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("panel-header", className)}>
      <div className="min-w-0">
        <h2 className="truncate text-sm font-semibold tracking-tight text-ink">{title}</h2>
        {description ? <p className="mt-0.5 text-xs text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/* -------------------------------------------------------------------- field */

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error ? (
        <p className="mt-1 text-xs text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1 text-xs text-muted/80">{hint}</p>
      ) : null}
    </div>
  );
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return <input ref={ref} className={cn("field", className)} {...props} />;
});

export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn("field appearance-none bg-[length:16px] pr-9", className)} {...props}>
      {children}
    </select>
  );
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn("field min-h-24 resize-y", className)} {...props} />;
}

/* -------------------------------------------------------------------- stats */

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "neutral",
  trend,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon?: React.ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "accent";
  trend?: React.ReactNode;
}) {
  const toneRing = {
    neutral: "text-muted",
    success: "text-success",
    warning: "text-warning",
    danger: "text-danger",
    accent: "text-accent",
  }[tone];

  return (
    <div className="panel relative overflow-hidden p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.09em] text-muted">{label}</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-ink">{value}</p>
          {hint ? <p className="mt-1 text-xs text-muted/80">{hint}</p> : null}
        </div>
        {icon ? <span className={cn("shrink-0 rounded-lg border border-line/70 bg-bg/50 p-2", toneRing)}>{icon}</span> : null}
      </div>
      {trend ? <div className="mt-3 text-xs text-muted">{trend}</div> : null}
    </div>
  );
}

/* --------------------------------------------------------------- empty/skel */

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      {icon ? <div className="rounded-xl border border-line/70 bg-surface-raised/50 p-3 text-muted">{icon}</div> : null}
      <div>
        <p className="text-sm font-medium text-ink">{title}</p>
        {description ? <p className="mx-auto mt-1 max-w-sm text-xs text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn("relative overflow-hidden rounded-lg bg-surface-raised/60", className)}>
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/5 to-transparent" />
    </div>
  );
}

/* ------------------------------------------------------------------- alerts */

export function Notice({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: "info" | "warning" | "danger" | "success";
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const styles = {
    info: "border-info/25 bg-info/8 text-info",
    warning: "border-warning/25 bg-warning/8 text-warning",
    danger: "border-danger/25 bg-danger/8 text-danger",
    success: "border-success/25 bg-success/8 text-success",
  }[tone];
  return (
    <div className={cn("rounded-xl border px-3.5 py-3 text-xs leading-relaxed", styles, className)} role={tone === "danger" ? "alert" : "status"}>
      {title ? <p className="mb-1 font-semibold">{title}</p> : null}
      <div className="text-current/90 [&_a]:underline">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------- misc */

export function Divider({ className }: { className?: string }) {
  return <div className={cn("hairline my-4", className)} />;
}

export function DataRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line/40 py-2.5 last:border-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="max-w-[62%] text-right text-xs font-medium text-ink">{value}</dd>
    </div>
  );
}

export function DemoTag() {
  return (
    <span className="inline-flex items-center gap-1 rounded border border-warning/30 bg-warning/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warning">
      demo
    </span>
  );
}
