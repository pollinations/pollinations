FROM node:14
RUN ["mkdir","app"]
ADD ./app /app
WORKDIR /app
RUN ["npm","i"]
CMD ["node","dist/social-post.js"]