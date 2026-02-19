function FileSidebar({
  projects,
  activeProjectId,
  onSelectProject,
  onOpenCreateModal,
  onLogout,
}) {
  return (
    <aside className="file-sidebar">
      <div className="panel file-panel">
        <div className="sidebar-title-row">
          <h2 className="panel-title">My Files</h2>
          <button className="primary-button" onClick={onOpenCreateModal}>
            + New file
          </button>
        </div>

        <div className="file-list">
          {projects.map((project) => (
            <button
              key={project.id}
              className={`file-item ${activeProjectId === project.id ? "active" : ""}`}
              onClick={() => onSelectProject(project.id)}
            >
              {project.name}
            </button>
          ))}
        </div>

        <button className="primary-button signout-button sidebar-logout-button" onClick={onLogout}>
          Log out
        </button>
      </div>
    </aside>
  );
}

export default FileSidebar;
