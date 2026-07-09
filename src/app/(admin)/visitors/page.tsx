export default function VisitorsPage() {
  return (
    <>
      <div className="page-header">
        <h1>Visitors</h1>
        <p>Visitor records and analytics</p>
      </div>

      <div className="placeholder-grid">
        <div className="placeholder-card">
          <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700 }}>Visitor Records</h3>
          <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
            Full visitor logs with IP address, referrer source, pages visited, and timestamps.
          </p>
        </div>
        <div className="placeholder-card">
          <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700 }}>Signed-in Visits</h3>
          <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
            Track authenticated user page visits, navigation patterns, and session data.
          </p>
        </div>
        <div className="placeholder-card">
          <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700 }}>Anonymous Visits</h3>
          <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
            Anonymous visitor tracking with device fingerprinting and session identification.
          </p>
        </div>
        <div className="placeholder-card">
          <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700 }}>Traffic Sources</h3>
          <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
            Analyze traffic sources: direct, search engine, social media, and referral links.
          </p>
        </div>
      </div>
    </>
  )
}
