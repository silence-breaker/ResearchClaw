# ResearchClaw OpenClaw Plugin

Local OpenClaw plugin that registers the `/researchclaw` runtime slash command.

## Usage

```bash
openclaw plugins install --link /home/wj/openclaw/researchclaw/openclaw-plugin
openclaw plugins enable researchclaw
```

Start the ResearchClaw service before invoking the command:

```bash
npm run dev
```

In OpenClaw chat:

```text
/researchclaw
/researchclaw Study lightweight reranking for domain-specific vision-language retrieval.
/researchclaw status
```

The command defaults to `http://127.0.0.1:8787`. For remote SSH browser access, set `RESEARCHCLAW_PUBLIC_URL` or configure `plugins.entries.researchclaw.publicUrl` to the browser-facing forwarded URL.
