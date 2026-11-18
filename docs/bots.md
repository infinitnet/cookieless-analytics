# Bots

Wiki: [Bot Handling](https://github.com/infinitnet/cookieless-analytics/wiki/Bot-Handling).

Bots are excluded, never reported. The plugin keeps them out of every human number and out of every response it controls. It has no bot report, no bot log and no bot dashboard, and it does not verify who a bot really is.

The rule in one sentence: a bot never gets a stored row of any kind, error pages included, and never receives anything from the plugin except an empty 204.

## The user agent classifier

The classifier reads the user agent string and nothing else. It lowercases it, cuts it to 512 characters and caches up to 2,000 results per isolate. The answer is `human` or `bot`; there is no "uncertain" band. It checks, in this order:

1. A user agent shorter than 10 characters (including an empty one) is a bot.
2. Your own rules of kind `contains`, `prefix` and `exact`.
3. In-app browsers of social apps (Facebook, Instagram, LinkedIn and Line) are human.
4. The built-in list of known bots (below).
5. Your own `regex` rules.
6. A bounded generic fallback: bot-like words (`bot`, `spider`, `scraper`, `fetch`, `monitor`, `check`, `probe`) when not followed by a letter, so a phone brand such as `cubot` is not caught.
7. Everything else is human.

The default HTTP clients (`python-requests`, `curl`, `wget`, `go-http-client`, `okhttp`, `axios`, `undici`, `scrapy`) and `HeadlessChrome` are in the built-in list.

Every known bot has a category (search engine, AI training, AI search, AI assistant, SEO tool, social preview, monitoring, feed reader, security scanner, headless automation, generic scraper, archiver, ads verification or unknown). The category only labels the match; nothing reports on it.

### Your own rules

Definitions, tab User agent rules (shown with this install selected: the rules are one set for every site, because the classifier answers before it knows the site). A rule has a pattern, a mode (`contains`, `prefix`, `exact` or `regex`) and an action: mark the match as a bot, or force it to human. Use it to exclude an uptime monitor of your own, or to let a tool through.

Caps: at most 500 rules in total, of them at most 50 `regex` rules; a pattern holds up to 512 characters. Every rule up to the cap applies; a save that would pass a cap is refused with a message. Regex rules follow the safe regex limits in [filters.md](filters.md#safe-regex-limits).

**What the order means for overrides.** Your `contains`, `prefix` and `exact` rules run before the built-in list, so they override it in both directions. Your `regex` rules run after the built-in list, so a regex can add a bot the list misses but never undo a built-in match. When two of your rules match the same user agent, the one listed first wins; the list and the text show the rules in that order (oldest first, new rules of a save after them in the order of the text). Check warns on a new line above a kept rule, because the save stores it after the kept rules. A single rule in the List view is trimmed and refused when its pattern holds a space, # and a space (the text view reads that as a comment) or repeats the mode and pattern of another rule, so the text view can carry every stored rule.

- **A false positive** (a real visitor or a tool you want counted is taken for a bot): add a `human` rule with mode `contains`, `prefix` or `exact` for that user agent.
- **A missing bot**: add a `bot` rule. Prefer `contains` or `prefix`; a `regex` works too, after the built-in list.

The built-in list is generated data and is never edited in place, so an update of the list cannot undo your fixes: your rules override it.

**Edit as text.** The tab has two views, List (one rule at a time, with a form) and Edit as text: one rule per line, in the form `action mode pattern`, with an optional comment.

```text
# action mode pattern # optional comment
bot contains examplemonitor # Uptime monitor
bot prefix examplefetcher/
human contains exampleapp # Our own app
bot regex ^examplebot/\d+$
```

- `action` is `bot` or `human`; `mode` is `contains`, `prefix`, `exact` or `regex`; the pattern is the rest of the line, trimmed, spaces inside kept. `contains`, `prefix` and `exact` compare in lowercase; a `regex` runs case-insensitive.
- Text after ` # ` (a space, `#`, a space) is the rule name, up to 64 characters. Blank lines and lines that start with `#` are ignored. A pattern cannot contain ` # ` in this form, and cannot start or end with a space; use the List view for such a rule.
- The box shows the current rules. **Check** validates every line in the browser and then on the server with the validator of the single-rule form (pattern length, safe regex limits, the caps, the same mode and pattern twice), and lists each problem with its line number; a click on a message selects the line. A `bot` rule that matches a current browser user agent is a warning, not an error (the generator of the built-in list refuses such rules). With no error, Check shows the changes: how many rules are added, changed, removed and unchanged, with the lists.
- **Save** is open only after a Check without errors of exactly the text in the box. It replaces the whole rule set: every line is validated first, and an invalid set changes nothing. Only added, changed and removed rows are written, at most 30 per request so a request stays inside the Free plan's 50 queries per invocation; the page repeats the save until none remain and shows the progress. The save is not one transaction: if it stops part-way, the stored set holds the rows written so far, and saving the same text again writes the rest. Every save, one that writes nothing included, also refreshes the copy of the rule set that error page logging reads. A kept bot rule keeps the category set in the List view, which the text does not carry.
- **Export**: Copy puts the text on the clipboard, Download .txt saves it as `user-agent-rules.txt`. **Import**: paste into the box or Load a file; nothing is saved until you check and save. An exported text imported again gives the same rules.

**Built-in list.** Below the tester, a read-only table of the built-in list: name, pattern, category and source (curated, ai.robots.txt or crawler-user-agents), with a search over name, operator and pattern, a category filter and pages of 50. **Force human** adds a `human` rule for the entry to the text (a `contains` rule, or a `prefix` rule for an entry anchored at the start), so it shows in the changes before you save. An entry that is a real pattern rather than a word has no button: test a user agent of it and add a rule for that user agent. A row you already have a rule for shows "Your rule".

The tester under the rules answers for one user agent, with the rule that matched (yours or a built-in one).

Saving through either view takes effect at once on the isolate that saved, and within a minute on the others (the rules are cached for 60 seconds per isolate). The ingest routes and the middleware use the same set: every save also copies it to one plugin option the middleware reads.

The rules are managed in the admin only, with the `plugins:manage` permission. The agent API has no routes for them.

**Cost.** Your `exact` rules sit in a hash map, your `prefix` rules are looked up by length and your `contains` rules run in one loop that stops at the first hit; results are cached per user agent. Measured on a development machine (local only, not on Workers): a classification that misses the cache takes about 45 microseconds with no rules of yours and about 50 with 500 (450 plain, 50 regex), of a Free plan budget of 10 ms CPU per request.

## Data sources

The built-in list is `src/data/agents.json`. It is generated by `scripts/build-agent-data.mjs` (`pnpm data:agents`) from three inputs:

- `src/data/agents.curated.json`: bots with vendor documentation (the Google, Bing, Apple, DuckDuckGo, Yandex and Baidu search bots, the AI vendors' bots, social preview fetchers, SEO tools, monitors, feed readers), each with a category and a link to the vendor's page.
- `ai.robots.txt`, the MIT licensed list of AI bots, published as a repository of the same name.
- `crawler-user-agents`, the MIT licensed list of the same name.

At version 1.0.0 the list holds 1,552 records: 149 curated, 158 from `ai.robots.txt` and 1,245 from `crawler-user-agents`.

The script skips a record that an earlier source already covers, any pattern the safe regex validator rejects, and any rule that matches a set of current browser user agents. It reads cached copies of the sources (`.cache/agent-data`) unless run with `--refresh`, and the same inputs always give the same output. The device detection data of Matomo is never copied, because its license (LGPL) does not fit. The license texts are in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).

## Where a bot is stopped

| Place | What happens |
|---|---|
| Event route (`POST /_/e`) | The user agent is classified first. A bot gets 204 before the body is parsed. Nothing of it is stored; it only raises the `bot` drop counter of the day, so the privacy receipt can show how many were excluded. |
| Session read route | A bot gets 204 with no body ([integration.md](integration.md)). |
| Error page logging | The middleware classifies the user agent, your rules included, before it writes a row. A bot's 404 is never recorded. |
| Request locals | The middleware sets `locals.__ec = { audience, botId }` so later middleware can tell a known bot. It is best effort ([integration.md](integration.md)). |

## Client bail-outs

The page script has its own, smaller checks. If any of them applies, the script does nothing at all: it sends nothing and adds no listener. A privacy signal or the visitor's opt-out flag only stops sending.

- `navigator.webdriver` is `true`.
- The user agent matches a short bot pattern (words such as `bot`, `spider`, `headless`, `lighthouse`, `puppeteer`, `playwright`, `preview`, `python`, `curl` and `wget`).
- `navigator.languages` is empty.
- A desktop Chromium browser reports no plugins (`navigator.plugins.length === 0`).
- The page is being prerendered. The script waits until the page is shown.
- A privacy signal applies ([privacy.md](privacy.md)).

These checks catch headless browsers that run scripts. The server still classifies the user agent on every event, so a script that is run by a bot with a bot user agent is dropped there too.

## Byte-identical HTML

With the plugin installed, a page differs from the same page without it by exactly one tag, added to `<head>` by the `page:fragments` hook and identical for every request and every user agent:

```html
<script defer src="/_/e.js"></script>
```

The plugin adds no links, no URL fragments, no query parameters, no `rel`, canonical or meta tags, no `Link` headers and no extra elements. The middleware never reads, buffers or rewrites a page response; it returns the same response object that Astro produced. With `scriptDelivery` set to `inline` the tag becomes one inline script with the same code, still identical for everyone. A search engine therefore sees the same page as a visitor.

## `scriptForBots`

The setting `scriptForBots` decides whether the script tag is added for known bots.

- `always` (default): the tag is in the HTML for every user agent. The client bail-outs and the server classifier keep bots out.
- `skip_known_bots`: the tag is left out when the user agent is a known bot.

Caveat: the output of `page:fragments` lands in the route cache, which is keyed without the user agent, and EmDash does not send `Vary: User-Agent`. A page that a bot caused to be cached without the tag would then be served to humans without the script, and they would not be counted. Enable `skip_known_bots` only with route caching off. The default gives identical HTML to everyone.

## Limits of this method

- The classifier sees only the user agent. A bot that sends an ordinary browser user agent, runs scripts and passes every bail-out is counted as human. The plugin does not verify IP ranges or reverse DNS. Such visits can be removed afterwards with Delete matching visits on the Data page ([privacy.md](privacy.md#deleting-data)), and kept out from then on with a user agent rule or an excluded IP range.
- A person who follows a link from an AI assistant arrives with an ordinary browser and is counted as human traffic (channel AI Assistants). The assistant's own fetcher is a bot and is excluded.
- Cloudflare's Bot Management fields exist only on the Enterprise plan. The plugin never reads them. It reads the user agent, request headers and the `asn`, `country`, `colo` and `region` fields of `request.cf`, which every plan has.
- A page can be served from Cloudflare's cache without starting the Worker, so the server sees a bot only when the request reaches the Worker. This does not change any count, because bots are never counted.

## Related

[privacy.md](privacy.md), [install.md](install.md), [filters.md](filters.md), [integration.md](integration.md).
