#
# ---- Base Node ----
FROM node:20-alpine AS base
# set working directory
WORKDIR /usr/src/app

# copy project file
COPY package*.json ./
EXPOSE 8000
# copy app sources
COPY . .

#
# ---- Dependencies ----
FROM base AS dependencies
RUN apk add --no-cache make gcc g++ python3 py3-setuptools linux-headers udev git eudev-dev libusb-dev pkgconf \
    && ln -sf /usr/bin/python3 /usr/bin/python
RUN git config --global url."https://github.com".insteadOf "ssh://git@github.com"
# webpack 2 requires OpenSSL legacy provider on Node 17+
# --no-deprecation suppresses url.parse() warnings from webpack-dev-server 2.x
ENV NODE_OPTIONS="--openssl-legacy-provider --no-deprecation"
# install node packages
RUN npm set progress=false && npm config set depth 0
# Force native addons to build from source (avoids prebuild-install's node_gyp_bins
# ENOTEMPTY race condition with node-hid on Alpine/musl arm64)
ENV npm_config_build_from_source=true
RUN npm ci

#
# ---- Test ----
# run linters, setup and tests
FROM dependencies AS test
#RUN  npm run lint && npm run setup && npm run test
RUN  npm run test

#
# ---- Dev ----
FROM dependencies AS dev
RUN npm install && npm install -g nodemon
# copy production node_modules
COPY --from=dependencies /usr/src/app/node_modules node_modules
# define CMD
CMD [ "npm", "run", "start-server" ]
