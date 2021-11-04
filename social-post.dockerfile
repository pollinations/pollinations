FROM node:14
RUN ["mkdir","app"]
ADD ./app /app
WORKDIR /app
CMD ["node","dist/social-post.js"]