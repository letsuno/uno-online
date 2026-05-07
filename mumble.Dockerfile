FROM node:22-slim AS base
WORKDIR /app
RUN npm i yarn -g && yarn global add @mumble-web/gateway
COPY config /app/config

EXPOSE 64737
ENV SERVERS_CONFIG_PATH=/app/config/config.json
CMD ["mumble-web-gateway"]
