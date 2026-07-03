# Known Issues

Format: **Issue** · Impact · Workaround · Planned resolution.

_No known issues at M0._

Watch-list (not defects):
- `zod` pinned to `^4` — contributors used to v3 idioms (`z.string().datetime()`, `z.string().email()`) will hit type errors; v4 uses `z.iso.datetime()`, `z.email()`, `z.url()`. Covered in docs/testing.md conventions.
