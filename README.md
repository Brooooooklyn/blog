# Deploy
- `npm i -g sneaky`
- `yarn install`
- `mkdir config`
- `touch default.json`
- Write config:
```json
  {
    "remote": {
      "USER": "REMOTE user name",
      "PORT": "REMOTE ssh port",
      "HOST": "REMOTE VPS HOST"
    }
  }
```

- `sneaky d release`
