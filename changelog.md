# 🚀 Release v0.0.4

## What's Changed 🌟

### 🔄 Changes since v0.0.3

### ✨ Features

* add xAI grok-2-1212 model ([#800](https://github.com/stackblitz-labs/bolt.diy/pull/800))
* providers list is now 2 columns (75ec49b) by Dustin Loring
* enhanced Terminal Error Handling and Alert System ([#797](https://github.com/stackblitz-labs/bolt.diy/pull/797))
* add Starter template menu in homepage ([#884](https://github.com/stackblitz-labs/bolt.diy/pull/884))
* catch errors from web container preview and show in actionable alert so user can send them to AI for fixing ([#856](https://github.com/stackblitz-labs/bolt.diy/pull/856))
* redact file contents from chat and put latest files into system prompt  ([#904](https://github.com/stackblitz-labs/bolt.diy/pull/904))
* added Automatic Code Template Detection And Import ([#867](https://github.com/stackblitz-labs/bolt.diy/pull/867))
* added hyperbolic llm models ([#943](https://github.com/stackblitz-labs/bolt.diy/pull/943))


### 🐛 Bug Fixes

* chat title character restriction (e064803) by Dustin Loring
* fixed model not loading/working, even after baseUrl set in .env file ([#816](https://github.com/stackblitz-labs/bolt.diy/pull/816))
* added wait till terminal prompt for bolt shell execution ([#789](https://github.com/stackblitz-labs/bolt.diy/pull/789))
* fixed console error for SettingsWIndow & Removed ts-nocheck  ([#714](https://github.com/stackblitz-labs/bolt.diy/pull/714))
* add Message Processing Throttling to Prevent Browser Crashes ([#848](https://github.com/stackblitz-labs/bolt.diy/pull/848))
* provider menu dropdown fix (ghost providers) ([#862](https://github.com/stackblitz-labs/bolt.diy/pull/862))
* ollama provider module base url hotfix for docker ([#863](https://github.com/stackblitz-labs/bolt.diy/pull/863))
* check for updates does not look for commit.json now ([#861](https://github.com/stackblitz-labs/bolt.diy/pull/861))
* detect and remove markdown block syntax that llms sometimes hallucinate for file actions ([#886](https://github.com/stackblitz-labs/bolt.diy/pull/886))
* add defaults for LMStudio to work out of the box ([#928](https://github.com/stackblitz-labs/bolt.diy/pull/928))
* import folder filtering ([#939](https://github.com/stackblitz-labs/bolt.diy/pull/939))
* refresh model list after api key changes ([#944](https://github.com/stackblitz-labs/bolt.diy/pull/944))
* better model loading ui feedback and model list update ([#954](https://github.com/stackblitz-labs/bolt.diy/pull/954))
* updated logger and model caching minor bugfix #release ([#895](https://github.com/stackblitz-labs/bolt.diy/pull/895))


### 📚 Documentation

* simplified setup ([#817](https://github.com/stackblitz-labs/bolt.diy/pull/817))
* toc for readme (de64007) by Dustin Loring
* faq style change, toc added to index (636f87f) by Dustin Loring
* setup updated (ab5cde3) by Dustin Loring
* updated Docs ([#845](https://github.com/stackblitz-labs/bolt.diy/pull/845))
* updated download link ([#850](https://github.com/stackblitz-labs/bolt.diy/pull/850))
* updated env.example of OLLAMA & LMSTUDIO base url ([#877](https://github.com/stackblitz-labs/bolt.diy/pull/877))


### ♻️ Code Refactoring

* updated vite config to inject add version metadata into the app on build ([#841](https://github.com/stackblitz-labs/bolt.diy/pull/841))
*  refactored LLM Providers: Adapting Modular Approach ([#832](https://github.com/stackblitz-labs/bolt.diy/pull/832))


### ⚙️ CI

* updated the docs ci to only trigger if any files changed in the docs folder ([#849](https://github.com/stackblitz-labs/bolt.diy/pull/849))
* improved change-log generation script and cleaner release ci action ([#896](https://github.com/stackblitz-labs/bolt.diy/pull/896))


### 🔍 Other Changes

* fix hotfix for version metadata issue ([#853](https://github.com/stackblitz-labs/bolt.diy/pull/853))
* feat; data tab added to the settings (1f938fc) by Dustin Loring


## 📈 Stats

**Full Changelog**: [`v0.0.3..v0.0.4`](https://github.com/stackblitz-labs/bolt.diy/compare/v0.0.3...v0.0.4)
