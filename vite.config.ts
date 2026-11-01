import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Base path rules:
//  - public/CNAME present  -> a custom domain serves the project from the root
//  - GITHUB_REPOSITORY set -> a project site is served from /<repo>/
//  - neither (local, Vercel) -> root
// VITE_BASE overrides everything if you ever need to force it.
const hasCustomDomain = existsSync(resolve(process.cwd(), 'public/CNAME'));
const repo = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? '';
const isUserPage = repo.endsWith('.github.io');
const derivedBase = hasCustomDomain || isUserPage || !repo ? '/' : `/${repo}/`;

export default defineConfig({
  base: process.env.VITE_BASE ?? derivedBase,
  plugins: [react()],
});
