# 🚀 Release v0.0.6

## What's Changed 🌟

### 🔄 Changes since v0.0.5

### ✨ Features

* implement Claude 3, Claude3.5, Nova Pro, Nova Lite and Mistral model integration with AWS Bedrock ([#974](https://github.com/stackblitz-labs/bolt.diy/pull/974)) by @kunjabijukchhe
* enhance chat import with multi-format support ([#936](https://github.com/stackblitz-labs/bolt.diy/pull/936)) by @sidbetatester
* added Github provider ([#1109](https://github.com/stackblitz-labs/bolt.diy/pull/1109)) by @newnol
* added the "Open Preview in a New Tab" ([#1101](https://github.com/stackblitz-labs/bolt.diy/pull/1101)) by @Stijnus
* configure dynamic providers via .env ([#1108](https://github.com/stackblitz-labs/bolt.diy/pull/1108)) by @mrsimpson
* added deepseek reasoner model in deepseek provider ([#1151](https://github.com/stackblitz-labs/bolt.diy/pull/1151)) by @thecodacus
* enhance context handling by adding code context selection and implementing summary generation ([#1091](https://github.com/stackblitz-labs/bolt.diy/pull/1091)) by @thecodacus


### 🐛 Bug Fixes

* show warning on starter template failure and continue ([#960](https://github.com/stackblitz-labs/bolt.diy/pull/960)) by @thecodacus
* updated hyperbolic link ([#961](https://github.com/stackblitz-labs/bolt.diy/pull/961)) by @Gaurav-Wankhede
* introduce our own cors proxy for git import to fix 403 errors on isometric git cors proxy ([#924](https://github.com/stackblitz-labs/bolt.diy/pull/924)) by @wonderwhy-er
* git private clone with custom proxy ([#1010](https://github.com/stackblitz-labs/bolt.diy/pull/1010)) by @thecodacus
* added XAI to docker config ([#274](https://github.com/stackblitz-labs/bolt.diy/pull/274)) by @siddartha-10
* ollama and lm studio url issue fix for docker and build ([#1008](https://github.com/stackblitz-labs/bolt.diy/pull/1008)) by @thecodacus
* streaming issue fixed for build versions ([#1006](https://github.com/stackblitz-labs/bolt.diy/pull/1006)) by @thecodacus
* added ui indicator on how apikeys are set (UI/Env)  for api-key-manager component ([#732](https://github.com/stackblitz-labs/bolt.diy/pull/732)) by @Adithyan777
* bugfix in fetching API Key on base llm provider. ([#1063](https://github.com/stackblitz-labs/bolt.diy/pull/1063)) by @GaryStimson
* cors issues from preview fixed by changing embedder policies ([#1056](https://github.com/stackblitz-labs/bolt.diy/pull/1056)) by @wonderwhy-er
* api-key manager cleanup and log error on llm call ([#1077](https://github.com/stackblitz-labs/bolt.diy/pull/1077)) by @thecodacus
* fallback model name not working ([#1095](https://github.com/stackblitz-labs/bolt.diy/pull/1095)) by @lewis617
* for Open preview in a new tab. ([#1122](https://github.com/stackblitz-labs/bolt.diy/pull/1122)) by @Stijnus
* auto select starter template bugfix ([#1148](https://github.com/stackblitz-labs/bolt.diy/pull/1148)) by @thecodacus
* updated system prompt to have correct indentations ([#1139](https://github.com/stackblitz-labs/bolt.diy/pull/1139)) by @thecodacus
* get environment variables for docker #1120 (2ae897a) by @leex279


### 📚 Documentation

* updating copyright in LICENSE ([#796](https://github.com/stackblitz-labs/bolt.diy/pull/796)) by @coleam00
* bugfix/formatting faq docs ([#1027](https://github.com/stackblitz-labs/bolt.diy/pull/1027)) by @leex279
* document how we work ([#809](https://github.com/stackblitz-labs/bolt.diy/pull/809)) by @mrsimpson
* update README.md ([#1124](https://github.com/stackblitz-labs/bolt.diy/pull/1124)) by @leex279
* replace docker-compose with docker compose ([#1094](https://github.com/stackblitz-labs/bolt.diy/pull/1094)) by @lewis617


### ⚙️ CI

* docker Image creation pipeline ([#1011](https://github.com/stackblitz-labs/bolt.diy/pull/1011)) by @twsl
* fix docker image workflow permissions ([#1013](https://github.com/stackblitz-labs/bolt.diy/pull/1013)) by @twsl
* added visibility change to public for docker image publish ([#1017](https://github.com/stackblitz-labs/bolt.diy/pull/1017)) by @thecodacus
* added arm64 platform for docker published images ([#1021](https://github.com/stackblitz-labs/bolt.diy/pull/1021)) by @thecodacus


### 🔍 Other Changes

* reverted visibility change ([#1018](https://github.com/stackblitz-labs/bolt.diy/pull/1018)) by @thecodacus
* Updating README with resources and small fixes. (354f416) by @coleam00
* Adding resources page to index.md for docs. (441b797) by @coleam00
* updated docs ([#1025](https://github.com/stackblitz-labs/bolt.diy/pull/1025)) by @thecodacus
* Update README.md (12c6b7a) by @Digitl-Alchemyst


## ✨ First-time Contributors

A huge thank you to our amazing new contributors! Your first contribution marks the start of an exciting journey! 🌟

* 🌟 [@Adithyan777](https://github.com/Adithyan777)
* 🌟 [@Digitl-Alchemyst](https://github.com/Digitl-Alchemyst)
* 🌟 [@GaryStimson](https://github.com/GaryStimson)
* 🌟 [@kunjabijukchhe](https://github.com/kunjabijukchhe)
* 🌟 [@leex279](https://github.com/leex279)
* 🌟 [@lewis617](https://github.com/lewis617)
* 🌟 [@newnol](https://github.com/newnol)
* 🌟 [@sidbetatester](https://github.com/sidbetatester)
* 🌟 [@siddartha-10](https://github.com/siddartha-10)
* 🌟 [@twsl](https://github.com/twsl)

## 📈 Stats

**Full Changelog**: [`v0.0.5..v0.0.6`](https://github.com/stackblitz-labs/bolt.diy/compare/v0.0.5...v0.0.6)
