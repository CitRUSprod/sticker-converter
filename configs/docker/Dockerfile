ARG NODE_IMAGE
FROM ${NODE_IMAGE} AS base
WORKDIR /project
RUN corepack enable && corepack prepare pnpm@9.0.6 --activate
ENV PNPM_HOME=/usr/local/bin

FROM base AS preparer
RUN pnpm add -g turbo@1.13.4
COPY . .
RUN turbo prune --docker telegram-bot

FROM base AS installer
COPY --from=preparer /project/out/json .
RUN pnpm i
COPY . .

FROM installer AS telegram-bot
ENV IS_DOCKER_CONTAINER=true
RUN pnpm build --filter=telegram-bot...
WORKDIR /project/apps/telegram-bot
CMD pnpm start
