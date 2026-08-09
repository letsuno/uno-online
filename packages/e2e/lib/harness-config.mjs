const DEFAULT_CLIENT_URL = 'http://127.0.0.1:5173';

function parsePort(value, name) {
  const text = String(value).trim();
  if (!/^\d+$/u.test(text)) {
    throw new Error(`${name} 必须是 1-65535 的整数`);
  }
  const port = Number(text);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`${name} 必须是 1-65535 的整数`);
  }
  return port;
}

function parseClientUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`UNO_CLIENT_URL 不是有效 URL: ${value}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('UNO_CLIENT_URL 仅支持 http 或 https');
  }
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('UNO_CLIENT_URL 必须是无认证信息、路径、查询或锚点的 origin');
  }
  return url;
}

function effectiveUrlPort(url) {
  if (url.port) return parsePort(url.port, 'UNO_CLIENT_URL 端口');
  return url.protocol === 'https:' ? 443 : 80;
}

/** Resolve every URL/port consumer from one validated configuration. */
export function resolveHarnessConfig(env = process.env) {
  const rawClientUrl = env.UNO_CLIENT_URL;
  const rawClientPort = env.UNO_E2E_CLIENT_PORT;
  const clientUrl = parseClientUrl(rawClientUrl ?? DEFAULT_CLIENT_URL);

  let clientPort;
  if (rawClientPort !== undefined) {
    clientPort = parsePort(rawClientPort, 'UNO_E2E_CLIENT_PORT');
    if (rawClientUrl !== undefined) {
      const urlPort = effectiveUrlPort(clientUrl);
      if (urlPort !== clientPort) {
        throw new Error(`UNO_CLIENT_URL 端口 ${urlPort} 与 UNO_E2E_CLIENT_PORT ${clientPort} 不一致`);
      }
    } else {
      clientUrl.port = String(clientPort);
    }
  } else {
    clientPort = effectiveUrlPort(clientUrl);
  }

  const serverPort = parsePort(env.UNO_E2E_SERVER_PORT ?? '3001', 'UNO_E2E_SERVER_PORT');
  return {
    clientUrl: clientUrl.origin,
    clientPort,
    serverPort,
  };
}

/** Validate the subset supported by startServices' locally spawned Vite. */
export function assertLocalHarnessConfig(config) {
  const url = new URL(config.clientUrl);
  const hostname = url.hostname.toLowerCase();
  const isLoopback = hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1' || hostname === '[::1]';
  if (!isLoopback) {
    throw new Error(`startServices 仅支持 loopback UNO_CLIENT_URL，当前为 ${hostname}`);
  }
  if (url.protocol !== 'http:') {
    throw new Error('startServices 只能启动 http Vite 服务；https URL 仅可用于外部目标脚本');
  }
  if (config.clientPort === config.serverPort) {
    throw new Error('UNO_E2E_CLIENT_PORT 与 UNO_E2E_SERVER_PORT 不能相同');
  }
}
