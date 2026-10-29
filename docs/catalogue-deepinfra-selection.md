# Catalogue DeepInfra : sélection et tri (29/10/2026)

Source : API publique de DeepInfra (`https://api.deepinfra.com/models/list`, lue le 29/10/2026) : 398 entrées, dont 230 modèles de texte, 91 encore actifs. Décision du fondateur : DeepInfra est le serveur de modèles ; **seulement les modèles hébergés par DeepInfra** ; parmi les DeepSeek, **seulement V4.1 Flash 1017**.

## Critères de tri

- Hébergé par DeepInfra : les entrées « partenaire » (`is_partner`, relayées chez l'éditeur : Claude, Gemini, Seed, Qwen3.8-Max et Flash, variantes « Ultra ») sont exclues.
- Actif : les modèles dépréciés par DeepInfra sont exclus.
- Pertinence : modèle de pointe de sa famille, ou palier économique d'une famille récente, ou valeur sûre très utilisée (gpt-oss, Llama 3.3 70B). On garde la dernière génération de chaque famille et, au plus, un palier rapide et un palier phare.
- DeepSeek : uniquement `DeepSeek-V4.1-Flash-1017` (V3, V3.1, V3.2, R1, V4 Flash, V4 Pro et les variantes datées sont exclus).
- Exclus par nature : classificateurs de sécurité (Llama Guard, Nemotron Content Safety), modèles de jeu de rôle (Euryale, Lunaris), très petits ou très anciens modèles.
- Pas encore au catalogue (autres types de DeepInfra) : images, vidéo, voix, musique, reconnaissance vocale, rerankers : la passerelle ne sert que le texte et les embeddings.

## Retenus (33)

| # | Modèle | Type | Contexte | Prix DeepInfra entrée / sortie ($ US par M) | Étiquettes | Benchmarks sourcés |
|---|---|---|---|---|---|---|
| 1 | DeepSeek V4.1 Flash 1017 (`deepseek-ai/DeepSeek-V4.1-Flash-1017`) | chat | 1048576 | 0.2 / 0.6 | raisonnement, code, agents, vision, contexte-long, poids-ouverts, rapide, economique | 8 |
| 2 | GLM 5.3 (`zai-org/GLM-5.3`) | chat | 1048576 | 0.9 / 4 | raisonnement, code, agents, contexte-long, poids-ouverts | 8 |
| 3 | GLM 5.3 Flash (`zai-org/GLM-5.3-Flash`) | chat | 1048576 | 0.15 / 0.5 | raisonnement, code, agents, vision, contexte-long, poids-ouverts, rapide, economique | 3 |
| 4 | Kimi K3 (`moonshotai/Kimi-K3`) | chat | 1048576 | 2.85 / 14.25 | raisonnement, code, agents, vision, contexte-long, poids-ouverts | 8 |
| 5 | MiniMax M3 (`MiniMaxAI/MiniMax-M3`) | chat | 524288 | 0.28 / 1.1 | raisonnement, code, agents, vision, contexte-long, poids-ouverts | 4 |
| 6 | Qwen3.5 397B A17B (`Qwen/Qwen3.5-397B-A17B`) | chat | 262144 | 0.45 / 3 | raisonnement, code, agents, vision, multilingue, poids-ouverts | 8 |
| 7 | Qwen3.8 27B (`Qwen/Qwen3.8-27B`) | chat | 262144 | 0.2 / 2.5 | raisonnement, code, agents, vision, poids-ouverts | 8 |
| 8 | MiMo V2.6 Pro (`XiaomiMiMo/MiMo-V2.6-Pro`) | chat | 1048576 | 0.43 / 0.87 | raisonnement, code, agents, vision, contexte-long, poids-ouverts | 8 |
| 9 | MiMo V2.6 Flash (`XiaomiMiMo/MiMo-V2.6-Flash`) | chat | 1048576 | 0.14 / 0.28 | raisonnement, code, agents, vision, contexte-long, poids-ouverts, rapide, economique | 8 |
| 10 | NVIDIA Nemotron 3 Ultra (`nvidia/NVIDIA-Nemotron-3-Ultra-550B-A55B`) | chat | 262144 | 0.5 / 2.2 | raisonnement, code, agents, multilingue, poids-ouverts | 8 |
| 11 | Ling 3.1 Flash (`inclusionAI/Ling-3.1-flash`) | chat | 262144 | 0.3 / 0.9 | raisonnement, code, agents, poids-ouverts, rapide, economique | 7 |
| 12 | Inkling-Small (`thinkingmachines/Inkling-Small`) | chat | 524288 | 0.45 / 1.2 | raisonnement, code, agents, vision, multilingue, contexte-long, poids-ouverts | 8 |
| 13 | Muse Glimmer-30B (`meta-models/Muse-Glimmer-30B`) | chat | 131072 | 0.3 / 1.2 | raisonnement, code, agents, vision, multilingue, poids-ouverts | 8 |
| 14 | Qwen3.6-35B-A3B (`Qwen/Qwen3.6-35B-A3B`) | chat | 262144 | 0.1 / 0.95 | raisonnement, code, agents, vision, poids-ouverts | 8 |
| 15 | Gemma 4 31B-it (`google/gemma-4-31B-it`) | chat | 262144 | 0.2 / 0.4 | raisonnement, code, agents, vision, multilingue, poids-ouverts | 8 |
| 16 | Gemma 4 26B A4B-it (`google/gemma-4-26B-A4B-it`) | chat | 262144 | 0.07 / 0.34 | raisonnement, code, agents, vision, multilingue, poids-ouverts | 8 |
| 17 | Gemma 4 31B-it Turbo (`google/gemma-4-31B-it-turbo`) | chat | 262144 | 0.09 / 0.34 | raisonnement, code, agents, vision, multilingue, poids-ouverts | 0 |
| 18 | gpt-oss-120b (`openai/gpt-oss-120b`) | chat | 131072 | 0.037 / 0.17 | raisonnement, agents, code, poids-ouverts | 8 |
| 19 | gpt-oss-20b (`openai/gpt-oss-20b`) | chat | 131072 | 0.03 / 0.14 | raisonnement, agents, code, rapide, poids-ouverts | 8 |
| 20 | NVIDIA Nemotron 3 Super 120B-A12B (`nvidia/NVIDIA-Nemotron-3-Super-120B-A12B`) | chat | 262144 | 0.085 / 0.4 | raisonnement, code, agents, multilingue, poids-ouverts | 8 |
| 21 | NVIDIA Nemotron 3.5 Super VL (`nvidia/NVIDIA-Nemotron-3.5-Super-VL`) | chat | 262144 | 0.15 / 0.5 | raisonnement, code, agents, vision, multilingue, poids-ouverts | 8 |
| 22 | NVIDIA Nemotron 3.5 Lightning 30B-A3B (`nvidia/NVIDIA-Nemotron-3.5-Lightning`) | chat | 262144 | 0.06 / 0.16 | raisonnement, code, agents, multilingue, poids-ouverts | 8 |
| 23 | Granite 4.2 8B (`ibm-granite/granite-4.2-8b`) | chat | 131072 | 0.06 / 0.25 | raisonnement, code, agents, multilingue, poids-ouverts | 8 |
| 24 | Ling 3.0 Flash VL (`inclusionAI/Ling-3.0-flash-VL`) | chat | 131072 | 0.06 / 0.18 | raisonnement, agents, vision, rapide, poids-ouverts | 8 |
| 25 | Qwen3 Coder 480B A35B Instruct Turbo (`Qwen/Qwen3-Coder-480B-A35B-Instruct-Turbo`) | chat | 262144 | 0.3 / 1 | code, agents, poids-ouverts | 0 |
| 26 | Qwen3 VL 235B A22B Instruct (`Qwen/Qwen3-VL-235B-A22B-Instruct`) | chat | 262144 | 0.2 / 0.88 | vision, code, agents, poids-ouverts | 8 |
| 27 | Llama 3.3 70B Instruct Turbo (`meta-llama/Llama-3.3-70B-Instruct-Turbo`) | chat | 131072 | 0.1 / 0.32 | multilingue, poids-ouverts | 8 |
| 28 | Llama 4 Scout 17B 16E Instruct (`meta-llama/Llama-4-Scout-17B-16E-Instruct`) | chat | 327680 | 0.1 / 0.3 | vision, multilingue, contexte-long, poids-ouverts | 8 |
| 29 | Mistral Small 3.2 24B Instruct 2506 (`mistralai/Mistral-Small-3.2-24B-Instruct-2506`) | chat | 128000 | 0.075 / 0.2 | vision, agents, multilingue, economique, poids-ouverts | 8 |
| 30 | Qwen3 Embedding 8B (`Qwen/Qwen3-Embedding-8B`) | embedding | 32768 | 0.01 / 0 | embeddings, multilingue, poids-ouverts | 8 |
| 31 | BGE-M3 multi 8k (`BAAI/bge-m3-multi-8k`) | embedding | 8192 | 0.01 / 0 | embeddings, multilingue, poids-ouverts | 6 |
| 32 | Nemotron 3.5 Embed 8B BF16 (`nvidia/Nemotron-3.5-Embed-8B-BF16`) | embedding | 32768 | 0.035 / 0 | embeddings, vision, multilingue, poids-ouverts | 4 |
| 33 | EmbeddingGemma 2 (`google/embeddinggemma-2`) | embedding | 8192 | 0.02 / 0 | embeddings, vision, multilingue, poids-ouverts | 8 |

Le prix de vente affiché au client = prix DeepInfra + 10 % de marge, converti en dollars canadiens au taux de change approuvé par le fondateur.

## Exclus parmi les modèles de texte actifs de DeepInfra

**Partenaires (non hébergés par DeepInfra)** (24) : `anthropic/claude-sonnet-5-5`, `anthropic/claude-opus-5-5`, `Qwen/Qwen3.8-Flash`, `google/gemini-3.7-flash`, `Qwen/Qwen3.8-Max`, `openai/gpt-oss-120b-Ultra`, `google/gemma-4-31B-it-Ultra`, `anthropic/claude-opus-5`, `anthropic/claude-fable-5`, `anthropic/claude-sonnet-5`, `anthropic/claude-opus-4-8`, `google/gemini-3.5-flash`, `Qwen/Qwen3.7-Max`, `anthropic/claude-haiku-4-5`, `anthropic/claude-sonnet-4-6`, `anthropic/claude-opus-4-7`, `google/gemini-3.1-flash-lite`, `google/gemini-3.1-pro`, `ByteDance/Seed-2.0-code`, `ByteDance/Seed-2.0-pro`, `ByteDance/Seed-2.0-mini`, `ByteDance/Seed-1.8`, `google/gemini-2.5-flash`, `google/gemini-2.5-pro`

**DeepSeek hors V4.1 Flash 1017** (10) : `deepseek-ai/DeepSeek-V4.1-Flash`, `deepseek-ai/DeepSeek-V4-Flash-Vision-Exp`, `deepseek-ai/DeepSeek-V4-Pro-0813`, `deepseek-ai/DeepSeek-V4-Flash-0731`, `deepseek-ai/DeepSeek-V4-Pro`, `deepseek-ai/DeepSeek-V4-Flash`, `deepseek-ai/DeepSeek-V3.2`, `deepseek-ai/DeepSeek-V3.1`, `deepseek-ai/DeepSeek-R1-0528`, `deepseek-ai/DeepSeek-V3`

**Autres, non retenus** (28) : `tencent/Hy4-preview`, `inclusionAI/Ling-3.0-flash`, `zai-org/GLM-5.2`, `nvidia/Nemotron-Content-Safety-3.5`, `Qwen/Qwen3.6-27B`, `moonshotai/Kimi-K2.6`, `Qwen/Qwen3.5-35B-A3B`, `Qwen/Qwen3.5-27B`, `Qwen/Qwen3.5-9B`, `zai-org/GLM-4.7`, `Qwen/Qwen3-VL-30B-A3B-Instruct`, `zai-org/GLM-4.6`, `Qwen/Qwen3-Next-80B-A3B-Instruct`, `Qwen/Qwen3-235B-A22B-Instruct-2507`, `Qwen/Qwen3-14B`, `Qwen/Qwen3-32B`, `Qwen/Qwen3-30B-A3B`, `meta-llama/Llama-Guard-4-12B`, `Sao10K/L3-8B-Lunaris-v1-Turbo`, `google/gemma-3-4b-it`, `google/gemma-3-12b-it`, `google/gemma-3-27b-it`, `mistralai/Mistral-Small-24B-Instruct-2501`, `microsoft/phi-4`, `meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo`, `Qwen/Qwen2.5-72B-Instruct`, `Sao10K/L3.1-70B-Euryale-v2.2`, `mistralai/Mistral-Nemo-Instruct-2407`

## Les cinq modèles demandés au départ

| Demandé | Sur DeepInfra | Décision |
|---|---|---|
| DeepSeek V4.1 Flash 1017 | oui (`deepseek-ai/DeepSeek-V4.1-Flash-1017`) | retenu |
| GLM 5.3 | oui (`zai-org/GLM-5.3`) | retenu |
| GLM 5.3 Flash | oui (`zai-org/GLM-5.3-Flash`) | retenu |
| MiniMax M3.1 Flash | non (seulement `MiniMaxAI/MiniMax-M3`) | M3.1 Flash retiré ; M3 retenu |
| Kimi K3.1 Pro | non (seulement `moonshotai/Kimi-K3`) | K3.1 Pro retiré ; K3 retenu |

## À valider par le fondateur

- **MiniMax M3** : la licence des poids (MiniMax Community License) autorise l'usage « non commercial » ; DeepInfra le propose en API. Vérifier avec DeepInfra que la revente par Nexora AI est couverte avant de mettre ce modèle en service.
- Les modèles sont d'abord en **aperçu** (visibles, non appelables) jusqu'à la saisie de la clé DeepInfra dans le Coffre (`llm.deepinfra`) et l'approbation d'un taux de change.
- Les fiches sont lues sur Hugging Face et chez les éditeurs : chiffres, licences et dates sont sourcés un à un ; les points incertains sont listés dans le champ `gaps` de chaque fiche source.
