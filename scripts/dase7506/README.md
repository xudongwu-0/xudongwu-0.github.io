# DASE7506 website maintenance

The public course page is `/courses/dase7506/`. MP1 is open for submission testing with full-test BPB (lower is better). The compact page shows the submission form, leaderboard and reproduction reports. MP2 and MP3 remain closed and are hidden from the form. The course page is English-only and has its own navigation and favicon, with no links to the personal homepage. Assignment handouts, datasets and checkpoints are not published on this page. The MP1 score deadline is the end of 30 September 2026 (UTC+8).

## Storage and identity

The form creates a prefilled GitHub Issue. The student must log in to GitHub and
confirm creation. Generating the link alone is **not** a successful submission.
Student IDs and scores are displayed publicly. GitHub accounts remain the backend
identity for submissions and review requests, and are visible in GitHub records.
The current form encrypts artifact links with AES-256-GCM, wrapping each AES key
with the course RSA public key. Links are published together by the instructor.
Legacy test issues already containing plaintext links remain public records.
Student IDs are now written in plaintext issue payloads, with consent on the form.
They are not retained in browser localStorage. GitHub usernames are not displayed
in the student leaderboard's identity column.

The private key is kept outside this repository by the instructor. Back it up
privately; losing it prevents decryption of sealed links and legacy student IDs. To export a
private roster (Python 3.10+ and OpenSSL, outside this repository):

```bash
python3 scripts/dase7506/decrypt-ids.py \
  --key /private/path/submission-private.pem \
  --output /private/path/7506-identities.csv
```

A GitHub account remains the identity used for deduplication and artifact ownership.
Enforce one account per student by comparing submitted IDs with the course roster before grading.
Possession of an account alone does not establish a student's enrolment. There
is no student roster, teacher key, server token or database in this repository.

To migrate legacy encrypted IDs after the instructor's decision to show IDs:

```bash
node scripts/dase7506/publish-student-ids.mjs --key /private/path/submission-private.pem
node scripts/dase7506/sync.mjs
```

Commit the updated `data/student-identities.json` and snapshot. Each migrated
ID is bound to its original ciphertext; the private key is never published.

## Automatic leaderboard

`.github/workflows/dase7506-leaderboard.yml` reads all issue pages on submissions,
edits and review-label changes, plus manual runs and a six-hour recovery schedule.
It validates structured JSON and commits `data/leaderboard.json` using the
repository-scoped `GITHUB_TOKEN`. It never downloads or executes student code.
The page first reads that snapshot from raw.githubusercontent.com. If that host
is unavailable, it tries the GitHub Contents API, then a deployed snapshot.
The primary path avoids GitHub's shared anonymous REST API rate limit.
Issue creation is immediate; leaderboard refresh may take several minutes.

Workflow commits made with `GITHUB_TOKEN` do not trigger a Pages rebuild. This is
intentional: the live page reads the updated raw snapshot directly. Changes to
HTML, CSS and scripts pushed normally continue to use the existing Pages build.
If Actions is disabled, enable it in the repository settings and run
**Actions → DASE7506 leaderboard → Run workflow**. The GitHub Issue remains the
source record even while a workflow or CDN update is delayed.

## Score deadline, link collection and manual release

Before 1 October 2026, 00:00 (UTC+8), a score submission needs only a public
student ID and BPB. Code and checkpoint links are optional. After that cutoff,
new scores are excluded and edits cannot replace the recorded deadline score.
If a score is first seen after the cutoff and its issue was edited after the
cutoff, it requires instructor review of the deadline evidence.

After the deadline the form requires both links and the original score issue
number. The GitHub account must match that original submission. Links remain
encrypted during collection. A “Links received” badge acknowledges the sealed
payload; it does not establish that the files or score are valid. Students must
preserve the method and checkpoint that produced their deadline score.

After collecting the links, the instructor runs this command locally with the
private key, outside the public repository, to inspect a private release preview:

```bash
node scripts/dase7506/release-links.mjs \
  --key /private/path/submission-private.pem \
  --output /private/path/7506-release-preview.json
```

The tool refreshes issue records, selects each account's best eligible score and
requires two decryptable HTTPS links for every selected score. It refuses to
release before the deadline or replace an existing release. Resolve missing
links and reviewed/withdrawn entries before publishing. To open public review:

```bash
node scripts/dase7506/release-links.mjs \
  --key /private/path/submission-private.pem --publish
git add courses/dase7506/data/publication.json
git commit -m 'Open MP1 seven-day public review'
git push origin main
```

Run the publication command immediately before committing and pushing: the
seven-day window starts at its recorded `published_at` time. This teacher action
releases the links together; the leaderboard displays the review deadline.
Only reproduction claims created within that seven-day window are eligible for
the peer-reproduction reward. General review requests can be filed earlier. Scores
remain frozen, and the published links remain visible after the window closes.

## Automated checking agent and score spot checks

`.github/workflows/dase7506-artifact-checks.yml` runs the file-checking agent when
links are released, and on manual dispatch. The agent downloads code at immutable
GitHub commits and checkpoint files, checks Python syntax and expected interfaces,
inspects checkpoint structure/protocol and records hashes and sizes. It selects
a random sample for instructor reproduction and uploads `artifact-checks.json`
under the workflow run's artifacts.

The agent never executes submitted Python or unpickles checkpoint objects. Its
output always distinguishes file inspection from numerical score reproduction
(`score_reproduced: false`). Inaccessible or unrecognized files require instructor
review; they do not automatically invalidate a score. Complete the selected score
spot checks in an isolated evaluation environment before applying `7506:verified`.

Malformed records are omitted from the board; the original issue remains for
correction. Student results are self-reported unless the instructor verifies them.
For an improved score, create a new issue instead of editing a reviewed result.
Closing an ordinary submission withdraws it; history still shows it. An invalid
submission stays invalid and recorded even if its author edits or closes it.

## Instructor review overview

Open `/courses/dase7506/instructor.html` directly to see every submission's
request count, distinct active reporters, flags and individual GitHub records.
The student page has no link to this overview and displays neither counts nor
flags. This is a separate view, not an access-controlled backend: its source
issues and snapshot can still be inspected through GitHub.

“Total requests” includes duplicate, closed, rejected, late and self requests.
“Active reporters” counts distinct GitHub accounts with pending or upheld
requests, excluding self, closed, rejected and late requests. **More than 3**
active reporters means **4 or more** and sets a flag. Flags do not invalidate a
score, remove it from ranking, apply an instructor label or change grades.

The Request review form requires a reason; evidence and a reproduced score are
optional. During the seven-day review, supplying both creates a reproduction
claim eligible for instructor adjudication under the original reward rules.
Other requests are inspection leads, not automatic reward claims. Requests and
the requester's GitHub account are public; this is stated in the form.

For a local instructor copy, including all request records:

```bash
node scripts/dase7506/review-summary.mjs --refresh \
  --output /private/path/review-overview.html
```

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
report are both required for an adjustment. If a numeric difference threshold is
configured, the report must exceed it; otherwise the instructor judges the evidence.
The first upheld reporter and submission author receive the adjustments configured for that project. Each reward and
penalty is capped independently per student/project. Repeated syncs and duplicate
reports cannot multiply them. The snapshot records adjustments separately; apply them
to project marks with a final 0–100 clamp. A withdrawn result does not imply
misconduct. If a decision is reversed, remove the corresponding instructor label.

Edits of a verified payload return it to review. To verify the new payload, remove
`7506:verified`, let the snapshot sync, then add it again. Apply only one submission
review label at a time. Adjudicated submissions/reports retain the reviewed payload
so their authors cannot redirect rewards or erase penalties by editing JSON.

## Checks

```bash
node scripts/dase7506/build-assets.mjs
node --test scripts/dase7506/*.test.mjs
python3 -m unittest discover -s scripts/dase7506 -p test_artifact_agent.py -v
node scripts/dase7506/sync.mjs
```

The sync command uses optional `GITHUB_TOKEN` for API rate limits; never commit it.
The workflow only processes JSON data and instructor labels, not issue-body shell
expressions or code from forks. GitHub Issues / Actions must remain enabled.

Run `build-assets.mjs` after changing browser code, project settings or CSS, and
commit the generated `assets/` files together with `index.html` and `instructor.html`. Each module
references fingerprinted dependencies, including the project configuration.
This prevents a new English page from loading an old cached Chinese script or
closed-project configuration. Asset tests check that the published graph matches
the source. Older fingerprinted files remain available for cached HTML.

Implementation references: [GitHub Pages static hosting](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages),
[prefilled issue URLs](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/creating-an-issue#creating-an-issue-from-a-url-query),
[issue events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#issues),
[GITHUB_TOKEN](https://docs.github.com/en/actions/tutorials/authenticate-with-github_token).

## Open projects after the instructor has confirmed them

Edit `courses/dase7506/projects.mjs`: set the project name, score unit, direction
(`lower`), optional `min` / `max`, reproduction threshold and any reward / penalty.
MP1 currently has `open: true` for instructor submission testing. Set other projects to `open: true` only after instructor confirmation.
The same configuration gates both the browser form and the trusted snapshot
builder. Closed projects reject manually crafted GitHub submissions too.

Publish the confirmed task instructions separately at that time. For a new course
cohort or incompatible evaluation protocol, change `PROTOCOL` and archive the old
leaderboard before accepting results; check for existing records before changing the protocol. A test submission can be withdrawn by closing its GitHub issue; it remains in history.

Run the rule tests before pushing. Their synthetic score ranges and reward values
exist only in the test process and are not published course policies.
