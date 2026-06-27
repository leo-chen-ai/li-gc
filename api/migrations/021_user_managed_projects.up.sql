CREATE TABLE user_managed_projects (
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES construction_projects(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, project_id)
);

CREATE INDEX idx_user_managed_projects_project_id ON user_managed_projects(project_id);
