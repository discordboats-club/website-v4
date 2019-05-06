
FROM node:11

WORKDIR /usr/src/app

COPY . .
RUN "git am < 0001-put-jwt-keys-in-folder.patch"
RUN yarn

EXPOSE 3000
CMD [ "yarn", "start" ]