import type { Config } from '../config.js';

export interface GitHubTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
}

export interface GitHubUser {
  id: number;
  login: string;
  avatar_url: string;
}

export async function exchangeCodeForToken(code: string, config: Config): Promise<string> {
  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: config.githubClientId,
      client_secret: config.githubClientSecret,
      code,
    }),
  });
  const data = (await response.json()) as GitHubTokenResponse;
  if (!data.access_token) {
    throw new Error('Failed to exchange code for GitHub token');
  }
  return data.access_token;
}

export async function fetchGitHubUser(accessToken: string): Promise<GitHubUser> {
  const response = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error('Failed to fetch GitHub user');
  }
  return response.json() as Promise<GitHubUser>;
}
