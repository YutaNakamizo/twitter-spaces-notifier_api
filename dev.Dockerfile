FROM node:16.17.0-alpine3.16
RUN apk add --no-cache tini
ENTRYPOINT [ "/sbin/tini", "--" ]

ENV NODE_ENV development
VOLUME [ "/opt/app" ]
WORKDIR /opt/app

ENV PORT="80"
ENV GOOGLE_APPLICATION_CREDENTIALS="/secrets/google-service-account.json"
ENV NOTIF_TARGETS=""
ENV ALLOW_ORIGIN=""

USER node
CMD [ "node", "./src/index.js" ]

