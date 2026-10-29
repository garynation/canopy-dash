FROM public.ecr.aws/docker/library/python:3.12-alpine

WORKDIR /app

COPY server.py index.html styles.css audio.js sprites.js game.js /app/

RUN mkdir -p /app/data

ENV PORT=80
ENV CANOPY_DASH_DATA_DIR=/app/data

EXPOSE 80

CMD ["python3", "/app/server.py", "--port", "80"]
