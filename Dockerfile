FROM node:18-alpine

# Create app directory
WORKDIR /usr/src/app

COPY . .

RUN yarn install --frozen-lockfile

WORKDIR /usr/src/app/src/verification-api


RUN yarn install --frozen-lockfile


WORKDIR /usr/src/app/src/scanner-api

RUN yarn install --frozen-lockfile


CMD [ "node", "./index.js" ]

EXPOSE 1212

