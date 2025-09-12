FROM --platform=linux/amd64 node:22-alpine AS build

# ビルド
WORKDIR /app

ENV TINI_VERSION v0.19.0
ADD https://github.com/krallin/tini/releases/download/${TINI_VERSION}/tini-static /tini
RUN chmod +x /tini

COPY . .
RUN npm ci
RUN npm run build

# 本番環境
FROM --platform=linux/amd64 gcr.io/distroless/nodejs22-debian12
WORKDIR /app
ENV NODE_ENV=production

# 注意: 実行時の環境変数はAppRunnerサービスから注入されます

# 必要なファイルのみをコピー
COPY --from=build --chown=nonroot:nonroot /tini /tini
COPY --from=build /app/build ./build
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules

# アプリケーションの起動
USER nonroot
EXPOSE 3000
ENTRYPOINT [ "/tini", "--", "/nodejs/bin/node" ]
CMD ["./node_modules/.bin/remix-serve", "/app/build/server/index.js"]