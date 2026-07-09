export default function StudyManagementPage() {
  return (
    <>
      <div className="page-header">
        <h1>Study Management</h1>
        <p>Learning system administration</p>
      </div>

      <div className="placeholder-grid">
        <div className="placeholder-card">
          <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700 }}>Course Content</h3>
          <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
            Manage lesson content, vocabulary, grammar, and practice exercises.
            Future: edit and publish course JSON data.
          </p>
        </div>
        <div className="placeholder-card">
          <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700 }}>Learning Records</h3>
          <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
            View student learning progress, lesson completion rates, and study time analytics.
          </p>
        </div>
        <div className="placeholder-card">
          <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700 }}>Check-in Records</h3>
          <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
            Daily recording check-in statistics grouped by student and lesson.
          </p>
        </div>
        <div className="placeholder-card">
          <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700 }}>Recitation Data</h3>
          <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
            Session recitation data, practice recordings, and AI scoring results.
          </p>
        </div>
        <div className="placeholder-card">
          <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700 }}>Weak Item Statistics</h3>
          <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
            Aggregate statistics on items students struggle with most frequent mistakes.
          </p>
        </div>
      </div>
    </>
  )
}
