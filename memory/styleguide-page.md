---
name: styleguide-page
description: The lifesystem client has a /styleguide route documenting the component library
metadata:
  type: project
---

The `lifesystem` client (`client/src`) has a `/styleguide` route ([pages/StyleGuide.tsx](client/src/pages/StyleGuide.tsx)) that showcases every shared component (Button, Badge, Input, Card) with a live preview plus a copy-paste code snippet via the `CodeBlock` component. The homepage (`pages/Home.tsx`) is intentionally minimal — just "Homepage" + a link to the style guide.

When adding or restyling a shared component, update the style guide to match. Styling follows [[design-language]].
