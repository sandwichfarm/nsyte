---
title: upload (alias for deploy)
description: Alias for the deploy command
---

# upload

The `upload` command is an alias for [`deploy`](deploy.md). Both names invoke the same handler, so
`nsyte upload <folder>` behaves identically to `nsyte deploy <folder>`.

When the alias is invoked, the runtime prints a soft deprecation notice recommending `deploy`. The
alias itself remains supported and is not scheduled for removal in any specific release.

See [`deploy`](deploy.md) for the full reference: usage, arguments, options, examples, and
behavior.

Inherits global options. See [global options](_global-options.md).
