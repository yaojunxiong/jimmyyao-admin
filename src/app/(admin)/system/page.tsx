export default function SystemSettingsPage() {
  return (
    <>
      <div className="page-header">
        <h1>System Settings</h1>
        <p>Global system configuration</p>
      </div>

      <div className="placeholder-grid">
        <div className="placeholder-card">
          <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700 }}>SMTP / Email</h3>
          <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
            Configure email server settings for system notifications, workflow alerts, and password resets.
          </p>
        </div>
        <div className="placeholder-card">
          <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700 }}>Login Controls</h3>
          <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
            Enable/disable login methods, configure OAuth providers, set session policies.
          </p>
        </div>
        <div className="placeholder-card">
          <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700 }}>Visitor Flow Rules</h3>
          <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
            Manage visitor workflow trigger rules and blocklist configuration.
          </p>
        </div>
        <div className="placeholder-card">
          <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700 }}>SEO Settings</h3>
          <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
            Configure meta tags, sitemap generation, and search engine optimization parameters.
          </p>
        </div>
        <div className="placeholder-card">
          <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700 }}>Feature Toggles</h3>
          <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
            Global feature flags: enable/disable subsystems, maintenance mode, and beta features.
          </p>
        </div>
      </div>
    </>
  )
}
