# First Contact — Easy CTF

This is a small, read-only beginner room. Start at the home page, follow the clue, and submit the training value to `/verify?flag=...`. It runs only inside the NET0ZE local Docker target and is not a host shell or scanner.

Beginner path:

```text
GET / → GET /clue → GET /welcome.txt → submit the value to /verify
```

The native runtime injects a fresh flag for every run. The target validates submissions server-side and never exposes the Docker configuration route.
