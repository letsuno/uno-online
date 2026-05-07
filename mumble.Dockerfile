FROM node:22-slim
WORKDIR /app
RUN corepack enable && yarn global add @mumble-web/gateway

EXPOSE 64737
ENV SERVERS_CONFIG_PATH=/app/config/config.json
CMD ["mumble-web-gateway"]
