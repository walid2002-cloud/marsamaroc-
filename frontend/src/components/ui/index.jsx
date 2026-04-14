import React from "react";

export function Card({ title, subtitle, actions, children, className = "", ...props }) {
  return (
    <section className={`ui-card ${className}`} {...props}>
      {(title || subtitle || actions) && (
        <header className="ui-card-header">
          <div>
            {title ? <h2>{title}</h2> : null}
            {subtitle ? <p className="muted">{subtitle}</p> : null}
          </div>
          {actions ? <div className="ui-card-actions">{actions}</div> : null}
        </header>
      )}
      {children}
    </section>
  );
}

export function Button({
  children,
  variant = "primary",
  className = "",
  icon = null,
  ...props
}) {
  return (
    <button className={`btn btn-${variant} ${className}`} {...props}>
      {icon ? <span className="btn-icon">{icon}</span> : null}
      <span>{children}</span>
    </button>
  );
}

export function StatusBadge({ value }) {
  const safe = String(value || "").toLowerCase();
  let tone = "neutral";
  if (["processed", "ok", "ok_kb", "actif", "active"].includes(safe)) tone = "success";
  else if (["pending", "en_attente"].includes(safe)) tone = "warning";
  else if (["error", "inactif", "inactive", "no_kb_data"].includes(safe)) tone = "danger";
  return <span className={`badge badge-${tone}`}>{value || "-"}</span>;
}

export function EmptyState({ title, subtitle }) {
  return (
    <div className="empty-state">
      <p className="empty-title">{title}</p>
      {subtitle ? <p className="muted">{subtitle}</p> : null}
    </div>
  );
}
