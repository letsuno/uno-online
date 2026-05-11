import { request, ProxyAgent } from 'undici';
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
  const { statusCode, body } = await request('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: config.githubClientId,
      client_secret: config.githubClientSecret,
      code,
    }),
    dispatcher: getDispatcher(config),
  });
  const data = (await body.json()) as GitHubTokenResponse;
  if (statusCode !== 200 || !data.access_token) {
    throw new Error('Failed to exchange code for GitHub token');
  }
  return data.access_token;
}

export async function fetchGitHubUser(accessToken: string, config: Config): Promise<GitHubUser> {
  const { statusCode, body } = await request('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${accessToken}`, 'User-Agent': 'UNO-Online' },
    dispatcher: getDispatcher(config),
  });
  if (statusCode !== 200) {
    throw new Error('Failed to fetch GitHub user');
  }
  return body.json() as Promise<GitHubUser>;
}
