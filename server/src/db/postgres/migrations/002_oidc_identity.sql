ALTER TABLE sys_user ADD COLUMN oidc_subject TEXT;
CREATE UNIQUE INDEX uq_sys_user_oidc_subject
  ON sys_user (oidc_subject)
  WHERE oidc_subject IS NOT NULL;
