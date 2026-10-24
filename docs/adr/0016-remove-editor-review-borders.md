# 0016. Remove editor review borders

Status: Accepted
Date: 2026-10-24

Supersedes the editor-border treatment in ADR-0015.

The review decoration supplied a solid border style even for unreviewed passages,
without an explicit width in that state. VS Code rendered thick default borders
around wrapped lines, obscuring the document. The owner requested removing this
feature from VS Code.

Remove all border properties from authorship editor decorations. Keep background
tints, softer reviewed/revised tints, reviewer-coloured labels, hover information,
stale-review diagnostics and overview-ruler indicators. PDF margin bars and review
metadata are unchanged. A regression check covers unreviewed, reviewed, revised
and stale decorations to ensure none can request a border.
