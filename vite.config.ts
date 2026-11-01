import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages project sites are served from /<repo>/, while user pages
// (<name>.github.io) and Vercel serve from the root. GITHUB_REPOSITORY is only
// set inside Actions, so local dev picks up the default.
const repo = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? '';
const isUserPage = repo.endsWith('.github.io');

export default defineConfig({
  base: repo && !isUserPage ? `/${repo}/` : '/',
  plugins: [react()],
});
