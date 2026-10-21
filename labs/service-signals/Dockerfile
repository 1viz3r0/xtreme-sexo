FROM python:3.12-alpine
WORKDIR /app
COPY server.py config.json ./
RUN addgroup -S netoze && adduser -S -G netoze -u 10001 netoze
USER 10001:10001
ENV BIND_HOST=0.0.0.0 HTTP_PORT=8000 PYTHONDONTWRITEBYTECODE=1
EXPOSE 8000
HEALTHCHECK --interval=5s --timeout=2s --retries=10 CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=1)"
CMD ["python", "-I", "server.py"]
