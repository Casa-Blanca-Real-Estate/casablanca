# Nameless headshots (optional)

Drop-in overrides for the `accent/` set, **without the agent's name baked into the
square**. Nothing here is required — the tools fall back to the named square whenever a
clean file is missing, so this folder can stay empty or fill up one agent at a time.

## Who reads this
The In Contract Roundup builder's **one agent · two properties** mode. That slide prints
the agent's name in the header, so a headshot with the name burned in reads twice. When
you pick an agent there, the builder looks here first and only uses `accent/` if it
comes up empty.

## Naming
Same filename as the `accent/` version — `firstname-lastinitial.ext`, e.g.
`brittany-f.jpg`, `abass-b.png`. The lookup tries the accent file's extension first,
then `.jpg`, `.png`, `.jpeg`, `.webp`. No manifest to regenerate: `agents.json` still
drives search and display names, this folder is matched by filename alone.

## Where the files come from
The Profile Pic tool (`tools/profile-pic/`) already exports one — **"SQ · Clean"**, the
square accent-background crop with no name. Run the agent's headshot through it and save
that output here.
