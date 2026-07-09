export default function ForumManagementPage() {
  return (
    <>
      <div className="page-header">
        <h1>Forum Management</h1>
        <p>Forum.jimmyyao.com administration</p>
      </div>

      <div className="placeholder-grid">
        <div className="placeholder-card">
          <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700 }}>Post Management</h3>
          <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
            View, approve, reject, hide, or delete forum posts. Full moderation capabilities.
          </p>
        </div>
        <div className="placeholder-card">
          <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700 }}>Reply Management</h3>
          <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
            Moderate forum replies, hide inappropriate content, manage discussions.
          </p>
        </div>
        <div className="placeholder-card">
          <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700 }}>Board Management</h3>
          <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
            Create, edit, and reorder forum boards and categories.
          </p>
        </div>
        <div className="placeholder-card">
          <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700 }}>Report Queue</h3>
          <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
            Handle user-reported content. Review and take action on reported posts and replies.
          </p>
        </div>
      </div>
    </>
  )
}
