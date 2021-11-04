FROM node:14
RUN ["mkdir","app"]
ADD ./app /app
CMD ["node","--version"]