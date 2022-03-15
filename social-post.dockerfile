FROM node:16
RUN ["mkdir","app"]
ADD ./app /app
WORKDIR /app
CMD ["node","dist/social-post.js"]