import type { FastifyInstance } from 'fastify';
import type { PluginContext } from '../../../plugin-context.js';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import type { AuthenticatorTransportFuture } from '@simplewebauthn/server';
import {
  getPasskeysByUserId,
  getPasskeyById,
  createPasskey,
  updatePasskeyCounter,
  deletePasskey,
} from '../../../db/passkey-repo.js';
import { getUserById } from '../../../db/user-repo.js';
import { authPreHandler, makeToken, userResponse } from './service.js';
import type { AuthenticatedRequest } from './service.js';
import { createRateLimiter } from '../../../auth/rate-limiter.js';
import { randomBytes } from 'node:crypto';

export function registerPasskeyRoutes(fastify: FastifyInstance, ctx: PluginContext) {
  const { config, kv } = ctx;
  const preHandler = authPreHandler(config.jwtSecret);
  const loginLimiter = createRateLimiter({ windowMs: 60_000, max: 10 });

  function getRpId(): string | string[] {
    if (config.webauthnRpId) {
      return config.webauthnRpId.includes(',')
        ? config.webauthnRpId.split(',').map(s => s.trim())
        : config.webauthnRpId;
    }
    return new URL(config.clientUrl).hostname;
  }

  function getFirstRpId(): string {
    const rpId = getRpId();
    return Array.isArray(rpId) ? rpId[0]! : rpId;
  }

  function getOrigin(): string | string[] {
    if (config.webauthnOrigin) {
      return config.webauthnOrigin.includes(',')
        ? config.webauthnOrigin.split(',').map(s => s.trim())
        : config.webauthnOrigin;
    }
    return new URL(config.clientUrl).origin;
  }

  // ── Registration (authenticated) ──

  fastify.post('/auth/passkey/register-options', { preHandler }, async request => {
    const { userId, username } = (request as AuthenticatedRequest).user;
    const userPasskeys = await getPasskeysByUserId(userId);

    const options = await generateRegistrationOptions({
      rpName: config.webauthnRpName ?? 'UNO Online',
      rpID: getFirstRpId(),
      userName: username,
      attestationType: 'none',
      excludeCredentials: userPasskeys.map(pk => ({
        id: pk.id,
        transports: pk.transports ? (JSON.parse(pk.transports) as AuthenticatorTransportFuture[]) : undefined,
      })),
      authenticatorSelection: {
        residentKey: 'required',
        userVerification: 'preferred',
      },
    });

    await kv.set(`passkey:challenge:${userId}`, options.challenge, 300);
    return options;
  });

  fastify.post<{ Body: { credential: Record<string, unknown>; name: string } }>(
    '/auth/passkey/register-verify',
    { preHandler },
    async (request, reply) => {
      const { userId } = (request as AuthenticatedRequest).user;
      const { credential, name } = request.body;

      if (!credential || !name?.trim()) {
        return reply.code(400).send({ error: '参数不完整' });
      }

      const expectedChallenge = await kv.get(`passkey:challenge:${userId}`);
      if (!expectedChallenge) {
        return reply.code(400).send({ error: '验证已过期，请重试' });
      }
      await kv.del(`passkey:challenge:${userId}`);

      let verification;
      try {
        verification = await verifyRegistrationResponse({
          response: credential as any,
          expectedChallenge,
          expectedOrigin: getOrigin(),
          expectedRPID: getRpId(),
        });
      } catch (err) {
        fastify.log.warn({ err }, 'Passkey registration verification failed');
        return reply.code(400).send({ error: '验证失败' });
      }

      if (!verification.verified || !verification.registrationInfo) {
        return reply.code(400).send({ error: '验证失败' });
      }

      const { credential: cred, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
      const passkey = await createPasskey({
        id: cred.id,
        userId,
        publicKey: isoBase64URL.fromBuffer(cred.publicKey),
        counter: cred.counter,
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
        transports: cred.transports,
        name: name.trim(),
      });

      return { success: true, passkey: { id: passkey.id, name: passkey.name, createdAt: passkey.createdAt } };
    },
  );

  // ── Authentication (public) ──

  fastify.post('/auth/passkey/login-options', async request => {
    const options = await generateAuthenticationOptions({
      rpID: getFirstRpId(),
      userVerification: 'preferred',
      allowCredentials: [],
    });

    const challengeId = randomBytes(16).toString('hex');
    await kv.set(`passkey:challenge:login:${challengeId}`, options.challenge, 300);

    return { options, challengeId };
  });

  fastify.post<{ Body: { credential: Record<string, unknown>; challengeId: string } }>(
    '/auth/passkey/login-verify',
    { preHandler: [loginLimiter] },
    async (request, reply) => {
      const { credential, challengeId } = request.body;

      if (!credential || !challengeId) {
        return reply.code(400).send({ error: '参数不完整' });
      }

      const expectedChallenge = await kv.get(`passkey:challenge:login:${challengeId}`);
      if (!expectedChallenge) {
        return reply.code(400).send({ error: '验证已过期，请重试' });
      }
      await kv.del(`passkey:challenge:login:${challengeId}`);

      const credentialId = (credential as any).id as string;
      const passkey = await getPasskeyById(credentialId);
      if (!passkey) {
        return reply.code(401).send({ error: '未找到对应的 Passkey' });
      }

      let verification;
      try {
        verification = await verifyAuthenticationResponse({
          response: credential as any,
          expectedChallenge,
          expectedOrigin: getOrigin(),
          expectedRPID: getRpId(),
          credential: {
            id: passkey.id,
            publicKey: isoBase64URL.toBuffer(passkey.publicKey),
            counter: passkey.counter,
            transports: passkey.transports
              ? (JSON.parse(passkey.transports) as AuthenticatorTransportFuture[])
              : undefined,
          },
        });
      } catch (err) {
        fastify.log.warn({ err }, 'Passkey login verification failed');
        return reply.code(401).send({ error: '验证失败' });
      }

      if (!verification.verified) {
        return reply.code(401).send({ error: '验证失败' });
      }

      await updatePasskeyCounter(passkey.id, verification.authenticationInfo.newCounter);

      const user = await getUserById(passkey.userId);
      if (!user) {
        return reply.code(401).send({ error: '用户不存在' });
      }

      const token = makeToken(user, config.jwtSecret);
      return { token, user: userResponse(user) };
    },
  );

  // ── Management (authenticated) ──

  fastify.get('/auth/passkey/list', { preHandler }, async request => {
    const { userId } = (request as AuthenticatedRequest).user;
    const passkeys = await getPasskeysByUserId(userId);
    return passkeys.map(pk => ({ id: pk.id, name: pk.name, createdAt: pk.createdAt }));
  });

  fastify.delete<{ Params: { id: string } }>('/auth/passkey/:id', { preHandler }, async (request, reply) => {
    const { userId } = (request as AuthenticatedRequest).user;
    const { id } = request.params;
    const deleted = await deletePasskey(id, userId);
    if (!deleted) {
      return reply.code(404).send({ error: '未找到该 Passkey' });
    }
    return { success: true };
  });
}
