Cookieless Analytics Companion requests no permissions. Its trust contract declares no capabilities, no allowed hosts and no storage collections.

## What it does not do

- It adds nothing to public pages: no script, no tag and no metadata.
- It makes no network request and calls no outside service.
- It stores no secret and asks for no API key.
- It sends no telemetry.

## What it stores

One record in the plugin's own key value store: your setup answers, the steps you marked as done, and the version number the full plugin reported. Uninstall with Also delete plugin storage data removes it.

## Who can use it

The setup page needs the permission to manage plugins. The route that receives the confirmation from the full plugin is private: it needs a signed-in user who may read plugins and the EmDash request header. It accepts only a small body with two version numbers, and a forged body changes only what the companion displays.

## Reporting a vulnerability

Report security problems through private vulnerability reporting: https://github.com/infinitnet/cookieless-analytics/security/advisories/new

The source is in the public repository: https://github.com/infinitnet/cookieless-analytics/tree/main/packages/companion
