# The agent CMS security model — what it covers, and what it does not

**Dispatch 03, decision 2.** Written 2026-09-14. Read this before pointing anyone at the CMS,
and before adding a second user.

The short version: **the write path has a real server-side gate, and that gate is one shared
password for one person.** It is enough to keep the open internet out of Kimani's editor. It is
not enough to hand to twenty agents, and it produces no audit trail worth the name. Slice 6 is
where that changes.

---

## 1. What was already there, and why it is not authentication

The dashboard's sign-in (`ALLOWED` in `index.html`, mirrored in `assets/studio-header.js` and
`tools/carousel/cb_editorial.html`) compares a typed email against a hard-coded list **in the
browser** and stores the result in `localStorage.cb_auth`.

Anyone can set that value. It is four lines of devtools, and the list of valid emails is in
plain sight in the page source. `docs/design/README.md` already says this — "a UX affordance to
hide advanced tools from agents, not a security boundary" — and it is correct.

That is fine for what it does: it keeps a tool card off an agent's dashboard. It is **not** fine
in front of an endpoint that writes the public biography of a real person, so the CMS does not
rely on it. The client-side allowlist still gates the tool *card* on the dashboard, because
hiding the card is genuinely all it is for.

**The backend has never checked anything.** `site.mjs` will take a changelog entry from any POST
on the internet; `agents.mjs` will accept or delete a headshot from anyone. Those are pre-existing
and out of scope here, but they are the reason "the dashboard has sign-in" must not be heard as
"the backend is protected."

---

## 2. What the CMS actually does

### The write gate

`netlify/functions/agent-store.mjs` requires a shared secret on **every** request, read from the
`CB_CMS_TOKEN` environment variable on Netlify.

- Sent as `Authorization: Bearer <token>`.
- Compared **constant-time** (length check, then an XOR accumulate over the bytes) so the
  endpoint does not leak the token a character at a time through response timing.
- **If `CB_CMS_TOKEN` is unset, the function refuses every request with a 503** rather than
  falling open. An unconfigured deploy is a closed deploy, not a public one.
- Reads are gated too, not just writes. The records hold agents' direct phone numbers and email
  addresses; an unauthenticated roster read would be a contact-list scrape.

The token is typed by the human into the CMS and held in **`sessionStorage`** — it dies with the
tab, and it is never written into `localStorage`, never in the URL, never in the committed HTML.

### Payload validation, because the output becomes public HTML

The function does not trust its own front end. Every write is rebuilt field by field from a fixed
schema — unknown keys are dropped, not merged — and:

- **Slugs** must match `^[a-z0-9][a-z0-9-]{0,48}[a-z0-9]$`. This is a blob key *and* a directory
  name in the build; no dots, no slashes, no traversal.
- **Every string is length-capped** and control characters are stripped.
- **`<` and `>` are stripped from every text field.** No field in the schema is meant to carry
  markup — these are names, bios, addresses and prices rendered as text. See §5 for why this
  matters more than it looks.
- **URL fields accept only `http:`, `https:`, `mailto:` and `tel:`.** These land in `href`
  attributes on the public page; `javascript:` in an Instagram field is a realistic injection and
  this closes it.
- Arrays are length-capped (deals, testimonials, team members, neighborhoods, specialties).
- CORS is restricted to `ALLOWED_ORIGIN` when it is set. **This is not a security control** —
  anything that is not a browser ignores CORS entirely. The token is the control. CORS only stops
  a *logged-in browser* on another origin from riding along, and there is no cookie to ride.

### Preview links

Publishing is gated; showing someone a draft is not. Each agent record carries a
**`previewToken`** — 32 random hex characters, generated per agent, rotatable from the CMS, with
no relationship to `CB_CMS_TOKEN`.

`GET ?slug=<slug>&preview=<previewToken>` returns **that one agent's** record and nothing else:
no other agent, no roster, no write of any kind. The link goes in the URL *fragment*
(`#/preview/<slug>?t=…`), which browsers do not send to servers and which therefore stays out of
access logs and `Referer` headers.

So a preview link is: read-only, scoped to one agent, revocable by rotating it, and safe to text
to the agent whose page it is. That is the one piece of this slice that is genuinely
multi-tenant-shaped.

### AI autofill

`netlify/functions/agent-copy.mjs` takes the same token. It accepts a **fixed set of four tasks**
(`bio`, `seo`, `specialties`, `testimonial`) with server-side system prompts, a server-pinned
model, and a server-pinned token ceiling. The caller supplies content, never instructions.

This is deliberately *not* the `claude.mjs` shape. See §3.

---

## 3. A pre-existing finding, on the record

**`netlify/functions/claude.mjs` is an unauthenticated open proxy to the Anthropic Messages
API.** It takes any POST body and forwards it verbatim with the site's `ANTHROPIC_API_KEY`:

```js
const body = await req.json();
const upstream = await fetch('https://api.anthropic.com/v1/messages', { … body: JSON.stringify(body) });
```

No token, no origin check, no model allowlist, no size cap, `Access-Control-Allow-Origin: *`.
Anyone who knows the URL — and it is in the page source of four shipped tools — can run arbitrary
prompts on any model against Casa Blanca's API budget, for as long as they like.

**This is live today and it predates this slice.** It is not fixed here because four production
tools (`closed-carousel`, `forsale-carousel`, `incontract-carousel`, `carousel/cb_editorial`)
call it with no credential, and fixing it means touching all four — a change that deserves its own
pass and its own verification, not a drive-by inside a CMS slice.

What this slice did instead: **did not make it worse.** The CMS routes its AI through its own
constrained, token-gated function rather than widening the open proxy's traffic.

**Recommended follow-up, roughly in order of effort:** cap `max_tokens` and allowlist models in
`claude.mjs` (cheap, no front-end change, cuts the worst of the abuse); set `ALLOWED_ORIGIN`;
then give the tools a shared low-privilege token. Worth its own dispatch.

---

## 4. What this does not cover — read this list before adding a user

| Gap | What it means in practice |
|---|---|
| **No identity.** | The token says *someone authorised*, never *who*. The `updatedBy` field is whatever the browser's `cb_auth` says, is trivially forged, and is a convenience label — **not an audit trail.** Treat it as such in any conversation about who changed a bio. |
| **No per-agent scoping of writes.** | Whoever holds the token can edit, publish, suspend or archive **every** agent. The CMS is single-tenant by design; per-agent auth is Slice 6 and is explicitly not built on spec. |
| **Revocation is all-or-nothing.** | One person leaves, everyone re-learns a new token. At one user this is free. At five it is the thing that will go wrong. |
| **XSS on the tool page would take the token.** | `sessionStorage` is readable by any script on the origin. The CMS loads no third-party scripts and builds its DOM through `textContent` and `createElement` rather than `innerHTML` for anything data-derived, which is the mitigation — but it is a mitigation, not a boundary. |
| **The token will end up in a password manager, and possibly in a chat log.** | It is a human-typed shared password. Plan for it leaking, which mostly means: make rotating it cheap, and do not give it powers beyond writing agent records. This is also the single strongest argument against the git-commit storage option — see `storage-decision.md` §Option B. |
| **No rate limiting.** | Netlify does not rate-limit this path. A leaked token is unlimited writes *and* unlimited Haiku spend until it is rotated. |
| **No protection against a legitimate mistake.** | Publishing the wrong text to the right agent passes every check here. The preview step is the control for that, and it is a human one. |
| **Rollback is one step deep.** | Per `storage-decision.md`: the `live` snapshot survives draft edits, so unpublished mistakes are recoverable. A bad *publish* overwrites it. |

---

## 5. The cross-slice dependency that actually matters

`agents/build.js` **does not HTML-escape interpolated values** today. It is listed as the one
outright bug in Dispatch 02 §2 and in `agent-site-template.md` §4.

Until that is fixed, the CMS is a path from a text box to unescaped HTML on a public page. The
stripping in §2 is why that path is closed in practice — the store will not persist `<` or `>` in
a text field — but **it is a second line of defence standing in for the first one.**

> **Do not enable publishing against a build that does not escape.** Either Dispatch 02 lands its
> escaping fix first, or the export/build step gets escaping of its own. This is the single
> ordering constraint between 02 and 03.

---

## 6. The honest verdict

**Safe enough for:** one person (Kimani), on a URL that is not advertised, with the token in a
password manager, writing content that a human previews before it goes live.

**Not safe enough for:** agents editing their own pages; more than two or three token holders;
any situation where "who changed this?" has to be answerable; anything where the token can't be
rotated the same day it leaks.

**To get from here to agent-facing (Slice 6) you need**, at minimum:

1. **Real identity** — per-user sessions. Netlify Identity, an OIDC provider, or signed magic
   links. Anything that makes "who" a server-verified fact rather than a browser claim.
2. **Per-agent authorisation** — a claim in the session that names the slugs a user may write,
   checked in the function on every request, not in the front end.
3. **A real audit log** — append-only, server-written, `{ who, slug, field, before, after, when }`.
4. **Rate limiting** on writes and hard caps on AI spend per user.
5. **The escaping fix in `build.js`**, non-negotiable, before any of the above.
6. **`claude.mjs` closed**, or the agent-facing tools moved off it.

Items 5 and 6 are worth doing whether or not Slice 6 ever happens.
