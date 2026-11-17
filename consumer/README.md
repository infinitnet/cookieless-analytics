# Queue consumer Worker

By default the plugin writes every page view, event and engagement update straight to the site's D1 database. The queue tier is optional: the site sends each of them to a Cloudflare Queue instead, and this small Worker writes them to the same database in batches of up to 100, with the same statements, so the stored data is identical.

What it changes, measured on a production Worker (see `docs/limits.md`):

- A queue send takes 30 to 67 ms (median 42 ms), a direct write about 25 ms. A single request is not faster with the queue.
- What the queue adds: requests keep being answered while the database is overloaded or busy, and bursts wait in the queue (up to its retention) instead of being refused with a retry.
- Reports lag behind by the queue backlog, normally a few seconds.

Requirements: a Workers Paid plan is recommended. The Free plan allows 10,000 queue operations per day and each message costs 3 (write, read, delete), so about 3,300 messages a day, roughly 1,200 page views (published limits; not measured).

## Install

1. Create the queue and its dead letter queue:

   ```sh
   npx wrangler queues create ca-ingest
   npx wrangler queues create ca-ingest-dlq
   ```

2. Add the producer binding to the site's wrangler config and deploy the site. The binding must be named `CA_QUEUE`:

   ```jsonc
   "queues": { "producers": [{ "binding": "CA_QUEUE", "queue": "ca-ingest" }] }
   ```

3. Deploy this Worker. Copy this folder (`consumer/` of the plugin's repository) to a new directory, then in `wrangler.jsonc` replace `YOUR_DATABASE_NAME` and `YOUR_DATABASE_ID` with the `database_name` and `database_id` of the site's D1 database (from the site's own wrangler config). Keep `@infinitnet/cookieless-analytics` in `package.json` at the version the site uses. Then:

   ```sh
   npm install
   npx wrangler deploy
   ```

   With the plugin option `database` (analytics in a database of their own, see `docs/install.md`), add that database to `d1_databases` here too, under the same binding name, and pass the option in `index.js`: `handleQueue(batch, env, { database: { binding: "CA_DB" } })`. The consumer then writes only there; if that binding is missing it retries every message and writes nothing to `DB`. With the option `databases` (each site in its own database), add every binding it names and pass the same option: `handleQueue(batch, env, { databases: { default: "CA_DB", sites: { shop: "CA_DB2" } } })`. Each message goes to its site's database; when one binding is missing, only that site's messages are retried.

4. In the admin, open the plugin settings and set **Ingest tier** to **Queue**. The Data page then shows "Ingest: queue tier". Without the binding the setting has no effect and the Data page still shows "direct to the database".

## Updating

Messages carry the plugin's own format. After every plugin update, set this Worker's `@infinitnet/cookieless-analytics` version to the same version and run `npx wrangler deploy` here as well.

## Turning it off

Set **Ingest tier** back to **Direct**. Leave this Worker running until the queue is empty (the queue's backlog in the Cloudflare dashboard reads 0), then delete it, the two queues and the producer binding.

## Behaviour

- Delivery is at least once. Every statement is keyed by the page view or event id, so a message applied twice changes nothing; an engagement update only raises stored values. One exception: a reload that was not counted (same path within the reload dedupe time) can be counted when it is delivered again after a later page view of its visit. Drop reasons are counted on the first delivery only.
- Within a batch, messages are applied in event time order, grouped per visitor, so the messages of one visit keep their order inside a batch. Queues do not promise order across batches; `max_concurrency: 1` keeps one batch at a time. A replay changes nothing and an early engagement update is retried, but a page view that arrives after a later page view of its visit (possible after a retry) is applied in arrival order: counts stay exact, while that visit's entry page, start time and duration can differ from what the direct path would store.
- An engagement update that arrives before its page view is retried after 30 seconds, up to 3 attempts in total, then counted as `orphan_update` like on the direct path.
- When a write fails, the message and the later messages of the same visitor are retried after 30 seconds, then with a doubling delay of at most 10 minutes; the 21 deliveries cover a database outage of about 2.5 hours. After that a message moves to `ca-ingest-dlq`, where it stays for the queue's retention period and is not written. To apply those messages, add `ca-ingest-dlq` as a second consumer queue of this Worker (applying a message twice changes nothing).
- If a send to the queue fails, the site writes that event directly to the database. A message that is accepted by the queue is written by this Worker, or kept in the dead letter queue as described above.
- Error pages (status 400 and above) are always written directly: they are counters, and a redelivered message would count twice.

## Privacy

A message holds the facts the visit row is built from: the site, visit and page ids, the page path with only the query parameters that are stored or used for the source (the allowlist, campaign and click id parameters), the referrer's host and path, country, region, language, device, browser and operating system, the daily visitor keys (salted hashes) and the session settings. It holds no IP address, no user agent string, no cookie and no plugin secret. Messages wait in the queue until written (normally seconds, at most the queue's retention period); the plugin's delete tools cannot reach messages that are still queued.
