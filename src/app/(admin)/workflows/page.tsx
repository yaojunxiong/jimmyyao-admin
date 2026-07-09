export default function WorkflowsPage() {
  return (
    <>
      <div className="page-header">
        <h1>Workflows</h1>
        <p>Approval workflows and process management</p>
      </div>

      <div className="placeholder-grid">
        <div className="placeholder-card">
          <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700 }}>Visitor Confirmation</h3>
          <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
            New visitor identity confirmation workflow. Approve or reject anonymous visitors.
          </p>
        </div>
        <div className="placeholder-card">
          <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700 }}>First Visit Confirmation</h3>
          <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
            Logged-in user first visit confirmation workflow.
          </p>
        </div>
        <div className="placeholder-card">
          <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700 }}>VIP Application</h3>
          <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
            VIP membership upgrade request processing and approval.
          </p>
        </div>
        <div className="placeholder-card">
          <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700 }}>Workflow Instances</h3>
          <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
            View all workflow instances, their current status, and processing history.
          </p>
        </div>
        <div className="placeholder-card">
          <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700 }}>Approval Records</h3>
          <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
            Audit log of all approval actions: who approved, rejected, or escalated each request.
          </p>
        </div>
      </div>
    </>
  )
}
