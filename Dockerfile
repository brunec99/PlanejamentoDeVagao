# syntax=docker/dockerfile:1
#
# Empacota o sistema para rodar fora da Vercel (servidor da ATR). Não altera o código: usa os
# mesmos comandos do package.json (`npm ci`, `npm run build`, `next start`) e o mesmo Node do CI.
#
# Só as variáveis NEXT_PUBLIC_* entram na imagem, porque o Next as grava no JavaScript do navegador
# durante o build (já são públicas). As variáveis de servidor (SUPABASE_SERVICE_ROLE_KEY,
# ANTHROPIC_API_KEY, PREVISION_API_TOKEN…) NÃO entram: são entregues ao container na hora de rodar.

FROM node:22-bookworm-slim AS dependencias
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=dependencias /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_AGENT_NAME
# A chave de serviço abaixo é só um texto para o build passar (como no CI); não é usada nem guardada.
# O cache do build sai da imagem: em execução, .next/cache é uma pasta temporária.
RUN set -e; \
    test -n "$NEXT_PUBLIC_SUPABASE_URL" || { echo "Falta o build-arg NEXT_PUBLIC_SUPABASE_URL" >&2; exit 1; }; \
    test -n "$NEXT_PUBLIC_SUPABASE_ANON_KEY" || { echo "Falta o build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY" >&2; exit 1; }; \
    if [ -z "$NEXT_PUBLIC_AGENT_NAME" ]; then unset NEXT_PUBLIC_AGENT_NAME; fi; \
    SUPABASE_SERVICE_ROLE_KEY=apenas-para-o-build npm run build; \
    rm -rf .next/cache

FROM node:22-bookworm-slim AS execucao
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
# Endereço público padrão para os links de e-mail (resumo semanal), vindo da variável SITE_URL_PADRAO do
# GitHub. Vazio = sem padrão. PUBLIC_SITE_URL, definida no servidor, tem prioridade.
ARG SITE_URL_PADRAO=
ENV SITE_URL_PADRAO=$SITE_URL_PADRAO
COPY --from=build --chown=node:node /app/package.json /app/package-lock.json /app/next.config.ts ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/.next ./.next
USER node
EXPOSE 3000
CMD ["node_modules/.bin/next", "start", "-H", "0.0.0.0", "-p", "3000"]
