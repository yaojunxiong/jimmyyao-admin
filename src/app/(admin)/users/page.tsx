export default function UsersPage() {
  return (
    <>
      <div className="page-header">
        <h1>Users</h1>
        <p>User management and permissions</p>
      </div>

      <div className="placeholder-grid">
        <div className="placeholder-card">
          <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700 }}>User List</h3>
          <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
            Browse all registered users, search by name or email, view profiles and activity.
          </p>
        </div>
        <div className="placeholder-card">
          <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700 }}>Roles & Permissions</h3>
          <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
            Assign user roles (admin, moderator, member). Manage permission groups.
          </p>
        </div>
        <div className="placeholder-card">
          <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700 }}>Admin Management</h3>
          <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
            Grant and revoke administrator privileges. View admin audit trail.
          </p>
        </div>
        <div className="placeholder-card">
          <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700 }}>VIP / Membership</h3>
          <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
            Manage user VIP status, membership tiers, and subscription expirations.
          </p>
        </div>
      </div>
    </>
  )
}
