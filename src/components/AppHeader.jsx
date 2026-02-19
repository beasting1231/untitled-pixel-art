function AppHeader({ currentView, onSwitchView, onLogout }) {
  return (
    <header className="top-bar top-bar-auth top-nav">
      <div>
        <p className="eyebrow">Pixel Forge</p>
        <p className="subtitle">Create pixel art, share it, and vote on community work.</p>
      </div>

      <div className="top-nav-actions">
        <button
          className={`ghost-button nav-button ${currentView === "home" ? "active" : ""}`}
          onClick={() => onSwitchView("home")}
        >
          Home
        </button>
        <button
          className={`ghost-button nav-button ${currentView === "editor" ? "active" : ""}`}
          onClick={() => onSwitchView("editor")}
        >
          Editor
        </button>
        <button className="primary-button signout-button" onClick={onLogout}>
          Log out
        </button>
      </div>
    </header>
  );
}

export default AppHeader;
