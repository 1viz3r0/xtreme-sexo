FROM python:3.13-alpine@sha256:2d9aefe2fef018a7eb2c13064c89c71929800fd2e5dccdbf52ea5da5bb8d929a
WORKDIR /opt/header-trail
COPY server.py config.json ./
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 BIND_HOST=0.0.0.0
USER 10001:10001
EXPOSE 8000 9000
HEALTHCHECK --interval=10s --timeout=2s --start-period=2s --retries=3 CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=1)"
CMD ["python", "-I", "server.py"]
