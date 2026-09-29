import React from "react";
import { STATUS_PILL_TOKENS, statusToneOf, statusRowClass, payStatusKind } from "./statusTone.mjs";
import { DataList, HeavyDataList, TableScroll } from "./virtualTable.jsx";

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

export function DataCard({
  status, kind, tone, title, subtitle, meta, actions, children, onClick, onContextMenu, className = "", who,
}) {
  const resolved = tone || statusToneOf(kind || (typeof status === "string" ? status : undefined));
  const statusNode = status == null ? null
    : (typeof status === "object" ? status : <StatusPill status={status}>{status}</StatusPill>);
  return (
    <div
      className={`data-card data-card--${resolved || "neutral"} ${className}`.trim()}
      onClick={onClick}
      onContextMenu={onContextMenu}
      role={onClick || onContextMenu ? "button" : undefined}
      tabIndex={onClick || onContextMenu ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(e); } } : undefined}
    >
      <div className="data-card-head">
        <div className="data-card-copy">
          {title != null && <div className="data-card-title">{title}</div>}
          {subtitle != null && <div className="data-card-sub">{subtitle}</div>}
        </div>
        {(who || statusNode) ? <div className="data-card-head-end">{who}{statusNode}</div> : null}
      </div>
      {meta != null && <div className="data-card-meta">{meta}</div>}
      {children}
      {actions != null && <div className="data-card-actions" onContextMenu={(e) => e.stopPropagation()}>{actions}</div>}
    </div>
  );
}

export { DataList, HeavyDataList, TableScroll, statusToneOf, statusRowClass, payStatusKind, STATUS_PILL_TOKENS };
