FROM node:12-alpine

WORKDIR /usr/src/app

COPY yarn.lock ./
COPY package.json ./
COPY client/package.json ./client/
COPY client/yarn.lock ./client/
COPY server/package.json ./server/
COPY server/yarn.lock ./server/

RUN yarn

COPY . .

EXPOSE 3000
CMD [ "yarn", "start" ]