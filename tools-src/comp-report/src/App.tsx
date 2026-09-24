export function App() {
  return (
    <>
      <header className="bar">
        <img src="/assets/brand/casa-blanca-wordmark-white.png" alt="Casa Blanca" />
        <span className="bar-label">Comp Report</span>
      </header>

      <section className="hero">
        <h1>Comp<br />report</h1>
        <p>Bring the comps you found on StreetEasy, work through them, and leave with a defensible
          range and a client-ready email.</p>
      </section>

      <main className="page">
        <div className="label">Status</div>
        <div className="card">
          <p className="card-title">Foundations build</p>
          <p className="muted">
            The comp report is being built. Sign-in, saved reports and the assistant arrive in the
            next steps.
          </p>
        </div>
      </main>
    </>
  );
}
