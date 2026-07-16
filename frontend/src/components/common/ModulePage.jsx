import { useMemo, useState } from "react";
import StatCard from "../dashboard/StatCard";
import LoadingState from "./LoadingState";
import EmptyState from "./EmptyState";

export default function ModulePage({
  title,
  subtitle,
  summary,
  stats = [],
  actions = null,
  dataSource = null,
  apiSpec = null,
  searchPlaceholder = "Search entries",
  filters = [],
  children,
  isLoading = false,
  errorMessage = "",
  emptyMessage = "Live connection not configured",
  tableTitle,
  tableSubtitle,
}) {
  const [searchValue, setSearchValue] = useState("");
  const [activeFilter, setActiveFilter] = useState(filters[0] || "All");

  const visibleFilters = useMemo(() => ["All", ...filters.filter((item) => item !== "All")], [filters]);

  return (
    <>
      <section className="module-page-header">
        <div>
          <p className="eyebrow">TMOS Unified Ecosystem OS</p>
          <h2>{title}</h2>
          <p className="hero-copy">{subtitle}</p>
          {summary ? <p className="page-summary">{summary}</p> : null}
        </div>

        <div className="module-page-actions">
          {dataSource ? (
            <span className={`data-source-badge ${dataSource.tone || "demo"}`}>
              Source: {dataSource.label}
            </span>
          ) : null}
          {actions}
        </div>
      </section>

      {stats.length > 0 ? (
        <section className="stats-grid">
          {stats.map((item) => (
            <StatCard key={item.label} {...item} />
          ))}
        </section>
      ) : null}

      {apiSpec ? (
        <section className="panel integration-panel">
          <div className="panel-title-row module-panel-title-row">
            <div>
              <h3 className="panel-title">Backend integration contract</h3>
              <p className="panel-caption">Prepared request and response models for API wiring without UI refactor.</p>
            </div>
          </div>

          <div className="integration-grid">
            <div className="integration-item">
              <p className="integration-label">Endpoint</p>
              <p className="integration-value">{apiSpec.endpoint}</p>
            </div>
            <div className="integration-item">
              <p className="integration-label">Request Model</p>
              <p className="integration-value">{apiSpec.requestModel}</p>
            </div>
            <div className="integration-item">
              <p className="integration-label">Response Model</p>
              <p className="integration-value">{apiSpec.responseModel}</p>
            </div>
            <div className="integration-item">
              <p className="integration-label">Loading State</p>
              <p className="integration-value">{apiSpec.loadingState}</p>
            </div>
            <div className="integration-item">
              <p className="integration-label">Empty State</p>
              <p className="integration-value">{apiSpec.emptyState}</p>
            </div>
            <div className="integration-item">
              <p className="integration-label">Error State</p>
              <p className="integration-value">{apiSpec.errorState}</p>
            </div>
          </div>
        </section>
      ) : null}

      <section className="panel">
        <div className="panel-title-row module-panel-title-row">
          <div>
            <h3 className="panel-title">{tableTitle || title}</h3>
            {tableSubtitle ? <p className="panel-caption">{tableSubtitle}</p> : null}
          </div>

          <div className="module-toolbar">
            <label className="search-field">
              <span className="search-icon">⌕</span>
              <input
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                placeholder={searchPlaceholder}
              />
            </label>

            {visibleFilters.length > 0 ? (
              <div className="filter-chips">
                {visibleFilters.map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    className={`filter-chip${activeFilter === filter ? " active" : ""}`}
                    onClick={() => setActiveFilter(filter)}
                  >
                    {filter}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {isLoading ? (
          <LoadingState message="Loading module data from TMOS services..." />
        ) : errorMessage ? (
          <EmptyState title="Service unavailable" message="Live connection not configured" />
        ) : typeof children === "function" ? (
          <div className="module-panel-body">
            {children({ searchValue, activeFilter })}
          </div>
        ) : (
          <EmptyState title="No data available" message={emptyMessage} />
        )}
      </section>
    </>
  );
}
