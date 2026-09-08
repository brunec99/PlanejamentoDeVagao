-- Adds the 'admin' role (grants/revokes other users' access to works — see the
-- grant_access/revoke_access commands). Separate from 'manager': admin does not
-- inherit planning permissions, it exists solely to manage who can see what.
alter table profiles drop constraint profiles_role_check;
alter table profiles add constraint profiles_role_check check (role in ('viewer', 'planner', 'manager', 'admin'));
