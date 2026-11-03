export const PageLoading = () => (
  <section
    className="page-loading"
    aria-busy="true"
    aria-label="Loading page"
  >
    <p role="status">Loading your workspace…</p>
    <div
      className="page-loading-heading"
      aria-hidden="true"
    />
    <div
      className="page-loading-line"
      aria-hidden="true"
    />
    <div
      className="page-loading-banner"
      aria-hidden="true"
    />
    <div
      className="page-loading-grid"
      aria-hidden="true"
    >
      {[0, 1, 2].map((item) => (
        <div key={item} />
      ))}
    </div>
  </section>
)
