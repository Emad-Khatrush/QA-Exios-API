FROM node:16.13.1-alpine

# COPY . /app

# WORKDIR /app

# CMD npm start



COPY package.json ./

RUN npm install --only=production

RUN npm start

USER node

CMD node app.js

EXPOSE 8000