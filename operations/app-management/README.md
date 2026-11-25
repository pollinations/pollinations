# App management

The community app catalog is [app.json](app.json). [app.js](app.js) validates and
updates it, and [update-readme.js](update-readme.js) refreshes the repository's app
table.

## App submissions

1. An applicant opens an `APP-SUBMISSION` issue. The
   [pre-review workflow](../../.github/workflows/apps-review-submissions.yml)
   calls [run-review.sh](ingestion/run-review.sh) to validate the form, gather
   evidence in an isolated runner, and post the review. The result is
   `APP-NEEDS-INFO` or `APP-REVIEW`. Use the workflow's `dry_run` input for a preview.
2. A maintainer applies `APP-APPROVED`. The
   [publication workflow](../../.github/workflows/apps-publish-submissions.yml)
   calls [run-publication.sh](ingestion/run-publication.sh) to revalidate the
   submission, upload its screenshot, and queue the catalog PR. The PR closes
   the submission and any eligible quest named in the form.

The shared [submission rules](ingestion/submission.js) define supported categories
and platforms. The [screenshot rules](ingestion/screenshot.js) define image validation.

## Catalog maintenance

- [Metrics refresh](performance/update-metrics.js) updates app request and
  repository metrics.
- [Screenshot keepalive](keepalive-screenshots.js) refreshes retention for hosted
  app screenshots.
