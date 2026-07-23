# Static Homepage GSAP Design

## Goal

Replace the React-rendered homepage with the existing complete static HTML DOM while preserving the reference page's desktop and mobile layout, GSAP motion, and homepage interactions. React, ReactDOM, and the bundled application runtime will not be loaded by `index.html`.

## Architecture

`index.html` is the document and content source. It loads the existing reference CSS plus a small static override stylesheet. Local copies of GSAP and ScrollTrigger load before `assets/static/home.js`, which queries the static DOM through its existing `data-motion` attributes and recreates the original timelines.

ScrollTrigger owns the desktop pin wrappers. The hand-authored `.pin-spacer` wrappers and CSS scroll-timeline simulation are removed so its generated spacer heights and transforms match the reference: the hero has a 1220px pinned burst sequence and the code-proof scene has a 2100px pinned domain, agent, and card sequence.

## Motion And Interaction

- Preserve the session-scoped intro, hero pointer parallax, and desktop hero burst.
- Recreate the domain-to-agent-to-code 3D handoff with the original start/end positions, scrub values, 3D rotations, opacity values, and card stacking.
- Recreate feature and final CTA reveal timelines. Mobile keeps the reference document-flow layout without desktop pinning.
- Implement the CC Switch download menu, clipboard feedback, and announcement dialog using native DOM APIs. The dialog retains the reference API timeout, dismissal key, keyboard behavior, and GSAP entrance/exit.

## Failure Handling

If the announcement endpoint fails or times out, the dialog shows its error state without affecting page navigation or scrolling. Clipboard writes fall back to a temporary textarea. Reduced-motion and narrow layouts disable the desktop pinned timelines while keeping all content visible.

## Verification

- `tests/verify-index.ps1` asserts the static DOM entrypoint, local GSAP dependencies, native controller, and absence of React mounting/runtime references.
- Browser checks compare the original runtime and static page at 1440x1000 for hero, second-screen checkpoints, feature section, final CTA, and a mobile width.
