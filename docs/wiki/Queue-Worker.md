# Queue Worker

The queue tier sends page views, events and engagement updates to a Cloudflare Queue, and a small consumer Worker writes them to the database in batches. Use it when the database is overloaded at peaks: requests keep being answered and bursts wait in the queue instead of being refused.

By default every write goes straight to the database (`ingestTier` `direct`). The queue tier is optional and, in practice, for Workers Paid.

## How to use it

1. Create the queue and its dead letter queue:

   ```sh
   npx wrangler queues create ca-ingest
   npx wrangler queues create ca-ingest-dlq
   ```

2. Add the producer binding to the site's wrangler config and deploy the site. The binding must be named `CA_QUEUE` (the constant `QUEUE_BINDING` in the code):

   ```jsonc
   "queues": { "producers": [{ "binding": "CA_QUEUE", "queue": "ca-ingest" }] }
   ```

3. Deploy the consumer Worker. Copy the `consumer/` folder of the plugin's repository (it is not in the npm package) to a new directory. In its `wrangler.jsonc`, replace `YOUR_DATABASE_NAME` and `YOUR_DATABASE_ID` with the values of the site's D1 database. Keep `@infinitnet/cookieless-analytics` in its `package.json` at the version the site uses. Then:

   ```sh
   npm install
   npx wrangler deploy
   ```

4. In the admin, open Settings, section Data and capacity, and set **Ingest tier** to **Queue**. The Data page, tab Storage and retention, then shows "Queue tier, written by the consumer Worker."

### The consumer

The consumer imports `handleQueue` from the package's `./queue` export:

```js
// consumer/index.js
import { handleQueue } from "@infinitnet/cookieless-analytics/queue";

export default {
  async queue(batch, env) {
    await handleQueue(batch, env);
  },
};
```

Its `wrangler.jsonc` binds the site's database as `DB` and consumes `ca-ingest`:

```jsonc
{
  "name": "analytics-queue-consumer",
  "main": "index.js",
  "compatibility_date": "2026-11-01",
  "d1_databases": [
    { "binding": "DB", "database_name": "YOUR_DATABASE_NAME", "database_id": "YOUR_DATABASE_ID" }
  ],
  "queues": {
    "consumers": [
      {
        "queue": "ca-ingest",
        "max_batch_size": 100,
        "max_batch_timeout": 2,
        "max_concurrency": 1,
        "max_retries": 20,
        "retry_delay": 30,
        "dead_letter_queue": "ca-ingest-dlq"
      }
    ]
  }
}
```

### With an own analytics database

With the plugin option `database`, add that database to the consumer's `d1_databases` under the same binding name and pass the same option:

```js
await handleQueue(batch, env, { database: { binding: "CA_DB" } });
```

With `databases`, add every binding it names and pass the same option:

```js
await handleQueue(batch, env, { databases: { default: "CA_DB", sites: { shop: "CA_DB2" } } });
```

Each message then goes to its site's database. When one binding is missing, only that site's messages are retried.

### Turning it off

Set **Ingest tier** back to **Direct**. Leave the consumer running until the queue's backlog in the Cloudflare dashboard reads 0, then delete the consumer, both queues and the producer binding.

## When to use it

- The Data page lists `overload` drops on the direct tier (it suggests the queue tier then).
- Your traffic comes in bursts that the database refuses for longer than the page script's retries cover (about a minute).

It does not make a single request faster: a queue send takes 30 to 67 ms, a direct write about 25 to 29 ms.

## What happens without it

Each page view or event is written before the event route answers. A write the database refuses is answered 503 with `Retry-After`, and the page script sends it again up to 3 times (after 5 to 7.5 s, 15 to 22.5 s and 45 to 67.5 s), only while the page stays open. Longer overloads lose events, and they are counted on the Data page.

## Settings

| Key | Default | What it does |
|---|---|---|
| `ingestTier` | `direct` | `direct` writes to the database. `queue` sends to the queue; used only while the `CA_QUEUE` binding exists. |

## Limits

- Batches of up to 100 messages, or what arrived within 2 seconds, one batch at a time.
- A failed write is retried after 30 seconds, then with a doubling delay of at most 10 minutes. The 21 deliveries cover a database outage of about 2.5 hours; after that a message moves to `ca-ingest-dlq` and is not written.
- An engagement update that arrives before its page view is retried after 30 seconds, up to 3 attempts in total, then counted as `orphan_update`.
- Published Cloudflare limits (not measured): intake up to 5,000 messages per second per queue, a backlog of up to 25 GB.
- Each message costs 3 queue operations, about 8 per page view with the usual mix. On the Free plan, 10,000 operations per day allow about 1,200 page views a day.
- A queued message that is applied after 00:15 (site time) of the day after its own day is not written and is counted as `late_after_close`, because that day's summary may already be stored.

## Gotchas

- After every plugin update, set the consumer's `@infinitnet/cookieless-analytics` version to the same version and deploy it again. Messages carry the plugin's own format.
- A failed send to the queue is written directly. Error pages are always written directly.
- Without the binding the setting has no effect, and the Data page still shows "Direct to the database."
- Reports lag behind by the backlog, normally a few seconds.
- Delivery is at least once. Every statement is keyed by the page view or event id, so a redelivery changes nothing.
- Queued messages cannot be reached by the delete tools until the consumer has written them.
- A message holds no IP address, no user agent string and no cookie.
- To apply messages from the dead letter queue, add `ca-ingest-dlq` as a second consumer queue of the Worker. Applying a message twice changes nothing.

## Related

[Quick-Install](Quick-Install), [Capacity-Profiles-and-Cloudflare-Plans](Capacity-Profiles-and-Cloudflare-Plans), [Data-Page](Data-Page), [Privacy-Model](Privacy-Model), [Troubleshooting](Troubleshooting), [Upgrade](Upgrade).

Full reference: https://github.com/infinitnet/cookieless-analytics/blob/main/docs/limits.md
