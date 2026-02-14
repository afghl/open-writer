# OpenWrite MVP

Minimalist AI Coding Workspace.

## Tech Stack
- Next.js 14 (App Router)
- Tailwind CSS
- Lucide React

## Development
```bash
npm install
npm run dev
```

For local development without explicit env configuration:
- `OW_API_BASE` defaults to `http://127.0.0.1:3000`
- `OW_PROXY_TOKEN` defaults to `dev-openwrite-proxy-token`

## Deployment to Vercel

1. Push this code to a GitHub repository.
2. Go to [Vercel](https://vercel.com) and click "Add New... > Project".
3. Import your repository.
4. Keep the default settings (Framework Preset: Next.js).
5. Click **Deploy**.
6. Configure the environment variables below.

### Required Vercel Environment Variables (Production)

- `OW_API_BASE`: public base URL of your backend node (for example: `https://api.example.com`)
- `OW_PROXY_TOKEN`: shared secret used by Vercel API routes when forwarding requests to backend

In production (`NODE_ENV=production`), missing `OW_API_BASE` or `OW_PROXY_TOKEN` will fail requests instead of falling back to localhost.

### Request Flow

Browser requests stay same-origin to:
- `/api/openwrite/project`
- `/api/openwrite/projects`
- `/api/openwrite/fs/tree`
- `/api/openwrite/fs/read`
- `/api/openwrite/library/import`
- `/api/openwrite/library/import/[id]`
- `/api/openwrite/library/docs`

Those Vercel API routes forward server-to-server requests to `OW_API_BASE`, and inject:
- `x-ow-proxy-token: <OW_PROXY_TOKEN>`

### Upload Note

The current `/api/openwrite/library/import` path uploads through Vercel API routes.
For stable production behavior, keep single upload files within 4MB, or change to direct backend/object-storage upload.
