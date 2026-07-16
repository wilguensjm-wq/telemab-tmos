import { isRouteErrorResponse, Link, useRouteError } from "react-router-dom";

export default function RouteErrorBoundary() {
  const error = useRouteError();

  let title = "Unexpected Error";
  let message = "No Data Available";

  if (isRouteErrorResponse(error)) {
    title = `${error.status} ${error.statusText || "Route Error"}`;
    message = typeof error.data === "string" ? error.data : "Provider Not Configured";
  } else if (error instanceof Error) {
    message = error.message || "Provider Not Configured";
  }

  return (
    <main className="route-error-page" role="alert" aria-live="assertive">
      <section className="route-error-card">
        <p className="route-error-kicker">TMOS</p>
        <h1>{title}</h1>
        <p>{message}</p>
        <div className="route-error-actions">
          <Link to="/" className="ghost-button">Go to Dashboard</Link>
          <Link to="/login" className="ghost-button">Sign In Again</Link>
        </div>
      </section>
    </main>
  );
}
