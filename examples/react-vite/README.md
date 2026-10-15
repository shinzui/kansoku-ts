# Kansoku react example

This workspace consumes the packages through their published export maps and built `dist/`
files. Run `just build` first; no alias points at SDK source.

Start a development server using `mori://shinzui/kansoku` and its
`docs/guides/getting-started.md` (artifact-level URI pending): enter that checkout's Nix
shell, run `just up` in one terminal, then `just migrate`, `just ch-migrate`,
`just issue-key write dev "browser example"`, and `just run` in another. Keep the printed
public write key; service tokens must stay out of Vite environment variables. The default
server port is 8080; choose another if it is occupied. CORS permits browser origins unless
an operator allowlist restricts them.

Copy `.env.example` to `.env.local`, set the base URL and write key, then from the SDK root:

```bash
just dev-react
```

Navigate the example routes, perform the actions, then click Flush. The vanilla example
shows delivery stats. The React example uses development StrictMode and React Router;
sign in on Account, and visit Pricing to toggle experiment variants. It uses automatic
page views and no explicit page-view hook.

With a server-side service token for the same account, query `/metrics/page-views` with
`from` and `to` UTC dates and `groupBy=route`, or `/metrics/events` with
`groupBy=event_name`. The writer updates metrics asynchronously. Counts accumulate within
an account, so use a fresh account if exact counts matter. Never run destructive server
reset recipes to test this example.
