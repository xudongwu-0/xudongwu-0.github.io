# DASE7506 website maintenance

The public course page is `/courses/dase7506/`. No course tasks, datasets, benchmark results, checkpoints or handouts are published. All projects are currently closed pending instructor decisions. Existing personal pages are preserved.

## Storage and identity

The form creates a prefilled GitHub Issue. The student must log in to GitHub and
confirm creation. Generating the link alone is **not** a successful submission.
Scores, artifact URLs and GitHub usernames are public; student IDs are encrypted
in the browser with RSA-OAEP / SHA256 using the course public key. No student ID
is stored in browser localStorage, logs or plaintext issue bodies by our code.
Students must also avoid putting their IDs in public URLs, code or reports.

The private key is kept outside this repository by the instructor. Back it up
privately; losing it prevents decryption of submitted student IDs. To export a
private roster (Python 3.10+ and OpenSSL, outside this repository):

```bash
python3 scripts/dase7506/decrypt-ids.py \
  --key /private/path/submission-private.pem \
  --output /private/path/7506-identities.csv
```

A GitHub account is the public leaderboard identity. Enforce one account per
student by comparing the decrypted IDs with the course roster before grading.
Possession of an account alone does not establish a student's enrolment. There
is no student roster, teacher key, server token or database in this repository.

## Automatic leaderboard

`.github/workflows/dase7506-leaderboard.yml` reads all issue pages on submissions,
edits and review-label changes, plus manual runs and a six-hour recovery schedule.
It validates structured JSON and commits `data/leaderboard.json` using the
repository-scoped `GITHUB_TOKEN`. It never downloads or executes student code.
The page reads that snapshot from raw.githubusercontent.com (with a deployed
snapshot fallback), avoiding GitHub's shared anonymous REST API rate limit.
Issue creation is immediate; leaderboard refresh may take several minutes.

Workflow commits made with `GITHUB_TOKEN` do not trigger a Pages rebuild. This is
intentional: the live page reads the updated raw snapshot directly. Changes to
HTML, CSS and scripts pushed normally continue to use the existing Pages build.
If Actions is disabled, enable it in the repository settings and run
**Actions → DASE7506 leaderboard → Run workflow**. The GitHub Issue remains the
source record even while a workflow or CDN update is delayed.

Malformed records are omitted from the board; the original issue remains for
correction. Student results are self-reported unless the instructor verifies them.
For an improved score, create a new issue instead of editing a reviewed result.
Closing an ordinary submission withdraws it; history still shows it. An invalid
submission stays invalid and recorded even if its author edits or closes it.

## Reproduction and adjudication

The workflow creates these five instructor labels automatically. Students cannot
assign them. Check both parties' evidence and explain the decision in the issue
before applying the corresponding label:

| Label | Where | Effect |
|---|---|---|
| `7506:verified` | Submission | Exact submitted checkpoint reproduced |
| `7506:review` | Submission | Excluded from main ranking while reviewed |
| `7506:invalid` | Submission | Invalidated after instructor review |
| `7506:upheld` | Reproduction issue | Instructor confirms the report |
| `7506:rejected` | Reproduction issue | No penalty or reward |

A pending report has no grading effect. An invalid submission **and** an upheld
report with sufficient score difference are both required for an adjustment.
The first upheld reporter and submission author receive the adjustments configured for that project. Each reward and
penalty is capped independently per student/project. Repeated syncs and duplicate
reports cannot multiply them. The board shows adjustments separately; apply them
to project marks with a final 0–100 clamp. A withdrawn result does not imply
misconduct. If a decision is reversed, remove the corresponding instructor label.

Edits of a verified payload return it to review. To verify the new payload, remove
`7506:verified`, let the snapshot sync, then add it again. Apply only one submission
review label at a time. Adjudicated submissions/reports retain the reviewed payload
so their authors cannot redirect rewards or erase penalties by editing JSON.

## Checks

```bash
node --test scripts/dase7506/arena.test.mjs
node scripts/dase7506/sync.mjs
```

The sync command uses optional `GITHUB_TOKEN` for API rate limits; never commit it.
The workflow only processes JSON data and instructor labels, not issue-body shell
expressions or code from forks. GitHub Issues / Actions must remain enabled.

Implementation references: [GitHub Pages static hosting](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages),
[prefilled issue URLs](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/creating-an-issue#creating-an-issue-from-a-url-query),
[issue events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#issues),
[GITHUB_TOKEN](https://docs.github.com/en/actions/tutorials/authenticate-with-github_token).

## Open projects after the instructor has confirmed them

Edit `courses/dase7506/projects.mjs`: set the project name, score unit, direction
(`lower`), optional `min` / `max`, reproduction threshold and any reward / penalty.
Set `open: true` only when the assignment and evaluation protocol are confirmed.
The same configuration gates both the browser form and the trusted snapshot
builder. Closed projects reject manually crafted GitHub submissions too.

Publish the confirmed task instructions separately at that time. For a new course
cohort or incompatible evaluation protocol, change `PROTOCOL` and archive the old
leaderboard before accepting results; the current site contains no student records.

Run the rule tests before pushing. Their synthetic score ranges and reward values
exist only in the test process and are not published course policies.
