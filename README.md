# Structural Hub

Structural Hub is a project workspace for engineering teams. It supports nested projects and building packages, phase tracking, project membership, file storage, file visibility rules, and administrator-managed user roles.

## Requirements

- Node.js 20 or newer
- PostgreSQL
- An AWS S3 bucket for the primary file upload flow

## Local setup

1. Copy `backend/.env.example` to `backend/.env` and fill in the database, JWT, and S3 values. Copy `frontend/.env.example` to `frontend/.env` only when the API URL differs from the local default.
2. Install and prepare the backend:

   ```powershell
   cd backend
   npm install
   npm run db:generate
   npm run db:deploy
   npm run dev
   ```

3. In a second terminal, install and start the frontend:

   ```powershell
   cd frontend
   npm install
   npm run dev
   ```

The frontend uses `http://localhost:5000/api` by default. Set `VITE_API_URL` in `frontend/.env` when the API is hosted elsewhere. The API health check is at `/api/health`.

For development schema changes, use `npm run db:migrate -- --name describe-change` from `backend`; for a deployed database, apply committed migrations with `npm run db:deploy`.

## Roles

- Global `ADMIN` accounts manage users and archive projects. There is no open registration. An admin creates a single-use invitation link for a specific email and chooses `CLIENT` or `TEAM_MEMBER`; links expire after 7 days and can be revoked. Send links using a private channel. The app does not send invitation email or verify mailbox ownership, so the recipient must be able to access the invitation link. Create the first admin once, before opening the app to users:

   ```powershell
   cd backend
   $env:BOOTSTRAP_ADMIN_EMAIL = "admin@example.com"
   $env:BOOTSTRAP_ADMIN_NAME = "Project Administrator"
   $env:BOOTSTRAP_ADMIN_PASSWORD = "use-a-unique-password-of-at-least-12-characters"
   npm run admin:create
   Remove-Item Env:BOOTSTRAP_ADMIN_EMAIL, Env:BOOTSTRAP_ADMIN_NAME, Env:BOOTSTRAP_ADMIN_PASSWORD
   ```
- `CLIENT` and `TEAM_MEMBER` accounts can view projects. Project membership grants `VIEWER`, `EDITOR`, or `MANAGER` capabilities. Membership on a parent project also applies to nested packages unless a direct package membership overrides it. Clients can view project content as configured; downloads are limited to global admins and assigned editor team members.
- File entries have allowed project roles, and managers can change who can see each entry. File downloads are limited to global admins and `TEAM_MEMBER` users assigned the `EDITOR` role on the project (including inherited parent membership).
- Each project has an activity log with actor and timestamp for project edits, phase changes, file uploads/deletions, membership and file-visibility changes, and archive/restore actions. The activity migration backfills project creation, the latest known project edit, and existing file upload dates.

The administrator directory contains invitation management. Invitation tokens are only returned when created; only token hashes are stored. Changing an account's global role invalidates its current sessions, so the user must sign in again.

## Production launch

1. Choose a production host for the frontend and API, use HTTPS on both, set the frontend build variable `VITE_API_URL` to the API's HTTPS `/api` URL, and configure the API's `CORS_ORIGIN` to the exact frontend origin(s). Set `NODE_ENV=production`, `JWT_SECRET` to at least 32 random characters, `DATABASE_URL` to the runtime Neon connection string, and `DIRECT_URL` to the direct connection string for migrations. Set `AWS_REGION` and `AWS_S3_BUCKET_NAME`; use a restricted workload IAM role when available. Never commit `.env` files or expose credentials in browser variables.
2. In a protected one-off backend environment, set the `BOOTSTRAP_ADMIN_*` values and run `npm run admin:create` once. This refuses to run after an admin exists. Remove those temporary values after it succeeds.
3. Take a database backup, then run `npm run db:deploy` against the production database before deploying the new API code. Deploy the frontend and backend, then verify `/api/health`, login, create a project, invite a test account, upload and preview a PDF/image, and verify the intended download permissions.
4. Keep S3 private, enable bucket versioning and lifecycle/backup policies as appropriate, and configure bucket CORS for the exact frontend origin and `PUT` plus `Content-Type`. Configure the hosting proxy and `TRUST_PROXY` together; do not trust arbitrary forwarded IP headers. Monitor the hosting provider's logs, database health, storage usage, and backup restore ability.

Rate limits currently use per-process memory. Before running multiple API instances, put a shared rate-limit store in front of them or replace this limiter with a shared store. Activity history is an application activity feed, not a tamper-proof compliance audit. The app currently has no MFA, password reset, automated invitation email, or mailbox verification; plan those if your launch requires them. Deployment, DNS, credentials, S3 policy/CORS, backups, and restore testing must be completed in the hosting/provider consoles; repository builds alone cannot verify those external services.

## File storage

The project detail upload flow uses private S3 objects and short-lived signed upload/download URLs. Configure `AWS_REGION` and `AWS_S3_BUCKET_NAME`; credentials are resolved using the AWS SDK default provider chain (environment credentials, shared profile, or workload role). Configure the bucket CORS policy to allow `PUT` from the frontend origin and the `Content-Type` header. Files are limited to 50 MB and the supported types are PDF, CAD/BIM formats, common images, DOC/DOCX, and XLSX.

Visible PDF and image files can be previewed inside the project workspace through an authenticated streaming endpoint. Previews do not expose S3 URLs; file downloads remain limited to admins and assigned editor team members.

The older multipart endpoint stores files locally under `backend/uploads`; local files are delivered through an authenticated API route. Do not expose that directory with a public static file server.

## Checks

```powershell
cd backend; npm run build
cd ..\frontend; npm run build
```

## What users can do

- Sign in. Registration is available only from a valid invitation link. Admins create and revoke email-bound invitations from the user directory.
- Browse projects, filter the dashboard, open project workspaces, and organize projects into parent projects and nested building packages.
- Review project details, phases, progress, dates and notes. Project managers/editors with permission can update project content and assign project members and roles.
- Upload project files, set visibility by project role, preview supported PDFs and images in the workspace, and download only when the global/project permission rule allows it.
- Read project activity entries showing who changed project information, phases, files, membership, visibility, and archive state, with timestamps.
- Administer user roles, invitations, and project archival. Role changes invalidate existing sessions and require a new sign-in.
