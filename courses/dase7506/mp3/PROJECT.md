# DASE7506 Mini-project 3: SQL Repair Agent

**Individual project · 10% of the course · CPU-first · Competitive leaderboard**

Project page and submissions: <https://xudongwu-0.github.io/courses/dase7506/mp3/>

**Submission deadline: 30 November 2026, 23:59 Beijing time (UTC+8). Peer review: 1–7 December 2026, closing 7 December at 23:59 (UTC+8).** This document is the complete student specification; the starter archive contains no separate guide.

## 1. Your task

Build an agent that repairs SQL. Each task contains a natural-language question, a database schema, an imperfect SQL draft and a public example result. Your agent observes feedback, decides which tools to call, updates its context, and submits one final SQLite query. You may write new SQL; you are **not** restricted to selecting a supplied candidate.

The learning objective is the **perceive-plan-act loop**, tool use, context/memory management, and evaluation of reliability, cost and safety. Your final system must use real execution/checking feedback in its decision process. A fixed answer lookup, a single model completion without a tool-feedback loop, or model training alone is not a complete project.

## 2. Data and official metric

The provided Spider-derived benchmark has **480 training, 120 validation and 240 test tasks**, with disjoint database schemas across splits.

- Use training tasks/references to fit models, retrieval indexes and other learned components.
- Use validation to select designs and hyperparameters, not as additional training labels.
- **The full test evaluation bundle is public:** inputs, all three database instances per task, expected-result fingerprints and the scoring program. Run the official evaluation locally and report your own result.
- A task is correct only when the submitted query returns the required result on **all three grading database instances**. Passing one public example does not guarantee correctness.
- Official metric: `100 x correct test tasks / 240`. The scorer replays tool traces and checks every instance. Submit its complete score JSON and predictions; the instructor may reproduce results and inspect compliance.

Repeated self-evaluation is allowed. This is a **public benchmark**, not a hidden-test generalization claim. Use validation for routine design choices. Do not train on test tasks or their grading fingerprints, hard-code task-specific answers, or let your agent read grading references/additional evaluation databases. The extra instances and fingerprints are for the scorer only; reference test SQL is not supplied.

The public hints are fixed, untrained-LLM outputs shared by everyone. They are **not gold answers** and may be wrong. `repair_hint` reads this cache; it does not call an online model. Changing your prompts or tool descriptions does **not** regenerate the cache. A CPU controller using these hints is an LLM-assisted tool workflow, not necessarily a live LLM planner.

## 3. Start on CPU

Use Python 3.11 or 3.12. From the extracted archive's top-level directory:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python -m mp3_sql.check_data

python -m mp3_sql.predict --split validation --output outputs/validation.json
python -m mp3_sql.score --split validation \
  --predictions outputs/validation.json --output outputs/validation-score.json

python -m mp3_sql.predict --split test --output outputs/test.json
python -m mp3_sql.score --split test \
  --predictions outputs/test.json --output outputs/test-score.json
```

The default entry point, `mp3_sql/submission.py`, simply submits the original draft. This is the reproducible **starting baseline**, not a reference solution or a sufficient final agent. No model download, API key, PyTorch or GPU is needed.

Create your own export directory containing only your implementation and assets, for example:

```text
submission/
  submission.py
  config.json
  report.pdf
```

Your module must provide `create_agent(checkpoint=None)`. The returned object must provide `act(observation)` and return exactly one tool-action dictionary. A fresh agent is created for each task. Use package imports for auxiliary modules; the grading runner adds the export directory to `PYTHONPATH`.

```bash
PYTHONPATH="$PWD/submission" python -m mp3_sql.predict \
  --split validation --method submission/submission.py \
  --checkpoint submission/config.json --output outputs/my-validation.json
python -m mp3_sql.score --split validation \
  --predictions outputs/my-validation.json --output outputs/my-validation-score.json
```

Omit `--checkpoint` if your implementation does not need a configuration file. The unchanged starting entry point does not accept a checkpoint.

For your submission, run these same commands with `--split test`, your own `--method`/optional `--checkpoint`, and output paths `outputs/test.json` and `outputs/test-score.json`. Upload the complete, unchanged **test-score JSON** to the submission form; it reads `correct`, `n` and `accuracy` automatically. Do not report a validation score or a one-instance public-example pass rate.

## 4. Tools and budget

Each observation contains `task`, `issue_sql`, `example`, `history` and the remaining budget. Tool results appear in subsequent observations.

| Action | Exact return value | Purpose |
|---|---|---|
| Schema | `{"tool":"schema"}` | Read the database schema. |
| Execute | `{"tool":"execute","sql":"..."}` | Execute read-only SQL and inspect results/errors. |
| Check | `{"tool":"check","sql":"..."}` | Execute SQL and compare with the public example. |
| Retrieve | `{"tool":"retrieve","query":"..."}` | Retrieve training examples, excluding the current task. |
| Hint | `{"tool":"repair_hint"}` | Read the fixed shared suggestions for the original draft. |
| Submit | `{"tool":"submit","sql":"..."}` | Finish with one SQL query. |

There are **8 charged tool calls per task**; `submit` is free. First execute or check the **exact original draft** before requesting hints. Identical tool actions cannot be repeated. SQL is limited to 16,000 UTF-8 bytes. The executor permits read-only queries and enforces its own execution limits.

Only the provided tools may access benchmark databases. Do not bypass the tool budget, edit observations/traces, access database files directly, or modify the official environment, data, predictor or scorer for grading. Local experiments may use copies, but the instructor reruns your exported agent against the unchanged official framework.

## 5. What you may optimize

**Harness optimization is allowed:** improve your own controller, tool descriptions/wrappers, prompts, tool-call decisions, context, memory/retrieval, SQL editing and final-answer selection. Preserve the underlying tool semantics and budgets. You may train non-LLM components on the training split.

**Weight optimization is optional:** if you train an LLM, use **LoRA on `Qwen/Qwen3-0.6B` only**; submit adapters, not full or merged model weights. No GPU is provided.

- An unchanged public model with at most 1,000,000,000 actual parameters may be used for inference, with its exact repository and immutable revision declared. Count embeddings and any unmerged adapter toward this limit.
- For LoRA training, use base revision `c1899de289a04d12100db370d81485cdf75e47ca` of `Qwen/Qwen3-0.6B`.
- Train only LoRA A/B matrices. Do not train or submit embeddings, `lm_head`, biases, `modules_to_save`, full-model checkpoints, merged checkpoints or other adapter types. There is no prescribed LoRA rank.
- For a trained model, submit only `adapter_model.safetensors` and `adapter_config.json`, plus your loading configuration, training configuration/logs and data-provenance record. The original base model/tokenizer must remain unchanged.
- Provide a loading implementation. The instructor loads **your submitted adapter**, not a course reference adapter. Use local, safetensors-only loading with `trust_remote_code=False`; custom remote model code and pickle checkpoints are not accepted.
- External LLMs may assist development; disclose their use. They cannot be contacted during grading. Any task-specific generated training material must be derived from the training split only.
- Quantization does not reduce a model's actual parameter count. Do not embed additional model weights, test answers or undeclared runtime dependencies in source/configuration files.

Optional model dependencies are in `requirements-model.txt`; install them only if you choose the live-model route. Standard loading uses `AutoTokenizer.from_pretrained(..., local_files_only=True, trust_remote_code=False)` and `AutoModelForCausalLM.from_pretrained(..., local_files_only=True, trust_remote_code=False, use_safetensors=True)` and, for LoRA, `PeftModel.from_pretrained(base, adapter_dir, is_trainable=False)`. Design the prompts and agent integration yourself. Use `MP3_BASE_MODEL` and, when applicable, `MP3_ADAPTER_DIR` for local model paths and document your exact loading command. Use `--workers 1` for live-model prediction and load the model once, reusing it across tasks.

### Runtime and submission limits

| Route | Exported assets | Reproduction budget |
|---|---|---|
| No live LLM | At most 16 MiB of source/configuration/non-LLM assets | 4 CPU threads, 2 GiB virtual address space, 180 seconds including scoring |
| One approved live LLM | Same 16 MiB export; a separate LoRA export may be at most 512 MiB | 4 CPU threads, 16 GiB peak resident RAM, up to 2 hours for prediction plus 180 seconds for scoring |

Do not upload base weights. Provision the declared public base before running; execution/reproduction must work offline on Linux using the approved tool interface. No GPU is provided or guaranteed. If you use a live LLM, limit it to **6 completions per task**, each at most **2,048 new tokens**, and record prompts, generated text, token counts and model/adapter identity for instructor inspection. Include measured CPU time and memory in your report. These are reproducibility requirements, not claims that this website executes submissions or enforces model budgets automatically. Wall time is not a leaderboard tie-breaker.

## 6. Evaluate locally and submit your result

1. Evaluate your exported agent on **all 240 test tasks** with the supplied predictor/scorer. Keep `outputs/test.json` and the complete `outputs/test-score.json`. The correct count must require all three instances per task.
2. Prepare an immutable HTTPS ZIP containing your source export, configuration, dependency list, report, reproduction commands and both output files. Do not include the dataset, base weights, `.venv` or caches. Keep the export within the limit above.
3. For LoRA, provide a separate immutable HTTPS ZIP containing exactly the two adapter files. Your report/training records belong in the source export. You do not need to calculate or enter ZIP SHA-256 values.
4. On the project page select `outputs/test-score.json`, then enter your student ID and source ZIP link. Add the optional adapter link only if you trained LoRA. Describe any model's exact repository, immutable revision, actual parameter count and loading instructions in your report; no model-route selection is required. The page checks the score file's split, benchmark identity and counts and derives evaluation fingerprints automatically; this is **not** proof that the submitted program reproduced the score.
5. Click **Prepare score submission**, then **Submit on GitHub**, and actually create the issue. Preparing a link alone does not save a submission. Use the same GitHub account and student ID for updates; submit improvements as new issues with new immutable artifacts.
6. Scores enter the leaderboard as **self-reported**, subject to instructor reproduction, spot checks and compliance review. They do not require a prior instructor evaluation request. Only the instructor can mark a result verified or invalidate it. The website itself does not run code or models.

Submit the final score and all required artifact links **before the submission deadline**. New scores after the cutoff are late; post-deadline edits cannot replace the frozen score or original source/adapter submission.

Student IDs, reported scores and evaluation metadata are public; GitHub also retains the submitting account. Artifact URLs are encrypted before the GitHub handoff. The instructor publishes the submitted source and optional adapter links for peer review after the deadline. Keep them accessible and unchanged until grading finishes. Remove credentials, private data and unrelated files before submitting; do not put credentials in any URL.

Your report must cover the agent loop, context/memory/retrieval choices, **at least two controlled ablations**, validation and test results, runtime/tool/model cost, failure cases, **prompt-injection risks** from untrusted questions/tool/retrieval content and your safeguards, external assistance, data provenance and exact reproduction instructions. Include training records if you train. These are eligibility requirements, not additional weighted score components.

### Seven-day peer review

During **1–7 December**, use the released immutable source/adapter links to reproduce other students' results with the exact official package and evaluator. Follow the submitted commands and evaluate all 240 test tasks on all three instances per task.

Use the leaderboard's **Peer Review Report** button to provide the reproduced accuracy; a Markdown explanation and evidence link are optional. Create the prepared GitHub issue to save the report, or use the provided email-report link. Include the target submission number, environment and reproduction commands. Do not review your own submission.

Scores are frozen during review; review is not an extra tuning/submission period. Reports must be submitted by **7 December 2026, 23:59 (UTC+8)**. Reports alone do not change scores or grades: the instructor checks discrepancies and determines eligibility before the final ranking.

## 7. Ranking and grades

**All approaches compete on one leaderboard; there are no separate model or training tracks.** Among eligible individual submissions, each student is represented by their best reproducible test accuracy submitted before the deadline. The live board includes self-reported scores; final grades use the instructor-confirmed eligible ranking after peer review. The **top 35% receive A, the next 50% B, and the final 15% C**.

Ranking uses the exact number of correct test tasks, not rounded display values. Equal scores share a competition rank (1, 1, 3). For `N` eligible students, the A boundary is `ceil(0.35N)` and the A-or-B boundary is `ceil(0.85N)`; a tie crossing a boundary receives the higher band, so percentages can vary slightly. Missing, invalid, non-reproducible or non-compliant submissions are not valid ranked entries and are handled under course assessment rules.

Do not fabricate scores, traces or model declarations. Access to the public evaluator is not permission to leak its grading fingerprints into the agent, fit on test labels, memorize test answers or tamper with evaluation.

## 8. Attribution and integrity

Spider-derived data and course modifications are distributed under **CC BY-SA 4.0** with attribution in `NOTICE`. Qwen model outputs/base models retain their applicable model terms; model weights are not included. The execution framework uses SQLite and SQLGlot. See `NOTICE` and `PACKAGE_MANIFEST.json`.

The manifest lists the exact public files and their hashes. The public test evaluation materials are included; instructor solutions, optimized harnesses, trained adapters and internal optimization results are not.
