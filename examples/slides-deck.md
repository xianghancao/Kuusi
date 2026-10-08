---
author: Kuusi
date: 2026
theme: metropolis
shortTitle: Kuusi Slides
footer: true
---

# Kuusi Slides

Beamer-inspired building blocks in Markdown.

Open with **Kuusi View** and stay on **Slides**. Use the **Image** capsule for
align / wrap / border, and **Export** for PDF or PNG.

## Presentation semantics

### Blocks and alerts

::: block Note
Use `::: block Title` for an information box.
:::

::: alert Watch out
`::: alert` highlights warnings.
:::

::: example Try this
`::: example` marks worked examples.
:::

## Two columns

::: columns
::: column
### Left

- Point A
- Point B
:::
::: column
### Right

- Point C
- Point D
:::
:::

## Equations still work

Inline: $E = mc^2$. Display:

$$
e^{i\pi} + 1 = 0
$$

Also inside a block:

::: example Identity
$$
\sum_{n=1}^{\infty} \frac{1}{n^2} = \frac{\pi^2}{6}
$$
:::

## Long sections auto-paginate

When a section has more content than fits on one stage, Kuusi splits it across
pages and repeats the section heading on each continuation page.

### Keep the headings

- Bullet one stays with the section heading
- Bullet two keeps reading naturally
- Bullet three does not need a manual `---` break
- Bullet four is for presenters who prefer outline markdown
- Bullet five helps stress-test overflow packing
- Bullet six should usually land on a continuation page
- Bullet seven still carries `### Keep the headings`
- Bullet eight still carries the same subtitle on overflow
