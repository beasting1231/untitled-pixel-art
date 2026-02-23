import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Flame, Heart, Sparkles, Trash2, Upload } from "lucide-react";

const PREVIEW_FPS = 6;

const buildFallbackFrame = (width, height) =>
  Array.from({ length: width * height }, (_, index) => {
    const x = index % width;
    const y = Math.floor(index / width);
    return (x + y) % 2 === 0 ? "rgba(148, 163, 184, 0.22)" : "rgba(148, 163, 184, 0.08)";
  });

const normalizeFrame = (frame, width, height) => {
  const expectedLength = width * height;
  if (!Array.isArray(frame)) return buildFallbackFrame(width, height);
  return Array.from({ length: expectedLength }, (_, index) => frame[index] || "transparent");
};

const getPreviewMeta = (project) => {
  const defaultWidth = Math.max(1, Number(project?.width) || Number(project?.size) || 16);
  const defaultHeight = Math.max(1, Number(project?.height) || Number(project?.size) || 16);
  const rawFrames = Array.isArray(project?.previewFrames)
    ? project.previewFrames.filter((frame) => Array.isArray(frame))
    : [];
  const rawPixels = Array.isArray(project?.previewPixels) ? project.previewPixels : [];
  const width = defaultWidth;
  const height = defaultHeight;

  if (rawFrames.length > 0) {
    return { width, height, frames: rawFrames.map((frame) => normalizeFrame(frame, width, height)) };
  }

  if (rawPixels.length > 0) {
    return { width, height, frames: [normalizeFrame(rawPixels, width, height)] };
  }

  return { width, height, frames: [buildFallbackFrame(width, height)] };
};

function PixelPreview({ project, previewKey }) {
  const canvasRef = useRef(null);
  const preview = useMemo(() => getPreviewMeta(project), [project]);
  const [frameIndex, setFrameIndex] = useState(0);
  const totalFrames = preview.frames.length;

  useEffect(() => {
    setFrameIndex(0);
  }, [previewKey, totalFrames]);

  useEffect(() => {
    if (totalFrames < 2) return undefined;
    const intervalMs = Math.max(1000 / PREVIEW_FPS, 120);
    const timer = window.setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % totalFrames);
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [totalFrames]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const width = preview.width;
    const height = preview.height;
    const frame = preview.frames[frameIndex] || preview.frames[0] || [];
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, width, height);

    frame.forEach((color, index) => {
      if (!color || color === "transparent") return;
      const x = index % width;
      const y = Math.floor(index / width);
      context.fillStyle = color;
      context.fillRect(x, y, 1, 1);
    });
  }, [frameIndex, preview]);

  return (
    <div className="home-project-preview" aria-hidden="true">
      <canvas ref={canvasRef} className="home-project-preview-canvas" />
    </div>
  );
}

function HomePage({
  authUser,
  projects,
  publishedProjectIds,
  projectCommunityLikes,
  publishingProjectId,
  onCreateProject,
  onOpenProject,
  onOpenEditor,
  onPublishProject,
  onDeleteProject,
  communityProjects,
  communityLoading,
  communityError,
  onToggleUpvote,
}) {
  const [projectPendingDelete, setProjectPendingDelete] = useState(null);
  const firstName = authUser?.displayName?.trim()?.split(/\s+/)?.[0] || "Creator";
  const totalFrames = projects.reduce((sum, project) => sum + Math.max(1, project.frames?.length || 1), 0);
  const publishedCount = publishedProjectIds?.size || 0;

  const requestDelete = (project) => {
    setProjectPendingDelete(project);
  };

  const confirmDelete = () => {
    if (!projectPendingDelete) return;
    onDeleteProject(projectPendingDelete.id);
    setProjectPendingDelete(null);
  };

  return (
    <>
      <section className="home-shell panel">
        <div className="home-hero">
          <div className="home-hero-copy">
            <p className="eyebrow">Workspace</p>
            <h1>Welcome back, {firstName}</h1>
            <p className="subtitle">Jump into your files or explore what the community is building.</p>
          </div>

          <div className="home-hero-stats" role="list" aria-label="Workspace stats">
            <div className="home-hero-stat" role="listitem">
              <p className="home-hero-stat-value">{projects.length}</p>
              <p className="home-hero-stat-label">Projects</p>
            </div>
            <div className="home-hero-stat" role="listitem">
              <p className="home-hero-stat-value">{totalFrames}</p>
              <p className="home-hero-stat-label">Frames</p>
            </div>
            <div className="home-hero-stat" role="listitem">
              <p className="home-hero-stat-value">{publishedCount}</p>
              <p className="home-hero-stat-label">Published</p>
            </div>
          </div>
        </div>

        <section className="home-section">
          <div className="home-section-header">
            <div className="home-section-headline">
              <h2 className="panel-title">Your Projects</h2>
              <p>Recent files ready for edits and publishing.</p>
            </div>
            <div className="home-actions">
              <button className="primary-button" onClick={onCreateProject}>
                New project
              </button>
              <button className="primary-button" onClick={onOpenEditor}>
                Open editor <ArrowRight size={15} aria-hidden="true" />
              </button>
            </div>
          </div>

          {projects.length > 0 ? (
            <div className="projects-strip" role="list" aria-label="Your projects">
              {projects.map((project) => {
                return (
                  <article key={project.id} className="home-project-card" role="listitem">
                    <PixelPreview
                      project={{ width: project.width, height: project.height, previewFrames: project.frames || [] }}
                      previewKey={project.id}
                    />

                    <div>
                      <p className="home-card-eyebrow">
                        {project.width} x {project.height}
                      </p>
                      <h3>{project.name}</h3>
                      <p>{project.frames?.length || 1} frame{(project.frames?.length || 1) === 1 ? "" : "s"}</p>
                      <p className="project-likes-line" aria-label={`Likes ${projectCommunityLikes?.[project.id] || 0}`}>
                        <Heart size={14} aria-hidden="true" /> {projectCommunityLikes?.[project.id] || 0}
                      </p>
                    </div>

                    <div className="home-project-actions">
                      <button className="primary-button" onClick={() => onOpenProject(project.id)}>
                        Edit
                      </button>
                      <button
                        className="ghost-button"
                        onClick={() => onPublishProject(project)}
                        disabled={publishingProjectId === project.id || publishedProjectIds?.has(project.id)}
                      >
                        <Upload size={14} aria-hidden="true" />
                        {publishingProjectId === project.id
                          ? "Publishing..."
                          : publishedProjectIds?.has(project.id)
                            ? "Published"
                            : "Publish"}
                      </button>
                      <button className="ghost-button danger-button" onClick={() => requestDelete(project)}>
                        <Trash2 size={14} aria-hidden="true" />
                        Delete
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="home-empty-state">
              <Sparkles size={18} aria-hidden="true" />
              <p>Create your first project to populate this section.</p>
            </div>
          )}
        </section>

        <section className="home-section community-section">
          <div className="home-section-header">
            <div className="home-section-headline">
              <h2 className="panel-title">Community</h2>
              <p className="home-helper-copy">Sorted by upvotes so popular projects rise to the top.</p>
            </div>
          </div>

          {communityLoading ? <p className="subtitle">Loading community projects...</p> : null}
          {communityError ? <p className="auth-error">{communityError}</p> : null}

          {!communityLoading && !communityError && communityProjects.length === 0 ? (
            <div className="home-empty-state">
              <Flame size={18} aria-hidden="true" />
              <p>No community projects yet. Publish one of yours to start the feed.</p>
            </div>
          ) : null}

          <div className="community-feed" role="list" aria-label="Community projects">
            {communityProjects.map((project, index) => {
              return (
                <article key={project.id} className="home-project-card community-project-card" role="listitem">
                  <PixelPreview project={project} previewKey={project.id} />

                  <div>
                    <p className="home-card-eyebrow">
                      #{index + 1} · {project.width} x {project.height}
                    </p>
                    <h3>{project.name}</h3>
                    <p>
                      By {project.authorName || "Unknown creator"} · {project.frameCount} frame
                      {project.frameCount === 1 ? "" : "s"}
                    </p>
                  </div>

                  <div className="community-card-actions">
                    <button
                      className={`community-upvote ${project.hasUpvoted ? "active" : ""}`}
                      onClick={() => onToggleUpvote(project.id)}
                    >
                      <Heart size={14} aria-hidden="true" /> {project.upvotes}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </section>

      {projectPendingDelete ? (
        <div
          className="modal-backdrop"
          onClick={() => setProjectPendingDelete(null)}
          role="presentation"
        >
          <div className="modal-card" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <h2 className="panel-title">Delete project</h2>
            <p>Are you sure?</p>
            <p className="subtitle">{projectPendingDelete.name}</p>
            <div className="modal-actions">
              <button
                type="button"
                className="primary-button ghost-button"
                onClick={() => setProjectPendingDelete(null)}
              >
                Cancel
              </button>
              <button type="button" className="primary-button danger-button" onClick={confirmDelete}>
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export default HomePage;
