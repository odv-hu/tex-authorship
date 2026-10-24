# 0010. Configurable citation colour

Status: Accepted
Date: 2026-10-24

Add `\AuthorshipCitationColor{<hex or RGB>}` with red as the default. The existing editor colour provider exposes a picker for this value, without treating it as an author palette entry. Citation emphasis remains opt-in and bold. The command is harmless under hide/pdfLaTeX and invalid values retain the previous colour with a warning. This extends ADR-0009 without changing its default.
