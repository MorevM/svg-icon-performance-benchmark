### Pros

- **Full control** \
  Allows full styling of constituent parts, allow interacting with individual parts -
  you can attach event handlers, change attributes dynamically, make animations and so on.
- **No external requests** \
  No additional HTTP requests since the SVG is part of the HTML.
- **Instant\* display** \
  The image is displayed instantly as only DOM and CSSOM are needed for rendering. \
  \* *The image itself increases the time it takes to build these trees, but this is a minimal and acceptable loss*

### Cons

- **No caching** \
  Allows full styling of constituent parts, including when interacting with individual parts -
  you can attach event handlers, change attributes dynamically, make animations and so on.
- **No SEO** \
  No additional HTTP requests since the SVG is part of the HTML.
- **Increased Critical rendering path** \
  <https://web.dev/articles/critical-rendering-path?hl=ru>
  No additional HTTP requests since the SVG is part of the HTML.
- **Frontend frameworks problems** \
  <https://web.dev/articles/critical-rendering-path?hl=ru>
  No additional HTTP requests since the SVG is part of the HTML.

### Use case

- Skeletons and other above the fold content
