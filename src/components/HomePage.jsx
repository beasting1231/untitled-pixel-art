import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Flame, Heart, Sparkles, Trash2, Upload } from "lucide-react";

const PREVIEW_FPS = 6;

const buildFallbackFrame = (size) =>
  Array.from({ length: size * size }, (_, index) => {
    const x = index % size;
    const y = Math.floor(index / size);
    return (x + y) % 2 === 0 ? "rgba(148, 163, 184, 0.22)" : "rgba(148, 163, 184, 0.08)";
  });

const normalizeFrame = (frame, size) => {
  const expectedLength = size * size;
  if (!Array.isArray(frame)) return buildFallbackFrame(size);
  return Array.from({ length: expectedLength }, (_, index) => frame[index] || "transparent");
};

const getPreviewMeta = (project) => {
  const defaultSize = Math.max(1, Number(project?.size) || 16);
  const rawFrames = Array.isArray(project?.previewFrames)
    ? project.previewFrames.filter((frame) => Array.isArray(frame))
    : [];
  const rawPixels = Array.isArray(project?.previewPixels) ? project.previewPixels : [];
  const inferredSizeFromPixels = Math.round(Math.sqrt(rawPixels.length || 0));
  const inferredSizeFromFrames = rawFrames[0] ? Math.round(Math.sqrt(rawFrames[0].length || 0)) : 0;
  const inferredSize =
    inferredSizeFromFrames > 1 ? inferredSizeFromFrames : inferredSizeFromPixels > 1 ? inferredSizeFromPixels : 0;
  const size = inferredSize || defaultSize;

  if (rawFrames.length > 0) {
    return { size, frames: rawFrames.map((frame) => normalizeFrame(frame, size)) };
  }

  if (rawPixels.length > 0) {
    return { size, frames: [normalizeFrame(rawPixels, size)] };
  }

  return { size, frames: [buildFallbackFrame(size)] };
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

    const size = preview.size;
    const frame = preview.frames[frameIndex] || preview.frames[0] || [];
    canvas.width = size;
    canvas.height = size;

    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, size, size);

    frame.forEach((color, index) => {
      if (!color || color === "transparent") return;
      const x = index % size;
      const y = Math.floor(index / size);
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
          <p className="eyebrow">Home</p>
          <h1>{authUser?.displayName ? `Welcome, ${authUser.displayName.split(" ")[0]}` : "Welcome back"}</h1>
          <p className="subtitle">Jump into your projects or explore what the community is building.</p>
        </div>

        <section className="home-section">
          <div className="home-section-header">
            <h2 className="panel-title">Your Projects</h2>
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
                    <PixelPreview project={{ size: project.size, previewFrames: project.frames || [] }} previewKey={project.id} />

                    <div>
                      <p className="home-card-eyebrow">
                        {project.size} x {project.size}
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
            <h2 className="panel-title">Community</h2>
            <p className="home-helper-copy">Sorted by upvotes so popular projects rise to the top.</p>
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
                      #{index + 1} · {project.size} x {project.size}
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
