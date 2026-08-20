import React from "react";
import { STATUS_PILL_TOKENS, statusToneOf, statusRowClass, payStatusKind } from "./statusTone.mjs";

const PILL_BASE = "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border shrink-0";

/** Soft, scannable status chip — color lives here, not on parent cards. */
export function StatusPill({ status, kind, tone, children, className = "", title }) {
  const resolved = tone || statusToneOf(kind || status);
  const token = STATUS_PILL_TOKENS[resolved] || STATUS_PILL_TOKENS.neutral;
  return (
    <span
      className={`status-pill ${PILL_BASE} ${token.pill} ${className}`.trim()}
      data-tone={resolved}
      title={title}
    >
      <span className={`status-dot ${token.dot}`} aria-hidden="true" />
      <span className="status-pill-label">{children}</span>
    </span>
  );
}

/** Stacked cards below 640px; tabular view from unfolded / tablet widths. */
export function DataList({ cards, table, empty }) {
  if (empty) return empty;
  return (
    <div className="data-display">
      <div className="data-display-cards grid grid-cols-1 gap-4">{cards}</div>
      <div className="data-display-table overflow-x-auto">{table}</div>
    </div>
  );
}

export function DataCard({
  status, kind, tone, title, subtitle, meta, actions, children, onClick, className = "",
}) {
  const resolved = tone || statusToneOf(kind || (typeof status === "string" ? status : undefined));
  const statusNode = status == null ? null
    : (typeof status === "object" ? status : <StatusPill status={status}>{status}</StatusPill>);
  return (
    <div
      className={`data-card data-card--${resolved || "neutral"} ${className}`.trim()}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(e); } } : undefined}
    >
      <div className="data-card-head">
        <div className="data-card-copy">
          {title != null && <div className="data-card-title">{title}</div>}
          {subtitle != null && <div className="data-card-sub">{subtitle}</div>}
        </div>
        {statusNode}
      </div>
      {meta != null && <div className="data-card-meta">{meta}</div>}
      {children}
      {actions != null && <div className="data-card-actions">{actions}</div>}
    </div>
  );
}

export { statusToneOf, statusRowClass, payStatusKind, STATUS_PILL_TOKENS };
