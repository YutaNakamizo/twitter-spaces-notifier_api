FROM node:16.17.0-alpine3.16
RUN apk add --no-cache tini
ENTRYPOINT [ "/sbin/tini", "--" ]

ENV NODE_ENV production
WORKDIR /opt/app

COPY --chown=node:node ./package.json ./package-lock.json .
RUN npm ci

COPY --chown=node:node . .

ENV PORT="80"
ENV GOOGLE_APPLICATION_CREDENTIALS="/secrets/google-service-account.json"
ENV MONGO_URI="mongodb://localhost:27017/"
ENV MONGO_DATABASE="twspaces-notifier"
ENV NOTIF_TARGETS=""
ENV ALLOW_ORIGIN=""

USER node
CMD [ "node", "./src/index.js" ]

