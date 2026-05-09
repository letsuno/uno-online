import { ProxyAgent } from 'undici';
import type { Config } from '../config';

interface GitHubTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
}

interface GitHubUser {
  id: number;
  login: string;
  avatar_url: string;
}

function getDispatcher(config: Config): ProxyAgent | undefined {
  return config.githubProxy ? new ProxyAgent(config.githubProxy) : undefined;
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
    dispatcher: getDispatcher(config),
  } as RequestInit);
  const data = (await response.json()) as GitHubTokenResponse;
  if (!data.access_token) {
    throw new Error('Failed to exchange code for GitHub token');
  }
  return data.access_token;
}

export async function fetchGitHubUser(accessToken: string, config: Config): Promise<GitHubUser> {
  const response = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${accessToken}` },
    dispatcher: getDispatcher(config),
  } as RequestInit);
  if (!response.ok) {
    throw new Error('Failed to fetch GitHub user');
  }
  return response.json() as Promise<GitHubUser>;
}
