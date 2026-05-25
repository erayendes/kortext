# Kortext Setup

## Routing

1. **+operation-manager:** `.kortext/data/project.json` oku. `projectType` alanını doğrula: değer `new` veya `existing` olmalı. Aksi halde fatal.
   - inputs: `.kortext/data/project.json`

2. **+operation-manager:** `start_pipeline` MCP tool'u çağır.
   - `projectType == "new"` → `workflow_id: "01a-analysis-pipeline"`
   - `projectType == "existing"` → `workflow_id: "01b-onboarding-pipeline"`
   - inputs: `.kortext/data/project.json`
